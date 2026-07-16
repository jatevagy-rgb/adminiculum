"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCases,
  getCommunications,
  getCurrentUser,
  getDashboardStats,
  getIntakeQueue,
  getMyTasks,
  getNewsFeed,
  getWorkflowAgenda,
  type CaseListItem,
  type CommunicationItem,
  type CurrentUser,
  type DashboardStats,
  type IntakeQueueResponse,
  type TaskItem,
  type WorkflowAgendaResponse,
  type WorkflowDeadlineItem,
} from "@/lib/api";
import { CompactState, OperationalPageHeader, QuietLink, SafePanelError } from "@/components/adminiculum/OperationalPrimitives";

type NewsArticle = {
  title: string;
  source: string;
  date: string;
  url?: string;
};

type FocusItem = {
  id: string;
  label: string;
  title: string;
  meta: string;
  href: string;
  action: string;
  tone: "green" | "amber" | "blue";
};

type SummaryCardProps = {
  label: string;
  value: number;
  emptyLabel: string;
  href: string;
  tone: "petrol" | "amber" | "gold" | "navy";
};

const completedStatuses = new Set(["COMPLETED", "DONE", "APPROVED", "FINALIZED", "ARCHIVED", "CANCELLED"]);

function formatDate(value?: string | null) {
  if (!value) return "Nincs határidő";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("hu-HU");
}

function isReviewTask(task: TaskItem) {
  const status = String(task.status || "").toUpperCase();
  return ["SUBMITTED", "REVIEW_NEEDED", "IN_REVIEW"].includes(status) || /review|ellenőrz/i.test(task.title);
}

function isOpenTask(task: TaskItem) {
  return !completedStatuses.has(String(task.status || "").toUpperCase());
}

function taskUrgency(task: TaskItem) {
  if (!task.dueDate) return 3;
  const due = new Date(task.dueDate).getTime();
  if (Number.isNaN(due)) return 3;
  const delta = due - Date.now();
  if (delta < 0) return 0;
  if (delta < 24 * 60 * 60 * 1000) return 1;
  return 2;
}

function formatActivityText(type?: string | null, text?: string | null) {
  const normalized = String(type || text || "").toUpperCase();
  if (normalized.includes("DOCUMENT_UPLOADED")) return "Dokumentum feltöltve";
  if (normalized.includes("DOCUMENT_UPDATED")) return "Dokumentum frissítve";
  if (normalized.includes("DOCUMENT_REVIEW")) return "Dokumentum review frissült";
  return text || "Dokumentumaktivitás";
}

