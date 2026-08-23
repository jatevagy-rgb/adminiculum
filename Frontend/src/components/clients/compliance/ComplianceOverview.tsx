"use client";

import React, { useMemo, useState } from "react";

export type ComplianceApplicabilityStatus =
  | "APPLIES"
  | "DOES_NOT_APPLY"
  | "INSUFFICIENT_FACTS"
  | "LEGAL_REVIEW_REQUIRED"
  | "TECHNICAL_REVIEW_REQUIRED"
  | "SOURCE_SUPPORT_INSUFFICIENT";

export type ComplianceFindingView = {
  id: string;
  title: string;
  description?: string | null;
  recommendation?: string | null;
  severity?: string | null;
  operationalStatus?: string | null;
  applicabilityStatus?: ComplianceApplicabilityStatus | null;
  requirementKey?: string | null;
  scopeType?: string | null;
  subjectLabel?: string | null;
};

const statusLabels: Record<ComplianceApplicabilityStatus, string> = {
  APPLIES: "Belső értékelés szerint releváns",
  DOES_NOT_APPLY: "Nem releváns",
  INSUFFICIENT_FACTS: "Nincs elég adat",
  LEGAL_REVIEW_REQUIRED: "Jogi felülvizsgálat szükséges",
  TECHNICAL_REVIEW_REQUIRED: "Technikai felülvizsgálat szükséges",
  SOURCE_SUPPORT_INSUFFICIENT: "Nem elégséges forrástámogatás",
};

const statusClass: Record<ComplianceApplicabilityStatus, string> = {
  APPLIES: "border-[#DCCCA6] bg-[var(--adm-sand-100)] text-[var(--adm-text)]",
  DOES_NOT_APPLY: "border-[var(--adm-border)] bg-[var(--adm-surface)] text-[var(--adm-text-muted)]",
  INSUFFICIENT_FACTS: "border-[#DCCCA6] bg-[#FFF9E9] text-[#735D16]",
  LEGAL_REVIEW_REQUIRED: "border-[#DCCCA6] bg-[#FFF3D8] text-[#735D16]",
  TECHNICAL_REVIEW_REQUIRED: "border-[#BFD6DD] bg-[#EAF1F3] text-[#1F5A66]",
  SOURCE_SUPPORT_INSUFFICIENT: "border-[#DCCCA6] bg-[#FFF3D8] text-[#735D16]",
};

const scopeLabels: Record<string, string> = {
  COMPANY: "Vállalat",
  EMPLOYEE: "Munkavállaló",
  CONTRACT: "Szerződés",
  WORKPLACE_SITE: "Munkahelyszín",
  EVENT: "Esemény",
  SALES_CHANNEL: "Értékesítési csatorna",
  PRODUCT_SERVICE: "Termék vagy szolgáltatás",
  TAX_PERIOD: "Adóidőszak",
  TRANSACTION: "Tranzakció",
  REPORTING_EVENT: "Jelentési esemény",
};

export function getComplianceScopeLabel(finding: ComplianceFindingView): string {
  if (finding.subjectLabel?.trim()) return finding.subjectLabel;
  return scopeLabels[finding.scopeType || ""] || "Nem azonosított hatókör";
}

export function getComplianceFindingStatus(finding: ComplianceFindingView): ComplianceApplicabilityStatus | null {
  return finding.applicabilityStatus ?? null;
}

export function groupComplianceFindings(findings: ComplianceFindingView[]): Array<{ key: string; title: string; findings: ComplianceFindingView[] }> {
  const groups = new Map<string, { key: string; title: string; findings: ComplianceFindingView[] }>();
  for (const finding of findings) {
    const key = finding.requirementKey?.trim() ? `requirement:${finding.requirementKey}` : `manual:${finding.id}`;
    const group = groups.get(key);
    if (group) group.findings.push(finding);
    else groups.set(key, { key, title: finding.title, findings: [finding] });
  }
  return Array.from(groups.values());
}

export function getComplianceAttentionFindings(findings: ComplianceFindingView[]): ComplianceFindingView[] {
  return findings.filter((finding) => getComplianceFindingStatus(finding) !== "DOES_NOT_APPLY");
}

export function isComplianceGroupInitiallyOpen(findings: ComplianceFindingView[]): boolean {
  return findings.length <= 1;
}

