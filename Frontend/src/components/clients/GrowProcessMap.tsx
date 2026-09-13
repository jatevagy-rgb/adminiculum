"use client";

import { useMemo } from "react";
import {
  projectProcessMap,
  processMapFlagLabel,
  type ProcessMapFlag,
  type ProcessStepLike,
} from "@/lib/processMapProjection";

const flagTone: Record<ProcessMapFlag, string> = {
  UNASSIGNED: "border-[var(--adm-terracotta-300)] bg-[var(--adm-terracotta-100)] text-[var(--adm-terracotta-950)]",
  APPROVAL: "border-[var(--adm-amber-300)] bg-[var(--adm-amber-100)] text-[var(--adm-amber-950)]",
  WAITING: "border-[var(--adm-ochre-500)]/40 bg-[var(--adm-sand-100)] text-[var(--adm-text)]",
  SYSTEM_SWITCH: "border-[var(--adm-blue-300)] bg-[var(--adm-blue-100)] text-[var(--adm-blue-700)]",
};

function minutesText(minutes: number): string {
  if (minutes >= 60) return `${Math.round(minutes / 60)} ó`;
  return `${minutes} p`;
}

/**
 * Read-only process map. Canonical ordering (position asc, id asc); no
 * invented graph semantics — a linear, deterministic flow with flags.
 */
export function GrowProcessMap({ steps, compact }: { steps: ProcessStepLike[]; compact?: boolean }) {
  const map = useMemo(() => projectProcessMap(steps), [steps]);

  if (map.stepCount === 0) {
    return <p className="text-sm text-[var(--adm-text-muted)]">Ehhez a folyamathoz még nincs rögzített lépés.</p>;
  }

  return (
    <div data-testid="grow-process-map">
      {!compact ? (
        <div className="mb-3 flex flex-wrap gap-2 text-[10.5px] text-[var(--adm-text-muted)]">
          <span>{map.stepCount} lépés</span>
          <span aria-hidden="true">·</span>
          <span>{map.approvalCount} jóváhagyás</span>
          <span aria-hidden="true">·</span>
          <span>{map.unassignedCount} felelős nélküli</span>
          <span aria-hidden="true">·</span>
          <span>{map.systemSwitchCount} rendszerváltás</span>
          {map.totalEstimatedActiveMinutes > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span>Becsült aktív idő: {minutesText(map.totalEstimatedActiveMinutes)}</span>
            </>
          ) : null}
          {map.totalEstimatedWaitingMinutes > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span>Becsült várakozás: {minutesText(map.totalEstimatedWaitingMinutes)}</span>
            </>
          ) : null}
        </div>
      ) : null}
      <ol className={compact ? "space-y-1.5" : "space-y-2"} aria-label="Folyamat lépései sorrendben">
        {map.steps.map((step) => (
          <li key={step.id} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--adm-border)] bg-[var(--adm-surface)] text-[10px] font-bold text-[var(--adm-text-muted)]"
            >
              {step.orderIndex + 1}
            </span>
            <div className={`min-w-0 flex-1 rounded border border-[var(--adm-border)] ${step.isApproval ? "border-l-[3px] border-l-[var(--adm-amber-500)]" : ""} bg-white px-3 ${compact ? "py-1.5" : "py-2"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[12px] font-semibold text-[var(--adm-text)]">{step.name}</p>
                <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--adm-text-muted)]">{step.stepTypeLabel}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-[var(--adm-text-muted)]">
                <span>{step.responsiblePersonName ?? "Nincs felelős"}</span>
                {step.systemName ? <span>{step.systemName}</span> : null}
                {step.estimatedActiveMinutes ? <span>aktív: {minutesText(step.estimatedActiveMinutes)}</span> : null}
                {step.estimatedWaitingMinutes ? <span>várakozás: {minutesText(step.estimatedWaitingMinutes)}</span> : null}
              </div>
              {step.flags.length ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {step.flags.map((flag) => (
                    <span key={flag} className={`rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold ${flagTone[flag]}`}>
                      {processMapFlagLabel(flag)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
