/**
 * Litigation Dossier — WORKFLOW-CORE-LITIGATION-CASE-LIFECYCLE-1
 *
 * One canonical READ-ONLY contract that assembles a matter dossier from
 * production-compatible structured data only:
 *   - documents by human-assigned `DocumentCategory` (EVIDENCE = evidence,
 *     COURT_FILING = pleadings/submissions);
 *   - tasks linked to those documents;
 *   - procedural dates from the canonical deadline/agenda engine.
 *
 * TRUTHFUL IMPLEMENTATION NOTE
 * ---------------------------------------------------------------------------
 * The schema has NO structured model for legal issues/claims/allegations,
 * evidence-to-issue relations, pleading filing status, hearings, parties,
 * opposing parties, court references, or burden of proof. Those concepts are
 * SCHEMA_CHANGE_REQUIRED and are therefore reported as unavailable via the
 * `availability` flags — never simulated, never inferred from free text, and
 * never stored in JSON/description fields.
 *
 * A document being categorized EVIDENCE/COURT_FILING is an explicit human
 * classification on the Document model (not text inference), so it is safe to
 * read. This contract exposes metadata only — never raw document text,
 * workspaceText, extracted text, communication content, or storage paths.
 */

import { prisma } from '../../prisma/prisma.service';
import { AgendaRequestError, getCaseDeadlines } from '../agenda/service';

export interface LitigationDossierIssue {
  id: string;
  title: string;
  safeSummary?: string | null;
  type?: string | null;
  status?: string | null;
  position?: { side?: string | null; state?: string | null } | null;
  evidenceSummary: {
    supporting: number;
    contradicting: number;
    neutral: number;
    unclassified: number;
  };
  relatedTaskIds: string[];
  relatedDocumentIds: string[];
  capabilities: {
    canOpen: boolean;
    canEdit: boolean;
    canCreateTask: boolean;
    canLinkEvidence: boolean;
    canChangeStatus: boolean;
  };
  href?: string | null;
}

export interface LitigationDossierEvidence {
  id: string;
  displayName: string;
  type?: string | null;
  status?: string | null;
  relation: 'SUPPORTING' | 'CONTRADICTING' | 'NEUTRAL' | 'UNCLASSIFIED';
  issueIds: string[];
  document?: { id: string; displayName: string; href?: string | null } | null;
  capabilities: {
    canOpen: boolean;
    canCompare: boolean;
    canCreateTask: boolean;
    canLinkToIssue: boolean;
    canUnlinkFromIssue: boolean;
  };
}

export interface LitigationDossierPleading {
  id: string;
  displayName: string;
  type?: string | null;
  status?: string | null;
  filedAt?: string | null;
  updatedAt?: string | null;
  relatedDocumentId?: string | null;
  relatedTaskIds: string[];
  capabilities: {
    canOpen: boolean;
    canCompare: boolean;
    canCreateReviewTask: boolean;
    canSubmitForReview: boolean;
    canApprove: boolean;
    canReturnForCorrection: boolean;
    canMarkFiled: boolean;
    canSupersede: boolean;
  };
}

export interface LitigationDossierProceduralDate {
  id: string;
  title: string;
  dueAt: string;
  urgency: string;
  sourceType: string;
  href?: string | null;
}

export interface LitigationDossierDto {
  caseId: string;
  generatedAt: string;
  summary: {
    activeIssues: number;
    unresolvedIssues: number;
    evidenceItems: number;
    pleadingsInDraft: number;
    pleadingsInReview: number;
    filedPleadings: number;
    upcomingProceduralDates: number;
  };
  issues: LitigationDossierIssue[];
  evidence: LitigationDossierEvidence[];
  pleadings: LitigationDossierPleading[];
  proceduralDates: LitigationDossierProceduralDate[];
  availability: {
    issues: boolean;
    evidence: boolean;
    issueEvidenceRelations: boolean;
    pleadings: boolean;
    filingStatus: boolean;
    proceduralDates: boolean;
    parties: boolean;
    burdenOfProof: boolean;
  };
}

const PRIVILEGED_ROLES = new Set(['ADMIN', 'PARTNER']);
const MAX_DOCS = 100;

export interface DossierActor {
  userId: string;
  role?: string | null;
}

function toIso(value?: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type DossierDocumentRow = {
  id: string;
  name: string | null;
  fileName: string | null;
  documentType: string | null;
  category: string;
  updatedAt: Date;
};

async function loadCaseManagerFlag(
  caseId: string,
  actor: DossierActor
): Promise<{ exists: boolean; isManager: boolean }> {
  const caseRow = await prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true, assignedLawyerId: true, createdById: true },
  });
  if (!caseRow) return { exists: false, isManager: false };
  const isManager =
    (actor.role && PRIVILEGED_ROLES.has(actor.role)) ||
    caseRow.assignedLawyerId === actor.userId ||
    caseRow.createdById === actor.userId;
  return { exists: true, isManager: Boolean(isManager) };
}

