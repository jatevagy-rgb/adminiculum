import type { MailboxProvider } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';

export const MAILBOX_AUDIT_EVENTS = ['MAILBOX_VERIFICATION_STARTED', 'MAILBOX_VERIFIED', 'MAILBOX_AUTHORIZATION_STARTED', 'MAILBOX_CONNECTED', 'MAILBOX_SYNC_STARTED', 'MAILBOX_SYNC_SUCCEEDED', 'MAILBOX_SYNC_FAILED', 'MAILBOX_SEND_SUCCEEDED', 'MAILBOX_SEND_FAILED', 'MAILBOX_REAUTH_REQUIRED', 'MAILBOX_IDENTITY_UNAVAILABLE', 'MAILBOX_IDENTITY_MISMATCH', 'MAILBOX_DISCONNECTED', 'MAILBOX_REVOKED'] as const;
export type MailboxAuditEventType = typeof MAILBOX_AUDIT_EVENTS[number];
export async function recordMailboxAudit(input: { eventType: MailboxAuditEventType; actorUserId: string; mailboxConnectionId?: string | null; provider?: MailboxProvider | null; status?: string | null; errorCode?: string | null }): Promise<void> {
  await prisma.mailboxAuditEvent.create({ data: input });
}
