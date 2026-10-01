import type { ReactNode } from "react";

/**
 * V3 content frame: the bounded operational workspace width for the
 * ORGANIZATION portal (~1120–1280px). The bottom padding keeps content clear
 * of the mobile bottom navigation.
 */
export function PortalPage({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pb-10 sm:pt-8">
      {children}
    </div>
  );
}
