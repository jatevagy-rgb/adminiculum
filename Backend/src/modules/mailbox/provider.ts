/**
 * UNIVERSAL MAILBOX — provider adapter interface + adapters.
 *
 * One abstraction; routes/services must never branch on provider code.
 *
 * IMPORTANT: delegated Microsoft/Google implementations below are
 * code-complete but NOT live-verified — they require production OAuth app
 * configuration. Generic IMAP/SMTP is feature-gated behind a real secret store
 * and fails closed. Email verification is separate from mailbox authorization.
 */

import type { MailboxProviderCode, MailboxSecretPayload } from './types';
import { SecretStoreNotConfiguredError } from './secretStore';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { toPlainText } from './htmlSanitizer';

export interface MailboxAttachmentMeta {
  providerAttachmentId: string;
  fileName: string;
  contentType?: string | null;
  sizeBytes?: number | null;
}

export interface MailboxMessage {
  providerMessageId: string;
  internetMessageId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  direction: 'INBOUND' | 'OUTBOUND';
  from: { name?: string | null; email: string };
  to: Array<{ name?: string | null; email: string }>;
  cc: Array<{ name?: string | null; email: string }>;
  bcc?: Array<{ name?: string | null; email: string }>;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  receivedAt?: Date | null;
  sentAt?: Date | null;
  providerConversationId?: string | null;
  attachments: MailboxAttachmentMeta[];
}

export interface MailboxAuthorizationResult {
  secret: MailboxSecretPayload;
  providerAccountId?: string;
  providerTenantId?: string;
  authorizedAddress?: string;
  /**
   * Authoritative set of exact email identities the provider attributes to the
   * authorizing account (primary + verified SMTP aliases). Additive and optional:
   * providers that expose a single identity keep using `authorizedAddress`.
   */
  authorizedAddresses?: string[];
  scopesGranted?: string;
}

