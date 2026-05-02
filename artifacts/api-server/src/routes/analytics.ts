import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable, orderItemsTable, productsTable } from "@workspace/db";
import { eq, gte, sql, count, sum, desc, and } from "drizzle-orm";
import {
  GetAnalyticsSummaryQueryParams,
  GetTopProductsQueryParams,
  GetRevenueByHourQueryParams,
} from "@workspace/api-zod";

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

  const [current, previous] = await Promise.all([
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
  ]);

  const revenue = Number(current[0]?.revenue ?? 0);
  const orders = Number(current[0]?.orders ?? 0);
  const prevRevenue = Number(previous[0]?.revenue ?? 0);
  const prevOrders = Number(previous[0]?.orders ?? 0);

  const revenueChange =
    prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;
  const ordersChange =
    prevOrders > 0 ? ((orders - prevOrders) / prevOrders) * 100 : 0;

  res.json({
    period,
    revenue,
    orders,
    avgOrderValue: orders > 0 ? revenue / orders : 0,
    newCustomers: 0,
    repeatCustomers: 0,
    topCategory: null,
    revenueChange: Math.round(revenueChange * 10) / 10,
    ordersChange: Math.round(ordersChange * 10) / 10,
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

export default router;