function FocusRow({ item, dominant = false }: { item: FocusItem; dominant?: boolean }) {
  const rail =
    item.tone === "amber"
      ? "border-l-[var(--adm-ochre-500)]"
      : item.tone === "blue"
        ? "border-l-[var(--adm-blue-700)]"
        : "border-l-[var(--adm-green-800)]";

  return (
    <Link
      href={item.href}
      className={`block border border-[var(--adm-border)] border-l-4 ${rail} bg-white px-4 py-3 transition-colors hover:bg-[var(--adm-surface)]`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">{item.label}</p>
          <p className={`${dominant ? "mt-1 font-serif text-[24px] font-medium" : "mt-1 text-[14px] font-semibold"} truncate text-[var(--adm-text)]`}>
            {item.title}
          </p>
          <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{item.meta}</p>
        </div>
        <span className={`${dominant ? "bg-[var(--adm-green-800)] text-[var(--adm-ivory-50)]" : "border border-[var(--adm-border)] bg-white text-[var(--adm-text)]"} shrink-0 px-3 py-2 text-[11px] font-semibold`}>
          {item.action} →
        </span>
      </div>
    </Link>
  );
}

function SummaryCard({ label, value, emptyLabel, href, tone }: SummaryCardProps) {
  const toneClass =
    tone === "amber"
      ? "bg-[#FD9E02] text-[#3E2400]"
      : tone === "gold"
        ? "bg-[#FFB703] text-[#4A3300]"
        : tone === "navy"
          ? "bg-[#023047] text-white"
          : "bg-[#126782] text-white";
  const panelClass = tone === "amber" || tone === "gold" ? "bg-black/[0.07] border-black/[0.12]" : "bg-white/[0.14] border-white/[0.24]";

  return (
    <Link href={href} className={`${toneClass} min-h-[92px] p-3 transition-transform hover:-translate-y-0.5`}>
      <span className="block text-[10px] font-bold uppercase tracking-[0.14em] opacity-85">{label}</span>
      <span className={`mt-2 flex items-end justify-between gap-3 border px-3 py-2 ${panelClass}`}>
        <span className="font-serif text-[27px] font-medium leading-none">{value}</span>
        <span className="text-right text-[10px] font-semibold opacity-85">{value === 0 ? emptyLabel : "Aktív tétel"}</span>
      </span>
    </Link>
  );
}

export function DashboardFocused() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [communications, setCommunications] = useState<CommunicationItem[]>([]);
  const [agenda, setAgenda] = useState<WorkflowAgendaResponse | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [intake, setIntake] = useState<IntakeQueueResponse | null>(null);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const me = await getCurrentUser();
      setCurrentUser(me);
      const [taskResult, caseResult, communicationResult, agendaResult, statsResult, intakeResult] = await Promise.all([
        getMyTasks().catch(() => null),
        getCases(1, 20).catch(() => null),
        getCommunications({ limit: 8 }).catch(() => null),
        getWorkflowAgenda({ scope: "MY_WORK", status: "OPEN", limit: 12 }).catch(() => null),
        getDashboardStats().catch(() => null),
        getIntakeQueue({ scope: "MY_INTAKES", limit: 4 }).catch(() => null),
      ]);

      setTasks(taskResult || []);
      setCases(caseResult?.data || []);
      setCommunications(communicationResult?.communications || []);
      setAgenda(agendaResult);
      setStats(statsResult);
      setIntake(intakeResult);
      setError(!taskResult && !caseResult && !agendaResult && !statsResult);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    getNewsFeed("legal")
      .then((result) => setNews((result.articles || []).slice(0, 4)))
      .catch(() => setNews([]));
  }, []);

  const openTasks = useMemo(
    () => tasks.filter(isOpenTask).sort((left, right) => taskUrgency(left) - taskUrgency(right)),
    [tasks],
  );
  const reviewTasks = useMemo(() => openTasks.filter(isReviewTask), [openTasks]);
  const deadlines = useMemo<WorkflowDeadlineItem[]>(
    () => (agenda?.days || []).flatMap((day) => day.items).filter((item) => item.status === "OPEN"),
    [agenda],
  );
  const recentDocuments = useMemo(
    () =>
      (stats?.recentActivity || [])
        .filter((item) => /document|dokument|irat/i.test(`${item.type} ${item.text}`))
        .filter((item) => !/deleted|töröl/i.test(`${item.type} ${item.text}`))
        .slice(0, 4),
    [stats],
  );

  const focusItems = useMemo<FocusItem[]>(() => {
    const items: FocusItem[] = [];
    const firstTask = openTasks[0];
    const firstDeadline = deadlines[0];
    const firstCase = cases.find((item) => Boolean(item.deadline)) || cases[0];

    if (firstTask) {
      items.push({
        id: `task-${firstTask.id}`,
        label: "Következő feladat",
        title: firstTask.title,
        meta: `${firstTask.case?.caseNumber || "Feladat"} · ${formatDate(firstTask.dueDate)}`,
        href: `/tasks?taskId=${encodeURIComponent(firstTask.id)}`,
        action: "Feladat megnyitása",
        tone: taskUrgency(firstTask) <= 1 ? "amber" : "green",
      });
    }
    if (firstDeadline) {
      items.push({
        id: `deadline-${firstDeadline.id}`,
        label: "Közelgő határidő",
        title: firstDeadline.title,
        meta: `${formatDate(firstDeadline.dueAt)} · ${firstDeadline.source.displayName || firstDeadline.sourceType}`,
        href: firstDeadline.href || firstDeadline.source.href || "/deadlines",
        action: "Határidő megnyitása",
        tone: "amber",
      });
    }
    if (firstCase) {
      items.push({
        id: `case-${firstCase.id}`,
        label: "Aktív ügy",
        title: firstCase.title || firstCase.caseNumber,
        meta: `${firstCase.caseNumber} · ${firstCase.clientName || "Nincs ügyféladat"}`,
        href: `/cases/${encodeURIComponent(firstCase.id)}`,
        action: "Ügy megnyitása",
        tone: "green",
      });
    }
    return items;
  }, [cases, deadlines, openTasks]);

  const primary = focusItems[0] || null;
  const queue = focusItems.slice(1, 5);
  const visibleCommunications = communications.slice(0, 4);
  const activeCase = cases[0] || null;
  const activeCaseCount = cases.filter(
    (item) => !["CLOSED", "ARCHIVED", "FINAL", "CANCELLED"].includes(String(item.status || "").toUpperCase()),
  ).length;

  return (
    <div className="min-h-full bg-[var(--adm-ivory-50)] px-4 py-4 lg:px-6">
      <div className="mx-auto max-w-[1380px] space-y-4">
        <OperationalPageHeader
          title="Napi munkapad"
          subtitle={currentUser?.name ? `${currentUser.name}, innen érdemes folytatni a mai munkát.` : "A következő ügy, feladat és határidő egy helyen."}
          secondaryActions={<QuietLink href={activeCase ? `/cases/${activeCase.id}/documents` : "/cases"}>Dokumentum feltöltése</QuietLink>}
          primaryAction={
            <Link href="/cases?newCase=1" className="bg-[var(--adm-green-800)] px-4 py-2 text-[12px] font-semibold text-[var(--adm-ivory-50)]">
              Új ügy
            </Link>
          }
        />

        {error ? <SafePanelError onRetry={() => void load()} detail="A fő munkalista most nem érhető el; a többi munkaterület továbbra is használható." /> : null}

        <section aria-labelledby="dashboard-next-heading">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="dashboard-next-heading" className="font-serif text-[22px] font-medium text-[var(--adm-text)]">Itt folytasd</h2>
            {primary ? <span className="text-[11px] text-[var(--adm-text-muted)]">1 kiemelt lépés</span> : null}
          </div>
          {loading ? (
            <CompactState title="A következő lépés betöltése…" />
          ) : primary ? (
            <FocusRow item={primary} dominant />
          ) : (
            <CompactState
              title="Nincs kiemelt következő lépés."
              detail="Nyiss meg egy ügyet, vagy hozz létre új feladatot."
              action={<QuietLink href="/cases">Ügyek megnyitása</QuietLink>}
            />
          )}
        </section>

        <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-4" aria-label="Napi munka összefoglaló">
          <SummaryCard label="Aktív ügyek" value={activeCaseCount} emptyLabel="Nincs aktív ügy" href="/cases" tone="petrol" />
          <SummaryCard label="Nyitott feladatok" value={openTasks.length} emptyLabel="Nincs nyitott feladat" href="/tasks" tone="amber" />
          <SummaryCard label="Közeli határidők" value={deadlines.length} emptyLabel="Nincs közeli határidő" href="/deadlines" tone="gold" />
          <SummaryCard label="Review tételek" value={stats?.stats.inReview ?? reviewTasks.length} emptyLabel="Nincs review tétel" href="/reviews" tone="navy" />
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.7fr)]">
          <section className="border border-[var(--adm-border)] bg-white" aria-labelledby="dashboard-work-heading">
            <div className="flex items-center justify-between border-b border-[var(--adm-border)] px-4 py-3">
              <h2 id="dashboard-work-heading" className="font-serif text-[20px] font-medium text-[var(--adm-text)]">Mai munka</h2>
              <QuietLink href="/tasks">Minden feladat</QuietLink>
            </div>
            {queue.length > 0 ? (
              <div className="divide-y divide-[var(--adm-border)]">
                {queue.map((item) => <FocusRow key={item.id} item={item} />)}
              </div>
            ) : (
              <div className="p-4"><CompactState title="Nincs további kiemelt tétel." detail="A nyitott feladatok a Feladatok oldalon érhetők el." /></div>
            )}
          </section>

          <div className="space-y-4">
            <section className="border border-[var(--adm-border)] bg-white">
              <div className="flex items-center justify-between border-b border-[var(--adm-border)] px-4 py-3">
                <h2 className="font-serif text-[19px] font-medium text-[var(--adm-text)]">Közelgő határidők</h2>
                <QuietLink href="/deadlines">Határidők</QuietLink>
              </div>
              <div className="divide-y divide-[var(--adm-border)]">
                {deadlines.slice(0, 4).map((item) => (
                  <Link key={item.id} href={item.href || item.source.href || "/deadlines"} className="block px-4 py-3 hover:bg-[var(--adm-surface)]">
                    <p className="truncate text-[12px] font-semibold text-[var(--adm-text)]">{item.title}</p>
                    <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{formatDate(item.dueAt)} · {item.source.displayName || item.sourceType}</p>
                  </Link>
                ))}
                {!loading && deadlines.length === 0 ? <div className="p-4"><CompactState title="Nincs közeli határidő." /></div> : null}
              </div>
            </section>

            <section className="border border-[var(--adm-border)] bg-white">
              <div className="flex items-center justify-between border-b border-[var(--adm-border)] px-4 py-3">
                <h2 className="font-serif text-[19px] font-medium text-[var(--adm-text)]">Review-ra vár</h2>
                <QuietLink href="/reviews">Review sor</QuietLink>
              </div>
              {reviewTasks.length > 0 ? (
                <div className="divide-y divide-[var(--adm-border)]">
                  {reviewTasks.slice(0, 3).map((task) => (
                    <Link key={task.id} href={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="block px-4 py-3 hover:bg-[var(--adm-surface)]">
                      <p className="truncate text-[12px] font-semibold text-[var(--adm-text)]">{task.title}</p>
                      <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{task.case?.caseNumber || "Review tétel"} · {formatDate(task.dueDate)}</p>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="p-4"><CompactState title="Nincs review-ra váró tétel." /></div>
              )}
            </section>
          </div>
        </div>

        {intake?.summary.total ? (
          <section className="border border-[var(--adm-border)] bg-white">
            <div className="flex items-center justify-between border-b border-[var(--adm-border)] px-4 py-3">
              <h2 className="font-serif text-[19px] font-medium text-[var(--adm-text)]">Beérkezési sor</h2>
              <QuietLink href="/intake">Ügyfelvétel</QuietLink>
            </div>
            <div className="divide-y divide-[var(--adm-border)]">
              {intake.items.slice(0, 4).map((item) => (
                <Link key={item.caseId} href={item.href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--adm-surface)]">
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-semibold text-[var(--adm-text)]">{item.displayName}</span>
                    <span className="mt-1 block text-[10px] text-[var(--adm-text-muted)]">{item.nextStep?.label || "Aktiválásra kész"}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-[var(--adm-text-muted)]">{item.readiness.completedRequiredItems}/{item.readiness.totalRequiredItems}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {visibleCommunications.length > 0 ? (
          <section className="border border-[var(--adm-border)] bg-white">
            <div className="flex items-center justify-between border-b border-[var(--adm-border)] px-4 py-3">
              <h2 className="font-serif text-[19px] font-medium text-[var(--adm-text)]">Kommunikáció</h2>
              <QuietLink href="/notifications">Kommunikációs munkatér</QuietLink>
            </div>
            <div className="grid divide-y divide-[var(--adm-border)] md:grid-cols-2 md:divide-x md:divide-y-0">
              {visibleCommunications.map((item) => (
                <Link key={item.id} href="/notifications" className="min-w-0 px-4 py-3 hover:bg-[var(--adm-surface)]">
                  <p className="truncate text-[11px] font-semibold text-[var(--adm-text)]">{item.senderName || item.senderEmail || "Kommunikáció"}</p>
                  <p className="mt-1 truncate text-[12px] text-[var(--adm-text)]">{item.subject || "Nincs tárgy"}</p>
                  <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{item.case?.caseNumber || item.client?.name || "Nincs ügyhöz rendelve"}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {(recentDocuments.length > 0 || news.length > 0) ? (
          <details className="border border-[var(--adm-border)] bg-white">
            <summary className="cursor-pointer px-4 py-3 text-[12px] font-semibold text-[var(--adm-text)]">További jelzések</summary>
            <div className="grid gap-4 border-t border-[var(--adm-border)] p-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-[11px] font-semibold text-[var(--adm-text)]">Legutóbbi dokumentumok</p>
                <div className="space-y-2">
                  {recentDocuments.map((item) => (
                    <Link key={item.id} href={item.caseId ? `/cases/${item.caseId}/documents` : "/documents/compare"} className="block text-[11px] text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]">
                      {formatActivityText(item.type, item.text)}
                    </Link>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold text-[var(--adm-text)]">Jogi hírek</p>
                <div className="space-y-2">
                  {news.map((article) => (
                    article.url ? (
                      <a key={`${article.title}-${article.date}`} href={article.url} target="_blank" rel="noreferrer" className="block text-[11px] text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]">
                        {article.title}
                      </a>
                    ) : <p key={`${article.title}-${article.date}`} className="text-[11px] text-[var(--adm-text-muted)]">{article.title}</p>
                  ))}
                </div>
              </div>
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
