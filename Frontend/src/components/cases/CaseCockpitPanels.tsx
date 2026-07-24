"use client";

/**
 * Presentational building blocks for the matter cockpit (MATTER-OVERVIEW-COCKPIT-1).
 *
 * Deliberately not "a white card for everything": each block carries a functional
 * accent so the page has hierarchy — petrol for general matter operations,
 * terracotta for urgency and external communication, deep green for completed or
 * internal workflow, ochre for documents in progress, navy for review/control.
 */
import Link from "next/link";
import type { CaseWorkspace, CockpitDeadline } from "@/lib/api";

export type Accent = "petrol" | "terracotta" | "green" | "ochre" | "navy" | "neutral";

/** One shared accent map so a colour never means two different things. */
export const ACCENT: Record<Accent, { bar: string; text: string; soft: string; ring: string }> = {
  petrol:     { bar: "bg-[#1F5A66]", text: "text-[#1F5A66]", soft: "bg-[#EAF1F3]", ring: "ring-[#1F5A66]" },
  terracotta: { bar: "bg-[#A8442A]", text: "text-[#A8442A]", soft: "bg-[#FBEBE7]", ring: "ring-[#A8442A]" },
  green:      { bar: "bg-[#1D5138]", text: "text-[#1D5138]", soft: "bg-[#E7EFE9]", ring: "ring-[#1D5138]" },
  ochre:      { bar: "bg-[#8E6A1B]", text: "text-[#8E6A1B]", soft: "bg-[#FAF2DF]", ring: "ring-[#8E6A1B]" },
  navy:       { bar: "bg-[#2D4A7C]", text: "text-[#2D4A7C]", soft: "bg-[#EAEFF6]", ring: "ring-[#2D4A7C]" },
  neutral:    { bar: "bg-[#7A8479]", text: "text-[#3D4842]", soft: "bg-[#F3F4F1]", ring: "ring-[#7A8479]" },
};

