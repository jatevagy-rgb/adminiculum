"use client";

/**
 * Comparison header cluster (STRUCTURED-DOC-COMPARISON-1, Phases 10–11).
 * Header, version-pair selector, status panel, toolbar and collapsed technical
 * details. Algorithm/extraction revisions live under technical details, never
 * in the primary header.
 */
import { useState } from "react";
import { AdminButton } from "@/components/adminiculum/ui";
import {
  comparisonStatusLabel, reviewProgress, formatComparisonDate, versionIdentity,
} from "@/lib/documents/comparisonModel";
import type { ComparisonDto } from "@/lib/documents/comparisonApi";

export interface VersionOption { id: string; versionNumber: number; isCurrent: boolean; supported: boolean }

export function VersionPairSelector({
  versions, baseId, targetId, onChange, disabled,
}: {
  versions: VersionOption[];
  baseId: string | null;
  targetId: string | null;
  onChange: (baseId: string, targetId: string) => void;
  disabled?: boolean;
}) {
  const sel = "rounded-md border border-[var(--adm-border)] bg-white px-2 py-1 text-[12.5px] disabled:opacity-60";
  const current = versions.find((v) => v.isCurrent);
  const opt = (v: VersionOption) => `v${v.versionNumber}${v.isCurrent ? " (aktuális)" : ""}${v.supported ? "" : " — nem összehasonlítható"}`;
  const reversed = baseId && targetId && (() => {
    const b = versions.find((v) => v.id === baseId); const t = versions.find((v) => v.id === targetId);
    return b && t && b.versionNumber > t.versionNumber;
  })();
  return (
    <div data-testid="cmp-version-pair" className="flex flex-wrap items-end gap-2">
      <div>
        <p className="text-[9.5px] font-bold uppercase tracking-wide text-[var(--adm-text-muted)]">Alap (bázis)</p>
        <select data-testid="cmp-base-select" className={sel} value={baseId || ""} disabled={disabled} onChange={(e) => onChange(e.target.value, targetId || (current?.id ?? ""))}>
          <option value="">Válassz…</option>
          {versions.map((v) => <option key={v.id} value={v.id}>{opt(v)}</option>)}
        </select>
      </div>
      <span aria-hidden="true" className="pb-1.5 text-[var(--adm-text-muted)]">→</span>
      <div>
        <p className="text-[9.5px] font-bold uppercase tracking-wide text-[var(--adm-text-muted)]">Cél</p>
        <select data-testid="cmp-target-select" className={sel} value={targetId || ""} disabled={disabled} onChange={(e) => onChange(baseId || "", e.target.value)}>
          <option value="">Válassz…</option>
          {versions.map((v) => <option key={v.id} value={v.id}>{opt(v)}</option>)}
        </select>
      </div>
      {current ? (
        <AdminButton variant="neutral" size="xs" disabled={disabled || !targetId} data-testid="cmp-quick-current"
          onClick={() => { const prev = versions.filter((v) => v.versionNumber < current.versionNumber).sort((a, b) => b.versionNumber - a.versionNumber)[0]; if (prev) onChange(prev.id, current.id); }}>
          Előző → aktuális
        </AdminButton>
      ) : null}
      {reversed ? <p data-testid="cmp-reversed" className="w-full text-[11px] font-semibold text-[var(--adm-ochre-700)]">Fordított irány: a bázis újabb, mint a cél.</p> : null}
    </div>
  );
}

export function ComparisonStatusPanel({ comparison }: { comparison: ComparisonDto }) {
  const prog = reviewProgress(comparison.counts);
  return (
    <div data-testid="cmp-status-panel" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
      <span data-testid="cmp-status" className="font-semibold text-[var(--adm-text)]">{comparisonStatusLabel(comparison.status)}</span>
      <span className="text-[var(--adm-text-muted)]">Változások: <b className="text-[var(--adm-text)]">{comparison.counts.total}</b></span>
      <span className="text-[var(--adm-text-muted)]">Átnézve: <b className="text-[var(--adm-text)]">{prog.reviewed}/{prog.total}</b> ({prog.pct}%)</span>
    </div>
  );
}

export function ComparisonHeader({
  documentTitle, comparison, base, target, currentVersionNumber,
}: {
  documentTitle: string;
  comparison: ComparisonDto | null;
  base: { versionNumber: number | null } | null;
  target: { versionNumber: number | null } | null;
  currentVersionNumber: number | null;
}) {
  const id = versionIdentity({ baseVersionNumber: base?.versionNumber ?? null, targetVersionNumber: target?.versionNumber ?? null, currentVersionNumber });
  return (
    <div data-testid="cmp-header" className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--adm-green-800)]">Strukturált összehasonlítás</p>
      <h2 data-testid="cmp-doc-title" className="min-w-0 truncate font-serif text-[19px] font-semibold text-[var(--adm-text)]">{documentTitle}</h2>
      <p className="mt-0.5 text-[12px] text-[var(--adm-text-muted)]">
        <span data-testid="cmp-base-identity">Alap: {id.baseLabel}</span> {" → "}
        <span data-testid="cmp-target-identity">Cél: {id.targetLabel}{id.targetIsHistorical ? " (korábbi)" : ""}</span>
      </p>
      {comparison ? <div className="mt-2"><ComparisonStatusPanel comparison={comparison} /></div> : null}
    </div>
  );
}

export function ComparisonToolbar({ mode, onMode }: { mode: "unified" | "side"; onMode: (m: "unified" | "side") => void }) {
  return (
    <div data-testid="cmp-toolbar" className="flex items-center gap-1.5">
      <AdminButton variant={mode === "unified" ? "primary" : "neutral"} size="xs" data-testid="cmp-mode-unified" onClick={() => onMode("unified")}>Egyesített</AdminButton>
      <AdminButton variant={mode === "side" ? "primary" : "neutral"} size="xs" data-testid="cmp-mode-side" onClick={() => onMode("side")}>Egymás mellett</AdminButton>
    </div>
  );
}

export function ComparisonTechnicalDetails({ comparison }: { comparison: ComparisonDto }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="cmp-technical" className="mt-2">
      <button type="button" data-testid="cmp-technical-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="text-[10.5px] font-semibold text-[var(--adm-text-muted)] hover:underline">
        {open ? "Technikai részletek elrejtése" : "Technikai részletek"}
      </button>
      {open ? (
        <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10.5px] text-[var(--adm-text-muted)] sm:grid-cols-4">
          <div><dt className="font-bold uppercase tracking-wide">Algoritmus</dt><dd>r{comparison.algorithmRevision}</dd></div>
          <div><dt className="font-bold uppercase tracking-wide">Kinyerés</dt><dd>r{comparison.extractionRevision}</dd></div>
          <div><dt className="font-bold uppercase tracking-wide">Készült</dt><dd>{formatComparisonDate(comparison.completedAt)}</dd></div>
          <div><dt className="font-bold uppercase tracking-wide">Azonosító</dt><dd className="truncate">{comparison.id.slice(0, 8)}…</dd></div>
        </dl>
      ) : null}
    </div>
  );
}
