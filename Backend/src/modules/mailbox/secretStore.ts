/**
 * UNIVERSAL MAILBOX — secure secret storage adapter (hard requirement).
 *
 * User provider tokens and IMAP/SMTP credentials must never be stored in
 * Prisma JSON, logs, or Git. Prisma stores only an opaque `secretReference`.
 *
 * There is no production dynamic secret store in this repository yet. Rather
 * than fake "encryption" with a hard-coded application key, the default is an
 * Unconfigured store that fails closed, and credential-based generic IMAP/SMTP
 * remains feature-gated until a real store (e.g. Azure Key Vault) is wired.
 */

import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import type { MailboxSecretPayload } from './types';

export interface SecretStore {
  readonly kind: string;
  put(reference: string, payload: MailboxSecretPayload): Promise<void>;
  get(reference: string): Promise<MailboxSecretPayload | null>;
  delete(reference: string): Promise<void>;
}

export class SecretStoreNotConfiguredError extends Error {
  readonly code = 'MAILBOX_SECRET_STORE_NOT_CONFIGURED';
  constructor() {
    super('MAILBOX_SECRET_STORE_NOT_CONFIGURED: no production secret store is configured; credential-based mailbox storage is disabled.');
  }
}

/** Fails closed. Used whenever no production-safe store is configured. */
export class UnconfiguredSecretStore implements SecretStore {
  readonly kind = 'UNCONFIGURED';
  async put(_reference: string, _payload: MailboxSecretPayload): Promise<void> {
    throw new SecretStoreNotConfiguredError();
  }
  async get(_reference: string): Promise<MailboxSecretPayload | null> {
    throw new SecretStoreNotConfiguredError();
  }
  async delete(_reference: string): Promise<void> {
    throw new SecretStoreNotConfiguredError();
  }
}

/** Test-only in-memory store. Never select this in production. */
export class InMemorySecretStore implements SecretStore {
  readonly kind = 'MEMORY';
  private readonly map = new Map<string, string>();
  async put(reference: string, payload: MailboxSecretPayload): Promise<void> {
    this.map.set(reference, JSON.stringify(payload));
  }
  async get(reference: string): Promise<MailboxSecretPayload | null> {
    const raw = this.map.get(reference);
    return raw ? (JSON.parse(raw) as MailboxSecretPayload) : null;
  }
  async delete(reference: string): Promise<void> {
    this.map.delete(reference);
  }
}

/** Azure Key Vault implementation. References are opaque names, never values. */
export class AzureKeyVaultSecretStore implements SecretStore {
  readonly kind = 'AZURE_KEY_VAULT';
  private readonly client: SecretClient;
  constructor(vaultUrl: string, credential = new DefaultAzureCredential()) {
    this.client = new SecretClient(vaultUrl, credential);
  }
  private name(reference: string): string {
    const value = String(reference || '').replace(/^azure-keyvault:/, '');
    if (!/^mailbox-[a-z0-9-]{1,120}$/i.test(value)) throw new Error('MAILBOX_SECRET_REFERENCE_INVALID');
    return value;
  }
  async put(reference: string, payload: MailboxSecretPayload): Promise<void> {
    await this.client.setSecret(this.name(reference), JSON.stringify(payload));
  }
  async get(reference: string): Promise<MailboxSecretPayload | null> {
    const item = await this.client.getSecret(this.name(reference));
    if (!item.value) return null;
    try { return JSON.parse(item.value) as MailboxSecretPayload; } catch { throw new Error('MAILBOX_SECRET_INVALID'); }
  }
  async delete(reference: string): Promise<void> {
    await this.client.beginDeleteSecret(this.name(reference));
  }
}

// Test seam only. Production store selection remains environment-driven.
let testSecretStore: SecretStore | null = null;
export function setSecretStoreForTest(store: SecretStore | null): void {
  testSecretStore = store;
}

export function isSecretStoreConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const kind = String(env.MAILBOX_SECRET_STORE || '').trim().toLowerCase();
  if (kind === 'azure-keyvault') return Boolean(String(env.MAILBOX_KEYVAULT_URL || '').trim());
  return false;
}

/**
 * Resolves the configured secret store. Production is expected to provide an
 * Azure Key Vault-backed implementation (registered by the platform); until
 * then this returns the fail-closed store.
 */
export function getSecretStore(env: NodeJS.ProcessEnv = process.env): SecretStore {
  if (testSecretStore) return testSecretStore;
  const kind = String(env.MAILBOX_SECRET_STORE || '').trim().toLowerCase();
  if (kind === 'azure-keyvault' && String(env.MAILBOX_KEYVAULT_URL || '').trim()) {
    return new AzureKeyVaultSecretStore(String(env.MAILBOX_KEYVAULT_URL).trim());
  }
  return new UnconfiguredSecretStore();
}
