import { Router } from "express";
import { db } from "@workspace/db";
import {
  customersTable,
  ordersTable,
  orderItemsTable,
  paymentsTable,
  whatsappMessagesTable,
  productsTable,
  productVariantsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendTextMessage, buildOrderConfirmation } from "../lib/whatsapp";
import {
  parseOrderMessage,
  matchCatalogProducts,
  generateUnrecognizedItemsReply,
} from "../lib/orderParser";

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
  res.json({ ok: true });
  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") return;
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;
        for (const message of change.value.messages || []) {
          await processInboundMessage(message, change.value.metadata);
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "WhatsApp webhook processing error");
  }
});

async function processInboundMessage(
  message: Record<string, unknown>,
  _metadata: { phone_number_id: string }
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
    const contactName = String(
      (message.contacts as Array<{ profile: { name: string } }>)?.[0]
        ?.profile?.name ?? ""
    );
    [customer] = await db
      .insert(customersTable)
      .values({
        businessId: 1,
        whatsappPhone: phone,
        whatsappName: contactName,
        name: contactName || null,
      })
      .returning();
    logger.info({ phone, contactName }, "New customer created from WhatsApp");
  }

  const isOrderMsg = body ? isLikelyOrderMessage(body) : false;

  await db.insert(whatsappMessagesTable).values({
    businessId: 1,
    customerId: customer.id,
    whatsappMessageId: messageId,
    direction: "inbound",
    messageType,
    body,
    rawPayload: JSON.stringify(message),
    isOrderMessage: isOrderMsg,
  });

  logger.info(
    { phone, messageType, body: body?.slice(0, 100), isOrderMsg },
    "WhatsApp message received"
  );

  if (body && isOrderMsg) {
    await handleOrderMessage(customer, phone, body);
  } else if (body) {
    await handleGeneralMessage(customer, phone, body);
  }
}

async function handleOrderMessage(
  customer: typeof customersTable.$inferSelect,
  phone: string,
  text: string
) {
  try {
    const catalog = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        unit: productsTable.unit,
        basePrice: productsTable.basePrice,
        category: productsTable.category,
      })
      .from(productsTable)
      .where(eq(productsTable.isActive, true));

    const catalogMapped = catalog.map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit ?? "piece",
      basePrice: Number(p.basePrice),
      category: p.category ?? "General",
    }));

    const parsed = await parseOrderMessage(text, catalogMapped);

    if (!parsed.isOrder || parsed.items.length === 0) {
      const reply = buildNonOrderReply(parsed.intent);
      await sendAndLogMessage(phone, customer.id, reply);
      return;
    }

    const matched = matchCatalogProducts(parsed.items, catalogMapped);
    const recognizedMatches = matched.filter((m) => m.matched && m.catalogProduct);
    const unrecognized = matched.filter((m) => !m.matched).map((m) => m.parsedItem);

    if (recognizedMatches.length === 0) {
      const reply =
        `Samahani, sikuweza kutambua bidhaa uliyoomba. 😔\n` +
        `(Sorry, I couldn't identify the products you requested.)\n\n` +
        `Tafadhali tuma jina la bidhaa sahihi, au tupigie simu kwa msaada.`;
      await sendAndLogMessage(phone, customer.id, reply);
      return;
    }

    const productIds = recognizedMatches.map((m) => m.catalogProduct!.id);
    const variants = await db
      .select()
      .from(productVariantsTable)
      .where(
        sql`${productVariantsTable.productId} = ANY(ARRAY[${sql.join(
          productIds.map((id) => sql`${id}`),
          sql`, `
        )}]::int[])`
      );

    const variantByProduct: Record<number, typeof productVariantsTable.$inferSelect> = {};
    for (const v of variants) {
      if (!variantByProduct[v.productId]) variantByProduct[v.productId] = v;
    }

    let totalAmount = 0;
    const orderItems: Array<{
      productId: number;
      variantId: number | null;
      productName: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      totalPrice: number;
    }> = [];

    for (const match of recognizedMatches) {
      const product = match.catalogProduct!;
      const qty = match.parsedItem.quantity;
      const variant = variantByProduct[product.id];
      const variantPrice = variant ? Number(variant.price) : 0;
      const unitPrice = variantPrice > 0 ? variantPrice : product.basePrice;
      const totalPrice = unitPrice * qty;
      totalAmount += totalPrice;

      orderItems.push({
        productId: product.id,
        variantId: variant?.id ?? null,
        productName: product.name,
        quantity: qty,
        unit: match.parsedItem.unit || product.unit,
        unitPrice,
        totalPrice,
      });
    }

    const orderRef = `WA-${Date.now().toString(36).toUpperCase()}`;
    const noteText = [
      `[WhatsApp order: ${orderRef}]`,
      parsed.customerNote,
    ]
      .filter(Boolean)
      .join(" — ");

    const [order] = await db
      .insert(ordersTable)
      .values({
        businessId: 1,
        customerId: customer.id,
        status: "pending",
        totalAmount: String(totalAmount),
        rawMessage: text,
        notes: noteText,
      })
      .returning();

    await db.insert(orderItemsTable).values(
      orderItems.map((item) => ({
        orderId: order.id,
        productId: item.productId,
        variantId: item.variantId,
        productName: item.productName,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: String(item.unitPrice),
        totalPrice: String(item.totalPrice),
      }))
    );

    await db
      .update(customersTable)
      .set({
        totalOrders: sql`${customersTable.totalOrders} + 1`,
        totalSpend: sql`${customersTable.totalSpend} + ${totalAmount}`,
        lastOrderAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(customersTable.id, customer.id));

    logger.info(
      {
        orderId: order.id,
        orderRef,
        customerId: customer.id,
        totalAmount,
        itemCount: orderItems.length,
      },
      "Auto-created order from WhatsApp"
    );

    const confirmationText = buildOrderConfirmation(
      customer.name ?? customer.whatsappName ?? "",
      orderRef,
      orderItems.map((i) => ({
        name: i.productName,
        quantity: i.quantity,
        unit: i.unit,
        totalPrice: i.totalPrice,
      })),
      totalAmount
    );
    const unrecognizedNote = generateUnrecognizedItemsReply(unrecognized);
    await sendAndLogMessage(phone, customer.id, confirmationText + unrecognizedNote);
  } catch (err) {
    logger.error({ err, phone }, "Error handling order message");
    const errorReply =
      `Samahani, kulikuwa na tatizo la kupokea order yako. 😔\n` +
      `(Sorry, there was an error processing your order.)\n` +
      `Tafadhali jaribu tena au tupigie simu.`;
    await sendAndLogMessage(phone, customer.id, errorReply);
  }
}

