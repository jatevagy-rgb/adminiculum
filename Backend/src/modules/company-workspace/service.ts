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
 * NOTE: this module is deliberately distinct from `client-workspace` (the CP1
 * customer-facing organizational workspace). Phase 4 exposes no customer route
 * and no new company publication scope.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { InteractionError, InternalActor, assertClientReadAccess, assertClientSafe } from '../client-interaction/base';
import { COMPANY_PROFILE_QUESTIONS, getCompanyProfileQuestionForDefinition } from '../client-workspace/companyProfileQuestionRegistry';
import { applyDeterministicDerivations, resolveVisibleQuestions, type CompanyProfileFactState, type CompanyProfileFactValue } from '../client-workspace/companyProfileAdaptive';
import { getComplianceWorkspace } from '../compliance/complianceWorkspaceService';

type Prisma = typeof defaultPrisma;

const ACTIVE_PERSON_STATUS = new Set(['ACTIVE', 'ON_LEAVE']);
const INACTIVE_PERSON_STATUS = new Set(['INACTIVE', 'ENDED']);

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

export async function getWorkspaceOverview(actor: InternalActor, clientId: string, prisma: Prisma = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, prisma);

  const [client, profile, facts, assessments, contracts, openObligations, groups, persons, initiatives, milestones, cases] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } }),
    prisma.clientOperatingProfile.findUnique({ where: { clientId } }),
    prisma.clientFact.findMany({ where: { clientId }, orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }], include: { factDefinition: { select: { valueType: true } } } }),
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
  const factGroups: Array<{ key: string; label: string; facts: Array<{ id: string; type: string; value: string; verificationStatus: string; validFrom: string; validTo: string | null; sourceReference: string | null; isCurrent: boolean }> }> = [];
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

/* -------------------------------------------------------------------------- */
/* GWU-2B.1 — workforce Company OS / Company Data Room read model            */
/* -------------------------------------------------------------------------- */

export type CompanyDataRoomFactStatus = 'ANSWERED' | 'UNKNOWN' | 'UNANSWERED';

