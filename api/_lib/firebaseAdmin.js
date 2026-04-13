import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

function getPrivateKey() {
  const raw = process.env.FIREBASE_PRIVATE_KEY;
  if (!raw) throw new Error("Missing FIREBASE_PRIVATE_KEY.");

  // Accept common env formats: quoted PEM with \n, raw PEM, or base64-encoded JSON key.
  let normalized = raw.trim();

  if ((normalized.startsWith('"') && normalized.endsWith('"')) || (normalized.startsWith("'") && normalized.endsWith("'"))) {
    normalized = normalized.slice(1, -1);
  }

  normalized = normalized.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\r/g, "");

  if (!normalized.includes("BEGIN PRIVATE KEY") && /^[A-Za-z0-9+/=]+$/.test(normalized)) {
    try {
      const decoded = Buffer.from(normalized, "base64").toString("utf8");
      if (decoded.includes("BEGIN PRIVATE KEY")) {
        normalized = decoded;
      }
    } catch {
      // Ignore base64 decode errors and validate below.
    }
  }

  if (!normalized.includes("BEGIN PRIVATE KEY") || !normalized.includes("END PRIVATE KEY")) {
    throw new Error(
      "FIREBASE_PRIVATE_KEY is not a valid service-account PEM key. Use the private_key from Firebase Service Accounts JSON."
    );
  }

  return normalized;
}

export function getAdminApp() {
  if (admin.apps.length) {
    return admin.app();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (!projectId || !clientEmail) {
    throw new Error("Missing Firebase admin credentials.");
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: getPrivateKey()
    })
  });
}

export function getFirestoreAdmin() {
  const app = getAdminApp();
  const databaseId = process.env.FIREBASE_DATABASE_ID;
  return databaseId ? getFirestore(app, databaseId) : getFirestore(app);
}

export function getMessagingAdmin() {
  return getAdminApp().messaging();
}
