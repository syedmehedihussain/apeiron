import { DEFAULT_PORT, LOOPBACK_HOST } from '@apeiron/shared';
import { buildServer } from './server.ts';

const port = Number(process.env.APEIRON_PORT ?? DEFAULT_PORT);
const app = buildServer();

// Loopback only (ADR-0005). Never bind 0.0.0.0.
await app.listen({ host: LOOPBACK_HOST, port });
console.log(`apeiron daemon on http://${LOOPBACK_HOST}:${port}`);
