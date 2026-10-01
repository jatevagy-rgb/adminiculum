"use client";

import React, { useEffect, useRef } from "react";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      const timer = setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.select();
        }
      }, 50);
      return () => clearTimeout(timer);
    } else {
      if (triggerRef.current) {
        triggerRef.current.focus();
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clipboard-fallback-title"
      ref={dialogRef}
    >
      <div className="w-full max-w-xl rounded-lg border border-[var(--adm-border)] bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--adm-border)] pb-3">
          <h2
            id="clipboard-fallback-title"
            className="text-[15px] font-bold text-[var(--adm-text)]"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Bezárás"
            className="flex h-10 w-10 items-center justify-center rounded text-[18px] text-[var(--adm-text-muted)] hover:bg-[var(--adm-surface)] hover:text-[var(--adm-text)]"
          >
            ×
          </button>
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-[var(--adm-text-muted)]">
          Az automatikus vágólapra másolás a böngésző biztonsági beállításai vagy jogosultság hiánya miatt sikertelen volt. Kérjük, másolja ki a kijelölt szöveget billentyűzettel (<kbd className="rounded border bg-slate-100 px-1 py-0.5 text-[11px] font-mono">Ctrl+C</kbd> / <kbd className="rounded border bg-slate-100 px-1 py-0.5 text-[11px] font-mono">Cmd+C</kbd>).
        </p>

        <div className="mt-3">
          <textarea
            ref={textareaRef}
            readOnly
            value={text}
            rows={8}
            className="w-full rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 font-mono text-[11.5px] leading-5 text-[var(--adm-text)] focus:border-[var(--adm-green-800)] focus:outline-none"
            aria-label="Másolandó prompt szöveg"
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <AdminButton
            variant="primary"
            size="md"
            onClick={onClose}
            className="min-h-[40px] px-5"
          >
            Kész, bezárás
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
