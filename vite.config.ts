import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts', 'functions/src/**/*.test.ts'],
    // `npm run test:coverage` fails if coverage drops below these. Raise them as tests are added; never lower them to make CI pass.
    coverage: {
      include: ['src/**', 'functions/src/**'],
      thresholds: { lines: 53, statements: 51, branches: 46, functions: 43 },
    },
  },
});
