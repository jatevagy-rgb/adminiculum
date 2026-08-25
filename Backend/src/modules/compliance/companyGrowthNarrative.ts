/**
 * Grow With Us — HUMAN change/development explanation over real engine data.
 *
 * NOT a second compliance engine. It composes:
 *   - the latest employee-count fact + its superseded predecessor (the 47 -> 52
 *     before/current story),
 *   - the engine-derived applicable finding count (real assessmentFinding),
 *   - (internal only) proposal availability / confirmation state,
 * into human “what changed / what it means / what we do now / next step” copy.
 *
 * The PORTAL-SAFE function must never return internal ids, ruleAst, severity
 * implementation, requirementVersionId, findingId or proposalId. It is read-only
 * and never mutates.
 */
import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';

const EMPLOYEE_COUNT_KEY = 'DEMO_KFT_COMPANY_EMPLOYEE_COUNT';

export interface CompanyGrowthNarrative {
  beforeEmployeeCount: number | null;
  currentEmployeeCount: number | null;
  changed: boolean;
  applicableFindingCount: number;
  meaningText: string;
  nowText: string;
  nextStepText: string;
}

export interface ClientSafeGrowthNarrative {
  beforeEmployeeCount: number | null;
  currentEmployeeCount: number | null;
  changed: boolean;
  newTopicSafeCount: number;
  safeFeedback: string;
  safeMeaningText: string;
  safeNowText: string;
  safeNextStepText: string;
}

async function readFacts(db: PrismaClient, clientId: string) {
  const facts = await db.clientFact.findMany({
    where: { clientId, type: EMPLOYEE_COUNT_KEY },
    orderBy: { validFrom: 'desc' },
    take: 2,
    select: { id: true, numberValue: true, supersededAt: true, validFrom: true },
  });
  const current = facts.find((f) => f.supersededAt === null) ?? facts[0] ?? null;
  const before = facts.find((f) => f.supersededAt !== null) ?? (current ? null : null);
  return { current, before };
}

async function countApplicableFindings(db: PrismaClient, clientId: string): Promise<number> {
  return db.assessmentFinding.count({ where: { clientId } });
}

function narrative(
  before: number | null,
  current: number | null,
  applicableFindingCount: number,
): CompanyGrowthNarrative {
  const changed = before !== null && current !== null && before !== current;
  const hasNew = applicableFindingCount > 0;
  return {
    beforeEmployeeCount: before,
    currentEmployeeCount: current,
    changed,
    applicableFindingCount,
    meaningText: changed && hasNew
      ? 'Új megfelelőségi terület vált relevánssá a létszámváltozás miatt.'
      : changed
        ? 'A vállalat létszámadata megváltozott.'
        : 'Nincs azonosított megfelelőségi változás.',
    nowText: hasNew ? 'Jogi áttekintés szükséges.' : 'Nincs függő megfelelőségi teendő.',
    nextStepText: hasNew ? 'Megfelelőségi áttekintés megindítása.' : 'Nincs következő lépés.',
  };
}

/** Internal workforce narrative. May additionally include proposal state. */
export async function getCompanyGrowthNarrative(
  actor: { userId: string; role: string | null },
  clientId: string,
  db: PrismaClient = defaultPrisma,
): Promise<CompanyGrowthNarrative & { proposalAvailable: boolean; proposalConfirmed: boolean }> {
  // Authorization check identical to getComplianceOverview.
  const { assertClientReadAccess } = await import('../client-interaction/base');
  await assertClientReadAccess(actor as never, clientId, db as never);

  const { before, current } = await readFacts(db, clientId);
  const applicableFindingCount = await countApplicableFindings(db, clientId);
  const proposals = await db.complianceProposal.findMany({
    where: { clientId },
    select: { status: true },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  const proposalAvailable = proposals.some((p) => String(p.status) === 'PROPOSED');
  const proposalConfirmed = proposals.some((p) => String(p.status) === 'CONFIRMED');
  return {
    ...narrative(before?.numberValue ?? null, current?.numberValue ?? null, applicableFindingCount),
    proposalAvailable,
    proposalConfirmed,
  };
}

/** Client-safe Grow With Us narrative for the organizational portal. */
export async function getClientSafeGrowthNarrative(
  clientId: string,
  db: PrismaClient = defaultPrisma,
): Promise<ClientSafeGrowthNarrative> {
  const { before, current } = await readFacts(db, clientId);
  const applicableFindingCount = await countApplicableFindings(db, clientId);
  const n = narrative(before?.numberValue ?? null, current?.numberValue ?? null, applicableFindingCount);
  return {
    beforeEmployeeCount: n.beforeEmployeeCount,
    currentEmployeeCount: n.currentEmployeeCount,
    changed: n.changed,
    newTopicSafeCount: n.applicableFindingCount,
    safeFeedback: n.applicableFindingCount > 0 ? `${n.applicableFindingCount} új terület jelent meg az áttekintésben.` : 'Nincs új megfelelőségi terület.',
    safeMeaningText: n.meaningText,
    safeNowText: n.nowText,
    safeNextStepText: n.nextStepText,
  };
}
