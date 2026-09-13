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

const SCREEN_LABELS: Record<GrowScreen, string> = {
  home: "Áttekintés",
  feed: "Hol érdemes javítani?",
  detail: "Részletek",
  progress: "Fejlesztés folyamatban",
  results: "Mit értünk el?",
};

const sufficiencyTone: Record<SufficiencyDecision, string> = {
  SUPPORTED: "border-[var(--adm-green-800)]/40 bg-[var(--adm-green-800)]/10 text-[var(--adm-green-800)]",
  NEEDS_MORE_DATA: "border-[var(--adm-amber-500)]/40 bg-[var(--adm-amber-100)] text-[var(--adm-amber-950)]",
  INSUFFICIENT_EVIDENCE: "border-[var(--adm-border)] bg-[var(--adm-surface)] text-[var(--adm-text-muted)]",
  CONFLICTING_EVIDENCE: "border-[var(--adm-terracotta-700)]/50 bg-[var(--adm-terracotta-700)]/10 text-[var(--adm-terracotta-700)]",
  OUT_OF_SCOPE: "border-[var(--adm-border)] bg-[var(--adm-surface)] text-[var(--adm-text-muted)]",
  HUMAN_DOMAIN_REVIEW: "border-[var(--adm-ochre-500)]/50 bg-[var(--adm-amber-100)] text-[var(--adm-amber-950)]",
};

