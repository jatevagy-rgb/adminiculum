"use client";
import React from "react";
import type { ReactNode, RefObject } from "react";
import { ViewportDialog } from "@/components/ui/ViewportDialog";
import { AdminButton } from "@/components/adminiculum/ui";
type WorkflowDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  primaryLabel: string;
  primaryDisabled?: boolean;
  busy?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

export function WorkflowDialog({ open, title, description, children, primaryLabel, primaryDisabled = false, busy = false, destructive = false, onConfirm, onClose, returnFocusRef }: WorkflowDialogProps) {
  return <ViewportDialog open={open} title={title} description={description} onClose={onClose} busy={busy} returnFocusRef={returnFocusRef} maxWidth="max-w-xl" footer={<>
    <AdminButton variant="neutral" onClick={onClose} disabled={busy}>Mégse</AdminButton>
    <AdminButton variant={destructive ? "danger" : "primary"} onClick={onConfirm} disabled={primaryDisabled || busy}>{busy ? "Folyamatban…" : primaryLabel}</AdminButton>
  </>}>{children}</ViewportDialog>;
}
