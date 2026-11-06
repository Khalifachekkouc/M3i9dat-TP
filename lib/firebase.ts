import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

// Each key is written out literally: Next.js only inlines NEXT_PUBLIC_* values
// into the browser bundle when they are referenced as process.env.NAME.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const missing = Object.entries(config)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  throw new Error(
    `Firebase config incomplete (${missing.join(", ")}). Copy .env.example to .env.local and fill it in.`,
  );
}

function createApp(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(config);
}

function createDb(app: FirebaseApp): Firestore {
  // Server render has no IndexedDB, so the offline cache is browser-only.
  if (typeof window === "undefined") return getFirestore(app);
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Already initialised (hot reload): reuse the existing instance.
    return getFirestore(app);
  }
}

export const app: FirebaseApp = createApp();
export const auth: Auth = getAuth(app);
export const db: Firestore = createDb(app);
export const storage: FirebaseStorage = getStorage(app);
