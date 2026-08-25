import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../../config/database';

type Db = PrismaClient | Prisma.TransactionClient;
type Urgency = 'NONE' | 'NORMAL' | 'ATTENTION' | 'URGENT';
type SourceType = 'TASK' | 'CASE_DEADLINE' | 'INTAKE_DEADLINE' | 'DOCUMENT_REVIEW' | 'DOCUMENT' | 'COMPLIANCE_PROPOSAL';
type Signal = { type: string; severity: Urgency; label: string; dueAt: string | null; sourceType: SourceType; sourceId?: string };

const CLOSED_CASES = new Set(['CANCELLED', 'ARCHIVED', 'FINAL']);
const CLOSED_TASKS = new Set(['COMPLETED', 'DONE', 'CANCELLED']);
const ACTIVE_REVIEW = new Set(['DRAFT', 'ASSIGNED', 'IN_REVIEW', 'RESUBMITTED', 'READY_FOR_REVIEW', 'CHANGES_REQUESTED']);
const SEVERITY_RANK: Record<Urgency, number> = { URGENT: 0, ATTENTION: 1, NORMAL: 2, NONE: 3 };
const SOURCE_ORDER: Record<SourceType, number> = { TASK: 0, CASE_DEADLINE: 1, INTAKE_DEADLINE: 2, DOCUMENT_REVIEW: 3, DOCUMENT: 4, COMPLIANCE_PROPOSAL: 5 };

export type CaseAttentionSummary = {
  caseId: string;
  urgency: Urgency;
  nextAction: { type: string; label: string; dueAt: string | null; actorUserId: string | null; sourceType: string; sourceId?: string } | null;
  signals: Signal[];
  lastMeaningfulChangeAt: string | null;
};

type CaseRow = { id: string; status: string; deadline: Date | null; updatedAt: Date; assignedLawyer: { id: string; name: string } | null; client: { id: string; name: string } };
type TaskRow = { id: string; title: string; status: string; priority: string; dueDate: Date | null; assignedToId: string | null; assignedTo: { id: string; name: string } | null; updatedAt: Date };
type DeadlineRow = { id: string; title: string; dueAt: Date; responsibleId: string | null; updatedAt: Date };
type DocumentRow = { id: string; title: string | null; name: string; workStatus: string; dueDate: Date | null; updatedAt: Date; reviews: Array<{ id: string; status: string; dueAt: Date | null; assignedReviewerId: string | null; updatedAt: Date }> };
type ProposalRow = { id: string; title: string; deadline: Date | null; assigneeId: string | null; updatedAt: Date };

function iso(date: Date | null | undefined): string | null { return date ? new Date(date).toISOString() : null; }
function daysFromNow(date: Date, now: Date): number { return (date.getTime() - now.getTime()) / 86_400_000; }
function taskSeverity(task: TaskRow, now: Date): Urgency {
  if (task.dueDate && task.dueDate.getTime() < now.getTime()) return 'URGENT';
  if (task.priority === 'URGENT' || (task.dueDate && daysFromNow(task.dueDate, now) <= 2)) return 'ATTENTION';
  return 'NORMAL';
}
function deadlineSeverity(dueAt: Date, now: Date): Urgency { return dueAt.getTime() < now.getTime() ? 'URGENT' : daysFromNow(dueAt, now) <= 2 ? 'ATTENTION' : 'NORMAL'; }
function sourceOrder(signal: Signal): number { return SOURCE_ORDER[signal.sourceType]; }

function buildSummary(caseRow: CaseRow, tasks: TaskRow[], deadlines: DeadlineRow[], documents: DocumentRow[], proposals: ProposalRow[], now = new Date()): CaseAttentionSummary {
  if (CLOSED_CASES.has(String(caseRow.status).toUpperCase())) return { caseId: caseRow.id, urgency: 'NONE', nextAction: null, signals: [], lastMeaningfulChangeAt: iso(caseRow.updatedAt) };
  const signals: Signal[] = [];
  for (const task of tasks.filter((item) => !CLOSED_TASKS.has(String(item.status).toUpperCase()))) {
    const severity = taskSeverity(task, now);
    signals.push({ type: 'TASK', severity, label: severity === 'URGENT' ? `Lejárt feladat: ${task.title}` : `Következő feladat: ${task.title}`, dueAt: iso(task.dueDate), sourceType: 'TASK', sourceId: task.id });
  }
  if (caseRow.deadline) signals.push({ type: 'CASE_DEADLINE', severity: deadlineSeverity(caseRow.deadline, now), label: 'Ügyhatáridő', dueAt: iso(caseRow.deadline), sourceType: 'CASE_DEADLINE' });
  for (const deadline of deadlines) signals.push({ type: 'INTAKE_DEADLINE', severity: deadlineSeverity(deadline.dueAt, now), label: deadline.title, dueAt: iso(deadline.dueAt), sourceType: 'INTAKE_DEADLINE', sourceId: deadline.id });
  for (const document of documents) {
    const review = document.reviews.find((item) => ACTIVE_REVIEW.has(String(item.status).toUpperCase()));
    if (review) signals.push({ type: 'DOCUMENT_REVIEW', severity: review.dueAt ? deadlineSeverity(review.dueAt, now) : 'ATTENTION', label: `Dokumentum-review: ${document.title || document.name}`, dueAt: iso(review.dueAt), sourceType: 'DOCUMENT_REVIEW', sourceId: document.id });
    else if (document.dueDate && !['ARCHIVED', 'APPROVED'].includes(String(document.workStatus).toUpperCase())) signals.push({ type: 'DOCUMENT_WORK', severity: deadlineSeverity(document.dueDate, now), label: `Dokumentum teendő: ${document.title || document.name}`, dueAt: iso(document.dueDate), sourceType: 'DOCUMENT', sourceId: document.id });
  }
  for (const proposal of proposals) signals.push({ type: 'COMPLIANCE_PROPOSAL', severity: proposal.deadline ? deadlineSeverity(proposal.deadline, now) : 'ATTENTION', label: `Döntés szükséges: ${proposal.title}`, dueAt: iso(proposal.deadline), sourceType: 'COMPLIANCE_PROPOSAL', sourceId: proposal.id });
  signals.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (a.dueAt || '9999').localeCompare(b.dueAt || '9999') || sourceOrder(a) - sourceOrder(b) || (a.sourceId || '').localeCompare(b.sourceId || ''));
  const top = signals[0];
  const changes = [caseRow.updatedAt, ...tasks.map((t) => t.updatedAt), ...deadlines.map((d) => d.updatedAt), ...documents.map((d) => d.updatedAt), ...proposals.map((p) => p.updatedAt)].filter(Boolean).sort((a, b) => b.getTime() - a.getTime());
  return { caseId: caseRow.id, urgency: top?.severity || 'NONE', nextAction: top ? { type: top.type, label: top.label, dueAt: top.dueAt, actorUserId: top.type === 'TASK' ? tasks.find((t) => t.id === top.sourceId)?.assignedToId || caseRow.assignedLawyer?.id || null : caseRow.assignedLawyer?.id || null, sourceType: top.sourceType, ...(top.sourceId ? { sourceId: top.sourceId } : {}) } : null, signals, lastMeaningfulChangeAt: iso(changes[0] || null) };
}

