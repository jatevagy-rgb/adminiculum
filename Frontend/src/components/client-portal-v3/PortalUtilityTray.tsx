import Link from "next/link";
import { ORG_COMMUNICATION_HREF, ORG_NAV_VIEW_BY_PATH } from "./navigation";

const utilityClass =
  "inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-transparent text-[var(--adm-text-secondary)] transition-colors hover:border-[var(--adm-border-canonical)] hover:text-[var(--adm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 motion-reduce:transition-none lg:w-auto lg:gap-2 lg:px-3";

function CalendarIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-8 8H4l2.2-2.9A8 8 0 1 1 21 12Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Header utilities for the ORGANIZATION portal: Naptár and Kommunikáció.
 * Kommunikáció is gated by the canonical communication mode — when the
 * workspace is EXTERNAL_ONLY the utility disappears entirely, mirroring the
 * legacy primary-navigation gate.
 */
export function PortalUtilityTray({ view, communicationEnabled }: { view: string; communicationEnabled: boolean }) {
  const calendarActive = ORG_NAV_VIEW_BY_PATH["/portal/naptar"] === view;
  const communicationActive = ORG_NAV_VIEW_BY_PATH[ORG_COMMUNICATION_HREF] === view;
  return (
    <div className="flex items-center gap-1" data-testid="org-portal-utility-tray">
      <Link href="/portal/naptar" aria-current={calendarActive ? "page" : undefined} className={utilityClass} title="Naptár">
        <CalendarIcon />
        <span className="hidden lg:inline">Naptár</span>
      </Link>
      {communicationEnabled ? (
        <Link
          href={ORG_COMMUNICATION_HREF}
          aria-current={communicationActive ? "page" : undefined}
          className={utilityClass}
          title="Kommunikáció"
          data-testid="org-portal-utility-communication"
        >
          <ChatIcon />
          <span className="hidden lg:inline">Kommunikáció</span>
        </Link>
      ) : null}
    </div>
  );
}
