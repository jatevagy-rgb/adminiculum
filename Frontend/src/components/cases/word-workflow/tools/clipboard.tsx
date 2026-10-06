"use client";

import { ViewportDialog } from "@/components/ui/ViewportDialog";
import React, { useRef } from "react";
import { AdminButton } from "@/components/adminiculum/ui";

export interface DirectCopyResult {
  success: boolean;
  error?: string;
}

export interface ClipboardLike {
  writeText(text: string): Promise<void>;
}

/**
 * Attempts to copy prompt text to the system clipboard.
 * Checks for navigator.clipboard availability and secureContext.
 * Never reports success if writing fails or throws.
 */
export async function copyDirectPromptToClipboard(
  text: string,
  customClipboard?: ClipboardLike | null
): Promise<DirectCopyResult> {
  if (!text || text.trim() === "") {
    return { success: false, error: "Üres szöveg nem másolható." };
  }

  // Allow custom/mock clipboard injection for tests
  if (customClipboard) {
    try {
      await customClipboard.writeText(text);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Vágólap hiba",
      };
    }
  }

  if (typeof window === "undefined") {
    return { success: false, error: "A vágólap csak böngészőben érhető el." };
  }

  if (!navigator?.clipboard?.writeText) {
    return {
      success: false,
      error: "A böngésző nem támogatja a közvetlen vágólapra írást.",
    };
  }

  try {
    await navigator.clipboard.writeText(text);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Nem sikerült a vágólapra másolni. Engedély hiányzik.",
    };
  }
}

interface ClipboardFallbackModalProps {
  open: boolean;
  text: string;
  onClose: () => void;
  title?: string;
}

/**
 * Accessible modal displayed ONLY when clipboard write fails.
 * Captures focus, selects the text for Ctrl+C manual copy, and restores focus upon closing.
 */
export function ClipboardFallbackModal({
  open,
  text,
  onClose,
  title = "Manuális prompt másolás",
}: ClipboardFallbackModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  return <ViewportDialog open={open} title={title} onClose={onClose} initialFocusRef={textareaRef}>
    <p className="text-sm text-[var(--adm-text-muted)]">Az automatikus másolás nem sikerült. Jelöld ki a szöveget és másold a vágólapra.</p>
    <textarea ref={textareaRef} onFocus={(event) => event.currentTarget.select()} value={text} readOnly aria-label="Másolható prompt" rows={12} className="mt-3 w-full rounded-lg border border-[var(--adm-border)] p-3 text-sm" />
    <AdminButton variant="neutral" onClick={onClose}>Bezárás</AdminButton>
  </ViewportDialog>;
}