export async function getCaseAttentionSummary(caseId: string, db: Db = prisma): Promise<CaseAttentionSummary | null> {
  const result = await getAttentionRows([caseId], db);
  return result.get(caseId) || null;
}

export async function listCaseAttentionSummaries(params: { userId: string; role?: string | null; clientId?: string; limit?: number; offset?: number }, db: Db = prisma) {
  const privileged = new Set(['ADMIN', 'PARTNER']).has(String(params.role || '').toUpperCase());
  const where: Prisma.CaseWhereInput = { status: { notIn: ['CANCELLED', 'ARCHIVED', 'FINAL'] }, ...(params.clientId ? { clientId: params.clientId } : {}), ...(privileged ? {} : { OR: [{ assignedLawyerId: params.userId }, { createdById: params.userId }, { collaborators: { some: { userId: params.userId } } }] }) };
  const limit = Math.min(Math.max(params.limit || 25, 1), 50);
  const cases = await db.case.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: Math.max(params.offset || 0, 0), take: limit, select: { id: true, status: true, deadline: true, updatedAt: true, assignedLawyer: { select: { id: true, name: true } }, client: { select: { id: true, name: true } } } });
  const summaries = await getAttentionRows(cases.map((item) => item.id), db);
  return cases.map((item) => ({ case: { id: item.id, client: item.client, responsible: item.assignedLawyer }, attention: summaries.get(item.id)! })).sort((a, b) => SEVERITY_RANK[a.attention.urgency] - SEVERITY_RANK[b.attention.urgency]);
}

async function getAttentionRows(caseIds: string[], db: Db): Promise<Map<string, CaseAttentionSummary>> {
  if (caseIds.length === 0) return new Map();
  const [cases, tasks, deadlines, documents, proposals] = await Promise.all([
    db.case.findMany({ where: { id: { in: caseIds } }, select: { id: true, status: true, deadline: true, updatedAt: true, assignedLawyer: { select: { id: true, name: true } }, client: { select: { id: true, name: true } } } }),
    db.task.findMany({ where: { caseId: { in: caseIds }, status: { notIn: ['COMPLETED', 'DONE', 'CANCELLED'] } }, orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }], take: Math.min(caseIds.length * 100, 2000), select: { id: true, caseId: true, title: true, status: true, priority: true, dueDate: true, assignedToId: true, assignedTo: { select: { id: true, name: true } }, updatedAt: true } }),
    db.caseIntakeDeadline.findMany({ where: { caseId: { in: caseIds } }, orderBy: { dueAt: 'asc' }, take: Math.min(caseIds.length * 50, 1000), select: { id: true, caseId: true, title: true, dueAt: true, responsibleId: true, updatedAt: true } }),
    db.document.findMany({ where: { caseId: { in: caseIds }, workStatus: { not: 'ARCHIVED' } }, orderBy: { updatedAt: 'desc' }, take: Math.min(caseIds.length * 50, 1000), select: { id: true, caseId: true, title: true, name: true, workStatus: true, dueDate: true, updatedAt: true, reviews: { orderBy: { updatedAt: 'desc' }, take: 3, select: { id: true, status: true, dueAt: true, assignedReviewerId: true, updatedAt: true } } } }),
    db.complianceProposal.findMany({ where: { caseId: { in: caseIds }, status: 'PROPOSED' }, orderBy: { updatedAt: 'desc' }, take: Math.min(caseIds.length * 25, 500), select: { id: true, caseId: true, title: true, deadline: true, assigneeId: true, updatedAt: true } }),
  ]);
  const group = <T extends { caseId?: string | null }>(rows: T[]) => rows.reduce((map, row) => { if (row.caseId) map.set(row.caseId, [...(map.get(row.caseId) || []), row]); return map; }, new Map<string, T[]>());
  const byTask = group(tasks); const byDeadline = group(deadlines); const byDocument = group(documents); const byProposal = group(proposals); const result = new Map<string, CaseAttentionSummary>();
  for (const row of cases) result.set(row.id, buildSummary(row, byTask.get(row.id) || [], byDeadline.get(row.id) || [], byDocument.get(row.id) || [], byProposal.get(row.id) || []));
  return result;
}
