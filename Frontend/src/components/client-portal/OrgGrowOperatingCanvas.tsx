"use client";

import { useMemo } from "react";
import type { PortalGrowProcess } from "@/lib/clientPortalApi";
import { projectGrowOperatingProcess, type GrowOperatingStepView } from "@/lib/growOperatingProjection";
import { AdminBadge } from "@/components/adminiculum/ui";

const MUTED = "text-[var(--adm-text-muted)]";
const SOFT = "text-[var(--adm-text-soft)]";

/**
 * Read-only interactive operating canvas for the customer Grow surface.
 *
 * The customer explores how the company operates rather than reading a report:
 * a process selector (selectable button chips), a linear, deterministic step
 * flow, and selectable step nodes that drive the contextual inspector. No
 * drag/pan/zoom semantics — the canvas is a semantic HTML ordered list, fully
 * keyboard reachable, with a mobile-friendly vertical fallback.
 */
export function OrgGrowOperatingCanvas({
  processes,
  selectedProcessId,
  onSelectProcess,
  selectedStepId,
  onSelectStep,
}: {
  processes: PortalGrowProcess[];
  selectedProcessId: string | null;
  onSelectProcess: (id: string) => void;
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
}) {
  const views = useMemo(() => processes.map((p) => projectGrowOperatingProcess(p)), [processes]);
  const activeView = views.find((v) => v.id === selectedProcessId) ?? null;

  return (
    <section className="rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4" data-testid="grow-operating-canvas" aria-label="Működési térkép">
      <div className="flex items-baseline justify-between gap-3">
        <p className={`text-[10.5px] font-bold uppercase tracking-[0.14em] ${SOFT}`}>Működési térkép</p>
        {activeView ? (
          <span className={`text-[11px] ${MUTED}`}>
            {activeView.stepCount} lépés
            {activeView.approvalCount > 0 ? ` · ${activeView.approvalCount} jóváhagyás` : ""}
          </span>
        ) : null}
      </div>

      {/* Process selector — a labelled group of selectable buttons. */}
      {processes.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Folyamat választása">
          {views.map((view) => {
            const selected = view.id === selectedProcessId;
            return (
              <button
                key={view.id}
                type="button"
                aria-pressed={selected}
                data-testid={`grow-operating-process-${view.id}`}
                onClick={() => onSelectProcess(view.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)] focus-visible:ring-offset-2 ${
                  selected
                    ? "border-[var(--adm-green-800)] bg-[var(--adm-green-800)] text-[var(--adm-ivory-50)]"
                    : "border-[var(--adm-border)] bg-[var(--adm-surface-raised)] text-[var(--adm-text)] hover:border-[var(--adm-border-strong)]"
                }`}
              >
                {selected ? <span aria-hidden="true">✓</span> : null}
                <span>{view.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Step flow canvas. */}
      {activeView ? (
        <ol
          className="mt-4 flex flex-col gap-2 md:flex-row md:items-stretch md:gap-0 md:overflow-x-auto md:pb-1"
          aria-label={`${activeView.name} folyamat lépései sorrendben`}
        >
          {activeView.steps.map((step, index) => (
            <li key={step.id} className="flex items-center md:shrink-0">
              <StepNode
                step={step}
                selected={step.id === selectedStepId}
                onSelect={() => onSelectStep(step.id)}
              />
              {index < activeView.steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="hidden shrink-0 px-2 text-[var(--adm-text-soft)] md:inline"
                >
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : processes.length > 0 ? (
        <p className={`mt-4 rounded-[var(--adm-radius-sm)] border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface-raised)] p-4 text-center text-[13px] ${MUTED}`}>
          Válasszon egy folyamatot a térkép megnyitásához.
        </p>
      ) : null}
    </section>
  );
}

function StepNode({
  step,
  selected,
  onSelect,
}: {
  step: GrowOperatingStepView;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-testid={`grow-operating-step-${step.id}`}
      onClick={onSelect}
      className={`flex w-full flex-col justify-between gap-2 rounded-[var(--adm-radius-md)] border bg-[var(--adm-surface-raised)] p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)] focus-visible:ring-offset-2 md:w-56 ${
        selected
          ? "border-[var(--adm-green-800)] ring-2 ring-[var(--adm-green-800)]/25"
          : "border-[var(--adm-border)] hover:border-[var(--adm-border-strong)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          aria-hidden="true"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--adm-border)] bg-[var(--adm-surface)] text-[10px] font-bold text-[var(--adm-text-muted)]"
        >
          {step.orderIndex + 1}
        </span>
        {selected ? (
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--adm-green-800)]">
            Kiválasztva
          </span>
        ) : null}
      </div>

      <p className="font-medium leading-snug text-[var(--adm-text)]">{step.name}</p>
      <p className={`text-[10px] uppercase tracking-[0.08em] ${SOFT}`}>{step.stepTypeLabel}</p>

      {step.systemName ? (
        <p className={`border-t border-[var(--adm-border)] pt-2 text-[11px] ${MUTED}`}>
          Rendszer: <span className="font-semibold text-[var(--adm-text)]">{step.systemName}</span>
          {step.systemCategory ? ` (${step.systemCategory})` : ""}
        </p>
      ) : null}

      {step.isApproval ? (
        <div className="flex flex-wrap gap-1.5">
          <AdminBadge tone="amber">Jóváhagyási kapu</AdminBadge>
        </div>
      ) : null}
    </button>
  );
}
