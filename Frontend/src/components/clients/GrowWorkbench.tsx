"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { GrowAssessmentSummaries } from './GrowAssessmentSummaries';
import {
  AdminButton,
  AdminPanel,
  AdminSectionHeader,
  AdminStatusPill,
} from "@/components/adminiculum/ui";
import {
  CompactState,
  OperationalPageHeader,
  SafePanelError,
} from "@/components/adminiculum/OperationalPrimitives";
import { GrowDiagnosticWorkbench } from "@/components/clients/diagnostic-workbench/GrowDiagnosticWorkbench";
import { GrowIntake } from "@/components/clients/GrowIntake";
import { GrowOutcomeComparison } from "@/components/clients/GrowOutcomeComparison";
import {
  domainTitleHu,
  evidenceStrengthLabelHu,
  evidenceOriginLabelHu,
  growApi,
  interventionLabelHu,
  outcomeBasisLabelHu,
  sourceBasisLabelHu,
  reviewDecisionLabelHu,
  sufficiencyLabelHu,
  type BusinessProcessDTO,
  type GrowEvidenceItem,
  type GrowOpportunityItem,
  type OutcomeMeasurementDTO,
  type ProcessObservationSnapshotDTO,
  type SufficiencyDecision,
} from "@/lib/growApi";
import {
  clientCompanyApi,
  companyMilestoneStatusLabel,
  initiativeStatusLabel,
  type CompanyMilestone,
  type DevelopmentInitiative,
} from "@/lib/clientCompanyApi";
import { readWorkbenchPanel, workbenchReadFailure, workbenchReadSucceeded, type WorkbenchReadState } from "./growWorkbenchState";
import {
  diagnosisStatusLabelHu,
  externalSourceStatusLabelHu,
  growthUnresolvedItemLabel,
  operatingProfileStatusLabelHu,
  getDiagnosticWorkbench,
} from "@/lib/diagnosticWorkbenchApi";

const INITIAL_READ_STATES = {
  opportunities: "LOADING", evidence: "LOADING", outcomes: "LOADING",
  processes: "LOADING", initiatives: "LOADING", milestones: "LOADING",
  profile: "LOADING", diagnostics: "LOADING", sources: "LOADING",
} satisfies Record<string, WorkbenchReadState>;
type ReadStates = Record<keyof typeof INITIAL_READ_STATES, WorkbenchReadState>;

function ReadPanel({ state, label, onRetry, children }: { state: WorkbenchReadState; label: string; onRetry?: () => void; children?: ReactNode }) {
  if (workbenchReadSucceeded(state)) return <>{children}</>;
  const detail = state === "LOADING" ? "Betöltés folyamatban." : state === "UNAUTHORIZED" ? "Nincs jogosultsága az adatok megtekintéséhez." : state === "UNAVAILABLE" ? "Az adatforrás jelenleg nem érhető el." : "Az adatok betöltése sikertelen.";
  return <div data-read-state={state} aria-label={label}>{state === "LOADING" ? <CompactState title={label} detail={detail} /> : <SafePanelError detail={`${label}: ${detail}`} onRetry={onRetry} />}</div>;
}

// In-flight reads and mutations may finish after a context switch or unmount.
function useCurrentContext(context: string) {
  const scope = useMemo(() => ({ context }), [context]);
  const committed = useRef<typeof scope | null>(null);
  useLayoutEffect(() => {
    committed.current = scope;
    return () => { committed.current = null; };
  }, [scope]);
  return useCallback(() => committed.current === scope, [scope]);
}

export type GrowWorkbenchTab =
  | "attekintes"
  | "diagnosztika"
  | "bizonyitekok"
  | "dontesek"
  | "kezdemenyezesek"
  | "eredmenyek"
  | "adatforrasok";

export const GROW_TABS: Array<{ id: GrowWorkbenchTab; label: string }> = [
  { id: "attekintes", label: "Áttekintés" },
  { id: "diagnosztika", label: "Diagnosztika" },
  { id: "bizonyitekok", label: "Bizonyítékok" },
  { id: "dontesek", label: "Döntések" },
  { id: "kezdemenyezesek", label: "Kezdeményezések" },
  { id: "eredmenyek", label: "Eredmények" },
  { id: "adatforrasok", label: "Adatforrások" },
];

const DIAGNOSIS_STATUS_LABELS: Record<string, { label: string; tone: "green" | "amber" | "burgundy" | "neutral" }> = {
  OPEN: { label: "Nyitott", tone: "neutral" },
  CONFIRMED: { label: "Megerősítve", tone: "green" },
  REJECTED: { label: "Elutasítva", tone: "burgundy" },
  NEEDS_MORE_DATA: { label: "Több adat kell", tone: "amber" },
};

const sufficiencyTone: Record<SufficiencyDecision, "green" | "amber" | "burgundy" | "blue" | "neutral"> = {
  SUPPORTED: "green",
  NEEDS_MORE_DATA: "amber",
  INSUFFICIENT_EVIDENCE: "neutral",
  CONFLICTING_EVIDENCE: "burgundy",
  OUT_OF_SCOPE: "neutral",
  HUMAN_DOMAIN_REVIEW: "blue",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("hu-HU");
}

/** Recorded snapshot timestamp, never synthesized. */
function formatObservedAt(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("hu-HU");
}

function diagnosisStatusPill(status: string): { label: string; tone: "green" | "amber" | "burgundy" | "neutral" } {
  const tone = DIAGNOSIS_STATUS_LABELS[status]?.tone ?? "neutral";
  return { label: diagnosisStatusLabelHu(status), tone };
}

/**
 * Operational workforce Grow workbench. This is the primary decision-first
 * surface, not a questionnaire journey. Every count, status and date comes from
 * the canonical backend read models already exposed through `growApi`,
 * `clientCompanyApi` and the diagnostic workbench DTO.
 */
type GrowWorkbenchProps = {
  clientId: string;
  clientName: string;
  activeTab: GrowWorkbenchTab;
  requestedOpportunityId?: string | null;
  canManage?: boolean;
  canPublish?: boolean;
};

export function GrowWorkbench(props: GrowWorkbenchProps) {
  return <GrowWorkbenchContent key={`${props.clientId}:${Boolean(props.canManage)}:${Boolean(props.canPublish)}`} {...props} />;
}

