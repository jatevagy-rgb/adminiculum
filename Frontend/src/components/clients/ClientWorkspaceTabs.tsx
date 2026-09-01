"use client";

import Link from "next/link";

type ClientWorkspaceTabsProps = {
  clientId: string;
  active?: "overview" | "cases" | "organization" | "company-operations" | "portal" | "advanced";
  organizationMode?: boolean;
};

const tabs = [
  ["overview", "Áttekintés", ""],
  ["cases", "Ügyek", "/cases"],
  ["organization", "Szervezet", "/szervezet"],
  ["company-operations", "Vállalati működés", "/vallalati-mukodes"],
  ["portal", "Portál", "/portal"],
] as const;

export function ClientWorkspaceTabs({ clientId, active = "overview", organizationMode = true }: ClientWorkspaceTabsProps) {
  const visibleTabs = organizationMode ? tabs : tabs.filter(([key]) => key !== "organization" && key !== "company-operations");
  return (
    <nav aria-label="Ügyfél munkaterület" className="border-b border-[var(--adm-border)]">
      <div className="flex min-w-0 flex-wrap items-center gap-1" role="tablist">
        {visibleTabs.map(([key, label, suffix]) => (
          <Link
            key={key}
            href={`/clients/${encodeURIComponent(clientId)}${suffix}`}
            aria-current={active === key ? "page" : undefined}
                className={`rounded-t px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--adm-ochre-500)] ${
              active === key
                ? "border-b-2 border-[var(--adm-ochre-500)] text-[var(--adm-text)]"
                : "text-[var(--adm-text-muted)] hover:bg-[var(--adm-surface)] hover:text-[var(--adm-text)]"
            }`}
          >
            {label}
          </Link>
        ))}
        {organizationMode && <details className="relative ml-auto">
              <summary className="cursor-pointer list-none rounded px-3 py-2 text-xs font-semibold text-[var(--adm-text-muted)] hover:bg-[var(--adm-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--adm-ochre-500)]">
            ••• Haladó
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-52 rounded border border-[var(--adm-border)] bg-white p-2 shadow-lg">
               
               <Link className="block rounded px-3 py-2 text-xs hover:bg-[var(--adm-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--adm-ochre-500)]" href={`/clients/${encodeURIComponent(clientId)}/workgroups`}>Munkacsoportok</Link>
               <Link className="block rounded px-3 py-2 text-xs hover:bg-[var(--adm-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--adm-ochre-500)]" href={`/clients/${encodeURIComponent(clientId)}#house-style`}>Dokumentumstílus</Link>
          </div>
        </details>}
      </div>
    </nav>
  );
}
