import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing`);
  }
  return value.trim();
}

function normalizePrivateKey(value: string) {
  let key = value.trim();

  // If user accidentally pasted surrounding quotes in Vercel
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  // Convert literal \n into real new lines
  key = key.replace(/\\n/g, "\n");

  // Normalize line endings
  key = key.replace(/\r\n/g, "\n");

  if (!key.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new Error(
      "FIREBASE_PRIVATE_KEY is invalid: BEGIN PRIVATE KEY header missing"
    );
  }

  if (!key.includes("-----END PRIVATE KEY-----")) {
    throw new Error(
      "FIREBASE_PRIVATE_KEY is invalid: END PRIVATE KEY footer missing"
    );
  }

  return key;
}

export function adminApp() {
  const existing = getApps();

  if (existing.length > 0) {
    return existing[0]!;
  }

  const projectId = getEnv("FIREBASE_PROJECT_ID");
  const clientEmail = getEnv("FIREBASE_CLIENT_EMAIL");
  const privateKey = normalizePrivateKey(
    getEnv("FIREBASE_PRIVATE_KEY")
  );

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export function db() {
  return getFirestore(adminApp());
}

export function adminAuth() {
  return getAuth(adminApp());
}