export interface MailboxProviderAdapter {
  readonly code: MailboxProviderCode;
  readonly displayName: string;
  /** Whether the provider requires production OAuth configuration. */
  readonly requiresProviderConfiguration: boolean;
  buildAuthorizationUrl(input: { state: string; codeChallenge?: string; redirectUri: string }): string;
  exchangeAuthorizationCode(input: {
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<MailboxAuthorizationResult>;
  listMessagesSinceCursor(input: {
    secret: MailboxSecretPayload;
    cursor: string | null;
    maxMessages: number;
  }): Promise<{ messages: MailboxMessage[]; nextCursor: string | null }>;
  sendMessage(input: {
    secret: MailboxSecretPayload;
    to: Array<{ name?: string | null; email: string }>;
    cc?: Array<{ name?: string | null; email: string }>;
    bcc?: Array<{ name?: string | null; email: string }>;
    subject: string;
    bodyText: string;
    bodyHtml?: string | null;
    inReplyTo?: string | null;
    references?: string | null;
  }): Promise<{ providerMessageId: string; internetMessageId?: string | null; providerConversationId?: string | null }>;
  refreshAuthorization(secret: MailboxSecretPayload): Promise<MailboxSecretPayload>;
  disconnect(secret: MailboxSecretPayload): Promise<void>;
}

function env(name: string): string {
  return String(process.env[name] || '').trim();
}

function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new Error(`MAILBOX_PROVIDER_NOT_CONFIGURED:${name}`);
  return v;
}

export const MICROSOFT_REQUIRED_SCOPES = ['offline_access', 'User.Read', 'Mail.Read', 'Mail.Send'] as const;

function microsoftScopes(): string {
  const scopes = (env('MICROSOFT_MAILBOX_SCOPES') || MICROSOFT_REQUIRED_SCOPES.join(' ')).split(/\s+/).filter(Boolean);
  const missing = MICROSOFT_REQUIRED_SCOPES.filter((required) => !scopes.includes(required));
  if (missing.length) throw new Error(`MAILBOX_MICROSOFT_SCOPES_INSUFFICIENT:${missing.join(',')}`);
  return scopes.join(' ');
}

export function mailboxProviderConfigStatus() {
  return {
    microsoft: Boolean(env('MICROSOFT_MAILBOX_CLIENT_ID') && env('MICROSOFT_MAILBOX_REDIRECT_URI')),
    google: Boolean(env('GOOGLE_MAILBOX_CLIENT_ID') && env('GOOGLE_MAILBOX_REDIRECT_URI')),
    microsoftScopes: microsoftScopes(),
    googleScopes: env('GOOGLE_MAILBOX_SCOPES') || 'openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
  };
}

// ---------------------------------------------------------------------------
// Microsoft Graph (delegated)
// ---------------------------------------------------------------------------

const MICROSOFT_SMTP_PROXY_PREFIX = 'SMTP';
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

function isEmailShaped(value: string): boolean {
  return EMAIL_SHAPE.test(value);
}

/**
 * Microsoft reports mailbox aliases as `proxyAddresses` entries carrying an
 * address TYPE prefix (`SMTP:`, `smtp:`, `X500:`, `SIP:`, `SPO:`, ...). Only the
 * SMTP family proves an email identity of the SAME mailbox; every other type and
 * every malformed value is ignored, so this can never widen acceptance beyond
 * Microsoft-asserted SMTP addresses.
 */
export function parseMicrosoftSmtpProxyAddresses(proxyAddresses: unknown): string[] {
  if (!Array.isArray(proxyAddresses)) return [];
  const out: string[] = [];
  for (const entry of proxyAddresses) {
    if (typeof entry !== 'string') continue;
    const separator = entry.indexOf(':');
    if (separator <= 0) continue;
    // `SMTP:` and `smtp:` both count; any other prefix is a different identity type.
    if (entry.slice(0, separator).toUpperCase() !== MICROSOFT_SMTP_PROXY_PREFIX) continue;
    const candidate = entry.slice(separator + 1).trim();
    if (!isEmailShaped(candidate)) continue;
    out.push(candidate);
  }
  return out;
}

/**
 * Builds the authoritative address set for the authorizing Microsoft identity:
 * mail, userPrincipalName, plus SMTP/SMTP-alias proxies. Values are returned as
 * Microsoft supplied them; callers compare with the canonical mailbox-address
 * normalization, so no client input is ever trusted here.
 */
export function microsoftIdentityAddressSet(profile: {
  mail?: string | null;
  userPrincipalName?: string | null;
  proxyAddresses?: unknown;
}): string[] {
  const out: string[] = [];
  const push = (value: unknown): void => {
    const candidate = typeof value === 'string' ? value.trim() : '';
    if (candidate && isEmailShaped(candidate)) out.push(candidate);
  };
  push(profile.mail);
  push(profile.userPrincipalName);
  for (const alias of parseMicrosoftSmtpProxyAddresses(profile.proxyAddresses)) out.push(alias);
  return [...new Set(out)];
}

export class MicrosoftGraphMailboxProvider implements MailboxProviderAdapter {
  readonly code: MailboxProviderCode = 'MICROSOFT_GRAPH';
  readonly displayName = 'Microsoft 365';
  readonly requiresProviderConfiguration = true;

  buildAuthorizationUrl(input: { state: string; codeChallenge?: string; redirectUri: string }): string {
    const clientId = requireEnv('MICROSOFT_MAILBOX_CLIENT_ID');
    const scopes = microsoftScopes();
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: input.redirectUri,
      response_mode: 'query',
      scope: scopes,
      state: input.state,
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async exchangeAuthorizationCode(input: { code: string; redirectUri: string; codeVerifier?: string }): Promise<MailboxAuthorizationResult> {
    microsoftScopes();
    const body = new URLSearchParams({
      client_id: requireEnv('MICROSOFT_MAILBOX_CLIENT_ID'),
      client_secret: requireEnv('MICROSOFT_MAILBOX_CLIENT_SECRET'),
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
    });
    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error('MAILBOX_OAUTH_EXCHANGE_FAILED');
    const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
    if (!json.access_token) throw new Error('MAILBOX_OAUTH_EXCHANGE_FAILED');
    const identity = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName,proxyAddresses', {
      headers: { authorization: `Bearer ${json.access_token}` },
    });
    if (!identity.ok) throw new Error('MAILBOX_PROVIDER_IDENTITY_UNAVAILABLE');
    const profile = (await identity.json()) as {
      mail?: string | null;
      userPrincipalName?: string | null;
      proxyAddresses?: unknown;
      id?: string;
    };
    const authorizedAddresses = microsoftIdentityAddressSet(profile);
    const authorizedAddress =
      String(profile.mail || profile.userPrincipalName || '').trim() || authorizedAddresses[0] || '';
    if (!authorizedAddress) throw new Error('MAILBOX_PROVIDER_IDENTITY_UNAVAILABLE');
    return {
      secret: {
        kind: 'OAUTH2',
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : undefined,
        scope: json.scope,
      },
      authorizedAddress,
      authorizedAddresses,
      providerAccountId: profile.id,
    };
  }

