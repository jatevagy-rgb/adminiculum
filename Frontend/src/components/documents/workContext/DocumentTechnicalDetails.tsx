"use client";

/**
 * Részletek — support/audit metadata, demoted out of the primary header and
 * collapsed by default. Deliberately excludes storage keys, SharePoint item
 * ids, MIME strings, upload-source enums, raw publication/review enums and
 * internal UUIDs: nothing here is a secret or a storage credential.
 */
import { useState } from "react";
import { formatDocDate, type WorkContextView } from "@/lib/documents/workContext";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--adm-text-muted)]">{label}</dt>
      <dd className="truncate text-[10.5px] text-[var(--adm-text)]">{value}</dd>
    </div>
  );
}

export function DocumentTechnicalDetails({ view }: { view: WorkContextView }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="dwh-technical">
      <button
        type="button"
        data-testid="dwh-technical-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="text-[10.5px] font-semibold text-[var(--adm-text-muted)] hover:underline"
      >
        {open ? "Részletek elrejtése" : "Részletek"}
      </button>
      {open ? (
        <dl data-testid="dwh-technical-panel" className="mt-1 grid min-w-0 grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-4">
          <Row label="Eredeti fájlnév" value={view.originalFilename || "—"} />
          <Row label="Típus" value={view.documentType || "—"} />
          <Row label="Aktuális verzió" value={view.currentVersion != null ? `v${view.currentVersion}` : "—"} />
          <Row label="Módosítva" value={formatDocDate(view.updatedAt)} />
        </dl>
      ) : null}
    </div>
  );
}
