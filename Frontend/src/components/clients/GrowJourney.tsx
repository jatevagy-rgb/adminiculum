"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  domainTitleHu,
  evidenceOriginLabelHu,
  evidenceStrengthLabelHu,
  growApi,
  interventionLabelHu,
  outcomeBasisLabelHu,
  roiProvenanceLabelHu,
  sufficiencyExplanationHu,
  sufficiencyLabelHu,
  type BusinessProcessDTO,
  type GrowEvidenceItem,
  type GrowHomeSummary,
  type GrowOpportunityDetail,
  type GrowOpportunityItem,
  type OutcomeMeasurementDTO,
  type SufficiencyDecision,
} from "@/lib/growApi";
import { clientCompanyApi, initiativeStatusLabel, type DevelopmentInitiative } from "@/lib/clientCompanyApi";
import { listTaskLifecycleItems, type TaskLifecycleListItem } from "@/lib/taskLifecycleApi";
import { GrowIntake } from "@/components/clients/GrowIntake";
import { GrowProcessMap } from "@/components/clients/GrowProcessMap";

type GrowScreen = "home" | "feed" | "detail" | "progress" | "results";

const sufficiencyTone: Record<SufficiencyDecision, string> = {
  SUPPORTED: "border-[#2d5a43]/40 bg-[#2d5a43]/10 text-[#1b382b]",
  NEEDS_MORE_DATA: "border-amber-400 bg-amber-50 text-amber-900",
  INSUFFICIENT_EVIDENCE: "border-[#e8ded1] bg-[#fcfbf9] text-[#788274]",
  CONFLICTING_EVIDENCE: "border-[#c85a32]/40 bg-[#c85a32]/10 text-[#a03d19]",
  OUT_OF_SCOPE: "border-[#e8ded1] bg-[#fcfbf9] text-[#788274]",
  HUMAN_DOMAIN_REVIEW: "border-amber-500/50 bg-amber-50 text-amber-900",
};

const strengthTone: Record<string, string> = {
  STRONG: "border-[#2d5a43]/40 bg-[#2d5a43]/10 text-[#1b382b]",
  MODERATE: "border-amber-400 bg-amber-50 text-amber-900",
  WEAK: "border-[#e8ded1] bg-[#fcfbf9] text-[#788274]",
};

