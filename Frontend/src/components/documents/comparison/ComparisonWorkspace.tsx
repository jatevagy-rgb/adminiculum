"use client";

/**
 * ComparisonWorkspace (STRUCTURED-DOC-COMPARISON-1, Phase 9 orchestrator).
 *
 * Owns: version-pair selection, comparison creation/polling (useDocumentComparison),
 * segment listing + filters (useComparisonSegments), selection + keyboard nav,
 * and segment review mutations (useComparisonSegmentMutation). Presentational
 * pieces are the extracted components; this file is composition + wiring only.
 *
 * No document-content editing, no AI controls, no client-publication action.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SegmentFilters } from "@/lib/documents/comparisonApi";
import { getComparison } from "@/lib/documents/comparisonApi";
import { useDocumentComparison, useComparisonSegments, useComparisonSegmentMutation, useComparisonKeyboardNavigation } from "./useComparison";
import { ComparisonHeader, ComparisonToolbar, ComparisonTechnicalDetails, VersionPairSelector, type VersionOption } from "./header";
import { ChangeFilters, ChangeNavigator } from "./filters";
import { UnifiedComparisonView, SideBySideComparisonView } from "./views";
import { ChangeReviewRail } from "./rail";
import {
  ComparisonEmptyState, ComparisonProcessingState, ComparisonIdenticalState,
  ComparisonUnsupportedState, ComparisonFailedState,
} from "./states";

export function ComparisonWorkspace({
  documentId, documentTitle, versions, currentVersionNumber, onDownload, canManage = true,
}: {
  documentId: string;
  documentTitle: string;
  versions: VersionOption[];
  currentVersionNumber: number | null;
  onDownload?: () => void;
  canManage?: boolean;
}) {
  const current = versions.find((v) => v.isCurrent) || versions[versions.length - 1] || null;
  const previous = current ? versions.filter((v) => v.versionNumber < current.versionNumber).sort((a, b) => b.versionNumber - a.versionNumber)[0] : null;
  const [baseId, setBaseId] = useState<string | null>(previous?.id ?? null);
  const [targetId, setTargetId] = useState<string | null>(current?.id ?? null);
  const [mode, setMode] = useState<"unified" | "side">("unified");
  const [filters, setFilters] = useState<SegmentFilters>({ limit: 100, offset: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { comparison, creating, error, create, retry, setComparison } = useDocumentComparison(documentId);
  const ready = comparison?.status === "READY";
  const { segments, total, reload: reloadSegments } = useComparisonSegments(ready ? comparison!.id : null, filters);
  const mutation = useComparisonSegmentMutation(comparison?.id ?? null);

  useComparisonKeyboardNavigation(segments.length, selectedIndex, setSelectedIndex);
  useEffect(() => { if (selectedIndex > segments.length - 1) setSelectedIndex(Math.max(0, segments.length - 1)); }, [segments.length, selectedIndex]);

  const selected = segments[selectedIndex] ?? null;
  const base = useMemo(() => versions.find((v) => v.id === (comparison?.baseVersionId ?? baseId)) ?? null, [versions, comparison?.baseVersionId, baseId]);
  const target = useMemo(() => versions.find((v) => v.id === (comparison?.targetVersionId ?? targetId)) ?? null, [versions, comparison?.targetVersionId, targetId]);

  const sameVersion = baseId != null && baseId === targetId;
  const canCreate = Boolean(baseId && targetId && !sameVersion && !creating);

  const onSave = useCallback(async (patch: Parameters<typeof mutation.save>[1]) => {
    if (!selected) return;
    const updated = await mutation.save(selected.id, patch);
    if (updated && comparison) {
      await reloadSegments();
      try { setComparison(await getComparison(comparison.id)); } catch { /* counts refresh best-effort */ }
    }
  }, [selected, mutation, comparison, reloadSegments, setComparison]);

  const onReloadConflict = useCallback(async () => { mutation.clearConflict(); await reloadSegments(); }, [mutation, reloadSegments]);

  return (
    <section data-testid="comparison-workspace" className="min-w-0 space-y-3">
      <div className="min-w-0 rounded-lg border border-[rgba(22,32,26,0.12)] bg-white px-3 py-2.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <ComparisonHeader
            documentTitle={documentTitle} comparison={comparison}
            base={base ? { versionNumber: base.versionNumber } : null}
            target={target ? { versionNumber: target.versionNumber } : null}
            currentVersionNumber={currentVersionNumber}
          />
          {ready ? <ComparisonToolbar mode={mode} onMode={setMode} /> : null}
        </div>
        <div className="mt-2">
          <VersionPairSelector versions={versions} baseId={baseId} targetId={targetId} disabled={creating}
            onChange={(b, t) => { setBaseId(b || null); setTargetId(t || null); }} />
          {sameVersion ? <p data-testid="cmp-same-version" className="mt-1 text-[11px] font-semibold text-[var(--adm-terracotta-700)]">A bázis és a cél nem lehet ugyanaz a verzió.</p> : null}
        </div>
        {comparison ? <ComparisonTechnicalDetails comparison={comparison} /> : null}
      </div>

      {/* Lifecycle */}
      {!comparison ? (
        <ComparisonEmptyState canCreate={canCreate} onCreate={() => baseId && targetId && create(baseId, targetId)} />
      ) : comparison.status === "PENDING" || comparison.status === "PROCESSING" ? (
        <ComparisonProcessingState status={comparison.status} />
      ) : comparison.status === "IDENTICAL" ? (
        <ComparisonIdenticalState baseLabel={base ? `v${base.versionNumber}` : "alap"} targetLabel={target ? `v${target.versionNumber}` : "cél"} />
      ) : comparison.status === "UNSUPPORTED" ? (
        <ComparisonUnsupportedState reasonCode={comparison.failureCode} onDownload={onDownload} />
      ) : comparison.status === "FAILED" ? (
        <ComparisonFailedState message={comparison.failureMessageSafe} onRetry={retry} canRetry={canManage} />
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ChangeFilters filters={filters} onChange={setFilters} />
              <ChangeNavigator index={selectedIndex} total={segments.length}
                onPrev={() => setSelectedIndex((i) => Math.max(0, i - 1))}
                onNext={() => setSelectedIndex((i) => Math.min(segments.length - 1, i + 1))} />
            </div>
            {mode === "unified"
              ? <UnifiedComparisonView segments={segments} selectedId={selected?.id ?? null} onSelect={(id) => setSelectedIndex(segments.findIndex((s) => s.id === id))} />
              : <SideBySideComparisonView segments={segments} selectedId={selected?.id ?? null} onSelect={(id) => setSelectedIndex(segments.findIndex((s) => s.id === id))} />}
            <p className="text-[10.5px] text-[var(--adm-text-muted)]">{total} változás összesen. Billentyűk: j/k vagy nyilak a léptetéshez.</p>
          </div>
          <ChangeReviewRail
            segment={canManage ? selected : selected /* read view identical; edit disabled below when !canManage */}
            saving={mutation.saving} conflict={mutation.conflict} error={mutation.error}
            onSave={onSave} onReloadConflict={onReloadConflict}
          />
        </div>
      )}
      {error ? <p role="alert" className="text-[11.5px] font-semibold text-[var(--adm-terracotta-700)]">{error}</p> : null}
    </section>
  );
}
