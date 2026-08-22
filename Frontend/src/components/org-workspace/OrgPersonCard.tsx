"use client";

import {
  portalStatusLabel,
  orgEmploymentStatusLabel,
  type OrgMapPersonDTO,
} from "@/lib/orgMapApi";
import { responsibilityTypeLabel } from "@/lib/clientOrganizationApi";

const chipCls =
  "inline-flex items-center rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] px-1.5 py-0.5 text-[10px] text-[var(--adm-text-muted)]";

function PortalBadge({ person }: { person: OrgMapPersonDTO }) {
  const status = person.portalStatus;
  const palette =
    status === "ACTIVE"
      ? "border-[var(--adm-green-800)]/30 bg-[var(--adm-green-100)] text-[var(--adm-green-800)]"
      : status === "SUSPENDED"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-[var(--adm-border)] bg-[var(--adm-ivory-100)] text-[var(--adm-text-muted)]";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${palette}`}>{portalStatusLabel(status)}</span>;
}

/**
 * Compact org-chart person card. Keeps the graph readable: name, job title, one
 * group/department chip, a single responsibility hint, and a portal-status
 * indicator. Deliberately does NOT show cases, document titles, comments,
 * permission matrix, or compliance findings.
 */
export function OrgPersonCard({ person, selected, onSelect }: { person: OrgMapPersonDTO; selected: boolean; onSelect: (id: string) => void }) {
  const firstResponsibility = person.responsibilities[0];

  return (
    <button
      type="button"
      onClick={() => onSelect(person.id)}
      data-testid={`org-person-card-${person.id}`}
      className={`w-full rounded-lg border bg-[var(--adm-surface)] px-2.5 py-2 text-left shadow-sm transition-colors ${
        selected
          ? "border-[var(--adm-green-800)] ring-1 ring-[var(--adm-green-800)]"
          : "border-[var(--adm-border)] hover:border-[var(--adm-green-700)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[var(--adm-text)]">{person.name}</p>
          {person.jobTitle ? <p className="truncate text-[11px] text-[var(--adm-text-muted)]">{person.jobTitle}</p> : null}
        </div>
        <PortalBadge person={person} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {person.organizationGroupName ? <span className={chipCls}>{person.organizationGroupName}</span> : null}
        <span className={chipCls}>{orgEmploymentStatusLabel(person.employmentStatus)}</span>
        {firstResponsibility ? (
          <span className={`${chipCls} max-w-[9rem] truncate`} title={firstResponsibility.label}>
            {responsibilityTypeLabel(firstResponsibility.type)}
          </span>
        ) : null}
      </div>
    </button>
  );
}