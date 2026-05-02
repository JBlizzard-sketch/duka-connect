import { pgTable, serial, text, integer, timestamp, varchar, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
  "timeout",
]);

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("KES"),
  status: paymentStatusEnum("status").notNull().default("pending"),
  mpesaPhone: varchar("mpesa_phone", { length: 20 }),
  merchantRequestId: varchar("merchant_request_id", { length: 128 }),
  checkoutRequestId: varchar("checkout_request_id", { length: 128 }),
  mpesaReceiptNumber: varchar("mpesa_receipt_number", { length: 50 }),
  resultCode: integer("result_code"),
  resultDesc: text("result_desc"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const selectPaymentSchema = createSelectSchema(paymentsTable);
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
