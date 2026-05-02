import { Router } from "express";
import { db } from "@workspace/db";
import {
  ordersTable,
  orderItemsTable,
  customersTable,
  productsTable,
  productVariantsTable,
  paymentsTable,
} from "@workspace/db";
import { eq, desc, and, gte, lte, sql, count, sum } from "drizzle-orm";
import {
  ListOrdersQueryParams,
  CreateOrderBody,
  UpdateOrderStatusBody,
  UpdateOrderStatusParams,
  GetOrderParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/orders", async (req, res) => {
  const parsed = ListOrdersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { status, customerId, page = 1, limit = 50, dateFrom, dateTo } = parsed.data;

  const conditions = [];
  if (status) conditions.push(eq(ordersTable.status, status));
  if (customerId) conditions.push(eq(ordersTable.customerId, customerId));
  if (dateFrom) conditions.push(gte(ordersTable.createdAt, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(ordersTable.createdAt, new Date(dateTo)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [orders, [{ total }]] = await Promise.all([
    db
      .select()
      .from(ordersTable)
      .where(where)
      .orderBy(desc(ordersTable.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(ordersTable).where(where),
  ]);

  res.json({
    orders,
    meta: {
      total: Number(total),
      page,
      limit,
      totalPages: Math.ceil(Number(total) / limit),
    },
  });
});

router.post("/orders", async (req, res) => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { customerId, items, notes } = parsed.data;

  // Resolve products
  let totalAmount = 0;
  const resolvedItems: Array<{
    productId: number;
    variantId?: number | null;
    productName: string;
    variantName?: string | null;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }> = [];

  for (const item of items) {
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, item.productId))
      .limit(1);
    if (!product) {
      res.status(404).json({ error: `Product ${item.productId} not found` });
      return;
    }
    let unitPrice = Number(product.basePrice);
    let variantName: string | null = null;

    if (item.variantId) {
      const [variant] = await db
        .select()
        .from(productVariantsTable)
        .where(eq(productVariantsTable.id, item.variantId))
        .limit(1);
      if (variant && variant.price) {
        unitPrice = Number(variant.price);
        variantName = variant.name;
      }
    }

    const totalPrice = unitPrice * item.quantity;
    totalAmount += totalPrice;
    resolvedItems.push({
      productId: item.productId,
      variantId: item.variantId ?? null,
      productName: product.name,
      variantName,
      quantity: item.quantity,
      unitPrice,
      totalPrice,
    });
  }

  const [order] = await db
    .insert(ordersTable)
    .values({
      businessId: 1,
      customerId,
      totalAmount: String(totalAmount),
      notes,
      status: "pending",
    })
    .returning();

  await db.insert(orderItemsTable).values(
    resolvedItems.map((it) => ({
      orderId: order.id,
      ...it,
      quantity: String(it.quantity),
      unitPrice: String(it.unitPrice),
      totalPrice: String(it.totalPrice),
    }))
  );

  res.status(201).json(order);
});

router.get("/orders/stats/summary", async (req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const [todayStats, weekStats, statusCounts] = await Promise.all([
    db
      .select({
        revenue: sql<number>`coalesce(sum(cast(${ordersTable.totalAmount} as numeric)), 0)`,
        orders: count(),
      })
      .from(ordersTable)
      .where(
        and(
          gte(ordersTable.createdAt, todayStart),
          eq(ordersTable.status, "paid")
        )
      ),
    db
      .select({
        revenue: sql<number>`coalesce(sum(cast(${ordersTable.totalAmount} as numeric)), 0)`,
        orders: count(),
      })
      .from(ordersTable)
      .where(
        and(
          gte(ordersTable.createdAt, weekStart),
          eq(ordersTable.status, "paid")
        )
      ),
    db
      .select({ status: ordersTable.status, cnt: count() })
      .from(ordersTable)
      .where(gte(ordersTable.createdAt, todayStart))
      .groupBy(ordersTable.status),
  ]);

  const byStatus = Object.fromEntries(
    statusCounts.map((s) => [s.status, Number(s.cnt)])
  );

  res.json({
    todayRevenue: Number(todayStats[0]?.revenue ?? 0),
    todayOrders: Number(todayStats[0]?.orders ?? 0),
    pendingOrders: byStatus["pending"] ?? 0,
    paidOrders: byStatus["paid"] ?? 0,
    cancelledOrders: byStatus["cancelled"] ?? 0,
    weekRevenue: Number(weekStats[0]?.revenue ?? 0),
    weekOrders: Number(weekStats[0]?.orders ?? 0),
  });
});

router.get("/orders/:id", async (req, res) => {
  const parsed = GetOrderParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { id } = parsed.data;

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, id))
    .limit(1);

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const [items, [customer], [payment]] = await Promise.all([
    db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, id)),
    db
      .select()
      .from(customersTable)
      .where(eq(customersTable.id, order.customerId))
      .limit(1),
    db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.orderId, id))
      .orderBy(desc(paymentsTable.createdAt))
      .limit(1),
  ]);

  res.json({ ...order, items, customer, payment: payment ?? null });
});

router.patch("/orders/:id", async (req, res) => {
  const paramsParsed = UpdateOrderStatusParams.safeParse(req.params);
  const bodyParsed = UpdateOrderStatusBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { id } = paramsParsed.data;
  const { status, notes } = bodyParsed.data;

  const [updated] = await db
    .update(ordersTable)
    .set({ status, notes, updatedAt: new Date() })
    .where(eq(ordersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  // Update customer stats if paid
  if (status === "paid") {
    await db
      .update(customersTable)
      .set({
        totalOrders: sql`${customersTable.totalOrders} + 1`,
        totalSpend: sql`cast(${customersTable.totalSpend} as numeric) + cast(${updated.totalAmount} as numeric)`,
        lastOrderAt: new Date(),
        loyaltyPoints: sql`${customersTable.loyaltyPoints} + ${Math.floor(Number(updated.totalAmount) / 100)}`,
        updatedAt: new Date(),
      })
      .where(eq(customersTable.id, updated.customerId));
  }

  res.json(updated);
});

export default router;
