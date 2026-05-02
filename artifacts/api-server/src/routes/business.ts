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
    whatsappBusinessAccountId: business.whatsappBusinessAccountId,
    whatsappApiTokenSet: !!business.whatsappApiToken,
    whatsappConnected: business.whatsappConnected,
    mpesaShortCode: business.mpesaShortCode,
    mpesaPasskeySet: !!business.mpesaPasskey,
    mpesaConsumerKeySet: !!business.mpesaConsumerKey,
    mpesaConnected: business.mpesaConnected,
    ownerPhone: business.ownerPhone,
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
    whatsappBusinessAccountId,
    whatsappApiToken,
    mpesaShortCode,
    mpesaPasskey,
    mpesaConsumerKey,
    mpesaConsumerSecret,
    ownerPhone,
    currency,
    timezone,
    logoUrl,
  } = parsed.data;

  const updates: Partial<typeof businessesTable.$inferInsert> = {};
  if (name !== undefined) updates.name = name;
  if (whatsappPhoneNumberId !== undefined) {
    updates.whatsappPhoneNumberId = whatsappPhoneNumberId;
  }
  if (whatsappBusinessAccountId !== undefined) {
    updates.whatsappBusinessAccountId = whatsappBusinessAccountId;
  }
  if (whatsappApiToken !== undefined) {
    updates.whatsappApiToken = whatsappApiToken;
    updates.whatsappConnected = true;
  }
  if (mpesaShortCode !== undefined) {
    updates.mpesaShortCode = mpesaShortCode;
  }
  if (mpesaPasskey !== undefined) {
    updates.mpesaPasskey = mpesaPasskey;
  }
  if (mpesaConsumerKey !== undefined) {
    updates.mpesaConsumerKey = mpesaConsumerKey;
  }
  if (mpesaConsumerSecret !== undefined) {
    updates.mpesaConsumerSecret = mpesaConsumerSecret;
  }
  // Mark Mpesa connected when all three creds are present
  if (ownerPhone !== undefined) updates.ownerPhone = ownerPhone;
  if (mpesaShortCode !== undefined || mpesaPasskey !== undefined || mpesaConsumerKey !== undefined || mpesaConsumerSecret !== undefined) {
    // Re-fetch to check combined state after update
    const current = await db.select().from(businessesTable).where(eq(businessesTable.id, BUSINESS_ID)).limit(1);
    const c = current[0];
    const effectiveShortCode = mpesaShortCode ?? c?.mpesaShortCode;
    const effectivePasskey = mpesaPasskey ?? c?.mpesaPasskey;
    const effectiveConsumerKey = mpesaConsumerKey ?? c?.mpesaConsumerKey;
    const effectiveConsumerSecret = mpesaConsumerSecret ?? c?.mpesaConsumerSecret;
    updates.mpesaConnected = !!(effectiveShortCode && effectivePasskey && effectiveConsumerKey && effectiveConsumerSecret);
  }
  if (currency !== undefined) updates.currency = currency;
  if (timezone !== undefined) updates.timezone = timezone;
  if (logoUrl !== undefined) updates.logoUrl = logoUrl;
  updates.updatedAt = new Date();

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
    whatsappBusinessAccountId: business.whatsappBusinessAccountId,
    whatsappApiTokenSet: !!business.whatsappApiToken,
    whatsappConnected: business.whatsappConnected,
    mpesaShortCode: business.mpesaShortCode,
    mpesaPasskeySet: !!business.mpesaPasskey,
    mpesaConsumerKeySet: !!business.mpesaConsumerKey,
    mpesaConnected: business.mpesaConnected,
    ownerPhone: business.ownerPhone,
    currency: business.currency,
    timezone: business.timezone,
    logoUrl: business.logoUrl,
    createdAt: business.createdAt,
  });
});

export default router;
