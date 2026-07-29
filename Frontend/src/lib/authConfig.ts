import { Configuration, LogLevel } from "@azure/msal-browser";

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

