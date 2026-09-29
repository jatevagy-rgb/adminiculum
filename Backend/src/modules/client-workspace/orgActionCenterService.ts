/**
 * CLIENT PORTAL 3.0 — Unified Action Center read model (checkpoint B).
 *
 * A READ-ONLY, customer-safe aggregation over existing canonical sources:
 *   ClientSubmission CORRECTION_REQUESTED
 *   ClientRequest (PUBLISHED / PARTIALLY_SUBMITTED)
 *   ClientActionRequest (published)
 *   ClientPortalIntakeRequest MORE_INFORMATION_REQUIRED
 *   Compliance portal-answerable missing information
 *   Grow explicit customer input (NOT currently representable — see below)
 *
 * NO new Prisma model, NO migration, NO PortalTask/CustomerTask, NO unified
 * action storage, NO duplicated completion state. Every source object keeps its
 * own authoritative lifecycle; this service only projects the subset that
 * represents CURRENT customer work.
 *
 * AUTHORIZATION: the resolved portal identity + workspace from the session and
 * the canonical ACTIVE grant model (resolveActiveCustomerGrant). No clientId /
 * caseId / membership / grant is ever accepted from the browser. Per-case
 * interaction reads keep their existing grant boundaries; a denied case
 * contributes nothing (fail closed).
 */

import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { assertClientSafe, InteractionError, resolveActiveCustomerGrant } from '../client-interaction/base';
import { listCustomerRequests } from '../client-interaction/requestService';
import { listCustomerSubmissions } from '../client-interaction/submissionService';
import { listPortalActionRequests } from '../client-publication/publicationService';
import { requireOrganizationWorkspace } from './organizationalAccessPolicy';
import { listOwnIntakes } from './intakeService';
import { getClientSafeComplianceReadModel } from '../compliance/clientSafeComplianceService';
import { lookupSafeTopic, portalVisibleKeys } from '../compliance/safeTopicRegistry';

type Prisma = typeof defaultPrisma;

export type PortalActionDomain =
  | 'LEGAL'
  | 'COMPLIANCE'
  | 'GROW'
  | 'COMPANY'
  | 'INTAKE';

export type PortalActionKind =
  | 'UPLOAD'
  | 'FORM'
  | 'ANSWER'
  | 'CORRECTION'
  | 'CONFIRM'
  | 'PROFILE_FACT'
  | 'INTAKE_MORE_INFO'
  | 'GROW_INPUT';

export type PortalActionSourceType =
  | 'CLIENT_ACTION_REQUEST'
  | 'CLIENT_REQUEST'
  | 'CLIENT_SUBMISSION'
  | 'INTAKE'
  | 'COMPLIANCE_MISSING_FACT'
  | 'GROW_REQUEST';

export interface PortalActionItem {
  /** Stable prefixed projection id — never a DB id and never a storage key. */
  id: string;
  sourceType: PortalActionSourceType;
  sourceId: string;
  domain: PortalActionDomain;
  kind: PortalActionKind;
  title: string;
  contextLabel: string | null;
  dueAt: string | null;
  urgency: 'OVERDUE' | 'DUE_SOON' | 'NORMAL';
  state: 'OPEN' | 'IN_PROGRESS' | 'CORRECTION_REQUIRED';
  actionLabel: string;
  href: string;
  canCompleteInPortal: boolean;
  /**
   * Canonical matter publication id when the source is matter-scoped
   * (CLIENT_REQUEST / CLIENT_SUBMISSION / CLIENT_ACTION_REQUEST); null for
   * workspace-scoped sources (INTAKE / COMPLIANCE). Additive, customer-safe:
   * the publication id is already the customer-facing matter identity.
   */
  matterPublicationId: string | null;
}

export interface PortalActionCenterDto {
  items: PortalActionItem[];
  counts: { open: number; overdue: number; dueSoon: number };
}

/**
 * The customer-visible ClientRequest statuses where the customer must CURRENTLY
 * act. SUBMITTED / UNDER_INTERNAL_REVIEW are office-review states and are never
 * presented as "Önre vár" work. COMPLETED / CANCELLED / EXPIRED are terminal.
 */
export const ACTIVE_CUSTOMER_REQUEST_STATUSES: ReadonlySet<string> = new Set(['PUBLISHED', 'PARTIALLY_SUBMITTED']);

