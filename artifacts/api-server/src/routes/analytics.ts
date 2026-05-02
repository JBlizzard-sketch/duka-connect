import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable, orderItemsTable, productsTable, productVariantsTable, businessesTable, customersTable, paymentsTable, staffTable } from "@workspace/db";
import { eq, gte, sql, count, sum, desc, and } from "drizzle-orm";
import {
  GetAnalyticsSummaryQueryParams,
  GetTopProductsQueryParams,
  GetRevenueByHourQueryParams,
} from "@workspace/api-zod";
import { sendTextMessage } from "../lib/whatsapp";

const router = Router();

function getPeriodStart(period: string): Date {
  const now = new Date();
  switch (period) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    case "month": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d;
    }
    default:
      return new Date(now.setHours(0, 0, 0, 0));
  }
}

function getPrevPeriodStart(period: string, currentStart: Date): Date {
  const diff = Date.now() - currentStart.getTime();
  return new Date(currentStart.getTime() - diff);
}

router.get("/analytics/summary", async (req, res) => {
  const parsed = GetAnalyticsSummaryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const period = parsed.data.period ?? "today";
  const periodStart = getPeriodStart(period);
  const prevPeriodStart = getPrevPeriodStart(period, periodStart);

  const [current, previous, newCusts, prevNewCusts, repeatCusts, grossProfitRows] = await Promise.all([
    db
      .select({
        revenue: sql<number>`coalesce(sum(cast(${ordersTable.totalAmount} as numeric)), 0)`,
        orders: count(),
      })
      .from(ordersTable)
      .where(
        and(gte(ordersTable.createdAt, periodStart), eq(ordersTable.status, "paid"))
      ),
    db
      .select({
        revenue: sql<number>`coalesce(sum(cast(${ordersTable.totalAmount} as numeric)), 0)`,
        orders: count(),
      })
      .from(ordersTable)
      .where(
        and(
          gte(ordersTable.createdAt, prevPeriodStart),
          and(
            sql`${ordersTable.createdAt} < ${periodStart}`,
            eq(ordersTable.status, "paid")
          )
        )
      ),
    db
      .select({ total: count() })
      .from(customersTable)
      .where(gte(customersTable.createdAt, periodStart)),
    db
      .select({ total: count() })
      .from(customersTable)
      .where(
        and(
          gte(customersTable.createdAt, prevPeriodStart),
          sql`${customersTable.createdAt} < ${periodStart}`
        )
      ),
    db
      .select({ customerId: ordersTable.customerId })
      .from(ordersTable)
      .where(
        and(
          gte(ordersTable.createdAt, periodStart),
          sql`${ordersTable.customerId} is not null`
        )
      )
      .groupBy(ordersTable.customerId)
      .having(sql`count(*) >= 2`),
    db
      .select({
        grossProfit: sql<number>`coalesce(sum(
          cast(${orderItemsTable.quantity} as numeric) *
          (cast(${orderItemsTable.unitPrice} as numeric) - coalesce(cast(${productsTable.costPrice} as numeric), 0))
        ), 0)`,
      })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(ordersTable.id, orderItemsTable.orderId))
      .leftJoin(productsTable, eq(productsTable.id, orderItemsTable.productId))
      .where(
        and(
          gte(ordersTable.createdAt, periodStart),
          eq(ordersTable.status, "paid"),
          sql`${productsTable.costPrice} is not null`
        )
      ),
  ]);

  const revenue = Number(current[0]?.revenue ?? 0);
  const orders = Number(current[0]?.orders ?? 0);
  const prevRevenue = Number(previous[0]?.revenue ?? 0);
  const prevOrders = Number(previous[0]?.orders ?? 0);
  const newCustomers = Number(newCusts[0]?.total ?? 0);
  const prevNewCustomers = Number(prevNewCusts[0]?.total ?? 0);
  const repeatCustomers = repeatCusts.length;

  const revenueChange =
    prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;
  const ordersChange =
    prevOrders > 0 ? ((orders - prevOrders) / prevOrders) * 100 : 0;
  const newCustomersChange =
    prevNewCustomers > 0 ? ((newCustomers - prevNewCustomers) / prevNewCustomers) * 100 : 0;

  res.json({
    period,
    revenue,
    orders,
    avgOrderValue: orders > 0 ? revenue / orders : 0,
    newCustomers,
    repeatCustomers,
    topCategory: null,
    revenueChange: Math.round(revenueChange * 10) / 10,
    ordersChange: Math.round(ordersChange * 10) / 10,
    newCustomersChange: Math.round(newCustomersChange * 10) / 10,
  });
});

