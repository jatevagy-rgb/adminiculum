"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getPortalOrgGrow,
  getPortalGrowAssessment,
  listPortalGrowAssessments,
  listPortalGrowSurveys,
  submitPortalGrowAssessment,
  submitPortalGrowSurvey,
  type PortalGrowAssessmentCatalogue,
  type PortalGrowAssessmentDetail,
  type PortalGrowAssessmentResult,
  type PortalGrowInitiative,
  type PortalGrowOutcome,
  type PortalGrowProcess,
  type PortalGrowSurveyItem,
  type PortalOrgGrow,
} from "@/lib/clientPortalApi";
import { clientSafeError } from "@/lib/clientInteractionApi";
import { SURVEY_CATEGORY_LABELS_HU } from "@/lib/growApi";
import {
  AdminBadge,
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

/**
 * Canonical customer Grow information architecture.
 *
 * Grow is a human-reviewed operating-improvement system. Questionnaires,
 * surveys and assessments are INPUT CHANNELS (Teendők), never the product hero.
 * The customer sees only customer-safe / published / operational projections.
 */
export type GrowTab =
  | "attekintes"
  | "teendok"
  | "fejlesztesi-iranyok"
  | "kezdemenyezesek"
  | "eredmenyek"
  | "mukodes";

/**
 * Deterministic legacy deep-link mapping. Old bookmarks keep resolving:
 *   ?tab=felmeresek     -> teendok
 *   ?tab=folyamatok     -> mukodes
 *   ?tab=lehetosegek    -> fejlesztesi-iranyok
 * Canonical ids resolve to themselves.
 */
const LEGACY_TAB_MAP: Record<string, GrowTab> = {
  attekintes: "attekintes",
  teendok: "teendok",
  "fejlesztesi-iranyok": "fejlesztesi-iranyok",
  kezdemenyezesek: "kezdemenyezesek",
  eredmenyek: "eredmenyek",
  mukodes: "mukodes",
  felmeresek: "teendok",
  folyamatok: "mukodes",
  lehetosegek: "fejlesztesi-iranyok",
};

export function resolveGrowTab(raw: string | null): GrowTab | null {
  if (!raw) return null;
  return LEGACY_TAB_MAP[raw] ?? null;
}

const PANEL = "p-4 sm:p-5";
const MUTED = "text-[var(--adm-text-muted)]";
const SOFT = "text-[var(--adm-text-soft)]";

function generateUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function formatDate(value?: string | null) {
  if (!value) return "Nincs megadva";
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

type PillTone = "green" | "amber" | "blue" | "neutral" | "gold" | "burgundy";

function milestoneTone(statusLabel: string): PillTone {
  if (statusLabel === "Teljesítve") return "green";
  if (statusLabel === "Törölve") return "neutral";
  return "amber";
}

function initiativeTone(statusLabel: string): PillTone {
  if (statusLabel.includes("Lezárva") || statusLabel.includes("Megvalósult")) return "green";
  if (statusLabel === "Folyamatban") return "blue";
  return "neutral";
}

function outcomeTone(basis: PortalGrowOutcome["basis"]): PillTone {
  if (basis === "MEASURED") return "green";
  if (basis === "CALCULATED") return "gold";
  return "neutral";
}

type AssessmentView = { mode: "catalogue" } | { mode: "runner"; packKey: string } | { mode: "result"; packKey: string };
type AssessmentFilter = "all" | "uncompleted" | "completed";
type InitiativeFilter = "all" | "planned" | "active" | "completed";

function SummaryPanel({
  eyebrow,
  title,
  value,
  detail,
  action,
  testId,
}: {
  eyebrow: string;
  title: string;
  value?: number;
  detail: string;
  action?: React.ReactNode;
  testId?: string;
}) {
  return (
    <AdminPanel className={PANEL} data-testid={testId}>
      <div className="flex items-baseline justify-between gap-3">
        <p className={`text-[10.5px] font-bold uppercase tracking-[0.14em] ${SOFT}`}>{eyebrow}</p>
        {typeof value === "number" ? (
          <span className="font-serif text-[26px] font-medium leading-none text-[var(--adm-text)]">{value}</span>
        ) : null}
      </div>
      <h3 className="mt-1 font-serif text-[19px] font-medium leading-tight text-[var(--adm-text)]">{title}</h3>
      <p className={`mt-1 text-[12px] leading-5 ${MUTED}`}>{detail}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </AdminPanel>
  );
}

export function OrgGrowView() {
  const [data, setData] = useState<PortalOrgGrow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<GrowTab>("attekintes");

  // Selected opportunity for detail view (?tab=fejlesztesi-iranyok&opportunity=<publicationId>)
  const [selectedPublicationId, setSelectedPublicationId] = useState<string | null>(null);

  // Selected initiative for detail view (?tab=kezdemenyezesek&initiative=<id>)
  const [selectedInitiativeId, setSelectedInitiativeId] = useState<string | null>(null);

  // Survey / operational-signal state
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedProcessId, setSelectedProcessId] = useState<string>("");
  const [freeText, setFreeText] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [surveys, setSurveys] = useState<PortalGrowSurveyItem[]>([]);
  const idempotencyKeyRef = useRef<string>(generateUUID());

  // Assessment journey state
  const [catalogue, setCatalogue] = useState<PortalGrowAssessmentCatalogue | null>(null);
  const [assessmentView, setAssessmentView] = useState<AssessmentView>({ mode: "catalogue" });
  const [runnerDetail, setRunnerDetail] = useState<PortalGrowAssessmentDetail | null>(null);
  const [runnerIndex, setRunnerIndex] = useState(0);
  const [runnerAnswers, setRunnerAnswers] = useState<Record<string, string>>({});
  const [assessmentResult, setAssessmentResult] = useState<PortalGrowAssessmentResult | null>(null);
  const [assessmentResultUnavailable, setAssessmentResultUnavailable] = useState(false);
  const [assessmentResultScope, setAssessmentResultScope] = useState<{
    processId: string | null;
    processName: string | null;
  } | null>(null);
  const [assessmentBusy, setAssessmentBusy] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [assessmentProcessId, setAssessmentProcessId] = useState<string>("");
  const assessmentKeyRef = useRef<string>(generateUUID());

  // Filters
  const [assessmentFilter, setAssessmentFilter] = useState<AssessmentFilter>("all");
  const [initiativeFilter, setInitiativeFilter] = useState<InitiativeFilter>("all");
  const [selectedPackKey, setSelectedPackKey] = useState<string | null>(null);

  const loadSurveys = useCallback(async () => {
    try {
      const res = await listPortalGrowSurveys();
      if (res && Array.isArray(res.items)) {
        setSurveys(res.items);
      }
    } catch {
      // safe fallback, non-blocking
    }
  }, []);

  const loadCatalogue = useCallback(async () => {
    try {
      setCatalogueError(null);
      const res = await listPortalGrowAssessments();
      if (res && Array.isArray(res.packs)) {
        setCatalogue(res);
        setSelectedPackKey((prev) => prev ?? res.packs[0]?.packKey ?? null);
      }
    } catch (err) {
      setCatalogueError(clientSafeError(err));
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPortalOrgGrow();
      setData(res);
      if (res?.surveys && Array.isArray(res.surveys)) {
        setSurveys(res.surveys);
      } else {
        await loadSurveys();
      }
      await loadCatalogue();
    } catch (err) {
      setError(clientSafeError(err));
    } finally {
      setLoading(false);
    }
  }, [loadSurveys, loadCatalogue]);

  useEffect(() => {
    void load();
  }, [load]);

  // Synchronize URL query parameter with active tab state & support browser back/forward.
  // Legacy tab ids are mapped deterministically and normalized to canonical ids.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = () => {
      const p = new URLSearchParams(window.location.search);
      const rawTab = p.get("tab");
      const opp = p.get("opportunity");
      const initiative = p.get("initiative");
      const tab = resolveGrowTab(rawTab);

      if (tab) {
        setActiveTab(tab);
        setSelectedPublicationId(tab === "fejlesztesi-iranyok" && opp ? opp : null);
        setSelectedInitiativeId(tab === "kezdemenyezesek" && initiative ? initiative : null);
      } else if (opp) {
        setActiveTab("fejlesztesi-iranyok");
        setSelectedPublicationId(opp);
        setSelectedInitiativeId(null);
      } else if (initiative) {
        setActiveTab("kezdemenyezesek");
        setSelectedInitiativeId(initiative);
        setSelectedPublicationId(null);
      } else {
        setActiveTab("attekintes");
        setSelectedPublicationId(null);
        setSelectedInitiativeId(null);
      }

      // Normalize a legacy ?tab=<old-id> bookmark to its canonical id without
      // adding a history entry, so Back/Forward/reload stay truthful.
      if (rawTab && tab && rawTab !== tab) {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", tab);
        window.history.replaceState({}, "", url.toString());
      }
    };

    handlePopState();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleTabChange = useCallback((tab: GrowTab) => {
    setActiveTab(tab);
    if (tab !== "fejlesztesi-iranyok") {
      setSelectedPublicationId(null);
    }
    if (tab !== "kezdemenyezesek") {
      setSelectedInitiativeId(null);
    }
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      if (tab !== "fejlesztesi-iranyok") {
        url.searchParams.delete("opportunity");
      }
      if (tab !== "kezdemenyezesek") {
        url.searchParams.delete("initiative");
      }
      window.history.pushState({}, "", url.toString());
    }
  }, []);

  const handleSelectInitiative = useCallback((initiativeId: string) => {
    setSelectedInitiativeId(initiativeId);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "kezdemenyezesek");
      url.searchParams.set("initiative", initiativeId);
      window.history.pushState({}, "", url.toString());
    }
  }, []);

  const handleBackToInitiatives = useCallback(() => {
    setSelectedInitiativeId(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "kezdemenyezesek");
      url.searchParams.delete("initiative");
      window.history.pushState({}, "", url.toString());
    }
  }, []);

  const handleSelectOpportunity = useCallback((pubId: string) => {
    setSelectedPublicationId(pubId);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "fejlesztesi-iranyok");
      url.searchParams.set("opportunity", pubId);
      window.history.pushState({}, "", url.toString());
    }
  }, []);

  const handleBackToOpportunities = useCallback(() => {
    setSelectedPublicationId(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "fejlesztesi-iranyok");
      url.searchParams.delete("opportunity");
      window.history.pushState({}, "", url.toString());
    }
  }, []);

  const handleSurveySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCategories.length === 0) {
      setSubmitError("Kérjük, válasszon legalább egy témakört a visszajelzéshez.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const res = await submitPortalGrowSurvey({
        categories: selectedCategories,
        freeText: freeText.trim() || undefined,
        processId: selectedProcessId || undefined,
        idempotencyKey: idempotencyKeyRef.current,
      });
      setSubmitSuccess(res.message || "Rögzítettük. A jelzést a működés áttekintésekor figyelembe vesszük.");
      setSelectedCategories([]);
      setFreeText("");
      setSelectedProcessId("");
      idempotencyKeyRef.current = generateUUID();
      await loadSurveys();
    } catch (err) {
      setSubmitError(clientSafeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const processes: PortalGrowProcess[] = useMemo(() => data?.processes || [], [data?.processes]);

  const startAssessment = useCallback((packKey: string, processId?: string | null) => {
    setActiveTab("teendok");
    setAssessmentBusy(true);
    setAssessmentError(null);
    try {
      void getPortalGrowAssessment(packKey, processId).then((detail) => {
        setRunnerDetail(detail);
        setRunnerIndex(0);
        setRunnerAnswers({});
        setAssessmentProcessId(processId ?? "");
        assessmentKeyRef.current = generateUUID();
        setAssessmentView({ mode: "runner", packKey });
      }).catch((err) => {
        setAssessmentError(clientSafeError(err));
      }).finally(() => {
        setAssessmentBusy(false);
      });
    } catch (err) {
      setAssessmentError(clientSafeError(err));
      setAssessmentBusy(false);
    }
  }, []);

  const viewAssessmentResult = useCallback((packKey: string, processId?: string | null) => {
    setActiveTab("teendok");
    setAssessmentBusy(true);
    setAssessmentError(null);
    try {
      void getPortalGrowAssessment(packKey, processId).then((detail) => {
        setAssessmentResult(detail.latestResult);
        setAssessmentResultUnavailable(detail.latestResult === null);
        setAssessmentResultScope(detail.resultScope ?? null);
        setAssessmentView({ mode: "result", packKey });
      }).catch((err) => {
        setAssessmentError(clientSafeError(err));
      }).finally(() => {
        setAssessmentBusy(false);
      });
    } catch (err) {
      setAssessmentError(clientSafeError(err));
      setAssessmentBusy(false);
    }
  }, []);

  const backToCatalogue = useCallback(async () => {
    setAssessmentView({ mode: "catalogue" });
    setRunnerDetail(null);
    setAssessmentResult(null);
    setAssessmentResultUnavailable(false);
    setAssessmentResultScope(null);
    setAssessmentError(null);
    assessmentKeyRef.current = generateUUID();
    await loadCatalogue();
  }, [loadCatalogue]);

  const submitAssessment = useCallback(async () => {
    if (!runnerDetail) return;
    const answers = runnerDetail.definition.questions.map((q) => ({
      questionKey: q.questionKey,
      answer: runnerAnswers[q.questionKey],
    }));
    setAssessmentBusy(true);
    setAssessmentError(null);
    try {
      const res = await submitPortalGrowAssessment(runnerDetail.definition.packKey, {
        answers,
        idempotencyKey: assessmentKeyRef.current,
        processId: assessmentProcessId || undefined,
      });
      setAssessmentResult(res.result);
      setAssessmentResultUnavailable(false);
      setAssessmentResultScope({
        processId: assessmentProcessId || null,
        processName: processes.find((p) => p.id === assessmentProcessId)?.name ?? null,
      });
      setAssessmentView({ mode: "result", packKey: runnerDetail.definition.packKey });
      await loadCatalogue();
    } catch (err) {
      setAssessmentError(clientSafeError(err));
    } finally {
      setAssessmentBusy(false);
    }
  }, [runnerDetail, runnerAnswers, assessmentProcessId, processes, loadCatalogue]);

  if (loading) {
    return (
      <AdminPanel className={PANEL}>
        <p className={`text-[13px] ${MUTED}`}>Működésfejlesztési adatok betöltése…</p>
      </AdminPanel>
    );
  }

  if (error) {
    return <SafePanelError onRetry={() => void load()} detail={error} />;
  }

  const initiatives = data?.initiatives || [];
  const measuredOutcomes = data?.outcomes.measured || [];
  const estimatedOutcomes = data?.outcomes.calculatedOrEstimated || [];
  const calculatedOutcomes = estimatedOutcomes.filter((o) => o.basis === "CALCULATED");
  const estimatedOnlyOutcomes = estimatedOutcomes.filter((o) => o.basis === "ESTIMATED");
  const allOutcomes = [...measuredOutcomes, ...estimatedOutcomes];
  const packs = catalogue?.packs || [];
  const aggregatedFindings = catalogue?.aggregatedFindings || [];
  const hasCompletedPack = packs.some((p) => p.status === "COMPLETED");

  const completedResultScopes = packs
    .filter((p) => p.status === "COMPLETED")
    .flatMap((p) => p.resultScopes);
  const hasEvaluableCompletedPack = completedResultScopes.some((s) => s.resultAvailable);
  const hasUnavailableCompletedPack = completedResultScopes.some((s) => !s.resultAvailable);

  const runnerQuestions = runnerDetail?.definition.questions || [];
  const currentQuestion = runnerQuestions[runnerIndex];
  const isLastQuestion = runnerQuestions.length > 0 && runnerIndex === runnerQuestions.length - 1;
  const currentAnswered = currentQuestion ? Boolean(runnerAnswers[currentQuestion.questionKey]) : false;
  const requiresProcess = Boolean(
    runnerDetail?.definition.allowsProcessReference && processes.length > 0,
  );
  const processReady = !requiresProcess || assessmentProcessId !== "";

  // Truthful summary counts, all derived from canonical DTO data.
  const uncompletedPacksCount = packs.filter((p) => p.status !== "COMPLETED").length;
  const completedPacksCount = packs.filter((p) => p.status === "COMPLETED").length;
  const activeInitiativesCount = initiatives.filter(
    (i) => i.statusLabel === "Folyamatban" || i.statusLabel.toLowerCase().includes("folyamat")
  ).length;
  const plannedInitiativesCount = initiatives.filter(
    (i) => i.statusLabel === "Tervezett" || i.statusLabel === "Tervezés alatt"
  ).length;
  const completedInitiativesCount = initiatives.filter(
    (i) => i.statusLabel.includes("Lezárva") || i.statusLabel.includes("Megvalósult")
  ).length;
  // Published, customer-safe opportunities only (already publication-filtered by the DTO).
  const publishedOpportunitiesCount = data?.opportunities?.length ?? 0;

  const filteredPacks = packs.filter((p) => {
    if (assessmentFilter === "uncompleted") return p.status !== "COMPLETED";
    if (assessmentFilter === "completed") return p.status === "COMPLETED";
    return true;
  });

  const filteredInitiatives = initiatives.filter((i) => {
    if (initiativeFilter === "planned") {
      return i.statusLabel === "Tervezett" || i.statusLabel === "Tervezés alatt";
    }
    if (initiativeFilter === "active") {
      return i.statusLabel === "Folyamatban";
    }
    if (initiativeFilter === "completed") {
      return i.statusLabel.includes("Lezárva") || i.statusLabel.includes("Megvalósult");
    }
    return true;
  });

  const TABS: Array<{ id: GrowTab; label: string; count?: number }> = [
    { id: "attekintes", label: "Áttekintés" },
    { id: "teendok", label: "Teendők", count: uncompletedPacksCount },
    { id: "fejlesztesi-iranyok", label: "Fejlesztési irányok", count: publishedOpportunitiesCount },
    { id: "kezdemenyezesek", label: "Kezdeményezések", count: initiatives.length },
    { id: "eredmenyek", label: "Eredmények", count: measuredOutcomes.length + estimatedOutcomes.length },
    { id: "mukodes", label: "Működés", count: processes.length },
  ];

  return (
    <div className="space-y-5" data-testid="org-grow-view">
      <OperationalPageHeader
        title="Működésfejlesztés"
        subtitle="Áttekintés a működéséről, a közösen azonosított fejlesztési irányokról, a folyamatban lévő kezdeményezésekről és azok eredményeiről."
        primaryAction={
          <AdminButton variant="primary" onClick={() => handleTabChange("teendok")}>
            Teendők megnyitása
          </AdminButton>
        }
        secondaryActions={
          <>
            <AdminBadge tone="green">Grow with us</AdminBadge>
            {data?.customerName ? <AdminBadge tone="neutral">{data.customerName}</AdminBadge> : null}
            <Link
              href="/portal/megkeresesek"
              className="inline-flex items-center gap-1.5 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface-raised)] px-3 py-1.5 text-[11px] font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]"
            >
              Kérdése van? Írjon nekünk →
            </Link>
          </>
        }
      />

      {/* Canonical 6-tab operational navigation */}
      <div className="border-b border-[var(--adm-border)] pb-2">
        <nav
          className="flex flex-wrap items-center gap-1.5"
          aria-label="Működésfejlesztési navigáció"
          role="tablist"
          data-testid="grow-sub-nav"
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <AdminButton
                key={tab.id}
                role="tab"
                aria-selected={active}
                data-testid={`grow-tab-${tab.id}`}
                variant={active ? "primary" : "ghost"}
                size="sm"
                onClick={() => handleTabChange(tab.id)}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 ? (
                  <AdminBadge tone={active ? "green" : "neutral"}>{tab.count}</AdminBadge>
                ) : null}
              </AdminButton>
            );
          })}
        </nav>
      </div>

      {/* TAB 1: ÁTTEKINTÉS */}
      {activeTab === "attekintes" ? (
        <div className="space-y-4" data-testid="grow-overview-tab">
          <div className="grid gap-4 lg:grid-cols-2">
            <SummaryPanel
              testId="grow-overview-actions"
              eyebrow="Adatot kérünk Öntől"
              title="Nyitott teendők"
              value={uncompletedPacksCount}
              detail={
                uncompletedPacksCount > 0
                  ? `${uncompletedPacksCount} adatkérés segíti a működés pontosabb feltárását.`
                  : packs.length > 0
                    ? "Minden kijelölt adatkérés kitöltve. Új jelzést bármikor küldhet."
                    : "Jelenleg nincs kijelölt adatkérés."
              }
              action={
                <AdminButton size="sm" variant="neutral" onClick={() => handleTabChange("teendok")}>
                  Teendők megnyitása →
                </AdminButton>
              }
            />
            <SummaryPanel
              testId="grow-overview-opportunities"
              eyebrow="Közzétett irányok"
              title="Fejlesztési irányok"
              value={publishedOpportunitiesCount}
              detail={
                publishedOpportunitiesCount > 0
                  ? "Az iroda által Önnek közzétett fejlesztési irányok."
                  : data?.opportunitiesDeferredNotice ||
                    "Jelenleg nincs ügyféloldalon közzétett fejlesztési irány."
              }
              action={
                <AdminButton size="sm" variant="neutral" onClick={() => handleTabChange("fejlesztesi-iranyok")}>
                  Irányok megtekintése →
                </AdminButton>
              }
            />
            <SummaryPanel
              testId="grow-overview-initiatives"
              eyebrow="Irodai munkavégzés"
              title="Aktív kezdeményezések"
              value={activeInitiativesCount}
              detail={
                activeInitiativesCount > 0
                  ? `${activeInitiativesCount} jóváhagyott kezdeményezés megvalósítása van folyamatban.`
                  : plannedInitiativesCount > 0
                    ? `${plannedInitiativesCount} kezdeményezés áll tervezés alatt.`
                    : "Jelenleg nincs folyamatban lévő kezdeményezés."
              }
              action={
                <AdminButton size="sm" variant="neutral" onClick={() => handleTabChange("kezdemenyezesek")}>
                  Kezdeményezések →
                </AdminButton>
              }
            />
            <SummaryPanel
              testId="grow-overview-outcomes"
              eyebrow="Hatás"
              title="Rögzített eredmények"
              value={allOutcomes.length}
              detail={
                allOutcomes.length > 0
                  ? `${measuredOutcomes.length} mért, ${estimatedOutcomes.length} számított / becsült eredmény.`
                  : "A kezdeményezések végrehajtását követően itt jelennek meg a rögzített hatások."
              }
              action={
                <AdminButton size="sm" variant="neutral" onClick={() => handleTabChange("eredmenyek")}>
                  Eredmények →
                </AdminButton>
              }
            />
          </div>
        </div>
      ) : null}

      {/* TAB 2: TEENDŐK — assessments and survey are input channels */}
      {activeTab === "teendok" ? (
        <div className="space-y-4">
          <AdminPanel className={PANEL} data-testid="grow-assessments-section">
            {assessmentView.mode === "runner" && currentQuestion ? (
              <div data-testid="grow-assessment-runner">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={`text-[10.5px] font-bold uppercase tracking-[0.14em] ${SOFT}`}>
                    {runnerDetail?.definition.titleHu}
                  </p>
                  <p className={`text-[13px] font-semibold ${MUTED}`} aria-live="polite">
                    {runnerIndex + 1} / {runnerQuestions.length}
                  </p>
                </div>

                <div
                  className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--adm-ivory-200)]"
                  role="progressbar"
                  aria-valuemin={1}
                  aria-valuemax={runnerQuestions.length}
                  aria-valuenow={runnerIndex + 1}
                >
                  <div
                    className="h-full rounded-full bg-[var(--adm-green-800)] transition-all"
                    style={{ width: `${((runnerIndex + 1) / runnerQuestions.length) * 100}%` }}
                  />
                </div>

                <h2 className="mt-5 font-serif text-[21px] font-medium leading-tight text-[var(--adm-text)]">
                  {currentQuestion.promptHu}
                </h2>
                {currentQuestion.helpTextHu ? (
                  <p className={`mt-2 text-[13px] ${MUTED}`}>{currentQuestion.helpTextHu}</p>
                ) : null}

                {runnerDetail?.definition.allowsProcessReference && processes.length > 0 ? (
                  <div className="mt-5" data-testid="grow-assessment-process-scope">
                    <label
                      htmlFor="assessment-process"
                      className="mb-1.5 block text-[12px] font-semibold text-[var(--adm-text)]"
                    >
                      Melyik folyamatot szeretné ezzel a felméréssel áttekinteni?
                    </label>
                    <select
                      id="assessment-process"
                      value={assessmentProcessId}
                      onChange={(e) => setAssessmentProcessId(e.target.value)}
                      className="w-full rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface-raised)] px-3 py-2 text-[13px] text-[var(--adm-text)] focus:outline-none"
                    >
                      <option value="">Válasszon folyamatot…</option>
                      {processes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <p className={`mt-1.5 text-[11px] ${MUTED}`}>
                      A válaszokat a kiválasztott folyamathoz rendelve értékeljük, így a megállapítások nem
                      keverednek más folyamatokkal.
                    </p>
                  </div>
                ) : null}

                <div className="mt-5 grid gap-2 sm:grid-cols-2" role="group" aria-label="Válaszlehetőségek">
                  {currentQuestion.options.map((option) => {
                    const selected = runnerAnswers[currentQuestion.questionKey] === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        data-testid={`grow-assessment-option-${option.value}`}
                        aria-pressed={selected}
                        onClick={() =>
                          setRunnerAnswers((prev) => ({ ...prev, [currentQuestion.questionKey]: option.value }))
                        }
                        className={`rounded-[var(--adm-radius-md)] border px-4 py-3 text-left text-[13px] font-semibold transition focus:outline-none ${
                          selected
                            ? "border-[var(--adm-green-800)] bg-[var(--adm-sage-100)] text-[var(--adm-green-950)]"
                            : "border-[var(--adm-border)] bg-[var(--adm-surface-raised)] text-[var(--adm-text)] hover:border-[var(--adm-border-strong)]"
                        }`}
                      >
                        {option.labelHu}
                      </button>
                    );
                  })}
                </div>

                {assessmentError ? (
                  <div className="mt-4 rounded-[var(--adm-radius-sm)] border border-[var(--adm-semantic-danger-border)] bg-[var(--adm-semantic-danger-soft)] p-3 text-[13px] font-medium text-[var(--adm-semantic-danger)]">
                    {assessmentError}
                  </div>
                ) : null}

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <AdminButton
                    size="sm"
                    variant="neutral"
                    onClick={() => setRunnerIndex((idx) => Math.max(0, idx - 1))}
                    disabled={runnerIndex === 0 || assessmentBusy}
                  >
                    ← Vissza
                  </AdminButton>
                  <AdminButton
                    size="sm"
                    variant="ghost"
                    data-testid="grow-assessment-runner-cancel"
                    onClick={() => void backToCatalogue()}
                    disabled={assessmentBusy}
                  >
                    Kilépés
                  </AdminButton>
                  <AdminButton
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      if (isLastQuestion) {
                        void submitAssessment();
                      } else {
                        setRunnerIndex((idx) => Math.min(runnerQuestions.length - 1, idx + 1));
                      }
                    }}
                    disabled={!currentAnswered || assessmentBusy || !processReady}
                  >
                    {isLastQuestion ? (assessmentBusy ? "Beküldés…" : "Befejezés") : "Tovább →"}
                  </AdminButton>
                </div>
              </div>
            ) : assessmentView.mode === "result" && assessmentResult ? (
              <div data-testid="grow-assessment-result">
                <p className={`text-[10.5px] font-bold uppercase tracking-[0.14em] ${SOFT}`}>Felmérés elkészült</p>
                <h2 className="mt-1 font-serif text-[22px] font-medium leading-tight text-[var(--adm-text)]">
                  {assessmentResult.titleHu}
                </h2>
                {assessmentResultScope?.processName ? (
                  <p
                    className="mt-1 text-[13px] font-medium text-[var(--adm-text)]"
                    data-testid="grow-assessment-result-process"
                  >
                    Folyamat: {assessmentResultScope.processName}
                  </p>
                ) : null}
                <p className={`mt-2 text-[13px] leading-6 ${MUTED}`}>{assessmentResult.summaryHu}</p>

                <div className="mt-6">
                  <h3 className={`text-[11px] font-bold uppercase tracking-[0.12em] ${SOFT}`}>Amit látunk</h3>
                  {assessmentResult.findings.length > 0 ? (
                    <div className="mt-3 grid gap-3">
                      {assessmentResult.findings.map((finding, idx) => (
                        <AdminPanel key={idx} className={PANEL}>
                          <p className="font-semibold text-[var(--adm-text)]">{finding.titleHu}</p>
                          <p className={`mt-1 text-[13px] leading-6 ${MUTED}`}>{finding.summaryHu}</p>
                        </AdminPanel>
                      ))}
                    </div>
                  ) : (
                    <p className={`mt-2 text-[13px] ${MUTED}`}>
                      A válaszok alapján ezen a területen nem azonosítottunk figyelmet igénylő pontot.
                    </p>
                  )}
                </div>

                <div className="mt-6">
                  <h3 className={`text-[11px] font-bold uppercase tracking-[0.12em] ${SOFT}`}>Javasolt irányok</h3>
                  {assessmentResult.directions.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {assessmentResult.directions.map((direction, idx) => (
                        <AdminBadge key={idx} tone="green">
                          {direction.labelHu}
                        </AdminBadge>
                      ))}
                    </div>
                  ) : (
                    <p className={`mt-2 text-[13px] ${MUTED}`}>Ehhez a kitöltéshez még nincs javasolt vizsgálati irány.</p>
                  )}
                </div>

                <div className="mt-6">
                  <h3 className={`text-[11px] font-bold uppercase tracking-[0.12em] ${SOFT}`}>Mi alapján?</h3>
                  {assessmentResult.evidence.length > 0 ? (
                    <div className="mt-3 grid gap-3">
                      {assessmentResult.evidence.map((item, idx) => (
                        <AdminPanel key={idx} className={PANEL}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="font-semibold text-[var(--adm-text)]">{item.title}</p>
                            <AdminStatusPill tone="neutral">{item.strengthLabelHu}</AdminStatusPill>
                          </div>
                          <p className={`mt-1 text-[11px] ${SOFT}`}>
                            {[item.authors, item.year ? String(item.year) : null].filter(Boolean).join(" · ")}
                          </p>
                          {item.boundedClaim ? (
                            <p className={`mt-2 text-[13px] leading-6 ${MUTED}`}>{item.boundedClaim}</p>
                          ) : null}
                          {item.limitations ? (
                            <p className={`mt-2 text-[11px] leading-5 ${SOFT}`}>Korlát: {item.limitations}</p>
                          ) : null}
                          {item.locator ? (
                            <a
                              href={item.locator}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-block text-[11px] font-medium text-[var(--adm-green-800)] hover:underline"
                            >
                              {item.doi ? `DOI: ${item.doi}` : "Forrás megnyitása →"}
                            </a>
                          ) : null}
                        </AdminPanel>
                      ))}
                    </div>
                  ) : (
                    <p className={`mt-2 text-[13px] ${MUTED}`}>Ehhez az eredményhez jelenleg nincs megjeleníthető háttér.</p>
                  )}
                </div>

                <div className={`mt-6 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 text-[11px] leading-5 ${MUTED}`}>
                  {assessmentResult.noticeHu}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <AdminButton
                    variant="primary"
                    size="sm"
                    data-testid="grow-assessment-result-back"
                    onClick={() => void backToCatalogue()}
                  >
                    Vissza a felmérésekhez
                  </AdminButton>
                  <AdminButton
                    variant="neutral"
                    size="sm"
                    onClick={() => void startAssessment(assessmentResult.packKey, assessmentResultScope?.processId ?? undefined)}
                    disabled={assessmentBusy}
                  >
                    Újra kitöltöm
                  </AdminButton>
                </div>
              </div>
            ) : assessmentView.mode === "result" && assessmentResultUnavailable ? (
              <div data-testid="grow-assessment-result-unavailable">
                <p className={`text-[10.5px] font-bold uppercase tracking-[0.14em] ${SOFT}`}>Felmérés elkészült</p>
                <h2 className="mt-1 font-serif text-[22px] font-medium leading-tight text-[var(--adm-text)]">
                  Az eredmény jelenleg nem jeleníthető meg
                </h2>
                <p className={`mt-2 text-[13px] ${MUTED}`}>
                  A kitöltést rögzítettük, de ehhez a felmérésverzióhoz tartozó eredmény most nem állítható elő.
                </p>
                <AdminButton
                  variant="primary"
                  size="sm"
                  className="mt-5"
                  onClick={() => void backToCatalogue()}
                >
                  Vissza a felmérésekhez
                </AdminButton>
              </div>
            ) : (
              <div data-testid="grow-assessment-catalogue">
                <AdminSectionHeader
                  eyebrow="Adatot kérünk Öntől"
                  title="Felmérési csomagok"
                  subtitle="Segítsen pontosítani a működést. Minden csomag kérdésenként halad, és a végén megállapításokat, javasolt irányokat és a mögöttük álló szakirodalmi hátteret mutatja."
                  titleAs="h2"
                  action={
                    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Felmérés szűrők">
                      {[
                        { id: "all", label: `Összes (${packs.length})` },
                        { id: "uncompleted", label: `Kitöltésre vár (${uncompletedPacksCount})` },
                        { id: "completed", label: `Befejezett (${completedPacksCount})` },
                      ].map((f) => (
                        <AdminButton
                          key={f.id}
                          role="tab"
                          aria-selected={assessmentFilter === f.id}
                          variant={assessmentFilter === f.id ? "primary" : "neutral"}
                          size="xs"
                          onClick={() => setAssessmentFilter(f.id as AssessmentFilter)}
                        >
                          {f.label}
                        </AdminButton>
                      ))}
                    </div>
                  }
                />

                <div className={PANEL}>
                  {assessmentError ? (
                    <div className="mb-4 rounded-[var(--adm-radius-sm)] border border-[var(--adm-semantic-danger-border)] bg-[var(--adm-semantic-danger-soft)] p-3 text-[13px] font-medium text-[var(--adm-semantic-danger)]">
                      {assessmentError}
                    </div>
                  ) : null}

                  {catalogueError ? (
                    <div
                      className="mb-4 rounded-[var(--adm-radius-sm)] border border-[var(--adm-semantic-danger-border)] bg-[var(--adm-semantic-danger-soft)] p-4 text-[13px] text-[var(--adm-semantic-danger)]"
                      data-testid="grow-assessment-catalogue-error"
                    >
                      <p className="font-semibold">A felmérések most nem érhetők el.</p>
                      <p className="mt-1">{catalogueError}</p>
                      <AdminButton size="sm" variant="neutral" className="mt-3" onClick={() => void loadCatalogue()}>
                        Újrapróbálás
                      </AdminButton>
                    </div>
                  ) : null}

                  <div className="mt-2 grid gap-3 lg:grid-cols-3">
                    <div className="space-y-3 lg:col-span-2">
                      {filteredPacks.length > 0 ? (
                        filteredPacks.map((pack) => {
                          const isExpanded = selectedPackKey === pack.packKey;
                          const statusTone: PillTone = pack.status === "COMPLETED" ? "green" : "neutral";
                          if (!isExpanded) {
                            return (
                              <AdminPanel
                                key={pack.packKey}
                                data-testid={`grow-assessment-row-${pack.packKey}`}
                                className="p-4 transition hover:border-[var(--adm-border-strong)]"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <AdminStatusPill tone={statusTone}>
                                      {pack.status === "COMPLETED" ? "Kitöltve" : "Nincs kitöltve"}
                                    </AdminStatusPill>
                                    <div className="min-w-0">
                                      <h3 className="truncate font-serif text-[16px] font-medium text-[var(--adm-text)]">
                                        {pack.titleHu}
                                      </h3>
                                      <p className={`mt-0.5 truncate text-[11px] ${MUTED}`}>{pack.descriptionHu}</p>
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    {pack.status === "COMPLETED" && pack.latestResultAvailable ? (
                                      <AdminButton
                                        size="xs"
                                        variant="neutral"
                                        data-testid={`grow-assessment-result-${pack.packKey}`}
                                        onClick={() =>
                                          void viewAssessmentResult(pack.packKey, pack.resultScopes[0]?.processId ?? undefined)
                                        }
                                        disabled={assessmentBusy}
                                      >
                                        Eredmény megtekintése
                                      </AdminButton>
                                    ) : null}
                                    <AdminButton
                                      size="xs"
                                      variant="ghost"
                                      data-testid={`grow-assessment-toggle-${pack.packKey}`}
                                      aria-expanded={false}
                                      onClick={() => setSelectedPackKey(pack.packKey)}
                                    >
                                      Kibontás
                                    </AdminButton>
                                  </div>
                                </div>
                              </AdminPanel>
                            );
                          }

                          return (
                            <AdminPanel
                              key={pack.packKey}
                              data-testid={`grow-assessment-row-${pack.packKey}`}
                              className={PANEL}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <AdminStatusPill tone={statusTone}>
                                    {pack.status === "COMPLETED" ? "Kitöltve" : "Kitöltésre vár"}
                                  </AdminStatusPill>
                                  <h3 className="mt-2 font-serif text-[18px] font-medium leading-tight text-[var(--adm-text)]">
                                    {pack.titleHu}
                                  </h3>
                                </div>
                                <AdminButton
                                  size="xs"
                                  variant="ghost"
                                  data-testid={`grow-assessment-toggle-${pack.packKey}`}
                                  aria-expanded={true}
                                  onClick={() => setSelectedPackKey(null)}
                                >
                                  Összecsukás
                                </AdminButton>
                              </div>

                              <p className={`mt-3 text-[13px] leading-6 ${MUTED}`}>{pack.descriptionHu}</p>

                              <div className="mt-4 grid grid-cols-2 gap-3 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 text-[11px] sm:grid-cols-4">
                                <div>
                                  <p className={`font-semibold uppercase ${SOFT}`}>Becsült idő</p>
                                  <p className="mt-0.5 font-bold text-[var(--adm-text)]">~{pack.estimatedMinutes} perc</p>
                                </div>
                                <div>
                                  <p className={`font-semibold uppercase ${SOFT}`}>Kérdések</p>
                                  <p className="mt-0.5 font-bold text-[var(--adm-text)]">{pack.questionCount} kérdés</p>
                                </div>
                                <div>
                                  <p className={`font-semibold uppercase ${SOFT}`}>Utolsó kitöltés</p>
                                  <p className="mt-0.5 font-bold text-[var(--adm-text)]">
                                    {pack.latestCompletedAt ? formatDate(pack.latestCompletedAt) : "Még nem volt"}
                                  </p>
                                </div>
                                <div>
                                  <p className={`font-semibold uppercase ${SOFT}`}>Megállapítások</p>
                                  <p className="mt-0.5 font-bold text-[var(--adm-text)]">
                                    {pack.latestFindingCount > 0 ? `${pack.latestFindingCount} pont` : "—"}
                                  </p>
                                </div>
                              </div>

                              {pack.status === "COMPLETED" && !pack.resultScopes.some((s) => s.resultAvailable) ? (
                                <p className="mt-3 text-[11px] font-medium text-[var(--adm-semantic-warning)]">
                                  A kitöltés rögzítve van, de az eredmény ehhez a verzióhoz jelenleg nem jeleníthető meg.
                                </p>
                              ) : null}

                              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--adm-border)] pt-4">
                                <AdminButton
                                  size="sm"
                                  variant="primary"
                                  data-testid={`grow-assessment-start-${pack.packKey}`}
                                  onClick={() => void startAssessment(pack.packKey)}
                                  disabled={assessmentBusy}
                                >
                                  {pack.status === "COMPLETED" ? "Újra kitöltöm" : "Kitöltöm"}
                                </AdminButton>
                                {pack.status === "COMPLETED" &&
                                (pack.allowsProcessReference
                                  ? pack.resultScopes.some((s) => s.resultAvailable)
                                  : pack.latestResultAvailable) ? (
                                  pack.allowsProcessReference && pack.resultScopes.length > 1 ? (
                                    <div className="mt-2 w-full" data-testid="grow-assessment-result-scopes">
                                      <p className="mb-1.5 text-[12px] font-semibold text-[var(--adm-text)]">
                                        Eredmény megtekintése folyamatonként:
                                      </p>
                                      <div className="flex flex-wrap gap-2">
                                        {pack.resultScopes.map((scope) => (
                                          <AdminButton
                                            key={scope.processId ?? "__general__"}
                                            size="xs"
                                            variant="neutral"
                                            data-testid={`grow-assessment-result-${pack.packKey}-${scope.processId ?? "general"}`}
                                            onClick={() => void viewAssessmentResult(pack.packKey, scope.processId)}
                                            disabled={assessmentBusy || !scope.resultAvailable}
                                          >
                                            {scope.processName || "Általános"}
                                          </AdminButton>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <AdminButton
                                      size="sm"
                                      variant="neutral"
                                      data-testid={`grow-assessment-result-${pack.packKey}`}
                                      onClick={() =>
                                        void viewAssessmentResult(pack.packKey, pack.resultScopes[0]?.processId ?? undefined)
                                      }
                                      disabled={assessmentBusy}
                                    >
                                      Eredmény megtekintése
                                    </AdminButton>
                                  )
                                ) : null}
                              </div>
                            </AdminPanel>
                          );
                        })
                      ) : catalogueError ? null : (
                        <p className={`text-[13px] ${MUTED}`}>A felmérések betöltése folyamatban…</p>
                      )}
                    </div>

                    <AdminPanel className={PANEL} data-testid="grow-assessment-guide">
                      <p className={`text-[10.5px] font-bold uppercase tracking-[0.14em] ${SOFT}`}>Módszertani útmutató</p>
                      <h3 className="mt-1 font-serif text-[17px] font-medium text-[var(--adm-text)]">
                        Mi történik az adatkérés után?
                      </h3>
                      <p className={`mt-1.5 text-[11px] leading-5 ${MUTED}`}>
                        A kitöltés a konkrét működési rések és beavatkozási irányok megalapozását szolgálja, nem
                        önálló minősítést ad.
                      </p>
                      <ol className="mt-4 space-y-3 border-t border-[var(--adm-border)] pt-4">
                        {[
                          { t: "Eredmények elemzése", d: "A beérkezett válaszok kiértékelése és a működési szűk keresztmetszetek azonosítása." },
                          { t: "Fejlesztési irányok kijelölése", d: "Az elérhető szakirodalmi és egyéb bizonyítékokat is figyelembe vevő, szakértői felülvizsgálattal kialakított fejlesztési irányok." },
                          { t: "Mérhető eredmények követése", d: "A megvalósult lépések hatását konkrét kapacitás-, idő- és folyamatmérésekkel ellenőrizzük." },
                        ].map((item, idx) => (
                          <li key={idx} className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--adm-radius-sm)] bg-[var(--adm-green-950)] text-[9px] font-bold text-[var(--adm-ivory-50)]">
                              {idx + 1}
                            </span>
                            <div>
                              <p className="text-[12px] font-bold text-[var(--adm-text)]">{item.t}</p>
                              <p className={`mt-0.5 text-[11px] leading-5 ${MUTED}`}>{item.d}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </AdminPanel>
                  </div>
                </div>
              </div>
            )}
          </AdminPanel>

          {/* Secondary cross-pack summary of assessment findings */}
          <AdminPanel className={PANEL} data-testid="grow-aggregated-findings">
            <AdminSectionHeader
              eyebrow="Összegzés"
              title="Mit látunk eddig?"
              titleAs="h2"
              action={
                <AdminButton size="xs" variant="ghost" onClick={() => handleTabChange("teendok")}>
                  Felmérések →
                </AdminButton>
              }
            />
            <div className="mt-3">
              {aggregatedFindings.length > 0 ? (
                <>
                  <p className={`text-[11px] ${MUTED}`}>
                    {catalogue?.aggregatedAttentionAreaCount || aggregatedFindings.length} terület igényel figyelmet
                    {catalogue && catalogue.aggregatedUnknownAreaCount > 0
                      ? `, ${catalogue.aggregatedUnknownAreaCount} területen nincs elég információ`
                      : ""}
                    .
                  </p>
                  <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    {aggregatedFindings.slice(0, 3).map((finding, idx) => (
                      <div key={idx} className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                        <p className="text-[13px] font-semibold text-[var(--adm-text)]">{finding.titleHu}</p>
                        <p className={`mt-1 line-clamp-2 text-[11px] leading-5 ${MUTED}`}>{finding.summaryHu}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : hasEvaluableCompletedPack ? (
                <p className={`text-[13px] leading-6 ${MUTED}`}>
                  A kitöltött felmérések alapján jelenleg nem azonosítottunk figyelmet igénylő pontot.
                  {catalogue && catalogue.aggregatedUnknownAreaCount > 0
                    ? ` ${catalogue.aggregatedUnknownAreaCount} területen nincs elég információ a kiértékeléshez.`
                    : ""}
                  {hasUnavailableCompletedPack
                    ? " Néhány kitöltött felmérés eredménye jelenleg nem jeleníthető meg."
                    : ""}
                </p>
              ) : hasCompletedPack ? (
                <p className={`text-[13px] leading-6 ${MUTED}`}>
                  A kitöltött felmérések eredménye jelenleg nem jeleníthető meg. A kitöltéseket rögzítettük.
                </p>
              ) : (
                <CompactState
                  title="Még nincs kitöltött adatkérés."
                  detail="Töltse ki az egyik felmérési csomagot, és itt összegződnek a megállapítások."
                />
              )}
            </div>
          </AdminPanel>

          {/* Survey / operational signal — a WHY-labelled input channel */}
          <AdminPanel className={PANEL} data-testid="grow-feltaras-section">
            <AdminSectionHeader
              eyebrow="Gyors működési jelzés"
              title="Hol érdemes javítani?"
              subtitle="Ossza meg velünk, milyen nehézségeket tapasztal a napi működésben. Visszajelzése közvetlenül beépül a szervezet közös fejlesztési áttekintésébe. Ez egy könnyű, jelzésértékű visszajelzés — nem formális felmérés."
              titleAs="h2"
            />

            <form onSubmit={handleSurveySubmit} className={`${PANEL} space-y-4`}>
              <div>
                <label className="mb-2 block text-[12px] font-semibold text-[var(--adm-text)]">
                  Jellemző működési tapasztalatok (válasszon egyet vagy többet)
                </label>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {Object.entries(SURVEY_CATEGORY_LABELS_HU).map(([key, label]) => {
                    const checked = selectedCategories.includes(key);
                    return (
                      <label
                        key={key}
                        className={`flex cursor-pointer items-start gap-3 rounded-[var(--adm-radius-sm)] border p-3 transition ${
                          checked
                            ? "border-[var(--adm-green-800)] bg-[var(--adm-sage-100)]"
                            : "border-[var(--adm-border)] bg-[var(--adm-surface-raised)] hover:border-[var(--adm-border-strong)]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedCategories((prev) =>
                              e.target.checked ? [...prev, key] : prev.filter((k) => k !== key)
                            );
                          }}
                          className="mt-0.5 h-4 w-4 rounded border-[var(--adm-border-strong)]"
                        />
                        <span className="text-[13px] font-medium leading-snug text-[var(--adm-text)]">{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {processes.length > 0 ? (
                <div>
                  <label htmlFor="survey-process" className="mb-1.5 block text-[12px] font-semibold text-[var(--adm-text)]">
                    Érintett folyamat (opcionális)
                  </label>
                  <select
                    id="survey-process"
                    value={selectedProcessId}
                    onChange={(e) => setSelectedProcessId(e.target.value)}
                    className="w-full rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface-raised)] px-3 py-2 text-[13px] text-[var(--adm-text)] focus:outline-none"
                  >
                    <option value="">-- Nem köthető egyetlen folyamathoz / Általános --</option>
                    {processes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div>
                <label htmlFor="survey-freetext" className="mb-1.5 block text-[12px] font-semibold text-[var(--adm-text)]">
                  Részletes kifejtés (opcionális)
                </label>
                <textarea
                  id="survey-freetext"
                  rows={3}
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder="Írja le röviden a konkrét helyzetet vagy példát..."
                  className="w-full rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface-raised)] p-3 text-[13px] text-[var(--adm-text)] placeholder:text-[var(--adm-text-soft)] focus:outline-none"
                />
              </div>

              {submitSuccess ? (
                <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-semantic-success-border)] bg-[var(--adm-semantic-success-soft)] p-3 text-[13px] font-medium text-[var(--adm-semantic-success)]">
                  {submitSuccess}
                </div>
              ) : null}

              {submitError ? (
                <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-semantic-danger-border)] bg-[var(--adm-semantic-danger-soft)] p-3 text-[13px] font-medium text-[var(--adm-semantic-danger)]">
                  {submitError}
                </div>
              ) : null}

              <div className="pt-1">
                <AdminButton
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={submitting || selectedCategories.length === 0}
                >
                  {submitting ? "Rögzítés folyamatban..." : "Visszajelzés beküldése"}
                </AdminButton>
              </div>
            </form>

            {surveys.length > 0 ? (
              <div className={`${PANEL} border-t border-[var(--adm-border)]`}>
                <h3 className={`mb-3 text-[11px] font-bold uppercase tracking-[0.12em] ${SOFT}`}>
                  Korábban beküldött működési visszajelzések
                </h3>
                <div className="space-y-3">
                  {surveys.map((s, idx) => (
                    <div key={idx} className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          {s.categoryLabels.map((cat, cIdx) => (
                            <AdminBadge key={cIdx} tone="neutral">
                              {cat}
                            </AdminBadge>
                          ))}
                        </div>
                        <span className={`text-[11px] ${SOFT}`}>{formatDate(s.submittedAt)}</span>
                      </div>
                      {s.processName ? (
                        <p className={`mt-2 text-[11px] ${MUTED}`}>
                          Érintett folyamat: <span className="font-semibold">{s.processName}</span>
                        </p>
                      ) : null}
                      {s.freeText ? (
                        <p className="mt-2 whitespace-pre-wrap text-[13px] text-[var(--adm-text)]">{s.freeText}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </AdminPanel>

          {/* Methodology is secondary progressive disclosure, not the product hero. */}
          <details className="rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-[var(--adm-surface-raised)] p-4">
            <summary className="cursor-pointer list-none font-serif text-[16px] font-medium text-[var(--adm-text)]">
              Módszertan — A Grow folyamat és szakmai alapelvek
            </summary>
            <div className="mt-3 border-t border-[var(--adm-border)] pt-3">
              <p className={`text-[11px] ${MUTED}`}>
                Hogyan jutunk el a működési jelzéstől a mért és számított eredményekig?
              </p>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  { step: "1. Feltárás", desc: "Kérdőíves felmérések és a napi működési szűk keresztmetszetek rögzítése." },
                  { step: "2. Elemzés", desc: "Szakértői felülvizsgálat és összevetés a vonatkozó szakirodalmi háttérrel." },
                  { step: "3. Tervezés", desc: "Célorientált fejlesztési javaslatok és megvalósítási lépések kidolgozása." },
                  { step: "4. Megvalósítás", desc: "Folyamatoptimalizálási beavatkozások és intézkedések végrehajtása." },
                  { step: "5. Eredmények", desc: "Kapacitásfelszabadulás, időmegtakarítás és folyamatminőség ellenőrzött mérése." },
                ].map((item, idx) => (
                  <div key={idx} className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-2.5">
                    <p className="text-[11px] font-semibold text-[var(--adm-text)]">
                      {idx + 1}. {item.step.replace(/^\d+\.\s*/, "")}
                    </p>
                    <p className={`mt-1 text-[11px] leading-4 ${MUTED}`}>{item.desc}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[var(--adm-green-800)]" />
                  <p className={`text-[10px] font-bold uppercase tracking-[0.12em] ${SOFT}`}>Módszertani alapelv</p>
                </div>
                <p className={`mt-1.5 text-[11px] leading-relaxed ${MUTED}`}>
                  {"Nincs elméleti érettségi besorolás. A rendszer rögzített megfigyelésekből, felmérési válaszokból, mérésekből és elérhető bizonyítékokból építkezik, azok forrását elkülönítve."}
                </p>
                <p className={`mt-1.5 text-[11px] leading-relaxed ${MUTED}`}>
                  A felmérések a vállalat által megadott válaszokat és működési megfigyeléseket rendszerezik; ezek
                  további szakértői értékelés és más adatforrások mellett használhatók fel.
                </p>
              </div>
            </div>
          </details>
        </div>
      ) : null}

      {/* TAB 3: FEJLESZTÉSI IRÁNYOK */}
      {activeTab === "fejlesztesi-iranyok" ? (
        (() => {
          const activeOpportunity =
            selectedPublicationId && data?.opportunities
              ? data.opportunities.find((opp) => opp.publicationId === selectedPublicationId) ?? null
              : null;

          if (activeOpportunity) {
            return (
              <AdminPanel className={PANEL} data-testid="grow-opportunity-detail">
                <div className="flex items-center justify-between gap-4 border-b border-[var(--adm-border)] pb-3">
                  <AdminButton
                    size="sm"
                    variant="ghost"
                    data-testid="grow-opportunity-detail-back"
                    onClick={handleBackToOpportunities}
                  >
                    ← Vissza a lehetőségekhez
                  </AdminButton>
                  <AdminStatusPill tone="green">Közzétett lehetőség</AdminStatusPill>
                </div>

                <div className="mt-5 max-w-3xl">
                  <p className={`text-[10.5px] font-bold uppercase tracking-[0.14em] ${SOFT}`}>Fejlesztési irány</p>
                  <h2
                    className="mt-2 font-serif text-[26px] font-medium leading-tight text-[var(--adm-text)]"
                    data-testid="grow-opportunity-detail-title"
                  >
                    {activeOpportunity.title}
                  </h2>
                  {activeOpportunity.publishedAt ? (
                    <p className={`mt-2 text-[11px] ${SOFT}`}>
                      Közzétéve:{" "}
                      {new Date(activeOpportunity.publishedAt).toLocaleDateString("hu-HU", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  ) : null}

                  <div className="mt-6 space-y-6">
                    <div>
                      <h3 className={`text-[11px] font-bold uppercase tracking-[0.12em] ${SOFT}`}>Összefoglaló</h3>
                      <p className={`mt-2 whitespace-pre-line text-[14px] leading-7 ${MUTED}`}>
                        {activeOpportunity.summary}
                      </p>
                    </div>

                    {activeOpportunity.direction ? (
                      <div className="rounded-[var(--adm-radius-md)] border border-[var(--adm-semantic-success-border)] bg-[var(--adm-semantic-success-soft)] p-4">
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--adm-semantic-success)]">
                          Javasolt irány
                        </h3>
                        <p className="mt-1.5 text-[14px] font-medium leading-7 text-[var(--adm-text)]">
                          {activeOpportunity.direction}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[var(--adm-border)] pt-5">
                    <AdminButton size="sm" variant="neutral" onClick={handleBackToOpportunities}>
                      ← Vissza a lehetőségekhez
                    </AdminButton>
                    <Link
                      href="/portal/megkeresesek"
                      className="inline-flex items-center rounded-[var(--adm-radius-sm)] bg-[var(--adm-green-950)] px-4 py-2 text-[12px] font-semibold text-[var(--adm-ivory-50)] hover:bg-[var(--adm-green-900)]"
                    >
                      Kérdése van a fejlesztési irányról? Írjon az irodának →
                    </Link>
                  </div>
                </div>
              </AdminPanel>
            );
          }

          if (data?.opportunities && data.opportunities.length > 0) {
            return (
              <AdminPanel className={PANEL} data-testid="grow-opportunities-section">
                <AdminSectionHeader
                  eyebrow="Közzétett irányok"
                  title="Fejlesztési irányok"
                  subtitle="Az itt megjelenő lehetőségeket jóváhagyást követően tettük közzé az Ön szervezete számára."
                  titleAs="h2"
                  action={<AdminStatusPill tone="green">Közzétett lehetőségek: {data.opportunities.length}</AdminStatusPill>}
                />

                <div className="mt-5 space-y-3" data-testid="grow-opportunities-list">
                  {data.opportunities.map((opp) => (
                    <AdminPanel key={opp.publicationId || opp.title} className={PANEL} data-testid="grow-opportunity-item">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <h3 className="font-serif text-[17px] font-medium text-[var(--adm-text)]">{opp.title}</h3>
                        {opp.publishedAt ? (
                          <span className={`whitespace-nowrap text-[11px] ${SOFT}`}>
                            {new Date(opp.publishedAt).toLocaleDateString("hu-HU", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        ) : null}
                      </div>
                      {opp.summary ? (
                        <p className={`mt-2 text-[13px] leading-6 ${MUTED}`}>{opp.summary}</p>
                      ) : null}
                      {opp.direction ? (
                        <p className="mt-3 text-[12px] text-[var(--adm-text)]">
                          <span className="font-semibold">Irány:</span> {opp.direction}
                        </p>
                      ) : null}
                      <div className="mt-4 flex items-center justify-between gap-4 border-t border-[var(--adm-border)] pt-3">
                        <AdminButton
                          size="xs"
                          variant="ghost"
                          data-testid="grow-opportunity-open-detail"
                          onClick={() => handleSelectOpportunity(opp.publicationId)}
                        >
                          Részletek →
                        </AdminButton>
                        <span className={`text-[11px] ${SOFT}`}>Ügyféloldalra közzétéve</span>
                      </div>
                    </AdminPanel>
                  ))}
                </div>
              </AdminPanel>
            );
          }

          return (
            <AdminPanel className={PANEL} data-testid="grow-opportunities-section">
              <div className="max-w-2xl" data-testid="grow-opportunities-empty">
                <AdminStatusPill tone="neutral">Közzétételi állapot</AdminStatusPill>
                <h2 className="mt-3 font-serif text-[22px] font-medium leading-tight text-[var(--adm-text)]">
                  Jelenleg nincs ügyféloldalon közzétett fejlesztési lehetőség.
                </h2>
                <p className={`mt-3 text-[13px] leading-6 ${MUTED}`}>
                  Ha egy fejlesztési irány jóváhagyást követően ügyféloldali közzétételre kerül, itt fog megjelenni.
                </p>

                <div className={`mt-5 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 text-[11px] leading-5 ${MUTED}`}>
                  <p className="font-semibold text-[var(--adm-text)]">
                    Jelenleg nincs ügyféloldalon közzétett fejlesztési lehetőség.
                  </p>
                  <p className="mt-0.5">
                    {data?.opportunitiesDeferredNotice ||
                      "A fejlesztési lehetőségek csak jóváhagyott ügyféloldali közzétételi folyamaton keresztül jelenhetnek meg."}
                  </p>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href="/portal/megkeresesek"
                    className="inline-flex items-center rounded-[var(--adm-radius-sm)] bg-[var(--adm-green-950)] px-4 py-2 text-[12px] font-semibold text-[var(--adm-ivory-50)] hover:bg-[var(--adm-green-900)]"
                  >
                    Kérdése van a vizsgálatról? Írjon az irodának →
                  </Link>
                  <AdminButton size="sm" variant="neutral" onClick={() => handleTabChange("teendok")}>
                    Felmérések megnyitása
                  </AdminButton>
                </div>
              </div>
            </AdminPanel>
          );
        })()
      ) : null}

      {/* TAB 4: KEZDEMÉNYEZÉSEK */}
      {activeTab === "kezdemenyezesek" ? (
        (() => {
          const activeInitiative: PortalGrowInitiative | null = selectedInitiativeId
            ? initiatives.find((item) => item.id === selectedInitiativeId) ?? null
            : null;

          if (activeInitiative) {
            const relatedOutcomes = allOutcomes.filter(
              (outcome) => outcome.initiativeTitle === activeInitiative.title,
            );
            const completedMilestones = activeInitiative.milestones.filter(
              (milestone) => milestone.statusLabel === "Teljesítve",
            ).length;
            return (
              <AdminPanel className={PANEL} data-testid="grow-initiative-detail">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--adm-border)] pb-3">
                  <AdminButton
                    size="sm"
                    variant="ghost"
                    data-testid="grow-initiative-detail-back"
                    onClick={handleBackToInitiatives}
                  >
                    ← Vissza a kezdeményezésekhez
                  </AdminButton>
                  <AdminStatusPill tone="neutral">Fejlesztési kezdeményezés</AdminStatusPill>
                </div>

                <div className="mt-5 max-w-3xl">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2
                      className="font-serif text-[26px] font-medium leading-tight text-[var(--adm-text)]"
                      data-testid="grow-initiative-detail-title"
                    >
                      {activeInitiative.title}
                    </h2>
                    <AdminStatusPill tone={initiativeTone(activeInitiative.statusLabel)}>
                      {activeInitiative.statusLabel}
                    </AdminStatusPill>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {activeInitiative.targetState ? (
                      <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
                        <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${SOFT}`}>Célállapot</p>
                        <p className="mt-1 text-[13px] text-[var(--adm-text)]">{activeInitiative.targetState}</p>
                      </div>
                    ) : null}
                    <div className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
                      <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${SOFT}`}>Célhatáridő</p>
                      <p className="mt-1 text-[13px] text-[var(--adm-text)]">
                        {activeInitiative.targetAt ? formatDate(activeInitiative.targetAt) : "Nincs megadva"}
                      </p>
                    </div>
                  </div>

                  {activeInitiative.hasRelatedMatter ? (
                    <div className={`mt-4 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 text-[13px] ${MUTED}`}>
                      Ehhez a kezdeményezéshez kapcsolódó ügy látható az ügyek között.{" "}
                      <Link href="/portal/ugyek" className="font-semibold text-[var(--adm-green-800)] hover:underline">
                        Kapcsolódó ügy →
                      </Link>
                    </div>
                  ) : null}

                  <div className="mt-6" data-testid="grow-initiative-detail-milestones">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className={`text-[11px] font-bold uppercase tracking-[0.12em] ${SOFT}`}>Mérföldkövek</h3>
                      {activeInitiative.milestones.length > 0 ? (
                        <span className={`text-[11px] ${SOFT}`}>
                          {completedMilestones} / {activeInitiative.milestones.length} teljesítve
                        </span>
                      ) : null}
                    </div>
                    {activeInitiative.milestones.length > 0 ? (
                      <ol className="mt-3 space-y-2.5">
                        {activeInitiative.milestones.map((milestone) => (
                          <li
                            key={milestone.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface-raised)] p-3"
                            data-testid="grow-initiative-milestone"
                          >
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-[var(--adm-text)]">{milestone.title}</p>
                              <p className={`mt-0.5 text-[11px] ${SOFT}`}>{formatDate(milestone.date)}</p>
                            </div>
                            <AdminStatusPill tone={milestoneTone(milestone.statusLabel)}>
                              {milestone.statusLabel}
                            </AdminStatusPill>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className={`mt-3 text-[13px] ${MUTED}`}>
                        Ehhez a kezdeményezéshez még nincsenek mérföldkövek rögzítve.
                      </p>
                    )}
                  </div>

                  {relatedOutcomes.length > 0 ? (
                    <div className="mt-6" data-testid="grow-initiative-detail-outcomes">
                      <h3 className={`text-[11px] font-bold uppercase tracking-[0.12em] ${SOFT}`}>Kapcsolódó eredmények</h3>
                      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                        {relatedOutcomes.map((outcome) => (
                          <div
                            key={outcome.id}
                            className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3"
                          >
                            <AdminStatusPill tone={outcomeTone(outcome.basis)}>{outcome.basisLabel}</AdminStatusPill>
                            {outcome.processName ? (
                              <p className={`mt-1.5 text-[11px] ${MUTED}`}>Érintett folyamat: {outcome.processName}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[var(--adm-border)] pt-4">
                    <AdminButton size="sm" variant="neutral" onClick={handleBackToInitiatives}>
                      ← Vissza a kezdeményezésekhez
                    </AdminButton>
                  </div>
                </div>
              </AdminPanel>
            );
          }

          return (
            <AdminPanel className={PANEL}>
              <AdminSectionHeader
                eyebrow="Kezdeményezések"
                title="Min dolgozunk jelenleg?"
                titleAs="h2"
                action={
                  <div className="flex flex-wrap gap-2">
                    <AdminStatusPill tone="neutral">Tervezett: {plannedInitiativesCount}</AdminStatusPill>
                    <AdminStatusPill tone="blue">Folyamatban: {activeInitiativesCount}</AdminStatusPill>
                    <AdminStatusPill tone="green">Lezárt: {completedInitiativesCount}</AdminStatusPill>
                  </div>
                }
              />

              <div className="flex flex-wrap gap-2 border-b border-[var(--adm-border)] py-3" role="tablist" aria-label="Kezdeményezés szűrők">
                {[
                  { id: "all", label: `Összes (${initiatives.length})` },
                  { id: "planned", label: `Tervezett (${plannedInitiativesCount})` },
                  { id: "active", label: `Folyamatban (${activeInitiativesCount})` },
                  { id: "completed", label: `Lezárt (${completedInitiativesCount})` },
                ].map((filter) => (
                  <AdminButton
                    key={filter.id}
                    role="tab"
                    aria-selected={initiativeFilter === filter.id}
                    variant={initiativeFilter === filter.id ? "primary" : "neutral"}
                    size="xs"
                    onClick={() => setInitiativeFilter(filter.id as InitiativeFilter)}
                  >
                    {filter.label}
                  </AdminButton>
                ))}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {filteredInitiatives.length > 0 ? (
                  filteredInitiatives.map((item) => {
                    const milestones = item.milestones || [];
                    const completed = milestones.filter((milestone) => milestone.statusLabel === "Teljesítve").length;
                    return (
                      <AdminPanel key={item.id} className={PANEL}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h3 className="text-[15px] font-semibold text-[var(--adm-text)]">{item.title}</h3>
                          <AdminStatusPill tone={initiativeTone(item.statusLabel)}>{item.statusLabel}</AdminStatusPill>
                        </div>

                        {item.targetState ? (
                          <div className="mt-3">
                            <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${SOFT}`}>Célállapot</p>
                            <p className={`mt-0.5 text-[13px] ${MUTED}`}>{item.targetState}</p>
                          </div>
                        ) : null}

                        {milestones.length > 0 ? (
                          <div className="mt-3" data-testid={`grow-initiative-milestones-${item.id}`}>
                            <div className={`flex flex-wrap items-center justify-between gap-2 text-[11px] ${SOFT}`}>
                              <span className="font-semibold uppercase tracking-[0.12em]">Mérföldkövek</span>
                              <span>
                                {completed} / {milestones.length} teljesítve
                              </span>
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-4 border-t border-[var(--adm-border)] pt-3">
                          <div className={`flex flex-wrap items-center justify-between gap-2 text-[11px] ${SOFT}`}>
                            {item.targetAt ? (
                              <span>
                                Célhatáridő: <strong className="text-[var(--adm-text)]">{formatDate(item.targetAt)}</strong>
                              </span>
                            ) : (
                              <span />
                            )}
                            {item.hasRelatedMatter ? (
                              <Link href={`/portal/ugyek`} className="font-semibold text-[var(--adm-green-800)] hover:underline">
                                Kapcsolódó ügy →
                              </Link>
                            ) : null}
                          </div>
                          <div className="mt-3 flex items-center justify-end">
                            <AdminButton
                              size="xs"
                              variant="ghost"
                              data-testid={`grow-initiative-open-detail-${item.id}`}
                              onClick={() => handleSelectInitiative(item.id)}
                            >
                              Részletek →
                            </AdminButton>
                          </div>
                        </div>
                      </AdminPanel>
                    );
                  })
                ) : (
                  <p className={`col-span-2 py-4 text-[13px] ${MUTED}`}>Nincs a szűrésnek megfelelő kezdeményezés.</p>
                )}
              </div>
            </AdminPanel>
          );
        })()
      ) : null}

      {/* TAB 5: EREDMÉNYEK */}
      {activeTab === "eredmenyek" ? (
        <AdminPanel className={PANEL}>
          <AdminSectionHeader
            eyebrow="Eredmények és hatás"
            title="Mit értünk el?"
            subtitle="Mérési alapon rögzített eredmények, felszabadított kapacitások és folyamathatások."
            titleAs="h2"
          />

          {measuredOutcomes.length > 0 ? (
            <div className="mt-5">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--adm-semantic-success)]">
                Mért eredmények ({measuredOutcomes.length})
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {measuredOutcomes.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-semantic-success-border)] bg-[var(--adm-semantic-success-soft)] p-4"
                  >
                    <AdminStatusPill tone="green">{item.basisLabel}</AdminStatusPill>
                    {item.initiativeTitle ? (
                      <p className="mt-2 text-[13px] font-medium text-[var(--adm-text)]">
                        Kezdeményezés: <span className="font-semibold">{item.initiativeTitle}</span>
                      </p>
                    ) : null}
                    {item.processName ? (
                      <p className={`mt-1 text-[11px] ${MUTED}`}>Érintett folyamat: {item.processName}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {estimatedOutcomes.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text)]">
                Számított / becsült eredmények ({estimatedOutcomes.length})
              </h3>

              {calculatedOutcomes.length > 0 ? (
                <div className="mt-3">
                  <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${SOFT}`}>
                    Számított eredmények ({calculatedOutcomes.length})
                  </p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {calculatedOutcomes.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4"
                      >
                        <AdminStatusPill tone="gold">{item.basisLabel}</AdminStatusPill>
                        {item.initiativeTitle ? (
                          <p className="mt-2 text-[13px] font-medium text-[var(--adm-text)]">
                            Kezdeményezés: <span className="font-semibold">{item.initiativeTitle}</span>
                          </p>
                        ) : null}
                        {item.processName ? (
                          <p className={`mt-1 text-[11px] ${MUTED}`}>Érintett folyamat: {item.processName}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {estimatedOnlyOutcomes.length > 0 ? (
                <div className="mt-4">
                  <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${SOFT}`}>
                    Becsült eredmények ({estimatedOnlyOutcomes.length})
                  </p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {estimatedOnlyOutcomes.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4"
                      >
                        <AdminStatusPill tone="neutral">{item.basisLabel}</AdminStatusPill>
                        {item.initiativeTitle ? (
                          <p className="mt-2 text-[13px] font-medium text-[var(--adm-text)]">
                            Kezdeményezés: <span className="font-semibold">{item.initiativeTitle}</span>
                          </p>
                        ) : null}
                        {item.processName ? (
                          <p className={`mt-1 text-[11px] ${MUTED}`}>Érintett folyamat: {item.processName}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {allOutcomes.length === 0 ? (
            <CompactState
              className="mt-5"
              title="Még nincs rögzített eredmény."
              detail="Az eredmények akkor jelennek meg, amikor egy fejlesztési kezdeményezéshez mérési alap kerül rögzítésre."
            />
          ) : null}

          <div className={`mt-5 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 text-[11px] leading-5 ${MUTED}`}>
            <p className="font-semibold text-[var(--adm-text)]">Módszertan és forrásmegjelölés</p>
            <p className="mt-0.5">
              Mért eredményként csak MEASURED alapú eredmény jelenik meg. Számított és becsült hatások külön
              kategóriában szerepelnek.
            </p>
          </div>
        </AdminPanel>
      ) : null}

      {/* TAB 6: MŰKÖDÉS — the known operating context */}
      {activeTab === "mukodes" ? (
        <AdminPanel className={PANEL}>
          <AdminSectionHeader
            eyebrow="Működés és rendszerek"
            title="Feltérképezett üzleti folyamatok"
            subtitle="Mit tud jelenleg a rendszer a működéséről? A szervezet felmért folyamatai, végrehajtási lépései, jóváhagyási pontjai és kapcsolódó informatikai eszközei."
            titleAs="h2"
            action={
              <Link
                href="/portal/vallalat"
                className="inline-flex items-center rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface-raised)] px-3 py-1.5 text-[11px] font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]"
              >
                Teljes vállalati kontextus →
              </Link>
            }
          />

          <div className="mt-5 grid gap-4">
            {processes.length > 0 ? (
              processes.map((proc) => (
                <AdminPanel key={proc.id} className={PANEL}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${SOFT}`}>
                        {proc.category} {proc.organizationGroupName ? `· ${proc.organizationGroupName}` : ""}
                      </p>
                      <h3 className="mt-0.5 text-[17px] font-semibold text-[var(--adm-text)]">{proc.name}</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <AdminStatusPill tone="neutral">Gyakoriság: {proc.frequency}</AdminStatusPill>
                      <AdminStatusPill tone="neutral">Kritikusság: {proc.criticality}</AdminStatusPill>
                      <AdminStatusPill tone="neutral">
                        Jóváhagyási pont: {proc.steps.filter((step) => step.isApproval).length}
                      </AdminStatusPill>
                    </div>
                  </div>

                  {proc.steps.length > 0 ? (
                    <div className="mt-4">
                      <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${SOFT}`}>
                        Folyamat lépései ({proc.steps.length} lépés)
                      </p>
                      <div
                        className="mt-2 -mx-1 overflow-x-auto px-1 pb-1"
                        data-testid={`grow-process-flow-${proc.id}`}
                      >
                        <ol className="flex min-w-max items-stretch gap-2 lg:min-w-0 lg:flex-wrap">
                          {proc.steps.map((step, stepIndex) => (
                            <li key={step.id} className="flex items-stretch">
                              <div
                                className="flex w-56 shrink-0 flex-col justify-between rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 text-[13px]"
                                data-testid={`grow-process-step-${step.id}`}
                              >
                                <div>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className={`text-[11px] font-semibold ${SOFT}`}>{step.position}. lépés</span>
                                    {step.isApproval ? <AdminBadge tone="amber">Jóváhagyási kapu</AdminBadge> : null}
                                  </div>
                                  <p className="mt-1 font-medium leading-snug text-[var(--adm-text)]">{step.name}</p>
                                </div>
                                {step.systemName ? (
                                  <p className={`mt-2.5 border-t border-[var(--adm-border)] pt-2 text-[11px] ${MUTED}`}>
                                    Rendszer: <span className="font-semibold text-[var(--adm-text)]">{step.systemName}</span>
                                    {step.systemCategory ? ` (${step.systemCategory})` : ""}
                                  </p>
                                ) : null}
                              </div>
                              {stepIndex < proc.steps.length - 1 ? (
                                <span aria-hidden="true" className={`flex shrink-0 items-center px-1 ${SOFT}`}>
                                  →
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  ) : (
                    <p className={`mt-3 text-[11px] ${SOFT}`}>
                      Ehhez a folyamathoz még nincsenek részletes lépések dokumentálva.
                    </p>
                  )}
                </AdminPanel>
              ))
            ) : (
              <CompactState
                title="Nincsenek feltérképezett folyamatok"
                detail="Ehhez a szervezethez még nincsenek üzleti folyamatok rögzítve."
              />
            )}
          </div>

          {/* Assessment / survey history is secondary operating context only. */}
          {packs.length > 0 || surveys.length > 0 ? (
            <div className="mt-6 border-t border-[var(--adm-border)] pt-5">
              <h3 className={`mb-3 text-[11px] font-bold uppercase tracking-[0.12em] ${SOFT}`}>
                Korábbi adatkérések és visszajelzések
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className={`mb-2 text-[11px] font-semibold ${MUTED}`}>Kitöltött felmérések</p>
                  {completedPacksCount > 0 ? (
                    <ul className="space-y-1.5">
                      {packs
                        .filter((p) => p.status === "COMPLETED")
                        .map((p) => (
                          <li key={p.packKey} className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                            <span className="text-[var(--adm-text)]">{p.titleHu}</span>
                            <span className={SOFT}>{p.latestCompletedAt ? formatDate(p.latestCompletedAt) : ""}</span>
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p className={`text-[11px] ${SOFT}`}>Még nincs kitöltött felmérés.</p>
                  )}
                </div>
                <div>
                  <p className={`mb-2 text-[11px] font-semibold ${MUTED}`}>Működési visszajelzések</p>
                  {surveys.length > 0 ? (
                    <ul className="space-y-1.5">
                      {surveys.map((s, idx) => (
                        <li key={idx} className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                          <span className="text-[var(--adm-text)]">{s.categoryLabels.join(", ")}</span>
                          <span className={SOFT}>{formatDate(s.submittedAt)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={`text-[11px] ${SOFT}`}>Még nincs beküldött visszajelzés.</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </AdminPanel>
      ) : null}
    </div>
  );
}
