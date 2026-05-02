import { Router } from "express";
import { db } from "@workspace/db";
import { customersTable, ordersTable } from "@workspace/db";
import { eq, ilike, desc, sql, count } from "drizzle-orm";
import {
  ListCustomersQueryParams,
  GetCustomerParams,
  GetTopCustomersQueryParams,
  UpdateCustomerParams,
  UpdateCustomerBody,
} from "@workspace/api-zod";

const router = Router();

router.post("/customers", async (req, res) => {
  const { name, phone } = req.body as { name?: string; phone?: string };

  if (!phone || typeof phone !== "string" || phone.trim().length === 0) {
    res.status(400).json({ error: "phone is required" });
    return;
  }

  const cleaned = phone.replace(/\D/g, "");
  const whatsappPhone = cleaned.startsWith("0")
    ? "254" + cleaned.slice(1)
    : cleaned.startsWith("254")
    ? cleaned
    : "254" + cleaned;

  if (whatsappPhone.length < 12) {
    res.status(400).json({ error: "Invalid phone number — must be a valid Kenyan number" });
    return;
  }

  const [existing] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.whatsappPhone, whatsappPhone))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "A customer with this phone number already exists", customer: existing });
    return;
  }

  const [customer] = await db
    .insert(customersTable)
    .values({
      businessId: 1,
      whatsappPhone,
      name: name?.trim() || null,
    })
    .returning();

  res.status(201).json(customer);
});

router.get("/customers", async (req, res) => {
  const parsed = ListCustomersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { search, page = 1, limit = 50 } = parsed.data;

  const where = search ? ilike(customersTable.name, `%${search}%`) : undefined;

  const [customers, [{ total }]] = await Promise.all([
    db
      .select()
      .from(customersTable)
      .where(where)
      .orderBy(desc(customersTable.totalSpend))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(customersTable).where(where),
  ]);

  res.json({
    customers,
    meta: {
      total: Number(total),
      page,
      limit,
      totalPages: Math.ceil(Number(total) / limit),
    },
  });
});

router.get("/customers/stats/top", async (req, res) => {
  const parsed = GetTopCustomersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { by = "spend", limit = 10 } = parsed.data;

  const customers = await db
    .select()
    .from(customersTable)
    .orderBy(
      by === "spend"
        ? desc(sql`cast(${customersTable.totalSpend} as numeric)`)
        : desc(customersTable.totalOrders)
    )
    .limit(limit);

  res.json({
    customers,
    meta: {
      total: customers.length,
      page: 1,
      limit,
      totalPages: 1,
    },
  });
});

router.get("/customers/:id", async (req, res) => {
  const parsed = GetCustomerParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const [customer] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.id, parsed.data.id))
    .limit(1);

  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  const recentOrders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.customerId, customer.id))
    .orderBy(desc(ordersTable.createdAt))
    .limit(10);

  res.json({ ...customer, recentOrders });
});

router.patch("/customers/:id", async (req, res) => {
  const paramsParsed = UpdateCustomerParams.safeParse(req.params);
  const bodyParsed = UpdateCustomerBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const updates: Partial<typeof customersTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if ("name" in bodyParsed.data) updates.name = bodyParsed.data.name ?? null;

  const [updated] = await db
    .update(customersTable)
    .set(updates)
    .where(eq(customersTable.id, paramsParsed.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  res.json(updated);
});

export default router;
