import { Router } from "express";
import { db } from "@workspace/db";
import {
  ordersTable,
  orderItemsTable,
  customersTable,
  productsTable,
  productVariantsTable,
  paymentsTable,
  whatsappMessagesTable,
  businessesTable,
  staffTable,
  orderEventsTable,
} from "@workspace/db";
import { eq, desc, and, gte, lte, sql, count, sum } from "drizzle-orm";
import {
  ListOrdersQueryParams,
  CreateOrderBody,
  UpdateOrderStatusBody,
  UpdateOrderStatusParams,
  GetOrderParams,
} from "@workspace/api-zod";
import { sendTextMessage, buildOrderStatusUpdate } from "../lib/whatsapp";

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
      .select({
        id: ordersTable.id,
        businessId: ordersTable.businessId,
        customerId: ordersTable.customerId,
        status: ordersTable.status,
        totalAmount: ordersTable.totalAmount,
        currency: ordersTable.currency,
        notes: ordersTable.notes,
        internalNotes: ordersTable.internalNotes,
        deliveryAddress: ordersTable.deliveryAddress,
        rawMessage: ordersTable.rawMessage,
        assignedToId: ordersTable.assignedToId,
        whatsappMessageId: ordersTable.whatsappMessageId,
        createdAt: ordersTable.createdAt,
        updatedAt: ordersTable.updatedAt,
        customerName: customersTable.name,
        customerPhone: customersTable.whatsappPhone,
        itemCount: sql<number>`(select count(*) from ${orderItemsTable} where ${orderItemsTable.orderId} = ${ordersTable.id})`,
      })
      .from(ordersTable)
      .leftJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
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
  const { customerId, items, notes, loyaltyDiscount, deliveryAddress, deliveryFee } = parsed.data;

  // Validate loyalty discount against customer's points
  if (loyaltyDiscount && loyaltyDiscount > 0) {
    const [cust] = await db
      .select({ loyaltyPoints: customersTable.loyaltyPoints })
      .from(customersTable)
      .where(eq(customersTable.id, customerId))
      .limit(1);
    if (!cust || cust.loyaltyPoints < loyaltyDiscount) {
      res.status(400).json({ error: "Insufficient loyalty points" });
      return;
    }
  }

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

  // Apply loyalty discount
  const discountKes = loyaltyDiscount ?? 0;
  const finalAmount = Math.max(0, totalAmount - discountKes);

  const deliveryFeeKes = deliveryFee ?? 0;
  const finalAmountWithDelivery = finalAmount + deliveryFeeKes;

  const [order] = await db
    .insert(ordersTable)
    .values({
      businessId: 1,
      customerId,
      totalAmount: String(finalAmountWithDelivery),
      notes: notes ?? (discountKes > 0 ? `Loyalty discount applied: KES ${discountKes} (${discountKes} pts)` : undefined),
      deliveryAddress: deliveryAddress ?? null,
      deliveryFee: deliveryFeeKes > 0 ? String(deliveryFeeKes) : null,
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

  // Deduct loyalty points immediately upon order creation
  if (discountKes > 0) {
    await db
      .update(customersTable)
      .set({
        loyaltyPoints: sql`${customersTable.loyaltyPoints} - ${discountKes}`,
        updatedAt: new Date(),
      })
      .where(eq(customersTable.id, customerId));
  }

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

  const [items, [customer], [payment], [assignedStaff]] = await Promise.all([
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
    order.assignedToId
      ? db
          .select({ id: staffTable.id, name: staffTable.name, role: staffTable.role })
          .from(staffTable)
          .where(eq(staffTable.id, order.assignedToId))
          .limit(1)
      : Promise.resolve([undefined]),
  ]);

  res.json({ ...order, items, customer, payment: payment ?? null, assignedStaff: assignedStaff ?? null });
});

