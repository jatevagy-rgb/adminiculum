"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { ClientWorkspaceTabs } from "@/components/clients/ClientWorkspaceTabs";
import {
  ComplianceOverviewPanel,
  ComplianceControlsSection,
  ComplianceProposalPanel,
  complianceOutcomeClass,
  complianceOutcomeLabels,
  complianceScopeLabels,
} from "@/components/clients/compliance/ComplianceOverview";
import type { ComplianceFindingView, ComplianceApplicabilityStatus, ComplianceControlsState } from "@/components/clients/compliance/ComplianceOverview";
import { ComplianceDocumentsSection } from "@/components/clients/compliance/ComplianceDocumentsSection";
import { complianceOverviewApi } from "@/lib/complianceOverviewApi";
import { complianceWorkspaceApi, type ComplianceWorkspace, type ComplianceWorkspaceArea } from "@/lib/complianceWorkspaceApi";
import { getClient, getCases, type Client, type CaseListItem } from "@/lib/api";
import { listAdminWorkspaces } from "@/lib/clientPortalAdminApi";
import { ClientRequestComposer } from "@/components/client-portal/ClientRequestComposer";
import { SafePanelError } from "@/components/adminiculum/OperationalPrimitives";
import { useRouteGeneration } from "@/lib/routeGeneration";

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

function WorkspaceAreaRow({ area, cases, clients }: { area: ComplianceWorkspaceArea; cases: CaseListItem[]; clients: Client[] }) {
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
          {area.normativeStatement ? (
            <div className="mt-2 rounded border border-[var(--adm-border)] bg-[var(--adm-surface-subtle)] p-2 text-xs">
              <p className="font-semibold text-[var(--adm-text)]">Előírt követelmény:</p>
              <p className="text-[var(--adm-text-muted)]">{area.normativeStatement}</p>
            </div>
          ) : null}
          {sourceSupportLabels[area.sourceSupportState] ? (
            <p className="text-xs text-[var(--adm-text-muted)]">Forrástámogatás: {sourceSupportLabels[area.sourceSupportState]}</p>
          ) : null}
          {area.requirementVersionKey || area.ruleVersionKey ? (
            <p className="text-xs text-[var(--adm-text-muted)]">
              {area.requirementVersionKey ? `Követelményverzió: ${area.requirementVersionKey}` : null}
              {area.requirementVersionKey && area.ruleVersionKey ? " · " : null}
              {area.ruleVersionKey ? `Értékelő szabályverzió: ${area.ruleVersionKey}` : null}
            </p>
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
          <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--adm-border)] pt-3">
            <ClientRequestComposer
              cases={cases}
              clients={clients}
              complianceContext={{ requirementVersionId: area.requirementVersionId }}
              complianceContextLabel={area.title}
              defaultType="QUESTION_RESPONSE"
              triggerLabel="Kérdés az ügyfélnek"
              triggerVariant="neutral"
            />
            <ClientRequestComposer
              cases={cases}
              clients={clients}
              complianceContext={{ requirementVersionId: area.requirementVersionId }}
              complianceContextLabel={area.title}
              defaultType="MISSING_DOCUMENT_REQUEST"
              triggerLabel="Dokumentum bekérése"
              triggerVariant="neutral"
            />
          </div>
        </div>
      ) : null}
    </li>
  );
}

type ComplianceView = "status" | "requirements" | "documents" | "controls" | "findings";

const complianceViewLabels: Record<ComplianceView, string> = {
  status: "Állapotkép",
  requirements: "Követelmények",
  documents: "Dokumentumok",
  controls: "Bizonyítékok és kontrollok",
  findings: "Megállapítások és intézkedések",
};

