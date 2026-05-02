import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable, orderItemsTable, productsTable, productVariantsTable, businessesTable, customersTable } from "@workspace/db";
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

  const [current, previous, newCusts, prevNewCusts] = await Promise.all([
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
  ]);

  const revenue = Number(current[0]?.revenue ?? 0);
  const orders = Number(current[0]?.orders ?? 0);
  const prevRevenue = Number(previous[0]?.revenue ?? 0);
  const prevOrders = Number(previous[0]?.orders ?? 0);
  const newCustomers = Number(newCusts[0]?.total ?? 0);
  const prevNewCustomers = Number(prevNewCusts[0]?.total ?? 0);

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
    repeatCustomers: 0,
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
    })
    .from(orderItemsTable)
    .innerJoin(ordersTable, eq(ordersTable.id, orderItemsTable.orderId))
    .where(
      and(
        gte(ordersTable.createdAt, periodStart),
        eq(ordersTable.status, "paid")
      )
    )
    .groupBy(orderItemsTable.productId, orderItemsTable.productName)
    .orderBy(desc(sql`sum(cast(${orderItemsTable.totalPrice} as numeric))`))
    .limit(limit);

  res.json({ products: topProducts, period });
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
