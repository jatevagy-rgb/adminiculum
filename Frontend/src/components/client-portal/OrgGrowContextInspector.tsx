"use client";

import { AdminBadge, AdminButton } from "@/components/adminiculum/ui";
import type { GrowOperatingProcessView, GrowOperatingStepView } from "@/lib/growOperatingProjection";

const MUTED = "text-[var(--adm-text-muted)]";
const SOFT = "text-[var(--adm-text-soft)]";

/**
 * Contextual inspector for the customer operating canvas.
 *
 * Non-modal: on desktop it sits beside the canvas; on mobile it stacks below.
 * Shows only data actually present in the customer-safe process DTO — step
 * order, step type, approval gates and linked systems. Responsible persons and
 * time metrics are not part of the customer contract and are never shown here.
 */
export function OrgGrowContextInspector({
  process,
  selectedStepId,
  onSelectStep,
  onClose,
}: {
  process: GrowOperatingProcessView | null;
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
  onClose: () => void;
}) {
  if (!process) {
    return (
      <aside
        className="rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-[var(--adm-surface-raised)] p-4"
        data-testid="grow-context-inspector"
        aria-label="Folyamat részletei"
      >
        <p className={`text-[13px] ${MUTED}`}>
          Válasszon egy folyamatot a részletek megtekintéséhez.
        </p>
      </aside>
    );
  }

  const selectedStep: GrowOperatingStepView | null = selectedStepId
    ? process.steps.find((step) => step.id === selectedStepId) ?? null
    : null;

  return (
    <aside
      className="rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-[var(--adm-surface-raised)]"
      data-testid="grow-context-inspector"
      aria-label={`${process.name} részletei`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-[var(--adm-border)] px-4 py-3">
        <div className="min-w-0">
          <p className={`text-[10.5px] font-bold uppercase tracking-[0.14em] ${SOFT}`}>
            {process.category}
            {process.organizationGroupName ? ` · ${process.organizationGroupName}` : ""}
          </p>
          <h3 className="mt-0.5 truncate font-serif text-[19px] font-medium leading-tight text-[var(--adm-text)]">
            {process.name}
          </h3>
          <p className={`mt-1 text-[11px] ${MUTED}`}>
            {process.stepCount} lépés · {process.distinctSystemCount} rendszer
            {process.approvalCount > 0 ? ` · ${process.approvalCount} jóváhagyás` : ""}
          </p>
        </div>
        <AdminButton
          size="xs"
          variant="ghost"
          aria-label="Bezárás"
          data-testid="grow-context-inspector-close"
          onClick={onClose}
        >
          ✕
        </AdminButton>
      </div>

      {/* Process attributes actually present in the customer DTO. */}
      <div className="grid grid-cols-2 gap-2 border-b border-[var(--adm-border)] px-4 py-3 text-[11px]">
        <div>
          <p className={`font-semibold uppercase tracking-[0.1em] ${SOFT}`}>Gyakoriság</p>
          <p className="mt-0.5 font-semibold text-[var(--adm-text)]">{process.frequency}</p>
        </div>
        <div>
          <p className={`font-semibold uppercase tracking-[0.1em] ${SOFT}`}>Kritikusság</p>
          <p className="mt-0.5 font-semibold text-[var(--adm-text)]">{process.criticality}</p>
        </div>
      </div>

      {/* Selected step detail (ephemeral selection). */}
      <div className="border-b border-[var(--adm-border)] px-4 py-3">
        <p className={`text-[10.5px] font-bold uppercase tracking-[0.14em] ${SOFT}`}>Kiválasztott lépés</p>
        {selectedStep ? (
          <div className="mt-2" data-testid="grow-context-inspector-step">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-[var(--adm-text)]">{selectedStep.name}</p>
              {selectedStep.isApproval ? <AdminBadge tone="amber">Jóváhagyási kapu</AdminBadge> : null}
            </div>
            <p className={`mt-1 text-[12px] ${MUTED}`}>
              {selectedStep.orderIndex + 1}. lépés · {selectedStep.stepTypeLabel}
            </p>
            <p className={`mt-1 text-[12px] ${MUTED}`}>
              Rendszer:{" "}
              <span className="font-semibold text-[var(--adm-text)]">
                {selectedStep.systemName ?? "Nincs megadva"}
              </span>
              {selectedStep.systemCategory ? ` (${selectedStep.systemCategory})` : ""}
            </p>
            {selectedStep.systemSwitch ? (
              <p className={`mt-1 text-[11px] ${MUTED}`}>Az előző lépéshez képest más rendszert használ.</p>
            ) : null}
          </div>
        ) : (
          <p className={`mt-2 text-[12px] ${MUTED}`}>
            Válasszon egy lépést a térképen vagy az alábbi listában.
          </p>
        )}
      </div>

      {/* Steps list — every step remains discoverable without the canvas. */}
      <div className="px-4 py-3">
        <p className={`mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] ${SOFT}`}>Lépések</p>
        {process.steps.length > 0 ? (
          <ol className="space-y-1.5">
            {process.steps.map((step) => {
              const selected = step.id === selectedStepId;
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    data-testid={`grow-context-inspector-step-${step.id}`}
                    onClick={() => onSelectStep(step.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-[var(--adm-radius-sm)] border px-3 py-2 text-left text-[12px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)] focus-visible:ring-offset-2 ${
                      selected
                        ? "border-[var(--adm-green-800)] bg-[var(--adm-sage-100)]"
                        : "border-[var(--adm-border)] bg-[var(--adm-surface)] hover:border-[var(--adm-border-strong)]"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`text-[10px] font-bold ${SOFT}`}>{step.orderIndex + 1}.</span>
                      <span className="truncate font-semibold text-[var(--adm-text)]">{step.name}</span>
                    </span>
                    <span className={`shrink-0 text-[10px] uppercase tracking-[0.06em] ${SOFT}`}>
                      {step.stepTypeLabel}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className={`text-[12px] ${MUTED}`}>Ehhez a folyamathoz még nincs rögzített lépés.</p>
        )}
      </div>

      {/* Provenance / data-state disclosure. */}
      <div className="border-t border-[var(--adm-border)] px-4 py-3">
        <p className={`text-[10.5px] font-bold uppercase tracking-[0.14em] ${SOFT}`}>Mi alapján?</p>
        <p className={`mt-1.5 text-[11px] leading-5 ${MUTED}`}>
          A lépések sorrendje a folyamat rögzített sorrendjét követi. A jóváhagyási pontok és a kapcsolódó
          rendszerek a folyamat rögzített definíciójából származnak; a rendszerváltások a szomszédos lépések
          eltérő rendszeréből következnek.
        </p>
      </div>
    </aside>
  );
}
