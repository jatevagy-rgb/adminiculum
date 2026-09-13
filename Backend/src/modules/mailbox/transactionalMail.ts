/** System mail only. It is deliberately separate from user-connected mailboxes. */
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

let configured: TransactionalMailTransport | null = null;
export function getTransactionalMailTransport(): TransactionalMailTransport {
  return configured ?? new UnconfiguredTransactionalMailTransport();
}
/** Test and platform wiring seam; do not use to expose mailbox credentials. */
export function setTransactionalMailTransport(value: TransactionalMailTransport | null): void { configured = value; }
