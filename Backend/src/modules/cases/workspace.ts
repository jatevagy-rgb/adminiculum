/**
 * Case workspace read projection (CASE-WORKSPACE-READ-PROJECTION-AND-OVERVIEW-1).
 *
 * Explicit, authorization-gated, scalar+bounded-relation projection for the case
 * overview mini-dashboard. No raw Prisma models, no unbounded includes, no full
 * communication bodies in list form. Optional sources degrade locally (warnings)
 * so a single failure never 500s the whole workspace.
 */
import { prisma } from '../../prisma/prisma.service';

const TASK_LIMIT = 8;
const DOCUMENT_LIMIT = 8;
const DEADLINE_LIMIT = 8;
const COMMUNICATION_LIMIT = 8;
const ACTIVITY_LIMIT = 12;
const PREVIEW_LEN = 140;

const CLOSED_CASE_TASK_STATUSES = new Set(['DONE', 'COMPLETED', 'CANCELLED', 'ARCHIVED']);
const REVIEW_TASK_STATUSES = new Set(['SUBMITTED', 'IN_REVIEW', 'UNDER_REVIEW', 'REVIEW_NEEDED']);

function isClosed(status?: string | null): boolean {
  return CLOSED_CASE_TASK_STATUSES.has(String(status || '').toUpperCase());
}
function iso(v: Date | null | undefined): string | null {
  return v ? new Date(v).toISOString() : null;
}
function preview(text?: string | null): string | null {
  if (!text) return null;
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length > PREVIEW_LEN ? `${t.slice(0, PREVIEW_LEN)}…` : t;
}

export interface CaseWorkspaceWarning {
  section: string;
  code: string;
  message: string;
}

export interface CaseWorkspaceDto {
  case: {
    id: string;
    caseNumber: string;
    title: string;
    status: string;
    priority: string;
    client: { id: string; name: string; colorKey: string | null } | null;
    assignedLawyer: { id: string; name: string } | null;
    description: string | null;
    nextStep: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  metrics: {
    openTaskCount: number;
    documentCount: number;
    openDeadlineCount: number;
    communicationCount: number;
    reviewCount: number | null;
    loggedMinutes: number | null;
  };
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    attentionCategory: string | null;
    estimatedMinutes: number | null;
    dueDate: string | null;
    assignee: { id: string; name: string } | null;
    documentId: string | null;
  }>;
  documents: Array<{
    id: string;
    fileName: string;
    mimeType: string | null;
    type: string | null;
    category: string | null;
    version: string | null;
    uploadedAt: string | null;
    uploadedBy: { id: string; name: string } | null;
    summary: string | null;
    commentCount: number | null;
  }>;
  deadlines: Array<{
    id: string;
    title: string;
    dueAt: string | null;
    status: string;
    assignee: { id: string; name: string } | null;
    taskId: string | null;
    documentId: string | null;
  }>;
  time:
    | { available: true; loggedMinutes: number; billableMinutes: number | null }
    | { available: false; reason: string };
  communications: Array<{
    id: string;
    type: string;
    subject: string | null;
    contentPreview: string | null;
    sender: string | null;
    timestamp: string | null;
    internal: boolean;
    taskId: string | null;
    documentId: string | null;
  }>;
  activity: Array<{
    id: string;
    actor: string | null;
    actionLabel: string;
    objectLabel: string;
    occurredAt: string;
    objectType: string;
    objectId: string | null;
  }>;
  warnings: CaseWorkspaceWarning[];
}

async function safe<T>(section: string, code: string, message: string, fn: () => Promise<T>, fallback: T, warnings: CaseWorkspaceWarning[]): Promise<T> {
  try {
    return await fn();
  } catch {
    warnings.push({ section, code, message });
    return fallback;
  }
}

