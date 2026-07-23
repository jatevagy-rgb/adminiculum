"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getCaseWorkspace, type CaseWorkspace } from "@/lib/api";
import { getCaseStatusLabel } from "@/lib/caseLabels";
import { taskStatusLabel } from "@/lib/taskWorkflowPresentation";
import { attentionPresentation, formatEstimateRange, type AttentionCategory } from "@/lib/attentionCategory";
import { CompactState, SafePanelError } from "@/components/adminiculum/OperationalPrimitives";
import { AdminButton, AdminStatusPill } from "@/components/adminiculum/ui";
import { ClientAccent } from "@/components/clients/ClientAccent";

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

export function CaseWorkspaceOverview({ caseId }: { caseId: string }) {
  const [ws, setWs] = useState<CaseWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <div className="rounded-xl border border-[var(--adm-border)] bg-white"><CompactState title="Az ügy-munkatér betöltése…" /></div>;
  }
  if (error || !ws) {
    return <div role="alert"><SafePanelError onRetry={() => void load()} detail={error || "Az ügy-munkatér most nem érhető el."} /></div>;
  }

  const c = ws.case;
  const warn = (section: string) => ws.warnings.find((w) => w.section === section && w.code !== "DOCUMENT_META_LIMITED" && w.code !== "CASE_TIME_NOT_ATTRIBUTABLE");
  const timeValue = ws.time.available ? `${ws.time.loggedMinutes} perc` : "Nem elérhető";

  return (
    <div className="space-y-5">
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

      {/* D. Active tasks */}
      <Panel id="cw-tasks" title="Aktív feladatok" action={<Link href="/tasks" className="text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">Minden feladat →</Link>}>
        {warn("tasks") ? <Empty title="A feladatok most nem érhetők el." /> : ws.tasks.length === 0 ? <Empty title="Nincs nyitott feladat ezen az ügyön." /> : (
          <div className="divide-y divide-[var(--adm-border)]">
            {ws.tasks.map((t) => (
              <Link key={t.id} href={`/tasks?taskId=${encodeURIComponent(t.id)}`} className="block px-4 py-3 hover:bg-[var(--adm-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--adm-green-800)]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-[var(--adm-text)]">{t.title}</span>
                  {isAttention(t.attentionCategory) ? <AdminStatusPill tone="sage">{attentionPresentation(t.attentionCategory).label}</AdminStatusPill> : null}
                </div>
                <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-[var(--adm-text-muted)]">
                  <span>{taskStatusLabel(t.status)}</span><span aria-hidden="true">·</span>
                  <span>{t.priority}</span><span aria-hidden="true">·</span>
                  <span>{t.assignee?.name || "Felelős nincs"}</span>
                  {isAttention(t.attentionCategory) ? <><span aria-hidden="true">·</span><span>{t.estimatedMinutes != null ? formatEstimateRange(t.estimatedMinutes, t.estimatedMinutes) : formatEstimateRange(0, 0) || attentionPresentation(t.attentionCategory).label}</span></> : null}
                  <span aria-hidden="true">·</span><span>Határidő: {fmtDate(t.dueDate)}</span>
                </p>
              </Link>
            ))}
          </div>
        )}
      </Panel>

      {/* E. Documents */}
      <Panel id="cw-documents" title="Dokumentumok" action={<Link href={`/cases/${caseId}/documents`} className="text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">Dokumentumtár →</Link>}>
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
                <Link href={`/cases/${caseId}/documents`} className="shrink-0 text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">Megnyitás →</Link>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* F. Deadlines */}
      <Panel id="cw-deadlines" title="Határidők" action={<Link href="/deadlines" className="text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">Határidők →</Link>}>
        {warn("tasks") ? <Empty title="A határidők most nem érhetők el." /> : ws.deadlines.length === 0 ? <Empty title="Nincs közelgő határidő ezen az ügyön." /> : (
          <div className="divide-y divide-[var(--adm-border)]">
            {ws.deadlines.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-[var(--adm-text)]">{d.title}</p>
                  <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{fmtDate(d.dueAt)} · {d.assignee?.name || "Felelős nincs"}</p>
                </div>
                {d.taskId ? <Link href={`/tasks?taskId=${encodeURIComponent(d.taskId)}`} className="shrink-0 text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">Feladat →</Link> : null}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* G. Communications summary */}
      <Panel id="cw-comms" title="Kommunikációs kivonat" action={<Link href="/notifications" className="text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">Kommunikáció →</Link>}>
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

      {/* H. Activity */}
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

      {/* I. Time (explicit unavailable state — never fake) */}
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
    </div>
  );
}
