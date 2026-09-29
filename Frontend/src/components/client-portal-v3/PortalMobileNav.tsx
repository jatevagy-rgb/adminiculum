"use client";

import Link from "next/link";
import { useState } from "react";
import { Modal } from "@/components/ui";
import { ORG_COMMUNICATION_HREF, ORG_MOBILE_MORE_NAV, ORG_MOBILE_PRIMARY_NAV, ORG_NAV_VIEW_BY_PATH } from "./navigation";

const primaryLinkClass =
  "flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--adm-brand-green)]";

const moreLinkClass =
  "flex min-h-11 items-center rounded-[8px] px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]";

/**
 * Mobile bottom navigation for the ORGANIZATION portal (390px acceptance
 * viewport). Exactly four slots: the three compact primary destinations plus
 * "Több", which opens a canonical focus-trapped sheet with the secondary
 * destinations. Kommunikáció appears in the sheet only when the canonical
 * communication mode allows it.
 */
export function PortalMobileNav({ view, communicationEnabled }: { view: string; communicationEnabled: boolean }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreItems = ORG_MOBILE_MORE_NAV.filter((item) => item.href !== ORG_COMMUNICATION_HREF || communicationEnabled);
  return (
    <>
      <nav
        aria-label="Ügyfélportál mobil navigáció"
        data-testid="org-portal-mobile-nav-v3"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] lg:hidden"
      >
        <div className="grid grid-cols-4">
          {ORG_MOBILE_PRIMARY_NAV.map((item) => {
            const active = ORG_NAV_VIEW_BY_PATH[item.href] === view;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`${primaryLinkClass} ${
                  active ? "font-semibold text-[var(--adm-brand-deep)]" : "text-[var(--adm-text-secondary)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            data-testid="org-portal-more-trigger"
            onClick={() => setMoreOpen(true)}
            className={`${primaryLinkClass} text-[var(--adm-text-secondary)]`}
          >
            Több
          </button>
        </div>
      </nav>
      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Továbbiak" maxWidth="sm">
        <nav aria-label="További ügyfélportál területek" className="grid gap-1">
          {moreItems.map((item) => {
            const active = ORG_NAV_VIEW_BY_PATH[item.href] === view;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setMoreOpen(false)}
                className={`${moreLinkClass} ${
                  active
                    ? "bg-[var(--adm-canvas-subtle)] font-semibold text-[var(--adm-brand-deep)]"
                    : "text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </Modal>
    </>
  );
}
