import { useRoute, Link } from "wouter";
import { useGetOrder, useUpdateOrderStatus, useInitiatePayment, useListStaff, getGetOrderQueryKey, getGetOrdersSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatCurrency, formatDateTime, formatPhone } from "@/lib/format";
import { ArrowLeft, Phone, MessageSquare, CreditCard, Loader2, MessageCircle, Pencil, Check, X, Printer, ExternalLink, Send, Lock, Clock, ArrowRight, Minus, Plus, Tag } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge, { PaymentBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
  const [showCashForm, setShowCashForm] = useState(false);
  const [cashAmount, setCashAmount] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesInput, setNotesInput] = useState("");
  const [editingInternalNotes, setEditingInternalNotes] = useState(false);
  const [internalNotesInput, setInternalNotesInput] = useState("");
  const [editingDelivery, setEditingDelivery] = useState(false);
  const [deliveryInput, setDeliveryInput] = useState("");
  const [assignedToId, setAssignedToId] = useState<number | null | undefined>(undefined);
  const [editingItems, setEditingItems] = useState(false);
  const [draftQtys, setDraftQtys] = useState<Record<number, number>>({});
  const [editingDiscount, setEditingDiscount] = useState(false);
  const [discountInput, setDiscountInput] = useState("");

  const { data: staffData } = useListStaff();

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

  const sendPaymentRequest = useMutation({
    mutationFn: async () => {
      if (!order?.customer?.id) throw new Error("No customer");
      const amount = Math.round(Number(order.totalAmount));
      const text =
        `💳 *Ombi la Malipo — Agiza #${order.id}*\n\n` +
        `Jumla: *KES ${amount.toLocaleString()}*\n\n` +
        `Tafadhali lipa kwa *Mpesa*:\n` +
        `📱 Ref: ORDER${order.id}\n` +
        `Kiasi: KES ${amount.toLocaleString()}\n\n` +
        `Asante kwa ununuzi wako! 🙏`;
      const r = await fetch(`${BASE}/api/messages/thread/${order.customer.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) throw new Error("Send failed");
      return r.json();
    },
    onSuccess: () => toast({ title: "Payment request sent on WhatsApp" }),
    onError: () => toast({ title: "Failed to send payment request", variant: "destructive" }),
  });

  const recordCash = useMutation({
    mutationFn: async (amount?: number) => {
      const r = await fetch(`${BASE}/api/payments/cash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: id, amount }),
      });
      if (!r.ok) throw new Error("Failed to record payment");
      return r.json();
    },
    onSuccess: () => {
      setShowCashForm(false);
      setCashAmount("");
      queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getGetOrdersSummaryQueryKey() });
      toast({ title: "Cash payment recorded", description: "Order marked as paid" });
    },
    onError: () => toast({ title: "Failed to record payment", variant: "destructive" }),
  });

  const sendReceipt = useMutation({
    mutationFn: async () => {
      if (!order?.customer?.id) throw new Error("No customer");
      const itemLines = (order.items ?? [])
        .map((item) => `  • ${item.productName}${item.variantName ? ` (${item.variantName})` : ""} × ${item.quantity} — KES ${Number(item.totalPrice).toLocaleString()}`)
        .join("\n");
      const text =
        `🧾 *Risiti ya Agiza #${order.id}*\n\n` +
        `${itemLines}\n\n` +
        `━━━━━━━━━━━━━━\n` +
        `💰 *Jumla: KES ${Math.round(Number(order.totalAmount)).toLocaleString()}*\n\n` +
        `Hali: *${order.status.toUpperCase()}*\n` +
        (order.payment?.mpesaReceiptNumber ? `Mpesa: ${order.payment.mpesaReceiptNumber}\n` : "") +
        `\nAsante kwa ununuzi wako! 🙏`;
      const r = await fetch(`${BASE}/api/messages/thread/${order.customer.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) throw new Error("Send failed");
      return r.json();
    },
    onSuccess: () => toast({ title: "Receipt sent on WhatsApp" }),
    onError: () => toast({ title: "Failed to send receipt", variant: "destructive" }),
  });

  const saveItems = useMutation({
    mutationFn: async (items: { id: number; quantity: number }[]) => {
      const r = await fetch(`${BASE}/api/orders/${id}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!r.ok) throw new Error("Failed to save items");
      return r.json();
    },
    onSuccess: () => {
      setEditingItems(false);
      setDraftQtys({});
      queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getGetOrdersSummaryQueryKey() });
      toast({ title: "Items updated" });
    },
    onError: () => toast({ title: "Failed to update items", variant: "destructive" }),
  });

  function startEditItems() {
    const qtys: Record<number, number> = {};
    order?.items?.forEach((it) => { if (it.id) qtys[it.id] = it.quantity; });
    setDraftQtys(qtys);
    setEditingItems(true);
  }

  function commitItemEdit() {
    const items = Object.entries(draftQtys).map(([idStr, quantity]) => ({ id: Number(idStr), quantity }));
    saveItems.mutate(items);
  }

  const applyDiscount = useMutation({
    mutationFn: async (discountAmount: number) => {
      const r = await fetch(`${BASE}/api/orders/${id}/discount`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discountAmount }),
      });
      if (!r.ok) throw new Error("Failed to apply discount");
      return r.json();
    },
    onSuccess: () => {
      setEditingDiscount(false);
      setDiscountInput("");
      queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getGetOrdersSummaryQueryKey() });
      toast({ title: "Discount applied" });
    },
    onError: () => toast({ title: "Failed to apply discount", variant: "destructive" }),
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

  function startEditInternalNotes() {
    setInternalNotesInput((order as typeof order & { internalNotes?: string | null }).internalNotes ?? "");
    setEditingInternalNotes(true);
  }

  function saveInternalNotes() {
    updateNotes.mutate({
      id,
      data: { internalNotes: internalNotesInput.trim() || null },
    });
    setEditingInternalNotes(false);
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3" data-print-hide>
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
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors"
          title="Print order receipt"
        >
          <Printer className="h-3.5 w-3.5" />
          Print
        </button>
      </div>

      {/* Print-only receipt */}
      <div className="hidden print-only" style={{ fontFamily: "sans-serif", color: "#111" }}>
        <div style={{ textAlign: "center", borderBottom: "2px solid #000", paddingBottom: "12px", marginBottom: "12px" }}>
          <p style={{ fontSize: "11px", color: "#666", marginBottom: "2px" }}>OFFICIAL RECEIPT</p>
          <h1 style={{ fontSize: "22px", fontWeight: "bold", margin: "0 0 2px" }}>Order #{order.id}</h1>
          <p style={{ fontSize: "11px", color: "#555" }}>{formatDateTime(order.createdAt)}</p>
        </div>

        {order.customer && (
          <div style={{ marginBottom: "12px", fontSize: "12px" }}>
            <p><strong>Customer:</strong> {order.customer.name || formatPhone(order.customer.whatsappPhone)}</p>
            <p><strong>Phone:</strong> {formatPhone(order.customer.whatsappPhone)}</p>
          </div>
        )}

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginBottom: "12px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #333" }}>
              <th style={{ textAlign: "left", paddingBottom: "4px" }}>Item</th>
              <th style={{ textAlign: "right", paddingBottom: "4px" }}>Qty</th>
              <th style={{ textAlign: "right", paddingBottom: "4px" }}>Price</th>
              <th style={{ textAlign: "right", paddingBottom: "4px" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items?.map((item, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "4px 0" }}>{item.productName}{item.variantName ? ` (${item.variantName})` : ""}</td>
                <td style={{ textAlign: "right", padding: "4px 0" }}>{item.quantity}</td>
                <td style={{ textAlign: "right", padding: "4px 0" }}>{formatCurrency(Number(item.unitPrice))}</td>
                <td style={{ textAlign: "right", padding: "4px 0" }}>{formatCurrency(Number(item.totalPrice))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #333" }}>
              <td colSpan={3} style={{ paddingTop: "6px", fontWeight: "bold" }}>TOTAL</td>
              <td style={{ textAlign: "right", paddingTop: "6px", fontWeight: "bold", fontSize: "14px" }}>{formatCurrency(Number(order.totalAmount))}</td>
            </tr>
          </tfoot>
        </table>

        {order.payment?.mpesaReceiptNumber && (
          <p style={{ fontSize: "11px", color: "#555" }}>Mpesa receipt: {order.payment.mpesaReceiptNumber}</p>
        )}
        {order.notes && (
          <p style={{ fontSize: "11px", color: "#555", marginTop: "4px" }}>Notes: {order.notes}</p>
        )}
        <div style={{ borderTop: "1px solid #ccc", marginTop: "16px", paddingTop: "8px", textAlign: "center", fontSize: "11px", color: "#777" }}>
          <p>Status: {order.status.toUpperCase()} · Thank you for your business!</p>
        </div>
      </div>

      {/* Status actions */}
      {nextStatuses.length > 0 && (
        <div className="flex gap-2 flex-wrap" data-print-hide>
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
        <Card data-print-hide>
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
              <div className="flex items-center gap-2 shrink-0 mt-0.5 flex-wrap justify-end">
                <a
                  href={`https://wa.me/${order.customer.whatsappPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-medium border border-border px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                  title="Open in WhatsApp"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  WhatsApp
                </a>
                <Link href={`/messages?customerId=${order.customer.id}`}>
                  <button className="flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 px-2.5 py-1.5 rounded-lg transition-colors">
                    <MessageCircle className="h-3.5 w-3.5" />
                    Message
                  </button>
                </Link>
                {["pending", "confirmed", "preparing"].includes(order.status) && (
                  <button
                    onClick={() => sendPaymentRequest.mutate()}
                    disabled={sendPaymentRequest.isPending}
                    className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-60"
                    title="Send Mpesa payment request via WhatsApp"
                  >
                    {sendPaymentRequest.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Pay Request
                  </button>
                )}
                <button
                  onClick={() => sendReceipt.mutate()}
                  disabled={sendReceipt.isPending}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border hover:bg-muted px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-60"
                  title="Send order receipt via WhatsApp"
                >
                  {sendReceipt.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MessageSquare className="h-3.5 w-3.5" />
                  )}
                  Send Receipt
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items */}
      <Card data-print-hide>
        <CardHeader className="px-4 pt-4 pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            Items ({order.items?.length ?? 0})
          </CardTitle>
          {!editingItems && !["delivered", "cancelled", "paid"].includes(order.status) && (
            <button
              onClick={startEditItems}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
          )}
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {editingItems ? (
            <div className="space-y-2">
              {order.items?.map((item) => {
                const itemId = item.id as number | undefined;
                if (!itemId) return null;
                const qty = draftQtys[itemId] ?? item.quantity;
                return (
                  <div key={itemId} className="flex items-center gap-3 py-1.5 border-b border-border last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.productName}</p>
                      {item.variantName && <p className="text-xs text-muted-foreground">{item.variantName}</p>}
                      <p className="text-xs text-muted-foreground">{formatCurrency(Number(item.unitPrice))} each</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setDraftQtys((prev) => ({ ...prev, [itemId]: Math.max(0, (prev[itemId] ?? item.quantity) - 1) }))}
                        className="w-6 h-6 flex items-center justify-center rounded border border-border bg-background hover:bg-muted transition-colors text-xs font-bold"
                      >
                        <Minus className="h-2.5 w-2.5" />
                      </button>
                      <span className={`w-6 text-center text-sm font-semibold ${qty === 0 ? "text-red-500 line-through" : ""}`}>
                        {qty}
                      </span>
                      <button
                        onClick={() => setDraftQtys((prev) => ({ ...prev, [itemId]: (prev[itemId] ?? item.quantity) + 1 }))}
                        className="w-6 h-6 flex items-center justify-center rounded border border-border bg-background hover:bg-primary/10 hover:text-primary transition-colors text-xs font-bold"
                      >
                        <Plus className="h-2.5 w-2.5" />
                      </button>
                      <span className="text-sm font-semibold w-16 text-right">
                        {formatCurrency(Number(item.unitPrice) * qty)}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-2 pt-2">
                <button
                  disabled={saveItems.isPending}
                  onClick={commitItemEdit}
                  className="flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {saveItems.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Save changes
                </button>
                <button
                  onClick={() => { setEditingItems(false); setDraftQtys({}); }}
                  className="text-xs px-3 py-1.5 rounded-md border hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
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
              <div className="pt-3 mt-2 border-t border-border space-y-1.5">
                {Number(order.deliveryFee ?? 0) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Delivery fee</span>
                    <span className="text-xs text-muted-foreground">{formatCurrency(Number(order.deliveryFee))}</span>
                  </div>
                )}
                {Number((order as typeof order & { discountAmount?: string | number }).discountAmount ?? 0) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-green-700 flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      Discount
                    </span>
                    <span className="text-xs font-medium text-green-700">
                      − {formatCurrency(Number((order as typeof order & { discountAmount?: string | number }).discountAmount))}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-1 border-t border-border/50">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Total</span>
                    {!editingDiscount && !["delivered", "cancelled", "paid"].includes(order.status) && (
                      <button
                        onClick={() => {
                          setDiscountInput(String(Number((order as typeof order & { discountAmount?: string | number }).discountAmount ?? 0) || ""));
                          setEditingDiscount(true);
                        }}
                        className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Tag className="h-2.5 w-2.5" />
                        {Number((order as typeof order & { discountAmount?: string | number }).discountAmount ?? 0) > 0 ? "Edit discount" : "Add discount"}
                      </button>
                    )}
                  </div>
                  <span
                    data-testid="text-order-total"
                    className="text-base font-bold text-primary"
                  >
                    {formatCurrency(Number(order.totalAmount))}
                  </span>
                </div>
                {editingDiscount && (
                  <div className="pt-2 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground shrink-0">Discount (KES):</span>
                    <input
                      type="number"
                      min="0"
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                      placeholder="0"
                      className="w-24 border border-input rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      autoFocus
                    />
                    <button
                      disabled={applyDiscount.isPending}
                      onClick={() => applyDiscount.mutate(Number(discountInput) || 0)}
                      className="flex items-center gap-1 text-xs font-medium bg-green-600 text-white px-2.5 py-1 rounded-md hover:bg-green-700 disabled:opacity-60 transition-colors"
                    >
                      {applyDiscount.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      Apply
                    </button>
                    <button
                      onClick={() => { setEditingDiscount(false); setDiscountInput(""); }}
                      className="text-xs px-2 py-1 rounded-md border hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Payment */}
      <Card data-print-hide>
        <CardHeader className="px-4 pt-4 pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Payment</CardTitle>
          {order.payment ? (
            <div className="flex items-center gap-1.5">
              {order.payment.resultDesc === "cash" || order.payment.resultDesc?.startsWith("cash:") ? (
                <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Cash</span>
              ) : (
                <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">Mpesa</span>
              )}
              <PaymentBadge status={order.payment.status} />
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                data-testid="button-record-cash"
                onClick={() => { setShowCashForm(true); setShowMpesaForm(false); }}
                className="flex items-center gap-1.5 text-xs bg-green-600 text-white px-2.5 py-1 rounded-md hover:bg-green-700 transition-colors font-medium"
              >
                <Check className="h-3.5 w-3.5" />
                Cash
              </button>
              <button
                data-testid="button-initiate-payment"
                onClick={() => { setShowMpesaForm(true); setShowCashForm(false); }}
                className="flex items-center gap-1.5 text-xs bg-secondary text-secondary-foreground px-2.5 py-1 rounded-md hover:bg-secondary/90 transition-colors font-medium"
              >
                <CreditCard className="h-3.5 w-3.5" />
                Mpesa
              </button>
            </div>
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
              {order.payment.paidAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paid at</span>
                  <span className="text-xs">{formatDateTime(order.payment.paidAt)}</span>
                </div>
              )}
            </div>
          ) : showCashForm ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Leave amount blank to use order total ({formatCurrency(Number(order.totalAmount))})
              </p>
              <input
                data-testid="input-cash-amount"
                type="number"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                placeholder={`Amount (default: ${Number(order.totalAmount).toFixed(0)})`}
                min={0}
                className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex gap-2">
                <button
                  data-testid="button-confirm-cash"
                  disabled={recordCash.isPending}
                  onClick={() => recordCash.mutate(cashAmount ? Number(cashAmount) : undefined)}
                  className="flex-1 bg-green-600 text-white text-sm font-medium py-2 rounded-md hover:bg-green-700 disabled:opacity-60 transition-colors"
                >
                  {recordCash.isPending ? "Recording..." : "Confirm Cash Payment"}
                </button>
                <button
                  onClick={() => setShowCashForm(false)}
                  className="px-3 text-sm border rounded-md hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
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

      {/* Delivery */}
      <Card data-print-hide>
        <CardHeader className="px-4 pt-4 pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Delivery</CardTitle>
          {!editingDelivery && (
            <button
              onClick={() => { setDeliveryInput(order.deliveryAddress ?? ""); setEditingDelivery(true); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="h-3 w-3" />
              {order.deliveryAddress ? "Edit" : "Add address"}
            </button>
          )}
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2 text-sm">
          {editingDelivery ? (
            <div className="space-y-2">
              <input
                autoFocus
                type="text"
                value={deliveryInput}
                onChange={(e) => setDeliveryInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setEditingDelivery(false); }}
                placeholder="e.g. Westlands, Nairobi — next to KFC"
                className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex gap-2">
                <button
                  disabled={updateNotes.isPending}
                  onClick={() => {
                    updateNotes.mutate({ id, data: { deliveryAddress: deliveryInput.trim() || null } });
                    setEditingDelivery(false);
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  <Check className="h-3 w-3" />
                  Save
                </button>
                <button
                  onClick={() => setEditingDelivery(false)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border hover:bg-muted transition-colors"
                >
                  <X className="h-3 w-3" />
                  Cancel
                </button>
              </div>
            </div>
          ) : order.deliveryAddress ? (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground shrink-0">Address</span>
              <span className="text-right">{order.deliveryAddress}</span>
            </div>
          ) : (
            <p className="text-muted-foreground italic">No delivery address set.</p>
          )}
          <DeliveryFeeEditor order={order} />
        </CardContent>
      </Card>

      {/* Staff assignment */}
      <Card data-print-hide>
        <CardHeader className="px-4 pt-4 pb-2">
          <CardTitle className="text-sm font-semibold">Assign Staff</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex items-center gap-2">
            <select
              value={assignedToId !== undefined ? (assignedToId ?? "") : (order.assignedToId ?? "")}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : null;
                setAssignedToId(val);
                updateStatus.mutate({ id, data: { assignedToId: val } });
              }}
              className="flex-1 border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">— Unassigned —</option>
              {(staffData?.staff ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
              ))}
            </select>
            {updateStatus.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          {(assignedToId !== undefined ? assignedToId : order.assignedToId) && (
            <p className="text-xs text-muted-foreground mt-1.5">
              Assigned to {(staffData?.staff ?? []).find((s) => s.id === (assignedToId !== undefined ? assignedToId : order.assignedToId))?.name ?? "staff member"}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Notes — always shown, editable */}
      <Card data-print-hide>
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
      {/* Internal staff notes */}
      <Card data-print-hide>
        <CardHeader className="px-4 pt-4 pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            Staff Notes
            <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Internal</span>
          </CardTitle>
          {!editingInternalNotes && (
            <button
              data-testid="button-edit-internal-notes"
              onClick={startEditInternalNotes}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="h-3 w-3" />
              {(order as typeof order & { internalNotes?: string | null }).internalNotes ? "Edit" : "Add note"}
            </button>
          )}
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {editingInternalNotes ? (
            <div className="space-y-2">
              <textarea
                data-testid="textarea-internal-notes"
                autoFocus
                value={internalNotesInput}
                onChange={(e) => setInternalNotesInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setEditingInternalNotes(false); }}
                placeholder="Private staff notes — not visible to customer…"
                rows={3}
                className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
              <div className="flex gap-2">
                <button
                  data-testid="button-save-internal-notes"
                  disabled={updateNotes.isPending}
                  onClick={saveInternalNotes}
                  className="flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {updateNotes.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Save
                </button>
                <button
                  onClick={() => setEditingInternalNotes(false)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border hover:bg-muted transition-colors"
                >
                  <X className="h-3 w-3" />
                  Cancel
                </button>
              </div>
            </div>
          ) : (order as typeof order & { internalNotes?: string | null }).internalNotes ? (
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {(order as typeof order & { internalNotes?: string | null }).internalNotes}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No staff notes yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Activity timeline */}
      <OrderTimeline orderId={id} />
    </div>
  );
}

interface OrderEvent {
  id: number;
  orderId: number;
  event: string;
  fromStatus: string | null;
  toStatus: string | null;
  description: string;
  createdAt: string;
}

function DeliveryFeeEditor({ order }: { order: { id: number; deliveryFee?: string | null; status: string } }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [feeInput, setFeeInput] = useState("");
  const isLocked = ["delivered", "cancelled", "paid"].includes(order.status);

  const saveFee = useMutation({
    mutationFn: async (fee: number) => {
      const r = await fetch(`${BASE}/api/orders/${order.id}/delivery-fee`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryFee: fee }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(order.id) });
      toast({ title: "Delivery fee updated" });
    },
    onError: () => toast({ title: "Failed to update delivery fee", variant: "destructive" }),
  });

  const currentFee = Number(order.deliveryFee ?? 0);

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="text-muted-foreground text-sm shrink-0">Delivery fee</span>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-muted-foreground">KES</span>
          <input
            type="number"
            min="0"
            step="50"
            autoFocus
            value={feeInput}
            onChange={(e) => setFeeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveFee.mutate(Number(feeInput) || 0);
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-24 border border-input rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={() => saveFee.mutate(Number(feeInput) || 0)}
            disabled={saveFee.isPending}
            className="p-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            <Check className="h-3 w-3" />
          </button>
          <button onClick={() => setEditing(false)} className="p-1 rounded hover:bg-muted">
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-sm">Delivery fee</span>
      <div className="flex items-center gap-2">
        {currentFee > 0 && <span className="font-medium text-sm">{formatCurrency(currentFee)}</span>}
        {!isLocked && (
          <button
            onClick={() => { setFeeInput(currentFee > 0 ? String(currentFee) : ""); setEditing(true); }}
            className="text-xs text-muted-foreground hover:text-primary border border-border px-2 py-0.5 rounded hover:border-primary/50 transition-colors"
          >
            {currentFee > 0 ? "Edit" : "Add fee"}
          </button>
        )}
      </div>
    </div>
  );
}

const EVENT_ICONS: Record<string, string> = {
  status_change: "🔄",
  note_updated: "📝",
  internal_note: "🔒",
  delivery_updated: "📍",
  assigned: "👤",
};

const EVENT_COLORS: Record<string, string> = {
  status_change: "bg-primary",
  note_updated: "bg-blue-500",
  internal_note: "bg-amber-500",
  delivery_updated: "bg-violet-500",
  assigned: "bg-teal-500",
};

function OrderTimeline({ orderId }: { orderId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["order-events", orderId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/orders/${orderId}/events`);
      return r.json() as Promise<{ events: OrderEvent[] }>;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const events = data?.events ?? [];

  if (isLoading) {
    return (
      <Card data-print-hide>
        <CardHeader className="px-4 pt-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-8 bg-muted animate-pulse rounded-md" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) return null;

  return (
    <Card data-print-hide>
      <CardHeader className="px-4 pt-4 pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          Activity
          <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {events.length} event{events.length !== 1 ? "s" : ""}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="relative">
          <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-4 pl-8">
            {events.map((ev) => (
              <div key={ev.id} className="relative">
                <div className={`absolute -left-[1.35rem] top-1 w-2.5 h-2.5 rounded-full ring-2 ring-background ${EVENT_COLORS[ev.event] ?? "bg-muted-foreground"}`} />
                <div>
                  <p className="text-xs font-medium leading-snug">
                    <span className="mr-1">{EVENT_ICONS[ev.event] ?? "•"}</span>
                    {ev.description}
                  </p>
                  {ev.event === "status_change" && ev.fromStatus && ev.toStatus && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      <span className="capitalize">{ev.fromStatus}</span>
                      <ArrowRight className="h-2.5 w-2.5" />
                      <span className="capitalize font-medium text-foreground">{ev.toStatus}</span>
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatDateTime(ev.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
