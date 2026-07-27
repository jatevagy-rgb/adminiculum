"use client";

/**
 * Change review rail (STRUCTURED-DOC-COMPARISON-1, Phase 15). Edit category,
 * review state and a bounded rationale for the selected segment. Manual category
 * sets source to MANUAL; save has loading/success; optimistic conflict offers a
 * reload/reapply choice. No AI classification, no client-publication action.
 */
import { useEffect, useState } from "react";
import { AdminButton } from "@/components/adminiculum/ui";
import { ChangeTypeBadge } from "./views";
import {
  CATEGORY_LABELS, REVIEW_STATE_LABELS, categoryLabel, categorySourceLabel, reviewStateLabel,
} from "@/lib/documents/comparisonModel";
import type { SegmentDto, SegmentCategory, ReviewState } from "@/lib/documents/comparisonApi";

const MAX_RATIONALE = 2000;
const label = "text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]";
const field = "mt-1 w-full min-w-0 rounded-md border border-[var(--adm-border)] bg-white px-2.5 py-1.5 text-[12.5px]";

export function ChangeReviewRail({
  segment, saving, conflict, error, onSave, onReloadConflict,
}: {
  segment: SegmentDto | null;
  saving: boolean;
  conflict: boolean;
  error: string | null;
  onSave: (patch: { category?: SegmentCategory; reviewState?: ReviewState; internalRationale?: string | null; expectedRevision: number }) => void;
  onReloadConflict: () => void;
}) {
  const [category, setCategory] = useState<SegmentCategory>("UNCLASSIFIED");
  const [reviewState, setReviewState] = useState<ReviewState>("UNREVIEWED");
  const [rationale, setRationale] = useState("");

  useEffect(() => {
    if (segment) { setCategory(segment.category); setReviewState(segment.reviewState); setRationale(segment.internalRationale || ""); }
  }, [segment?.id, segment?.revision]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!segment) {
    return <div data-testid="cmp-rail-empty" className="rounded-lg border border-[var(--adm-border)] bg-white px-3 py-4 text-[12.5px] text-[var(--adm-text-muted)]">Válassz egy változást a részletekhez.</div>;
  }

  const tooLong = rationale.length > MAX_RATIONALE;

  return (
    <aside data-testid="cmp-review-rail" className="min-w-0 rounded-lg border border-[var(--adm-border)] bg-white px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChangeTypeBadge type={segment.changeType} />
        <span className="text-[10px] text-[var(--adm-text-muted)]">Besorolás forrása: {categorySourceLabel(segment.categorySource)}</span>
      </div>

      <div className="mt-2 space-y-1">
        {segment.baseExcerpt ? <div data-testid="cmp-rail-base"><p className={label}>Alap</p><p className="break-words text-[12px] text-[var(--adm-terracotta-700)]">{segment.baseExcerpt}</p></div> : null}
        {segment.targetExcerpt ? <div data-testid="cmp-rail-target"><p className={label}>Cél</p><p className="break-words text-[12px] text-[var(--adm-green-800)]">{segment.targetExcerpt}</p></div> : null}
      </div>

      <div className="mt-2">
        <label className={label} htmlFor="cmp-category">Kategória</label>
        <select id="cmp-category" data-testid="cmp-category" className={field} value={category} onChange={(e) => setCategory(e.target.value as SegmentCategory)} disabled={saving}>
          {(Object.keys(CATEGORY_LABELS) as SegmentCategory[]).map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
        </select>
      </div>
      <div className="mt-2">
        <label className={label} htmlFor="cmp-review-state">Állapot</label>
        <select id="cmp-review-state" data-testid="cmp-review-state" className={field} value={reviewState} onChange={(e) => setReviewState(e.target.value as ReviewState)} disabled={saving}>
          {(Object.keys(REVIEW_STATE_LABELS) as ReviewState[]).map((s) => <option key={s} value={s}>{reviewStateLabel(s)}</option>)}
        </select>
      </div>
      <div className="mt-2">
        <label className={label} htmlFor="cmp-rationale">Belső indoklás</label>
        <textarea id="cmp-rationale" data-testid="cmp-rationale" rows={3} className={field} value={rationale} onChange={(e) => setRationale(e.target.value)} disabled={saving} />
        <p className={`mt-0.5 text-[10px] ${tooLong ? "font-semibold text-[var(--adm-terracotta-700)]" : "text-[var(--adm-text-muted)]"}`}>{rationale.length}/{MAX_RATIONALE}</p>
      </div>

      {segment.linkedTaskId ? <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Kapcsolt feladat: {segment.linkedTaskId}</p> : null}

      {conflict ? (
        <div role="alert" data-testid="cmp-conflict" className="mt-2 rounded-md border border-[var(--adm-terracotta-700)]/40 bg-[var(--adm-terracotta-100)]/40 px-2.5 py-2">
          <p className="text-[11.5px] font-semibold text-[var(--adm-terracotta-700)]">A szegmenst időközben módosították.</p>
          <AdminButton variant="neutral" size="xs" onClick={onReloadConflict} data-testid="cmp-conflict-reload">Újratöltés</AdminButton>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-[11.5px] font-semibold text-[var(--adm-terracotta-700)]">{error}</p> : null}

      <div className="mt-2.5 flex justify-end">
        <AdminButton
          variant="primary" size="xs" data-testid="cmp-rail-save" disabled={saving || tooLong}
          onClick={() => onSave({ category, reviewState, internalRationale: rationale.trim() || null, expectedRevision: segment.revision })}
        >
          {saving ? "Mentés…" : "Mentés"}
        </AdminButton>
      </div>
    </aside>
  );
}