  async listMessagesSinceCursor(input: { secret: MailboxSecretPayload; cursor: string | null; maxMessages: number }) {
    const token = input.secret.accessToken;
    if (!token) throw new Error('MAILBOX_AUTHORIZATION_REQUIRED');
    const top = Math.min(Math.max(input.maxMessages, 1), 250);
    const cursor = input.cursor?.startsWith('{')
      ? JSON.parse(input.cursor) as { inbox?: string | null; sent?: string | null }
      : { inbox: input.cursor, sent: null };
    const select = 'id,internetMessageId,conversationId,subject,receivedDateTime,sentDateTime,from,toRecipients,ccRecipients,bccRecipients,body,hasAttachments,internetMessageHeaders';
    const pages = await Promise.all([
      this.fetchGraphPage(token, cursor.inbox ?? `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=${Math.ceil(top / 2)}&$select=${select}`, 'INBOUND'),
      this.fetchGraphPage(token, cursor.sent ?? `https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?$top=${Math.ceil(top / 2)}&$select=${select}`, 'OUTBOUND'),
    ]);
    const messages: MailboxMessage[] = pages.flatMap((page) => page.messages).slice(0, top);
    const nextCursor = pages.some((page) => page.nextCursor)
      ? JSON.stringify({ inbox: pages[0].nextCursor, sent: pages[1].nextCursor })
      : null;
    return { messages, nextCursor };
  }

