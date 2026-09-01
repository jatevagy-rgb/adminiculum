import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import { classifyTimeAttribution } from '../time-attribution/attribution';

/**
 * Billing PREPARATION (not accounting-system integration, not invoicing).
 *
 * Answers, for a Case and reporting window, how much billable / non-billable
 * work is safely attributable and ready for invoicing — reusing the canonical
 * time-attribution classifier and the persisted TimeEntry.billable flag. Only
 * EXACT_CASE and TASK_DERIVED_CASE time counts toward a Case; AMBIGUOUS /
 * MATTER_ONLY time is surfaced as "needs review" and is NEVER auto-billed.
 *
 * There is no rate/fee/invoice model in the schema, so this layer reports hours
 * with rateStatus=RATE_NOT_CONFIGURED and NEVER invents a monetary amount.
 * It is workforce-internal and must never be projected to a Client.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type BillingReadiness = 'READY_FOR_BILLING' | 'NO_BILLABLE_TIME' | 'CASE_SCOPE_UNRESOLVED';
export type RateStatus = 'RATE_NOT_CONFIGURED';

export type LawyerBillingBreakdown = {
  lawyerId: string;
  lawyerName: string | null;
  billableMinutes: number;
  nonBillableMinutes: number;
};

export type CaseBillingPreparation = {
  caseId: string;
  clientId: string | null;
  reportPeriod: { startDate: string | null; endDate: string | null };
  billableMinutes: number;
  nonBillableMinutes: number;
  /** AMBIGUOUS / MATTER_ONLY time — surfaced for review, never auto-billed. */
  needsReviewMinutes: number;
  /** Safely attributable = billable + non-billable (EXACT_CASE + TASK_DERIVED_CASE). */
  attributedMinutes: number;
  byLawyer: LawyerBillingBreakdown[];
  /** No rate model exists; hours are reported and no fee is ever invented. */
  rateStatus: RateStatus;
  feeEstimate: null;
  billingReadiness: BillingReadiness;
};

function emptyPreparation(caseId: string, clientId: string | null, startDate: string | null, endDate: string | null, readiness: BillingReadiness): CaseBillingPreparation {
  return {
    caseId,
    clientId,
    reportPeriod: { startDate, endDate },
    billableMinutes: 0,
    nonBillableMinutes: 0,
    needsReviewMinutes: 0,
    attributedMinutes: 0,
    byLawyer: [],
    rateStatus: 'RATE_NOT_CONFIGURED',
    feeEstimate: null,
    billingReadiness: readiness,
  };
}

export async function getCaseBillingPreparation(
  caseId: string,
  options: { startDate?: Date | null; endDate?: Date | null } = {},
  db: Db = prisma,
): Promise<CaseBillingPreparation | null> {
  const startIso = options.startDate ? options.startDate.toISOString() : null;
  const endIso = options.endDate ? options.endDate.toISOString() : null;

  const caseRecord = await db.case.findUnique({ where: { id: caseId }, select: { id: true, matterId: true, clientId: true } });
  if (!caseRecord) return null;
  if (!caseRecord.matterId) {
    return emptyPreparation(caseId, caseRecord.clientId ?? null, startIso, endIso, 'CASE_SCOPE_UNRESOLVED');
  }

  const matterCaseIds = (await db.case.findMany({ where: { matterId: caseRecord.matterId }, select: { id: true } })).map((row) => row.id);

  const workDateFilter: Prisma.DateTimeFilter = {};
  if (options.startDate) workDateFilter.gte = options.startDate;
  if (options.endDate) workDateFilter.lte = options.endDate;

  const entries = await db.timeEntry.findMany({
    where: {
      matterId: caseRecord.matterId,
      ...(options.startDate || options.endDate ? { workDate: workDateFilter } : {}),
    },
    select: {
      id: true,
      minutes: true,
      billable: true,
      userId: true,
      user: { select: { id: true, name: true } },
      matterId: true,
      task: {
        select: {
          caseId: true,
          matterId: true,
          workPackageItem: { select: { caseWorkPackage: { select: { caseId: true } } } },
        },
      },
    },
  });

  let billableMinutes = 0;
  let nonBillableMinutes = 0;
  let needsReviewMinutes = 0;
  const byLawyer = new Map<string, LawyerBillingBreakdown>();

  for (const entry of entries) {
    const kind = classifyTimeAttribution({
      caseId,
      matterId: caseRecord.matterId,
      matterCaseIds,
      task: entry.task
        ? {
            caseId: entry.task.caseId,
            matterId: entry.task.matterId,
            workPackageCaseId: entry.task.workPackageItem?.caseWorkPackage.caseId || null,
          }
        : null,
    });
    if (kind !== 'EXACT_CASE' && kind !== 'TASK_DERIVED_CASE') {
      needsReviewMinutes += entry.minutes;
      continue;
    }
    const lawyer = byLawyer.get(entry.userId) || { lawyerId: entry.userId, lawyerName: entry.user?.name ?? null, billableMinutes: 0, nonBillableMinutes: 0 };
    if (entry.billable) {
      billableMinutes += entry.minutes;
      lawyer.billableMinutes += entry.minutes;
    } else {
      nonBillableMinutes += entry.minutes;
      lawyer.nonBillableMinutes += entry.minutes;
    }
    byLawyer.set(entry.userId, lawyer);
  }

  return {
    caseId,
    clientId: caseRecord.clientId ?? null,
    reportPeriod: { startDate: startIso, endDate: endIso },
    billableMinutes,
    nonBillableMinutes,
    needsReviewMinutes,
    attributedMinutes: billableMinutes + nonBillableMinutes,
    byLawyer: Array.from(byLawyer.values()).sort((a, b) => b.billableMinutes - a.billableMinutes),
    rateStatus: 'RATE_NOT_CONFIGURED',
    feeEstimate: null,
    billingReadiness: billableMinutes > 0 ? 'READY_FOR_BILLING' : 'NO_BILLABLE_TIME',
  };
}
