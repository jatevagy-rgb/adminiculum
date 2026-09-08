import { HourlyRateVersion, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import { ROLES } from '../../middleware/auth';
import { InteractionError, InternalActor } from '../client-interaction/base';

type Db = PrismaClient | Prisma.TransactionClient;
export type RateScope = { clientId: string; caseId?: string | null };
const fail = (status: number, code: string, message: string): never => { throw new InteractionError(status, code, message); };

/** Date-only financial policy: Budapest calendar day, independent of server timezone. */
export function billingDate(value: Date = new Date()): string {
  if (!Number.isFinite(value.getTime())) return fail(400, 'RATE_DATE_INVALID', 'Érvénytelen dátum.');
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

export function parseRateDate(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') {
    return fail(400, 'RATE_DATE_INVALID', 'A dátum formátuma ÉÉÉÉ-HH-NN.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return fail(400, 'RATE_DATE_INVALID', 'Érvénytelen naptári nap.');
  return date;
}

export async function requireRateManager(actor: InternalActor, db: Db = prisma): Promise<void> {
  const user = await db.user.findUnique({ where: { id: actor.userId }, select: { role: true, status: true, isActive: true } });
  if (!user || !user.isActive || user.status !== 'ACTIVE' || ![ROLES.ADMIN, ROLES.PARTNER].includes(user.role)) {
    fail(403, 'RATE_ACCESS_FORBIDDEN', 'Az óradíjakat csak aktív adminisztrátor vagy partner kezelheti.');
  }
}

export async function assertRateScope(scope: RateScope, db: Db = prisma): Promise<void> {
  if (!scope.clientId || !await db.client.findUnique({ where: { id: scope.clientId }, select: { id: true } })) fail(404, 'CLIENT_NOT_FOUND', 'Az ügyfél nem található.');
  if (scope.caseId) {
    const row = await db.case.findUnique({ where: { id: scope.caseId }, select: { clientId: true } });
    if (!row) fail(404, 'CASE_NOT_FOUND', 'Az ügy nem található.');
    if (row!.clientId !== scope.clientId) fail(409, 'RATE_CLIENT_CASE_MISMATCH', 'Az ügy nem ehhez az ügyfélhez tartozik.');
  }
}

export function rateVersionDto(row: HourlyRateVersion) {
  return { id: row.id, clientId: row.clientId, caseId: row.caseId, effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    currency: row.currency, hourlyRate: row.hourlyRate?.toFixed(4) ?? null, mode: row.mode,
    createdAt: row.createdAt.toISOString(), createdById: row.createdById };
}

/** Internal service: callers authorize their own surface; never infer scope from labels. */
export async function resolveHourlyRate(input: RateScope & { workDate: Date | string }, db: Db = prisma) {
  await assertRateScope(input, db);
  const date = parseRateDate(input.workDate instanceof Date ? billingDate(input.workDate) : input.workDate);
  const caseVersion = input.caseId ? await db.hourlyRateVersion.findFirst({
    where: { clientId: input.clientId, caseId: input.caseId, effectiveFrom: { lte: date } }, orderBy: { effectiveFrom: 'desc' },
  }) : null;
  const selected = caseVersion?.mode === 'EXPLICIT_RATE' ? caseVersion : await db.hourlyRateVersion.findFirst({
    where: { clientId: input.clientId, caseId: null, effectiveFrom: { lte: date } }, orderBy: { effectiveFrom: 'desc' },
  });
  return {
    status: selected ? 'RESOLVED' as const : 'UNRESOLVED' as const,
    currency: selected?.currency ?? 'HUF', hourlyRate: selected?.hourlyRate?.toFixed(4) ?? null,
    scope: selected ? (selected.caseId ? 'CASE' as const : 'CLIENT' as const) : 'UNRESOLVED' as const,
    rateVersionId: selected?.id ?? null, effectiveFrom: selected?.effectiveFrom.toISOString().slice(0, 10) ?? null,
    caseMode: caseVersion?.mode ?? 'INHERIT_CLIENT', caseVersionId: caseVersion?.id ?? null,
  };
}

export async function getRateHistory(scope: RateScope, actor: InternalActor, workDate: string, db: Db = prisma) {
  await requireRateManager(actor, db);
  const effective = await resolveHourlyRate({ ...scope, workDate }, db);
  const date = parseRateDate(workDate);
  const history = await db.hourlyRateVersion.findMany({ where: { clientId: scope.clientId, caseId: scope.caseId || null }, orderBy: { effectiveFrom: 'desc' } });
  // Include client changes too: the next case result may inherit a scheduled client rate.
  const upcoming = await db.hourlyRateVersion.findMany({ where: { clientId: scope.clientId,
    OR: [{ caseId: null }, ...(scope.caseId ? [{ caseId: scope.caseId }] : [])], effectiveFrom: { gt: date } }, orderBy: { effectiveFrom: 'asc' } });
  let next: { date: string; effective: typeof effective } | null = null;
  for (const day of [...new Set(upcoming.map(row => row.effectiveFrom.toISOString().slice(0, 10)))]) {
    const candidate = await resolveHourlyRate({ ...scope, workDate: day }, db);
    if (candidate.rateVersionId !== effective.rateVersionId || candidate.caseVersionId !== effective.caseVersionId) {
      next = { date: day, effective: candidate };
      break;
    }
  }
  return { asOf: workDate, effective, next, history: history.map(rateVersionDto), canManage: true };
}

export function parseRateInput(body: unknown, isCase: boolean, today = billingDate()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'RATE_INPUT_INVALID', 'Érvénytelen óradíjadatok.');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['effectiveFrom', 'currency', 'hourlyRate', 'mode'].includes(key))) return fail(400, 'RATE_INPUT_INVALID', 'Nem támogatott mező.');
  const effectiveFrom = parseRateDate(input.effectiveFrom);
  if ((input.effectiveFrom as string) < today) return fail(400, 'RATE_BACKDATE_FORBIDDEN', 'Új óradíj csak a mai naptól vagy későbbi dátumtól érvényesíthető.');
  if (input.currency !== 'HUF') return fail(400, 'RATE_CURRENCY_UNSUPPORTED', 'Ebben a verzióban csak HUF használható.');
  if (input.mode === 'INHERIT_CLIENT') {
    if (!isCase || (input.hourlyRate !== null && input.hourlyRate !== undefined)) return fail(400, 'RATE_STATE_INVALID', 'Az öröklés csak ügyre, összeg nélkül állítható be.');
    return { effectiveFrom, currency: 'HUF', mode: 'INHERIT_CLIENT' as const, hourlyRate: null };
  }
  if (input.mode !== 'EXPLICIT_RATE' || typeof input.hourlyRate !== 'string' || !/^\d{1,15}(\.\d{1,4})?$/.test(input.hourlyRate)) {
    return fail(400, 'RATE_AMOUNT_INVALID', 'Az óradíj pozitív decimális szöveg, legfeljebb négy tizedesjeggyel.');
  }
  const hourlyRate = new Prisma.Decimal(input.hourlyRate);
  if (!hourlyRate.isPositive() || hourlyRate.isZero()) return fail(400, 'RATE_AMOUNT_INVALID', 'Az óradíjnak nullánál nagyobbnak kell lennie.');
  return { effectiveFrom, currency: 'HUF', mode: 'EXPLICIT_RATE' as const, hourlyRate };
}

export async function appendRate(scope: RateScope, actor: InternalActor, body: unknown, db: Db = prisma) {
  await requireRateManager(actor, db);
  await assertRateScope(scope, db);
  const data = parseRateInput(body, Boolean(scope.caseId));
  try {
    return rateVersionDto(await db.hourlyRateVersion.create({ data: { ...data, clientId: scope.clientId, caseId: scope.caseId || null, createdById: actor.userId } }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return fail(409, 'RATE_EFFECTIVE_DATE_EXISTS', 'Erre a napra már létezik óradíjverzió. Válasszon másik dátumot.');
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2003', 'P2004'].includes(error.code)) return fail(409, 'RATE_SCOPE_CHANGED', 'Az ügyfél vagy az ügy adatai megváltoztak. Töltse újra.');
    throw error;
  }
}
