import { CorsOptions } from 'cors';

export const CORS_ALLOWED_HEADERS = [
  'Authorization',
  'Content-Type',
  'X-Requested-With',
  'Accept',
  'Origin',
  'Idempotency-Key',
  'If-Match',
  'X-Client-Portal-Workspace',
];

interface CorsOptionsInput {
  isProduction: boolean;
  productionAllowedOrigins: string[];
  frontendUrl?: string;
}

export function createCorsOptions({
  isProduction,
  productionAllowedOrigins,
  frontendUrl,
}: CorsOptionsInput): CorsOptions {
  return {
    origin(origin, callback) {
      // Requests with no Origin header (same-origin, server-to-server, curl)
      // are not a cross-origin concern.
      if (!origin) {
        return callback(null, true);
      }

      if (isProduction) {
        // Production: only the configured allowlist.
        return callback(null, productionAllowedOrigins.includes(origin));
      }

      // Non-production: only localhost + the configured frontend origin. A
      // blanket allow-all for arbitrary origins must never be used while
      // credentials/authorization transport is enabled.
      const localhost = /^https?:\/\/localhost:\d+$/.test(origin);
      const frontend = Boolean(frontendUrl) && origin === frontendUrl;
      return callback(null, localhost || frontend || productionAllowedOrigins.includes(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: CORS_ALLOWED_HEADERS,
  };
}