/** Deterministic urgency — no AI, no hidden task priority, no fabrication. */
export function computeUrgency(dueAt: string | null, now: Date): PortalActionItem['urgency'] {
  if (!dueAt) return 'NORMAL';
  const due = new Date(dueAt).getTime();
  if (Number.isNaN(due)) return 'NORMAL';
  const nowMs = now.getTime();
  if (due < nowMs) return 'OVERDUE';
  if (due - nowMs <= 3 * 24 * 60 * 60 * 1000) return 'DUE_SOON';
  return 'NORMAL';
}

/** Deterministic projection id for a canonical source row. */
export function actionItemId(prefix: string, ...parts: Array<string | null | undefined>): string {
  return `${prefix}-${parts.filter(Boolean).join('-')}`;
}

/** Map a canonical ClientRequest type to the V3 action kind. */
export function customerRequestActionKind(type: string): PortalActionKind {
  switch (type) {
    case 'DOCUMENT_UPLOAD':
    case 'MISSING_DOCUMENT_REQUEST':
      return 'UPLOAD';
    case 'DATA_FORM':
    case 'INFORMATION_REQUEST':
      return 'FORM';
    case 'QUESTION_RESPONSE':
      return 'ANSWER';
    case 'CORRECTION_REQUEST':
      return 'CORRECTION';
    default:
      return 'FORM';
  }
}

/** Map a published ClientActionRequest typeLabel to the V3 action kind. */
export function actionRequestActionKind(typeLabel: string): PortalActionKind {
  switch (typeLabel) {
    case 'Dokumentum bekérése':
      return 'UPLOAD';
    case 'Információkérés':
    case 'Adatbekérés':
      return 'FORM';
    case 'Kérdés':
    case 'Kérdés megválaszolása':
      return 'ANSWER';
    case 'Javítási kérés':
      return 'CORRECTION';
    case 'Megerősítés szükséges':
      return 'CONFIRM';
    default:
      return 'CONFIRM';
  }
}

const CUSTOMER_ACTION_LABELS: Record<PortalActionKind, string> = {
  UPLOAD: 'Feltöltés megnyitása',
  FORM: 'Kitöltés megnyitása',
  ANSWER: 'Válasz megnyitása',
  CORRECTION: 'Javítás megnyitása',
  CONFIRM: 'Teendő megnyitása',
  PROFILE_FACT: 'Adat megadása',
  INTAKE_MORE_INFO: 'Adatkérés megnyitása',
  GROW_INPUT: 'Megnyitás',
};

const URGENCY_ORDER: Record<PortalActionItem['urgency'], number> = { OVERDUE: 0, DUE_SOON: 1, NORMAL: 2 };
const SOURCE_ORDER: Record<PortalActionSourceType, number> = {
  CLIENT_SUBMISSION: 0,
  CLIENT_REQUEST: 1,
  CLIENT_ACTION_REQUEST: 2,
  INTAKE: 3,
  COMPLIANCE_MISSING_FACT: 4,
  GROW_REQUEST: 5,
};

function matterHref(matterPublicationId: string | null | undefined): string | null {
  return matterPublicationId ? `/portal/matters/${encodeURIComponent(String(matterPublicationId))}` : null;
}

/**
 * Resolve the requirement key for a ClientRequest's compliance provenance
 * (requirement / control / finding) so a compliance topic can be superseded by
 * an explicit request with the same canonical provenance — never by title text.
 */
async function buildRequestProvenance(
  workspaceClientId: string,
  requestRows: Array<{ requirementVersionId: string | null; clientControlId: string | null; findingId: string | null }>,
  isProduction: boolean,
  demoEnabled: boolean,
  prisma: Prisma,
): Promise<Set<string>> {
  const requirementVersionIds = [...new Set(requestRows.map((row) => row.requirementVersionId).filter((id): id is string => Boolean(id)))];
  const findingIds = [...new Set(requestRows.map((row) => row.findingId).filter((id): id is string => Boolean(id)))];
  const controlIds = [...new Set(requestRows.map((row) => row.clientControlId).filter((id): id is string => Boolean(id)))];

  const keyToTopic = new Map<string, string>();
  for (const key of portalVisibleKeys(isProduction, demoEnabled)) {
    const topic = lookupSafeTopic(key, isProduction, demoEnabled);
    if (topic) keyToTopic.set(key, topic.topicKey);
  }

  const covered = new Set<string>();
  const markKey = (key: string | null | undefined) => {
    if (!key) return;
    const topicKey = keyToTopic.get(key);
    if (topicKey) covered.add(topicKey);
  };

  if (requirementVersionIds.length) {
    const versions = await prisma.requirementVersion.findMany({
      where: { id: { in: requirementVersionIds } },
      select: { id: true, requirement: { select: { key: true } } },
    });
    for (const version of versions) markKey(version.requirement?.key);
  }
  if (findingIds.length) {
    const findings = await prisma.assessmentFinding.findMany({
      where: { id: { in: findingIds }, clientId: workspaceClientId },
      select: { id: true, requirementApplicability: { select: { requirementVersion: { select: { requirement: { select: { key: true } } } } } } },
    });
    for (const finding of findings) markKey(finding.requirementApplicability?.requirementVersion?.requirement?.key);
  }
  if (controlIds.length) {
    const controls = await prisma.clientControl.findMany({
      where: { id: { in: controlIds }, clientId: workspaceClientId },
      select: { id: true, controlDefinition: { select: { requirementMaps: { select: { requirementVersion: { select: { requirement: { select: { key: true } } } } } } } } },
    });
    for (const control of controls) {
      for (const map of control.controlDefinition.requirementMaps) {
        markKey(map.requirementVersion?.requirement?.key);
      }
    }
  }
  return covered;
}

