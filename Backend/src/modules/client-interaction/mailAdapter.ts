/**
 * Provider-independent transactional mail adapter for client-portal
 * notifications.
 *
 * SAFETY INVARIANT: with no provider configured, send() throws a RETRYABLE
 * MailProviderError(MAIL_PROVIDER_NOT_CONFIGURED). The caller keeps the
 * ClientNotificationDelivery in PENDING/FAILED_RETRYABLE — the notification
 * intent is never discarded and never falsely marked SENT. Real providers
 * (SMTP/SendGrid/Graph Mail.Send) implement MailSender and are wired later.
 * This adapter never composes arbitrary mailbox mail or reads a mailbox.
 */

export interface MailMessage {
  to: string;
  subjectSafe: string;
  bodyTextSafe: string;
  bodyHtmlSafe?: string;
  /** dedupe key echoed to providers that support idempotent send */
  idempotencyKey: string;
  language?: string;
}

export interface MailSendResult {
  providerMessageId: string;
  provider: string;
}

export class MailProviderError extends Error {
  readonly retryable: boolean;
  readonly codeSafe: string;
  constructor(codeSafe: string, message: string, retryable: boolean) {
    super(message);
    this.codeSafe = codeSafe;
    this.retryable = retryable;
  }
}

export interface MailSender {
  readonly provider: string;
  send(message: MailMessage): Promise<MailSendResult>;
}

/** Default sender when none is configured: never reports success. */
class UnconfiguredMailSender implements MailSender {
  readonly provider = 'NONE';
  async send(): Promise<MailSendResult> {
    // Retryable so the outbox holds the intent until a provider is configured.
    throw new MailProviderError('MAIL_PROVIDER_NOT_CONFIGURED', 'No mail provider is configured.', true);
  }
}

let cached: MailSender | null = null;

export function getMailSender(_env: NodeJS.ProcessEnv = process.env): MailSender {
  if (!cached) cached = new UnconfiguredMailSender();
  return cached;
}

/** Test seam / provider wiring point. */
export function setMailSender(sender: MailSender | null): void {
  cached = sender;
}

export function mailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return getMailSender(env).provider !== 'NONE';
}

/** Safe default notification body — no sensitive content, no bearer link. */
export const DEFAULT_NOTIFICATION_BODY =
  'Új tartalom érkezett az Adminiculum ügyfélportálon. A megtekintéshez jelentkezzen be.';
