"use client";

/**
 * Canonical VÁLTOZÁSOK work surface.
 *
 * Bound strictly to the exact previous→current comparison owned by the review
 * projection (`projection.previousVersion → projection.currentVersion` with the
 * projection's own `comparisonId`). There is no free base/target selector here:
 * arbitrary historical pairs stay available as the advanced ComparisonWorkspace
 * outside the canonical primary changes workflow.
 *
 * Reuses the existing comparison hooks and presentational states so segment
 * review, optimistic-conflict handling and lifecycle states stay identical.
 */
import { useCallback, useEffect, useState } from "react";
import { AdminBadge, AdminButton } from "@/components/adminiculum/ui";
import {
  createComparison, retryComparison,
  type SegmentDto, type SegmentFilters, type SegmentCategory, type ReviewState,
} from "@/lib/documents/comparisonApi";
import {
  categoryLabel, categorySourceLabel, reviewStateLabel,
} from "@/lib/documents/comparisonModel";
import { useComparisonSegments, useComparisonSegmentMutation } from "./useComparison";
import { ChangeFilters, ChangeNavigator } from "./filters";
import { ChangeTypeBadge, UnifiedComparisonView } from "./views";

const label = "text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-secondary)]";
const box = "rounded-lg border border-[var(--adm-border)] bg-white px-4 py-6 text-center";

