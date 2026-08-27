import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { InteractionError } from '../client-interaction/base';

type Prisma = typeof defaultPrisma;

export type ClientSafeWorkSummary = {
  period: { from: string; to: string };
  totalMinutes: number;
  matters: Array<{ matterId: string; title: string; minutes: number }>;
};

type WorkSummaryPeriod = { from?: Date; to?: Date };

function monthPeriod(now = new Date()): { from: Date; to: Date } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { from, to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) };
}
function resolvePeriod(period: WorkSummaryPeriod): { from: Date; to: Date } {
  const defaults = monthPeriod();
  const from = period.from || defaults.from;
  const to = period.to || defaults.to;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    throw new InteractionError(400, 'WORK_SUMMARY_PERIOD_INVALID', 'The work-summary period must be a valid UTC range.');
  }
  return { from, to };
}

/**
 * Customer-safe recorded-work projection. Scope is derived from the selected
 * server-resolved workspace and active case grants; no client or case id is
 * accepted from the request.
 */
export async function getClientSafeWorkSummary(
  identityId: string,
  workspace: { id: string; clientId: string },
  period: WorkSummaryPeriod = {},
  db: Prisma = defaultPrisma,
): Promise<ClientSafeWorkSummary> {
  const { from, to } = resolvePeriod(period);
  const now = new Date();
  const grants = await db.clientPortalGrant.findMany({
    where: {
      clientPortalIdentityId: identityId,
      workspaceId: workspace.id,
      clientId: workspace.clientId,
      status: 'ACTIVE',
      validFrom: { lte: now },
      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      permissions: { has: 'HOURS_READ' },
    },
    select: { caseId: true },
  });
  if (!grants.length) {
    throw new InteractionError(403, 'HOURS_READ_REQUIRED', 'Recorded work is not available for this client workspace.');
  }

  const cases = await db.case.findMany({
    where: { id: { in: grants.map((grant) => grant.caseId) }, clientId: workspace.clientId, matterId: { not: null } },
    select: { matterId: true, matter: { select: { id: true, title: true } } },
  });
  const matters = new Map(cases.flatMap((row) => row.matter ? [[row.matter.id, row.matter] as const] : []));
  const matterIds = [...matters.keys()];
  if (!matterIds.length) {
    return { period: { from: from.toISOString(), to: to.toISOString() }, totalMinutes: 0, matters: [] };
  }

  const totals = await db.timeEntry.groupBy({
    by: ['matterId'],
    where: { matterId: { in: matterIds }, workDate: { gte: from, lt: to } },
    _sum: { minutes: true },
  });
  const minutesByMatter = new Map(totals.map((row) => [row.matterId, row._sum.minutes || 0]));
  const output = [...matters.values()]
    .map((matter) => ({ matterId: matter.id, title: matter.title, minutes: minutesByMatter.get(matter.id) || 0 }))
    .filter((matter) => matter.minutes > 0)
    .sort((left, right) => left.title.localeCompare(right.title) || left.matterId.localeCompare(right.matterId));

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    totalMinutes: output.reduce((total, matter) => total + matter.minutes, 0),
    matters: output,
  };
}
