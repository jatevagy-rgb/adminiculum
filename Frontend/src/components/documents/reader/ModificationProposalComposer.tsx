"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Modal } from "@/components/ui/Modal";
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
}

/**
 * Modification-proposal composer: shows the exact ORIGINAL text, requires the
 * proposed replacement, and accepts an optional rationale. An unchanged or empty
 * proposal is refused client-side; the backend remains the authority.
 */
export function ModificationProposalComposer({
  open,
  selectedText,
  busy,
  error,
  targetKey,
  onCancel,
  onSubmit,
}: ModificationProposalComposerProps) {
  const [proposedText, setProposedText] = useState("");
  const [rationale, setRationale] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Never retain a previous operation's text across close/reopen or target change.
  useEffect(() => {
    setProposedText("");
    setRationale("");
  }, [open, targetKey]);

  const normalizedOriginal = selectedText.replace(/\s+/g, " ").trim();
  const normalizedProposed = proposedText.replace(/\s+/g, " ").trim();
  const isUnchanged = normalizedProposed.length === 0 || normalizedProposed === normalizedOriginal;

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onCancel}
      title={readerCopy.proposalComposerTitle}
      maxWidth="xl"
      initialFocusRef={textareaRef as unknown as RefObject<HTMLElement | null>}
      footer={
        <>
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
            {busy ? '…' : readerCopy.proposalSubmit}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-secondary)]">
            {readerCopy.proposalOriginalLabel}
          </p>
          <blockquote
            data-testid="proposal-original"
            className="max-h-32 overflow-y-auto rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] px-3 py-2 text-sm text-[var(--adm-text-primary)]"
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
            rows={4}
            className="w-full rounded-[8px] border border-[var(--adm-border-canonical)] px-3 py-2 text-sm font-normal outline-none focus:border-[var(--adm-brand-green)]"
          />
        </label>
        <label className="block text-sm font-semibold text-[var(--adm-text-primary)]">
          {readerCopy.proposalRationaleLabel}
          <textarea
            data-testid="proposal-rationale"
            aria-label={readerCopy.proposalRationaleLabel}
            value={rationale}
            onChange={(event) => setRationale(event.target.value)}
            rows={2}
            placeholder={readerCopy.proposalRationalePlaceholder}
            className="mt-1 w-full rounded-[8px] border border-[var(--adm-border-canonical)] px-3 py-2 text-sm font-normal outline-none focus:border-[var(--adm-brand-green)]"
          />
        </label>
        {error ? (
          <p data-testid="proposal-error" role="alert" className="text-sm text-[var(--adm-brand-terracotta)]">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
