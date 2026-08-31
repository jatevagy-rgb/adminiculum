import { prisma } from '../../prisma/prisma.service';
import { mapGraphMessagesToOutlookImportPayload } from './outlookGraph.adapter';
import {
  OutlookGraphReaderError,
  createOutlookGraphMailReader,
  parseOutlookSyncLimit,
  type OutlookSyncConfig,
} from './outlookGraphLive';

const OUTLOOK_PREVIEW_LIMIT = 240;

export class OutlookImportServiceError extends Error {
  constructor(
    public status: number,
    public responseBody: Record<string, unknown>,
    public logRoute?: string,
  ) {
    super(typeof responseBody.error === 'string' ? responseBody.error : typeof responseBody.message === 'string' ? responseBody.message : 'Outlook import service error');
    this.name = 'OutlookImportServiceError';
  }
}

export type NormalizedOutlookAttachment = {
  providerAttachmentId: string | null;
  fileName: string | null;
  fileType: string | null;
  sizeBytes: number | null;
};

export type NormalizedOutlookMessage = {
  valid: boolean;
  invalidReason?: string;
  externalMessageId: string | null;
  providerConversationId: string | null;
  mailboxAddress: string | null;
  direction: 'INBOUND' | 'OUTBOUND' | null;
  subject: string;
  sender: string | null;
  recipients: { to: string[]; cc: string[]; bcc: string[] };
  receivedAt: string | null;
  sentAt: string | null;
  contentPreview: string | null;
  metadata: { provider: string; hasAttachments: boolean; attachmentCount: number };
  attachments: NormalizedOutlookAttachment[];
};

type OutlookDryRunItem = {
  externalMessageId: string | null;
  providerConversationId: string | null;
  direction: 'INBOUND' | 'OUTBOUND' | null;
  wouldImport: boolean;
  duplicate: boolean;
  valid: boolean;
  invalidReason?: string;
  communicationPreview: Record<string, unknown> | null;
  attachmentPreviews: Array<Record<string, unknown>>;
};

export type OutlookImportBody = Record<string, any>;

export function normalizeEmailAddress(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function parseOutlookDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim());
}

function outlookPreview(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  return compact.length > OUTLOOK_PREVIEW_LIMIT ? `${compact.slice(0, OUTLOOK_PREVIEW_LIMIT - 1)}…` : compact;
}

function readPayload(body: OutlookImportBody): { mailboxAddress: string; messages: unknown[] } {
  const payload = (body || {}) as Record<string, any>;
  const mailboxAddress = typeof payload.mailboxAddress === 'string' ? payload.mailboxAddress.trim() : '';
  const messages = payload.messages;

  if (!Array.isArray(messages)) {
    throw new OutlookImportServiceError(400, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Missing or invalid field: messages (array required)',
    });
  }

  return { mailboxAddress, messages };
}

