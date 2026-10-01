"use client";

import { useEffect, useRef, type ReactNode } from "react";
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
  returnFocusRef?: { current: HTMLElement | null };
  fallbackFocusTarget?: HTMLElement | null | string | (() => HTMLElement | null);
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function WorkflowDialog({
  open,
  title,
  description,
  children,
  primaryLabel,
  primaryDisabled = false,
  busy = false,
  destructive = false,
  onConfirm,
  onClose,
  returnFocusRef,
  fallbackFocusTarget,
}: WorkflowDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const priorFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);
  const returnFocusRefRef = useRef(returnFocusRef);
  const fallbackFocusTargetRef = useRef(fallbackFocusTarget);

  useEffect(() => {
    busyRef.current = busy;
    onCloseRef.current = onClose;
    returnFocusRefRef.current = returnFocusRef;
    fallbackFocusTargetRef.current = fallbackFocusTarget;
  });

  useEffect(() => {
    if (!open) return;

    const activeEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const externalTrigger =
      returnFocusRefRef.current?.current ??
      (activeEl && !panelRef.current?.contains(activeEl) ? activeEl : null);

    priorFocusRef.current = externalTrigger;

    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    const requestedInitialFocus = panel?.querySelector<HTMLElement>("[autofocus]");
    (requestedInitialFocus || focusable?.[0])?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      const opener = returnFocusRefRef.current?.current ?? priorFocusRef.current;
      if (opener && document.contains(opener) && !opener.hasAttribute("disabled")) {
        opener.focus();
        return;
      }

      const fallback = fallbackFocusTargetRef.current;
      if (fallback) {
        let fallbackEl: HTMLElement | null = null;
        if (typeof fallback === "string") {
          fallbackEl = document.querySelector<HTMLElement>(fallback);
        } else if (typeof fallback === "function") {
          fallbackEl = fallback();
        } else {
          fallbackEl = fallback;
        }

        if (fallbackEl && document.contains(fallbackEl)) {
          if (!fallbackEl.hasAttribute("tabindex") && fallbackEl.tagName.startsWith("H")) {
            fallbackEl.setAttribute("tabindex", "-1");
          }
          fallbackEl.focus();
        }
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="presentation">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-dialog-title"
        aria-describedby={description ? "workflow-dialog-description" : undefined}
        className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--adm-border)] px-5 py-4">
          <div>
            <h2 id="workflow-dialog-title" className="font-serif text-[22px] text-[var(--adm-text)]">{title}</h2>
            {description ? <p id="workflow-dialog-description" className="mt-1 text-[12px] leading-5 text-[var(--adm-text-muted)]">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-[6px] text-xl text-[var(--adm-text-muted)] hover:text-[var(--adm-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
            aria-label="Párbeszédablak bezárása"
          >
            ×
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-[var(--adm-border)] px-5 py-4">
          <AdminButton className="min-h-[40px] w-full sm:w-auto" variant="neutral" onClick={onClose} disabled={busy}>Mégse</AdminButton>
          <AdminButton className="min-h-[40px] w-full sm:w-auto" variant={destructive ? "danger" : "primary"} onClick={onConfirm} disabled={primaryDisabled || busy}>
            {busy ? "Folyamatban…" : primaryLabel}
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
