/**
 * Firebase Admin SDK bootstrap for the one-off scripts in this folder.
 * Never imported by the Next.js app: the Admin SDK bypasses security rules.
 *
 * Credentials: set GOOGLE_APPLICATION_CREDENTIALS to the absolute path of a
 * service-account key JSON (Firebase console > Project settings >
 * Service accounts > Generate new private key), in the shell or in .env.local.
 */
import { existsSync } from "node:fs";
import { applicationDefault, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) {
    try {
      process.loadEnvFile(file);
    } catch {
      // A malformed env file is reported by the checks below.
    }
  }
}

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!projectId) {
  console.error("NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set (copy .env.example to .env.local).");
  process.exit(1);
}
if (!keyPath || !existsSync(keyPath)) {
  console.error(
    "GOOGLE_APPLICATION_CREDENTIALS must point to a service-account key JSON.\n" +
      "Download one: Firebase console > Project settings > Service accounts > Generate new private key.\n" +
      "Keep it outside the repo (or in a *-service-account.json file, which .gitignore excludes).",
  );
  process.exit(1);
}

const app: App =
  getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId, storageBucket });

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
export const adminBucket = () => getStorage(app).bucket();
export { projectId, storageBucket };
