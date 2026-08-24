/**
 * Client-safe compliance read model for the organizational portal.
 *
 * Projects RequirementApplicability + AssessmentFinding data through a
 * safe topic registry, producing human-friendly DTOs that never expose
 * internal requirement keys, severity, raw engine states, proposals,
 * rule ASTs, or workforce-only fields.
 *
 * SCOPE: COMPANY findings only. Employee/person subject findings are
 * excluded from the portal projection.
 *
 * BOUNDARY: This module MUST NOT import or reference:
 * - complianceProposalService (7B proposal mutation)
 * - createProposal / bindProposal / confirmProposal
 * - createTask
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { assertClientSafe, InteractionError } from '../client-interaction/base';
import { lookupSafeTopic, portalVisibleKeys, type SafeTopicEntry } from './safeTopicRegistry';

type Prisma = typeof defaultPrisma;

/* ------------------------------------------------------------------ */
/*  DTO types                                                          */
/* ------------------------------------------------------------------ */

export interface MissingInformationItem {
  /** Safe portal question label (never a FactDefinition key). */
  label: string;
  /** Whether this dependency can be answered through the portal. */
  portalAnswerable: boolean;
}

export interface ClientSafeComplianceTopicDto {
  /** Stable opaque identifier: `requirementVersionId:factsSubjectId` or finding id. */
  topicId: string;
  /** Human-readable topic label from the safe topic registry. */
  topicLabel: string;
  /** Client-safe state — never a raw engine enum. */
  state:
    | 'REVIEW_RECOMMENDED'
    | 'MORE_INFORMATION_NEEDED'
    | 'LAWYER_REVIEW_REQUIRED'
    | 'ACTION_IN_PROGRESS'
    | 'RESOLVED';
  /** Short neutral explanation of the compliance state. */
  shortExplanation: string;
  /** Missing information items (empty array when complete). */
  missingInformation: MissingInformationItem[];
  /** Recommended next action for the client. */
  nextAction: string | null;
}

export interface ClientSafeComplianceReadModel {
  topics: ClientSafeComplianceTopicDto[];
}

/* ------------------------------------------------------------------ */
/*  State mapping — deterministic, no AI, no fabrication                */
/* ------------------------------------------------------------------ */

const APPLICABILITY_STATE_MAP: Record<string, string> = {
  APPLIES: 'REVIEW_RECOMMENDED',
  INSUFFICIENT_FACTS: 'MORE_INFORMATION_NEEDED',
  LEGAL_REVIEW_REQUIRED: 'LAWYER_REVIEW_REQUIRED',
  TECHNICAL_REVIEW_REQUIRED: 'LAWYER_REVIEW_REQUIRED',
  SOURCE_SUPPORT_INSUFFICIENT: 'LAWYER_REVIEW_REQUIRED',
};

const FINDING_STATE_MAP: Record<string, string> = {
  OPEN: 'REVIEW_RECOMMENDED',
  ACKNOWLEDGED: 'ACTION_IN_PROGRESS',
  ACTION_PLANNED: 'ACTION_IN_PROGRESS',
  RESOLVED: 'RESOLVED',
};

function mapClientState(
  applicabilityOutcome: string | null,
  findingStatus: string | null,
): ClientSafeComplianceTopicDto['state'] {
  if (applicabilityOutcome === 'INSUFFICIENT_FACTS') return 'MORE_INFORMATION_NEEDED';
  if (applicabilityOutcome === 'LEGAL_REVIEW_REQUIRED' || applicabilityOutcome === 'TECHNICAL_REVIEW_REQUIRED' || applicabilityOutcome === 'SOURCE_SUPPORT_INSUFFICIENT') {
    return 'LAWYER_REVIEW_REQUIRED';
  }
  if (findingStatus && FINDING_STATE_MAP[findingStatus]) {
    return FINDING_STATE_MAP[findingStatus] as ClientSafeComplianceTopicDto['state'];
  }
  return 'REVIEW_RECOMMENDED';
}

function buildShortExplanation(
  state: ClientSafeComplianceTopicDto['state'],
  topic: SafeTopicEntry,
): string {
  if (topic.shortExplanation) return topic.shortExplanation;
  switch (state) {
    case 'MORE_INFORMATION_NEEDED':
      return 'További információk szükségesek a követelmény teljesítéséhez.';
    case 'LAWYER_REVIEW_REQUIRED':
      return 'Ügyvédi értékelés szükséges.';
    case 'ACTION_IN_PROGRESS':
      return 'A szükséges lépések folyamatban vannak.';
    case 'RESOLVED':
      return 'A követelmény teljesítve van.';
    default:
      return 'Felülvizsgálat javasolt.';
  }
}