// Shared normalization used by BOTH the dry-run and the (gated) write import so
// they apply identical rules. Pure: no DB access, no Graph calls, no AI.
// Direction is a transparent derivation (sender==mailbox -> OUTBOUND, else INBOUND).
export function normalizeOutlookMessage(raw: any, mailboxNorm: string, mailboxAddress: string): NormalizedOutlookMessage {
  const msg = (raw || {}) as Record<string, any>;
  const externalMessageId = typeof msg.externalMessageId === 'string' ? msg.externalMessageId.trim() : '';
  const subject = typeof msg.subject === 'string' ? msg.subject.trim() : '';
  const sender = typeof msg.sender === 'string' ? msg.sender.trim() : '';

  let invalidReason: string | undefined;
  if (!externalMessageId) invalidReason = 'Missing externalMessageId';
  else if (!subject) invalidReason = 'Missing subject';
  const valid = !invalidReason;

  const senderNorm = normalizeEmailAddress(sender);
  const direction: 'INBOUND' | 'OUTBOUND' | null = !sender
    ? null
    : mailboxNorm && senderNorm === mailboxNorm
      ? 'OUTBOUND'
      : 'INBOUND';

  const recipientsIn = (msg.recipients || {}) as Record<string, any>;
  const recipients = {
    to: toStringArray(recipientsIn.to),
    cc: toStringArray(recipientsIn.cc),
    bcc: toStringArray(recipientsIn.bcc),
  };

  const rawAttachments = Array.isArray(msg.attachments) ? msg.attachments : [];
  const attachments: NormalizedOutlookAttachment[] = rawAttachments
    .filter((a: any) => a && typeof a === 'object')
    .map((a: any) => ({
      providerAttachmentId: typeof a.providerAttachmentId === 'string' ? a.providerAttachmentId : null,
      fileName: typeof a.name === 'string' ? a.name : null,
      fileType: typeof a.contentType === 'string' ? a.contentType : null,
      sizeBytes: Number.isFinite(a.sizeBytes) ? a.sizeBytes : null,
    }));

  return {
    valid,
    invalidReason,
    externalMessageId: externalMessageId || null,
    providerConversationId: typeof msg.providerConversationId === 'string' ? msg.providerConversationId : null,
    mailboxAddress: mailboxAddress || null,
    direction,
    subject,
    sender: sender || null,
    recipients,
    receivedAt: typeof msg.receivedAt === 'string' ? msg.receivedAt : null,
    sentAt: typeof msg.sentAt === 'string' ? msg.sentAt : null,
    contentPreview: outlookPreview(msg.bodyPreview),
    metadata: {
      provider: 'outlook',
      hasAttachments: Boolean(msg.hasAttachments) || attachments.length > 0,
      attachmentCount: attachments.length,
    },
    attachments,
  };
}

export async function runOutlookImportDryRun(body: OutlookImportBody): Promise<Record<string, unknown>> {
  const { mailboxAddress, messages } = readPayload(body);
  const mailboxNorm = normalizeEmailAddress(mailboxAddress);

  // First pass: normalize + validate (no DB access). Uses the shared normalizer.
  const normalized = messages.map((raw: any): OutlookDryRunItem => {
    const n = normalizeOutlookMessage(raw, mailboxNorm, mailboxAddress);
    const communicationPreview = n.valid
      ? {
          type: 'EMAIL',
          source: 'OUTLOOK',
          syncStatus: 'PENDING',
          externalMessageId: n.externalMessageId,
          providerConversationId: n.providerConversationId,
          mailboxAddress: n.mailboxAddress,
          direction: n.direction,
          subject: n.subject,
          sender: n.sender,
          recipients: n.recipients,
          receivedAt: n.receivedAt,
          sentAt: n.sentAt,
          contentPreview: n.contentPreview,
          metadata: n.metadata,
        }
      : null;

    return {
      externalMessageId: n.externalMessageId,
      providerConversationId: n.providerConversationId,
      direction: n.direction,
      wouldImport: false,
      duplicate: false,
      valid: n.valid,
      invalidReason: n.invalidReason,
      communicationPreview,
      attachmentPreviews: n.attachments,
    };
  });

  // Read-only duplicate detection by externalMessageId. NO writes.
  const candidateIds = Array.from(
    new Set(normalized.filter((n) => n.valid && n.externalMessageId).map((n) => n.externalMessageId as string)),
  );

  let existingIds = new Set<string>();
  if (candidateIds.length > 0) {
    try {
      const existing = await prisma.communication.findMany({
        where: { externalMessageId: { in: candidateIds } } as any,
        select: { externalMessageId: true } as any,
      });
      existingIds = new Set(
        (existing as unknown as Array<{ externalMessageId: string | null }>)
          .map((r) => r.externalMessageId)
          .filter((v): v is string => typeof v === 'string'),
      );
    } catch (error) {
      throw new OutlookImportServiceError(
        500,
        { error: 'Error checking existing communications for dry-run' },
        'POST /communications/outlook/import-dry-run dedupe',
      );
    }
  }

  for (const item of normalized) {
    if (!item.valid) continue;
    const dup = item.externalMessageId ? existingIds.has(item.externalMessageId) : false;
    item.duplicate = dup;
    item.wouldImport = !dup;
  }

  const summary = {
    received: normalized.length,
    new: normalized.filter((n) => n.valid && n.wouldImport).length,
    duplicates: normalized.filter((n) => n.valid && n.duplicate).length,
    invalid: normalized.filter((n) => !n.valid).length,
  };

  return {
    success: true,
    dryRun: true,
    mailboxAddress: mailboxAddress || null,
    summary,
    items: normalized.map((n) => ({
      externalMessageId: n.externalMessageId,
      providerConversationId: n.providerConversationId,
      direction: n.direction,
      wouldImport: n.wouldImport,
      duplicate: n.duplicate,
      valid: n.valid,
      ...(n.invalidReason ? { invalidReason: n.invalidReason } : {}),
      communicationPreview: n.communicationPreview,
      attachmentPreviews: n.attachmentPreviews,
    })),
  };
}

