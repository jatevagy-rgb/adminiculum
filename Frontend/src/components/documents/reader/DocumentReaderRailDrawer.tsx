"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { readerCopy } from "./readerCopy";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

function focusableWithin(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export interface DocumentReaderRailDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Opener element; focus returns here when the drawer closes. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/**
 * Bounded accessible side drawer for the narrow-viewport review rail.
 *
 * Implements only the required drawer mechanics (no visual redesign): focus
 * enters the drawer, Tab/Shift+Tab stay contained, Escape closes, and closing
 * restores focus to the opener.
 */
export function DocumentReaderRailDrawer({
  open,
  onClose,
  returnFocusRef,
  children,
}: DocumentReaderRailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const returnFocusRefRef = useRef(returnFocusRef);

  useEffect(() => {
    onCloseRef.current = onClose;
    returnFocusRefRef.current = returnFocusRef;
  });

  useEffect(() => {
    if (!open) return;
    const drawer = drawerRef.current;

    const raf = requestAnimationFrame(() => {
      const focusable = focusableWithin(drawer);
      (focusable[0] ?? drawer)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const focusable = focusableWithin(drawer);
      if (focusable.length === 0) {
        event.preventDefault();
        drawer.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (active === first || !drawer.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !drawer.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      const opener = returnFocusRefRef.current?.current;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex lg:hidden" role="presentation">
      <div className="flex-1 bg-black/40" aria-hidden="true" onClick={() => onCloseRef.current()} />
      <div
        ref={drawerRef}
        data-testid="document-reader-rail-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={readerCopy.railTitle}
        tabIndex={-1}
        className="flex h-full w-[min(92vw,380px)] flex-col bg-[var(--adm-canvas-white)] shadow-2xl outline-none"
      >
        <div className="flex justify-end px-3 pt-2">
          <button
            type="button"
            data-testid="document-reader-rail-drawer-close"
            onClick={() => onCloseRef.current()}
            className="rounded-[6px] px-2 py-1 text-xs font-semibold text-[var(--adm-text-secondary)]"
          >
            {readerCopy.railCloseLabel}
          </button>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
