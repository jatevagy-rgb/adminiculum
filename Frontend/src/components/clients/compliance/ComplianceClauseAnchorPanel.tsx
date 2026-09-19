"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  complianceIntelligenceApi,
  type ComplianceAnchorType,
  type ComplianceClauseAnchorReadModel,
  type ComplianceClauseAnchorRow,
} from "@/lib/complianceIntelligenceApi";

/**
 * INTERNAL compliance workspace — structured legal matrix of one compliance
 * master document.
 *
 * This panel only DISPLAYS document-authored structured provenance that CDI-1
 * extracted from the document's own Word content controls. It deliberately makes
 * no legal statement: it never says a clause is compliant, non-compliant,
 * obsolete, or that a source changed. There is no monitoring and no AI
 * conclusion in this surface.
 *
 * INTERNAL ONLY: rendered only for INTERNAL_ANALYSIS links in the internal
 * compliance workspace. Nothing here is projected to the customer portal.
 */

const anchorTypeLabels: Record<ComplianceAnchorType, string> = {
  LEGAL: "Jogszabály",
  CASE: "Bírósági döntés",
  AUTHORITY: "Hatósági döntés",
};

const anchorTypeOrder: ComplianceAnchorType[] = ["LEGAL", "CASE", "AUTHORITY"];

