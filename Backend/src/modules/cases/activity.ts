import { prisma } from '../../prisma/prisma.service';

export type CaseActivityKind = 'TASK' | 'DOCUMENT' | 'COMMUNICATION' | 'TIMELINE';
export type CaseActivitySource = 'tasks' | 'documents' | 'communications' | 'timeline_events';

export interface CaseActivityItem {
  id: string;
  kind: CaseActivityKind;
  source: CaseActivitySource;
  title: string;
  safeDescription: string | null;
  occurredAt: string;
  caseId: string;
  documentId?: string | null;
  communicationId?: string | null;
  taskId?: string | null;
  href?: string | null;
  meta: {
    status?: string | null;
    type?: string | null;
    attachmentCount?: number;
    sourceTaskCount?: number;
  };
}

export interface CaseActivityDto {
  caseId: string;
  generatedAt: string;
  pagination: {
    limit: number;
    offset: number;
    returned: number;
  };
  items: CaseActivityItem[];
  privacy: {
    rawDocumentTextIncluded: false;
    rawCommunicationBodyIncluded: false;
    attachmentBytesIncluded: false;
  };
}

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;
const ACTIVITY_TYPES = new Set<CaseActivityKind>(['TASK', 'DOCUMENT', 'COMMUNICATION', 'TIMELINE']);

function parseLimit(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function parseOffset(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function compactText(value?: string | null, max = 180): string | null {
  if (!value) return null;
  const compact = String(value).replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
}

function toIso(value?: Date | string | null): string {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function countByKey(rows: Array<Record<string, unknown>>, key: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row[key];
    if (typeof value === 'string' && value) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return counts;
}

export async function getCaseActivity(
  caseId: string,
  query: { limit?: unknown; offset?: unknown; type?: unknown } = {},
): Promise<CaseActivityDto | null> {
  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true },
  });
  if (!caseRecord) return null;

  const limit = parseLimit(query.limit);
  const offset = parseOffset(query.offset);
  const requestedType = String(query.type || '').trim().toUpperCase();
  const typeFilter = ACTIVITY_TYPES.has(requestedType as CaseActivityKind) ? requestedType as CaseActivityKind : null;

  const [tasks, documents, communications, timelineEvents] = await Promise.all([
    !typeFilter || typeFilter === 'TASK'
      ? prisma.task.findMany({
          where: { caseId },
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            taskType: true,
            dueDate: true,
            createdAt: true,
            updatedAt: true,
            documentId: true,
            sourceCommunicationId: true,
          },
          orderBy: { updatedAt: 'desc' },
          take: MAX_LIMIT,
        })
      : Promise.resolve([]),
    !typeFilter || typeFilter === 'DOCUMENT'
      ? prisma.document.findMany({
          where: { caseId },
          select: {
            id: true,
            name: true,
            fileName: true,
            documentType: true,
            category: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
          take: MAX_LIMIT,
        })
      : Promise.resolve([]),
    !typeFilter || typeFilter === 'COMMUNICATION'
      ? prisma.communication.findMany({
          where: { caseId },
          select: {
            id: true,
            subject: true,
            summary: true,
            type: true,
            documentId: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: MAX_LIMIT,
        })
      : Promise.resolve([]),
    !typeFilter || typeFilter === 'TIMELINE'
      ? prisma.timelineEvent.findMany({
          where: { caseId },
          select: {
            id: true,
            eventType: true,
            type: true,
            description: true,
            createdAt: true,
            documentId: true,
            communicationId: true,
            taskId: true,
          },
          orderBy: { createdAt: 'desc' },
          take: MAX_LIMIT,
        })
      : Promise.resolve([]),
  ]);

  const communicationIds = communications.map((item) => item.id);
  let attachmentCounts = new Map<string, number>();
  let sourceTaskCounts = new Map<string, number>();
  if (communicationIds.length > 0) {
    const [attachments, communicationTasks] = await Promise.all([
      prisma.communicationAttachment.findMany({
        where: { communicationId: { in: communicationIds } },
        select: { communicationId: true },
      }),
      prisma.task.findMany({
        where: { sourceCommunicationId: { in: communicationIds } } as any,
        select: { sourceCommunicationId: true } as any,
      }),
    ]);
    attachmentCounts = countByKey(attachments as Array<Record<string, unknown>>, 'communicationId');
    sourceTaskCounts = countByKey(communicationTasks as Array<Record<string, unknown>>, 'sourceCommunicationId');
  }

  const items: CaseActivityItem[] = [
    ...tasks.map((task) => ({
      id: `task-${task.id}`,
      kind: 'TASK' as const,
      source: 'tasks' as const,
      title: task.title,
      safeDescription: compactText(task.description),
      occurredAt: toIso(task.updatedAt || task.createdAt),
      caseId,
      documentId: task.documentId || null,
      communicationId: task.sourceCommunicationId || null,
      taskId: task.id,
      href: `/tasks?taskId=${encodeURIComponent(task.id)}`,
      meta: { status: task.status ? String(task.status) : null, type: task.taskType ? String(task.taskType) : null },
    })),
    ...documents.map((document) => ({
      id: `document-${document.id}`,
      kind: 'DOCUMENT' as const,
      source: 'documents' as const,
      title: document.fileName || document.name || 'Dokumentum',
      safeDescription: document.documentType || document.category ? [document.documentType, document.category].filter(Boolean).join(' · ') : null,
      occurredAt: toIso(document.updatedAt || document.createdAt),
      caseId,
      documentId: document.id,
      communicationId: null,
      taskId: null,
      href: `/documents/compare?caseId=${encodeURIComponent(caseId)}&documentId=${encodeURIComponent(document.id)}`,
      meta: { type: document.documentType || String(document.category || '') || null },
    })),
    ...communications.map((communication) => ({
      id: `communication-${communication.id}`,
      kind: 'COMMUNICATION' as const,
      source: 'communications' as const,
      title: communication.subject || 'Kommunikáció',
      safeDescription: compactText(communication.summary),
      occurredAt: toIso(communication.createdAt),
      caseId,
      documentId: communication.documentId || null,
      communicationId: communication.id,
      taskId: null,
      href: `/cases/${encodeURIComponent(caseId)}/communications`,
      meta: {
        type: communication.type ? String(communication.type) : null,
        attachmentCount: attachmentCounts.get(communication.id) || 0,
        sourceTaskCount: sourceTaskCounts.get(communication.id) || 0,
      },
    })),
    ...timelineEvents.map((event) => ({
      id: `timeline-${event.id}`,
      kind: 'TIMELINE' as const,
      source: 'timeline_events' as const,
      title: String(event.type || event.eventType || 'Ügyesemény'),
      safeDescription: compactText(event.description),
      occurredAt: toIso(event.createdAt),
      caseId,
      documentId: event.documentId || null,
      communicationId: event.communicationId || null,
      taskId: event.taskId || null,
      href: `/cases/${encodeURIComponent(caseId)}`,
      meta: { type: String(event.type || event.eventType || '') || null },
    })),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));

  const pagedItems = items.slice(offset, offset + limit);
  return {
    caseId,
    generatedAt: new Date().toISOString(),
    pagination: { limit, offset, returned: pagedItems.length },
    items: pagedItems,
    privacy: {
      rawDocumentTextIncluded: false,
      rawCommunicationBodyIncluded: false,
      attachmentBytesIncluded: false,
    },
  };
}
