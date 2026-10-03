# Smark Mart Web + Next.js Backend + Firestore

This project contains the responsive Admin console, Dispatch console, secure Next.js API backend, Firestore transaction logic, and the XLSX -> Firestore migration utility.

## Architecture
- Mobile app: Firebase Anonymous Authentication only.
- Mobile sends its Firebase ID token to this Next.js backend.
- Backend verifies the token with Firebase Admin SDK.
- All cart/order/payment/trolley state transitions happen server-side in Firestore transactions.
- Admin does **not** use Firebase Authentication. `/` uses a simple username/password stored in server environment variables and creates an HTTP-only signed session cookie.
- Firestore rules deny direct client access; Admin SDK backend is the only database writer.

## Firebase preparation
1. Create Firebase project.
2. Enable Firestore in Native mode.
3. Authentication -> enable **Anonymous** (for mobile users).
4. Project Settings -> Service Accounts -> generate a private key for the backend/migration.
5. Copy `.env.example` to `.env.local` and fill values.
6. Deploy `firestore.rules` and `firestore.indexes.json` with Firebase CLI if desired.

## Import the existing Smart Market workbook
The exact workbook used while building is included at `seed/Smart Market.xlsx`.

```bash
npm install
node --env-file=.env.local scripts/migrate-from-xlsx.mjs "seed/Smart Market.xlsx"
```

It imports Products, Trolleys, Users (as legacyUsers), Settings and any existing Sessions, CartItems, Orders, Payments, DispatchLog, AuditLog. It is safe to re-run because master document IDs are deterministic and writes use merge mode.

## Run
```bash
npm run dev
```
- `/` admin login
- `/admin` admin dashboard + payment confirmation
- `/dispatch` dispatch / trolley return
- `/api/customer/action` mobile backend

## Deployment
Works well on Vercel or any Node host supporting Next.js. Add every `.env.example` value to the deployment environment. Use a strong `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`.

## Production notes already enforced
- server-side Firebase token verification
- HTTP-only signed admin cookie
- no direct Firestore client writes
- atomic trolley/session/order state transitions
- server-side price/total calculation
- unpaid dispatch blocking
- cart quantity guard
- closed-session lock