async function handleGeneralMessage(
  customer: typeof customersTable.$inferSelect,
  phone: string,
  text: string
) {
  const lower = text.toLowerCase().trim();
  let reply: string | null = null;

  if (/^(hi|hello|habari|mambo|hujambo|sasa|niaje|hey)[\s!?]*$/.test(lower)) {
    const name = customer.name ?? customer.whatsappName ?? "";
    reply = name
      ? `Habari ${name}! 👋 Karibu Duka. Unaweza kuorder nini leo?\n(Hi ${name}! Welcome. What can we get you today?)`
      : `Habari! 👋 Karibu Duka. Unaweza kuorder nini leo?\n(Hi! Welcome. What can we order for you today?)`;
  } else if (lower.includes("bei") || lower.includes("price") || lower.includes("ngapi")) {
    reply =
      `Tuma jina la bidhaa unayotaka kujua bei yake. 😊\n` +
      `(Send the product name you'd like to know the price of.)`;
  } else if (lower.includes("order yangu") || lower.includes("my order")) {
    reply =
      `Tuma namba ya order yako ili tukusaidie (mfano: WA-ABC123).\n` +
      `(Send your order number so we can help, e.g. WA-ABC123.)`;
  }

  if (reply) {
    await sendAndLogMessage(phone, customer.id, reply);
  }
}

async function sendAndLogMessage(
  phone: string,
  customerId: number,
  text: string
) {
  const result = await sendTextMessage(phone, text);
  const msgId = result.success ? result.messageId : null;

  await db.insert(whatsappMessagesTable).values({
    businessId: 1,
    customerId,
    whatsappMessageId: msgId ?? `local-${Date.now()}`,
    direction: "outbound",
    messageType: "text",
    body: text,
    rawPayload: JSON.stringify({ to: phone, text }),
    isOrderMessage: false,
  });
}

function isLikelyOrderMessage(text: string): boolean {
  const orderKeywords = [
    "order", "nataka", "niletee", "nipe", "nunua", "send", "deliver",
    "kilo", "piece", "kgs", "packets", "bottles", "tablets", "capsules",
    "naomba", "nipeleke", "tuma", "lete",
  ];
  const lower = text.toLowerCase();
  return orderKeywords.some((kw) => lower.includes(kw));
}

function buildNonOrderReply(intent: string): string {
  switch (intent) {
    case "inquiry":
      return `Habari! 😊 Unauliza kuhusu nini? Tuma jina la bidhaa na tutakusaidia.\n(Hi! What are you asking about? Send the product name and we'll help.)`;
    case "complaint":
      return `Samahani kwa tatizo! 🙏 Tutawasiliana nawe haraka.\n(Sorry for the inconvenience! We'll get back to you shortly.)`;
    case "greeting":
      return `Habari! 👋 Karibu Duka. Unaweza kuorder nini leo?\n(Hello! Welcome. What can we order for you today?)`;
    default:
      return `Habari! 😊 Tunaweza kukusaidia vipi?\n(Hello! How can we help you?)`;
  }
}

// Mpesa STK push callback
router.post("/webhooks/mpesa", async (req, res) => {
  res.json({ ok: true });

  try {
    const callback = req.body?.Body?.stkCallback;
    if (!callback) return;

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callback;

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

      await db
        .update(ordersTable)
        .set({ status: "paid", updatedAt: new Date() })
        .where(eq(ordersTable.id, payment.orderId));

      // Notify customer on WhatsApp
      const [order] = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, payment.orderId))
        .limit(1);

      if (order) {
        const [cust] = await db
          .select()
          .from(customersTable)
          .where(eq(customersTable.id, order.customerId))
          .limit(1);

        if (cust) {
          const msg =
            `💚 *Payment Confirmed!*\n` +
            `Order #${order.id}\n` +
            `Receipt: ${meta["MpesaReceiptNumber"]}\n` +
            `Amount: KES ${Number(payment.amount).toLocaleString()}\n\n` +
            `Asante! Tutakuandalia order yako sasa. 🙏\n` +
            `(Thank you! We're preparing your order now.)`;
          await sendAndLogMessage(cust.whatsappPhone, cust.id, msg);
        }
      }

      logger.info(
        { paymentId: payment.id, receipt: meta["MpesaReceiptNumber"] },
        "Mpesa payment completed"
      );
    } else {
      const newStatus =
        ResultCode === 1032 ? "cancelled"
        : ResultCode === 1037 ? "timeout"
        : "failed";

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
