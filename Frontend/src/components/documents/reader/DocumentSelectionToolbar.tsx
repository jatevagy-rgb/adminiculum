"use client";

import type { CSSProperties } from "react";
import { readerCopy } from "./readerCopy";

export interface DocumentSelectionToolbarProps {
  selectedText: string;
  onAddComment: () => void;
  onAddProposal: () => void;
  /** Viewport position derived from the live selection range. */
  style?: CSSProperties;
}

/**
 * The ONLY two primary selection actions for the reader. Every legacy annotation
 * taxonomy action (INTERNAL_NOTE / QUESTION / DECISION / TASK_NOTE /
 * MODIFICATION_REASON / CLIENT_EXPLANATION_DRAFT) is deliberately absent from
 * this primary interaction.
 */
export function DocumentSelectionToolbar({
  selectedText,
  onAddComment,
  onAddProposal,
  style,
}: DocumentSelectionToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Kijelölt szöveg műveletei"
      data-testid="reader-selection-toolbar"
      style={style}
      className="z-40 flex max-w-[92vw] flex-wrap items-center gap-1.5 rounded-[10px] border border-[var(--adm-border-canonical)] bg-white p-1.5 shadow-lg"
    >
      <button
        type="button"
        data-testid="reader-selection-comment"
        onClick={onAddComment}
        className="rounded-[8px] px-2.5 py-1 text-xs font-semibold text-[var(--adm-brand-green)] transition hover:bg-[var(--adm-canvas-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--adm-brand-green)]"
      >
        {readerCopy.selectionComment}
      </button>
      <button
        type="button"
        data-testid="reader-selection-proposal"
        onClick={onAddProposal}
        className="rounded-[8px] bg-[var(--adm-brand-green)] px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-[var(--adm-brand-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--adm-brand-green)]"
      >
        {readerCopy.selectionProposal}
      </button>
    </div>
  );
}