router.patch("/orders/:id", async (req, res) => {
  const paramsParsed = UpdateOrderStatusParams.safeParse(req.params);
  const bodyParsed = UpdateOrderStatusBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { id } = paramsParsed.data;
  const body = bodyParsed.data as typeof bodyParsed.data & { internalNotes?: string | null; deliveryAddress?: string | null };
  const { status, notes, internalNotes, deliveryAddress } = body;

  // Fetch current order so we can detect actual status changes
  const [current] = await db
    .select({ status: ordersTable.status, customerId: ordersTable.customerId })
    .from(ordersTable)
    .where(eq(ordersTable.id, id))
    .limit(1);

  if (!current) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const statusChanged = status !== undefined && status !== current.status;

  const setClause: Record<string, unknown> = { updatedAt: new Date() };
  if (status !== undefined) setClause.status = status;
  if (notes !== undefined) setClause.notes = notes;
  if (internalNotes !== undefined) setClause.internalNotes = internalNotes;
  if (deliveryAddress !== undefined) setClause.deliveryAddress = deliveryAddress;
  if ("assignedToId" in bodyParsed.data) setClause.assignedToId = bodyParsed.data.assignedToId ?? null;

  const [updated] = await db
    .update(ordersTable)
    .set(setClause)
    .where(eq(ordersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  // Log order activity events (fire-and-forget)
  {
    const eventInserts: Promise<unknown>[] = [];
    if (statusChanged && status) {
      const STATUS_LABELS: Record<string, string> = {
        pending: "Pending", confirmed: "Confirmed", paid: "Paid",
        preparing: "Preparing", ready: "Ready for Pickup", delivered: "Delivered", cancelled: "Cancelled",
      };
      eventInserts.push(
        db.insert(orderEventsTable).values({
          orderId: id,
          event: "status_change",
          fromStatus: current.status,
          toStatus: status,
          description: `Status changed: ${STATUS_LABELS[current.status] ?? current.status} → ${STATUS_LABELS[status] ?? status}`,
        })
      );
    }
    if (notes !== undefined && notes !== null) {
      eventInserts.push(db.insert(orderEventsTable).values({ orderId: id, event: "note_updated", description: "Customer notes updated" }));
    }
    if (internalNotes !== undefined && internalNotes !== null) {
      eventInserts.push(db.insert(orderEventsTable).values({ orderId: id, event: "internal_note", description: "Staff notes updated" }));
    }
    if (deliveryAddress !== undefined && deliveryAddress !== null) {
      eventInserts.push(db.insert(orderEventsTable).values({ orderId: id, event: "delivery_updated", description: `Delivery address: ${deliveryAddress}` }));
    }
    if ("assignedToId" in bodyParsed.data) {
      const assignedId = bodyParsed.data.assignedToId;
      eventInserts.push(db.insert(orderEventsTable).values({ orderId: id, event: "assigned", description: assignedId ? "Assigned to staff member" : "Unassigned" }));
    }
    if (eventInserts.length > 0) Promise.all(eventInserts).catch(() => {});
  }

  // Update customer stats only when transitioning INTO paid
  if (statusChanged && status === "paid") {
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

  // Deduct stock only when transitioning INTO confirmed
  if (statusChanged && status === "confirmed") {
    const items = await db
      .select()
      .from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, id));

    await Promise.all(
      items
        .filter((it) => it.variantId != null)
        .map((it) =>
          db
            .update(productVariantsTable)
            .set({
              stockQuantity: sql`greatest(0, cast(${productVariantsTable.stockQuantity} as numeric) - ${Number(it.quantity)})`,
              updatedAt: new Date(),
            })
            .where(eq(productVariantsTable.id, it.variantId!))
        )
    );

    // Fire low-stock alerts for any variant that is now at or below its threshold
    const variantIds = items.filter((it) => it.variantId != null).map((it) => it.variantId!);
    if (variantIds.length > 0) {
      const [business] = await db
        .select({ ownerPhone: businessesTable.ownerPhone, phoneNumberId: businessesTable.whatsappPhoneNumberId, apiToken: businessesTable.whatsappApiToken })
        .from(businessesTable)
        .where(eq(businessesTable.id, 1))
        .limit(1);

      if (business?.ownerPhone) {
        const lowVariants = await db
          .select({
            id: productVariantsTable.id,
            name: productVariantsTable.name,
            stockQuantity: productVariantsTable.stockQuantity,
            lowStockThreshold: productVariantsTable.lowStockThreshold,
            productId: productVariantsTable.productId,
          })
          .from(productVariantsTable)
          .where(
            sql`${productVariantsTable.id} = ANY(${variantIds}) AND cast(${productVariantsTable.stockQuantity} as numeric) <= cast(${productVariantsTable.lowStockThreshold} as numeric)`
          );

        for (const v of lowVariants) {
          const [prod] = await db
            .select({ name: productsTable.name })
            .from(productsTable)
            .where(eq(productsTable.id, v.productId))
            .limit(1);
          const msg = `⚠️ Low Stock Alert: *${prod?.name ?? "Product"} — ${v.name}* is down to *${Number(v.stockQuantity)} units* (threshold: ${Number(v.lowStockThreshold)}). Time to reorder!`;
          sendTextMessage(business.ownerPhone, msg).catch(() => {});
        }
      }
    }
  }

  // Send WhatsApp status notification only on actual status transitions
  if (statusChanged && status && ["confirmed", "paid", "preparing", "ready", "delivered", "cancelled"].includes(status)) {
    const [customer] = await db
      .select({ name: customersTable.name, phone: customersTable.whatsappPhone })
      .from(customersTable)
      .where(eq(customersTable.id, updated.customerId));

    if (customer?.phone) {
      const orderRef = updated.notes?.match(/WA-[A-Z0-9]+/)?.[0] ?? String(id);
      const msgBody = buildOrderStatusUpdate(customer.name ?? "", orderRef, status);

      sendTextMessage(customer.phone, msgBody)
        .then(async (result) => {
          await db.insert(whatsappMessagesTable).values({
            businessId: 1,
            customerId: updated.customerId,
            whatsappMessageId: result.success ? result.messageId : `local-${Date.now()}`,
            direction: "outbound",
            messageType: "text",
            body: msgBody,
            rawPayload: JSON.stringify({ to: customer.phone, status }),
            isOrderMessage: true,
          });
        })
        .catch(() => {});
    }
  }

  res.json(updated);
});

router.patch("/orders/:id/items", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid order id" }); return; }

  const { items } = req.body as { items?: { id: number; quantity: number }[] };
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "items array required" });
    return;
  }

  const [order] = await db.select({ status: ordersTable.status, customerId: ordersTable.customerId })
    .from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (["delivered", "cancelled"].includes(order.status)) {
    res.status(400).json({ error: "Cannot edit items on a delivered or cancelled order" });
    return;
  }

  for (const { id: itemId, quantity } of items) {
    if (quantity <= 0) {
      await db.delete(orderItemsTable).where(
        and(eq(orderItemsTable.id, itemId), eq(orderItemsTable.orderId, id))
      );
    } else {
      const [existing] = await db.select().from(orderItemsTable)
        .where(and(eq(orderItemsTable.id, itemId), eq(orderItemsTable.orderId, id))).limit(1);
      if (existing) {
        const newTotal = Number(existing.unitPrice) * quantity;
        await db.update(orderItemsTable)
          .set({ quantity: String(quantity), totalPrice: String(newTotal) })
          .where(eq(orderItemsTable.id, itemId));
      }
    }
  }

  const remaining = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, id));
  const newTotal = remaining.reduce((s, it) => s + Number(it.totalPrice), 0);

  const [updated] = await db.update(ordersTable)
    .set({ totalAmount: String(newTotal), updatedAt: new Date() })
    .where(eq(ordersTable.id, id))
    .returning();

  await db.insert(orderEventsTable).values({
    orderId: id, event: "items_edited",
    description: `Items updated. New total: KES ${Math.round(newTotal).toLocaleString()}`,
  }).catch(() => {});

  res.json({ ok: true, totalAmount: newTotal, items: remaining, order: updated });
});

