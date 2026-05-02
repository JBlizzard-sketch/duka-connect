import { Router } from "express";
import { db } from "@workspace/db";
import { paymentsTable, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { InitiatePaymentBody, GetPaymentParams, RecordCashPaymentBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router = Router();

function normalizeMpesaPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("0")) return "254" + cleaned.slice(1);
  if (cleaned.startsWith("254")) return cleaned;
  return "254" + cleaned;
}

async function getMpesaAccessToken(): Promise<string | null> {
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  if (!key || !secret) return null;

  try {
    const credentials = Buffer.from(`${key}:${secret}`).toString("base64");
    const env = process.env.MPESA_ENVIRONMENT || "sandbox";
    const baseUrl =
      env === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";

    const res = await fetch(
      `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${credentials}` } }
    );
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  } catch (err) {
    logger.error({ err }, "Failed to get Mpesa access token");
    return null;
  }
}

router.post("/payments/initiate", async (req, res) => {
  const parsed = InitiatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { orderId, phone } = parsed.data;

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const normalizedPhone = normalizeMpesaPhone(phone);
  const amount = Math.ceil(Number(order.totalAmount));
  const shortCode = process.env.MPESA_BUSINESS_SHORT_CODE || "174379";
  const passkey = process.env.MPESA_PASSKEY || "";
  const callbackUrl =
    process.env.MPESA_CALLBACK_URL || "https://example.com/api/webhooks/mpesa";

  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14);
  const password = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString("base64");

  // Insert payment record first (pending)
  const [payment] = await db
    .insert(paymentsTable)
    .values({
      orderId,
      amount: String(amount),
      status: "pending",
      mpesaPhone: normalizedPhone,
    })
    .returning();

  const accessToken = await getMpesaAccessToken();

  if (!accessToken) {
    // Dev mode: simulate STK push accepted
    logger.warn("No Mpesa credentials — simulating STK push");
    const mockCheckoutId = `DEV-${Date.now()}`;
    await db
      .update(paymentsTable)
      .set({ checkoutRequestId: mockCheckoutId, status: "processing" })
      .where(eq(paymentsTable.id, payment.id));

    res.json({
      paymentId: payment.id,
      checkoutRequestId: mockCheckoutId,
      message: "STK push simulated (no Mpesa credentials configured)",
    });
    return;
  }

  try {
    const env = process.env.MPESA_ENVIRONMENT || "sandbox";
    const baseUrl =
      env === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";

    const stkRes = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: shortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: normalizedPhone,
        PartyB: shortCode,
        PhoneNumber: normalizedPhone,
        CallBackURL: callbackUrl,
        AccountReference: `Order-${orderId}`,
        TransactionDesc: `Payment for Order #${orderId}`,
      }),
    });

    const stkData = (await stkRes.json()) as {
      CheckoutRequestID?: string;
      MerchantRequestID?: string;
      ResponseCode?: string;
      CustomerMessage?: string;
    };

    if (stkData.CheckoutRequestID) {
      await db
        .update(paymentsTable)
        .set({
          checkoutRequestId: stkData.CheckoutRequestID,
          merchantRequestId: stkData.MerchantRequestID,
          status: "processing",
        })
        .where(eq(paymentsTable.id, payment.id));

      res.json({
        paymentId: payment.id,
        checkoutRequestId: stkData.CheckoutRequestID,
        message: stkData.CustomerMessage || "STK push sent to your phone",
      });
    } else {
      await db
        .update(paymentsTable)
        .set({ status: "failed" })
        .where(eq(paymentsTable.id, payment.id));
      res.status(502).json({ error: "STK push failed", details: stkData });
    }
  } catch (err) {
    logger.error({ err }, "Mpesa STK push error");
    await db
      .update(paymentsTable)
      .set({ status: "failed" })
      .where(eq(paymentsTable.id, payment.id));
    res.status(502).json({ error: "Mpesa request failed" });
  }
});

router.post("/payments/cash", async (req, res) => {
  const parsed = RecordCashPaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { orderId, amount, notes } = parsed.data;

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const paymentAmount = amount ?? Number(order.totalAmount);

  const [payment] = await db
    .insert(paymentsTable)
    .values({
      orderId,
      amount: String(paymentAmount),
      status: "completed",
      resultDesc: notes ? `cash: ${notes}` : "cash",
      paidAt: new Date(),
    })
    .returning();

  await db
    .update(ordersTable)
    .set({ status: "paid", updatedAt: new Date() })
    .where(eq(ordersTable.id, orderId));

  logger.info({ orderId, paymentId: payment.id }, "Cash payment recorded");
  res.status(201).json(payment);
});

router.get("/payments/:id", async (req, res) => {
  const parsed = GetPaymentParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.id, parsed.data.id))
    .limit(1);

  if (!payment) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }
  res.json(payment);
});

export default router;
