/**
 * Operational cockpit projection for the matter overview (MATTER-OVERVIEW-COCKPIT-1).
 *
 * Everything here is derived from data the workspace projection has already
 * loaded — no additional queries. The reason this exists at all is that a raw
 * count ("3 feladat") is not operationally useful: the overview has to answer
 * what is urgent, what is due today, what is waiting on a reply, and what the
 * single next step is. Deriving that server-side keeps the UI from inventing
 * summary values or fanning out a dozen requests to compute urgency.
 */

export type CockpitUrgency = 'CRITICAL' | 'ATTENTION' | 'STEADY';

export interface CockpitDeadline {
  id: string;
  title: string;
  dueAt: string;
  /** MATTER for the case-level deadline, TASK for a task due date. */
  source: 'MATTER' | 'TASK';
  deadlineType: string;
  assignee: { id: string; name: string } | null;
  overdue: boolean;
}

export interface CaseCockpit {
  urgency: CockpitUrgency;
  nextStep: { label: string; source: string; dueAt: string | null; objectId: string | null } | null;
  responsible: { id: string; name: string } | null;
  kpi: {
    openTasks: { count: number; urgentCount: number; secondary: string };
    deadlines: { count: number; nextDueAt: string | null; secondary: string };
    communication: { count: number; replyNeededCount: number; secondary: string };
    review: { count: number; secondary: string };
    activeDocuments: { count: number; secondary: string };
  };
  taskGroups: { immediate: string[]; today: string[]; later: string[] };
  deadlineGroups: {
    today: CockpitDeadline[];
    tomorrow: CockpitDeadline[];
    thisWeek: CockpitDeadline[];
    later: CockpitDeadline[];
  };
  replyNeeded: string[];
  activeDocuments: Array<{ id: string; fileName: string; reason: string }>;
}

export interface CockpitTaskInput {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | string | null;
  documentId: string | null;
  assignedTo: { id: string; name: string } | null;
}
export interface CockpitDocumentInput { id: string; fileName?: string | null; name?: string | null }
export interface CockpitCommunicationInput { id: string; direction?: string | null; createdAt: Date | string }
export interface CockpitCaseInput {
  id: string;
  deadline: Date | string | null;
  assignedLawyer: { id: string; name: string } | null;
}

const URGENT_PRIORITIES = new Set(['URGENT', 'HIGH']);
const REVIEW_STATUSES = new Set(['SUBMITTED', 'IN_REVIEW', 'UNDER_REVIEW', 'REVIEW_NEEDED']);

const ms = (v: Date | string | null | undefined): number | null =>
  v ? new Date(v).getTime() : null;
const isoOf = (v: Date | string): string => new Date(v).toISOString();

