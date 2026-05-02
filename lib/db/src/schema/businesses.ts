import { pgTable, serial, text, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const businessesTable = pgTable("businesses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  whatsappPhoneNumberId: varchar("whatsapp_phone_number_id", { length: 64 }),
  whatsappBusinessAccountId: varchar("whatsapp_business_account_id", { length: 64 }),
  whatsappApiToken: text("whatsapp_api_token"),
  whatsappWebhookVerifyToken: varchar("whatsapp_webhook_verify_token", { length: 128 }),
  whatsappConnected: boolean("whatsapp_connected").notNull().default(false),
  mpesaShortCode: varchar("mpesa_short_code", { length: 20 }),
  mpesaPasskey: text("mpesa_passkey"),
  mpesaConsumerKey: text("mpesa_consumer_key"),
  mpesaConsumerSecret: text("mpesa_consumer_secret"),
  mpesaConnected: boolean("mpesa_connected").notNull().default(false),
  currency: varchar("currency", { length: 10 }).notNull().default("KES"),
  timezone: varchar("timezone", { length: 64 }).notNull().default("Africa/Nairobi"),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBusinessSchema = createInsertSchema(businessesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const selectBusinessSchema = createSelectSchema(businessesTable);
export type InsertBusiness = z.infer<typeof insertBusinessSchema>;
export type Business = typeof businessesTable.$inferSelect;
