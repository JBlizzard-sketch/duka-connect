import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";

export const orderEventsTable = pgTable("order_events", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
