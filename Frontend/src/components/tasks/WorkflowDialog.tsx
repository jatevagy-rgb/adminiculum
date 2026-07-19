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
}: WorkflowDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const priorFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    busyRef.current = busy;
    onCloseRef.current = onClose;
  }, [busy, onClose]);

  useEffect(() => {
    if (!open) return;
    priorFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      priorFocusRef.current?.focus();
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
          <button type="button" onClick={onClose} disabled={busy} className="rounded px-2 text-xl text-[var(--adm-text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" aria-label="Párbeszédablak bezárása">×</button>
        </div>
        <div className="px-5 py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t border-[var(--adm-border)] px-5 py-4">
          <AdminButton variant="neutral" onClick={onClose} disabled={busy}>Mégse</AdminButton>
          <AdminButton variant={destructive ? "danger" : "primary"} onClick={onConfirm} disabled={primaryDisabled || busy}>
            {busy ? "Folyamatban…" : primaryLabel}
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
