import { Router } from "express";
import { db } from "@workspace/db";
import {
  customersTable,
  ordersTable,
  orderItemsTable,
  paymentsTable,
  whatsappMessagesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// WhatsApp webhook verification (GET)
router.get("/webhooks/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const verifyToken =
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "duka-verify-token";

  if (mode === "subscribe" && token === verifyToken) {
    req.log.info("WhatsApp webhook verified");
    res.status(200).send(challenge);
  } else {
    req.log.warn({ mode, token }, "Webhook verification failed");
    res.status(403).json({ error: "Forbidden" });
  }
});

// WhatsApp webhook receiver (POST)
router.post("/webhooks/whatsapp", async (req, res) => {
  // Always respond 200 immediately to prevent WhatsApp retries
  res.json({ ok: true });

  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;
        const value = change.value;

        for (const message of value.messages || []) {
          await processInboundMessage(message, value.metadata);
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "WhatsApp webhook processing error");
  }
});

async function processInboundMessage(
  message: Record<string, unknown>,
  metadata: { phone_number_id: string }
) {
  const phone = String(message.from);
  const messageId = String(message.id);
  const messageType = String(message.type || "text");
  const body =
    messageType === "text"
      ? String((message.text as { body: string })?.body ?? "")
      : null;

  // Find or create customer
  let [customer] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.whatsappPhone, phone))
    .limit(1);

  if (!customer) {
    [customer] = await db
      .insert(customersTable)
      .values({
        businessId: 1,
        whatsappPhone: phone,
        whatsappName: String((message.contacts as Array<{ profile: { name: string } }>)?.[0]?.profile?.name ?? ""),
      })
      .returning();
  }

  // Log message
  await db.insert(whatsappMessagesTable).values({
    businessId: 1,
    customerId: customer.id,
    whatsappMessageId: messageId,
    direction: "inbound",
    messageType,
    body,
    rawPayload: JSON.stringify(message),
    isOrderMessage: body ? isLikelyOrderMessage(body) : false,
  });

  logger.info(
    { phone, messageType, body: body?.slice(0, 100) },
    "WhatsApp message received"
  );
}

function isLikelyOrderMessage(text: string): boolean {
  const orderKeywords = [
    "order",
    "nataka",
    "niletee",
    "nipe",
    "order",
    "buy",
    "nunua",
    "send",
    "deliver",
    "kilo",
    "piece",
    "kgs",
  ];
  const lower = text.toLowerCase();
  return orderKeywords.some((kw) => lower.includes(kw));
}

// Mpesa STK push callback
router.post("/webhooks/mpesa", async (req, res) => {
  res.json({ ok: true });

  try {
    const callback = req.body?.Body?.stkCallback;
    if (!callback) return;

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } =
      callback;

    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.checkoutRequestId, CheckoutRequestID))
      .limit(1);

    if (!payment) {
      logger.warn({ CheckoutRequestID }, "No payment found for callback");
      return;
    }

    if (ResultCode === 0) {
      // Payment successful
      const meta: Record<string, string | number> = {};
      for (const item of CallbackMetadata?.Item || []) {
        meta[item.Name] = item.Value;
      }

      await db
        .update(paymentsTable)
        .set({
          status: "completed",
          mpesaReceiptNumber: String(meta["MpesaReceiptNumber"] ?? ""),
          resultCode: ResultCode,
          resultDesc: ResultDesc,
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(paymentsTable.id, payment.id));

      // Mark order as paid
      await db
        .update(ordersTable)
        .set({ status: "paid", updatedAt: new Date() })
        .where(eq(ordersTable.id, payment.orderId));

      logger.info(
        {
          paymentId: payment.id,
          receipt: meta["MpesaReceiptNumber"],
        },
        "Mpesa payment completed"
      );
    } else {
      const newStatus =
        ResultCode === 1032 ? "cancelled" : ResultCode === 1037 ? "timeout" : "failed";

      await db
        .update(paymentsTable)
        .set({
          status: newStatus,
          resultCode: ResultCode,
          resultDesc: ResultDesc,
          updatedAt: new Date(),
        })
        .where(eq(paymentsTable.id, payment.id));

      logger.warn(
        { ResultCode, ResultDesc, paymentId: payment.id },
        "Mpesa payment failed"
      );
    }
  } catch (err) {
    logger.error({ err }, "Mpesa callback processing error");
  }
});

export default router;
