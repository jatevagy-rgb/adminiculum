"use client";

/**
 * Change filters + navigator (STRUCTURED-DOC-COMPARISON-1, Phase 14).
 * Filter changes drive the segment query only; they never mutate the comparison.
 */
import { AdminButton } from "@/components/adminiculum/ui";
import {
  CHANGE_TYPE_LABELS, REVIEW_STATE_LABELS, CATEGORY_LABELS, LEGALLY_RELEVANT_CATEGORIES,
  changeTypeLabel, reviewStateLabel, categoryLabel,
} from "@/lib/documents/comparisonModel";
import type { ChangeType, ReviewState, SegmentCategory, SegmentFilters } from "@/lib/documents/comparisonApi";

const sel = "rounded-md border border-[var(--adm-border)] bg-white px-2 py-1 text-[12px]";

export function ChangeFilters({ filters, onChange }: { filters: SegmentFilters; onChange: (next: SegmentFilters) => void }) {
  const set = (patch: Partial<SegmentFilters>) => onChange({ ...filters, ...patch, offset: 0 });
  return (
    <div data-testid="cmp-filters" className="flex flex-wrap items-center gap-2">
      <select data-testid="cmp-filter-type" className={sel} value={filters.changeType || ""} onChange={(e) => set({ changeType: (e.target.value || undefined) as ChangeType | undefined })}>
        <option value="">Minden típus</option>
        {(Object.keys(CHANGE_TYPE_LABELS) as ChangeType[]).map((t) => <option key={t} value={t}>{changeTypeLabel(t)}</option>)}
      </select>
      <select data-testid="cmp-filter-category" className={sel} value={filters.category || ""} onChange={(e) => set({ category: (e.target.value || undefined) as SegmentCategory | undefined })}>
        <option value="">Minden kategória</option>
        <optgroup label="Jogilag releváns">
          {LEGALLY_RELEVANT_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
        </optgroup>
        {(Object.keys(CATEGORY_LABELS) as SegmentCategory[]).filter((c) => !LEGALLY_RELEVANT_CATEGORIES.includes(c)).map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
      </select>
      <select
        data-testid="cmp-filter-review"
        className={sel}
        value={filters.unreviewedOnly ? "__UNREVIEWED_ONLY__" : (filters.reviewState || "")}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__UNREVIEWED_ONLY__") set({ unreviewedOnly: true, reviewState: undefined });
          else set({ unreviewedOnly: false, reviewState: (v || undefined) as ReviewState | undefined });
        }}
      >
        <option value="">Minden állapot</option>
        <option value="__UNREVIEWED_ONLY__">Csak átnézetlen</option>
        {(Object.keys(REVIEW_STATE_LABELS) as ReviewState[]).map((s) => <option key={s} value={s}>{reviewStateLabel(s)}</option>)}
      </select>
    </div>
  );
}

export function ChangeNavigator({ index, total, onPrev, onNext }: { index: number; total: number; onPrev: () => void; onNext: () => void }) {
  return (
    <div data-testid="cmp-navigator" className="flex items-center gap-2">
      <AdminButton variant="neutral" size="xs" onClick={onPrev} disabled={total === 0 || index <= 0} data-testid="cmp-prev">← Előző</AdminButton>
      <span className="text-[11.5px] text-[var(--adm-text-muted)]" data-testid="cmp-nav-position">{total === 0 ? "0 / 0" : `${index + 1} / ${total}`}</span>
      <AdminButton variant="neutral" size="xs" onClick={onNext} disabled={total === 0 || index >= total - 1} data-testid="cmp-next">Következő →</AdminButton>
    </div>
  );
}