/** An absolute http(s) value is the only thing rendered as a link. */
export function isHttpUrl(value: string | null | undefined): boolean {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

/**
 * Every meaningful row field the read model already transports, in the order the
 * row displays them. Free-text search covers all of these so an internal reader
 * can find a row by any identifier that is visible in it — not only its clause.
 */
const SEARCHABLE_ROW_FIELDS = [
  "clauseRef",
  "clauseTitle",
  "anchorDisplay",
  "canonicalReference",
  "anchorKey",
  "eli",
  "celex",
  "locator",
  "ecli",
  "caseId",
  "caseLocator",
  "decisionId",
  "authorityLocator",
  "sourceUrl",
  "rationale",
] as const;

function searchTextOf(row: ComplianceClauseAnchorRow): string {
  return SEARCHABLE_ROW_FIELDS.map((field) => row[field])
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
}

/**
 * Search-only projection of one row.
 *
 * Peter transports a canonical `TV/<year>/<act>` reference as `T/<year>/<act>`;
 * the backend normalizes `T` → `TV` before storage, so the canonical value never
 * contains the alias. Matching both spellings here keeps search usable without
 * persisting, displaying, or re-emitting the alias.
 */
function searchableRowText(row: ComplianceClauseAnchorRow): string {
  const canonical = searchTextOf(row);
  const alias = canonical.replace(/TV\//g, "T/");
  return alias === canonical ? canonical : `${canonical} ${alias}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("hu-HU");
  } catch {
    return value;
  }
}

const caseIdentifier = (row: ComplianceClauseAnchorRow): string | null => row.caseId || row.caseLocator;
const authorityLocators = (row: ComplianceClauseAnchorRow): string | null =>
  [row.authorityLocator, row.locator].filter(Boolean).join(" · ") || null;

/**
 * A hyperlink-transported TV reference has no CELEX by construction, so its
 * unresolved binding is stated as such instead of being presented as a malformed
 * CELEX identifier. CELEX rows keep the unchanged wording below.
 */
const TV_REFERENCE_BINDING_REASON = "TV-hivatkozás; C3A CELEX-kötés nem alkalmazható";

/** Neutral Hungarian labels for the internal binding outcome reasons. */
const bindingReasonLabels: Record<string, string> = {
  NO_CELEX: "nincs CELEX azonosító",
  INVALID_CELEX: "a CELEX azonosító nem a támogatott formátumú",
  SOURCE_NOT_FOUND: "nincs ilyen egyedi kanónikus forrás",
  NO_BINDABLE_VERSION: "nincs jóváhagyott, aktív forrásverzió",
  AMBIGUOUS_BINDABLE_VERSION: "több egyedi találat, ezért nem oldható fel",
};

/**
 * Truthful canonical binding line (INTERNAL only).
 *
 * A resolved binding shows the stored canonical citation/title when the registry
 * actually has one; otherwise it shows the canonical source KEY built from the
 * row's own CELEX, never a fabricated legal name.
 */
function bindingLine(row: ComplianceClauseAnchorRow) {
  const status = row.legalSourceBindingStatus;
  if (!status) return null;

  if (status === "RESOLVED") {
    const label = row.canonicalTitle || row.canonicalCitation || (row.celex ? `EU-${row.celex}` : null);
    if (!label) return null;
    return (
      <p className="mt-1 text-xs text-[var(--adm-text)]" data-testid="clause-anchor-binding">
        Kanónikus forrás: <b>{label}</b>
        {row.canonicalTitle && row.canonicalCitation ? ` · ${row.canonicalCitation}` : ""}
        {row.bindingOrigin === "READ_TIME_EXACT_CELEX" ? (
          <span className="ml-1 text-[var(--adm-text-muted)]">(CELEX egyezés, nem tárolt)</span>
        ) : (
          <span className="ml-1 text-[var(--adm-text-muted)]">(verzió feldolgozásakor rögzítve)</span>
        )}
      </p>
    );
  }

  return (
    <p className="mt-1 text-xs text-[var(--adm-text-muted)]" data-testid="clause-anchor-binding-unresolved">
      Kanónikus forrás: nincs egyedi találat
      {row.canonicalReference
        ? ` — ${TV_REFERENCE_BINDING_REASON}`
        : row.bindingReason
          ? ` — ${bindingReasonLabels[row.bindingReason] ?? "nem oldható fel"}`
          : ""}
    </p>
  );
}

function metaField({ label, value, mono = false, href = null }: { label: string; value: string | null; mono?: boolean; href?: string | null }) {
  if (!value) return null;
  return (
    <div className="min-w-0" key={label}>
      <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">{label}</p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className={`block break-all text-xs text-[var(--adm-green-800)] underline ${mono ? "font-mono" : ""}`}
        >
          {value}
        </a>
      ) : (
        <p className={`break-words text-xs text-[var(--adm-text)] ${mono ? "font-mono" : ""}`}>{value}</p>
      )}
    </div>
  );
}

function clauseAnchorRow(row: ComplianceClauseAnchorRow) {
  const warnings = row.ingestWarnings ?? [];
  return (
    <li
      key={row.id}
      className="rounded border border-[var(--adm-border)] bg-white p-3"
      data-testid="clause-anchor-row"
      data-anchor-type={row.anchorType}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium text-[var(--adm-text)]">{row.clauseRef}</p>
          {row.clauseTitle ? <p className="mt-0.5 text-xs text-[var(--adm-text-muted)]">{row.clauseTitle}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] px-2 py-0.5 font-mono text-[10px] text-[var(--adm-text)]">
            {row.relationType}
          </span>
          <span className="rounded border border-[var(--adm-border)] bg-white px-2 py-0.5 text-[10px] text-[var(--adm-text)]">
            {anchorTypeLabels[row.anchorType] ?? row.anchorType}
          </span>
        </div>
      </div>

      <p className="mt-2 text-sm text-[var(--adm-text)]">{row.anchorDisplay}</p>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {metaField({ label: "ELI", value: row.eli, mono: true, href: isHttpUrl(row.eli) ? row.eli : null })}
        {metaField({ label: "CELEX", value: row.celex, mono: true })}
        {metaField({ label: "Norma helye (locator)", value: row.locator, mono: true })}
        {metaField({ label: "ECLI", value: row.ecli, mono: true })}
        {metaField({ label: "Ügyszám", value: caseIdentifier(row), mono: true })}
        {metaField({ label: "Bírósági hely", value: row.caseLocator, mono: true })}
        {metaField({ label: "Döntés azonosítója", value: row.decisionId, mono: true })}
        {metaField({ label: "Hatósági hely", value: authorityLocators(row), mono: true })}
        {metaField({ label: "Forrás URL", value: row.sourceUrl, href: isHttpUrl(row.sourceUrl) ? row.sourceUrl : null })}
      </div>

      {row.rationale ? (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Kapcsolat / indok</p>
          <p className="mt-0.5 text-xs text-[var(--adm-text)]">{row.rationale}</p>
        </div>
      ) : null}

      <div className="mt-2 border-t border-[var(--adm-border)] pt-2">
        {row.canonicalReference
          ? metaField({ label: "Figyelési azonosító", value: row.canonicalReference, mono: true })
          : null}
        {row.anchorKey ? (
          metaField({ label: "Stabil hivatkozás-azonosító", value: row.anchorKey, mono: true })
        ) : (
          <p className="text-xs text-[var(--adm-ochre-500)]" data-testid="anchor-key-unresolved">
            Nincs stabil hivatkozás-azonosító: a dokumentum nem tartalmaz ehhez elég gépi azonosítót.
          </p>
        )}
        {bindingLine(row)}
        {warnings.length ? (
          <div className="mt-2" data-testid="clause-anchor-warnings">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Belső feldolgozási jelzés</p>
            <ul className="mt-0.5 space-y-0.5">
              {warnings.map((warning) => (
                <li key={warning} className="font-mono text-[10px] text-[var(--adm-text-muted)]">{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function versionProvenance({
  versions,
  selectedDocumentVersionId,
  onSelect,
}: {
  versions: ComplianceClauseAnchorReadModel["versions"];
  selectedDocumentVersionId: string;
  onSelect: (documentVersionId: string) => void;
}) {
  const selected = versions.find((version) => version.documentVersionId === selectedDocumentVersionId);
  if (!selected) return null;
  const ingestedAt = selected.rows.reduce<string | null>((latest, row) => {
    if (!row.ingestedAt) return latest;
    return !latest || row.ingestedAt > latest ? row.ingestedAt : latest;
  }, null);
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
      <label className="block">
        <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Dokumentumverzió</span>
        <select
          className="mt-1 rounded border border-[var(--adm-border)] bg-white px-2 py-1 text-xs text-[var(--adm-text)]"
          value={selected.documentVersionId}
          onChange={(event) => onSelect(event.target.value)}
        >
          {versions.map((version) => (
            <option key={version.documentVersionId} value={version.documentVersionId}>
              {`v${version.version} · ${version.rows.length} tétel${version.isCurrent ? " · aktuális" : ""}`}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[10px] text-[var(--adm-text-muted)]">
        Kinyerve: {formatDate(ingestedAt)} · A verziók külön provenance-t őriznek, a korábbi verzió tételei nem íródnak át.
      </p>
    </div>
  );
}

/**
 * Bounded auto-refresh for a freshly uploaded INTERNAL_ANALYSIS document.
 * CDI ingestion is scheduled fire-and-forget at linkage time, so the very first
 * read can legitimately be empty. The panel retries a SMALL, bounded number of
 * times and stops as soon as rows arrive; documents that legitimately have no
 * anchors simply stop after the cap. This is display-only: it never triggers or
 * controls ingestion/monitoring.
 */
const AUTO_MATRIX_MAX_ATTEMPTS = 6;
const AUTO_MATRIX_REFRESH_MS = 2500;

export function ComplianceClauseAnchorPanel({
  clientId,
  documentId,
  autoRefreshWhileEmpty = false,
}: {
  clientId: string;
  documentId: string;
  autoRefreshWhileEmpty?: boolean;
}) {
  const [data, setData] = useState<ComplianceClauseAnchorReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [clauseQuery, setClauseQuery] = useState("");
  const [relationType, setRelationType] = useState("");
  const [anchorType, setAnchorType] = useState("");
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [matrixCollapsed, setMatrixCollapsed] = useState(false);
  const [autoRefreshAttempts, setAutoRefreshAttempts] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const model = await complianceIntelligenceApi.clauseAnchors(clientId, documentId);
      setData(model);
      const versions = model.versions ?? [];
      const preferred =
        versions.find((version) => version.isCurrent && version.rows.length) ||
        versions.find((version) => version.rows.length) ||
        versions[0] ||
        null;
      setSelectedVersionId(preferred ? preferred.documentVersionId : null);
    } catch {
      setError("A dokumentum jogi mátrixa jelenleg nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }, [clientId, documentId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => { setAutoRefreshAttempts(0); }, [documentId]);

  const totalAnchorRows = useMemo(
    () => (data?.versions ?? []).reduce((sum, version) => sum + (version.rows?.length ?? 0), 0),
    [data],
  );

  // Bounded: at most AUTO_MATRIX_MAX_ATTEMPTS refreshes, stopping at the first row.
  useEffect(() => {
    if (!autoRefreshWhileEmpty || loading || error || totalAnchorRows > 0) return;
    if (autoRefreshAttempts >= AUTO_MATRIX_MAX_ATTEMPTS) return;
    const timer = setTimeout(() => {
      setAutoRefreshAttempts((value) => value + 1);
      void load();
    }, AUTO_MATRIX_REFRESH_MS);
    return () => clearTimeout(timer);
  }, [autoRefreshWhileEmpty, loading, error, totalAnchorRows, autoRefreshAttempts, load]);

  const versions = useMemo(() => data?.versions ?? [], [data]);
  const selectedVersion = useMemo(
    () => versions.find((version) => version.documentVersionId === selectedVersionId) ?? versions[0] ?? null,
    [versions, selectedVersionId],
  );
  const rows = useMemo(() => selectedVersion?.rows ?? [], [selectedVersion]);

  const relationTypes = useMemo(() => Array.from(new Set(rows.map((row) => row.relationType))).sort(), [rows]);
  const unresolvedCount = useMemo(() => rows.filter((row) => !row.anchorKey).length, [rows]);
  const warnedCount = useMemo(() => rows.filter((row) => (row.ingestWarnings ?? []).length > 0).length, [rows]);

  const visibleRows = useMemo(() => {
    const query = clauseQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (query) {
        const haystack = searchableRowText(row).toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (relationType && row.relationType !== relationType) return false;
      if (anchorType && row.anchorType !== anchorType) return false;
      if (unresolvedOnly && row.anchorKey) return false;
      return true;
    });
  }, [rows, clauseQuery, relationType, anchorType, unresolvedOnly]);

  const hasAnyRows = versions.some((version) => version.rows.length > 0);

  return (
    <div className="mt-2 rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3" data-testid="compliance-clause-anchor-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--adm-green-800)]">
          Jogi hivatkozások mátrixa
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[10px] text-[var(--adm-text-muted)]">
            A dokumentum saját, gépi azonosítóval jelölt hivatkozásai. Ez nem jogi értékelés.
          </p>
          {!loading && !error && hasAnyRows ? (
            <button
              type="button"
              data-testid="clause-anchor-toggle"
              aria-expanded={!matrixCollapsed}
              aria-controls="compliance-clause-anchor-matrix"
              onClick={() => setMatrixCollapsed((value) => !value)}
              className="rounded border border-[var(--adm-border)] bg-white px-2 py-0.5 text-[10px] text-[var(--adm-text)]"
            >
              {matrixCollapsed ? "Mátrix megnyitása" : "Mátrix összecsukása"}
            </button>
          ) : null}
        </div>
      </div>

      {loading ? <p className="mt-3 text-xs text-[var(--adm-text-muted)]">Betöltés…</p> : null}
      {!loading && error ? (
        <div role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {error}
          <button type="button" onClick={() => void load()} className="ml-3 rounded border border-[var(--adm-border)] bg-white px-2 py-0.5 text-[10px] text-[var(--adm-text)]">
            Újrapróbálás
          </button>
        </div>
      ) : null}

      {!loading && !error && !hasAnyRows ? (
        <div className="mt-3 text-xs text-[var(--adm-text-muted)]" data-testid="clause-anchor-empty">
          <p>Ehhez a dokumentumhoz még nincs kinyert jogi hivatkozás-mátrix.</p>
          <p className="mt-1">
            A mátrix csak olyan belső elemzési master dokumentumból készül, amely gépi azonosítóval jelölt hivatkozásokat
            tartalmaz. A csak szövegként megadott hivatkozásokat tartalmazó dokumentumokból nem készül mátrix.
          </p>
        </div>
      ) : null}

      {!loading && !error && hasAnyRows ? (
        matrixCollapsed ? (
          <p className="mt-3 text-[10px] text-[var(--adm-text-muted)]" data-testid="clause-anchor-counts">
            {`Megjelenítve: ${visibleRows.length} / ${rows.length} tétel · Azonosító nélkül: ${unresolvedCount} · Feldolgozási jelzéssel: ${warnedCount}`}
          </p>
        ) : (
        <div id="compliance-clause-anchor-matrix" className="mt-3 space-y-3">
          {selectedVersion
            ? versionProvenance({ versions, selectedDocumentVersionId: selectedVersion.documentVersionId, onSelect: setSelectedVersionId })
            : null}

          <div className="grid gap-2 sm:grid-cols-4">
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Tétel keresése</span>
              <input
                type="text"
                className="mt-1 w-full rounded border border-[var(--adm-border)] bg-white px-2 py-1 text-xs text-[var(--adm-text)]"
                placeholder="pl. 1.1."
                value={clauseQuery}
                onChange={(event) => setClauseQuery(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Kapcsolat típusa</span>
              <select
                className="mt-1 w-full rounded border border-[var(--adm-border)] bg-white px-2 py-1 text-xs text-[var(--adm-text)]"
                value={relationType}
                onChange={(event) => setRelationType(event.target.value)}
              >
                <option value="">Összes</option>
                {relationTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Hivatkozás fajtája</span>
              <select
                className="mt-1 w-full rounded border border-[var(--adm-border)] bg-white px-2 py-1 text-xs text-[var(--adm-text)]"
                value={anchorType}
                onChange={(event) => setAnchorType(event.target.value)}
              >
                <option value="">Összes</option>
                {anchorTypeOrder.map((type) => (
                  <option key={type} value={type}>{anchorTypeLabels[type]}</option>
                ))}
              </select>
            </label>
            <label className="flex items-end gap-2 pb-1">
              <input type="checkbox" checked={unresolvedOnly} onChange={(event) => setUnresolvedOnly(event.target.checked)} />
              <span className="text-xs text-[var(--adm-text)]">Csak azonosító nélküli tételek</span>
            </label>
          </div>

          <p className="text-[10px] text-[var(--adm-text-muted)]" data-testid="clause-anchor-counts">
            {`Megjelenítve: ${visibleRows.length} / ${rows.length} tétel · Azonosító nélkül: ${unresolvedCount} · Feldolgozási jelzéssel: ${warnedCount}`}
          </p>

          {rows.length === 0 ? (
            <p className="text-xs text-[var(--adm-text-muted)]" data-testid="clause-anchor-version-empty">
              Ehhez a verzióhoz nincs kinyert tétel.
            </p>
          ) : visibleRows.length === 0 ? (
            <p className="text-xs text-[var(--adm-text-muted)]">Nincs a szűrésnek megfelelő tétel.</p>
          ) : (
            <ul className="space-y-2">{visibleRows.map((row) => clauseAnchorRow(row))}</ul>
          )}
        </div>
        )
      ) : null}
    </div>
  );
}
