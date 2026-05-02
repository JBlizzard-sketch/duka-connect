import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  useGetAnalyticsSummary,
  useGetTopProducts,
  useGetTopCustomers,
  getGetAnalyticsSummaryQueryKey,
  getGetTopProductsQueryKey,
  getGetTopCustomersQueryKey,
} from "@workspace/api-client-react";
import { formatCurrency, formatPhone } from "@/lib/format";
import { Link } from "wouter";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "week", label: "7 Days" },
  { value: "month", label: "30 Days" },
];

interface DayPoint {
  date: string;
  label: string;
  orders: number;
  revenue: number;
}

interface HourPoint {
  hour: number;
  orders: number;
  revenue: number;
}

function formatHour(h: number) {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

function ChangeIndicator({ change }: { change: number }) {
  if (change === 0) return <Minus className="h-3 w-3 text-muted-foreground" />;
  return change > 0 ? (
    <TrendingUp className="h-3 w-3 text-green-600" />
  ) : (
    <TrendingDown className="h-3 w-3 text-red-500" />
  );
}

function customTooltipFormatter(value: number | string, name: string) {
  if (name === "revenue") return [formatCurrency(Number(value)), "Revenue"];
  return [value, "Orders"];
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<"today" | "week" | "month">("week");

  const { data: summary } = useGetAnalyticsSummary(
    { period },
    { query: { queryKey: getGetAnalyticsSummaryQueryKey({ period }) } }
  );

  const { data: topProducts } = useGetTopProducts(
    { period, limit: 8 },
    { query: { queryKey: getGetTopProductsQueryKey({ period, limit: 8 }) } }
  );

  const { data: topCustomers } = useGetTopCustomers(
    { by: "spend", limit: 5 },
    { query: { queryKey: getGetTopCustomersQueryKey({ by: "spend", limit: 5 }) } }
  );

  const { data: dailyData } = useQuery({
    queryKey: ["analytics", "revenue-by-day", period],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/analytics/revenue-by-day?period=${period}`);
      return r.json() as Promise<{ data: DayPoint[]; period: string }>;
    },
    staleTime: 60_000,
  });

  const { data: hourlyData } = useQuery({
    queryKey: ["analytics", "revenue-by-hour", period],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/analytics/revenue-by-hour?period=${period}`);
      return r.json() as Promise<{ data: HourPoint[] }>;
    },
    staleTime: 60_000,
  });

  const hourlyChartData = (hourlyData?.data ?? []).map((h) => ({
    ...h,
    label: formatHour(h.hour),
  }));
  const peakHour = hourlyChartData.reduce(
    (best, h) => (h.orders > best.orders ? h : best),
    { hour: -1, orders: 0, revenue: 0, label: "" }
  );
  const hasHourlyData = hourlyChartData.some((h) => h.orders > 0);

  const maxRevenue = useMemo(
    () =>
      topProducts?.products?.[0]?.revenue
        ? Number(topProducts.products[0].revenue)
        : 1,
    [topProducts]
  );

  const hasRevenueData = (dailyData?.data ?? []).some((d) => d.revenue > 0);

  const { data: categoryData } = useQuery({
    queryKey: ["analytics", "revenue-by-category", period],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/analytics/revenue-by-category?period=${period}`);
      return r.json() as Promise<{ data: { category: string; revenue: number; orderCount: number }[] }>;
    },
    staleTime: 60_000,
  });

  const hasCategoryData = (categoryData?.data ?? []).some((d) => d.revenue > 0);
  const maxCatRevenue = categoryData?.data?.[0]?.revenue ?? 1;

  const { toast } = useToast();
  const sendDailyReport = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/analytics/daily-report`, { method: "POST" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => toast({ title: "Daily report sent", description: "WhatsApp message queued for owner" }),
    onError: () => toast({ title: "Failed to send report", variant: "destructive" }),
  });

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Analytics</h1>
        <div className="flex items-center gap-2">
          <button
            data-testid="button-send-daily-report"
            disabled={sendDailyReport.isPending}
            onClick={() => sendDailyReport.mutate()}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-60"
          >
            {sendDailyReport.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            Send Daily Report
          </button>
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                data-testid={`filter-period-${p.value}`}
                onClick={() => setPeriod(p.value as typeof period)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  period === p.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Revenue", value: formatCurrency(summary?.revenue ?? 0), change: summary?.revenueChange ?? 0 },
          { label: "Orders", value: String(summary?.orders ?? 0), change: summary?.ordersChange ?? 0 },
          { label: "Avg Order", value: formatCurrency(summary?.avgOrderValue ?? 0), change: 0 },
          { label: "New Customers", value: String(summary?.newCustomers ?? 0), change: (summary as { newCustomersChange?: number } | undefined)?.newCustomersChange ?? 0 },
        ].map(({ label, value, change }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
              <p
                data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
                className="text-xl font-bold mt-1"
              >
                {value}
              </p>
              <div className="flex items-center gap-1 mt-1">
                <ChangeIndicator change={change} />
                <span
                  className={`text-xs ${
                    change > 0
                      ? "text-green-600"
                      : change < 0
                      ? "text-red-500"
                      : "text-muted-foreground"
                  }`}
                >
                  {change !== 0 ? `${Math.abs(change).toFixed(1)}%` : "No change"}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue trend — daily area chart */}
      <Card>
        <CardHeader className="px-4 pt-4 pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Revenue Trend</CardTitle>
          {hasRevenueData && (
            <span className="text-xs text-muted-foreground">
              {period === "today" ? "Today" : period === "week" ? "Last 7 days" : "Last 30 days"}
            </span>
          )}
        </CardHeader>
        <CardContent className="px-2 pb-4">
          {!hasRevenueData ? (
            <div className="flex items-center justify-center h-44 text-sm text-muted-foreground">
              No paid orders in this period yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart
                data={dailyData?.data ?? []}
                margin={{ top: 4, right: 12, left: -16, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  interval={period === "month" ? 4 : 0}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    padding: "6px 10px",
                  }}
                  formatter={customTooltipFormatter}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#revenueGrad)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Orders by day — bar chart */}
      {(dailyData?.data?.some((d) => d.orders > 0) ?? false) && (
        <Card>
          <CardHeader className="px-4 pt-4 pb-2">
            <CardTitle className="text-sm font-semibold">Orders by Day</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={120}>
              <BarChart
                data={dailyData?.data ?? []}
                margin={{ top: 4, right: 12, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  interval={period === "month" ? 4 : 0}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                  }}
                  formatter={(v) => [v, "Orders"]}
                />
                <Bar
                  dataKey="orders"
                  fill="hsl(var(--secondary))"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Orders by hour */}
      {hasHourlyData && (
        <Card>
          <CardHeader className="px-4 pt-4 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Busiest Hours</CardTitle>
            {peakHour.hour >= 0 && (
              <span className="text-xs text-muted-foreground">
                Peak: {peakHour.label} ({peakHour.orders} orders)
              </span>
            )}
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart
                data={hourlyChartData}
                margin={{ top: 4, right: 12, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  interval={1}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                  }}
                  formatter={(v, name) =>
                    name === "revenue"
                      ? [formatCurrency(Number(v)), "Revenue"]
                      : [v, "Orders"]
                  }
                  labelFormatter={(label) => `Hour: ${label}`}
                />
                <Bar dataKey="orders" radius={[3, 3, 0, 0]}>
                  {hourlyChartData.map((h) => (
                    <Cell
                      key={h.hour}
                      fill={
                        h.hour === peakHour.hour
                          ? "hsl(var(--primary))"
                          : "hsl(var(--secondary))"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Top products */}
        <Card>
          <CardHeader className="px-4 pt-4 pb-2">
            <CardTitle className="text-sm font-semibold">Top Products</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {!topProducts?.products?.length ? (
              <p className="text-sm text-muted-foreground">No sales data yet.</p>
            ) : (
              <div className="space-y-3">
                {topProducts.products.map((p, i) => {
                  const pct = (Number(p.revenue) / maxRevenue) * 100;
                  return (
                    <div key={p.productId ?? i} data-testid={`row-product-${i}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium truncate max-w-[160px]">
                          {p.productName}
                        </span>
                        <span className="text-xs font-semibold text-primary">
                          {formatCurrency(Number(p.revenue))}
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {Number(p.quantitySold).toFixed(0)} units sold
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top customers */}
        <Card>
          <CardHeader className="px-4 pt-4 pb-2">
            <CardTitle className="text-sm font-semibold">Top Customers</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {!topCustomers?.customers?.length ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {topCustomers.customers.map((c, i) => (
                  <Link key={c.id} href={`/customers?customerId=${c.id}`}>
                    <div
                      data-testid={`row-customer-${c.id}`}
                      className="flex items-center justify-between py-2 hover:bg-muted/40 -mx-1 px-1 rounded transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-mono text-muted-foreground w-4 shrink-0">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">
                            {c.name || formatPhone(c.whatsappPhone)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {c.totalOrders} orders
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-primary shrink-0 ml-3">
                        {formatCurrency(Number(c.totalSpend))}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue by category */}
      {hasCategoryData && (
        <Card>
          <CardHeader className="px-4 pt-4 pb-2">
            <CardTitle className="text-sm font-semibold">Revenue by Category</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-3">
              {(categoryData?.data ?? []).map((cat) => {
                const pct = (cat.revenue / maxCatRevenue) * 100;
                return (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium capitalize truncate max-w-[180px]">
                        {cat.category}
                      </span>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-xs text-muted-foreground">{cat.orderCount} orders</span>
                        <span className="text-xs font-semibold text-primary">
                          {formatCurrency(cat.revenue)}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/70 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
