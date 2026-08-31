import { Prisma as PrismaTypes } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import {
  assertClientReadAccess,
  internalCaseScope,
  type InternalActor,
  type Prisma,
} from '../client-interaction/base';

export type ClientCommunicationSummaryItem = {
  id: string;
  sender: string | null;
  subject: string;
  timestamp: string | null;
  preview: string | null;
  clientId: string | null;
  caseId: string | null;
  caseNumber: string | null;
  caseTitle: string | null;
  attachmentCount: number;
  taskCount: number;
};

export type ClientCommunicationSummary = {
  client: { id: string; name: string };
  communications: ClientCommunicationSummaryItem[];
};

export const DEFAULT_CLIENT_SUMMARY_LIMIT = 15;
export const MAX_CLIENT_SUMMARY_LIMIT = 50;
export const CLIENT_SUMMARY_TIMESTAMP_CONTRACT = 'receivedAt ?? sentAt ?? createdAt';
const CONTENT_PREVIEW_LIMIT = 240;

export type ClientSummaryOptions = { limit?: number };

function clampLimit(value: number | undefined): number {
  if (value == null || !Number.isFinite(value) || value < 1) return DEFAULT_CLIENT_SUMMARY_LIMIT;
  return Math.min(Math.floor(value), MAX_CLIENT_SUMMARY_LIMIT);
}

function toContentPreview(content: string | null): string | null {
  if (!content) return null;
  const compact = content.replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  return compact.length > CONTENT_PREVIEW_LIMIT
    ? `${compact.slice(0, CONTENT_PREVIEW_LIMIT - 1)}…`
    : compact;
}

function countByKey(rows: Array<{ communicationId?: string | null; sourceCommunicationId?: string | null }>, key: 'communicationId' | 'sourceCommunicationId'): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row[key];
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

export async function listClientCommunicationSummary(
  actor: InternalActor,
  clientId: string,
  opts: ClientSummaryOptions = {},
  prisma: Prisma = defaultPrisma,
): Promise<ClientCommunicationSummary> {
  const client = await assertClientReadAccess(actor, clientId, prisma);
  const clientCases = await prisma.case.findMany({
    where: { clientId },
    select: { id: true, caseNumber: true, title: true },
  });
  const scope = await internalCaseScope(actor, prisma);
  const readableClientCases = scope === null
    ? clientCases
    : clientCases.filter((item) => scope.includes(item.id));
  const readableCaseIds = readableClientCases.map((item) => item.id);
  const caseById = new Map(readableClientCases.map((item) => [item.id, item]));

  const where: PrismaTypes.CommunicationWhereInput = {
    OR: [
      { clientId, caseId: null },
      { caseId: { in: readableCaseIds }, clientId: null },
      { caseId: { in: readableCaseIds }, clientId },
    ],
  };
  const limit = clampLimit(opts.limit);
  const select = {
    id: true,
    subject: true,
    senderName: true,
    senderEmail: true,
    recipientName: true,
    content: true,
    caseId: true,
    clientId: true,
    createdAt: true,
    receivedAt: true,
    sentAt: true,
  } as const;
  const bucketLimit = Math.min(limit, MAX_CLIENT_SUMMARY_LIMIT);
  const [receivedRows, sentRows, createdRows] = await Promise.all([
    prisma.communication.findMany({
      where: { AND: [where, { receivedAt: { not: null } }] },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: bucketLimit,
      select,
    }),
    prisma.communication.findMany({
      where: { AND: [where, { receivedAt: null, sentAt: { not: null } }] },
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      take: bucketLimit,
      select,
    }),
    prisma.communication.findMany({
      where: { AND: [where, { receivedAt: null, sentAt: null }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: bucketLimit,
      select,
    }),
  ]);
  const rows = [...receivedRows, ...sentRows, ...createdRows];

  rows.sort((a, b) => {
    const left = a.receivedAt || a.sentAt || a.createdAt;
    const right = b.receivedAt || b.sentAt || b.createdAt;
    const timestampDiff = right.getTime() - left.getTime();
    return timestampDiff || b.id.localeCompare(a.id);
  });
  const selected = rows.slice(0, limit);
  const selectedIds = selected.map((row) => row.id);
  const [attachments, tasks] = selectedIds.length > 0
    ? await Promise.all([
      prisma.communicationAttachment.findMany({
        where: { communicationId: { in: selectedIds } },
        select: { communicationId: true },
      }),
      prisma.task.findMany({
        where: { sourceCommunicationId: { in: selectedIds } },
        select: { sourceCommunicationId: true },
      }),
    ])
    : [[], []];
  const attachmentCounts = countByKey(attachments, 'communicationId');
  const taskCounts = countByKey(tasks, 'sourceCommunicationId');

  const communications = selected.map((row) => {
    const linkedCase = row.caseId ? caseById.get(row.caseId) : null;
    const timestamp = row.receivedAt || row.sentAt || row.createdAt;
    return {
      id: row.id,
      sender: row.senderName || row.senderEmail || row.recipientName || null,
      subject: row.subject,
      timestamp: timestamp.toISOString(),
      preview: toContentPreview(row.content),
      clientId: row.clientId,
      caseId: linkedCase?.id || null,
      caseNumber: linkedCase?.caseNumber || null,
      caseTitle: linkedCase?.title || null,
      attachmentCount: attachmentCounts.get(row.id) || 0,
      taskCount: taskCounts.get(row.id) || 0,
    };
  });

  return {
    client,
    communications,
  };
}
