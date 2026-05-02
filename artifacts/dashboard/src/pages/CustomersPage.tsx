import { useState } from "react";
import { Link } from "wouter";
import {
  useListCustomers,
  useGetCustomer,
  useUpdateCustomer,
  getGetCustomerQueryKey,
  getListCustomersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate, formatPhone, formatTimeAgo } from "@/lib/format";
import { Search, Users, ChevronRight, Star, Loader2, MessageCircle, Pencil, Check, X, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";

function CustomerDetail({ customerId, onClose }: { customerId: number; onClose: () => void }) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesInput, setNotesInput] = useState("");
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
            <Button asChild size="sm" variant="outline" className="shrink-0 gap-1.5">
              <Link href={`/messages?customerId=${customer.id}`} onClick={onClose}>
                <MessageCircle className="h-3.5 w-3.5" />
                Message
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Orders", value: String(customer.totalOrders) },
              { label: "Total Spend", value: formatCurrency(Number(customer.totalSpend)) },
              { label: "Loyalty Pts", value: String(customer.loyaltyPoints) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-muted rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-bold mt-0.5">{value}</p>
              </div>
            ))}
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
                  <div
                    key={order.id}
                    data-testid={`row-order-${order.id}`}
                    className="flex items-center justify-between px-3 py-2"
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
                    </div>
                  </div>
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

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isLoading } = useListCustomers({
    search: search || undefined,
    page,
    limit: 30,
  } as Parameters<typeof useListCustomers>[0]);

  const customers = data?.customers ?? [];
  const meta = data?.meta;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Customers</h1>
        {meta && (
          <span className="text-sm text-muted-foreground">{meta.total} total</span>
        )}
      </div>

      <div className="relative max-w-sm">
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
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {c.name || formatPhone(c.whatsappPhone)}
                      </p>
                      {c.loyaltyPoints >= 50 && (
                        <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatPhone(c.whatsappPhone)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold">
                      {formatCurrency(Number(c.totalSpend))}
                    </p>
                    <p className="text-xs text-muted-foreground">{c.totalOrders} orders</p>
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
