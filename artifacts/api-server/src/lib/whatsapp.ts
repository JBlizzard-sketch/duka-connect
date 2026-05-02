import { logger } from "./logger";

const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_API_VERSION = "v20.0";
const BASE_URL = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

export type WhatsAppMessageResult =
  | { success: true; messageId: string }
  | { success: false; error: string };

function isConfigured(): boolean {
  return Boolean(WHATSAPP_API_TOKEN && WHATSAPP_PHONE_NUMBER_ID);
}

export async function sendTextMessage(
  to: string,
  text: string
): Promise<WhatsAppMessageResult> {
  if (!isConfigured()) {
    logger.warn(
      { to, text: text.slice(0, 60) },
      "[WhatsApp MOCK] sendTextMessage — credentials not configured"
    );
    return { success: true, messageId: `mock-${Date.now()}` };
  }

  try {
    const res = await fetch(
      `${BASE_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { preview_url: false, body: text },
        }),
      }
    );

    const data = (await res.json()) as {
      messages?: Array<{ id: string }>;
      error?: { message: string };
    };

    if (!res.ok || data.error) {
      const msg = data.error?.message ?? `HTTP ${res.status}`;
      logger.error({ to, msg }, "WhatsApp send failed");
      return { success: false, error: msg };
    }

    const messageId = data.messages?.[0]?.id ?? "unknown";
    logger.info({ to, messageId }, "WhatsApp message sent");
    return { success: true, messageId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ to, error }, "WhatsApp send error");
    return { success: false, error };
  }
}

export async function sendTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string,
  components: unknown[] = []
): Promise<WhatsAppMessageResult> {
  if (!isConfigured()) {
    logger.warn(
      { to, templateName },
      "[WhatsApp MOCK] sendTemplateMessage — credentials not configured"
    );
    return { success: true, messageId: `mock-${Date.now()}` };
  }

  try {
    const res = await fetch(
      `${BASE_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            components,
          },
        }),
      }
    );

    const data = (await res.json()) as {
      messages?: Array<{ id: string }>;
      error?: { message: string };
    };

    if (!res.ok || data.error) {
      const msg = data.error?.message ?? `HTTP ${res.status}`;
      logger.error({ to, templateName, msg }, "WhatsApp template send failed");
      return { success: false, error: msg };
    }

    const messageId = data.messages?.[0]?.id ?? "unknown";
    return { success: true, messageId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}

export function buildOrderConfirmation(
  customerName: string,
  orderRef: string,
  items: Array<{ name: string; quantity: number; unit: string; totalPrice: number }>,
  totalAmount: number
): string {
  const greeting = customerName ? `Habari ${customerName}! 👋` : "Habari! 👋";
  const itemLines = items
    .map((i) => `  • ${i.name} x${i.quantity} ${i.unit} — KES ${i.totalPrice.toLocaleString()}`)
    .join("\n");

  return (
    `${greeting}\n\n` +
    `✅ *Order Confirmed!*\n` +
    `Order #${orderRef}\n\n` +
    `*Items:*\n${itemLines}\n\n` +
    `*Total: KES ${totalAmount.toLocaleString()}*\n\n` +
    `Tutakufikia haraka. Asante kwa kuorder! 🙏\n` +
    `_(We'll reach you shortly. Thank you for your order!)_`
  );
}

export function buildOrderStatusUpdate(
  customerName: string,
  orderRef: string,
  status: string
): string {
  const statusMessages: Record<string, string> = {
    confirmed: "✅ Your order has been confirmed and is being prepared.",
    paid: "💚 Payment received! Your order is being processed.",
    processing: "👨‍🍳 Your order is being prepared.",
    ready: "📦 Your order is ready for pickup/delivery!",
    delivered: "🎉 Order delivered! Asante kwa kuorder.",
    cancelled: "❌ Your order has been cancelled. Please contact us for assistance.",
  };

  const msg = statusMessages[status] ?? `Your order status: ${status}`;
  const greeting = customerName ? `Habari ${customerName}! ` : "Habari! ";
  return `${greeting}Order #${orderRef}: ${msg}`;
}

export function buildPaymentRequest(
  customerName: string,
  orderRef: string,
  amount: number,
  phone: string
): string {
  const greeting = customerName ? `Habari ${customerName}! ` : "Habari! ";
  return (
    `${greeting}💰 *Payment Request*\n\n` +
    `Order #${orderRef}\n` +
    `Amount: *KES ${amount.toLocaleString()}*\n\n` +
    `An Mpesa STK push has been sent to *${phone}*.\n` +
    `Please enter your Mpesa PIN to complete payment. ✅`
  );
}
