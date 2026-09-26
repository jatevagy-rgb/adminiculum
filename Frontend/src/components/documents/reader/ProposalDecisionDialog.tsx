"use client";

import { useRef, useState, type RefObject } from "react";
import { Modal } from "@/components/ui/Modal";
import { readerCopy } from "./readerCopy";

export interface ProposalDecisionDialogProps {
  open: boolean;
  busy: boolean;
  error: string | null;
  originalText: string;
  proposedText: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/** Rejection dialog: a reason is required here and enforced again by the backend. */
export function ProposalDecisionDialog({
  open,
  busy,
  error,
  originalText,
  proposedText,
  onCancel,
  onConfirm,
}: ProposalDecisionDialogProps) {
  const [reason, setReason] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const trimmed = reason.trim();

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onCancel}
      title={readerCopy.decisionReject}
      maxWidth="lg"
      initialFocusRef={textareaRef as unknown as RefObject<HTMLElement | null>}
      footer={
        <>
          <button
            type="button"
            data-testid="proposal-reject-cancel"
            onClick={onCancel}
            disabled={busy}
            className="rounded-[8px] border border-[var(--adm-border-canonical)] px-3 py-1.5 text-sm font-semibold text-[var(--adm-text-secondary)] disabled:opacity-50"
          >
            {readerCopy.cancel}
          </button>
          <button
            type="button"
            data-testid="proposal-reject-confirm"
            onClick={() => onConfirm(reason)}
            disabled={busy || !trimmed}
            className="rounded-[8px] bg-[var(--adm-brand-terracotta)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? '…' : readerCopy.decisionReject}
          </button>
        </>
      }
    >
      <div data-testid="proposal-reject-context" className="mb-3 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] px-3 py-2 text-sm">
        <p className="text-[var(--adm-text-secondary)]">{originalText}</p>
        <p className="mt-1 font-medium text-[var(--adm-text-primary)]">→ {proposedText}</p>
      </div>
      <label className="block text-sm font-semibold text-[var(--adm-text-primary)]">
        {readerCopy.rejectReasonLabel}
        <textarea
          ref={textareaRef}
          data-testid="proposal-reject-reason"
          aria-label={readerCopy.rejectReasonLabel}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          className="mt-1 w-full rounded-[8px] border border-[var(--adm-border-canonical)] px-3 py-2 text-sm font-normal outline-none focus:border-[var(--adm-brand-green)]"
        />
      </label>
      {error ? (
        <p data-testid="proposal-reject-error" role="alert" className="mt-2 text-sm text-[var(--adm-brand-terracotta)]">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
