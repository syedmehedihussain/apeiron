import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { DEFAULT_PORT, DEV_WEB_PORT, LOOPBACK_HOST } from '@cherry/shared';

const daemon = `http://${LOOPBACK_HOST}:${process.env.CHERRY_PORT ?? DEFAULT_PORT}`;

export default defineConfig({
  plugins: [react()],
  // Served from the user's own machine, so a big chunk costs nothing; keep `cherry` quiet.
  build: { chunkSizeWarningLimit: 4000 },
  server: {
    host: LOOPBACK_HOST,
    port: Number(process.env.CHERRY_WEB_PORT ?? DEV_WEB_PORT),
    strictPort: true,
    proxy: {
      '/api': daemon,
      '/ws': { target: daemon, ws: true },
    },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
