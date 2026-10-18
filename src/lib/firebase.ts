import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

// Config field -> the Vite env var it reads (see .env.example). Fail loud at startup rather than as opaque Firestore errors.
const envVars = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
} as const;

const config = Object.fromEntries(Object.entries(envVars).map(([k, v]) => [k, import.meta.env[v]]));
const missing = Object.values(envVars).filter((v) => !import.meta.env[v]);
if (missing.length) throw new Error(`Missing Firebase env vars: ${missing.join(', ')}. See .env.example.`);

// The persistent cache lets pages open and writes queue while offline; the multi-tab manager keeps several open sheets coherent.
const app = initializeApp(config);

// App Check keeps scripts that never loaded this site from reading or writing games. Off until a site key is set.
const siteKey = import.meta.env.VITE_APPCHECK_SITE_KEY;
if (siteKey) initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
