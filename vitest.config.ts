import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Server tests run twice: against D1 (Miniflare) and Postgres (PGLite), so the
// "swap the database" promise is actually checked.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    projects: [
      {
        extends: true,
        test: { name: 'd1', include: ['src/**/*.test.ts'], env: { DATABASE_PROVIDER: 'd1' } },
      },
      {
        extends: true,
        test: {
          name: 'postgres',
          include: ['src/server/**/*.test.ts'],
          env: { DATABASE_PROVIDER: 'postgres' },
        },
      },
    ],
  },
});
