import { useState } from "react";
import {
  useListProducts,
  useCreateProduct,
  useDeleteProduct,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/format";
import {
  Search,
  Plus,
  AlertTriangle,
  Package,
  Loader2,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function AddProductDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "",
    basePrice: "",
    unit: "piece",
    initialStock: "",
    lowStockThreshold: "5",
  });
  const { toast } = useToast();
  const createProduct = useCreateProduct({
    mutation: {
      onSuccess: () => {
        setOpen(false);
        setForm({ name: "", category: "", basePrice: "", unit: "piece", initialStock: "", lowStockThreshold: "5" });
        onCreated();
        toast({ title: "Product added" });
      },
      onError: () => toast({ title: "Failed to add product", variant: "destructive" }),
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          data-testid="button-add-product"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Product
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Product</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          {[
            { key: "name", label: "Product Name", placeholder: "e.g. Panadol 500mg" },
            { key: "category", label: "Category", placeholder: "e.g. Medicine" },
            { key: "basePrice", label: "Price (KES)", placeholder: "50", type: "number" },
            { key: "unit", label: "Unit", placeholder: "piece" },
            { key: "initialStock", label: "Initial Stock", placeholder: "100", type: "number" },
            { key: "lowStockThreshold", label: "Low Stock Alert At", placeholder: "5", type: "number" },
          ].map(({ key, label, placeholder, type }) => (
            <div key={key}>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
              <input
                data-testid={`input-${key}`}
                type={type ?? "text"}
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          ))}
          <button
            data-testid="button-submit-product"
            disabled={!form.name || !form.basePrice || createProduct.isPending}
            onClick={() =>
              createProduct.mutate({
                data: {
                  name: form.name,
                  category: form.category || undefined,
                  basePrice: Number(form.basePrice),
                  unit: form.unit,
                  initialStock: form.initialStock ? Number(form.initialStock) : undefined,
                  lowStockThreshold: form.lowStockThreshold ? Number(form.lowStockThreshold) : 5,
                },
              })
            }
            className="w-full bg-primary text-primary-foreground text-sm font-medium py-2 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {createProduct.isPending ? "Adding..." : "Add Product"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useListProducts({
    search: search || undefined,
    lowStock: lowStockOnly || undefined,
    limit: 100,
  } as Parameters<typeof useListProducts>[0]);

  const deleteProduct = useDeleteProduct({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        toast({ title: "Product deleted" });
      },
      onError: () => toast({ title: "Delete failed", variant: "destructive" }),
    },
  });

  const products = data?.products ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Inventory</h1>
        <AddProductDialog
          onCreated={() =>
            queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() })
          }
        />
      </div>

      {/* Search & filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            data-testid="input-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full pl-8 pr-3 py-2 border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <button
          data-testid="button-filter-low-stock"
          onClick={() => setLowStockOnly((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 border rounded-md text-xs font-medium transition-colors",
            lowStockOnly
              ? "bg-amber-100 border-amber-300 text-amber-800"
              : "bg-background border-border text-foreground hover:bg-muted"
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Low Stock
        </button>
      </div>

      {/* Product grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No products found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {products.map((product) => {
            const stock = Number(product.totalStock);
            const threshold = Number(product.lowStockThreshold);
            const isLow = stock <= threshold;

            return (
              <Card
                key={product.id}
                data-testid={`card-product-${product.id}`}
                className={cn(isLow && "border-amber-200")}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{product.name}</p>
                      {product.category && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {product.category}
                        </p>
                      )}
                    </div>
                    <button
                      data-testid={`button-delete-product-${product.id}`}
                      onClick={() => deleteProduct.mutate({ id: product.id })}
                      className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Stock</p>
                      <p
                        data-testid={`text-stock-${product.id}`}
                        className={cn(
                          "text-lg font-bold",
                          isLow ? "text-amber-600" : "text-foreground"
                        )}
                      >
                        {stock}
                        <span className="text-xs font-normal text-muted-foreground ml-1">
                          {product.unit}
                        </span>
                      </p>
                      {isLow && (
                        <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                          <AlertTriangle className="h-3 w-3" />
                          Low stock
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Price</p>
                      <p
                        data-testid={`text-price-${product.id}`}
                        className="text-sm font-semibold text-primary"
                      >
                        {formatCurrency(Number(product.basePrice))}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
