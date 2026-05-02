import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  useListCustomers,
  useGetCustomer,
  useUpdateCustomer,
  getGetCustomerQueryKey,
  getListCustomersQueryKey,
} from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate, formatPhone, formatTimeAgo } from "@/lib/format";

function getLoyaltyTier(points: number): { label: string; className: string } | null {
  if (points <= 0) return null;
  if (points < 100) return { label: "Bronze", className: "text-amber-700 bg-amber-100 border-amber-200" };
  if (points < 500) return { label: "Silver", className: "text-slate-600 bg-slate-100 border-slate-200" };
  return { label: "Gold ⭐", className: "text-yellow-700 bg-yellow-100 border-yellow-200" };
}
import { Search, Users, ChevronRight, Star, Loader2, MessageCircle, Pencil, Check, X, FileText, UserPlus, ExternalLink, ShoppingCart, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import NewOrderDialog from "@/components/NewOrderDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function AddCustomerDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined, phone: phone.trim() }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to create customer");
      }
      return r.json() as Promise<{ id: number }>;
    },
    onSuccess: (data) => {
      toast({ title: "Customer added" });
      setName("");
      setPhone("");
      onCreated(data.id);
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    createMutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            Add Customer
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name (optional)</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jane Mwangi"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">WhatsApp Phone *</label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0712345678 or 254712345678"
              required
            />
            <p className="text-[11px] text-muted-foreground">
              Kenyan number — 07XX or 254XX format
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={!phone.trim() || createMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground text-sm font-medium py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Add Customer
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CustomerDetail({ customerId, onClose }: { customerId: number; onClose: () => void }) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesInput, setNotesInput] = useState("");
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: customer, isLoading } = useGetCustomer(customerId, {
    query: { enabled: !!customerId, queryKey: getGetCustomerQueryKey(customerId) },
  });

  const updateCustomer = useUpdateCustomer({
    mutation: {
      onSuccess: () => {
        setEditingName(false);
        queryClient.invalidateQueries({ queryKey: getGetCustomerQueryKey(customerId) });
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        toast({ title: "Name saved" });
      },
      onError: () => toast({ title: "Save failed", variant: "destructive" }),
    },
  });

  const updateNotes = useUpdateCustomer({
    mutation: {
      onSuccess: () => {
        setEditingNotes(false);
        queryClient.invalidateQueries({ queryKey: getGetCustomerQueryKey(customerId) });
        toast({ title: "Notes saved" });
      },
      onError: () => toast({ title: "Save failed", variant: "destructive" }),
    },
  });

  function startEdit() {
    setNameInput(customer?.name ?? "");
    setEditingName(true);
  }

  function saveName() {
    updateCustomer.mutate({ id: customerId, data: { name: nameInput.trim() || null } });
  }

  function startEditNotes() {
    setNotesInput((customer as { notes?: string | null })?.notes ?? "");
    setEditingNotes(true);
  }

  function saveNotes() {
    updateNotes.mutate({ id: customerId, data: { notes: notesInput.trim() || null } });
  }

  return (
    <SheetContent className="w-full sm:max-w-md overflow-y-auto">
      <SheetHeader className="pb-4">
        <SheetTitle>Customer Detail</SheetTitle>
      </SheetHeader>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !customer ? (
        <p className="text-sm text-muted-foreground">Not found.</p>
      ) : (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    autoFocus
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName();
                      if (e.key === "Escape") setEditingName(false);
                    }}
                    placeholder="Customer name…"
                    className="h-8 text-sm"
                  />
                  <button
                    onClick={saveName}
                    disabled={updateCustomer.isPending}
                    className="p-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    {updateCustomer.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => setEditingName(false)}
                    className="p-1.5 rounded border border-border hover:bg-muted transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 group">
                  <h3 className="font-semibold text-base">
                    {customer.name || <span className="text-muted-foreground font-normal italic">No name set</span>}
                  </h3>
                  <button
                    onClick={startEdit}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-all text-muted-foreground"
                    title="Edit name"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
              )}
              <p
                data-testid="text-customer-phone"
                className="text-sm text-muted-foreground mt-0.5"
              >
                {formatPhone(customer.whatsappPhone)}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={`https://wa.me/${customer.whatsappPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-medium border border-border px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                title="Open in WhatsApp"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                WhatsApp
              </a>
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link href={`/messages?customerId=${customer.id}`} onClick={onClose}>
                  <MessageCircle className="h-3.5 w-3.5" />
                  Message
                </Link>
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => setNewOrderOpen(true)}
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                New Order
              </Button>
            </div>
          </div>
          <NewOrderDialog
            open={newOrderOpen}
            onClose={() => setNewOrderOpen(false)}
            initialCustomerId={customer.id}
          />

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Orders</p>
              <p className="text-sm font-bold mt-0.5">{customer.totalOrders}</p>
            </div>
            <div className="bg-muted rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Spend</p>
              <p className="text-sm font-bold mt-0.5">{formatCurrency(Number(customer.totalSpend))}</p>
            </div>
            <div className="bg-muted rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Loyalty</p>
              <p className="text-sm font-bold mt-0.5">{customer.loyaltyPoints} pts</p>
              {(() => {
                const tier = getLoyaltyTier(customer.loyaltyPoints);
                return tier ? (
                  <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border leading-none mt-1 ${tier.className}`}>
                    {tier.label}
                  </span>
                ) : null;
              })()}
            </div>
          </div>

          {customer.lastOrderAt && (
            <p className="text-xs text-muted-foreground">
              Last order: {formatDate(customer.lastOrderAt)}
            </p>
          )}

          {customer.recentOrders && customer.recentOrders.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Recent Orders
              </h4>
              <div className="divide-y divide-border rounded-lg border overflow-hidden">
                {customer.recentOrders.map((order) => (
                  <Link key={order.id} href={`/orders/${order.id}`} onClick={onClose}>
                    <div
                      data-testid={`row-order-${order.id}`}
                      className="flex items-center justify-between px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">
                          #{order.id}
                        </span>
                        <StatusBadge status={order.status} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold">
                          {formatCurrency(Number(order.totalAmount))}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTimeAgo(order.createdAt)}
                        </span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Notes / delivery address */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-3 w-3" />
                Notes
              </h4>
              {!editingNotes && (
                <button
                  data-testid="button-edit-customer-notes"
                  onClick={startEditNotes}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                  {(customer as { notes?: string | null })?.notes ? "Edit" : "Add note"}
                </button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-2">
                <textarea
                  data-testid="textarea-customer-notes"
                  autoFocus
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") setEditingNotes(false); }}
                  placeholder="Delivery address, preferred pickup time…"
                  rows={3}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    data-testid="button-save-customer-notes"
                    disabled={updateNotes.isPending}
                    onClick={saveNotes}
                    className="flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
                  >
                    {updateNotes.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Save
                  </button>
                  <button
                    onClick={() => setEditingNotes(false)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border hover:bg-muted transition-colors"
                  >
                    <X className="h-3 w-3" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (customer as { notes?: string | null })?.notes ? (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {(customer as { notes?: string | null }).notes}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No notes yet.</p>
            )}
          </div>
        </div>
      )}
    </SheetContent>
  );
}

type SortKey = "lastOrder" | "spend" | "orders" | "loyalty" | "name";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "lastOrder", label: "Last Order" },
  { value: "spend", label: "Most Spent" },
  { value: "orders", label: "Most Orders" },
  { value: "loyalty", label: "Loyalty Pts" },
  { value: "name", label: "Name A–Z" },
];

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortKey>("lastOrder");
  const [addOpen, setAddOpen] = useState(false);
  const queryClient = useQueryClient();

  const initId = useMemo(() => {
    const p = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : ""
    );
    const v = p.get("customerId");
    return v ? Number(v) : null;
  }, []);
  const [selectedId, setSelectedId] = useState<number | null>(initId);

  const { data, isLoading } = useListCustomers({
    search: search || undefined,
    page,
    limit: 30,
  } as Parameters<typeof useListCustomers>[0]);

  const rawCustomers = data?.customers ?? [];
  const meta = data?.meta;

  const customers = useMemo(() => {
    const arr = [...rawCustomers];
    switch (sortBy) {
      case "spend":
        return arr.sort((a, b) => Number(b.totalSpend) - Number(a.totalSpend));
      case "orders":
        return arr.sort((a, b) => b.totalOrders - a.totalOrders);
      case "loyalty":
        return arr.sort((a, b) => b.loyaltyPoints - a.loyaltyPoints);
      case "name":
        return arr.sort((a, b) =>
          (a.name || a.whatsappPhone).localeCompare(b.name || b.whatsappPhone)
        );
      case "lastOrder":
      default:
        return arr.sort((a, b) => {
          if (!a.lastOrderAt && !b.lastOrderAt) return 0;
          if (!a.lastOrderAt) return 1;
          if (!b.lastOrderAt) return -1;
          return new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime();
        });
    }
  }, [rawCustomers, sortBy]);

  function exportCsv() {
    const rows = customers.map((c) => [
      c.name ?? "",
      c.whatsappPhone,
      c.totalOrders,
      Number(c.totalSpend).toFixed(2),
      c.loyaltyPoints,
      c.lastOrderAt ? new Date(c.lastOrderAt).toISOString().slice(0, 10) : "",
      c.createdAt ? new Date(c.createdAt).toISOString().slice(0, 10) : "",
    ]);
    const header = ["Name", "Phone", "Total Orders", "Total Spend (KES)", "Loyalty Points", "Last Order", "Joined"];
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Customers</h1>
        <div className="flex items-center gap-3">
          {meta && (
            <span className="text-sm text-muted-foreground">{meta.total} total</span>
          )}
          <button
            onClick={exportCsv}
            disabled={customers.length === 0}
            className="inline-flex items-center gap-1.5 border border-input bg-background text-sm font-medium px-3 py-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
            title="Export visible customers to CSV"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-medium px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Add Customer
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            data-testid="input-search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search customers..."
            className="w-full pl-8 pr-3 py-2 border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSortBy(opt.value)}
              className={cn(
                "shrink-0 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors",
                sortBy === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:bg-muted"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-1 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-14 bg-muted animate-pulse rounded-md" />
              ))}
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">No customers yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {customers.map((c) => (
                <div
                  key={c.id}
                  data-testid={`row-customer-${c.id}`}
                  onClick={() => setSelectedId(c.id)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">
                        {c.name || formatPhone(c.whatsappPhone)}
                      </p>
                      {(() => {
                        const tier = getLoyaltyTier(c.loyaltyPoints);
                        return tier ? (
                          <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border leading-none ${tier.className}`}>
                            {tier.label}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatPhone(c.whatsappPhone)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold">
                      {formatCurrency(Number(c.totalSpend))}
                    </p>
                    <p className="text-xs text-muted-foreground">{c.totalOrders} orders · {c.loyaltyPoints} pts</p>
                    {c.lastOrderAt ? (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{formatTimeAgo(c.lastOrderAt)}</p>
                    ) : c.totalOrders === 0 ? (
                      <p className="text-[10px] text-amber-500 mt-0.5">No orders yet</p>
                    ) : null}
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 text-xs border rounded-md disabled:opacity-40 hover:bg-muted"
          >
            Prev
          </button>
          <span className="text-xs text-muted-foreground">
            {page} / {meta.totalPages}
          </span>
          <button
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 text-xs border rounded-md disabled:opacity-40 hover:bg-muted"
          >
            Next
          </button>
        </div>
      )}

      <AddCustomerDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(id) => {
          setAddOpen(false);
          queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
          setSelectedId(id);
        }}
      />

      <Sheet
        open={selectedId !== null}
        onOpenChange={(open) => !open && setSelectedId(null)}
      >
        {selectedId !== null && (
          <CustomerDetail
            customerId={selectedId}
            onClose={() => setSelectedId(null)}
          />
        )}
      </Sheet>
    </div>
  );
}
