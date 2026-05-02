import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";
import { staffTable } from "./staff";

export const broadcastSegmentEnum = pgEnum("broadcast_segment", [
  "all",
  "recent",
  "top_customers",
  "loyal",
  "vip",
  "new_customers",
]);

export const broadcastStatusEnum = pgEnum("broadcast_status", [
  "draft",
  "sending",
  "sent",
  "failed",
]);

export const broadcastsTable = pgTable("broadcasts", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  createdById: integer("created_by_id").references(() => staffTable.id),
  message: text("message").notNull(),
  segment: broadcastSegmentEnum("segment").notNull().default("all"),
  recipientCount: integer("recipient_count").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  status: broadcastStatusEnum("status").notNull().default("draft"),
  scheduleAt: timestamp("schedule_at"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBroadcastSchema = createInsertSchema(broadcastsTable).omit({ id: true, createdAt: true });
export const selectBroadcastSchema = createSelectSchema(broadcastsTable);
export type InsertBroadcast = z.infer<typeof insertBroadcastSchema>;
export type Broadcast = typeof broadcastsTable.$inferSelect;
