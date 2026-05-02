import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable, productVariantsTable } from "@workspace/db";
import { eq, ilike, and, lte, sql, count } from "drizzle-orm";
import {
  ListProductsQueryParams,
  CreateProductBody,
  UpdateProductBody,
  UpdateProductParams,
  GetProductParams,
  DeleteProductParams,
  CreateProductVariantParams,
  CreateProductVariantBody,
  UpdateProductVariantParams,
  UpdateProductVariantBody,
} from "@workspace/api-zod";

const router = Router();

async function getProductWithStock(id: number) {
  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, id))
    .limit(1);
  if (!product) return null;

  const variants = await db
    .select()
    .from(productVariantsTable)
    .where(eq(productVariantsTable.productId, id));

  const totalStock =
    variants.length > 0
      ? variants.reduce((s, v) => s + Number(v.stockQuantity), 0)
      : 0;

  return { ...product, totalStock, variants };
}

async function getStockByProduct(): Promise<Record<number, number>> {
  const stocks = await db
    .select({
      productId: productVariantsTable.productId,
      totalStock: sql<number>`coalesce(sum(cast(${productVariantsTable.stockQuantity} as numeric)), 0)`,
    })
    .from(productVariantsTable)
    .groupBy(productVariantsTable.productId);
  return Object.fromEntries(stocks.map((s) => [s.productId, Number(s.totalStock)]));
}

router.get("/products", async (req, res) => {
  const parsed = ListProductsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { search, lowStock, page = 1, limit = 100 } = parsed.data;

  const [baseProducts, stockByProduct, [{ total }]] = await Promise.all([
    db
      .select()
      .from(productsTable)
      .where(search ? ilike(productsTable.name, `%${search}%`) : undefined)
      .limit(limit)
      .offset((page - 1) * limit),
    getStockByProduct(),
    db
      .select({ total: count() })
      .from(productsTable)
      .where(search ? ilike(productsTable.name, `%${search}%`) : undefined),
  ]);

  let products = baseProducts.map((p) => ({
    ...p,
    totalStock: stockByProduct[p.id] ?? 0,
  }));

  if (lowStock) {
    products = products.filter(
      (p) => p.totalStock <= Number(p.lowStockThreshold)
    );
  }

  res.json({
    products,
    meta: {
      total: Number(total),
      page,
      limit,
      totalPages: Math.ceil(Number(total) / limit),
    },
  });
});

router.post("/products", async (req, res) => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { name, description, category, basePrice, unit, lowStockThreshold, initialStock, imageUrl } =
    parsed.data;

  const [product] = await db
    .insert(productsTable)
    .values({
      businessId: 1,
      name,
      description,
      category,
      basePrice: String(basePrice),
      unit: unit ?? "piece",
      lowStockThreshold: String(lowStockThreshold ?? 5),
      imageUrl,
    })
    .returning();

  // Create default variant if initialStock provided
  if (initialStock !== undefined && initialStock > 0) {
    await db.insert(productVariantsTable).values({
      productId: product.id,
      name: "Default",
      stockQuantity: String(initialStock),
      lowStockThreshold: String(lowStockThreshold ?? 5),
      unit: unit ?? "piece",
    });
  }

  res.status(201).json({ ...product, totalStock: initialStock ?? 0 });
});

router.get("/products/stats/low-stock", async (req, res) => {
  const [baseProducts, stockByProduct] = await Promise.all([
    db.select().from(productsTable).where(eq(productsTable.isActive, true)),
    getStockByProduct(),
  ]);

  const lowStockProducts = baseProducts
    .map((p) => ({ ...p, totalStock: stockByProduct[p.id] ?? 0 }))
    .filter((p) => p.totalStock <= Number(p.lowStockThreshold));

  res.json({
    products: lowStockProducts,
    meta: {
      total: lowStockProducts.length,
      page: 1,
      limit: lowStockProducts.length,
      totalPages: 1,
    },
  });
});

router.get("/products/:id", async (req, res) => {
  const parsed = GetProductParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const product = await getProductWithStock(parsed.data.id);
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json(product);
});

router.patch("/products/:id", async (req, res) => {
  const paramsParsed = UpdateProductParams.safeParse(req.params);
  const bodyParsed = UpdateProductBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const updates: Partial<typeof productsTable.$inferInsert> = {};
  const { name, description, category, basePrice, unit, lowStockThreshold, isActive, imageUrl } =
    bodyParsed.data;
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (category !== undefined) updates.category = category;
  if (basePrice !== undefined) updates.basePrice = String(basePrice);
  if (unit !== undefined) updates.unit = unit;
  if (lowStockThreshold !== undefined) updates.lowStockThreshold = String(lowStockThreshold);
  if (isActive !== undefined) updates.isActive = isActive;
  if (imageUrl !== undefined) updates.imageUrl = imageUrl;
  updates.updatedAt = new Date();

  const [updated] = await db
    .update(productsTable)
    .set(updates)
    .where(eq(productsTable.id, paramsParsed.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json({ ...updated, totalStock: 0 });
});

router.delete("/products/:id", async (req, res) => {
  const parsed = DeleteProductParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  await db.delete(productsTable).where(eq(productsTable.id, parsed.data.id));
  res.status(204).end();
});

router.post("/products/:id/variants", async (req, res) => {
  const paramsParsed = CreateProductVariantParams.safeParse(req.params);
  const bodyParsed = CreateProductVariantBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { name, sku, price, stockQuantity, lowStockThreshold, unit } = bodyParsed.data;

  const [variant] = await db
    .insert(productVariantsTable)
    .values({
      productId: paramsParsed.data.id,
      name,
      sku,
      price: price !== undefined ? String(price) : null,
      stockQuantity: String(stockQuantity ?? 0),
      lowStockThreshold: String(lowStockThreshold ?? 5),
      unit: unit ?? "piece",
    })
    .returning();

  res.status(201).json(variant);
});

router.patch("/products/:id/variants/:variantId", async (req, res) => {
  const paramsParsed = UpdateProductVariantParams.safeParse(req.params);
  const bodyParsed = UpdateProductVariantBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { name, price, stockQuantity, lowStockThreshold, stockAdjustment } = bodyParsed.data;
  const updates: Partial<typeof productVariantsTable.$inferInsert> = {};
  if (name !== undefined) updates.name = name;
  if (price !== undefined) updates.price = String(price);
  if (lowStockThreshold !== undefined) updates.lowStockThreshold = String(lowStockThreshold);
  if (stockQuantity !== undefined) updates.stockQuantity = String(stockQuantity);
  updates.updatedAt = new Date();

  const finalSet =
    stockAdjustment !== undefined
      ? {
          ...updates,
          stockQuantity: sql`cast(${productVariantsTable.stockQuantity} as numeric) + ${stockAdjustment}`,
        }
      : updates;

  const [updated] = await db
    .update(productVariantsTable)
    .set(finalSet)
    .where(eq(productVariantsTable.id, paramsParsed.data.variantId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Variant not found" });
    return;
  }
  res.json(updated);
});

export default router;
