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
import { getComplianceWorkspace } from '../compliance/complianceWorkspaceService';
import { resolveCanonicalTypedFactValue, type CanonicalTypedFactValue } from '../client-workspace/canonicalFactValue';

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
  } | null;
  facts: Array<{
    id: string | null;
    type: string;
    value: CanonicalTypedFactValue | null;
    answerStatus: 'ANSWERED' | 'UNKNOWN' | 'UNANSWERED';
    factDefinition: { key: string; domainCode: string; valueType: string } | null;
    scopeType: string | null;
    factSubjectId: string | null;
    verificationStatus: string | null;
    observedAt: string | null;
    effectiveAt: string | null;
    validFrom: string | null;
    validTo: string | null;
  }>;
  dataQuality: {
    answerStateSummary: {
      answered: number;
      unknown: number;
    };
    coverageAvailable: false;
    stale: null;
    staleAvailable: false;
    conflictingAvailable: false;
  };
  organization: {
    groupCount: number;
    activeGroupCount: number;
    personCount: number;
    activePersonCount: number;
    groups: Array<{ id: string; name: string; status: string; parentGroupId: string | null }>;
    people: Array<{ id: string; name: string; jobTitle: string | null; employmentStatus: string; organizationGroupId: string | null }>;
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
      responsiblePerson: { id: string; name: string } | null;
      system: { id: string; name: string; category: string } | null;
      estimatedActiveMinutes: number | null;
      estimatedWaitingMinutes: number | null;
      isApproval: boolean;
    }>;
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
  };
  measurementSummary: {
    nonSyntheticOutcomeCount: number;
    byBasis: Array<{ basis: string; count: number }>;
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

  const [
    client,
    profile,
    facts,
    answerStates,
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
    nonSyntheticOutcomeCount,
    outcomesByBasis,
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
        factDefinition: { select: { id: true, key: true, domainCode: true, valueType: true, temporalPolicy: true } },
        scopeType: true,
        factSubjectId: true,
        verificationStatus: true,
        observedAt: true,
        effectiveAt: true,
        validFrom: true,
        validTo: true,
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
    prisma.clientOrganizationGroup.findMany({
      where: { clientId },
      orderBy: { name: 'asc' },
      take: 200,
      select: { id: true, name: true, status: true, parentGroupId: true },
    }),
    prisma.organizationPerson.findMany({
      where: { clientId },
      orderBy: { name: 'asc' },
      take: 500,
      select: { id: true, name: true, jobTitle: true, employmentStatus: true, organizationGroupId: true },
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
            system: { select: { id: true, name: true, category: true } },
            estimatedActiveMinutes: true,
            estimatedWaitingMinutes: true,
            isApproval: true,
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
    prisma.document.count({ where: { clientId } }),
    prisma.documentVersion.count({ where: { document: { clientId }, isCurrent: true } }),
    prisma.evidenceRecord.count({ where: { clientId, documentVersionId: { not: null } } }),
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
    prisma.outcomeMeasurement.count({ where: { clientId, synthetic: false } }),
    prisma.outcomeMeasurement.groupBy({ by: ['basis'], where: { clientId, synthetic: false }, _count: { _all: true } }),
  ]);

  if (!client) throw new InteractionError(404, 'CLIENT_NOT_FOUND', 'Client not found.');

  const answerStateByDefinition = new Map(answerStates.map((state) => [state.factDefinitionId, state]));
  const projectFact = (
    fact: typeof facts[number] | NonNullable<typeof answerStates[number]['currentFact']>,
    factDefinition: { key: string; domainCode: string; valueType: string } | null,
    answerStatus: 'ANSWERED' | 'UNKNOWN' | 'UNANSWERED',
    allowLegacyValue: boolean,
  ) => ({
    id: 'id' in fact ? fact.id : null,
    type: fact.type,
    value: resolveCanonicalTypedFactValue(fact) ?? (allowLegacyValue && 'value' in fact ? fact.value : null),
    answerStatus,
    factDefinition,
    scopeType: 'scopeType' in fact && fact.scopeType ? String(fact.scopeType) : null,
    factSubjectId: 'factSubjectId' in fact ? fact.factSubjectId : null,
    verificationStatus: 'verificationStatus' in fact ? String(fact.verificationStatus) : null,
    observedAt: iso('observedAt' in fact ? fact.observedAt : null),
    effectiveAt: iso('effectiveAt' in fact ? fact.effectiveAt : null),
    validFrom: 'validFrom' in fact ? fact.validFrom.toISOString() : null,
    validTo: iso('validTo' in fact ? fact.validTo : null),
  });
  const projectedFacts = [
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
            ? { key: fact.factDefinition.key, domainCode: fact.factDefinition.domainCode, valueType: String(fact.factDefinition.valueType) }
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
        factDefinition: state.factDefinition
          ? { key: state.factDefinition.key, domainCode: state.factDefinition.domainCode, valueType: String(state.factDefinition.valueType) }
          : null,
        scopeType: 'COMPANY',
        factSubjectId: null,
        verificationStatus: null,
        observedAt: null,
        effectiveAt: null,
        validFrom: null,
        validTo: null,
      })),
  ];

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
        }
      : null,
    facts: projectedFacts,
    dataQuality: {
      answerStateSummary: {
        answered: answerStates.filter((state) => String(state.status) === 'ANSWERED').length,
        unknown: answerStates.filter((state) => String(state.status) === 'UNKNOWN').length,
      },
      coverageAvailable: false,
      stale: null,
      staleAvailable: false,
      conflictingAvailable: false,
    },
    organization: {
      groupCount,
      activeGroupCount,
      personCount,
      activePersonCount,
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        status: String(group.status),
        parentGroupId: group.parentGroupId,
      })),
      people: people.map((person) => ({
        id: person.id,
        name: person.name,
        jobTitle: person.jobTitle,
        employmentStatus: String(person.employmentStatus),
        organizationGroupId: person.organizationGroupId,
      })),
    },
    processes: processes.map((process) => ({
      id: process.id,
      name: process.name,
      category: process.category,
      description: process.description,
      criticality: process.criticality,
      frequency: process.frequency,
      status: process.status,
      owner: process.ownerPerson,
      organizationGroup: process.organizationGroup,
      steps: process.steps.map((step) => ({
        id: step.id,
        position: step.position,
        name: step.name,
        stepType: step.stepType,
        responsiblePerson: step.responsiblePerson,
        system: step.system,
        estimatedActiveMinutes: step.estimatedActiveMinutes,
        estimatedWaitingMinutes: step.estimatedWaitingMinutes,
        isApproval: step.isApproval,
      })),
    })),
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
    },
    measurementSummary: {
      nonSyntheticOutcomeCount,
      byBasis: groupedCount(outcomesByBasis.map((row) => ({ basis: row.basis, count: row._count._all })), 'basis') as Array<{ basis: string; count: number }>,
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
