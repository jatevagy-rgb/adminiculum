"use client";

import {
  portalStatusLabel,
  orgEmploymentStatusLabel,
  type OrgMapPersonDTO,
} from "@/lib/orgMapApi";
import { responsibilityTypeLabel } from "@/lib/clientOrganizationApi";

const labelCls = "rounded bg-white border border-[var(--adm-border)] px-2 py-1 text-xs text-[var(--adm-text-muted)]";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 text-xs">
      <span className="text-[var(--adm-text-muted)]">{label}</span>
      <span className="text-[var(--adm-text)]">{value}</span>
    </div>
  );
}

function AccessSummaryBlock({ person }: { person: OrgMapPersonDTO }) {
  const summary = person.accessSummary;
  const lines: React.ReactNode[] = [];
  lines.push(<p key="cases">Ügyek: {summary.casesShared} megosztva</p>);
  lines.push(<p key="org">Cégösszegzés: {summary.companySummaryVisible ? "igen" : "nincs"}</p>);
  if (summary.unitSummaries > 0) lines.push(<p key="units">Egységösszegzés: {summary.unitSummaries}</p>);

  return (
    <div className="rounded border border-[var(--adm-border)] bg-[var(--adm-ivory-100)] p-3 text-xs text-[var(--adm-text)]">
      {lines}
      <p className="mt-2 text-[10px] text-[var(--adm-text-muted)]">
        A hozzáférés-összegzés kizárólag tényleges hozzáférési jogosultságokból (ügy-hozzáférések, összegző scope-ok) származik; a vezetői/helyettesi/group/kapcsolat nem eredményez hozzáférést.
      </p>
    </div>
  );
}

/**
 * Right drawer shown when a person is selected on the org map. Read-only.
 * Includes the org position, responsibilities, portal status with the
 * "portal link does not grant access" caption, and a principal-derived access
 * summary. No mutation controls.
 */
export function OrgPersonDrawer({
  person,
  directReportNames,
  onClose,
}: {
  person: OrgMapPersonDTO | null;
  directReportNames: string[];
  onClose: () => void;
}) {
  if (!person) return null;

  return (
    <aside
      data-testid="org-person-drawer"
      className="w-[22rem] shrink-0 border-l border-[var(--adm-border)] bg-[var(--adm-surface)] p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-[var(--adm-text)]">{person.name}</h2>
          {person.jobTitle ? <p className="text-sm text-[var(--adm-text-muted)]">{person.jobTitle}</p> : null}
        </div>
        <button type="button" onClick={onClose} aria-label="Bezárás" className="rounded border border-[var(--adm-border)] px-2 py-1 text-xs text-[var(--adm-text-muted)]">
          ✕
        </button>
      </div>

      <div className="mt-5 space-y-5">
        <section>
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Szervezeti pozíció</h3>
          <div className="mt-2 space-y-2">
            <Row label="Munkakör" value={person.jobTitle || "—"} />
            <Row label="Csoport / részleg" value={person.organizationGroupName || "—"} />
            <Row label="Vezető" value={person.managerName || "—"} />
            <Row label="Helyettes" value={person.deputyName || "—"} />
            <Row label="Státusz" value={orgEmploymentStatusLabel(person.employmentStatus)} />
          </div>
        </section>

        <section>
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Felelősségi körök</h3>
          {person.responsibilities.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {person.responsibilities.map((r) => (
                <span key={r.id} className={labelCls}>
                  {responsibilityTypeLabel(r.type)} — {r.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-[var(--adm-text-muted)]">Nincs rögzített felelősségi kör.</p>
          )}
        </section>

        <section>
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Portál státusz</h3>
          <p className={`mt-2 inline-block rounded px-2 py-1 text-xs ${person.portalStatus === "ACTIVE" ? "bg-[var(--adm-green-100)] text-[var(--adm-green-800)]" : person.portalStatus === "SUSPENDED" ? "bg-amber-50 text-amber-800" : "bg-[var(--adm-ivory-100)] text-[var(--adm-text-muted)]"}`}>
            {portalStatusLabel(person.portalStatus)}
          </p>
          <p className="mt-2 text-[10px] text-[var(--adm-text-muted)]">A portál-kapcsolat önmagában nem ad hozzáférést.</p>
        </section>

        <section>
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Hozzáféréss-összegzés</h3>
          <div className="mt-2">
            <AccessSummaryBlock person={person} />
          </div>
        </section>

        <p className="text-[10px] text-[var(--adm-text-muted)]">
          Közvetlen beosztottak:{" "}
          <span data-testid="org-direct-reports">{directReportNames.length ? directReportNames.join(", ") : "—"}</span>
        </p>
      </div>
    </aside>
  );
}