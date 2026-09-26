"use client";

import { useMemo, useState } from "react";
import type {
  DocumentAnnotationComment,
  DocumentReviewRailComment,
  DocumentReviewRailDto,
  DocumentReviewRailProposal,
} from "@/lib/api";
import { readerCopy } from "./readerCopy";
import { mergeRailEntries } from "./readerContracts";

export type RailFilter = "all" | "comments" | "proposals";

export interface DocumentReviewRailProps {
  rail: DocumentReviewRailDto | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  filter: RailFilter;
  onFilterChange: (filter: RailFilter) => void;
  activeItemId: string | null;
  onFocusComment: (comment: DocumentReviewRailComment) => void;
  onFocusProposal: (proposal: DocumentReviewRailProposal) => void;
  canDecide: boolean;
  currentUserId: string | null;
  decisionBusyId: string | null;
  onAccept: (proposal: DocumentReviewRailProposal) => void;
  onReject: (proposal: DocumentReviewRailProposal) => void;
  onWithdraw: (proposal: DocumentReviewRailProposal) => void;
  repliesByAnnotationId: Record<string, DocumentAnnotationComment[]>;
  onLoadReplies: (annotationId: string) => void;
  onSubmitReply: (annotationId: string, body: string) => void;
  replyBusyId: string | null;
}

type RailEntry = ReturnType<typeof mergeRailEntries>[number];

function formatDateTime(value: string | null): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("hu-HU");
  } catch {
    return value;
  }
}

function statusLabel(status: DocumentReviewRailProposal["status"]): string {
  if (status === "ACCEPTED") return readerCopy.statusAccepted;
  if (status === "REJECTED") return readerCopy.statusRejected;
  return readerCopy.statusPending;
}

function statusTone(status: DocumentReviewRailProposal["status"]): string {
  if (status === "ACCEPTED") return "border-[var(--adm-brand-green)] text-[var(--adm-brand-green)]";
  if (status === "REJECTED") return "border-[var(--adm-brand-terracotta)] text-[var(--adm-brand-terracotta)]";
  return "border-[var(--adm-border-canonical)] text-[var(--adm-text-secondary)]";
}

function CommentCard({
  comment,
  active,
  replies,
  onFocus,
  onLoadReplies,
  onSubmitReply,
  replyBusy,
}: {
  comment: DocumentReviewRailComment;
  active: boolean;
  replies: DocumentAnnotationComment[] | undefined;
  onFocus: () => void;
  onLoadReplies: () => void;
  onSubmitReply: (body: string) => void;
  replyBusy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [replyBody, setReplyBody] = useState("");

  const toggleReplies = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) onLoadReplies();
  };

  return (
    <li
      data-testid="reader-rail-comment"
      data-rail-item-id={comment.id}
      className={`rounded-[10px] border p-3 ${active ? "border-[var(--adm-brand-green)] bg-[var(--adm-canvas-subtle)]" : "border-[var(--adm-border-canonical)] bg-white"}`}
    >
      <button
        type="button"
        onClick={onFocus}
        data-testid="reader-rail-comment-focus"
        className="block w-full text-left"
      >
        <span className="mb-1 block line-clamp-2 rounded-[6px] bg-[var(--adm-canvas-subtle)] px-2 py-1 text-xs italic text-[var(--adm-text-secondary)]">
          {comment.selectedText || "—"}
        </span>
        <span className="block text-sm text-[var(--adm-text-primary)]">{comment.reviewComment || "—"}</span>
        <span className="mt-1 block text-[11px] text-[var(--adm-text-secondary)]">
          {comment.createdBy?.name || "Ismeretlen"} · {formatDateTime(comment.createdAt)}
        </span>
      </button>
      {comment.replyCount > 0 ? (
        <button
          type="button"
          data-testid="reader-rail-comment-replies-toggle"
          onClick={toggleReplies}
          className="mt-2 text-xs font-semibold text-[var(--adm-brand-green)]"
        >
          {readerCopy.repliesShow} ({comment.replyCount})
        </button>
      ) : null}
      {expanded ? (
        <div data-testid="reader-rail-comment-replies" className="mt-2 space-y-1.5 border-t border-[var(--adm-border-canonical)] pt-2">
          {(replies ?? []).map((reply) => (
            <p key={reply.id} className="text-xs text-[var(--adm-text-primary)]">
              <span className="font-semibold">{reply.createdBy?.name || "Ismeretlen"}: </span>
              {reply.body}
            </p>
          ))}
          <label className="block">
            <span className="sr-only">{readerCopy.replyPlaceholder}</span>
            <textarea
              data-testid="reader-rail-reply-input"
              aria-label={readerCopy.replyPlaceholder}
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
              rows={2}
              placeholder={readerCopy.replyPlaceholder}
              className="w-full rounded-[6px] border border-[var(--adm-border-canonical)] px-2 py-1 text-xs outline-none focus:border-[var(--adm-brand-green)]"
            />
          </label>
          <button
            type="button"
            data-testid="reader-rail-reply-submit"
            disabled={replyBusy || !replyBody.trim()}
            onClick={() => {
              const body = replyBody.trim();
              if (!body) return;
              onSubmitReply(body);
              setReplyBody("");
            }}
            className="rounded-[6px] bg-[var(--adm-brand-green)] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {readerCopy.replySubmit}
          </button>
        </div>
      ) : null}
    </li>
  );
}

