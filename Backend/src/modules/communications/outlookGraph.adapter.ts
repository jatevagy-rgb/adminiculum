type GraphEmailAddress = {
  emailAddress?: {
    address?: unknown;
    name?: unknown;
  } | null;
};

type GraphAttachment = {
  id?: unknown;
  name?: unknown;
  contentType?: unknown;
  size?: unknown;
};

export type GraphMessageLike = {
  id?: unknown;
  internetMessageId?: unknown;
  conversationId?: unknown;
  subject?: unknown;
  from?: GraphEmailAddress | null;
  toRecipients?: GraphEmailAddress[] | null;
  ccRecipients?: GraphEmailAddress[] | null;
  bccRecipients?: GraphEmailAddress[] | null;
  receivedDateTime?: unknown;
  sentDateTime?: unknown;
  bodyPreview?: unknown;
  hasAttachments?: unknown;
  attachments?: GraphAttachment[] | null;
};

export type OutlookImportMessagePayload = {
  externalMessageId: string | null;
  providerConversationId: string | null;
  subject: string | null;
  sender: string | null;
  recipients: { to: string[]; cc: string[]; bcc: string[] };
  receivedAt: string | null;
  sentAt: string | null;
  bodyPreview: string | null;
  hasAttachments: boolean;
  attachments: Array<{
    providerAttachmentId: string | null;
    name: string | null;
    contentType: string | null;
    sizeBytes: number | null;
  }>;
};

export type OutlookImportPayload = {
  mailboxAddress: string;
  messages: OutlookImportMessagePayload[];
};

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function emailAddressOrNull(value: GraphEmailAddress | null | undefined): string | null {
  return stringOrNull(value?.emailAddress?.address);
}

function recipientAddresses(value: GraphEmailAddress[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((recipient) => emailAddressOrNull(recipient))
    .filter((address): address is string => typeof address === 'string');
}

function attachmentMetadata(value: GraphAttachment[] | null | undefined): OutlookImportMessagePayload['attachments'] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((attachment) => attachment && typeof attachment === 'object')
    .map((attachment) => ({
      providerAttachmentId: stringOrNull(attachment.id),
      name: stringOrNull(attachment.name),
      contentType: stringOrNull(attachment.contentType),
      sizeBytes: Number.isFinite(attachment.size) ? Number(attachment.size) : null,
    }));
}

export function mapGraphMessageToOutlookImportMessage(
  graphMessage: GraphMessageLike,
  _mailboxAddress: string,
): OutlookImportMessagePayload {
  const attachments = attachmentMetadata(graphMessage.attachments);

  return {
    externalMessageId: stringOrNull(graphMessage.internetMessageId) || stringOrNull(graphMessage.id),
    providerConversationId: stringOrNull(graphMessage.conversationId),
    subject: stringOrNull(graphMessage.subject),
    sender: emailAddressOrNull(graphMessage.from),
    recipients: {
      to: recipientAddresses(graphMessage.toRecipients),
      cc: recipientAddresses(graphMessage.ccRecipients),
      bcc: recipientAddresses(graphMessage.bccRecipients),
    },
    receivedAt: stringOrNull(graphMessage.receivedDateTime),
    sentAt: stringOrNull(graphMessage.sentDateTime),
    bodyPreview: stringOrNull(graphMessage.bodyPreview),
    hasAttachments: Boolean(graphMessage.hasAttachments) || attachments.length > 0,
    attachments,
  };
}

export function mapGraphMessagesToOutlookImportPayload(
  messages: GraphMessageLike[],
  mailboxAddress: string,
): OutlookImportPayload {
  return {
    mailboxAddress,
    messages: messages.map((message) => mapGraphMessageToOutlookImportMessage(message, mailboxAddress)),
  };
}
