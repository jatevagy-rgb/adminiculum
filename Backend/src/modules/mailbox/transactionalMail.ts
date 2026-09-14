/** System mail only. It is deliberately separate from user-connected mailboxes. */
import nodemailer from 'nodemailer';

export interface TransactionalMailTransport {
  sendVerificationCode(input: { email: string; code: string; expiresAt: Date }): Promise<void>;
}

export class TransactionalMailConfigurationError extends Error {
  readonly code = 'MAILBOX_TRANSACTIONAL_MAIL_NOT_CONFIGURED';
  constructor() { super('Mailbox verification mail is not configured.'); }
}

class UnconfiguredTransactionalMailTransport implements TransactionalMailTransport {
  async sendVerificationCode(): Promise<void> { throw new TransactionalMailConfigurationError(); }
}

class SmtpTransactionalMailTransport implements TransactionalMailTransport {
  private readonly transport: nodemailer.Transporter;
  private readonly from: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const host = String(env.MAILBOX_TRANSACTIONAL_SMTP_HOST || '').trim();
    const user = String(env.MAILBOX_TRANSACTIONAL_SMTP_USER || '').trim();
    const password = String(env.MAILBOX_TRANSACTIONAL_SMTP_PASSWORD || '');
    this.from = String(env.MAILBOX_TRANSACTIONAL_SMTP_FROM || '').trim();
    if (!host || !user || !password || !this.from) throw new TransactionalMailConfigurationError();
    const port = Number(env.MAILBOX_TRANSACTIONAL_SMTP_PORT || 587);
    const secure = String(env.MAILBOX_TRANSACTIONAL_SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
    this.transport = nodemailer.createTransport({ host, port, secure, auth: { user, pass: password } });
  }

  async sendVerificationCode(input: { email: string; code: string; expiresAt: Date }): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: input.email,
      subject: 'Adminiculum email-cím ellenőrzése',
      text: `Az Adminiculum email-cím ellenőrző kódja: ${input.code}\n\nA kód lejárata: ${input.expiresAt.toISOString()}.`,
    });
  }
}

let configured: TransactionalMailTransport | null = null;
export function getTransactionalMailTransport(): TransactionalMailTransport {
  if (configured) return configured;
  const env = process.env;
  if (
    String(env.MAILBOX_TRANSACTIONAL_SMTP_HOST || '').trim() &&
    String(env.MAILBOX_TRANSACTIONAL_SMTP_USER || '').trim() &&
    String(env.MAILBOX_TRANSACTIONAL_SMTP_PASSWORD || '') &&
    String(env.MAILBOX_TRANSACTIONAL_SMTP_FROM || '').trim()
  ) return new SmtpTransactionalMailTransport(env);
  return new UnconfiguredTransactionalMailTransport();
}
/** Test and platform wiring seam; do not use to expose mailbox credentials. */
export function setTransactionalMailTransport(value: TransactionalMailTransport | null): void { configured = value; }

export function transactionalMailStatus(env: NodeJS.ProcessEnv = process.env): {
  ready: boolean;
  externalConfigurationRequired: boolean;
} {
  const ready = Boolean(
    String(env.MAILBOX_TRANSACTIONAL_SMTP_HOST || '').trim() &&
    String(env.MAILBOX_TRANSACTIONAL_SMTP_USER || '').trim() &&
    String(env.MAILBOX_TRANSACTIONAL_SMTP_PASSWORD || '') &&
    String(env.MAILBOX_TRANSACTIONAL_SMTP_FROM || '').trim(),
  );
  return { ready, externalConfigurationRequired: !ready };
}
