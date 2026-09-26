"use client";

import { useMemo, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { readerCopy } from "./readerCopy";
import { mergeRailEntries } from "./readerContracts";
import type { RailLayoutItem } from "./railAnchorLayout";
import { useReaderRailLayout } from "./useReaderRailLayout";
import {
  CommentCard,
  filterRailEntries,
  ProposalCard,
  RailChrome,
  type DocumentReviewRailProps,
} from "./DocumentReviewRail";

export interface DocumentReviewMarginProps extends Omit<DocumentReviewRailProps, "draft"> {
  /** The rendered document root that owns the canonical version text. */
  documentRef: RefObject<HTMLElement | null>;
  /** Optional anchored draft composer, positioned at its own anchor. */
  draft?: ReactNode;
  draftId?: string;
  draftOffset?: number | null;
}

function absoluteTop(top: number | undefined): CSSProperties {
  return { position: "absolute", left: 0, right: 0, top: top ?? 0 };
}

/**
 * Desktop anchor-aligned review margin.
 *
 * Each comment/proposal is positioned next to the document sentence it
 * references (by version-scoped `startOffset`) inside the same scroll region as
 * the document, with deterministic collision handling so cards never overlap.
 * The narrow-viewport equivalent is the ordered list in `DocumentReviewRail`.
 */
export function DocumentReviewMargin(props: DocumentReviewMarginProps) {
  const {
    rail,
    loading,
    error,
    onRetry,
    filter,
    onFilterChange,
    activeItemId,
    onFocusComment,
    onFocusProposal,
    canDecide,
    currentUserId,
    decisionBusyId,
    onAccept,
    onReject,
    onWithdraw,
    repliesByAnnotationId,
    onLoadReplies,
    onSubmitReply,
    replyBusyId,
    documentRef,
    draft,
    draftId,
    draftOffset,
  } = props;

  const columnRef = useRef<HTMLDivElement | null>(null);

  const entries = useMemo(
    () => (rail ? mergeRailEntries(rail.comments, rail.proposals) : []),
    [rail],
  );
  const visible = useMemo(() => filterRailEntries(entries, filter), [entries, filter]);

  const items = useMemo<RailLayoutItem[]>(() => {
    const list: RailLayoutItem[] = visible.map((entry) =>
      entry.kind === "comment"
        ? {
            id: entry.comment.id,
            kind: "comment" as const,
            startOffset: entry.comment.startOffset,
            endOffset: entry.comment.endOffset,
            createdAt: entry.comment.createdAt,
          }
        : {
            id: entry.proposal.id,
            kind: "proposal" as const,
            startOffset: entry.proposal.startOffset,
            endOffset: entry.proposal.endOffset,
            createdAt: entry.proposal.createdAt,
          },
    );
    if (draft && draftId) {
      list.push({ id: draftId, kind: "draft", startOffset: draftOffset ?? null, endOffset: null, createdAt: "" });
    }
    return list;
  }, [visible, draft, draftId, draftOffset]);

  const { positions, contentHeight, registerCard } = useReaderRailLayout({
    containerRef: columnRef,
    documentRef,
    items,
    enabled: true,
  });

  return (
    <section data-testid="document-review-margin" className="relative flex h-full min-h-0 w-full flex-col">
      <div className="sticky top-0 z-20 border-b border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]">
        <RailChrome rail={rail} filter={filter} onFilterChange={onFilterChange} />
      </div>

      <div
        ref={columnRef}
        data-testid="document-review-margin-body"
        className="relative min-h-0 flex-1"
        style={{ minHeight: contentHeight }}
      >
        {loading ? (
          <p data-testid="reader-rail-loading" className="px-4 py-3 text-sm text-[var(--adm-text-secondary)]">…</p>
        ) : error ? (
          <div data-testid="reader-rail-error" className="m-4 rounded-[8px] border border-[var(--adm-brand-terracotta)] p-3">
            <p className="text-sm text-[var(--adm-text-primary)]">{readerCopy.railError}</p>
            <button
              type="button"
              data-testid="reader-rail-retry"
              onClick={onRetry}
              className="mt-2 rounded-[6px] border border-[var(--adm-brand-green)] px-2 py-1 text-xs font-semibold text-[var(--adm-brand-green)]"
            >
              {readerCopy.retry}
            </button>
          </div>
        ) : visible.length === 0 && !draft ? (
          <div data-testid="reader-rail-empty" className="px-4 py-3">
            <p className="text-sm text-[var(--adm-text-secondary)]">{readerCopy.railEmpty}</p>
            <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">{readerCopy.railEmptyHint}</p>
          </div>
        ) : null}

        <ul className="m-0 list-none p-0">
          {visible.map((entry) =>
            entry.kind === "comment" ? (
              <CommentCard
                key={entry.comment.id}
                comment={entry.comment}
                active={activeItemId === entry.comment.id}
                replies={repliesByAnnotationId[entry.comment.id]}
                onFocus={() => onFocusComment(entry.comment)}
                onLoadReplies={() => onLoadReplies(entry.comment.id)}
                onSubmitReply={(body) => onSubmitReply(entry.comment.id, body)}
                replyBusy={replyBusyId === entry.comment.id}
                style={absoluteTop(positions[entry.comment.id])}
                cardRef={registerCard(entry.comment.id)}
              />
            ) : (
              <ProposalCard
                key={entry.proposal.id}
                entry={entry}
                active={activeItemId === entry.proposal.id}
                canDecide={canDecide}
                currentUserId={currentUserId}
                decisionBusyId={decisionBusyId}
                onFocus={() => onFocusProposal(entry.proposal)}
                onAccept={() => onAccept(entry.proposal)}
                onReject={() => onReject(entry.proposal)}
                onWithdraw={() => onWithdraw(entry.proposal)}
                style={absoluteTop(positions[entry.proposal.id])}
                cardRef={registerCard(entry.proposal.id)}
              />
            ),
          )}
        </ul>

        {draft && draftId ? (
          <div ref={registerCard(draftId)} style={absoluteTop(positions[draftId])}>
            {draft}
          </div>
        ) : null}
      </div>
    </section>
  );
}
