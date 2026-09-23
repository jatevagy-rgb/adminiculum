"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import {
  domainTitleHu,
  evidenceStrengthLabelHu,
  evidenceOriginLabelHu,
  growApi,
  interventionLabelHu,
  outcomeBasisLabelHu,
  reviewDecisionLabelHu,
  sufficiencyLabelHu,
  type GrowEvidenceItem,
  type GrowOpportunityItem,
  type OutcomeMeasurementDTO,
  type SufficiencyDecision,
} from "@/lib/growApi";
import {
  clientCompanyApi,
  companyMilestoneStatusLabel,
  initiativeStatusLabel,
  type CompanyMilestone,
  type DevelopmentInitiative,
} from "@/lib/clientCompanyApi";
import { getCurrentUser } from "@/lib/api";

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

function diagnosisStatusPill(status: string): { label: string; tone: "green" | "amber" | "burgundy" | "neutral" } {
  return DIAGNOSIS_STATUS_LABELS[status] ?? { label: status || "—", tone: "neutral" };
}

/**
 * Operational workforce Grow workbench. This is the primary decision-first
 * surface, not a questionnaire journey. Every count, status and date comes from
 * the canonical backend read models already exposed through `growApi`,
 * `clientCompanyApi` and the diagnostic workbench DTO.
 */
