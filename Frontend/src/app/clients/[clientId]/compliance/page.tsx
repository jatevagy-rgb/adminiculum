"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { ClientWorkspaceTabs } from "@/components/clients/ClientWorkspaceTabs";
import {
  ComplianceOverviewPanel,
  ComplianceProposalPanel,
  complianceOutcomeClass,
  complianceOutcomeLabels,
  complianceScopeLabels,
} from "@/components/clients/compliance/ComplianceOverview";
import type { ComplianceFindingView, ComplianceApplicabilityStatus } from "@/components/clients/compliance/ComplianceOverview";
import { complianceOverviewApi } from "@/lib/complianceOverviewApi";
import { complianceWorkspaceApi, type ComplianceWorkspace, type ComplianceWorkspaceArea } from "@/lib/complianceWorkspaceApi";
import { getClient, type Client } from "@/lib/api";
import { listAdminWorkspaces } from "@/lib/clientPortalAdminApi";

const outcomeKeys: ComplianceApplicabilityStatus[] = [
  "APPLIES",
  "DOES_NOT_APPLY",
  "INSUFFICIENT_FACTS",
  "LEGAL_REVIEW_REQUIRED",
  "TECHNICAL_REVIEW_REQUIRED",
  "SOURCE_SUPPORT_INSUFFICIENT",
];

const summaryCountKey: Record<ComplianceApplicabilityStatus, keyof ComplianceWorkspace["summary"]> = {
  APPLIES: "applies",
  DOES_NOT_APPLY: "doesNotApply",
  INSUFFICIENT_FACTS: "insufficientFacts",
  LEGAL_REVIEW_REQUIRED: "legalReviewRequired",
  TECHNICAL_REVIEW_REQUIRED: "technicalReviewRequired",
  SOURCE_SUPPORT_INSUFFICIENT: "sourceSupportInsufficient",
};

const citationRoleLabels: Record<string, string> = {
  PRIMARY: "Elsődleges forrás",
  SUPPORTING: "Támogató forrás",
  CONTEXT: "Kontextus",
};

