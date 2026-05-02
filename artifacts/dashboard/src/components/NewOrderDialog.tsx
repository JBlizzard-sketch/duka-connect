import { useState, useMemo } from "react";
import {
  useListCustomers,
  useListProducts,
  useCreateOrder,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/format";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  User,
  ChevronRight,
  Check,
  Loader2,
  Package,
  Star,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

interface LineItem {
  productId: number;
  productName: string;
  unit: string;
  price: number;
  quantity: number;
}

type Step = "customer" | "items" | "review";

export default function NewOrderDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("customer");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [notes, setNotes] = useState("");
  const [redeemPoints, setRedeemPoints] = useState(false);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: customersData } = useListCustomers({ limit: 100 });
  const { data: productsData } = useListProducts({ limit: 100 });

  const createOrder = useCreateOrder({
    mutation: {
      onSuccess: (order) => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        handleClose();
        navigate(`/orders/${order.id}`);
      },
    },
  });

  const customers = customersData?.customers ?? [];
  const products = productsData?.products ?? [];

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.toLowerCase();
    return customers.filter(
      (c) =>
        !q ||
        (c.name ?? "").toLowerCase().includes(q) ||
        c.whatsappPhone.includes(q)
    );
  }, [customers, customerSearch]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase();
    return products.filter(
      (p) =>
        p.isActive &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          (p.category ?? "").toLowerCase().includes(q))
    );
  }, [products, productSearch]);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const availablePoints = selectedCustomer?.loyaltyPoints ?? 0;
  const maxRedeemable = Math.min(availablePoints, Math.floor(subtotal / 100) * 100);
  const loyaltyDiscount = redeemPoints && maxRedeemable > 0 ? maxRedeemable : 0;
  const total = Math.max(0, subtotal - loyaltyDiscount);

  function handleClose() {
    setStep("customer");
    setSelectedCustomerId(null);
    setCustomerSearch("");
    setProductSearch("");
    setItems([]);
    setNotes("");
    setRedeemPoints(false);
    onClose();
  }

  function addProduct(p: (typeof products)[0]) {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === p.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          productId: p.id,
          productName: p.name,
          unit: p.unit ?? "unit",
          price: Number(p.basePrice),
          quantity: 1,
        },
      ];
    });
  }

  function setQty(productId: number, qty: number) {
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.productId !== productId));
    } else {
      setItems((prev) =>
        prev.map((i) => (i.productId === productId ? { ...i, quantity: qty } : i))
      );
    }
  }

  function handleSubmit() {
    if (!selectedCustomerId || items.length === 0) return;
    createOrder.mutate({
      data: {
        customerId: selectedCustomerId,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        })),
        notes: notes || undefined,
        loyaltyDiscount: loyaltyDiscount > 0 ? loyaltyDiscount : undefined,
      },
    });
  }

  const steps: { id: Step; label: string }[] = [
    { id: "customer", label: "Customer" },
    { id: "items", label: "Items" },
    { id: "review", label: "Review" },
  ];
  const stepIdx = steps.findIndex((s) => s.id === step);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="h-4 w-4 text-primary" />
            New Order
          </DialogTitle>
          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-3">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (i < stepIdx || (i === 1 && selectedCustomerId)) setStep(s.id);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors",
                    s.id === step
                      ? "bg-primary text-primary-foreground"
                      : i < stepIdx
                      ? "bg-primary/10 text-primary hover:bg-primary/20"
                      : "bg-muted text-muted-foreground cursor-default"
                  )}
                >
                  {i < stepIdx ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <span className="w-3.5 h-3.5 flex items-center justify-center text-[10px]">
                      {i + 1}
                    </span>
                  )}
                  {s.label}
                </button>
                {i < steps.length - 1 && (
                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
              </div>
            ))}
          </div>
        </DialogHeader>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* ── Step 1: Customer ── */}
          {step === "customer" && (
            <div className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                Search for the customer placing this order.
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  autoFocus
                  placeholder="Search by name or phone…"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {filteredCustomers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No customers found
                  </p>
                ) : (
                  filteredCustomers.map((c) => {
                    const displayName = c.name ?? c.whatsappPhone;
                    const isSelected = c.id === selectedCustomerId;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setSelectedCustomerId(c.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                          isSelected
                            ? "bg-primary/10 border border-primary/30"
                            : "hover:bg-accent border border-transparent"
                        )}
                      >
                        <div
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                            isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                          )}
                        >
                          {isSelected ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <User className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">
                            {displayName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            +{c.whatsappPhone} · {c.totalOrders} orders
                          </p>
                        </div>
                        {c.loyaltyPoints > 0 && (
                          <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0">
                            ⭐ {c.loyaltyPoints}pts
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Items ── */}
          {step === "items" && (
            <div className="p-5 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  autoFocus
                  placeholder="Search products…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>

              {/* Product grid */}
              <div className="grid grid-cols-1 gap-1.5 max-h-52 overflow-y-auto">
                {filteredProducts.map((p) => {
                  const inCart = items.find((i) => i.productId === p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => addProduct(p)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left border transition-colors",
                        inCart
                          ? "border-primary/30 bg-primary/5"
                          : "border-transparent hover:bg-accent"
                      )}
                    >
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(Number(p.basePrice))}/{p.unit}
                          {(p.totalStock ?? 0) <= Number(p.lowStockThreshold) && (
                            <span className="ml-2 text-amber-600">low stock</span>
                          )}
                        </p>
                      </div>
                      {inCart ? (
                        <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                          ×{inCart.quantity}
                        </span>
                      ) : (
                        <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Cart */}
              {items.length > 0 && (
                <div className="border-t border-border pt-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Cart ({items.length} item{items.length !== 1 ? "s" : ""})
                  </p>
                  {items.map((item) => (
                    <div
                      key={item.productId}
                      className="flex items-center gap-2"
                    >
                      <p className="flex-1 text-sm truncate">{item.productName}</p>
                      <p className="text-xs text-muted-foreground shrink-0 w-16 text-right">
                        {formatCurrency(item.price * item.quantity)}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setQty(item.productId, item.quantity - 1)}
                          className="w-6 h-6 rounded border border-input flex items-center justify-center hover:bg-muted"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-sm font-medium w-6 text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => setQty(item.productId, item.quantity + 1)}
                          className="w-6 h-6 rounded border border-input flex items-center justify-center hover:bg-muted"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => setQty(item.productId, 0)}
                          className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors ml-0.5"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Review ── */}
          {step === "review" && (
            <div className="p-5 space-y-4">
              {/* Customer summary */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    {selectedCustomer?.name ?? selectedCustomer?.whatsappPhone}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    +{selectedCustomer?.whatsappPhone}
                  </p>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-1.5">
                {items.map((item) => (
                  <div key={item.productId} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate">{item.productName}</span>
                    <span className="text-muted-foreground shrink-0">
                      ×{item.quantity} {item.unit}
                    </span>
                    <span className="font-medium shrink-0 w-20 text-right">
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                  </div>
                ))}

                {/* Loyalty redemption */}
                {availablePoints >= 100 && maxRedeemable >= 100 && (
                  <div className="mt-2 flex items-center justify-between p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="flex items-center gap-2">
                      <Star className="h-3.5 w-3.5 text-amber-500" />
                      <div>
                        <p className="text-xs font-medium text-amber-800">
                          Redeem {maxRedeemable} loyalty points
                        </p>
                        <p className="text-[10px] text-amber-600">
                          Save {formatCurrency(maxRedeemable)} · {availablePoints} pts available
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRedeemPoints((v) => !v)}
                      className={`relative w-9 h-5 rounded-full transition-colors ${
                        redeemPoints ? "bg-amber-500" : "bg-muted-foreground/30"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          redeemPoints ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  {loyaltyDiscount > 0 && (
                    <div className="w-full flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Subtotal</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>
                  )}
                </div>
                {loyaltyDiscount > 0 && (
                  <div className="flex items-center justify-between text-xs text-amber-700">
                    <span>Loyalty discount ({maxRedeemable} pts)</span>
                    <span>−{formatCurrency(loyaltyDiscount)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 border-t border-border">
                  <span className="text-sm font-bold">Total</span>
                  <span className="text-lg font-bold text-primary">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Delivery address, special instructions…"
                  rows={2}
                  className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>

              {createOrder.isError && (
                <p className="text-xs text-red-500">
                  Failed to create order. Please try again.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="shrink-0 px-5 py-4 border-t border-border flex items-center gap-3">
          {step !== "customer" && (
            <button
              onClick={() =>
                setStep(step === "review" ? "items" : "customer")
              }
              className="px-4 py-2 text-sm font-medium border border-input rounded-lg hover:bg-accent transition-colors"
            >
              Back
            </button>
          )}
          <div className="flex-1" />
          {step === "customer" && (
            <button
              disabled={!selectedCustomerId}
              onClick={() => setStep("items")}
              className={cn(
                "px-5 py-2 text-sm font-medium rounded-lg transition-colors",
                selectedCustomerId
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              Next: Add Items
            </button>
          )}
          {step === "items" && (
            <button
              disabled={items.length === 0}
              onClick={() => setStep("review")}
              className={cn(
                "px-5 py-2 text-sm font-medium rounded-lg transition-colors",
                items.length > 0
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              Review Order ({items.length})
            </button>
          )}
          {step === "review" && (
            <button
              disabled={createOrder.isPending}
              onClick={handleSubmit}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {createOrder.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Confirm Order · {formatCurrency(total)}
              {loyaltyDiscount > 0 && (
                <span className="ml-1 text-xs opacity-80">(−{formatCurrency(loyaltyDiscount)})</span>
              )}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
