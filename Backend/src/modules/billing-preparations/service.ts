import crypto from 'crypto';
import { BillingPreparation, BillingPreparationItem, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import { ROLES } from '../../middleware/auth';
import { InteractionError, InternalActor } from '../client-interaction/base';
import { billingDate, parseRateDate, resolveHourlyRate } from '../hourly-rates/service';
import { resolveTimeEntryAttribution } from '../../routes/timeEntries';
import { renderBillingPreparationPdf } from './pdf';

type Db = PrismaClient | Prisma.TransactionClient;

const fail = (status: number, code: string, message: string): never => { throw new InteractionError(status, code, message); };

/**
 * T3B + T4 — persistent billing review ("Számlázás előkészítése").
 *
 * Money rule: per-TimeEntry minutes × resolved hourly rate / 60, computed ONLY
 * with Prisma.Decimal and rounded HALF_UP to 2 decimals (HUF). JS Number never
 * carries a monetary value; amounts serialize as decimal strings. The policy
 * version is persisted on every preparation so later invoice snapshots know
 * which algorithm produced each amount.
 *
 * Source rule: billing review NEVER writes back to TimeEntry. Every item keeps
 * a captured snapshot plus a deterministic fingerprint of every financially
 * relevant source field/relation; divergence surfaces as STALE.
 */
export const CALCULATION_POLICY_VERSION = 'PER_ENTRY_MINUTES_X_RATE_HALF_UP_2DP_V1';
export const BILLING_CURRENCY = 'HUF';

export const REVIEW_REQUIRED_ATTRIBUTIONS = new Set(['MATTER_ONLY', 'AMBIGUOUS']);
export type BillingReviewStatus =
  | 'SOURCE_MISSING' | 'STALE' | 'REVIEW_REQUIRED' | 'NO_RATE' | 'NON_BILLABLE' | 'ZERO_MINUTES' | 'OK';

/** Interactive transaction when the caller passes a PrismaClient; run inline inside an existing transaction. */
export function withTransaction<T>(db: Db, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return '$transaction' in db ? (db as PrismaClient).$transaction(work) : work(db as Prisma.TransactionClient);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const RATE_INPUT_PATTERN = /^\d{1,15}(\.\d{1,4})?$/;

/** Canonical money calculation: billingMinutes × hourlyRate / 60, HALF_UP 2dp. */
export function netAmountForMinutes(billingMinutes: number, hourlyRate: Prisma.Decimal | null | undefined): Prisma.Decimal | null {
  if (hourlyRate === null || hourlyRate === undefined) return null;
  if (!Number.isInteger(billingMinutes) || billingMinutes <= 0) return null;
  return new Prisma.Decimal(billingMinutes).mul(hourlyRate).div(60).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

const sourceEntryInclude = {
  matter: { select: { id: true, clientId: true, cases: { select: { id: true, clientId: true, caseNumber: true, title: true } } } },
  case: { select: { id: true, clientId: true, caseNumber: true, title: true } },
  user: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  task: {
    select: {
      id: true, title: true, caseId: true, matterId: true, requestedByOrganizationPersonId: true,
      case: { select: { id: true, clientId: true, caseNumber: true, title: true } },
      requestedByOrganizationPerson: {
        select: { id: true, name: true, jobTitle: true, organizationGroupId: true, organizationGroup: { select: { id: true, name: true } } },
      },
      workPackageItem: { select: { caseWorkPackage: { select: { caseId: true, case: { select: { id: true, clientId: true } } } } } },
    },
  },
} satisfies Prisma.TimeEntryInclude;

type SourceEntry = Prisma.TimeEntryGetPayload<{ include: typeof sourceEntryInclude }>;

/** Deterministic fingerprint of every financially relevant source field/relation. */
export function sourceFingerprint(entry: SourceEntry): string {
  const requester = entry.task?.requestedByOrganizationPerson ?? null;
  const payload = {
    attributionSource: 'v1',
    workDate: billingDate(entry.workDate),
    minutes: entry.minutes,
    billable: entry.billable,
    description: entry.description ?? null,
    workType: entry.workType,
    userId: entry.userId,
    matterId: entry.matterId ?? null,
    caseId: entry.caseId ?? null,
    taskId: entry.taskId ?? null,
    departmentId: entry.departmentId ?? null,
    task: entry.task
      ? {
          caseId: entry.task.caseId,
          matterId: entry.task.matterId ?? null,
          workPackageCaseId: entry.task.workPackageItem?.caseWorkPackage?.caseId ?? null,
          requestedByOrganizationPersonId: entry.task.requestedByOrganizationPersonId ?? null,
        }
      : null,
    requester: requester ? { id: requester.id, organizationGroupId: requester.organizationGroupId ?? null } : null,
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/** Which client owns the entry under authoritative attribution (cross-client guard). */
export function entryClientId(entry: SourceEntry): string | null {
  const { resolvedCaseId } = resolveTimeEntryAttribution(entry);
  if (resolvedCaseId) {
    if (entry.case?.id === resolvedCaseId) return entry.case.clientId;
    if (entry.task?.case?.id === resolvedCaseId) return entry.task.case.clientId;
    const inMatter = entry.matter?.cases?.find((row) => row.id === resolvedCaseId);
    return inMatter?.clientId ?? null;
  }
  return entry.matter?.clientId ?? null;
}

type ResolvedCaseSnapshot = { id: string; caseNumber: string | null; title: string | null } | null;
function resolvedCaseSnapshot(entry: SourceEntry, resolvedCaseId: string | null): ResolvedCaseSnapshot {
  if (!resolvedCaseId) return null;
  if (entry.case?.id === resolvedCaseId) return { id: entry.case.id, caseNumber: entry.case.caseNumber, title: entry.case.title };
  if (entry.task?.case?.id === resolvedCaseId) return { id: entry.task.case.id, caseNumber: entry.task.case.caseNumber, title: entry.task.case.title };
  const inMatter = entry.matter?.cases?.find((row) => row.id === resolvedCaseId);
  return inMatter ? { id: inMatter.id, caseNumber: inMatter.caseNumber, title: inMatter.title } : null;
}

/** Billing review is monetary data: same sensitivity class as rate management. */
export async function requireBillingReviewer(actor: InternalActor, db: Db = prisma): Promise<void> {
  const user = await db.user.findUnique({ where: { id: actor.userId }, select: { role: true, status: true, isActive: true } });
  if (!user || !user.isActive || user.status !== 'ACTIVE' || ![ROLES.ADMIN, ROLES.PARTNER].includes(user.role)) {
    fail(403, 'BILLING_ACCESS_FORBIDDEN', 'A számlázási előkészítést csak aktív adminisztrátor vagy partner érheti el.');
  }
}

type LiveSource = { exists: boolean; fingerprint: string | null };

export function deriveReviewStatus(
  item: Pick<BillingPreparationItem, 'attributionKind' | 'hourlyRate' | 'rateOverride' | 'sourceBillable' | 'sourceMinutes' | 'billingMinutes' | 'reviewedAt' | 'sourceFingerprint'>,
  live: LiveSource,
): BillingReviewStatus {
  if (!live.exists) return 'SOURCE_MISSING';
  if (live.fingerprint !== item.sourceFingerprint) return 'STALE';
  if (REVIEW_REQUIRED_ATTRIBUTIONS.has(item.attributionKind) && !item.reviewedAt) return 'REVIEW_REQUIRED';
  if (item.hourlyRate === null && item.rateOverride === null) return 'NO_RATE';
  if (!item.sourceBillable && !item.reviewedAt) return 'NON_BILLABLE';
  if (item.sourceMinutes === 0 || item.billingMinutes === 0) return 'ZERO_MINUTES';
  return 'OK';
}

async function loadSources(ids: string[], db: Db): Promise<Map<string, SourceEntry>> {
  if (ids.length === 0) return new Map();
  const rows = await db.timeEntry.findMany({ where: { id: { in: ids } }, include: sourceEntryInclude });
  return new Map(rows.map((row) => [row.id, row]));
}

const decimal4 = (value: Prisma.Decimal | null): string | null => (value === null ? null : value.toFixed(4));
const decimal2 = (value: Prisma.Decimal | null): string | null => (value === null ? null : value.toFixed(2));

function effectiveRate(item: Pick<BillingPreparationItem, 'hourlyRate' | 'rateOverride'>): Prisma.Decimal | null {
  return item.rateOverride ?? item.hourlyRate ?? null;
}

function itemDto(item: BillingPreparationItem, status: BillingReviewStatus) {
  return {
    id: item.id,
    sourceTimeEntryId: item.sourceTimeEntryId,
    reviewStatus: status,
    attributionKind: item.attributionKind,
    source: {
      workDate: item.sourceWorkDate.toISOString().slice(0, 10),
      minutes: item.sourceMinutes,
      billable: item.sourceBillable,
      description: item.sourceDescription,
      workType: item.sourceWorkType,
      worker: { id: item.workerId, name: item.workerName },
      case: item.caseId ? { id: item.caseId, caseNumber: item.caseNumber, title: item.caseTitle } : null,
      task: item.taskId ? { id: item.taskId, title: item.taskTitle } : null,
      requester: item.requesterId ? { id: item.requesterId, name: item.requesterName, jobTitle: item.requesterJobTitle } : null,
      organizationGroup: item.organizationGroupId ? { id: item.organizationGroupId, name: item.organizationGroupName } : null,
      department: item.departmentId ? { id: item.departmentId, name: item.departmentName } : null,
    },
    rate: {
      rateVersionId: item.rateVersionId,
      scope: item.rateScope,
      hourlyRate: decimal4(item.hourlyRate),
      currency: item.rateCurrency,
    },
    billing: {
      included: item.included,
      billingMinutes: item.billingMinutes,
      invoiceDescription: item.invoiceDescription,
      rateOverride: decimal4(item.rateOverride),
      rateOverrideReason: item.rateOverrideReason,
      rateOverrideById: item.rateOverrideById,
      rateOverrideAt: item.rateOverrideAt?.toISOString() ?? null,
      adjustmentReason: item.adjustmentReason,
      reviewedAt: item.reviewedAt?.toISOString() ?? null,
      reviewedById: item.reviewedById,
      effectiveHourlyRate: decimal4(effectiveRate(item)),
      netAmount: decimal2(item.netAmount),
    },
  };
}

function preparationDto(prep: BillingPreparation & { client?: { name: string } | null }) {
  return {
    id: prep.id,
    clientId: prep.clientId,
    clientName: prep.client?.name ?? null,
    periodStart: prep.periodStart.toISOString().slice(0, 10),
    periodEnd: prep.periodEnd.toISOString().slice(0, 10),
    currency: prep.currency,
    calculationPolicyVersion: prep.calculationPolicyVersion,
    status: prep.status,
    createdAt: prep.createdAt.toISOString(),
    createdById: prep.createdById,
    closedAt: prep.closedAt?.toISOString() ?? null,
    closedById: prep.closedById ?? null,
  };
}

async function resolveEntryRate(clientId: string, resolvedCaseId: string | null, workDate: Date, db: Db) {
  return resolveHourlyRate({ clientId, caseId: resolvedCaseId, workDate }, db);
}

async function buildItemData(entry: SourceEntry, clientId: string, preparationId: string, db: Db) {
  const { attributionKind, resolvedCaseId } = resolveTimeEntryAttribution(entry);
  const resolved = resolvedCaseSnapshot(entry, resolvedCaseId);
  const requester = entry.task?.requestedByOrganizationPerson ?? null;
  const rate = await resolveEntryRate(clientId, resolvedCaseId, entry.workDate, db);
  const capturedRate = rate.status === 'RESOLVED' && rate.hourlyRate ? new Prisma.Decimal(rate.hourlyRate) : null;
  const minutes = entry.minutes;
  const needsReview = REVIEW_REQUIRED_ATTRIBUTIONS.has(attributionKind);
  const included = entry.billable && minutes > 0 && !needsReview && capturedRate !== null;
  return {
    preparationId,
    sourceTimeEntryId: entry.id,
    sourceFingerprint: sourceFingerprint(entry),
    sourceWorkDate: parseRateDate(billingDate(entry.workDate)),
    sourceMinutes: minutes,
    sourceBillable: entry.billable,
    sourceDescription: entry.description ?? null,
    sourceWorkType: entry.workType,
    workerId: entry.userId,
    workerName: entry.user?.name ?? null,
    caseId: resolved?.id ?? null,
    caseNumber: resolved?.caseNumber ?? null,
    caseTitle: resolved?.title ?? null,
    taskId: entry.taskId ?? null,
    taskTitle: entry.task?.title ?? null,
    requesterId: requester?.id ?? null,
    requesterName: requester?.name ?? null,
    requesterJobTitle: requester?.jobTitle ?? null,
    organizationGroupId: requester?.organizationGroup?.id ?? null,
    organizationGroupName: requester?.organizationGroup?.name ?? null,
    departmentId: entry.departmentId ?? null,
    departmentName: entry.department?.name ?? null,
    attributionKind,
    rateVersionId: rate.rateVersionId,
    rateScope: rate.status === 'RESOLVED' ? rate.scope : 'UNRESOLVED',
    hourlyRate: capturedRate,
    rateCurrency: rate.status === 'RESOLVED' ? rate.currency : null,
    included,
    billingMinutes: minutes,
    netAmount: netAmountForMinutes(minutes, capturedRate),
  };
}

/** Eligible sources: entries in the inclusive Budapest-day period owned by the client. */
async function eligibleEntries(clientId: string, start: Date, end: Date, startIso: string, endIso: string, db: Db): Promise<SourceEntry[]> {
  const windowStart = new Date(start.getTime() - DAY_MS);
  const windowEnd = new Date(end.getTime() + 2 * DAY_MS);
  const candidates = await db.timeEntry.findMany({
    where: {
      workDate: { gte: windowStart, lte: windowEnd },
      OR: [
        { matter: { clientId } },
        { case: { clientId } },
        { task: { case: { clientId } } },
        { task: { workPackageItem: { caseWorkPackage: { case: { clientId } } } } },
      ],
    },
    include: sourceEntryInclude,
    orderBy: [{ workDate: 'asc' }, { id: 'asc' }],
  });
  return candidates.filter((entry) => {
    const day = billingDate(entry.workDate);
    return day >= startIso && day <= endIso && entryClientId(entry) === clientId;
  });
}

async function openPreparation(clientId: string, start: Date, end: Date, db: Db) {
  return db.billingPreparation.findFirst({
    where: { clientId, periodStart: start, periodEnd: end, status: 'OPEN' },
    include: { client: { select: { name: true } } },
  });
}

export async function createPreparation(actor: InternalActor, body: unknown, db: Db = prisma) {
  await requireBillingReviewer(actor, db);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'BILLING_PREP_INPUT_INVALID', 'Érvénytelen előkészítési adatok.');
  const input = body as Record<string, unknown>;
  const clientId = typeof input.clientId === 'string' ? input.clientId : '';
  if (!clientId) return fail(400, 'CLIENT_NOT_FOUND', 'Az ügyfél kötelező.');
  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!client) return fail(404, 'CLIENT_NOT_FOUND', 'Az ügyfél nem található.');
  const start = parseRateDate(input.periodStart);
  const end = parseRateDate(input.periodEnd);
  if (end.getTime() < start.getTime()) return fail(400, 'BILLING_PREP_PERIOD_INVALID', 'A zárónap nem lehet korábbi a kezdőnapnál.');

  const existing = await openPreparation(clientId, start, end, db);
  if (existing) return { created: false, preparation: preparationDto(existing) };

  const entries = await eligibleEntries(clientId, start, end, input.periodStart as string, input.periodEnd as string, db);
  try {
    const preparation = await withTransaction(db, async (tx) => {
      const created = await tx.billingPreparation.create({
        data: {
          clientId,
          periodStart: start,
          periodEnd: end,
          currency: BILLING_CURRENCY,
          calculationPolicyVersion: CALCULATION_POLICY_VERSION,
          createdById: actor.userId,
        },
        include: { client: { select: { name: true } } },
      });
      for (const entry of entries) {
        await tx.billingPreparationItem.create({ data: await buildItemData(entry, clientId, created.id, tx) });
      }
      return created;
    });
    return { created: true, preparation: preparationDto(preparation), itemCount: entries.length };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const raced = await openPreparation(clientId, start, end, db);
      if (raced) return { created: false, preparation: preparationDto(raced) };
    }
    throw error;
  }
}

export async function listPreparations(actor: InternalActor, clientId: string, db: Db = prisma) {
  await requireBillingReviewer(actor, db);
  if (!clientId) return fail(400, 'CLIENT_NOT_FOUND', 'Az ügyfél kötelező.');
  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) return fail(404, 'CLIENT_NOT_FOUND', 'Az ügyfél nem található.');
  const rows = await db.billingPreparation.findMany({
    where: { clientId },
    include: { client: { select: { name: true } }, items: { select: { included: true, billingMinutes: true, netAmount: true } } },
    orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
  });
  return rows.map((prep) => {
    let includedMinutes = 0;
    let includedNet = new Prisma.Decimal(0);
    for (const item of prep.items) {
      if (item.included && item.netAmount !== null) {
        includedMinutes += item.billingMinutes;
        includedNet = includedNet.plus(item.netAmount);
      }
    }
    return {
      ...preparationDto(prep),
      itemCount: prep.items.length,
      includedMinutes,
      includedNetAmount: includedNet.toFixed(2),
    };
  });
}

async function requirePreparation(id: string, db: Db) {
  const prep = await db.billingPreparation.findUnique({
    where: { id },
    include: { client: { select: { name: true } }, items: { orderBy: [{ sourceWorkDate: 'asc' }, { id: 'asc' }] } },
  });
  if (!prep) return fail(404, 'BILLING_PREP_NOT_FOUND', 'A számlázási előkészítés nem található.');
  return prep;
}

function persistedIncludedSummary(items: BillingPreparationItem[]) {
  let includedMinutes = 0;
  let includedNetAmount = new Prisma.Decimal(0);
  for (const item of items) {
    if (!item.included) continue;
    includedMinutes += item.billingMinutes;
    if (item.netAmount !== null) includedNetAmount = includedNetAmount.plus(item.netAmount);
  }
  return { includedMinutes, includedNetAmount: includedNetAmount.toFixed(2) };
}

/** PDF export is intentionally a closed, immutable representation of stored preparation snapshots. */
export async function getPreparationPdf(actor: InternalActor, id: string, db: Db = prisma): Promise<Buffer> {
  await requireBillingReviewer(actor, db);
  const preparation = await requirePreparation(id, db);
  if (preparation.status !== 'CLOSED') {
    return fail(409, 'BILLING_PREP_PDF_REQUIRES_CLOSED', 'PDF csak lezárt számlázási előkészítéshez tölthető le.');
  }
  return renderBillingPreparationPdf(preparation, persistedIncludedSummary(preparation.items));
}

export async function getPreparation(actor: InternalActor, id: string, db: Db = prisma) {
  await requireBillingReviewer(actor, db);
  const prep = await requirePreparation(id, db);
  const sources = await loadSources(prep.items.map((item) => item.sourceTimeEntryId), db);
  const summary = {
    currency: prep.currency,
    itemCount: prep.items.length,
    includedMinutes: 0,
    excludedMinutes: 0,
    includedNetAmount: new Prisma.Decimal(0),
    reviewRequiredCount: 0,
    noRateCount: 0,
    staleCount: 0,
    nonBillableCount: 0,
  };
  const items = prep.items.map((item) => {
    const source = sources.get(item.sourceTimeEntryId);
    const status = deriveReviewStatus(item, { exists: Boolean(source), fingerprint: source ? sourceFingerprint(source) : null });
    if (status === 'REVIEW_REQUIRED') summary.reviewRequiredCount += 1;
    if (status === 'NO_RATE') summary.noRateCount += 1;
    if (status === 'STALE' || status === 'SOURCE_MISSING') summary.staleCount += 1;
    if (status === 'NON_BILLABLE') summary.nonBillableCount += 1;
    if (item.included) {
      summary.includedMinutes += item.billingMinutes;
      if (item.netAmount !== null) summary.includedNetAmount = summary.includedNetAmount.plus(item.netAmount);
    } else {
      summary.excludedMinutes += item.billingMinutes;
    }
    return itemDto(item, status);
  });
  return {
    preparation: preparationDto(prep),
    summary: { ...summary, includedNetAmount: summary.includedNetAmount.toFixed(2) },
    items,
    canManage: true,
  };
}

export type ItemPatchInput = {
  included?: boolean;
  billingMinutes?: number;
  invoiceDescription?: string | null;
  rateOverride?: string | null;
  rateOverrideReason?: string | null;
  adjustmentReason?: string | null;
  markReviewed?: boolean;
};

function optionalText(value: unknown, code: string, message: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return fail(400, code, message);
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export async function patchItem(actor: InternalActor, preparationId: string, itemId: string, body: unknown, db: Db = prisma) {
  await requireBillingReviewer(actor, db);
  const prep = await requirePreparation(preparationId, db);
  if (prep.status !== 'OPEN') return fail(409, 'BILLING_PREP_CLOSED', 'A lezárt előkészítés nem módosítható.');
  const item = await db.billingPreparationItem.findFirst({ where: { id: itemId, preparationId } });
  if (!item) return fail(404, 'BILLING_ITEM_NOT_FOUND', 'A sor nem található.');
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'BILLING_ITEM_INPUT_INVALID', 'Érvénytelen soradatok.');
  const input = body as Record<string, unknown>;
  const allowed = ['included', 'billingMinutes', 'invoiceDescription', 'rateOverride', 'rateOverrideReason', 'adjustmentReason', 'markReviewed'];
  if (Object.keys(input).some((key) => !allowed.includes(key))) return fail(400, 'BILLING_ITEM_INPUT_INVALID', 'Nem támogatott mező.');

  const source = (await loadSources([item.sourceTimeEntryId], db)).get(item.sourceTimeEntryId) ?? null;
  const live: LiveSource = { exists: Boolean(source), fingerprint: source ? sourceFingerprint(source) : null };

  const next = {
    included: item.included,
    billingMinutes: item.billingMinutes,
    invoiceDescription: item.invoiceDescription,
    rateOverride: item.rateOverride,
    rateOverrideReason: item.rateOverrideReason,
    rateOverrideById: item.rateOverrideById,
    rateOverrideAt: item.rateOverrideAt,
    adjustmentReason: item.adjustmentReason,
    reviewedAt: item.reviewedAt,
    reviewedById: item.reviewedById,
  };

  const invoiceDescription = optionalText(input.invoiceDescription, 'BILLING_ITEM_INPUT_INVALID', 'Érvénytelen tételszöveg.');
  if (invoiceDescription !== undefined) next.invoiceDescription = invoiceDescription;
  const adjustmentReason = optionalText(input.adjustmentReason, 'BILLING_ITEM_INPUT_INVALID', 'Érvénytelen indoklás.');
  if (adjustmentReason !== undefined) next.adjustmentReason = adjustmentReason;
  const overrideReason = optionalText(input.rateOverrideReason, 'BILLING_ITEM_INPUT_INVALID', 'Érvénytelen indoklás.');
  if (overrideReason !== undefined) next.rateOverrideReason = overrideReason;

  if (input.billingMinutes !== undefined) {
    const value = input.billingMinutes;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      return fail(400, 'BILLING_MINUTES_INVALID', 'A számlázott idő nemnegatív egész perc.');
    }
    if (value > item.sourceMinutes) {
      return fail(400, 'BILLING_MINUTES_UPWARD_FORBIDDEN', 'A számlázott idő nem haladhatja meg a rögzített időt. Javítsa a munkaóra-tételt.');
    }
    next.billingMinutes = value;
  }

  // Post-merge invariant (mirrors billing_prep_item_minutes_writedown):
  // any write-down — whether by minutes change or by clearing an existing
  // reason — must carry a non-blank adjustment reason.
  if (next.billingMinutes < item.sourceMinutes && !(next.adjustmentReason && next.adjustmentReason.trim().length > 0)) {
    return fail(400, 'BILLING_MINUTES_REASON_REQUIRED', 'Az idő csökkentéséhez indoklás szükséges.');
  }

  if (input.rateOverride !== undefined) {
    if (input.rateOverride === null) {
      next.rateOverride = null;
      next.rateOverrideReason = null;
      next.rateOverrideById = null;
      next.rateOverrideAt = null;
    } else {
      if (typeof input.rateOverride !== 'string' || !RATE_INPUT_PATTERN.test(input.rateOverride)) {
        return fail(400, 'RATE_AMOUNT_INVALID', 'Az egyedi számlázási óradíj pozitív decimális szöveg, legfeljebb négy tizedesjeggyel.');
      }
      const override = new Prisma.Decimal(input.rateOverride);
      if (!override.isPositive() || override.isZero()) return fail(400, 'RATE_AMOUNT_INVALID', 'Az óradíjnak nullánál nagyobbnak kell lennie.');
      const reason = next.rateOverrideReason ?? item.rateOverrideReason;
      if (!reason) return fail(400, 'RATE_OVERRIDE_REASON_REQUIRED', 'Az egyedi óradíjhoz indoklás szükséges.');
      next.rateOverride = override;
      next.rateOverrideReason = reason;
      next.rateOverrideById = actor.userId;
      next.rateOverrideAt = new Date();
    }
  }

  if (input.markReviewed === true) {
    next.reviewedAt = new Date();
    next.reviewedById = actor.userId;
  }

  if (input.included !== undefined) {
    if (typeof input.included !== 'boolean') return fail(400, 'BILLING_ITEM_INPUT_INVALID', 'Érvénytelen beállítás.');
    next.included = input.included;
  }

  const merged = { ...item, ...next };
  const status = deriveReviewStatus(merged, live);
  if (merged.included && status !== 'OK') {
    const labels: Record<BillingReviewStatus, string> = {
      SOURCE_MISSING: 'A forrás munkaóra-tétel már nem létezik.',
      STALE: 'A forrás megváltozott — először frissítse a sort.',
      REVIEW_REQUIRED: 'A sor felülvizsgálatot igényel az attribúció miatt.',
      NO_RATE: 'Nincs alkalmazható óradíj — adjon meg egyedi számlázási óradíjat vagy állítson be óradíjat.',
      NON_BILLABLE: 'A tétel nem számlázható jelölésű — előbb hagyja jóvá.',
      ZERO_MINUTES: 'Nulla perc nem számlázható.',
      OK: '',
    };
    return fail(409, 'BILLING_ITEM_NOT_INCLUDABLE', labels[status]);
  }

  const updated = await db.billingPreparationItem.update({
    where: { id: item.id },
    data: {
      ...next,
      netAmount: netAmountForMinutes(next.billingMinutes, effectiveRate(merged)),
      updatedById: actor.userId,
    },
  });
  return itemDto(updated, status);
}

