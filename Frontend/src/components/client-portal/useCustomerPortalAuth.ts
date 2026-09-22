"use client";

import { useEffect, useState } from 'react';
import { InteractionRequiredAuthError, InteractionStatus } from '@azure/msal-browser';
import { useMsal } from '@azure/msal-react';
import { customerApiScopes, customerTenantId, pickAccountByTenant } from '@/lib/authConfig';
import { setAuthToken } from '@/lib/api';
import { isCustomerProviderConfigured } from '@/lib/customerAuth';

export type CustomerAuthState = 'loading' | 'login' | 'ready' | 'error';

/**
 * Establish the customer portal auth token using the canonical customer MSAL
 * account + scopes (mirrors ClientPortalShell). Returns 'login' when no customer
 * account is present, 'ready' once a token is set, and triggers the standard
 * redirect on InteractionRequiredAuthError.
 */
export function useCustomerPortalAuth(): CustomerAuthState {
  const { instance, accounts, inProgress } = useMsal();
  const account = pickAccountByTenant(accounts, customerTenantId);
  // Same fail-closed provider policy as ClientPortalShell: an unconfigured
  // customer External ID provider never starts a silent acquisition or an
  // interactive Microsoft redirect on any customer route.
  const providerConfigured = isCustomerProviderConfigured();
  const [state, setState] = useState<CustomerAuthState>('loading');

  useEffect(() => {
    let cancelled = false;
    async function acquire() {
      if (!providerConfigured) { setState('error'); return; }
      if (!account) { setState('login'); return; }
      if (inProgress !== InteractionStatus.None) return;
      try {
        const token = await instance.acquireTokenSilent({ account, scopes: customerApiScopes });
        setAuthToken(token.accessToken, 'customer');
        if (!cancelled) setState('ready');
      } catch (error) {
        if (error instanceof InteractionRequiredAuthError) {
          await instance.acquireTokenRedirect({ account, scopes: customerApiScopes });
          return;
        }
        if (!cancelled) setState('error');
      }
    }
    acquire();
    return () => { cancelled = true; };
  }, [account, inProgress, instance, providerConfigured]);

  return state;
}
