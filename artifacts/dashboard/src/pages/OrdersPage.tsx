import { useState } from "react";
import { useListOrders } from "@workspace/api-client-react";
import { formatCurrency, formatTimeAgo, formatPhone } from "@/lib/format";
import { Link } from "wouter";
import { ChevronRight, Search, Filter } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import StatusBadge from "@/components/StatusBadge";

const STATUSES = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "paid", label: "Paid" },
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

export default function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useListOrders({
    status: statusFilter || undefined,
    page,
    limit: 25,
  } as Parameters<typeof useListOrders>[0]);

  const orders = data?.orders ?? [];
  const meta = data?.meta;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Orders</h1>
        {meta && (
          <span className="text-sm text-muted-foreground">
            {meta.total} total
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            data-testid={`filter-status-${s.value || "all"}`}
            onClick={() => {
              setStatusFilter(s.value);
              setPage(1);
            }}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === s.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:bg-muted"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Orders table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-1 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-14 bg-muted animate-pulse rounded-md" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No orders found.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {orders.map((order) => (
                <Link key={order.id} href={`/orders/${order.id}`}>
                  <div
                    data-testid={`row-order-${order.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-muted-foreground">
                          #{order.id}
                        </span>
                        <StatusBadge status={order.status} />
                        {order.notes && (
                          <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                            {order.notes}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatTimeAgo(order.createdAt)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">
                        {formatCurrency(Number(order.totalAmount))}
                      </p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 text-xs border rounded-md disabled:opacity-40 hover:bg-muted transition-colors"
          >
            Prev
          </button>
          <span className="text-xs text-muted-foreground">
            {page} / {meta.totalPages}
          </span>
          <button
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 text-xs border rounded-md disabled:opacity-40 hover:bg-muted transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
