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

## Shipped Features (Batch 25)

- **Mark conversation as read**: `last_read_at` timestamp column added to `customersTable` (DB migrated). New `PATCH /api/messages/thread/:customerId/mark-read` endpoint sets `lastReadAt = now()`. `GET /api/messages/conversations` now fetches `lastReadAt` per customer and computes `hasUnread` (true when last inbound message is newer than `lastReadAt` or never read). `GET /api/messages/stats` adds `unreadConversations` count via a correlated subquery. `Layout.tsx` inbox badge reads `unreadConversations` (fallback to `recentInbound`). MessagesPage `selectConversation()` fires the mark-read mutation on open and the pulsing orange dot now reflects `hasUnread` (persistent read-state) instead of the message direction.
- **Product SKU / Barcode field**: `sku` varchar already existed on `productsTable`; now exposed in Add Product and Edit Product dialogs ("SKU / Barcode (optional)" field). Passed as `sku` in `createProduct` / `updateProduct` mutate calls. Displayed on product cards in monospace below category when set.
- **Customer Average Order Value**: Customer detail sheet stats grid changed from 3-column to 2×2. A new "Avg Order Value" tile computes `totalSpend / totalOrders` client-side (shows "—" for customers with no orders yet). The existing Orders / Total Spend / Loyalty tiles are preserved.

## Shipped Features (Batch 24)

- **Top Products: per-product margin badge**: `GET /api/analytics/top-products` now left-joins `productsTable` to get `costPrice` and computes `avgUnitPrice` per product. Response includes `marginPct` (integer %, null when no costPrice set). AnalyticsPage shows a colour-coded pill badge (green ≥30%, amber ≥10%, red <10%) next to the revenue for each product row; hidden when margin is unknown.
- **Payment Methods breakdown**: New `GET /api/analytics/payment-methods` endpoint left-joins `paymentsTable` (status=completed) to derive method — orders with a completed payment record → "mpesa", others → "cash". Returns `{ data: [{method, orderCount, revenue}] }`. AnalyticsPage shows a new card with a proportional stacked bar + colour-coded legend rows (green=M-Pesa, amber=Cash) showing order count, % share, and KES revenue.
- **Staff Performance leaderboard**: New `GET /api/analytics/staff-performance` endpoint inner-joins `staffTable` on `assignedToId`, counting orders in active/completed statuses per staff member ordered by count desc. AnalyticsPage shows a new card with ranked rows, progress bars (violet), order count, and revenue per staff. Shows empty-state when no orders are assigned.

## Shipped Features (Batch 23)

- **Analytics: Gross Profit KPI card**: `GET /api/analytics/summary` now runs a 6th parallel query joining `orderItemsTable → productsTable` on `productId`, computing `sum(quantity × (unitPrice − costPrice))` for paid orders where `costPrice is not null`. Response includes `grossProfit` and `profitMarginPct` (null when no cost prices exist). AnalyticsPage shows a 6th "GROSS PROFIT" card in a 6-column grid; shows `—` with a "Set cost prices" sub-label until cost prices are entered, then shows KES amount + margin %.
- **Order: editable delivery fee**: New `PATCH /api/orders/:id/delivery-fee` endpoint accepts `{ deliveryFee }`, recomputes `totalAmount = itemsTotal − discount + fee`, persists the update, and logs a `delivery_updated` event. `DeliveryFeeEditor` component on OrderDetailPage replaces the static display — shows current fee + an "Edit" / "Add fee" button (hidden for delivered/cancelled/paid). Inline editor has KES input, ✓/✗ buttons, Enter/Escape key shortcuts.
- **Broadcasts: schedule send UI**: `NewBroadcastDialog` now has a `datetime-local` input labelled "Schedule (optional)" below the message composer. When a future time is set, a sub-label shows the formatted send time, the send button label changes to "Schedule Broadcast", and the toast says "Broadcast scheduled". The selected datetime is passed as `scheduleAt` in the POST body (backend already supported this field).

## Shipped Features (Batch 22)

- **Product cost price + margin tracking**: New optional `cost_price` column on `products` table (DB migrated). Add/Edit Product dialogs include a "Cost Price (KES)" field; a live margin preview line ("Margin: X% · Profit: KES Y per unit") appears as you type. Each product card shows a colour-coded margin badge once costPrice is set (green ≥30%, amber ≥10%, red <10%) in place of the stock-value line.
- **WhatsApp restock alert button**: `POST /api/products/restock-alert` endpoint aggregates all low-stock products, formats a WhatsApp message (item · current/threshold · restock qty · cost), and sends to the owner's WhatsApp number (logged if not configured). A green "Send alert" button with WhatsApp icon appears in the amber low-stock banner on InventoryPage. Toast confirms send or shows a "configure owner phone" prompt.

