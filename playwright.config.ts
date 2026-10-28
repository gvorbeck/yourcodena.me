import { defineConfig } from '@playwright/test';

// Browser tests: `npm run test:e2e` starts the Firestore emulator, then this starts the app pointed at it.
// The demo-* project ID and dummy keys mean nothing here can reach the real Firebase project.
const PORT = 5180;
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_FIRESTORE_EMULATOR: '127.0.0.1:8080',
      VITE_FIREBASE_PROJECT_ID: 'demo-codename',
      VITE_FIREBASE_API_KEY: 'demo',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo',
      VITE_FIREBASE_STORAGE_BUCKET: 'demo',
      VITE_FIREBASE_MESSAGING_SENDER_ID: 'demo',
      VITE_FIREBASE_APP_ID: 'demo',
      VITE_APPCHECK_SITE_KEY: '',
    },
  },
});
