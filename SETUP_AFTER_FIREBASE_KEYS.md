# After you generate Firebase keys

## Web / backend
Copy `.env.example` to `.env.local` and fill:
- FIREBASE_PROJECT_ID
- FIREBASE_CLIENT_EMAIL
- FIREBASE_PRIVATE_KEY
- ADMIN_USERNAME
- ADMIN_PASSWORD
- ADMIN_SESSION_SECRET (32+ random characters)

Then:
```bash
npm install
node --env-file=.env.local scripts/migrate-from-xlsx.mjs "seed/Smart Market.xlsx"
npm run dev
```

Optional Firestore rules/indexes:
```bash
firebase deploy --only firestore
```

## Mobile
Create Firebase Web App config and fill `.env` using `.env.example`.
Enable Firebase Authentication -> Anonymous.
Set `EXPO_PUBLIC_API_BASE_URL` to the deployed web/backend domain.

For GitHub APK builds add all `EXPO_PUBLIC_*` values as GitHub Actions repository secrets, then run **Build Android APK**.
