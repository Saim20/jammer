import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Guard initialization to the client only.
// Next.js SSR/prerender evaluates this module on the server where
// NEXT_PUBLIC_* vars may be absent and Firebase Auth throws.
// All Firebase usage in this app lives inside useEffect / event handlers
// (client-only paths), so null values are never read during SSR.
const isClient = typeof window !== 'undefined';
const _app: FirebaseApp | null = isClient
    ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
    : null;

export const auth = (_app ? getAuth(_app) : null) as Auth;
export const db = (_app ? getFirestore(_app) : null) as Firestore;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });