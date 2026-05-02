import { Router } from "express";
import { db } from "@workspace/db";
import { staffTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  InviteStaffBody,
  UpdateStaffBody,
  UpdateStaffParams,
  RemoveStaffParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/staff", async (req, res) => {
  const staff = await db
    .select()
    .from(staffTable)
    .where(eq(staffTable.businessId, 1));

  res.json({ staff });
});

router.post("/staff", async (req, res) => {
  const parsed = InviteStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { name, email, phone, role } = parsed.data;

  const [member] = await db
    .insert(staffTable)
    .values({
      businessId: 1,
      name,
      email,
      phone,
      role: role ?? "staff",
    })
    .returning();

  res.status(201).json(member);
});

router.patch("/staff/:id", async (req, res) => {
  const paramsParsed = UpdateStaffParams.safeParse(req.params);
  const bodyParsed = UpdateStaffBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const updates: Partial<typeof staffTable.$inferInsert> = {};
  if (bodyParsed.data.role !== undefined) updates.role = bodyParsed.data.role;
  if (bodyParsed.data.isActive !== undefined) updates.isActive = bodyParsed.data.isActive;
  updates.updatedAt = new Date();

  const [updated] = await db
    .update(staffTable)
    .set(updates)
    .where(eq(staffTable.id, paramsParsed.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }
  res.json(updated);
});

router.delete("/staff/:id", async (req, res) => {
  const parsed = RemoveStaffParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  await db.delete(staffTable).where(eq(staffTable.id, parsed.data.id));
  res.status(204).end();
});

export default router;
