const prismaMock = {
  case: { findMany: jest.fn() },
  taskSubmission: { findMany: jest.fn() },
};

jest.mock('../src/prisma/prisma.service', () => ({ prisma: prismaMock }));

import {
  deriveAssignedTaskResumeAction,
  getDashboardOperationalOverview,
} from '../src/modules/cases/dashboardOperational';

const now = new Date('2026-07-20T10:00:00.000Z');

function submission(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `submission-${status.toLowerCase()}`,
    status,
    createdById: 'user-1',
    submittedById: 'user-1',
    assignedReviewerId: 'reviewer-1',
    externalActionRequired: false,
    externalCompletedAt: null,
    ...overrides,
  };
}

function task(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `task-${status.toLowerCase()}`,
    title: `${status} task`,
    status,
    priority: 'MEDIUM',
    dueDate: null,
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    updatedAt: new Date('2026-07-19T10:00:00.000Z'),
    assignedToId: 'user-1',
    stuckReason: null,
    submissions: [],
    ...overrides,
  };
}

function caseRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    caseNumber: `CASE-${id}`,
    title: `Synthetic ${id}`,
    status: 'DRAFT',
    priority: 'MEDIUM',
    deadline: null,
    updatedAt: new Date('2026-07-19T10:00:00.000Z'),
    createdById: 'user-1',
    assignedLawyerId: 'user-1',
    client: { id: `client-${id}`, name: `Client ${id}`, colorKey: id === 'neutral' ? null : 'BLUE' },
    assignedLawyer: { id: 'user-1', name: 'Synthetic Lawyer', email: 'lawyer@example.invalid' },
    tasks: [],
    ...overrides,
  };
}

describe('dashboard operational resume eligibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.case.findMany.mockResolvedValue([]);
    prismaMock.taskSubmission.findMany.mockResolvedValue([]);
  });

  it('maps only active assigned task states to supported resume actions', () => {
    expect(deriveAssignedTaskResumeAction(task('PENDING'), 'user-1')).toBe('START_TASK');
    expect(deriveAssignedTaskResumeAction(task('IN_PROGRESS'), 'user-1')).toBe('OPEN_TASK');
    expect(deriveAssignedTaskResumeAction(task('IN_PROGRESS', { submissions: [submission('DRAFT')] }), 'user-1')).toBe('CONTINUE_SUBMISSION');
    expect(deriveAssignedTaskResumeAction(task('IN_PROGRESS', { submissions: [submission('RETURNED')] }), 'user-1')).toBe('CONTINUE_RETURNED_WORK');
  });

  it('excludes terminal, completed-submission, blocked and unknown states', () => {
    expect(deriveAssignedTaskResumeAction(task('DONE', { updatedAt: new Date('2026-07-20T09:59:00.000Z') }), 'user-1')).toBeNull();
    expect(deriveAssignedTaskResumeAction(task('COMPLETED'), 'user-1')).toBeNull();
    expect(deriveAssignedTaskResumeAction(task('CANCELLED'), 'user-1')).toBeNull();
    expect(deriveAssignedTaskResumeAction(task('IN_PROGRESS', { submissions: [submission('APPROVED')] }), 'user-1')).toBeNull();
    expect(deriveAssignedTaskResumeAction(task('IN_PROGRESS', {
      submissions: [submission('APPROVED', { externalActionRequired: true, externalCompletedAt: now })],
    }), 'user-1')).toBeNull();
    expect(deriveAssignedTaskResumeAction(task('IN_PROGRESS', { submissions: [submission('SUPERSEDED')] }), 'user-1')).toBeNull();
    expect(deriveAssignedTaskResumeAction(task('BLOCKED'), 'user-1')).toBeNull();
    expect(deriveAssignedTaskResumeAction(task('MYSTERY'), 'user-1')).toBeNull();
  });

  it('selects an actionable draft instead of a more recently updated closed task', async () => {
    prismaMock.case.findMany.mockResolvedValue([caseRow('resume', {
      tasks: [
        task('DONE', { id: 'closed-recent', updatedAt: new Date('2026-07-20T09:59:00.000Z') }),
        task('IN_PROGRESS', { id: 'active-draft', title: 'Active draft', submissions: [submission('DRAFT')] }),
      ],
    })]);

    const result = await getDashboardOperationalOverview({ userId: 'user-1', role: 'LAWYER' }, now);

    expect(result.resume.item).toEqual(expect.objectContaining({
      taskId: 'active-draft',
      nextActionCode: 'CONTINUE_SUBMISSION',
      actionLabel: 'Leadás folytatása',
    }));
    expect(JSON.stringify(result.resume)).not.toContain('closed-recent');
    expect(JSON.stringify(result.resume)).not.toContain('VIEW_COMPLETED');
  });

  it('keeps returned work, assigned review and external completion eligible', async () => {
    prismaMock.case.findMany.mockResolvedValue([caseRow('returned', {
      tasks: [task('IN_PROGRESS', {
        id: 'returned-task',
        title: 'Returned work',
        submissions: [submission('RETURNED')],
      })],
    })]);
    const returned = await getDashboardOperationalOverview({ userId: 'user-1', role: 'LAWYER' }, now);
    expect(returned.resume.item?.nextActionCode).toBe('CONTINUE_RETURNED_WORK');

    prismaMock.case.findMany.mockResolvedValue([]);
    prismaMock.taskSubmission.findMany.mockResolvedValue([{
      id: 'review-submission',
      status: 'SUBMITTED',
      externalActionRequired: false,
      externalCompletedAt: null,
      task: {
        id: 'review-task', title: 'Assigned review', status: 'IN_REVIEW', priority: 'HIGH', dueDate: new Date('2026-07-20T12:00:00.000Z'),
        case: { ...caseRow('review'), tasks: undefined },
      },
    }]);
    const review = await getDashboardOperationalOverview({ userId: 'user-1', role: 'LAWYER' }, now);
    expect(review.resume.item?.nextActionCode).toBe('OPEN_REVIEW');

    prismaMock.taskSubmission.findMany.mockResolvedValue([{
      id: 'external-submission',
      status: 'APPROVED',
      externalActionRequired: true,
      externalCompletedAt: null,
      task: {
        id: 'external-task', title: 'External completion', status: 'IN_REVIEW', priority: 'MEDIUM', dueDate: null,
        case: { ...caseRow('external'), tasks: undefined },
      },
    }]);
    const external = await getDashboardOperationalOverview({ userId: 'user-1', role: 'LAWYER' }, now);
    expect(external.resume.item?.nextActionCode).toBe('RECORD_EXTERNAL_COMPLETION');
  });

  it('returns an honest empty resume state when no action is permitted', async () => {
    prismaMock.case.findMany.mockResolvedValue([caseRow('empty', { tasks: [task('DONE')] })]);
    const result = await getDashboardOperationalOverview({ userId: 'user-1', role: 'LAWYER' }, now);
    expect(result.resume.item).toBeNull();
  });
});

