"use client";

import React, { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { IconButton } from "./Button";

export interface ModalProps {
  open: boolean;
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

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

const DESTRUCTIVE_HINT = /delete|remove|destroy|törlés|töröl/i;

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.tabIndex < 0) return false;
    let node: HTMLElement | null = el;
    while (node) {
      if (node.hidden || node.getAttribute("aria-hidden") === "true") return false;
      if (node.style.display === "none") return false;
      node = node.parentElement;
    }
    return true;
  });
}

function isProbablyDestructive(el: HTMLElement): boolean {
  const label = `${el.textContent ?? ""} ${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("data-variant") ?? ""}`;
  return DESTRUCTIVE_HINT.test(label);
}

export function Modal({
  open,
  onClose,
  title,
  description,
  maxWidth = "xl",
  children,
  footer,
  closeOnOverlayClick = false,
  initialFocusRef,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const initialFocusRefRef = useRef(initialFocusRef);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
    initialFocusRefRef.current = initialFocusRef;
  });

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const dialog = dialogRef.current;

    const raf = requestAnimationFrame(() => {
      if (!dialog) return;
      const preferred = initialFocusRefRef.current?.current;
      if (preferred && dialog.contains(preferred) && !isProbablyDestructive(preferred)) {
        preferred.focus();
        return;
      }
      const firstSafe = getFocusableElements(dialog).find((el) => !isProbablyDestructive(el));
      (firstSafe ?? dialog).focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || active === dialog || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !dialog.contains(active)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      const previous = previousFocusRef.current;
      if (previous && document.contains(previous)) {
        previous.focus();
      }
      previousFocusRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
      <div
        className="fixed inset-0"
        aria-hidden="true"
        onClick={closeOnOverlayClick ? onClose : undefined}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`relative z-10 w-full rounded-[12px] border border-[#E5E7E6] bg-white shadow-xl max-h-[90vh] flex flex-col outline-none ${maxWidthClasses[maxWidth]}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#E5E7E6] px-6 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="font-serif text-xl font-semibold text-[#1F2937] leading-tight">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-xs text-[#6B7280]">
                {description}
              </p>
            )}
          </div>
          <IconButton
            size="sm"
            variant="ghost"
            aria-label="Bezárás"
            onClick={onClose}
            className="text-[#6B7280] hover:text-[#1F2937]"
          >
            <svg
              className="h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#E5E7E6] bg-[#F8FAF9] px-6 py-4 rounded-b-[12px]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
