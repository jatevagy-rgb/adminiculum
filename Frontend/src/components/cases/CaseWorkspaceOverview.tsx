"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getCaseWorkspace, startTask, submitTask, type CaseWorkspace } from "@/lib/api";
import { getCaseStatusLabel } from "@/lib/caseLabels";
import { taskStatusLabel } from "@/lib/taskWorkflowPresentation";
import { attentionPresentation, formatEstimateRange, type AttentionCategory } from "@/lib/attentionCategory";
import { CompactState, SafePanelError } from "@/components/adminiculum/OperationalPrimitives";
import { AdminButton, AdminStatusPill } from "@/components/adminiculum/ui";
import { ClientAccent } from "@/components/clients/ClientAccent";
import {
  TaskFormModal,
  DocumentUploadModal,
  CaseCommentModal,
  DocumentCommentsModal,
} from "@/components/cases/CaseWorkspaceActions";

type WorkspaceTask = CaseWorkspace["tasks"][number];
type WorkspaceDoc = CaseWorkspace["documents"][number];

type ModalState =
  | null
  | { type: "task-create" }
  | { type: "task-edit"; task: WorkspaceTask }
  | { type: "deadline-create" }
  | { type: "deadline-edit"; task: WorkspaceTask }
  | { type: "doc-upload" }
  | { type: "case-comment" }
  | { type: "doc-comments"; doc: WorkspaceDoc };

function fmtDate(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("hu-HU");
}
function fmtDateTime(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("hu-HU", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function isAttention(v: string | null): v is AttentionCategory {
  return v === "QUICK_SCAN" || v === "APPROVAL" || v === "SIGNATURE" || v === "EDITING" || v === "DETAILED_REVIEW";
}

function Panel({ id, title, action, children }: { id: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="overflow-hidden rounded-xl border border-[var(--adm-border)] bg-white shadow-[0_10px_28px_rgba(0,42,35,0.035)]" aria-labelledby={`${id}-h`}>
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--adm-border)] px-4 py-3">
        <h3 id={`${id}-h`} className="font-serif text-[18px] font-medium text-[var(--adm-text)]">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ title }: { title: string }) {
  return <div className="px-4 py-5 text-[12px] text-[var(--adm-text-muted)]">{title}</div>;
}

function SummaryCard({ label, value, target }: { label: string; value: React.ReactNode; target: string }) {
  return (
    <a href={`#${target}`} className="block rounded-xl border border-[var(--adm-border)] bg-white p-3 shadow-[0_8px_24px_rgba(0,42,35,0.03)] transition-colors hover:bg-[var(--adm-ivory-100)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)] focus-visible:ring-offset-2">
      <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">{label}</span>
      <span className="mt-1 block font-serif text-[24px] font-medium text-[var(--adm-text)]">{value}</span>
    </a>
  );
}

/** Secondary (non-dominant) link into a legacy compatibility route for full detail. */
function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">{children}</Link>;
}

