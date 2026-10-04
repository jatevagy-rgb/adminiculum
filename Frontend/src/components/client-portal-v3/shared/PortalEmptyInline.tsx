import type { ReactNode } from "react";

/**
 * Low-profile honest empty state for V3 portal surfaces. Deliberately small: an
 * empty state must never compete visually with real customer work.
 */
export function PortalEmptyInline({ children }: { children: ReactNode }) {
  return (
    <p
      className="rounded-[8px] border border-dashed border-[var(--adm-border-canonical)] px-3 py-2 text-sm text-[var(--adm-text-secondary)]"
      data-testid="portal-empty-inline"
    >
      {children}
    </p>
  );
}
