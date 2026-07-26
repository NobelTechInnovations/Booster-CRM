# CommerceOS Backend

Separate backend API for CommerceOS / Sukirti Commerce Hub.

## Phase 1 Scope

- Express API scaffold
- MongoDB connection
- Company, User, and Channel models
- JWT middleware
- Development login endpoint
- Shopify-only channel connection flow
- Shopify OAuth callback, status, disconnect, and sync placeholder

## Run

```bash
cd commerce-backend
npm install
cp .env.example .env
npm run dev
```

The API runs on `http://127.0.0.1:4000` by default.

## Shopify Setup

Create a Shopify app and set the redirect URL to:

```text
http://localhost:4000/api/channels/shopify/callback
```

Fill these values in `.env`:

```text
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=http://localhost:4000
```

For a public one-click install flow, set `SHOPIFY_APP_INSTALL_URL` to your Shopify App Store/listing install URL. The app keys still stay on the backend and are never exposed to the frontend.

## Useful Endpoints

- `GET /health`
- `POST /api/auth/dev-login`
- `GET /api/auth/me`
- `POST /api/channels/shopify/connect`
- `GET /api/channels/shopify/callback`
- `GET /api/channels`
- `GET /api/channels/supported`
- `POST /api/channels/:channelId/sync`
- `DELETE /api/channels/:channelId`

Use the token from `POST /api/auth/dev-login` as:

```text
Authorization: Bearer <token>
```
