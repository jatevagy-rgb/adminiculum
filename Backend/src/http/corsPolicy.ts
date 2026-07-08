import { CorsOptions } from 'cors';

type CorsPolicyEnv = Record<string, string | undefined>;

export function parseCsvEnv(value: string | undefined): string[] {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getConfiguredCorsAllowedOrigins(env: CorsPolicyEnv = process.env): string[] {
  return [
    ...parseCsvEnv(env.CORS_ALLOWED_ORIGINS),
    ...parseCsvEnv(env.CORS_ORIGIN),
    ...parseCsvEnv(env.FRONTEND_ORIGIN),
    ...parseCsvEnv(env.FRONTEND_URL),
  ];
}

function isProductionNodeEnv(nodeEnv: string | undefined): boolean {
  return String(nodeEnv || '').toLowerCase() === 'production';
}

function isLocalDevelopmentOrigin(origin: string): boolean {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin);
}

export function isAllowedCorsOrigin(
  origin: string | undefined,
  options: {
    nodeEnv?: string;
    env?: CorsPolicyEnv;
  } = {}
): boolean {
  if (!origin) {
    return true;
  }

  const configuredAllowedOrigins = getConfiguredCorsAllowedOrigins(options.env);
  if (isProductionNodeEnv(options.nodeEnv ?? process.env.NODE_ENV)) {
    return configuredAllowedOrigins.includes(origin);
  }

  return isLocalDevelopmentOrigin(origin) || configuredAllowedOrigins.includes(origin);
}

export function createCorsOptions(
  options: {
    nodeEnv?: string;
    env?: CorsPolicyEnv;
  } = {}
): CorsOptions {
  return {
    origin(origin, callback) {
      callback(null, isAllowedCorsOrigin(origin, options));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With', 'Accept', 'Origin'],
  };
}
