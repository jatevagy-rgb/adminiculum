/**
 * INTERNAL_WORKFLOW_SLICE_3 — CASE CLOSURE GATE (truthful closure after the
 * Leadás / review workflow). Focused behavioural tests without a database.
 *
 * Locks, in order:
 *   1. an open required task blocks an ordinary close;
 *   2. a SUBMITTED submission awaiting decision blocks;
 *   3. a RETURNED submission awaiting correction blocks;
 *   4. an active required DocumentReview blocks;
 *   5. an unresolved BLOCKING review point blocks;
 *   6. an output role alone does not require formal review; an operative
 *      output under active exact-version review retains its blocker;
 *   7. a completed required review (nothing outstanding) permits close;
 *   8. a zero-recorded-time case still closes (warning, never a blocker);
 *   9. incomplete billing preparation does NOT block (warning only);
 *  10. absent client publication does NOT block (warning only);
 *  11. force close stays exceptional: manager-only, cancels work as CANCELLED
 *      (never approved), keeps the audit trail;
 *  12. reopen preserves history and clears completedAt;
 *  13. archive preserves records and is retention-only;
 *  14. a review that becomes active between the pre-check and the write fails
 *      the close safely (in-transaction re-check, best-effort — no
 *      transactional serialization is claimed).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const prismaDouble: any = {};

jest.mock('../src/prisma/prisma.service', () => ({ prisma: prismaDouble }));

import {
  closeCase,
  reopenCase,
  archiveCase,
  LifecycleServiceError,
} from '../src/modules/cases/lifecycleService';

interface Counts {
  open: number;
  overdue: number;
  review: number;
  handoff: number;
  deadline: number;
  submitted: number;
  returned: number;
  externalPending: number;
  activeDocReviews: number;
  approvedReviews: number;
  blockingPoints: number;
  approvedVersionIds: string[];
  requiredOutputVersionIds: string[];
  formalReviewVersionIds: string[];
  recorded: number;
  billable: number;
  closedItems: number;
  closedItemsWithoutInvoice: number;
  publishedDocs: number;
  cancelledTaskSubmitted: number;
  cancelledTaskReturned: number;
  cancelledTaskExternalPending: number;
}

const counts: Counts = {
  open: 0,
  overdue: 0,
  review: 0,
  handoff: 0,
  deadline: 0,
  submitted: 0,
  returned: 0,
  externalPending: 0,
  activeDocReviews: 0,
  approvedReviews: 0,
  blockingPoints: 0,
  approvedVersionIds: [],
  requiredOutputVersionIds: [],
  formalReviewVersionIds: [],
  recorded: 5,
  billable: 0,
  closedItems: 0,
  closedItemsWithoutInvoice: 0,
  publishedDocs: 0,
  cancelledTaskSubmitted: 0,
  cancelledTaskReturned: 0,
  cancelledTaskExternalPending: 0,
};

function resetCounts(overrides: Partial<Counts> = {}) {
  Object.assign(counts, {
    open: 0,
    overdue: 0,
    review: 0,
    handoff: 0,
    deadline: 0,
    submitted: 0,
    returned: 0,
    externalPending: 0,
    activeDocReviews: 0,
    approvedReviews: 0,
    blockingPoints: 0,
    approvedVersionIds: [],
    requiredOutputVersionIds: [],
    formalReviewVersionIds: [],
    recorded: 5,
    billable: 0,
    closedItems: 0,
    closedItemsWithoutInvoice: 0,
    publishedDocs: 0,
    cancelledTaskSubmitted: 0,
    cancelledTaskReturned: 0,
    cancelledTaskExternalPending: 0,
  }, overrides);
}

const MANAGER = { userId: 'lawyer-1', role: 'LAWYER' };
const OUTSIDER = { userId: 'outsider-1', role: 'LAWYER' };

let caseRow: any;

beforeEach(() => {
  jest.clearAllMocks();
  resetCounts();

  caseRow = {
    id: 'case-1',
    status: 'IN_REVIEW',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    receivedAt: new Date('2026-01-01T00:00:00.000Z'),
    completedAt: null,
    updatedAt: new Date('2026-07-10T00:00:00.000Z'),
    assignedLawyerId: 'lawyer-1',
    createdById: 'creator-1',
    assignedLawyer: { id: 'lawyer-1', name: 'Felelős Ügyvéd' },
  };

  prismaDouble.case = {
    findUnique: jest.fn(async () => ({ ...caseRow, assignedLawyer: caseRow.assignedLawyer ? { ...caseRow.assignedLawyer } : null })),
    count: jest.fn(async () => counts.deadline),
    update: jest.fn(async (args: any) => {
      Object.assign(caseRow, args.data);
      return { ...caseRow };
    }),
  };
  prismaDouble.task = {
    count: jest.fn(async (args: any) => {
      const where = args?.where || {};
      if (where.dueDate) return counts.overdue;
      if (where.status?.in) return counts.review;
      return counts.open;
    }),
    updateMany: jest.fn(async () => {
      const cancelled = counts.open;
      counts.open = 0;
      return { count: cancelled };
    }),
  };
  prismaDouble.lawyerHandoffPackage = {
    count: jest.fn(async () => counts.handoff),
  };
  prismaDouble.taskSubmission = {
    count: jest.fn(async (args: any) => {
      const status = (args?.where || {}).status;
      const taskStatus = args?.where?.task?.status;
      const excludesCancelled = taskStatus?.not === 'CANCELLED' || (taskStatus?.notIn || []).includes('CANCELLED');
      if (status === 'SUBMITTED') return counts.submitted + (excludesCancelled ? 0 : counts.cancelledTaskSubmitted);
      if (status === 'RETURNED') return counts.returned + (excludesCancelled ? 0 : counts.cancelledTaskReturned);
      return counts.externalPending + (excludesCancelled ? 0 : counts.cancelledTaskExternalPending);
    }),
  };
  prismaDouble.documentReview = {
    count: jest.fn(async (args: any) => {
      if ((args?.where || {}).status === 'APPROVED') return counts.approvedReviews;
      return counts.activeDocReviews;
    }),
    findMany: jest.fn(async (args: any) =>
      args?.where?.status?.in
        ? counts.formalReviewVersionIds.map((id) => ({ documentId: 'doc-1', currentRound: { reviewVersionId: id } }))
        : counts.approvedVersionIds.map((id) => ({ approvedVersionId: id }))
    ),
  };
  prismaDouble.reviewPoint = {
    count: jest.fn(async () => counts.blockingPoints),
  };
  prismaDouble.taskSubmissionDocument = {
    findMany: jest.fn(async () =>
      counts.requiredOutputVersionIds.map((id) => ({ documentId: 'doc-1', documentVersionId: id, documentVersion: { documentId: 'doc-1' } }))
    ),
  };
  prismaDouble.timeEntry = {
    count: jest.fn(async (args: any) => ((args?.where || {}).billable ? counts.billable : counts.recorded)),
  };
  prismaDouble.billingPreparationItem = {
    count: jest.fn(async (args: any) => {
      const prep = (args?.where || {}).preparation || {};
      if ('invoiceDraft' in prep) return counts.closedItemsWithoutInvoice;
      return counts.closedItems;
    }),
  };
  prismaDouble.clientDocumentPublication = {
    count: jest.fn(async () => counts.publishedDocs),
  };
  prismaDouble.timelineEvent = { create: jest.fn(async () => ({ id: 'evt' })) };
  prismaDouble.$queryRaw = jest.fn(async () => [{ status: caseRow.status }]);
  prismaDouble.$transaction = jest.fn(async (fn: any) => fn(prismaDouble));
});

function blockerCodes(dto: any): string[] {
  return (dto.blockers || []).map((b: any) => b.code);
}
function warningCodes(dto: any): string[] {
  return (dto.warnings || []).map((w: any) => w.code);
}

describe('case closure gate — ordinary close', () => {
  it('1. blocks an ordinary close while a required task is open', async () => {
    resetCounts({ open: 1 });
    const error = await closeCase('case-1', MANAGER).catch((e: any) => e);
    expect(error).toBeInstanceOf(LifecycleServiceError);
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CLOSURE_BLOCKED');
    expect(blockerCodes({ blockers: error.blockers })).toContain('OPEN_TASKS');
    expect(prismaDouble.case.update).not.toHaveBeenCalled();
  });

  it('2. blocks close while a SUBMITTED submission awaits a decision', async () => {
    resetCounts({ submitted: 1 });
    const error = await closeCase('case-1', MANAGER).catch((e: any) => e);
    expect(error).toBeInstanceOf(LifecycleServiceError);
    expect(error.code).toBe('CLOSURE_BLOCKED');
    expect(blockerCodes({ blockers: error.blockers })).toContain('SUBMISSION_AWAITING_DECISION');
    expect(prismaDouble.case.update).not.toHaveBeenCalled();
  });

  it('3. blocks close while a RETURNED submission awaits correction', async () => {
    resetCounts({ returned: 1 });
    const error = await closeCase('case-1', MANAGER).catch((e: any) => e);
    expect(error.code).toBe('CLOSURE_BLOCKED');
    expect(blockerCodes({ blockers: error.blockers })).toContain('SUBMISSION_RETURNED_PENDING_CORRECTION');
    expect(prismaDouble.case.update).not.toHaveBeenCalled();
  });

  it('4. blocks close while an active required DocumentReview is in flight', async () => {
    resetCounts({ activeDocReviews: 1 });
    const error = await closeCase('case-1', MANAGER).catch((e: any) => e);
    expect(error.code).toBe('CLOSURE_BLOCKED');
    expect(blockerCodes({ blockers: error.blockers })).toContain('ACTIVE_DOCUMENT_REVIEW');
    expect(prismaDouble.case.update).not.toHaveBeenCalled();
  });

  it('5. blocks close while an unresolved BLOCKING review point exists', async () => {
    resetCounts({ activeDocReviews: 1, blockingPoints: 1 });
    const error = await closeCase('case-1', MANAGER).catch((e: any) => e);
    expect(error.code).toBe('CLOSURE_BLOCKED');
    expect(blockerCodes({ blockers: error.blockers })).toContain('UNRESOLVED_BLOCKING_REVIEW_POINT');
    expect(prismaDouble.case.update).not.toHaveBeenCalled();
  });

  it('6. does not invent formal review from an administrative primary output role', async () => {
    resetCounts({ requiredOutputVersionIds: ['ver-1'], approvedVersionIds: [] });
    const dto = await closeCase('case-1', MANAGER);
    expect(blockerCodes(dto)).not.toContain('LEGAL_OUTPUT_EXACT_VERSION_UNAPPROVED');
    expect(caseRow.status).toBe('FINAL');
    expect(caseRow.completedAt).not.toBeNull();
  });

  it('6b. retains the exact-version output blocker when formal review is active', async () => {
    resetCounts({ requiredOutputVersionIds: ['ver-1'], formalReviewVersionIds: ['ver-1'], activeDocReviews: 1 });
    const error = await closeCase('case-1', MANAGER).catch((e: any) => e);
    expect(blockerCodes({ blockers: error.blockers })).toContain('LEGAL_OUTPUT_EXACT_VERSION_UNAPPROVED');
    expect(blockerCodes({ blockers: error.blockers })).toContain('ACTIVE_DOCUMENT_REVIEW');
  });

  it('7. closes when nothing is outstanding and writes the audit event', async () => {
    const dto = await closeCase('case-1', MANAGER);
    expect(dto.status).toBe('FINAL');
    expect(caseRow.completedAt).not.toBeNull();
    expect(prismaDouble.case.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FINAL' }) })
    );
    const events = (prismaDouble.timelineEvent.create as jest.Mock).mock.calls.map((call) => call[0]);
    expect(events.some((event) => event.data.eventType === 'CASE_STATUS_CHANGED' && event.data.metadata.lifecycleAction === 'CLOSE')).toBe(true);
  });

  it('8. a zero-recorded-time case still closes (warning only)', async () => {
    resetCounts({ recorded: 0 });
    const dto = await closeCase('case-1', MANAGER);
    expect(dto.status).toBe('FINAL');
    expect(dto.closureReadiness.ready).toBe(true);
    expect(warningCodes(dto)).toContain('NO_RECORDED_TIME');
  });

  it('9. incomplete billing preparation does NOT block (warning only)', async () => {
    resetCounts({ billable: 3, closedItems: 1, closedItemsWithoutInvoice: 1 });
    const dto = await closeCase('case-1', MANAGER);
    expect(dto.status).toBe('FINAL');
    expect(warningCodes(dto)).toContain('BILLING_PREPARATION_NOT_CLOSED');
    expect(warningCodes(dto)).toContain('INVOICE_NOT_DRAFTED');
    expect(blockerCodes(dto)).toHaveLength(0);
  });

  it('10. absent client publication does NOT block (warning only, scoped to approved material)', async () => {
    resetCounts({ approvedReviews: 2, publishedDocs: 0 });
    const dto = await closeCase('case-1', MANAGER);
    expect(dto.status).toBe('FINAL');
    expect(warningCodes(dto)).toContain('CLIENT_PUBLICATION_ABSENT');

    caseRow.status = 'IN_REVIEW';
    caseRow.completedAt = null;
    resetCounts({ approvedReviews: 0, publishedDocs: 0 });
    const dtoWithoutApproved = await closeCase('case-1', MANAGER);
    expect(warningCodes(dtoWithoutApproved)).not.toContain('CLIENT_PUBLICATION_ABSENT');
  });
});

describe('case closure gate — force close', () => {
  it('11. force close remains exceptional: cancels work as CANCELLED (never approved) and keeps the audit', async () => {
    resetCounts({ open: 2, submitted: 1, activeDocReviews: 1, blockingPoints: 1 });
    const dto = await closeCase('case-1', MANAGER, { force: true });
    expect(dto.status).toBe('FINAL');
    expect(prismaDouble.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) })
    );
    const events = (prismaDouble.timelineEvent.create as jest.Mock).mock.calls.map((call) => call[0]);
    const cancelEvent = events.find((event) => event.data.metadata?.lifecycleAction === 'FORCE_CLOSE_CANCEL_TASKS');
    expect(cancelEvent).toBeTruthy();
    expect(cancelEvent.data.metadata.cancelledTaskCount).toBe(2);
    const closeEvent = events.find((event) => event.data.metadata?.lifecycleAction === 'CLOSE');
    expect(closeEvent.data.metadata.forced).toBe(true);
    // Cancelled work must never be recorded as completed/approved.
    expect(JSON.stringify(events)).not.toMatch(/status["']?\s*:\s*["'](DONE|COMPLETED)["']/);
  });

  it('11b. force close does NOT broaden authority: a non-manager is still forbidden', async () => {
    caseRow.assignedLawyerId = 'someone-else';
    caseRow.createdById = 'someone-else';
    await expect(closeCase('case-1', OUTSIDER, { force: true })).rejects.toMatchObject({
      statusCode: 403,
      code: 'CASE_MANAGE_FORBIDDEN',
    });
    expect(prismaDouble.case.update).not.toHaveBeenCalled();
    expect(prismaDouble.task.updateMany).not.toHaveBeenCalled();
  });
});

describe('case closure gate — reopen and archive', () => {
  beforeEach(() => {
    caseRow.status = 'FINAL';
    caseRow.completedAt = new Date('2026-07-13T10:00:00.000Z');
  });

  it('12. reopen preserves history, clears completedAt and never deletes anything', async () => {
    const dto = await reopenCase('case-1', MANAGER);
    expect(dto.status).toBe('IN_REVIEW');
    expect(caseRow.completedAt).toBeNull();
    expect(prismaDouble.case.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'IN_REVIEW', completedAt: null }) })
    );
    // The lifecycle surface defines no delete operations at all.
    const deleteCalls = Object.keys(prismaDouble)
      .filter((key) => key.endsWith('delete') || key.endsWith('deleteMany'))
      .map((key) => prismaDouble[key]);
    expect(deleteCalls).toHaveLength(0);
  });

  it('13. archive is retention-only and requires a closed state', async () => {
    const dto = await archiveCase('case-1', MANAGER);
    expect(dto.status).toBe('ARCHIVED');
    expect(prismaDouble.case.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ARCHIVED' }) })
    );

    jest.clearAllMocks();
    caseRow.status = 'IN_REVIEW';
    await expect(archiveCase('case-1', MANAGER)).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVALID_LIFECYCLE_TRANSITION',
    });
  });
});

describe('case closure gate — cancelled task history', () => {
  it('force-close then reopen allows ordinary close while cancelled submissions remain', async () => {
    resetCounts({ open: 1, cancelledTaskSubmitted: 1, cancelledTaskReturned: 1, cancelledTaskExternalPending: 1 });
    await closeCase('case-1', MANAGER, { force: true });
    expect(caseRow.status).toBe('FINAL');
    await reopenCase('case-1', MANAGER);
    expect(counts.cancelledTaskSubmitted).toBe(1);
    expect(counts.cancelledTaskReturned).toBe(1);
    expect(counts.cancelledTaskExternalPending).toBe(1);
    const dto = await closeCase('case-1', MANAGER);
    expect(dto.status).toBe('FINAL');
    expect(dto.blockers).toHaveLength(0);
  });
});

describe('case closure gate — close/review race', () => {
  it('14. fails the close safely when a required review becomes active between pre-check and write', async () => {
    // Pre-check passes: nothing outstanding.
    resetCounts({});
    // Between the pre-check and the transactional write a review becomes active.
    (prismaDouble.$transaction as jest.Mock).mockImplementationOnce(async (fn: any) => {
      counts.activeDocReviews = 1;
      return fn(prismaDouble);
    });
    await expect(closeCase('case-1', MANAGER)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CLOSURE_BLOCKED',
    });
    // The case write must never have happened.
    expect(prismaDouble.case.update).not.toHaveBeenCalled();
  });
});