export function ComplianceState({
  state,
  detail,
}: {
  state: "loading" | "empty" | "unavailable";
  detail?: string;
}) {
  if (state === "loading") return <p className="text-sm text-[var(--adm-text-muted)]">Megállapítások betöltése…</p>;
  if (state === "empty") {
    return (
      <div className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
        <p className="text-sm text-[var(--adm-text)]">Nincs megjeleníthető belső értékelési megállapítás.</p>
        <p className="mt-1 text-xs text-[var(--adm-text-muted)]">A felület nem tartalmaz demo vagy feltételezett jogi tartalmat.</p>
      </div>
    );
  }
  return (
    <div role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      {detail || "A compliance adatai jelenleg nem tölthetők be."}
    </div>
  );
}

export function ComplianceAttentionSummary({ findings }: { findings: ComplianceFindingView[] }) {
  const attention = getComplianceAttentionFindings(findings);
  const highest = attention.find((finding) => {
    const status = getComplianceFindingStatus(finding);
    return status === "LEGAL_REVIEW_REQUIRED" || status === "TECHNICAL_REVIEW_REQUIRED" || status === "SOURCE_SUPPORT_INSUFFICIENT";
  });
  if (!attention.length) return <p className="text-sm text-[var(--adm-text-muted)]">Nincs külön figyelmet igénylő belső értékelési tétel.</p>;
  return (
    <div className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
      <p className="text-sm text-[var(--adm-text)]">{attention.length} belső értékelési megállapítás igényel áttekintést.</p>
      {highest ? <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Legmagasabb figyelem: {statusLabels[getComplianceFindingStatus(highest) as ComplianceApplicabilityStatus]}</p> : null}
    </div>
  );
}

export function ComplianceFindingRow({ finding }: { finding: ComplianceFindingView }) {
  const status = getComplianceFindingStatus(finding);
  return (
    <li className="rounded border border-[var(--adm-border)] bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-[var(--adm-text)]">{finding.title}</p>
          <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Hatókör: {getComplianceScopeLabel(finding)}</p>
        </div>
        {status ? <span className={`rounded border px-2 py-1 text-xs ${statusClass[status]}`}>{statusLabels[status]}</span> : null}
      </div>
      {finding.description ? <p className="mt-2 text-sm text-[var(--adm-text)]">{finding.description}</p> : null}
      {finding.operationalStatus ? <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Belső állapot: {finding.operationalStatus}</p> : null}
      {finding.recommendation ? <p className="mt-2 text-xs text-[var(--adm-text-muted)]">Következő áttekintés: {finding.recommendation}</p> : null}
    </li>
  );
}

export function ComplianceRequirementGroup({ title, findings }: { title: string; findings: ComplianceFindingView[] }) {
  const [open, setOpen] = useState(isComplianceGroupInitiallyOpen(findings));
  return (
    <section className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
      <button type="button" className="flex w-full items-start justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)]" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="min-w-0">
          <span className="block font-medium text-[var(--adm-text)]">{title}</span>
          <span className="mt-1 block text-xs text-[var(--adm-text-muted)]">{findings.length} külön vizsgált hatókör</span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-xs text-[var(--adm-text-muted)]">{open ? "Elrejtés" : "Megnyitás"}</span>
      </button>
      {open ? <ul className="mt-3 space-y-2">{findings.map((finding) => <ComplianceFindingRow key={finding.id} finding={finding} />)}</ul> : null}
    </section>
  );
}

export function ComplianceOverviewPanel({
  findings,
  loading = false,
  error = null,
  title = "Compliance áttekintés",
}: {
  findings: ComplianceFindingView[];
  loading?: boolean;
  error?: string | null;
  title?: string;
}) {
  const groups = useMemo(() => groupComplianceFindings(findings), [findings]);
  return (
    <section className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-5" data-testid="compliance-overview">
      <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">{title}</h2>
      <p className="mt-2 text-xs text-[var(--adm-text-muted)]">Belső értékelési megállapítások; nem igazolt jogi kötelezettségek.</p>
      {loading ? <div className="mt-3"><ComplianceState state="loading" /></div> : null}
      {!loading && error ? <div className="mt-3"><ComplianceState state="unavailable" detail={error} /></div> : null}
      {!loading && !error && !findings.length ? <div className="mt-3"><ComplianceState state="empty" /></div> : null}
      {!loading && !error && findings.length ? (
        <div className="mt-4 space-y-4">
          <ComplianceAttentionSummary findings={findings} />
          <div className="space-y-2">{groups.map((group) => <ComplianceRequirementGroup key={group.key} title={group.title} findings={group.findings} />)}</div>
        </div>
      ) : null}
    </section>
  );
}
