import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so `npm test` runs without the emulator. Files share one emulator, so no parallel files.
export default defineConfig({ test: { include: ['test/**/*.test.ts'], fileParallelism: false, testTimeout: 15000 } });
