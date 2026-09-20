/**
 * COMPLIANCE DISCOVERY 2.0 — CONTROL / EVIDENCE FOLLOW-UP JOURNEY
 *
 * After applicability is established, the client answers the workbook's
 * Bizonyíték_kérdések for the relevant controls:
 *
 *   YES     -> reuse/select an existing DocumentVersion -> EvidenceRecord
 *              -> EvidenceControlLink -> ClientControl marked implemented
 *   NO      -> ClientControl marked NOT_IMPLEMENTED -> client-safe next step
 *   UNKNOWN -> lawyer review state, no evidence recorded
 *
 * Reuses DocumentVersion, EvidenceRecord, EvidenceControlLink, ClientControl and
 * ControlDefinition. No second evidence model, no second uploader.
 *
 * Portal-scoped: authorization is the active ORGANIZATION workspace membership,
 * exactly like the company-profile answer service.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { lookupSafeControlLabel } from '../compliance/safeTopicRegistry';

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

const WRITE_ROLES = new Set(['REPRESENTATIVE', 'APPROVER']);
const ANSWERS = new Set(['YES', 'NO', 'UNKNOWN']);

export type ControlEvidenceRoute = 'UPLOAD_OR_REUSE_DOCUMENT' | 'MISSING_CONTROL_EVIDENCE' | 'LAWYER_REVIEW';

/**
 * Client-safe relevance of one evidence question, derived from the client's
 * persisted RequirementApplicability outcomes (never recomputed in the frontend).
 */
export type ControlEvidenceRelevance = 'APPLIES' | 'LEGAL_REVIEW_REQUIRED' | 'DOES_NOT_APPLY' | 'INSUFFICIENT_FACTS';

/** Folds the requirement outcomes behind one control into a single client-safe state. */
export function relevanceFor(outcomes: readonly string[]): ControlEvidenceRelevance {
  if (outcomes.length === 0) return 'INSUFFICIENT_FACTS';
  if (outcomes.includes('APPLIES')) return 'APPLIES';
  if (outcomes.some((outcome) => ['LEGAL_REVIEW_REQUIRED', 'TECHNICAL_REVIEW_REQUIRED', 'SOURCE_SUPPORT_INSUFFICIENT'].includes(outcome))) return 'LEGAL_REVIEW_REQUIRED';
  if (outcomes.includes('INSUFFICIENT_FACTS')) return 'INSUFFICIENT_FACTS';
  return 'DOES_NOT_APPLY';
}

export const CONTROL_EVIDENCE_ROUTE_LABEL_HU: Readonly<Record<ControlEvidenceRoute, string>> = {
  UPLOAD_OR_REUSE_DOCUMENT: 'A meglévő dokumentum csatolva; a bizonyíték rögzítve.',
  MISSING_CONTROL_EVIDENCE: 'Hiányzó dokumentum vagy intézkedés. Kérjük, pótolja vagy töltse fel.',
  LAWYER_REVIEW: 'Ügyvédi ellenőrzés szükséges.',
};

export type ControlEvidenceModule = 'DATA' | 'WHISTLEBLOWING' | 'CYBER';

/** Client-safe module identity derived from the canonical control key prefix. */
const MODULE_BY_CONTROL_PREFIX: Readonly<Record<string, ControlEvidenceModule>> = {
  'C-DATA': 'DATA',
  'C-WB': 'WHISTLEBLOWING',
  'C-CYBER': 'CYBER',
};

/** Returns the client-safe module for a canonical control key, or null when unsupported. */
export function moduleForControlKey(controlKey: string): ControlEvidenceModule | null {
  const prefix = controlKey.split('-').slice(0, 2).join('-');
  return MODULE_BY_CONTROL_PREFIX[prefix] ?? null;
}

/**
 * Reason a canonical control is deliberately held back from the client journey.
 * Internal audit metadata only — never projected into the customer payload.
 */
export type ControlEvidenceOmissionReason = 'NOT_PORTAL_VISIBLE' | 'UNSUPPORTED_MODULE' | 'NO_SAFE_QUESTION' | 'DOES_NOT_APPLY';