export function DocumentReviewRail({
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
}: DocumentReviewRailProps) {
  const entries = useMemo<RailEntry[]>(
    () => (rail ? mergeRailEntries(rail.comments, rail.proposals) : []),
    [rail],
  );

  const visible = entries.filter((entry) =>
    filter === "all" ? true : filter === "comments" ? entry.kind === "comment" : entry.kind === "proposal",
  );

  return (
    <section data-testid="document-review-rail" className="flex h-full min-h-0 flex-col">
      <header className="border-b border-[var(--adm-border-canonical)] px-4 py-3">
        <h2 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">{readerCopy.railTitle}</h2>
        {rail ? (
          <div data-testid="reader-rail-counts" className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--adm-text-secondary)]">
            <span>{readerCopy.countComments}: <b className="text-[var(--adm-text-primary)]">{rail.counts.commentCount}</b></span>
            <span>{readerCopy.countProposals}: <b className="text-[var(--adm-text-primary)]">{rail.counts.modificationProposalCount}</b></span>
            <span>{readerCopy.countPending}: <b className="text-[var(--adm-text-primary)]">{rail.counts.pendingProposalCount}</b></span>
          </div>
        ) : null}
      </header>

      <div className="flex gap-1 border-b border-[var(--adm-border-canonical)] px-4 py-2">
        {(["all", "comments", "proposals"] as const).map((value) => (
          <button
            key={value}
            type="button"
            data-testid={`reader-rail-filter-${value}`}
            aria-pressed={filter === value}
            onClick={() => onFilterChange(value)}
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${filter === value ? "bg-[var(--adm-brand-green)] text-white" : "text-[var(--adm-text-secondary)] hover:bg-[var(--adm-canvas-subtle)]"}`}
          >
            {value === "all" ? readerCopy.filterAll : value === "comments" ? readerCopy.filterComments : readerCopy.filterProposals}
          </button>
        ))}
      </div>

      {rail?.counts.proposalDecisionComplete ? (
        <p data-testid="reader-rail-complete" className="border-b border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] px-4 py-2 text-xs font-semibold text-[var(--adm-brand-green)]">
          {readerCopy.railComplete}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <p data-testid="reader-rail-loading" className="text-sm text-[var(--adm-text-secondary)]">…</p>
        ) : error ? (
          <div data-testid="reader-rail-error" className="rounded-[8px] border border-[var(--adm-brand-terracotta)] p-3">
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
        ) : visible.length === 0 ? (
          <div data-testid="reader-rail-empty">
            <p className="text-sm text-[var(--adm-text-secondary)]">{readerCopy.railEmpty}</p>
            <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">{readerCopy.railEmptyHint}</p>
          </div>
        ) : (
          <ul className="space-y-2">
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
                />
              ) : (
                <li
                  key={entry.proposal.id}
                  data-testid="reader-rail-proposal"
                  data-rail-item-id={entry.proposal.id}
                  className={`rounded-[10px] border p-3 ${activeItemId === entry.proposal.id ? "border-[var(--adm-brand-green)] bg-[var(--adm-canvas-subtle)]" : "border-[var(--adm-border-canonical)] bg-white"}`}
                >
                  <button
                    type="button"
                    onClick={() => onFocusProposal(entry.proposal)}
                    data-testid="reader-rail-proposal-focus"
                    className="block w-full text-left"
                  >
                    <span className="mb-1 block text-xs text-[var(--adm-text-secondary)] line-through">
                      {entry.proposal.selectedText}
                    </span>
                    <span className="block text-sm font-medium text-[var(--adm-text-primary)]">
                      {entry.proposal.proposedText}
                    </span>
                    {entry.proposal.rationale ? (
                      <span className="mt-1 block text-xs text-[var(--adm-text-secondary)]">{entry.proposal.rationale}</span>
                    ) : null}
                    <span className="mt-1 block text-[11px] text-[var(--adm-text-secondary)]">
                      {entry.proposal.createdBy?.name || "Ismeretlen"} · {formatDateTime(entry.proposal.createdAt)}
                    </span>
                  </button>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span
                      data-testid="reader-rail-proposal-status"
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusTone(entry.proposal.status)}`}
                    >
                      {statusLabel(entry.proposal.status)}
                    </span>
                    {entry.proposal.status === "PENDING" && canDecide ? (
                      <span className="flex gap-1.5">
                        <button
                          type="button"
                          data-testid="reader-rail-proposal-accept"
                          disabled={decisionBusyId === entry.proposal.id}
                          onClick={() => onAccept(entry.proposal)}
                          className="rounded-[6px] bg-[var(--adm-brand-green)] px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {readerCopy.decisionAccept}
                        </button>
                        <button
                          type="button"
                          data-testid="reader-rail-proposal-reject"
                          disabled={decisionBusyId === entry.proposal.id}
                          onClick={() => onReject(entry.proposal)}
                          className="rounded-[6px] border border-[var(--adm-brand-terracotta)] px-2 py-0.5 text-xs font-semibold text-[var(--adm-brand-terracotta)] disabled:opacity-50"
                        >
                          {readerCopy.decisionReject}
                        </button>
                      </span>
                    ) : null}
                  </div>

                  {entry.proposal.status === "REJECTED" && entry.proposal.decisionReason ? (
                    <p data-testid="reader-rail-proposal-reason" className="mt-1 text-xs text-[var(--adm-text-secondary)]">
                      {readerCopy.rejectReasonLabel}: {entry.proposal.decisionReason}
                    </p>
                  ) : null}

                  {entry.proposal.status === "PENDING" && currentUserId === entry.proposal.createdBy?.id ? (
                    <button
                      type="button"
                      data-testid="reader-rail-proposal-withdraw"
                      disabled={decisionBusyId === entry.proposal.id}
                      onClick={() => onWithdraw(entry.proposal)}
                      className="mt-2 text-[11px] font-semibold text-[var(--adm-text-secondary)] underline disabled:opacity-50"
                    >
                      {readerCopy.withdraw}
                    </button>
                  ) : null}
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
