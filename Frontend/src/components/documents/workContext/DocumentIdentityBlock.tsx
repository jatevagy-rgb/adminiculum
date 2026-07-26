"use client";

/**
 * Identity: the human title leads, the original filename and role are secondary,
 * with the logical status and selected-version badges alongside. A filename is
 * never presented as the document's identity.
 */
import { ACCENT } from "@/components/cases/CaseCockpitPanels";
import type { WorkContextView } from "@/lib/documents/workContext";

export function DocumentWorkStatusBadge({ view }: { view: WorkContextView }) {
  const a = ACCENT[view.workStatusAccent];
  return (
    <span
      data-testid="dwh-status-badge"
      className={`shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${a.soft} ${a.text}`}
    >
      {view.workStatusLabel}
    </span>
  );
}

export function DocumentIdentityBlock({ view }: { view: WorkContextView }) {
  return (
    <div data-testid="dwh-identity" className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h2 data-testid="dwh-title" className="min-w-0 truncate font-serif text-[17px] font-semibold leading-tight text-[var(--adm-text)]">
          {view.humanTitle}
        </h2>
        <DocumentWorkStatusBadge view={view} />
        {view.selectedVersion != null ? (
          <span data-testid="dwh-version-badge" className="shrink-0 rounded bg-[var(--adm-ivory-100)] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[var(--adm-text-muted)]">
            v{view.selectedVersion}{view.isHistoricalVersion ? " · korábbi" : ""}
          </span>
        ) : null}
      </div>
      <p data-testid="dwh-filename" className="mt-0.5 truncate text-[11px] text-[var(--adm-text-muted)]">
        {view.originalFilename || "Nincs eredeti fájlnév"}
        {view.role ? ` · ${view.role}` : ""}
      </p>
    </div>
  );
}
