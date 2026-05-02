import { useState } from "react";
import { useListOrders } from "@workspace/api-client-react";
import { formatCurrency, formatTimeAgo, formatPhone } from "@/lib/format";
import { Link } from "wouter";
import { ChevronRight, Search, Download } from "lucide-react";
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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useListOrders({
    status: statusFilter || undefined,
    page,
    limit: 50,
  } as Parameters<typeof useListOrders>[0]);

  const allOrders = data?.orders ?? [];
  const meta = data?.meta;

  function exportCsv() {
    const rows = [
      ["Order ID", "Status", "Customer", "Phone", "WA Ref", "Amount (KES)", "Date"].join(","),
      ...allOrders.map((o) => {
        const order = o as typeof o & { customerName?: string | null; customerPhone?: string | null };
        const waRef = order.notes?.match(/WA-[A-Z0-9]+/)?.[0] ?? "";
        return [
          order.id,
          order.status,
          `"${(order.customerName ?? "").replace(/"/g, '""')}"`,
          order.customerPhone ?? "",
          waRef,
          Number(order.totalAmount).toFixed(2),
          new Date(order.createdAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }),
        ].join(",");
      }),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const orders = search.trim()
    ? allOrders.filter((order) => {
        const o = order as typeof order & { customerName?: string | null; customerPhone?: string | null };
        const q = search.toLowerCase();
        const waRef = (o.notes?.match(/WA-[A-Z0-9]+/)?.[0] ?? "").toLowerCase();
        return (
          String(o.id).includes(q) ||
          (o.customerName ?? "").toLowerCase().includes(q) ||
          (o.customerPhone ?? "").includes(q) ||
          waRef.includes(q)
        );
      })
    : allOrders;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Orders</h1>
        <div className="flex items-center gap-3">
          {meta && (
            <span className="text-sm text-muted-foreground">
              {search ? `${orders.length} of ${meta.total}` : `${meta.total} total`}
            </span>
          )}
          {allOrders.length > 0 && (
            <button
              onClick={exportCsv}
              title="Export CSV"
              className="flex items-center gap-1.5 text-xs font-medium border border-input rounded-md px-3 py-1.5 hover:bg-muted transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          data-testid="input-search-orders"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone or WA ref…"
          className="pl-8 text-sm h-9"
        />
      </div>

      {/* Status filters */}
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
              {orders.map((order) => {
                const o = order as typeof order & { customerName?: string | null; customerPhone?: string | null };
                const waRef = o.notes?.match(/WA-[A-Z0-9]+/)?.[0];
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
                          {waRef && (
                            <span className="text-xs text-muted-foreground font-mono">
                              {waRef}
                            </span>
                          )}
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
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">
                          {formatCurrency(Number(o.totalAmount))}
                        </p>
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