const FORBIDDEN_ACTION_CENTER_FIELDS = [
  'workInstruction', 'taskNotes', 'reviewer', 'internalOwner', 'assessmentFinding',
  'sharePoint', 'spItemId', 'aiPrompt', 'aiResponse', 'auditEvent',
  'requirementVersionId', 'clientControlId', 'findingId',
];

/**
 * Safety net: forbid internal fields from ever crossing the boundary. Pure so
 * the contract is directly unit-testable.
 */
export function assertActionCenterDtoSafe(dto: unknown): void {
  assertClientSafe(dto);
  const json = JSON.stringify(dto ?? null);
  for (const forbidden of FORBIDDEN_ACTION_CENTER_FIELDS) {
    if (json.toLowerCase().includes(forbidden.toLowerCase())) {
      throw new InteractionError(500, 'ACTION_CENTER_FORBIDDEN_FIELD', 'Action center DTO contains forbidden internal data.');
    }
  }
}

/**
 * Aggregate the unified customer Action Center for the ORGANIZATION workspace.
 * Read-only projection; every source keeps its own lifecycle.
 */
export async function getOrganizationalActionCenter(
  identityId: string,
  workspaceId: string,
  prisma: Prisma = defaultPrisma,
): Promise<PortalActionCenterDto> {
  const workspace = await requireOrganizationWorkspace(workspaceId, prisma);

  const isProduction = process.env.NODE_ENV === 'production';
  const demoEnabled = !isProduction && process.env.ADMINICULUM_DEMO_CONTENT_ENABLED === 'true';
  const now = new Date();

  // ---- Case scope: exactly the ACTIVE grants of this identity in this workspace.
  const grants = await prisma.clientPortalGrant.findMany({
    where: {
      clientPortalIdentityId: identityId,
      workspaceId,
      status: 'ACTIVE',
      validFrom: { lte: now },
      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
    },
    select: { caseId: true },
    distinct: ['caseId'],
  });
  const caseIds = grants.map((grant) => grant.caseId);

  const matterByCase = new Map<string, { id: string; title: string }>();
  if (caseIds.length) {
    const publications = await prisma.clientMatterPublication.findMany({
      where: { caseId: { in: caseIds }, status: 'PUBLISHED', currentRevisionId: { not: null }, OR: [{ workspaceId }, { workspaceId: null }] },
      select: { id: true, caseId: true, workspaceId: true, currentRevisionId: true },
      orderBy: { publishedAt: 'desc' },
    });
    const preferred = [...new Map(
      publications.sort((left, right) => Number(right.workspaceId === workspaceId) - Number(left.workspaceId === workspaceId)).map((publication) => [publication.caseId, publication]),
    ).values()];
    const revisionIds = preferred.map((publication) => publication.currentRevisionId).filter((id): id is string => Boolean(id));
    const revisions = revisionIds.length
      ? await prisma.clientMatterPublicationRevision.findMany({
          where: { id: { in: revisionIds } },
          select: { id: true, clientSafeTitle: true },
        })
      : [];
    const titleById = new Map(revisions.map((revision) => [revision.id, revision.clientSafeTitle]));
    for (const publication of preferred) {
      matterByCase.set(publication.caseId, { id: publication.id, title: titleById.get(publication.currentRevisionId) || '' });
    }
  }

  // ---- Per-case canonical interaction reads (grant-gated, fail closed per case).
  type RequestRow = {
    id: string;
    caseId: string;
    type: string;
    status: string;
    title: string;
    dueAt: string | null;
    matterPublicationId: string | null;
    matterTitle: string | null;
  };
  type CorrectionRow = { requestId: string; submissionId: string };

  const requestRows: RequestRow[] = [];
  const correctionRows: CorrectionRow[] = [];
  for (const caseId of caseIds) {
    try {
      const ctx = await resolveActiveCustomerGrant(identityId, caseId, workspaceId, prisma);
      const matter = matterByCase.get(caseId) || null;
      const [requests, submissions] = await Promise.all([
        listCustomerRequests(ctx, prisma),
        listCustomerSubmissions(ctx, undefined, prisma),
      ]);
      for (const request of requests.items as any[]) {
        requestRows.push({
          id: request.id,
          caseId,
          type: String(request.type),
          status: String(request.status),
          title: String(request.title),
          dueAt: request.dueAt ? String(request.dueAt) : null,
          matterPublicationId: matter?.id || null,
          matterTitle: matter?.title || null,
        });
      }
      for (const submission of submissions.items as any[]) {
        if (String(submission.status) === 'CORRECTION_REQUESTED') {
          correctionRows.push({ requestId: String(submission.requestId), submissionId: String(submission.id) });
        }
      }
    } catch {
      // A denied or unresolvable case contributes nothing — fail closed.
    }
  }

  const items: PortalActionItem[] = [];

  // ---- Source 1: CORRECTION_REQUESTED submissions supersede their request.
  const correctionRequestIds = new Set<string>();
  const requestById = new Map(requestRows.map((row) => [row.id, row]));
  const seenCorrections = new Set<string>();
  for (const correction of correctionRows) {
    if (seenCorrections.has(correction.requestId)) continue;
    seenCorrections.add(correction.requestId);
    correctionRequestIds.add(correction.requestId);
    const request = requestById.get(correction.requestId);
    const matterPublicationId = request?.matterPublicationId || null;
    items.push({
      id: actionItemId('correction', correction.requestId),
      sourceType: 'CLIENT_SUBMISSION',
      sourceId: correction.submissionId,
      domain: 'LEGAL',
      kind: 'CORRECTION',
      title: request?.title || 'Javítás szükséges',
      contextLabel: request?.matterTitle || null,
      dueAt: request?.dueAt || null,
      urgency: computeUrgency(request?.dueAt || null, now),
      state: 'CORRECTION_REQUIRED',
      actionLabel: CUSTOMER_ACTION_LABELS.CORRECTION,
      href: matterHref(matterPublicationId)
        ? `${matterHref(matterPublicationId)}/requests/${encodeURIComponent(correction.requestId)}`
        : '/portal/ugyek',
      canCompleteInPortal: true,
      matterPublicationId: matterPublicationId,
    });
  }

  // ---- Source 2: active ClientRequest rows (correction-superseded excluded).
  for (const request of requestRows) {
    if (!ACTIVE_CUSTOMER_REQUEST_STATUSES.has(request.status)) continue;
    if (correctionRequestIds.has(request.id)) continue;
    const kind = customerRequestActionKind(request.type);
    items.push({
      id: actionItemId('request', request.id),
      sourceType: 'CLIENT_REQUEST',
      sourceId: request.id,
      domain: 'LEGAL',
      kind,
      title: request.title,
      contextLabel: request.matterTitle || null,
      dueAt: request.dueAt,
      urgency: computeUrgency(request.dueAt, now),
      state: request.status === 'PARTIALLY_SUBMITTED' ? 'IN_PROGRESS' : 'OPEN',
      actionLabel: CUSTOMER_ACTION_LABELS[kind],
      href: matterHref(request.matterPublicationId)
        ? `${matterHref(request.matterPublicationId)}/requests/${encodeURIComponent(request.id)}`
        : '/portal/ugyek',
      canCompleteInPortal: true,
      matterPublicationId: request.matterPublicationId,
    });
  }

  // ---- Source 3: published ClientActionRequest (canonical workspace-scoped projection).
  const actionRequests = await listPortalActionRequests({ userId: identityId, role: 'CLIENT_PORTAL', workspaceId }, undefined, prisma);
  for (const action of (actionRequests.items as any[])) {
    const matterPublicationId = (action.matterId ?? action.matterPublicationId ?? null) as string | null;
    const kind = actionRequestActionKind(String(action.typeLabel || ''));
    items.push({
      id: actionItemId('action-request', action.id),
      sourceType: 'CLIENT_ACTION_REQUEST',
      sourceId: action.id,
      domain: 'LEGAL',
      kind,
      title: String(action.title),
      contextLabel: action.matterTitle ? String(action.matterTitle) : null,
      dueAt: action.dueAt ? String(action.dueAt) : null,
      urgency: computeUrgency(action.dueAt ? String(action.dueAt) : null, now),
      state: 'OPEN',
      actionLabel: CUSTOMER_ACTION_LABELS[kind],
      href: matterHref(matterPublicationId) || `/portal/action-requests/${encodeURIComponent(String(action.id))}`,
      // Online completion of published action requests is not implemented yet;
      // the canonical journey is the read-only action request / matter page.
      canCompleteInPortal: false,
      matterPublicationId: matterPublicationId,
    });
  }

  // ---- Source 4: intake MORE_INFORMATION_REQUIRED.
  const intakes = await listOwnIntakes(identityId, workspaceId, { limit: 50 }, prisma);
  for (const intake of intakes.items as any[]) {
    if (String(intake.status?.code) !== 'more-information-required') continue;
    const request = intake.informationRequest || null;
    if (!request?.reference) continue;
    items.push({
      id: actionItemId('intake', intake.reference),
      sourceType: 'INTAKE',
      sourceId: String(intake.reference),
      domain: 'INTAKE',
      kind: 'INTAKE_MORE_INFO',
      title: request.title ? String(request.title) : String(intake.subject),
      contextLabel: intake.subject ? String(intake.subject) : null,
      dueAt: request.dueAt ? String(request.dueAt) : null,
      urgency: computeUrgency(request.dueAt ? String(request.dueAt) : null, now),
      state: 'OPEN',
      actionLabel: CUSTOMER_ACTION_LABELS.INTAKE_MORE_INFO,
      href: `/portal/megkeresesek/${encodeURIComponent(String(intake.reference))}`,
      canCompleteInPortal: true,
      matterPublicationId: null,
    });
  }

  // ---- Source 5: compliance portal-answerable missing information.
  // Provenance dedupe: an explicit active ClientRequest for the same canonical
  // requirement provenance supersedes the compliance topic row.
  const provenanceRequests = requestRows.filter((row) => ACTIVE_CUSTOMER_REQUEST_STATUSES.has(row.status));
  const provenanceRows = await prisma.clientRequest.findMany({
    where: { id: { in: provenanceRequests.map((row) => row.id) } },
    select: { id: true, requirementVersionId: true, clientControlId: true, findingId: true },
  });
  const coveredTopicIds = await buildRequestProvenance(workspace.clientId, provenanceRows, isProduction, demoEnabled, prisma);

  const complianceModel = await getClientSafeComplianceReadModel(workspace.clientId, isProduction, demoEnabled, prisma).catch(() => ({ topics: [], controlsSummary: [] }));
  for (const topic of complianceModel.topics as any[]) {
    if (coveredTopicIds.has(String(topic.topicId))) continue;
    for (const missing of (topic.missingInformation || []) as any[]) {
      if (missing.portalAnswerable !== true || typeof missing.questionKey !== 'string' || !missing.questionKey.trim()) continue;
      items.push({
        id: actionItemId('compliance', topic.topicId, missing.questionKey),
        sourceType: 'COMPLIANCE_MISSING_FACT',
        sourceId: String(topic.topicId),
        domain: 'COMPLIANCE',
        kind: 'PROFILE_FACT',
        title: String(missing.label),
        contextLabel: String(topic.topicLabel),
        dueAt: null,
        urgency: 'NORMAL',
        state: 'OPEN',
        actionLabel: CUSTOMER_ACTION_LABELS.PROFILE_FACT,
        href: '/portal/megfeleles',
        canCompleteInPortal: true,
        matterPublicationId: null,
      });
    }
  }

  // ---- Source 6: Grow explicit customer input.
  // NOT CURRENTLY REPRESENTABLE: the backend has no canonical Grow
  // customer-input request primitive (no GrowRequest / publish boundary for a
  // customer-facing Grow input). The assessment catalogue is customer-initiated
  // and is not a request to the customer, so it is intentionally NOT converted
  // into tasks. No Grow items are returned in this checkpoint.

  items.sort((left, right) => {
    return URGENCY_ORDER[left.urgency] - URGENCY_ORDER[right.urgency]
      || String(left.dueAt || '9999').localeCompare(String(right.dueAt || '9999'))
      || SOURCE_ORDER[left.sourceType] - SOURCE_ORDER[right.sourceType]
      || left.id.localeCompare(right.id);
  });

  const dto: PortalActionCenterDto = {
    items,
    counts: {
      open: items.length,
      overdue: items.filter((item) => item.urgency === 'OVERDUE').length,
      dueSoon: items.filter((item) => item.urgency === 'DUE_SOON').length,
    },
  };

  // Safety net: forbid internal fields from ever crossing the boundary.
  assertActionCenterDtoSafe(dto);
  return dto;
}