const strengthTone: Record<string, string> = {
  STRONG: "border-[var(--adm-green-800)]/40 bg-[var(--adm-green-800)]/10 text-[var(--adm-green-800)]",
  MODERATE: "border-[var(--adm-amber-500)]/40 bg-[var(--adm-amber-100)] text-[var(--adm-amber-950)]",
  WEAK: "border-[var(--adm-border)] bg-[var(--adm-surface)] text-[var(--adm-text-muted)]",
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-5">
      <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">{title}</h2>
      <div className="mt-3">{children}</div>
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
    <div className="space-y-5" data-testid="grow-journey">
      <header className="rounded-[var(--adm-radius-md)] border border-[#DCCCA6] bg-[var(--adm-sand-100)] p-5">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Grow with us</p>
        <h1 className="mt-1 font-serif text-2xl text-[var(--adm-text)]">Hogyan működik most a céged?</h1>
        <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
          Megmutatjuk, hol érdemes körülnézni, és miért — {clientName}.
        </p>
        <Link href={`/clients/${clientId}`} className="mt-3 inline-block text-xs text-[var(--adm-ochre-500)] hover:underline">
          ← Vissza az ügyfél dossziéhoz
        </Link>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Grow lépései">
        {nav.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            onClick={() => setScreen(item.id)}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
              screen === item.id
                ? "border-[var(--adm-green-800)] bg-[var(--adm-green-800)] text-white"
                : "border-[var(--adm-border)] bg-white text-[var(--adm-text)] disabled:opacity-40"
            }`}
            aria-current={screen === item.id ? "step" : undefined}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
      {loading ? <p className="text-sm text-[var(--adm-text-muted)]">Betöltés…</p> : null}

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
          {screen === "feed" ? <GrowFeedScreen opportunities={opportunities} onOpenDetail={(id) => void openDetail(id)} /> : null}
          {screen === "detail" ? (
            <GrowDetailScreen
              clientId={clientId}
              detail={detail}
              selectedId={selectedId}
              onChanged={load}
              processes={processes}
            />
          ) : null}
          {screen === "progress" ? <GrowProgressScreen initiatives={initiatives} tasks={clientTasks} /> : null}
          {screen === "results" ? <GrowResultsScreen outcomes={outcomes} /> : null}
        </>
      ) : null}
    </div>
  );
}

/* ---------------------------------- Screen 1 ------------------------------ */

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
    <div className="space-y-5">
      <Panel title="Hol érdemes körülnézni">
        {counts ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Nyitott lehetőség" value={counts.total} />
            <StatTile label="Alátámasztott" value={counts.supported} />
            <StatTile label="Bizonyítékkal" value={counts.evidenceBacked} />
            <StatTile label="Méréssel alátámasztott" value={counts.measurementBacked} />
            <StatTile label="Aktív kezdeményezés" value={home?.activeInitiatives.length ?? 0} />
            <StatTile label="Lezárt eredmény" value={home?.completedOutcomes.length ?? 0} />
          </div>
        ) : (
          <p className="text-sm text-[var(--adm-text-muted)]">Még nincs kutatási eredmény ehhez a céghez.</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onShowFeed}
            className="rounded-[var(--adm-radius-sm)] bg-[var(--adm-green-800)] px-4 py-2 text-[12px] font-semibold text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2"
          >
            Mutasd, min érdemes javítani
          </button>
          {canRunResearch ? (
            <button
              type="button"
              onClick={onRunResearch}
              disabled={researchBusy}
              className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-green-800)] px-4 py-2 text-[12px] font-semibold text-[var(--adm-green-800)] hover:bg-[var(--adm-surface)] disabled:opacity-40 focus-visible:outline focus-visible:outline-2"
            >
              {researchBusy ? "Kutatás fut…" : "Új mérési és kutatási futás"}
            </button>
          ) : (
            <p className="text-[11px] text-[var(--adm-text-muted)]">
              Kutatási futást csak vezető (admin vagy partner) indíthat.
            </p>
          )}
        </div>
        {researchNote ? <p className="mt-2 text-[12px] text-[var(--adm-text-muted)]" role="status">{researchNote}</p> : null}
        <p className="mt-3 text-[10.5px] text-[var(--adm-text-muted)]">
          Nincs érettségi pontszám — csak mérhető megfigyelések és ellenőrzött források alapján jelölt területek.
        </p>
      </Panel>

      {home && home.topOpportunities.length > 0 ? (
        <Panel title="Legfontosabb lehetőségek">
          <ul className="space-y-2">
            {home.topOpportunities.map((opp) => (
              <li key={opp.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--adm-border)] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-[var(--adm-text)]">{opp.title}</p>
                  <p className="text-[11px] text-[var(--adm-text-muted)]">{domainTitleHu(opp.domainKey)}{opp.businessProcess ? ` · ${opp.businessProcess.name}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${sufficiencyTone[opp.sufficiency]}`}>{sufficiencyLabelHu(opp.sufficiency)}</span>
                  <button type="button" onClick={() => onOpenDetail(opp.id)} className="text-[11px] font-semibold text-[var(--adm-ochre-500)] hover:underline">
                    Részletek →
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <GrowIntake clientId={clientId} onSubmitted={onSubmitted} />
        <Panel title="Folyamatok lépésről lépésre">
          {processes.length === 0 ? (
            <p className="text-sm text-[var(--adm-text-muted)]">Még nincs rögzített üzleti folyamat ehhez a céghez.</p>
          ) : processWithSteps ? (
            <div>
              <p className="mb-2 text-[12px] font-semibold text-[var(--adm-text)]">{processWithSteps.name}</p>
              <GrowProcessMap steps={processWithSteps.steps ?? []} compact />
            </div>
          ) : (
            <p className="text-sm text-[var(--adm-text-muted)]">A folyamatokban még nincs rögzített lépés.</p>
          )}
          {processes.length > 1 ? (
            <p className="mt-3 text-[10.5px] text-[var(--adm-text-muted)]">
              További folyamatok: {processes.filter((p) => p.id !== processWithSteps?.id).map((p) => p.name).join(", ")}
            </p>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2.5">
      <p className="text-[9.5px] uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">{label}</p>
      <p className="mt-0.5 font-serif text-xl text-[var(--adm-text)]">{value}</p>
    </div>
  );
}

/* ---------------------------------- Screen 2 ------------------------------ */

function GrowFeedScreen({ opportunities, onOpenDetail }: { opportunities: GrowOpportunityItem[]; onOpenDetail: (id: string) => void }) {
  return (
    <Panel title="Hol érdemes javítani?">
      {opportunities.length === 0 ? (
        <p className="text-sm text-[var(--adm-text-muted)]">Még nincs lehetőség-javaslat. Indítson kutatási futást, vagy rögzítsen bejelentést az Áttekintés lépésben.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {opportunities.map((opp) => (
            <article key={opp.id} className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-[13px] font-semibold text-[var(--adm-text)]">{opp.title}</h3>
                  <p className="mt-0.5 text-[11px] text-[var(--adm-text-muted)]">{domainTitleHu(opp.domainKey)}{opp.businessProcess ? ` · ${opp.businessProcess.name}` : ""}</p>
                </div>
                <span className="shrink-0 rounded-full border border-[var(--adm-border)] px-2 py-0.5 text-[9.5px] font-semibold text-[var(--adm-text-muted)]">{kindLabelHu(opp.kind)}</span>
              </div>
              <p className="mt-2 text-[12px] text-[var(--adm-text)]">{opp.problemStatement}</p>
              <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{opp.direction}</p>
              {opp.impactTags.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {opp.impactTags.map((tag) => (
                    <span key={tag} className="rounded-full bg-[var(--adm-surface)] px-2 py-0.5 text-[9.5px] text-[var(--adm-text-muted)]">{tag}</span>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--adm-border)] pt-2">
                <div className="flex gap-1.5">
                  <span className={`rounded-full border px-2 py-0.5 text-[9.5px] font-semibold ${sufficiencyTone[opp.sufficiency]}`}>{sufficiencyLabelHu(opp.sufficiency)}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[9.5px] font-semibold ${strengthTone[opp.evidenceStrength] ?? strengthTone.WEAK}`}>{evidenceStrengthLabelHu(opp.evidenceStrength)}</span>
                </div>
                {opp.sufficiency === "SUPPORTED" ? (
                  <button type="button" onClick={() => onOpenDetail(opp.id)} className="rounded-[var(--adm-radius-sm)] bg-[var(--adm-green-800)] px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-90">
                    Megnézem →
                  </button>
                ) : (
                  <button type="button" onClick={() => onOpenDetail(opp.id)} className="text-[11px] font-semibold text-[var(--adm-text-muted)] hover:underline">
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

/* ---------------------------------- Screen 3 ------------------------------ */

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
    return <Panel title="Részletek"><p className="text-sm text-[var(--adm-text-muted)]">Válasszon egy lehetőséget a listából.</p></Panel>;
  }
  if (!detail) {
    return <Panel title="Részletek"><p className="text-sm text-[var(--adm-text-muted)]">Betöltés…</p></Panel>;
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
    <div className="space-y-5">
      <header className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">{kindLabelHu(detail.kind)}</p>
            <h2 className="mt-1 font-serif text-xl text-[var(--adm-text)]">{detail.title}</h2>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${sufficiencyTone[detail.sufficiency]}`}>{sufficiencyLabelHu(detail.sufficiency)}</span>
        </div>
      </header>

      {sufficiencyExplanationHu(detail.sufficiency) ? (
        <p className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 text-[12px] text-[var(--adm-text)]" role="note">
          {sufficiencyExplanationHu(detail.sufficiency)}
        </p>
      ) : null}

      <Panel title="Mit látunk?">
        <p className="text-[13px] text-[var(--adm-text)]">{detail.diagnosis?.summary ?? detail.problemStatement}</p>
        {detail.diagnosis?.businessProcess ? (
          <p className="mt-2 text-[11px] text-[var(--adm-text-muted)]">Folyamat: {detail.diagnosis.businessProcess.name}</p>
        ) : null}
        {process?.steps?.length ? (
          <div className="mt-3 border-t border-[var(--adm-border)] pt-3">
            <GrowProcessMap steps={process.steps} compact />
          </div>
        ) : null}
      </Panel>

      <Panel title="Mi lehet az oka?">
        <p className="text-[13px] text-[var(--adm-text)]">{detail.problemStatement}</p>
      </Panel>

      <Panel title="Mit érdemes megvizsgálni?">
        <p className="text-[13px] text-[var(--adm-text)]">{detail.direction}</p>
        {detail.interventionCodes.length ? (
          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Szóba jövő beavatkozások</p>
            <ul className="mt-1 list-disc pl-4 text-[11px] text-[var(--adm-text)]">
              {detail.interventionCodes.map((code) => (
                <li key={code}>{interventionLabelHu(code)}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {detail.impactTags.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {detail.impactTags.map((tag) => (
              <span key={tag} className="rounded-full bg-[var(--adm-surface)] px-2 py-0.5 text-[10px] text-[var(--adm-text-muted)]">{tag}</span>
            ))}
          </div>
        ) : null}
      </Panel>

      <Panel title="Miért ezeket?">
        <button
          type="button"
          onClick={() => setDrawerOpen((v) => !v)}
          className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]"
          aria-expanded={drawerOpen}
        >
          {drawerOpen ? "Bizonyíték fiók bezárása" : `Bizonyítékok (${detail.evidence.length})`}
        </button>
        {drawerOpen ? <EvidenceDrawer evidence={detail.evidence} /> : null}
      </Panel>

      <Panel title="Döntés">
        {pending ? (
          <>
            <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">
              Megjegyzés a döntéshez (opcionális)
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]" />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy !== null || detail.sufficiency !== "SUPPORTED"}
                onClick={() => void decide("ACCEPT")}
                className="rounded-[var(--adm-radius-sm)] bg-[var(--adm-green-800)] px-4 py-2 text-[12px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === "ACCEPT" ? "Rögzítés…" : "Elfogadom"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void decide("DECLINE")}
                className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] px-4 py-2 text-[12px] font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)] disabled:opacity-40"
              >
                Nem kérem
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void decide("REQUEST_MORE_INFO")}
                className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-amber-500)]/60 px-4 py-2 text-[12px] font-semibold text-[var(--adm-amber-950)] hover:bg-[var(--adm-amber-100)] disabled:opacity-40"
              >
                További információ kell
              </button>
            </div>
            {detail.sufficiency !== "SUPPORTED" ? (
              <p className="mt-2 text-[10.5px] text-[var(--adm-text-muted)]">Csak az „Alátámasztott” javaslat fogadható el — ehhez a javaslathoz több vagy ellenőrzött bizonyíték kell.</p>
            ) : null}
          </>
        ) : (
          <p className="text-[13px] text-[var(--adm-text)]">
            Döntés rögzítve{detail.review?.byName ? ` — ${detail.review.byName}` : ""}{detail.review?.at ? ` (${new Date(detail.review.at).toLocaleDateString("hu-HU")})` : ""}.
            {detail.review?.note ? <span className="mt-1 block text-[11px] text-[var(--adm-text-muted)]">„{detail.review.note}”</span> : null}
          </p>
        )}
        {accepted ? (
          <div className="mt-3 rounded border border-[var(--adm-green-800)]/30 bg-[var(--adm-green-800)]/5 px-3 py-2">
            <p className="text-[12px] text-[var(--adm-text)]">
              Javítási lehetőség állapota: {detail.opportunity?.status === "INITIATIVE_STARTED" ? "kezdeményezés indítva" : detail.opportunity?.status === "OUTCOME_RECORDED" ? "eredmény rögzítve" : "nyitott"}
            </p>
            {detail.opportunity && detail.opportunity.status === "OPEN" ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void startInitiative()}
                className="mt-2 rounded-[var(--adm-radius-sm)] border border-[var(--adm-green-800)] px-3 py-1.5 text-[11px] font-semibold text-[var(--adm-green-800)] hover:bg-white"
              >
                {busy === "initiative" ? "Indítás…" : "Kezdeményezés indítása"}
              </button>
            ) : null}
          </div>
        ) : null}
        {message ? <p className="mt-2 text-[12px] font-semibold text-[var(--adm-green-800)]" role="status">{message}</p> : null}
        {localError ? <p className="mt-2 text-[12px] text-[var(--adm-terracotta-700)]" role="alert">{localError}</p> : null}
      </Panel>
    </div>
  );
}

function EvidenceDrawer({ evidence }: { evidence: GrowEvidenceItem[] }) {
  if (!evidence.length) {
    return <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Ehhez a javaslathoz nincs csatolt bizonyíték.</p>;
  }
  return (
    <div className="mt-3 space-y-2" data-testid="evidence-drawer">
      {evidence.map((item) => (
        <article key={item.id} className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)]/50 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-[12px] font-semibold text-[var(--adm-text)]">{item.title}</p>
            <span className={`rounded-full border px-2 py-0.5 text-[9.5px] font-semibold ${item.verificationStatus === "VERIFIED" ? "border-[var(--adm-green-800)]/40 bg-[var(--adm-green-800)]/10 text-[var(--adm-green-800)]" : "border-[var(--adm-border)] bg-white text-[var(--adm-text-muted)]"}`}>
              {item.verificationStatus === "VERIFIED" ? "Ellenőrzött" : "Nem ellenőrzött"}
            </span>
          </div>
          <dl className="mt-2 grid grid-cols-[minmax(90px,auto)_1fr] gap-x-3 gap-y-1 text-[11px]">
            <dt className="text-[var(--adm-text-muted)]">Forrás</dt>
            <dd>{[item.authors, item.venue, item.year].filter(Boolean).join(" · ") || "—"}</dd>
            <dt className="text-[var(--adm-text-muted)]">Származás</dt>
            <dd>{evidenceOriginLabelHu(item.origin)}</dd>
            <dt className="text-[var(--adm-text-muted)]">Típus</dt>
            <dd>{item.evidenceType || item.kind}</dd>
            <dt className="text-[var(--adm-text-muted)]">Erősség</dt>
            <dd>{evidenceStrengthLabelHu(item.strength)}</dd>
            {item.boundedClaim ? (
              <>
                <dt className="text-[var(--adm-text-muted)]">Állítás</dt>
                <dd>{item.boundedClaim}</dd>
              </>
            ) : null}
            {item.applicabilityNotes ? (
              <>
                <dt className="text-[var(--adm-text-muted)]">Alkalmazhatóság</dt>
                <dd>{item.applicabilityNotes}</dd>
              </>
            ) : null}
            {item.limitations ? (
              <>
                <dt className="text-[var(--adm-text-muted)]">Korlátok</dt>
                <dd>{item.limitations}</dd>
              </>
            ) : null}
            {item.locator || item.doi ? (
              <>
                <dt className="text-[var(--adm-text-muted)]">Elérhetőség</dt>
                <dd className="break-all">
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

/* ---------------------------------- Screen 4 ------------------------------ */

function GrowProgressScreen({ initiatives, tasks }: { initiatives: DevelopmentInitiative[]; tasks: TaskLifecycleListItem[] }) {
  const active = initiatives.filter((i) => ["PLANNED", "ACTIVE", "ON_HOLD"].includes(i.status));
  const closed = initiatives.filter((i) => ["COMPLETED", "CANCELLED"].includes(i.status));
  const openTasks = tasks.filter((t) => !["DONE", "COMPLETED", "CANCELLED"].includes(String(t.status).toUpperCase()));

  return (
    <Panel title="Fejlesztés folyamatban">
      {active.length === 0 && closed.length === 0 ? (
        <p className="text-sm text-[var(--adm-text-muted)]">Még nincs fejlesztési kezdeményezés ehhez a céghez.</p>
      ) : (
        <div className="space-y-3">
          {active.map((initiative) => {
            const linkedTasks = openTasks.filter((t) => initiative.caseId && t.case.id === initiative.caseId);
            return (
              <article key={initiative.id} className="rounded border border-[var(--adm-border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-[var(--adm-text)]">{initiative.title}</p>
                  <span className="rounded-full border border-[var(--adm-border)] bg-[var(--adm-surface)] px-2 py-0.5 text-[9.5px] font-semibold text-[var(--adm-text-muted)]">{initiativeStatusLabel(initiative.status)}</span>
                </div>
                {initiative.targetState ? <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Cél: {initiative.targetState}</p> : null}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[10.5px] text-[var(--adm-text-muted)]">
                  <span>{linkedTasks.length} nyitott kapcsolódó feladat</span>
                  {initiative.caseId ? (
                    <Link href={`/cases/${encodeURIComponent(initiative.caseId)}`} className="font-semibold text-[var(--adm-ochre-500)] hover:underline">
                      Ügy megnyitása →
                    </Link>
                  ) : (
                    <span>Nincs kapcsolt ügy — a feladatok az ügyekhez kapcsolódnak.</span>
                  )}
                </div>
                {linkedTasks.length ? (
                  <ul className="mt-2 space-y-1">
                    {linkedTasks.slice(0, 5).map((task) => (
                      <li key={task.id} className="text-[11px] text-[var(--adm-text)]">
                        <Link href={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="hover:underline">{task.title}</Link>
                        <span className="ml-2 text-[var(--adm-text-muted)]">{task.status}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            );
          })}
          {closed.length ? (
            <p className="text-[10.5px] text-[var(--adm-text-muted)]">Lezárt kezdeményezések: {closed.map((i) => i.title).join(", ")}</p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

/* ---------------------------------- Screen 5 ------------------------------ */

function GrowResultsScreen({ outcomes }: { outcomes: OutcomeMeasurementDTO[] }) {
  return (
    <Panel title="Mit értünk el?">
      {outcomes.length === 0 ? (
        <p className="text-sm text-[var(--adm-text-muted)]">Még nincs rögzített eredmény. Az eredmények az elfogadott lehetőségek előtte/utána méréséből származnak — ugyanannál a cégnél, ugyanahhoz a folyamathoz.</p>
      ) : (
        <div className="space-y-3">
          {outcomes.map((outcome) => (
            <article key={outcome.id} className="rounded border border-[var(--adm-border)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-[var(--adm-text)]">{outcome.opportunityTitle ?? outcome.businessProcess?.name ?? "Eredmény"}</p>
                <div className="flex gap-1.5">
                  <span className="rounded-full border border-[var(--adm-border)] bg-[var(--adm-surface)] px-2 py-0.5 text-[9.5px] font-semibold text-[var(--adm-text)]">{outcomeBasisLabelHu(outcome.basis)}</span>
                  {outcome.synthetic ? (
                    <span className="rounded-full border border-[var(--adm-amber-500)]/50 bg-[var(--adm-amber-100)] px-2 py-0.5 text-[9.5px] font-semibold text-[var(--adm-amber-950)]">Szintetikus tesztadat</span>
                  ) : null}
                </div>
              </div>
              {outcome.metricsSummary?.before ? (
                <BeforeAfterTable summary={outcome.metricsSummary} />
              ) : null}
              {outcome.roi ? <RoiBlock roi={outcome.roi} /> : null}
              {outcome.note ? <p className="mt-2 text-[11px] text-[var(--adm-text-muted)]">{outcome.note}</p> : null}
              <p className="mt-2 text-[9.5px] text-[var(--adm-text-muted)]">
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
  const rows = ["TOTAL_ACTIVE_MINUTES", "TOTAL_WAITING_MINUTES", "TOTAL_CYCLE_MINUTES"].filter((k) => before[k] != null || after?.[k] != null);
  if (!rows.length) return null;
  const labels: Record<string, string> = {
    TOTAL_ACTIVE_MINUTES: "Aktív idő",
    TOTAL_WAITING_MINUTES: "Várakozási idő",
    TOTAL_CYCLE_MINUTES: "Teljes átfutási idő",
  };
  return (
    <table className="mt-3 w-full text-left text-[11px]">
      <thead>
        <tr className="text-[9.5px] uppercase tracking-[0.1em] text-[var(--adm-text-muted)]">
          <th className="pb-1">Mutató</th>
          <th className="pb-1 text-right">Előtte</th>
          <th className="pb-1 text-right">Most</th>
          <th className="pb-1 text-right">Változás</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--adm-border)]">
        {rows.map((key) => {
          const b = before[key];
          const a = after?.[key];
          const hasDelta = b != null && a != null;
          const delta = hasDelta ? b - a : null;
          return (
            <tr key={key}>
              <td className="py-1 text-[var(--adm-text-muted)]">{labels[key]}</td>
              <td className="py-1 text-right font-medium">{b != null ? `${Math.round(b)} p` : "—"}</td>
              <td className="py-1 text-right font-medium">{a != null ? `${Math.round(a)} p` : "—"}</td>
              <td className={`py-1 text-right font-semibold ${delta != null && delta > 0 ? "text-[var(--adm-green-800)]" : delta != null && delta < 0 ? "text-[var(--adm-terracotta-700)]" : "text-[var(--adm-text-muted)]"}`}>
                {delta == null ? "—" : delta === 0 ? "0 p" : `${delta > 0 ? "−" : "+"}${Math.abs(Math.round(delta))} p`}
              </td>
            </tr>
          );
        })}
      </tbody>
      {summary.comparable === false ? (
        <tfoot>
          <tr><td colSpan={4} className="pt-1 text-[9.5px] text-[var(--adm-amber-950)]">A két mérés mérőszám-verziója eltér — a különbség óvatosan értelmezhető.</td></tr>
        </tfoot>
      ) : null}
    </table>
  );
}

function RoiBlock({ roi }: { roi: NonNullable<OutcomeMeasurementDTO["roi"]> }) {
  const [open, setOpen] = useState(false);
  const time = roi.timeSavedMinutesPerMonth;
  const cash = roi.cashSavedHufPerMonth;
  const fmt = (v: { low: number; base: number; high: number } | null | undefined, unit: string) =>
    v ? `${Math.round(v.low)}–${Math.round(v.base)}–${Math.round(v.high)} ${unit}` : "—";
  return (
    <div className="mt-3 rounded border border-[var(--adm-border)] bg-[var(--adm-surface)]/60 p-3">
      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Becsült hatás (alacsony / közép / magas)</p>
      <div className="mt-1 grid gap-1 text-[12px]">
        <p>Megtakarított idő / hónap: <b>{fmt(time, "perc")}</b></p>
        <p>Megtakarított költség / hónap: <b>{cash ? fmt(cash, "Ft") : "nem becsülhető"}</b></p>
      </div>
      <p className="mt-1.5 text-[10px] font-semibold text-[var(--adm-amber-950)]">A megtakarított idő nem egyenlő pénzmegtakarítással.</p>
      <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1.5 text-[10.5px] font-semibold text-[var(--adm-ochre-500)] hover:underline" aria-expanded={open}>
        Hogyan számoltuk?
      </button>
      {open && roi.provenance ? (
        <dl className="mt-1.5 grid grid-cols-[minmax(90px,auto)_1fr] gap-x-3 gap-y-1 text-[10.5px]">
          <dt className="text-[var(--adm-text-muted)]">Alap</dt><dd>{outcomeBasisLabelHu(roi.basis)}</dd>
          <dt className="text-[var(--adm-text-muted)]">Származás</dt><dd>{roiProvenanceLabelHu(roi.provenanceType ?? roi.provenance?.type)}</dd>
          <dt className="text-[var(--adm-text-muted)]">Képlet</dt><dd>{roi.provenance.formulaVersion}</dd>
          <dt className="text-[var(--adm-text-muted)]">Számítva</dt><dd>{new Date(roi.provenance.computedAt).toLocaleString("hu-HU")}</dd>
          <dt className="text-[var(--adm-text-muted)]">Magyarázat</dt><dd>{roi.provenance.explanationHu}</dd>
        </dl>
      ) : null}
    </div>
  );
}
