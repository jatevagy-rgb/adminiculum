/**
 * Provider-independent transactional mail adapter for client-portal
 * notifications.
 *
 * SAFETY INVARIANT: with no provider configured, send() throws a RETRYABLE
 * MailProviderError(MAIL_PROVIDER_NOT_CONFIGURED). The caller keeps the
 * ClientNotificationDelivery in PENDING/FAILED_RETRYABLE — the notification
 * intent is never discarded and never falsely marked SENT.
 *
 * Provider wiring reuses the EXISTING server-only system SMTP configuration
 * (the same MAILBOX_TRANSACTIONAL_SMTP_* credential set already used by the
 * mailbox module's verification mail). Partial configuration fails closed to
 * the unconfigured sender. This adapter never composes arbitrary mailbox mail
 * and never reads a mailbox.
 */
import nodemailer from 'nodemailer';

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

/** System SMTP sender backed by the existing server-only SMTP credential set. */
class SmtpMailSender implements MailSender {
  readonly provider = 'SMTP';
  private readonly transport: nodemailer.Transporter;
  private readonly from: string;

  constructor(env: NodeJS.ProcessEnv) {
    const host = String(env.MAILBOX_TRANSACTIONAL_SMTP_HOST || '').trim();
    const user = String(env.MAILBOX_TRANSACTIONAL_SMTP_USER || '').trim();
    const password = String(env.MAILBOX_TRANSACTIONAL_SMTP_PASSWORD || '');
    this.from = String(env.MAILBOX_TRANSACTIONAL_SMTP_FROM || '').trim();
    const port = Number(env.MAILBOX_TRANSACTIONAL_SMTP_PORT || 587);
    const secure = port === 465;
    this.transport = nodemailer.createTransport({ host, port, secure, requireTLS: port !== 465, auth: { user, pass: password } });
  }

  async send(message: MailMessage): Promise<MailSendResult> {
    const info = await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subjectSafe,
      text: message.bodyTextSafe,
      html: message.bodyHtmlSafe,
      headers: { 'X-Idempotency-Key': message.idempotencyKey },
    });
    return { providerMessageId: info.messageId || '', provider: 'SMTP' };
  }
}

let cached: MailSender | null = null;

export function getMailSender(env: NodeJS.ProcessEnv = process.env): MailSender {
  if (!cached) {
    const configured = ['MAILBOX_TRANSACTIONAL_SMTP_HOST', 'MAILBOX_TRANSACTIONAL_SMTP_USER', 'MAILBOX_TRANSACTIONAL_SMTP_PASSWORD', 'MAILBOX_TRANSACTIONAL_SMTP_FROM']
      .every((key) => Boolean(String(env[key] || '').trim()));
    cached = configured ? new SmtpMailSender(env) : new UnconfiguredMailSender();
  }
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