export interface ControlEvidenceCatalogEntry {
  readonly controlDefinitionId: string;
  readonly controlKey: string;
  readonly title: string;
  readonly questionHu: string;
  readonly module: ControlEvidenceModule;
  readonly relevance: ControlEvidenceRelevance;
}

export interface ControlEvidenceCatalog {
  readonly controls: ControlEvidenceCatalogEntry[];
  readonly omissions: ReadonlyArray<{ controlKey: string; reason: ControlEvidenceOmissionReason }>;
}

function error(status: number, code: string, message: string): never {
  throw Object.assign(new Error(message), { status, code });
}

async function workspaceClient(identityId: string, workspaceId: string, db: Db | Tx): Promise<string> {
  const now = new Date();
  const membership = await db.clientPortalWorkspaceMembership.findFirst({
    where: { clientPortalIdentityId: identityId, workspaceId, status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    select: { role: true },
  });
  if (!membership) error(403, 'CLIENT_WORKSPACE_FORBIDDEN', 'The selected workspace is not available.');
  if (!WRITE_ROLES.has(String(membership.role))) error(403, 'CLIENT_PROFILE_WRITE_FORBIDDEN', 'Evidence answers require representative or approver authority.');
  const workspace = await db.clientPortalWorkspace.findFirst({ where: { id: workspaceId, status: 'ACTIVE', mode: 'ORGANIZATION' }, select: { clientId: true } });
  if (!workspace) error(403, 'CLIENT_WORKSPACE_FORBIDDEN', 'The selected organization workspace is not available.');
  return workspace.clientId;
}

function isCurrent(validFrom: Date | null, validUntil: Date | null, now: Date): boolean {
  return (!validFrom || validFrom <= now) && (!validUntil || validUntil >= now);
}

/**
 * Derives the client-safe evidence catalogue from persisted canonical rows only:
 * the client's current RequirementApplicability outcomes, their
 * RequirementControlMap links and the mapped ControlDefinition rows.
 *
 * Safety is opt-in. A control is projected only when its key is allow-listed by
 * the safe topic registry, its canonical ControlDefinition carries a non-empty
 * customer question, and its key maps to a client-safe module. Every held-back
 * control is reported internally and never projected.
 *
 * Not a customer entry point: callers must resolve the client through an
 * authorized workspace first.
 */
export async function resolveControlEvidenceCatalog(clientId: string, db: Db | Tx, now: Date = new Date()): Promise<ControlEvidenceCatalog> {
  const client = db as Tx;
  const snapshots = await client.requirementApplicability.findMany({
    where: {
      clientId,
      scopeType: 'COMPANY',
      requirementVersion: { status: 'APPROVED', effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      ruleVersion: { status: 'APPROVED', supersededById: null },
    },
    orderBy: [{ evaluationAt: 'desc' }, { createdAt: 'desc' }],
    select: { requirementVersionId: true, ruleVersionId: true, scopeType: true, factSubjectId: true, outcome: true },
  });

  // Latest snapshot wins per (requirementVersion, ruleVersion, scope, subject):
  // rows arrive ordered by evaluationAt/createdAt desc, so first-seen is current.
  const latestOutcome = new Map<string, string>();
  for (const snapshot of snapshots) {
    const key = [snapshot.requirementVersionId, snapshot.ruleVersionId, snapshot.scopeType, snapshot.factSubjectId ?? ''].join(':');
    if (!latestOutcome.has(key)) latestOutcome.set(key, String(snapshot.outcome));
  }

  const requirementVersionIds = [...new Set(snapshots.map((snapshot) => snapshot.requirementVersionId))];
  const mappings = requirementVersionIds.length
    ? await client.requirementControlMap.findMany({
        where: { requirementVersionId: { in: requirementVersionIds } },
        select: {
          requirementVersionId: true,
          controlDefinition: { select: { id: true, key: true, title: true, description: true, status: true } },
        },
      })
    : [];

  const grouped = new Map<string, { definition: { id: string; key: string; title: string; description: string | null; status: string }; outcomes: string[] }>();
  for (const mapping of mappings) {
    const definition = mapping.controlDefinition;
    if (!definition) continue;
    const mappedOutcomes = [...latestOutcome.entries()]
      .filter(([key]) => key.startsWith(`${mapping.requirementVersionId}:`))
      .map(([, outcome]) => outcome);
    const bucket = grouped.get(definition.id) ?? { definition, outcomes: [] };
    bucket.outcomes.push(...mappedOutcomes);
    grouped.set(definition.id, bucket);
  }

  const controls: ControlEvidenceCatalogEntry[] = [];
  const omissions: Array<{ controlKey: string; reason: ControlEvidenceOmissionReason }> = [];
  for (const { definition, outcomes } of grouped.values()) {
    const controlKey = definition.key;
    if (definition.status !== 'ACTIVE') { omissions.push({ controlKey, reason: 'NOT_PORTAL_VISIBLE' }); continue; }
    if (!lookupSafeControlLabel(controlKey)) { omissions.push({ controlKey, reason: 'NOT_PORTAL_VISIBLE' }); continue; }
    const questionHu = definition.description?.trim() ?? '';
    if (!questionHu) { omissions.push({ controlKey, reason: 'NO_SAFE_QUESTION' }); continue; }
    const module = moduleForControlKey(controlKey);
    if (!module) { omissions.push({ controlKey, reason: 'UNSUPPORTED_MODULE' }); continue; }
    const relevance = relevanceFor(outcomes);
    if (relevance === 'DOES_NOT_APPLY') { omissions.push({ controlKey, reason: 'DOES_NOT_APPLY' }); continue; }
    controls.push({ controlDefinitionId: definition.id, controlKey, title: definition.title, questionHu, module, relevance });
  }
  controls.sort((left, right) => left.controlKey.localeCompare(right.controlKey));
  return { controls, omissions };
}

async function ensureClientControl(tx: Tx, clientId: string, controlDefinitionId: string, cadenceDays: number | null) {
  const existing = await tx.clientControl.findFirst({ where: { clientId, controlDefinitionId } });
  if (existing) return existing;
  return tx.clientControl.create({
    data: { clientId, controlDefinitionId, implementationStatus: 'NOT_ASSESSED', nextReviewAt: cadenceDays ? new Date(Date.now() + cadenceDays * 86_400_000) : null },
  });
}

async function assertDocumentInClient(tx: Tx, clientId: string, documentVersionId: string): Promise<void> {
  const found = await tx.documentVersion.findFirst({ where: { id: documentVersionId, document: { clientId } }, select: { id: true } });
  if (!found) error(400, 'EVIDENCE_CROSS_CLIENT', 'Referenced document version does not belong to this client.');
}

export interface ControlEvidenceAnswerResult {
  readonly controlKey: string;
  readonly module: 'DATA' | 'WHISTLEBLOWING' | 'CYBER';
  readonly route: ControlEvidenceRoute;
  readonly messageHu: string;
  readonly implemented: boolean;
  readonly documentVersionId: string | null;
}

/**
 * Records the client answer for one control's evidence question.
 * Idempotent for YES: an existing current evidence link is reused instead of
 * creating a duplicate record.
 *
 * The write gate is the SAME canonical eligibility boundary as the read
 * journey: the requested control must be present in
 * `resolveControlEvidenceCatalog(clientId)`. A control that is absent (not
 * allow-listed, or currently DOES_NOT_APPLY / unevaluated) fails closed before
 * any ClientControl, EvidenceRecord or EvidenceControlLink is touched.
 */
export async function submitControlEvidenceAnswer(
  identityId: string,
  workspaceId: string,
  controlKey: string,
  body: Record<string, unknown>,
  db: Db = defaultPrisma,
): Promise<ControlEvidenceAnswerResult> {
  const answer = String(body.answer || '').toUpperCase();
  if (!ANSWERS.has(answer)) error(400, 'EVIDENCE_ANSWER_INVALID', 'answer must be YES, NO or UNKNOWN.');

  return db.$transaction(async (tx) => {
    const clientId = await workspaceClient(identityId, workspaceId, tx);
    // Single canonical eligibility boundary shared with the read journey.
    const catalog = await resolveControlEvidenceCatalog(clientId, tx);
    const entry = catalog.controls.find((item) => item.controlKey === controlKey);
    if (!entry) error(404, 'EVIDENCE_QUESTION_NOT_FOUND', 'The requested evidence question is not available.');
    const definition = await tx.controlDefinition.findFirst({ where: { id: entry.controlDefinitionId, status: 'ACTIVE' } });
    if (!definition) error(404, 'EVIDENCE_QUESTION_NOT_FOUND', 'The requested evidence question is not available.');
    const { module, questionHu } = entry;
    const control = await ensureClientControl(tx, clientId, definition.id, definition.defaultReviewCadenceDays);
    const now = new Date();

    if (answer === 'UNKNOWN') {
      return { controlKey, module, route: 'LAWYER_REVIEW' as const, messageHu: CONTROL_EVIDENCE_ROUTE_LABEL_HU.LAWYER_REVIEW, implemented: false, documentVersionId: null };
    }

    if (answer === 'NO') {
      await tx.clientControl.update({ where: { id: control.id }, data: { implementationStatus: 'NOT_IMPLEMENTED', lastReviewedAt: now } });
      return { controlKey, module, route: 'MISSING_CONTROL_EVIDENCE' as const, messageHu: CONTROL_EVIDENCE_ROUTE_LABEL_HU.MISSING_CONTROL_EVIDENCE, implemented: false, documentVersionId: null };
    }

    const documentVersionId = typeof body.documentVersionId === 'string' ? body.documentVersionId.trim() : '';
    if (!documentVersionId) error(400, 'EVIDENCE_DOCUMENT_REQUIRED', 'A document version is required for a positive answer.');
    await assertDocumentInClient(tx, clientId, documentVersionId);

    // Reuse a current link/record rather than duplicating evidence.
    const existingLink = await tx.evidenceControlLink.findFirst({
      where: { clientId, clientControlId: control.id },
      include: { evidenceRecord: true },
      orderBy: { createdAt: 'desc' },
    });
    if (existingLink && existingLink.evidenceRecord.documentVersionId === documentVersionId && isCurrent(existingLink.evidenceRecord.validFrom, existingLink.evidenceRecord.validUntil, now)) {
      await tx.clientControl.update({ where: { id: control.id }, data: { implementationStatus: 'IMPLEMENTED', lastReviewedAt: now, nextReviewAt: definition.defaultReviewCadenceDays ? new Date(now.getTime() + definition.defaultReviewCadenceDays * 86_400_000) : control.nextReviewAt } });
      return { controlKey, module, route: 'UPLOAD_OR_REUSE_DOCUMENT' as const, messageHu: CONTROL_EVIDENCE_ROUTE_LABEL_HU.UPLOAD_OR_REUSE_DOCUMENT, implemented: true, documentVersionId };
    }

    const evidence = await tx.evidenceRecord.create({
      data: { clientId, sourceType: 'DOCUMENT_VERSION', status: 'PROVIDED', title: definition.title, description: questionHu, providedAt: now, validFrom: now, documentVersionId },
    });
    await tx.evidenceControlLink.create({ data: { clientId, evidenceRecordId: evidence.id, clientControlId: control.id } });
    await tx.clientControl.update({ where: { id: control.id }, data: { implementationStatus: 'IMPLEMENTED', lastReviewedAt: now, nextReviewAt: definition.defaultReviewCadenceDays ? new Date(now.getTime() + definition.defaultReviewCadenceDays * 86_400_000) : control.nextReviewAt } });
    return { controlKey, module, route: 'UPLOAD_OR_REUSE_DOCUMENT' as const, messageHu: CONTROL_EVIDENCE_ROUTE_LABEL_HU.UPLOAD_OR_REUSE_DOCUMENT, implemented: true, documentVersionId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export interface ControlEvidenceJourneyItem {
  readonly controlKey: string;
  readonly module: 'DATA' | 'WHISTLEBLOWING' | 'CYBER';
  readonly questionHu: string;
  readonly relevance: ControlEvidenceRelevance;
  readonly implemented: boolean;
  readonly evidenceLinked: boolean;
  readonly stateHu: string;
}

export interface ControlEvidenceReusableDocument {
  readonly documentVersionId: string;
  readonly label: string;
}

/**
 * Client-safe read of the applicable canonical evidence questions and their
 * state. The control catalogue is derived from persisted canonical rows and the
 * safe topic registry — never from a hard-coded representative subset.
 */
export async function getControlEvidenceJourney(identityId: string, workspaceId: string, db: Db = defaultPrisma): Promise<{ items: ControlEvidenceJourneyItem[]; reusableDocuments: ControlEvidenceReusableDocument[] }> {
  const now = new Date();
  const clientId = await workspaceClientReadOnly(identityId, workspaceId, db);
  const catalog = await resolveControlEvidenceCatalog(clientId, db, now);

  const reusableDocuments: ControlEvidenceReusableDocument[] = (await db.clientDocumentPublication.findMany({
    where: { clientId, status: 'PUBLISHED' },
    orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
    select: { documentVersionId: true, clientFacingTitle: true },
  })).map((publication) => ({ documentVersionId: publication.documentVersionId, label: publication.clientFacingTitle }));

  const controls = catalog.controls.length
    ? await db.clientControl.findMany({
        where: { clientId, controlDefinitionId: { in: catalog.controls.map((entry) => entry.controlDefinitionId) } },
        include: { evidenceLinks: { include: { evidenceRecord: true } } },
      })
    : [];
  const controlByDefinition = new Map(controls.map((control) => [control.controlDefinitionId, control]));

  const items: ControlEvidenceJourneyItem[] = catalog.controls.map((entry) => {
    const control = controlByDefinition.get(entry.controlDefinitionId) ?? null;
    const links = control?.evidenceLinks ?? [];
    const linked = links.some((link) => isCurrent(link.evidenceRecord.validFrom, link.evidenceRecord.validUntil, now));
    const implemented = control?.implementationStatus === 'IMPLEMENTED' && linked;
    const hasStaleEvidence = links.some((link) => !isCurrent(link.evidenceRecord.validFrom, link.evidenceRecord.validUntil, now));
    return {
      controlKey: entry.controlKey,
      module: entry.module,
      questionHu: entry.questionHu,
      relevance: entry.relevance,
      implemented,
      evidenceLinked: linked,
      stateHu: implemented
        ? 'Rendben, bizonyítékkal alátámasztva.'
        : control?.implementationStatus === 'NOT_IMPLEMENTED'
          ? 'Hiányzó dokumentum vagy intézkedés.'
          : hasStaleEvidence
            ? 'A korábbi bizonyíték felülvizsgálatra szorul.'
            : 'Még nincs kitöltve.',
    };
  });
  return { items, reusableDocuments };
}

async function workspaceClientReadOnly(identityId: string, workspaceId: string, db: Db): Promise<string> {
  const now = new Date();
  const membership = await db.clientPortalWorkspaceMembership.findFirst({
    where: { clientPortalIdentityId: identityId, workspaceId, status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    select: { role: true },
  });
  if (!membership) error(403, 'CLIENT_WORKSPACE_FORBIDDEN', 'The selected workspace is not available.');
  const workspace = await db.clientPortalWorkspace.findFirst({ where: { id: workspaceId, status: 'ACTIVE', mode: 'ORGANIZATION' }, select: { clientId: true } });
  if (!workspace) error(403, 'CLIENT_WORKSPACE_FORBIDDEN', 'The selected organization workspace is not available.');
  return workspace.clientId;
}
