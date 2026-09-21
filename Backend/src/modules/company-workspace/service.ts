/**
 * COMPANY WORKSPACE (Phase 4) — internal workforce projection.
 *
 * A single coherent read projection over the canonical Phase 1-3 company data
 * (ClientOperatingProfile / ClientFact / Assessment / AssessmentFinding /
 * DevelopmentInitiative / CompanyMilestone / ContractRecord / ClientObligation /
 * ClientOrganizationGroup / OrganizationPerson). It is a PROJECTION ONLY: no new
 * persistence, no duplicate models, no compliance engine. The DTO carries the
 * deterministic company attention summary (open important findings, contracts /
 * obligations without a linked OrganizationPerson owner, inactive owners, active
 * initiatives) so the UI can answer "Mire kell most figyelni?" without exposing
 * internal architecture.
 *
 * Workforce-only. Client-scoped reads reuse the exact access posture of the
 * Phase 1-3 modules (never a new ACL): ADMIN/PARTNER may read any client;
 * lawyers/collaborating lawyers only clients they have a Case in.
 *
 * PROVENANCE / FRESHNESS / CONFLICTS (cockpit convergence) are derived ONLY from
 * canonical fields already present on ClientFact / FactDefinition / EvidenceRecord
 * and are never stored:
 *   - provenance category comes from `sourceReference` + `sourceDocumentVersionId`
 *     + linked EvidenceRecord rows; the raw reference value is never projected;
 *   - freshness comes from `FactDefinition.temporalPolicy` (only VALIDITY_INTERVAL
 *     defines an explicit expiry) — no invented staleness window exists;
 *   - a conflict is reported (REVIEW REQUIRED) only when a definition with
 *     `overlapPolicy = DISALLOW` has two or more currently-valid facts for the same
 *     scope/subject and NO canonical answer state selects a current fact. No fact
 *     is ever silently preferred by recency, verification level or source type.
 *
 * NOTE: this module is deliberately distinct from `client-workspace` (the CP1
 * customer-facing organizational workspace). Phase 4 exposes no customer route
 * and no new company publication scope.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { Prisma as PrismaTypes } from '@prisma/client';
import { InteractionError, InternalActor, assertClientReadAccess, assertClientSafe, internalCaseScope } from '../client-interaction/base';
import { getComplianceWorkspace } from '../compliance/complianceWorkspaceService';
import { buildCanonicalFactState } from '../client-workspace/companyProfileAnswerService';
import { COMPANY_PROFILE_QUESTIONS } from '../client-workspace/companyProfileQuestionRegistry';
import { getCanonicalCompanyFact } from '../client-workspace/companyProfileFactCatalog';
import { applyDeterministicDerivations, resolveVisibleQuestions, type CompanyProfileFactState } from '../client-workspace/companyProfileAdaptive';
import { resolveCanonicalTypedFactValue, type CanonicalTypedFactValue } from '../client-workspace/canonicalFactValue';
import type { ProcessMetricCode, ProcessMetricValue } from '../company-growth/metrics/metricTypes';
import { PROCESS_METRIC_REGISTRY } from '../company-growth/metrics/metricRegistry';
import { hrConfidentialReadAllowed } from '../documents/authorization';

type Prisma = typeof defaultPrisma;

const ACTIVE_PERSON_STATUS = new Set(['ACTIVE', 'ON_LEAVE']);
const INACTIVE_PERSON_STATUS = new Set(['INACTIVE', 'ENDED']);
const ALLOWED_SNAPSHOT_METRICS = new Set<ProcessMetricCode>([
  'TOTAL_ACTIVE_MINUTES',
  'TOTAL_WAITING_MINUTES',
  'TOTAL_CYCLE_MINUTES',
  'WAITING_SHARE',
  'APPROVAL_STEP_COUNT',
  'DATA_ENTRY_STEP_COUNT',
  'HANDOFF_STEP_COUNT',
  'RESPONSIBLE_PERSON_CHANGE_COUNT',
  'SYSTEM_COUNT',
  'SYSTEM_SWITCH_COUNT',
  'UNASSIGNED_STEP_COUNT',
  'PROCESS_OWNER_PRESENT',
]);

/** Deterministic grouping of ClientFact types into understandable categories. */
const FACT_GROUP_KEYS: Record<string, string> = {
  EMPLOYEE_COUNT: 'SIZE',
  REVENUE_BAND: 'SIZE',
  MAIN_ACTIVITY: 'ACTIVITIES',
  EXPORT_ACTIVITY: 'ACTIVITIES',
  OPERATING_COUNTRY: 'MARKETS',
  SITE: 'MARKETS',
  CRITICAL_CUSTOMER: 'MARKETS',
  CRITICAL_SUPPLIER: 'MARKETS',
  OWNERSHIP: 'WORKFORCE',
  MANAGEMENT_STRUCTURE: 'WORKFORCE',
  IMPORTANT_IT_SYSTEM: 'DIGITAL',
  SENSITIVE_DATA_USAGE: 'DIGITAL',
  AI_USAGE: 'DIGITAL',
  REGULATED_ACTIVITY: 'REGULATORY',
  CERTIFICATION: 'REGULATORY',
  FINANCING: 'REGULATORY',
};

const FACT_GROUP_LABELS: Record<string, string> = {
  SIZE: 'Méret és forgalom',
  ACTIVITIES: 'Tevékenységek',
  MARKETS: 'Piaci jelenlét',
  WORKFORCE: 'Vezetés és tulajdonlás',
  DIGITAL: 'Digitális működés és adatok',
  REGULATORY: 'Szabályozási jellemzők',
  OTHER: 'Egyéb jellemzők',
};

function iso(v: Date | null | undefined): string | null {
  return v ? v.toISOString() : null;
}

function boundedSnapshotMetrics(value: unknown): ProcessMetricValue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((metric): ProcessMetricValue[] => {
    if (!metric || typeof metric !== 'object') return [];
    const candidate = metric as { code?: unknown; value?: unknown; unit?: unknown; metricVersion?: unknown };
    if (
      typeof candidate.code !== 'string' ||
      !ALLOWED_SNAPSHOT_METRICS.has(candidate.code as ProcessMetricCode) ||
      (typeof candidate.value !== 'number' && typeof candidate.value !== 'boolean' && candidate.value !== null) ||
      typeof candidate.unit !== 'string' ||
      typeof candidate.metricVersion !== 'string'
    ) return [];
    const metricValue = candidate.value;
    return [{
      code: candidate.code as ProcessMetricCode,
      value: metricValue as number | boolean | null,
      unit: candidate.unit as ProcessMetricValue['unit'],
      metricVersion: candidate.metricVersion,
    }];
  });
}

/** Canonical snapshot metrics carry their registry display name and unit. */
function snapshotMetricProjection(value: unknown): Array<ProcessMetricValue & { nameHu: string }> {
  return boundedSnapshotMetrics(value).map((metric) => ({
    ...metric,
    nameHu: PROCESS_METRIC_REGISTRY[metric.code]?.nameHu ?? metric.code,
  }));
}

/**
 * Snapshot provenance is caller-supplied at capture time (`provenanceSource`).
 * It is surfaced only as a bounded machine token so an unexpected value can never
 * carry free text into the projection; anything else is reported as unknown.
 */
export function safeProvenanceSource(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = (value as { source?: unknown }).source;
  if (typeof source !== 'string') return null;
  const trimmed = source.trim();
  return /^[A-Za-z0-9_]{1,64}$/.test(trimmed) ? trimmed : null;
}

/**
 * Canonical fact provenance classification. `ClientFact.sourceReference` is a
 * free-text column that may hold a portal identity handle; the raw value is NEVER
 * projected, only its canonical provenance category.
 */
