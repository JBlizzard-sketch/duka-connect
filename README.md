# WhatsApp Order Management System
### Built for Nairobi SMEs — Pharmacies, Butcheries, Grocers, Boutiques & More

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-24-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue.svg)](https://www.postgresql.org/)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-orange.svg)](https://pnpm.io/)

---

## Overview

Thousands of small businesses in Nairobi already run their orders through WhatsApp. Customers message to ask about stock, place orders, and request prices — but the shop owner manages it all from a single chaotic inbox with no record-keeping, no inventory tracking, and no payment confirmation.

**This system fixes that.**

It connects to a business's WhatsApp Business account and turns incoming order messages into structured order records — automatically. The shop owner gets a clean web dashboard showing all open orders, inventory levels, and daily revenue. When an order comes in, the system auto-replies with a confirmation and an Mpesa STK push. When payment is confirmed, the order moves to "paid" and inventory is decremented automatically.

**Core loop:**
```
Customer messages → AI parses order → Confirmation sent → Mpesa STK pushed → Payment confirmed → Inventory decremented → Owner notified
```

---

## Key Features

| Feature | Description |
|---|---|
| **AI Order Parsing** | Handles Swahili, Sheng, and mixed-language messages — "niletee kilo moja nyama na bread mbili" parses correctly |
| **Mpesa STK Push** | Full STK push flow with timeout, failure, and retry handling |
| **WhatsApp Cloud API** | Meta's official API — real-time webhooks, template messages, catalogue sharing |
| **Live Dashboard** | Mobile-first dashboard showing orders, inventory, and revenue in real time |
| **Inventory Management** | Variants (size, colour, weight), low-stock alerts, and supplier reorder workflows |
| **Customer Loyalty** | Loyalty tracker built from WhatsApp order history |
| **Multi-staff Access** | Two employees can manage orders simultaneously without collisions |
| **End-of-day Reports** | Automatic daily summary sent to owner's WhatsApp |
| **Broadcast Messages** | Send promotions and stock availability to customer lists |
| **Analytics** | Best-selling items, peak order times, top customers, revenue trends |

---

## Tech Stack

### Backend
- **Runtime**: Node.js 24 (TypeScript 5.9)
- **Framework**: Express 5
- **Database**: PostgreSQL 15 + Drizzle ORM
- **Validation**: Zod (v4) + drizzle-zod
- **API**: OpenAPI 3.1 spec → Orval codegen (React Query hooks + Zod schemas)
- **Message Queue**: Redis + BullMQ (for high-volume WhatsApp webhook processing)
- **AI**: OpenAI GPT-4o (multilingual order parsing)
- **Build**: esbuild (CJS bundle), Docker-ready

### Frontend
- **Framework**: React 18 + Vite
- **Styling**: Tailwind CSS + shadcn/ui
- **State**: TanStack Query (React Query)
- **Charts**: Recharts
- **Auth**: Clerk

### External Services
- **WhatsApp**: Meta WhatsApp Cloud API (Business API)
- **Payments**: Safaricom Mpesa Daraja API (STK Push + C2B callbacks)
- **Notifications**: WhatsApp Business API (owner alerts)

### Infrastructure
- **Backend hosting**: Railway (Node.js)
- **Frontend hosting**: Vercel
- **Database**: Railway PostgreSQL or Supabase
- **Container**: Docker (for VPS deployment at scale)

---

## Monorepo Structure

```
whatsapp-order-management/
├── artifacts/
│   ├── api-server/           # Express API — webhook handler, routes, Mpesa callbacks
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── index.ts
│   │   │   ├── routes/       # All API route handlers
│   │   │   ├── middlewares/  # Auth, logging, rate limiting
│   │   │   └── lib/          # Logger, utilities
│   │   └── package.json
│   ├── dashboard/            # React + Vite owner dashboard (Phase 3+)
│   └── mockup-sandbox/       # UI design prototyping (Canvas)
├── lib/
│   ├── api-spec/             # OpenAPI 3.1 spec (source of truth)
│   │   └── openapi.yaml
│   ├── api-client-react/     # Generated React Query hooks
│   ├── api-zod/              # Generated Zod validation schemas
│   └── db/                   # Drizzle ORM schema + migrations
├── scripts/                  # Utility scripts (seed, push-to-github, etc.)
├── pnpm-workspace.yaml       # Workspace config + catalog pins
├── tsconfig.base.json        # Shared TypeScript config
└── README.md
```

---

## Development Phases

This project is built in ~20 substantial phases:

| # | Phase | Status |
|---|---|---|
| 1 | **Foundation** — Monorepo, API server, DB schema, OpenAPI spec | 🔄 In Progress |
| 2 | **WhatsApp Webhook** — Meta webhook verification, message ingestion, queue | ⏳ Planned |
| 3 | **AI Order Parser** — Multilingual NLP (Swahili/Sheng/English) via GPT-4o | ⏳ Planned |
| 4 | **Order Management API** — CRUD, status machine, conflict resolution | ⏳ Planned |
| 5 | **Inventory System** — Products, variants, stock tracking, SKUs | ⏳ Planned |
| 6 | **Mpesa Integration** — STK Push, C2B callbacks, reconciliation | ⏳ Planned |
| 7 | **WhatsApp Replies** — Auto-confirmations, payment requests, templates | ⏳ Planned |
| 8 | **Owner Dashboard** — React app, order board, inventory view | ⏳ Planned |
| 9 | **Real-time Updates** — WebSockets / SSE for live order board | ⏳ Planned |
| 10 | **Customer Profiles** — History, loyalty points, repeat order tracking | ⏳ Planned |
| 11 | **Broadcast System** — Promotions, stock alerts to customer segments | ⏳ Planned |
| 12 | **Catalogue/Menu** — Products customers can request via WhatsApp | ⏳ Planned |
| 13 | **Low-stock Alerts** — Threshold alerts to owner via WhatsApp | ⏳ Planned |
| 14 | **Supplier Reorder** — Simple reorder workflow, supplier contacts | ⏳ Planned |
| 15 | **Multi-staff Access** — Role-based auth, concurrent order management | ⏳ Planned |
| 16 | **End-of-day Reports** — Automated WhatsApp summary to owner | ⏳ Planned |
| 17 | **Analytics Dashboard** — Best sellers, peak times, top customers, revenue | ⏳ Planned |
| 18 | **Pricing & Billing** — Usage-based pricing, WhatsApp API cost management | ⏳ Planned |
| 19 | **Docker + VPS** — Container packaging for high-volume deployments | ⏳ Planned |
| 20 | **Onboarding Flow** — Sub-20 minute business setup, guided wizard | ⏳ Planned |

---

## Getting Started

### Prerequisites

- Node.js 24+
- pnpm 9+
- PostgreSQL 15+
- Redis 7+

### Installation

```bash
# Clone the repository
git clone https://github.com/JBlizzard-sketch/whatsapp-order-management.git
cd whatsapp-order-management

# Install all workspace dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Fill in your credentials (see Environment Variables section below)

# Push database schema
pnpm --filter @workspace/db run push

# Start the API server
pnpm --filter @workspace/api-server run dev
```

### Environment Variables

Create a `.env` file in the root with the following:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/whatsapp_orders

# Session
SESSION_SECRET=your-secret-key-here

# WhatsApp Cloud API (Meta)
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=your_business_account_id
WHATSAPP_API_TOKEN=your_api_token
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token

# Mpesa (Safaricom Daraja)
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_BUSINESS_SHORT_CODE=your_short_code
MPESA_PASSKEY=your_passkey
MPESA_CALLBACK_URL=https://your-domain.com/api/mpesa/callback

# AI (OpenAI)
OPENAI_API_KEY=your_openai_api_key

# Redis
REDIS_URL=redis://localhost:6379

# Auth (Clerk)
CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
```

---

## Key Commands

```bash
# Full typecheck across all packages
pnpm run typecheck

# Build all packages
pnpm run build

# Regenerate API hooks and Zod schemas from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Push DB schema changes (dev only)
pnpm --filter @workspace/db run push

# Run API server in dev mode
pnpm --filter @workspace/api-server run dev

# Push to GitHub
bash scripts/git-push.sh "your commit message"
```

---

## API Overview

The full API is defined in `lib/api-spec/openapi.yaml`. Key endpoints:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/healthz` | Health check |
| `POST` | `/api/webhooks/whatsapp` | WhatsApp Cloud API webhook receiver |
| `GET` | `/api/webhooks/whatsapp` | Webhook verification (GET challenge) |
| `POST` | `/api/mpesa/callback` | Mpesa STK push callback |
| `GET` | `/api/orders` | List all orders with filters |
| `GET` | `/api/orders/:id` | Get single order with items |
| `PATCH` | `/api/orders/:id/status` | Update order status |
| `GET` | `/api/inventory` | List products and stock levels |
| `POST` | `/api/inventory` | Create product |
| `PATCH` | `/api/inventory/:id` | Update product / stock |
| `GET` | `/api/customers` | List customers with order history |
| `GET` | `/api/analytics/summary` | Daily/weekly revenue summary |
| `GET` | `/api/analytics/top-products` | Best-selling products |
| `POST` | `/api/broadcasts` | Send broadcast message to customer segment |

---

## Contributing

This project is under active development. Phases are built sequentially — each phase is a production-quality increment, not a prototype.

1. Fork the repository
2. Create a feature branch: `git checkout -b phase/3-ai-parser`
3. Commit your changes: `git commit -m "feat: add multilingual order parser"`
4. Push to the branch: `git push origin phase/3-ai-parser`
5. Open a Pull Request

---

## License

MIT © 2026 JBlizzard-sketch

---

*Built for the Nairobi duka owner who deserves better tools.*