function Panel({
  title,
  kicker,
  children,
  className = "",
}: {
  title: string;
  kicker?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-3xl border border-[#e8ded1] bg-white p-5 sm:p-6 shadow-xs ${className}`}>
      {kicker ? (
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#667062]">{kicker}</p>
      ) : null}
      <h2 className="text-xs font-bold uppercase tracking-widest text-[#1b382b]">{title}</h2>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

function kindLabelHu(kind: string): string {
  return kind === "QUICK_FIX" ? "Gyors javítás" : "Fejlesztési lehetőség";
}

export function GrowJourney({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [screen, setScreen] = useState<GrowScreen>("home");
  const [home, setHome] = useState<GrowHomeSummary | null>(null);
  const [opportunities, setOpportunities] = useState<GrowOpportunityItem[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeMeasurementDTO[]>([]);
  const [processes, setProcesses] = useState<BusinessProcessDTO[]>([]);
  const [initiatives, setInitiatives] = useState<DevelopmentInitiative[]>([]);
  const [tasks, setTasks] = useState<TaskLifecycleListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GrowOpportunityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [researchBusy, setResearchBusy] = useState(false);
  const [researchNote, setResearchNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [homeRes, oppRes, outcomeRes, processRes, initiativeRes, taskRes] = await Promise.all([
        growApi.getHome(clientId),
        growApi.listOpportunities(clientId),
        growApi.listOutcomes(clientId),
        growApi.listProcesses(clientId).catch(() => [] as BusinessProcessDTO[]),
        clientCompanyApi.listInitiatives(clientId).catch(() => ({ items: [] as DevelopmentInitiative[] })),
        listTaskLifecycleItems().catch(() => [] as TaskLifecycleListItem[]),
      ]);
      setHome(homeRes);
      setOpportunities(oppRes.items);
      setOutcomes(outcomeRes.items);
      setProcesses(processRes);
      setInitiatives(initiativeRes.items);
      setTasks(taskRes.filter((t) => t.case.clientId === clientId));
    } catch {
      setError("A Grow felület adatai jelenleg nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = useCallback(
    async (recommendationId: string) => {
      setSelectedId(recommendationId);
      setDetail(null);
      setScreen("detail");
      try {
        setDetail(await growApi.getOpportunity(clientId, recommendationId));
      } catch {
        setError("A lehetőség részletei nem tölthetők be.");
      }
    },
    [clientId],
  );

  const runResearch = async () => {
    setResearchBusy(true);
    setResearchNote(null);
    setError(null);
    try {
      const result = await growApi.runResearch(clientId, { idempotencyKey: crypto.randomUUID() });
      setResearchNote(
        result.replayed
          ? "A kutatási futás ismétlése — korábbi eredmény visszaadva."
          : `Kutatási futás kész — ${result.recommendationCount} javaslat emberi jóváhagyásra vár.`,
      );
      await load();
    } catch {
      setError("A kutatási futás nem indítható el.");
    } finally {
      setResearchBusy(false);
    }
  };

  const clientTasks = tasks;
  const nav: Array<{ id: GrowScreen; label: string; disabled?: boolean }> = [
    { id: "home", label: "1. Áttekintés" },
    { id: "feed", label: "2. Javítási lehetőségek" },
    { id: "detail", label: "3. Részletek", disabled: !selectedId },
    { id: "progress", label: "4. Folyamatban" },
    { id: "results", label: "5. Eredmények" },
  ];

  return (
    <div className="space-y-6" data-testid="grow-journey">
      {/* Editorial Hero Banner */}
      <header className="relative overflow-hidden rounded-3xl border border-[#e8ded1] bg-[#faf6ee] p-6 sm:p-8 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2d5a43]/30 bg-[#2d5a43]/10 px-2.5 py-0.5 text-[10.5px] font-semibold tracking-wider text-[#1b382b] uppercase">
                <svg className="h-3 w-3 text-[#2d5a43]" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Grow with us · Belső munkafolyamat
              </span>
            </div>
            <h1 className="mt-2 font-serif text-2xl sm:text-3xl text-[#1b382b] tracking-tight">Hogyan működik most a céged?</h1>
            <p className="mt-2 text-sm text-[#556052] leading-relaxed">
              Megmutatjuk, hol érdemes körülnézni, és miért — <span className="font-semibold text-[#1b382b]">{clientName}</span>.
            </p>
            <div className="mt-3">
              <Link href={`/clients/${clientId}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2d5a43] hover:text-[#1b382b] transition-colors">
                ← Vissza az ügyfél dossziéhoz
              </Link>
            </div>
          </div>
          <div className="hidden sm:flex h-16 w-16 items-center justify-center rounded-2xl border border-[#e8ded1] bg-white text-[#2d5a43] shadow-xs">
            <svg className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
        </div>
      </header>

      {/* Pill Navigation */}
      <nav className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#e8ded1] bg-white p-2 shadow-xs" aria-label="Grow lépései">
        {nav.map((item) => {
          const active = screen === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={() => setScreen(item.id)}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                active
                  ? "bg-[#1b382b] text-white shadow-xs"
                  : "bg-transparent text-[#556052] hover:bg-[#f7f4ed] hover:text-[#1b382b] disabled:opacity-40 disabled:hover:bg-transparent"
              }`}
              aria-current={active ? "step" : undefined}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-[#e8ded1] bg-white p-8 text-center text-sm text-[#788274]">
          Betöltés…
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          {screen === "home" ? (
            <GrowHomeScreen
              home={home}
              onShowFeed={() => setScreen("feed")}
              onRunResearch={() => void runResearch()}
              researchBusy={researchBusy}
              researchNote={researchNote}
              clientId={clientId}
              processes={processes}
              canRunResearch={home?.canRunResearch ?? false}
              onSubmitted={load}
              onOpenDetail={(id) => void openDetail(id)}
            />
          ) : null}
          {screen === "feed" ? (
            <GrowFeedScreen
              opportunities={opportunities}
              onOpenDetail={(id) => void openDetail(id)}
            />
          ) : null}
          {screen === "detail" ? (
            <GrowDetailScreen
              clientId={clientId}
              detail={detail}
              selectedId={selectedId}
              onChanged={load}
              processes={processes}
            />
          ) : null}
          {screen === "progress" ? (
            <GrowProgressScreen
              initiatives={initiatives}
              tasks={clientTasks}
            />
          ) : null}
          {screen === "results" ? (
            <GrowResultsScreen outcomes={outcomes} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/* ---------------------------------- Screen 1: Home ------------------------------ */

function GrowHomeScreen({
  home,
  onShowFeed,
  onRunResearch,
  researchBusy,
  researchNote,
  clientId,
  processes,
  canRunResearch,
  onSubmitted,
  onOpenDetail,
}: {
  home: GrowHomeSummary | null;
  onShowFeed: () => void;
  onRunResearch: () => void;
  researchBusy: boolean;
  researchNote: string | null;
  clientId: string;
  processes: BusinessProcessDTO[];
  canRunResearch: boolean;
  onSubmitted: () => void;
  onOpenDetail: (id: string) => void;
}) {
  const counts = home?.opportunityCounts;
  const processWithSteps = processes.find((p) => (p.steps?.length ?? 0) > 0);

  return (
    <div className="space-y-6">
      {/* Horizontal Status Strip */}
      <div className="rounded-3xl border border-[#e8ded1] bg-white p-5 sm:p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0ece1] pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#667062]">Diagnosztikai állapot</p>
            <h2 className="font-serif text-lg font-bold text-[#1b382b]">Hol érdemes körülnézni?</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onShowFeed}
              className="rounded-xl bg-[#1b382b] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#2d5a43] transition-colors focus-visible:outline focus-visible:outline-2"
            >
              Mutasd, min érdemes javítani
            </button>
            {canRunResearch ? (
              <button
                type="button"
                onClick={onRunResearch}
                disabled={researchBusy}
                className="rounded-xl border border-[#1b382b] bg-white px-4 py-2 text-xs font-semibold text-[#1b382b] hover:bg-[#faf6ee] disabled:opacity-40 transition-colors focus-visible:outline focus-visible:outline-2"
              >
                {researchBusy ? "Kutatás fut…" : "Új mérési és kutatási futás"}
              </button>
            ) : (
              <p className="text-[11px] text-[#667062]">
                Kutatási futást csak vezető (admin vagy partner) indíthat.
              </p>
            )}
          </div>
        </div>

        {counts ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Nyitott lehetőség" value={counts.total} />
            <StatTile label="Alátámasztott" value={counts.supported} highlight />
            <StatTile label="Bizonyítékkal" value={counts.evidenceBacked} />
            <StatTile label="Méréssel alátámasztott" value={counts.measurementBacked} />
            <StatTile label="Aktív kezdeményezés" value={home?.activeInitiatives.length ?? 0} />
            <StatTile label="Lezárt eredmény" value={home?.completedOutcomes.length ?? 0} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-[#788274]">Még nincs kutatási eredmény ehhez a céghez.</p>
        )}

        {researchNote ? (
          <p className="mt-3 rounded-xl border border-[#e8ded1] bg-[#faf6ee] p-3 text-xs text-[#2d5a43]" role="status">
            {researchNote}
          </p>
        ) : null}

        <p className="mt-3 text-[11px] text-[#788274]">
          Nincs érettségi pontszám. A rendszer rögzített megfigyelésekből, felmérési válaszokból, mérésekből és elérhető bizonyítékokból építkezik, azok forrását elkülönítve.
        </p>
      </div>

      {/* Two Columns: Left = Opportunities / Findings, Right = Grow Method Journey & Process Map */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Panel title="Legfontosabb lehetőségek" kicker="Kutatási és felmérési szintézis">
            {home && home.topOpportunities.length > 0 ? (
              <ul className="space-y-3">
                {home.topOpportunities.map((opp) => (
                  <li
                    key={opp.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e8ded1] bg-[#fcfbf9] p-4 transition-colors hover:border-[#2d5a43]/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#1b382b]">{opp.title}</p>
                      <p className="mt-0.5 text-xs text-[#556052]">
                        {domainTitleHu(opp.domainKey)}
                        {opp.businessProcess ? ` · ${opp.businessProcess.name}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${sufficiencyTone[opp.sufficiency]}`}>
                        {sufficiencyLabelHu(opp.sufficiency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenDetail(opp.id)}
                        className="text-xs font-semibold text-[#2d5a43] hover:text-[#1b382b] hover:underline"
                      >
                        Részletek →
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-2xl border border-[#e8ded1] bg-[#faf6ee]/50 p-5 text-xs text-[#556052] leading-relaxed">
                <p className="font-semibold text-[#1b382b]">Még nincsenek kiemelt lehetőségek</p>
                <p className="mt-1">
                  Amint kutatási futást indít vagy fájdalompontokat rögzít, a validált fejlesztési területek itt jelennek meg áttekinthető összefoglalóban.
                </p>
              </div>
            )}
          </Panel>

          {/* Process Map panel */}
          <Panel title="Folyamatok lépésről lépésre" kicker="Működési kontextus">
            {processes.length === 0 ? (
              <p className="text-sm text-[#788274]">Még nincs rögzített üzleti folyamat ehhez a céghez.</p>
            ) : processWithSteps ? (
              <div>
                <p className="mb-2 text-xs font-semibold text-[#1b382b]">{processWithSteps.name}</p>
                <GrowProcessMap steps={processWithSteps.steps ?? []} compact />
              </div>
            ) : (
              <p className="text-sm text-[#788274]">A folyamatokban még nincs rögzített lépés.</p>
            )}
            {processes.length > 1 ? (
              <p className="mt-3 text-[11px] text-[#788274]">
                További folyamatok: {processes.filter((p) => p.id !== processWithSteps?.id).map((p) => p.name).join(", ")}
              </p>
            ) : null}
          </Panel>
        </div>

        {/* Right Column: 5-stage Grow Method Journey Card */}
        <div className="space-y-6">
          <div className="rounded-3xl border border-[#e8ded1] bg-[#faf6ee]/80 p-6 sm:p-7 shadow-xs">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#667062]">Adminiculum Módszertan</p>
            <h3 className="mt-1 font-serif text-xl font-bold text-[#1b382b]">A fejlődés 5 mérföldköve</h3>
            <p className="mt-2 text-xs text-[#556052] leading-relaxed">
              Hogyan alakítjuk a megfigyelt működési réseket mérhető, rögzített üzleti eredménnyé:
            </p>

            <div className="mt-6 space-y-4">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1b382b] text-xs font-bold text-white">1</span>
                <div>
                  <h4 className="text-xs font-bold text-[#1b382b]">Feltárás</h4>
                  <p className="mt-0.5 text-xs text-[#556052] leading-relaxed">
                    Fájdalompontok és működési rések rögzítése a napi munkafolyamatokból.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1b382b] text-xs font-bold text-white">2</span>
                <div>
                  <h4 className="text-xs font-bold text-[#1b382b]">Elemzés</h4>
                  <p className="mt-0.5 text-xs text-[#556052] leading-relaxed">
                    Kutatási háttér és mérhető megfigyelések szintézise tényalapon.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1b382b] text-xs font-bold text-white">3</span>
                <div>
                  <h4 className="text-xs font-bold text-[#1b382b]">Tervezés</h4>
                  <p className="mt-0.5 text-xs text-[#556052] leading-relaxed">
                    Jóváhagyott, priorizált beavatkozási irányok meghatározása.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1b382b] text-xs font-bold text-white">4</span>
                <div>
                  <h4 className="text-xs font-bold text-[#1b382b]">Megvalósítás</h4>
                  <p className="mt-0.5 text-xs text-[#556052] leading-relaxed">
                    Felelősök, operatív feladatok és mérföldkövek végrehajtása.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1b382b] text-xs font-bold text-white">5</span>
                <div>
                  <h4 className="text-xs font-bold text-[#1b382b]">Eredmények</h4>
                  <p className="mt-0.5 text-xs text-[#556052] leading-relaxed">
                    Rögzített előtte/utána mérések és azok változása.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Operational Pain Intake */}
      <GrowIntake clientId={clientId} onSubmitted={onSubmitted} />
    </div>
  );
}

function StatTile({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3.5 transition-colors ${
        highlight
          ? "border-[#2d5a43]/40 bg-[#faf6ee]"
          : "border-[#e8ded1] bg-[#fcfbf9]"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#667062]">{label}</p>
      <p className="mt-1 font-serif text-2xl font-bold text-[#1b382b]">{value}</p>
    </div>
  );
}

/* ---------------------------------- Screen 2: Feed ------------------------------ */

function GrowFeedScreen({
  opportunities,
  onOpenDetail,
}: {
  opportunities: GrowOpportunityItem[];
  onOpenDetail: (id: string) => void;
}) {
  return (
    <Panel title="Hol érdemes javítani?" kicker="Feltárt és elemzett területek">
      {opportunities.length === 0 ? (
        <div className="rounded-2xl border border-[#e8ded1] bg-[#faf6ee]/50 p-6 text-sm text-[#556052]">
          Még nincs lehetőség-javaslat. Indítson kutatási futást, vagy rögzítsen bejelentést az Áttekintés lépésben.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {opportunities.map((opp) => (
            <article
              key={opp.id}
              className="flex flex-col justify-between rounded-2xl border border-[#e8ded1] bg-white p-5 shadow-xs transition-colors hover:border-[#2d5a43]/40"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-serif text-base font-bold text-[#1b382b]">{opp.title}</h3>
                    <p className="mt-0.5 text-xs text-[#556052]">
                      {domainTitleHu(opp.domainKey)}
                      {opp.businessProcess ? ` · ${opp.businessProcess.name}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[#e8ded1] bg-[#fcfbf9] px-2.5 py-0.5 text-[10px] font-medium text-[#667062]">
                    {kindLabelHu(opp.kind)}
                  </span>
                </div>
                <p className="mt-3 text-xs text-[#333e30] leading-relaxed">{opp.problemStatement}</p>
                <p className="mt-2 text-xs text-[#556052] leading-relaxed">{opp.direction}</p>
                {opp.impactTags.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {opp.impactTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-[#faf6ee] border border-[#e8ded1] px-2.5 py-0.5 text-[10px] font-medium text-[#556052]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#f0ece1] pt-3.5">
                <div className="flex gap-1.5">
                  <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${sufficiencyTone[opp.sufficiency]}`}>
                    {sufficiencyLabelHu(opp.sufficiency)}
                  </span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${strengthTone[opp.evidenceStrength] ?? strengthTone.WEAK}`}>
                    {evidenceStrengthLabelHu(opp.evidenceStrength)}
                  </span>
                </div>
                {opp.sufficiency === "SUPPORTED" ? (
                  <button
                    type="button"
                    onClick={() => onOpenDetail(opp.id)}
                    className="rounded-xl bg-[#1b382b] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#2d5a43] transition-colors"
                  >
                    Megnézem →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenDetail(opp.id)}
                    className="text-xs font-semibold text-[#556052] hover:text-[#1b382b] hover:underline"
                  >
                    Részletek →
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ---------------------------------- Screen 3: Detail ------------------------------ */

function GrowDetailScreen({
  clientId,
  detail,
  selectedId,
  onChanged,
  processes,
}: {
  clientId: string;
  detail: GrowOpportunityDetail | null;
  selectedId: string | null;
  onChanged: () => Promise<void>;
  processes: BusinessProcessDTO[];
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const process = useMemo(
    () => processes.find((p) => p.id === detail?.diagnosis?.businessProcess?.id) ?? null,
    [processes, detail],
  );

  if (!selectedId) {
    return (
      <Panel title="Részletek">
        <p className="text-sm text-[#788274]">Válasszon egy lehetőséget a listából.</p>
      </Panel>
    );
  }
  if (!detail) {
    return (
      <Panel title="Részletek">
        <p className="text-sm text-[#788274]">Betöltés…</p>
      </Panel>
    );
  }

  const pending = detail.status === "PENDING_REVIEW";
  const accepted = !!detail.opportunity;

  const decide = async (decision: "ACCEPT" | "DECLINE" | "REQUEST_MORE_INFO") => {
    setBusy(decision);
    setLocalError(null);
    setMessage(null);
    try {
      await growApi.reviewOpportunity(clientId, detail.id, decision, note || undefined);
      setMessage(
        decision === "ACCEPT"
          ? "Elfogadva — javítási lehetőség létrejött. A kezdeményezés külön lépés."
          : decision === "DECLINE"
            ? "Elutasítva."
            : "További információ kérve — a javaslat várakozó állapotba került.",
      );
      await onChanged();
    } catch {
      setLocalError("A döntés rögzítése nem sikerült.");
    } finally {
      setBusy(null);
    }
  };

  const startInitiative = async () => {
    if (!detail.opportunity) return;
    setBusy("initiative");
    setLocalError(null);
    try {
      await growApi.startInitiative(clientId, detail.opportunity.id, {});
      setMessage("Kezdeményezés létrehozva — a Fejlesztés folyamatban lépésben követheti.");
      await onChanged();
    } catch {
      setLocalError("A kezdeményezés indítása nem sikerült.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-[#e8ded1] bg-[#faf6ee] p-6 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#667062]">{kindLabelHu(detail.kind)}</p>
            <h2 className="mt-1 font-serif text-xl sm:text-2xl text-[#1b382b]">{detail.title}</h2>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${sufficiencyTone[detail.sufficiency]}`}>
            {sufficiencyLabelHu(detail.sufficiency)}
          </span>
        </div>
      </header>

      {sufficiencyExplanationHu(detail.sufficiency) ? (
        <div className="rounded-2xl border border-[#e8ded1] bg-white p-4 text-xs text-[#556052] leading-relaxed shadow-xs" role="note">
          {sufficiencyExplanationHu(detail.sufficiency)}
        </div>
      ) : null}

      <Panel title="Mit látunk?">
        <p className="text-sm text-[#1b382b] leading-relaxed">{detail.diagnosis?.summary ?? detail.problemStatement}</p>
        {detail.diagnosis?.businessProcess ? (
          <p className="mt-2 text-xs text-[#556052]">Folyamat: {detail.diagnosis.businessProcess.name}</p>
        ) : null}
        {process?.steps?.length ? (
          <div className="mt-4 border-t border-[#f0ece1] pt-4">
            <GrowProcessMap steps={process.steps} compact />
          </div>
        ) : null}
      </Panel>

      <Panel title="Mi lehet az oka?">
        <p className="text-sm text-[#1b382b] leading-relaxed">{detail.problemStatement}</p>
      </Panel>

      <Panel title="Mit érdemes megvizsgálni?">
        <p className="text-sm text-[#1b382b] leading-relaxed">{detail.direction}</p>
        {detail.interventionCodes.length ? (
          <div className="mt-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#667062]">Szóba jövő beavatkozások</p>
            <ul className="mt-2 list-disc pl-5 text-xs text-[#1b382b] space-y-1">
              {detail.interventionCodes.map((code) => (
                <li key={code}>{interventionLabelHu(code)}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {detail.impactTags.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {detail.impactTags.map((tag) => (
              <span key={tag} className="rounded-full bg-[#faf6ee] border border-[#e8ded1] px-2.5 py-0.5 text-[10px] text-[#556052]">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </Panel>

      <Panel title="Miért ezeket?">
        <button
          type="button"
          onClick={() => setDrawerOpen((v) => !v)}
          className="rounded-xl border border-[#e8ded1] bg-[#faf6ee] px-4 py-2 text-xs font-semibold text-[#1b382b] hover:bg-white transition-colors"
          aria-expanded={drawerOpen}
        >
          {drawerOpen ? "Bizonyíték fiók bezárása" : `Bizonyítékok (${detail.evidence.length})`}
        </button>
        {drawerOpen ? <EvidenceDrawer evidence={detail.evidence} /> : null}
      </Panel>

      <Panel title="Döntés">
        {pending ? (
          <>
            <label className="block text-xs font-semibold text-[#556052]">
              Megjegyzés a döntéshez (opcionális)
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#e8ded1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs text-[#1b382b] focus:border-[#2d5a43] focus:outline-none"
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={busy !== null || detail.sufficiency !== "SUPPORTED"}
                onClick={() => void decide("ACCEPT")}
                className="rounded-xl bg-[#1b382b] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2d5a43] disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
              >
                {busy === "ACCEPT" ? "Rögzítés…" : "Elfogadom"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void decide("DECLINE")}
                className="rounded-xl border border-[#e8ded1] bg-white px-4 py-2 text-xs font-semibold text-[#1b382b] hover:bg-[#faf6ee] disabled:opacity-40 transition-colors"
              >
                Nem kérem
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void decide("REQUEST_MORE_INFO")}
                className="rounded-xl border border-amber-400 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-40 transition-colors"
              >
                További információ kell
              </button>
            </div>
            {detail.sufficiency !== "SUPPORTED" ? (
              <p className="mt-2 text-[11px] text-[#788274]">
                Csak az „Alátámasztott” javaslat fogadható el — ehhez a javaslathoz több vagy ellenőrzött bizonyíték kell.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-[#1b382b]">
            Döntés rögzítve{detail.review?.byName ? ` — ${detail.review.byName}` : ""}{detail.review?.at ? ` (${new Date(detail.review.at).toLocaleDateString("hu-HU")})` : ""}.
            {detail.review?.note ? <span className="mt-1 block text-xs text-[#556052]">„{detail.review.note}”</span> : null}
          </p>
        )}
        {accepted ? (
          <div className="mt-4 rounded-2xl border border-[#2d5a43]/30 bg-[#2d5a43]/5 p-4">
            <p className="text-xs font-medium text-[#1b382b]">
              Javítási lehetőség állapota: {detail.opportunity?.status === "INITIATIVE_STARTED" ? "kezdeményezés indítva" : detail.opportunity?.status === "OUTCOME_RECORDED" ? "eredmény rögzítve" : "nyitott"}
            </p>
            {detail.opportunity && detail.opportunity.status === "OPEN" ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void startInitiative()}
                className="mt-3 rounded-xl border border-[#1b382b] bg-white px-4 py-2 text-xs font-semibold text-[#1b382b] hover:bg-[#faf6ee] transition-colors"
              >
                {busy === "initiative" ? "Indítás…" : "Kezdeményezés indítása"}
              </button>
            ) : null}
          </div>
        ) : null}
        {message ? <p className="mt-3 text-xs font-semibold text-[#2d5a43]" role="status">{message}</p> : null}
        {localError ? <p className="mt-3 text-xs text-[#c85a32]" role="alert">{localError}</p> : null}
      </Panel>
    </div>
  );
}

function EvidenceDrawer({ evidence }: { evidence: GrowEvidenceItem[] }) {
  if (!evidence.length) {
    return <p className="mt-3 text-sm text-[#788274]">Ehhez a javaslathoz nincs csatolt bizonyíték.</p>;
  }
  return (
    <div className="mt-4 space-y-3" data-testid="evidence-drawer">
      {evidence.map((item) => (
        <article key={item.id} className="rounded-2xl border border-[#e8ded1] bg-[#fcfbf9] p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-xs font-semibold text-[#1b382b]">{item.title}</p>
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${item.verificationStatus === "VERIFIED" ? "border-[#2d5a43]/40 bg-[#2d5a43]/10 text-[#1b382b]" : "border-[#e8ded1] bg-white text-[#788274]"}`}>
              {item.verificationStatus === "VERIFIED" ? "Ellenőrzött" : "Nem ellenőrzött"}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-[minmax(90px,auto)_1fr] gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-[#667062]">Forrás</dt>
            <dd className="text-[#1b382b]">{[item.authors, item.venue, item.year].filter(Boolean).join(" · ") || "—"}</dd>
            <dt className="text-[#667062]">Származás</dt>
            <dd className="text-[#1b382b]">{evidenceOriginLabelHu(item.origin)}</dd>
            <dt className="text-[#667062]">Típus</dt>
            <dd className="text-[#1b382b]">{item.evidenceType || item.kind}</dd>
            <dt className="text-[#667062]">Erősség</dt>
            <dd className="text-[#1b382b]">{evidenceStrengthLabelHu(item.strength)}</dd>
            {item.boundedClaim ? (
              <>
                <dt className="text-[#667062]">Állítás</dt>
                <dd className="text-[#1b382b]">{item.boundedClaim}</dd>
              </>
            ) : null}
            {item.applicabilityNotes ? (
              <>
                <dt className="text-[#667062]">Alkalmazhatóság</dt>
                <dd className="text-[#1b382b]">{item.applicabilityNotes}</dd>
              </>
            ) : null}
            {item.limitations ? (
              <>
                <dt className="text-[#667062]">Korlátok</dt>
                <dd className="text-[#1b382b]">{item.limitations}</dd>
              </>
            ) : null}
            {item.locator || item.doi ? (
              <>
                <dt className="text-[#667062]">Elérhetőség</dt>
                <dd className="break-all text-[#1b382b]">
                  {item.doi ? <span className="mr-2">DOI: {item.doi}</span> : null}
                  {item.locator ? <span>{item.locator}</span> : null}
                </dd>
              </>
            ) : null}
          </dl>
        </article>
      ))}
    </div>
  );
}

/* ---------------------------------- Screen 4: Progress ------------------------------ */

function GrowProgressScreen({
  initiatives,
  tasks,
}: {
  initiatives: DevelopmentInitiative[];
  tasks: TaskLifecycleListItem[];
}) {
  const active = initiatives.filter((i) => ["PLANNED", "ACTIVE", "ON_HOLD"].includes(i.status));
  const closed = initiatives.filter((i) => ["COMPLETED", "CANCELLED"].includes(i.status));
  const openTasks = tasks.filter((t) => !["DONE", "COMPLETED", "CANCELLED"].includes(String(t.status).toUpperCase()));

  return (
    <Panel title="Fejlesztés folyamatban" kicker="Kezdeményezések és feladatok">
      {active.length === 0 && closed.length === 0 ? (
        <p className="text-sm text-[#788274]">Még nincs fejlesztési kezdeményezés ehhez a céghez.</p>
      ) : (
        <div className="space-y-4">
          {active.map((initiative) => {
            const linkedTasks = openTasks.filter((t) => initiative.caseId && t.case.id === initiative.caseId);
            return (
              <article key={initiative.id} className="rounded-2xl border border-[#e8ded1] bg-white p-5 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-serif text-base font-bold text-[#1b382b]">{initiative.title}</p>
                  <span className="rounded-full border border-[#e8ded1] bg-[#faf6ee] px-2.5 py-0.5 text-[10px] font-semibold text-[#556052]">
                    {initiativeStatusLabel(initiative.status)}
                  </span>
                </div>
                {initiative.targetState ? (
                  <p className="mt-1.5 text-xs text-[#556052]">Cél: {initiative.targetState}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#788274]">
                  <span>{linkedTasks.length} nyitott kapcsolódó feladat</span>
                  {initiative.caseId ? (
                    <Link
                      href={`/cases/${encodeURIComponent(initiative.caseId)}`}
                      className="font-semibold text-[#2d5a43] hover:text-[#1b382b] hover:underline"
                    >
                      Ügy megnyitása →
                    </Link>
                  ) : (
                    <span>Nincs kapcsolt ügy — a feladatok az ügyekhez kapcsolódnak.</span>
                  )}
                </div>
                {linkedTasks.length ? (
                  <ul className="mt-3 space-y-1.5 border-t border-[#f0ece1] pt-3">
                    {linkedTasks.slice(0, 5).map((task) => (
                      <li key={task.id} className="text-xs text-[#1b382b]">
                        <Link href={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="hover:underline font-medium">
                          {task.title}
                        </Link>
                        <span className="ml-2 text-[#788274]">{task.status}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            );
          })}
          {closed.length ? (
            <p className="text-xs text-[#788274]">
              Lezárt kezdeményezések: {closed.map((i) => i.title).join(", ")}
            </p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

/* ---------------------------------- Screen 5: Results ------------------------------ */

function GrowResultsScreen({ outcomes }: { outcomes: OutcomeMeasurementDTO[] }) {
  return (
    <Panel title="Mit értünk el?" kicker="Rögzített eredmények és hatások">
      {outcomes.length === 0 ? (
        <div className="rounded-2xl border border-[#e8ded1] bg-[#faf6ee]/50 p-6 text-sm text-[#556052] leading-relaxed">
          Még nincs rögzített eredmény. Az eredmények az elfogadott lehetőségek előtte/utána méréséből származnak — ugyanannál a cégnél, ugyanahhoz a folyamathoz.
        </div>
      ) : (
        <div className="space-y-4">
          {outcomes.map((outcome) => (
            <article key={outcome.id} className="rounded-2xl border border-[#e8ded1] bg-white p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-serif text-base font-bold text-[#1b382b]">
                  {outcome.opportunityTitle ?? outcome.businessProcess?.name ?? "Eredmény"}
                </p>
                <div className="flex gap-1.5">
                  <span className="rounded-full border border-[#e8ded1] bg-[#faf6ee] px-2.5 py-0.5 text-[10px] font-semibold text-[#1b382b]">
                    {outcomeBasisLabelHu(outcome.basis)}
                  </span>
                  {outcome.synthetic ? (
                    <span className="rounded-full border border-amber-400 bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-950">
                      Szintetikus tesztadat
                    </span>
                  ) : null}
                </div>
              </div>
              {outcome.metricsSummary?.before ? (
                <BeforeAfterTable summary={outcome.metricsSummary} />
              ) : null}
              {outcome.roi ? <RoiBlock roi={outcome.roi} /> : null}
              {outcome.note ? <p className="mt-3 text-xs text-[#556052]">{outcome.note}</p> : null}
              <p className="mt-3 text-[11px] text-[#788274]">
                Rögzítette: {outcome.recordedBy?.name ?? "—"} · {new Date(outcome.createdAt).toLocaleDateString("hu-HU")}
                {outcome.initiative ? ` · ${outcome.initiative.title}` : ""}
              </p>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

function BeforeAfterTable({ summary }: { summary: NonNullable<OutcomeMeasurementDTO["metricsSummary"]> }) {
  const before = summary.before ?? {};
  const after = summary.after ?? null;
  const rows = ["TOTAL_ACTIVE_MINUTES", "TOTAL_WAITING_MINUTES", "TOTAL_CYCLE_MINUTES"].filter(
    (k) => before[k] != null || after?.[k] != null,
  );
  if (!rows.length) return null;
  const labels: Record<string, string> = {
    TOTAL_ACTIVE_MINUTES: "Aktív idő",
    TOTAL_WAITING_MINUTES: "Várakozási idő",
    TOTAL_CYCLE_MINUTES: "Teljes átfutási idő",
  };
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-[#f0ece1] text-[10px] font-bold uppercase tracking-wider text-[#667062]">
            <th className="pb-2">Mutató</th>
            <th className="pb-2 text-right">Előtte</th>
            <th className="pb-2 text-right">Most</th>
            <th className="pb-2 text-right">Változás</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f0ece1]">
          {rows.map((key) => {
            const b = before[key];
            const a = after?.[key];
            const hasDelta = b != null && a != null;
            const delta = hasDelta ? b - a : null;
            return (
              <tr key={key}>
                <td className="py-2 text-[#556052]">{labels[key]}</td>
                <td className="py-2 text-right font-medium text-[#1b382b]">{b != null ? `${Math.round(b)} p` : "—"}</td>
                <td className="py-2 text-right font-medium text-[#1b382b]">{a != null ? `${Math.round(a)} p` : "—"}</td>
                <td
                  className={`py-2 text-right font-semibold ${
                    delta != null && delta > 0
                      ? "text-[#2d5a43]"
                      : delta != null && delta < 0
                        ? "text-[#c85a32]"
                        : "text-[#788274]"
                  }`}
                >
                  {delta == null ? "—" : delta === 0 ? "0 p" : `${delta > 0 ? "−" : "+"}${Math.abs(Math.round(delta))} p`}
                </td>
              </tr>
            );
          })}
        </tbody>
        {summary.comparable === false ? (
          <tfoot>
            <tr>
              <td colSpan={4} className="pt-2 text-[10px] text-amber-900">
                A két mérés mérőszám-verziója eltér — a különbség óvatosan értelmezhető.
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

function RoiBlock({ roi }: { roi: NonNullable<OutcomeMeasurementDTO["roi"]> }) {
  const [open, setOpen] = useState(false);
  const time = roi.timeSavedMinutesPerMonth;
  const cash = roi.cashSavedHufPerMonth;
  const fmt = (v: { low: number; base: number; high: number } | null | undefined, unit: string) =>
    v ? `${Math.round(v.low)}–${Math.round(v.base)}–${Math.round(v.high)} ${unit}` : "—";

  return (
    <div className="mt-4 rounded-2xl border border-[#e8ded1] bg-[#faf6ee]/70 p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#667062]">
        Becsült hatás (alacsony / közép / magas)
      </p>
      <div className="mt-2 grid gap-1 text-xs text-[#1b382b]">
        <p>
          Megtakarított idő / hónap: <span className="font-bold">{fmt(time, "perc")}</span>
        </p>
        <p>
          Megtakarított költség / hónap: <span className="font-bold">{cash ? fmt(cash, "Ft") : "nem becsülhető"}</span>
        </p>
      </div>
      <p className="mt-2 text-[10.5px] font-semibold text-amber-950">
        A megtakarított idő nem egyenlő pénzmegtakarítással.
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2 text-xs font-semibold text-[#2d5a43] hover:text-[#1b382b] hover:underline"
        aria-expanded={open}
      >
        Hogyan számoltuk?
      </button>
      {open && roi.provenance ? (
        <dl className="mt-3 grid grid-cols-[minmax(90px,auto)_1fr] gap-x-3 gap-y-1.5 border-t border-[#e8ded1] pt-3 text-[11px]">
          <dt className="text-[#667062]">Alap</dt>
          <dd className="text-[#1b382b]">{outcomeBasisLabelHu(roi.basis)}</dd>
          <dt className="text-[#667062]">Származás</dt>
          <dd className="text-[#1b382b]">{roiProvenanceLabelHu(roi.provenanceType ?? roi.provenance?.type)}</dd>
          <dt className="text-[#667062]">Képlet</dt>
          <dd className="text-[#1b382b]">{roi.provenance.formulaVersion}</dd>
          <dt className="text-[#667062]">Számítva</dt>
          <dd className="text-[#1b382b]">{new Date(roi.provenance.computedAt).toLocaleString("hu-HU")}</dd>
          <dt className="text-[#667062]">Magyarázat</dt>
          <dd className="text-[#1b382b]">{roi.provenance.explanationHu}</dd>
        </dl>
      ) : null}
    </div>
  );
}