## Shipped Features (Batch 21)

- **Order detail: manual discount**: Items card total row now has an "Add discount" button (hidden for delivered/cancelled/paid). Clicking opens an inline KES number input. On Apply: calls `PATCH /api/orders/:id/discount`, which recomputes `totalAmount = itemsTotal − discount + deliveryFee`, persists `discountAmount` on the order (new `discount_amount` numeric column in `ordersTable`), and logs a `discount_applied` event. If a discount already exists an "Edit discount" label is shown instead. The discount row appears in the receipt breakdown in green (− KES X) when active.
- **Inventory: restock cost estimate**: Low-stock product cards now show a second line under the amber "Low stock" badge: "Restock N unit · KES Y" where N = threshold − currentStock and Y = N × basePrice. Gives the owner an instant cost-to-restock figure while reviewing inventory.
- **Inbox unread badge**: Conversation list items where `lastMessageDirection === "inbound"` now show a small pulsing orange dot next to the timestamp and render the last-message preview in full-weight text. Indicates the customer messaged last and is awaiting a reply, making it immediately obvious which threads need attention.

## Shipped Features (Batch 20)

- **Order items inline editor**: Items card on OrderDetailPage now has an "Edit" button (shown for orders not in delivered/cancelled/paid state). Clicking enters edit mode: each item gets `[−] qty [+]` steppers; setting qty to 0 strikes through (removes on save). "Save changes" calls new `PATCH /api/orders/:id/items` backend endpoint which updates quantities/totals per item and recalculates `totalAmount`. An `items_edited` event is logged to `orderEventsTable`. Edit is blocked for delivered and cancelled orders.
- **Dashboard: Ready for Pickup panel**: New `ReadyOrdersPanel` component (green card, refetches every 30s) shows orders with status `ready` waiting for customer pickup. Appears between Stale Orders and Needs Attention panels. Each row links to the order detail. Hidden when no ready orders exist. Completes the kitchen display workflow: Stale (red) → Ready (green) → Needs Attention (orange).

## Shipped Features (Batch 19)

- **Broadcast segment preview count**: New `GET /api/broadcasts/segment-preview` endpoint returns customer count for each of the 6 segments using the same filter logic as the POST handler. In `NewBroadcastDialog`, the query fires when the dialog opens (lazy, stale 60s) and the counts appear as small pill badges beside each segment chip label (hidden until loaded).
- **Analytics: real Repeat Buyers metric**: The `GET /api/analytics/summary` handler now includes a 5th query: customers who placed ≥2 orders in the selected period (grouped by `customerId`, HAVING count ≥ 2). The result replaces the hardcoded `repeatCustomers: 0`. The Analytics page adds a 5th stat card "REPEAT BUYERS" in a 5-column grid.
- **At-risk customers alert**: New `GET /api/customers/at-risk` endpoint returns customers with `totalOrders ≥ 3` AND `lastOrderAt < 30 days ago` (ordered by lastOrderAt desc, limit 20). The Customers page shows an orange alert card above the main list when at-risk customers exist, with clickable pill buttons for each customer (opens their sheet) and a count for overflow. Card is hidden when no at-risk customers.

## Shipped Features (Batch 18)

- **Orders list: delivery + notes badges**: The orders list SELECT now includes `deliveryAddress` and `internalNotes`. Each order row shows a blue 🚚 Truck icon (with delivery address in tooltip) when a delivery address is set, and an amber 💬 MessageSquare icon when the order has staff or customer notes (excluding the embedded WA ref code). Icons appear inline between the WA ref and the status badge.
- **Inventory: inline quick stock ±1**: Each product card now shows `[−] {stock} [+]` inline buttons around the stock count. Clicking `[−]`/`[+]` calls the new `PATCH /api/products/:id/stock` endpoint (which finds the default/first variant and applies `stockAdjustment ±1`, min 0). Cache is invalidated immediately. The `[−]` button is disabled at 0 stock. No dialog required for single-unit adjustments.
- **Inventory: stock value per card**: The price section of each product card now shows `KES X value` (totalStock × basePrice) below the unit price, giving the owner an at-a-glance view of inventory value tied up in each product.

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
