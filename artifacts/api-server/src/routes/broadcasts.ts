import { Router } from "express";
import { db } from "@workspace/db";
import { broadcastsTable, customersTable } from "@workspace/db";
import { eq, desc, count, gte } from "drizzle-orm";
import {
  ListBroadcastsQueryParams,
  CreateBroadcastBody,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

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

router.post("/broadcasts", async (req, res) => {
  const parsed = CreateBroadcastBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { message, segment, scheduleAt } = parsed.data;

  // Count recipients by segment
  let recipientCount = 0;
  const allCustomers = await db.select().from(customersTable);

  switch (segment) {
    case "all":
      recipientCount = allCustomers.length;
      break;
    case "recent": {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      recipientCount = allCustomers.filter(
        (c) => c.lastOrderAt && c.lastOrderAt >= thirtyDaysAgo
      ).length;
      break;
    }
    case "top_customers":
      recipientCount = allCustomers.filter(
        (c) => Number(c.totalSpend) > 5000
      ).length;
      break;
    case "loyal":
      recipientCount = allCustomers.filter((c) => c.loyaltyPoints >= 50).length;
      break;
    default:
      recipientCount = allCustomers.length;
  }

  const [broadcast] = await db
    .insert(broadcastsTable)
    .values({
      businessId: 1,
      message,
      segment,
      recipientCount,
      status: scheduleAt ? "draft" : "sending",
      scheduleAt: scheduleAt ? new Date(scheduleAt) : null,
    })
    .returning();

  // In a real implementation, this would queue the broadcast to BullMQ
  // For now, mark as sent immediately if not scheduled
  if (!scheduleAt) {
    logger.info(
      { broadcastId: broadcast.id, recipientCount },
      "Broadcast queued (mock)"
    );
    await db
      .update(broadcastsTable)
      .set({ status: "sent", sentCount: recipientCount, sentAt: new Date() })
      .where(eq(broadcastsTable.id, broadcast.id));
  }

  res.status(201).json({ ...broadcast, status: scheduleAt ? "draft" : "sent" });
});

export default router;
