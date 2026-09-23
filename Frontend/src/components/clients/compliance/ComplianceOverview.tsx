"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getCases, type CaseListItem } from "@/lib/api";
import { bindComplianceProposal, confirmComplianceProposal, createComplianceProposal, listComplianceProposals, proposalKinds, rejectComplianceProposal, startCaseFromComplianceProposal, updateComplianceProposal, type ComplianceProposal } from "@/lib/complianceProposalApi";
import { complianceOverviewApi, type ComplianceEvidenceRecordView, type ComplianceEvidenceSourceType, type ComplianceEvidenceStatus } from "@/lib/complianceOverviewApi";

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

export type ComplianceControlGap =
  | "EVIDENCED"
  | "MISSING_CONTROL"
  | "STALE_EVIDENCE"
  | "MISSING_EVIDENCE"
  | "NOT_ASSESSED";

export type ComplianceControlSummary = {
  requirements: Array<{
    title: string;
    controls: Array<{
      title: string;
      controlDefinitionId?: string;
      controlId?: string | null;
      implementationStatus: string | null;
      owner: string | null;
      lastReviewedAt?: string | null;
      nextReviewAt: string | null;
      evidence?: ComplianceEvidenceRecordView[];
      evidenceSummary: { acceptedCurrent: number; stale: number; missing: boolean };
      /** Canonical workforce gap classification. Optional for older payloads. */
      gap?: ComplianceControlGap | null;
    }>;
  }>;
};

export type ComplianceControlsState =
  | { status: "loading" }
  | { status: "success"; summary: ComplianceControlSummary }
  | { status: "error"; message: string };

const complianceControlStatusLabels: Record<string, string> = {
  NOT_ASSESSED: "Nincs felmérve",
  PLANNED: "Tervezett",
  IMPLEMENTING: "Bevezetés alatt",
  IMPLEMENTED: "Bevezetve",
  PARTIAL: "Részben bevezetve",
  NOT_IMPLEMENTED: "Nincs bevezetve",
};

export const complianceGapLabels: Record<ComplianceControlGap, string> = {
  EVIDENCED: "Bizonyítékkal alátámasztva",
  MISSING_CONTROL: "Hiányzó intézkedés",
  STALE_EVIDENCE: "Elavult bizonyíték",
  MISSING_EVIDENCE: "Hiányzó bizonyíték",
  NOT_ASSESSED: "Nincs felmérve",
};

export const complianceGapClass: Record<ComplianceControlGap, string> = {
  EVIDENCED: "border-[#BFD6C6] bg-[#EEF5F0] text-[var(--adm-green-800)]",
  MISSING_CONTROL: "border-[#DCCCA6] bg-[#FFF9E9] text-[#735D16]",
  STALE_EVIDENCE: "border-[#DCCCA6] bg-[#FFF3D8] text-[#735D16]",
  MISSING_EVIDENCE: "border-[#DCCCA6] bg-[#FFF9E9] text-[#735D16]",
  NOT_ASSESSED: "border-[var(--adm-border)] bg-[var(--adm-surface)] text-[var(--adm-text-muted)]",
};

/**
 * Presentation-only fallback for payloads produced before the canonical gap
 * field existed. The backend classification stays authoritative when present.
 */
export function deriveControlEvidenceGap(control: {
  implementationStatus: string | null;
  gap?: ComplianceControlGap | null;
  evidenceSummary: { acceptedCurrent: number; stale: number; missing: boolean };
}): ComplianceControlGap {
  if (control.gap) return control.gap;
  if (control.implementationStatus === "NOT_IMPLEMENTED") return "MISSING_CONTROL";
  if (control.evidenceSummary.acceptedCurrent > 0) return "EVIDENCED";
  if (control.evidenceSummary.stale > 0) return "STALE_EVIDENCE";
  if (!control.implementationStatus || control.implementationStatus === "NOT_ASSESSED") return "NOT_ASSESSED";
  return "MISSING_EVIDENCE";
}

export const complianceEvidenceSourceLabels: Record<ComplianceEvidenceSourceType, string> = {
  DOCUMENT_VERSION: "Dokumentumverzió",
  CLIENT_FACT: "Vállalati adat",
  OBSERVATION: "Megfigyelés",
  EXTERNAL_REFERENCE: "Külső hivatkozás",
};

