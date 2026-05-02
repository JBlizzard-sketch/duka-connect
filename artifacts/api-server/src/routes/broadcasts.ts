import { Router } from "express";
import { db } from "@workspace/db";
import { broadcastsTable, customersTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import { ListBroadcastsQueryParams, CreateBroadcastBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { sendTextMessage } from "../lib/whatsapp";
import { batchProcess } from "@workspace/integrations-openai-ai-server/batch";

const router = Router();

router.get("/broadcasts", async (req, res) => {
  const parsed = ListBroadcastsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { page = 1, limit = 20 } = parsed.data;

  const [broadcasts, [{ total }]] = await Promise.all([
    db
      .select()
      .from(broadcastsTable)
      .orderBy(desc(broadcastsTable.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(broadcastsTable),
  ]);

  res.json({
    broadcasts,
    meta: {
      total: Number(total),
      page,
      limit,
      totalPages: Math.ceil(Number(total) / limit),
    },
  });
});

router.get("/broadcasts/segment-preview", async (req, res) => {
  const allCustomers = await db.select().from(customersTable);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const segmentCount = (seg: string) => {
    switch (seg) {
      case "all": return allCustomers.length;
      case "recent": return allCustomers.filter(c => c.lastOrderAt && c.lastOrderAt >= thirtyDaysAgo).length;
      case "top_customers": return allCustomers.filter(c => Number(c.totalSpend) > 5000).length;
      case "loyal": return allCustomers.filter(c => c.loyaltyPoints >= 50).length;
      case "vip": return allCustomers.filter(c => c.totalOrders >= 10 || Number(c.totalSpend) >= 10000).length;
      case "new_customers": return allCustomers.filter(c => c.totalOrders >= 1 && c.totalOrders <= 2).length;
      default: return 0;
    }
  };

  res.json({
    segments: ["all", "recent", "top_customers", "loyal", "vip", "new_customers"].map(s => ({
      segment: s,
      customerCount: segmentCount(s),
    })),
  });
});

router.post("/broadcasts", async (req, res) => {
  const parsed = CreateBroadcastBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const message = parsed.data.message;
  const segment = parsed.data.segment as "all" | "recent" | "top_customers" | "loyal" | "vip" | "new_customers";
  const scheduleAt = parsed.data.scheduleAt;

  const allCustomers = await db.select().from(customersTable);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recipients = (() => {
    switch (segment) {
      case "all":
        return allCustomers;
      case "recent":
        return allCustomers.filter(
          (c) => c.lastOrderAt && c.lastOrderAt >= thirtyDaysAgo
        );
      case "top_customers":
        return allCustomers.filter((c) => Number(c.totalSpend) > 5000);
      case "loyal":
        return allCustomers.filter((c) => c.loyaltyPoints >= 50);
      case "vip":
        return allCustomers.filter(
          (c) => c.totalOrders >= 10 || Number(c.totalSpend) >= 10000
        );
      case "new_customers":
        return allCustomers.filter(
          (c) => c.totalOrders >= 1 && c.totalOrders <= 2
        );
      default:
        return allCustomers;
    }
  })();

  const [broadcast] = await db
    .insert(broadcastsTable)
    .values({
      businessId: 1,
      message,
      segment: segment as "all" | "recent" | "top_customers" | "loyal",
      recipientCount: recipients.length,
      status: scheduleAt ? "draft" : "sending",
      scheduleAt: scheduleAt ? new Date(scheduleAt) : null,
    })
    .returning();

  res.status(201).json(broadcast);

  // Fire-and-forget actual sending (don't block response)
  if (!scheduleAt && recipients.length > 0) {
    sendBroadcastMessages(broadcast.id, message, recipients).catch((err) =>
      logger.error({ err, broadcastId: broadcast.id }, "Broadcast send failed")
    );
  }
});

async function sendBroadcastMessages(
  broadcastId: number,
  message: string,
  recipients: (typeof customersTable.$inferSelect)[]
) {
  logger.info(
    { broadcastId, recipientCount: recipients.length },
    "Starting broadcast send"
  );

  let sentCount = 0;
  let failedCount = 0;

  const results = await batchProcess(
    recipients,
    async (customer: typeof customersTable.$inferSelect) => {
      const result = await sendTextMessage(customer.whatsappPhone, message);
      return { customerId: customer.id, result };
    },
    { concurrency: 3, retries: 2 }
  );

  for (const outcome of results) {
    if (outcome.result.success) sentCount++;
    else failedCount++;
  }

  await db
    .update(broadcastsTable)
    .set({
      status: failedCount === recipients.length ? "failed" : "sent",
      sentCount,
      failedCount,
      sentAt: new Date(),
    })
    .where(eq(broadcastsTable.id, broadcastId));

  logger.info(
    { broadcastId, sentCount, failedCount },
    "Broadcast send complete"
  );
}

export default router;