export default function ClientCompliancePage() {
  const params = useParams();
  const clientId = String(params?.clientId || "");
  const route = useRouteGeneration(clientId);
  const [client, setClient] = useState<Client | null>(null);
  const [loadedClientId, setLoadedClientId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [modeError, setModeError] = useState(false);
  const [organizationMode, setOrganizationMode] = useState(false);
  const [view, setView] = useState<ComplianceView>("status");
  const [clientCases, setClientCases] = useState<CaseListItem[]>([]);
  const [complianceFindings, setComplianceFindings] = useState<ComplianceFindingView[]>([]);
  const [complianceError, setComplianceError] = useState<string | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(true);
  const [controlsState, setControlsState] = useState<ComplianceControlsState>({ status: "loading" });
  const [workspace, setWorkspace] = useState<ComplianceWorkspace | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    const generation = route.generation;
    // Never let the previous client's identity/mode/cases survive into the new route.
    setError(false);
    setModeError(false);
    setOrganizationMode(false);
    setClientCases([]);
    void (async () => {
      let clientResult: Client;
      try {
        clientResult = await getClient(clientId);
      } catch {
        if (route.isActive(generation)) setError(true);
        return;
      }
      if (!route.isActive(generation)) return;
      setClient(clientResult);
      setLoadedClientId(clientId);

      // Related cases for the compliance workspace composer. A failure here is
      // scoped to the composer and must not fail the whole client identity.
      try {
        const casesPage = await getCases(1, 100, undefined, clientId);
        if (route.isActive(generation)) setClientCases(casesPage.data ?? []);
      } catch {
        if (route.isActive(generation)) setClientCases([]);
      }

      // An organization-mode lookup failure is not a business state: surface it
      // truthfully instead of rendering the "not organization mode" gate.
      try {
        const workspaces = await listAdminWorkspaces(clientId);
        if (!route.isActive(generation)) return;
        setOrganizationMode(
          workspaces.items.some(
            (item) =>
              item.status !== "ARCHIVED" &&
              (item.mode === "ORGANIZATION" || item.mode === "CASE_RELAY")
          )
        );
      } catch {
        if (route.isActive(generation)) setModeError(true);
      }
    })();
  }, [clientId, route]);

  const loadCompliance = useCallback(async () => {
    const generation = route.generation;
    setComplianceLoading(true);
    setComplianceError(null);
    setControlsState({ status: "loading" });
    try {
      const [overviewResult, controlsResult] = await Promise.allSettled([
        complianceOverviewApi.getOverview(clientId),
        complianceOverviewApi.getControls(clientId),
      ]);
      if (!route.isActive(generation)) return;
      if (overviewResult.status === "fulfilled") {
        setComplianceFindings(overviewResult.value.findings);
      } else {
        setComplianceError("A compliance áttekintés jelenleg nem tölthető be.");
      }
      if (controlsResult.status === "fulfilled") {
        setControlsState({ status: "success", summary: controlsResult.value });
      } else {
        setControlsState({ status: "error", message: "Az intézkedések és bizonyítékok jelenleg nem tölthetők be." });
      }
    } finally {
      if (route.isActive(generation)) setComplianceLoading(false);
    }
  }, [clientId, route]);

  const loadWorkspace = useCallback(async () => {
    const generation = route.generation;
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    try {
      const workspaceResult = await complianceWorkspaceApi.getWorkspace(clientId);
      if (!route.isActive(generation)) return;
      setWorkspace(workspaceResult);
    } catch {
      if (route.isActive(generation)) setWorkspaceError("A compliance munkaterület adatai jelenleg nem tölthetők be.");
    } finally {
      if (route.isActive(generation)) setWorkspaceLoading(false);
    }
  }, [clientId, route]);

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

  const requirementOptions = useMemo(() => {
    if (!workspace) return [] as Array<{ key: string; title: string }>;
    const seen = new Map<string, string>();
    for (const area of workspace.areas) {
      if (area.requirementKey && !seen.has(area.requirementKey)) seen.set(area.requirementKey, area.title);
    }
    return [...seen.entries()].map(([key, title]) => ({ key, title }));
  }, [workspace]);

  const attentionFindings = useMemo(
    () => complianceFindings.filter((finding) => finding.applicabilityStatus !== "DOES_NOT_APPLY"),
    [complianceFindings],
  );

  const tabClass = (active: boolean) =>
    `rounded-[var(--adm-radius-sm)] px-3 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)] ${
      active ? "bg-[var(--adm-green-800)] text-white" : "text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]"
    }`;

  return (
    <AuthenticatedApp section="clients">
      <div className="flex-1 min-h-0 overflow-y-auto adm-board-page">
        <div className="adm-board-container space-y-5">
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">Az ügyfél nem található vagy nincs hozzáférése.</div> : null}
          {client && loadedClientId === clientId ? (
            <>
              {modeError ? (
                <SafePanelError detail="A szervezeti ügyfélmód ellenőrzése jelenleg nem elérhető. Ez nem jelenti azt, hogy az ügyfél nem szervezeti módú." />
              ) : organizationMode ? (
                <>
                  {/* Client-level shell first, then the module hero, matching Company OS / Grow. */}
                  <ClientWorkspaceTabs clientId={client.id} active="compliance" organizationMode={organizationMode} />
                  <header className="rounded-3xl border border-[#DCCCA6] bg-[#fbf9f4] p-5 sm:p-6 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#014337]">Megfelelés</p>
                        <h1 className="mt-1 font-serif text-2xl font-semibold text-stone-950 sm:text-3xl">{client.name}</h1>
                        <p className="mt-1 text-xs text-stone-600 sm:text-sm">
                          A szervezet releváns megfelelőségi területei, megállapításai és a következő jogi lépések.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/clients/${encodeURIComponent(clientId)}`}
                          className="inline-flex items-center rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-xs hover:bg-stone-50"
                        >
                          ← Ügyfél áttekintés
                        </Link>
                        <Link
                          href={`/clients/${encodeURIComponent(clientId)}/vallalati-mukodes`}
                          className="inline-flex items-center rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-xs hover:bg-stone-50"
                        >
                          Vállalati működés →
                        </Link>
                        <button
                          type="button"
                          disabled={reconciling}
                          onClick={() => { void handleReconcile(); }}
                          className="inline-flex items-center rounded-xl border border-[var(--adm-green-800)] bg-[var(--adm-green-800)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--adm-green-900)] disabled:opacity-60"
                        >
                          {reconciling
                            ? "Értékelés folyamatban…"
                            : workspace?.summary.enrollment === "ENROLLED"
                              ? "Értékelés frissítése"
                              : "Első megfelelőségi értékelés indítása"}
                        </button>
                        <ClientRequestComposer cases={clientCases} clients={client ? [client] : []} triggerVariant="neutral" />
                      </div>
                    </div>
                  </header>

                  {/* Professional state-first workspace: peer tabs, not one endless scroll. */}
                  <div className="flex flex-wrap items-center gap-1 rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-1" role="tablist" aria-label="Megfelelési nézetek">
                    {(Object.keys(complianceViewLabels) as ComplianceView[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={view === key}
                        className={tabClass(view === key)}
                        onClick={() => setView(key)}
                      >
                        {complianceViewLabels[key]}
                      </button>
                    ))}
                  </div>

                  {view === "status" ? (
                    <>
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

                      <Section title="Megállapítások">
                        <ComplianceOverviewPanel
                          title="Megállapítások"
                          findings={attentionFindings}
                          loading={complianceLoading}
                          error={complianceError}
                          onRetry={() => { void loadCompliance(); }}
                        />
                      </Section>
                    </>
                  ) : null}

                  {view === "requirements" ? (
                    !workspaceLoading && !workspaceError && workspace && workspace.areas.length ? (
                      <Section title="Megfelelőségi területek">
                        <ul className="space-y-2">
                          {workspace.areas.map((area) => <WorkspaceAreaRow key={area.applicabilityId} area={area} cases={clientCases} clients={client ? [client] : []} />)}
                        </ul>
                      </Section>
                    ) : (
                      <Section title="Megfelelőségi területek">
                        {workspaceLoading ? <p className="text-sm text-[var(--adm-text-muted)]">Megfelelőségi területek betöltése…</p> : null}
                        {!workspaceLoading && workspaceError ? <p role="alert" className="text-sm text-red-800">{workspaceError}</p> : null}
                        {!workspaceLoading && !workspaceError && (!workspace || !workspace.areas.length) ? (
                          <p className="text-sm text-[var(--adm-text-muted)]">Még nincs rögzített megfelelőségi terület.</p>
                        ) : null}
                      </Section>
                    )
                  ) : null}

                  {view === "documents" ? (
                    <Section title="Compliance dokumentumok">
                      <ComplianceDocumentsSection clientId={client.id} requirements={requirementOptions} />
                    </Section>
                  ) : null}

                  {view === "controls" ? (
                    <ComplianceControlsSection state={controlsState} onRetry={() => { void loadCompliance(); }} clientId={clientId} onChanged={() => { void loadCompliance(); }} />
                  ) : null}

                  {view === "findings" ? (
                    <>
                      <ComplianceOverviewPanel
                        title="Megállapítások"
                        findings={complianceFindings}
                        loading={complianceLoading}
                        error={complianceError}
                        onRetry={() => { void loadCompliance(); }}
                      />
                      <ComplianceProposalPanel clientId={client.id} findings={complianceFindings} />
                    </>
                  ) : null}
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