describe('dashboard operational case grouping and scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.taskSubmission.findMany.mockResolvedValue([]);
  });

  it('uses only persisted deadline, assignment, review and client-waiting state', async () => {
    prismaMock.case.findMany.mockResolvedValue([
      caseRow('deadline', { deadline: new Date('2026-07-19T10:00:00.000Z') }),
      caseRow('office', { status: 'DRAFT' }),
      caseRow('review', { status: 'IN_REVIEW', assignedLawyerId: 'other-user' }),
      caseRow('client', { status: 'SENT_TO_CLIENT', assignedLawyerId: 'other-user' }),
      caseRow('neutral', { status: 'APPROVED', assignedLawyerId: 'other-user', client: { id: 'client-neutral', name: 'Neutral Client', colorKey: null } }),
      caseRow('free-text', { title: 'Ellenfél válaszára várunk', status: 'APPROVED', assignedLawyerId: 'other-user' }),
    ]);

    const result = await getDashboardOperationalOverview({ userId: 'user-1', role: 'LAWYER' }, now);
    const byId = new Map(result.items.map((item) => [item.id, item]));

    expect(byId.get('deadline')?.groupCode).toBe('DEADLINE_APPROACHING');
    expect(byId.get('deadline')?.overdue).toBe(true);
    expect(byId.get('office')?.groupCode).toBe('OFFICE_ACTION');
    expect(byId.get('review')?.groupCode).toBe('REVIEW');
    expect(byId.get('client')?.groupCode).toBe('CLIENT_WAITING');
    expect(byId.get('neutral')?.groupCode).toBe('UNSPECIFIED');
    expect(byId.get('neutral')?.client.clientColorKey).toBeNull();
    expect(byId.get('free-text')?.groupCode).toBe('UNSPECIFIED');
    expect(byId.get('free-text')?.client.clientColorKey).toBe('BLUE');
    expect(result.groups.map((group) => group.code)).not.toContain('COUNTERPARTY_WAITING');
    expect(result.groups.map((group) => group.code)).not.toContain('AUTHORITY_WAITING');
  });

  it('scopes non-privileged cases and keeps query count constant', async () => {
    prismaMock.case.findMany.mockResolvedValue([]);
    await getDashboardOperationalOverview({ userId: 'user-1', role: 'LAWYER' }, now);

    expect(prismaMock.case.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.taskSubmission.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.case.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { assignedLawyerId: 'user-1' },
          { createdById: 'user-1' },
          { collaborators: { some: { userId: 'user-1' } } },
        ],
      }),
    }));
    expect(prismaMock.taskSubmission.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ assignedReviewerId: 'user-1' }),
    }));
  });
});