export function CaseWorkspaceOverview({ caseId }: { caseId: string }) {
  const [ws, setWs] = useState<CaseWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWs(await getCaseWorkspace(caseId));
    } catch {
      setError("Az ügy-munkatér most nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  // Panel-consistent refetch after an inline action — no full remount, no page reload.
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setWs(await getCaseWorkspace(caseId));
    } catch {
      /* keep last-good projection; surfaced errors come from the action itself */
    } finally {
      setRefreshing(false);
    }
  }, [caseId]);

  useEffect(() => { void load(); }, [load]);

  const quickStatus = useCallback(async (task: WorkspaceTask, kind: "start" | "submit") => {
    if (rowBusy) return;
    setRowBusy(task.id);
    setActionError(null);
    try {
      if (kind === "start") await startTask(task.id);
      else await submitTask(task.id);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "A státuszváltás nem sikerült.");
    } finally {
      setRowBusy(null);
    }
  }, [rowBusy, refresh]);

  if (loading) {
    return <div className="rounded-xl border border-[var(--adm-border)] bg-white"><CompactState title="Az ügy-munkatér betöltése…" /></div>;
  }
  if (error || !ws) {
    return <div role="alert"><SafePanelError onRetry={() => void load()} detail={error || "Az ügy-munkatér most nem érhető el."} /></div>;
  }

  const c = ws.case;
  const warn = (section: string) => ws.warnings.find((w) => w.section === section && w.code !== "DOCUMENT_META_LIMITED" && w.code !== "CASE_TIME_NOT_ATTRIBUTABLE");
  const timeValue = ws.time.available ? `${ws.time.loggedMinutes} perc` : "Nem elérhető";
  const statusUpper = (s: string) => s.toUpperCase();

  return (
    <div className="space-y-5">
      {refreshing ? <div aria-live="polite" className="text-[11px] font-semibold text-[var(--adm-text-muted)]">Frissítés…</div> : null}
      {actionError ? <div role="alert" className="rounded-md border border-[var(--adm-terracotta-700)] bg-[var(--adm-terracotta-50,#FBEBE7)] px-3 py-2 text-[12px] font-semibold text-[var(--adm-terracotta-700)]">{actionError}</div> : null}

      {/* A. Case header */}
      <section className="overflow-hidden rounded-xl border border-[var(--adm-border)] bg-white shadow-[0_10px_28px_rgba(0,42,35,0.035)]" aria-label="Ügyfejléc">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ClientAccent colorKey={c.client?.colorKey ?? null} className="h-2.5 w-2.5 shrink-0 rounded-full" />
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">{c.caseNumber}</p>
            </div>
            <h2 className="mt-1 font-serif text-[24px] font-medium text-[var(--adm-text)]">{c.title}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--adm-text-muted)]">
              <span>{c.client?.name || "Nincs ügyfél"}</span><span aria-hidden="true">·</span>
              <span>Felelős: {c.assignedLawyer?.name || "Nincs kijelölve"}</span><span aria-hidden="true">·</span>
              <span>Módosítva: {fmtDate(c.updatedAt)}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AdminStatusPill tone="sage">{getCaseStatusLabel(c.status)}</AdminStatusPill>
            <AdminStatusPill tone={c.priority === "URGENT" || c.priority === "HIGH" ? "amber" : "neutral"}>{c.priority}</AdminStatusPill>
          </div>
        </div>
      </section>

      {/* B. Instruction block (read-only in this slice) */}
      <section className="overflow-hidden rounded-xl border border-[var(--adm-border)] bg-[var(--adm-ivory-100)]" aria-label="Ügyvédi instrukció">
        <div className="border-b border-[var(--adm-border)] px-4 py-2.5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-green-800)]">Ügyvédi instrukció</p></div>
        <div className="space-y-3 px-4 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--adm-text-muted)]">Feladatleírás / instrukció</p>
            <p className="mt-1 whitespace-pre-line text-[13px] leading-6 text-[var(--adm-text)]">{c.description || "Ehhez az ügyhöz még nincs rögzített instrukció."}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--adm-text-muted)]">Következő lépés</p>
            <p className="mt-1 text-[13px] leading-6 text-[var(--adm-text)]">{c.nextStep || "Nincs rögzített következő lépés."}</p>
          </div>
        </div>
      </section>

      {/* C. Six summary cards */}
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6" aria-label="Összefoglaló metrikák">
        <SummaryCard label="Nyitott feladatok" value={ws.metrics.openTaskCount} target="cw-tasks" />
        <SummaryCard label="Dokumentumok" value={ws.metrics.documentCount} target="cw-documents" />
        <SummaryCard label="Munkaidő" value={timeValue === "Nem elérhető" ? <span className="text-[13px] font-semibold text-[var(--adm-text-muted)]">Nem elérhető</span> : timeValue} target="cw-time" />
        <SummaryCard label="Határidők" value={ws.metrics.openDeadlineCount} target="cw-deadlines" />
        <SummaryCard label="Review" value={ws.metrics.reviewCount ?? "—"} target="cw-tasks" />
        <SummaryCard label="Kommunikáció" value={ws.metrics.communicationCount} target="cw-comms" />
      </section>

      {/* D. Active tasks — inline create / edit / quick status */}
      <Panel id="cw-tasks" title="Aktív feladatok" action={
        <div className="flex items-center gap-3">
          <AdminButton variant="primary" size="xs" onClick={() => setModal({ type: "task-create" })}>+ Új feladat</AdminButton>
          <SecondaryLink href="/tasks">Minden feladat →</SecondaryLink>
        </div>
      }>
        {warn("tasks") ? <Empty title="A feladatok most nem érhetők el." /> : ws.tasks.length === 0 ? <Empty title="Nincs nyitott feladat ezen az ügyön." /> : (
          <div className="divide-y divide-[var(--adm-border)]">
            {ws.tasks.map((t) => (
              <div key={t.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/tasks?taskId=${encodeURIComponent(t.id)}`} className="text-[13px] font-semibold text-[var(--adm-text)] hover:underline">{t.title}</Link>
                  {isAttention(t.attentionCategory) ? <AdminStatusPill tone="sage">{attentionPresentation(t.attentionCategory).label}</AdminStatusPill> : null}
                </div>
                <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-[var(--adm-text-muted)]">
                  <span>{taskStatusLabel(t.status)}</span><span aria-hidden="true">·</span>
                  <span>{t.priority}</span><span aria-hidden="true">·</span>
                  <span>{t.assignee?.name || "Felelős nincs"}</span>
                  {isAttention(t.attentionCategory) && t.estimatedMinutes != null ? <><span aria-hidden="true">·</span><span>{formatEstimateRange(t.estimatedMinutes, t.estimatedMinutes)}</span></> : null}
                  <span aria-hidden="true">·</span><span>Határidő: {fmtDate(t.dueDate)}</span>
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <AdminButton variant="neutral" size="xs" onClick={() => setModal({ type: "task-edit", task: t })}>Szerkesztés</AdminButton>
                  {statusUpper(t.status) === "TODO" || statusUpper(t.status) === "PENDING" ? (
                    <AdminButton variant="neutral" size="xs" disabled={rowBusy === t.id} onClick={() => void quickStatus(t, "start")}>{rowBusy === t.id ? "…" : "Indítás"}</AdminButton>
                  ) : statusUpper(t.status) === "IN_PROGRESS" ? (
                    <AdminButton variant="neutral" size="xs" disabled={rowBusy === t.id} onClick={() => void quickStatus(t, "submit")}>{rowBusy === t.id ? "…" : "Beküldés review-ra"}</AdminButton>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* E. Documents — inline upload + per-document comments */}
      <Panel id="cw-documents" title="Dokumentumok" action={
        <div className="flex items-center gap-3">
          <AdminButton variant="primary" size="xs" onClick={() => setModal({ type: "doc-upload" })}>+ Feltöltés</AdminButton>
          <SecondaryLink href={`/cases/${caseId}/documents`}>Dokumentumtár →</SecondaryLink>
        </div>
      }>
        {warn("documents") ? <Empty title="A dokumentumok most nem érhetők el." /> : ws.documents.length === 0 ? <Empty title="Ehhez az ügyhöz még nincs dokumentum." /> : (
          <div className="divide-y divide-[var(--adm-border)]">
            {ws.documents.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-[var(--adm-text)]">{d.fileName}</p>
                  <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-[var(--adm-text-muted)]">
                    <span>{d.category || d.type || d.mimeType || "Dokumentum"}</span>
                    {d.version ? <><span aria-hidden="true">·</span><span>{d.version}</span></> : null}
                    <span aria-hidden="true">·</span><span>{fmtDate(d.uploadedAt)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <AdminButton variant="neutral" size="xs" onClick={() => setModal({ type: "doc-comments", doc: d })}>Kommentek{d.commentCount ? ` (${d.commentCount})` : ""}</AdminButton>
                  <SecondaryLink href={`/cases/${caseId}/documents`}>Megnyitás →</SecondaryLink>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* F. Deadlines — task-backed (create/edit via the underlying task, close = complete) */}
      <Panel id="cw-deadlines" title="Feladathatáridők" action={
        <div className="flex items-center gap-3">
          <AdminButton variant="primary" size="xs" onClick={() => setModal({ type: "deadline-create" })}>+ Határidős feladat</AdminButton>
          <SecondaryLink href="/deadlines">Határidők →</SecondaryLink>
        </div>
      }>
        {warn("tasks") ? <Empty title="A határidők most nem érhetők el." /> : ws.deadlines.length === 0 ? <Empty title="Nincs közelgő határidő ezen az ügyön." /> : (
          <div className="divide-y divide-[var(--adm-border)]">
            {ws.deadlines.map((d) => {
              const backingTask = d.taskId ? ws.tasks.find((t) => t.id === d.taskId) : null;
              return (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[var(--adm-text)]">{d.title}</p>
                    <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{fmtDate(d.dueAt)} · {d.assignee?.name || "Felelős nincs"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {backingTask ? <AdminButton variant="neutral" size="xs" onClick={() => setModal({ type: "deadline-edit", task: backingTask })}>Szerkesztés</AdminButton> : null}
                    {d.taskId ? <SecondaryLink href={`/tasks?taskId=${encodeURIComponent(d.taskId)}`}>Feladat →</SecondaryLink> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* G. Communications summary */}
      <Panel id="cw-comms" title="Kommunikációs kivonat" action={<SecondaryLink href="/notifications">Kommunikáció →</SecondaryLink>}>
        {warn("communications") ? <Empty title="A kommunikáció most nem érhető el." /> : ws.communications.length === 0 ? <Empty title="Ehhez az ügyhöz még nincs kommunikáció." /> : (
          <div className="divide-y divide-[var(--adm-border)]">
            {ws.communications.map((m) => (
              <div key={m.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-semibold text-[var(--adm-blue-950)]">{m.subject || "Nincs tárgy"}</span>
                  <span className="flex items-center gap-2"><span className="border border-[var(--adm-border)] bg-[var(--adm-surface)] px-2 py-0.5 text-[9px] font-semibold text-[var(--adm-text-muted)]">{m.internal ? "Belső" : "Külső"}</span><time className="text-[10px] text-[var(--adm-text-muted)]">{fmtDateTime(m.timestamp)}</time></span>
                </div>
                <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{m.sender || "Nincs forrásadat"} · {m.type}</p>
                {m.contentPreview ? <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-[var(--adm-text-muted)]">{m.contentPreview}</p> : null}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* H. Case notes (internal comments) — inline create */}
      <Panel id="cw-notes" title="Ügyjegyzetek" action={<AdminButton variant="primary" size="xs" onClick={() => setModal({ type: "case-comment" })}>+ Megjegyzés</AdminButton>}>
        {warn("comments") ? <Empty title="Az ügyjegyzetek most nem érhetők el." /> : ws.comments.length === 0 ? <Empty title="Még nincs belső megjegyzés ezen az ügyön." /> : (
          <ul className="divide-y divide-[var(--adm-border)]">
            {ws.comments.map((n) => (
              <li key={n.id} className="px-4 py-3">
                <p className="text-[12px] text-[var(--adm-text)]">{n.content}</p>
                <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{n.author?.name || "Rendszer"} · {fmtDateTime(n.createdAt)}{n.status === "RESOLVED" ? " · Lezárva" : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* I. Activity */}
      <Panel id="cw-activity" title="Ügy aktivitása">
        {warn("activity") ? <Empty title="Az aktivitás most nem érhető el." /> : ws.activity.length === 0 ? <Empty title="Még nincs rögzített aktivitás." /> : (
          <ul className="divide-y divide-[var(--adm-border)]">
            {ws.activity.map((a) => (
              <li key={a.id} className="px-4 py-3 text-[12px] text-[var(--adm-text)]">
                <span className="font-semibold">{a.actor || "Rendszer"}</span> {a.actionLabel}: <span className="text-[var(--adm-text-muted)]">{a.objectLabel}</span>
                <span className="ml-2 text-[10px] text-[var(--adm-text-soft)]">{fmtDateTime(a.occurredAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* J. Time (explicit unavailable state — never fake) */}
      <Panel id="cw-time" title="Munkaidő">
        {ws.time.available ? (
          <div className="px-4 py-4 text-[13px] text-[var(--adm-text)]">Rögzített ügyidő: <span className="font-semibold">{ws.time.loggedMinutes} perc</span></div>
        ) : (
          <div className="px-4 py-4">
            <p className="text-[12px] font-semibold text-[var(--adm-text)]">Nem áll rendelkezésre megbízható ügy-szintű összesítés.</p>
            <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">A munkaidő (TimeEntry) jelenleg nem köthető közvetlenül ügyhöz; a Matter-idő nem jeleníthető meg ügyidőként. Ehhez schema-változás szükséges.</p>
          </div>
        )}
      </Panel>

      {/* Inline action modals */}
      {modal?.type === "task-create" ? <TaskFormModal caseId={caseId} mode="create" onClose={() => setModal(null)} onSaved={() => void refresh()} /> : null}
      {modal?.type === "task-edit" ? <TaskFormModal caseId={caseId} mode="edit" task={modal.task} onClose={() => setModal(null)} onSaved={() => void refresh()} /> : null}
      {modal?.type === "deadline-create" ? <TaskFormModal caseId={caseId} mode="create" deadlineMode onClose={() => setModal(null)} onSaved={() => void refresh()} /> : null}
      {modal?.type === "deadline-edit" ? <TaskFormModal caseId={caseId} mode="edit" deadlineMode task={modal.task} onClose={() => setModal(null)} onSaved={() => void refresh()} /> : null}
      {modal?.type === "doc-upload" ? <DocumentUploadModal caseId={caseId} onClose={() => setModal(null)} onSaved={() => void refresh()} /> : null}
      {modal?.type === "case-comment" ? <CaseCommentModal caseId={caseId} onClose={() => setModal(null)} onSaved={() => void refresh()} /> : null}
      {modal?.type === "doc-comments" ? <DocumentCommentsModal documentId={modal.doc.id} documentName={modal.doc.fileName} onClose={() => setModal(null)} onSaved={() => void refresh()} /> : null}
    </div>
  );
}
