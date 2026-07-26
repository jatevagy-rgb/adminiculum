"use client";

/**
 * Work relationship — the linked task(s), the next step, and where the document
 * came from (communication provenance). Only what exists is shown.
 */
import type { WorkContextView } from "@/lib/documents/workContext";

export function DocumentLinkedWorkSummary({ view }: { view: WorkContextView }) {
  const hasTask = view.linkedTasks.length > 0;
  if (!hasTask && !view.nextStep && !view.communicationProvenance) return null;

  return (
    <div data-testid="dwh-linked-work" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {hasTask ? (
        <div data-testid="dwh-linked-task" className="min-w-0">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Kapcsolódó feladat</p>
          <ul className="mt-0.5 space-y-0.5">
            {view.linkedTasks.map((t) => (
              <li key={t.linkId} className="truncate text-[11.5px] text-[var(--adm-text)]">
                {t.title}
                <span className="text-[var(--adm-text-muted)]"> · {t.status}{t.assignee ? ` · ${t.assignee.name}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {view.nextStep ? (
        <div data-testid="dwh-next-step" className="min-w-0">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Következő lépés</p>
          <p className="mt-0.5 text-[11.5px] text-[var(--adm-text)]">{view.nextStep}</p>
        </div>
      ) : null}

      {view.communicationProvenance ? (
        <div data-testid="dwh-provenance" className="min-w-0 sm:col-span-2">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Forrás</p>
          <p className="mt-0.5 truncate text-[11px] text-[var(--adm-text-muted)]">{view.communicationProvenance}</p>
        </div>
      ) : null}
    </div>
  );
}