export async function importOutlookMessages(
  body: OutlookImportBody,
  userId: string | undefined,
  expectedMailboxAddress?: string,
): Promise<Record<string, unknown>> {
  const { mailboxAddress, messages } = readPayload(body);
  if (expectedMailboxAddress && normalizeEmailAddress(mailboxAddress) !== normalizeEmailAddress(expectedMailboxAddress)) {
    throw new OutlookImportServiceError(400, {
      status: 400,
      code: 'OUTLOOK_MAILBOX_SCOPE_MISMATCH',
      message: 'The import mailbox must match the server-configured workforce mailbox.',
    });
  }
  const mailboxNorm = normalizeEmailAddress(mailboxAddress);
  const normalized = messages.map((raw: any) => normalizeOutlookMessage(raw, mailboxNorm, mailboxAddress));

  // Read-only dedupe: existing externalMessageId -> existing communication id.
  const candidateIds = Array.from(
    new Set(normalized.filter((n) => n.valid && n.externalMessageId).map((n) => n.externalMessageId as string)),
  );
  const existingById = new Map<string, string>();
  if (candidateIds.length > 0) {
    try {
      const existing = await prisma.communication.findMany({
        where: { externalMessageId: { in: candidateIds } } as any,
        select: { id: true, externalMessageId: true } as any,
      });
      for (const row of existing as unknown as Array<{ id: string; externalMessageId: string | null }>) {
        if (row.externalMessageId) existingById.set(row.externalMessageId, row.id);
      }
    } catch (error) {
      throw new OutlookImportServiceError(
        500,
        { error: 'Error checking existing communications for import' },
        'POST /communications/outlook/import dedupe',
      );
    }
  }

  // New (non-duplicate, valid) messages to import.
  // De-duplicate the incoming page as well as the database. Graph retries can
  // repeat an item in one response; without this guard the second create would
  // abort the whole transaction on the unique externalMessageId constraint.
  const batchIds = new Set<string>();
  const toImport = normalized.filter((n) => {
    if (!n.valid || !n.externalMessageId || existingById.has(n.externalMessageId)) return false;
    if (batchIds.has(n.externalMessageId)) return false;
    batchIds.add(n.externalMessageId);
    return true;
  });

  const importedIds = new Map<string, string>();
  if (toImport.length > 0) {
    try {
      await prisma.$transaction(async (tx: any) => {
        for (const n of toImport) {
          const created = await tx.communication.create({
            data: {
              type: 'EMAIL',
              source: 'OUTLOOK',
              syncStatus: 'IMPORTED',
              externalMessageId: n.externalMessageId,
              providerConversationId: n.providerConversationId,
              mailboxAddress: n.mailboxAddress,
              direction: n.direction || undefined,
              subject: n.subject,
              senderEmail: n.sender,
              content: null,
              summary: n.contentPreview,
              receivedAt: parseOutlookDate(n.receivedAt),
              sentAt: parseOutlookDate(n.sentAt),
              importedAt: new Date(),
              recipients: n.recipients,
              metadata: n.metadata,
              createdById: userId,
              // caseId / clientId / documentId intentionally left null (no relationship inference)
            } as any,
          });
          importedIds.set(n.externalMessageId as string, created.id);

          // Attachment metadata only — no binaries. Dedupe non-null provider ids within the message.
          const seen = new Set<string>();
          for (const att of n.attachments) {
            if (att.providerAttachmentId) {
              if (seen.has(att.providerAttachmentId)) continue;
              seen.add(att.providerAttachmentId);
            }
            await tx.communicationAttachment.create({
              data: {
                communicationId: created.id,
                fileName: att.fileName || att.providerAttachmentId || 'attachment',
                fileType: att.fileType || undefined,
                providerAttachmentId: att.providerAttachmentId || undefined,
                sizeBytes: att.sizeBytes ?? undefined,
                uploadedById: userId,
              } as any,
            });
          }
        }
      }, { timeout: 120000, maxWait: 120000 });
    } catch (error) {
      throw new OutlookImportServiceError(
        500,
        { error: 'Error importing communications' },
        'POST /communications/outlook/import write',
      );
    }
  }

  const reportedImportedIds = new Set<string>();
  const items = normalized.map((n) => {
    if (!n.valid) {
      return {
        externalMessageId: n.externalMessageId,
        communicationId: null,
        imported: false,
        duplicate: false,
        valid: false,
        ...(n.invalidReason ? { invalidReason: n.invalidReason } : {}),
        direction: n.direction,
      };
    }
    const ext = n.externalMessageId as string;
    if (existingById.has(ext)) {
      return {
        externalMessageId: ext,
        communicationId: existingById.get(ext) as string,
        imported: false,
        duplicate: true,
        valid: true,
        direction: n.direction,
      };
    }
    if (reportedImportedIds.has(ext)) {
      return {
        externalMessageId: ext,
        communicationId: importedIds.get(ext) || null,
        imported: false,
        duplicate: true,
        valid: true,
        direction: n.direction,
      };
    }
    reportedImportedIds.add(ext);
    return {
      externalMessageId: ext,
      communicationId: importedIds.get(ext) || null,
      imported: true,
      duplicate: false,
      valid: true,
      direction: n.direction,
    };
  });

  const summary = {
    received: normalized.length,
    imported: items.filter((i) => i.imported).length,
    duplicates: items.filter((i) => i.duplicate).length,
    invalid: normalized.filter((n) => !n.valid).length,
  };

  return {
    success: true,
    dryRun: false,
    mailboxAddress: mailboxAddress || null,
    summary,
    items,
  };
}

