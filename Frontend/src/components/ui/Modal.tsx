"use client";
import React from "react";
import type { ReactNode, RefObject } from "react";
import { ViewportDialog } from "@/components/ui/ViewportDialog";
export interface ModalProps {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
  children: ReactNode;
  footer?: ReactNode;
  closeOnOverlayClick?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

const maxWidthClasses: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
};

export function Modal({ open, busy = false, onClose, title, description, maxWidth = "xl", children, footer, closeOnOverlayClick = false, initialFocusRef }: ModalProps) {
  return <ViewportDialog busy={busy} open={open} onClose={onClose} title={title} description={description} maxWidth={maxWidthClasses[maxWidth]} footer={footer} closeOnOverlayClick={closeOnOverlayClick} initialFocusRef={initialFocusRef}>{children}</ViewportDialog>;
}
