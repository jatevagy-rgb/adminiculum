/**
 * UNIVERSAL MAILBOX — deterministic identity + provider hints (pure).
 *
 * Dedupe identity is scoped to a mailbox connection so that identical
 * Internet Message-IDs in unrelated mailboxes never collapse into one row.
 */

import type { MailboxProviderCode } from './types';

export function normalizeMailboxAddress(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

const PROVIDER_DOMAIN_HINTS: Record<string, MailboxProviderCode> = {
  'gmail.com': 'GOOGLE_GMAIL',
  'googlemail.com': 'GOOGLE_GMAIL',
  'outlook.com': 'MICROSOFT_GRAPH',
  'hotmail.com': 'MICROSOFT_GRAPH',
  'live.com': 'MICROSOFT_GRAPH',
  'msn.com': 'MICROSOFT_GRAPH',
};

/** Convenience suggestion only; never authoritative. */
export function suggestProviderFromAddress(email: string): MailboxProviderCode | null {
  const domain = normalizeMailboxAddress(email).split('@')[1] ?? '';
  return PROVIDER_DOMAIN_HINTS[domain] ?? null;
}

/**
 * Deterministic per-connection dedupe identity. Returns null when the provider
 * message id is missing (cannot safely dedupe).
 */
export function buildMailboxMessageKey(connectionId: string, providerMessageId: string | null | undefined): string | null {
  const cid = String(connectionId ?? '').trim();
  const pmid = String(providerMessageId ?? '').trim();
  if (!cid || !pmid) return null;
  return `${cid}::${pmid}`;
}

/** Normalizes an Internet Message-ID for standards-based threading. */
export function normalizeInternetMessageId(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  return raw.replace(/^<|>$/g, '');
}

/** Bounded initial sync window: latest N messages or last D days (never full mailbox). */
export const DEFAULT_INITIAL_SYNC_MAX_MESSAGES = 250;
export const DEFAULT_INITIAL_SYNC_WINDOW_DAYS = 30;

export function initialSyncSince(now: Date = new Date(), windowDays: number = DEFAULT_INITIAL_SYNC_WINDOW_DAYS): Date {
  return new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
}
