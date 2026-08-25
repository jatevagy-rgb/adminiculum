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
 *
 * HARDENING:
 * - topicId uses opaque product topicKey from registry (never DB UUIDs)
 * - manual findings (no requirementKey) are omitted entirely
 * - unregistered requirement keys are omitted
 * - missingInformation.label maps questionKey to safe product label
 * - DEMO requires PORTAL_DEMO_ENABLED=true AND non-production
 * - No overclaiming legal certainty in client copy
 * - Batched dependency/fact queries (no N+1)
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { assertClientSafe, InteractionError } from '../client-interaction/base';
import { lookupSafeTopic, portalVisibleKeys, type SafeTopicEntry } from './safeTopicRegistry';

type Prisma = typeof defaultPrisma;

/* ------------------------------------------------------------------ */
/*  DTO types                                                          */
/* ------------------------------------------------------------------ */

export interface MissingInformationItem {
  /** Safe portal product label (never a raw FactDefinition key or questionKey). */
  label: string;
  /** Whether this dependency can be answered through the portal. */
  portalAnswerable: boolean;
}

export interface ClientSafeComplianceTopicDto {
  /** Opaque product topic identity from the safe registry (never a DB id). */
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
/*  Safe question label mapping                                        */
/* ------------------------------------------------------------------ */

/**
 * Maps internal FactDefinition questionKey values to safe, human-readable
 * portal product labels. Raw questionKeys must never reach the client.
 *
 * Unknown questionKeys fall back to "Ügyvédi pontosítás szükséges."
 */
const SAFE_QUESTION_LABELS: Record<string, string> = {
  company_data_processing_purpose: 'Adatfeldolgozás céljának megadása',
  company_data_categories: 'Kezelt adatkategóriák megadása',
  company_legal_basis: 'Adatkezelés jogalapjának megjelölése',
  company_dpo_appointed: 'Adatvédelmi tisztviselő kijelölése',
  company_retention_period: 'Adatmegőrzési időszak megadása',
  company_third_country_transfer: 'Harmadik országi adattovábbítás',
  company_security_measures: 'Biztonsági intézkedések leírása',
  company_employee_count: 'Munkavállalók számának megadása',
  company_workplace_sites: 'Munkahelyek felsorolása',
  company_safety_officer: 'Munkavédelmi felelős kijelölése',
  company_risk_assessment: 'Kockázatértékelés elvégzése',
  company_aml_program: 'Pénzmosás megelőzési program',
  company_customer_due_diligence: 'Ügyfél-átvilágítás eljárásrend',
};

function safeQuestionLabel(questionKey: string | null | undefined): string {
  if (!questionKey) return 'Ügyvédi pontosítás szükséges.';
  return SAFE_QUESTION_LABELS[questionKey] || 'Ügyvédi pontosítás szükséges.';
}

/* ------------------------------------------------------------------ */
/*  State mapping — deterministic, no AI, no fabrication                */
/* ------------------------------------------------------------------ */

function mapClientState(
  applicabilityOutcome: string | null,
  findingStatus: string | null,
): ClientSafeComplianceTopicDto['state'] {
  if (applicabilityOutcome === 'INSUFFICIENT_FACTS') return 'MORE_INFORMATION_NEEDED';
  if (applicabilityOutcome === 'LEGAL_REVIEW_REQUIRED' || applicabilityOutcome === 'TECHNICAL_REVIEW_REQUIRED' || applicabilityOutcome === 'SOURCE_SUPPORT_INSUFFICIENT') {
    return 'LAWYER_REVIEW_REQUIRED';
  }
  if (findingStatus === 'ACKNOWLEDGED' || findingStatus === 'ACTION_PLANNED') return 'ACTION_IN_PROGRESS';
  if (findingStatus === 'RESOLVED') return 'RESOLVED';
  return 'REVIEW_RECOMMENDED';
}

function buildShortExplanation(
  state: ClientSafeComplianceTopicDto['state'],
  topic: SafeTopicEntry,
): string {
  if (topic.shortExplanation) return topic.shortExplanation;
  switch (state) {
    case 'MORE_INFORMATION_NEEDED':
      return 'További információ segíthet a terület pontosabb áttekintésében.';
    case 'LAWYER_REVIEW_REQUIRED':
      return 'Ügyvédi áttekintés javasolt.';
    case 'ACTION_IN_PROGRESS':
      return 'A terület áttekintése folyamatban van.';
    case 'RESOLVED':
      return 'A jelenlegi állapot szerint nincs további portálos teendő.';
    default:
      return 'Ezt a területet érdemes áttekinteni.';
  }
}

function buildNextAction(
  state: ClientSafeComplianceTopicDto['state'],
  missingInformation: MissingInformationItem[],
): string | null {
  if (state === 'MORE_INFORMATION_NEEDED') {
    if (missingInformation.length > 0) {
      return 'Kérjük, töltse ki a hiányzó információkat a portálon.';
    }
    return 'Kérjük, egészítse ki a hiányzó információkat.';
  }
  if (state === 'LAWYER_REVIEW_REQUIRED') {
    return 'Ügyvédi áttekintés javasolt.';
  }
  if (state === 'RESOLVED') return null;
  if (state === 'ACTION_IN_PROGRESS') return 'A terület állapota a portálon nyomon követhető.';
  return 'Kérjük, tekintse át a jelenlegi állapotot.';
}

/* ------------------------------------------------------------------ */
/*  Batched missing information resolution                             */
/* ------------------------------------------------------------------ */

interface BatchedDependency {
  applicabilityId: string;
  factKey: string;
  questionKey: string | null;
}

interface BatchedConsumedFact {
  applicabilityId: string;
  factKey: string;
}

/**
 * Batch-load all applicability dependencies and consumed facts for the
 * given applicability IDs. Eliminates the N+1 query pattern.
 *
 * Total Prisma calls: exactly 2 (dependencies + consumed facts),
 * regardless of topic count.
 */
async function batchLoadDependencyData(
  applicabilityIds: string[],
  prisma: Prisma,
): Promise<{ dependencies: BatchedDependency[]; consumedFacts: BatchedConsumedFact[] }> {
  if (applicabilityIds.length === 0) return { dependencies: [], consumedFacts: [] };

  const [rawDependencies, rawConsumedFacts] = await Promise.all([
    prisma.applicabilityRuleFactDependency.findMany({
      where: { applicabilityRuleVersion: { applicabilitySnapshots: { some: { id: { in: applicabilityIds } } } } },
      select: {
        factKey: true,
        resolvedFactDefinition: { select: { questionKey: true } },
        applicabilityRuleVersion: {
          select: {
            applicabilitySnapshots: { select: { id: true } },
          },
        },
      },
    }),
    prisma.requirementApplicabilityFact.findMany({
      where: { applicabilityId: { in: applicabilityIds } },
      select: { applicabilityId: true, factKey: true },
    }),
  ]);

  // Flatten dependencies: each dependency may match multiple applicability snapshots.
  const dependencies: BatchedDependency[] = [];
  for (const raw of rawDependencies) {
    const questionKey = raw.resolvedFactDefinition?.questionKey ?? null;
    for (const snapshot of raw.applicabilityRuleVersion.applicabilitySnapshots) {
      dependencies.push({ applicabilityId: snapshot.id, factKey: raw.factKey, questionKey });
    }
  }

  const consumedFacts: BatchedConsumedFact[] = rawConsumedFacts.map((f) => ({
    applicabilityId: f.applicabilityId,
    factKey: f.factKey,
  }));

  return { dependencies, consumedFacts };
}

/**
 * Compute missing information for a single applicability from pre-batched data.
 */
function computeMissingInformation(
  applicabilityId: string,
  allDependencies: BatchedDependency[],
  allConsumedFacts: BatchedConsumedFact[],
): MissingInformationItem[] {
  const deps = allDependencies.filter((d) => d.applicabilityId === applicabilityId);
  if (deps.length === 0) return [];

  const consumedKeys = new Set(
    allConsumedFacts.filter((f) => f.applicabilityId === applicabilityId).map((f) => f.factKey),
  );

  const missing: MissingInformationItem[] = [];
  for (const dep of deps) {
    if (consumedKeys.has(dep.factKey)) continue;
    missing.push({ label: safeQuestionLabel(dep.questionKey), portalAnswerable: dep.questionKey != null });
  }
  return missing;
}

/* ------------------------------------------------------------------ */
/*  Main service                                                       */
/* ------------------------------------------------------------------ */

/**
 * Produce a client-safe compliance read model for the given organizational
 * client. Only requirement-backed, registry-registered, COMPANY-scope,
 * non-DOES_NOT_APPLY findings are projected.
 *
 * Manual findings (no requirementKey) are omitted.
 * Unregistered requirement keys are omitted.
 *
 * @param clientId  Derived from workspace membership — never from browser input.
 * @param isProduction  When true, DEMO topics are excluded.
 * @param demoEnabled  When true AND non-production, DEMO topics are included.
 */
export async function getClientSafeComplianceReadModel(
  clientId: string,
  isProduction: boolean,
  demoEnabled = false,
  prisma: Prisma = defaultPrisma,
): Promise<ClientSafeComplianceReadModel> {
  const visibleKeys = portalVisibleKeys(isProduction, demoEnabled);

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

  // Collect applicability IDs for batch loading.
  const applicabilityIds = findings
    .map((f) => f.requirementApplicability?.id)
    .filter((id): id is string => Boolean(id));

  const { dependencies, consumedFacts } = await batchLoadDependencyData(applicabilityIds, prisma);

  const topics: ClientSafeComplianceTopicDto[] = [];

  for (const finding of findings) {
    const applicability = finding.requirementApplicability;
    const requirementKey = applicability?.requirementVersion?.requirement?.key || null;

    // Guard: manual findings (no requirementKey) are never portal content.
    if (!requirementKey) continue;

    // Guard: unregistered requirement keys are omitted.
    if (!visibleKeys.has(requirementKey)) continue;

    const topic = lookupSafeTopic(requirementKey, isProduction, demoEnabled);
    if (!topic) continue;

    const applicabilityOutcome = applicability?.outcome ? String(applicability.outcome) : null;
    if (applicabilityOutcome === 'DOES_NOT_APPLY') continue;

    const state = mapClientState(applicabilityOutcome, finding.status ? String(finding.status) : null);

    const missingInformation = applicability?.id
      ? computeMissingInformation(applicability.id, dependencies, consumedFacts)
      : [];

    const shortExplanation = buildShortExplanation(state, topic);
    const nextAction = buildNextAction(state, missingInformation);

    topics.push({
      topicId: topic.topicKey,
      topicLabel: topic.portalLabel,
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