async function loadProceduralDates(caseId: string, actor: DossierActor, now: Date): Promise<LitigationDossierProceduralDate[]> {
  try {
    const deadlines = await getCaseDeadlines(caseId, actor.userId, { status: 'OPEN', limit: 50, now });
    return deadlines.items.map((item) => ({
      id: item.id,
      title: item.title,
      dueAt: item.dueAt,
      urgency: item.urgency,
      sourceType: item.sourceType,
      href: item.href ?? null,
    }));
  } catch (error) {
    // Privileged non-owner viewers can be rejected by the agenda case-scope guard;
    // degrade to an empty procedural list rather than duplicating the engine.
    if (error instanceof AgendaRequestError) return [];
    throw error;
  }
}

export async function getCaseLitigationDossier(
  caseId: string,
  actor: DossierActor,
  now = new Date()
): Promise<LitigationDossierDto | null> {
  const { exists, isManager } = await loadCaseManagerFlag(caseId, actor);
  if (!exists) return null;

  const [documents, proceduralDates] = await Promise.all([
    prisma.document.findMany({
      where: { caseId, category: { in: ['EVIDENCE', 'COURT_FILING'] as any } },
      orderBy: { updatedAt: 'desc' },
      take: MAX_DOCS,
      select: {
        id: true,
        name: true,
        fileName: true,
        documentType: true,
        category: true,
        updatedAt: true,
      },
    }) as Promise<DossierDocumentRow[]>,
    loadProceduralDates(caseId, actor, now),
  ]);

  const documentIds = documents.map((doc) => doc.id);
  const linkedTasks =
    documentIds.length > 0
      ? await prisma.task.findMany({
          where: { caseId, documentId: { in: documentIds } },
          select: { id: true, documentId: true },
        })
      : [];

  const tasksByDocument = new Map<string, string[]>();
  for (const task of linkedTasks) {
    if (!task.documentId) continue;
    tasksByDocument.set(task.documentId, [...(tasksByDocument.get(task.documentId) || []), task.id]);
  }

  const evidenceDocs = documents.filter((doc) => String(doc.category).toUpperCase() === 'EVIDENCE');
  const pleadingDocs = documents.filter((doc) => String(doc.category).toUpperCase() === 'COURT_FILING');

  const evidence: LitigationDossierEvidence[] = evidenceDocs.map((doc) => {
    const displayName = doc.fileName || doc.name || 'Bizonyíték';
    return {
      id: doc.id,
      displayName,
      type: doc.documentType || null,
      status: null,
      // No evidence-to-issue relation model exists → always UNCLASSIFIED.
      relation: 'UNCLASSIFIED',
      issueIds: [],
      document: {
        id: doc.id,
        displayName,
        href: `/documents/compare?caseId=${encodeURIComponent(caseId)}&documentId=${encodeURIComponent(doc.id)}`,
      },
      capabilities: {
        canOpen: true,
        canCompare: true,
        canCreateTask: isManager,
        canLinkToIssue: false, // no issue model
        canUnlinkFromIssue: false, // no relation model
      },
    };
  });

  const pleadings: LitigationDossierPleading[] = pleadingDocs.map((doc) => {
    const displayName = doc.fileName || doc.name || 'Beadvány';
    return {
      id: doc.id,
      displayName,
      type: doc.documentType || null,
      // No pleading filing-status column exists → status/filedAt unavailable.
      status: null,
      filedAt: null,
      updatedAt: toIso(doc.updatedAt),
      relatedDocumentId: doc.id,
      relatedTaskIds: tasksByDocument.get(doc.id) || [],
      capabilities: {
        canOpen: true,
        canCompare: true,
        // Review runs through the existing task-backed review flow (Tasks surface).
        canCreateReviewTask: isManager,
        canSubmitForReview: false,
        canApprove: false,
        canReturnForCorrection: false,
        // No filing-status persistence → filing/supersede can never be performed here.
        canMarkFiled: false,
        canSupersede: false,
      },
    };
  });

  const openProcedural = proceduralDates.length;

  return {
    caseId,
    generatedAt: now.toISOString(),
    summary: {
      activeIssues: 0,
      unresolvedIssues: 0,
      evidenceItems: evidence.length,
      // Pleading-by-status counts require a filing-status field that does not exist.
      pleadingsInDraft: 0,
      pleadingsInReview: 0,
      filedPleadings: 0,
      upcomingProceduralDates: openProcedural,
    },
    issues: [], // no structured issue model
    evidence,
    pleadings,
    proceduralDates,
    availability: {
      issues: false, // SCHEMA_CHANGE_REQUIRED
      evidence: true, // read via DocumentCategory.EVIDENCE
      issueEvidenceRelations: false, // SCHEMA_CHANGE_REQUIRED
      pleadings: true, // read via DocumentCategory.COURT_FILING
      filingStatus: false, // SCHEMA_CHANGE_REQUIRED
      proceduralDates: true, // canonical deadline engine
      parties: false, // SCHEMA_CHANGE_REQUIRED
      burdenOfProof: false, // not represented, not inferred
    },
  };
}
