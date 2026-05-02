import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

export interface ParsedOrderItem {
  productName: string;
  quantity: number;
  unit: string;
  confidence: "high" | "medium" | "low";
  rawText: string;
}

export interface ParsedOrder {
  items: ParsedOrderItem[];
  isOrder: boolean;
  intent: "order" | "inquiry" | "complaint" | "greeting" | "other";
  language: "swahili" | "sheng" | "english" | "mixed";
  customerNote?: string;
}

export interface CatalogProduct {
  id: number;
  name: string;
  unit: string;
  basePrice: number;
  category: string;
}

const SYSTEM_PROMPT = `You are an AI assistant for a Kenyan shop (duka) that receives WhatsApp orders.
Your job is to parse customer messages and extract order information.

The customers speak Swahili, Sheng (Kenyan slang mixing Swahili and English), or English.

Common Swahili/Sheng order phrases:
- "nataka" = I want
- "niletee" / "niambie" = bring me / tell me
- "nipe" = give me
- "order" = order
- "nunua" = buy
- "kilo" / "kg" / "kgs" = kilogram
- "punde" / "saa hii" = right now / immediately
- "bei" = price
- "ngapi" = how much / how many
- Common shortenings: "unga" = flour, "mafuta" = cooking oil, "sukari" = sugar, "chumvi" = salt, "chai" = tea

Parse the message and return a JSON object with this exact structure:
{
  "isOrder": boolean,
  "intent": "order" | "inquiry" | "complaint" | "greeting" | "other",
  "language": "swahili" | "sheng" | "english" | "mixed",
  "items": [
    {
      "productName": string,  // normalize to English product name
      "quantity": number,
      "unit": string,         // normalize: pieces, kg, packets, bottles, tablets, capsules, etc.
      "confidence": "high" | "medium" | "low",
      "rawText": string       // the original text fragment referring to this item
    }
  ],
  "customerNote": string | null  // any special instructions (delivery notes, urgency, etc.)
}

Rules:
- If no quantity mentioned, default to 1
- If unit is unclear, infer from product type (medicine → tablets/capsules, food → kg/packet, liquid → litres/bottles)
- Match product names loosely: "unga" → "Ugali Unga", "panadol" → "Panadol Extra 500mg", "dettol" → "Dettol Soap"
- Confidence: high = explicit quantity + clear product, medium = quantity OR product is ambiguous, low = very unclear
- Always respond with valid JSON only, no markdown, no explanation`;

export async function parseOrderMessage(
  messageText: string,
  catalog: CatalogProduct[]
): Promise<ParsedOrder> {
  const catalogList = catalog
    .map((p) => `- ${p.name} (${p.category}, unit: ${p.unit}, price: KES ${p.basePrice})`)
    .join("\n");

  const userPrompt = `Available products in this shop:\n${catalogList}\n\nCustomer message: "${messageText}"\n\nParse this message and return JSON.`;

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        max_completion_tokens: 2048,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });

      const raw = (response.choices[0]?.message?.content || "").trim();
      if (!raw) {
        logger.warn({ attempt, messageText: messageText.slice(0, 80) }, "Empty response from AI, retrying");
        continue;
      }

      const parsed = JSON.parse(raw) as ParsedOrder;

      if (!parsed.items) parsed.items = [];
      if (!parsed.intent) parsed.intent = "other";
      if (!parsed.language) parsed.language = "mixed";
      if (parsed.isOrder === undefined) parsed.isOrder = parsed.items.length > 0;

      logger.info(
        { messageText: messageText.slice(0, 80), intent: parsed.intent, itemCount: parsed.items.length },
        "Order message parsed"
      );

      return parsed;
    } catch (err) {
      logger.error({ err, attempt, messageText: messageText.slice(0, 80) }, "Order parsing attempt failed");
      if (attempt === MAX_ATTEMPTS) {
        return { isOrder: false, intent: "other", language: "mixed", items: [] };
      }
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  return { isOrder: false, intent: "other", language: "mixed", items: [] };
}

export function matchCatalogProducts(
  parsedItems: ParsedOrderItem[],
  catalog: CatalogProduct[]
): Array<{
  parsedItem: ParsedOrderItem;
  catalogProduct: CatalogProduct | null;
  matched: boolean;
}> {
  return parsedItems.map((item) => {
    const nameLower = item.productName.toLowerCase();

    // Exact match first
    let match = catalog.find(
      (p) => p.name.toLowerCase() === nameLower
    );

    // Partial match
    if (!match) {
      match = catalog.find(
        (p) =>
          p.name.toLowerCase().includes(nameLower) ||
          nameLower.includes(p.name.toLowerCase().split(" ")[0])
      );
    }

    // Fuzzy: check if any word in the catalog name appears in the item name
    if (!match) {
      match = catalog.find((p) => {
        const words = p.name.toLowerCase().split(" ");
        return words.some((w) => w.length > 3 && nameLower.includes(w));
      });
    }

    return {
      parsedItem: item,
      catalogProduct: match ?? null,
      matched: Boolean(match),
    };
  });
}

export function generateUnrecognizedItemsReply(
  unmatched: ParsedOrderItem[]
): string {
  if (unmatched.length === 0) return "";
  const names = unmatched.map((i) => `"${i.productName}"`).join(", ");
  return (
    `\n\n⚠️ Sorry, we couldn't find ${names} in our catalog. ` +
    `Please check our product list or contact us for help.`
  );
}
