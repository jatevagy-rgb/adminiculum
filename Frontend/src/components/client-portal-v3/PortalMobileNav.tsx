"use client";

import Link from "next/link";
import { useState } from "react";
import { Modal } from "@/components/ui";
import {
  ORG_COMMUNICATION_HREF,
  ORG_MOBILE_MORE_NAV,
  ORG_MOBILE_PRIMARY_NAV,
  ORG_NAV_VIEW_BY_PATH,
} from "./navigation";

const primaryLinkClass =
  "flex min-h-[52px] flex-col items-center justify-center gap-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--adm-brand-green)]";

const moreLinkClass =
  "flex min-h-11 items-center justify-between rounded-[8px] px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]";

function HomeNavIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="9 22 9 12 15 12 15 22" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MattersNavIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <rect width="20" height="14" x="2" y="7" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TasksNavIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path d="m9 11 3 3L22 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MoreNavIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getPrimaryNavIcon(href: string) {
  if (href === "/portal") return <HomeNavIcon />;
  if (href === "/portal/ugyek") return <MattersNavIcon />;
  return <TasksNavIcon />;
}

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
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]/95 backdrop-blur-sm shadow-[0_-2px_10px_rgba(0,0,0,0.04)] lg:hidden"
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
                  active ? "font-semibold text-[var(--adm-brand-deep)]" : "text-[var(--adm-text-secondary)] hover:text-[var(--adm-text-primary)]"
                }`}
              >
                {getPrimaryNavIcon(item.href)}
                <span>{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            data-testid="org-portal-more-trigger"
            onClick={() => setMoreOpen(true)}
            className={`${primaryLinkClass} text-[var(--adm-text-secondary)] hover:text-[var(--adm-text-primary)]`}
          >
            <MoreNavIcon />
            <span>Több</span>
          </button>
        </div>
      </nav>
      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Továbbiak" maxWidth="sm">
        <nav aria-label="További ügyfélportál területek" className="grid gap-1 py-1">
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
                <span>{item.label}</span>
                <ArrowRightIcon />
              </Link>
            );
          })}
        </nav>
      </Modal>
    </>
  );
}