/** Returns the workspace DTO, or null when the case does not exist. */
export async function getCaseWorkspace(caseId: string): Promise<CaseWorkspaceDto | null> {
  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      caseNumber: true,
      title: true,
      status: true,
      priority: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      client: { select: { id: true, name: true, colorKey: true } },
      assignedLawyer: { select: { id: true, name: true } },
    },
  });
  if (!caseRecord) return null;

  const warnings: CaseWorkspaceWarning[] = [];

  const allTasks = await safe(
    'tasks',
    'TASKS_UNAVAILABLE',
    'A feladatok most nem érhetők el.',
    () =>
      prisma.task.findMany({
        where: { caseId },
        select: {
          id: true, title: true, status: true, priority: true,
          attentionCategory: true, estimatedMinutes: true, dueDate: true,
          documentId: true, createdAt: true,
          assignedTo: { select: { id: true, name: true } },
          assignedBy: { select: { id: true, name: true } },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 200,
      }),
    [] as any[],
    warnings,
  );
  const openTasks = allTasks.filter((t) => !isClosed(t.status));

  const documents = await safe(
    'documents',
    'DOCUMENTS_UNAVAILABLE',
    'A dokumentumok most nem érhetők el.',
    () =>
      prisma.document.findMany({
        where: { caseId },
        select: {
          id: true, name: true, fileName: true, mimeType: true,
          documentType: true, category: true, version: true, currentVersion: true,
          createdAt: true, updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: DOCUMENT_LIMIT,
      }),
    [] as any[],
    warnings,
  );

  const communicationsRaw = await safe(
    'communications',
    'COMMUNICATIONS_UNAVAILABLE',
    'A kommunikáció most nem érhető el.',
    () =>
      prisma.communication.findMany({
        where: { caseId },
        select: {
          id: true, type: true, subject: true, content: true, senderName: true,
          direction: true, clientId: true, documentId: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: COMMUNICATION_LIMIT,
      }),
    [] as any[],
    warnings,
  );

  const communicationCount = await safe(
    'communications',
    'COMMUNICATION_COUNT_UNAVAILABLE',
    'A kommunikáció száma most nem számítható.',
    () => prisma.communication.count({ where: { caseId } }),
    communicationsRaw.length,
    warnings,
  );

  // ---- case time: TimeEntry has no caseId (only matterId/taskId); not directly
  // attributable to a case. Never present Matter time as Case time. ----
  const time: CaseWorkspaceDto['time'] = { available: false, reason: 'CASE_TIME_NOT_ATTRIBUTABLE' };
  warnings.push({ section: 'time', code: 'CASE_TIME_NOT_ATTRIBUTABLE', message: 'A munkaidő nem köthető megbízhatóan az ügyhöz (TimeEntry nincs Case-hez kapcsolva).' });

  // ---- tasks projection ----
  const tasks = openTasks.slice(0, TASK_LIMIT).map((t) => ({
    id: t.id,
    title: t.title,
    status: String(t.status),
    priority: String(t.priority),
    attentionCategory: t.attentionCategory ? String(t.attentionCategory) : null,
    estimatedMinutes: t.estimatedMinutes ?? null,
    dueDate: iso(t.dueDate),
    assignee: t.assignedTo ? { id: t.assignedTo.id, name: t.assignedTo.name } : null,
    documentId: t.documentId ?? null,
  }));

  // ---- documents projection (no uploader/summary/commentCount relation in the
  // current model → honest nulls + a warning; not fabricated) ----
  if (documents.length > 0) {
    warnings.push({ section: 'documents', code: 'DOCUMENT_META_LIMITED', message: 'A dokumentum feltöltő/összefoglaló/komment adat a jelenlegi modellből nem elérhető.' });
  }
  const documentsDto = documents.slice(0, DOCUMENT_LIMIT).map((d) => ({
    id: d.id,
    fileName: d.fileName || d.name || 'Dokumentum',
    mimeType: d.mimeType ?? null,
    type: d.documentType ?? null,
    category: d.category ? String(d.category) : null,
    version: d.version ?? (d.currentVersion != null ? `v${d.currentVersion}` : null),
    uploadedAt: iso(d.updatedAt || d.createdAt),
    uploadedBy: null,
    summary: null,
    commentCount: null,
  }));

  // ---- deadlines: derived from open tasks that carry a dueDate (reliable
  // task→case link). Case-level deadlines beyond tasks require the agenda source. ----
  const deadlines = openTasks
    .filter((t) => t.dueDate)
    .sort((a, b) => new Date(a.dueDate as Date).getTime() - new Date(b.dueDate as Date).getTime())
    .slice(0, DEADLINE_LIMIT)
    .map((t) => ({
      id: `task-${t.id}`,
      title: t.title,
      dueAt: iso(t.dueDate),
      status: String(t.status),
      assignee: t.assignedTo ? { id: t.assignedTo.id, name: t.assignedTo.name } : null,
      taskId: t.id,
      documentId: t.documentId ?? null,
    }));

  // ---- communications projection (compact; no full body) ----
  const communications = communicationsRaw.slice(0, COMMUNICATION_LIMIT).map((c) => {
    const type = String(c.type || '');
    const internal = type.toUpperCase() === 'NOTE' || (!c.clientId && String(c.direction || '').toUpperCase() !== 'OUTBOUND' && String(c.direction || '').toUpperCase() !== 'INBOUND');
    return {
      id: c.id,
      type,
      subject: c.subject ?? null,
      contentPreview: preview(c.content),
      sender: c.senderName ?? null,
      timestamp: iso(c.createdAt),
      internal,
      taskId: null as string | null,
      documentId: c.documentId ?? null,
    };
  });

  // ---- human-readable activity (actor / actionLabel / objectLabel) ----
  const activityItems: CaseWorkspaceDto['activity'] = [];
  for (const t of allTasks) {
    activityItems.push({
      id: `task-${t.id}`,
      actor: t.assignedBy?.name || t.assignedTo?.name || null,
      actionLabel: t.assignedTo ? 'feladatot osztott ki' : 'feladatot hozott létre',
      objectLabel: t.title,
      occurredAt: iso(t.createdAt) || new Date(0).toISOString(),
      objectType: 'TASK',
      objectId: t.id,
    });
  }
  for (const d of documents) {
    activityItems.push({
      id: `doc-${d.id}`,
      actor: null,
      actionLabel: 'dokumentumot töltött fel',
      objectLabel: d.fileName || d.name || 'Dokumentum',
      occurredAt: iso(d.updatedAt || d.createdAt) || new Date(0).toISOString(),
      objectType: 'DOCUMENT',
      objectId: d.id,
    });
  }
  for (const c of communicationsRaw) {
    const type = String(c.type || '').toUpperCase();
    const action = type === 'NOTE' ? 'belső jegyzetet rögzített' : type === 'EMAIL' ? 'e-mailt rögzített' : type === 'PHONE' ? 'telefonhívást rögzített' : type === 'MEETING' ? 'megbeszélést rögzített' : 'kommunikációt rögzített';
    activityItems.push({
      id: `comm-${c.id}`,
      actor: c.senderName || null,
      actionLabel: action,
      objectLabel: c.subject || 'Kommunikáció',
      occurredAt: iso(c.createdAt) || new Date(0).toISOString(),
      objectType: 'COMMUNICATION',
      objectId: c.id,
    });
  }
  activityItems.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));
  const activity = activityItems.slice(0, ACTIVITY_LIMIT);

  const reviewCount = openTasks.filter((t) => REVIEW_TASK_STATUSES.has(String(t.status).toUpperCase())).length;

  return {
    case: {
      id: caseRecord.id,
      caseNumber: caseRecord.caseNumber,
      title: caseRecord.title,
      status: String(caseRecord.status),
      priority: String(caseRecord.priority),
      client: caseRecord.client ? { id: caseRecord.client.id, name: caseRecord.client.name, colorKey: caseRecord.client.colorKey ? String(caseRecord.client.colorKey) : null } : null,
      assignedLawyer: caseRecord.assignedLawyer ? { id: caseRecord.assignedLawyer.id, name: caseRecord.assignedLawyer.name } : null,
      description: caseRecord.description ?? null,
      nextStep: null,
      createdAt: iso(caseRecord.createdAt),
      updatedAt: iso(caseRecord.updatedAt),
    },
    metrics: {
      openTaskCount: openTasks.length,
      documentCount: documents.length,
      openDeadlineCount: deadlines.length,
      communicationCount,
      reviewCount,
      loggedMinutes: null,
    },
    tasks,
    documents: documentsDto,
    deadlines,
    time,
    communications,
    activity,
    warnings,
  };
}
