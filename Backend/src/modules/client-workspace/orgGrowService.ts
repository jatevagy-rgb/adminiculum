/**
 * PHASE 5 / CLIENT PORTAL 2.0 — ORGANIZATIONAL GROW WITH US SERVICE.
 *
 * WHY_EXISTING_SERVICE_CANNOT_BE_EXTENDED:
 * orgHomeService is responsible for the concise home journey; orgCompanyService is scoped
 * to company profile and group aggregates. A dedicated customer-safe Grow projector is required
 * to project multi-step business processes with system badges, active initiatives, and
 * outcome measurements (with strict basis categorization) for /portal/fejlesztes.
 *
 * EXISTING_SAFE_PROJECTOR_REUSED:
 * Reuses requireOrganizationWorkspace, projectCompanyOverviewForCustomer, and canonical
 * BusinessProcess/BusinessProcessStep/BusinessSystem/OutcomeMeasurement models.
 *
 * NEW_SERVICE_RESPONSIBILITY:
 * Projects customer-safe Grow With Us data without exposing internal findings, raw observer
 * traces, research notes, or OrganizationPerson names.
 *
 * DUPLICATE_DOMAIN_LOGIC: NO.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { assertClientSafe, InteractionError } from '../client-interaction/base';
import { requireOrganizationWorkspace } from './organizationalAccessPolicy';

type Prisma = typeof defaultPrisma;

export interface OrgGrowProcessStep {
  id: string;
  position: number;
  name: string;
  stepType: string;
  isApproval: boolean;
  systemName: string | null;
  systemCategory: string | null;
}

export interface OrgGrowProcess {
  id: string;
  name: string;
  category: string;
  criticality: string;
  frequency: string;
  organizationGroupName: string | null;
  steps: OrgGrowProcessStep[];
}

export interface OrgGrowInitiative {
  id: string;
  title: string;
  targetState: string | null;
  statusLabel: string;
  targetAt: string | null;
  hasRelatedMatter: boolean;
}

export interface OrgGrowOutcome {
  id: string;
  basis: 'MEASURED' | 'CALCULATED' | 'ESTIMATED';
  basisLabel: string;
  initiativeTitle: string | null;
  processName: string | null;
}

export interface OrgGrowDto {
  customerName: string;
  processes: OrgGrowProcess[];
  initiatives: OrgGrowInitiative[];
  outcomes: {
    measured: OrgGrowOutcome[];
    calculatedOrEstimated: OrgGrowOutcome[];
  };
  opportunities: Array<{
    id: string;
    title: string;
    problem: string;
    direction: string;
    kind: string;
    evidenceStrength: string;
  }>;
  opportunitiesDeferredNotice: string | null;
}

const INITIATIVE_STATUS_LABELS: Record<string, string> = {
  BACKLOG: 'Tervezés alatt',
  PLANNED: 'Tervezett',
  ACTIVE: 'Folyamatban',
  COMPLETED: 'Lezárva / Megvalósult',
  ON_HOLD: 'Szünetel',
  HOLD: 'Szünetel',
  CANCELLED: 'Megszakítva',
};

const OUTCOME_BASIS_LABELS: Record<string, string> = {
  MEASURED: 'Mért eredmény',
  CALCULATED: 'Számított eredmény / kapacitás',
  ESTIMATED: 'Becsült érték',
};

export async function getOrganizationalGrow(
  identityId: string,
  workspaceId: string,
  prisma: Prisma = defaultPrisma,
): Promise<OrgGrowDto> {
  const workspace = await requireOrganizationWorkspace(workspaceId, prisma);

  const membership = await prisma.clientPortalWorkspaceMembership.findFirst({
    where: {
      clientPortalIdentityId: identityId,
      workspaceId: workspace.id,
      status: 'ACTIVE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  if (!membership) {
    throw new InteractionError(403, 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED', 'Active workspace membership is required.');
  }

  const client = await prisma.client.findUnique({
    where: { id: workspace.clientId },
    select: { name: true },
  });
  if (!client) throw new InteractionError(404, 'CLIENT_NOT_FOUND', 'Client not found.');

  // 1. Load active business processes and their steps.
  // SECURITY (Correction 4): OrganizationPerson directory data is NOT exposed.
  // We omit responsiblePerson and only expose the step name, position, type, and linked system.
  const processesRaw = await prisma.businessProcess.findMany({
    where: { clientId: workspace.clientId, status: 'ACTIVE' },
    include: {
      organizationGroup: { select: { name: true } },
      steps: {
        orderBy: { position: 'asc' },
        include: {
          system: { select: { name: true, category: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const processes: OrgGrowProcess[] = processesRaw.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    criticality: p.criticality,
    frequency: p.frequency,
    organizationGroupName: p.organizationGroup?.name || null,
    steps: p.steps.map((s) => ({
      id: s.id,
      position: s.position,
      name: s.name,
      stepType: s.stepType,
      isApproval: s.isApproval,
      systemName: s.system?.name || null,
      systemCategory: s.system?.category || null,
    })),
  }));

  // 2. Load development initiatives (safe customer projection).
  // Includes PLANNED, ACTIVE, COMPLETED, ON_HOLD (or HOLD).
  // Strict publication boundary: internal IDs, raw status, and operational notes stripped.
  const initiativesRaw = await prisma.developmentInitiative.findMany({
    where: {
      clientId: workspace.clientId,
      status: { in: ['PLANNED', 'ACTIVE', 'COMPLETED', 'ON_HOLD'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  const initiatives: OrgGrowInitiative[] = initiativesRaw.map((i) => ({
    id: i.id,
    title: i.title,
    targetState: i.targetState || null,
    statusLabel: INITIATIVE_STATUS_LABELS[i.status] || i.status,
    targetAt: i.targetAt ? i.targetAt.toISOString() : null,
    hasRelatedMatter: Boolean(i.caseId),
  }));

  // 3. Load outcome measurements.
  // SECURITY (Correction 7 & 8):
  // - Filter out synthetic entries (synthetic: false)
  // - Filter out ASSUMED entries from results
  // - Categorize into MEASURED vs CALCULATED/ESTIMATED
  // - Strict DTO: metricsSummary, internal notes, and raw timestamps removed
  // - NEVER fabricate cash ROI
  const outcomesRaw = await prisma.outcomeMeasurement.findMany({
    where: {
      clientId: workspace.clientId,
      synthetic: false,
      basis: { in: ['MEASURED', 'CALCULATED', 'ESTIMATED'] },
    },
    include: {
      developmentInitiative: { select: { title: true } },
      businessProcess: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const measured: OrgGrowOutcome[] = [];
  const calculatedOrEstimated: OrgGrowOutcome[] = [];

  for (const o of outcomesRaw) {
    const basis = o.basis as 'MEASURED' | 'CALCULATED' | 'ESTIMATED';
    const item: OrgGrowOutcome = {
      id: o.id,
      basis,
      basisLabel: OUTCOME_BASIS_LABELS[basis] || basis,
      initiativeTitle: o.developmentInitiative?.title || null,
      processName: o.businessProcess?.name || null,
    };
    if (basis === 'MEASURED') {
      measured.push(item);
    } else {
      calculatedOrEstimated.push(item);
    }
  }

  // 4. Opportunities:
  // SECURITY (Correction 2): ImprovementOpportunity has no customer publication flag in schema.
  // Per Correction 2: DO NOT expose raw rows. Report gap and truthful empty.
  const dto: OrgGrowDto = {
    customerName: client.name,
    processes,
    initiatives,
    outcomes: {
      measured,
      calculatedOrEstimated,
    },
    opportunities: [],
    opportunitiesDeferredNotice: 'GROW_OPPORTUNITY_CUSTOMER_PUBLICATION_GAP',
  };

  assertClientSafe(dto);
  return dto;
}