router.get("/analytics/top-products", async (req, res) => {
  const parsed = GetTopProductsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const period = parsed.data.period ?? "week";
  const limit = parsed.data.limit ?? 10;
  const periodStart = getPeriodStart(period);

  const topProducts = await db
    .select({
      productId: orderItemsTable.productId,
      productName: orderItemsTable.productName,
      quantitySold: sql<number>`sum(cast(${orderItemsTable.quantity} as numeric))`,
      revenue: sql<number>`sum(cast(${orderItemsTable.totalPrice} as numeric))`,
      orderCount: count(),
      costPrice: productsTable.costPrice,
      avgUnitPrice: sql<number>`avg(cast(${orderItemsTable.unitPrice} as numeric))`,
    })
    .from(orderItemsTable)
    .innerJoin(ordersTable, eq(ordersTable.id, orderItemsTable.orderId))
    .leftJoin(productsTable, eq(productsTable.id, orderItemsTable.productId))
    .where(
      and(
        gte(ordersTable.createdAt, periodStart),
        eq(ordersTable.status, "paid")
      )
    )
    .groupBy(orderItemsTable.productId, orderItemsTable.productName, productsTable.costPrice)
    .orderBy(desc(sql`sum(cast(${orderItemsTable.totalPrice} as numeric))`))
    .limit(limit);

  const products = topProducts.map((p) => {
    const avgPrice = Number(p.avgUnitPrice ?? 0);
    const cp = p.costPrice != null ? Number(p.costPrice) : null;
    const marginPct = cp != null && avgPrice > 0 ? Math.round(((avgPrice - cp) / avgPrice) * 100) : null;
    return { ...p, marginPct };
  });

  res.json({ products, period });
});

router.get("/analytics/revenue-by-category", async (req, res) => {
  const period = (req.query["period"] as string) ?? "week";
  const periodStart = getPeriodStart(period);

  const rows = await db
    .select({
      category: productsTable.category,
      revenue: sql<number>`sum(cast(${orderItemsTable.totalPrice} as numeric))`,
      orderCount: count(),
    })
    .from(orderItemsTable)
    .innerJoin(ordersTable, eq(ordersTable.id, orderItemsTable.orderId))
    .innerJoin(productsTable, eq(productsTable.id, orderItemsTable.productId))
    .where(
      and(
        gte(ordersTable.createdAt, periodStart),
        eq(ordersTable.status, "paid")
      )
    )
    .groupBy(productsTable.category)
    .orderBy(desc(sql`sum(cast(${orderItemsTable.totalPrice} as numeric))`));

  const data = rows.map((r) => ({
    category: r.category ?? "Uncategorised",
    revenue: Number(r.revenue),
    orderCount: Number(r.orderCount),
  }));

  res.json({ data, period });
});

