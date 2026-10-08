import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { DEFAULT_PORT, LOOPBACK_HOST } from '@apeiron/shared';

const daemon = `http://${LOOPBACK_HOST}:${process.env.APEIRON_PORT ?? DEFAULT_PORT}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: LOOPBACK_HOST,
    port: 5173,
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
