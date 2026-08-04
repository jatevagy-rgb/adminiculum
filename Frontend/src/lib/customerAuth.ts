"use client";

/**
 * Canonical customer authentication action layer.
 *
 * Every customer-facing entry surface (login / register / password reset /
 * logout / API token) goes through this hook so there is a single MSAL instance,
 * a single redirect URI and API scope (from authConfig), and one place that
 * handles the provider-not-configured and interaction-in-progress states.
 *
 * The External ID hosted flow performs sign-up, sign-in, e-mail verification and
 * password reset. Adminiculum collects no password or verification code here.
 */
import { useCallback } from 'react';
import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError, InteractionStatus } from '@azure/msal-browser';
import { customerApiScopes, customerLoginRequest, customerMsalConfig, customerTenantId, pickAccountByTenant } from './authConfig';
import { clearAuthToken, setAuthToken } from './api';
import {
  REGISTRATION_PROMPT,
  customerPostLogoutRedirectUri,
  evaluateCustomerProvider,
  isProductionRuntime,
} from './customerAuthPolicy';

/** Whether the customer identity provider is usable in the current runtime. */
export function isCustomerProviderConfigured(): boolean {
  return evaluateCustomerProvider({
    clientId: customerMsalConfig.auth.clientId,
    authority: customerMsalConfig.auth.authority,
    isProduction: isProductionRuntime(),
  }).configured;
}

const registrationRequest = { ...customerLoginRequest, prompt: REGISTRATION_PROMPT };
// External ID combines password reset into the same hosted sign-in journey
// ("Elfelejtette a jelszavát?" on the provider page), so reset re-enters it.
const passwordResetRequest = { ...customerLoginRequest };

export interface CustomerAuth {
  configured: boolean;
  interactionInProgress: boolean;
  isAuthenticated: boolean;
  beginCustomerLogin: (mode?: 'normal' | 'reauthenticate') => Promise<void>;
  beginCustomerRegistration: () => Promise<void>;
  beginPasswordReset: () => Promise<void>;
  logoutCustomer: () => Promise<void>;
  acquireCustomerApiToken: () => Promise<string | null>;
}

export function useCustomerAuth(): CustomerAuth {
  const { instance, inProgress, accounts } = useMsal();
  const account = pickAccountByTenant(accounts, customerTenantId);
  const configured = isCustomerProviderConfigured();
  const interactionInProgress = inProgress !== InteractionStatus.None;

  const beginCustomerLogin = useCallback(async (mode: 'normal' | 'reauthenticate' = 'normal') => {
    if (!configured || interactionInProgress) return;
    await instance.loginRedirect(mode === 'reauthenticate' ? { ...customerLoginRequest, prompt: 'login' } : customerLoginRequest);
  }, [configured, interactionInProgress, instance]);

  const beginCustomerRegistration = useCallback(async () => {
    if (!configured || interactionInProgress) return;
    await instance.loginRedirect(registrationRequest);
  }, [configured, interactionInProgress, instance]);

  const beginPasswordReset = useCallback(async () => {
    if (!configured || interactionInProgress) return;
    await instance.loginRedirect(passwordResetRequest);
  }, [configured, interactionInProgress, instance]);

  const logoutCustomer = useCallback(async () => {
    clearAuthToken('customer');
    await instance.logoutRedirect({
      account: account || undefined,
      postLogoutRedirectUri: customerPostLogoutRedirectUri(window.location.origin),
    });
  }, [account, instance]);

  const acquireCustomerApiToken = useCallback(async (): Promise<string | null> => {
    if (!account) return null;
    try {
      const res = await instance.acquireTokenSilent({ account, scopes: customerApiScopes });
      setAuthToken(res.accessToken, 'customer');
      return res.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        await instance.acquireTokenRedirect({ account, scopes: customerApiScopes });
        return null;
      }
      throw error;
    }
  }, [account, instance]);

  return {
    configured,
    interactionInProgress,
    isAuthenticated: Boolean(account),
    beginCustomerLogin,
    beginCustomerRegistration,
    beginPasswordReset,
    logoutCustomer,
    acquireCustomerApiToken,
  };
}
