import type { CommunicationDetail, CommunicationRecipient } from './api';

export type MailboxRecipient = Pick<CommunicationRecipient, 'email' | 'name'>;

function normalized(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function validRecipient(recipient: CommunicationRecipient | null | undefined): MailboxRecipient | null {
  const email = String(recipient?.email || '').trim();
  return email && email.includes('@') ? { email, name: recipient?.name ?? null } : null;
}

function uniqueRecipients(recipients: Array<MailboxRecipient | null>, excluded: Set<string>): MailboxRecipient[] {
  const seen = new Set<string>();
  return recipients.filter((recipient): recipient is MailboxRecipient => {
    if (!recipient) return false;
    const key = normalized(recipient.email);
    if (!key || excluded.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Builds Reply All recipients from the canonical structured TO/CC data.
 * BCC is intentionally ignored and the connected mailbox is never included.
 */
export function buildReplyAllRecipients(
  detail: Pick<CommunicationDetail, 'senderEmail' | 'recipients'>,
  mailbox: { mailboxAddress?: string | null } | null | undefined,
): { to: MailboxRecipient[]; cc: MailboxRecipient[] } {
  const own = normalized(mailbox?.mailboxAddress);
  const structured = Array.isArray(detail.recipients) ? detail.recipients : [];
  const originalTo = structured.filter((recipient) => String(recipient.kind || '').toUpperCase() === 'TO').map(validRecipient);
  const originalCc = structured.filter((recipient) => String(recipient.kind || '').toUpperCase() === 'CC').map(validRecipient);
  const sender = validRecipient(detail.senderEmail ? { email: detail.senderEmail, kind: 'TO' } : null);
  const senderKey = normalized(sender?.email);
  const preferredTo = sender && senderKey !== own
    ? sender
    : uniqueRecipients([...originalTo, ...originalCc], new Set([own]))[0] ?? null;
  const to = preferredTo ? [preferredTo] : [];
  const excluded = new Set([own, normalized(preferredTo?.email)]);
  const cc = uniqueRecipients([...originalTo, ...originalCc], excluded);
  return { to, cc };
}

export function buildForwardBody(detail: Pick<CommunicationDetail, 'content' | 'senderEmail' | 'createdAt' | 'sentAt' | 'subject' | 'recipientEmail' | 'recipients'>): string {
  const recipients = Array.isArray(detail.recipients)
    ? detail.recipients
      .filter((recipient) => ['TO', 'CC'].includes(String(recipient.kind || '').toUpperCase()))
      .map((recipient) => recipient.email.trim())
      .filter(Boolean)
      .filter((email, index, all) => all.findIndex((candidate) => normalized(candidate) === normalized(email)) === index)
      .join(', ')
    : String(detail.recipientEmail || '').trim();
  const dateValue = detail.sentAt || detail.createdAt;
  const date = new Date(dateValue);
  const dateLabel = Number.isNaN(date.getTime()) ? String(dateValue || '—') : date.toLocaleString('hu-HU');
  return [
    '---------- Továbbított üzenet ----------',
    `Feladó: ${detail.senderEmail || '—'}`,
    `Dátum: ${dateLabel}`,
    `Tárgy: ${detail.subject || '—'}`,
    `Címzett: ${recipients || '—'}`,
    '',
    String(detail.content || ''),
  ].join('\n');
}
