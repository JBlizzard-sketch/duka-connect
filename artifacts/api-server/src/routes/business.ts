import { Router } from "express";
import { db } from "@workspace/db";
import { businessesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateBusinessProfileBody } from "@workspace/api-zod";

const BUSINESS_ID = 1;

const router = Router();

router.get("/business/profile", async (req, res) => {
  let [business] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.id, BUSINESS_ID))
    .limit(1);

  if (!business) {
    // Auto-create default business
    [business] = await db
      .insert(businessesTable)
      .values({
        name: "My Duka",
        currency: "KES",
        timezone: "Africa/Nairobi",
      })
      .returning();
  }

  res.json({
    id: business.id,
    name: business.name,
    whatsappPhoneNumberId: business.whatsappPhoneNumberId,
    whatsappConnected: business.whatsappConnected,
    mpesaShortCode: business.mpesaShortCode,
    mpesaConnected: business.mpesaConnected,
    currency: business.currency,
    timezone: business.timezone,
    logoUrl: business.logoUrl,
    createdAt: business.createdAt,
  });
});

router.patch("/business/profile", async (req, res) => {
  const parsed = UpdateBusinessProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const {
    name,
    whatsappPhoneNumberId,
    mpesaShortCode,
    currency,
    timezone,
    logoUrl,
  } = parsed.data;

  const updates: Partial<typeof businessesTable.$inferInsert> = {};
  if (name !== undefined) updates.name = name;
  if (whatsappPhoneNumberId !== undefined) {
    updates.whatsappPhoneNumberId = whatsappPhoneNumberId;
    updates.whatsappConnected = true;
  }
  if (mpesaShortCode !== undefined) {
    updates.mpesaShortCode = mpesaShortCode;
    updates.mpesaConnected = true;
  }
  if (currency !== undefined) updates.currency = currency;
  if (timezone !== undefined) updates.timezone = timezone;
  if (logoUrl !== undefined) updates.logoUrl = logoUrl;
  updates.updatedAt = new Date();

  // Upsert
  let [business] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.id, BUSINESS_ID))
    .limit(1);

  if (!business) {
    [business] = await db
      .insert(businessesTable)
      .values({ name: "My Duka", ...updates })
      .returning();
  } else {
    [business] = await db
      .update(businessesTable)
      .set(updates)
      .where(eq(businessesTable.id, BUSINESS_ID))
      .returning();
  }

  res.json({
    id: business.id,
    name: business.name,
    whatsappPhoneNumberId: business.whatsappPhoneNumberId,
    whatsappConnected: business.whatsappConnected,
    mpesaShortCode: business.mpesaShortCode,
    mpesaConnected: business.mpesaConnected,
    currency: business.currency,
    timezone: business.timezone,
    logoUrl: business.logoUrl,
    createdAt: business.createdAt,
  });
});

export default router;
