import { prisma } from '../../prisma/prisma.service';

const PRIVILEGED_ROLES = new Set(['ADMIN', 'PARTNER']);
const TERMINAL_TASK_STATUSES = ['COMPLETED', 'DONE', 'CANCELLED'];
const TERMINAL_CASE_STATUSES = ['FINAL', 'CANCELLED', 'ARCHIVED'];
const REVIEW_TASK_STATUSES = new Set(['SUBMITTED', 'UNDER_REVIEW', 'IN_REVIEW']);
const OFFICE_CASE_STATUSES = new Set(['CLIENT_INPUT', 'DRAFT', 'APPROVED', 'CLIENT_FEEDBACK']);

export const DASHBOARD_RESUME_ACTION_LABELS = {
  START_TASK: 'Munka megkezdése',
  OPEN_TASK: 'Feladat megnyitása',
  CONTINUE_SUBMISSION: 'Leadás folytatása',
  OPEN_REVIEW: 'Review megnyitása',
  CONTINUE_RETURNED_WORK: 'Javítás folytatása',
  RECORD_EXTERNAL_COMPLETION: 'Külső lépés rögzítése',
} as const;

export type DashboardResumeActionCode = keyof typeof DASHBOARD_RESUME_ACTION_LABELS;
export type DashboardOperationalGroupCode =
  | 'DEADLINE_APPROACHING'
  | 'OFFICE_ACTION'
  | 'REVIEW'
  | 'CLIENT_WAITING'
  | 'UNSPECIFIED';

const GROUP_LABELS: Record<DashboardOperationalGroupCode, string> = {
  DEADLINE_APPROACHING: 'Határidő közeleg',
  OFFICE_ACTION: 'Nálunk van a következő lépés',
  REVIEW: 'Review alatt',
  CLIENT_WAITING: 'Ügyfélre várunk',
  UNSPECIFIED: 'Nincs meghatározott következő lépés',
};

type SubmissionProjection = {
  id: string;
  status: unknown;
  createdById: string;
  submittedById: string | null;
  assignedReviewerId: string;
  externalActionRequired: boolean;
  externalCompletedAt: Date | null;
};

type TaskProjection = {
  id: string;
  title: string;
  status: unknown;
  priority: unknown;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assignedToId: string | null;
  stuckReason: unknown;
  submissions: SubmissionProjection[];
};

type CaseProjection = {
  id: string;
  caseNumber: string;
  title: string;
  status: unknown;
  priority: unknown;
  deadline: Date | null;
  updatedAt: Date;
  createdById: string;
  assignedLawyerId: string | null;
  client: { id: string; name: string; colorKey: unknown };
  assignedLawyer: { id: string; name: string; email: string } | null;
  tasks: TaskProjection[];
};

type ResumeCandidate = {
  id: string;
  taskId: string;
  submissionId: string | null;
  title: string;
  status: string;
  priority: string;
  dueAt: Date | null;
  case: CaseProjection;
  nextActionCode: DashboardResumeActionCode;
};

