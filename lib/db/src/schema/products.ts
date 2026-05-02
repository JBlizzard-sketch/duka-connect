import { pgTable, serial, text, boolean, integer, timestamp, varchar, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  basePrice: numeric("base_price", { precision: 10, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 30 }).notNull().default("piece"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  lowStockThreshold: numeric("low_stock_threshold", { precision: 10, scale: 3 }).notNull().default("5"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const productVariantsTable = pgTable("product_variants", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  sku: varchar("sku", { length: 100 }),
  price: numeric("price", { precision: 10, scale: 2 }),
  stockQuantity: numeric("stock_quantity", { precision: 10, scale: 3 }).notNull().default("0"),
  lowStockThreshold: numeric("low_stock_threshold", { precision: 10, scale: 3 }).notNull().default("5"),
  unit: varchar("unit", { length: 30 }).notNull().default("piece"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVariantSchema = createInsertSchema(productVariantsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const selectProductSchema = createSelectSchema(productsTable);
export const selectVariantSchema = createSelectSchema(productVariantsTable);
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type InsertVariant = z.infer<typeof insertVariantSchema>;
export type Product = typeof productsTable.$inferSelect;
export type ProductVariant = typeof productVariantsTable.$inferSelect;