function GrowWorkbenchContent({
  clientId,
  clientName,
  activeTab,
  requestedOpportunityId = null,
  canManage = false,
  canPublish = false,
}: GrowWorkbenchProps) {
  const [opportunities, setOpportunities] = useState<GrowOpportunityItem[]>([]);
  const [evidence, setEvidence] = useState<GrowEvidenceItem[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeMeasurementDTO[]>([]);
  const [processes, setProcesses] = useState<BusinessProcessDTO[]>([]);
  const [initiatives, setInitiatives] = useState<DevelopmentInitiative[]>([]);
  const [milestones, setMilestones] = useState<CompanyMilestone[]>([]);
  const [readStates, setReadStates] = useState<ReadStates>(INITIAL_READ_STATES);
  const opportunitiesLoadFailed = !workbenchReadSucceeded(readStates.opportunities);
  const [profileState, setProfileState] = useState<{
    status: string | null;
    summary: string | null;
    lastReviewedAt: string | null;
    nextReviewAt: string | null;
  } | null>(null);
  const [diagnoses, setDiagnoses] = useState<
    Array<{
      id: string;
      title: string;
      summary: string | null;
      status: string;
      problemDomain: { id: string; key: string; name: string } | null;
      businessProcess: { id: string; name: string } | null;
      evidence: Array<{ id: string; title: string; verificationStatus: string; strength: string }>;
    }>
  >([]);
  const [recommendations, setRecommendations] = useState<
    Array<{
      id: string;
      title: string;
      direction: string;
      status: string;
      sufficiency: string;
      diagnosisId: string | null;
      domain: { key: string; name: string } | null;
      businessProcess: { id: string; name: string } | null;
    }>
  >([]);
  const [missingItems, setMissingItems] = useState<Array<{ code: string; message: string }>>([]);
  const [sources, setSources] = useState<Array<{ id: string; sourceType: string; name: string; status: string; createdAt: string }>>([]);

  const loadGeneration = useRef(0);
  const isCurrentContext = useCurrentContext(clientId);
  const load = useCallback(async () => {
    // A completed mutation from a previous client cannot start a fresh old-client read.
    if (!isCurrentContext()) return;
    const generation = ++loadGeneration.current;
    const isCurrent = () => isCurrentContext() && generation === loadGeneration.current;
    const panel = <T,>(key: keyof ReadStates, read: () => Promise<T>, empty: (value: T) => boolean, receive: (value: T) => void) =>
      readWorkbenchPanel(read, empty, isCurrent, receive, (state) => setReadStates((previous) => ({ ...previous, [key]: state })));
    await Promise.all([
      panel("opportunities", () => growApi.listOpportunities(clientId), (res) => !res.items.length, (res) => setOpportunities(res.items)),
      panel("evidence", () => growApi.listEvidence(clientId), (res) => !res.items.length, (res) => setEvidence(res.items)),
      panel("outcomes", () => growApi.listOutcomes(clientId), (res) => !res.items.length, (res) => setOutcomes(res.items)),
      panel("processes", () => growApi.listProcesses(clientId), (res) => !res.length, setProcesses),
      panel("initiatives", () => clientCompanyApi.listInitiatives(clientId), (res) => !res.items.length, (res) => setInitiatives(res.items)),
      panel("milestones", () => clientCompanyApi.listMilestones(clientId), (res) => !res.items.length, (res) => setMilestones(res.items)),
      panel("profile", () => clientCompanyApi.getProfile(clientId), (res) => !res, setProfileState),
      panel("diagnostics", () => getDiagnosticWorkbench(clientId), (wb) => !wb.problems.diagnoses.length && !wb.proposed.recommendations.length && !wb.missing.unresolvedItems.length, (wb) => {
        setDiagnoses(wb.problems.diagnoses);
        setRecommendations(wb.proposed.recommendations);
        setMissingItems(wb.missing.unresolvedItems);
      }),
      panel("sources", () => growApi.listSources(clientId), (res) => !res.items.length, (res) => setSources(res.items)),
    ]);
  }, [clientId, isCurrentContext]);

  useEffect(() => {
    void load();
    return () => { ++loadGeneration.current; };
  }, [load]);

  return (
    <div className="space-y-5" data-testid="grow-workbench">
      <nav aria-label="Részletes Grow munkafolyamat" className="flex flex-wrap gap-4 text-sm underline">
        {canManage ? <Link href={`/clients/${clientId}/grow?view=journey&destination=home`}>Kutatás előkészítése</Link> : null}
        <Link href={`/clients/${clientId}/grow?view=journey&destination=${activeTab === "kezdemenyezesek" ? "progress" : activeTab === "eredmenyek" ? "results" : "feed"}`}>Részletes munkafolyamat</Link>
        {canPublish ? <Link href={`/clients/${clientId}/grow?view=journey&destination=feed`}>Ügyfélközlés előkészítése</Link> : null}
      </nav>
      {activeTab === "attekintes" ? (
        <GrowOverviewTab
          clientId={clientId}
          clientName={clientName}
          profileState={profileState}
          opportunities={opportunities}
          initiatives={initiatives}
          milestones={milestones}
          outcomes={outcomes}
          diagnoses={diagnoses}
          recommendations={recommendations}
          missingItems={missingItems}
          evidence={evidence}
          canRunResearch={canManage}
          opportunitiesLoadFailed={opportunitiesLoadFailed}
          readStates={readStates}
          onRetry={() => void load()}
        />
      ) : null}

      {activeTab === "diagnosztika" ? <GrowDiagnosticWorkbench clientId={clientId} clientName={clientName} /> : null}

      {activeTab === "bizonyitekok" ? <ReadPanel state={readStates.evidence} label="Bizonyítékok" onRetry={() => void load()}><GrowEvidenceTab evidence={evidence} /></ReadPanel> : null}

      {activeTab === "dontesek" ? (
        <>
        <ReadPanel state={readStates.diagnostics} label="Kapcsolt diagnosztika" onRetry={() => void load()} />
        <GrowDecisionsTab
          key={requestedOpportunityId ?? "all"}
          clientId={clientId}
          opportunities={opportunities}
          recommendations={workbenchReadSucceeded(readStates.diagnostics) ? recommendations : []}
          requestedOpportunityId={requestedOpportunityId}
          opportunitiesLoadFailed={opportunitiesLoadFailed}
          canStartInitiative={canManage}
          canPublish={canPublish}
          readState={readStates.opportunities}
          onRetry={() => void load()}
          onChanged={() => void load()}
        />
        </>
      ) : null}

      {activeTab === "kezdemenyezesek" ? (
        <ReadPanel state={readStates.initiatives} label="Kezdeményezések" onRetry={() => void load()}>
        <GrowInitiativesTab
          clientId={clientId}
          readStates={readStates}
          onRetry={() => void load()}
          initiatives={initiatives}
          milestones={milestones}
          opportunities={opportunities}
          outcomes={outcomes}
        />
        </ReadPanel>
      ) : null}

      {activeTab === "eredmenyek" ? (
        <>
        <ReadPanel state={readStates.processes} label="Folyamatok" onRetry={() => void load()} />
        <ReadPanel state={readStates.outcomes} label="Eredmények" onRetry={() => void load()}>
        <GrowOutcomesTab
          clientId={clientId}
          outcomes={outcomes}
          processes={processes}
          canRecordOutcome={canManage && workbenchReadSucceeded(readStates.processes)}
          onRecorded={() => void load()}
        />
        </ReadPanel>
        </>
      ) : null}

      {activeTab === "adatforrasok" ? (
        <GrowDataSourcesTab clientId={clientId} sources={sources} canManage={canManage} readState={readStates.sources} onSubmitted={() => void load()} />
      ) : null}
    </div>
  );
}

/* ------------------------------- Áttekintés ------------------------------- */

function GrowOverviewTab({
  clientId,
  clientName,
  profileState,
  opportunities,
  initiatives,
  milestones,
  outcomes,
  diagnoses,
  recommendations,
  missingItems,
  evidence,
  canRunResearch,
  opportunitiesLoadFailed,
  readStates,
  onRetry,
}: {
  clientId: string;
  clientName: string;
  profileState: { status: string | null; summary: string | null; lastReviewedAt: string | null; nextReviewAt: string | null } | null;
  opportunities: GrowOpportunityItem[];
  initiatives: DevelopmentInitiative[];
  milestones: CompanyMilestone[];
  outcomes: OutcomeMeasurementDTO[];
  diagnoses: Array<{ id: string; title: string; summary: string | null; status: string; problemDomain: { id: string; key: string; name: string } | null; businessProcess: { id: string; name: string } | null; evidence: Array<{ id: string; title: string; verificationStatus: string; strength: string }> }>;
  recommendations: Array<{ id: string; title: string; direction: string; status: string; sufficiency: string; diagnosisId: string | null; domain: { key: string; name: string } | null; businessProcess: { id: string; name: string } | null }>;
  missingItems: Array<{ code: string; message: string }>;
  evidence: GrowEvidenceItem[];
  canRunResearch: boolean;
  opportunitiesLoadFailed: boolean;
  readStates: ReadStates;
  onRetry: () => void;
}) {
  const pendingReview = opportunities.filter((o) => o.status === "PENDING_REVIEW");
  const needsMoreDataDiagnoses = diagnoses.filter((d) => d.status === "NEEDS_MORE_DATA").length;
  const openDiagnoses = diagnoses.filter((d) => d.status === "OPEN" || d.status === "CONFIRMED").length;
  // Summary-strip metric follows the audit query: active = status=ACTIVE only.
  const activeInitiativesCount = initiatives.filter((i) => i.status === "ACTIVE").length;
  // The execution table below lists in-flight work (planned/active/on-hold) with
  // its explicit status, so the strip and the table do not conflate semantics.
  const inFlightInitiatives = initiatives.filter((i) => ["PLANNED", "ACTIVE", "ON_HOLD"].includes(i.status));
  const nextMilestone = [...milestones]
    .filter((m) => m.status === "PLANNED" && (m.targetDate || m.milestoneDate))
    .sort((a, b) => (a.targetDate ?? a.milestoneDate ?? "").localeCompare(b.targetDate ?? b.milestoneDate ?? ""))[0];
  const achievedOutcomes = outcomes.filter((o) => o.basis !== "ASSUMED");
  const unverifiedEvidence = evidence.filter((e) => e.verificationStatus !== "VERIFIED").length;

  const summaryItems: Array<{ label: string; value: string; tone: "neutral" | "amber" | "green" | "blue" }> = [
    { label: "Nyitott diagnózis", value: workbenchReadSucceeded(readStates.diagnostics) ? String(openDiagnoses) : "—", tone: "neutral" },
    { label: "Több adatot igénylő", value: workbenchReadSucceeded(readStates.diagnostics) ? String(needsMoreDataDiagnoses) : "—", tone: needsMoreDataDiagnoses > 0 ? "amber" : "neutral" },
    { label: "Emberi döntésre vár", value: opportunitiesLoadFailed ? "—" : String(pendingReview.length), tone: pendingReview.length > 0 ? "amber" : "neutral" },
    { label: "Aktív kezdeményezés", value: workbenchReadSucceeded(readStates.initiatives) ? String(activeInitiativesCount) : "—", tone: "green" },
    {
      label: "Következő mérföldkő",
      value: workbenchReadSucceeded(readStates.milestones) && nextMilestone ? formatDate(nextMilestone.targetDate ?? nextMilestone.milestoneDate) : "—",
      tone: "neutral",
    },
    { label: "Rögzített eredmény", value: workbenchReadSucceeded(readStates.outcomes) ? String(achievedOutcomes.length) : "—", tone: "green" },
  ];

  return (
    <div className="space-y-5" data-testid="grow-overview-tab">
      <OperationalPageHeader
        title={clientName}
        subtitle={
          (workbenchReadSucceeded(readStates.profile) && profileState?.summary) ||
          "Működési fejlesztési áttekintés — diagnosztika, döntés és végrehajtás."
        }
        primaryAction={
          <Link href={`/clients/${clientId}/grow?tab=${!opportunitiesLoadFailed && pendingReview.length > 0 ? "dontesek" : "diagnosztika"}`}>
            <AdminButton size="sm" variant="primary">{!opportunitiesLoadFailed && pendingReview.length > 0 ? `Döntések megnyitása (${pendingReview.length})` : "Diagnosztika megnyitása"}</AdminButton>
          </Link>
        }
      />

      <ReadPanel state={readStates.profile} label="Működési profil" onRetry={onRetry}>
      {profileState?.lastReviewedAt || profileState?.status ? (
        <p className="text-[11px] text-[var(--adm-text-muted)]" data-testid="grow-profile-state">
          Működési profil állapota: {profileState.status ? operatingProfileStatusLabelHu(profileState.status) : "nincs beállítva"}
          {profileState.lastReviewedAt ? ` · utolsó felülvizsgálat: ${formatDate(profileState.lastReviewedAt)}` : ""}
          {profileState.nextReviewAt ? ` · következő esedékes: ${formatDate(profileState.nextReviewAt)}` : ""}
        </p>
      ) : null}
      </ReadPanel>

      {/* Summary strip — truthful backend counts, no synthetic maturity score */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="grow-summary-strip">
        {summaryItems.map((item) => (
          <div key={item.label} className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">{item.label}</p>
            <p className="mt-1 text-lg font-semibold leading-none text-[var(--adm-text)]">{item.value}</p>
          </div>
        ))}
      </div>

      <ReadPanel state={readStates.evidence} label="Bizonyítékok" onRetry={onRetry} />
      <ReadPanel state={readStates.milestones} label="Mérföldkövek" onRetry={onRetry} />
      {(workbenchReadSucceeded(readStates.evidence) && unverifiedEvidence > 0) || (workbenchReadSucceeded(readStates.diagnostics) && missingItems.length > 0) ? (
        <CompactState
          title="Hiányzó vagy ellenőrizetlen adat"
          detail={
            [
              workbenchReadSucceeded(readStates.evidence) && unverifiedEvidence > 0 ? `${unverifiedEvidence} nem hitelesített bizonyíték` : null,
              ...(workbenchReadSucceeded(readStates.diagnostics) ? missingItems.map((m) => growthUnresolvedItemLabel(m)) : []),
            ]
              .filter(Boolean)
              .slice(0, 4)
              .join(" · ") || undefined
          }
        />
      ) : null}

      <p className="text-sm text-[var(--adm-text-muted)]">Megfigyelés: amit láttunk · Diagnózis: amit a bizonyíték jelez · Lehetőség: javítható terület · Döntés: emberi jóváhagyás · Kezdeményezés: végrehajtás · Eredmény: mért vagy becsült változás.</p>
      <ReadPanel state={readStates.opportunities} label="Döntések" onRetry={onRetry}><GrowDecisionQueue clientId={clientId} pending={pendingReview} recommendations={workbenchReadSucceeded(readStates.diagnostics) ? recommendations : []} /></ReadPanel>
      <details className="rounded-lg border border-[var(--adm-border)] p-3">
        <summary className="cursor-pointer font-semibold">Diagnosztikai részletek és előzmények</summary>
        <ReadPanel state={readStates.diagnostics} label="Diagnosztika" onRetry={onRetry}><GrowDiagnosticWorklist diagnoses={diagnoses} recommendations={recommendations} opportunities={workbenchReadSucceeded(readStates.opportunities) ? opportunities : []} initiatives={workbenchReadSucceeded(readStates.initiatives) ? initiatives : []} clientId={clientId} /></ReadPanel>
        {canRunResearch ? <Link href={`/clients/${clientId}/grow?view=journey&destination=home`} className="inline-flex min-h-10 items-center text-sm underline">Új kutatási futás előkészítése</Link> : null}
      </details>
      <ReadPanel state={readStates.initiatives} label="Kezdeményezések" onRetry={onRetry}><GrowActiveInitiatives initiatives={inFlightInitiatives} milestones={workbenchReadSucceeded(readStates.milestones) ? milestones : []} /></ReadPanel>
      <ReadPanel state={readStates.outcomes} label="Eredmények" onRetry={onRetry}><GrowRecentResults outcomes={outcomes} /></ReadPanel>
    </div>
  );
}

/* --------------------------- Diagnosztikai munkaasztal ---------------------- */

function GrowDiagnosticWorklist({
  diagnoses,
  recommendations,
  opportunities,
  initiatives,
  clientId,
}: {
  diagnoses: Array<{ id: string; title: string; summary: string | null; status: string; problemDomain: { id: string; key: string; name: string } | null; businessProcess: { id: string; name: string } | null; evidence: Array<{ id: string; title: string; verificationStatus: string; strength: string }> }>;
  recommendations: Array<{ id: string; title: string; direction: string; status: string; sufficiency: string; diagnosisId: string | null; domain: { key: string; name: string } | null; businessProcess: { id: string; name: string } | null }>;
  opportunities: GrowOpportunityItem[];
  initiatives: DevelopmentInitiative[];
  clientId: string;
}) {
  if (diagnoses.length === 0) {
    return (
      <AdminPanel>
        <AdminSectionHeader title="Diagnosztikai munkaasztal" subtitle="Levezetett diagnózisok és a hozzájuk kapcsolt javaslatok." />
        <CompactState
          title="Még nincs rögzített diagnózis."
          detail="Indítson kutatási futást, vagy rögzítsen megfigyelést — a diagnózisok ezután jelennek meg itt."
          action={
            <Link href={`/clients/${clientId}/grow?tab=diagnosztika`}>
              <AdminButton size="sm" variant="neutral">Diagnosztika</AdminButton>
            </Link>
          }
        />
      </AdminPanel>
    );
  }

  return (
    <AdminPanel data-testid="grow-diagnostic-worklist">
      <AdminSectionHeader
        title="Diagnosztikai munkaasztal"
        subtitle="Diagnózis, kapcsolt folyamat, bizonyíték-állapot, emberi döntés és javasolt irány egy munkalistában."
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-[var(--adm-border)] text-[10px] uppercase tracking-[0.1em] text-[var(--adm-text-muted)]">
              <th className="px-4 py-2 font-semibold">Diagnózis</th>
              <th className="px-4 py-2 font-semibold">Folyamat</th>
              <th className="px-4 py-2 font-semibold">Bizonyíték</th>
              <th className="px-4 py-2 font-semibold">Javasolt irány</th>
              <th className="px-4 py-2 font-semibold">Emberi döntés</th>
              <th className="px-4 py-2 font-semibold">Kezdeményezés</th>
              <th className="px-4 py-2 font-semibold">Következő lépés</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--adm-border)]">
            {diagnoses.map((d) => {
              const rec = recommendations.find((r) => r.diagnosisId === d.id);
              // An accepted recommendation's initiative is linked through the
              // canonical opportunity.developmentInitiativeId chain.
              const recOpportunity = opportunities.find((o) => o.id === rec?.id);
              const linkedInitiativeId = recOpportunity?.opportunity?.developmentInitiativeId ?? null;
              const linkedInitiative = linkedInitiativeId
                ? initiatives.find((i) => i.id === linkedInitiativeId) ?? null
                : null;
              const status = diagnosisStatusPill(d.status);
              return (
                <tr key={d.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[var(--adm-text)]">{d.title}</p>
                    <div className="mt-1">
                      <AdminStatusPill tone={status.tone}>{status.label}</AdminStatusPill>
                    </div>
                    {d.problemDomain ? <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{d.problemDomain.name}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-[var(--adm-text-muted)]">{d.businessProcess?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    {rec ? (
                      <AdminStatusPill tone={sufficiencyTone[rec.sufficiency as SufficiencyDecision]}>
                        {sufficiencyLabelHu(rec.sufficiency as SufficiencyDecision)}
                      </AdminStatusPill>
                    ) : (
                      <span className="text-[var(--adm-text-muted)]">—</span>
                    )}
                    <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{d.evidence.length} bizonyíték</p>
                  </td>
                  <td className="px-4 py-3 text-[var(--adm-text)]">{rec ? rec.direction || rec.title : "—"}</td>
                  <td className="px-4 py-3">
                    {rec ? (
                      <AdminStatusPill tone={rec.status === "PENDING_REVIEW" ? "amber" : rec.status === "ACCEPTED" ? "green" : "burgundy"}>
                        {reviewDecisionLabelHu(rec.status)}
                      </AdminStatusPill>
                    ) : (
                      <span className="text-[var(--adm-text-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--adm-text)]">{linkedInitiative ? linkedInitiative.title : "—"}</td>
                  <td className="px-4 py-3">
                    {d.status === "NEEDS_MORE_DATA" ? (
                      <span className="text-[11px] font-semibold text-[var(--adm-terracotta-700)]">Több adat szükséges</span>
                    ) : rec?.status === "PENDING_REVIEW" ? (
                      <Link href={`/clients/${clientId}/grow?tab=dontesek&opportunity=${encodeURIComponent(rec.id)}`} className="text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">
                        Döntés megnyitása →
                      </Link>
                    ) : (
                      <span className="text-[11px] text-[var(--adm-text-muted)]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminPanel>
  );
}

/* ------------------------------- Döntési sor ------------------------------- */

function GrowDecisionQueue({
  clientId,
  pending,
  recommendations,
}: {
  clientId: string;
  pending: GrowOpportunityItem[];
  recommendations: Array<{ id: string; title: string; direction: string; status: string; sufficiency: string; diagnosisId: string | null; domain: { key: string; name: string } | null; businessProcess: { id: string; name: string } | null }>;
}) {
  return (
    <AdminPanel data-testid="grow-decision-queue">
      <AdminSectionHeader
        title="Döntési sor"
        subtitle="Javasolt irány — szakértői döntés szükséges. A rendszer javasol, az ember dönt."
      />
      {pending.length === 0 ? (
        <p className="px-4 py-3 text-[12px] text-[var(--adm-text-muted)]">
          Nincs emberi döntésre váró javaslat.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--adm-border)]">
          {pending.map((o) => {
            const rec = recommendations.find((r) => r.id === o.id);
            return (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[var(--adm-text)]">{o.title}</p>
                  <OpportunityOrigin item={o} />
                  <p className="text-[11px] text-[var(--adm-text-muted)]">
                    {domainTitleHu(o.domainKey)}
                    {o.businessProcess ? ` · ${o.businessProcess.name}` : ""}
                    {rec?.direction ? ` · ${rec.direction}` : ""}
                  </p>
                  {o.problemStatement ? (
                    <p className="mt-1 text-[11px] text-[var(--adm-text-muted)] line-clamp-2">{o.problemStatement}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-[var(--adm-text-soft)]">
                    Bizonyíték: {evidenceStrengthLabelHu(o.evidenceStrength)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <AdminStatusPill tone={sufficiencyTone[o.sufficiency]}>{sufficiencyLabelHu(o.sufficiency)}</AdminStatusPill>
                  <Link href={`/clients/${clientId}/grow?tab=dontesek&opportunity=${encodeURIComponent(o.id)}`}>
                    <AdminButton size="sm" variant="neutral">Döntés</AdminButton>
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AdminPanel>
  );
}

/* --------------------------- Kezdeményezések ------------------------------- */

function GrowActiveInitiatives({
  initiatives,
  milestones,
}: {
  initiatives: DevelopmentInitiative[];
  milestones: CompanyMilestone[];
}) {
  if (initiatives.length === 0) {
    return (
      <AdminPanel>
        <AdminSectionHeader title="Aktív kezdeményezések" subtitle="Elfogadott lehetőségből indított fejlesztési kezdeményezések." />
        <p className="px-4 py-3 text-[12px] text-[var(--adm-text-muted)]">Még nincs aktív kezdeményezés.</p>
      </AdminPanel>
    );
  }

  return (
    <AdminPanel data-testid="grow-active-initiatives">
      <AdminSectionHeader title="Aktív kezdeményezések" subtitle="Felelős, célállapot, céldátum és következő mérföldkő." />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-[var(--adm-border)] text-[10px] uppercase tracking-[0.1em] text-[var(--adm-text-muted)]">
              <th className="px-4 py-2 font-semibold">Kezdeményezés</th>
              <th className="px-4 py-2 font-semibold">Felelős</th>
              <th className="px-4 py-2 font-semibold">Státusz</th>
              <th className="px-4 py-2 font-semibold">Célállapot</th>
              <th className="px-4 py-2 font-semibold">Céldátum</th>
              <th className="px-4 py-2 font-semibold">Következő mérföldkő</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--adm-border)]">
            {initiatives.map((i) => {
              const ownMilestones = milestones
                .filter((m) => m.developmentInitiativeId === i.id && m.status === "PLANNED")
                .sort((a, b) => (a.targetDate ?? a.milestoneDate ?? "").localeCompare(b.targetDate ?? b.milestoneDate ?? ""));
              const next = ownMilestones[0];
              const owner = i.lawFirmOwnerName || i.clientOwnerDisplay || null;
              return (
                <tr key={i.id} className="align-top">
                  <td className="px-4 py-3 font-semibold text-[var(--adm-text)]">{i.title}</td>
                  <td className="px-4 py-3 text-[var(--adm-text-muted)]">{owner ?? "—"}</td>
                  <td className="px-4 py-3">
                    <AdminStatusPill tone={i.status === "ACTIVE" ? "green" : i.status === "ON_HOLD" ? "amber" : "neutral"}>
                      {initiativeStatusLabel(i.status)}
                    </AdminStatusPill>
                  </td>
                  <td className="px-4 py-3 text-[var(--adm-text)]">{i.targetState || "—"}</td>
                  <td className="px-4 py-3 text-[var(--adm-text-muted)]">{formatDate(i.targetAt)}</td>
                  <td className="px-4 py-3 text-[var(--adm-text-muted)]">
                    {next ? `${next.title}${next.targetDate ? ` · ${formatDate(next.targetDate)}` : ""}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminPanel>
  );
}

/* ------------------------------- Eredmények -------------------------------- */

function GrowRecentResults({ outcomes }: { outcomes: OutcomeMeasurementDTO[] }) {
  const rows = outcomes.slice(0, 8);
  return (
    <AdminPanel data-testid="grow-recent-results">
      <AdminSectionHeader title="Legutóbbi eredmények" subtitle="A mért, számított, becsült és feltételezett alap szigorúan elkülönül." />
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-[12px] text-[var(--adm-text-muted)]">Még nincs rögzített eredmény.</p>
      ) : (
        <ul className="divide-y divide-[var(--adm-border)]">
          {rows.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[var(--adm-text)]">
                  {o.opportunityTitle ?? o.businessProcess?.name ?? "Eredmény"}
                </p>
                <p className="text-[11px] text-[var(--adm-text-muted)]">
                  {o.initiative?.title ? `Kezdeményezés: ${o.initiative.title}` : ""}
                  {o.businessProcess?.name ? ` · ${o.businessProcess.name}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <AdminStatusPill
                  tone={o.basis === "MEASURED" ? "green" : o.basis === "CALCULATED" ? "blue" : o.basis === "ESTIMATED" ? "amber" : "burgundy"}
                >
                  {outcomeBasisLabelHu(o.basis)}
                </AdminStatusPill>
                {o.synthetic ? <AdminStatusPill tone="burgundy">Szintetikus tesztadat</AdminStatusPill> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}

/* ------------------------------- Bizonyítékok ------------------------------ */

function GrowEvidenceTab({ evidence }: { evidence: GrowEvidenceItem[] }) {
  return (
    <div className="space-y-5" data-testid="grow-evidence-tab">
      <OperationalPageHeader
        title="Bizonyítékok"
        subtitle="Kutatási háttér és ügyfélspecifikus bizonyítékok, forrással és korlátokkal. Nem bizonyossági pontszám."
      />
      {evidence.length === 0 ? (
        <CompactState title="Még nincs megjeleníthető bizonyíték." />
      ) : (
        <div className="space-y-2">
          {evidence.map((item) => (
            <AdminPanel key={item.id} className="p-4" data-testid={`grow-evidence-${item.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[var(--adm-text)]">{item.title}</p>
                  <p className="text-[11px] text-[var(--adm-text-muted)]">
                    {[item.authors, item.venue, item.year ? String(item.year) : null].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {item.boundedClaim ? <p className="mt-1.5 text-[12px] text-[var(--adm-text)]">{item.boundedClaim}</p> : null}
                  {item.limitations ? <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Korlát: {item.limitations}</p> : null}
                  <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Származás: {evidenceOriginLabelHu(item.origin)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <AdminStatusPill tone={item.verificationStatus === "VERIFIED" ? "green" : "neutral"}>
                    {item.verificationStatus === "VERIFIED" ? "Ellenőrzött" : "Nem ellenőrzött"}
                  </AdminStatusPill>
                  <AdminStatusPill tone={item.strength === "STRONG" ? "green" : item.strength === "MODERATE" ? "amber" : "neutral"}>
                    {evidenceStrengthLabelHu(item.strength)}
                  </AdminStatusPill>
                  <span className="text-[11px] text-[var(--adm-text-muted)]">{sourceBasisLabelHu(item.sourceBasis)}</span>
                </div>
              </div>
            </AdminPanel>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Döntések ---------------------------------- */

function GrowDecisionsTab({
  clientId,
  opportunities,
  recommendations,
  requestedOpportunityId,
  opportunitiesLoadFailed,
  canStartInitiative,
  canPublish,
  readState,
  onRetry,
  onChanged,
}: {
  clientId: string;
  opportunities: GrowOpportunityItem[];
  recommendations: Array<{ id: string; title: string; direction: string; status: string; sufficiency: string; diagnosisId: string | null; domain: { key: string; name: string } | null; businessProcess: { id: string; name: string } | null }>;
  requestedOpportunityId: string | null;
  opportunitiesLoadFailed: boolean;
  canStartInitiative: boolean;
  canPublish: boolean;
  readState: WorkbenchReadState;
  onRetry: () => void;
  onChanged: () => void;
}) {
  const pending = opportunities.filter((o) => o.status === "PENDING_REVIEW");
  const accepted = opportunities.filter((o) => o.status === "ACCEPTED" || o.opportunity);
  const declined = opportunities.filter((o) => o.status === "DECLINED" || o.status === "NEEDS_MORE_DATA");
  const requestedOpportunity = opportunities.find((o) => o.id === requestedOpportunityId);

  useEffect(() => {
    if (!requestedOpportunity) return;
    const row = document.getElementById(`grow-opportunity-${encodeURIComponent(requestedOpportunity.id)}`);
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
    row?.focus({ preventScroll: true });
  }, [requestedOpportunity]);

  return (
    <div className="space-y-5" data-testid="grow-decisions-tab">
      <OperationalPageHeader
        title="Döntések"
        subtitle="A rendszer javasol — az ember dönt. Elfogadás után jön létre a fejlesztési lehetőség, külön lépésben."
      />

      {requestedOpportunityId && opportunitiesLoadFailed && readState !== "LOADING" ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert" data-testid="grow-opportunity-check-failed">
          A kért lehetőség elérhetőségét most nem sikerült ellenőrizni. Próbálja újra később.
        </p>
      ) : requestedOpportunityId && workbenchReadSucceeded(readState) && !opportunitiesLoadFailed && !requestedOpportunity ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status" data-testid="grow-opportunity-unavailable">
          A kért lehetőség nem érhető el ennél az ügyfélnél. Lehet, hogy már nem hozzáférhető vagy nem ehhez az ügyfélhez tartozik.
        </p>
      ) : null}

      <ReadPanel state={readState} label="Döntések" onRetry={onRetry}>
      <AdminPanel data-testid="grow-decisions-pending">
        <AdminSectionHeader
          title="Emberi döntésre vár"
          subtitle="Javasolt irány — szakértői döntés szükséges."
        />
        {pending.length === 0 ? (
          <p className="px-4 py-3 text-[12px] text-[var(--adm-text-muted)]">Nincs döntésre váró javaslat.</p>
        ) : (
          <ul className="divide-y divide-[var(--adm-border)]">
            {pending.map((o) => (
              <GrowDecisionRow key={o.id} clientId={clientId} item={o} rec={recommendations.find((r) => r.id === o.id)} isDeepLinkTarget={o.id === requestedOpportunityId} canManage={canStartInitiative} onChanged={onChanged} />
            ))}
          </ul>
        )}
      </AdminPanel>

      {accepted.length > 0 ? (
        <AdminPanel>
          <AdminSectionHeader title="Elfogadott — fejlesztési lehetőség" subtitle="Emberi döntés után; a kezdeményezés külön lépés." />
          <ul className="divide-y divide-[var(--adm-border)]">
            {accepted.map((o) => (
              <li key={o.id} id={`grow-opportunity-${encodeURIComponent(o.id)}`} tabIndex={-1} data-testid={`grow-decision-${o.id}`} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 outline-none ${o.id === requestedOpportunityId ? "rounded-md ring-2 ring-[var(--adm-green-800)] ring-offset-2" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[var(--adm-text)]">{o.title}</p>
                  <OpportunityOrigin item={o} />
                  {o.id === requestedOpportunityId ? <p className="text-[11px] font-semibold text-[var(--adm-green-800)]">Kért lehetőség</p> : null}
                  <p className="text-[11px] text-[var(--adm-text-muted)]">
                    {reviewDecisionLabelHu(o.status)}
                    {o.opportunity?.developmentInitiativeId ? " · kezdeményezés indítva" : " · kezdeményezés még nem indult"}
                  </p>
                </div>
                <GrowInitiativeAction clientId={clientId} item={o} canStart={canStartInitiative} onChanged={onChanged} />
                <Link className="text-sm underline" href={`/clients/${clientId}/grow?view=journey&destination=detail&opportunity=${encodeURIComponent(o.id)}`}>{canPublish ? "Részletek és ügyfélközlés" : "Lehetőség részletei"}</Link>
                <AdminStatusPill tone="green">{reviewDecisionLabelHu(o.status)}</AdminStatusPill>
              </li>
            ))}
          </ul>
        </AdminPanel>
      ) : null}

      {declined.length > 0 ? (
        <AdminPanel>
          <AdminSectionHeader title="Elutasított / több adatot igénylő" subtitle="Korábbi döntések." />
          <ul className="divide-y divide-[var(--adm-border)]">
            {declined.map((o) => (
              <li key={o.id} id={`grow-opportunity-${encodeURIComponent(o.id)}`} tabIndex={-1} data-testid={`grow-decision-${o.id}`} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 outline-none ${o.id === requestedOpportunityId ? "rounded-md ring-2 ring-[var(--adm-green-800)] ring-offset-2" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-[var(--adm-text)]">{o.title}</p>
                  <OpportunityOrigin item={o} />
                  {o.id === requestedOpportunityId ? <p className="text-[11px] font-semibold text-[var(--adm-green-800)]">Kért lehetőség</p> : null}
                </div>
                <Link className="text-sm underline" href={`/clients/${clientId}/grow?view=journey&destination=detail&opportunity=${encodeURIComponent(o.id)}`}>Részletek és további információ</Link>
                <AdminStatusPill tone={o.status === "DECLINED" ? "burgundy" : "amber"}>{reviewDecisionLabelHu(o.status)}</AdminStatusPill>
              </li>
            ))}
          </ul>
        </AdminPanel>
      ) : null}
      </ReadPanel>
    </div>
  );
}

function GrowDecisionRow({
  clientId,
  item,
  rec,
  isDeepLinkTarget,
  canManage,
  onChanged,
}: {
  clientId: string;
  item: GrowOpportunityItem;
  rec: { id: string; title: string; direction: string; status: string; sufficiency: string; diagnosisId: string | null; domain: { key: string; name: string } | null; businessProcess: { id: string; name: string } | null } | undefined;
  isDeepLinkTarget: boolean;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(false);
  const isCurrent = useCurrentContext(`${clientId}:${item.id}:${canManage}`);

  const decide = async (decision: "ACCEPT" | "DECLINE" | "REQUEST_MORE_INFO") => {
    if (!canManage || busy || !isCurrent()) return;
    setBusy(decision);
    setLocalError(null);
    setMessage(null);
    try {
      await growApi.reviewOpportunity(clientId, item.id, decision, note || undefined);
      if (!isCurrent()) return;
      setMessage(
        decision === "ACCEPT"
          ? "Elfogadva — fejlesztési lehetőség létrejött."
          : decision === "DECLINE"
            ? "Elutasítva."
            : "További információ kérve.",
      );
      onChanged();
    } catch {
      if (isCurrent()) setLocalError("A döntés rögzítése nem sikerült.");
    } finally {
      if (isCurrent()) setBusy(null);
    }
  };

  return (
    <li id={`grow-opportunity-${encodeURIComponent(item.id)}`} tabIndex={-1} data-testid={`grow-decision-${item.id}`} className={`px-4 py-3 outline-none ${isDeepLinkTarget ? "rounded-md ring-2 ring-[var(--adm-green-800)] ring-offset-2" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[var(--adm-text)]">{item.title}</p>
          {isDeepLinkTarget ? <p className="text-[11px] font-semibold text-[var(--adm-green-800)]">Kért lehetőség</p> : null}
          <p className="text-[11px] text-[var(--adm-text-muted)]">
            {domainTitleHu(item.domainKey)}
            {item.businessProcess ? ` · ${item.businessProcess.name}` : ""}
          </p>
          {rec?.direction ? <p className="mt-1 text-[12px] text-[var(--adm-text)]">{rec.direction}</p> : null}
          {item.interventionCodes.length ? (
            <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{item.interventionCodes.map((c) => interventionLabelHu(c)).join(" · ")}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <AdminStatusPill tone={sufficiencyTone[item.sufficiency]}>{sufficiencyLabelHu(item.sufficiency)}</AdminStatusPill>
          {item.sufficiency !== "SUPPORTED" ? (
            <span className="text-[10px] text-[var(--adm-text-muted)]">Csak alátámasztott javaslat fogadható el</span>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Link className="text-sm underline" href={`/clients/${clientId}/grow?view=journey&destination=detail&opportunity=${encodeURIComponent(item.id)}`}>Bizonyítékok, felülvizsgálat és további információ</Link>
        {canManage ? showControls || isDeepLinkTarget ? (
          <>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Megjegyzés a döntéshez (opcionális)"
              className="adm-board-field w-full max-w-sm px-3 py-1.5 text-[12px]"
            />
            <AdminButton size="sm" variant="primary" disabled={busy !== null || item.sufficiency !== "SUPPORTED"} onClick={() => void decide("ACCEPT")} data-testid={`grow-decide-accept-${item.id}`}>
              {busy === "ACCEPT" ? "Rögzítés…" : "Elfogadom"}
            </AdminButton>
            <AdminButton size="sm" variant="neutral" disabled={busy !== null} onClick={() => void decide("DECLINE")}>
              Elutasítom
            </AdminButton>
            <AdminButton size="sm" variant="warning" disabled={busy !== null} onClick={() => void decide("REQUEST_MORE_INFO")}>
              Több adat kell
            </AdminButton>
          </>
        ) : (
          <AdminButton size="sm" variant="neutral" onClick={() => setShowControls(true)} data-testid={`grow-decide-open-${item.id}`}>
            Döntés megnyitása
          </AdminButton>
        ) : null}
      </div>

      {message ? <p className="mt-2 text-[11px] font-semibold text-[var(--adm-green-800)]" role="status">{message}</p> : null}
      {localError ? <p className="mt-2 text-[11px] text-[var(--adm-terracotta-700)]" role="alert">{localError}</p> : null}
    </li>
  );
}

/* ------------------------------- Kezdeményezések --------------------------- */

function GrowInitiativesTab({
  clientId,
  readStates,
  onRetry,
  initiatives,
  milestones,
  opportunities,
  outcomes,
}: {
  clientId: string;
  readStates: ReadStates;
  onRetry: () => void;
  initiatives: DevelopmentInitiative[];
  milestones: CompanyMilestone[];
  opportunities: GrowOpportunityItem[];
  outcomes: OutcomeMeasurementDTO[];
}) {
  return (
    <div className="space-y-5" data-testid="grow-initiatives-tab">
      <OperationalPageHeader
        title="Kezdeményezések"
        subtitle="Felelős, célállapot, mérföldkövek és kapcsolt lehetőség. Nincs fiktív aktivitás-idővonal."
      />
      <ReadPanel state={readStates.opportunities} label="Kapcsolt lehetőségek" onRetry={onRetry} />
      {initiatives.length === 0 ? (
        <CompactState title="Még nincs fejlesztési kezdeményezés." detail="Elfogadott lehetőségből indítható, külön lépésben." />
      ) : (
        <div className="space-y-3">
          {initiatives.map((i) => {
            const ownMilestones = milestones
              .filter((m) => m.developmentInitiativeId === i.id)
              .sort((a, b) => (a.targetDate ?? a.milestoneDate ?? "").localeCompare(b.targetDate ?? b.milestoneDate ?? ""));
            const linkedOpportunity = opportunities.find((o) => o.opportunity?.developmentInitiativeId === i.id);
            const ownOutcomes = outcomes.filter((o) => o.initiative?.id === i.id);
            return (
              <AdminPanel key={i.id} id={`grow-initiative-${encodeURIComponent(i.id)}`} className="scroll-mt-24 p-4" data-testid={`grow-initiative-${i.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-[var(--adm-text)]">{i.title}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--adm-text-muted)]">
                      {!workbenchReadSucceeded(readStates.opportunities) ? "A kapcsolt lehetőség jelenleg nem ellenőrizhető." : linkedOpportunity ? `Lehetőség: ${linkedOpportunity.title}` : "Nincs közvetlenül kapcsolt lehetőség"}
                    </p>
                  </div>
                  <AdminStatusPill tone={i.status === "ACTIVE" ? "green" : i.status === "ON_HOLD" ? "amber" : i.status === "COMPLETED" ? "green" : "neutral"}>
                    {initiativeStatusLabel(i.status)}
                  </AdminStatusPill>
                </div>

                <Link className="text-sm underline" href={`/clients/${clientId}/grow?view=journey&destination=progress`}>Kezdeményezés részletes követése</Link>
                <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-2">
                  <div className="flex justify-between gap-2 border-b border-[var(--adm-border)] py-1">
                    <dt className="text-[var(--adm-text-muted)]">Felelős</dt>
                    <dd className="text-[var(--adm-text)]">{i.lawFirmOwnerName || i.clientOwnerDisplay || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2 border-b border-[var(--adm-border)] py-1">
                    <dt className="text-[var(--adm-text-muted)]">Céldátum</dt>
                    <dd className="text-[var(--adm-text)]">{formatDate(i.targetAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 border-b border-[var(--adm-border)] py-1">
                    <dt className="text-[var(--adm-text-muted)]">Kiinduló állapot</dt>
                    <dd className="text-[var(--adm-text)]">{i.currentState || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2 border-b border-[var(--adm-border)] py-1">
                    <dt className="text-[var(--adm-text-muted)]">Célállapot</dt>
                    <dd className="text-[var(--adm-text)]">{i.targetState || "—"}</dd>
                  </div>
                </dl>

                <div className="mt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Mérföldkövek</p>
                  <ReadPanel state={readStates.milestones} label="Mérföldkövek" onRetry={onRetry}>
                  {ownMilestones.length === 0 ? (
                    <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Nincsenek rögzített mérföldkövek.</p>
                  ) : (
                    <ul className="mt-1 divide-y divide-[var(--adm-border)]">
                      {ownMilestones.map((m) => (
                        <li key={m.id} className="flex items-center justify-between gap-2 py-1 text-[12px]">
                          <span className="text-[var(--adm-text)]">{m.title}</span>
                          <span className="text-[var(--adm-text-muted)]">
                            {companyMilestoneStatusLabel(m.status)}
                            {m.targetDate ? ` · ${formatDate(m.targetDate)}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  </ReadPanel>
                </div>

                <ReadPanel state={readStates.outcomes} label="Kapcsolt eredmények" onRetry={onRetry}>
                {ownOutcomes.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Rögzített eredmények</p>
                    <ul className="mt-1 space-y-1">
                      {ownOutcomes.map((o) => (
                        <li key={o.id} className="flex items-center gap-2 text-[12px]">
                          <AdminStatusPill tone={o.basis === "MEASURED" ? "green" : "amber"}>{outcomeBasisLabelHu(o.basis)}</AdminStatusPill>
                          <span className="text-[var(--adm-text-muted)]">{formatDate(o.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                </ReadPanel>
              </AdminPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Eredmények -------------------------------- */

function GrowOutcomesTab({
  clientId,
  outcomes,
  processes,
  canRecordOutcome,
  onRecorded,
}: {
  clientId: string;
  outcomes: OutcomeMeasurementDTO[];
  processes: BusinessProcessDTO[];
  canRecordOutcome: boolean;
  onRecorded: () => void;
}) {
  const [showRecord, setShowRecord] = useState(false);
  const measured = outcomes.filter((o) => o.basis === "MEASURED");
  const calculated = outcomes.filter((o) => o.basis === "CALCULATED");
  const estimated = outcomes.filter((o) => o.basis === "ESTIMATED");
  const assumed = outcomes.filter((o) => o.basis === "ASSUMED");

  return (
    <div className="space-y-5" data-testid="grow-outcomes-tab">
      <OperationalPageHeader
        title="Eredmények"
        subtitle="Az alap (mért / számított / becsült / feltételezett) minden sorban egyértelműen el van különítve."
        primaryAction={
          canRecordOutcome ? (
            <AdminButton
              size="sm"
              variant="primary"
              onClick={() => setShowRecord((open) => !open)}
              data-testid="grow-record-outcome-open"
            >
              Eredmény rögzítése
            </AdminButton>
          ) : undefined
        }
      />

      {canRecordOutcome && showRecord ? (
        <GrowRecordOutcomeForm
          clientId={clientId}
          processes={processes}
          onRecorded={onRecorded}
          onClose={() => setShowRecord(false)}
        />
      ) : null}

      <OutcomeGroup title="Mért eredmény" detail="Előtte/utána mérésből származó, mért adat." outcomes={measured} tone="green" />
      <OutcomeGroup title="Számított eredmény" detail="Meghatározott képlettel számított adat." outcomes={calculated} tone="blue" />
      <OutcomeGroup title="Becsült eredmény" detail="Becslésen alapuló adat — nem mért érték." outcomes={estimated} tone="amber" />
      {assumed.length > 0 ? (
        <OutcomeGroup title="Feltételezett eredmény" detail="Feltételezésen alapul — nem tekinthető megvalósult hatásnak." outcomes={assumed} tone="burgundy" />
      ) : null}
    </div>
  );
}

/* --------------------------- Eredmény rögzítése ---------------------------- */

/**
 * Records an outcome against an EXISTING ImprovementOpportunity using the two
 * real measured ProcessObservationSnapshots of one process. The server derives
 * every metric, the ROI basis and the provenance — this form sends only
 * canonical ids and an optional note, never a fabricated value.
 */
function GrowRecordOutcomeForm({
  clientId,
  processes,
  onRecorded,
  onClose,
}: {
  clientId: string;
  processes: BusinessProcessDTO[];
  onRecorded: () => void;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<GrowOpportunityItem[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<WorkbenchReadState | null>(null);
  const [opportunityId, setOpportunityId] = useState("");
  const [processId, setProcessId] = useState("");
  const [snapshots, setSnapshots] = useState<ProcessObservationSnapshotDTO[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [snapshotsError, setSnapshotsError] = useState<WorkbenchReadState | null>(null);
  const [beforeSnapshotId, setBeforeSnapshotId] = useState("");
  const [afterSnapshotId, setAfterSnapshotId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const isCurrent = useCurrentContext(`${clientId}:${opportunityId}:${processId}:${beforeSnapshotId}:${afterSnapshotId}`);
  useEffect(() => {
    setBusy(false);
    setError(null);
    setMessage(null);
  }, [clientId, opportunityId, processId, beforeSnapshotId, afterSnapshotId]);

  // An outcome may only attach to an accepted opportunity (the human decision
  // already created the canonical ImprovementOpportunity).
  useEffect(() => {
    let cancelled = false;
    setOptionsLoading(true);
    setOptionsError(null);
    growApi
      .listOpportunities(clientId, "ACCEPTED")
      .then((res) => {
        if (!cancelled) setOptions(res.items.filter((o) => Boolean(o.opportunity)));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setOptions([]);
          setOptionsError(workbenchReadFailure(error));
        }
      })
      .finally(() => {
        if (!cancelled) setOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const selectedOpportunity = options.find((o) => o.id === opportunityId) ?? null;

  useEffect(() => {
    const suggested = selectedOpportunity?.businessProcess?.id ?? "";
    if (suggested) setProcessId(suggested);
  }, [selectedOpportunity]);

  // Snapshot options always come from the canonical observation history.
  useEffect(() => {
    if (!processId) {
      setSnapshots([]);
      setSnapshotsError(null);
      setSnapshotsLoading(false);
      setBeforeSnapshotId("");
      setAfterSnapshotId("");
      return;
    }
    let cancelled = false;
    setSnapshotsLoading(true);
    setSnapshotsError(null);
    setBeforeSnapshotId("");
    setAfterSnapshotId("");
    growApi
      .listProcessObservationHistory(clientId, processId)
      .then((res) => {
        if (!cancelled) setSnapshots(res.items);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSnapshots([]);
          setSnapshotsError(workbenchReadFailure(error));
        }
      })
      .finally(() => {
        if (!cancelled) setSnapshotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, processId]);

  const beforeSnapshot = snapshots.find((s) => s.id === beforeSnapshotId) ?? null;
  // The after snapshot must not precede the baseline; ordering only, no metrics.
  const afterOptions = beforeSnapshot
    ? snapshots.filter((s) => s.id !== beforeSnapshot.id && s.observedAt >= beforeSnapshot.observedAt)
    : snapshots.filter((s) => s.id !== beforeSnapshotId);

  const canSubmit = Boolean(selectedOpportunity?.opportunity?.id) && Boolean(processId) && Boolean(beforeSnapshot) && !optionsLoading && !optionsError && !snapshotsLoading && !snapshotsError;

  const submit = async () => {
    if (!selectedOpportunity?.opportunity?.id || !processId || !beforeSnapshotId) return;
    if (!canSubmit || busy || !isCurrent()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await growApi.recordOutcome(clientId, selectedOpportunity.opportunity.id, {
        businessProcessId: processId,
        beforeSnapshotId,
        afterSnapshotId: afterSnapshotId || undefined,
        note: note.trim() || undefined,
      });
      if (!isCurrent()) return;
      setMessage("Eredmény rögzítve.");
      onRecorded();
    } catch {
      // A server rejection must never read as success.
      if (isCurrent()) setError("Az eredmény rögzítése nem sikerült.");
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };

  return (
    <AdminPanel data-testid="grow-record-outcome-form">
      <AdminSectionHeader
        title="Eredmény rögzítése"
        subtitle="Kizárólag elfogadott fejlesztési lehetőséghez, rögzített folyamatpillanatképekből. A rendszer megőrzi a bemenetek forrásalapját; az űrlap nem számol ROI-t."
      />

      {optionsLoading ? (
        <p className="px-4 py-3 text-[12px] text-[var(--adm-text-muted)]">A lehetőségek betöltése…</p>
      ) : optionsError ? (
        <ReadPanel state={optionsError} label="Rögzíthető fejlesztési lehetőségek" />
      ) : options.length === 0 ? (
        <CompactState
          title="Nincs rögzíthető fejlesztési lehetőség."
          detail="Eredmény csak korábban elfogadott javaslathoz (fejlesztési lehetőséghez) rögzíthető. Előbb a Döntések fülön fogadjon el egy javaslatot."
        />
      ) : (
        <div className="space-y-3 px-4 py-3">
          <label className="block">
            <span className="text-[11px] font-semibold text-[var(--adm-text-muted)]">Fejlesztési lehetőség</span>
            <select
              value={opportunityId}
              onChange={(e) => setOpportunityId(e.target.value)}
              className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]"
              data-testid="grow-record-outcome-opportunity"
            >
              <option value="">Válasszon lehetőséget…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.title}</option>
              ))}
            </select>
          </label>

          {selectedOpportunity ? (
            <>
              <label className="block">
                <span className="text-[11px] font-semibold text-[var(--adm-text-muted)]">Folyamat</span>
                <select
                  value={processId}
                  onChange={(e) => setProcessId(e.target.value)}
                  className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]"
                  data-testid="grow-record-outcome-process"
                >
                  <option value="">Válasszon folyamatot…</option>
                  {processes.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>

              {snapshotsLoading ? (
                <p className="text-[12px] text-[var(--adm-text-muted)]">A folyamatpillanatképek betöltése…</p>
              ) : snapshotsError ? (
                <ReadPanel state={snapshotsError} label="Folyamat-pillanatképek" />
              ) : processId && snapshots.length === 0 ? (
                <p className="text-[12px] text-[var(--adm-text-muted)]">
                  Ehhez a folyamathoz még nincs folyamatpillanatkép. Előbb rögzítsen folyamat-megfigyelést a folyamat adatlapján.
                </p>
              ) : (
                <>
                  <label className="block">
                    <span className="text-[11px] font-semibold text-[var(--adm-text-muted)]">Kiinduló (előtte) pillanatkép</span>
                    <select
                      value={beforeSnapshotId}
                      onChange={(e) => { setBeforeSnapshotId(e.target.value); setAfterSnapshotId(""); }}
                      className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]"
                      data-testid="grow-record-outcome-before"
                    >
                      <option value="">Válasszon kiinduló pillanatképet…</option>
                      {snapshots.map((s) => (
                        <option key={s.id} value={s.id}>{formatObservedAt(s.observedAt)} · {sourceBasisLabelHu(s.sourceBasis)}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-[11px] font-semibold text-[var(--adm-text-muted)]">Utána pillanatkép (opcionális)</span>
                    <select
                      value={afterSnapshotId}
                      onChange={(e) => setAfterSnapshotId(e.target.value)}
                      disabled={!beforeSnapshot}
                      className="adm-board-field mt-1 w-full px-3 py-2 text-[12px] disabled:opacity-60"
                      data-testid="grow-record-outcome-after"
                    >
                      <option value="">Nincs utána pillanatkép</option>
                      {afterOptions.map((s) => (
                        <option key={s.id} value={s.id}>{formatObservedAt(s.observedAt)} · {sourceBasisLabelHu(s.sourceBasis)}</option>
                      ))}
                    </select>
                    <span className="mt-1 block text-[11px] text-[var(--adm-text-muted)]">
                      Az utána pillanatkép önmagában nem teszi mértté az eredményt. A becsült bemenetből számított változás becslés marad, nem igazolt megvalósult haszon.
                    </span>
                  </label>
                </>
              )}

              <label className="block">
                <span className="text-[11px] font-semibold text-[var(--adm-text-muted)]">Megjegyzés (opcionális)</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={2000}
                  rows={2}
                  className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]"
                  data-testid="grow-record-outcome-note"
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <AdminButton
                  size="sm"
                  variant="primary"
                  disabled={busy || !canSubmit}
                  onClick={() => void submit()}
                  data-testid="grow-record-outcome-submit"
                >
                  {busy ? "Rögzítés…" : "Eredmény rögzítése"}
                </AdminButton>
                <AdminButton size="sm" variant="neutral" disabled={busy} onClick={onClose}>
                  Mégse
                </AdminButton>
              </div>

              {message ? <p className="text-[11px] font-semibold text-[var(--adm-green-800)]" role="status">{message}</p> : null}
              {error ? <p className="text-[11px] text-[var(--adm-terracotta-700)]" role="alert">{error}</p> : null}
            </>
          ) : null}
        </div>
      )}
    </AdminPanel>
  );
}

function OutcomeGroup({
  title,
  detail,
  outcomes,
  tone,
}: {
  title: string;
  detail: string;
  outcomes: OutcomeMeasurementDTO[];
  tone: "green" | "blue" | "amber" | "burgundy";
}) {
  return (
    <AdminPanel>
      <AdminSectionHeader title={title} subtitle={detail} />
      {outcomes.length === 0 ? (
        <p className="px-4 py-3 text-[12px] text-[var(--adm-text-muted)]">Nincs {title.toLowerCase()} ebben a csoportban.</p>
      ) : (
        <ul className="divide-y divide-[var(--adm-border)]">
          {outcomes.map((o) => (
            <li key={o.id} className="px-4 py-3" data-testid={`grow-outcome-${o.basis}`}>
              <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[var(--adm-text)]">
                    {o.opportunityTitle ?? o.businessProcess?.name ?? "Eredmény"}
                  </p>
                  <p className="text-[11px] text-[var(--adm-text-muted)]">
                    {o.businessProcess?.name ? `Folyamat: ${o.businessProcess.name}` : ""}
                    {o.initiative?.title ? ` · ${o.initiative.title}` : ""}
                  </p>
                  {o.note ? <p className="mt-1 text-[11px] text-[var(--adm-text)]">{o.note}</p> : null}
                </div>
                <div className="flex max-w-full flex-col items-start gap-1 break-words text-[11px] text-[var(--adm-text-muted)] sm:items-end">
                  <AdminStatusPill tone={tone}>{outcomeBasisLabelHu(o.basis)}</AdminStatusPill>
                  {o.synthetic ? <span>Szintetikus tesztadat — nem valós eredmény</span> : null}
                  <span>Rögzítette: {o.recordedBy?.name ?? "—"} · {formatDate(o.createdAt)}</span>
                </div>
              </div>
              <GrowOutcomeComparison outcome={o} />
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}

/* ------------------------------- Adatforrások ------------------------------ */

function GrowDataSourcesTab({
  clientId,
  sources,
  canManage,
  readState,
  onSubmitted,
}: {
  clientId: string;
  sources: Array<{ id: string; sourceType: string; name: string; status: string; createdAt: string }>;
  canManage: boolean;
  readState: WorkbenchReadState;
  onSubmitted: () => void;
}) {
  return (
    <div className="space-y-5" data-testid="grow-data-sources-tab">
      <OperationalPageHeader
        title="Adatforrások"
        subtitle="A bemeneti csatornák otthona: profil-tények, megfigyelések, folyamat-pillanatképek, felmérések és külső források."
      />

      <AdminPanel>
        <AdminSectionHeader title="Külső források" subtitle="Csatlakoztatott megfigyelési és felmérési források." />
        <ReadPanel state={readState} label="Külső források" onRetry={onSubmitted}>
        {sources.length === 0 ? (
          <p className="px-4 py-3 text-[12px] text-[var(--adm-text-muted)]">Még nincs csatlakoztatott külső forrás.</p>
        ) : (
          <ul className="divide-y divide-[var(--adm-border)]">
            {sources.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[12px]">
                <span className="font-semibold text-[var(--adm-text)]">{s.name}</span>
                <span className="text-[var(--adm-text-muted)]">
                  {s.sourceType} · {externalSourceStatusLabelHu(s.status)} · {formatDate(s.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        </ReadPanel>
      </AdminPanel>

      <GrowAssessmentSummaries key={clientId} clientId={clientId} />
      {canManage ? <GrowIntake clientId={clientId} onSubmitted={onSubmitted} /> : null}

      <p className="text-[11px] text-[var(--adm-text-muted)]">
        A kérdőíves felmérések és a „Mondd el, hol fáj” strukturált bejelentés bemeneti csatornák: megfigyelésként rögzülnek, és önmagukban nem hoznak létre diagnózist, döntést vagy feladatot.
      </p>
    </div>
  );
}

function OpportunityOrigin({ item }: { item: GrowOpportunityItem }) {
  return <p className="text-xs text-[var(--adm-text-muted)]">{formatDate(item.createdAt)} · Kutatási kör: <span title={item.runId}>{item.runId.slice(0, 8)}</span> · {item.businessProcess?.name || domainTitleHu(item.domainKey)}</p>;
}

function GrowInitiativeAction({ clientId, item, canStart, onChanged }: { clientId: string; item: GrowOpportunityItem; canStart: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCurrent = useCurrentContext(`${clientId}:${item.id}:${canStart}`);
  const linkedId = item.opportunity?.developmentInitiativeId;
  if (linkedId) return <Link className="inline-flex min-h-10 items-center text-sm underline" href={`/clients/${clientId}/grow?tab=kezdemenyezesek#grow-initiative-${encodeURIComponent(linkedId)}`}>Kezdeményezés megnyitása</Link>;
  if (!item.opportunity?.id || !canStart) return <span className="text-xs text-[var(--adm-text-muted)]">A kezdeményezést vezető indíthatja.</span>;
  const start = async () => {
    if (busy || !canStart || !isCurrent()) return;
    setBusy(true); setError(null);
    try { await growApi.startInitiative(clientId, item.opportunity!.id); if (isCurrent()) onChanged(); }
    catch { if (isCurrent()) setError("Az indítás nem sikerült. Frissítse a döntéseket a jelenlegi állapot ellenőrzéséhez."); }
    finally { if (isCurrent()) setBusy(false); }
  };
  return <div><AdminButton size="sm" variant="primary" disabled={busy} onClick={() => void start()}>{busy ? "Indítás…" : "Kezdeményezés indítása"}</AdminButton>{error ? <p role="alert" className="text-sm text-[var(--adm-terracotta-700)]">{error}</p> : null}</div>;
}
