import { AccountInfo, Configuration, LogLevel } from "@azure/msal-browser";

// Auth configuration — all values must be provided explicitly per deployment.
// No hardcoded production defaults — each deployment (local/container) must provide its own values.
// These are non-secrets but must be deployment-specific.
const customerClientId =
  process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID ||
  process.env.NEXT_PUBLIC_AZURE_CLIENT_ID ||
  '';
const customerAuthority =
  process.env.NEXT_PUBLIC_ENTRA_AUTHORITY ||
  `https://login.microsoftonline.com/${
    process.env.NEXT_PUBLIC_ENTRA_TENANT_ID ||
    process.env.NEXT_PUBLIC_AZURE_TENANT_ID ||
    ''
  }`;

const customerRedirectUri =
  process.env.NEXT_PUBLIC_ENTRA_REDIRECT_URI ||
  process.env.NEXT_PUBLIC_AZURE_REDIRECT_URI ||
  '';
const customerPostLogoutRedirectUri =
  process.env.NEXT_PUBLIC_ENTRA_POST_LOGOUT_REDIRECT_URI ||
  process.env.NEXT_PUBLIC_AZURE_POST_LOGOUT_REDIRECT_URI ||
  '';

const workforceTenantId =
  process.env.NEXT_PUBLIC_WORKFORCE_ENTRA_TENANT_ID ||
  process.env.NEXT_PUBLIC_WORKFORCE_AZURE_TENANT_ID ||
  process.env.NEXT_PUBLIC_INTERNAL_ENTRA_TENANT_ID ||
  '';
const workforceClientId =
  process.env.NEXT_PUBLIC_WORKFORCE_ENTRA_CLIENT_ID ||
  process.env.NEXT_PUBLIC_WORKFORCE_AZURE_CLIENT_ID ||
  process.env.NEXT_PUBLIC_INTERNAL_ENTRA_CLIENT_ID ||
  '';
const workforceAuthority =
  process.env.NEXT_PUBLIC_WORKFORCE_ENTRA_AUTHORITY ||
  process.env.NEXT_PUBLIC_INTERNAL_ENTRA_AUTHORITY ||
  (workforceTenantId ? `https://login.microsoftonline.com/${workforceTenantId}` : '');
const workforceRedirectUri =
  process.env.NEXT_PUBLIC_WORKFORCE_ENTRA_REDIRECT_URI ||
  process.env.NEXT_PUBLIC_INTERNAL_ENTRA_REDIRECT_URI ||
  (typeof window !== 'undefined' ? window.location.origin : '');
const workforcePostLogoutRedirectUri =
  process.env.NEXT_PUBLIC_WORKFORCE_ENTRA_POST_LOGOUT_REDIRECT_URI ||
  process.env.NEXT_PUBLIC_INTERNAL_ENTRA_POST_LOGOUT_REDIRECT_URI ||
  (typeof window !== 'undefined' ? window.location.origin : '');

export const workforceApiScope =
  process.env.NEXT_PUBLIC_WORKFORCE_ADMINICULUM_API_SCOPE ||
  process.env.NEXT_PUBLIC_INTERNAL_ADMINICULUM_API_SCOPE ||
  process.env.NEXT_PUBLIC_ADMINICULUM_WORKFORCE_API_SCOPE ||
  '';

export const customerApiScope =
  process.env.NEXT_PUBLIC_ADMINICULUM_API_SCOPE || '';

export const adminiculumApiScope = workforceApiScope || customerApiScope;

export const backendBaseUrl =
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL || '';

const loggerOptions = {
  loggerCallback: (_level: LogLevel, _message: string, _containsPii: boolean) => {
    // Intentionally quiet by default; enable when needed during diagnostics.
  },
  piiLoggingEnabled: false,
  logLevel: LogLevel.Error,
};

export const workforceMsalConfig: Configuration = {
  auth: {
    clientId: workforceClientId,
    authority: workforceAuthority,
    redirectUri: workforceRedirectUri,
    postLogoutRedirectUri: workforcePostLogoutRedirectUri,
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: "sessionStorage",
  },
  system: {
    loggerOptions,
  },
};

export const customerMsalConfig: Configuration = {
  auth: {
    clientId: customerClientId,
    authority: customerAuthority,
    redirectUri: customerRedirectUri,
    postLogoutRedirectUri: customerPostLogoutRedirectUri,
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: "sessionStorage",
  },
  system: {
    loggerOptions,
  },
};

export const msalConfig = customerMsalConfig;

export const workforceApiScopes = workforceApiScope ? [workforceApiScope] : [];
export const customerApiScopes = customerApiScope ? [customerApiScope] : [];

export const loginRequest = {
  scopes: ["openid", "profile", "email", ...workforceApiScopes],
};

export const customerLoginRequest = {
  scopes: ["openid", "profile", "email", ...customerApiScopes],
};

// --- Tenant-scoped account selection ---------------------------------------
// The customer portal and the internal workforce app run in the same browser
// tab and share the sessionStorage MSAL cache, so getAllAccounts() can return
// an account from the *other* tenant. Using such an account against this
// surface's authority throws MSAL `authority_mismatch`. Select the account that
// belongs to the surface's own tenant instead of blindly taking accounts[0].

function tenantIdFromAuthority(authority: string): string {
  const m = String(authority || '').match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  return m ? m[0] : '';
}

export const customerTenantId =
  process.env.NEXT_PUBLIC_ENTRA_TENANT_ID ||
  process.env.NEXT_PUBLIC_AZURE_TENANT_ID ||
  tenantIdFromAuthority(customerAuthority);

export const resolvedWorkforceTenantId =
  workforceTenantId || tenantIdFromAuthority(workforceAuthority);

/**
 * Pick the cached account that belongs to `tenantId`. Returns null when no
 * account matches (e.g. only the other surface is signed in) so the caller
 * shows its signed-out state rather than borrowing a cross-tenant account.
 * Falls back to accounts[0] only when no tenant is configured.
 */
export function pickAccountByTenant(
  accounts: AccountInfo[] | undefined,
  tenantId: string,
): AccountInfo | null {
  if (!accounts || accounts.length === 0) return null;
  const t = String(tenantId || '').toLowerCase();
  if (!t) return accounts[0] || null;
  const match = accounts.find((a) => String(a.tenantId || '').toLowerCase() === t);
  if (match) return match;
  // homeAccountId embeds the tenant; use it as a secondary signal.
  return accounts.find((a) => String(a.homeAccountId || '').toLowerCase().includes(t)) || null;
}