export function classifyFactSourceKind(
  sourceReference: string | null,
  hasSourceDocument: boolean,
): FactProvenanceSourceKind {
  if (sourceReference && sourceReference.startsWith('CLIENT_PORTAL_IDENTITY:')) return 'CLIENT_PORTAL_ANSWER';
  if (hasSourceDocument) return 'DOCUMENT';
  if (sourceReference && sourceReference.trim()) return 'MANUAL';
  return 'UNKNOWN';
}

/**
 * Freshness is derived ONLY from the canonical fact temporal policy. Only
 * VALIDITY_INTERVAL defines an explicit expiry (`validTo`); every other policy
 * carries no canonical freshness rule and is reported as such — no invented
 * staleness window is ever applied.
 */
export function deriveFactFreshness(
  temporalPolicy: string | null,
  validTo: Date | null,
  now: Date,
): { rule: string | null; ruleDefined: boolean; state: FactFreshnessState } {
  if (temporalPolicy === 'VALIDITY_INTERVAL') {
    const expired = validTo !== null && validTo.getTime() < now.getTime();
    return { rule: temporalPolicy, ruleDefined: true, state: expired ? 'EXPIRED' : 'CURRENT' };
  }
  return { rule: temporalPolicy, ruleDefined: false, state: 'NO_RULE' };
}

function questionStatus(state: CompanyProfileFactState | undefined): 'ANSWERED' | 'UNKNOWN' | 'UNANSWERED' {
  return state?.status ?? 'UNANSWERED';
}

/** Owner display preference: linked OrganizationPerson → legacy label → none. */
function ownerDisplay(personName: string | null | undefined, legacyLabel: string | null | undefined): string | null {
  if (personName) return personName;
  if (legacyLabel) return legacyLabel;
  return null;
}

function factDisplayValue(fact: any): string {
  const type = fact.factDefinition?.valueType ? String(fact.factDefinition.valueType) : null;
  if (!type) return fact.value;
  if (type === 'BOOLEAN') return fact.booleanValue ? 'true' : 'false';
  if (type === 'NUMBER') return fact.numberValue === null ? '' : String(fact.numberValue);
  if (type === 'DATE') return fact.dateValue ? fact.dateValue.toISOString().slice(0, 10) : '';
  if (type === 'DATETIME') return fact.datetimeValue ? fact.datetimeValue.toISOString() : '';
  if (type === 'MONEY') return `${fact.moneyAmount === null ? '' : fact.moneyAmount} ${fact.moneyCurrency || ''}`.trim();
  if (type === 'ENUM' || type === 'JURISDICTION') return fact.enumValue || '';
  return fact.jsonValue == null ? '' : JSON.stringify(fact.jsonValue);
}

/**
 * Deterministic party summary for a contract's recorded parties. Adminiculum
 * contracts span many types (lease, NDA, supply, financing, ...), so there is NO
 * universal "counterparty" role — `SUPPLIER` is only meaningful for supply
 * contracts, not for LESSOR/LESSEE, lender/borrower, etc. The client company
 * itself is not stored as a party on these records, so the listed parties are the
 * relevant other parties. We therefore show a bounded, deterministic summary of
 * the recorded party names rather than guessing a semantic opposite party.
 */
function counterpartySummary(parties: { roleCode: string; displayName: string }[]): string | null {
  if (!parties.length) return null;
  const ordered = [...parties].sort((a, b) => a.displayName.localeCompare(b.displayName) || a.roleCode.localeCompare(b.roleCode));
  const names = ordered.map((party) => party.displayName).filter(Boolean);
  return names.length <= 2 ? names.join(' · ') : `${names.slice(0, 2).join(' · ')} +${names.length - 2}`;
}

export interface WorkspaceGapItem {
  id: string;
  title: string;
}

export interface WorkspaceCase {
  id: string;
  caseNumber: string;
  title: string;
  status: string;
  deadline: string | null;
  responsibleLawyerName: string | null;
}

// Attention codes represent things that genuinely need the workforce's attention.
// "Active initiatives" is normal, expected state (shown in the development plan
// section), not a warning — it is intentionally NOT an attention code.
export interface WorkspaceAttentionItem {
  code: 'OPEN_IMPORTANT_FINDINGS' | 'CONTRACTS_WITHOUT_OWNER' | 'OBLIGATIONS_WITHOUT_OWNER' | 'INACTIVE_OWNER_PERSONS';
  count: number;
}

export type FactProvenanceSourceKind = 'CLIENT_PORTAL_ANSWER' | 'DOCUMENT' | 'MANUAL' | 'UNKNOWN';

/** Canonical freshness states. `NO_RULE` means the definition carries no rule. */
export type FactFreshnessState = 'CURRENT' | 'EXPIRED' | 'NO_RULE';

export interface CompanyDataRoomFactProvenance {
  sourceKind: FactProvenanceSourceKind;
  hasSourceDocument: boolean;
  evidenceCount: number;
  evidenceSourceTypes: string[];
  determinationMethod: string | null;
  recordedAt: string | null;
  verifiedAt: string | null;
}

export interface CompanyDataRoomFactFreshness {
  rule: string | null;
  ruleDefined: boolean;
  state: FactFreshnessState;
}

export interface CompanyDataRoomFactConflicts {
  overlapPolicy: string | null;
  sameSubjectCurrentFactCount: number;
  /** True when a canonical answer state names this fact as the current truth. */
  hasCanonicalSelection: boolean;
  reviewRequired: boolean;
}

export interface CompanyDataRoomFact {
  id: string | null;
  type: string;
  value: CanonicalTypedFactValue | null;
  answerStatus: 'ANSWERED' | 'UNKNOWN' | 'UNANSWERED';
  factDefinition: { key: string; domainCode: string; valueType: string; labelHu?: string | null } | null;
  scopeType: string | null;
  factSubjectId: string | null;
  verificationStatus: string | null;
  observedAt: string | null;
  effectiveAt: string | null;
  validFrom: string | null;
  validTo: string | null;
  provenance: CompanyDataRoomFactProvenance;
  freshness: CompanyDataRoomFactFreshness;
  conflicts: CompanyDataRoomFactConflicts;
}

/** Neutral provenance/freshness/conflict projection for answer states without a fact. */
const NO_FACT_PROVENANCE: CompanyDataRoomFactProvenance = {
  sourceKind: 'UNKNOWN',
  hasSourceDocument: false,
  evidenceCount: 0,
  evidenceSourceTypes: [],
  determinationMethod: null,
  recordedAt: null,
  verifiedAt: null,
};

const NO_FACT_FRESHNESS: CompanyDataRoomFactFreshness = { rule: null, ruleDefined: false, state: 'NO_RULE' };

const NO_FACT_CONFLICTS: CompanyDataRoomFactConflicts = {
  overlapPolicy: null,
  sameSubjectCurrentFactCount: 0,
  hasCanonicalSelection: false,
  reviewRequired: false,
};

