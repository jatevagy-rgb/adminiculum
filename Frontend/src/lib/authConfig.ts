import { Configuration, LogLevel } from "@azure/msal-browser";

// Auth configuration — all values must be provided explicitly per deployment.
// No hardcoded production defaults — each deployment (local/container) must provide its own values.
// These are non-secrets but must be deployment-specific.
const clientId = process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID || '';
const authority =
  process.env.NEXT_PUBLIC_ENTRA_AUTHORITY ||
  `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_ENTRA_TENANT_ID || ''}`;

const redirectUri = process.env.NEXT_PUBLIC_ENTRA_REDIRECT_URI || '';
const postLogoutRedirectUri =
  process.env.NEXT_PUBLIC_ENTRA_POST_LOGOUT_REDIRECT_URI || '';

export const adminiculumApiScope =
  process.env.NEXT_PUBLIC_ADMINICULUM_API_SCOPE || '';

export const backendBaseUrl =
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL || '';

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority,
    redirectUri,
    postLogoutRedirectUri,
  },
  cache: {
    cacheLocation: "sessionStorage",
  },
  system: {
    loggerOptions: {
      loggerCallback: (_level, _message, _containsPii) => {
        // Intentionally quiet by default; enable when needed during diagnostics.
      },
      piiLoggingEnabled: false,
      logLevel: LogLevel.Error,
    },
  },
};

export const loginRequest = {
  scopes: ["openid", "profile", "email", adminiculumApiScope],
};

