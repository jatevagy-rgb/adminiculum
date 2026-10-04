"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, SafePanelError } from "@/components/ui";
import { AdminBadge, AdminStatusPill } from "@/components/adminiculum/ui";
import {
  getPortalGrowAssessment,
  getPortalOrgGrow,
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
import { projectGrowOperatingProcess } from "@/lib/growOperatingProjection";
import { OrgGrowOperatingCanvas } from "@/components/client-portal/OrgGrowOperatingCanvas";
import { OrgGrowContextInspector } from "@/components/client-portal/OrgGrowContextInspector";
import { PortalEmptyInline } from "../shared/PortalEmptyInline";

/**
 * Client Portal 3.0 Grow body — the /portal/fejlesztes ORGANIZATION surface.
 *
 * Consumes the canonical customer-safe Grow projections only (getPortalOrgGrow,
 * listPortalGrowAssessments, getPortalGrowAssessment, listPortalGrowSurveys)
 * plus the two canonical Grow input channels (assessment submissions, operating
 * signal surveys). Questionnaires, surveys and assessments are INPUT channels
 * (Teendők), never the product hero; outcomes keep their MEASURED /
 * CALCULATED / ESTIMATED truthfulness split and no score is invented.
 */

export type GrowTab =
  | "attekintes"
  | "teendok"
  | "fejlesztesi-iranyok"
  | "kezdemenyezesek"
  | "eredmenyek"
  | "mukodes";

/**
 * Deterministic legacy deep-link mapping (shared with the legacy surface):
 *   ?tab=felmeresek   -> teendok
 *   ?tab=folyamatok   -> mukodes
 *   ?tab=lehetosegek  -> fejlesztesi-iranyok
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

export function resolveGrowTabV3(raw: string | null): GrowTab | null {
  if (!raw) return null;
  return LEGACY_TAB_MAP[raw] ?? null;
}

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

type AssessmentView = { mode: "catalogue" } | { mode: "runner"; packKey: string } | { mode: "result"; packKey: string };
type AssessmentFilter = "all" | "uncompleted" | "completed";
type InitiativeFilter = "all" | "planned" | "active" | "completed";

type PillTone = "green" | "amber" | "gold" | "neutral";

function initiativeTone(statusLabel: string): PillTone {
  if (statusLabel.includes("Lezárva") || statusLabel.includes("Megvalósult")) return "green";
  if (statusLabel === "Folyamatban") return "gold";
  return "neutral";
}

function outcomeTone(basis: PortalGrowOutcome["basis"]): PillTone {
  if (basis === "MEASURED") return "green";
  if (basis === "CALCULATED") return "gold";
  return "neutral";
}

const CARD =
  "min-w-0 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-4 sm:p-5";
const EYEBROW = "text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-secondary)]";
const MUTED = "text-[var(--adm-text-secondary)]";

/**
 * F8 single-page information architecture: Fejlesztés is one vertically
 * readable customer product with five numbered blocks, in the canonical order
 * 1. Most Önre vár — 2. Amin érdemes dolgozni — 3. Folyamatban —
 * 4. Az Ön működése — 5. Eredmények. Every legacy ?tab= value maps
 * deterministically to one of these anchors (see resolveGrowTabV3); detail
 * views (assessment runner/result, opportunity detail, initiative detail) keep
 * their focused full-page rendering.
 */
const GROW_SECTION_ANCHORS: Record<GrowTab, string | null> = {
  attekintes: null,
  teendok: "grow-section-teendok",
  "fejlesztesi-iranyok": "grow-section-fejlesztesi-iranyok",
  kezdemenyezesek: "grow-section-kezdemenyezesek",
  eredmenyek: "grow-section-eredmenyek",
  mukodes: "grow-section-mukodes",
};

function GrowSectionHeader({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div>
      <p className={EYEBROW}>{step}</p>
      <h2 className="mt-1 font-serif text-[22px] font-medium leading-tight text-[var(--adm-text-primary)]">{title}</h2>
      <p className={`mt-1 max-w-3xl text-sm leading-6 ${MUTED}`}>{description}</p>
    </div>
  );
}

export function PortalGrowV3() {
  const [data, setData] = useState<PortalOrgGrow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [activeTab, setActiveTab] = useState<GrowTab>("attekintes");
  const [selectedPublicationId, setSelectedPublicationId] = useState<string | null>(null);
  const [selectedInitiativeId, setSelectedInitiativeId] = useState<string | null>(null);
  const [selectedOperatingProcessId, setSelectedOperatingProcessId] = useState<string | null>(null);
  const [selectedOperatingStepId, setSelectedOperatingStepId] = useState<string | null>(null);
  const [growViewMode, setGrowViewMode] = useState<"map" | "list">("map");

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedProcessId, setSelectedProcessId] = useState<string>("");
  const [freeText, setFreeText] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [surveys, setSurveys] = useState<PortalGrowSurveyItem[]>([]);
  const idempotencyKeyRef = useRef<string>(generateUUID());

  const [catalogue, setCatalogue] = useState<PortalGrowAssessmentCatalogue | null>(null);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
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
  const [assessmentProcessId, setAssessmentProcessId] = useState<string>("");
  const assessmentKeyRef = useRef<string>(generateUUID());

  const [assessmentFilter, setAssessmentFilter] = useState<AssessmentFilter>("all");
  const [initiativeFilter, setInitiativeFilter] = useState<InitiativeFilter>("all");
  const [selectedPackKey, setSelectedPackKey] = useState<string | null>(null);

  const loadSurveys = useCallback(async () => {
    try {
      const res = await listPortalGrowSurveys();
      if (res && Array.isArray(res.items)) setSurveys(res.items);
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
  }, [load, reloadNonce]);

  // URL-backed tab / selection state with legacy deep-link mapping.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const apply = () => {
      const params = new URLSearchParams(window.location.search);
      const rawTab = params.get("tab");
      const opp = params.get("opportunity");
      const initiative = params.get("initiative");
      const processId = params.get("processId");
      const tab = resolveGrowTabV3(rawTab);

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

      setSelectedOperatingProcessId(tab === "mukodes" && processId ? processId : null);
      setSelectedOperatingStepId(null);

      if (rawTab && tab && rawTab !== tab) {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", tab);
        window.history.replaceState({}, "", url.toString());
      }
    };

    apply();
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, []);

  const handleTabChange = useCallback((tab: GrowTab) => {
    setActiveTab(tab);
    if (tab !== "fejlesztesi-iranyok") setSelectedPublicationId(null);
    if (tab !== "kezdemenyezesek") setSelectedInitiativeId(null);
    if (tab !== "mukodes") {
      setSelectedOperatingProcessId(null);
      setSelectedOperatingStepId(null);
    }
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      if (tab !== "fejlesztesi-iranyok") url.searchParams.delete("opportunity");
      if (tab !== "kezdemenyezesek") url.searchParams.delete("initiative");
      if (tab !== "mukodes") url.searchParams.delete("processId");
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

  const handleSelectOperatingProcess = useCallback((processId: string) => {
    setSelectedOperatingProcessId(processId);
    setSelectedOperatingStepId(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "mukodes");
      url.searchParams.set("processId", processId);
      window.history.pushState({}, "", url.toString());
    }
  }, []);

  const handleClearOperatingSelection = useCallback(() => {
    setSelectedOperatingProcessId(null);
    setSelectedOperatingStepId(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "mukodes");
      url.searchParams.delete("processId");
      window.history.pushState({}, "", url.toString());
    }
  }, []);

  const startAssessment = useCallback((packKey: string, processId?: string | null) => {
    setActiveTab("teendok");
    setAssessmentBusy(true);
    setAssessmentError(null);
    void getPortalGrowAssessment(packKey, processId)
      .then((detail) => {
        setRunnerDetail(detail);
        setRunnerIndex(0);
        setRunnerAnswers({});
        setAssessmentProcessId(processId ?? "");
        assessmentKeyRef.current = generateUUID();
        setAssessmentView({ mode: "runner", packKey });
      })
      .catch((err) => setAssessmentError(clientSafeError(err)))
      .finally(() => setAssessmentBusy(false));
  }, []);

  const viewAssessmentResult = useCallback((packKey: string, processId?: string | null) => {
    setActiveTab("teendok");
    setAssessmentBusy(true);
    setAssessmentError(null);
    void getPortalGrowAssessment(packKey, processId)
      .then((detail) => {
        setAssessmentResult(detail.latestResult);
        setAssessmentResultUnavailable(detail.latestResult === null);
        setAssessmentResultScope(detail.resultScope ?? null);
        setAssessmentView({ mode: "result", packKey });
      })
      .catch((err) => setAssessmentError(clientSafeError(err)))
      .finally(() => setAssessmentBusy(false));
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
  }, [runnerDetail, runnerAnswers, assessmentProcessId, loadCatalogue]);

  const handleSurveySubmit = async (event: React.FormEvent) => {
    event.preventDefault();
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

  const processes: PortalGrowProcess[] = data?.processes || [];
  const initiatives: PortalGrowInitiative[] = data?.initiatives || [];
  const measuredOutcomes = data?.outcomes.measured || [];
  const estimatedOutcomes = data?.outcomes.calculatedOrEstimated || [];
  const calculatedOutcomes = estimatedOutcomes.filter((o) => o.basis === "CALCULATED");
  const estimatedOnlyOutcomes = estimatedOutcomes.filter((o) => o.basis === "ESTIMATED");
  const allOutcomes = [...measuredOutcomes, ...estimatedOutcomes];
  const packs = catalogue?.packs || [];
  const aggregatedFindings = catalogue?.aggregatedFindings || [];
  const hasCompletedPack = packs.some((p) => p.status === "COMPLETED");

  const completedResultScopes = packs.filter((p) => p.status === "COMPLETED").flatMap((p) => p.resultScopes);
  const hasEvaluableCompletedPack = completedResultScopes.some((s) => s.resultAvailable);
  const hasUnavailableCompletedPack = completedResultScopes.some((s) => !s.resultAvailable);

  const runnerQuestions = runnerDetail?.definition.questions || [];
  const currentQuestion = runnerQuestions[runnerIndex];
  const isLastQuestion = runnerQuestions.length > 0 && runnerIndex === runnerQuestions.length - 1;
  const currentAnswered = currentQuestion ? Boolean(runnerAnswers[currentQuestion.questionKey]) : false;
  const requiresProcess = Boolean(runnerDetail?.definition.allowsProcessReference && processes.length > 0);
  const processReady = !requiresProcess || assessmentProcessId !== "";

  const uncompletedPacksCount = packs.filter((p) => p.status !== "COMPLETED").length;
  const completedPacksCount = packs.filter((p) => p.status === "COMPLETED").length;
  const publishedOpportunitiesCount = data?.opportunities?.length ?? 0;

  const activeOperatingProcess = selectedOperatingProcessId
    ? processes.find((p) => p.id === selectedOperatingProcessId) ?? null
    : null;
  const activeOperatingProcessView = activeOperatingProcess
    ? projectGrowOperatingProcess(activeOperatingProcess)
    : null;

  const filteredPacks = packs.filter((p) => {
    if (assessmentFilter === "uncompleted") return p.status !== "COMPLETED";
    if (assessmentFilter === "completed") return p.status === "COMPLETED";
    return true;
  });

  const filteredInitiatives = initiatives.filter((i) => {
    if (initiativeFilter === "planned") return i.statusLabel === "Tervezett" || i.statusLabel === "Tervezés alatt";
    if (initiativeFilter === "active") return i.statusLabel === "Folyamatban";
    if (initiativeFilter === "completed") return i.statusLabel.includes("Lezárva") || i.statusLabel.includes("Megvalósult");
    return true;
  });

  const activeOpportunity =
    selectedPublicationId && data?.opportunities
      ? data.opportunities.find((opp) => opp.publicationId === selectedPublicationId) ?? null
      : null;

  const activeInitiative: PortalGrowInitiative | null = selectedInitiativeId
    ? initiatives.find((item) => item.id === selectedInitiativeId) ?? null
    : null;

  // F8 focused rendering: exactly one focused view can take over the page,
  // preserving the pre-F8 exclusivity of the detail/runner modes.
  const focus: "assessment" | "opportunity" | "initiative" | null =
    assessmentView.mode !== "catalogue" ? "assessment" : activeOpportunity ? "opportunity" : activeInitiative ? "initiative" : null;

  // Deep-link / jump focus: when the page is unfocused, the active (canonically
  // mapped) tab scrolls to its section anchor — never a silent first-item fallback.
  useEffect(() => {
    if (loading || error || focus !== null) return;
    const targetId = GROW_SECTION_ANCHORS[activeTab];
    if (!targetId) return;
    const timer = window.setTimeout(() => {
      const element = document.getElementById(targetId);
      if (element && typeof element.scrollIntoView === "function") {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);
    return () => window.clearTimeout(timer);
  }, [loading, error, focus, activeTab]);

  if (loading) {
    return (
      <div aria-label="Működésfejlesztés betöltése" data-testid="portal-grow-loading" className="space-y-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-24 animate-pulse rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="portal-grow-v3">
        <SafePanelError detail={error} onRetry={() => setReloadNonce((value) => value + 1)} />
      </div>
    );
  }

  const NAV_ITEMS: Array<{ id: GrowTab; label: string; count?: number }> = [
    { id: "attekintes", label: "Áttekintés" },
    { id: "teendok", label: "Most Önre vár", count: uncompletedPacksCount },
    { id: "fejlesztesi-iranyok", label: "Amin érdemes dolgozni", count: publishedOpportunitiesCount },
    { id: "kezdemenyezesek", label: "Folyamatban", count: initiatives.length },
    { id: "mukodes", label: "Az Ön működése", count: processes.length },
    { id: "eredmenyek", label: "Eredmények", count: allOutcomes.length },
  ];

  return (
    <div className="space-y-5" data-testid="org-grow-view">
      <header className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-4 py-4 sm:px-5">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-[var(--adm-text-primary)] sm:text-3xl">
          Működésfejlesztés
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--adm-text-secondary)]">
          Áttekintés a működéséről, a közösen azonosított fejlesztési irányokról, a folyamatban lévő
          kezdeményezésekről és azok eredményeiről.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => handleTabChange("teendok")}>
            Teendők megnyitása
          </Button>
          <Link
            href="/portal/megkeresesek"
            className="inline-flex items-center rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 py-1.5 text-xs font-semibold text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)]"
          >
            Kérdése van? Írjon nekünk →
          </Link>
        </div>
      </header>

      <nav
        className="flex flex-wrap items-center gap-1.5"
        aria-label="Működésfejlesztési szakaszok"
        data-testid="grow-sub-nav"
      >
        {NAV_ITEMS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={active ? "true" : undefined}
              data-testid={`grow-tab-${tab.id}`}
              onClick={() => handleTabChange(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-1 ${
                active
                  ? "bg-[var(--adm-brand-green)] text-white"
                  : "text-[var(--adm-text-secondary)] hover:bg-[var(--adm-canvas-subtle)] hover:text-[var(--adm-text-primary)]"
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                    active ? "bg-white/20 text-white" : "bg-[var(--adm-canvas-subtle)] text-[var(--adm-text-secondary)]"
                  }`}
                >
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* F8 block 1: Most Önre vár — only actual customer actions. */}
      {(focus === null || focus === "assessment") ? (
        <div id="grow-section-teendok" className="scroll-mt-24 space-y-4" data-testid="grow-section-teendok">
          <GrowSectionHeader
            step="1 · Most Önre vár"
            title="Amit most érdemes elvégeznie"
            description="Kizárólag valódi ügyfélteendők: a még nem kitöltött felmérések és az Ön által beküldhető működési visszajelzés."
          />
          <section className={CARD} data-testid="grow-assessments-section">
            {assessmentView.mode === "runner" && currentQuestion ? (
              <div data-testid="grow-assessment-runner">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={EYEBROW}>{runnerDetail?.definition.titleHu}</p>
                  <p className={`text-sm font-semibold ${MUTED}`} aria-live="polite">
                    {runnerIndex + 1} / {runnerQuestions.length}
                  </p>
                </div>

                <div
                  className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--adm-canvas-subtle)]"
                  role="progressbar"
                  aria-valuemin={1}
                  aria-valuemax={runnerQuestions.length}
                  aria-valuenow={runnerIndex + 1}
                >
                  <div
                    className="h-full rounded-full bg-[var(--adm-brand-green)] transition-all"
                    style={{ width: `${((runnerIndex + 1) / runnerQuestions.length) * 100}%` }}
                  />
                </div>

                <h2 className="mt-5 font-serif text-[21px] font-medium leading-tight text-[var(--adm-text-primary)]">
                  {currentQuestion.promptHu}
                </h2>
                {currentQuestion.helpTextHu ? (
                  <p className={`mt-2 text-sm ${MUTED}`}>{currentQuestion.helpTextHu}</p>
                ) : null}

                {runnerDetail?.definition.allowsProcessReference && processes.length > 0 ? (
                  <div className="mt-5" data-testid="grow-assessment-process-scope">
                    <label
                      htmlFor="assessment-process"
                      className="mb-1.5 block text-xs font-semibold text-[var(--adm-text-primary)]"
                    >
                      Melyik folyamatot szeretné ezzel a felméréssel áttekinteni?
                    </label>
                    <select
                      id="assessment-process"
                      value={assessmentProcessId}
                      onChange={(e) => setAssessmentProcessId(e.target.value)}
                      className="w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 py-2 text-sm text-[var(--adm-text-primary)] focus:outline-none focus:border-[var(--adm-brand-green)]"
                    >
                      <option value="">Válasszon folyamatot…</option>
                      {processes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <p className={`mt-1.5 text-xs ${MUTED}`}>
                      A válaszokat a kiválasztott folyamathoz rendelve értékeljük, így a megállapítások nem keverednek
                      más folyamatokkal.
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
                        className={`rounded-[8px] border px-4 py-3 text-left text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] ${
                          selected
                            ? "border-[var(--adm-brand-green)] bg-[var(--adm-semantic-success-soft)] text-[var(--adm-text-primary)]"
                            : "border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] text-[var(--adm-text-primary)] hover:border-[var(--adm-border-strong)]"
                        }`}
                      >
                        {option.labelHu}
                      </button>
                    );
                  })}
                </div>

                {assessmentError ? (
                  <div className="mt-4 rounded-[8px] border border-[var(--adm-brand-terracotta)] bg-[var(--adm-semantic-danger-soft)] p-3 text-sm font-medium text-[var(--adm-brand-terracotta)]">
                    {assessmentError}
                  </div>
                ) : null}

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <Button
                    variant="neutral"
                    size="sm"
                    onClick={() => setRunnerIndex((idx) => Math.max(0, idx - 1))}
                    disabled={runnerIndex === 0 || assessmentBusy}
                  >
                    ← Vissza
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="grow-assessment-runner-cancel"
                    onClick={() => void backToCatalogue()}
                    disabled={assessmentBusy}
                  >
                    Kilépés
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      if (isLastQuestion) void submitAssessment();
                      else setRunnerIndex((idx) => Math.min(runnerQuestions.length - 1, idx + 1));
                    }}
                    disabled={!currentAnswered || assessmentBusy || !processReady}
                  >
                    {isLastQuestion ? (assessmentBusy ? "Beküldés…" : "Befejezés") : "Tovább →"}
                  </Button>
                </div>
              </div>
            ) : assessmentView.mode === "result" && assessmentResult ? (
              <div data-testid="grow-assessment-result">
                <p className={EYEBROW}>Felmérés elkészült</p>
                <h2 className="mt-1 font-serif text-[22px] font-medium leading-tight text-[var(--adm-text-primary)]">
                  {assessmentResult.titleHu}
                </h2>
                {assessmentResultScope?.processName ? (
                  <p className="mt-1 text-sm font-medium text-[var(--adm-text-primary)]" data-testid="grow-assessment-result-process">
                    Folyamat: {assessmentResultScope.processName}
                  </p>
                ) : null}
                <p className={`mt-2 text-sm leading-6 ${MUTED}`}>{assessmentResult.summaryHu}</p>

                <div className="mt-6">
                  <h3 className={EYEBROW}>Amit látunk</h3>
                  {assessmentResult.findings.length > 0 ? (
                    <div className="mt-3 grid gap-3">
                      {assessmentResult.findings.map((finding, idx) => (
                        <div key={idx} className={`${CARD} p-3`}>
                          <p className="font-semibold text-[var(--adm-text-primary)]">{finding.titleHu}</p>
                          <p className={`mt-1 text-sm leading-6 ${MUTED}`}>{finding.summaryHu}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={`mt-2 text-sm ${MUTED}`}>
                      A válaszok alapján ezen a területen nem azonosítottunk figyelmet igénylő pontot.
                    </p>
                  )}
                </div>

                <div className="mt-6">
                  <h3 className={EYEBROW}>Javasolt irányok</h3>
                  {assessmentResult.directions.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {assessmentResult.directions.map((direction, idx) => (
                        <span
                          key={idx}
                          className="rounded-full border border-[var(--adm-brand-green)] px-2.5 py-0.5 text-xs font-semibold text-[var(--adm-brand-green)]"
                        >
                          {direction.labelHu}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className={`mt-2 text-sm ${MUTED}`}>Ehhez a kitöltéshez még nincs javasolt vizsgálati irány.</p>
                  )}
                </div>

                <div className="mt-6">
                  <h3 className={EYEBROW}>Mi alapján?</h3>
                  {assessmentResult.evidence.length > 0 ? (
                    <div className="mt-3 grid gap-3">
                      {assessmentResult.evidence.map((item, idx) => (
                        <div key={idx} className={`${CARD} p-3`}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="font-semibold text-[var(--adm-text-primary)]">{item.title}</p>
                            <AdminStatusPill tone="neutral">{item.strengthLabelHu}</AdminStatusPill>
                          </div>
                          <p className={`mt-1 text-xs ${MUTED}`}>
                            {[item.authors, item.year ? String(item.year) : null].filter(Boolean).join(" · ")}
                          </p>
                          {item.boundedClaim ? (
                            <p className={`mt-2 text-sm leading-6 ${MUTED}`}>{item.boundedClaim}</p>
                          ) : null}
                          {item.limitations ? (
                            <p className={`mt-2 text-xs leading-5 ${MUTED}`}>Korlát: {item.limitations}</p>
                          ) : null}
                          {item.locator ? (
                            <a
                              href={item.locator}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-block text-xs font-medium text-[var(--adm-brand-green)] hover:underline"
                            >
                              {item.doi ? `DOI: ${item.doi}` : "Forrás megnyitása →"}
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={`mt-2 text-sm ${MUTED}`}>Ehhez az eredményhez jelenleg nincs megjeleníthető háttér.</p>
                  )}
                </div>

                <div className={`mt-6 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 text-xs leading-5 ${MUTED}`}>
                  {assessmentResult.noticeHu}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Button
                    variant="primary"
                    size="sm"
                    data-testid="grow-assessment-result-back"
                    onClick={() => void backToCatalogue()}
                  >
                    Vissza a felmérésekhez
                  </Button>
                  <Button
                    variant="neutral"
                    size="sm"
                    onClick={() => void startAssessment(assessmentResult.packKey, assessmentResultScope?.processId ?? undefined)}
                    disabled={assessmentBusy}
                  >
                    Újra kitöltöm
                  </Button>
                </div>
              </div>
            ) : assessmentView.mode === "result" && assessmentResultUnavailable ? (
              <div data-testid="grow-assessment-result-unavailable">
                <p className={EYEBROW}>Felmérés elkészült</p>
                <h2 className="mt-1 font-serif text-[22px] font-medium leading-tight text-[var(--adm-text-primary)]">
                  Az eredmény jelenleg nem jeleníthető meg
                </h2>
                <p className={`mt-2 text-sm ${MUTED}`}>
                  A kitöltést rögzítettük, de ehhez a felmérésverzióhoz tartozó eredmény most nem állítható elő.
                </p>
                <Button variant="primary" size="sm" className="mt-5" onClick={() => void backToCatalogue()}>
                  Vissza a felmérésekhez
                </Button>
              </div>
            ) : (
              <div data-testid="grow-assessment-catalogue">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className={EYEBROW}>Opcionális adatmegadás</p>
                    <h2 className="mt-1 font-serif text-xl font-semibold text-[var(--adm-text-primary)]">Felmérési csomagok</h2>
                    <p className={`mt-1 max-w-2xl text-sm ${MUTED}`}>
                      Az alábbi felmérések elérhető lehetőségek: kitöltésükkel pontosíthatja a működés megértését.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Felmérés szűrők">
                    {(
                      [
                        { id: "all", label: `Összes (${packs.length})` },
                        { id: "uncompleted", label: `Még nincs kitöltve (${uncompletedPacksCount})` },
                        { id: "completed", label: `Befejezett (${completedPacksCount})` },
                      ] as Array<{ id: AssessmentFilter; label: string }>
                    ).map((f) => (
                      <Button
                        key={f.id}
                        role="tab"
                        aria-selected={assessmentFilter === f.id}
                        variant={assessmentFilter === f.id ? "primary" : "neutral"}
                        size="sm"
                        onClick={() => setAssessmentFilter(f.id)}
                      >
                        {f.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {assessmentError ? (
                  <div className="mt-4 rounded-[8px] border border-[var(--adm-brand-terracotta)] bg-[var(--adm-semantic-danger-soft)] p-3 text-sm font-medium text-[var(--adm-brand-terracotta)]">
                    {assessmentError}
                  </div>
                ) : null}

                {catalogueError ? (
                  <div
                    className="mt-4 rounded-[8px] border border-[var(--adm-brand-terracotta)] bg-[var(--adm-semantic-danger-soft)] p-4 text-sm text-[var(--adm-brand-terracotta)]"
                    data-testid="grow-assessment-catalogue-error"
                  >
                    <p className="font-semibold">A felmérések most nem érhetők el.</p>
                    <p className="mt-1">{catalogueError}</p>
                    <Button size="sm" variant="neutral" className="mt-3" onClick={() => void loadCatalogue()}>
                      Újrapróbálás
                    </Button>
                  </div>
                ) : null}

                <div className="mt-4 space-y-3">
                  {filteredPacks.length > 0 ? (
                    filteredPacks.map((pack) => {
                      const isExpanded = selectedPackKey === pack.packKey;
                      return (
                        <div
                          key={pack.packKey}
                          data-testid={`grow-assessment-row-${pack.packKey}`}
                          className={`${CARD} transition hover:border-[var(--adm-border-strong)]`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <AdminStatusPill tone={pack.status === "COMPLETED" ? "green" : "neutral"}>
                                {pack.status === "COMPLETED" ? "Kitöltve" : isExpanded ? "Elérhető" : "Még nincs kitöltve"}
                              </AdminStatusPill>
                              <div className="min-w-0">
                                <h3 className="truncate font-serif text-base font-medium text-[var(--adm-text-primary)]">
                                  {pack.titleHu}
                                </h3>
                                <p className={`mt-0.5 truncate text-xs ${MUTED}`}>{pack.descriptionHu}</p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {pack.status === "COMPLETED" && pack.latestResultAvailable && !isExpanded ? (
                                <Button
                                  size="sm"
                                  variant="neutral"
                                  data-testid={`grow-assessment-result-${pack.packKey}`}
                                  onClick={() =>
                                    void viewAssessmentResult(pack.packKey, pack.resultScopes[0]?.processId ?? undefined)
                                  }
                                  disabled={assessmentBusy}
                                >
                                  Eredmény megtekintése
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="ghost"
                                data-testid={`grow-assessment-toggle-${pack.packKey}`}
                                aria-expanded={isExpanded}
                                onClick={() => setSelectedPackKey(isExpanded ? null : pack.packKey)}
                              >
                                {isExpanded ? "Összecsukás" : "Kibontás"}
                              </Button>
                            </div>
                          </div>

                          {isExpanded ? (
                            <>
                              <p className={`mt-3 text-sm leading-6 ${MUTED}`}>{pack.descriptionHu}</p>

                              <div className="mt-4 grid grid-cols-2 gap-3 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 text-xs sm:grid-cols-4">
                                <div>
                                  <p className={`font-semibold uppercase ${EYEBROW}`}>Becsült idő</p>
                                  <p className="mt-0.5 font-bold text-[var(--adm-text-primary)]">~{pack.estimatedMinutes} perc</p>
                                </div>
                                <div>
                                  <p className={`font-semibold uppercase ${EYEBROW}`}>Kérdések</p>
                                  <p className="mt-0.5 font-bold text-[var(--adm-text-primary)]">{pack.questionCount} kérdés</p>
                                </div>
                                <div>
                                  <p className={`font-semibold uppercase ${EYEBROW}`}>Utolsó kitöltés</p>
                                  <p className="mt-0.5 font-bold text-[var(--adm-text-primary)]">
                                    {pack.latestCompletedAt ? formatDate(pack.latestCompletedAt) : "Még nem volt"}
                                  </p>
                                </div>
                                <div>
                                  <p className={`font-semibold uppercase ${EYEBROW}`}>Megállapítások</p>
                                  <p className="mt-0.5 font-bold text-[var(--adm-text-primary)]">
                                    {pack.latestFindingCount > 0 ? `${pack.latestFindingCount} pont` : "—"}
                                  </p>
                                </div>
                              </div>

                              {pack.status === "COMPLETED" && !pack.resultScopes.some((s) => s.resultAvailable) ? (
                                <p className="mt-3 text-xs font-medium text-[var(--adm-semantic-warning)]">
                                  A kitöltés rögzítve van, de az eredmény ehhez a verzióhoz jelenleg nem jeleníthető meg.
                                </p>
                              ) : null}

                              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--adm-border-canonical)] pt-4">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  data-testid={`grow-assessment-start-${pack.packKey}`}
                                  onClick={() => void startAssessment(pack.packKey)}
                                  disabled={assessmentBusy}
                                >
                                  {pack.status === "COMPLETED" ? "Újra kitöltöm" : "Kitöltöm"}
                                </Button>
                                {pack.status === "COMPLETED" &&
                                (pack.allowsProcessReference
                                  ? pack.resultScopes.some((s) => s.resultAvailable)
                                  : pack.latestResultAvailable) ? (
                                  pack.allowsProcessReference && pack.resultScopes.length > 1 ? (
                                    <div className="mt-2 w-full" data-testid="grow-assessment-result-scopes">
                                      <p className="mb-1.5 text-xs font-semibold text-[var(--adm-text-primary)]">
                                        Eredmény megtekintése folyamatonként:
                                      </p>
                                      <div className="flex flex-wrap gap-2">
                                        {pack.resultScopes.map((scope) => (
                                          <Button
                                            key={scope.processId ?? "__general__"}
                                            size="sm"
                                            variant="neutral"
                                            data-testid={`grow-assessment-result-${pack.packKey}-${scope.processId ?? "general"}`}
                                            onClick={() => void viewAssessmentResult(pack.packKey, scope.processId)}
                                            disabled={assessmentBusy || !scope.resultAvailable}
                                          >
                                            {scope.processName || "Általános"}
                                          </Button>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="neutral"
                                      data-testid={`grow-assessment-result-${pack.packKey}`}
                                      onClick={() =>
                                        void viewAssessmentResult(pack.packKey, pack.resultScopes[0]?.processId ?? undefined)
                                      }
                                      disabled={assessmentBusy}
                                    >
                                      Eredmény megtekintése
                                    </Button>
                                  )
                                ) : null}
                              </div>
                            </>
                          ) : null}
                        </div>
                      );
                    })
                  ) : catalogueError ? null : (
                    <p className={`text-sm ${MUTED}`}>A felmérések betöltése folyamatban…</p>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Secondary cross-pack summary of assessment findings */}
          <section className={CARD} data-testid="grow-aggregated-findings">
            <p className={EYEBROW}>Összegzés</p>
            <h2 className="mt-1 font-serif text-xl font-semibold text-[var(--adm-text-primary)]">Mit látunk eddig?</h2>
            <div className="mt-3">
              {aggregatedFindings.length > 0 ? (
                <>
                  <p className={`text-xs ${MUTED}`}>
                    {catalogue?.aggregatedAttentionAreaCount || aggregatedFindings.length} terület igényel figyelmet
                    {catalogue && catalogue.aggregatedUnknownAreaCount > 0
                      ? `, ${catalogue.aggregatedUnknownAreaCount} területen nincs elég információ`
                      : ""}
                    .
                  </p>
                  <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    {aggregatedFindings.slice(0, 3).map((finding, idx) => (
                      <div key={idx} className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3">
                        <p className="text-sm font-semibold text-[var(--adm-text-primary)]">{finding.titleHu}</p>
                        <p className={`mt-1 line-clamp-2 text-xs leading-5 ${MUTED}`}>{finding.summaryHu}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : hasEvaluableCompletedPack ? (
                <p className={`text-sm leading-6 ${MUTED}`}>
                  A kitöltött felmérések alapján jelenleg nem azonosítottunk figyelmet igénylő pontot.
                  {catalogue && catalogue.aggregatedUnknownAreaCount > 0
                    ? ` ${catalogue.aggregatedUnknownAreaCount} területen nincs elég információ a kiértékeléshez.`
                    : ""}
                  {hasUnavailableCompletedPack
                    ? " Néhány kitöltött felmérés eredménye jelenleg nem jeleníthető meg."
                    : ""}
                </p>
              ) : hasCompletedPack ? (
                <p className={`text-sm leading-6 ${MUTED}`}>
                  A kitöltött felmérések eredménye jelenleg nem jeleníthető meg. A kitöltéseket rögzítettük.
                </p>
              ) : (
                <PortalEmptyInline>
                  Még nincs kitöltött felmérés. Töltse ki az egyik elérhető felmérési csomagot, és itt összegződnek a
                  megállapítások.
                </PortalEmptyInline>
              )}
            </div>
          </section>

          {/* Survey / operational signal — a WHY-labelled input channel */}
          <section className={CARD} data-testid="grow-feltaras-section">
            <p className={EYEBROW}>Gyors működési jelzés</p>
            <h2 className="mt-1 font-serif text-xl font-semibold text-[var(--adm-text-primary)]">Hol érdemes javítani?</h2>
            <p className={`mt-1 max-w-2xl text-sm ${MUTED}`}>
              Ossza meg velünk, milyen nehézségeket tapasztal a napi működésben. Visszajelzése közvetlenül beépül a
              szervezet közös fejlesztési áttekintésébe.
            </p>

            <form onSubmit={handleSurveySubmit} className="mt-4 space-y-4">
              <div>
                <label className="mb-2 block text-xs font-semibold text-[var(--adm-text-primary)]">
                  Jellemző működési tapasztalatok (válasszon egyet vagy többet)
                </label>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {Object.entries(SURVEY_CATEGORY_LABELS_HU).map(([key, label]) => {
                    const checked = selectedCategories.includes(key);
                    return (
                      <label
                        key={key}
                        className={`flex cursor-pointer items-start gap-3 rounded-[8px] border p-3 transition ${
                          checked
                            ? "border-[var(--adm-brand-green)] bg-[var(--adm-semantic-success-soft)]"
                            : "border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] hover:border-[var(--adm-border-strong)]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSelectedCategories((prev) =>
                              e.target.checked ? [...prev, key] : prev.filter((k) => k !== key),
                            )
                          }
                          className="mt-0.5 h-4 w-4 rounded border-[var(--adm-border-strong)]"
                        />
                        <span className="text-sm font-medium leading-snug text-[var(--adm-text-primary)]">{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {processes.length > 0 ? (
                <div>
                  <label htmlFor="survey-process" className="mb-1.5 block text-xs font-semibold text-[var(--adm-text-primary)]">
                    Érintett folyamat (opcionális)
                  </label>
                  <select
                    id="survey-process"
                    value={selectedProcessId}
                    onChange={(e) => setSelectedProcessId(e.target.value)}
                    className="w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 py-2 text-sm text-[var(--adm-text-primary)] focus:outline-none focus:border-[var(--adm-brand-green)]"
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
                <label htmlFor="survey-freetext" className="mb-1.5 block text-xs font-semibold text-[var(--adm-text-primary)]">
                  Részletes kifejtés (opcionális)
                </label>
                <textarea
                  id="survey-freetext"
                  rows={3}
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder="Írja le röviden a konkrét helyzetet vagy példát..."
                  className="w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-3 text-sm text-[var(--adm-text-primary)] placeholder:text-[var(--adm-text-secondary)] focus:outline-none focus:border-[var(--adm-brand-green)]"
                />
              </div>

              {submitSuccess ? (
                <div className="rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-semantic-success-soft)] p-3 text-sm font-medium text-[var(--adm-brand-green)]">
                  {submitSuccess}
                </div>
              ) : null}

              {submitError ? (
                <div className="rounded-[8px] border border-[var(--adm-brand-terracotta)] bg-[var(--adm-semantic-danger-soft)] p-3 text-sm font-medium text-[var(--adm-brand-terracotta)]">
                  {submitError}
                </div>
              ) : null}

              <div className="pt-1">
                <Button type="submit" variant="primary" disabled={submitting || selectedCategories.length === 0}>
                  {submitting ? "Rögzítés folyamatban..." : "Visszajelzés beküldése"}
                </Button>
              </div>
            </form>

            {surveys.length > 0 ? (
              <div className="mt-4 border-t border-[var(--adm-border-canonical)] pt-4">
                <h3 className={`mb-3 ${EYEBROW}`}>Korábban beküldött működési visszajelzések</h3>
                <div className="space-y-3">
                  {surveys.map((s, idx) => (
                    <div key={idx} className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          {s.categoryLabels.map((cat, cIdx) => (
                            <span
                              key={cIdx}
                              className="rounded-full border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-2 py-0.5 text-xs text-[var(--adm-text-secondary)]"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                        <span className={`text-xs ${MUTED}`}>{formatDate(s.submittedAt)}</span>
                      </div>
                      {s.processName ? (
                        <p className={`mt-2 text-xs ${MUTED}`}>
                          Érintett folyamat: <span className="font-semibold">{s.processName}</span>
                        </p>
                      ) : null}
                      {s.freeText ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--adm-text-primary)]">{s.freeText}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {/* F8 block 2: Amin érdemes dolgozni — only approved/published directions. */}
      {(focus === null || focus === "opportunity") ? (
        activeOpportunity ? (
          <section className={CARD} data-testid="grow-opportunity-detail">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--adm-border-canonical)] pb-3">
              <Button size="sm" variant="ghost" data-testid="grow-opportunity-detail-back" onClick={handleBackToOpportunities}>
                ← Vissza a lehetőségekhez
              </Button>
              <AdminStatusPill tone="green">Közzétett lehetőség</AdminStatusPill>
            </div>

            <div className="mt-5 max-w-3xl">
              <p className={EYEBROW}>Fejlesztési irány</p>
              <h2
                className="mt-2 font-serif text-[26px] font-medium leading-tight text-[var(--adm-text-primary)]"
                data-testid="grow-opportunity-detail-title"
              >
                {activeOpportunity.title}
              </h2>
              {activeOpportunity.publishedAt ? (
                <p className={`mt-2 text-xs ${MUTED}`}>
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
                  <h3 className={EYEBROW}>Összefoglaló</h3>
                  <p className={`mt-2 whitespace-pre-line text-sm leading-7 ${MUTED}`}>{activeOpportunity.summary}</p>
                </div>

                {activeOpportunity.direction ? (
                  <div className="rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-semantic-success-soft)] p-4">
                    <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--adm-brand-green)]">
                      Javasolt irány
                    </h3>
                    <p className="mt-1.5 text-sm font-medium leading-7 text-[var(--adm-text-primary)]">
                      {activeOpportunity.direction}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[var(--adm-border-canonical)] pt-5">
                <Button size="sm" variant="neutral" onClick={handleBackToOpportunities}>
                  ← Vissza a lehetőségekhez
                </Button>
                <Link
                  href="/portal/megkeresesek"
                  className="inline-flex items-center rounded-[8px] bg-[var(--adm-brand-green)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--adm-brand-deep)]"
                >
                  Kérdése van a fejlesztési irányról? Írjon az irodának →
                </Link>
              </div>
            </div>
          </section>
        ) : (
          <div id="grow-section-fejlesztesi-iranyok" className="scroll-mt-24 space-y-4" data-testid="grow-section-fejlesztesi-iranyok">
            <GrowSectionHeader
              step="2 · Amin érdemes dolgozni"
              title="Jóváhagyott fejlesztési irányok"
              description="Kizárólag az iroda által jóváhagyott és az Ön szervezetének közzétett fejlesztési irányok jelennek meg itt."
            />
          {data?.opportunities && data.opportunities.length > 0 ? (
          <section className={CARD} data-testid="grow-opportunities-section">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className={EYEBROW}>Közzétett irányok</p>
                <h2 className="mt-1 font-serif text-xl font-semibold text-[var(--adm-text-primary)]">Fejlesztési irányok</h2>
                <p className={`mt-1 max-w-2xl text-sm ${MUTED}`}>
                  Az itt megjelenő lehetőségeket jóváhagyást követően tettük közzé az Ön szervezete számára.
                </p>
              </div>
              <AdminStatusPill tone="green">Közzétett lehetőségek: {data.opportunities.length}</AdminStatusPill>
            </div>

            <div className="mt-5 space-y-3" data-testid="grow-opportunities-list">
              {data.opportunities.map((opp) => (
                <div key={opp.publicationId || opp.title} className={`${CARD}`} data-testid="grow-opportunity-item">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="font-serif text-[17px] font-medium text-[var(--adm-text-primary)]">{opp.title}</h3>
                    {opp.publishedAt ? (
                      <span className={`whitespace-nowrap text-xs ${MUTED}`}>
                        {new Date(opp.publishedAt).toLocaleDateString("hu-HU", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    ) : null}
                  </div>
                  {opp.summary ? <p className={`mt-2 text-sm leading-6 ${MUTED}`}>{opp.summary}</p> : null}
                  {opp.direction ? (
                    <p className="mt-3 text-xs text-[var(--adm-text-primary)]">
                      <span className="font-semibold">Irány:</span> {opp.direction}
                    </p>
                  ) : null}
                  <div className="mt-4 flex items-center justify-between gap-4 border-t border-[var(--adm-border-canonical)] pt-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      data-testid="grow-opportunity-open-detail"
                      onClick={() => handleSelectOpportunity(opp.publicationId)}
                    >
                      Részletek →
                    </Button>
                    <span className={`text-xs ${MUTED}`}>Ügyféloldalra közzétéve</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className={CARD} data-testid="grow-opportunities-section">
            <div className="max-w-2xl" data-testid="grow-opportunities-empty">
              <AdminStatusPill tone="neutral">Közzétételi állapot</AdminStatusPill>
              <h2 className="mt-3 font-serif text-[22px] font-medium leading-tight text-[var(--adm-text-primary)]">
                Jelenleg nincs ügyféloldalon közzétett fejlesztési lehetőség.
              </h2>
              <p className={`mt-3 text-sm leading-6 ${MUTED}`}>
                Ha egy fejlesztési irány jóváhagyást követően ügyféloldali közzétételre kerül, itt fog megjelenni.
              </p>

              <div className={`mt-5 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 text-xs leading-5 ${MUTED}`}>
                <p className="font-semibold text-[var(--adm-text-primary)]">
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
                  className="inline-flex items-center rounded-[8px] bg-[var(--adm-brand-green)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--adm-brand-deep)]"
                >
                  Kérdése van a vizsgálatról? Írjon az irodának →
                </Link>
                <Button size="sm" variant="neutral" onClick={() => handleTabChange("teendok")}>
                  Felmérések megnyitása
                </Button>
              </div>
            </div>
          </section>
        )}
        </div>
        )
      ) : null}

      {/* F8 block 3: Folyamatban — active initiatives, next milestone and one next step. */}
      {(focus === null || focus === "initiative") ? (
        activeInitiative ? (
          (() => {
            const relatedOutcomes = allOutcomes.filter((outcome) => outcome.initiativeTitle === activeInitiative.title);
            const completedMilestones = activeInitiative.milestones.filter(
              (milestone) => milestone.statusLabel === "Teljesítve",
            ).length;
            return (
              <section className={CARD} data-testid="grow-initiative-detail">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--adm-border-canonical)] pb-3">
                  <Button size="sm" variant="ghost" data-testid="grow-initiative-detail-back" onClick={handleBackToInitiatives}>
                    ← Vissza a kezdeményezésekhez
                  </Button>
                  <AdminStatusPill tone="neutral">Fejlesztési kezdeményezés</AdminStatusPill>
                </div>

                <div className="mt-5 max-w-3xl">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2
                      className="font-serif text-[26px] font-medium leading-tight text-[var(--adm-text-primary)]"
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
                      <div className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-4">
                        <p className={EYEBROW}>Célállapot</p>
                        <p className="mt-1 text-sm text-[var(--adm-text-primary)]">{activeInitiative.targetState}</p>
                      </div>
                    ) : null}
                    <div className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-4">
                      <p className={EYEBROW}>Célhatáridő</p>
                      <p className="mt-1 text-sm text-[var(--adm-text-primary)]">
                        {activeInitiative.targetAt ? formatDate(activeInitiative.targetAt) : "Nincs megadva"}
                      </p>
                    </div>
                  </div>

                  {activeInitiative.hasRelatedMatter ? (
                    <div className={`mt-4 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 text-sm ${MUTED}`}>
                      Ehhez a kezdeményezéshez kapcsolódó ügy látható az ügyek között.{" "}
                      <Link href="/portal/ugyek" className="font-semibold text-[var(--adm-brand-green)] hover:underline">
                        Kapcsolódó ügy →
                      </Link>
                    </div>
                  ) : null}

                  <div className="mt-6" data-testid="grow-initiative-detail-milestones">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className={EYEBROW}>Mérföldkövek</h3>
                      {activeInitiative.milestones.length > 0 ? (
                        <span className={`text-xs ${MUTED}`}>
                          {completedMilestones} / {activeInitiative.milestones.length} teljesítve
                        </span>
                      ) : null}
                    </div>
                    {activeInitiative.milestones.length > 0 ? (
                      <ol className="mt-3 space-y-2.5">
                        {activeInitiative.milestones.map((milestone) => (
                          <li
                            key={milestone.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-3"
                            data-testid="grow-initiative-milestone"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[var(--adm-text-primary)]">{milestone.title}</p>
                              {milestone.date ? <p className={`mt-0.5 text-xs ${MUTED}`}>{formatDate(milestone.date)}</p> : null}
                            </div>
                            <AdminStatusPill tone={milestone.statusLabel === "Teljesítve" ? "green" : milestone.statusLabel === "Törölve" ? "neutral" : "amber"}>
                              {milestone.statusLabel}
                            </AdminStatusPill>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className={`mt-2 text-sm ${MUTED}`}>Ehhez a kezdeményezéshez még nincsenek rögzített mérföldkövek.</p>
                    )}
                  </div>

                  {relatedOutcomes.length > 0 ? (
                    <div className="mt-6">
                      <h3 className={EYEBROW}>Kapcsolódó eredmények</h3>
                      <ul className="mt-2 space-y-2">
                        {relatedOutcomes.map((outcome) => (
                          <li
                            key={outcome.id}
                            className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 text-sm"
                          >
                            <AdminStatusPill tone={outcomeTone(outcome.basis)}>{outcome.basisLabel}</AdminStatusPill>
                            {outcome.processName ? (
                              <span className={`ml-2 text-xs ${MUTED}`}>Érintett folyamat: {outcome.processName}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })()
        ) : (
          <div id="grow-section-kezdemenyezesek" className="scroll-mt-24 space-y-4" data-testid="grow-section-kezdemenyezesek">
            <GrowSectionHeader
              step="3 · Folyamatban"
              title="Aktív fejlesztési kezdeményezések"
              description="A jóváhagyott kezdeményezések, azok következő mérföldkövei és az aktuális állapotuk."
            />
          <section className={CARD} data-testid="grow-initiatives-section">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className={EYEBROW}>Irodai munkavégzés</p>
                <h2 className="mt-1 font-serif text-xl font-semibold text-[var(--adm-text-primary)]">Fejlesztési kezdeményezések</h2>
                <p className={`mt-1 max-w-2xl text-sm ${MUTED}`}>
                  A jóváhagyott fejlesztési kezdeményezések és azok mérföldkövei.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: "all", label: "Minden" },
                    { id: "planned", label: "Tervezett" },
                    { id: "active", label: "Folyamatban" },
                    { id: "completed", label: "Lezárult" },
                  ] as Array<{ id: InitiativeFilter; label: string }>
                ).map((f) => (
                  <Button
                    key={f.id}
                    size="sm"
                    variant={initiativeFilter === f.id ? "primary" : "neutral"}
                    aria-pressed={initiativeFilter === f.id}
                    onClick={() => setInitiativeFilter(f.id)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {filteredInitiatives.length > 0 ? (
                filteredInitiatives.map((item) => (
                  <div key={item.id} className={`${CARD}`} data-testid="grow-initiative-item">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-serif text-[17px] font-medium text-[var(--adm-text-primary)]">{item.title}</h3>
                        {item.targetState ? <p className={`mt-1 text-sm ${MUTED}`}>{item.targetState}</p> : null}
                        {item.targetAt ? (
                          <p className={`mt-1 text-xs ${MUTED}`}>Cél: {formatDate(item.targetAt)}</p>
                        ) : null}
                      </div>
                      <AdminStatusPill tone={initiativeTone(item.statusLabel)}>{item.statusLabel}</AdminStatusPill>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--adm-border-canonical)] pt-3">
                      <span className={`text-xs ${MUTED}`}>
                        {item.milestones.length > 0
                          ? `Mérföldkövek: ${item.milestones.filter((m) => m.statusLabel === "Teljesítve").length} / ${item.milestones.length} teljesítve`
                          : "Nincsenek rögzített mérföldkövek"}
                      </span>
                      <Button size="sm" variant="ghost" data-testid="grow-initiative-open-detail" onClick={() => handleSelectInitiative(item.id)}>
                        Részletek →
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <PortalEmptyInline>Jelenleg nincs megjeleníthető kezdeményezés.</PortalEmptyInline>
              )}
            </div>
          </section>
          </div>
        )
      ) : null}

      {/* F8 block 4: Az Ön működése — actual process/system map and contextual inspector. */}
      {focus === null ? (
        <div id="grow-section-mukodes" className="scroll-mt-24 space-y-4" data-testid="grow-section-mukodes">
          <GrowSectionHeader
            step="4 · Az Ön működése"
            title="A működés térképe"
            description="A szervezet felmért folyamatai, végrehajtási lépései, jóváhagyási pontjai és kapcsolódó informatikai eszközei — a kiválasztott folyamat kontextus-nézetével együtt."
          />
        <section className={CARD}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={EYEBROW}>Működés és rendszerek</p>
              <h2 className="mt-1 font-serif text-xl font-semibold text-[var(--adm-text-primary)]">Feltérképezett üzleti folyamatok</h2>
              <p className={`mt-1 max-w-2xl text-sm ${MUTED}`}>
                Mit tud jelenleg a rendszer a működéséről? A szervezet felmért folyamatai, végrehajtási lépései,
                jóváhagyási pontjai és kapcsolódó informatikai eszközei.
              </p>
            </div>
            <Link
              href="/portal/vallalat"
              className="inline-flex items-center rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 py-1.5 text-xs font-semibold text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)]"
            >
              Teljes vállalati kontextus →
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-1.5 border-b border-[var(--adm-border-canonical)] pb-2" aria-label="Megjelenítés">
            <Button
              aria-pressed={growViewMode === "map"}
              variant={growViewMode === "map" ? "primary" : "neutral"}
              size="sm"
              data-testid="grow-view-toggle-map"
              onClick={() => setGrowViewMode("map")}
            >
              Térkép
            </Button>
            <Button
              aria-pressed={growViewMode === "list"}
              variant={growViewMode === "list" ? "primary" : "neutral"}
              size="sm"
              data-testid="grow-view-toggle-list"
              onClick={() => setGrowViewMode("list")}
            >
              Lista
            </Button>
          </div>

          {growViewMode === "map" ? (
            processes.length > 0 ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
                <OrgGrowOperatingCanvas
                  processes={processes}
                  selectedProcessId={selectedOperatingProcessId}
                  onSelectProcess={handleSelectOperatingProcess}
                  selectedStepId={selectedOperatingStepId}
                  onSelectStep={setSelectedOperatingStepId}
                />
                <OrgGrowContextInspector
                  process={activeOperatingProcessView}
                  selectedStepId={selectedOperatingStepId}
                  onSelectStep={setSelectedOperatingStepId}
                  onClose={handleClearOperatingSelection}
                />
              </div>
            ) : (
              <div className="mt-4">
                <PortalEmptyInline>
                  Nincsenek feltérképezett folyamatok. Ehhez a szervezethez még nincsenek üzleti folyamatok rögzítve.
                </PortalEmptyInline>
              </div>
            )
          ) : (
            <div className="mt-4 grid gap-4">
              {processes.length > 0 ? (
                processes.map((proc) => (
                  <div key={proc.id} className={`${CARD}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className={EYEBROW}>
                          {proc.category} {proc.organizationGroupName ? `· ${proc.organizationGroupName}` : ""}
                        </p>
                        <h3 className="mt-0.5 text-[17px] font-semibold text-[var(--adm-text-primary)]">{proc.name}</h3>
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
                        <p className={EYEBROW}>Folyamat lépései ({proc.steps.length} lépés)</p>
                        <div className="mt-2 -mx-1 overflow-x-auto px-1 pb-1" data-testid={`grow-process-flow-${proc.id}`}>
                          <ol className="flex min-w-max items-stretch gap-2 lg:min-w-0 lg:flex-wrap">
                            {proc.steps.map((step, stepIndex) => (
                              <li key={step.id} className="flex items-stretch">
                                <div
                                  className="flex w-56 shrink-0 flex-col justify-between rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-3 text-sm"
                                  data-testid={`grow-process-step-${step.id}`}
                                >
                                  <div>
                                    <div className="flex items-center justify-between gap-2">
                                      <span className={`text-xs font-semibold ${MUTED}`}>{step.position}. lépés</span>
                                      {step.isApproval ? <AdminBadge tone="burgundy">Jóváhagyási kapu</AdminBadge> : null}
                                    </div>
                                    <p className="mt-1 font-medium leading-snug text-[var(--adm-text-primary)]">{step.name}</p>
                                  </div>
                                  {step.systemName ? (
                                    <p className={`mt-2.5 border-t border-[var(--adm-border-canonical)] pt-2 text-xs ${MUTED}`}>
                                      Rendszer: <span className="font-semibold text-[var(--adm-text-primary)]">{step.systemName}</span>
                                      {step.systemCategory ? ` (${step.systemCategory})` : ""}
                                    </p>
                                  ) : null}
                                </div>
                                {stepIndex < proc.steps.length - 1 ? (
                                  <span aria-hidden="true" className={`flex shrink-0 items-center px-1 ${MUTED}`}>
                                    →
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ol>
                        </div>
                      </div>
                    ) : (
                      <p className={`mt-3 text-xs ${MUTED}`}>Ehhez a folyamathoz még nincsenek részletes lépések dokumentálva.</p>
                    )}
                  </div>
                ))
              ) : (
                <PortalEmptyInline>
                  Nincsenek feltérképezett folyamatok. Ehhez a szervezethez még nincsenek üzleti folyamatok rögzítve.
                </PortalEmptyInline>
              )}
            </div>
          )}

          {/* Assessment / survey history is secondary operating context only. */}
          {packs.length > 0 || surveys.length > 0 ? (
            <div className="mt-6 border-t border-[var(--adm-border-canonical)] pt-5">
              <h3 className={`mb-3 ${EYEBROW}`}>Korábbi felmérések és visszajelzések</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className={`mb-2 text-xs font-semibold ${MUTED}`}>Kitöltött felmérések</p>
                  {completedPacksCount > 0 ? (
                    <ul className="space-y-1.5">
                      {packs
                        .filter((p) => p.status === "COMPLETED")
                        .map((p) => (
                          <li key={p.packKey} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="text-[var(--adm-text-primary)]">{p.titleHu}</span>
                            <span className={MUTED}>{p.latestCompletedAt ? formatDate(p.latestCompletedAt) : ""}</span>
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p className={`text-xs ${MUTED}`}>Még nincs kitöltött felmérés.</p>
                  )}
                </div>
                <div>
                  <p className={`mb-2 text-xs font-semibold ${MUTED}`}>Működési visszajelzések</p>
                  {surveys.length > 0 ? (
                    <ul className="space-y-1.5">
                      {surveys.map((s, idx) => (
                        <li key={idx} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="text-[var(--adm-text-primary)]">{s.categoryLabels.join(", ")}</span>
                          <span className={MUTED}>{formatDate(s.submittedAt)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={`text-xs ${MUTED}`}>Még nincs beküldött visszajelzés.</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </section>
        </div>
      ) : null}

      {/* F8 block 5: Eredmények — MEASURED distinct from CALCULATED/ESTIMATED. */}
      {focus === null ? (
        <div id="grow-section-eredmenyek" className="scroll-mt-24 space-y-4" data-testid="grow-section-eredmenyek">
          <GrowSectionHeader
            step="5 · Eredmények"
            title="Rögzített eredmények és hatások"
            description="Mért eredményként csak MEASURED alapú eredmény jelenik meg; a számított és becsült hatások külön kategóriában szerepelnek."
          />
        <section className={CARD}>
          <p className={EYEBROW}>Eredmények és hatás</p>
          <h2 className="mt-1 font-serif text-xl font-semibold text-[var(--adm-text-primary)]">Mit értünk el?</h2>
          <p className={`mt-1 text-sm ${MUTED}`}>
            Mérési alapon rögzített eredmények, felszabadított kapacitások és folyamathatások.
          </p>

          {measuredOutcomes.length > 0 ? (
            <div className="mt-5">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--adm-brand-green)]">
                Mért eredmények ({measuredOutcomes.length})
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {measuredOutcomes.map((item) => (
                  <div key={item.id} className="rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-semantic-success-soft)] p-4">
                    <AdminStatusPill tone="green">{item.basisLabel}</AdminStatusPill>
                    {item.initiativeTitle ? (
                      <p className="mt-2 text-sm font-medium text-[var(--adm-text-primary)]">
                        Kezdeményezés: <span className="font-semibold">{item.initiativeTitle}</span>
                      </p>
                    ) : null}
                    {item.processName ? <p className={`mt-1 text-xs ${MUTED}`}>Érintett folyamat: {item.processName}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {estimatedOutcomes.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--adm-text-primary)]">
                Számított / becsült eredmények ({estimatedOutcomes.length})
              </h3>

              {calculatedOutcomes.length > 0 ? (
                <div className="mt-3">
                  <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${MUTED}`}>
                    Számított eredmények ({calculatedOutcomes.length})
                  </p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {calculatedOutcomes.map((item) => (
                      <div key={item.id} className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-4">
                        <AdminStatusPill tone="gold">{item.basisLabel}</AdminStatusPill>
                        {item.initiativeTitle ? (
                          <p className="mt-2 text-sm font-medium text-[var(--adm-text-primary)]">
                            Kezdeményezés: <span className="font-semibold">{item.initiativeTitle}</span>
                          </p>
                        ) : null}
                        {item.processName ? <p className={`mt-1 text-xs ${MUTED}`}>Érintett folyamat: {item.processName}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {estimatedOnlyOutcomes.length > 0 ? (
                <div className="mt-4">
                  <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${MUTED}`}>
                    Becsült eredmények ({estimatedOnlyOutcomes.length})
                  </p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {estimatedOnlyOutcomes.map((item) => (
                      <div key={item.id} className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-4">
                        <AdminStatusPill tone="neutral">{item.basisLabel}</AdminStatusPill>
                        {item.initiativeTitle ? (
                          <p className="mt-2 text-sm font-medium text-[var(--adm-text-primary)]">
                            Kezdeményezés: <span className="font-semibold">{item.initiativeTitle}</span>
                          </p>
                        ) : null}
                        {item.processName ? <p className={`mt-1 text-xs ${MUTED}`}>Érintett folyamat: {item.processName}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {allOutcomes.length === 0 ? (
            <div className="mt-5">
              <PortalEmptyInline>
                Még nincs rögzített eredmény. Az eredmények akkor jelennek meg, amikor egy fejlesztési kezdeményezéshez
                mérési alap kerül rögzítésre.
              </PortalEmptyInline>
            </div>
          ) : null}

          <div className={`mt-5 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 text-xs leading-5 ${MUTED}`}>
            <p className="font-semibold text-[var(--adm-text-primary)]">Módszertan és forrásmegjelölés</p>
            <p className="mt-0.5">
              Mért eredményként csak MEASURED alapú eredmény jelenik meg. Számított és becsült hatások külön
              kategóriában szerepelnek.
            </p>
          </div>
        </section>
        </div>
      ) : null}
    </div>
  );
}
