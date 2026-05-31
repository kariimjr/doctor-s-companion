import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let _app: FirebaseApp | null = null;
let _db: Firestore | null = null;

export function isFirebaseConfigured() {
  return Boolean(config.apiKey && config.projectId && config.appId);
}

export function getFirebase() {
  if (typeof window === "undefined") return { app: null, db: null };
  if (!isFirebaseConfigured()) return { app: null, db: null };
  if (!_app) {
    _app = getApps()[0] ?? initializeApp(config);
    _db = getFirestore(_app);
  }
  return { app: _app, db: _db };
}

export function getDb(): Firestore | null {
  return getFirebase().db;
}
