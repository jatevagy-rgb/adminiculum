/**
 * UNIVERSAL MAILBOX — shared types.
 *
 * Email verification proves control of an address only. Mailbox authorization
 * (read/send) requires a separate provider grant. These are distinct states.
 */

export const MAILBOX_PROVIDERS = ['MICROSOFT_GRAPH', 'GOOGLE_GMAIL', 'IMAP_SMTP'] as const;
export type MailboxProviderCode = (typeof MAILBOX_PROVIDERS)[number];

export const MAILBOX_STATUSES = [
  'EMAIL_UNVERIFIED',
  'EMAIL_VERIFIED',
  'AUTHORIZATION_REQUIRED',
  'CONNECTED',
  'CONNECTED_READ_ONLY',
  'SYNCING',
  'PAUSED',
  'REVOKED',
  'ERROR',
] as const;
export type MailboxStatusCode = (typeof MAILBOX_STATUSES)[number];

/** True only when the mailbox can actually be read (not merely verified). */
export function isConnected(status: MailboxStatusCode): boolean {
  return status === 'CONNECTED' || status === 'SYNCING';
}

export function hasMailboxAuthorization(connection: {
  status: MailboxStatusCode | string;
  readCapability: boolean;
  sendCapability: boolean;
}): boolean {
  return isConnected(connection.status as MailboxStatusCode) && (connection.readCapability || connection.sendCapability);
}

/** Provider-scoped secret payload; never persisted in Prisma. */
export interface MailboxSecretPayload {
  kind: 'OAUTH2' | 'IMAP_SMTP';
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
  /** IMAP/SMTP only */
  username?: string;
  password?: string;
  imapHost?: string;
  imapPort?: number;
  imapTls?: 'NONE' | 'STARTTLS' | 'SSL';
  smtpHost?: string;
  smtpPort?: number;
  smtpTls?: 'NONE' | 'STARTTLS' | 'SSL';
}