/** Explicit source resync: re-capture facts + fingerprint + rate, keep adjustments, force re-review. */
export async function resyncItem(actor: InternalActor, preparationId: string, itemId: string, db: Db = prisma) {
  await requireBillingReviewer(actor, db);
  const prep = await requirePreparation(preparationId, db);
  if (prep.status !== 'OPEN') return fail(409, 'BILLING_PREP_CLOSED', 'A lezárt előkészítés nem módosítható.');
  const item = await db.billingPreparationItem.findFirst({ where: { id: itemId, preparationId } });
  if (!item) return fail(404, 'BILLING_ITEM_NOT_FOUND', 'A sor nem található.');
  const source = (await loadSources([item.sourceTimeEntryId], db)).get(item.sourceTimeEntryId) ?? null;
  if (!source) {
    return { resynced: false, reason: 'SOURCE_MISSING', item: itemDto(item, 'SOURCE_MISSING') };
  }
  const rebuilt = await buildItemData(source, prep.clientId, preparationId, db);
  const clampedMinutes = Math.min(item.billingMinutes, rebuilt.sourceMinutes);
  // Resync may leave billingMinutes < sourceMinutes: the DB write-down CHECK
  // requires a non-blank reason, so keep the existing one or record the sync.
  const resyncedReason = clampedMinutes < rebuilt.sourceMinutes && !(item.adjustmentReason && item.adjustmentReason.trim())
    ? 'A forrás munkaóra megváltozott — korábbi számlázási beállítás megőrizve.'
    : item.adjustmentReason;
  const merged = { ...item, rateOverride: item.rateOverride, hourlyRate: rebuilt.hourlyRate };
  const net = netAmountForMinutes(clampedMinutes, effectiveRate(merged));
  const statusAfter = deriveReviewStatus(
    { ...merged, sourceFingerprint: rebuilt.sourceFingerprint, attributionKind: rebuilt.attributionKind, sourceBillable: rebuilt.sourceBillable, sourceMinutes: rebuilt.sourceMinutes, billingMinutes: clampedMinutes, reviewedAt: null },
    { exists: true, fingerprint: rebuilt.sourceFingerprint },
  );
  const updated = await db.billingPreparationItem.update({
    where: { id: item.id },
    data: {
      sourceFingerprint: rebuilt.sourceFingerprint,
      sourceWorkDate: rebuilt.sourceWorkDate,
      sourceMinutes: rebuilt.sourceMinutes,
      sourceBillable: rebuilt.sourceBillable,
      sourceDescription: rebuilt.sourceDescription,
      sourceWorkType: rebuilt.sourceWorkType,
      workerId: rebuilt.workerId,
      workerName: rebuilt.workerName,
      caseId: rebuilt.caseId,
      caseNumber: rebuilt.caseNumber,
      caseTitle: rebuilt.caseTitle,
      taskId: rebuilt.taskId,
      taskTitle: rebuilt.taskTitle,
      requesterId: rebuilt.requesterId,
      requesterName: rebuilt.requesterName,
      requesterJobTitle: rebuilt.requesterJobTitle,
      organizationGroupId: rebuilt.organizationGroupId,
      organizationGroupName: rebuilt.organizationGroupName,
      departmentId: rebuilt.departmentId,
      departmentName: rebuilt.departmentName,
      attributionKind: rebuilt.attributionKind,
      rateVersionId: rebuilt.rateVersionId,
      rateScope: rebuilt.rateScope,
      hourlyRate: rebuilt.hourlyRate,
      rateCurrency: rebuilt.rateCurrency,
      billingMinutes: clampedMinutes,
      adjustmentReason: resyncedReason,
      reviewedAt: null,
      reviewedById: null,
      included: item.included && statusAfter === 'OK',
      netAmount: net,
      updatedById: actor.userId,
    },
  });
  return { resynced: true, minutesClamped: clampedMinutes !== item.billingMinutes, item: itemDto(updated, statusAfter) };
}

