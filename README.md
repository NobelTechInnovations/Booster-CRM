# CommerceOS / Sukirti Commerce Hub

CommerceOS is a company-based commerce operating panel. Phase 1 now covers public onboarding, login, company workspaces, multiple users, roles, permissions, company KYC, and protected panel navigation.

## Run The Full Panel

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

## MongoDB URL

Update MongoDB in:

```text
commerce-backend/.env
```

Set:

```env
MONGODB_URI=your_mongodb_connection_url
```

The current backend has been tested with MongoDB Atlas and `/health` returns:

```json
{
  "status": "ok",
  "service": "commerce-backend",
  "phase": "phase-1-authentication",
  "store": "mongodb"
}
```

Check it:

```bash
curl http://127.0.0.1:4000/health
```

If MongoDB is not available, backend falls back to `memory` mode for local testing.

## Phase 1 Completed

- Home page before login
- Signup page
- Login page
- Company creation
- Company details page
- Full KYC form
- Protected panel
- JWT auth
- Password hashing
- Multiple users
- Roles
- Permissions
- Primary owner lock
- Self-user edit lock
- Same email can create or join multiple companies
- Company selection during login
- UI pages for Dashboard, Company, Users, Products, Orders, Inventory, Channels, Shipping, CRM, Finance, Ads, Automation, Reports, Settings

## Page And Button Guide

### Home Page `/`

What opens first:

- Public CommerceOS home page.

Buttons:

- `Login`: opens `/login`.
- `Start`: opens `/signup`.
- `Create Company`: opens `/signup`.
- `Login to Panel`: opens `/login`.

What user should do:

- New company owner clicks `Create Company`.
- Existing user clicks `Login`.

### Signup Page `/signup`

Fields to enter:

- `Company name`: business/workspace name.
- `Your name`: owner name.
- `Email`: owner login email.
- `Password`: minimum 8 characters.

Button:

- `Create Company & Enter Panel`

What happens:

1. Backend creates a company.
2. Backend creates the first user as `Owner`.
3. Backend stores `ownerUserId` on the company.
4. Password is hashed.
5. JWT token is created with `companyId`, `userId`, and `role`.
6. Frontend saves session.
7. User opens `/panel`.

Important:

- The first signup user is the primary owner.
- Primary owner role/status cannot be edited from Users page.

### Login Page `/login`

Fields to enter:

- `Email`
- `Password`

Button:

- `Login to Panel`

What happens:

- If email/password belongs to one company, panel opens directly.
- If same email belongs to multiple companies, company selection appears.
- Click `Open` on the company you want.
- Frontend stores that company session and opens `/panel`.

### Multi-Company Flow

One email can create multiple companies.

Example:

1. Signup with `owner@example.com` and company `Company A`.
2. Logout.
3. Signup again with `owner@example.com` and company `Company B`.
4. Login with `owner@example.com`.
5. Login page shows both companies.
6. Click `Open` on the company you want to manage.

Backend rule:

- Same email is allowed across different companies.
- Same email cannot be duplicated inside the same company.
- Data is isolated by `companyId`.

### Protected Panel `/panel`

If no session exists:

- User is redirected to `/login`.

Top bar:

- Company name: shows selected company.
- Search input: future global search for orders, SKUs, customers, shipments, invoices.
- Period dropdown: changes dashboard period locally.
- `Sync`: placeholder for future sync.
- Bell icon: future notifications.
- Logout icon: clears session and opens `/login`.

## Sidebar Pages

### Dashboard

Click:

- Sidebar `Dashboard`

Shows:

- KPI cards
- Sales/profit/order charts
- Channel mix
- Central order panel
- Inventory alerts
- Profit calculator
- Automation preview
- Roadmap

Buttons:

- `Support Queue`: future support queue.
- `Create Manual Order`: future manual order creation.
- `Bulk Ship`: future shipping action.
- `Create PO`: future purchase order creation.
- `New Rule`: future automation rule.

### Company

Click:

- Sidebar `Company`

Company Details fields:

- Company name
- Legal name
- Business email
- Phone
- Website
- Business type
- GSTIN
- PAN
- Address line 1
- Address line 2
- City
- State
- Pincode
- Country

Button:

- `Save Company Details`

What happens:

- Backend updates company profile for current `companyId`.
- Updated company data is saved in session.

Full KYC fields:

- Legal name as per GST/PAN
- GSTIN
- PAN
- Registered address
- Bank account name
- Bank account number
- IFSC

Buttons:

- `Save Draft`: saves KYC with `draft` status.
- `Submit KYC`: saves KYC with `submitted` status.

### Users

Click:

- Sidebar `Users`

Create User fields:

- Name
- Email
- Password
- Role

Button:

- `Create User`

What happens:

