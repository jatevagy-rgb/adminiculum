// Single source of truth for the PUBLIC, build-time frontend auth configuration
// contract (ANONYMIZATION/AUTH REMEDIATION WAVE 1).
//
// Next.js inlines NEXT_PUBLIC_* at BUILD TIME. If any of these is empty when
// `next build` runs, the shipped client bundle bakes an empty MSAL clientId /
// authority and BOTH workforce and customer login break — exactly the incident
// this contract exists to make impossible to reproduce silently.
//
// Every value here is intentionally browser-public (client ids, tenant ids,
// authority URLs, redirect URIs, API scope URIs, backend URL). NONE is secret.
// Secrets (client secrets, tokens, passwords) must NEVER be NEXT_PUBLIC_*.

/** Workforce (internal Microsoft Entra) public build config. */
export const WORKFORCE_REQUIRED = [
  'NEXT_PUBLIC_WORKFORCE_ENTRA_CLIENT_ID',
  'NEXT_PUBLIC_WORKFORCE_ENTRA_TENANT_ID',
  'NEXT_PUBLIC_WORKFORCE_ENTRA_AUTHORITY',
  'NEXT_PUBLIC_WORKFORCE_ENTRA_REDIRECT_URI',
  'NEXT_PUBLIC_WORKFORCE_ADMINICULUM_API_SCOPE',
];

/** Customer (External ID / CIAM) public build config. */
export const CUSTOMER_REQUIRED = [
  'NEXT_PUBLIC_ENTRA_CLIENT_ID',
  'NEXT_PUBLIC_ENTRA_TENANT_ID',
  'NEXT_PUBLIC_ENTRA_AUTHORITY',
  'NEXT_PUBLIC_ENTRA_REDIRECT_URI',
  'NEXT_PUBLIC_ADMINICULUM_API_SCOPE',
];

/** Shared public build config. */
export const SHARED_REQUIRED = ['NEXT_PUBLIC_BACKEND_BASE_URL'];

/** All variables that MUST be present and non-empty for a valid production build. */
export const REQUIRED_PUBLIC_BUILD_VARS = [
  ...WORKFORCE_REQUIRED,
  ...CUSTOMER_REQUIRED,
  ...SHARED_REQUIRED,
];

/**
 * Optional public build config: mirrored into production for completeness but
 * NOT fail-closed because the source has a safe same-origin fallback for these.
 */
export const OPTIONAL_PUBLIC_BUILD_VARS = [
  'NEXT_PUBLIC_WORKFORCE_ENTRA_POST_LOGOUT_REDIRECT_URI',
  'NEXT_PUBLIC_ENTRA_POST_LOGOUT_REDIRECT_URI',
];

/** All public build vars the production build should carry (required + optional). */
export const ALL_PUBLIC_BUILD_VARS = [
  ...REQUIRED_PUBLIC_BUILD_VARS,
  ...OPTIONAL_PUBLIC_BUILD_VARS,
];

/**
 * The specific values whose EMPTY state defined the incident. The generated
 * artifact must never bake these empty. Client ids (public GUIDs) and authority
 * URLs are the deterministic markers we assert are present after a build.
 */
export const ARTIFACT_NONEMPTY_MARKERS = [
  'NEXT_PUBLIC_WORKFORCE_ENTRA_CLIENT_ID',
  'NEXT_PUBLIC_ENTRA_CLIENT_ID',
];

/** Return the names of required vars that are missing/empty in `env`. */
export function missingRequired(env) {
  return REQUIRED_PUBLIC_BUILD_VARS.filter((name) => {
    const v = env[name];
    return v === undefined || v === null || String(v).trim() === '';
  });
}
