"use client";

/**
 * Matter overview cockpit (MATTER-OVERVIEW-COCKPIT-1).
 *
 * Replaces the former vertical stack of equal-weight white modules. The layout is
 * organised so the first screen answers: what is urgent, what is next, who owns
 * it, what is due, what awaits a reply, which document we are on, what is in
 * review. All summary semantics come from the server `cockpit` projection — this
 * component never invents an operational number.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getCaseResponsibility, getCaseWorkspace, startTask, type CaseResponsibilityResponse, type CaseWorkspace } from "@/lib/api";
import { listTaskLifecycleItems, type TaskLifecycleListItem } from "@/lib/taskLifecycleApi";
import { getCaseStatusLabel } from "@/lib/caseLabels";
import { taskStatusLabel } from "@/lib/taskWorkflowPresentation";
import { attentionPresentation, type AttentionCategory } from "@/lib/attentionCategory";
import { CompactState, SafePanelError } from "@/components/adminiculum/OperationalPrimitives";
import { AdminButton } from "@/components/adminiculum/ui";
import { ClientAccent } from "@/components/clients/ClientAccent";
import { DocumentWorkCard } from "@/components/documents/DocumentWorkCard";
import { CaseWorkPackagePanel } from "@/components/cases/CaseWorkPackagePanel";
import { AIPromptPreparationModal } from "@/components/ai-prompts/AIPromptPreparationModal";
import { TaskSubmissionWorkspace } from "@/components/tasks/TaskSubmissionWorkspace";
import {
  TaskFormModal, DocumentUploadModal, CaseCommentModal, DocumentCommentsModal,
} from "@/components/cases/CaseWorkspaceActions";
import {
  ACCENT, KpiCard, CockpitSection, ActionableEmpty, DeadlineRow, TaskCard,
  StartingContextPanel,
  fmtDate, fmtDateTime, type Accent,
} from "@/components/cases/CaseCockpitPanels";

type WorkspaceTask = CaseWorkspace["tasks"][number];
type WorkspaceDoc = CaseWorkspace["documents"][number];

type ModalState =
  | null
  | { type: "task-create" }
  | { type: "task-edit"; task: WorkspaceTask }
  | { type: "deadline-create" }
  | { type: "doc-upload" }
  | { type: "case-comment" }
  | { type: "doc-comments"; doc: WorkspaceDoc };

function isAttention(v: string | null): v is AttentionCategory {
  return v === "QUICK_SCAN" || v === "APPROVAL" || v === "SIGNATURE" || v === "EDITING" || v === "DETAILED_REVIEW";
}

const URGENCY_STYLE: Record<string, { label: string; accent: Accent }> = {
  CRITICAL: { label: "Sürgős beavatkozás", accent: "terracotta" },
  ATTENTION: { label: "Figyelmet igényel", accent: "ochre" },
  STEADY: { label: "Ütemben", accent: "green" },
};

export function CaseWorkspaceOverview({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [ws, setWs] = useState<CaseWorkspace | null>(null);
  const [responsibility, setResponsibility] = useState<CaseResponsibilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [lifecycleTasks, setLifecycleTasks] = useState<TaskLifecycleListItem[]>([]);
  const [selectedLifecycleTask, setSelectedLifecycleTask] = useState<TaskLifecycleListItem | null>(null);


  const load = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const [workspace, caseResponsibility, lifecycle] = await Promise.all([
        getCaseWorkspace(caseId),
        getCaseResponsibility(caseId).catch(() => null),
        listTaskLifecycleItems(),
      ]);
      setWs(workspace);
      setResponsibility(caseResponsibility);
      setLifecycleTasks(lifecycle.filter((task) => task.case.id === caseId));
    }
    catch {
      if (!background) setError("Az ügy-munkatér most nem tölthető be.");
    }
    finally {
      if (!background) setLoading(false);
    }
  }, [caseId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await load({ background: true }); }
    finally { setRefreshing(false); }
  }, [load]);

  useEffect(() => { void load(); }, [load]);

  const quickStatus = useCallback(async (task: WorkspaceTask) => {
    if (rowBusy) return;
    setRowBusy(task.id); setActionError(null);
    try {
      await startTask(task.id);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "A státuszváltás nem sikerült.");
    } finally { setRowBusy(null); }
  }, [rowBusy, refresh]);

  const tasksById = useMemo(() => new Map((ws?.tasks || []).map((t) => [t.id, t])), [ws?.tasks]);

  if (loading) {
    return <div className="rounded-lg bg-white"><CompactState title="Az ügy-munkatér betöltése…" /></div>;
  }
  if (error || !ws) {
    return <div role="alert"><SafePanelError onRetry={() => void load()} detail={error || "Az ügy-munkatér most nem érhető el."} /></div>;
  }

  const c = ws.case;
  const cp = ws.cockpit;
  const warn = (section: string) => ws.warnings.find(
    (w) => w.section === section && w.code !== "DOCUMENT_META_LIMITED" && w.code !== "CASE_TIME_NOT_ATTRIBUTABLE",
  );
  const urgency = URGENCY_STYLE[cp.urgency] || URGENCY_STYLE.STEADY;
  const reviewer = responsibility?.collaborators.find((collaborator) => collaborator.role.toUpperCase() === "REVIEWER")?.user.name || null;
  const priorityLabel = { URGENT: "Sürgős", HIGH: "Magas", MEDIUM: "Közepes", LOW: "Alacsony" }[c.priority.toUpperCase()] || c.priority;
  const clientRoleLabel = {
    CLIENT: "Ügyfél",
    COUNTERPARTY: "Ellenérdekű fél",
    OPPOSING_COUNSEL: "Ellenérdekű képviselő",
    BENEFICIARY: "Kedvezményezett",
  }[c.clientRole?.toUpperCase() || ""] || c.clientRole;
  const groupTasks = (ids: string[]) => ids.map((id) => tasksById.get(id)).filter(Boolean) as WorkspaceTask[];
  const immediate = groupTasks(cp.taskGroups.immediate);
  const today = groupTasks(cp.taskGroups.today);
  const later = groupTasks(cp.taskGroups.later);
  const replyNeeded = new Set(cp.replyNeeded);
  const allDeadlines = [
    ...cp.deadlineGroups.today, ...cp.deadlineGroups.tomorrow,
    ...cp.deadlineGroups.thisWeek, ...cp.deadlineGroups.later,
  ];

  const taskRow = (t: WorkspaceTask, accent: Accent) => (
    <div key={t.id} className="border-b border-[rgba(22,32,26,0.06)] last:border-b-0">
      <TaskCard
        task={t}
        accent={accent}
        statusLabel={taskStatusLabel(t.status)}
        attentionLabel={isAttention(t.attentionCategory) ? attentionPresentation(t.attentionCategory).label : null}
        onEdit={() => setModal({ type: "task-edit", task: t })}
      />
      <div className="flex flex-wrap items-center gap-2 px-3 pb-2 pl-[26px]">
        {t.status.toUpperCase() === "BLOCKED" ? (
          <span data-testid="task-blocked-hint" className="inline-flex items-center gap-1.5 rounded-full bg-[#FBF3E0] px-2 py-0.5 text-[10.5px] font-semibold text-[#8A6A2A]">
            Várakozik
            {t.blockedPredecessors ? (
              <span className="font-normal text-[#7B776D]">· {t.blockedPredecessors.total} előfeltételből {t.blockedPredecessors.done} készült el</span>
            ) : null}
          </span>
        ) : t.status.toUpperCase() === "TODO" || t.status.toUpperCase() === "PENDING" ? (
          <AdminButton variant="neutral" size="xs" disabled={rowBusy === t.id} onClick={() => void quickStatus(t)}>
            {rowBusy === t.id ? "…" : "Indítás"}
          </AdminButton>
        ) : ["IN_PROGRESS", "IN_REVIEW", "SUBMITTED", "RETURNED"].includes(t.status.toUpperCase()) ? (
          <AdminButton
            variant={t.status.toUpperCase() === "IN_REVIEW" || t.status.toUpperCase() === "SUBMITTED" ? "primary" : "neutral"}
            size="xs"
            disabled={!lifecycleTasks.some((task) => task.id === t.id)}
            onClick={() => setSelectedLifecycleTask(lifecycleTasks.find((task) => task.id === t.id) || null)}
            data-testid="task-submission-workspace"
          >
            {t.status.toUpperCase() === "IN_REVIEW" || t.status.toUpperCase() === "SUBMITTED" ? "Review megnyitása" : "Leadás megnyitása"}
          </AdminButton>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {refreshing ? <div aria-live="polite" className="text-[11px] font-semibold text-[var(--adm-text-muted)]">Frissítés…</div> : null}
      {actionError ? (
        <div role="alert" className={`rounded-md px-3 py-2 text-[12px] font-semibold ${ACCENT.terracotta.soft} ${ACCENT.terracotta.text}`}>{actionError}</div>
      ) : null}

      {/* ---- 1. Matter hero ------------------------------------------------ */}
      <section aria-label="Ügy fejléc" data-testid="matter-hero" className="overflow-hidden rounded-lg bg-white shadow-[0_1px_2px_rgba(22,32,26,0.06),0_10px_28px_rgba(0,42,35,0.05)]">
        <div className={`h-1 w-full ${ACCENT[urgency.accent].bar}`} aria-hidden="true" />
        <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <ClientAccent colorKey={c.client?.colorKey ?? null} className="h-2.5 w-2.5 shrink-0 rounded-full" />
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">{c.caseNumber}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ACCENT[urgency.accent].soft} ${ACCENT[urgency.accent].text}`}>
                {urgency.label}
              </span>
            </div>
            <h1 className="mt-1 font-serif text-[27px] font-semibold leading-tight text-[var(--adm-text)]">{c.title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-[var(--adm-text-muted)]">
              <span className="font-semibold text-[var(--adm-text)]">{c.client?.name || "Nincs ügyfél"}</span>
              <span aria-hidden="true">·</span><span>{c.matterType || "Ügytípus nincs"}</span>
              <span aria-hidden="true">·</span><span>{getCaseStatusLabel(c.status)}</span>
            </p>
            <dl data-testid="case-summary-fields" className="mt-2.5 grid grid-cols-2 gap-x-5 gap-y-2 text-[11px] sm:grid-cols-3 xl:grid-cols-6">
              <div><dt className="text-[9px] font-bold uppercase tracking-wide text-[var(--adm-text-muted)]">Prioritás</dt><dd className="font-semibold">{priorityLabel}</dd></div>
              <div><dt className="text-[9px] font-bold uppercase tracking-wide text-[var(--adm-text-muted)]">Felelős</dt><dd className="truncate font-semibold">{cp.responsible?.name || "Nincs kijelölve"}</dd></div>
              <div><dt className="text-[9px] font-bold uppercase tracking-wide text-[var(--adm-text-muted)]">Ellenőrző</dt><dd className="truncate font-semibold">{reviewer || "Nincs adat"}</dd></div>
              <div><dt className="text-[9px] font-bold uppercase tracking-wide text-[var(--adm-text-muted)]">Határidő</dt><dd className="font-semibold">{fmtDate(c.deadline)}</dd></div>
              <div><dt className="text-[9px] font-bold uppercase tracking-wide text-[var(--adm-text-muted)]">Ügyfél szerepe</dt><dd className="truncate font-semibold">{clientRoleLabel || "Nincs adat"}</dd></div>
              {c.matterId ? <div><dt className="text-[9px] font-bold uppercase tracking-wide text-[var(--adm-text-muted)]">Matter</dt><dd><Link href={`/matters/${encodeURIComponent(c.matterId)}`} className="font-semibold text-[var(--adm-green-800)] hover:underline">Megnyitás</Link></dd></div> : null}
            </dl>
            <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1.5">
              <span className="min-w-0">
                <span className="block text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Következő lépés</span>
                <span data-testid="hero-next-step" className={`block truncate text-[12.5px] font-semibold ${ACCENT.petrol.text}`}>
                  {cp.nextStep ? cp.nextStep.label : "Nincs kijelölt következő lépés"}
                </span>
              </span>
              <span className="min-w-0">
                <span className="block text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Következő határidő</span>
                <span data-testid="hero-next-deadline" className={`block truncate text-[12.5px] font-semibold ${cp.kpi.deadlines.nextDueAt ? ACCENT.terracotta.text : "text-[var(--adm-text-muted)]"}`}>
                  {cp.kpi.deadlines.nextDueAt ? fmtDateTime(cp.kpi.deadlines.nextDueAt) : "Nincs határidő"}
                </span>
              </span>
            </div>
          </div>
          {/* Primary actions — secondary links must not compete with these. */}
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <AdminButton variant="primary" size="sm" onClick={() => setModal({ type: "task-create" })}>Új feladat</AdminButton>
            <AdminButton variant="neutral" size="sm" onClick={() => setModal({ type: "case-comment" })}>Kommunikáció hozzáadása</AdminButton>
            <AdminButton variant="neutral" size="sm" onClick={() => setModal({ type: "doc-upload" })}>Dokumentum feltöltése</AdminButton>
          </div>
        </div>
      </section>

      {/* ---- 2. Functional KPI row ----------------------------------------- */}
      <section aria-label="Operatív mutatók" data-testid="kpi-row" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard targetId="ck-tasks" label="Nyitott feladatok" accent={cp.kpi.openTasks.urgentCount > 0 ? "terracotta" : "petrol"}
          emphasised={cp.kpi.openTasks.urgentCount > 0} value={cp.kpi.openTasks.count} secondary={cp.kpi.openTasks.secondary} />
        <KpiCard targetId="ck-deadlines" label="Közelgő határidők" accent="terracotta"
          emphasised={cp.deadlineGroups.today.length > 0} value={cp.kpi.deadlines.count} secondary={cp.kpi.deadlines.secondary} />
        <KpiCard targetId="ck-comms" label="Kommunikáció" accent="terracotta"
          emphasised={cp.kpi.communication.replyNeededCount > 0} value={cp.kpi.communication.count} secondary={cp.kpi.communication.secondary} />
        <KpiCard targetId="ck-tasks" label="Review tételek" accent="navy"
          emphasised={cp.kpi.review.count > 0} value={cp.kpi.review.count} secondary={cp.kpi.review.secondary} />
        <KpiCard targetId="ck-documents" label="Aktív dokumentumok" accent="ochre"
          emphasised={cp.kpi.activeDocuments.count > 0} value={cp.kpi.activeDocuments.count} secondary={cp.kpi.activeDocuments.secondary} />
        <KpiCard targetId="ck-tasks" label="Következő lépés" accent="petrol"
          value={<span className="text-[14px] font-semibold leading-tight">{cp.nextStep ? "Kijelölve" : "Nincs"}</span>}
          secondary={cp.nextStep ? cp.nextStep.label : "Jelölj ki teendőt"} />
      </section>

      {/* ---- 2b. Legal work context ---------------------------------------- */}
      <StartingContextPanel
        context={c.startingContext}
        description={c.description}
        onAddContext={() => setModal({ type: "case-comment" })}
      />

      {/* ---- 2c. Work package operational block ----------------------------- */}
      <div className="flex justify-end">
        <AdminButton variant="neutral" size="xs" onClick={() => setAiPromptOpen(true)}>AI előkészítés</AdminButton>
      </div>
      <CaseWorkPackagePanel
        caseId={caseId}
        onTaskCreated={() => void refresh()}
      />

      {/* ---- 3. Two-column operational layout ------------------------------ */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* -------- Left: work and time pressure -------- */}
        <div className="min-w-0 space-y-4">
          <CockpitSection id="ck-tasks" title="Aktív munka" accent="petrol" count={ws.tasks.length}
            action={<AdminButton variant="primary" size="xs" onClick={() => setModal({ type: "task-create" })}>+ Feladat</AdminButton>}>
            {warn("tasks") ? (
              <ActionableEmpty message="A feladatok most nem érhetők el." actionLabel="Újratöltés" onAction={() => void refresh()} />
            ) : ws.tasks.length === 0 ? (
              <ActionableEmpty message="Nincs nyitott feladat ezen az ügyön." actionLabel="Első feladat létrehozása" onAction={() => setModal({ type: "task-create" })} />
            ) : (
              <div>
                {immediate.length > 0 ? (
                  <div data-testid="task-group-immediate">
                    <p className={`px-3 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] ${ACCENT.terracotta.text}`}>Azonnali</p>
                    {immediate.map((t) => taskRow(t, "terracotta"))}
                  </div>
                ) : null}
                {today.length > 0 ? (
                  <div data-testid="task-group-today">
                    <p className={`px-3 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] ${ACCENT.ochre.text}`}>Ma</p>
                    {today.map((t) => taskRow(t, "ochre"))}
                  </div>
                ) : null}
                {later.length > 0 ? (
                  <div data-testid="task-group-later">
                    <p className="px-3 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Később</p>
                    {later.map((t) => taskRow(t, "neutral"))}
                  </div>
                ) : null}
              </div>
            )}
          </CockpitSection>

          <CockpitSection id="ck-deadlines" title="Határidők" accent="terracotta" count={cp.kpi.deadlines.count}
            action={<AdminButton variant="neutral" size="xs" onClick={() => setModal({ type: "deadline-create" })}>+ Határidő</AdminButton>}>
            {allDeadlines.length === 0 ? (
              <ActionableEmpty message="Nincs rögzített határidő." actionLabel="Határidő hozzáadása" onAction={() => setModal({ type: "deadline-create" })} />
            ) : (
              <div data-testid="deadline-timeline">
                {([
                  ["Ma", cp.deadlineGroups.today],
                  ["Holnap", cp.deadlineGroups.tomorrow],
                  ["Ezen a héten", cp.deadlineGroups.thisWeek],
                  ["Később", cp.deadlineGroups.later],
                ] as const).map(([label, items]) => items.length > 0 ? (
                  <div key={label}>
                    <p className="px-3 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">{label}</p>
                    <ul className="divide-y divide-[rgba(22,32,26,0.06)]">
                      {items.map((d) => <DeadlineRow key={d.id} d={d} />)}
                    </ul>
                  </div>
                ) : null)}
              </div>
            )}
          </CockpitSection>
        </div>

        {/* -------- Right: correspondence and documents -------- */}
        <div className="min-w-0 space-y-4">
          <CockpitSection id="ck-comms" title="Kommunikáció" accent="terracotta" count={cp.kpi.communication.count}
            action={<Link href={`/cases/${caseId}/communications`} className="text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">Napló →</Link>}>
            {warn("communications") ? (
              <ActionableEmpty message="A kommunikáció most nem érhető el." actionLabel="Újratöltés" onAction={() => void refresh()} />
            ) : ws.communications.length === 0 ? (
              <ActionableEmpty message="Ehhez az ügyhöz még nincs kommunikáció." actionLabel="E-mail thread hozzárendelése" href={`/cases/${caseId}/communications`} />
            ) : (
              <ul className="divide-y divide-[rgba(22,32,26,0.06)]">
                {ws.communications.slice(0, 6).map((m) => {
                  const needsReply = replyNeeded.has(m.id);
                  return (
                    <li key={m.id} className="px-3 py-2.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-[12.5px] font-semibold text-[var(--adm-text)]">{m.subject || "Nincs tárgy"}</span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {needsReply ? (
                            <span data-testid="reply-needed" className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${ACCENT.terracotta.soft} ${ACCENT.terracotta.text}`}>Válaszra vár</span>
                          ) : null}
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${m.internal ? `${ACCENT.green.soft} ${ACCENT.green.text}` : `${ACCENT.terracotta.soft} ${ACCENT.terracotta.text}`}`}>
                            {m.internal ? "Belső" : "Külső"}
                          </span>
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-[var(--adm-text-muted)]">
                        {m.sender || "Nincs forrásadat"} · {m.type} · {fmtDateTime(m.timestamp)}
                      </p>
                      {m.contentPreview ? <p className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-[var(--adm-text-muted)]">{m.contentPreview}</p> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CockpitSection>

          <CockpitSection id="ck-documents" title="Dokumentumok" accent="ochre" count={cp.kpi.activeDocuments.count}
            action={<AdminButton variant="neutral" size="xs" onClick={() => setModal({ type: "doc-upload" })}>+ Feltöltés</AdminButton>}>
            {warn("documents") ? (
              <ActionableEmpty message="A dokumentumok most nem érhetők el." actionLabel="Újratöltés" onAction={() => void refresh()} />
            ) : cp.activeDocuments.length === 0 ? (
              <ActionableEmpty message="Nincs aktív munkairat." actionLabel="Dokumentum feltöltése" onAction={() => setModal({ type: "doc-upload" })} />
            ) : (
              <ul data-testid="active-documents" className="divide-y divide-[rgba(22,32,26,0.06)]">
                {cp.activeDocuments.map((d) => {
                  const full = ws.documents.find((x) => x.id === d.id);
                  const reasonLabel = d.reason === "REVIEW_PENDING" ? "Review-ra vár"
                    : d.reason === "DEADLINE_PASSED" ? "Határidő lejárt" : "Munka alatt";
                  const reasonAccent: Accent = d.reason === "REVIEW_PENDING" ? "navy"
                    : d.reason === "DEADLINE_PASSED" ? "terracotta" : "ochre";
                  return (
                    <li key={d.id} className="px-2 py-2">
                      <span className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${ACCENT[reasonAccent].soft} ${ACCENT[reasonAccent].text}`}>
                          {reasonLabel}
                        </span>
                        {/* Document comments stay reachable from the cockpit. */}
                        {full ? (
                          <AdminButton variant="neutral" size="xs" onClick={() => setModal({ type: "doc-comments", doc: full })}>
                            Kommentek{full.commentCount ? ` (${full.commentCount})` : ""}
                          </AdminButton>
                        ) : null}
                      </span>
                      {/* Compact operational work card — title, instruction, owner,
                          reviewer, due date and linked task, not a filename row. */}
                      <DocumentWorkCard
                        documentId={d.id}
                        compact
                        caseTasks={ws.tasks}
                        onChanged={() => void refresh()}
                        onOpen={() => router.push(`/cases/${caseId}/documents?documentId=${encodeURIComponent(d.id)}`)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </CockpitSection>
        </div>
      </div>

      {/* ---- 4. Secondary area: notes, activity, time ----------------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CockpitSection id="ck-notes" title="Jegyzetek" accent="green" count={ws.comments.length}
          action={<AdminButton variant="neutral" size="xs" onClick={() => setModal({ type: "case-comment" })}>+ Megjegyzés</AdminButton>}>
          {ws.comments.length === 0 ? (
            <ActionableEmpty message="Nincs belső megjegyzés." actionLabel="Első megjegyzés létrehozása" onAction={() => setModal({ type: "case-comment" })} />
          ) : (
            <ul className="divide-y divide-[rgba(22,32,26,0.06)]">
              {ws.comments.slice(0, 4).map((n) => (
                <li key={n.id} className="px-3 py-2">
                  <p className="line-clamp-2 text-[12px] text-[var(--adm-text)]">{n.content}</p>
                  <p className="mt-0.5 text-[10px] text-[var(--adm-text-muted)]">{n.author?.name || "Rendszer"} · {fmtDate(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </CockpitSection>

        {/* Structured activity: actor / action / object / time as separate parts. */}
        <CockpitSection id="ck-activity" title="Aktivitás" accent="petrol">
          {ws.activity.length === 0 ? (
            <ActionableEmpty message="Még nincs rögzített aktivitás." actionLabel="Első feladat létrehozása" onAction={() => setModal({ type: "task-create" })} />
          ) : (
            <ul data-testid="activity-feed" className="divide-y divide-[rgba(22,32,26,0.06)]">
              {ws.activity.slice(0, 6).map((a) => (
                <li key={a.id} className="px-3 py-2">
                  <p className="text-[12px] leading-5 text-[var(--adm-text)]">
                    <span className="font-semibold">{a.actor || "Rendszer"}</span>{" "}
                    <span className="text-[var(--adm-text-muted)]">{a.actionLabel}</span>{" "}
                    <span className="font-medium">{a.objectLabel}</span>
                  </p>
                  <p className="mt-0.5 text-[10px] text-[var(--adm-text-soft)]">{fmtDateTime(a.occurredAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </CockpitSection>

        {/* Time stays secondary and honest — never a fabricated figure. */}
        <CockpitSection id="ck-time" title="Munkaidő" accent="neutral">
          {ws.time.available ? (
            <div className="px-3 py-3 text-[12.5px] text-[var(--adm-text)]">
              Rögzített ügyidő: <span className="font-semibold">{ws.time.loggedMinutes} perc</span>
            </div>
          ) : (
            <div className="px-3 py-3">
              <p className="text-[11.5px] font-semibold text-[var(--adm-text)]">Nem áll rendelkezésre megbízható ügy-szintű összesítés.</p>
              <p className="mt-1 text-[10.5px] leading-4 text-[var(--adm-text-muted)]">
                A munkaidő (TimeEntry) jelenleg nem köthető közvetlenül ügyhöz; a Matter-idő nem jeleníthető meg ügyidőként.
              </p>
            </div>
          )}
          <div className="px-3 pb-3">
            <Link href={`/time-entries?caseId=${encodeURIComponent(caseId)}`} className="text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">
              Munkaidő rögzítése
            </Link>
          </div>
        </CockpitSection>
      </div>

      {/* ---- inline action modals ------------------------------------------ */}
      {modal?.type === "task-create" ? <TaskFormModal caseId={caseId} mode="create" onClose={() => setModal(null)} onSaved={() => void refresh()} /> : null}
      {modal?.type === "task-edit" ? <TaskFormModal caseId={caseId} mode="edit" task={modal.task} onClose={() => setModal(null)} onSaved={() => void refresh()} /> : null}
      {modal?.type === "deadline-create" ? <TaskFormModal caseId={caseId} mode="create" deadlineMode onClose={() => setModal(null)} onSaved={() => void refresh()} /> : null}
      {modal?.type === "doc-upload" ? <DocumentUploadModal caseId={caseId} onClose={() => setModal(null)} onSaved={() => void refresh()} /> : null}
      {modal?.type === "case-comment" ? <CaseCommentModal caseId={caseId} onClose={() => setModal(null)} onSaved={() => void refresh()} /> : null}
      {modal?.type === "doc-comments" ? <DocumentCommentsModal documentId={modal.doc.id} documentName={modal.doc.fileName} onClose={() => setModal(null)} onSaved={() => void refresh()} /> : null}
      {aiPromptOpen ? <AIPromptPreparationModal caseId={caseId} onClose={() => setAiPromptOpen(false)} /> : null}
      {selectedLifecycleTask ? <TaskSubmissionWorkspace item={selectedLifecycleTask} onClose={() => setSelectedLifecycleTask(null)} onWorkflowChanged={refresh} /> : null}

    </div>
  );
}
