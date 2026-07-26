# CommerceOS / Sukirti Commerce Hub

Next.js 16 frontend scaffold for a unified commerce operating dashboard.

## Stack

- Next.js 16 and React 19
- Tailwind CSS
- shadcn-style local UI primitives
- React Query provider
- Zustand store
- Recharts
- Lucide icons

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

To connect the frontend to the backend, create `.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## Current Surface

- Responsive operations sidebar and top search bar
- Dashboard KPI cards for sales, profit, expenses, order states, COD, ROAS, and repeat customers
- Sales/profit/orders trend chart
- Channel-wise mix chart
- Channel integration health panel
- Central order panel
- Inventory and raw material alert panel
- Order profit breakdown
- Automation rule preview
- Phase-based implementation roadmap

The data is currently static sample data in `lib/data.js`, ready to be replaced by backend API calls.

## Backend

The separate backend lives in `commerce-backend/`.

```bash
cd commerce-backend
npm install
cp .env.example .env
npm run dev
```

Phase 1 backend work currently starts with Shopify channel connection.
