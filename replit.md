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

## Shipped Features (Batch 17)

- **Category filter chips in NewOrderDialog**: When on the items step, pill/chip buttons appear above the product grid for each product category (only shown when 2+ categories exist). Clicking a chip filters the product list to that category; clicking again or pressing "All" resets it. Works alongside the existing text search. State resets when the dialog closes.
- **Reorder last order (Customer sheet)**: "Reorder last" link button appears in the Recent Orders section header. Clicking it fetches `/api/orders/:id` for the most recent order, maps the items to LineItem format, and opens NewOrderDialog pre-filled with those items and the customer pre-selected. `NewOrderDialog` now accepts an `initialItems?: LineItem[]` prop that seeds the cart on open.
- **Stale Orders panel on Dashboard**: `StaleOrdersPanel` component fetches confirmed + preparing orders and filters those created > 2 hours ago. Renders a red-bordered card above the existing Needs Attention (pending) panel. Each row shows hours-old age, current status, and an action button — "Start Prep" (confirmed→preparing) or "Mark Ready" (preparing→ready). Disappears when no stale orders exist. Refetches every 60 s.

## Shipped Features (Batch 16)

- **Order Activity Timeline**: New `order_events` DB table records every status change, delivery address update, note edit, internal note, and staff assignment. `GET /api/orders/:id/events` endpoint returns ordered history. OrderDetailPage shows a vertical timeline at the bottom (hidden when no events). Color-coded dots per event type; status_change entries show from→to pill.
- **Revenue by Category**: New `GET /api/analytics/revenue-by-category?period=` endpoint groups paid order_items by product category. AnalyticsPage shows a horizontal bar chart with order count + KES per category. Only visible when data exists.
- **Send Daily Report button**: Analytics page header now has a "Send Daily Report" button that calls `POST /api/analytics/daily-report`. Shows a toast on success/failure. Sits alongside the period selector pills.

## Shipped Features (Batch 15)

- **Inventory: Low-stock alert banner** — Amber banner appears above search bar when any product stock ≤ lowStockThreshold. "View low stock" button activates the existing low-stock filter.
- **Order Detail: Editable delivery address** — Delivery card now always visible (not hidden). Inline "Add address"/"Edit" button saves via PATCH `/api/orders/:id` with new `deliveryAddress` field.
- **Customer sheet: "View Orders" link** — Orders button in customer detail sheet navigates to `/orders?search=<phone>`. OrdersPage now reads `?search=` from URL on mount to pre-populate the search.

## Shipped Features (Batch 14)

- **Internal Order Notes**: `internalNotes` text column on `ordersTable`; editable Staff Notes card on OrderDetailPage (Lock icon, textarea, Save button).
- **Broadcast Segments — VIP & New Customers**: `broadcastSegmentEnum` extended with `"vip"` and `"new_customers"`; BroadcastsPage SEGMENTS array includes both; backend switch filters customers by spend tier.
- **Item Count on Orders List**: Every order row in OrdersPage shows "N items" badge derived from `itemCount` field.

## Important Implementation Notes

- Zod schemas in `lib/api-zod/src/generated/api.ts` are manually edited (not code-generated). Mirror changes to `lib/api-client-react/src/generated/api.schemas.ts` AND `lib/api-client-react/dist/generated/api.schemas.d.ts`.
- `broadcastSegmentEnum` (Postgres pgEnum) now has 6 values: `all, recent, top_customers, loyal, vip, new_customers`. The Drizzle insert in `broadcasts.ts` casts back to the original 4 for Drizzle type compatibility; runtime is unaffected since the DB column accepts all 6.
- Business ID is hardcoded as `1`. WhatsApp sends are mocked via `logger.warn` when credentials are not configured.