router.get("/analytics/revenue-by-day", async (req, res) => {
  const period = (req.query["period"] as string) ?? "week";
  const periodStart = getPeriodStart(period);

  const rawData = await db
    .select({
      date: sql<string>`to_char(${ordersTable.createdAt} AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM-DD')`,
      orders: count(),
      revenue: sql<number>`coalesce(sum(cast(${ordersTable.totalAmount} as numeric)), 0)`,
    })
    .from(ordersTable)
    .where(
      and(
        gte(ordersTable.createdAt, periodStart),
        eq(ordersTable.status, "paid")
      )
    )
    .groupBy(sql`to_char(${ordersTable.createdAt} AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${ordersTable.createdAt} AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM-DD')`);

  // Fill every calendar day in the range with 0 if no data
  const byDate = Object.fromEntries(rawData.map((r) => [r.date, r]));
  const days: { date: string; label: string; orders: number; revenue: number }[] = [];
  const daysInPeriod = period === "today" ? 1 : period === "week" ? 7 : 30;
  for (let i = daysInPeriod - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const month = d.toLocaleString("en-KE", { month: "short" });
    const day = d.getDate();
    days.push({
      date: key,
      label: daysInPeriod <= 7 ? `${month} ${day}` : `${day}`,
      orders: Number(byDate[key]?.orders ?? 0),
      revenue: Number(byDate[key]?.revenue ?? 0),
    });
  }

  res.json({ data: days, period });
});

router.get("/analytics/revenue-by-hour", async (req, res) => {
  const parsed = GetRevenueByHourQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const period = parsed.data.period ?? "week";
  const periodStart = getPeriodStart(period);

  const hourlyData = await db
    .select({
      hour: sql<number>`extract(hour from ${ordersTable.createdAt})::int`,
      orders: count(),
      revenue: sql<number>`coalesce(sum(cast(${ordersTable.totalAmount} as numeric)), 0)`,
    })
    .from(ordersTable)
    .where(
      and(
        gte(ordersTable.createdAt, periodStart),
        eq(ordersTable.status, "paid")
      )
    )
    .groupBy(sql`extract(hour from ${ordersTable.createdAt})`)
    .orderBy(sql`extract(hour from ${ordersTable.createdAt})`);

  // Fill missing hours with 0
  const byHour = Object.fromEntries(hourlyData.map((h) => [h.hour, h]));
  const data = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orders: Number(byHour[hour]?.orders ?? 0),
    revenue: Number(byHour[hour]?.revenue ?? 0),
  }));

  res.json({ data, period });
});

// GET /api/analytics/payment-methods
// Breakdown of paid orders by payment method (cash vs mpesa).
// Method is derived from paymentsTable: completed Mpesa payment → "mpesa", else → "cash".
router.get("/analytics/payment-methods", async (req, res) => {
  const period = (req.query["period"] as string) ?? "week";
  const periodStart = getPeriodStart(period);

  const rows = await db
    .select({
      method: sql<string>`case when ${paymentsTable.id} is not null then 'mpesa' else 'cash' end`,
      orderCount: count(),
      revenue: sql<number>`coalesce(sum(cast(${ordersTable.totalAmount} as numeric)), 0)`,
    })
    .from(ordersTable)
    .leftJoin(
      paymentsTable,
      and(
        eq(paymentsTable.orderId, ordersTable.id),
        eq(paymentsTable.status, "completed")
      )
    )
    .where(
      and(
        gte(ordersTable.createdAt, periodStart),
        sql`${ordersTable.status} in ('paid', 'delivered')`
      )
    )
    .groupBy(sql`case when ${paymentsTable.id} is not null then 'mpesa' else 'cash' end`);

  const data = rows.map((r) => ({
    method: r.method ?? "cash",
    orderCount: Number(r.orderCount),
    revenue: Number(r.revenue),
  }));

  res.json({ data, period });
});

