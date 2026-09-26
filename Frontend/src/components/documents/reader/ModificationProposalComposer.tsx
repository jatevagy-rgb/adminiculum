"use client";

import { useEffect, useRef, useState } from "react";
import { readerCopy } from "./readerCopy";

export interface ModificationProposalComposerProps {
  open: boolean;
  selectedText: string;
  busy: boolean;
  error: string | null;
  /** Identity of the anchored target; changing it starts a fresh proposal. */
  targetKey?: string;
  onCancel: () => void;
  onSubmit: (payload: { proposedText: string; rationale: string }) => void;
  /**
   * Quiet switch to the comment composer for the SAME anchor. Never submits
   * anything and never requires a fresh text selection.
   */
  onSwitchToComment?: () => void;
}

/**
 * Compact, contextual modification-proposal composer.
 *
 * Rendered inside the review margin next to the selected sentence (or the
 * narrow drawer), not as a centered modal. It shows the exact ORIGINAL text,
 * requires the proposed replacement and accepts an optional rationale. An
 * unchanged or empty proposal is refused client-side; the backend remains the
 * authority.
 */
export function ModificationProposalComposer({
  open,
  selectedText,
  busy,
  error,
  targetKey,
  onCancel,
  onSubmit,
  onSwitchToComment,
}: ModificationProposalComposerProps) {
  const [proposedText, setProposedText] = useState("");
  const [rationale, setRationale] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Never retain a previous operation's text across close/reopen or target change.
  useEffect(() => {
    setProposedText("");
    setRationale("");
  }, [open, targetKey]);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open, targetKey]);

  const normalizedOriginal = selectedText.replace(/\s+/g, " ").trim();
  const normalizedProposed = proposedText.replace(/\s+/g, " ").trim();
  const isUnchanged = normalizedProposed.length === 0 || normalizedProposed === normalizedOriginal;

  if (!open) return null;

  return (
    <div
      data-testid="proposal-composer"
      role="group"
      aria-label={readerCopy.proposalComposerTitle}
      className="space-y-3 rounded-[10px] border border-[var(--adm-brand-green)] bg-white p-3 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-secondary)]">
          {readerCopy.proposalComposerTitle}
        </span>
        {onSwitchToComment ? (
          <button
            type="button"
            data-testid="proposal-switch-to-comment"
            onClick={onSwitchToComment}
            disabled={busy}
            title={readerCopy.switchHint}
            className="text-[11px] font-semibold text-[var(--adm-brand-terracotta)] underline disabled:opacity-50"
          >
            {readerCopy.switchToComment}
          </button>
        ) : null}
      </div>

      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-secondary)]">
          {readerCopy.proposalOriginalLabel}
        </p>
        <blockquote
          data-testid="proposal-original"
          className="max-h-24 overflow-y-auto rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] px-3 py-2 text-sm text-[var(--adm-text-primary)]"
        >
          {selectedText}
        </blockquote>
      </div>

      <label className="block text-sm font-semibold text-[var(--adm-text-primary)]">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-secondary)]">
          {readerCopy.proposalSuggestedLabel}
        </span>
        <textarea
          ref={textareaRef}
          data-testid="proposal-suggested-text"
          aria-label={readerCopy.proposalSuggestedLabel}
          value={proposedText}
          onChange={(event) => setProposedText(event.target.value)}
          rows={3}
          className="w-full rounded-[8px] border border-[var(--adm-border-canonical)] px-3 py-2 text-sm font-normal outline-none focus:border-[var(--adm-brand-green)]"
        />
      </label>

      <label className="block text-sm font-semibold text-[var(--adm-text-primary)]">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-secondary)]">
          {readerCopy.proposalRationaleLabel}
        </span>
        <textarea
          data-testid="proposal-rationale"
          aria-label={readerCopy.proposalRationaleLabel}
          value={rationale}
          onChange={(event) => setRationale(event.target.value)}
          rows={2}
          placeholder={readerCopy.proposalRationalePlaceholder}
          className="w-full rounded-[8px] border border-[var(--adm-border-canonical)] px-3 py-2 text-sm font-normal outline-none focus:border-[var(--adm-brand-green)]"
        />
      </label>

      {error ? (
        <p data-testid="proposal-error" role="alert" className="text-sm text-[var(--adm-brand-terracotta)]">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          data-testid="proposal-cancel"
          onClick={onCancel}
          disabled={busy}
          className="rounded-[8px] border border-[var(--adm-border-canonical)] px-3 py-1.5 text-sm font-semibold text-[var(--adm-text-secondary)] disabled:opacity-50"
        >
          {readerCopy.cancel}
        </button>
        <button
          type="button"
          data-testid="proposal-submit"
          onClick={() => onSubmit({ proposedText, rationale })}
          disabled={busy || isUnchanged}
          className="rounded-[8px] bg-[var(--adm-brand-green)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "…" : readerCopy.proposalSubmit}
        </button>
      </div>
    </div>
  );
}
