import { Router } from "express";
import { db } from "@workspace/db";
import {
  whatsappMessagesTable,
  customersTable,
  ordersTable,
} from "@workspace/db";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendTextMessage } from "../lib/whatsapp";

const router = Router();

// GET /api/messages/conversations
// Returns one row per customer (latest message per customer) with unread counts
router.get("/messages/conversations", async (req, res) => {
  const businessId = 1;

  // Get the most recent message per customer, plus unread count
  const conversations = await db
    .select({
      customerId: whatsappMessagesTable.customerId,
      lastMessageBody: whatsappMessagesTable.body,
      lastMessageDirection: whatsappMessagesTable.direction,
      lastMessageAt: whatsappMessagesTable.createdAt,
      isOrderMessage: whatsappMessagesTable.isOrderMessage,
      customerName: customersTable.name,
      customerWhatsappName: customersTable.whatsappName,
      customerPhone: customersTable.whatsappPhone,
      customerTotalOrders: customersTable.totalOrders,
    })
    .from(whatsappMessagesTable)
    .innerJoin(customersTable, eq(whatsappMessagesTable.customerId, customersTable.id))
    .where(
      and(
        eq(whatsappMessagesTable.businessId, businessId),
        sql`${whatsappMessagesTable.id} = (
          SELECT MAX(id) FROM whatsapp_messages wm2
          WHERE wm2.customer_id = ${whatsappMessagesTable.customerId}
            AND wm2.business_id = ${businessId}
        )`
      )
    )
    .orderBy(desc(whatsappMessagesTable.createdAt))
    .limit(100);

  // For each customer, count their inbound messages (approximation of "unread")
  const inboundCounts = await db
    .select({
      customerId: whatsappMessagesTable.customerId,
      inboundCount: sql<number>`count(*)::int`,
    })
    .from(whatsappMessagesTable)
    .where(
      and(
        eq(whatsappMessagesTable.businessId, businessId),
        eq(whatsappMessagesTable.direction, "inbound")
      )
    )
    .groupBy(whatsappMessagesTable.customerId);

  const countByCustomer = Object.fromEntries(
    inboundCounts.map((r) => [r.customerId, Number(r.inboundCount)])
  );

  const result = conversations.map((c) => ({
    customerId: c.customerId,
    customerName: c.customerName ?? c.customerWhatsappName ?? c.customerPhone,
    customerPhone: c.customerPhone,
    totalOrders: c.customerTotalOrders,
    lastMessage: c.lastMessageBody,
    lastMessageDirection: c.lastMessageDirection,
    lastMessageAt: c.lastMessageAt,
    isOrderMessage: c.isOrderMessage,
    inboundCount: countByCustomer[c.customerId ?? 0] ?? 0,
  }));

  res.json({ conversations: result });
});

// GET /api/messages/thread/:customerId
// Returns the full message thread for a customer
router.get("/messages/thread/:customerId", async (req, res) => {
  const customerId = parseInt(req.params.customerId, 10);
  if (isNaN(customerId)) {
    res.status(400).json({ error: "Invalid customerId" });
    return;
  }

  const [customer, messages] = await Promise.all([
    db
      .select()
      .from(customersTable)
      .where(eq(customersTable.id, customerId))
      .limit(1),
    db
      .select({
        id: whatsappMessagesTable.id,
        direction: whatsappMessagesTable.direction,
        messageType: whatsappMessagesTable.messageType,
        body: whatsappMessagesTable.body,
        isOrderMessage: whatsappMessagesTable.isOrderMessage,
        createdAt: whatsappMessagesTable.createdAt,
        orderId: whatsappMessagesTable.orderId,
      })
      .from(whatsappMessagesTable)
      .where(
        and(
          eq(whatsappMessagesTable.customerId, customerId),
          eq(whatsappMessagesTable.businessId, 1)
        )
      )
      .orderBy(whatsappMessagesTable.createdAt)
      .limit(200),
  ]);

  if (!customer[0]) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  // Attach order info for order-linked messages
  const orderIds = messages
    .filter((m) => m.isOrderMessage && m.orderId)
    .map((m) => m.orderId!);

  const orders =
    orderIds.length > 0
      ? await db
          .select({
            id: ordersTable.id,
            status: ordersTable.status,
            totalAmount: ordersTable.totalAmount,
            notes: ordersTable.notes,
          })
          .from(ordersTable)
          .where(
            sql`${ordersTable.id} = ANY(ARRAY[${sql.join(
              orderIds.map((id) => sql`${id}`),
              sql`, `
            )}]::int[])`
          )
      : [];

  const orderById = Object.fromEntries(orders.map((o) => [o.id, o]));

  res.json({
    customer: customer[0],
    messages: messages.map((m) => ({
      ...m,
      order: m.orderId ? orderById[m.orderId] ?? null : null,
    })),
  });
});

// POST /api/messages/thread/:customerId/reply
// Send a reply from the dashboard to the customer
router.post("/messages/thread/:customerId/reply", async (req, res) => {
  const customerId = parseInt(req.params.customerId, 10);
  if (isNaN(customerId)) {
    res.status(400).json({ error: "Invalid customerId" });
    return;
  }

  const text: unknown = req.body?.text;
  if (typeof text !== "string" || text.trim().length === 0 || text.length > 4096) {
    res.status(400).json({ error: "text must be a non-empty string (max 4096 chars)" });
    return;
  }

  const [customer] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.id, customerId))
    .limit(1);

  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  const result = await sendTextMessage(customer.whatsappPhone, text);

  const [msg] = await db
    .insert(whatsappMessagesTable)
    .values({
      businessId: 1,
      customerId,
      whatsappMessageId: result.success
        ? result.messageId
        : `local-${Date.now()}`,
      direction: "outbound",
      messageType: "text",
      body: text,
      rawPayload: JSON.stringify({
        to: customer.whatsappPhone,
        text,
      }),
      isOrderMessage: false,
    })
    .returning();

  req.log.info(
    { customerId, phone: customer.whatsappPhone, sent: result.success },
    "Reply sent from dashboard"
  );

  res.status(201).json({ message: msg, sent: result.success });
});

// GET /api/messages/stats
// Quick stats for the inbox badge
router.get("/messages/stats", async (req, res) => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [[totalInbound], [orderMessages], [distinctCustomers], [recentInbound]] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(whatsappMessagesTable)
        .where(
          and(
            eq(whatsappMessagesTable.businessId, 1),
            eq(whatsappMessagesTable.direction, "inbound")
          )
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(whatsappMessagesTable)
        .where(
          and(
            eq(whatsappMessagesTable.businessId, 1),
            eq(whatsappMessagesTable.isOrderMessage, true)
          )
        ),
      db
        .select({ count: sql<number>`count(distinct customer_id)::int` })
        .from(whatsappMessagesTable)
        .where(eq(whatsappMessagesTable.businessId, 1)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(whatsappMessagesTable)
        .where(
          and(
            eq(whatsappMessagesTable.businessId, 1),
            eq(whatsappMessagesTable.direction, "inbound"),
            gte(whatsappMessagesTable.createdAt, oneHourAgo)
          )
        ),
    ]);

  res.json({
    totalInbound: Number(totalInbound?.count ?? 0),
    orderMessages: Number(orderMessages?.count ?? 0),
    activeConversations: Number(distinctCustomers?.count ?? 0),
    recentInbound: Number(recentInbound?.count ?? 0),
  });
});

export default router;