// GET /api/analytics/staff-performance
// Per-staff order counts and revenue for assigned orders.
router.get("/analytics/staff-performance", async (req, res) => {
  const period = (req.query["period"] as string) ?? "week";
  const periodStart = getPeriodStart(period);

  const rows = await db
    .select({
      staffId: staffTable.id,
      staffName: staffTable.name,
      role: staffTable.role,
      orderCount: count(),
      revenue: sql<number>`coalesce(sum(cast(${ordersTable.totalAmount} as numeric)), 0)`,
    })
    .from(ordersTable)
    .innerJoin(staffTable, eq(staffTable.id, ordersTable.assignedToId))
    .where(
      and(
        gte(ordersTable.createdAt, periodStart),
        sql`${ordersTable.status} in ('paid', 'delivered', 'confirmed', 'preparing', 'ready')`
      )
    )
    .groupBy(staffTable.id, staffTable.name, staffTable.role)
    .orderBy(desc(count()));

  res.json({
    data: rows.map((r) => ({
      staffId: r.staffId,
      staffName: r.staffName,
      role: r.role,
      orderCount: Number(r.orderCount),
      revenue: Number(r.revenue),
    })),
    period,
  });
});

// POST /api/analytics/daily-report
// Formats today's performance summary and sends it to the owner's WhatsApp.
router.post("/analytics/daily-report", async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [todayStats, lowStockItems, [business]] = await Promise.all([
    db
      .select({
        totalOrders: count(),
        revenue: sql<number>`coalesce(sum(cast(${ordersTable.totalAmount} as numeric)), 0)`,
        pending: sql<number>`count(*) filter (where ${ordersTable.status} = 'pending')::int`,
        confirmed: sql<number>`count(*) filter (where ${ordersTable.status} = 'confirmed')::int`,
        delivered: sql<number>`count(*) filter (where ${ordersTable.status} = 'delivered')::int`,
      })
      .from(ordersTable)
      .where(gte(ordersTable.createdAt, today)),
    db
      .select({
        productName: productsTable.name,
        variantName: productVariantsTable.name,
        stock: productVariantsTable.stockQuantity,
      })
      .from(productVariantsTable)
      .innerJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
      .where(
        sql`cast(${productVariantsTable.stockQuantity} as numeric) <= cast(${productVariantsTable.lowStockThreshold} as numeric)`
      )
      .limit(10),
    db.select().from(businessesTable).limit(1),
  ]);

  const stats = todayStats[0];
  const ownerPhone = business?.ownerPhone;
  const businessName = business?.name ?? "Duka";

  const dateStr = new Date().toLocaleDateString("en-KE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const lines: string[] = [
    `📊 *Daily Report — ${dateStr}*`,
    `_${businessName}_`,
    ``,
    `📦 *Orders Today:* ${Number(stats?.totalOrders ?? 0)}`,
    `💰 *Revenue:* KES ${Math.round(Number(stats?.revenue ?? 0)).toLocaleString()}`,
    `⏳ *Pending:* ${Number(stats?.pending ?? 0)}`,
    `✅ *Confirmed:* ${Number(stats?.confirmed ?? 0)}`,
    `🚚 *Delivered:* ${Number(stats?.delivered ?? 0)}`,
  ];

  if (lowStockItems.length > 0) {
    lines.push(``);
    lines.push(`⚠️ *Low Stock (${lowStockItems.length} item${lowStockItems.length === 1 ? "" : "s"}):*`);
    lowStockItems.slice(0, 6).forEach((item) => {
      const label = item.variantName !== "Default" && item.variantName
        ? `${item.productName} — ${item.variantName}`
        : item.productName;
      lines.push(`  • ${label}: *${Number(item.stock)} left*`);
    });
    if (lowStockItems.length > 6) {
      lines.push(`  _...and ${lowStockItems.length - 6} more_`);
    }
  } else {
    lines.push(``);
    lines.push(`✅ *No low-stock items*`);
  }

  lines.push(``);
  lines.push(`_Sent from Duka · ${new Date().toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}_`);

  const message = lines.join("\n");

  let sent = false;
  if (ownerPhone) {
    const result = await sendTextMessage(ownerPhone, message);
    sent = result.success;
  }

  res.json({ message, sent, ownerPhone: ownerPhone ?? null });
});

export default router;