export interface CompanyDataRoomDto {
  clientIdentity: {
    id: string;
    name: string;
    company: string | null;
    companyRegistrationNumber: string | null;
    taxNumber: string | null;
    vatNumber: string | null;
    address: string | null;
  };
  operatingProfile: {
    status: string | null;
    complianceEnrollmentStatus: string;
    summary: string | null;
    lastReviewedAt: string | null;
    nextReviewAt: string | null;
    review: {
      rule: 'nextReviewAt';
      ruleDefined: boolean;
      state: 'CURRENT' | 'REVIEW_REQUIRED' | 'UNKNOWN';
    };
  } | null;
  facts: CompanyDataRoomFact[];
  dataQuality: {
    answerStateSummary: {
      answered: number;
      unknown: number;
    };
    coverageAvailable: false;
    relevantDataCoverage: {
      available: boolean;
      relevantDefinitionCount: number;
      answeredCount: number;
      unknownCount: number;
      unansweredCount: number;
      undeterminedCount: number;
      derivedAnsweredCount: number;
    };
    stale: null;
    staleAvailable: false;
    conflictingAvailable: true;
    conflictingFactCount: number;
    provenance: {
      basis: 'ClientFact.sourceReference + ClientFact.sourceDocumentVersionId + EvidenceRecord';
      documentSourceCount: number;
      portalAnswerCount: number;
      manualSourceCount: number;
      unknownSourceCount: number;
      evidenceLinkedCount: number;
    };
    freshness: {
      basis: 'FactDefinition.temporalPolicy';
      ruleDefinedCount: number;
      noRuleCount: number;
    };
  };
  organization: {
    groupCount: number;
    activeGroupCount: number;
    personCount: number;
    activePersonCount: number;
    groups: Array<{ id: string; name: string; description: string | null; status: string; parentGroupId: string | null }>;
    people: Array<{ id: string; name: string; jobTitle: string | null; employmentStatus: string; organizationGroupId: string | null; organizationGroupName: string | null }>;
  };
  processes: Array<{
    id: string;
    name: string;
    category: string;
    description: string | null;
    criticality: string;
    frequency: string;
    status: string;
    owner: { id: string; name: string } | null;
    organizationGroup: { id: string; name: string } | null;
    stepCount: number;
    approvalStepCount: number;
    unassignedStepCount: number;
    /** Derived sums of the STEP-LEVEL ESTIMATES. Never a measured value. */
    estimatedTotals: {
      activeMinutes: number | null;
      waitingMinutes: number | null;
      stepsWithActiveEstimate: number;
      stepsWithWaitingEstimate: number;
    };
    steps: Array<{
      id: string;
      position: number;
      name: string;
      stepType: string;
      responsiblePerson: { id: string; name: string } | null;
      system: { id: string; name: string; category: string } | null;
      estimatedActiveMinutes: number | null;
      estimatedWaitingMinutes: number | null;
      isApproval: boolean;
    }>;
    latestMeasuredSnapshot: {
      id: string;
      observedAt: string;
      metricVersion: string;
      snapshotDigest: string;
      provenanceSource: string | null;
      metrics: Array<ProcessMetricValue & { nameHu: string }>;
    } | null;
  }>;
  systems: Array<{
    id: string;
    name: string;
    category: string;
    vendor: string | null;
    purpose: string | null;
    status: string;
    owner: { id: string; name: string } | null;
    relatedProcessStepCount: number;
  }>;
  documents: {
    documentCount: number;
    currentVersionCount: number;
    evidenceLinkedRecordCount: number;
  };
  contracts: {
    totalCount: number;
    byStatus: Array<{ status: string; count: number }>;
  };
  complianceSummary: {
    currentOnly: true;
    evaluatedAt: string | null;
    evaluatedCount: number;
    applies: number;
    doesNotApply: number;
    insufficientFacts: number;
    legalReviewRequired: number;
    technicalReviewRequired: number;
    sourceSupportInsufficient: number;
    openFindings: number;
    openProposals: number;
  };
  evidenceSummary: {
    totalCount: number;
    bySourceType: Array<{ sourceType: string; count: number }>;
    byStatus: Array<{ status: string; count: number }>;
  };
  developmentSummary: {
    initiativeCount: number;
    activeInitiativeCount: number;
    milestoneCount: number;
    plannedMilestoneCount: number;
    initiatives: Array<{
      id: string;
      title: string;
      reason: string | null;
      currentState: string | null;
      targetState: string | null;
      priority: string;
      status: string;
      targetAt: string | null;
      startedAt: string | null;
      completedAt: string | null;
      clientOwnerPerson: { id: string; name: string } | null;
    }>;
    milestones: Array<{
      id: string;
      type: string;
      title: string;
      description: string | null;
      milestoneDate: string | null;
      targetDate: string | null;
      status: string;
      developmentInitiativeId: string | null;
    }>;
    opportunityCountsByStatus: Array<{ status: string; count: number }>;
  };
  measurementSummary: {
    nonSyntheticOutcomeCount: number;
    byBasis: Array<{ basis: string; count: number }>;
    assumedCount: number;
    outcomes: Array<{
      id: string;
      basis: string;
      businessProcess: { id: string; name: string } | null;
      developmentInitiative: { id: string; title: string } | null;
      opportunity: { id: string; title: string } | null;
      createdAt: string;
    }>;
  };
}

function groupedCount<T extends string>(rows: Array<{ [key: string]: T | number }>, key: string): Array<{ [key: string]: string | number }> {
  return rows.map((row) => ({ [key]: String(row[key]), count: Number(row.count) }));
}

/**
 * Internal Company OS / Data Room read model.
 *
 * This is an additive projection over existing client-scoped canonical data.
 * It deliberately returns summaries for documents and contracts rather than
 * duplicating their full product surfaces or exposing document contents.
 */
