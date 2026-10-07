"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Canonical Adminiculum dialog accessibility semantics.
 *
 * Extracted verbatim from the proven `Modal` primitive so that bespoke dialogs
 * which must keep their own portal/layout (e.g. AnonymizeModal and
 * CaseTimeEntryDialog) reuse ONE shared implementation instead of a second
 * bespoke focus framework.
 *
 * Provides:
 * - remember the previously focused element and restore it after close
 * - move initial focus into the dialog (initialFocusRef or first safe control)
 * - keep Tab / Shift+Tab inside the dialog (focus trap)
 * - Escape invokes the existing close/cancel handler only
 */
export const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

const DESTRUCTIVE_HINT = /delete|remove|destroy|törlés|töröl/i;

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
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

export interface UseDialogAccessibilityOptions {
  /** True while the dialog is actually rendered and interactive. */
  open: boolean;
  /** Existing close/cancel handler; Escape must invoke exactly this. */
  onClose: () => void;
  /** Ref attached to the element carrying role="dialog". */
  dialogRef: RefObject<HTMLElement | null>;
  /** Optional preferred initial focus target (ignored when destructive). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Restore focus to the opener on close. Defaults to true. */
  restoreFocus?: boolean;
}

export function useDialogAccessibility({
  open,
  onClose,
  dialogRef,
  initialFocusRef,
  restoreFocus = true,
}: UseDialogAccessibilityOptions): void {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const initialFocusRefRef = useRef(initialFocusRef);

  useEffect(() => {
    onCloseRef.current = onClose;
    initialFocusRefRef.current = initialFocusRef;
  });

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusDialog = () => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const preferred = initialFocusRefRef.current?.current;
      if (preferred && dialog.contains(preferred) && !isProbablyDestructive(preferred)) {
        preferred.focus();
        return;
      }
      const firstSafe = getFocusableElements(dialog).find((el) => !isProbablyDestructive(el));
      (firstSafe ?? dialog).focus();
    };

    const raf = requestAnimationFrame(focusDialog);

    const onKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      // Nested portals share this lifecycle; only the top interactive dialog
      // handles Escape and Tab, so closing a child never closes its parent.
      const activeDialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).filter((node) => !node.closest('[inert]'));
      if (activeDialogs.length && activeDialogs[activeDialogs.length - 1] !== dialog) return;
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
      } else if (active === last || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      const previous = previousFocusRef.current;
      if (restoreFocus && previous && document.contains(previous)) {
        previous.focus();
      }
      previousFocusRef.current = null;
    };
  }, [open, dialogRef, restoreFocus]);
}
