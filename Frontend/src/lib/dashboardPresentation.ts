import type {
  DashboardOperationalGroupCode,
  DashboardOperationalOverview,
  WorkflowDeadlineItem,
} from "./api";
import { getCaseDisplayTitle } from "./caseLabels";

export type DashboardPrimaryActionIcon = "case" | "task" | "document" | "communication";

export type DashboardPrimaryAction = {
  label: string;
  description: string;
  href: string;
  icon: DashboardPrimaryActionIcon;
};

export const DASHBOARD_SECONDARY_ACTIONS = [
  { label: "Review sor", href: "/reviews" },
  { label: "Határidők", href: "/deadlines?view=week" },
  { label: "Munkaórák", href: "/time-entries" },
] as const;

export function getDashboardPrimaryActions(activeCaseId?: string | null): DashboardPrimaryAction[] {
  return [
    {
      label: "Új ügy",
      description: "Új ügy munkaterének létrehozása",
      href: "/cases?newCase=1",
      icon: "case",
    },
    {
      label: "Új feladat",
      description: "Teendő rögzítése ügyhöz",
      href: "/tasks?newTask=1",
      icon: "task",
    },
    {
      label: "Dokumentum feltöltése",
      description: "Irat kapcsolása egy ügyhöz",
      href: activeCaseId ? `/cases/${activeCaseId}/documents` : "/cases",
      icon: "document",
    },
    {
      label: "Kommunikáció megnyitása",
      description: "Beérkező és kimenő tételek áttekintése",
      href: "/notifications",
      icon: "communication",
    },
  ];
}

type OperationalItem = DashboardOperationalOverview["items"][number];

export type DashboardOperationalPresentationGroup = {
  code: DashboardOperationalGroupCode;
  label: string;
  count: number;
  items: OperationalItem[];
};

export type DashboardOperationalPresentation = {
  groups: DashboardOperationalPresentationGroup[];
  visibleCount: number;
  hiddenCount: number;
  unspecifiedCount: number;
};

export function buildDashboardOperationalPresentation(
  overview: DashboardOperationalOverview,
  maximumVisibleItems = 6,
): DashboardOperationalPresentation {
  const sourceGroups = overview.groups
    .map((group) => ({
      ...group,
      sourceItems: overview.items.filter((item) => item.groupCode === group.code),
      items: [] as OperationalItem[],
    }))
    .filter((group) => group.count > 0 || group.sourceItems.length > 0);

  for (const group of sourceGroups) {
    if (group.sourceItems[0] && sourceGroups.reduce((count, current) => count + current.items.length, 0) < maximumVisibleItems) {
      group.items.push(group.sourceItems[0]);
    }
  }

  for (const group of sourceGroups) {
    if (group.sourceItems[1] && sourceGroups.reduce((count, current) => count + current.items.length, 0) < maximumVisibleItems) {
      group.items.push(group.sourceItems[1]);
    }
  }

  const groups = sourceGroups
    .filter((group) => group.items.length > 0)
    .map(({ sourceItems: _sourceItems, ...group }) => group);
  const visibleCount = groups.reduce((count, group) => count + group.items.length, 0);

  return {
    groups,
    visibleCount,
    hiddenCount: Math.max(0, overview.items.length - visibleCount),
    unspecifiedCount: overview.groups.find((group) => group.code === "UNSPECIFIED")?.count || 0,
  };
}

export function getDashboardCaseTitle(title?: string | null): string {
  const normalizedTitle = String(title || "").trim();
  const contractDraftingSuffix = " - CONTRACT_DRAFTING";

  if (normalizedTitle.toUpperCase().endsWith(contractDraftingSuffix)) {
    return `${normalizedTitle.slice(0, -contractDraftingSuffix.length)} - Szerződés`;
  }

  return getCaseDisplayTitle({ title: normalizedTitle });
}

export function getNextSevenDayDeadlines(
  deadlines: WorkflowDeadlineItem[],
  now = new Date(),
): WorkflowDeadlineItem[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  return deadlines
    .filter((item) => {
      const dueAt = new Date(item.dueAt);
      return !Number.isNaN(dueAt.getTime()) && dueAt >= start && dueAt < end;
    })
    .sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime());
}