export function CanonicalChangesWorkspace({
  documentId,
  documentTitle,
  comparisonId,
  comparisonStatus,
  baseVersionId,
  targetVersionId,
  baseVersionNumber,
  targetVersionNumber,
  totalSegments,
  segmentStates,
  onChanged,
  onRequestSegmentChanges,
  canManage = true,
}: {
  documentId: string;
  documentTitle: string;
  comparisonId: string | null;
  comparisonStatus: string | null;
  baseVersionId: string | null;
  targetVersionId: string | null;
  baseVersionNumber: number | null;
  targetVersionNumber: number | null;
  totalSegments: number;
  segmentStates: { unreviewed: number; accepted: number; rejected: number; needsDiscussion: number; notRelevant: number };
  onChanged?: () => void | Promise<void>;
  onRequestSegmentChanges?: (segment: SegmentDto) => void;
  canManage?: boolean;
}) {
  const [filters, setFilters] = useState<SegmentFilters>({ limit: 100, offset: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { segments, total, reload: reloadSegments } = useComparisonSegments(comparisonId, filters);
  const mutation = useComparisonSegmentMutation(comparisonId);
  const selected = segments.find((s) => s.id === selectedId) ?? segments[0] ?? null;

  useEffect(() => { setSelectedId(null); }, [comparisonId]);

  const runComparison = useCallback(async () => {
    if (!baseVersionId || !targetVersionId || baseVersionId === targetVersionId) return;
    setCreating(true); setError(null);
    try {
      await createComparison(documentId, baseVersionId, targetVersionId);
      await onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Az összehasonlítás nem indítható.");
    } finally {
      setCreating(false);
    }
  }, [documentId, baseVersionId, targetVersionId, onChanged]);

  const retry = useCallback(async () => {
    if (!comparisonId) return;
    setError(null);
    try {
      await retryComparison(comparisonId);
      await onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Újrapróbálkozás sikertelen.");
    }
  }, [comparisonId, onChanged]);

  const onSave = useCallback(async (patch: { category?: SegmentCategory; reviewState?: ReviewState; internalRationale?: string | null; expectedRevision: number }) => {
    if (!selected) return;
    const updated = await mutation.save(selected.id, patch);
    if (updated) {
      await reloadSegments();
      await onChanged?.();
    }
  }, [selected, mutation, reloadSegments, onChanged]);

  const decide = useCallback(async (reviewState: ReviewState) => {
    if (!selected) return;
    await onSave({ reviewState, expectedRevision: selected.revision });
  }, [selected, onSave]);

  if (!comparisonId) {
    return (
      <div data-testid="canonical-changes-empty" className={box}>
        <h3 className="font-serif text-[17px] font-semibold text-[var(--adm-text-primary)]">Nincs még összehasonlítás</h3>
        <p className="mx-auto mt-1 max-w-md text-[12.5px] text-[var(--adm-text-secondary)]">
          A(z) {baseVersionNumber != null ? `v${baseVersionNumber}` : "előző"} → {targetVersionNumber != null ? `v${targetVersionNumber}` : "aktuális"} verziópárhoz még nem készült összehasonlítás.
        </p>
        <div className="mt-4">
          <AdminButton
            variant="primary"
            size="sm"
            data-testid="canonical-changes-run"
            disabled={!canManage || creating || !baseVersionId || !targetVersionId || baseVersionId === targetVersionId}
            onClick={() => void runComparison()}
          >
            {creating ? "Indítás…" : "Összehasonlítás indítása"}
          </AdminButton>
        </div>
        {error ? <p role="alert" className="mt-2 text-[11.5px] font-semibold text-[var(--adm-brand-terracotta)]">{error}</p> : null}
      </div>
    );
  }

  if (comparisonStatus === "PENDING" || comparisonStatus === "PROCESSING") {
    return (
      <div data-testid="canonical-changes-processing" className={`${box} animate-pulse`} aria-busy="true">
        <h3 className="font-serif text-[17px] font-semibold text-[var(--adm-text-primary)]">
          {comparisonStatus === "PENDING" ? "Előkészítés…" : "Feldolgozás…"}
        </h3>
        <p className="mt-1 text-[12.5px] text-[var(--adm-text-secondary)]">Az összehasonlítás készül. Ez néhány másodpercet vehet igénybe.</p>
      </div>
    );
  }

  if (comparisonStatus === "FAILED") {
    return (
      <div role="alert" data-testid="canonical-changes-failed" className={box}>
        <h3 className="font-serif text-[17px] font-semibold text-[var(--adm-brand-terracotta)]">Az összehasonlítás sikertelen</h3>
        <p className="mx-auto mt-1 max-w-md text-[12.5px] text-[var(--adm-text-secondary)]">Az összehasonlítás nem készült el.</p>
        {canManage ? <div className="mt-4"><AdminButton variant="neutral" size="sm" onClick={() => void retry()} data-testid="canonical-changes-retry">Újrapróbálkozás</AdminButton></div> : null}
        {error ? <p role="alert" className="mt-2 text-[11.5px] font-semibold text-[var(--adm-brand-terracotta)]">{error}</p> : null}
      </div>
    );
  }

  if (comparisonStatus === "UNSUPPORTED") {
    return (
      <div data-testid="canonical-changes-unsupported" className={box}>
        <h3 className="font-serif text-[17px] font-semibold text-[var(--adm-text-primary)]">Nem összehasonlítható</h3>
        <p className="mx-auto mt-1 max-w-md text-[12.5px] text-[var(--adm-text-secondary)]">
          Ehhez a formátumhoz vagy változathoz nem érhető el hiteles kinyert szöveg. A dokumentum letölthető és a verziók elérhetők.
        </p>
      </div>
    );
  }

  if (comparisonStatus === "IDENTICAL") {
    return (
      <div data-testid="canonical-changes-identical" className={box}>
        <h3 className="font-serif text-[17px] font-semibold text-[var(--adm-text-primary)]">Nincs tartalmi eltérés</h3>
        <p className="mt-1 text-[12.5px] text-[var(--adm-text-secondary)]">
          A(z) v{baseVersionNumber} és v{targetVersionNumber} verzió szövege azonos.
        </p>
      </div>
    );
  }

  return (
    <section data-testid="canonical-changes-workspace" className="min-w-0 space-y-3">
      <div className="min-w-0 rounded-lg border border-[var(--adm-border)] bg-white px-3 py-2.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div data-testid="canonical-changes-header" className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--adm-brand-green)]">Változások</p>
            <h2 className="min-w-0 truncate font-serif text-[19px] font-semibold text-[var(--adm-text-primary)]">{documentTitle}</h2>
            <p className="mt-0.5 text-[12px] text-[var(--adm-text-secondary)]">
              <span data-testid="canonical-changes-base-identity">Alap: v{baseVersionNumber ?? "—"}</span> {" → "}
              <span data-testid="canonical-changes-target-identity">Cél: v{targetVersionNumber ?? "—"}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {segmentStates.rejected > 0 ? <AdminBadge tone="burgundy">{segmentStates.rejected} elutasítva</AdminBadge> : null}
            {segmentStates.needsDiscussion > 0 ? <AdminBadge tone="amber">{segmentStates.needsDiscussion} megbeszélendő</AdminBadge> : null}
            {segmentStates.unreviewed > 0 ? <AdminBadge tone="neutral">{segmentStates.unreviewed} átnézetlen</AdminBadge> : null}
          </div>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ChangeFilters filters={filters} onChange={setFilters} />
            <ChangeNavigator
              index={Math.max(0, segments.findIndex((s) => s.id === selected?.id))}
              total={segments.length}
              onPrev={() => setSelectedId(segments[Math.max(0, segments.findIndex((s) => s.id === selected?.id) - 1)]?.id ?? null)}
              onNext={() => setSelectedId(segments[Math.min(segments.length - 1, segments.findIndex((s) => s.id === selected?.id) + 1)]?.id ?? null)}
            />
          </div>
          <UnifiedComparisonView segments={segments} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
          <p className="text-[10.5px] text-[var(--adm-text-secondary)]">{totalSegments} változás összesen (ebből betöltve: {total}).</p>
        </div>
        <CanonicalSegmentDetail
          segment={selected}
          saving={mutation.saving}
          conflict={mutation.conflict}
          error={mutation.error}
          onDecide={decide}
          onReloadConflict={async () => { mutation.clearConflict(); await reloadSegments(); }}
          onRequestChanges={onRequestSegmentChanges}
          canManage={canManage}
        />
      </div>
    </section>
  );
}

function CanonicalSegmentDetail({
  segment, saving, conflict, error, onDecide, onReloadConflict, onRequestChanges, canManage,
}: {
  segment: SegmentDto | null;
  saving: boolean;
  conflict: boolean;
  error: string | null;
  onDecide: (state: ReviewState) => void;
  onReloadConflict: () => void;
  onRequestChanges?: (segment: SegmentDto) => void;
  canManage: boolean;
}) {
  if (!segment) {
    return <div data-testid="canonical-changes-detail-empty" className="rounded-lg border border-[var(--adm-border)] bg-white px-3 py-4 text-[12.5px] text-[var(--adm-text-secondary)]">Válassz egy változást a részletekhez.</div>;
  }

  return (
    <aside data-testid="canonical-changes-detail" className="min-w-0 rounded-lg border border-[var(--adm-border)] bg-white px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChangeTypeBadge type={segment.changeType} />
        <span className="text-[10px] text-[var(--adm-text-secondary)]">Besorolás forrása: {categorySourceLabel(segment.categorySource)}</span>
      </div>

      <div className="mt-2 space-y-1.5">
        {segment.baseExcerpt ? (
          <div className="rounded-md border border-[var(--adm-brand-terracotta-soft)] bg-[var(--adm-brand-terracotta-soft)] px-2.5 py-1.5">
            <p className={label}>ELŐTTE</p>
            <p className="break-words text-[12px] text-[var(--adm-brand-terracotta)]">{segment.baseExcerpt}</p>
          </div>
        ) : null}
        {segment.targetExcerpt ? (
          <div className="rounded-md border border-[var(--adm-semantic-success)]/40 bg-[var(--adm-canvas-subtle)] px-2.5 py-1.5">
            <p className={label}>UTÁNA</p>
            <p className="break-words text-[12px] text-[var(--adm-semantic-success)]">{segment.targetExcerpt}</p>
          </div>
        ) : null}
        {segment.contextBefore ? (
          <p className="text-[11px] text-[var(--adm-text-secondary)]"><b>Kontextus előtte:</b> {segment.contextBefore}</p>
        ) : null}
        {segment.contextAfter ? (
          <p className="text-[11px] text-[var(--adm-text-secondary)]"><b>Kontextus utána:</b> {segment.contextAfter}</p>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-[var(--adm-canvas-subtle)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--adm-text-secondary)]">{categoryLabel(segment.category)}</span>
        <span className="rounded bg-[var(--adm-canvas-subtle)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--adm-text-secondary)]">{reviewStateLabel(segment.reviewState)}</span>
        {segment.linkedTaskId ? <span className="text-[10px] text-[var(--adm-text-secondary)]">Feladat: {segment.linkedTaskId.slice(0, 8)}…</span> : null}
        {segment.linkedAnnotationId ? <span className="text-[10px] text-[var(--adm-text-secondary)]">Annotáció kapcsolva</span> : null}
      </div>

      {segment.internalRationale ? (
        <div className="mt-2 rounded-md border border-[var(--adm-border)] bg-[var(--adm-canvas-subtle)] px-2.5 py-1.5">
          <p className={label}>Belső indoklás</p>
          <p className="break-words text-[12px] text-[var(--adm-text-primary)]">{segment.internalRationale}</p>
        </div>
      ) : null}

      {conflict ? (
        <div role="alert" data-testid="canonical-changes-conflict" className="mt-2 rounded-md border border-[var(--adm-brand-terracotta)]/40 bg-[var(--adm-brand-terracotta-soft)]/40 px-2.5 py-2">
          <p className="text-[11.5px] font-semibold text-[var(--adm-brand-terracotta)]">A szegmenst időközben módosították.</p>
          <AdminButton variant="neutral" size="xs" onClick={onReloadConflict} data-testid="canonical-changes-conflict-reload">Újratöltés</AdminButton>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-[11.5px] font-semibold text-[var(--adm-brand-terracotta)]">{error}</p> : null}

      <div className="mt-3">
        <p className={label}>Műveletek</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <AdminButton variant="neutral" size="xs" data-testid="canonical-changes-accept" disabled={saving || !canManage} onClick={() => onDecide("ACCEPTED")}>Elfogadás</AdminButton>
          <AdminButton variant="danger" size="xs" data-testid="canonical-changes-reject" disabled={saving || !canManage} onClick={() => onDecide("REJECTED")}>Elutasítás</AdminButton>
          <AdminButton variant="gold" size="xs" data-testid="canonical-changes-discuss" disabled={saving || !canManage} onClick={() => onDecide("NEEDS_DISCUSSION")}>Megbeszélendő</AdminButton>
          <AdminButton variant="ghost" size="xs" data-testid="canonical-changes-not-relevant" disabled={saving || !canManage} onClick={() => onDecide("NOT_RELEVANT")}>Nem releváns</AdminButton>
        </div>
        {segment.reviewState === "REJECTED" ? (
          <p data-testid="canonical-changes-rejected-unresolved" className="mt-2 text-[11px] font-semibold text-[var(--adm-brand-terracotta)]">
            Elutasított szakasz — feloldatlan, továbbra is rendezésre vár.
          </p>
        ) : null}
        {onRequestChanges && canManage ? (
          <div className="mt-2">
            <AdminButton variant="neutral" size="xs" data-testid="canonical-changes-request-changes" disabled={saving} onClick={() => onRequestChanges(segment)}>
              Módosítás kérése a szerzőtől…
            </AdminButton>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
