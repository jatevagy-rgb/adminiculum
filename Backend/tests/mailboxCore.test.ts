/**
 * UNIVERSAL MAILBOX — core unit tests (pure; no database, no network).
 */

import {
  VERIFICATION_MAX_ATTEMPTS,
  canResend,
  challengeExpiry,
  evaluateVerification,
  generateVerificationCode,
  verifyVerificationCode,
} from '../src/modules/mailbox/verificationCode';
import { sanitizeEmailHtml, sanitizeUrl, toPlainText } from '../src/modules/mailbox/htmlSanitizer';
import {
  buildMailboxMessageKey,
  initialSyncSince,
  normalizeInternetMessageId,
  suggestProviderFromAddress,
} from '../src/modules/mailbox/dedupe';
import { InMemorySecretStore, UnconfiguredSecretStore } from '../src/modules/mailbox/secretStore';
import { getMailboxProvider } from '../src/modules/mailbox/provider';

describe('email verification code', () => {
  it('generates a 6-digit code and verifies it against its hash', () => {
    const g = generateVerificationCode();
    expect(g.code).toMatch(/^\d{6}$/);
    expect(verifyVerificationCode(g.code, g.codeSalt, g.codeHash)).toBe(true);
    expect(verifyVerificationCode('000000', g.codeSalt, g.codeHash)).toBe(false);
  });

  it('never stores the plaintext code', () => {
    const g = generateVerificationCode();
    expect(g.codeHash).not.toContain(g.code);
    expect(g.codeHash.length).toBe(64);
  });

  it('evaluates all outcomes without collapsing them', () => {
    const g = generateVerificationCode();
    const base = { providedCode: g.code, codeSalt: g.codeSalt, codeHash: g.codeHash, maxAttempts: VERIFICATION_MAX_ATTEMPTS };
    expect(evaluateVerification({ ...base, expiresAt: challengeExpiry(), attemptCount: 0 })).toBe('VERIFIED');
    expect(evaluateVerification({ ...base, providedCode: '999999', expiresAt: challengeExpiry(), attemptCount: 0 })).toBe('INVALID_CODE');
    expect(evaluateVerification({ ...base, expiresAt: new Date(Date.now() - 1000), attemptCount: 0 })).toBe('EXPIRED');
    expect(evaluateVerification({ ...base, expiresAt: challengeExpiry(), attemptCount: 0, consumedAt: new Date() })).toBe('CONSUMED');
    expect(evaluateVerification({ ...base, expiresAt: challengeExpiry(), attemptCount: VERIFICATION_MAX_ATTEMPTS })).toBe('TOO_MANY_ATTEMPTS');
  });

  it('enforces a resend cooldown', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(canResend(new Date('2026-01-01T00:00:30Z'), now, 60)).toBe(false);
    expect(canResend(new Date('2025-12-31T23:58:00Z'), now, 60)).toBe(true);
  });
});

describe('email HTML sanitization', () => {
  it('removes scripts, event handlers and dangerous URLs', () => {
    const dirty = '<p onclick="steal()">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>';
    const clean = sanitizeEmailHtml(dirty);
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).toContain('<p>');
  });

  it('keeps safe anchors with a hardened rel', () => {
    const clean = sanitizeEmailHtml('<a href="https://example.com/x">link</a>');
    expect(clean).toContain('href="https://example.com/x"');
    expect(clean).toContain('rel="noopener noreferrer nofollow"');
  });

  it('rejects unsafe URL schemes', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeUrl('data:text/html;base64,AAAA')).toBeNull();
    expect(sanitizeUrl('https://ok.example')).toBe('https://ok.example');
  });

  it('provides a plain-text fallback', () => {
    const text = toPlainText('<p>Hello <b>world</b></p><br/>Bye');
    expect(text).toContain('Hello world');
    expect(text).toContain('Bye');
    expect(text).not.toContain('<');
  });
});

describe('mailbox dedupe + provider hints', () => {
  it('scopes message identity to the connection', () => {
    expect(buildMailboxMessageKey('conn-a', 'msg-1')).toBe('conn-a::msg-1');
    expect(buildMailboxMessageKey('conn-b', 'msg-1')).not.toBe(buildMailboxMessageKey('conn-a', 'msg-1'));
    expect(buildMailboxMessageKey('conn-a', '')).toBeNull();
  });

  it('normalizes Internet Message-IDs', () => {
    expect(normalizeInternetMessageId('<abc@example.com>')).toBe('abc@example.com');
    expect(normalizeInternetMessageId('')).toBeNull();
  });

  it('suggests providers only from well-known consumer domains', () => {
    expect(suggestProviderFromAddress('a@gmail.com')).toBe('GOOGLE_GMAIL');
    expect(suggestProviderFromAddress('a@outlook.com')).toBe('MICROSOFT_GRAPH');
    expect(suggestProviderFromAddress('a@firm.hu')).toBeNull();
  });

  it('bounds the initial sync window', () => {
    const since = initialSyncSince(new Date('2026-02-01T00:00:00Z'), 30);
    expect(since.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });
});

describe('secret storage fails closed', () => {
  it('unconfigured store throws instead of storing', async () => {
    const store = new UnconfiguredSecretStore();
    await expect(store.put('ref', { kind: 'OAUTH2', accessToken: 'x' })).rejects.toThrow(/NOT_CONFIGURED/);
  });

  it('in-memory store round-trips (test only)', async () => {
    const store = new InMemorySecretStore();
    await store.put('ref-1', { kind: 'OAUTH2', refreshToken: 'r' });
    expect((await store.get('ref-1'))?.refreshToken).toBe('r');
    await store.delete('ref-1');
    expect(await store.get('ref-1')).toBeNull();
  });
});

describe('provider registry', () => {
  it('maps canonical provider codes to adapters', () => {
    expect(getMailboxProvider('MICROSOFT_GRAPH').code).toBe('MICROSOFT_GRAPH');
    expect(getMailboxProvider('GOOGLE_GMAIL').code).toBe('GOOGLE_GMAIL');
    expect(getMailboxProvider('IMAP_SMTP').code).toBe('IMAP_SMTP');
  });

  it('generic IMAP/SMTP fails closed without a secret store', async () => {
    await expect(
      getMailboxProvider('IMAP_SMTP').listMessagesSinceCursor({ secret: { kind: 'IMAP_SMTP' }, cursor: null, maxMessages: 10 }),
    ).rejects.toThrow(/NOT_CONFIGURED/);
  });

  it('delegated OAuth URL construction requires real provider configuration', () => {
    const prev = { id: process.env.MICROSOFT_MAILBOX_CLIENT_ID };
    delete process.env.MICROSOFT_MAILBOX_CLIENT_ID;
    expect(() => getMailboxProvider('MICROSOFT_GRAPH').buildAuthorizationUrl({ state: 's', redirectUri: 'https://app/cb' })).toThrow(/NOT_CONFIGURED/);
    if (prev.id) process.env.MICROSOFT_MAILBOX_CLIENT_ID = prev.id;
  });
});