export interface CompanyDataRoomDto {
  client: { id: string; name: string };
  operatingProfile: {
    status: string | null;
    complianceEnrollmentStatus: string;
    summary: string | null;
    lastReviewedAt: string | null;
    nextReviewAt: string | null;
  } | null;
  facts: Array<{
    id: string | null;
    key: string;
    questionKey: string | null;
    valueType: string;
    status: CompanyDataRoomFactStatus;
    value: CompanyProfileFactValue | null;
    scopeType: string;
    verificationStatus: string | null;
    determinationMethod: string | null;
    observedAt: string | null;
    effectiveAt: string | null;
    validFrom: string | null;
    validTo: string | null;
    supersededAt: string | null;
  }>;
  coverage: {
    relevantDefinitionCount: number;
    answeredCount: number;
    unknownCount: number;
    unansweredCount: number;
    knownCount: number;
  };
  organization: {
    groups: Array<{ id: string; name: string; description: string | null; parentGroupId: string | null; status: string }>;
    people: Array<{ id: string; name: string; jobTitle: string | null; employmentStatus: string; groupId: string | null; groupName: string | null }>;
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
    steps: Array<{
      id: string;
      position: number;
      name: string;
      stepType: string;
      isApproval: boolean;
      responsiblePerson: { id: string; name: string } | null;
      system: { id: string; name: string } | null;
      estimatedActiveMinutes: number | null;
      estimatedWaitingMinutes: number | null;
    }>;
    latestMeasuredSnapshot: { id: string; metricVersion: string; observedAt: string; metrics: Array<{ code: string; value: number | boolean | null; unit: string; metricVersion: string }> } | null;
  }>;
  systems: Array<{ id: string; name: string; category: string; vendor: string | null; purpose: string | null; status: string; owner: { id: string; name: string } | null }>;
  documentsSummary: {
    total: number;
    byCategory: Record<string, number>;
    byWorkStatus: Record<string, number>;
    recent: Array<{ id: string; name: string; title: string | null; category: string; workStatus: string; updatedAt: string }>;
  };
  contractsSummary: {
    total: number;
    byStatus: Record<string, number>;
    items: Array<{ id: string; title: string; contractType: string; status: string; effectiveDate: string | null; expiryDate: string | null; nextCriticalDate: string | null }>;
  };
  complianceSummary: {
    enrollment: string | null;
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
  evidenceSummary: { total: number; byStatus: Record<string, number>; bySourceType: Record<string, number> };
  developmentSummary: {
    initiatives: Array<{ id: string; title: string; status: string; priority: string; targetState: string | null; targetAt: string | null; milestoneCount: number }>;
    milestones: Array<{ id: string; title: string; type: string; status: string; targetDate: string | null; milestoneDate: string | null }>;
    opportunitiesByStatus: Record<string, number>;
  };
  outcomeSummary: { total: number; measured: number; calculated: number; estimated: number; assumed: number };
  dataQuality: { stale: 'CONTRACT_GAP'; conflicting: 'CONTRACT_GAP'; notes: string[] };
}

type ProfileFactRow = {
  id: string;
  factDefinitionId: string;
  validFrom: Date;
  validTo: Date | null;
  supersededAt: Date | null;
  observedAt: Date | null;
  effectiveAt: Date | null;
  verificationStatus: string;
  determinationMethod: string | null;
  numberValue: any;
  stringValue: string | null;
  booleanValue: boolean | null;
  dateValue: Date | null;
  datetimeValue: Date | null;
  enumValue: string | null;
  jsonValue: unknown;
};

function profileFactValue(fact: ProfileFactRow | null): CompanyProfileFactValue | null {
  if (!fact) return null;
  if (fact.numberValue !== null && fact.numberValue !== undefined) return Number(fact.numberValue);
  if (fact.stringValue !== null) return fact.stringValue;
  if (fact.booleanValue !== null) return fact.booleanValue;
  if (fact.dateValue !== null) return fact.dateValue.toISOString().slice(0, 10);
  if (fact.datetimeValue !== null) return fact.datetimeValue.toISOString();
  if (fact.enumValue !== null) return fact.enumValue;
  if (Array.isArray(fact.jsonValue) && fact.jsonValue.every((item) => typeof item === 'string')) return fact.jsonValue as string[];
  return null;
}

function profileFactStateValue(fact: ProfileFactRow | null, status: string): CompanyProfileFactState {
  if (status === 'UNKNOWN') return { status: 'UNKNOWN' };
  const value = profileFactValue(fact);
  return value === null ? { status: 'UNANSWERED' } : { status: 'ANSWERED', value };
}

function profileFactIsUsable(definition: { temporalPolicy: string }, fact: ProfileFactRow, now: Date): boolean {
  if (definition.temporalPolicy === 'VALIDITY_INTERVAL') return true;
  if (definition.temporalPolicy === 'OBSERVATION') return fact.observedAt !== null && fact.observedAt <= now;
  if (definition.temporalPolicy === 'EFFECTIVE_INSTANT') return fact.effectiveAt !== null && fact.effectiveAt <= now;
  return false;
}

const DATA_ROOM_METRIC_CODES = new Set([
  'TOTAL_ACTIVE_MINUTES', 'TOTAL_WAITING_MINUTES', 'TOTAL_CYCLE_MINUTES', 'WAITING_SHARE',
  'APPROVAL_STEP_COUNT', 'DATA_ENTRY_STEP_COUNT', 'HANDOFF_STEP_COUNT', 'RESPONSIBLE_PERSON_CHANGE_COUNT',
  'SYSTEM_COUNT', 'SYSTEM_SWITCH_COUNT', 'UNASSIGNED_STEP_COUNT', 'PROCESS_OWNER_PRESENT',
]);

function projectDataRoomMetrics(value: unknown): Array<{ code: string; value: number | boolean | null; unit: string; metricVersion: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (typeof row.code !== 'string' || !DATA_ROOM_METRIC_CODES.has(row.code) || typeof row.unit !== 'string' || typeof row.metricVersion !== 'string') return [];
    if (row.value !== null && typeof row.value !== 'number' && typeof row.value !== 'boolean') return [];
    return [{ code: row.code, value: row.value as number | boolean | null, unit: row.unit, metricVersion: row.metricVersion }];
  });
}

function increment(map: Record<string, number>, key: string): void {
  map[key] = (map[key] || 0) + 1;
}

/**
 * Bounded workforce-only Company OS projection. Every section is composed from
 * existing client-scoped models; this function never creates or updates rows.
 */