export function GrowWorkbench({
  clientId,
  clientName,
  activeTab,
}: {
  clientId: string;
  clientName: string;
  activeTab: GrowWorkbenchTab;
}) {
  const [opportunities, setOpportunities] = useState<GrowOpportunityItem[]>([]);
  const [evidence, setEvidence] = useState<GrowEvidenceItem[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeMeasurementDTO[]>([]);
  const [initiatives, setInitiatives] = useState<DevelopmentInitiative[]>([]);
  const [milestones, setMilestones] = useState<CompanyMilestone[]>([]);
  const [canRunResearch, setCanRunResearch] = useState(false);
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<Array<{ id: string; sourceType: string; name: string; status: string; createdAt: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [oppRes, evRes, outRes, initRes, milestoneRes, profileRes] = await Promise.all([
        growApi.listOpportunities(clientId).catch(() => ({ items: [] as GrowOpportunityItem[] })),
        growApi.listEvidence(clientId).catch(() => ({ items: [] as GrowEvidenceItem[] })),
        growApi.listOutcomes(clientId).catch(() => ({ items: [] as OutcomeMeasurementDTO[] })),
        clientCompanyApi.listInitiatives(clientId).catch(() => ({ items: [] as DevelopmentInitiative[] })),
        clientCompanyApi.listMilestones(clientId).catch(() => ({ items: [] as CompanyMilestone[] })),
        clientCompanyApi.getProfile(clientId).catch(() => null),
      ]);
      setOpportunities(oppRes.items);
      setEvidence(evRes.items);
      setOutcomes(outRes.items);
      setInitiatives(initRes.items);
      setMilestones(milestoneRes.items);
      setProfileState(
        profileRes
          ? {
              status: profileRes.status,
              summary: profileRes.summary,
              lastReviewedAt: profileRes.lastReviewedAt,
              nextReviewAt: profileRes.nextReviewAt,
            }
          : null,
      );

      // Diagnostic worklist + missing-data signals come from the canonical
      // diagnostic workbench read model (read-only, workforce-only).
      try {
        const { getDiagnosticWorkbench } = await import("@/lib/diagnosticWorkbenchApi");
        const wb = await getDiagnosticWorkbench(clientId);
        setDiagnoses(wb.problems.diagnoses);
        setRecommendations(wb.proposed.recommendations);
        setMissingItems(wb.missing.unresolvedItems);
      } catch {
        // Diagnostics are secondary to the overview; fail open to the other
        // canonical data rather than blocking the whole workbench.
        setDiagnoses([]);
        setRecommendations([]);
        setMissingItems([]);
      }

      growApi
        .listSources(clientId)
        .then((res) => setSources(res.items))
        .catch(() => setSources([]));
    } catch {
      setError("A Grow felület adatai jelenleg nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void getCurrentUser()
      .then((user) => {
        if (!cancelled) setCanRunResearch(["ADMIN", "PARTNER", "LAWYER"].includes(String(user?.role || "")));
      })
      .catch(() => {
        if (!cancelled) setCanRunResearch(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <CompactState
        title="A Grow munkaasztal adatai betöltés alatt…"
        detail="A diagnosztikák, döntések, kezdeményezések és eredmények betöltése folyamatban."
      />
    );
  }

  if (error) {
    return <SafePanelError onRetry={() => void load()} detail={error} />;
  }

  return (
    <div className="space-y-5" data-testid="grow-workbench">
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
          canRunResearch={canRunResearch}
          onRunResearch={() => void load()}
        />
      ) : null}

      {activeTab === "diagnosztika" ? <GrowDiagnosticWorkbench clientId={clientId} clientName={clientName} /> : null}

      {activeTab === "bizonyitekok" ? <GrowEvidenceTab evidence={evidence} /> : null}

      {activeTab === "dontesek" ? (
        <GrowDecisionsTab
          clientId={clientId}
          opportunities={opportunities}
          recommendations={recommendations}
          onChanged={() => void load()}
        />
      ) : null}

      {activeTab === "kezdemenyezesek" ? (
        <GrowInitiativesTab
          initiatives={initiatives}
          milestones={milestones}
          opportunities={opportunities}
          outcomes={outcomes}
        />
      ) : null}

      {activeTab === "eredmenyek" ? <GrowOutcomesTab outcomes={outcomes} /> : null}

      {activeTab === "adatforrasok" ? (
        <GrowDataSourcesTab clientId={clientId} sources={sources} onSubmitted={() => void load()} />
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
  onRunResearch,
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
  onRunResearch: () => void;
}) {
  const pendingReview = opportunities.filter((o) => o.status === "PENDING_REVIEW");
  const needsMoreDataDiagnoses = diagnoses.filter((d) => d.status === "NEEDS_MORE_DATA").length;
  const openDiagnoses = diagnoses.filter((d) => d.status === "OPEN" || d.status === "CONFIRMED").length;
  const activeInitiatives = initiatives.filter((i) => ["PLANNED", "ACTIVE", "ON_HOLD"].includes(i.status));
  const nextMilestone = [...milestones]
    .filter((m) => m.status === "PLANNED" && (m.targetDate || m.milestoneDate))
    .sort((a, b) => (a.targetDate ?? a.milestoneDate ?? "").localeCompare(b.targetDate ?? b.milestoneDate ?? ""))[0];
  const achievedOutcomes = outcomes.filter((o) => o.basis !== "ASSUMED");
  const unverifiedEvidence = evidence.filter((e) => e.verificationStatus !== "VERIFIED").length;

  const summaryItems: Array<{ label: string; value: string; tone: "neutral" | "amber" | "green" | "blue" }> = [
    { label: "Nyitott diagnózis", value: String(openDiagnoses), tone: "neutral" },
    { label: "Több adatot igénylő", value: String(needsMoreDataDiagnoses), tone: needsMoreDataDiagnoses > 0 ? "amber" : "neutral" },
    { label: "Emberi döntésre vár", value: String(pendingReview.length), tone: pendingReview.length > 0 ? "amber" : "neutral" },
    { label: "Aktív kezdeményezés", value: String(activeInitiatives.length), tone: "green" },
    {
      label: "Következő mérföldkő",
      value: nextMilestone ? formatDate(nextMilestone.targetDate ?? nextMilestone.milestoneDate) : "—",
      tone: "neutral",
    },
    { label: "Rögzített eredmény", value: String(achievedOutcomes.length), tone: "green" },
  ];

  return (
    <div className="space-y-5" data-testid="grow-overview-tab">
      <OperationalPageHeader
        title={clientName}
        subtitle={
          profileState?.summary ||
          "Működési fejlesztési áttekintés — diagnosztika, döntés és végrehajtás."
        }
        primaryAction={
          canRunResearch ? (
            <AdminButton size="sm" variant="primary" onClick={onRunResearch} data-testid="grow-run-research">
              Új kutatási futás
            </AdminButton>
          ) : (
            <Link href={`/clients/${clientId}/grow?tab=diagnosztika`}>
              <AdminButton size="sm" variant="neutral">Diagnosztika megnyitása</AdminButton>
            </Link>
          )
        }
      />

      {profileState?.lastReviewedAt || profileState?.status ? (
        <p className="text-[11px] text-[var(--adm-text-muted)]" data-testid="grow-profile-state">
          Működési profil állapota: {profileState.status ?? "nincs beállítva"}
          {profileState.lastReviewedAt ? ` · utolsó felülvizsgálat: ${formatDate(profileState.lastReviewedAt)}` : ""}
          {profileState.nextReviewAt ? ` · következő esedékes: ${formatDate(profileState.nextReviewAt)}` : ""}
        </p>
      ) : null}

      {/* Summary strip — truthful backend counts, no synthetic maturity score */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="grow-summary-strip">
        {summaryItems.map((item) => (
          <div key={item.label} className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">{item.label}</p>
            <p className="mt-1 text-lg font-semibold leading-none text-[var(--adm-text)]">{item.value}</p>
          </div>
        ))}
      </div>

      {unverifiedEvidence > 0 || missingItems.length > 0 ? (
        <CompactState
          title="Hiányzó vagy ellenőrizetlen adat"
          detail={
            [
              unverifiedEvidence > 0 ? `${unverifiedEvidence} nem hitelesített bizonyíték` : null,
              ...missingItems.map((m) => m.message),
            ]
              .filter(Boolean)
              .slice(0, 4)
              .join(" · ") || undefined
          }
        />
      ) : null}

      <GrowDiagnosticWorklist diagnoses={diagnoses} recommendations={recommendations} clientId={clientId} />
      <GrowDecisionQueue clientId={clientId} pending={pendingReview} recommendations={recommendations} />
      <GrowActiveInitiatives initiatives={activeInitiatives} milestones={milestones} />
      <GrowRecentResults outcomes={outcomes} />
    </div>
  );
}

/* --------------------------- Diagnosztikai munkaasztal ---------------------- */

function GrowDiagnosticWorklist({
  diagnoses,
  recommendations,
  clientId,
}: {
  diagnoses: Array<{ id: string; title: string; summary: string | null; status: string; problemDomain: { id: string; key: string; name: string } | null; businessProcess: { id: string; name: string } | null; evidence: Array<{ id: string; title: string; verificationStatus: string; strength: string }> }>;
  recommendations: Array<{ id: string; title: string; direction: string; status: string; sufficiency: string; diagnosisId: string | null; domain: { key: string; name: string } | null; businessProcess: { id: string; name: string } | null }>;
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
        subtitle="Diagnózis, kapcsolt folyamat, bizonyíték-állapot és emberi döntés egy munkalistában."
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-[var(--adm-border)] text-[10px] uppercase tracking-[0.1em] text-[var(--adm-text-muted)]">
              <th className="px-4 py-2 font-semibold">Diagnózis</th>
              <th className="px-4 py-2 font-semibold">Folyamat</th>
              <th className="px-4 py-2 font-semibold">Státusz</th>
              <th className="px-4 py-2 font-semibold">Bizonyíték</th>
              <th className="px-4 py-2 font-semibold">Javaslat</th>
              <th className="px-4 py-2 font-semibold">Következő lépés</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--adm-border)]">
            {diagnoses.map((d) => {
              const rec = recommendations.find((r) => r.diagnosisId === d.id);
              const status = diagnosisStatusPill(d.status);
              return (
                <tr key={d.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[var(--adm-text)]">{d.title}</p>
                    {d.problemDomain ? <p className="text-[11px] text-[var(--adm-text-muted)]">{d.problemDomain.name}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-[var(--adm-text-muted)]">{d.businessProcess?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <AdminStatusPill tone={status.tone}>{status.label}</AdminStatusPill>
                  </td>
                  <td className="px-4 py-3 text-[var(--adm-text-muted)]">{d.evidence.length} tétel</td>
                  <td className="px-4 py-3 text-[var(--adm-text)]">{rec ? rec.title : "—"}</td>
                  <td className="px-4 py-3">
                    {d.status === "NEEDS_MORE_DATA" ? (
                      <span className="text-[11px] font-semibold text-[var(--adm-terracotta-700)]">Több adat szükséges</span>
                    ) : rec ? (
                      <Link href={`/clients/${clientId}/grow?tab=dontesek`} className="text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">
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
                  <p className="text-[11px] text-[var(--adm-text-muted)]">
                    {domainTitleHu(o.domainKey)}
                    {o.businessProcess ? ` · ${o.businessProcess.name}` : ""}
                    {rec?.direction ? ` · ${rec.direction}` : ""}
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
  onChanged,
}: {
  clientId: string;
  opportunities: GrowOpportunityItem[];
  recommendations: Array<{ id: string; title: string; direction: string; status: string; sufficiency: string; diagnosisId: string | null; domain: { key: string; name: string } | null; businessProcess: { id: string; name: string } | null }>;
  onChanged: () => void;
}) {
  const pending = opportunities.filter((o) => o.status === "PENDING_REVIEW");
  const accepted = opportunities.filter((o) => o.status === "ACCEPTED" || o.opportunity);
  const declined = opportunities.filter((o) => o.status === "DECLINED" || o.status === "NEEDS_MORE_DATA");

  return (
    <div className="space-y-5" data-testid="grow-decisions-tab">
      <OperationalPageHeader
        title="Döntések"
        subtitle="A rendszer javasol — az ember dönt. Elfogadás után jön létre a fejlesztési lehetőség, külön lépésben."
      />

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
              <GrowDecisionRow key={o.id} clientId={clientId} item={o} rec={recommendations.find((r) => r.id === o.id)} onChanged={onChanged} />
            ))}
          </ul>
        )}
      </AdminPanel>

      {accepted.length > 0 ? (
        <AdminPanel>
          <AdminSectionHeader title="Elfogadott — fejlesztési lehetőség" subtitle="Emberi döntés után; a kezdeményezés külön lépés." />
          <ul className="divide-y divide-[var(--adm-border)]">
            {accepted.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[var(--adm-text)]">{o.title}</p>
                  <p className="text-[11px] text-[var(--adm-text-muted)]">
                    {reviewDecisionLabelHu(o.status)}
                    {o.opportunity?.developmentInitiativeId ? " · kezdeményezés indítva" : " · kezdeményezés még nem indult"}
                  </p>
                </div>
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
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <p className="min-w-0 flex-1 text-[13px] text-[var(--adm-text)]">{o.title}</p>
                <AdminStatusPill tone={o.status === "DECLINED" ? "burgundy" : "amber"}>{reviewDecisionLabelHu(o.status)}</AdminStatusPill>
              </li>
            ))}
          </ul>
        </AdminPanel>
      ) : null}
    </div>
  );
}

function GrowDecisionRow({
  clientId,
  item,
  rec,
  onChanged,
}: {
  clientId: string;
  item: GrowOpportunityItem;
  rec: { id: string; title: string; direction: string; status: string; sufficiency: string; diagnosisId: string | null; domain: { key: string; name: string } | null; businessProcess: { id: string; name: string } | null } | undefined;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(false);

  const decide = async (decision: "ACCEPT" | "DECLINE" | "REQUEST_MORE_INFO") => {
    setBusy(decision);
    setLocalError(null);
    setMessage(null);
    try {
      await growApi.reviewOpportunity(clientId, item.id, decision, note || undefined);
      setMessage(
        decision === "ACCEPT"
          ? "Elfogadva — fejlesztési lehetőség létrejött."
          : decision === "DECLINE"
            ? "Elutasítva."
            : "További információ kérve.",
      );
      onChanged();
    } catch {
      setLocalError("A döntés rögzítése nem sikerült.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[var(--adm-text)]">{item.title}</p>
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
        {showControls ? (
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
        )}
      </div>

      {message ? <p className="mt-2 text-[11px] font-semibold text-[var(--adm-green-800)]" role="status">{message}</p> : null}
      {localError ? <p className="mt-2 text-[11px] text-[var(--adm-terracotta-700)]" role="alert">{localError}</p> : null}
    </li>
  );
}

/* ------------------------------- Kezdeményezések --------------------------- */

function GrowInitiativesTab({
  initiatives,
  milestones,
  opportunities,
  outcomes,
}: {
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
              <AdminPanel key={i.id} className="p-4" data-testid={`grow-initiative-${i.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-[var(--adm-text)]">{i.title}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--adm-text-muted)]">
                      {linkedOpportunity ? `Lehetőség: ${linkedOpportunity.title}` : "Nincs közvetlenül kapcsolt lehetőség"}
                    </p>
                  </div>
                  <AdminStatusPill tone={i.status === "ACTIVE" ? "green" : i.status === "ON_HOLD" ? "amber" : i.status === "COMPLETED" ? "green" : "neutral"}>
                    {initiativeStatusLabel(i.status)}
                  </AdminStatusPill>
                </div>

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
                </div>

                {ownOutcomes.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Mért eredmények</p>
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
              </AdminPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Eredmények -------------------------------- */

function GrowOutcomesTab({ outcomes }: { outcomes: OutcomeMeasurementDTO[] }) {
  const measured = outcomes.filter((o) => o.basis === "MEASURED");
  const calculated = outcomes.filter((o) => o.basis === "CALCULATED");
  const estimated = outcomes.filter((o) => o.basis === "ESTIMATED");
  const assumed = outcomes.filter((o) => o.basis === "ASSUMED");

  return (
    <div className="space-y-5" data-testid="grow-outcomes-tab">
      <OperationalPageHeader
        title="Eredmények"
        subtitle="Az alap (mért / számított / becsült / feltételezett) minden sorban egyértelműen el van különítve."
      />

      <OutcomeGroup title="Mért eredmény" detail="Előtte/utána mérésből származó, mért adat." outcomes={measured} tone="green" />
      <OutcomeGroup title="Számított eredmény" detail="Meghatározott képlettel számított adat." outcomes={calculated} tone="blue" />
      <OutcomeGroup title="Becsült eredmény" detail="Becslésen alapuló adat — nem mért érték." outcomes={estimated} tone="amber" />
      {assumed.length > 0 ? (
        <OutcomeGroup title="Feltételezett eredmény" detail="Feltételezésen alapul — nem tekinthető megvalósult hatásnak." outcomes={assumed} tone="burgundy" />
      ) : null}
    </div>
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
              <div className="flex flex-wrap items-center justify-between gap-2">
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
                <div className="flex shrink-0 flex-col items-end gap-1 text-[11px] text-[var(--adm-text-muted)]">
                  <AdminStatusPill tone={tone}>{outcomeBasisLabelHu(o.basis)}</AdminStatusPill>
                  {o.synthetic ? <span>Szintetikus tesztadat — nem valós eredmény</span> : null}
                  <span>Rögzítette: {o.recordedBy?.name ?? "—"} · {formatDate(o.createdAt)}</span>
                </div>
              </div>
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
  onSubmitted,
}: {
  clientId: string;
  sources: Array<{ id: string; sourceType: string; name: string; status: string; createdAt: string }>;
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
        {sources.length === 0 ? (
          <p className="px-4 py-3 text-[12px] text-[var(--adm-text-muted)]">Még nincs csatlakoztatott külső forrás.</p>
        ) : (
          <ul className="divide-y divide-[var(--adm-border)]">
            {sources.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[12px]">
                <span className="font-semibold text-[var(--adm-text)]">{s.name}</span>
                <span className="text-[var(--adm-text-muted)]">
                  {s.sourceType} · {s.status} · {formatDate(s.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>

      <GrowIntake clientId={clientId} onSubmitted={onSubmitted} />

      <p className="text-[11px] text-[var(--adm-text-muted)]">
        A kérdőíves felmérések és a „Mondd el, hol fáj” strukturált bejelentés bemeneti csatornák: megfigyelésként rögzülnek, és önmagukban nem hoznak létre diagnózist, döntést vagy feladatot.
      </p>
    </div>
  );
}