function normalize(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function isTerminalTask(status: unknown): boolean {
  return TERMINAL_TASK_STATUSES.includes(normalize(status));
}

function isTerminalCase(status: unknown): boolean {
  return TERMINAL_CASE_STATUSES.includes(normalize(status));
}

function actionHref(candidate: ResumeCandidate): string {
  if (candidate.nextActionCode === 'OPEN_REVIEW' || candidate.nextActionCode === 'RECORD_EXTERNAL_COMPLETION') {
    return `/reviews?taskId=${encodeURIComponent(candidate.taskId)}&submissionId=${encodeURIComponent(candidate.submissionId || '')}`;
  }
  return `/tasks?taskId=${encodeURIComponent(candidate.taskId)}`;
}

export function deriveAssignedTaskResumeAction(task: TaskProjection, userId: string): DashboardResumeActionCode | null {
  if (isTerminalTask(task.status) || task.assignedToId !== userId) return null;
  const submission = task.submissions[0] || null;
  const submissionStatus = normalize(submission?.status);

  if (submissionStatus === 'DRAFT') {
    return submission?.createdById === userId ? 'CONTINUE_SUBMISSION' : null;
  }
  if (submissionStatus === 'RETURNED') {
    return submission?.submittedById === userId || task.assignedToId === userId ? 'CONTINUE_RETURNED_WORK' : null;
  }
  if (['SUBMITTED', 'APPROVED', 'SUPERSEDED', 'CANCELLED'].includes(submissionStatus)) return null;

  const taskStatus = normalize(task.status);
  if (['PENDING', 'TODO'].includes(taskStatus)) return 'START_TASK';
  if (taskStatus === 'IN_PROGRESS') return 'OPEN_TASK';
  return null;
}

function deadlineRank(value: Date | null, now: Date): number {
  if (!value) return 3;
  const timestamp = value.getTime();
  if (timestamp < now.getTime()) return 0;
  if (timestamp <= now.getTime() + 24 * 60 * 60 * 1000) return 1;
  return 2;
}

function candidateRank(candidate: ResumeCandidate, now: Date): [number, number, number, string] {
  const actionOrder: Record<DashboardResumeActionCode, number> = {
    CONTINUE_RETURNED_WORK: 0,
    OPEN_REVIEW: 1,
    RECORD_EXTERNAL_COMPLETION: 2,
    CONTINUE_SUBMISSION: 3,
    OPEN_TASK: 4,
    START_TASK: 5,
  };
  return [
    deadlineRank(candidate.dueAt, now),
    actionOrder[candidate.nextActionCode],
    candidate.dueAt?.getTime() || Number.POSITIVE_INFINITY,
    candidate.title,
  ];
}

function compareCandidates(left: ResumeCandidate, right: ResumeCandidate, now: Date): number {
  const leftRank = candidateRank(left, now);
  const rightRank = candidateRank(right, now);
  for (let index = 0; index < leftRank.length - 1; index += 1) {
    const difference = Number(leftRank[index]) - Number(rightRank[index]);
    if (difference) return difference;
  }
  return String(leftRank[3]).localeCompare(String(rightRank[3]), 'hu-HU');
}

function nearestDeadline(caseRow: CaseProjection): Date | null {
  const dates = [caseRow.deadline, ...caseRow.tasks.map((task) => task.dueDate)]
    .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()));
  return dates.sort((left, right) => left.getTime() - right.getTime())[0] || null;
}

function oldestOpenActivity(caseRow: CaseProjection): Date {
  return caseRow.tasks
    .map((task) => task.createdAt)
    .sort((left, right) => left.getTime() - right.getTime())[0] || caseRow.updatedAt;
}

function classifyCase(caseRow: CaseProjection, userId: string, now: Date): DashboardOperationalGroupCode {
  const deadline = nearestDeadline(caseRow);
  if (deadline && deadline.getTime() <= now.getTime() + 7 * 24 * 60 * 60 * 1000) return 'DEADLINE_APPROACHING';

  const hasOfficeTask = caseRow.tasks.some((task) => deriveAssignedTaskResumeAction(task, userId) !== null);
  if (hasOfficeTask || (caseRow.assignedLawyerId === userId && OFFICE_CASE_STATUSES.has(normalize(caseRow.status)))) {
    return 'OFFICE_ACTION';
  }

  const hasReview = normalize(caseRow.status) === 'IN_REVIEW' || caseRow.tasks.some((task) => {
    const submissionStatus = normalize(task.submissions[0]?.status);
    return REVIEW_TASK_STATUSES.has(normalize(task.status)) || submissionStatus === 'SUBMITTED';
  });
  if (hasReview) return 'REVIEW';

  const waitsForClient = normalize(caseRow.status) === 'SENT_TO_CLIENT'
    || caseRow.tasks.some((task) => normalize(task.stuckReason) === 'CLIENT_WAITING');
  if (waitsForClient) return 'CLIENT_WAITING';

  return 'UNSPECIFIED';
}

function caseNextAction(caseRow: CaseProjection, group: DashboardOperationalGroupCode, userId: string) {
  const ownTask = caseRow.tasks.find((task) => deriveAssignedTaskResumeAction(task, userId) !== null);
  if (ownTask) {
    const code = deriveAssignedTaskResumeAction(ownTask, userId)!;
    return { code, label: DASHBOARD_RESUME_ACTION_LABELS[code], href: `/tasks?taskId=${encodeURIComponent(ownTask.id)}` };
  }
  if (group === 'DEADLINE_APPROACHING') return { code: 'OPEN_DEADLINE', label: 'Határidő kezelése', href: `/cases/${encodeURIComponent(caseRow.id)}` };
  if (group === 'REVIEW') return { code: 'OPEN_REVIEW_QUEUE', label: 'Review ellenőrzése', href: '/reviews' };
  if (group === 'CLIENT_WAITING') return { code: 'CHECK_CLIENT_WAIT', label: 'Várakozás ellenőrzése', href: `/cases/${encodeURIComponent(caseRow.id)}` };
  if (group === 'OFFICE_ACTION') return { code: 'OPEN_CASE_WORK', label: 'Következő lépés megnyitása', href: `/cases/${encodeURIComponent(caseRow.id)}` };
  return { code: 'DEFINE_NEXT_ACTION', label: 'Következő lépés kijelölése', href: `/cases/${encodeURIComponent(caseRow.id)}` };
}

