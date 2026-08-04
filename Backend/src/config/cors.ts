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

      if (!isProduction) {
        if (origin.match(/^http:\/\/localhost:\d+$/) || origin.match(/^https:\/\/localhost:\d+$/)) {
          return callback(null, true);
        }
        if (frontendUrl && origin === frontendUrl) {
          return callback(null, true);
        }
        return callback(null, true);
      }

      if (productionAllowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: CORS_ALLOWED_HEADERS,
  };
}