router.patch("/orders/:id/discount", async (req, res) => {
  const parsed = GetOrderParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  const { id } = parsed.data;

  const rawDiscount = (req.body as Record<string, unknown>).discountAmount;
  const discountNum = typeof rawDiscount === "number" ? rawDiscount : Number(rawDiscount);
  if (isNaN(discountNum) || discountNum < 0) { res.status(400).json({ error: "discountAmount must be a non-negative number" }); return; }
  const body = { data: { discountAmount: discountNum } };

  const [order] = await db.select().from(ordersTable).where(and(eq(ordersTable.id, id), eq(ordersTable.businessId, 1))).limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (["delivered", "cancelled"].includes(order.status)) {
    res.status(409).json({ error: "Cannot discount a delivered or cancelled order" }); return;
  }

  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, id));
  const itemsTotal = items.reduce((s, i) => s + Number(i.totalPrice), 0);
  const discount = Math.min(body.data.discountAmount, itemsTotal);
  const newTotal = Math.max(0, itemsTotal - discount + Number(order.deliveryFee ?? 0));

  await db.update(ordersTable)
    .set({ discountAmount: String(discount), totalAmount: String(newTotal), updatedAt: new Date() })
    .where(eq(ordersTable.id, id));

  await db.insert(orderEventsTable).values({
    orderId: id,
    event: "discount_applied",
    description: discount === 0 ? "Discount removed" : `Discount applied: KES ${Math.round(discount).toLocaleString()}`,
  }).catch(() => {});

  res.json({ ok: true, discountAmount: discount, totalAmount: newTotal });
});

router.get("/orders/:id/events", async (req, res) => {
  const parsed = GetOrderParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { id } = parsed.data;
  const events = await db
    .select()
    .from(orderEventsTable)
    .where(eq(orderEventsTable.orderId, id))
    .orderBy(desc(orderEventsTable.createdAt));
  res.json({ events });
});

export default router;