export async function getDashboardOperationalOverview(
  actor: { userId: string; role?: string | null },
  now = new Date(),
) {
  const caseWhere = PRIVILEGED_ROLES.has(normalize(actor.role))
    ? { status: { notIn: TERMINAL_CASE_STATUSES as any } }
    : {
        status: { notIn: TERMINAL_CASE_STATUSES as any },
        OR: [
          { assignedLawyerId: actor.userId },
          { createdById: actor.userId },
          { collaborators: { some: { userId: actor.userId } } },
        ],
      };

  const [caseRows, reviewerSubmissions] = await Promise.all([
    prisma.case.findMany({
      where: caseWhere,
      take: 200,
      select: {
        id: true,
        caseNumber: true,
        title: true,
        status: true,
        priority: true,
        deadline: true,
        updatedAt: true,
        createdById: true,
        assignedLawyerId: true,
        client: { select: { id: true, name: true, colorKey: true } },
        assignedLawyer: { select: { id: true, name: true, email: true } },
        tasks: {
          where: { status: { notIn: TERMINAL_TASK_STATUSES as any } },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            createdAt: true,
            updatedAt: true,
            assignedToId: true,
            stuckReason: true,
            submissions: {
              orderBy: { revisionNumber: 'desc' },
              take: 1,
              select: {
                id: true,
                status: true,
                createdById: true,
                submittedById: true,
                assignedReviewerId: true,
                externalActionRequired: true,
                externalCompletedAt: true,
              },
            },
          },
        },
      },
    }),
    prisma.taskSubmission.findMany({
      where: {
        assignedReviewerId: actor.userId,
        task: {
          status: { notIn: TERMINAL_TASK_STATUSES as any },
          case: { status: { notIn: TERMINAL_CASE_STATUSES as any } },
        },
        OR: [
          { status: 'SUBMITTED' as any },
          { status: 'APPROVED' as any, externalActionRequired: true, externalCompletedAt: null },
        ],
      },
      take: 100,
      select: {
        id: true,
        status: true,
        externalActionRequired: true,
        externalCompletedAt: true,
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            case: {
              select: {
                id: true,
                caseNumber: true,
                title: true,
                status: true,
                priority: true,
                deadline: true,
                updatedAt: true,
                createdById: true,
                assignedLawyerId: true,
                client: { select: { id: true, name: true, colorKey: true } },
                assignedLawyer: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const accessibleCases = caseRows as unknown as CaseProjection[];
  const resumeCandidates: ResumeCandidate[] = [];
  for (const caseRow of accessibleCases) {
    if (isTerminalCase(caseRow.status)) continue;
    for (const task of caseRow.tasks) {
      const action = deriveAssignedTaskResumeAction(task, actor.userId);
      if (!action) continue;
      resumeCandidates.push({
        id: `task-${task.id}`,
        taskId: task.id,
        submissionId: task.submissions[0]?.id || null,
        title: task.title,
        status: normalize(task.status),
        priority: normalize(task.priority),
        dueAt: task.dueDate,
        case: caseRow,
        nextActionCode: action,
      });
    }
  }

  for (const row of reviewerSubmissions as any[]) {
    const action: DashboardResumeActionCode = normalize(row.status) === 'SUBMITTED' ? 'OPEN_REVIEW' : 'RECORD_EXTERNAL_COMPLETION';
    const caseRow: CaseProjection = { ...row.task.case, tasks: [] };
    resumeCandidates.push({
      id: `submission-${row.id}`,
      taskId: row.task.id,
      submissionId: row.id,
      title: row.task.title,
      status: normalize(row.task.status),
      priority: normalize(row.task.priority),
      dueAt: row.task.dueDate,
      case: caseRow,
      nextActionCode: action,
    });
  }

  const uniqueCandidates = [...new Map(resumeCandidates.map((candidate) => [`${candidate.taskId}:${candidate.nextActionCode}`, candidate])).values()]
    .sort((left, right) => compareCandidates(left, right, now));
  const resume = uniqueCandidates[0] || null;

  const operationalItems = accessibleCases.map((caseRow) => {
    const groupCode = classifyCase(caseRow, actor.userId, now);
    const deadline = nearestDeadline(caseRow);
    const openTaskCount = caseRow.tasks.length;
    const reviewCount = caseRow.tasks.filter((task) => REVIEW_TASK_STATUSES.has(normalize(task.status)) || normalize(task.submissions[0]?.status) === 'SUBMITTED').length;
    return {
      id: caseRow.id,
      caseNumber: caseRow.caseNumber,
      title: caseRow.title,
      client: {
        id: caseRow.client.id,
        displayName: caseRow.client.name,
        clientColorKey: caseRow.client.colorKey ? String(caseRow.client.colorKey) : null,
      },
      responsible: caseRow.assignedLawyer
        ? { id: caseRow.assignedLawyer.id, displayName: caseRow.assignedLawyer.name || caseRow.assignedLawyer.email }
        : null,
      status: normalize(caseRow.status),
      priority: normalize(caseRow.priority),
      groupCode,
      groupLabel: GROUP_LABELS[groupCode],
      waitingLabel: groupCode === 'CLIENT_WAITING'
        ? 'Ügyfél válaszára vár'
        : groupCode === 'REVIEW'
          ? 'Kijelölt review folyamatban'
          : groupCode === 'OFFICE_ACTION'
            ? 'Belső lépés szükséges'
            : groupCode === 'DEADLINE_APPROACHING'
              ? 'Határidővezérelt teendő'
              : 'Nincs rögzített következő szereplő',
      nearestDeadline: deadline?.toISOString() || null,
      overdue: Boolean(deadline && deadline.getTime() < now.getTime()),
      openTaskCount,
      reviewCount,
      oldestOpenActivityAt: oldestOpenActivity(caseRow).toISOString(),
      nextAction: caseNextAction(caseRow, groupCode, actor.userId),
      openHref: `/cases/${encodeURIComponent(caseRow.id)}`,
    };
  }).sort((left, right) => {
    const groupOrder: Record<DashboardOperationalGroupCode, number> = {
      DEADLINE_APPROACHING: 0,
      OFFICE_ACTION: 1,
      REVIEW: 2,
      CLIENT_WAITING: 3,
      UNSPECIFIED: 4,
    };
    if (groupOrder[left.groupCode] !== groupOrder[right.groupCode]) return groupOrder[left.groupCode] - groupOrder[right.groupCode];
    const leftDeadline = left.nearestDeadline ? new Date(left.nearestDeadline).getTime() : Number.POSITIVE_INFINITY;
    const rightDeadline = right.nearestDeadline ? new Date(right.nearestDeadline).getTime() : Number.POSITIVE_INFINITY;
    if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline;
    const activityDifference = new Date(left.oldestOpenActivityAt).getTime() - new Date(right.oldestOpenActivityAt).getTime();
    if (activityDifference) return activityDifference;
    return left.title.localeCompare(right.title, 'hu-HU');
  });

  return {
    generatedAt: now.toISOString(),
    resume: {
      item: resume ? {
        id: resume.id,
        taskId: resume.taskId,
        submissionId: resume.submissionId,
        title: resume.title,
        status: resume.status,
        nextActionCode: resume.nextActionCode,
        actionLabel: DASHBOARD_RESUME_ACTION_LABELS[resume.nextActionCode],
        href: actionHref(resume),
        dueAt: resume.dueAt?.toISOString() || null,
        case: {
          id: resume.case.id,
          caseNumber: resume.case.caseNumber,
          title: resume.case.title,
          client: {
            id: resume.case.client.id,
            displayName: resume.case.client.name,
            clientColorKey: resume.case.client.colorKey ? String(resume.case.client.colorKey) : null,
          },
        },
      } : null,
    },
    summary: { openCaseCount: operationalItems.length },
    groups: (Object.keys(GROUP_LABELS) as DashboardOperationalGroupCode[]).map((code) => ({
      code,
      label: GROUP_LABELS[code],
      count: operationalItems.filter((item) => item.groupCode === code).length,
    })),
    items: operationalItems,
  };
}
