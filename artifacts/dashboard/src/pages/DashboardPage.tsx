import { useState } from "react";
import {
  useGetOrdersSummary,
  useGetLowStockProducts,
  useListOrders,
  useUpdateOrderStatus,
  useGetAnalyticsSummary,
  useGetTopProducts,
  getListOrdersQueryKey,
  getGetOrdersSummaryQueryKey,
} from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatTimeAgo, formatPhone } from "@/lib/format";
import { Link } from "wouter";
import { ShoppingCart, TrendingUp, TrendingDown, AlertTriangle, Clock, Package, ChevronRight, BarChart2, Loader2, CheckCircle2, ArrowRight, Minus, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from "@/components/StatusBadge";
import NewOrderDialog from "@/components/NewOrderDialog";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function TrendBadge({ change }: { change?: number | null }) {
  if (change == null) return null;
  if (Math.abs(change) < 0.5) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground mt-1">
        <Minus className="h-3 w-3" /> No change
      </span>
    );
  }
  const up = change > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs mt-1 font-medium ${
        up ? "text-green-600" : "text-red-500"
      }`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}{change.toFixed(1)}% vs prev period
    </span>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent = false,
  href,
  trend,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  accent?: boolean;
  href?: string;
  trend?: number | null;
}) {
  const inner = (
    <Card className={`${accent ? "border-primary/30 bg-primary/5" : ""} ${href ? "hover:shadow-md transition-shadow cursor-pointer" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
              {title}
            </p>
            <p
              data-testid={`stat-${title.toLowerCase().replace(/\s+/g, "-")}`}
              className={`text-2xl font-bold mt-1 ${accent ? "text-primary" : "text-foreground"}`}
            >
              {value}
            </p>
            {trend !== undefined && <TrendBadge change={trend} />}
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          <div
            className={`p-2 rounded-lg shrink-0 ${
              accent ? "bg-primary/10" : "bg-muted"
            }`}
          >
            <Icon className={`h-4 w-4 ${accent ? "text-primary" : "text-muted-foreground"}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function DailyReportButton() {
  const { toast } = useToast();
  const [showReport, setShowReport] = useState<string | null>(null);

  const reportMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/analytics/daily-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) throw new Error("Failed to generate report");
      return r.json() as Promise<{ message: string; sent: boolean; ownerPhone: string | null }>;
    },
    onSuccess: (data) => {
      setShowReport(data.message);
      if (data.sent) {
        toast({ title: "Report sent to WhatsApp", description: data.ownerPhone ?? undefined });
      } else {
        toast({ title: "Report generated", description: "Set owner WhatsApp number in Settings to send automatically" });
      }
    },
    onError: () => toast({ title: "Failed to generate report", variant: "destructive" }),
  });

  return (
    <>
      <button
        onClick={() => reportMutation.mutate()}
        disabled={reportMutation.isPending}
        className="inline-flex items-center gap-2 border border-border bg-background text-foreground text-sm font-medium px-3 py-2 rounded-lg hover:bg-accent transition-colors disabled:opacity-60"
        title="Send daily summary to your WhatsApp"
      >
        {reportMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <BarChart2 className="h-4 w-4" />
        )}
        Daily Report
      </button>

      {showReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowReport(null)}>
          <div
            className="bg-background border border-border rounded-xl shadow-xl w-full max-w-sm p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Report Preview
              </div>
              <button onClick={() => setShowReport(null)} className="text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </div>
            <pre className="text-xs text-foreground bg-muted rounded-lg p-3 whitespace-pre-wrap leading-relaxed font-mono max-h-80 overflow-y-auto">
              {showReport}
            </pre>
            <p className="text-[11px] text-muted-foreground">
              {reportMutation.data?.sent
                ? `Sent to ${reportMutation.data.ownerPhone}`
                : "Configure owner WhatsApp in Settings → will be sent automatically"}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function StaleOrdersPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: confirmedData } = useListOrders(
    { status: "confirmed", limit: 20, page: 1 } as Parameters<typeof useListOrders>[0],
    { query: { refetchInterval: 60_000 } }
  );
  const { data: preparingData } = useListOrders(
    { status: "preparing", limit: 20, page: 1 } as Parameters<typeof useListOrders>[0],
    { query: { refetchInterval: 60_000 } }
  );

  const now = Date.now();
  const staleOrders = [
    ...(confirmedData?.orders ?? []),
    ...(preparingData?.orders ?? []),
  ].filter((o) => now - new Date(o.createdAt).getTime() > TWO_HOURS_MS);

  const advanceOrder = useUpdateOrderStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        toast({ title: "Order updated" });
      },
      onError: () => toast({ title: "Failed to update order", variant: "destructive" }),
    },
  });

  if (staleOrders.length === 0) return null;

  return (
    <Card className="border-red-200 bg-red-50/60">
      <CardHeader className="px-4 pt-4 pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-red-900 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          Stale Orders
          <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
            {staleOrders.length}
          </span>
        </CardTitle>
        <Link href="/orders?status=confirmed">
          <span className="text-xs text-red-700 hover:underline cursor-pointer flex items-center gap-0.5">
            View all <ChevronRight className="h-3 w-3" />
          </span>
        </Link>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="divide-y divide-red-100">
          {staleOrders.map((order) => {
            const o = order as typeof order & { customerName?: string | null; customerPhone?: string | null };
            const nextStatus = o.status === "confirmed" ? "preparing" : "ready";
            const nextLabel = o.status === "confirmed" ? "Start Prep" : "Mark Ready";
            const isPending = advanceOrder.isPending && (advanceOrder.variables as { id: number } | undefined)?.id === o.id;
            const hoursOld = Math.floor((now - new Date(o.createdAt).getTime()) / (60 * 60 * 1000));
            return (
              <div key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                <Link href={`/orders/${o.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground shrink-0">#{o.id}</span>
                    <span className="text-xs font-medium truncate text-foreground">
                      {o.customerName || formatPhone(o.customerPhone ?? "")}
                    </span>
                    <span className="text-xs text-red-600 shrink-0 font-medium">
                      {hoursOld}h ago
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                    {o.status} · {formatCurrency(Number(o.totalAmount))}
                  </p>
                </Link>
                <button
                  disabled={advanceOrder.isPending}
                  onClick={() => advanceOrder.mutate({ id: o.id, data: { status: nextStatus } })}
                  className="shrink-0 flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
                >
                  {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                  {nextLabel}
                </button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function PendingOrdersPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data } = useListOrders(
    { status: "pending", limit: 8, page: 1 } as Parameters<typeof useListOrders>[0],
    { query: { refetchInterval: 15_000 } }
  );
  const pendingOrders = data?.orders ?? [];

  const confirmOrder = useUpdateOrderStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetOrdersSummaryQueryKey() });
        toast({ title: "Order confirmed" });
      },
      onError: () => toast({ title: "Failed to confirm order", variant: "destructive" }),
    },
  });

  if (pendingOrders.length === 0) return null;

  return (
    <Card className="border-orange-200 bg-orange-50/60">
      <CardHeader className="px-4 pt-4 pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-orange-900 flex items-center gap-2">
          <Clock className="h-4 w-4 text-orange-600" />
          Needs Attention
          <span className="bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
            {pendingOrders.length}
          </span>
        </CardTitle>
        <Link href="/orders?status=pending">
          <span className="text-xs text-orange-700 hover:underline cursor-pointer flex items-center gap-0.5">
            View all <ChevronRight className="h-3 w-3" />
          </span>
        </Link>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="divide-y divide-orange-100">
          {pendingOrders.map((order) => {
            const o = order as typeof order & { customerName?: string | null; customerPhone?: string | null };
            const isPending = confirmOrder.isPending && (confirmOrder.variables as { id: number } | undefined)?.id === o.id;
            return (
              <div key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                <Link href={`/orders/${o.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground shrink-0">#{o.id}</span>
                    <span className="text-xs font-medium truncate text-foreground">
                      {o.customerName || formatPhone(o.customerPhone ?? "")}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatTimeAgo(o.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 pl-0">
                    {formatCurrency(Number(o.totalAmount))}
                  </p>
                </Link>
                <button
                  disabled={confirmOrder.isPending}
                  onClick={() =>
                    confirmOrder.mutate({
                      id: o.id,
                      data: { status: "confirmed" },
                    })
                  }
                  className="shrink-0 flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ArrowRight className="h-3 w-3" />
                  )}
                  Confirm
                </button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const { data: summary, isLoading: summaryLoading } = useGetOrdersSummary({
    query: { refetchInterval: 30_000 },
  });
  const { data: lowStock } = useGetLowStockProducts({
    query: { refetchInterval: 60_000 },
  });
  const { data: recentOrders, isLoading: ordersLoading } = useListOrders(
    { limit: 8, page: 1 },
    { query: { refetchInterval: 20_000 } }
  );
  const { data: todayAnalytics } = useGetAnalyticsSummary(
    { period: "today" },
    { query: { refetchInterval: 60_000 } }
  );
  const { data: weekAnalytics } = useGetAnalyticsSummary(
    { period: "week" },
    { query: { refetchInterval: 60_000 } }
  );
  const { data: topProducts } = useGetTopProducts(
    { period: "week", limit: 5 },
    { query: { refetchInterval: 60_000 } }
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <NewOrderDialog open={newOrderOpen} onClose={() => setNewOrderOpen(false)} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("en-KE", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DailyReportButton />
          <button
            data-testid="button-new-order"
            onClick={() => setNewOrderOpen(true)}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors"
          >
            <ShoppingCart className="h-4 w-4" />
            New Order
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-16 bg-muted animate-pulse rounded-md" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatCard
              title="Today's Revenue"
              value={formatCurrency(summary?.todayRevenue ?? 0)}
              subtitle={`${summary?.todayOrders ?? 0} orders`}
              icon={TrendingUp}
              accent
              href="/orders"
              trend={todayAnalytics?.revenueChange}
            />
            <StatCard
              title="Pending Orders"
              value={String(summary?.pendingOrders ?? 0)}
              subtitle="Need attention"
              icon={Clock}
              href="/orders?status=pending"
            />
            <StatCard
              title="Week Revenue"
              value={formatCurrency(summary?.weekRevenue ?? 0)}
              subtitle={`${summary?.weekOrders ?? 0} orders`}
              icon={TrendingUp}
              href="/analytics"
              trend={weekAnalytics?.revenueChange}
            />
            <StatCard
              title="Low Stock"
              value={String(lowStock?.products?.length ?? 0)}
              subtitle="Items to restock"
              icon={AlertTriangle}
              href="/inventory"
            />
          </>
        )}
      </div>

      {/* Stale orders (confirmed/preparing > 2h) */}
      <StaleOrdersPanel />

      {/* Pending orders action panel */}
      <PendingOrdersPanel />

      {/* Low stock alert */}
      {lowStock && lowStock.products.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-amber-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Low Stock Alert
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex flex-wrap gap-2">
              {lowStock.products.slice(0, 6).map((p) => (
                <Link key={p.id} href="/inventory">
                  <span
                    data-testid={`alert-low-stock-${p.id}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-amber-200 rounded-md text-xs font-medium text-amber-900 hover:bg-amber-100 cursor-pointer transition-colors"
                  >
                    <Package className="h-3 w-3" />
                    {p.name}
                    <span className="text-amber-600 font-semibold">
                      {p.totalStock} left
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Products this week */}
      {topProducts && topProducts.products.length > 0 && (
        <Card>
          <CardHeader className="px-4 pt-4 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              Top Products This Week
            </CardTitle>
            <Link href="/analytics">
              <span className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-0.5">
                Full report <ChevronRight className="h-3 w-3" />
              </span>
            </Link>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {topProducts.products.map((p, i) => {
                const maxRevenue = topProducts.products[0]?.revenue ?? 1;
                const pct = Math.round((p.revenue / maxRevenue) * 100);
                return (
                  <div key={p.productId} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-muted-foreground w-4 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="text-xs font-medium truncate">{p.productName}</p>
                        <p className="text-xs font-semibold shrink-0">{formatCurrency(p.revenue)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">{p.quantitySold} sold</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent orders */}
      <Card>
        <CardHeader className="px-4 pt-4 pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Recent Orders</CardTitle>
          <Link href="/orders">
            <span className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-0.5">
              View all <ChevronRight className="h-3 w-3" />
            </span>
          </Link>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {ordersLoading ? (
            <div className="space-y-1 px-4 pb-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted animate-pulse rounded-md" />
              ))}
            </div>
          ) : !recentOrders?.orders?.length ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No orders yet. They'll appear here when customers message you on WhatsApp.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentOrders.orders.map((order) => {
                const o = order as typeof order & { customerName?: string | null; customerPhone?: string | null };
                return (
                  <Link key={o.id} href={`/orders/${o.id}`}>
                    <div
                      data-testid={`row-order-${o.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-muted-foreground">
                            #{o.id}
                          </span>
                          <StatusBadge status={o.status} />
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {o.customerName ? (
                            <p className="text-xs font-medium text-foreground truncate max-w-[160px]">
                              {o.customerName}
                            </p>
                          ) : o.customerPhone ? (
                            <p className="text-xs text-muted-foreground">
                              {formatPhone(o.customerPhone)}
                            </p>
                          ) : null}
                          <span className="text-xs text-muted-foreground">
                            · {formatTimeAgo(o.createdAt)}
                          </span>
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-foreground shrink-0">
                        {formatCurrency(Number(o.totalAmount))}
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
