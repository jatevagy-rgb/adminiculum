"use client";

import React from "react";
import { useRef, type ReactNode } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

export interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  busy?: boolean;
  busyLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Mégse",
  variant = "default",
  busy = false,
  busyLabel,
  onConfirm,
  onCancel,
  children,
}: ConfirmationDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      maxWidth="sm"
      initialFocusRef={cancelRef}
      footer={
        <>
          <Button ref={cancelRef} variant="neutral" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={busy}
            data-variant={variant === "danger" ? "danger" : undefined}
          >
            {busy ? busyLabel ?? confirmLabel : confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
