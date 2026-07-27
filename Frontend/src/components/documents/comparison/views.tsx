"use client";

/**
 * Comparison views (STRUCTURED-DOC-COMPARISON-1, Phases 12–13).
 * Change meaning is carried by an explicit text marker (＋ added / − removed /
 * ↔ changed / ≈ format / ? possible move) as well as tone — never colour alone.
 * No Word-like editing, no fabricated coordinates.
 */
import { ACCENT } from "@/components/cases/CaseCockpitPanels";
import { changeTypeLabel, changeTypeTone, categoryLabel, reviewStateLabel } from "@/lib/documents/comparisonModel";
import type { SegmentDto } from "@/lib/documents/comparisonApi";

const MARKER: Record<string, string> = {
  INSERT: "＋", DELETE: "−", REPLACE: "↔", FORMAT_ONLY: "≈", MOVE_CANDIDATE: "?",
};

export function ChangeTypeBadge({ type }: { type: SegmentDto["changeType"] }) {
  const a = ACCENT[changeTypeTone(type)];
  return (
    <span data-testid="cmp-change-badge" className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${a.soft} ${a.text}`}>
      <span aria-hidden="true">{MARKER[type]}</span>{changeTypeLabel(type)}
    </span>
  );
}

export function ChangeSegmentRow({ segment, selected, onSelect }: { segment: SegmentDto; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      data-testid="cmp-segment-row"
      data-selected={selected}
      aria-current={selected}
      onClick={onSelect}
      className={`block w-full min-w-0 rounded-md border px-3 py-2 text-left transition-colors ${
        selected ? "border-[#1F5A66] bg-[#EDF2F3]" : "border-[var(--adm-border)] bg-white hover:bg-[var(--adm-surface)]"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="text-[10.5px] font-semibold text-[var(--adm-text-muted)]">#{segment.sequence + 1}</span>
          <ChangeTypeBadge type={segment.changeType} />
          {segment.category !== "UNCLASSIFIED" ? (
            <span className="rounded bg-[var(--adm-ivory-100)] px-1.5 py-0.5 text-[9.5px] font-semibold text-[var(--adm-text-muted)]">{categoryLabel(segment.category)}</span>
          ) : null}
        </span>
        {segment.reviewState !== "UNREVIEWED" ? (
          <span className="text-[10px] font-semibold text-[var(--adm-text-muted)]">{reviewStateLabel(segment.reviewState)}</span>
        ) : null}
      </div>
      {segment.changeType === "MOVE_CANDIDATE" ? (
        <p className="mt-1 text-[10.5px] italic text-[var(--adm-text-muted)]">Bizonytalan: lehetséges áthelyezés, nem megerősített.</p>
      ) : null}
      <div className="mt-1 space-y-0.5">
        {segment.baseExcerpt ? <p className="min-w-0 break-words text-[12px] text-[var(--adm-terracotta-700)]"><span aria-hidden="true">− </span>{segment.baseExcerpt}</p> : null}
        {segment.targetExcerpt ? <p className="min-w-0 break-words text-[12px] text-[var(--adm-green-800)]"><span aria-hidden="true">＋ </span>{segment.targetExcerpt}</p> : null}
      </div>
    </button>
  );
}

export function UnifiedComparisonView({ segments, selectedId, onSelect }: { segments: SegmentDto[]; selectedId: string | null; onSelect: (id: string) => void }) {
  if (segments.length === 0) {
    return <p data-testid="cmp-filtered-empty" className="rounded-md border border-dashed border-[var(--adm-border)] px-3 py-6 text-center text-[12.5px] text-[var(--adm-text-muted)]">A szűrőnek egy változás sem felel meg.</p>;
  }
  return (
    <div data-testid="cmp-unified" className="min-w-0 space-y-2">
      {segments.map((s) => <ChangeSegmentRow key={s.id} segment={s} selected={s.id === selectedId} onSelect={() => onSelect(s.id)} />)}
    </div>
  );
}

export function SideBySideComparisonView({ segments, selectedId, onSelect }: { segments: SegmentDto[]; selectedId: string | null; onSelect: (id: string) => void }) {
  if (segments.length === 0) {
    return <p data-testid="cmp-filtered-empty" className="rounded-md border border-dashed border-[var(--adm-border)] px-3 py-6 text-center text-[12.5px] text-[var(--adm-text-muted)]">A szűrőnek egy változás sem felel meg.</p>;
  }
  return (
    <div data-testid="cmp-side-by-side" className="min-w-0 space-y-2">
      {segments.map((s) => (
        <button
          key={s.id}
          type="button"
          data-testid="cmp-segment-row"
          data-selected={s.id === selectedId}
          aria-current={s.id === selectedId}
          onClick={() => onSelect(s.id)}
          className={`block w-full min-w-0 rounded-md border px-3 py-2 text-left ${s.id === selectedId ? "border-[#1F5A66] bg-[#EDF2F3]" : "border-[var(--adm-border)] bg-white hover:bg-[var(--adm-surface)]"}`}
        >
          <div className="flex items-center gap-2"><span className="text-[10.5px] font-semibold text-[var(--adm-text-muted)]">#{s.sequence + 1}</span><ChangeTypeBadge type={s.changeType} /></div>
          {/* Two columns from sm up; stacked on mobile so it never forces an unreadable side-by-side. */}
          <div className="mt-1 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="min-w-0 rounded bg-[var(--adm-terracotta-100)]/40 px-2 py-1">
              <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--adm-text-muted)]">Alap</p>
              <p className="min-w-0 break-words text-[12px] text-[var(--adm-text)]">{s.baseExcerpt || <span className="italic text-[var(--adm-text-muted)]">— (nincs a bázisban)</span>}</p>
            </div>
            <div className="min-w-0 rounded bg-[var(--adm-sage-100)]/50 px-2 py-1">
              <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--adm-text-muted)]">Cél</p>
              <p className="min-w-0 break-words text-[12px] text-[var(--adm-text)]">{s.targetExcerpt || <span className="italic text-[var(--adm-text-muted)]">— (nincs a célban)</span>}</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