const sourceSupportLabels: Record<string, string> = {
  SUFFICIENT: "Megfelelő forrástámogatás",
  INCOMPLETE: "Részleges forrástámogatás",
  AMBIGUOUS: "Nem egyértelmű forrástámogatás",
  MISSING: "Hiányzó forrástámogatás",
  LEGAL_REVIEW_REQUIRED: "Jogi felülvizsgálat szükséges",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("hu-HU");
  } catch {
    return value;
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-5">
      <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function WorkspaceAreaRow({ area }: { area: ComplianceWorkspaceArea }) {
  const [open, setOpen] = useState(false);
  const outcome = area.outcome as ComplianceApplicabilityStatus;
  const citations = area.citations;
  const locatorText = (c: ComplianceWorkspaceArea["citations"][number]) =>
    [c.article, c.section, c.paragraph, c.locator, c.versionLabel].filter(Boolean).join(" · ");
  return (
    <li className="rounded border border-[var(--adm-border)] bg-white p-3">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)]"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="min-w-0">
          <span className="block font-medium text-[var(--adm-text)]">{area.title}</span>
          <span className="mt-1 block text-xs text-[var(--adm-text-muted)]">
            {[
              area.domainLabel,
              area.subjectLabel || complianceScopeLabels[area.scopeType || ""] || "Nem azonosított hatókör",
              `Értékelve: ${formatDate(area.evaluationAt)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className={`shrink-0 rounded border px-2 py-1 text-xs ${complianceOutcomeClass[outcome] || ""}`}>
          {complianceOutcomeLabels[outcome] || area.outcome}
        </span>
      </button>
      {open ? (
        <div className="mt-3 space-y-3 border-t border-[var(--adm-border)] pt-3 text-sm">
          {sourceSupportLabels[area.sourceSupportState] ? (
            <p className="text-xs text-[var(--adm-text-muted)]">Forrástámogatás: {sourceSupportLabels[area.sourceSupportState]}</p>
          ) : null}
          {area.usedFacts.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Értékeléshez használt adatok</p>
              <ul className="mt-1 space-y-1">
                {area.usedFacts.map((fact) => (
                  <li key={fact.factKey} className="text-xs text-[var(--adm-text)]">
                    {fact.label || "Rögzített vállalati adat"}: <b>{fact.value ?? "—"}</b>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {area.missingFacts.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Hiányzó adatok</p>
              <ul className="mt-1 space-y-1">
                {area.missingFacts.map((fact) => (
                  <li key={fact.factKey} className="text-xs text-[var(--adm-text)]">
                    {fact.label || "További vállalati adat szükséges"}
                    {fact.profileAnswerable ? (
                      <span className="ml-1 text-[var(--adm-text-muted)]">— a meglévő vállalati profil felületen adható meg.</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {citations.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Jogi források</p>
              <ul className="mt-1 space-y-1">
                {citations.map((citation, index) => (
                  <li key={index} className="text-xs text-[var(--adm-text)]">
                    <b>{citation.canonicalCitation || citation.sourceTitle || "Jogi forrás"}</b>
                    {citation.sourceTitle && citation.canonicalCitation ? ` — ${citation.sourceTitle}` : null}
                    {locatorText(citation) ? <span className="text-[var(--adm-text-muted)]"> · {locatorText(citation)}</span> : null}
                    <span className="ml-1 text-[var(--adm-text-muted)]">({citationRoleLabels[citation.supportRole] || citation.supportRole})</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {area.activeFindingId ? (
            <p className="text-xs text-[var(--adm-text-muted)]">Ehhez a területhez aktív megállapítás tartozik — lásd lentebb.</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export default function ClientCompliancePage() {
  const params = useParams();
  const clientId = String(params?.clientId || "");
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState(false);
  const [organizationMode, setOrganizationMode] = useState(false);
  const [complianceFindings, setComplianceFindings] = useState<ComplianceFindingView[]>([]);
  const [complianceError, setComplianceError] = useState<string | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(true);
  const [workspace, setWorkspace] = useState<ComplianceWorkspace | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    void Promise.all([getClient(clientId), listAdminWorkspaces(clientId).catch(() => ({ items: [] }))]).then(([clientResult, workspaces]) => {
      setClient(clientResult);
      setOrganizationMode(
        workspaces.items.some(
          (item) =>
            item.status !== "ARCHIVED" &&
            (item.mode === "ORGANIZATION" || item.mode === "CASE_RELAY")
        )
      );
    }).catch(() => setError(true));
  }, [clientId]);

  const loadCompliance = useCallback(async () => {
    setComplianceLoading(true);
    setComplianceError(null);
    try { setComplianceFindings((await complianceOverviewApi.getOverview(clientId)).findings); }
    catch { setComplianceError("A compliance áttekintés jelenleg nem tölthető be."); }
    finally { setComplianceLoading(false); }
  }, [clientId]);

  const loadWorkspace = useCallback(async () => {
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    try { setWorkspace(await complianceWorkspaceApi.getWorkspace(clientId)); }
    catch { setWorkspaceError("A compliance munkaterület adatai jelenleg nem tölthetők be."); }
    finally { setWorkspaceLoading(false); }
  }, [clientId]);

  useEffect(() => { void loadCompliance(); }, [loadCompliance]);
  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  const handleReconcile = useCallback(async () => {
    if (reconciling) return;
    setReconciling(true);
    setReconcileError(null);
    try {
      await complianceWorkspaceApi.reconcile(clientId);
      await Promise.all([loadWorkspace(), loadCompliance()]);
    } catch {
      setReconcileError("Az értékelés indítása jelenleg nem sikerült.");
    } finally {
      setReconciling(false);
    }
  }, [clientId, reconciling, loadWorkspace, loadCompliance]);

  const missingInformation = useMemo(() => {
    if (!workspace) return [] as Array<{ factKey: string; label: string | null; profileAnswerable: boolean; genericOnly: boolean }>;
    const seen = new Map<string, { factKey: string; label: string | null; profileAnswerable: boolean; genericOnly: boolean }>();
    for (const area of workspace.areas) {
      for (const fact of area.missingFacts) {
        if (!seen.has(fact.factKey)) seen.set(fact.factKey, { ...fact, genericOnly: false });
      }
      if (area.outcome === "INSUFFICIENT_FACTS" && !area.missingFacts.length) {
        const key = `generic:${area.applicabilityId}`;
        if (!seen.has(key)) seen.set(key, { factKey: key, label: area.title, profileAnswerable: false, genericOnly: true });
      }
    }
    return [...seen.values()];
  }, [workspace]);

  return (
    <AuthenticatedApp section="clients">
      <div className="flex-1 min-h-0 overflow-y-auto adm-board-page">
        <div className="adm-board-container space-y-5">
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">Az ügyfél nem található vagy nincs hozzáférése.</div> : null}
          {client ? (
            <>
              {organizationMode ? (
                <>
                  <header className="rounded-[var(--adm-radius-md)] border border-[#DCCCA6] bg-[var(--adm-sand-100)] p-5">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Compliance</p>
                    <h1 className="mt-1 font-serif text-2xl text-[var(--adm-text)]">{client.name}</h1>
                    <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
                      A szervezet releváns megfelelőségi területei, megállapításai és a következő jogi lépések.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <Link href={`/clients/${encodeURIComponent(clientId)}`} className="text-xs text-[var(--adm-ochre-500)] hover:underline">
                        ← Ügyfél áttekintés
                      </Link>
                      <Link href={`/clients/${encodeURIComponent(clientId)}/vallalati-mukodes`} className="text-xs text-[var(--adm-ochre-500)] hover:underline">
                        Vállalati működés →
                      </Link>
                    </div>
                  </header>
                  <ClientWorkspaceTabs clientId={client.id} active="compliance" organizationMode={organizationMode} />

                  {/* 1. Állapotkép */}
                  <Section title="Állapotkép">
                    {workspaceLoading ? <p className="text-sm text-[var(--adm-text-muted)]">Értékelési állapot betöltése…</p> : null}
                    {!workspaceLoading && workspaceError ? (
                      <div role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                        {workspaceError}
                        <button type="button" onClick={() => { void loadWorkspace(); }} className="ml-3 rounded border border-[var(--adm-border)] bg-white px-3 py-1 text-xs text-[var(--adm-text)]">Újrapróbálás</button>
                      </div>
                    ) : null}
                    {!workspaceLoading && !workspaceError && workspace ? (
                      <>
                        {workspace.summary.enrollment === "NOT_ENROLLED" ? (
                          <p className="mb-3 rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 text-sm text-[var(--adm-text-muted)]">
                            Az ügyfél jelenleg nincs bekapcsolva a megfelelőségi értékelésbe.
                          </p>
                        ) : null}
                        {workspace.summary.enrollment === "ENROLLED" ? (
                          <div className="mb-3">
                            <button
                              type="button"
                              disabled={reconciling}
                              onClick={() => { void handleReconcile(); }}
                              className="rounded border border-[var(--adm-green-800)] bg-white px-3 py-2 text-xs font-medium text-[var(--adm-green-800)] disabled:opacity-60"
                            >
                              {reconciling
                                ? "Értékelés folyamatban…"
                                : workspace.summary.evaluatedCount === 0
                                  ? "Első megfelelőségi értékelés indítása"
                                  : "Értékelés frissítése"}
                            </button>
                            {reconcileError ? (
                              <span role="alert" className="ml-3 text-xs text-red-800">{reconcileError}</span>
                            ) : null}
                          </div>
                        ) : null}
                        {workspace.summary.evaluatedCount === 0 ? (
                          <div className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
                            <p className="text-sm text-[var(--adm-text)]">Ehhez az ügyfélhez még nem készült megfelelőségi értékelés.</p>
                            <p className="mt-1 text-xs text-[var(--adm-text-muted)]">A vállalati profilban rögzített adatok alapján a rendszer automatikusan értékeli a releváns követelményeket.</p>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2 text-xs text-[var(--adm-text)]">
                              Értékelt terület: <b>{workspace.summary.evaluatedCount}</b>
                            </span>
                            {outcomeKeys.map((key) => {
                              const count = Number(workspace.summary[summaryCountKey[key]] || 0);
                              if (!count) return null;
                              return (
                                <span key={key} className={`rounded border px-3 py-2 text-xs ${complianceOutcomeClass[key]}`}>
                                  {complianceOutcomeLabels[key]}: <b>{count}</b>
                                </span>
                              );
                            })}
                            <span className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2 text-xs text-[var(--adm-text)]">
                              Nyitott megállapítás: <b>{workspace.summary.openFindings}</b>
                            </span>
                            <span className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2 text-xs text-[var(--adm-text)]">
                              Javaslat alatt: <b>{workspace.summary.openProposals}</b>
                            </span>
                          </div>
                        )}
                        {workspace.evaluatedAt ? (
                          <p className="mt-2 text-xs text-[var(--adm-text-muted)]">Utolsó értékelés: {formatDate(workspace.evaluatedAt)}</p>
                        ) : null}
                      </>
                    ) : null}
                  </Section>

                  {/* 2. Megfelelőségi területek */}
                  {!workspaceLoading && !workspaceError && workspace && workspace.areas.length ? (
                    <Section title="Megfelelőségi területek">
                      <ul className="space-y-2">
                        {workspace.areas.map((area) => <WorkspaceAreaRow key={area.applicabilityId} area={area} />)}
                      </ul>
                    </Section>
                  ) : null}

                  {/* 3. Tisztázandó / hiányzó információ */}
                  {!workspaceLoading && !workspaceError && missingInformation.length ? (
                    <Section title="Tisztázandó / hiányzó információ">
                      <ul className="space-y-2">
                        {missingInformation.map((item) => (
                          <li key={item.factKey} className="rounded border border-[#DCCCA6] bg-[#FFF9E9] p-3 text-sm text-[#735D16]">
                            {item.genericOnly
                              ? `${item.label}: a követelmény értékeléséhez további adat szükséges.`
                              : `${item.label || "További vállalati adat"}: az értékeléshez hiányzik.`}
                            {!item.genericOnly && item.profileAnswerable ? (
                              <span className="ml-1 text-xs">A vállalati profil meglévő kérdés-felületén adható meg.</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </Section>
                  ) : null}

                  {/* 4. Megállapítások */}
                  <ComplianceOverviewPanel
                    title="Megállapítások"
                    findings={complianceFindings}
                    loading={complianceLoading}
                    error={complianceError}
                    onRetry={() => { void loadCompliance(); }}
                  />

                  {/* 5. Javasolt műveletek */}
                  <ComplianceProposalPanel clientId={client.id} findings={complianceFindings} />
                </>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Ez a compliance felület csak szervezeti ügyfélmódban érhető el.</div>
              )}
            </>
          ) : !error ? <div className="adm-board-panel p-5 text-sm text-[var(--adm-text-muted)]">Ügyfél betöltése…</div> : null}
        </div>
      </div>
    </AuthenticatedApp>
  );
}
