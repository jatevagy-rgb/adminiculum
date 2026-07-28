import { backendBaseUrl } from './authConfig';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backendBaseUrl}/api/v1/client-identity${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!response.ok) throw new Error('CLIENT_IDENTITY_REQUEST_FAILED');
  return response.json() as Promise<T>;
}

export type ClientIdentityProviderConfig = {
  provider: string;
  passwordHandledByProvider: boolean;
  storesPasswords: boolean;
  routes: Record<string, string>;
};

export function getClientIdentityProviderConfig() {
  return request<ClientIdentityProviderConfig>('/provider-config');
}

export function validateInvitation(token: string) {
  return request<{ valid: boolean; invitationId?: string; status?: string }>('/invitations/validate', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}
