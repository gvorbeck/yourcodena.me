import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts', 'functions/src/**/*.test.ts'],
    // `npm run test:coverage` fails if coverage drops below these. Raise them as tests are added; never lower them to make CI pass.
    coverage: {
      include: ['src/**', 'functions/src/**'],
      exclude: ['**/*.tsx'], // screens are covered by the browser tests in e2e/; this floor guards the logic
      thresholds: { lines: 77, statements: 74, branches: 68, functions: 78 },
    },
  },
});
