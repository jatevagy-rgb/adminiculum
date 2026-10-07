"use client";
import React from "react";

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useDialogAccessibility } from './useDialogAccessibility';

/** Body portal + the accepted focus lifecycle; bounded even inside transformed workspaces. */
export function ViewportDialog({ open = true, title, onClose, busy = false, children, footer, drawer = false, initialFocusRef, returnFocusRef, testId, closeTestId, description, closeOnOverlayClick = true, maxWidth = 'max-w-2xl' }: {
  open?: boolean; title: string; onClose: () => void; busy?: boolean; children: ReactNode;
  footer?: ReactNode; drawer?: boolean; initialFocusRef?: RefObject<HTMLElement | null>; returnFocusRef?: RefObject<HTMLElement | null>; testId?: string; closeTestId?: string; description?: string; closeOnOverlayClick?: boolean; maxWidth?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const returnFocus = useRef(returnFocusRef);
  returnFocus.current = returnFocusRef;
  useEffect(() => { setMounted(true); }, []);
  useDialogAccessibility({ open: open && mounted, dialogRef, onClose: () => { if (!busy) onClose(); }, initialFocusRef, restoreFocus: false });
  useEffect(() => {
    if (!open || !mounted || !overlayRef.current) return;
    const previousOverflow = document.body.style.overflow;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblings = Array.from(document.body.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== overlayRef.current);
    const previous = siblings.map((node) => ({ node, inert: node.inert }));
    previous.forEach(({ node }) => { node.inert = true; });
    document.body.style.overflow = 'hidden';
    return () => { previous.forEach(({ node, inert }) => { node.inert = inert; }); document.body.style.overflow = previousOverflow; const target = returnFocus.current?.current || opener; if (target && document.contains(target)) target.focus(); };
  }, [open, mounted]);
  if (!open || !mounted) return null;
  return createPortal(<div ref={overlayRef} className={`fixed inset-0 z-[150] flex bg-black/40 p-2 sm:p-4 ${drawer ? 'justify-end' : 'items-center justify-center'}`} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy && closeOnOverlayClick) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={-1} data-testid={testId} className={`flex max-h-[calc(100dvh-2rem)] min-h-0 w-full flex-col overflow-hidden rounded-xl border border-[var(--adm-border)] bg-white shadow-2xl outline-none ${maxWidth}`}>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--adm-border)] px-4 py-3">
        <div className="min-w-0"><h2 id={titleId} className="min-w-0 break-words font-sans text-lg font-semibold text-[var(--adm-text)]">{title}</h2>{description ? <p id={descriptionId} className="mt-1 text-sm text-[var(--adm-text-muted)]">{description}</p> : null}</div>
        <button type="button" aria-label="Bezárás" data-testid={closeTestId} disabled={busy} onClick={onClose} className="min-h-10 min-w-10 shrink-0 rounded-lg text-xl focus-visible:outline focus-visible:outline-2">×</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [overflow-wrap:anywhere]">{children}</div>
      {footer ? <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[var(--adm-border)] p-3">{footer}</div> : null}
    </div>
  </div>, document.body);
}