// ============================================================================
// SAFE CONVERSATION (THREAD) LINKAGE
// ----------------------------------------------------------------------------
// Deterministic, non-guessing propagation: for each freshly imported message
// that carries a provider conversation id, if the OTHER messages already in the
// SAME conversation resolve to EXACTLY ONE distinct linked case, the imported
// message inherits that case (and its consistent client). If the conversation is
// unassigned or linked to MULTIPLE different cases, the message is left
// unassigned (needs review). No "probably this case" fallback and no guessed id.
// ============================================================================

export type ImportedMessageRef = {
  communicationId: string;
  providerConversationId: string | null;
};

type ConversationLinkageDb = {
  communication: {
    findMany: (args: {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
    }) => Promise<Array<{ id: string; caseId: string | null; clientId: string | null }>>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
};

export async function applySafeConversationLinkage(
  db: ConversationLinkageDb,
  refs: ImportedMessageRef[],
): Promise<{ linked: string[]; unassigned: string[] }> {
  const linked: string[] = [];
  const unassigned: string[] = [];

  const grouped = new Map<string, string[]>();
  for (const ref of refs) {
    if (!ref.providerConversationId) {
      unassigned.push(ref.communicationId);
      continue;
    }
    const list = grouped.get(ref.providerConversationId) || [];
    list.push(ref.communicationId);
    grouped.set(ref.providerConversationId, list);
  }

  for (const conversationId of grouped.keys()) {
    const ids = grouped.get(conversationId) as string[];
    const existing = await db.communication.findMany({
      where: { providerConversationId: conversationId },
      select: { id: true, caseId: true, clientId: true },
    });

    const distinctCaseIds = new Set<string>();
    let clientIdForCase: string | null = null;
    for (const row of existing) {
      if (row.caseId) {
        distinctCaseIds.add(row.caseId);
        clientIdForCase = row.clientId || null;
      }
    }

    // Exactly one distinct linked case across the conversation -> safe to propagate.
    if (distinctCaseIds.size !== 1) {
      for (const id of ids) unassigned.push(id);
      continue;
    }

    const targetCaseId = distinctCaseIds.values().next().value as string;
    for (const id of ids) {
      const row = existing.find((r) => r.id === id);
      if (row && row.caseId) {
        linked.push(id);
        continue;
      }
      await db.communication.update({ where: { id }, data: { caseId: targetCaseId, clientId: clientIdForCase } });
      linked.push(id);
    }
  }

  return { linked, unassigned };
}

// ============================================================================
// LIVE OUTLOOK SYNC (workforce, gated)
// ----------------------------------------------------------------------------
// Bounded inbound sync: reads a bounded recent window from the configured
// workforce mailbox via the Graph reader, maps through the shared normalizer,
// imports idempotently (dedupe by externalMessageId), then applies SAFE thread
// linkage. Returns only safe counts; never raw Graph payloads or tokens. Provider
// failures are classified into safe user-facing outcomes.
// ============================================================================

export type OutlookSyncResult = {
  success: boolean;
  configured: boolean;
  summary: { imported: number; alreadyKnown: number; needsAssignment: number; failed: number };
  threadLinked: number;
  items: Array<{
    externalMessageId: string | null;
    communicationId: string | null;
    imported: boolean;
    duplicate: boolean;
    valid: boolean;
    linkedToCase: boolean;
    needsAssignment: boolean;
    direction: 'INBOUND' | 'OUTBOUND' | null;
  }>;
};

type SyncDeps = {
  reader?: ReturnType<typeof createOutlookGraphMailReader>;
};

export async function syncOutlookMailbox(
  userId: string | undefined,
  opts: SyncDeps = {},
  rawConfig?: OutlookSyncConfig | null,
): Promise<OutlookSyncResult> {
  const reader = opts.reader || createOutlookGraphMailReader();
  const config = rawConfig !== undefined ? rawConfig : reader.config();

  if (!config) {
    throw new OutlookImportServiceError(501, {
      status: 501,
      code: 'OUTLOOK_IMPORT_NOT_CONFIGURED',
      message: 'Outlook kommunikáció szinkron nincs beállítva ebben a környezetben.',
      feature: 'OUTLOOK_IMPORT',
      nextStep: 'A production környezetben állítsd be a COMMUNICATIONS_MAILBOX és az app-only Graph hitelesítést.',
    });
  }

  let messages;
  try {
    messages = await reader.fetchRecentInbound(parseOutlookSyncLimit(undefined));
  } catch (error) {
    if (error instanceof OutlookGraphReaderError) {
      throw new OutlookImportServiceError(502, {
        status: 502,
        code: mapGraphErrorCode(error.classification),
        message: mapGraphErrorToMessage(error.classification),
        feature: 'OUTLOOK_IMPORT',
      });
    }
    throw new OutlookImportServiceError(502, {
      status: 502,
      code: 'OUTLOOK_GRAPH_UNAVAILABLE',
      message: 'Az Outlook szinkron pillanatnyilag nem érhető el. Kérjük, próbáld újra később.',
      feature: 'OUTLOOK_IMPORT',
    });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      success: true,
      configured: true,
      summary: { imported: 0, alreadyKnown: 0, needsAssignment: 0, failed: 0 },
      threadLinked: 0,
      items: [],
    };
  }

  const payload = mapGraphMessagesToOutlookImportPayload(messages, config.mailboxAddress);
  const result = (await importOutlookMessages(payload, userId, config.mailboxAddress)) as {
    items: Array<{
      externalMessageId: string | null;
      communicationId: string | null;
      imported: boolean;
      duplicate: boolean;
      valid: boolean;
      direction: 'INBOUND' | 'OUTBOUND' | null;
    }>;
  };

  // Build refs for newly imported messages so safe thread linkage can run.
  const refs: ImportedMessageRef[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const item = result.items[i];
    if (item && item.imported && item.communicationId) {
      const conversationId =
        typeof (messages[i] as { conversationId?: unknown }).conversationId === 'string'
          ? ((messages[i] as { conversationId?: unknown }).conversationId as string)
          : null;
      refs.push({ communicationId: item.communicationId, providerConversationId: conversationId });
    }
  }

  const { linked } = await applySafeConversationLinkage(prisma as unknown as ConversationLinkageDb, refs);

  const items = result.items.map((item, i) => {
    const isLinked = Boolean(item.communicationId && linked.includes(item.communicationId));
    return {
      externalMessageId: item.externalMessageId,
      communicationId: item.communicationId,
      imported: item.imported,
      duplicate: item.duplicate,
      valid: item.valid,
      linkedToCase: isLinked,
      needsAssignment: item.imported && Boolean(item.communicationId) && !isLinked,
      direction: item.direction,
    };
  });

  const importedCount = items.filter((i) => i.imported).length;
  const alreadyKnown = items.filter((i) => i.duplicate).length;
  const needsAssignment = items.filter((i) => i.needsAssignment).length;
  const failed = items.filter((i) => !i.valid).length;

  return {
    success: true,
    configured: true,
    summary: { imported: importedCount, alreadyKnown, needsAssignment, failed },
    threadLinked: linked.length,
    items,
  };
}

