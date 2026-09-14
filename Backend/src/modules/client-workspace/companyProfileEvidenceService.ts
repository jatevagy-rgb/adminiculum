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

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

const WRITE_ROLES = new Set(['REPRESENTATIVE', 'APPROVER']);
const ANSWERS = new Set(['YES', 'NO', 'UNKNOWN']);

export type ControlEvidenceRoute = 'UPLOAD_OR_REUSE_DOCUMENT' | 'MISSING_CONTROL_EVIDENCE' | 'LAWYER_REVIEW';

export const CONTROL_EVIDENCE_ROUTE_LABEL_HU: Readonly<Record<ControlEvidenceRoute, string>> = {
  UPLOAD_OR_REUSE_DOCUMENT: 'A meglévő dokumentum csatolva; a bizonyíték rögzítve.',
  MISSING_CONTROL_EVIDENCE: 'Hiányzó dokumentum vagy intézkedés. Kérjük, pótolja vagy töltse fel.',
  LAWYER_REVIEW: 'Ügyvédi ellenőrzés szükséges.',
};

/** The three representative evidence questions from the workbook. */
export const CONTROL_EVIDENCE_QUESTIONS: readonly { controlKey: string; module: 'DATA' | 'WHISTLEBLOWING' | 'CYBER'; questionHu: string }[] = [
  { controlKey: 'C-DATA-002', module: 'DATA', questionHu: 'Van jelenleg hatályos adatkezelési tájékoztatójuk?' },
  { controlKey: 'C-WB-001', module: 'WHISTLEBLOWING', questionHu: 'Működik belső visszaélés-bejelentési csatorna, és van róla szabályzat?' },
  { controlKey: 'C-CYBER-001', module: 'CYBER', questionHu: 'Van írásban rögzített kiberbiztonsági kockázatértékelés?' },
];

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
  const question = CONTROL_EVIDENCE_QUESTIONS.find((item) => item.controlKey === controlKey);
  if (!question) error(404, 'EVIDENCE_QUESTION_NOT_FOUND', 'The requested evidence question is not available.');

  return db.$transaction(async (tx) => {
    const clientId = await workspaceClient(identityId, workspaceId, tx);
    const definition = await tx.controlDefinition.findFirst({ where: { key: controlKey, status: 'ACTIVE' } });
    if (!definition) error(404, 'CONTROL_DEFINITION_NOT_FOUND', 'Control definition not found.');
    const control = await ensureClientControl(tx, clientId, definition.id, definition.defaultReviewCadenceDays);
    const now = new Date();

    if (answer === 'UNKNOWN') {
      return { controlKey, module: question.module, route: 'LAWYER_REVIEW' as const, messageHu: CONTROL_EVIDENCE_ROUTE_LABEL_HU.LAWYER_REVIEW, implemented: false, documentVersionId: null };
    }

    if (answer === 'NO') {
      await tx.clientControl.update({ where: { id: control.id }, data: { implementationStatus: 'NOT_IMPLEMENTED', lastReviewedAt: now } });
      return { controlKey, module: question.module, route: 'MISSING_CONTROL_EVIDENCE' as const, messageHu: CONTROL_EVIDENCE_ROUTE_LABEL_HU.MISSING_CONTROL_EVIDENCE, implemented: false, documentVersionId: null };
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
      return { controlKey, module: question.module, route: 'UPLOAD_OR_REUSE_DOCUMENT' as const, messageHu: CONTROL_EVIDENCE_ROUTE_LABEL_HU.UPLOAD_OR_REUSE_DOCUMENT, implemented: true, documentVersionId };
    }

    const evidence = await tx.evidenceRecord.create({
      data: { clientId, sourceType: 'DOCUMENT_VERSION', status: 'PROVIDED', title: definition.title, description: question.questionHu, providedAt: now, validFrom: now, documentVersionId },
    });
    await tx.evidenceControlLink.create({ data: { clientId, evidenceRecordId: evidence.id, clientControlId: control.id } });
    await tx.clientControl.update({ where: { id: control.id }, data: { implementationStatus: 'IMPLEMENTED', lastReviewedAt: now, nextReviewAt: definition.defaultReviewCadenceDays ? new Date(now.getTime() + definition.defaultReviewCadenceDays * 86_400_000) : control.nextReviewAt } });
    return { controlKey, module: question.module, route: 'UPLOAD_OR_REUSE_DOCUMENT' as const, messageHu: CONTROL_EVIDENCE_ROUTE_LABEL_HU.UPLOAD_OR_REUSE_DOCUMENT, implemented: true, documentVersionId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export interface ControlEvidenceJourneyItem {
  readonly controlKey: string;
  readonly module: 'DATA' | 'WHISTLEBLOWING' | 'CYBER';
  readonly questionHu: string;
  readonly implemented: boolean;
  readonly evidenceLinked: boolean;
  readonly stateHu: string;
}

/** Client-safe read of the three representative evidence questions and their state. */
export async function getControlEvidenceJourney(identityId: string, workspaceId: string, db: Db = defaultPrisma): Promise<{ items: ControlEvidenceJourneyItem[] }> {
  const now = new Date();
  const clientId = await workspaceClientReadOnly(identityId, workspaceId, db);
  const definitions = await db.controlDefinition.findMany({ where: { key: { in: CONTROL_EVIDENCE_QUESTIONS.map((item) => item.controlKey) } }, select: { id: true, key: true } });
  const byKey = new Map(definitions.map((definition) => [definition.key, definition.id]));
  const items: ControlEvidenceJourneyItem[] = [];
  for (const question of CONTROL_EVIDENCE_QUESTIONS) {
    const definitionId = byKey.get(question.controlKey);
    const control = definitionId ? await db.clientControl.findFirst({ where: { clientId, controlDefinitionId: definitionId }, include: { evidenceLinks: { include: { evidenceRecord: true } } } }) : null;
    const linked = (control?.evidenceLinks ?? []).some((link) => isCurrent(link.evidenceRecord.validFrom, link.evidenceRecord.validUntil, now));
    const implemented = control?.implementationStatus === 'IMPLEMENTED' && linked;
    items.push({
      controlKey: question.controlKey,
      module: question.module,
      questionHu: question.questionHu,
      implemented,
      evidenceLinked: linked,
      stateHu: implemented ? 'Rendben, bizonyítékkal alátámasztva.' : control?.implementationStatus === 'NOT_IMPLEMENTED' ? 'Hiányzó dokumentum vagy intézkedés.' : 'Még nincs kitöltve.',
    });
  }
  return { items };
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