export async function getCompanyDataRoom(
  actor: InternalActor,
  clientId: string,
  prisma: Prisma = defaultPrisma,
): Promise<CompanyDataRoomDto> {
  const authorizedClient = await assertClientReadAccess(actor, clientId, prisma);
  const now = new Date();
  const readableCaseIds = await internalCaseScope(actor, prisma);
  const documentScope: PrismaTypes.DocumentWhereInput = {
    clientId,
    ...(readableCaseIds === null ? {} : { caseId: { in: readableCaseIds } }),
    ...(readableCaseIds === null || hrConfidentialReadAllowed(actor.role) ? {} : { securityClassification: { not: 'HR_CONFIDENTIAL' as const } }),
  };

  const [
    client,
    profile,
    facts,
    answerStates,
    profileDefinitions,
    profileFacts,
    groups,
    people,
    groupCount,
    activeGroupCount,
    personCount,
    activePersonCount,
    processes,
    systems,
    documentCount,
    currentVersionCount,
    evidenceLinkedDocumentCount,
    contractCount,
    contractsByStatus,
    complianceWorkspace,
    evidenceCount,
    evidenceBySourceType,
    evidenceByStatus,
    initiativeCount,
    activeInitiativeCount,
    milestoneCount,
    plannedMilestoneCount,
    initiatives,
    milestones,
    opportunityCountsByStatus,
    nonSyntheticOutcomeCount,
    outcomesByBasis,
    assumedOutcomeCount,
    outcomes,
  ] = await Promise.all([
    prisma.client.findUnique({
      where: { id: authorizedClient.id },
      select: {
        id: true,
        name: true,
        company: true,
        companyRegistrationNumber: true,
        taxNumber: true,
        vatNumber: true,
        address: true,
      },
    }),
    prisma.clientOperatingProfile.findUnique({
      where: { clientId },
      select: {
        status: true,
        complianceEnrollmentStatus: true,
        summary: true,
        lastReviewedAt: true,
        nextReviewAt: true,
      },
    }),
    prisma.clientFact.findMany({
      where: {
        clientId,
        supersededAt: null,
        OR: [{ validTo: null }, { validTo: { gte: now } }],
        validFrom: { lte: now },
      },
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      take: 200,
      select: {
        id: true,
        type: true,
        value: true,
        numberValue: true,
        stringValue: true,
        booleanValue: true,
        dateValue: true,
        datetimeValue: true,
        moneyAmount: true,
        moneyCurrency: true,
        enumValue: true,
        jsonValue: true,
        factDefinitionId: true,
        factDefinition: { select: { id: true, key: true, domainCode: true, valueType: true, temporalPolicy: true, overlapPolicy: true } },
        scopeType: true,
        factSubjectId: true,
        verificationStatus: true,
        sourceReference: true,
        sourceDocumentVersionId: true,
        verifiedAt: true,
        determinationMethod: true,
        observedAt: true,
        effectiveAt: true,
        validFrom: true,
        validTo: true,
        createdAt: true,
      },
    }),
    prisma.clientFactAnswerState.findMany({
      where: { clientId, scopeType: 'COMPANY', factSubjectId: null },
      select: {
        factDefinitionId: true,
        status: true,
        currentFactId: true,
        factDefinition: { select: { key: true, domainCode: true, valueType: true } },
        currentFact: {
          select: {
            id: true,
            type: true,
            value: true,
            numberValue: true,
            stringValue: true,
            booleanValue: true,
            dateValue: true,
            datetimeValue: true,
            moneyAmount: true,
            moneyCurrency: true,
            enumValue: true,
            jsonValue: true,
          },
        },
      },
    }),
    prisma.factDefinition.findMany({
      where: {
        status: 'ACTIVE',
        key: { in: COMPANY_PROFILE_QUESTIONS.map((question) => question.factDefinitionKey) },
      },
      select: { id: true, key: true, temporalPolicy: true },
    }),
    prisma.clientFact.findMany({
      where: {
        clientId,
        factDefinition: { key: { in: COMPANY_PROFILE_QUESTIONS.map((question) => question.factDefinitionKey) } },
        scopeType: 'COMPANY',
        factSubjectId: null,
        supersededAt: null,
        OR: [{ validTo: null }, { validTo: { gte: now } }],
        validFrom: { lte: now },
      },
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        factDefinitionId: true,
        type: true,
        value: true,
        numberValue: true,
        stringValue: true,
        booleanValue: true,
        dateValue: true,
        datetimeValue: true,
        moneyAmount: true,
        moneyCurrency: true,
        enumValue: true,
        jsonValue: true,
        observedAt: true,
        effectiveAt: true,
      },
    }),
    prisma.clientOrganizationGroup.findMany({
      where: { clientId },
      orderBy: { name: 'asc' },
      take: 200,
      select: { id: true, name: true, descriptionSafe: true, status: true, parentGroupId: true },
    }),
    prisma.organizationPerson.findMany({
      where: { clientId },
      orderBy: { name: 'asc' },
      take: 500,
      select: {
        id: true,
        name: true,
        jobTitle: true,
        employmentStatus: true,
        organizationGroupId: true,
        organizationGroup: { select: { name: true } },
      },
    }),
    prisma.clientOrganizationGroup.count({ where: { clientId } }),
    prisma.clientOrganizationGroup.count({ where: { clientId, status: 'ACTIVE' } }),
    prisma.organizationPerson.count({ where: { clientId } }),
    prisma.organizationPerson.count({ where: { clientId, employmentStatus: { in: ['ACTIVE', 'ON_LEAVE'] } } }),
    prisma.businessProcess.findMany({
      where: { clientId, status: { not: 'ARCHIVED' } },
      orderBy: { name: 'asc' },
      take: 100,
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        criticality: true,
        frequency: true,
        status: true,
        ownerPerson: { select: { id: true, name: true } },
        organizationGroup: { select: { id: true, name: true } },
        steps: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          take: 200,
          select: {
            id: true,
            position: true,
            name: true,
            stepType: true,
            responsiblePerson: { select: { id: true, name: true } },
            system: { select: { id: true, name: true, category: true, status: true } },
            estimatedActiveMinutes: true,
            estimatedWaitingMinutes: true,
            isApproval: true,
          },
        },
        observationSnapshots: {
          orderBy: [{ observedAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
          select: {
            id: true,
            observedAt: true,
            metricVersion: true,
            snapshotDigest: true,
            metrics: true,
            provenance: true,
          },
        },
      },
    }),
    prisma.businessSystem.findMany({
      where: { clientId, status: { not: 'ARCHIVED' } },
      orderBy: { name: 'asc' },
      take: 100,
      select: {
        id: true,
        name: true,
        category: true,
        vendor: true,
        purpose: true,
        status: true,
        ownerPerson: { select: { id: true, name: true } },
        _count: { select: { processSteps: true } },
      },
    }),
    prisma.document.count({ where: documentScope }),
    prisma.documentVersion.count({ where: { document: documentScope, isCurrent: true } }),
    prisma.evidenceRecord.count({ where: { clientId, documentVersionId: { not: null }, documentVersion: { document: documentScope } } }),
    prisma.contractRecord.count({ where: { clientId } }),
    prisma.contractRecord.groupBy({ by: ['status'], where: { clientId }, _count: { _all: true } }),
    getComplianceWorkspace(actor, clientId, prisma),
    prisma.evidenceRecord.count({ where: { clientId } }),
    prisma.evidenceRecord.groupBy({ by: ['sourceType'], where: { clientId }, _count: { _all: true } }),
    prisma.evidenceRecord.groupBy({ by: ['status'], where: { clientId }, _count: { _all: true } }),
    prisma.developmentInitiative.count({ where: { clientId } }),
    prisma.developmentInitiative.count({ where: { clientId, status: 'ACTIVE' } }),
    prisma.companyMilestone.count({ where: { clientId } }),
    prisma.companyMilestone.count({ where: { clientId, status: 'PLANNED' } }),
    prisma.developmentInitiative.findMany({
      where: { clientId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: 100,
      select: {
        id: true,
        title: true,
        reason: true,
        currentState: true,
        targetState: true,
        priority: true,
        status: true,
        targetAt: true,
        startedAt: true,
        completedAt: true,
        clientOwnerPerson: { select: { id: true, name: true } },
      },
    }),
    prisma.companyMilestone.findMany({
      where: { clientId },
      orderBy: [{ targetDate: 'asc' }, { milestoneDate: 'desc' }, { id: 'asc' }],
      take: 200,
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        milestoneDate: true,
        targetDate: true,
        status: true,
        developmentInitiativeId: true,
      },
    }),
    prisma.improvementOpportunity.groupBy({
      by: ['status'],
      where: { clientId },
      _count: { _all: true },
    }),
    prisma.outcomeMeasurement.count({ where: { clientId, synthetic: false } }),
    prisma.outcomeMeasurement.groupBy({ by: ['basis'], where: { clientId, synthetic: false }, _count: { _all: true } }),
    prisma.outcomeMeasurement.count({ where: { clientId, synthetic: false, basis: 'ASSUMED' } }),
    prisma.outcomeMeasurement.findMany({
      where: { clientId, synthetic: false },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 100,
      select: {
        id: true,
        basis: true,
        createdAt: true,
        businessProcess: { select: { id: true, name: true } },
        developmentInitiative: { select: { id: true, title: true } },
        opportunity: { select: { id: true, title: true } },
      },
    }),
  ]);

  if (!client) throw new InteractionError(404, 'CLIENT_NOT_FOUND', 'Client not found.');

  const answerStateByDefinition = new Map(answerStates.map((state) => [state.factDefinitionId, state]));
  const projectFactDefinition = (factDefinition: { key: string; domainCode: string; valueType: string } | null) => {
    if (!factDefinition) return null;
    return {
      key: factDefinition.key,
      domainCode: factDefinition.domainCode,
      valueType: factDefinition.valueType,
      labelHu: getCanonicalCompanyFact(factDefinition.key)?.labelHu ?? null,
    };
  };
  // Every projected fact is currently valid, so a group sharing one
  // (definition, scope, subject) overlaps in time by construction. When the
  // definition forbids overlap and no canonical answer state selects a current
  // fact, the group is surfaced as REVIEW REQUIRED — never silently resolved.
  const currentFactGroupCounts = new Map<string, number>();
  for (const fact of facts) {
    if (!fact.factDefinitionId) continue;
    const key = [fact.factDefinitionId, fact.scopeType ? String(fact.scopeType) : '', fact.factSubjectId ?? ''].join('|');
    currentFactGroupCounts.set(key, (currentFactGroupCounts.get(key) ?? 0) + 1);
  }
  const factEvidence = facts.length
    ? await prisma.evidenceRecord.findMany({
        where: { clientId, clientFactId: { in: facts.map((fact) => fact.id) } },
        select: { clientFactId: true, sourceType: true },
        take: 500,
      })
    : [];
  const evidenceByFact = new Map<string, { count: number; sourceTypes: Set<string> }>();
  for (const evidence of factEvidence) {
    if (!evidence.clientFactId) continue;
    const bucket = evidenceByFact.get(evidence.clientFactId) ?? { count: 0, sourceTypes: new Set<string>() };
    bucket.count += 1;
    bucket.sourceTypes.add(String(evidence.sourceType));
    evidenceByFact.set(evidence.clientFactId, bucket);
  }
  const projectFact = (
    fact: typeof facts[number] | NonNullable<typeof answerStates[number]['currentFact']>,
    factDefinition: { key: string; domainCode: string; valueType: string; temporalPolicy?: unknown; overlapPolicy?: unknown } | null,
    answerStatus: 'ANSWERED' | 'UNKNOWN' | 'UNANSWERED',
    allowLegacyValue: boolean,
  ): CompanyDataRoomFact => {
    const factId = 'id' in fact ? fact.id : null;
    const definitionId = 'factDefinitionId' in fact ? fact.factDefinitionId ?? null : null;
    const scopeType = 'scopeType' in fact && fact.scopeType ? String(fact.scopeType) : null;
    const factSubjectId = 'factSubjectId' in fact ? fact.factSubjectId : null;
    const sourceReference = 'sourceReference' in fact ? fact.sourceReference ?? null : null;
    const hasSourceDocument = 'sourceDocumentVersionId' in fact ? Boolean(fact.sourceDocumentVersionId) : false;
    const overlapPolicy = factDefinition && typeof factDefinition.overlapPolicy === 'string' ? factDefinition.overlapPolicy : null;
    const temporalPolicy = factDefinition && typeof factDefinition.temporalPolicy === 'string' ? factDefinition.temporalPolicy : null;
    const hasCanonicalSelection = answerStatus === 'ANSWERED';
    const groupKey = definitionId ? [definitionId, scopeType ?? '', factSubjectId ?? ''].join('|') : null;
    const sameSubjectCurrentFactCount = groupKey ? currentFactGroupCounts.get(groupKey) ?? 0 : 0;
    const evidence = factId ? evidenceByFact.get(factId) : undefined;
    return {
      id: factId,
      type: fact.type,
      value: resolveCanonicalTypedFactValue(fact) ?? (allowLegacyValue && 'value' in fact ? fact.value : null),
      answerStatus,
      factDefinition: projectFactDefinition(factDefinition),
      scopeType,
      factSubjectId,
      verificationStatus: 'verificationStatus' in fact ? String(fact.verificationStatus) : null,
      observedAt: iso('observedAt' in fact ? fact.observedAt : null),
      effectiveAt: iso('effectiveAt' in fact ? fact.effectiveAt : null),
      validFrom: 'validFrom' in fact ? fact.validFrom.toISOString() : null,
      validTo: iso('validTo' in fact ? fact.validTo : null),
      provenance: {
        sourceKind: classifyFactSourceKind(sourceReference, hasSourceDocument),
        hasSourceDocument,
        evidenceCount: evidence?.count ?? 0,
        evidenceSourceTypes: evidence ? [...evidence.sourceTypes].sort() : [],
        determinationMethod: 'determinationMethod' in fact && fact.determinationMethod ? String(fact.determinationMethod) : null,
        recordedAt: iso('createdAt' in fact ? fact.createdAt : null),
        verifiedAt: iso('verifiedAt' in fact ? fact.verifiedAt : null),
      },
      freshness: deriveFactFreshness(temporalPolicy, 'validTo' in fact ? fact.validTo : null, now),
      conflicts: {
        overlapPolicy,
        sameSubjectCurrentFactCount,
        hasCanonicalSelection,
        reviewRequired: !hasCanonicalSelection && overlapPolicy === 'DISALLOW' && sameSubjectCurrentFactCount >= 2,
      },
    };
  };
  const projectedFacts: CompanyDataRoomFact[] = [
    ...facts
      .filter((fact) => {
        const definitionId = fact.factDefinition?.id;
        const state = definitionId ? answerStateByDefinition.get(definitionId) : undefined;
        if (!state) return true;
        return String(state.status) === 'ANSWERED' && state.currentFactId === fact.id;
      })
      .map((fact) => {
        const state = fact.factDefinition?.id ? answerStateByDefinition.get(fact.factDefinition.id) : undefined;
        return projectFact(
          fact,
          fact.factDefinition
            ? {
                key: fact.factDefinition.key,
                domainCode: fact.factDefinition.domainCode,
                valueType: String(fact.factDefinition.valueType),
                temporalPolicy: String(fact.factDefinition.temporalPolicy),
                overlapPolicy: String(fact.factDefinition.overlapPolicy),
              }
            : null,
          state ? 'ANSWERED' : 'UNANSWERED',
          !state,
        );
      }),
    ...answerStates
      .filter((state) => String(state.status) === 'UNKNOWN')
      .map((state) => ({
        id: null,
        type: 'answer-state',
        value: null,
        answerStatus: 'UNKNOWN' as const,
        factDefinition: projectFactDefinition(state.factDefinition
          ? { key: state.factDefinition.key, domainCode: state.factDefinition.domainCode, valueType: String(state.factDefinition.valueType) }
          : null),
        scopeType: 'COMPANY',
        factSubjectId: null,
        verificationStatus: null,
        observedAt: null,
        effectiveAt: null,
        validFrom: null,
        validTo: null,
        provenance: NO_FACT_PROVENANCE,
        freshness: NO_FACT_FRESHNESS,
        conflicts: NO_FACT_CONFLICTS,
      })),
  ];
  const profileFactState = buildCanonicalFactState({
    definitions: profileDefinitions,
    states: answerStates.map((state) => ({
      factDefinitionId: state.factDefinitionId,
      status: String(state.status),
      currentFact: state.currentFact,
    })),
    facts: profileFacts,
    now,
  });
  const derivedProfileFactState = applyDeterministicDerivations(profileFactState);
  const visibility = resolveVisibleQuestions(profileFactState);
  const relevantFactKeys = new Set(
    COMPANY_PROFILE_QUESTIONS
      .filter((question) => question.baseline || question.discoveryBaseline)
      .map((question) => question.factDefinitionKey),
  );
  for (const question of visibility.visible) {
    for (const factKey of question.factKeys) relevantFactKeys.add(factKey);
  }
  const undeterminedQuestionKeys = new Set(visibility.undetermined.map((question) => question.questionKey));
  const profileDefinitionKeys = new Set(profileDefinitions.map((definition) => definition.key));
  const relevantDataCoverage = {
    available: undeterminedQuestionKeys.size === 0 &&
      [...relevantFactKeys].every((factKey) => profileDefinitionKeys.has(factKey)),
    relevantDefinitionCount: relevantFactKeys.size,
    answeredCount: 0,
    unknownCount: 0,
    unansweredCount: 0,
    undeterminedCount: undeterminedQuestionKeys.size,
    derivedAnsweredCount: 0,
  };
  for (const factKey of relevantFactKeys) {
    const state = derivedProfileFactState[factKey];
    const status = questionStatus(state);
    if (status === 'ANSWERED') {
      relevantDataCoverage.answeredCount += 1;
      if (state?.derived) relevantDataCoverage.derivedAnsweredCount += 1;
    } else if (status === 'UNKNOWN') {
      relevantDataCoverage.unknownCount += 1;
    } else {
      relevantDataCoverage.unansweredCount += 1;
    }
  }
  const dto: CompanyDataRoomDto = {
    clientIdentity: {
      id: client.id,
      name: client.name,
      company: client.company,
      companyRegistrationNumber: client.companyRegistrationNumber,
      taxNumber: client.taxNumber,
      vatNumber: client.vatNumber,
      address: client.address,
    },
    operatingProfile: profile
      ? {
          status: profile.status,
          complianceEnrollmentStatus: String(profile.complianceEnrollmentStatus),
          summary: profile.summary,
          lastReviewedAt: iso(profile.lastReviewedAt),
          nextReviewAt: iso(profile.nextReviewAt),
          review: {
            rule: 'nextReviewAt' as const,
            ruleDefined: profile.nextReviewAt !== null,
            state: profile.nextReviewAt === null
              ? ('UNKNOWN' as const)
              : profile.nextReviewAt.getTime() <= now.getTime()
              ? ('REVIEW_REQUIRED' as const)
              : ('CURRENT' as const),
          },
        }
      : null,
    facts: projectedFacts,
    dataQuality: {
      answerStateSummary: {
        answered: answerStates.filter((state) => String(state.status) === 'ANSWERED').length,
        unknown: answerStates.filter((state) => String(state.status) === 'UNKNOWN').length,
      },
      coverageAvailable: false,
      relevantDataCoverage,
      stale: null,
      staleAvailable: false,
      conflictingAvailable: true,
      conflictingFactCount: projectedFacts.filter((fact) => fact.conflicts.reviewRequired).length,
      provenance: {
        basis: 'ClientFact.sourceReference + ClientFact.sourceDocumentVersionId + EvidenceRecord',
        documentSourceCount: projectedFacts.filter((fact) => fact.provenance.sourceKind === 'DOCUMENT').length,
        portalAnswerCount: projectedFacts.filter((fact) => fact.provenance.sourceKind === 'CLIENT_PORTAL_ANSWER').length,
        manualSourceCount: projectedFacts.filter((fact) => fact.provenance.sourceKind === 'MANUAL').length,
        unknownSourceCount: projectedFacts.filter((fact) => fact.provenance.sourceKind === 'UNKNOWN').length,
        evidenceLinkedCount: projectedFacts.filter((fact) => fact.provenance.evidenceCount > 0).length,
      },
      freshness: {
        basis: 'FactDefinition.temporalPolicy',
        ruleDefinedCount: projectedFacts.filter((fact) => fact.freshness.ruleDefined).length,
        noRuleCount: projectedFacts.filter((fact) => !fact.freshness.ruleDefined).length,
      },
    },
    organization: {
      groupCount,
      activeGroupCount,
      personCount,
      activePersonCount,
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        description: group.descriptionSafe,
        status: String(group.status),
        parentGroupId: group.parentGroupId,
      })),
      people: people.map((person) => ({
        id: person.id,
        name: person.name,
        jobTitle: person.jobTitle,
        employmentStatus: String(person.employmentStatus),
        organizationGroupId: person.organizationGroupId,
        organizationGroupName: person.organizationGroup?.name ?? null,
      })),
    },
    processes: processes.map((process) => {
      const steps = process.steps.map((step) => ({
        id: step.id,
        position: step.position,
        name: step.name,
        stepType: step.stepType,
        responsiblePerson: step.responsiblePerson,
        system: step.system,
        estimatedActiveMinutes: step.estimatedActiveMinutes,
        estimatedWaitingMinutes: step.estimatedWaitingMinutes,
        isApproval: step.isApproval,
      }));
      const stepsWithActiveEstimate = steps.filter((step) => step.estimatedActiveMinutes !== null).length;
      const stepsWithWaitingEstimate = steps.filter((step) => step.estimatedWaitingMinutes !== null).length;
      const latestSnapshot = process.observationSnapshots[0] ?? null;
      return {
        id: process.id,
        name: process.name,
        category: process.category,
        description: process.description,
        criticality: process.criticality,
        frequency: process.frequency,
        status: process.status,
        owner: process.ownerPerson,
        organizationGroup: process.organizationGroup,
        stepCount: steps.length,
        approvalStepCount: steps.filter((step) => step.isApproval).length,
        unassignedStepCount: steps.filter((step) => !step.responsiblePerson).length,
        // Step-level estimates only. Sums stay null when no step carries an
        // estimate so an absent estimate is never rendered as a measured zero.
        estimatedTotals: {
          activeMinutes: stepsWithActiveEstimate
            ? steps.reduce((total, step) => total + (step.estimatedActiveMinutes ?? 0), 0)
            : null,
          waitingMinutes: stepsWithWaitingEstimate
            ? steps.reduce((total, step) => total + (step.estimatedWaitingMinutes ?? 0), 0)
            : null,
          stepsWithActiveEstimate,
          stepsWithWaitingEstimate,
        },
        steps,
        latestMeasuredSnapshot: latestSnapshot
          ? {
              id: latestSnapshot.id,
              observedAt: latestSnapshot.observedAt.toISOString(),
              metricVersion: latestSnapshot.metricVersion,
              snapshotDigest: latestSnapshot.snapshotDigest,
              provenanceSource: safeProvenanceSource(latestSnapshot.provenance),
              metrics: snapshotMetricProjection(latestSnapshot.metrics),
            }
          : null,
      };
    }),
    systems: systems.map((system) => ({
      id: system.id,
      name: system.name,
      category: system.category,
      vendor: system.vendor,
      purpose: system.purpose,
      status: system.status,
      owner: system.ownerPerson,
      relatedProcessStepCount: system._count.processSteps,
    })),
    documents: {
      documentCount,
      currentVersionCount,
      evidenceLinkedRecordCount: evidenceLinkedDocumentCount,
    },
    contracts: {
      totalCount: contractCount,
      byStatus: groupedCount(contractsByStatus.map((row) => ({ status: row.status, count: row._count._all })), 'status') as Array<{ status: string; count: number }>,
    },
    complianceSummary: {
      currentOnly: true,
      evaluatedAt: complianceWorkspace.evaluatedAt,
      ...complianceWorkspace.summary,
    },
    evidenceSummary: {
      totalCount: evidenceCount,
      bySourceType: groupedCount(evidenceBySourceType.map((row) => ({ sourceType: row.sourceType, count: row._count._all })), 'sourceType') as Array<{ sourceType: string; count: number }>,
      byStatus: groupedCount(evidenceByStatus.map((row) => ({ status: row.status, count: row._count._all })), 'status') as Array<{ status: string; count: number }>,
    },
    developmentSummary: {
      initiativeCount,
      activeInitiativeCount,
      milestoneCount,
      plannedMilestoneCount,
      initiatives: initiatives.map((initiative) => ({
        id: initiative.id,
        title: initiative.title,
        reason: initiative.reason,
        currentState: initiative.currentState,
        targetState: initiative.targetState,
        priority: String(initiative.priority),
        status: String(initiative.status),
        targetAt: iso(initiative.targetAt),
        startedAt: iso(initiative.startedAt),
        completedAt: iso(initiative.completedAt),
        clientOwnerPerson: initiative.clientOwnerPerson,
      })),
      milestones: milestones.map((milestone) => ({
        id: milestone.id,
        type: milestone.type,
        title: milestone.title,
        description: milestone.description,
        milestoneDate: iso(milestone.milestoneDate),
        targetDate: iso(milestone.targetDate),
        status: String(milestone.status),
        developmentInitiativeId: milestone.developmentInitiativeId,
      })),
      opportunityCountsByStatus: groupedCount(
        opportunityCountsByStatus.map((row) => ({ status: row.status, count: row._count._all })),
        'status',
      ) as Array<{ status: string; count: number }>,
    },
    measurementSummary: {
      nonSyntheticOutcomeCount,
      byBasis: groupedCount(
        outcomesByBasis
          .filter((row) => row.basis !== 'ASSUMED')
          .map((row) => ({ basis: row.basis, count: row._count._all })),
        'basis',
      ) as Array<{ basis: string; count: number }>,
      assumedCount: assumedOutcomeCount,
      outcomes: outcomes.map((outcome) => ({
        id: outcome.id,
        basis: String(outcome.basis),
        businessProcess: outcome.businessProcess,
        developmentInitiative: outcome.developmentInitiative,
        opportunity: outcome.opportunity,
        createdAt: outcome.createdAt.toISOString(),
      })),
    },
  };

  assertClientSafe(dto);
  return dto;
}