export function buildCockpit(params: {
  caseRecord: CockpitCaseInput;
  openTasks: CockpitTaskInput[];
  documents: CockpitDocumentInput[];
  communications: CockpitCommunicationInput[];
  communicationCount: number;
  reviewCount: number;
  documentLimit: number;
  now?: Date;
}): CaseCockpit {
  const { caseRecord, openTasks, documents, communications, communicationCount, reviewCount, documentLimit } = params;
  const now = params.now ?? new Date();
  const nowMs = now.getTime();

  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfDay); endOfToday.setDate(endOfToday.getDate() + 1);
  const endOfTomorrow = new Date(endOfToday); endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
  const endOfWeek = new Date(startOfDay); endOfWeek.setDate(endOfWeek.getDate() + 7);

  const isOverdue = (v: Date | string | null | undefined) => {
    const m = ms(v); return m !== null && m < nowMs;
  };
  const isToday = (v: Date | string | null | undefined) => {
    const m = ms(v); return m !== null && m >= startOfDay.getTime() && m < endOfToday.getTime();
  };

  // A task needs acting on now when it is already late or explicitly urgent.
  const immediate = openTasks.filter(
    (t) => isOverdue(t.dueDate) || URGENT_PRIORITIES.has(String(t.priority).toUpperCase())
  );
  const immediateIds = new Set(immediate.map((t) => t.id));
  const today = openTasks.filter((t) => !immediateIds.has(t.id) && isToday(t.dueDate));
  const todayIds = new Set(today.map((t) => t.id));
  const later = openTasks.filter((t) => !immediateIds.has(t.id) && !todayIds.has(t.id));

  // Deadlines: task due dates plus the case-level deadline, kept distinguishable.
  const deadlines: CockpitDeadline[] = openTasks
    .filter((t) => t.dueDate)
    .map((t) => ({
      id: `task-${t.id}`,
      title: t.title,
      dueAt: isoOf(t.dueDate as Date | string),
      source: 'TASK' as const,
      deadlineType: 'NEXT_ACTION',
      assignee: t.assignedTo ? { id: t.assignedTo.id, name: t.assignedTo.name } : null,
      overdue: isOverdue(t.dueDate),
    }));
  if (caseRecord.deadline) {
    deadlines.push({
      id: `matter-${caseRecord.id}`,
      title: 'Ügyhatáridő',
      dueAt: isoOf(caseRecord.deadline),
      source: 'MATTER',
      deadlineType: 'MATTER_DEADLINE',
      assignee: caseRecord.assignedLawyer,
      overdue: isOverdue(caseRecord.deadline),
    });
  }
  deadlines.sort((a, b) => a.dueAt.localeCompare(b.dueAt));

  const within = (d: CockpitDeadline, from: number, to: number) => {
    const m = new Date(d.dueAt).getTime();
    return m >= from && m < to;
  };
  const deadlineGroups = {
    // Overdue work belongs with "today" — it must never look parked in the future.
    today: deadlines.filter((d) => d.overdue || within(d, startOfDay.getTime(), endOfToday.getTime())),
    tomorrow: deadlines.filter((d) => !d.overdue && within(d, endOfToday.getTime(), endOfTomorrow.getTime())),
    thisWeek: deadlines.filter((d) => !d.overdue && within(d, endOfTomorrow.getTime(), endOfWeek.getTime())),
    later: deadlines.filter((d) => !d.overdue && new Date(d.dueAt).getTime() >= endOfWeek.getTime()),
  };
  const nextDeadline = deadlines[0] || null;
  const overdueCount = deadlines.filter((d) => d.overdue).length;

  // Reply needed: inbound messages newer than the most recent outbound one.
  const latestOutbound = communications
    .filter((c) => String(c.direction || '').toUpperCase() === 'OUTBOUND')
    .map((c) => new Date(c.createdAt).getTime())
    .sort((a, b) => b - a)[0] ?? 0;
  const replyNeeded = communications
    .filter((c) => String(c.direction || '').toUpperCase() === 'INBOUND' && new Date(c.createdAt).getTime() > latestOutbound)
    .map((c) => c.id);

  // Active documents: surfaced only when there is an operational reason to.
  const activeDocuments = documents
    .map((d) => {
      const linked = openTasks.find((t) => t.documentId === d.id);
      if (!linked) return null;
      const fileName = d.fileName || d.name || 'Dokumentum';
      if (REVIEW_STATUSES.has(String(linked.status).toUpperCase())) return { id: d.id, fileName, reason: 'REVIEW_PENDING' };
      if (isOverdue(linked.dueDate)) return { id: d.id, fileName, reason: 'DEADLINE_PASSED' };
      return { id: d.id, fileName, reason: 'IN_PROGRESS' };
    })
    .filter((x): x is { id: string; fileName: string; reason: string } => x !== null)
    .slice(0, documentLimit);

  // The single most pressing concrete thing to do next.
  const nextTask = immediate[0] || today[0] || openTasks.find((t) => t.dueDate) || openTasks[0] || null;
  const nextStep = nextTask
    ? { label: nextTask.title, source: 'TASK', dueAt: nextTask.dueDate ? isoOf(nextTask.dueDate) : null, objectId: nextTask.id }
    : replyNeeded.length > 0
      ? { label: 'Válasz a beérkezett kommunikációra', source: 'COMMUNICATION', dueAt: null, objectId: replyNeeded[0] }
      : null;

  const urgency: CockpitUrgency =
    overdueCount > 0
      ? 'CRITICAL'
      : immediate.length > 0 || deadlineGroups.today.length > 0 || replyNeeded.length > 0
        ? 'ATTENTION'
        : 'STEADY';

  return {
    urgency,
    nextStep,
    responsible: caseRecord.assignedLawyer,
    kpi: {
      openTasks: {
        count: openTasks.length,
        urgentCount: immediate.length,
        secondary: immediate.length > 0
          ? `${immediate.length} sürgős`
          : openTasks.length === 0 ? 'Nincs nyitott feladat' : 'Nincs sürgős',
      },
      deadlines: {
        count: deadlines.length,
        nextDueAt: nextDeadline ? nextDeadline.dueAt : null,
        secondary: overdueCount > 0
          ? `${overdueCount} lejárt`
          : deadlineGroups.today.length > 0 ? 'Ma esedékes'
          : nextDeadline ? 'Következő ütemezve' : 'Nincs határidő',
      },
      communication: {
        count: communicationCount,
        replyNeededCount: replyNeeded.length,
        secondary: replyNeeded.length > 0
          ? `${replyNeeded.length} válaszra vár`
          : communicationCount === 0 ? 'Nincs kommunikáció' : 'Nincs nyitott válasz',
      },
      review: {
        count: reviewCount,
        secondary: reviewCount > 0 ? 'Review-ra vár' : 'Nincs review tétel',
      },
      activeDocuments: {
        count: activeDocuments.length,
        secondary: activeDocuments.length > 0 ? 'Aktív munkairat' : 'Nincs aktív dokumentum',
      },
    },
    taskGroups: {
      immediate: immediate.map((t) => t.id),
      today: today.map((t) => t.id),
      later: later.map((t) => t.id),
    },
    deadlineGroups,
    replyNeeded,
    activeDocuments,
  };
}
