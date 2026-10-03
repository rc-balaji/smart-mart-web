# Smark Mart — Firestore + Next.js Admin CRUD

This package contains the Admin/Dispatch web app, secure Next.js backend, Firestore rules/indexes, the current Smart Market.xlsx seed workbook, and a root `index.js` importer.

## What is included

- `index.js` — one-command XLSX -> Firestore importer
- `Smart Market.xlsx` — current source workbook
- `app/admin` — live trolley/order dashboard
- `app/admin/products` — Product Master CRUD
- `app/dispatch` — payment-safe dispatch/return screen
- `app/api/*` — server-side APIs
- `lib/smart-market.ts` — trolley/cart/order/payment/dispatch + product CRUD logic
- `firestore.rules` — blocks direct client access; backend uses Firebase Admin SDK
- `firestore.indexes.json` — required query indexes

## Product CRUD included

Admin -> Products supports:
- View/search products
- Add product
- Edit product/category/pack/price/barcode/scan code
- Update stock quantity directly through the edit form
- Stock + / - buttons
- Set reorder level
- Activate/deactivate
- Delete product

The customer API already supports cart quantity changes through `CHANGE_QTY`.

## 1. Install

```bash
npm install
```

## 2. Firebase Admin credentials

For Next.js/Vercel, configure:

```env
FIREBASE_PROJECT_ID=smart-mart-82a7a
FIREBASE_CLIENT_EMAIL=YOUR_SERVICE_ACCOUNT_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
ADMIN_USERNAME=admin
ADMIN_PASSWORD=YOUR_PASSWORD
ADMIN_SESSION_SECRET=AT_LEAST_32_RANDOM_CHARACTERS
NEXT_PUBLIC_STORE_NAME=Smark Mart
```

`google-services.json` is Android client configuration and is NOT a Firebase Admin service-account credential.

## 3. Import current Excel data to Firestore

The easiest local method is to put the Firebase **service account** JSON beside `index.js` as:

`serviceAccountKey.json`

Do NOT commit that file.

Then run:

```bash
npm run seed
```

or:

```bash
node index.js "Smart Market.xlsx"
```

Alternative supported credential methods are documented at the top of `index.js`.

The importer is idempotent for master data. It imports:
- Products
- Trolleys
- Users -> `legacyUsers`
- Settings
- Sessions
- CartItems -> `sessions/{sessionId}/cart/{productId}`
- Orders
- Payments
- DispatchLog
- AuditLog
- Active session locks

It also writes import metadata to `_meta/smarkMart`.

## 4. Run locally

```bash
npm run dev
```

Open `http://localhost:3000` and log in with the `ADMIN_USERNAME` / `ADMIN_PASSWORD` values.

Admin product page:

`/admin/products`

## 5. Deploy Firestore rules/indexes

If Firebase CLI is installed and the project is selected:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## 6. Vercel

Push this folder to GitHub, import it in Vercel, and add the server environment variables from step 2.

Never upload `serviceAccountKey.json` to GitHub.
