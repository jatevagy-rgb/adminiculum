"use client";

import Link from "next/link";
import { AdminStatusPill } from "@/components/adminiculum/ui";
import { getCaseDisplayTitle, getCaseStatusLabel } from "@/lib/caseLabels";

export type CaseWorkspaceNavTab = "overview" | "context" | "documents" | "tasks" | "communications" | "deadlines" | "time" | "clientPortal";

type CaseWorkspaceNavProps = {
  caseId: string;
  caseNumber?: string | null;
  title?: string | null;
  clientName?: string | null;
  activeTab: CaseWorkspaceNavTab;
  status?: string | null;
  responsibleName?: string | null;
  deadline?: string | null;
};

const itemClass = (active: boolean) =>
  `border-b-2 px-1 py-2 text-[11px] font-semibold transition-colors ${
    active
      ? "border-[var(--adm-ochre-500)] text-[var(--adm-green-800)]"
      : "border-transparent text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]"
  }`;

const formatDeadline = (deadline?: string | null) => {
  if (!deadline) return null;
  const parsed = new Date(deadline);
  return Number.isNaN(parsed.getTime()) ? deadline : parsed.toLocaleDateString("hu-HU");
};

export function CaseWorkspaceNav({
  caseId,
  caseNumber,
  title,
  clientName,
  activeTab,
  status,
  responsibleName,
  deadline,
}: CaseWorkspaceNavProps) {
  // Primary case tabs are intentionally reduced to the three destinations that
  // describe the case: Áttekintés, Kontextus and Ügyfélportál. Communication is a
  // different concept from case context, so it is no longer a co-equal top tab:
  // its route stays reachable through the restrained secondary navigation below.
  // Documents / Feladatok / Határidők / Munkaórák are not co-equal primary tabs
  // either — the Áttekintés workspace exposes them in-page. The underlying routes
  // stay reachable by direct URL, so an incoming activeTab that is no longer a
  // primary tab simply renders with no highlighted primary tab rather than breaking.
  const tabs = [
    { id: "overview" as const, label: "Áttekintés", href: `/cases/${caseId}` },
    // Kontextus is a navigation seam only in this PR. It points at the existing
    // case-context panel on the Áttekintés surface; the full Kontextus workspace
    // (email-thread view, free-text paste, custom anonymization, ingestion) is a
    // later, separate deliverable. No placeholder surface is fabricated here.
    { id: "context" as const, label: "Kontextus", href: `/cases/${caseId}#ck-starting-context` },
    { id: "clientPortal" as const, label: "Ügyfélportál", href: `/cases/${caseId}/client-portal` },
  ];
  const secondaryLinks = [
    { id: "communications" as const, label: "Kommunikáció", href: `/cases/${caseId}/communications` },
  ];
  const visibleDeadline = formatDeadline(deadline);

  return (
    <section className="border-b border-[var(--adm-border)] bg-[rgba(251,249,244,0.96)] px-4 pt-3 lg:px-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-serif text-[24px] font-medium leading-tight text-[var(--adm-text)]">
              {getCaseDisplayTitle({ title, clientName })}
            </h1>
            {status ? <AdminStatusPill tone={String(status).toUpperCase() === "OPEN" ? "green" : "neutral"}>{getCaseStatusLabel(status)}</AdminStatusPill> : null}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--adm-text-muted)]">
            {caseNumber ? <span className="font-semibold text-[var(--adm-text)]">{caseNumber}</span> : null}
            {clientName ? <span>{clientName}</span> : null}
            {responsibleName ? <span>Felelős: {responsibleName}</span> : null}
            {visibleDeadline ? <span>Következő határidő: {visibleDeadline}</span> : null}
          </div>
        </div>
      </div>

      <nav className="mt-2 flex flex-wrap gap-x-5" aria-label="Ügy munkaterület">
        {tabs.map((tab) => (
          <Link key={tab.id} href={tab.href} className={itemClass(activeTab === tab.id)} aria-current={activeTab === tab.id ? "page" : undefined}>
            {tab.label}
          </Link>
        ))}
      </nav>

      {/* Restrained secondary destinations. These are routes, not actions, and
          must not compete with the primary tabs above. */}
      <nav data-testid="case-workspace-secondary-nav" aria-label="Ügy további nézetei" className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-[11px]">
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">További nézetek</span>
        {secondaryLinks.map((link) => (
          <Link key={link.id} href={link.href} className="font-semibold text-[var(--adm-text-muted)] hover:text-[var(--adm-text)] hover:underline">
            {link.label}
          </Link>
        ))}
      </nav>
    </section>
  );
}