/** Explicit workspace refresh: resync stale items and add newly eligible sources. */
export async function refreshPreparation(actor: InternalActor, preparationId: string, db: Db = prisma) {
  await requireBillingReviewer(actor, db);
  const prep = await requirePreparation(preparationId, db);
  if (prep.status !== 'OPEN') return fail(409, 'BILLING_PREP_CLOSED', 'A lezárt előkészítés nem módosítható.');
  const startIso = prep.periodStart.toISOString().slice(0, 10);
  const endIso = prep.periodEnd.toISOString().slice(0, 10);
  const sources = await loadSources(prep.items.map((item) => item.sourceTimeEntryId), db);
  let resynced = 0;
  let stillMissing = 0;
  for (const item of prep.items) {
    const source = sources.get(item.sourceTimeEntryId);
    if (!source) { stillMissing += 1; continue; }
    if (sourceFingerprint(source) === item.sourceFingerprint) continue;
    await resyncItem(actor, preparationId, item.id, db);
    resynced += 1;
  }
  const existing = new Set(prep.items.map((item) => item.sourceTimeEntryId));
  const eligible = await eligibleEntries(prep.clientId, prep.periodStart, prep.periodEnd, startIso, endIso, db);
  let added = 0;
  for (const entry of eligible) {
    if (existing.has(entry.id)) continue;
    await db.billingPreparationItem.create({ data: await buildItemData(entry, prep.clientId, prep.id, db) });
    added += 1;
  }
  return { resynced, added, stillMissing };
}

