"use client";

/**
 * The work instruction — the operational point of the header: "what must be
 * done with this document?". When absent it shows a compact actionable empty
 * state (not a large passive box), and only where the user may edit.
 */
import { ACCENT } from "@/components/cases/CaseCockpitPanels";
import { formatDocDate, type WorkContextView } from "@/lib/documents/workContext";

export function DocumentWorkInstruction({
  view, canEdit, onEdit,
}: {
  view: WorkContextView;
  canEdit?: boolean;
  onEdit?: () => void;
}) {
  const a = ACCENT[view.workStatusAccent];

  if (!view.hasWorkInstruction) {
    return (
      <div data-testid="dwh-instruction-empty" className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-[var(--adm-ivory-100)] px-2.5 py-1.5">
        <p className="text-[12px] text-[var(--adm-text-muted)]">Még nincs munkautasítás beállítva.</p>
        {canEdit && onEdit ? (
          <button
            type="button"
            data-testid="dwh-instruction-set"
            onClick={onEdit}
            className="shrink-0 text-[11.5px] font-semibold text-[var(--adm-petrol-700)] hover:underline"
          >
            Munkautasítás beállítása
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div data-testid="dwh-instruction" className={`rounded-md px-2.5 py-1.5 ${a.soft}`}>
      <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Munkautasítás</p>
      <p className="mt-0.5 whitespace-pre-line text-[12.5px] leading-5 text-[var(--adm-text)]">{view.workInstruction}</p>
      {view.workInstructionUpdatedBy ? (
        <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">
          {view.workInstructionUpdatedBy.name} · {formatDocDate(view.workInstructionUpdatedAt)}
        </p>
      ) : null}
    </div>
  );
}