export function fmtDate(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("hu-HU");
}
export function fmtDateTime(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("hu-HU", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
export function fmtTime(v?: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
}

/**
 * A KPI tile. The number alone is never the message — `secondary` carries the
 * operational meaning ("1 sürgős", "Ma esedékes") and the whole tile is a control
 * that filters or jumps to the relevant panel.
 */
export function KpiCard({
  label, value, secondary, accent, targetId, emphasised, onActivate,
}: {
  label: string;
  value: React.ReactNode;
  secondary: string;
  accent: Accent;
  targetId: string;
  emphasised?: boolean;
  onActivate?: () => void;
}) {
  const a = ACCENT[accent];
  return (
    <a
      href={`#${targetId}`}
      data-testid={`kpi-${targetId}`}
      onClick={onActivate}
      className={`group relative flex min-w-0 flex-col overflow-hidden rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${a.ring} ${
        emphasised ? `${a.soft}` : "bg-white hover:bg-[var(--adm-ivory-100)]"
      }`}
    >
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${a.bar}`} />
      <span className="pl-2">
        <span className="block truncate text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--adm-text-muted)]">{label}</span>
        <span className={`mt-0.5 block font-serif text-[26px] font-medium leading-none ${emphasised ? a.text : "text-[var(--adm-text)]"}`}>{value}</span>
        <span className={`mt-1 block truncate text-[11px] font-semibold ${emphasised ? a.text : "text-[var(--adm-text-muted)]"}`}>{secondary}</span>
      </span>
    </a>
  );
}

/** Section shell with an accent rail instead of a heavy border. */
export function CockpitSection({
  id, title, accent, action, count, children,
}: {
  id: string; title: string; accent: Accent; action?: React.ReactNode; count?: number; children: React.ReactNode;
}) {
  const a = ACCENT[accent];
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="overflow-hidden rounded-lg bg-white shadow-[0_1px_2px_rgba(22,32,26,0.06),0_8px_24px_rgba(0,42,35,0.04)]">
      <div className={`flex min-h-11 items-center justify-between gap-3 border-l-4 px-3 py-2 ${a.bar.replace("bg-", "border-")} ${a.soft}`}>
        <h3 id={`${id}-h`} className={`flex items-center gap-2 font-serif text-[15px] font-semibold ${a.text}`}>
          {title}
          {typeof count === "number" ? <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-bold">{count}</span> : null}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * An empty state is a place to act, not a large passive panel. It always offers
 * the one thing the user would want to do next.
 */
export function ActionableEmpty({
  message, actionLabel, onAction, href,
}: { message: string; actionLabel: string; onAction?: () => void; href?: string }) {
  const cls = "inline-flex items-center rounded-md border border-[var(--adm-border)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--adm-green-800)] hover:bg-[var(--adm-ivory-100)]";
  return (
    <div data-testid="actionable-empty" className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
      <span className="text-[12px] text-[var(--adm-text-muted)]">{message}</span>
      {href
        ? <Link href={href} className={cls}>{actionLabel}</Link>
        : <button type="button" onClick={onAction} className={cls}>{actionLabel}</button>}
    </div>
  );
}

/** Deadline row; overdue and matter-level deadlines are visually distinct. */
export function DeadlineRow({ d }: { d: CockpitDeadline }) {
  const accent: Accent = d.overdue ? "terracotta" : d.source === "MATTER" ? "navy" : "petrol";
  const a = ACCENT[accent];
  return (
    <li className="flex items-start gap-2 px-3 py-2">
      <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${a.bar}`} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate text-[12.5px] font-semibold text-[var(--adm-text)]">{d.title}</span>
          <span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide ${a.soft} ${a.text}`}>
            {d.source === "MATTER" ? "Ügyhatáridő" : "Feladat"}
          </span>
          {d.overdue ? <span className="text-[10px] font-bold uppercase text-[#A8442A]">Lejárt</span> : null}
        </span>
        <span className="mt-0.5 block text-[11px] text-[var(--adm-text-muted)]">
          {fmtDateTime(d.dueAt)}{d.assignee ? ` · ${d.assignee.name}` : " · Felelős nincs"}
        </span>
      </span>
    </li>
  );
}

export type WorkspaceTask = CaseWorkspace["tasks"][number];

/** Task card carrying who, when, how urgent and what it is attached to. */
export function TaskCard({
  task, accent, onEdit, statusLabel, attentionLabel,
}: {
  task: WorkspaceTask; accent: Accent; onEdit?: () => void; statusLabel: string; attentionLabel?: string | null;
}) {
  const a = ACCENT[accent];
  return (
    <div className="flex items-start gap-2 px-3 py-2.5">
      <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${a.bar}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <Link href={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="truncate text-[12.5px] font-semibold text-[var(--adm-text)] hover:underline">
            {task.title}
          </Link>
          {attentionLabel ? <span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${ACCENT.navy.soft} ${ACCENT.navy.text}`}>{attentionLabel}</span> : null}
          {task.priority === "URGENT" || task.priority === "HIGH"
            ? <span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${ACCENT.terracotta.soft} ${ACCENT.terracotta.text}`}>{task.priority}</span>
            : null}
        </div>
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-[var(--adm-text-muted)]">
          <span>{statusLabel}</span><span aria-hidden="true">·</span>
          <span>{task.assignee?.name || "Felelős nincs"}</span>
          <span aria-hidden="true">·</span><span>{task.dueDate ? fmtDate(task.dueDate) : "Nincs határidő"}</span>
          {task.documentId ? <><span aria-hidden="true">·</span><span className={ACCENT.ochre.text}>Dokumentumhoz kötve</span></> : null}
        </p>
      </div>
      {onEdit ? (
        <button type="button" onClick={onEdit} className="shrink-0 text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">
          Szerkesztés
        </button>
      ) : null}
    </div>
  );
}

/**
 * Ügyvédi instrukció / Induló helyzet.
 *
 * The legal work context — why the matter started, where it stands, what the
 * client expects, what is urgent and the first next step. Restored after the
 * cockpit rebuild dropped it: the overview must state the legal context, not
 * only the operational counters.
 *
 * Renders only the answers that exist, so a sparsely filled matter never becomes
 * a row of empty cards. Legacy matters that predate structured intake fall back
 * to their free-text description.
 */
export function StartingContextPanel({
  context, description, onAddContext,
}: {
  context: CaseWorkspace["case"]["startingContext"];
  description: string | null;
  onAddContext?: () => void;
}) {
  const a = ACCENT.petrol;
  const entries: Array<{ label: string; value: string }> = [];
  const push = (label: string, value: string | null) => {
    if (value && value.trim()) entries.push({ label, value: value.trim() });
  };
  push("Miért indult", context.originReason);
  push("Jelenlegi helyzet", context.currentSituation);
  push("Ügyfél elvárása", context.clientExpectation);
  push("Sürgős teendő", context.urgentAction);
  push("Első következő lépés", context.nextStep);

  return (
    <section
      id="ck-instruction"
      data-testid="starting-context-panel"
      aria-labelledby="ck-instruction-h"
      className="overflow-hidden rounded-lg bg-white shadow-[0_1px_2px_rgba(22,32,26,0.06),0_8px_24px_rgba(0,42,35,0.04)]"
    >
      <div className={`flex min-h-11 items-center justify-between gap-3 border-l-4 px-3 py-2 ${a.bar.replace("bg-", "border-")} ${a.soft}`}>
        <h3 id="ck-instruction-h" className={`font-serif text-[15px] font-semibold ${a.text}`}>
          Ügyvédi instrukció / Induló helyzet
        </h3>
        {context.legacyOnly ? (
          <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--adm-text-muted)]">
            Korábbi ügy
          </span>
        ) : null}
      </div>

      {entries.length > 0 ? (
        <dl data-testid="starting-context-entries" className="grid grid-cols-1 gap-x-6 gap-y-2 px-3 py-2.5 sm:grid-cols-2">
          {entries.map((e) => (
            <div key={e.label} className="min-w-0">
              <dt className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">{e.label}</dt>
              <dd className="mt-0.5 whitespace-pre-line text-[12.5px] leading-5 text-[var(--adm-text)]">{e.value}</dd>
            </div>
          ))}
        </dl>
      ) : description && description.trim() ? (
        // Legacy fallback: matters created before structured intake.
        <div data-testid="starting-context-legacy" className="px-3 py-2.5">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Ügyleírás</p>
          <p className="mt-0.5 whitespace-pre-line text-[12.5px] leading-5 text-[var(--adm-text)]">{description.trim()}</p>
        </div>
      ) : (
        <ActionableEmpty
          message="Nincs rögzített induló helyzet vagy ügyvédi instrukció."
          actionLabel="Induló helyzet rögzítése"
          onAction={onAddContext}
        />
      )}
    </section>
  );
}
