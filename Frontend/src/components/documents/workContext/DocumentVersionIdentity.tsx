"use client";

/**
 * Version identity — keeps the selected (viewed) immutable version distinct from
 * the current version, and flags when a historical version is selected. The two
 * are never conflated.
 */
import type { WorkContextView } from "@/lib/documents/workContext";

export function DocumentVersionIdentity({ view }: { view: WorkContextView }) {
  if (view.selectedVersion == null && view.currentVersion == null) return null;

  return (
    <div data-testid="dwh-version-identity" className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--adm-text-muted)]">
      <span data-testid="dwh-selected-version">
        Megjelenített verzió: <span className="font-semibold text-[var(--adm-text)]">v{view.selectedVersion ?? "—"}</span>
      </span>
      <span data-testid="dwh-current-version">
        Aktuális verzió: <span className="font-semibold text-[var(--adm-text)]">v{view.currentVersion ?? "—"}</span>
      </span>
      {view.isHistoricalVersion ? (
        <span data-testid="dwh-historical" className="rounded bg-[var(--adm-ivory-100)] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[var(--adm-ochre-700)]">
          Korábbi verziót néz
        </span>
      ) : null}
    </div>
  );
}