- User is created under current company only.
- Password is hashed.
- User gets selected role.
- User can login with email/password.

Company Users section:

- Shows all users in current company.
- Role dropdown changes role.
- Status dropdown changes active/disabled.
- `Save` updates role/status.

Locked rows:

- Primary owner row is locked.
- Current logged-in user row is locked.
- Locked rows show `Primary owner` or `You`.
- Save button is disabled for locked rows.

### Products

Click:

- Sidebar `Products`

Shows:

- Master products
- Mapped SKUs
- Variants
- Missing data

Buttons:

- `Create Product`
- `Add Variant`
- `Map SKU`
- `Upload Images`
- `Bulk Import`

### Orders

Click:

- Sidebar `Orders`

Shows:

- Pending orders
- Processing orders
- Shipped
- Returns

Buttons:

- `Confirm`
- `Pack`
- `Ship`
- `Cancel`
- `Return`
- `Refund`
- `Exchange`
- `Print Invoice`
- `Print Label`

### Inventory

Click:

- Sidebar `Inventory`

Shows:

- Available stock
- Reserved stock
- Low stock
- Damaged/lost

Buttons:

- `Adjust Stock`
- `Transfer`
- `Scan Barcode`
- `Create Alert`
- `View History`

### Channels

Click:

- Sidebar `Channels`

Shows:

- Shopify
- WooCommerce
- Amazon
- Flipkart
- Meesho
- GlowRoad
- JioMart
- Myntra
- Ajio
- Etsy

Current status:

- Channel phase is paused as requested.
- UI cards are ready.

### Shipping

Click:

- Sidebar `Shipping`

Shows:

- Ready to ship
- In transit
- NDR
- RTO

Buttons:

- `Create Shipment`
- `Generate Label`
- `Generate Manifest`
- `Track`
- `Bulk Ship`

### CRM

Click:

- Sidebar `CRM`

Shows:

- Customers
- Repeat customers
- Follow-ups
- High LTV customers

Buttons:

- `Create Segment`
- `Add Follow-up`
- `Add Note`
- `Tag Customer`
- `Export`

### Finance

Click:

- Sidebar `Finance`

Shows:

- Income
- Expenses
- Profit
- COD pending

Buttons:

- `Add Expense`
- `Attach Bill`
- `View GST`
- `COD Report`
- `Cash Flow`

### Ads

Click:

- Sidebar `Ads`

Shows:

- Spend
- ROAS
- CPA
- Tracked orders

Buttons:

- `Connect Meta`
- `Connect Google`
- `Add Manual Spend`
- `Map Campaign`
- `View ROAS`

### Automation

Click:

- Sidebar `Automation`

Shows:

- Active rules
- Runs
- Drafts
- Failures

Buttons:

- `New Rule`
- `Add Trigger`
- `Add Delay`
- `Send WhatsApp`
- `Send Email`

### Reports

Click:

- Sidebar `Reports`

Shows:

- Sales reports
- Profit reports
- Inventory reports
- Courier reports

Buttons:

- `Sales Report`
- `Profit Report`
- `Inventory Report`
- `Courier Report`
- `Export CSV`

### Settings

Click:

- Sidebar `Settings`

Shows:

- Authentication
- Roles
- Permissions
- Audit logs

Buttons:

- `Company Details`: opens Company page.
- `Manage Users`: opens Users page.

## Roles

Supported roles:

- Owner
- Admin
- Manager
- Support
- Warehouse
- Marketing
- Accountant

Permission file:

```text
commerce-backend/src/modules/auth/permissions.js
```

Role summary:

- `Owner`: full access.
- `Admin`: company, users, channels, orders, inventory, reports.
- `Manager`: dashboard, users read, company read, orders, inventory read, channels read, reports.
- `Support`: order/customer support.
- `Warehouse`: packing, inventory, shipping.
- `Marketing`: ads, CRM, channel read, reports.
- `Accountant`: finance, reports, order read.

## Backend Endpoints

Auth:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/dev-login`
- `GET /api/auth/me`

Company:

- `GET /api/company`
- `PUT /api/company`
- `PUT /api/company/kyc`

Users:

- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:userId`

Health:

- `GET /health`

## Verification Checklist

1. Open `http://localhost:3000`.
2. Click `Create Company`.
3. Enter company name, name, email, password.
4. Click `Create Company & Enter Panel`.
5. Confirm panel opens.
6. Click `Company`.
7. Fill company details.
8. Click `Save Company Details`.
9. Fill KYC.
10. Click `Save Draft`.
11. Click `Submit KYC`.
12. Click `Users`.
13. Create a user with role `Manager`.
14. Confirm new user appears.
15. Confirm primary owner row is locked.
16. Confirm current user row is locked.
17. Logout.
18. Login again.
19. If multiple companies exist, select company and click `Open`.
