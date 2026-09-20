"use client";

import Link from "next/link";

type DocumentWorkspaceTabsProps = {
  caseId: string;
  active?: "overview" | "changes" | "comments" | "approval";
};

const tabs = [
  ["overview", "Áttekintés", "document-overview"],
  ["changes", "Változások", "document-changes"],
  ["comments", "Megjegyzések", "document-comments"],
  ["approval", "Jóváhagyás", "document-approval"],
] as const;

export function DocumentWorkspaceTabs({ caseId, active = "overview" }: DocumentWorkspaceTabsProps) {
  return (
    <nav aria-label="Dokumentum munkatér" className="flex min-w-0 flex-wrap gap-1 border-b border-[var(--adm-border)] pb-1">
      {tabs.map(([key, label, anchor]) => (
        <Link
          key={key}
          href={`/cases/${encodeURIComponent(caseId)}/documents#${anchor}`}
          aria-current={active === key ? "page" : undefined}
          className={`rounded-t px-3 py-2 text-xs font-semibold ${
            active === key
              ? "border-b-2 border-[var(--adm-ochre-500)] text-[var(--adm-text)]"
              : "text-[var(--adm-text-muted)] hover:bg-[var(--adm-surface)] hover:text-[var(--adm-text)]"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
