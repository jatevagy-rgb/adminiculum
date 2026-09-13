import { Prisma, type MailboxConnectionStatus } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import { sanitizeEmailHtml, toPlainText } from './htmlSanitizer';
import { getMailboxProvider, type MailboxMessage } from './provider';
import { getSecretStore, type SecretStore } from './secretStore';
import { hasMailboxAuthorization } from './types';
import { recordMailboxAudit } from './audit';

export class MailboxServiceError extends Error {
  constructor(readonly status: number, readonly code: string, message = 'Mailbox operation could not be completed.') { super(message); }
}
export async function ownedMailbox(id: string, ownerUserId: string) {
  const connection = await prisma.communicationMailboxConnection.findFirst({ where: { id, ownerUserId } });
  if (!connection) throw new MailboxServiceError(404, 'MAILBOX_NOT_FOUND');
  return connection;
}
function address(value: { name?: string | null; email: string }) { return value.name ? `${value.name} <${value.email}>` : value.email; }
function recipients(message: MailboxMessage) { return [...message.to.map((x) => ({ ...x, kind: 'TO' })), ...message.cc.map((x) => ({ ...x, kind: 'CC' }))]; }
async function persistMessage(connection: Awaited<ReturnType<typeof ownedMailbox>>, message: MailboxMessage, createdById: string) {
  const html = message.bodyHtml ? sanitizeEmailHtml(message.bodyHtml) : null;
  const text = message.bodyText || toPlainText(html);
  const row = await prisma.communication.upsert({
    where: { mailboxConnectionId_mailboxProviderMessageId: { mailboxConnectionId: connection.id, mailboxProviderMessageId: message.providerMessageId } },
    create: { type: 'EMAIL', subject: message.subject || '(tárgy nélkül)', senderName: message.from.name ?? null, senderEmail: message.from.email || null, recipientEmail: message.to.map(address).join(', ') || null, content: text || null, createdById, mailboxConnectionId: connection.id, mailboxProviderMessageId: message.providerMessageId, internetMessageId: message.internetMessageId ?? null, inReplyTo: message.inReplyTo ?? null, references: message.references ?? null, providerConversationId: message.providerConversationId ?? null, mailboxAddress: connection.mailboxAddress, direction: message.direction, source: 'MAILBOX', syncStatus: 'IMPORTED', receivedAt: message.receivedAt ?? null, sentAt: message.sentAt ?? null, importedAt: new Date(), bodyPreview: text.slice(0, 500), bodyHtmlSanitized: html, recipients: recipients(message) as Prisma.InputJsonValue },
    update: { subject: message.subject || '(tárgy nélkül)', content: text || null, bodyPreview: text.slice(0, 500), bodyHtmlSanitized: html, receivedAt: message.receivedAt ?? undefined, sentAt: message.sentAt ?? undefined, providerConversationId: message.providerConversationId ?? undefined },
  });
  for (const attachment of message.attachments) await prisma.communicationAttachment.upsert({ where: { communicationId_providerAttachmentId: { communicationId: row.id, providerAttachmentId: attachment.providerAttachmentId } }, create: { communicationId: row.id, providerAttachmentId: attachment.providerAttachmentId, fileName: attachment.fileName, fileType: attachment.contentType ?? null, sizeBytes: attachment.sizeBytes ?? null, uploadedById: createdById }, update: { fileName: attachment.fileName, fileType: attachment.contentType ?? undefined, sizeBytes: attachment.sizeBytes ?? undefined } });
  return row;
}
export async function syncMailbox(id: string, ownerUserId: string, store: SecretStore = getSecretStore()) {
  const connection = await ownedMailbox(id, ownerUserId);
  if (connection.status === 'REVOKED') throw new MailboxServiceError(409, 'MAILBOX_REVOKED');
  if (!hasMailboxAuthorization(connection)) throw new MailboxServiceError(409, 'MAILBOX_AUTHORIZATION_REQUIRED');
  if (!connection.secretReference) throw new MailboxServiceError(409, 'MAILBOX_SECRET_MISSING');
  const secret = await store.get(connection.secretReference); if (!secret) throw new MailboxServiceError(409, 'MAILBOX_SECRET_MISSING');
  await prisma.communicationMailboxConnection.update({ where: { id }, data: { status: 'SYNCING', lastSyncStatus: 'RUNNING', lastSyncError: null } });
  await recordMailboxAudit({ eventType: 'MAILBOX_SYNC_STARTED', actorUserId: ownerUserId, mailboxConnectionId: id, provider: connection.provider, status: 'SYNCING' });
  try {
    const result = await getMailboxProvider(connection.provider).listMessagesSinceCursor({ secret, cursor: connection.syncCursor, maxMessages: 250 });
    for (const message of result.messages) await persistMessage(connection, message, ownerUserId);
    const updated = await prisma.communicationMailboxConnection.update({ where: { id }, data: { status: connection.sendCapability ? 'CONNECTED' : 'CONNECTED_READ_ONLY', syncCursor: result.nextCursor, syncCursorUpdatedAt: new Date(), lastSyncedAt: new Date(), lastSyncStatus: 'SUCCEEDED' } });
    await recordMailboxAudit({ eventType: 'MAILBOX_SYNC_SUCCEEDED', actorUserId: ownerUserId, mailboxConnectionId: id, provider: connection.provider, status: updated.status });
    return updated;
  } catch (error) {
    const reauthRequired = error instanceof Error && error.message.includes('AUTHORIZATION');
    const status = reauthRequired ? 'AUTHORIZATION_REQUIRED' : 'ERROR';
    await prisma.communicationMailboxConnection.update({ where: { id }, data: { status, lastSyncStatus: 'FAILED', lastSyncError: reauthRequired ? 'AUTHORIZATION_REQUIRED' : 'PROVIDER_SYNC_FAILED' } });
    await recordMailboxAudit({ eventType: 'MAILBOX_SYNC_FAILED', actorUserId: ownerUserId, mailboxConnectionId: id, provider: connection.provider, status, errorCode: reauthRequired ? 'AUTHORIZATION_REQUIRED' : 'PROVIDER_SYNC_FAILED' });
    if (reauthRequired) await recordMailboxAudit({ eventType: 'MAILBOX_REAUTH_REQUIRED', actorUserId: ownerUserId, mailboxConnectionId: id, provider: connection.provider, status, errorCode: 'AUTHORIZATION_REQUIRED' });
    throw new MailboxServiceError(502, 'MAILBOX_SYNC_FAILED');
  }
}
export async function sendMailboxMessage(input: { id: string; ownerUserId: string; to: Array<{ name?: string | null; email: string }>; cc?: Array<{ name?: string | null; email: string }>; subject: string; bodyText: string; bodyHtml?: string | null; replyToCommunicationId?: string | null }, store: SecretStore = getSecretStore()) {
  const connection = await ownedMailbox(input.id, input.ownerUserId);
  if (!hasMailboxAuthorization(connection) || !connection.sendCapability || !connection.secretReference) throw new MailboxServiceError(409, 'MAILBOX_SEND_NOT_AVAILABLE');
  const secret = await store.get(connection.secretReference); if (!secret) throw new MailboxServiceError(409, 'MAILBOX_SECRET_MISSING');
  const reply = input.replyToCommunicationId ? await prisma.communication.findFirst({ where: { id: input.replyToCommunicationId, mailboxConnectionId: connection.id } }) : null;
  let sent;
  try { sent = await getMailboxProvider(connection.provider).sendMessage({ secret, to: input.to, cc: input.cc, subject: input.subject, bodyText: input.bodyText, bodyHtml: input.bodyHtml, inReplyTo: reply?.internetMessageId ?? null, references: reply?.internetMessageId ?? null }); }
  catch (error) { await recordMailboxAudit({ eventType: 'MAILBOX_SEND_FAILED', actorUserId: input.ownerUserId, mailboxConnectionId: connection.id, provider: connection.provider, status: 'ERROR', errorCode: 'PROVIDER_SEND_FAILED' }); throw error; }
  const communication = await persistMessage(connection, { providerMessageId: sent.providerMessageId, internetMessageId: sent.internetMessageId ?? null, inReplyTo: reply?.internetMessageId ?? null, references: reply?.internetMessageId ?? null, direction: 'OUTBOUND', from: { email: connection.mailboxAddress }, to: input.to, cc: input.cc ?? [], subject: input.subject, bodyText: input.bodyText, bodyHtml: input.bodyHtml ?? null, sentAt: new Date(), providerConversationId: sent.providerConversationId ?? reply?.providerConversationId ?? null, attachments: [] }, input.ownerUserId);
  await recordMailboxAudit({ eventType: 'MAILBOX_SEND_SUCCEEDED', actorUserId: input.ownerUserId, mailboxConnectionId: connection.id, provider: connection.provider, status: 'CONNECTED' });
  return communication;
}
