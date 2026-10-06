"use client";
import React from "react";
import type { ReactNode, RefObject } from "react";
import { ViewportDialog } from "@/components/ui/ViewportDialog";
import { readerCopy } from "./readerCopy";
export interface DocumentReaderRailDrawerProps {
  open: boolean; onClose: () => void; returnFocusRef?: RefObject<HTMLElement | null>; children: ReactNode;
}
export function DocumentReaderRailDrawer({ open, onClose, returnFocusRef, children }: DocumentReaderRailDrawerProps) {
  return <ViewportDialog open={open} title={readerCopy.railTitle} onClose={onClose} returnFocusRef={returnFocusRef} drawer maxWidth="max-w-md" testId="document-reader-rail-drawer" closeTestId="document-reader-rail-drawer-close">{children}</ViewportDialog>;
}
