import { useRoute, Link } from "wouter";
import { useGetOrder, useUpdateOrderStatus, useInitiatePayment, getGetOrderQueryKey, getGetOrdersSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatCurrency, formatDateTime, formatPhone } from "@/lib/format";
import { ArrowLeft, Phone, MessageSquare, CreditCard, Loader2, MessageCircle, Pencil, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge, { PaymentBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";

const NEXT_STATUSES: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "paid", "cancelled"],
  paid: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["delivered"],
  delivered: [],
  cancelled: [],
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirm",
  paid: "Mark Paid",
  preparing: "Start Prep",
  ready: "Mark Ready",
  delivered: "Mark Delivered",
  cancelled: "Cancel",
};

export default function OrderDetailPage() {
  const [, params] = useRoute("/orders/:id");
  const id = Number(params?.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [showMpesaForm, setShowMpesaForm] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesInput, setNotesInput] = useState("");

  const { data: order, isLoading } = useGetOrder(id, {
    query: { enabled: !!id, queryKey: getGetOrderQueryKey(id) },
  });

  const updateStatus = useUpdateOrderStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetOrdersSummaryQueryKey() });
        toast({ title: "Order updated" });
      },
      onError: () => toast({ title: "Update failed", variant: "destructive" }),
    },
  });

  const updateNotes = useUpdateOrderStatus({
    mutation: {
      onSuccess: () => {
        setEditingNotes(false);
        queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(id) });
        toast({ title: "Notes saved" });
      },
      onError: () => toast({ title: "Save failed", variant: "destructive" }),
    },
  });

  const initiatePayment = useInitiatePayment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(id) });
        setShowMpesaForm(false);
        toast({ title: "STK push sent", description: "Customer should receive a payment prompt" });
      },
      onError: () => toast({ title: "Payment failed", variant: "destructive" }),
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6 text-center text-muted-foreground">Order not found.</div>
    );
  }

  const nextStatuses = NEXT_STATUSES[order.status] ?? [];

  function startEditNotes() {
    setNotesInput(order?.notes ?? "");
    setEditingNotes(true);
  }

  function saveNotes() {
    updateNotes.mutate({
      id,
      data: { notes: notesInput.trim() || null },
    });
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/orders">
          <button className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Order #{order.id}</h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="text-xs text-muted-foreground">{formatDateTime(order.createdAt)}</p>
        </div>
      </div>

      {/* Status actions */}
      {nextStatuses.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {nextStatuses.map((s) => (
            <button
              key={s}
              data-testid={`button-status-${s}`}
              disabled={updateStatus.isPending}
              onClick={() =>
                updateStatus.mutate({ id, data: { status: s as "confirmed" | "paid" | "preparing" | "ready" | "delivered" | "cancelled" } })
              }
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-60 ${
                s === "cancelled"
                  ? "border-red-300 text-red-700 hover:bg-red-50"
                  : "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
              }`}
            >
              {updateStatus.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                STATUS_LABELS[s] ?? s
              )}
            </button>
          ))}
        </div>
      )}

      {/* Customer */}
      {order.customer && (
        <Card>
          <CardHeader className="px-4 pt-4 pb-2">
            <CardTitle className="text-sm font-semibold">Customer</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <p className="text-sm font-medium">{order.customer.name || "Unknown"}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  <span data-testid="text-customer-phone">
                    {formatPhone(order.customer.whatsappPhone)}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span>{order.customer.totalOrders} orders total</span>
                  <span className="text-border">|</span>
                  <span>{formatCurrency(Number(order.customer.totalSpend))} spent</span>
                  <span className="text-border">|</span>
                  <span>{order.customer.loyaltyPoints} pts</span>
                </div>
              </div>
              <Link href={`/messages?customerId=${order.customer.id}`}>
                <button className="flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 px-2.5 py-1.5 rounded-lg transition-colors shrink-0 mt-0.5">
                  <MessageCircle className="h-3.5 w-3.5" />
                  Message
                </button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items */}
      <Card>
        <CardHeader className="px-4 pt-4 pb-2">
          <CardTitle className="text-sm font-semibold">
            Items ({order.items?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="divide-y divide-border">
            {order.items?.map((item, idx) => (
              <div
                key={idx}
                data-testid={`row-item-${idx}`}
                className="py-2 flex items-center justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{item.productName}</p>
                  {item.variantName && (
                    <p className="text-xs text-muted-foreground">{item.variantName}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} × {formatCurrency(Number(item.unitPrice))}
                  </p>
                </div>
                <p className="text-sm font-semibold shrink-0 ml-4">
                  {formatCurrency(Number(item.totalPrice))}
                </p>
              </div>
            ))}
          </div>
          <div className="pt-3 mt-2 border-t border-border flex justify-between items-center">
            <span className="text-sm font-semibold">Total</span>
            <span
              data-testid="text-order-total"
              className="text-base font-bold text-primary"
            >
              {formatCurrency(Number(order.totalAmount))}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Payment */}
      <Card>
        <CardHeader className="px-4 pt-4 pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Payment</CardTitle>
          {order.payment ? (
            <PaymentBadge status={order.payment.status} />
          ) : (
            <button
              data-testid="button-initiate-payment"
              onClick={() => setShowMpesaForm(true)}
              className="flex items-center gap-1.5 text-xs bg-secondary text-secondary-foreground px-2.5 py-1 rounded-md hover:bg-secondary/90 transition-colors font-medium"
            >
              <CreditCard className="h-3.5 w-3.5" />
              Mpesa STK Push
            </button>
          )}
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {order.payment ? (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">{formatCurrency(Number(order.payment.amount))}</span>
              </div>
              {order.payment.mpesaReceiptNumber && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Receipt</span>
                  <span className="font-mono text-xs">{order.payment.mpesaReceiptNumber}</span>
                </div>
              )}
              {order.payment.mpesaPhone && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone</span>
                  <span>{formatPhone(order.payment.mpesaPhone)}</span>
                </div>
              )}
            </div>
          ) : showMpesaForm ? (
            <div className="space-y-3">
              <input
                data-testid="input-mpesa-phone"
                type="tel"
                value={mpesaPhone}
                onChange={(e) => setMpesaPhone(e.target.value)}
                placeholder="07XX XXX XXX"
                className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex gap-2">
                <button
                  data-testid="button-send-stk"
                  disabled={!mpesaPhone || initiatePayment.isPending}
                  onClick={() =>
                    initiatePayment.mutate({
                      data: { orderId: id, phone: mpesaPhone },
                    })
                  }
                  className="flex-1 bg-primary text-primary-foreground text-sm font-medium py-2 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {initiatePayment.isPending ? "Sending..." : "Send STK Push"}
                </button>
                <button
                  onClick={() => setShowMpesaForm(false)}
                  className="px-3 text-sm border rounded-md hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No payment recorded yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Notes — always shown, editable */}
      <Card>
        <CardHeader className="px-4 pt-4 pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5" />
            Notes
          </CardTitle>
          {!editingNotes && (
            <button
              data-testid="button-edit-notes"
              onClick={startEditNotes}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="h-3 w-3" />
              {order.notes ? "Edit" : "Add note"}
            </button>
          )}
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {editingNotes ? (
            <div className="space-y-2">
              <textarea
                data-testid="textarea-notes"
                autoFocus
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditingNotes(false);
                }}
                placeholder="Delivery address, special instructions…"
                rows={3}
                className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
              <div className="flex gap-2">
                <button
                  data-testid="button-save-notes"
                  disabled={updateNotes.isPending}
                  onClick={saveNotes}
                  className="flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {updateNotes.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
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
          ) : order.notes ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{order.notes}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No notes yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
