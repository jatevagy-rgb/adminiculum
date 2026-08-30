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
      if (!origin) {
        return callback(null, true);
      }

      if (isProduction) return callback(null, productionAllowedOrigins.includes(origin));

      const isLocalhost = /^https?:\/\/localhost:\d+$/.test(origin);
      const isFrontend = Boolean(frontendUrl) && origin === frontendUrl;
      return callback(null, isLocalhost || isFrontend || productionAllowedOrigins.includes(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: CORS_ALLOWED_HEADERS,
  };
}
