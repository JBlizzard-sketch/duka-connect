import { useState, useRef } from "react";
import {
  useListProducts,
  useCreateProduct,
  useDeleteProduct,
  useGetProduct,
  useUpdateProduct,
  useUpdateProductVariant,
  getListProductsQueryKey,
  getGetProductQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/format";

import {
  Search,
  Plus,
  AlertTriangle,
  Package,
  Loader2,
  Trash2,
  Pencil,
  Minus,
  Edit2,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  X,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
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

function EditProductDialog({
  product,
  onUpdated,
}: {
  product: { id: number; name: string; category?: string | null; basePrice: number; unit: string; description?: string | null; imageUrl?: string | null };
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: product.name,
    category: product.category ?? "",
    basePrice: String(product.basePrice),
    unit: product.unit,
    description: product.description ?? "",
    imageUrl: product.imageUrl ?? "",
  });
  const { toast } = useToast();
  const updateProduct = useUpdateProduct({
    mutation: {
      onSuccess: () => {
        setOpen(false);
        onUpdated();
        toast({ title: "Product updated" });
      },
      onError: () => toast({ title: "Update failed", variant: "destructive" }),
    },
  });

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    setForm({
      name: product.name,
      category: product.category ?? "",
      basePrice: String(product.basePrice),
      unit: product.unit,
      description: product.description ?? "",
      imageUrl: product.imageUrl ?? "",
    });
    setOpen(true);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          data-testid={`button-edit-product-${product.id}`}
          onClick={handleOpen}
          className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors shrink-0"
          title="Edit product"
        >
          <Edit2 className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Product</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          {[
            { key: "name", label: "Product Name", placeholder: "e.g. Panadol 500mg" },
            { key: "category", label: "Category", placeholder: "e.g. Medicine" },
            { key: "basePrice", label: "Price (KES)", placeholder: "50", type: "number" },
            { key: "unit", label: "Unit", placeholder: "piece" },
          ].map(({ key, label, placeholder, type }) => (
            <div key={key}>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
              <input
                type={type ?? "text"}
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          ))}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description (optional)</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Brief product description…"
              rows={2}
              className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Image URL (optional)</label>
            <input
              type="url"
              value={form.imageUrl}
              onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
              placeholder="https://example.com/product.jpg"
              className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {form.imageUrl && (
              <img
                src={form.imageUrl}
                alt="Preview"
                className="mt-2 h-16 w-16 rounded-md object-cover border border-border"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
          </div>
          <button
            disabled={!form.name || !form.basePrice || updateProduct.isPending}
            onClick={() =>
              updateProduct.mutate({
                id: product.id,
                data: {
                  name: form.name,
                  category: form.category || undefined,
                  basePrice: Number(form.basePrice),
                  unit: form.unit,
                  description: form.description || undefined,
                  imageUrl: form.imageUrl || undefined,
                },
              })
            }
            className="w-full bg-primary text-primary-foreground text-sm font-medium py-2 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {updateProduct.isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddProductDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "",
    basePrice: "",
    unit: "piece",
    initialStock: "",
    lowStockThreshold: "5",
    description: "",
    imageUrl: "",
  });
  const { toast } = useToast();
  const createProduct = useCreateProduct({
    mutation: {
      onSuccess: () => {
        setOpen(false);
        setForm({ name: "", category: "", basePrice: "", unit: "piece", initialStock: "", lowStockThreshold: "5", description: "", imageUrl: "" });
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
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description (optional)</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Brief product description…"
              rows={2}
              className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Image URL (optional)</label>
            <input
              type="url"
              value={form.imageUrl}
              onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
              placeholder="https://example.com/product.jpg"
              className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {form.imageUrl && (
              <img
                src={form.imageUrl}
                alt="Preview"
                className="mt-2 h-16 w-16 rounded-md object-cover border border-border"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
          </div>
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
                  description: form.description || undefined,
                  imageUrl: form.imageUrl || undefined,
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

function StockAdjustDialog({
  productId,
  productName,
  onUpdated,
}: {
  productId: number;
  productName: string;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"adjust" | "set">("adjust");
  const [values, setValues] = useState<Record<string | number, string>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: product, isLoading } = useGetProduct(productId, {
    query: { enabled: open, queryKey: getGetProductQueryKey(productId) },
  });

  const updateVariant = useUpdateProductVariant({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        onUpdated();
      },
      onError: () => toast({ title: "Stock update failed", variant: "destructive" }),
    },
  });

  const variants = product?.variants ?? [];

  function handleApply(variantId: number, current: number) {
    const raw = values[variantId];
    const num = parseInt(raw ?? "", 10);
    if (isNaN(num)) return;
    if (mode === "adjust") {
      if (num === 0) return;
      updateVariant.mutate(
        { id: productId, variantId, data: { stockAdjustment: num } },
        {
          onSuccess: () => {
            setValues((prev) => ({ ...prev, [variantId]: "" }));
            toast({ title: num > 0 ? `+${num} units added` : `${num} units removed`, description: productName });
          },
        }
      );
    } else {
      if (num < 0) return;
      updateVariant.mutate(
        { id: productId, variantId, data: { stockQuantity: num } },
        {
          onSuccess: () => {
            setValues((prev) => ({ ...prev, [variantId]: "" }));
            toast({ title: `Stock set to ${num} units`, description: productName });
          },
        }
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setValues({}); setMode("adjust"); } }}>
      <DialogTrigger asChild>
        <button
          data-testid={`button-adjust-stock-${productId}`}
          onClick={(e) => e.stopPropagation()}
          className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors shrink-0"
          title="Adjust stock"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stock — {productName}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
          <button
            onClick={() => { setMode("adjust"); setValues({}); }}
            className={cn("px-3 py-1 text-xs font-medium rounded-md transition-colors", mode === "adjust" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            Adjust (+/−)
          </button>
          <button
            onClick={() => { setMode("set"); setValues({}); }}
            className={cn("px-3 py-1 text-xs font-medium rounded-md transition-colors", mode === "set" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            Set to exact
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : variants.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No variants found.</p>
        ) : (
          <div className="space-y-4 pt-1">
            {variants.map((v) => {
              const current = Number(v.stockQuantity);
              const raw = values[v.id] ?? "";
              const num = parseInt(raw, 10);
              const preview = !isNaN(num) && raw !== ""
                ? mode === "adjust" ? Math.max(0, current + num) : Math.max(0, num)
                : null;
              const thresholdKey = `threshold_${v.id}`;
              const thresholdRaw = values[thresholdKey] ?? "";

              return (
                <div
                  key={v.id}
                  data-testid={`variant-row-${v.id}`}
                  className="border border-border rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{v.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(Number(v.price))} · Current:{" "}
                        <span className={cn("font-semibold", current <= Number(v.lowStockThreshold) && "text-amber-600")}>
                          {current}
                        </span>
                        {preview !== null && (
                          <span className={cn("ml-1 font-semibold", mode === "set" ? "text-blue-600" : num > 0 ? "text-green-600" : "text-red-600")}>
                            → {preview}
                          </span>
                        )}
                      </p>
                    </div>
                    {current <= Number(v.lowStockThreshold) && (
                      <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                        <AlertTriangle className="h-3 w-3" />
                        Low
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {mode === "adjust" && (
                      <button
                        onClick={() => setValues((a) => ({ ...a, [v.id]: String((parseInt(a[v.id] ?? "0", 10) || 0) - 1) }))}
                        className="h-8 w-8 rounded border border-input flex items-center justify-center hover:bg-muted transition-colors"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                    )}
                    <input
                      data-testid={`input-adjustment-${v.id}`}
                      type="number"
                      value={raw}
                      onChange={(e) => setValues((a) => ({ ...a, [v.id]: e.target.value }))}
                      placeholder={mode === "adjust" ? "0" : `Current: ${current}`}
                      className="flex-1 border border-input rounded-md px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {mode === "adjust" && (
                      <button
                        onClick={() => setValues((a) => ({ ...a, [v.id]: String((parseInt(a[v.id] ?? "0", 10) || 0) + 1) }))}
                        className="h-8 w-8 rounded border border-input flex items-center justify-center hover:bg-muted transition-colors font-bold"
                      >
                        +
                      </button>
                    )}
                    <button
                      data-testid={`button-apply-${v.id}`}
                      disabled={!raw || isNaN(num) || (mode === "adjust" && num === 0) || updateVariant.isPending}
                      onClick={() => handleApply(v.id, current)}
                      className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {updateVariant.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : mode === "set" ? "Set" : "Apply"}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-border/60">
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      Alert at: <span className="font-medium text-foreground">{Number(v.lowStockThreshold)}</span>
                    </span>
                    <input
                      type="number"
                      value={thresholdRaw}
                      onChange={(e) => setValues((a) => ({ ...a, [thresholdKey]: e.target.value }))}
                      placeholder="New threshold"
                      min={0}
                      className="flex-1 border border-input rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      disabled={!thresholdRaw || isNaN(parseInt(thresholdRaw, 10)) || updateVariant.isPending}
                      onClick={() => {
                        const t = parseInt(thresholdRaw, 10);
                        if (isNaN(t) || t < 0) return;
                        updateVariant.mutate(
                          { id: productId, variantId: v.id, data: { lowStockThreshold: t } },
                          {
                            onSuccess: () => {
                              setValues((a) => ({ ...a, [thresholdKey]: "" }));
                              toast({ title: `Alert threshold set to ${t}`, description: productName });
                            },
                          }
                        );
                      }}
                      className="px-2 py-1 bg-muted text-foreground text-xs font-medium rounded-md hover:bg-muted/80 disabled:opacity-50 transition-colors shrink-0"
                    >
                      Set
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type CsvRow = { name: string; category: string; basePrice: string; unit: string; stockQuantity: string; lowStockThreshold: string };

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
  const headerMap: Record<string, string> = {
    name: "name", productname: "name",
    category: "category", cat: "category",
    baseprice: "basePrice", price: "basePrice",
    unit: "unit",
    stockquantity: "stockQuantity", stock: "stockQuantity", qty: "stockQuantity",
    lowstockthreshold: "lowStockThreshold", threshold: "lowStockThreshold", minstock: "lowStockThreshold",
  };
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      const mapped = headerMap[h] ?? h;
      row[mapped] = vals[i] ?? "";
    });
    return row as CsvRow;
  }).filter((r) => r.name);
}

function ImportCsvDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const importMutation = useMutation({
    mutationFn: async (products: CsvRow[]) => {
      const r = await fetch(`${BASE}/api/products/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products }),
      });
      if (!r.ok) throw new Error("Import failed");
      return r.json() as Promise<{ created: number; skipped: number; errors: string[] }>;
    },
    onSuccess: (data) => {
      setResult(data);
      onImported();
      toast({ title: `Imported ${data.created} product${data.created === 1 ? "" : "s"}` });
    },
    onError: () => toast({ title: "Import failed", variant: "destructive" }),
  });

  function handleFile(file: File) {
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setRows(parseCsv(text));
    };
    reader.readAsText(file);
  }

  function reset() {
    setRows([]);
    setFileName(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 border border-border text-foreground text-sm font-medium px-3 py-2 rounded-lg hover:bg-muted transition-colors">
          <Upload className="h-4 w-4" />
          Import CSV
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Bulk Import Products
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
          {/* Format hint */}
          <div className="bg-muted rounded-lg p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">CSV column headers (flexible):</p>
            <p><span className="font-mono bg-background px-1 rounded">name</span> · <span className="font-mono bg-background px-1 rounded">basePrice</span> · <span className="font-mono bg-background px-1 rounded">unit</span> · <span className="font-mono bg-background px-1 rounded">category</span> · <span className="font-mono bg-background px-1 rounded">stockQuantity</span> · <span className="font-mono bg-background px-1 rounded">lowStockThreshold</span></p>
            <p className="text-[11px]">Example: <span className="font-mono">Uji,Breakfast,45,500g,100,20</span></p>
          </div>

          {/* Drop / pick zone */}
          {!rows.length && !result && (
            <div
              className="border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center py-10 gap-3 cursor-pointer hover:border-primary/50 hover:bg-muted/40 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Click to select or drag & drop a CSV file</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          )}

          {/* Preview table */}
          {rows.length > 0 && !result && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{fileName} — <span className="text-muted-foreground">{rows.length} rows detected</span></p>
                <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <X className="h-3 w-3" /> Clear
                </button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted text-muted-foreground">
                      {["Name", "Category", "Price (KES)", "Unit", "Stock", "Min Stock"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 8).map((row, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2 font-medium">{row.name || <span className="text-red-500">—</span>}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.category || "—"}</td>
                        <td className="px-3 py-2">{row.basePrice || <span className="text-red-500">—</span>}</td>
                        <td className="px-3 py-2">{row.unit || "unit"}</td>
                        <td className="px-3 py-2">{row.stockQuantity || "0"}</td>
                        <td className="px-3 py-2">{row.lowStockThreshold || "5"}</td>
                      </tr>
                    ))}
                    {rows.length > 8 && (
                      <tr className="border-t border-border bg-muted">
                        <td colSpan={6} className="px-3 py-2 text-xs text-muted-foreground text-center">
                          ...and {rows.length - 8} more rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <button
                disabled={importMutation.isPending}
                onClick={() => importMutation.mutate(rows)}
                className="w-full py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {importMutation.isPending ? "Importing…" : `Import ${rows.length} Products`}
              </button>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <CheckCircle2 className="h-4 w-4" />
                Import complete: {result.created} created, {result.skipped} skipped
              </div>
              {result.errors.length > 0 && (
                <div className="bg-muted rounded-lg p-3 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Skipped rows:</p>
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">{e}</p>
                  ))}
                </div>
              )}
              <button
                onClick={() => { reset(); setOpen(false); }}
                className="w-full py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
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

  const allProducts = data?.products ?? [];

  const categories = Array.from(
    new Set(allProducts.map((p) => p.category).filter(Boolean) as string[])
  ).sort();

  const products = categoryFilter
    ? allProducts.filter((p) => p.category === categoryFilter)
    : allProducts;

  const totalStockValue = allProducts.reduce(
    (sum, p) => sum + (p.totalStock ?? 0) * Number(p.basePrice ?? 0),
    0
  );
  const lowStockCount = allProducts.filter(
    (p) => (p.totalStock ?? 0) <= Number(p.lowStockThreshold ?? 0) && (p.totalStock ?? 0) >= 0
  ).length;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Inventory</h1>
        <div className="flex items-center gap-2">
          <ImportCsvDialog
            onImported={() =>
              queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() })
            }
          />
          <AddProductDialog
            onCreated={() =>
              queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() })
            }
          />
        </div>
      </div>

      {/* Stock value summary */}
      {!isLoading && allProducts.length > 0 && (
        <div className="flex items-center gap-4 text-sm flex-wrap">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Package className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">{allProducts.length}</span> products
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-1.5 text-muted-foreground">
            Stock value:
            <span className="font-semibold text-foreground">{formatCurrency(totalStockValue)}</span>
          </div>
          {lowStockCount > 0 && (
            <>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-1.5 text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="font-medium">{lowStockCount} low stock</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Search & filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[160px] max-w-sm">
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

      {/* Category filter chips */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setCategoryFilter("")}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              categoryFilter === ""
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:bg-muted"
            )}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat === categoryFilter ? "" : cat)}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                categoryFilter === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:bg-muted"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

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
                  {product.imageUrl && (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-28 object-cover rounded-md mb-3 border border-border"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{product.name}</p>
                      {product.category && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {product.category}
                        </p>
                      )}
                      {(product as typeof product & { description?: string | null }).description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {(product as typeof product & { description?: string | null }).description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <EditProductDialog
                        product={{
                          id: product.id,
                          name: product.name,
                          category: product.category,
                          basePrice: Number(product.basePrice),
                          unit: product.unit,
                          description: (product as typeof product & { description?: string | null }).description,
                          imageUrl: product.imageUrl,
                        }}
                        onUpdated={() =>
                          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() })
                        }
                      />
                      <StockAdjustDialog
                        productId={product.id}
                        productName={product.name}
                        onUpdated={() =>
                          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() })
                        }
                      />
                      <button
                        data-testid={`button-delete-product-${product.id}`}
                        onClick={() => deleteProduct.mutate({ id: product.id })}
                        className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
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
