"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Modal } from "@/components/ui/Modal";
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
}

/** Compact contextual composer for a reader comment on the exact selection. */
export function ReviewCommentComposer({
  open,
  selectedText,
  busy,
  error,
  targetKey,
  onCancel,
  onSubmit,
}: ReviewCommentComposerProps) {
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Never retain a previous operation's text across close/reopen or target change.
  // While the composer stays open (including after an API error) typing is preserved.
  useEffect(() => {
    setBody("");
  }, [open, targetKey]);

  const trimmed = body.trim();

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onCancel}
      title={readerCopy.commentComposerTitle}
      maxWidth="lg"
      initialFocusRef={textareaRef as unknown as RefObject<HTMLElement | null>}
      footer={
        <>
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
            {busy ? '…' : readerCopy.commentAdd}
          </button>
        </>
      }
    >
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-secondary)]">
        {readerCopy.proposalOriginalLabel}
      </p>
      <blockquote
        data-testid="review-comment-excerpt"
        className="mb-3 max-h-32 overflow-y-auto rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] px-3 py-2 text-sm text-[var(--adm-text-primary)]"
      >
        {selectedText}
      </blockquote>
      <label className="block text-sm font-semibold text-[var(--adm-text-primary)]">
        {readerCopy.commentComposerTitle}
        <textarea
          ref={textareaRef}
          data-testid="review-comment-input"
          aria-label={readerCopy.commentComposerTitle}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={4}
          placeholder={readerCopy.commentComposerPlaceholder}
          className="mt-1 w-full rounded-[8px] border border-[var(--adm-border-canonical)] px-3 py-2 text-sm font-normal outline-none focus:border-[var(--adm-brand-green)]"
        />
      </label>
      {error ? (
        <p data-testid="review-comment-error" role="alert" className="mt-2 text-sm text-[var(--adm-brand-terracotta)]">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