export async function getWorkspaceOverview(actor: InternalActor, clientId: string, prisma: Prisma = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, prisma);

  const [client, profile, facts, assessments, contracts, openObligations, groups, persons, initiatives, milestones, cases] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } }),
    prisma.clientOperatingProfile.findUnique({ where: { clientId } }),
    prisma.clientFact.findMany({ where: { clientId }, orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }], include: { factDefinition: { select: { key: true, valueType: true } } } }),
    prisma.assessment.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      include: { findings: true },
    }),
    prisma.contractRecord.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      include: {
        parties: { select: { id: true, roleCode: true, displayName: true } },
        businessOwnerPerson: { select: { id: true, clientId: true, name: true, employmentStatus: true } },
        lawFirmOwner: { select: { id: true, name: true } },
        obligations: { select: { id: true, status: true } },
      },
    }),
    prisma.clientObligation.findMany({
      where: { clientId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      orderBy: { nextDueDate: 'asc' },
      include: {
        ownerPerson: { select: { id: true, clientId: true, name: true, employmentStatus: true } },
        sourceContract: { select: { id: true, title: true } },
      },
    }),
    prisma.clientOrganizationGroup.findMany({ where: { clientId }, orderBy: { name: 'asc' } }),
    prisma.organizationPerson.findMany({
      where: { clientId },
      orderBy: { name: 'asc' },
      include: {
        organizationGroup: { select: { id: true, name: true } },
        responsibilities: { select: { id: true, type: true, label: true } },
      },
    }),
    prisma.developmentInitiative.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      include: {
        clientOwnerPerson: { select: { id: true, clientId: true, name: true, employmentStatus: true } },
        lawFirmOwner: { select: { id: true, name: true } },
        milestones: { orderBy: { targetDate: 'asc' } },
      },
    }),
    prisma.companyMilestone.findMany({
      where: { clientId },
      orderBy: [{ targetDate: 'asc' }, { milestoneDate: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.case.findMany({
      where: { clientId },
      orderBy: [{ deadline: 'asc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        caseNumber: true,
        title: true,
        status: true,
        deadline: true,
        assignedLawyer: { select: { name: true } },
      },
    }),
  ]);

  if (!client) throw new InteractionError(404, 'CLIENT_NOT_FOUND', 'Client not found.');

  /* ---- Profile + grouped facts ---------------------------------------- */
  // Cégkép keeps history visible but marks exactly one eligible newest row per
  // type as current. Future rows and expired rows can never become live facts.
  const now = new Date();
  const currentFactTypes = new Set<string>();
  const currentFactIds = new Set<string>();
  for (const fact of facts) {
    if (fact.validFrom <= now && (!fact.validTo || fact.validTo >= now) && !currentFactTypes.has(fact.type)) {
      currentFactTypes.add(fact.type);
      currentFactIds.add(fact.id);
    }
  }
  const factGroups: Array<{ key: string; label: string; facts: Array<{ id: string; type: string; value: string; verificationStatus: string; validFrom: string; validTo: string | null; sourceReference: string | null; isCurrent: boolean; supersededAt: string | null; factDefinition: { key: string; labelHu: string | null } | null; sourceKind: FactProvenanceSourceKind }> }> = [];
  const grouped: Record<string, Array<any>> = {};
  for (const fact of facts) {
    const key = FACT_GROUP_KEYS[fact.type] || 'OTHER';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({
      id: fact.id,
      type: fact.type,
      value: factDisplayValue(fact),
      legacyValue: fact.value,
      factDefinitionId: fact.factDefinitionId,
      scopeType: fact.scopeType,
      factSubjectId: fact.factSubjectId,
      verificationStatus: String(fact.verificationStatus),
      validFrom: fact.validFrom.toISOString(),
      validTo: fact.validTo ? fact.validTo.toISOString() : null,
      sourceReference: fact.sourceReference,
      isCurrent: currentFactIds.has(fact.id),
      // Additive read-only presentation metadata: history must stay visible, but
      // a superseded row must never be presentable as a current truth. The raw
      // sourceReference handle is never projected — only its provenance category.
      supersededAt: fact.supersededAt ? fact.supersededAt.toISOString() : null,
      factDefinition: fact.factDefinition
        ? { key: fact.factDefinition.key, labelHu: getCanonicalCompanyFact(fact.factDefinition.key)?.labelHu ?? null }
        : null,
      sourceKind: classifyFactSourceKind(fact.sourceReference, Boolean(fact.sourceDocumentVersionId)),
    });
  }
  for (const key of Object.keys(FACT_GROUP_LABELS)) {
    if (grouped[key]?.length) factGroups.push({ key, label: FACT_GROUP_LABELS[key], facts: grouped[key] });
  }

  /* ---- Assessments + findings ------------------------------------------ */
  const activeAssessments = assessments.filter((a) => a.status !== 'ARCHIVED');
  const allFindings = activeAssessments.flatMap((a) => a.findings);
  const importantFindings = allFindings.filter((f) => (f.severity === 'HIGH' || f.severity === 'CRITICAL') && f.status !== 'RESOLVED');

  const assessmentsDto = assessments.map((a) => {
    const openImportant = a.status === 'ARCHIVED' ? [] : a.findings.filter((f) => (f.severity === 'HIGH' || f.severity === 'CRITICAL') && f.status !== 'RESOLVED');
    return {
      id: a.id,
      title: a.title,
      type: a.type,
      status: String(a.status),
      reviewAt: iso(a.reviewAt),
      completedAt: iso(a.completedAt),
      findingCount: a.findings.length,
      openFindingCount: a.findings.filter((f) => f.status !== 'RESOLVED').length,
      importantFindings: openImportant.slice(0, 5).map((f) => ({ id: f.id, title: f.title, severity: String(f.severity), status: String(f.status) })),
    };
  });

  /* ---- Contracts + obligations ----------------------------------------- */
  const activeContracts = contracts.filter((c) => c.status === 'ACTIVE');
  const contractsDto = contracts.map((c) => ({
    id: c.id,
    title: c.title,
    contractType: c.contractType,
    status: String(c.status),
    counterpartySummary: counterpartySummary(c.parties),
    effectiveDate: iso(c.effectiveDate),
    expiryDate: iso(c.expiryDate),
    nextCriticalDate: iso(c.nextCriticalDate),
    businessOwnerPersonId: c.businessOwnerPerson?.clientId === clientId ? c.businessOwnerPersonId : null,
    businessOwnerDisplay: c.businessOwnerPerson?.clientId === clientId ? ownerDisplay(c.businessOwnerPerson?.name, c.businessOwnerLabel) : ownerDisplay(null, c.businessOwnerLabel),
    businessOwnerPersonActive: c.businessOwnerPerson?.clientId === clientId ? ACTIVE_PERSON_STATUS.has(String(c.businessOwnerPerson.employmentStatus)) : null,
    lawFirmOwnerName: c.lawFirmOwner?.name ?? null,
    openObligationCount: c.obligations.filter((o) => o.status === 'OPEN' || o.status === 'IN_PROGRESS').length,
  }));

  const obligationsDto = openObligations.map((o) => ({
    id: o.id,
    title: o.title,
    sourceContractId: o.sourceContractId,
    sourceContractTitle: o.sourceContract?.title ?? null,
    ownerPersonId: o.ownerPerson?.clientId === clientId ? o.ownerPersonId : null,
    ownerDisplay: o.ownerPerson?.clientId === clientId ? ownerDisplay(o.ownerPerson?.name, o.ownerLabel) : ownerDisplay(null, o.ownerLabel),
    ownerPersonActive: o.ownerPerson?.clientId === clientId ? ACTIVE_PERSON_STATUS.has(String(o.ownerPerson.employmentStatus)) : null,
    nextDueDate: iso(o.nextDueDate),
    status: String(o.status),
    sourceType: o.sourceType,
  }));

  /* ---- Organization + gaps ---------------------------------------------- */
  const activePersons = persons.filter((p) => ACTIVE_PERSON_STATUS.has(String(p.employmentStatus)));
  const keyPersons = activePersons
    .filter((p) => p.jobTitle || p.responsibilities.length)
    .slice(0, 10)
    .map((p) => ({
      id: p.id,
      name: p.name,
      jobTitle: p.jobTitle,
      groupName: p.organizationGroup?.name ?? null,
      employmentStatus: String(p.employmentStatus),
      responsibilityLabels: p.responsibilities.slice(0, 3).map((r) => r.label),
    }));

  const activeInitiatives = initiatives.filter((i) => ['ACTIVE', 'PLANNED', 'ON_HOLD'].includes(String(i.status)));

  // A responsibility gap means NO owner at all — neither a linked OrganizationPerson
  // nor a legacy owner label. A contract/obligation carrying a legacy label DOES
  // have a (transitional) owner and is not counted as a gap; the "inactive owner"
  // and person-link migration concerns are handled separately.
  const contractsWithoutOwner: WorkspaceGapItem[] = activeContracts
    .filter((c) => !c.businessOwnerPersonId && !c.businessOwnerLabel)
    .map((c) => ({ id: c.id, title: c.title }));
  const obligationsWithoutOwner: WorkspaceGapItem[] = openObligations
    .filter((o) => !o.ownerPersonId && !o.ownerLabel)
    .map((o) => ({ id: o.id, title: o.title }));

  // An inactive/ENDED person is only an ownership problem when they are the
  // CURRENT owner of a still-relevant object: an ACTIVE contract, an OPEN/
  // IN_PROGRESS obligation, or an ACTIVE initiative. A former employee who owns
  // nothing current is organization history, not an attention item.
  const currentOwnerPersonIds = new Set<string>();
  for (const c of activeContracts) if (c.businessOwnerPerson?.clientId === clientId && c.businessOwnerPersonId) currentOwnerPersonIds.add(c.businessOwnerPersonId);
  for (const o of openObligations) if (o.ownerPerson?.clientId === clientId && o.ownerPersonId) currentOwnerPersonIds.add(o.ownerPersonId);
  for (const i of activeInitiatives) if (i.clientOwnerPerson?.clientId === clientId && i.clientOwnerPersonId) currentOwnerPersonIds.add(i.clientOwnerPersonId);
  const inactiveOwnerPersons: WorkspaceGapItem[] = persons
    .filter((p) => INACTIVE_PERSON_STATUS.has(String(p.employmentStatus)) && currentOwnerPersonIds.has(p.id))
    .map((p) => ({ id: p.id, title: p.name }));

  const gaps = {
    contractsWithoutOwnerCount: contractsWithoutOwner.length,
    obligationsWithoutOwnerCount: obligationsWithoutOwner.length,
    inactiveOwnerCount: inactiveOwnerPersons.length,
    contractsWithoutOwner,
    obligationsWithoutOwner,
    inactiveOwnerPersons,
  };

  /* ---- Development plan -------------------------------------------------- */
  const initiativesDto = initiatives.map((i) => {
    const upcoming = i.milestones.find((m) => m.status === 'PLANNED' && (m.targetDate || m.milestoneDate));
    const nextMilestone = upcoming ?? i.milestones[0] ?? null;
    return {
      id: i.id,
      title: i.title,
      priority: String(i.priority),
      status: String(i.status),
      clientOwnerPersonId: i.clientOwnerPerson?.clientId === clientId ? i.clientOwnerPersonId : null,
      clientOwnerDisplay: i.clientOwnerPerson?.clientId === clientId ? ownerDisplay(i.clientOwnerPerson?.name, null) : null,
      clientOwnerPersonActive: i.clientOwnerPerson?.clientId === clientId ? ACTIVE_PERSON_STATUS.has(String(i.clientOwnerPerson.employmentStatus)) : null,
      lawFirmOwnerName: i.lawFirmOwner?.name ?? null,
      targetAt: iso(i.targetAt),
      nextMilestone: nextMilestone
        ? { id: nextMilestone.id, title: nextMilestone.title, status: String(nextMilestone.status), targetDate: iso(nextMilestone.targetDate), milestoneDate: iso(nextMilestone.milestoneDate) }
        : null,
    };
  });

  const milestonesDto = milestones.map((m) => ({
    id: m.id,
    title: m.title,
    type: m.type,
    status: String(m.status),
    targetDate: iso(m.targetDate),
    milestoneDate: iso(m.milestoneDate),
    developmentInitiativeId: m.developmentInitiativeId,
  }));

  /* ---- Attention (deterministic projection, never stored) ---------------- */
  const attention: WorkspaceAttentionItem[] = [];
  if (importantFindings.length) attention.push({ code: 'OPEN_IMPORTANT_FINDINGS', count: importantFindings.length });
  if (contractsWithoutOwner.length) attention.push({ code: 'CONTRACTS_WITHOUT_OWNER', count: contractsWithoutOwner.length });
  if (obligationsWithoutOwner.length) attention.push({ code: 'OBLIGATIONS_WITHOUT_OWNER', count: obligationsWithoutOwner.length });
  if (inactiveOwnerPersons.length) attention.push({ code: 'INACTIVE_OWNER_PERSONS', count: inactiveOwnerPersons.length });

  const dto = {
    client: { id: client.id, name: client.name },
    profile: profile
      ? {
          summary: profile.summary,
          status: profile.status,
          lastReviewedAt: iso(profile.lastReviewedAt),
          nextReviewAt: iso(profile.nextReviewAt),
        }
      : null,
    factGroups,
    assessments: assessmentsDto,
    contracts: contractsDto,
    obligations: obligationsDto,
    organization: {
      groupCount: groups.length,
      personCount: persons.length,
      activePersonCount: activePersons.length,
      keyPersons,
    },
    gaps,
    initiatives: initiativesDto,
    milestones: milestonesDto,
    cases: cases.map((caseRecord): WorkspaceCase => ({
      id: caseRecord.id,
      caseNumber: caseRecord.caseNumber,
      title: caseRecord.title,
      status: String(caseRecord.status),
      deadline: iso(caseRecord.deadline),
      responsibleLawyerName: caseRecord.assignedLawyer?.name ?? null,
    })),
    attention,
  };
  assertClientSafe(dto);
  return dto;
}