export const complianceEvidenceStatusLabels: Record<ComplianceEvidenceStatus, string> = {
  PROVIDED: "Rögzítve",
  UNDER_REVIEW: "Felülvizsgálat alatt",
  ACCEPTED: "Elfogadva",
  REJECTED: "Elutasítva",
};

type ComplianceControlEntry = ComplianceControlSummary["requirements"][number]["controls"][number];

function controlKey(control: ComplianceControlEntry, index: number): string {
  return control.controlDefinitionId || `${control.title}-${index}`;
}

export function ComplianceControlEvidencePanel({
  control,
  busy,
  adding,
  title,
  reference,
  error,
  onToggleAdd,
  onTitleChange,
  onReferenceChange,
  onCancelAdd,
  onSubmitAdd,
  onReview,
}: {
  control: ComplianceControlEntry;
  busy: boolean;
  adding: boolean;
  title: string;
  reference: string;
  error: string | null;
  onToggleAdd: () => void;
  onTitleChange: (value: string) => void;
  onReferenceChange: (value: string) => void;
  onCancelAdd: () => void;
  onSubmitAdd: () => void;
  onReview: (evidenceId: string, status: ComplianceEvidenceStatus) => void;
}) {
  const evidenceRecords = control.evidence || [];
  return (
    <div className="mt-2 space-y-2">
      {error ? <p role="alert" className="mb-2 text-xs text-red-800">{error}</p> : null}
      {evidenceRecords.length ? (
        <ul className="space-y-2">
          {evidenceRecords.map((evidence) => (
            <li key={evidence.id} className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--adm-text)]">{evidence.title}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--adm-text-muted)]">
                    {complianceEvidenceSourceLabels[evidence.sourceType] || "Bizonyíték"} · {complianceEvidenceStatusLabels[evidence.status] || evidence.status}
                  </p>
                </div>
                {evidence.status === "PROVIDED" || evidence.status === "UNDER_REVIEW" ? (
                  <div className="flex gap-1">
                    <button type="button" disabled={busy} onClick={() => onReview(evidence.id, "ACCEPTED")} className="rounded border border-[var(--adm-green-800)] bg-white px-2 py-1 text-[11px] text-[var(--adm-green-800)] disabled:opacity-50">Elfogadás</button>
                    <button type="button" disabled={busy} onClick={() => onReview(evidence.id, "REJECTED")} className="rounded border border-[var(--adm-border)] bg-white px-2 py-1 text-[11px] text-[var(--adm-text)] disabled:opacity-50">Elutasítás</button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--adm-text-muted)]">Ehhez az intézkedéshez még nincs rögzített bizonyíték.</p>
      )}
      {adding ? (
        <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); onSubmitAdd(); }}>
          <input aria-label="Bizonyíték címe" required value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder="Bizonyíték címe" className="w-full rounded border border-[var(--adm-border)] bg-white px-2 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)]" />
          <input aria-label="Külső hivatkozás" required value={reference} onChange={(event) => onReferenceChange(event.target.value)} placeholder="Külső hivatkozás (pl. szabályzat hivatkozása vagy URL)" className="w-full rounded border border-[var(--adm-border)] bg-white px-2 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)]" />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="rounded border border-[var(--adm-green-800)] bg-[var(--adm-green-800)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Bizonyíték hozzáadása</button>
            <button type="button" disabled={busy} onClick={onCancelAdd} className="rounded border border-[var(--adm-border)] bg-white px-3 py-1.5 text-xs text-[var(--adm-text)] disabled:opacity-50">Mégse</button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          disabled={busy || !control.controlDefinitionId}
          onClick={onToggleAdd}
          className="rounded border border-[var(--adm-border)] bg-white px-2 py-1 text-[11px] text-[var(--adm-text)] disabled:opacity-50"
        >
          Bizonyíték hozzáadása
        </button>
      )}
    </div>
  );
}