  private async fetchGraphPage(token: string, url: string, direction: 'INBOUND' | 'OUTBOUND') {
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'MAILBOX_AUTHORIZATION_REQUIRED' : 'MAILBOX_PROVIDER_READ_FAILED');
    const json = (await res.json()) as { value?: Array<Record<string, unknown>>; '@odata.nextLink'?: string };
    const messages: MailboxMessage[] = (json.value ?? []).map((m) => {
      const body = (m.body as { contentType?: string; content?: string } | undefined) ?? {};
      const bodyContent = String(body.content ?? '');
      const headers = new Map(
        ((m.internetMessageHeaders as Array<{ name?: string; value?: string }> | undefined) ?? [])
          .map((header) => [String(header.name ?? '').toLowerCase(), String(header.value ?? '')]),
      );
      const bodyHtml = body.contentType?.toLowerCase() === 'html' ? bodyContent : null;
      return {
        providerMessageId: String(m.id),
        internetMessageId: (m.internetMessageId as string) ?? null,
        inReplyTo: headers.get('in-reply-to') ?? null,
        references: headers.get('references') ?? null,
        direction,
        from: { email: String((m.from as any)?.emailAddress?.address ?? ''), name: (m.from as any)?.emailAddress?.name ?? null },
        to: ((m.toRecipients as any[]) ?? []).map((r) => ({ email: String(r?.emailAddress?.address ?? ''), name: r?.emailAddress?.name ?? null })),
        cc: ((m.ccRecipients as any[]) ?? []).map((r) => ({ email: String(r?.emailAddress?.address ?? ''), name: r?.emailAddress?.name ?? null })),
        bcc: ((m.bccRecipients as any[]) ?? []).map((r) => ({ email: String(r?.emailAddress?.address ?? ''), name: r?.emailAddress?.name ?? null })),
        subject: String(m.subject ?? ''),
        bodyText: body.contentType?.toLowerCase() === 'text' ? bodyContent : toPlainText(bodyHtml),
        bodyHtml,
        receivedAt: m.receivedDateTime ? new Date(String(m.receivedDateTime)) : null,
        sentAt: m.sentDateTime ? new Date(String(m.sentDateTime)) : null,
        providerConversationId: (m.conversationId as string) ?? null,
        attachments: [],
      };
    });
    return { messages, nextCursor: json['@odata.nextLink'] ?? null };
  }

  async sendMessage(input: {
    secret: MailboxSecretPayload;
    to: Array<{ name?: string | null; email: string }>;
    cc?: Array<{ name?: string | null; email: string }>;
    bcc?: Array<{ name?: string | null; email: string }>;
    subject: string;
    bodyText: string;
    bodyHtml?: string | null;
    inReplyTo?: string | null;
    references?: string | null;
  }) {
    const token = input.secret.accessToken;
    if (!token) throw new Error('MAILBOX_AUTHORIZATION_REQUIRED');
    const internetMessageHeaders = [
      ...(input.inReplyTo ? [{ name: 'In-Reply-To', value: input.inReplyTo }] : []),
      ...(input.references ? [{ name: 'References', value: input.references }] : []),
    ];
    const draftRes = await fetch('https://graph.microsoft.com/v1.0/me/messages', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: { contentType: input.bodyHtml ? 'HTML' : 'Text', content: input.bodyHtml || input.bodyText },
          toRecipients: input.to.map((r) => ({ emailAddress: { address: r.email, name: r.name ?? undefined } })),
          ccRecipients: (input.cc ?? []).map((r) => ({ emailAddress: { address: r.email, name: r.name ?? undefined } })),
          bccRecipients: (input.bcc ?? []).map((r) => ({ emailAddress: { address: r.email, name: r.name ?? undefined } })),
          ...(internetMessageHeaders.length > 0 ? { internetMessageHeaders } : {}),
        },
      }),
    });
    if (!draftRes.ok) throw new Error(draftRes.status === 401 || draftRes.status === 403 ? 'MAILBOX_AUTHORIZATION_REQUIRED' : 'MAILBOX_PROVIDER_SEND_FAILED');
    const draft = (await draftRes.json()) as { id?: string; internetMessageId?: string | null; conversationId?: string | null };
    if (!draft.id) throw new Error('MAILBOX_PROVIDER_SEND_FAILED');
    const sendRes = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draft.id)}/send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    if (!sendRes.ok) throw new Error(sendRes.status === 401 || sendRes.status === 403 ? 'MAILBOX_AUTHORIZATION_REQUIRED' : 'MAILBOX_PROVIDER_SEND_FAILED');
    return { providerMessageId: draft.id, internetMessageId: draft.internetMessageId ?? null, providerConversationId: draft.conversationId ?? null };
  }

  async refreshAuthorization(secret: MailboxSecretPayload): Promise<MailboxSecretPayload> {
    if (!secret.refreshToken) throw new Error('MAILBOX_AUTHORIZATION_REQUIRED');
    const body = new URLSearchParams({
      client_id: requireEnv('MICROSOFT_MAILBOX_CLIENT_ID'),
      client_secret: requireEnv('MICROSOFT_MAILBOX_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: secret.refreshToken,
    });
    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error('MAILBOX_AUTHORIZATION_EXPIRED');
    const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    return {
      ...secret,
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? secret.refreshToken,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : undefined,
    };
  }

  async disconnect(secret: MailboxSecretPayload): Promise<void> {
    // Best-effort revoke; callers delete the stored secret regardless.
    if (!secret.refreshToken) return;
    await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/logout', { method: 'GET' }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Google Gmail (delegated)
// ---------------------------------------------------------------------------

type GmailPayload = {
  mimeType?: string;
  body?: { data?: string };
  headers?: Array<{ name: string; value: string }>;
  parts?: GmailPayload[];
};

function decodeGmailBody(value: string | undefined): string {
  if (!value) return '';
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function gmailBody(payload: GmailPayload | undefined): { contentType: string; content: string } {
  if (!payload) return { contentType: '', content: '' };
  if (payload.body?.data) return { contentType: String(payload.mimeType ?? ''), content: decodeGmailBody(payload.body.data) };
  for (const part of payload.parts ?? []) {
    const body = gmailBody(part);
    if (body.content) return body;
  }
  return { contentType: '', content: '' };
}

export class GmailMailboxProvider implements MailboxProviderAdapter {
  readonly code: MailboxProviderCode = 'GOOGLE_GMAIL';
  readonly displayName = 'Google Gmail';
  readonly requiresProviderConfiguration = true;

  buildAuthorizationUrl(input: { state: string; codeChallenge?: string; redirectUri: string }): string {
    const params = new URLSearchParams({
      client_id: requireEnv('GOOGLE_MAILBOX_CLIENT_ID'),
      response_type: 'code',
      redirect_uri: input.redirectUri,
      scope: env('GOOGLE_MAILBOX_SCOPES') || 'openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
      access_type: 'offline',
      prompt: 'consent',
      state: input.state,
      ...(input.codeChallenge ? { code_challenge: input.codeChallenge, code_challenge_method: 'S256' } : {}),
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeAuthorizationCode(input: { code: string; redirectUri: string; codeVerifier?: string }): Promise<MailboxAuthorizationResult> {
    const body = new URLSearchParams({
      client_id: requireEnv('GOOGLE_MAILBOX_CLIENT_ID'),
      client_secret: requireEnv('GOOGLE_MAILBOX_CLIENT_SECRET'),
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      ...(input.codeVerifier ? { code_verifier: input.codeVerifier } : {}),
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error('MAILBOX_OAUTH_EXCHANGE_FAILED');
    const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
    if (!json.access_token) throw new Error('MAILBOX_OAUTH_EXCHANGE_FAILED');
    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { authorization: `Bearer ${json.access_token}` },
    });
    if (!profileRes.ok) throw new Error('MAILBOX_PROVIDER_IDENTITY_UNAVAILABLE');
    const profile = (await profileRes.json()) as { emailAddress?: string };
    const authorizedAddress = String(profile.emailAddress || '').trim();
    if (!authorizedAddress) throw new Error('MAILBOX_PROVIDER_IDENTITY_UNAVAILABLE');
    return {
      secret: {
        kind: 'OAUTH2',
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : undefined,
        scope: json.scope,
      },
      authorizedAddress,
    };
  }

  async listMessagesSinceCursor(input: { secret: MailboxSecretPayload; cursor: string | null; maxMessages: number }) {
    const token = input.secret.accessToken;
    if (!token) throw new Error('MAILBOX_AUTHORIZATION_REQUIRED');
    const max = Math.min(Math.max(input.maxMessages, 1), 250);
    const listUrl = input.cursor
      ? `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&pageToken=${encodeURIComponent(input.cursor)}`
      : `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}`;
    const res = await fetch(listUrl, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'MAILBOX_AUTHORIZATION_REQUIRED' : 'MAILBOX_PROVIDER_READ_FAILED');
    const list = (await res.json()) as { messages?: Array<{ id: string }>; nextPageToken?: string };
    const messages: MailboxMessage[] = [];
    for (const item of list.messages ?? []) {
      const getRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!getRes.ok) {
        if (getRes.status === 401 || getRes.status === 403) throw new Error('MAILBOX_AUTHORIZATION_REQUIRED');
        continue;
      }
      const m = (await getRes.json()) as { id: string; threadId?: string; snippet?: string; internalDate?: string; payload?: GmailPayload };
      const headers = new Map((m.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
      const body = gmailBody(m.payload);
      const bodyHtml = body.contentType.toLowerCase() === 'text/html' ? body.content : null;
      messages.push({
        providerMessageId: m.id,
        internetMessageId: headers.get('message-id') ?? null,
        inReplyTo: headers.get('in-reply-to') ?? null,
        references: headers.get('references') ?? null,
        direction: 'INBOUND',
        from: { email: headers.get('from') ?? '' },
        to: headers.get('to') ? [{ email: headers.get('to') as string }] : [],
        cc: headers.get('cc') ? [{ email: headers.get('cc') as string }] : [],
        bcc: headers.get('bcc') ? [{ email: headers.get('bcc') as string }] : [],
        subject: headers.get('subject') ?? '',
        bodyText: body.contentType.toLowerCase() === 'text/plain' ? body.content : (toPlainText(bodyHtml) || m.snippet || ''),
        bodyHtml,
        receivedAt: m.internalDate ? new Date(Number(m.internalDate)) : null,
        providerConversationId: m.threadId ?? null,
        attachments: [],
      });
    }
    return { messages, nextCursor: list.nextPageToken ?? null };
  }

  async sendMessage(input: {
    secret: MailboxSecretPayload;
    to: Array<{ name?: string | null; email: string }>;
    cc?: Array<{ name?: string | null; email: string }>;
    bcc?: Array<{ name?: string | null; email: string }>;
    subject: string;
    bodyText: string;
    bodyHtml?: string | null;
    inReplyTo?: string | null;
    references?: string | null;
  }) {
    const token = input.secret.accessToken;
    if (!token) throw new Error('MAILBOX_AUTHORIZATION_REQUIRED');
    const mime = [
      `To: ${input.to.map((r) => r.email).join(', ')}`,
      ...(input.cc?.length ? [`Cc: ${input.cc.map((r) => r.email).join(', ')}`] : []),
      ...(input.bcc?.length ? [`Bcc: ${input.bcc.map((r) => r.email).join(', ')}`] : []),
      `Subject: ${input.subject}`,
      ...(input.inReplyTo ? [`In-Reply-To: ${input.inReplyTo}`] : []),
      ...(input.references ? [`References: ${input.references}`] : []),
      'MIME-Version: 1.0',
      input.bodyHtml ? 'Content-Type: text/html; charset="UTF-8"' : 'Content-Type: text/plain; charset="UTF-8"',
      '',
      input.bodyHtml || input.bodyText,
    ].join('\r\n');
    const raw = Buffer.from(mime).toString('base64url');
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'MAILBOX_AUTHORIZATION_REQUIRED' : 'MAILBOX_PROVIDER_SEND_FAILED');
    const json = (await res.json()) as { id: string; threadId?: string };
    return { providerMessageId: json.id, internetMessageId: null, providerConversationId: json.threadId ?? null };
  }

  async refreshAuthorization(secret: MailboxSecretPayload): Promise<MailboxSecretPayload> {
    if (!secret.refreshToken) throw new Error('MAILBOX_AUTHORIZATION_REQUIRED');
    const body = new URLSearchParams({
      client_id: requireEnv('GOOGLE_MAILBOX_CLIENT_ID'),
      client_secret: requireEnv('GOOGLE_MAILBOX_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: secret.refreshToken,
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error('MAILBOX_AUTHORIZATION_EXPIRED');
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    return { ...secret, accessToken: json.access_token, expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : undefined };
  }

  async disconnect(secret: MailboxSecretPayload): Promise<void> {
    if (!secret.refreshToken) return;
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: secret.refreshToken }),
    }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Generic IMAP + SMTP (feature-gated behind a real secret store)
// ---------------------------------------------------------------------------

export class ImapSmtpMailboxProvider implements MailboxProviderAdapter {
  readonly code: MailboxProviderCode = 'IMAP_SMTP';
  readonly displayName = 'Egyéb szolgáltató (IMAP/SMTP)';
  readonly requiresProviderConfiguration = false;

  buildAuthorizationUrl(): string {
    // No OAuth redirect; credentials are supplied at connect time.
    return '';
  }

  async exchangeAuthorizationCode(): Promise<MailboxAuthorizationResult> {
    throw new SecretStoreNotConfiguredError();
  }

  async listMessagesSinceCursor(input: { secret: MailboxSecretPayload; cursor: string | null; maxMessages: number }): Promise<{ messages: MailboxMessage[]; nextCursor: string | null }> {
    if (env('GENERIC_IMAP_ENABLED') !== 'true') throw new SecretStoreNotConfiguredError();
    if (!input.secret.imapHost || !input.secret.username || !input.secret.password) throw new Error('MAILBOX_GENERIC_IMAP_CONFIGURATION_INVALID');
    if (input.secret.imapTls === 'NONE' && env('MAILBOX_ALLOW_INSECURE_GENERIC_DEVELOPMENT') !== 'true') throw new Error('MAILBOX_GENERIC_TLS_REQUIRED');
    const client = new ImapFlow({ host: input.secret.imapHost, port: input.secret.imapPort || 993, secure: input.secret.imapTls !== 'STARTTLS', auth: { user: input.secret.username, pass: input.secret.password }, logger: false });
    try {
      await client.connect(); const lock = await client.getMailboxLock('INBOX');
      try {
        const uidValidity = String(client.mailbox.uidValidity || '0'); const lastUid = Number(String(input.cursor || '').split(':')[1] || '0'); const max = Math.min(Math.max(input.maxMessages, 1), 250); const messages: MailboxMessage[] = [];
        for await (const item of client.fetch(`${lastUid + 1}:*`, { uid: true, envelope: true, source: true }, { uid: true })) {
          if (messages.length >= max) break; const envelope = item.envelope; const headers = String(item.source || '');
          const header = (name: string) => new RegExp(`^${name}:\\s*(.+)$`, 'im').exec(headers)?.[1]?.trim() || null;
        messages.push({ providerMessageId: String(item.uid), internetMessageId: header('Message-ID'), inReplyTo: header('In-Reply-To'), references: header('References'), direction: 'INBOUND', from: { email: envelope?.from?.[0]?.address || '' }, to: (envelope?.to || []).map((v) => ({ email: v.address || '', name: v.name || null })), cc: (envelope?.cc || []).map((v) => ({ email: v.address || '', name: v.name || null })), bcc: (envelope?.bcc || []).map((v) => ({ email: v.address || '', name: v.name || null })), subject: envelope?.subject || '', bodyText: '', receivedAt: envelope?.date || null, attachments: [] });
        }
        const nextUid = messages.length ? messages[messages.length - 1].providerMessageId : String(lastUid); return { messages, nextCursor: `${uidValidity}:${nextUid}` };
      } finally { lock.release(); }
    } finally { await client.logout().catch(() => undefined); }
  }

  async sendMessage(input: { secret: MailboxSecretPayload; to: Array<{ name?: string | null; email: string }>; cc?: Array<{ name?: string | null; email: string }>; subject: string; bodyText: string; bodyHtml?: string | null; inReplyTo?: string | null; references?: string | null }): Promise<{ providerMessageId: string; internetMessageId?: string | null; providerConversationId?: string | null }> {
    if (env('GENERIC_SMTP_ENABLED') !== 'true') throw new SecretStoreNotConfiguredError(); const s = input.secret;
    if (!s.smtpHost || !s.username || !s.password) throw new Error('MAILBOX_GENERIC_SMTP_CONFIGURATION_INVALID');
    if (s.smtpTls === 'NONE' && env('MAILBOX_ALLOW_INSECURE_GENERIC_DEVELOPMENT') !== 'true') throw new Error('MAILBOX_GENERIC_TLS_REQUIRED');
    const transport = nodemailer.createTransport({ host: s.smtpHost, port: s.smtpPort || 465, secure: s.smtpTls !== 'STARTTLS', auth: { user: s.username, pass: s.password } });
    await transport.verify(); const result = await transport.sendMail({ from: s.username, to: input.to.map((r) => r.email).join(', '), cc: input.cc?.map((r) => r.email).join(', '), subject: input.subject, text: input.bodyText, html: input.bodyHtml || undefined, inReplyTo: input.inReplyTo || undefined, references: input.references || undefined });
    return { providerMessageId: result.messageId, internetMessageId: result.messageId, providerConversationId: null };
  }

  async refreshAuthorization(secret: MailboxSecretPayload): Promise<MailboxSecretPayload> {
    return secret;
  }

  async disconnect(): Promise<void> {
    return;
  }
}

const ADAPTERS: Record<MailboxProviderCode, MailboxProviderAdapter> = {
  MICROSOFT_GRAPH: new MicrosoftGraphMailboxProvider(),
  GOOGLE_GMAIL: new GmailMailboxProvider(),
  IMAP_SMTP: new ImapSmtpMailboxProvider(),
};

export function getMailboxProvider(code: MailboxProviderCode): MailboxProviderAdapter {
  return ADAPTERS[code];
}

/** Test seam for provider-contract tests. Never configure this from a route. */
export function setMailboxProviderForTest(code: MailboxProviderCode, adapter: MailboxProviderAdapter | null): void {
  ADAPTERS[code] = adapter ?? (code === 'MICROSOFT_GRAPH' ? new MicrosoftGraphMailboxProvider() : code === 'GOOGLE_GMAIL' ? new GmailMailboxProvider() : new ImapSmtpMailboxProvider());
}
