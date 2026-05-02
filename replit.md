# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Shipped Features (Batch 14)

- **Internal Order Notes**: `internalNotes` text column on `ordersTable`; editable Staff Notes card on OrderDetailPage (Lock icon, textarea, Save button).
- **Broadcast Segments — VIP & New Customers**: `broadcastSegmentEnum` extended with `"vip"` and `"new_customers"`; BroadcastsPage SEGMENTS array includes both; backend switch filters customers by spend tier.
- **Item Count on Orders List**: Every order row in OrdersPage shows "N items" badge derived from `itemCount` field.

## Important Implementation Notes

- Zod schemas in `lib/api-zod/src/generated/api.ts` are manually edited (not code-generated). Mirror changes to `lib/api-client-react/src/generated/api.schemas.ts` AND `lib/api-client-react/dist/generated/api.schemas.d.ts`.
- `broadcastSegmentEnum` (Postgres pgEnum) now has 6 values: `all, recent, top_customers, loyal, vip, new_customers`. The Drizzle insert in `broadcasts.ts` casts back to the original 4 for Drizzle type compatibility; runtime is unaffected since the DB column accepts all 6.
- Business ID is hardcoded as `1`. WhatsApp sends are mocked via `logger.warn` when credentials are not configured.
