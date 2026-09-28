"use client";

import { useEffect, useRef, useState } from "react";
import { readerCopy } from "./readerCopy";

export interface ReviewCommentComposerProps {
  open: boolean;
  selectedText: string;
  busy: boolean;
  error: string | null;
  /** Identity of the anchored target; changing it starts a fresh comment. */
  targetKey?: string;
  onCancel: () => void;
  onSubmit: (body: string) => void;
  /**
   * Quiet switch to the modification-proposal composer for the SAME anchor.
   * Never submits anything and never requires a fresh text selection.
   */
  onSwitchToProposal?: () => void;
}

/**
 * Compact, contextual comment composer.
 *
 * Rendered inside the review margin next to the selected sentence (or the
 * narrow drawer). It is intentionally NOT a centered modal, so the document
 * stays visible while writing.
 */
export function ReviewCommentComposer({
  open,
  selectedText,
  busy,
  error,
  targetKey,
  onCancel,
  onSubmit,
  onSwitchToProposal,
}: ReviewCommentComposerProps) {
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Never retain a previous operation's text across close/reopen or target change.
  // While the composer stays open (including after an API error) typing is preserved.
  useEffect(() => {
    setBody("");
  }, [open, targetKey]);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open, targetKey]);

  if (!open) return null;

  const trimmed = body.trim();

  return (
    <div
      data-testid="review-comment-composer"
      role="group"
      aria-label={readerCopy.commentComposerTitle}
      className="rounded-[10px] border border-[var(--adm-brand-green)] bg-white p-3 shadow-sm"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-secondary)]">
          {readerCopy.commentComposerTitle}
        </span>
        {onSwitchToProposal ? (
          <button
            type="button"
            data-testid="review-comment-switch-to-proposal"
            onClick={onSwitchToProposal}
            disabled={busy}
            title={readerCopy.switchHint}
            className="text-[11px] font-semibold text-[var(--adm-brand-terracotta)] underline disabled:opacity-50"
          >
            {readerCopy.switchToProposal}
          </button>
        ) : null}
      </div>

      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-secondary)]">
        {readerCopy.proposalOriginalLabel}
      </span>
      <blockquote
        data-testid="review-comment-excerpt"
        className="mb-2 max-h-24 overflow-y-auto rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] px-3 py-2 text-sm text-[var(--adm-text-primary)]"
      >
        {selectedText}
      </blockquote>

      <label className="block">
        <span className="sr-only">{readerCopy.commentComposerTitle}</span>
        <textarea
          ref={textareaRef}
          data-testid="review-comment-input"
          aria-label={readerCopy.commentComposerTitle}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          placeholder={readerCopy.commentComposerPlaceholder}
          className="w-full rounded-[8px] border border-[var(--adm-border-canonical)] px-3 py-2 text-sm outline-none focus:border-[var(--adm-brand-green)]"
        />
      </label>

      {error ? (
        <p data-testid="review-comment-error" role="alert" className="mt-2 text-sm text-[var(--adm-brand-terracotta)]">
          {error}
        </p>
      ) : null}

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          data-testid="review-comment-cancel"
          onClick={onCancel}
          disabled={busy}
          className="rounded-[8px] border border-[var(--adm-border-canonical)] px-3 py-1.5 text-sm font-semibold text-[var(--adm-text-secondary)] disabled:opacity-50"
        >
          {readerCopy.cancel}
        </button>
        <button
          type="button"
          data-testid="review-comment-submit"
          onClick={() => onSubmit(body)}
          disabled={busy || !trimmed}
          className="rounded-[8px] bg-[var(--adm-brand-green)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "…" : readerCopy.commentAdd}
        </button>
      </div>
    </div>
  );
}
