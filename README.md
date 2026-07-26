# CommerceOS / Sukirti Commerce Hub

CommerceOS is a company-based commerce operating panel. Phase 1 is focused on authentication, company workspace creation, role mapping, and secure access to the dashboard panel.

## Current Phase

Phase 1: Authentication and company workspace.

Completed in this phase:

- Public home page before login
- Company signup page
- Company login page
- Protected panel route
- JWT auth from backend
- Password hashing on backend
- Company creation during signup
- Owner role assignment during signup
- Role permission map
- Logout button
- Backend memory fallback when MongoDB is not running
- Separate backend folder: `commerce-backend`

## Project Structure

```text
Booster/
  app/
    page.jsx              Public home page
    login/page.jsx        Login page
    signup/page.jsx       Signup page
    panel/page.jsx        Protected dashboard panel
  components/
    dashboard.jsx         Main panel UI
    login-form.jsx        Login form
    signup-form.jsx       Signup form
    auth-layout.jsx       Shared auth page layout
  lib/
    api.js                Frontend API client and session helpers
    data.js               Static UI data
  commerce-backend/
    src/
      modules/auth/       Signup, login, permissions
      modules/channels/   Channel APIs, currently paused
      models/             Mongo models
      repositories/       Mongo/memory store abstraction
```

## Run Frontend and Backend in Parallel

Open two terminals.

Terminal 1: backend

```bash
cd commerce-backend
npm install
npm start
```

Backend runs on:

```text
http://127.0.0.1:4000
```

Terminal 2: frontend

```bash
npm install
npm run dev
```

Frontend runs on:

```text
http://localhost:3000
```

Create `.env.local` in the root if needed:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:4000
```

## MongoDB

If MongoDB is running, the backend stores companies and users in MongoDB.

If MongoDB is not running, the backend uses an in-memory development store and still works for signup/login testing.

Health check:

```bash
curl http://127.0.0.1:4000/health
```

Expected response in memory mode:

```json
{
  "status": "ok",
  "service": "commerce-backend",
  "phase": "phase-1-authentication",
  "store": "memory"
}
```

## Page and Button Guide

### Public Home Page: `/`

This is the first page before login.

Buttons:

- `Login`: opens `/login`
- `Start`: opens `/signup`
- `Create Company`: opens `/signup`
- `Login to Panel`: opens `/login`

Feature cards:

- `JWT Authentication`: explains secure backend session
- `Roles & Permissions`: shows supported role model
- `Company Workspace`: explains company-level mapping

### Signup Page: `/signup`

Fields:

- `Company name`: creates the company workspace
- `Your name`: creates the owner user name
- `Email`: owner login email
- `Password`: owner login password, minimum 8 characters

Button:

- `Create Company & Enter Panel`: calls backend `POST /api/auth/signup`

Flow:

1. User enters company name, name, email, password.
2. Backend hashes password.
3. Backend creates company.
4. Backend creates owner user.
5. Backend signs JWT with `companyId`, `sub`, and `role`.
6. Frontend saves session in browser local storage.
7. User is redirected to `/panel`.

### Login Page: `/login`

Fields:

- `Email`
- `Password`

Button:

- `Login to Panel`: calls backend `POST /api/auth/login`

Flow:

1. User enters email and password.
2. Backend finds user by email.
3. Backend compares password hash.
4. Backend returns JWT, user, company, and permissions.
5. Frontend saves session.
6. User is redirected to `/panel`.

### Protected Panel: `/panel`

The panel checks for a saved session token before rendering.

If no token exists:

- User is redirected to `/login`

Top bar buttons:

- `Search`: searches orders, SKU, customer, shipment, invoice in future phases
- `Period dropdown`: changes dashboard period locally
- `Sync`: placeholder for future sync actions
- `Notifications`: placeholder for Phase 19 notifications
- `Logout icon`: clears session and redirects to `/login`

Sidebar buttons:

- `Dashboard`: shows metrics, charts, orders, inventory, finance, automation
- `Orders`: placeholder navigation for Phase 9
- `Products`: placeholder navigation for Phase 4
- `Inventory`: placeholder navigation for Phase 5
- `Channels`: shows channel card grid, currently connector work is paused
- `Shipping`: placeholder navigation for Phase 10
- `CRM`: placeholder navigation for Phase 12
- `Finance`: placeholder navigation for Phase 14
- `Ads`: placeholder navigation for Phase 16
- `Automation`: placeholder navigation for Phase 18
- `Reports`: placeholder navigation for Phase 20
- `Settings`: placeholder navigation for company settings

Dashboard buttons:

- `Support Queue`: future support workflow entry
- `Create Manual Order`: future manual order creation
- `Bulk Ship`: future bulk shipping action
- `Create PO`: future purchase order action
- `New Rule`: future automation builder action

## Backend Auth Endpoints

### Signup

```http
POST /api/auth/signup
```

Body:

```json
{
  "companyName": "Sukirti Naturals",
  "name": "Owner Name",
  "email": "owner@example.com",
  "password": "password123"
}
```

Creates:

- Company
- Owner user
- JWT session

### Login

```http
POST /api/auth/login
```

Body:

```json
{
  "email": "owner@example.com",
  "password": "password123"
}
```

Returns:

- JWT token
- User
- Company
- Permissions

### Current User

```http
GET /api/auth/me
Authorization: Bearer <token>
```

Returns current user, company, store mode, and permissions.

## Roles

Supported roles:

- Owner
- Admin
- Manager
- Support
- Warehouse
- Marketing
- Accountant

Phase 1 signup always creates the first user as `Owner`.

Owner permissions:

```text
*
```

Other role permissions are defined in:

```text
commerce-backend/src/modules/auth/permissions.js
```

## Phase 1 Acceptance Checklist

- Open `/`
- Click `Create Company`
- Fill company name, owner name, email, password
- Submit signup
- Confirm redirect to `/panel`
- Click logout icon
- Confirm redirect to `/login`
- Login with same email/password
- Confirm redirect to `/panel`
- Check backend `/health`
- Check `GET /api/auth/me` with token

## Notes

The channel integration phase has been skipped for now as requested. Shopify code remains in the repo but the current active milestone is Phase 1 authentication and company login/signup.
