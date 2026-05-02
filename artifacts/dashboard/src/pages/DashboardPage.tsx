import { useState } from "react";
import { useGetOrdersSummary, useGetLowStockProducts, useListOrders } from "@workspace/api-client-react";
import { formatCurrency, formatTimeAgo } from "@/lib/format";
import { Link } from "wouter";
import { ShoppingCart, TrendingUp, AlertTriangle, Clock, Package, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from "@/components/StatusBadge";
import NewOrderDialog from "@/components/NewOrderDialog";

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent = false,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "border-primary/30 bg-primary/5" : ""}>
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
}

export default function DashboardPage() {
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const { data: summary, isLoading: summaryLoading } = useGetOrdersSummary();
  const { data: lowStock } = useGetLowStockProducts();
  const { data: recentOrders, isLoading: ordersLoading } = useListOrders({
    limit: 8,
    page: 1,
  });

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
        <button
          data-testid="button-new-order"
          onClick={() => setNewOrderOpen(true)}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          <ShoppingCart className="h-4 w-4" />
          New Order
        </button>
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
            />
            <StatCard
              title="Pending Orders"
              value={String(summary?.pendingOrders ?? 0)}
              subtitle="Need attention"
              icon={Clock}
            />
            <StatCard
              title="Week Revenue"
              value={formatCurrency(summary?.weekRevenue ?? 0)}
              subtitle={`${summary?.weekOrders ?? 0} orders`}
              icon={TrendingUp}
            />
            <StatCard
              title="Low Stock"
              value={String(lowStock?.products?.length ?? 0)}
              subtitle="Items to restock"
              icon={AlertTriangle}
            />
          </>
        )}
      </div>

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
              {recentOrders.orders.map((order) => (
                <Link key={order.id} href={`/orders/${order.id}`}>
                  <div
                    data-testid={`row-order-${order.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">
                          #{order.id}
                        </span>
                        <StatusBadge status={order.status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {formatTimeAgo(order.createdAt)}
                      </p>
                    </div>
                    <div className="text-sm font-semibold text-foreground shrink-0">
                      {formatCurrency(Number(order.totalAmount))}
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
