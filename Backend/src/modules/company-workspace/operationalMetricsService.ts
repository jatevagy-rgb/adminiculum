import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { assertClientReadAccess, internalCaseScope, InteractionError, type InternalActor } from '../client-interaction/base';
import { calculateOperationalMetric, calculateRecordedEffort, metricPeriod, OPERATIONAL_METRICS, periodBounds, type OperationalMetricKey } from './operationalMetrics';

type Db = typeof defaultPrisma;

/** Reuses client gate AND case visibility. A client-level read never widens case aggregates. */
export async function getOperationalMetrics(actor: InternalActor, clientId: string, query: { metricKey?: unknown; from?: unknown; to?: unknown }, db: Db = defaultPrisma) {
  const now = new Date();
  const period = metricPeriod(query.from, query.to, now);
  if (query.metricKey !== undefined && !Object.prototype.hasOwnProperty.call(OPERATIONAL_METRICS, String(query.metricKey))) {
    throw new InteractionError(400, 'METRIC_KEY_INVALID', 'Ismeretlen mutató.');
  }
  const keys = query.metricKey === undefined ? Object.keys(OPERATIONAL_METRICS) as OperationalMetricKey[] : [String(query.metricKey) as OperationalMetricKey];
  return db.$transaction(async tx => {
    const reader = tx as unknown as Db;
    await assertClientReadAccess(actor, clientId, reader);
    const scope = await internalCaseScope(actor, reader);
    const caseWhere = { clientId, ...(scope === null ? {} : { id: { in: scope } }) };
    const bounds = periodBounds(period);
    const cases = keys.includes('CASE_CYCLE') ? await tx.case.findMany({ where: { ...caseWhere, status: { not: 'CANCELLED' }, completedAt: bounds }, select: { id: true, receivedAt: true, completedAt: true }, orderBy: { id: 'asc' }, take: 10001 }) : [];
    const submissions = keys.some(key => key !== 'CASE_CYCLE' && key !== 'RECORDED_EFFORT') ? await tx.taskSubmission.findMany({
      where: { task: { case: caseWhere }, submittedAt: bounds, status: { notIn: ['DRAFT', 'CANCELLED'] } },
      select: { id: true, status: true, submittedAt: true, returnedAt: true, approvedAt: true, task: { select: { caseId: true } } }, orderBy: { id: 'asc' }, take: 10001,
    }) : [];
    const effort = keys.includes('RECORDED_EFFORT') ? await tx.timeEntry.findMany({ where: { userId: actor.userId, case: caseWhere, workDate: bounds }, select: { id: true, caseId: true, minutes: true }, orderBy: { id: 'asc' }, take: 10001 }) : [];
    if (cases.length > 10000 || submissions.length > 10000 || effort.length > 10000) throw new InteractionError(422, 'METRIC_SCOPE_TOO_LARGE', 'Szűkítse az időszakot; részleges összesítés nem jeleníthető meg.');
    return { items: keys.map(key => key === 'RECORDED_EFFORT' ? calculateRecordedEffort(clientId, period, effort, now) : calculateOperationalMetric(key, clientId, period, cases, submissions, now)), unavailable: [
      { metricKey: 'EMAIL_TRIAGE_LABOUR', code: 'METRIC_NEEDS_EVENT_TELEMETRY', reason: 'A levelek időbélyege nem aktív munkaidő. Önkéntes alapfelmérés szükséges.' },
      { metricKey: 'EVIDENCE_REUSE', code: 'AWAITING_REPAIR_DEPENDENCY', reason: 'A bizonyítékok újrafelhasználásához szükséges ellenőrzött forrásadat még nem áll rendelkezésre.' },
      { metricKey: 'OVERDUE_OPEN_WORK', code: 'AWAITING_DEADLINE_REPAIR', reason: 'A lejárt nyitott munkák összesítéséhez szükséges egységes határidőadat még nem áll rendelkezésre.' },
      { metricKey: 'GROW_OUTCOME', code: 'AWAITING_REPAIR_DEPENDENCY', reason: 'A Grow eredmények összehasonlítható mért és becsült forrásadata még nem áll rendelkezésre.' },
    ] };
  }, { isolationLevel: 'RepeatableRead' });
}