export function ComplianceControlsSection({
  state,
  onRetry,
  clientId,
  onChanged,
}: {
  state: ComplianceControlsState;
  onRetry: () => void;
  clientId?: string;
  onChanged?: () => void;
}) {
  const controls = state.status === "success"
    ? state.summary.requirements.flatMap((item) => item.controls)
    : [];
  const interactive = Boolean(clientId);
  const [expandedControl, setExpandedControl] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const addEvidence = async (control: ComplianceControlEntry) => {
    if (!clientId || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      let controlId = control.controlId;
      if (!controlId) {
        if (!control.controlDefinitionId) throw new Error("no-control-definition");
        const created = await complianceOverviewApi.createClientControl(clientId, { controlDefinitionId: control.controlDefinitionId });
        controlId = created.id;
      }
      const evidence = await complianceOverviewApi.createEvidenceRecord(clientId, {
        sourceType: "EXTERNAL_REFERENCE",
        title: evidenceTitle.trim(),
        externalReference: evidenceReference.trim(),
      });
      await complianceOverviewApi.linkEvidenceToControl(clientId, controlId, evidence.id);
      setAddingFor(null);
      setEvidenceTitle("");
      setEvidenceReference("");
      onChanged?.();
    } catch {
      setActionError("A bizonyíték rögzítése nem sikerült. Ellenőrizd az adatokat, majd próbáld újra.");
    } finally {
      setBusy(false);
    }
  };

  const review = async (evidenceId: string, status: ComplianceEvidenceStatus) => {
    if (!clientId || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await complianceOverviewApi.reviewEvidenceRecord(clientId, evidenceId, { status });
      onChanged?.();
    } catch {
      setActionError("A felülvizsgálat nem sikerült. Próbáld újra.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-4 rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-5" data-testid="compliance-controls-section">
      <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Intézkedések és bizonyítékok</h2>
      {state.status === "loading" ? <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Intézkedések és bizonyítékok betöltése…</p> : null}
      {state.status === "error" ? (
        <div role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{state.message}</span>
          <button type="button" onClick={onRetry} className="ml-3 rounded border border-[var(--adm-border)] bg-white px-3 py-1 text-xs text-[var(--adm-text)]">Újrapróbálás</button>
        </div>
      ) : null}
      {state.status === "success" && !controls.length ? <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Nincs rögzített megfelelési intézkedés.</p> : null}
      {state.status === "success" && controls.length ? (
        <ul className="mt-3 space-y-3">
          {controls.map((control, index) => {
            const gap = deriveControlEvidenceGap(control);
            const key = controlKey(control, index);
            return (
            <li key={`${control.title}-${index}`} className="rounded border border-[var(--adm-border)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-[var(--adm-text)]">{control.title}</p>
                <span className={`rounded border px-2 py-1 text-xs ${complianceGapClass[gap]}`}>{complianceGapLabels[gap]}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Állapot: {complianceControlStatusLabels[control.implementationStatus || "NOT_ASSESSED"] || "Nincs felmérve"}</p>
              {control.owner ? <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Felelős: {control.owner}</p> : null}
              <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
                Bizonyíték: {control.evidenceSummary.acceptedCurrent} aktuális · {control.evidenceSummary.stale} felülvizsgálandó
              </p>
              {control.nextReviewAt ? <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Következő felülvizsgálat: {control.nextReviewAt.slice(0, 10)}</p> : null}
              {interactive ? (
                <div className="mt-3 border-t border-[var(--adm-border)] pt-2">
                  <button
                    type="button"
                    onClick={() => setExpandedControl(expandedControl === key ? null : key)}
                    className="text-xs text-[var(--adm-ochre-500)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)]"
                  >
                    {expandedControl === key ? "Bizonyítékok elrejtése" : "Bizonyítékok kezelése"}
                  </button>
                  {expandedControl === key ? (
                    <ComplianceControlEvidencePanel
                      control={control}
                      busy={busy}
                      adding={addingFor === key}
                      title={evidenceTitle}
                      reference={evidenceReference}
                      error={actionError}
                      onToggleAdd={() => { setAddingFor(key); setEvidenceTitle(""); setEvidenceReference(""); }}
                      onTitleChange={setEvidenceTitle}
                      onReferenceChange={setEvidenceReference}
                      onCancelAdd={() => setAddingFor(null)}
                      onSubmitAdd={() => { void addEvidence(control); }}
                      onReview={(evidenceId, status) => { void review(evidenceId, status); }}
                    />
                  ) : null}
                </div>
              ) : null}
            </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

export const complianceOutcomeLabels: Record<ComplianceApplicabilityStatus, string> = {
  APPLIES: "Belső értékelés szerint releváns",
  DOES_NOT_APPLY: "Nem releváns",
  INSUFFICIENT_FACTS: "Nincs elég adat",
  LEGAL_REVIEW_REQUIRED: "Jogi felülvizsgálat szükséges",
  TECHNICAL_REVIEW_REQUIRED: "Technikai felülvizsgálat szükséges",
  SOURCE_SUPPORT_INSUFFICIENT: "Nem elégséges forrástámogatás",
};

export const complianceOutcomeClass: Record<ComplianceApplicabilityStatus, string> = {
  APPLIES: "border-[#DCCCA6] bg-[var(--adm-sand-100)] text-[var(--adm-text)]",
  DOES_NOT_APPLY: "border-[var(--adm-border)] bg-[var(--adm-surface)] text-[var(--adm-text-muted)]",
  INSUFFICIENT_FACTS: "border-[#DCCCA6] bg-[#FFF9E9] text-[#735D16]",
  LEGAL_REVIEW_REQUIRED: "border-[#DCCCA6] bg-[#FFF3D8] text-[#735D16]",
  TECHNICAL_REVIEW_REQUIRED: "border-[#BFD6DD] bg-[#EAF1F3] text-[#1F5A66]",
  SOURCE_SUPPORT_INSUFFICIENT: "border-[#DCCCA6] bg-[#FFF3D8] text-[#735D16]",
};

export const complianceScopeLabels: Record<string, string> = {
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

const proposalStatusLabels: Record<ComplianceProposal['status'], string> = {
  PROPOSED: 'Javaslat alatt',
  CONFIRMED: 'Megerősítve',
  REJECTED: 'Elutasítva',
  STALE: 'Elavult',
};

export function getComplianceScopeLabel(finding: ComplianceFindingView): string {
  if (finding.subjectLabel?.trim()) return finding.subjectLabel;
  return complianceScopeLabels[finding.scopeType || ""] || "Nem azonosított hatókör";
}

export function getComplianceFindingStatus(finding: ComplianceFindingView): ComplianceApplicabilityStatus | null {
  return finding.applicabilityStatus ?? null;
}

/** UI hint only. The proposal API remains authoritative for eligibility. */
export function isComplianceProposalCandidate(finding: ComplianceFindingView): boolean {
  return Boolean(finding.requirementKey?.trim()) && finding.applicabilityStatus != null;
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
  return findings.filter((finding) => {
    const applicability = getComplianceFindingStatus(finding);
    if (applicability === "DOES_NOT_APPLY") return false;
    if (applicability === null) return finding.operationalStatus !== "RESOLVED";
    return true;
  });
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
      {highest ? <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Legmagasabb figyelem: {complianceOutcomeLabels[getComplianceFindingStatus(highest) as ComplianceApplicabilityStatus]}</p> : null}
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
        {status ? <span className={`rounded border px-2 py-1 text-xs ${complianceOutcomeClass[status]}`}>{complianceOutcomeLabels[status]}</span> : null}
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
  onRetry,
  title = "Compliance áttekintés",
}: {
  findings: ComplianceFindingView[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  title?: string;
}) {
  const groups = useMemo(() => groupComplianceFindings(findings), [findings]);
  return (
    <section className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-5" data-testid="compliance-overview">
      <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">{title}</h2>
      <p className="mt-2 text-xs text-[var(--adm-text-muted)]">Belső értékelési megállapítások; nem igazolt jogi kötelezettségek.</p>
      {loading ? <div className="mt-3 animate-pulse space-y-2" aria-busy="true"><div className="h-4 w-2/5 rounded bg-[var(--adm-surface)]" /><div className="h-3 w-4/5 rounded bg-[var(--adm-surface)]" /><ComplianceState state="loading" /></div> : null}
      {!loading && error ? <div className="mt-3"><ComplianceState state="unavailable" detail={error} /><button type="button" onClick={onRetry} className="mt-3 rounded border border-[var(--adm-border)] bg-white px-3 py-2 text-xs text-[var(--adm-text)]">Újrapróbálás</button></div> : null}
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

export function ComplianceProposalPanel({ clientId, findings }: { clientId: string; findings: ComplianceFindingView[] }) {
  const [proposals, setProposals] = useState<ComplianceProposal[]>([]);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eligibleProposalFindings = useMemo(() => findings.filter(isComplianceProposalCandidate), [findings]);
  const [form, setForm] = useState({ findingId: '', proposalKind: 'REMEDIATION', title: '', description: '', suggestedAction: '', deadline: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const actionLockRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextProposals, nextCases] = await Promise.all([listComplianceProposals(clientId), getCases(1, 100, undefined, clientId)]);
      setProposals(nextProposals);
      setCases(nextCases.data);
    } catch {
      setError('A javasolt compliance műveletek jelenleg nem tölthetők be.');
    } finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const fallbackId = eligibleProposalFindings[0]?.id || '';
    setForm((current) => eligibleProposalFindings.some((finding) => finding.id === current.findingId) || current.findingId === fallbackId
      ? current
      : { ...current, findingId: fallbackId });
  }, [eligibleProposalFindings]);

  const selectedKind = proposalKinds.find((kind) => kind.value === form.proposalKind) || proposalKinds[0];
  const run = async (operation: () => Promise<unknown>) => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setBusy(true); setError(null);
    try { await operation(); await load(); } catch (caught) {
      const code = typeof caught === 'object' && caught && 'code' in caught ? String(caught.code) : '';
      const messages: Record<string, string> = {
        PROPOSAL_ALREADY_ACTIVE: 'Ehhez a megállapításhoz már van aktív, azonos javaslat.',
        PROPOSAL_CASE_ALREADY_ACTIVE: 'Ehhez az ügyhöz már van aktív, azonos javaslat.',
        PROPOSAL_STALE: 'A megállapítás időközben megváltozott, ezért a javaslat elavult.',
        PROPOSAL_NO_CASE: 'A megerősítéshez előbb ügyet kell hozzárendelni.',
        CLIENT_ACCESS_FORBIDDEN: 'Nincs jogosultságod ehhez az ügyfélhez vagy ügyhöz.',
        PROPOSAL_TERMINAL: 'Ez a javaslat már lezárt állapotban van.',
      };
      setError(messages[code] || 'A művelet nem sikerült. Ellenőrizd az adatokat, majd próbáld újra.');
    } finally { actionLockRef.current = false; setBusy(false); }
  };

  return (
    <section className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-5" data-testid="compliance-proposals" aria-busy={loading || busy}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Javasolt compliance műveletek</h2><p className="mt-2 text-xs text-[var(--adm-text-muted)]">A rendszer javaslatot készít; feladat csak ügyvédi megerősítés után jön létre.</p></div>
        <Link href={`/cases?newCase=1&clientId=${encodeURIComponent(clientId)}`} className="text-xs text-[var(--adm-ochre-500)] hover:underline">Új ügy indítása a normál intake-ben →</Link>
      </div>
      {loading ? <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Javaslatok betöltése…</p> : null}
      {error ? <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {!loading && !proposals.length ? <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Ehhez az ügyfélhez még nincs javasolt művelet.</p> : null}
      {!loading && proposals.length ? <ul className="mt-4 space-y-2">{proposals.map((proposal) => (
        <li key={proposal.id} className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium text-[var(--adm-text)]">{proposal.title}</p><p className="mt-1 text-xs text-[var(--adm-text-muted)]">{proposalKinds.find((kind) => kind.value === proposal.proposalKind)?.label || proposal.proposalKind} · {proposalStatusLabels[proposal.status]}</p></div><span className="text-xs text-[var(--adm-text-muted)]">{proposal.case ? `Ügy: ${proposal.case.caseNumber}` : 'Nincs ügyhöz kötve'}</span></div>
          {proposal.description ? <p className="mt-2 text-sm text-[var(--adm-text)]">{proposal.description}</p> : null}
          {proposal.status === 'PROPOSED' && editingId === proposal.id ? <form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void run(async () => { await updateComplianceProposal(proposal.id, { title: editTitle }); setEditingId(null); }); }}><input aria-label="Javaslat címének szerkesztése" required value={editTitle} onChange={(event) => setEditTitle(event.target.value)} className="min-w-0 flex-1 rounded border border-[var(--adm-border)] bg-white px-2 py-2 text-xs" /><button type="submit" disabled={busy} className="rounded border border-[var(--adm-green-800)] bg-white px-3 py-2 text-xs text-[var(--adm-green-800)] disabled:opacity-50">Mentés</button><button type="button" disabled={busy} onClick={() => setEditingId(null)} className="rounded border border-[var(--adm-border)] bg-white px-3 py-2 text-xs text-[var(--adm-text)]">Mégse</button></form> : null}
          {proposal.status === 'PROPOSED' ? <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto]">
            <select aria-label="Ügy kiválasztása" value={proposal.case?.id || ''} disabled={busy} onChange={(event) => event.target.value && void run(() => bindComplianceProposal(proposal.id, event.target.value))} className="rounded border border-[var(--adm-border)] bg-white px-2 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)]"><option value="">Ügy hozzárendelése · kapcsolódó ügy kiválasztása…</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.caseNumber} · {item.title}</option>)}</select>
            <div className="flex flex-col gap-1">
              <button type="button" disabled={busy || !!proposal.case} onClick={() => void run(() => startCaseFromComplianceProposal(proposal.id))} className="rounded border border-[var(--adm-green-800)] bg-[var(--adm-green-800)] px-3 py-2 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)] disabled:cursor-not-allowed disabled:opacity-50">Ügy indítása</button>
              <button type="button" disabled={busy || !proposal.case} aria-describedby={!proposal.case ? `proposal-case-help-${proposal.id}` : undefined} onClick={() => void run(() => confirmComplianceProposal(proposal.id))} className="rounded border border-[var(--adm-green-800)] bg-white px-3 py-2 text-xs font-semibold text-[var(--adm-green-800)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)] disabled:cursor-not-allowed disabled:opacity-50">Megerősítés</button>
              {!proposal.case ? <p id={`proposal-case-help-${proposal.id}`} className="max-w-[18rem] text-[11px] text-[var(--adm-text-muted)]">Indítson új ügyet. A megerősítéshez előbb ügyet kell hozzárendelni.</p> : null}
            </div>
            <button type="button" disabled={busy} onClick={() => void run(() => rejectComplianceProposal(proposal.id))} className="rounded border border-[var(--adm-border)] bg-white px-3 py-2 text-xs text-[var(--adm-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)] disabled:opacity-50">Elutasítás</button>
            <button type="button" disabled={busy} onClick={() => { setEditingId(proposal.id); setEditTitle(proposal.title); }} className="rounded border border-[var(--adm-border)] bg-white px-3 py-2 text-xs text-[var(--adm-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)] disabled:opacity-50">Szerkesztés</button>
          </div> : null}
          {proposal.taskId ? <Link href={`/tasks/${proposal.taskId}`} className="mt-2 inline-block text-xs text-[var(--adm-ochre-500)] hover:underline">Kapcsolt feladat megnyitása →</Link> : null}
        </li>
      ))}</ul> : null}
      <div className="mt-5 border-t border-[var(--adm-border)] pt-4">
        <h3 className="text-sm font-medium text-[var(--adm-text)]">Új javaslat</h3>
        {!eligibleProposalFindings.length ? <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Jelenleg nincs olyan követelményhez kapcsolt megállapítás, amelyből új munkajavaslat indítható.</p> : <form onSubmit={(event) => { event.preventDefault(); void run(async () => { await createComplianceProposal({ findingId: form.findingId, proposalKind: form.proposalKind, actionIntentKey: selectedKind.intent, title: form.title, description: form.description || undefined, suggestedAction: form.suggestedAction || undefined, deadline: form.deadline || undefined }); setForm((current) => ({ ...current, findingId: eligibleProposalFindings[0]?.id || '', title: '', description: '', suggestedAction: '', deadline: '' })); }); }}>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <select aria-label="Megállapítás" required value={form.findingId} onChange={(event) => setForm({ ...form, findingId: event.target.value })} className="rounded border border-[var(--adm-border)] bg-white px-2 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)]"><option value="">Megállapítás kiválasztása…</option>{eligibleProposalFindings.map((finding) => <option key={finding.id} value={finding.id}>{finding.title}</option>)}</select>
          <select aria-label="Javaslat típusa" value={form.proposalKind} onChange={(event) => setForm({ ...form, proposalKind: event.target.value })} className="rounded border border-[var(--adm-border)] bg-white px-2 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)]">{proposalKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select>
          <input aria-label="Javaslat címe" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Javaslat címe" className="rounded border border-[var(--adm-border)] px-2 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)]" />
          <input aria-label="Határidő" type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} className="rounded border border-[var(--adm-border)] px-2 py-2 text-xs" />
          <textarea aria-label="Leírás" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Leírás" className="rounded border border-[var(--adm-border)] px-2 py-2 text-xs md:col-span-2" rows={2} />
          <textarea aria-label="Javasolt következő lépés" value={form.suggestedAction} onChange={(event) => setForm({ ...form, suggestedAction: event.target.value })} placeholder="Javasolt következő lépés" className="rounded border border-[var(--adm-border)] px-2 py-2 text-xs md:col-span-2" rows={2} />
        </div>
        <button type="submit" disabled={busy || !form.findingId} className="mt-3 rounded border border-[var(--adm-green-800)] bg-[var(--adm-green-800)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Javaslat mentése</button>
        </form>}
      </div>
    </section>
  );
}
