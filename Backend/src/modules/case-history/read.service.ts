import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { assertInternalCaseAccess, requireInternal, type InternalActor } from '../client-interaction/base';
import { buildInternalHistory } from './projection';

/** Complete source scan before pagination keeps ordering and totals stable. */
export async function readInternalCaseHistory(
  actor: InternalActor, caseId: string,
  options: { limit?: number; cursor?: string | null } = {},
  db = defaultPrisma,
) {
  requireInternal(actor);
  if (!caseId) throw new Error('Case ID is required');
  await assertInternalCaseAccess(actor, caseId, db);
  const [audits, timeEntries] = await Promise.all([
    db.timelineEvent.findMany({
      where: { caseId },
      select: {
        id: true, eventType: true, type: true, description: true, payload: true,
        createdAt: true, timeEntryId: true, user: { select: { name: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    db.timeEntry.findMany({
      where: { OR: [{ caseId }, { caseId: null, task: { caseId } }] },
      select: {
        id: true, workDate: true, createdAt: true, workType: true,
        description: true, minutes: true, user: { select: { name: true } },
      },
      orderBy: [{ workDate: 'asc' }, { id: 'asc' }],
    }),
  ]);
  return buildInternalHistory(audits, timeEntries, options);
}
