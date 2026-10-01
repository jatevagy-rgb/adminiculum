// Run the same Next dev server directly so startup failures retain their exit
// code (the Next CLI maps an unexpected child exit to a successful session stop).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { startServer } = require('next/dist/server/lib/start-server');
await startServer({ dir: process.cwd(), isDev: true, port: 3111, hostname: '127.0.0.1', allowRetry: false });