function mapGraphErrorCode(classification: OutlookGraphReaderError['classification']): string {
  switch (classification) {
    case 'CONFIG_UNAVAILABLE':
      return 'OUTLOOK_IMPORT_NOT_CONFIGURED';
    case 'RATE_LIMITED':
      return 'OUTLOOK_GRAPH_RATE_LIMITED';
    case 'AUTHORIZATION_FAILED':
      return 'OUTLOOK_GRAPH_AUTHORIZATION_FAILED';
    case 'GRAPH_UNAVAILABLE':
      return 'OUTLOOK_GRAPH_UNAVAILABLE';
    default:
      return 'OUTLOOK_GRAPH_UNAVAILABLE';
  }
}

function mapGraphErrorToMessage(classification: OutlookGraphReaderError['classification']): string {
  switch (classification) {
    case 'CONFIG_UNAVAILABLE':
      return 'Az Outlook szinkron nincs beállítva ebben a környezetben.';
    case 'RATE_LIMITED':
      return 'Az Outlook ideiglenesen túl sok kérést kapott. Próbáld újra később.';
    case 'AUTHORIZATION_FAILED':
      return 'Az Outlook elérési engedély nem érvényes. Fordulj a rendszergazdához.';
    case 'GRAPH_UNAVAILABLE':
      return 'Az Outlook szinkron pillanatnyilag nem érhető el. Próbáld újra később.';
    default:
      return 'Az Outlook szinkron nem sikerült. Próbáld újra később.';
  }
}
