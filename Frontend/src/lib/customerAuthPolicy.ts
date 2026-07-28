/**
 * Customer authentication policy — pure decision logic, no React and no MSAL
 * imports, so it is directly unit-testable and safe to reuse anywhere.
 *
 * The Client Portal uses browser-delegated authentication (MSAL authorization
 * code + PKCE, External ID hosted flow). Adminiculum never processes the
 * customer password or verification code. This module only decides *whether*
 * the customer provider is usable and produces customer-safe strings.
 */

/** Workforce (internal) authority host. A customer provider must not be this in production. */
export const WORKFORCE_AUTHORITY_HOST = 'login.microsoftonline.com';

/** OIDC prompt that jumps a combined sign-up/sign-in flow straight to account creation. */
export const REGISTRATION_PROMPT = 'create';

export type ProviderReason =
  | 'OK'
  | 'MISSING_CLIENT_ID'
  | 'MISSING_AUTHORITY'
  | 'WORKFORCE_AUTHORITY_IN_PRODUCTION';

export interface ProviderEvaluation {
  configured: boolean;
  reason: ProviderReason;
}

export function isProductionRuntime(nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return String(nodeEnv || '').toLowerCase() === 'production';
}

/**
 * A customer identity provider is usable only when a client id and an authority
 * are configured, and — in production — the authority is NOT the workforce
 * endpoint. This prevents a missing customer authority from silently falling
 * back to the internal workforce authority.
 */
export function evaluateCustomerProvider(params: {
  clientId?: string;
  authority?: string;
  isProduction: boolean;
}): ProviderEvaluation {
  const clientId = String(params.clientId || '').trim();
  const authority = String(params.authority || '').trim();
  if (!clientId) return { configured: false, reason: 'MISSING_CLIENT_ID' };
  if (!authority) return { configured: false, reason: 'MISSING_AUTHORITY' };
  if (params.isProduction && authority.includes(WORKFORCE_AUTHORITY_HOST)) {
    return { configured: false, reason: 'WORKFORCE_AUTHORITY_IN_PRODUCTION' };
  }
  return { configured: true, reason: 'OK' };
}

/**
 * Convert any MSAL/redirect error into a single customer-safe message.
 * Never returns tokens, codes, PII, or provider internals.
 */
export function sanitizeAuthError(_error: unknown): string {
  return 'Az azonosítás jelenleg nem indítható el. Kérjük, próbálja újra később.';
}

/** The post-logout return target is always the portal entry on the same origin. */
export function customerPostLogoutRedirectUri(origin: string): string {
  return String(origin || '').replace(/\/+$/, '') + '/portal';
}