export async function getCompanyDataRoom(actor: InternalActor, clientId: string, prisma: Prisma = defaultPrisma): Promise<CompanyDataRoomDto> {
  const clientAccess = await assertClientReadAccess(actor, clientId, prisma);
  const now = new Date();
  const profileQuestionKeys = COMPANY_PROFILE_QUESTIONS.map((question) => question.factDefinitionKey);

  const [client, profile, definitions, groups, people, processes, systems, documents, contracts, evidence, initiatives, milestones, opportunities, outcomes] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } }),
    prisma.clientOperatingProfile.findUnique({ where: { clientId }, select: { status: true, complianceEnrollmentStatus: true, summary: true, lastReviewedAt: true, nextReviewAt: true } }),
    prisma.factDefinition.findMany({ where: { status: 'ACTIVE', key: { in: profileQuestionKeys } }, select: { id: true, key: true, questionKey: true, valueType: true, allowedScopeTypes: true, temporalPolicy: true } }),
    prisma.clientOrganizationGroup.findMany({ where: { clientId }, orderBy: { name: 'asc' }, select: { id: true, name: true, descriptionSafe: true, parentGroupId: true, status: true } }),
    prisma.organizationPerson.findMany({ where: { clientId }, orderBy: { name: 'asc' }, select: { id: true, name: true, jobTitle: true, employmentStatus: true, organizationGroupId: true, organizationGroup: { select: { id: true, name: true } } } }),
    prisma.businessProcess.findMany({ where: { clientId }, orderBy: { name: 'asc' }, include: { ownerPerson: { select: { id: true, name: true } }, organizationGroup: { select: { id: true, name: true } }, steps: { orderBy: { position: 'asc' }, include: { responsiblePerson: { select: { id: true, name: true } }, system: { select: { id: true, name: true } } } } } }),
    prisma.businessSystem.findMany({ where: { clientId }, orderBy: { name: 'asc' }, include: { ownerPerson: { select: { id: true, name: true } } } }),
    prisma.document.findMany({ where: { clientId }, orderBy: { updatedAt: 'desc' }, select: { id: true, name: true, title: true, category: true, workStatus: true, updatedAt: true } }),
    prisma.contractRecord.findMany({ where: { clientId }, orderBy: { updatedAt: 'desc' }, select: { id: true, title: true, contractType: true, status: true, effectiveDate: true, expiryDate: true, nextCriticalDate: true } }),
    prisma.evidenceRecord.findMany({ where: { clientId }, select: { status: true, sourceType: true } }),
    prisma.developmentInitiative.findMany({ where: { clientId }, orderBy: { updatedAt: 'desc' }, select: { id: true, title: true, status: true, priority: true, targetState: true, targetAt: true, milestones: { select: { id: true } } } }),
    prisma.companyMilestone.findMany({ where: { clientId }, orderBy: [{ targetDate: 'asc' }, { createdAt: 'desc' }], select: { id: true, title: true, type: true, status: true, targetDate: true, milestoneDate: true } }),
    prisma.improvementOpportunity.findMany({ where: { clientId }, select: { status: true } }),
    prisma.outcomeMeasurement.findMany({ where: { clientId }, select: { basis: true } }),
  ]);
  if (!client) throw new InteractionError(404, 'CLIENT_NOT_FOUND', 'Client not found.');
  if (client.id !== clientAccess.id) throw new InteractionError(404, 'CLIENT_NOT_FOUND', 'Client not found.');

  const definitionIds = definitions.map((definition) => definition.id);
  const [states, fallbackFacts, snapshots] = await Promise.all([
    prisma.clientFactAnswerState.findMany({ where: { clientId, scopeType: 'COMPANY', factSubjectId: null, factDefinitionId: { in: definitionIds } }, include: { currentFact: true } }),
    prisma.clientFact.findMany({ where: { clientId, factDefinitionId: { in: definitionIds }, scopeType: 'COMPANY', factSubjectId: null, supersededAt: null, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] }, orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }] }),
    prisma.processObservationSnapshot.findMany({ where: { clientId }, orderBy: [{ observedAt: 'desc' }, { createdAt: 'desc' }], select: { id: true, businessProcessId: true, metricVersion: true, observedAt: true, metrics: true } }),
  ]);

  const stateByDefinition = new Map(states.map((state) => [state.factDefinitionId, state]));
  const factsByDefinition = new Map<string, ProfileFactRow[]>();
  for (const fact of fallbackFacts as ProfileFactRow[]) factsByDefinition.set(fact.factDefinitionId, [...(factsByDefinition.get(fact.factDefinitionId) || []), fact]);
  const canonicalState: Record<string, CompanyProfileFactState> = {};
  const selectedFacts = new Map<string, ProfileFactRow | null>();
  for (const definition of definitions) {
    const state = stateByDefinition.get(definition.id);
    if (state) {
      const current = state.currentFact as ProfileFactRow | null;
      canonicalState[definition.key] = profileFactStateValue(current, String(state.status));
      selectedFacts.set(definition.id, current);
      continue;
    }
    const candidates = factsByDefinition.get(definition.id) || [];
    const fallback = candidates.length === 1 && profileFactIsUsable(definition, candidates[0], now) ? candidates[0] : null;
    canonicalState[definition.key] = profileFactStateValue(fallback, fallback ? 'ANSWERED' : 'UNANSWERED');
    selectedFacts.set(definition.id, fallback);
  }
  const derivedState = applyDeterministicDerivations(canonicalState);
  const visibleKeys = new Set([
    ...COMPANY_PROFILE_QUESTIONS.filter((question) => question.baseline || question.discoveryBaseline).map((question) => question.factDefinitionKey),
    ...resolveVisibleQuestions(derivedState).visible.flatMap((question) => question.factKeys),
  ]);
  const facts = definitions.flatMap((definition) => {
    const question = getCompanyProfileQuestionForDefinition(definition);
    if (!question) return [];
    const state = derivedState[definition.key] || { status: 'UNANSWERED' as const };
    const selected = selectedFacts.get(definition.id) || null;
    const answerState = stateByDefinition.get(definition.id);
    return [{
      id: selected?.id || null,
      key: definition.key,
      questionKey: question.questionKey || definition.questionKey || null,
      valueType: String(definition.valueType),
      status: state.status,
      value: state.value ?? null,
      scopeType: 'COMPANY',
      verificationStatus: selected?.verificationStatus || null,
      determinationMethod: state.derived ? 'DERIVED' : selected?.determinationMethod || (answerState ? 'USER_PROVIDED' : null),
      observedAt: selected?.observedAt?.toISOString() || null,
      effectiveAt: selected?.effectiveAt?.toISOString() || null,
      validFrom: selected?.validFrom?.toISOString() || null,
      validTo: selected?.validTo?.toISOString() || null,
      supersededAt: selected?.supersededAt?.toISOString() || null,
    } as const];
  });
  const visibleFacts = facts.filter((fact) => visibleKeys.has(fact.key));
  const coverage = {
    relevantDefinitionCount: visibleFacts.length,
    answeredCount: visibleFacts.filter((fact) => fact.status === 'ANSWERED').length,
    unknownCount: visibleFacts.filter((fact) => fact.status === 'UNKNOWN').length,
    unansweredCount: visibleFacts.filter((fact) => fact.status === 'UNANSWERED').length,
    knownCount: visibleFacts.filter((fact) => fact.status !== 'UNANSWERED').length,
  };

  const latestSnapshotByProcess = new Map<string, (typeof snapshots)[number]>();
  for (const snapshot of snapshots) if (!latestSnapshotByProcess.has(snapshot.businessProcessId)) latestSnapshotByProcess.set(snapshot.businessProcessId, snapshot);
  const processesDto = processes.map((process) => {
    const snapshot = latestSnapshotByProcess.get(process.id);
    return {
      id: process.id,
      name: process.name,
      category: process.category,
      description: process.description,
      criticality: process.criticality,
      frequency: process.frequency,
      status: process.status,
      owner: process.ownerPerson ? { id: process.ownerPerson.id, name: process.ownerPerson.name } : null,
      organizationGroup: process.organizationGroup ? { id: process.organizationGroup.id, name: process.organizationGroup.name } : null,
      steps: process.steps.map((step) => ({ id: step.id, position: step.position, name: step.name, stepType: step.stepType, isApproval: Boolean(step.isApproval), responsiblePerson: step.responsiblePerson ? { id: step.responsiblePerson.id, name: step.responsiblePerson.name } : null, system: step.system ? { id: step.system.id, name: step.system.name } : null, estimatedActiveMinutes: step.estimatedActiveMinutes, estimatedWaitingMinutes: step.estimatedWaitingMinutes })),
      latestMeasuredSnapshot: snapshot ? { id: snapshot.id, metricVersion: snapshot.metricVersion, observedAt: snapshot.observedAt.toISOString(), metrics: projectDataRoomMetrics(snapshot.metrics) } : null,
    };
  });

  const documentCategories: Record<string, number> = {};
  const documentStatuses: Record<string, number> = {};
  for (const document of documents) { increment(documentCategories, String(document.category)); increment(documentStatuses, String(document.workStatus)); }
  const contractStatuses: Record<string, number> = {};
  const contractsDto = contracts.map((contract) => { increment(contractStatuses, String(contract.status)); return { id: contract.id, title: contract.title, contractType: contract.contractType, status: String(contract.status), effectiveDate: iso(contract.effectiveDate), expiryDate: iso(contract.expiryDate), nextCriticalDate: iso(contract.nextCriticalDate) }; });
  const evidenceStatuses: Record<string, number> = {};
  const evidenceSources: Record<string, number> = {};
  for (const row of evidence) { increment(evidenceStatuses, String(row.status)); increment(evidenceSources, String(row.sourceType)); }
  const opportunitiesByStatus: Record<string, number> = {};
  for (const row of opportunities) increment(opportunitiesByStatus, String(row.status));
  const outcomesByBasis: Record<string, number> = {};
  for (const row of outcomes) increment(outcomesByBasis, String(row.basis));
  const compliance = await getComplianceWorkspace(actor, clientId, prisma);

  const dto: CompanyDataRoomDto = {
    client: { id: client.id, name: client.name },
    operatingProfile: profile ? { status: profile.status, complianceEnrollmentStatus: String(profile.complianceEnrollmentStatus), summary: profile.summary, lastReviewedAt: iso(profile.lastReviewedAt), nextReviewAt: iso(profile.nextReviewAt) } : null,
    facts,
    coverage,
    organization: { groups: groups.map((group) => ({ id: group.id, name: group.name, description: group.descriptionSafe, parentGroupId: group.parentGroupId, status: String(group.status) })), people: people.map((person) => ({ id: person.id, name: person.name, jobTitle: person.jobTitle, employmentStatus: String(person.employmentStatus), groupId: person.organizationGroupId, groupName: person.organizationGroup?.name || null })) },
    processes: processesDto,
    systems: systems.map((system) => ({ id: system.id, name: system.name, category: system.category, vendor: system.vendor, purpose: system.purpose, status: system.status, owner: system.ownerPerson ? { id: system.ownerPerson.id, name: system.ownerPerson.name } : null })),
    documentsSummary: { total: documents.length, byCategory: documentCategories, byWorkStatus: documentStatuses, recent: documents.slice(0, 20).map((document) => ({ id: document.id, name: document.name, title: document.title, category: String(document.category), workStatus: String(document.workStatus), updatedAt: document.updatedAt.toISOString() })) },
    contractsSummary: { total: contracts.length, byStatus: contractStatuses, items: contractsDto },
    complianceSummary: compliance.summary,
    evidenceSummary: { total: evidence.length, byStatus: evidenceStatuses, bySourceType: evidenceSources },
    developmentSummary: { initiatives: initiatives.map((initiative) => ({ id: initiative.id, title: initiative.title, status: String(initiative.status), priority: String(initiative.priority), targetState: initiative.targetState, targetAt: iso(initiative.targetAt), milestoneCount: initiative.milestones.length })), milestones: milestones.map((milestone) => ({ id: milestone.id, title: milestone.title, type: milestone.type, status: String(milestone.status), targetDate: iso(milestone.targetDate), milestoneDate: iso(milestone.milestoneDate) })), opportunitiesByStatus },
    outcomeSummary: { total: outcomes.length, measured: outcomesByBasis.MEASURED || 0, calculated: outcomesByBasis.CALCULATED || 0, estimated: outcomesByBasis.ESTIMATED || 0, assumed: outcomesByBasis.ASSUMED || 0 },
    dataQuality: { stale: 'CONTRACT_GAP', conflicting: 'CONTRACT_GAP', notes: ['Freshness policy is not exposed without a canonical temporal decision.', 'Conflict state is not inferred from multiple historical facts.'] },
  };
  assertClientSafe(dto);
  return dto;
}