function buildNextAction(
  state: ClientSafeComplianceTopicDto['state'],
  missingInformation: MissingInformationItem[],
): string | null {
  if (state === 'MORE_INFORMATION_NEEDED' && missingInformation.length > 0) {
    return 'Kérjük, töltse ki a hiányzó információkat a portálon.';
  }
  if (state === 'LAWYER_REVIEW_REQUIRED') {
    return 'Ügyvédünk hamarosan felveszi Önnel a kapcsolatot.';
  }
  if (state === 'RESOLVED') return null;
  if (state === 'ACTION_IN_PROGRESS') return 'A folyamat állapotáról a portálon tájékozódhat.';
  return 'Kérjük, tekintse át a jelenlegi állapotot.';
}

/* ------------------------------------------------------------------ */
/*  Missing information resolution                                      */
/* ------------------------------------------------------------------ */

async function resolveMissingInformation(
  applicabilityId: string,
  clientId: string,
  prisma: Prisma,
): Promise<MissingInformationItem[]> {
  const dependencies = await prisma.applicabilityRuleFactDependency.findMany({
    where: { applicabilityRuleVersion: { applicabilitySnapshots: { some: { id: applicabilityId } } } },
    select: { factKey: true, resolvedFactDefinition: { select: { key: true, questionKey: true } } },
  });

  if (dependencies.length === 0) return [];

  const consumedFactKeys = new Set(
    (
      await prisma.requirementApplicabilityFact.findMany({
        where: { applicabilityId },
        select: { factKey: true },
      })
    ).map((f) => f.factKey),
  );

  const missing: MissingInformationItem[] = [];
  for (const dep of dependencies) {
    if (consumedFactKeys.has(dep.factKey)) continue;
    const questionKey = dep.resolvedFactDefinition?.questionKey;
    if (questionKey) {
      missing.push({ label: questionKey, portalAnswerable: true });
    } else {
      missing.push({ label: 'Ügyvédi pontosítás szükséges.', portalAnswerable: false });
    }
  }
  return missing;
}

/* ------------------------------------------------------------------ */
/*  Main service                                                       */
/* ------------------------------------------------------------------ */

/**
 * Produce a client-safe compliance read model for the given organizational
 * client. Only COMPANY-scope, topic-registry-filtered, non-DOES_NOT_APPLY
 * findings are projected.
 *
 * @param clientId  Derived from workspace membership — never from browser input.
 * @param isProduction  When true, DEMO topics are excluded.
 */
export async function getClientSafeComplianceReadModel(
  clientId: string,
  isProduction: boolean,
  prisma: Prisma = defaultPrisma,
): Promise<ClientSafeComplianceReadModel> {
  const visibleKeys = portalVisibleKeys(isProduction);

  const findings = await prisma.assessmentFinding.findMany({
    where: { clientId, scopeType: 'COMPANY' },
    select: {
      id: true,
      title: true,
      status: true,
      requirementApplicability: {
        select: {
          id: true,
          outcome: true,
          requirementVersion: {
            select: {
              title: true,
              requirement: { select: { key: true } },
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });

  const topics: ClientSafeComplianceTopicDto[] = [];

  for (const finding of findings) {
    const applicability = finding.requirementApplicability;
    const requirementKey = applicability?.requirementVersion?.requirement?.key || null;

    if (requirementKey && !visibleKeys.has(requirementKey)) continue;

    const topic = requirementKey ? lookupSafeTopic(requirementKey, isProduction) : null;
    const topicLabel = topic?.portalLabel || finding.title;

    const applicabilityOutcome = applicability?.outcome ? String(applicability.outcome) : null;
    if (applicabilityOutcome === 'DOES_NOT_APPLY') continue;

    const state = mapClientState(applicabilityOutcome, finding.status ? String(finding.status) : null);

    const missingInformation = applicability?.id
      ? await resolveMissingInformation(applicability.id, clientId, prisma)
      : [];

    const shortExplanation = buildShortExplanation(state, topic || { internalKey: '', portalLabel: topicLabel });
    const nextAction = buildNextAction(state, missingInformation);

    topics.push({
      topicId: applicability?.id || finding.id,
      topicLabel,
      state,
      shortExplanation,
      missingInformation,
      nextAction,
    });
  }

  const result: ClientSafeComplianceReadModel = { topics };
  assertClientSafe(result);
  return result;
}