export async function setPreparationStatus(actor: InternalActor, preparationId: string, status: 'CLOSED' | 'OPEN', db: Db = prisma) {
  await requireBillingReviewer(actor, db);
  const prep = await requirePreparation(preparationId, db);
  if (prep.status === status) return { preparation: preparationDto(prep) };
  if (status === 'CLOSED') {
    // Close must re-derive live source status: an included row that went STALE
    // or SOURCE_MISSING since review must block closing. Excluded rows are an
    // explicit billing decision and never block. Nothing is refreshed here.
    const sources = await loadSources(prep.items.map((item) => item.sourceTimeEntryId), db);
    const blockers = prep.items.filter((item) => {
      if (!item.included) return false;
      const source = sources.get(item.sourceTimeEntryId);
      return deriveReviewStatus(item, { exists: Boolean(source), fingerprint: source ? sourceFingerprint(source) : null }) !== 'OK';
    });
    if (blockers.length > 0) {
      return fail(409, 'BILLING_PREP_CLOSE_BLOCKED', `${blockers.length} szerepelt sor forrása megváltozott vagy felülvizsgálatra vár. Frissítse vagy zárja ki a sort.`);
    }
  } else {
    // A closed preparation that already produced an invoice-draft snapshot must
    // not be reopened underneath it — the user must discard the draft first.
    const draft = await db.invoiceDraft.findUnique({ where: { billingPreparationId: preparationId }, select: { id: true } });
    if (draft) {
      return fail(409, 'BILLING_PREP_INVOICE_DRAFT_EXISTS', 'Az előkészítéshez már tartozik számlatervezet. Az újranyitás előtt vesse el a számlatervezetet.');
    }
  }
  try {
    const updated = await db.billingPreparation.update({
      where: { id: preparationId },
      data: status === 'CLOSED'
        ? { status: 'CLOSED', closedAt: new Date(), closedById: actor.userId }
        : { status: 'OPEN', closedAt: null, closedById: null },
      include: { client: { select: { name: true } } },
    });
    return { preparation: preparationDto(updated) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return fail(409, 'BILLING_PREP_OPEN_EXISTS', 'Ehhez az ügyfélhez és időszakhoz már létezik nyitott előkészítés.');
    }
    throw error;
  }
}
