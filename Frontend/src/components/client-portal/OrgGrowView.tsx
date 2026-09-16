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
  type PortalGrowProcess,
  type PortalGrowSurveyItem,
  type PortalOrgGrow,
} from "@/lib/clientPortalApi";
import { clientSafeError } from "@/lib/clientInteractionApi";
import { SURVEY_CATEGORY_LABELS_HU } from "@/lib/growApi";

const card = "min-w-0 rounded-3xl border border-[#e8ded1] bg-white p-5 sm:p-7 shadow-xs";
const compactState = "min-w-0 rounded-2xl border border-[#e8ded1] bg-white px-5 py-4";

export type GrowTab =
  | "attekintes"
  | "felmeresek"
  | "folyamatok"
  | "lehetosegek"
  | "kezdemenyezesek"
  | "eredmenyek";

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

export function OrgGrowView() {
  const [data, setData] = useState<PortalOrgGrow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<GrowTab>("attekintes");

  // Survey questionnaire state
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

  // Synchronize URL query parameter with active tab state & support browser back/forward
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab") as GrowTab | null;
    if (
      tabParam &&
      ["attekintes", "felmeresek", "folyamatok", "lehetosegek", "kezdemenyezesek", "eredmenyek"].includes(tabParam)
    ) {
      setActiveTab(tabParam);
    }

    const handlePopState = () => {
      const p = new URLSearchParams(window.location.search);
      const t = p.get("tab") as GrowTab | null;
      if (
        t &&
        ["attekintes", "felmeresek", "folyamatok", "lehetosegek", "kezdemenyezesek", "eredmenyek"].includes(t)
      ) {
        setActiveTab(t);
      } else {
        setActiveTab("attekintes");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleTabChange = useCallback((tab: GrowTab) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
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
    setActiveTab("felmeresek");
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
    setActiveTab("felmeresek");
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
      <section className={card}>
        <p className="text-stone-600">Fejlesztési adatok betöltése…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className={card}>
        <p className="font-semibold text-stone-950">A fejlesztési adatok nem tölthetők be</p>
        <p className="mt-2 text-sm text-stone-600">{error}</p>
        <button
          onClick={() => void load()}
          className="mt-4 rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white"
        >
          Újrapróbálás
        </button>
      </section>
    );
  }

  const initiatives = data?.initiatives || [];
  const measuredOutcomes = data?.outcomes.measured || [];
  const estimatedOutcomes = data?.outcomes.calculatedOrEstimated || [];
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

  // Real KPI calculations (zero fake numbers)
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

  // Filtered packs for Felmérések catalogue
  const filteredPacks = packs.filter((p) => {
    if (assessmentFilter === "uncompleted") return p.status !== "COMPLETED";
    if (assessmentFilter === "completed") return p.status === "COMPLETED";
    return true;
  });

  // Filtered initiatives for Kezdeményezések
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
    { id: "felmeresek", label: "Felmérések", count: packs.length },
    { id: "folyamatok", label: "Folyamatok", count: processes.length },
    { id: "lehetosegek", label: "Lehetőségek" },
    { id: "kezdemenyezesek", label: "Kezdeményezések", count: initiatives.length },
    { id: "eredmenyek", label: "Eredmények", count: measuredOutcomes.length + estimatedOutcomes.length },
  ];

  return (
    <div className="space-y-6" data-testid="org-grow-view">
      {/* Editorial Hero Banner matching North Star direction */}
      <section className={`${card} border-[#e8ded1] bg-gradient-to-br from-[#fdfbf7] via-[#faf6ee] to-[#f5eedf] shadow-xs`}>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2d5a43]/30 bg-[#2d5a43]/10 px-3 py-1 text-xs font-semibold text-[#1b382b]">
                Fejlesztési Áttekintés{data?.customerName ? ` · ${data.customerName}` : ""}
              </span>
              <span className="inline-flex items-center rounded-full border border-[#a84318]/30 bg-[#a84318]/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#a84318]">
                Grow with Us
              </span>
            </div>
            <p className="mt-2.5 text-xs font-semibold uppercase tracking-[0.24em] text-[#7a5f18]">
              Grow With Us · Vállalatfejlesztés
            </p>
            <h1 className="mt-2 font-serif text-2xl font-bold tracking-tight text-[#1b382b] sm:text-4xl">
              FELMÉRÉSEK ÉS FEJLESZTÉSI LEHETŐSÉGEK
            </h1>
            <p className="mt-1.5 font-serif text-lg text-[#2d5a43] italic sm:text-xl">
              Hogyan működik most a cége?
            </p>
            <p className="mt-2 text-sm leading-6 text-stone-700">
              Megmutatjuk, hol érdemes körülnézni, és miért{data?.customerName ? <> — <strong className="text-stone-900">{data.customerName}</strong></> : ""}.
            </p>
            <p className="mt-2 text-xs italic text-stone-600 max-w-2xl">
              A fejlődés nem egyetlen nagy átalakulás, hanem apró, rögzíthető lépések sorozata: feltárás, diagnózis, célzott beavatkozás és mérhető hatás.
            </p>
          </div>

          <div className="flex flex-col items-end gap-3 pt-1">
            <div className="rounded-2xl border border-[#e8ded1] bg-white/80 p-4 shadow-xs max-w-xs text-left">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#2d5a43]" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#7a5f18]">Módszertani alapelv</p>
              </div>
              <p className="mt-1.5 text-xs italic text-stone-700 leading-relaxed">
                Nincs elméleti érettségi besorolás. A rendszer rögzített megfigyelésekből, felmérési válaszokból, mérésekből és elérhető bizonyítékokból építkezik, azok forrását elkülönítve.
              </p>
            </div>
            <Link
              href="/portal/megkeresesek"
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-800 shadow-xs transition hover:bg-stone-50"
            >
              Kérdése van? Írjon nekünk →
            </Link>
          </div>
        </div>

        {/* Navigation Tabs bar directly embedded in hero card */}
        <div className="mt-6 border-t border-[#e8ded1]/80 pt-4">
          <nav className="flex flex-wrap items-center gap-1.5" aria-label="Fejlesztési navigáció" role="tablist" data-testid="grow-sub-nav">
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-testid={`grow-tab-${tab.id}`}
                  onClick={() => handleTabChange(tab.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1b382b] ${
                    active
                      ? "bg-[#1b382b] text-white shadow-xs"
                      : "bg-white/80 text-stone-700 hover:bg-stone-100 hover:text-stone-950"
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 ? (
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                        active ? "bg-white/20 text-white" : "bg-stone-200 text-stone-800"
                      }`}
                    >
                      {tab.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>
      </section>

      {/* TAB 1: ÁTTEKINTÉS */}
      {activeTab === "attekintes" ? (
        <div className="space-y-6" data-testid="grow-overview-tab">
          {/* Horizontal status strip with real metrics */}
          <div className="rounded-3xl border border-[#e8ded1] bg-white p-5 shadow-xs">
            <div className="grid grid-cols-2 gap-4 divide-y divide-stone-100 sm:grid-cols-3 sm:divide-y-0 sm:divide-x sm:divide-stone-100 lg:grid-cols-5">
              <div className="px-3 py-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#a84318]">KITÖLTÉSRE VÁR</p>
                <p className="mt-1 font-serif text-2xl font-bold text-stone-950">{uncompletedPacksCount}</p>
                <p className="mt-0.5 text-[11px] text-stone-500">{packs.length} felmérésből</p>
              </div>
              <div className="px-3 py-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#2d4a3e]">BEFEJEZETT</p>
                <p className="mt-1 font-serif text-2xl font-bold text-stone-950">{completedPacksCount}</p>
                <p className="mt-0.5 text-[11px] text-stone-500">Rögzített diagnózis</p>
              </div>
              <div className="px-3 py-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-600">FOLYAMATOK</p>
                <p className="mt-1 font-serif text-2xl font-bold text-stone-950">{processes.length}</p>
                <p className="mt-0.5 text-[11px] text-stone-500">Feltérképezve</p>
              </div>
              <div className="px-3 py-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-800">FOLYAMATBAN</p>
                <p className="mt-1 font-serif text-2xl font-bold text-stone-950">{activeInitiativesCount}</p>
                <p className="mt-0.5 text-[11px] text-stone-500">Kezdeményezés</p>
              </div>
              <div className="col-span-2 px-3 py-1 sm:col-span-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">MÉRT EREDMÉNY</p>
                <p className="mt-1 font-serif text-2xl font-bold text-stone-950">{measuredOutcomes.length}</p>
                <p className="mt-0.5 text-[11px] text-stone-500">MÉRT alapon rögzített</p>
              </div>
            </div>
          </div>

          {/* Two-column overview layout: Hol érdemes körülnézni? + Grow Módszertan */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Aggregated findings section */}
            <section className={card} data-testid="grow-aggregated-findings">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a5f18]">Összegzés</p>
                <button
                  type="button"
                  onClick={() => handleTabChange("felmeresek")}
                  className="text-xs font-semibold text-[#7a5f18] hover:underline"
                >
                  Felmérések →
                </button>
              </div>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#1b382b]">Mit látunk eddig?</h2>
              {aggregatedFindings.length > 0 ? (
                <>
                  <p className="mt-1 text-xs text-stone-600">
                    {catalogue?.aggregatedAttentionAreaCount || aggregatedFindings.length} terület igényel figyelmet
                    {catalogue && catalogue.aggregatedUnknownAreaCount > 0
                      ? `, ${catalogue.aggregatedUnknownAreaCount} területen nincs elég információ`
                      : ""}
                    .
                  </p>
                  <div className="mt-4 grid gap-3">
                    {aggregatedFindings.slice(0, 3).map((finding, idx) => (
                      <div key={idx} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
                        <p className="font-semibold text-stone-950 text-sm">{finding.titleHu}</p>
                        <p className="mt-1 text-xs leading-5 text-stone-700 line-clamp-2">{finding.summaryHu}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : hasEvaluableCompletedPack ? (
                <p className="mt-2 text-sm text-stone-600">
                  A kitöltött felmérések alapján jelenleg nem azonosítottunk figyelmet igénylő pontot.
                  {catalogue && catalogue.aggregatedUnknownAreaCount > 0
                    ? ` ${catalogue.aggregatedUnknownAreaCount} területen nincs elég információ a kiértékeléshez.`
                    : ""}
                  {hasUnavailableCompletedPack
                    ? " Néhány kitöltött felmérés eredménye jelenleg nem jeleníthető meg."
                    : ""}
                </p>
              ) : hasCompletedPack ? (
                <p className="mt-2 text-sm text-stone-600">
                  A kitöltött felmérések eredménye jelenleg nem jeleníthető meg. A kitöltéseket rögzítettük.
                </p>
              ) : (
                <div className="mt-4 rounded-2xl border border-[#e8ded1] bg-[#fdfbf7] p-5">
                  <p className="text-sm font-semibold text-stone-900">Még nincs kitöltött felmérés.</p>
                  <p className="mt-1 text-xs text-stone-600">
                    Töltse ki az egyik felmérést a Felmérések fülön, és itt összegződnek a megállapítások.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleTabChange("felmeresek")}
                    className="mt-3 rounded-full bg-[#1b382b] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#2d4a3e]"
                  >
                    Felmérés indítása
                  </button>
                </div>
              )}
            </section>

            {/* Process Development Journey Panel */}
            <section className={card}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a5f18]">Módszertan</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#1b382b]">A Grow folyamat</h2>
              <p className="mt-1 text-xs text-stone-600">
                Hogyan jutunk el a működési jelzéstől a mért és számított eredményekig?
              </p>
              <div className="mt-4 space-y-2.5">
                {[
                  { step: "1. Feltárás", desc: "Kérdőíves felmérések és a napi működési szűk keresztmetszetek rögzítése." },
                  { step: "2. Elemzés", desc: "Szakértői felülvizsgálat és összevetés a vonatkozó szakirodalmi háttérrel." },
                  { step: "3. Tervezés", desc: "Célorientált fejlesztési javaslatok és megvalósítási lépések kidolgozása." },
                  { step: "4. Megvalósítás", desc: "Folyamatoptimalizálási beavatkozások és intézkedések végrehajtása." },
                  { step: "5. Eredmények", desc: "Kapacitásfelszabadulás, időmegtakarítás és folyamatminőség ellenőrzött mérése." },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3 rounded-xl border border-stone-200/80 bg-stone-50/50 p-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f4efe6] text-[11px] font-bold text-[#1b382b]">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-stone-900">{item.step}</p>
                      <p className="text-[11px] leading-4 text-stone-600">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Quick operational pain survey — visually integrated */}
          <section className={card} data-testid="grow-feltaras-section">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a5f18]">Gyors működési jelzés</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-[#1b382b]">
              Hol érdemes javítani?
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Ossza meg velünk, milyen nehézségeket tapasztal a napi működésben. Visszajelzése közvetlenül beépül a szervezet közös fejlesztési áttekintésébe.
            </p>

            <form onSubmit={handleSurveySubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-2">
                  Jellemző működési tapasztalatok (válasszon egyet vagy többet)
                </label>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {Object.entries(SURVEY_CATEGORY_LABELS_HU).map(([key, label]) => {
                    const checked = selectedCategories.includes(key);
                    return (
                      <label
                        key={key}
                        className={`flex items-start gap-3 rounded-2xl border p-3.5 cursor-pointer transition ${
                          checked
                            ? "border-[#7a5f18] bg-[#fcf9f2] shadow-xs"
                            : "border-stone-200 bg-white hover:border-stone-300"
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
                          className="mt-0.5 h-4 w-4 rounded border-stone-300 text-[#7a5f18] focus:ring-[#7a5f18]"
                        />
                        <span className="text-sm font-medium text-stone-900 leading-snug">{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {processes.length > 0 ? (
                <div>
                  <label htmlFor="survey-process" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1.5">
                    Érintett folyamat (opcionális)
                  </label>
                  <select
                    id="survey-process"
                    value={selectedProcessId}
                    onChange={(e) => setSelectedProcessId(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#7a5f18] focus:outline-none"
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
                <label htmlFor="survey-freetext" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1.5">
                  Részletes kifejtés (opcionális)
                </label>
                <textarea
                  id="survey-freetext"
                  rows={3}
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder="Írja le röviden a konkrét helyzetet vagy példát..."
                  className="w-full rounded-xl border border-stone-200 bg-white p-3.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-[#7a5f18] focus:outline-none"
                />
              </div>

              {submitSuccess ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-sm text-emerald-900 font-medium">
                  ✓ {submitSuccess}
                </div>
              ) : null}

              {submitError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-sm text-rose-900 font-medium">
                  ✕ {submitError}
                </div>
              ) : null}

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={submitting || selectedCategories.length === 0}
                  className="rounded-full bg-[#1b382b] px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#2d4a3e] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Rögzítés folyamatban..." : "Visszajelzés beküldése"}
                </button>
              </div>
            </form>

            {/* Previously submitted feedback by customer */}
            {surveys.length > 0 ? (
              <div className="mt-6 border-t border-stone-100 pt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-3">
                  Korábban beküldött működési visszajelzések
                </h3>
                <div className="space-y-3">
                  {surveys.map((s, idx) => (
                    <div key={idx} className="rounded-xl border border-stone-200/80 bg-stone-50/60 p-3.5 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          {s.categoryLabels.map((cat, cIdx) => (
                            <span key={cIdx} className="rounded-full bg-[#f4efe6] px-2.5 py-0.5 text-xs font-semibold text-[#1b382b]">
                              {cat}
                            </span>
                          ))}
                        </div>
                        <span className="text-xs text-stone-500">{formatDate(s.submittedAt)}</span>
                      </div>
                      {s.processName ? (
                        <p className="mt-2 text-xs text-stone-600">
                          Érintett folyamat: <span className="font-semibold">{s.processName}</span>
                        </p>
                      ) : null}
                      {s.freeText ? (
                        <p className="mt-2 text-sm text-stone-800 whitespace-pre-wrap">{s.freeText}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {/* TAB 2: FELMÉRÉSEK (Assessments) */}
      {activeTab === "felmeresek" ? (
        <div className="space-y-6">
          <section className={card} data-testid="grow-assessments-section">
            {assessmentView.mode === "runner" && currentQuestion ? (
              <div data-testid="grow-assessment-runner">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a5f18]">
                    {runnerDetail?.definition.titleHu}
                  </p>
                  <p className="text-sm font-semibold text-stone-600" aria-live="polite">
                    {runnerIndex + 1} / {runnerQuestions.length}
                  </p>
                </div>

                <div
                  className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-stone-100"
                  role="progressbar"
                  aria-valuemin={1}
                  aria-valuemax={runnerQuestions.length}
                  aria-valuenow={runnerIndex + 1}
                >
                  <div
                    className="h-full rounded-full bg-[#1b382b] transition-all"
                    style={{ width: `${((runnerIndex + 1) / runnerQuestions.length) * 100}%` }}
                  />
                </div>

                <h2 className="mt-5 font-serif text-xl font-semibold text-[#1b382b] sm:text-2xl">
                  {currentQuestion.promptHu}
                </h2>
                {currentQuestion.helpTextHu ? (
                  <p className="mt-2 text-sm text-stone-600">{currentQuestion.helpTextHu}</p>
                ) : null}

                {runnerDetail?.definition.allowsProcessReference && processes.length > 0 ? (
                  <div className="mt-5" data-testid="grow-assessment-process-scope">
                    <label
                      htmlFor="assessment-process"
                      className="block text-sm font-semibold text-stone-800 mb-1.5"
                    >
                      Melyik folyamatot szeretné ezzel a felméréssel áttekinteni?
                    </label>
                    <select
                      id="assessment-process"
                      value={assessmentProcessId}
                      onChange={(e) => setAssessmentProcessId(e.target.value)}
                      className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#7a5f18] focus:outline-none"
                    >
                      <option value="">Válasszon folyamatot…</option>
                      {processes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs text-stone-500">
                      A válaszokat a kiválasztott folyamathoz rendelve értékeljük, így a megállapítások nem
                      keverednek más folyamatokkal.
                    </p>
                  </div>
                ) : null}

                <div className="mt-5 grid gap-2.5 sm:grid-cols-2" role="group" aria-label="Válaszlehetőségek">
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
                        className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5f18] ${
                          selected
                            ? "border-[#1b382b] bg-[#f4efe6] text-[#1b382b] shadow-xs"
                            : "border-stone-200 bg-white text-stone-800 hover:border-stone-300"
                        }`}
                      >
                        {option.labelHu}
                      </button>
                    );
                  })}
                </div>

                {assessmentError ? (
                  <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-sm text-rose-900 font-medium">
                    ✕ {assessmentError}
                  </div>
                ) : null}

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setRunnerIndex((idx) => Math.max(0, idx - 1))}
                    disabled={runnerIndex === 0 || assessmentBusy}
                    className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 disabled:opacity-40"
                  >
                    ← Vissza
                  </button>
                  <button
                    type="button"
                    data-testid="grow-assessment-runner-cancel"
                    onClick={() => void backToCatalogue()}
                    disabled={assessmentBusy}
                    className="text-sm font-medium text-stone-500 hover:underline disabled:opacity-40"
                  >
                    Kilépés
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isLastQuestion) {
                        void submitAssessment();
                      } else {
                        setRunnerIndex((idx) => Math.min(runnerQuestions.length - 1, idx + 1));
                      }
                    }}
                    disabled={!currentAnswered || assessmentBusy || !processReady}
                    className="rounded-full bg-[#1b382b] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#2d4a3e] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLastQuestion ? (assessmentBusy ? "Beküldés…" : "Befejezés") : "Tovább →"}
                  </button>
                </div>
              </div>
            ) : assessmentView.mode === "result" && assessmentResult ? (
              <div data-testid="grow-assessment-result">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a5f18]">Felmérés elkészült</p>
                <h2 className="mt-1 font-serif text-2xl font-semibold text-[#1b382b]">{assessmentResult.titleHu}</h2>
                {assessmentResultScope?.processName ? (
                  <p className="mt-1 text-sm font-medium text-stone-700" data-testid="grow-assessment-result-process">
                    Folyamat: {assessmentResultScope.processName}
                  </p>
                ) : null}
                <p className="mt-2 text-sm text-stone-600">{assessmentResult.summaryHu}</p>

                <div className="mt-6">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500">Amit látunk</h3>
                  {assessmentResult.findings.length > 0 ? (
                    <div className="mt-3 grid gap-3">
                      {assessmentResult.findings.map((finding, idx) => (
                        <div key={idx} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
                          <p className="font-semibold text-stone-950">{finding.titleHu}</p>
                          <p className="mt-1 text-sm leading-6 text-stone-700">{finding.summaryHu}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-stone-600">
                      A válaszok alapján ezen a területen nem azonosítottunk figyelmet igénylő pontot.
                    </p>
                  )}
                </div>

                <div className="mt-6">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500">Javasolt irányok</h3>
                  {assessmentResult.directions.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {assessmentResult.directions.map((direction, idx) => (
                        <span
                          key={idx}
                          className="rounded-full bg-[#f4efe6] px-3.5 py-1.5 text-sm font-semibold text-[#1b382b]"
                        >
                          {direction.labelHu}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-stone-600">Ehhez a kitöltéshez még nincs javasolt vizsgálati irány.</p>
                  )}
                </div>

                <div className="mt-6">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500">Mi alapján?</h3>
                  {assessmentResult.evidence.length > 0 ? (
                    <div className="mt-3 grid gap-3">
                      {assessmentResult.evidence.map((item, idx) => (
                        <div key={idx} className="rounded-2xl border border-stone-200/80 bg-stone-50/60 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="font-semibold text-stone-900">{item.title}</p>
                            <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-[#1b382b]">
                              {item.strengthLabelHu}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-stone-500">
                            {[item.authors, item.year ? String(item.year) : null].filter(Boolean).join(" · ")}
                          </p>
                          {item.boundedClaim ? (
                            <p className="mt-2 text-sm leading-6 text-stone-700">{item.boundedClaim}</p>
                          ) : null}
                          {item.limitations ? (
                            <p className="mt-2 text-xs leading-5 text-stone-500">Korlát: {item.limitations}</p>
                          ) : null}
                          {item.locator ? (
                            <a
                              href={item.locator}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-block text-xs font-medium text-[#7a5f18] hover:underline"
                            >
                              {item.doi ? `DOI: ${item.doi}` : "Forrás megnyitása →"}
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-stone-600">Ehhez az eredményhez jelenleg nincs megjeleníthető háttér.</p>
                  )}
                </div>

                <div className="mt-6 rounded-2xl border border-stone-200/70 bg-stone-50/50 p-4 text-xs leading-5 text-stone-600">
                  {assessmentResult.noticeHu}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    data-testid="grow-assessment-result-back"
                    onClick={() => void backToCatalogue()}
                    className="rounded-full bg-[#1b382b] px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#2d4a3e]"
                  >
                    Vissza a felmérésekhez
                  </button>
                  <button
                    type="button"
                    onClick={() => void startAssessment(assessmentResult.packKey, assessmentResultScope?.processId ?? undefined)}
                    disabled={assessmentBusy}
                    className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-semibold text-stone-700 disabled:opacity-40"
                  >
                    Újra kitöltöm
                  </button>
                </div>
              </div>
            ) : assessmentView.mode === "result" && assessmentResultUnavailable ? (
              <div data-testid="grow-assessment-result-unavailable">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a5f18]">Felmérés elkészült</p>
                <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-950">
                  Az eredmény jelenleg nem jeleníthető meg
                </h2>
                <p className="mt-2 text-sm text-stone-600">
                  A kitöltést rögzítettük, de ehhez a felmérésverzióhoz tartozó eredmény most nem állítható elő.
                </p>
                <button
                  type="button"
                  onClick={() => void backToCatalogue()}
                  className="mt-5 rounded-full bg-[#1b382b] px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#2d4a3e]"
                >
                  Vissza a felmérésekhez
                </button>
              </div>
            ) : (
              <div data-testid="grow-assessment-catalogue">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a5f18]">Felmérések és értékelések</p>
                    <h2 className="mt-1 font-serif text-2xl font-semibold text-[#1b382b]">Cégfelmérések / diagnózisok</h2>
                  </div>
                  {/* Status filter chips for catalogue */}
                  <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Felmérés szűrők">
                    {[
                      { id: "all", label: `Összes (${packs.length})` },
                      { id: "uncompleted", label: `Kitöltésre vár (${uncompletedPacksCount})` },
                      { id: "completed", label: `Befejezett (${completedPacksCount})` },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setAssessmentFilter(f.id as any)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                          assessmentFilter === f.id
                            ? "bg-[#1b382b] text-white shadow-xs"
                            : "border border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-1.5 text-sm text-stone-600">
                  Válassza ki, mit szeretne áttekinteni. Minden felmérés kérdésenként halad, és a végén konkrét
                  megállapításokat, javasolt irányokat és a mögöttük álló szakirodalmi hátteret mutatja.
                </p>

                {assessmentError ? (
                  <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-sm text-rose-900 font-medium">
                    ✕ {assessmentError}
                  </div>
                ) : null}

                {catalogueError ? (
                  <div
                    className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-900"
                    data-testid="grow-assessment-catalogue-error"
                  >
                    <p className="font-semibold">A felmérések most nem érhetők el.</p>
                    <p className="mt-1">{catalogueError}</p>
                    <button
                      type="button"
                      onClick={() => void loadCatalogue()}
                      className="mt-3 rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Újrapróbálás
                    </button>
                  </div>
                ) : null}

                {/* Two-column layout: vertical assessment list + right-side explanatory panel */}
                <div className="mt-6 grid gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2 space-y-3">
                    {filteredPacks.length > 0 ? (
                      filteredPacks.map((pack) => {
                        const isExpanded = selectedPackKey === pack.packKey;
                        if (!isExpanded) {
                          return (
                            <div
                              key={pack.packKey}
                              data-testid={`grow-assessment-row-${pack.packKey}`}
                              onClick={() => setSelectedPackKey(pack.packKey)}
                              className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-xs transition hover:border-[#1b382b]/50 cursor-pointer"
                            >
                              <div className="flex items-center gap-3.5 min-w-0">
                                <span
                                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                                    pack.status === "COMPLETED"
                                      ? "bg-[#2d4a3e]/15 text-[#1b382b]"
                                      : "bg-stone-100 text-stone-500 border border-stone-200"
                                  }`}
                                >
                                  {pack.status === "COMPLETED" ? "✓" : "○"}
                                </span>
                                <div className="min-w-0">
                                  <h3 className="break-words font-serif text-base font-semibold text-[#1b382b] group-hover:text-[#2d5a43] transition">
                                    {pack.titleHu}
                                  </h3>
                                  <p className="mt-0.5 text-xs text-stone-600 line-clamp-1">{pack.descriptionHu}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span
                                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                    pack.status === "COMPLETED"
                                      ? "bg-[#2d4a3e]/10 text-[#1b382b] border border-[#2d4a3e]/20"
                                      : "bg-stone-100 text-stone-600 border border-stone-200"
                                  }`}
                                >
                                  {pack.status === "COMPLETED" ? "Kitöltve" : "Nincs kitöltve"}
                                </span>
                                {pack.status === "COMPLETED" && pack.latestResultAvailable ? (
                                  <button
                                    type="button"
                                    data-testid={`grow-assessment-result-${pack.packKey}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void viewAssessmentResult(pack.packKey, pack.resultScopes[0]?.processId ?? undefined);
                                    }}
                                    disabled={assessmentBusy}
                                    className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50 shadow-xs"
                                  >
                                    Eredmény megtekintése
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  data-testid={`grow-assessment-toggle-${pack.packKey}`}
                                  aria-label="Kibontás"
                                  aria-expanded={false}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPackKey(pack.packKey);
                                  }}
                                  className="p-1 text-stone-400 hover:text-stone-700 transition"
                                >
                                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          );
                        }

                        // Selected / expanded assessment state
                        return (
                          <div
                            key={pack.packKey}
                            data-testid={`grow-assessment-row-${pack.packKey}`}
                            className="rounded-3xl border-2 border-[#1b382b] bg-gradient-to-br from-[#fcfbf9] to-[#faf6ee] p-6 shadow-md transition"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <span
                                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xs font-bold ${
                                    pack.status === "COMPLETED"
                                      ? "bg-[#1b382b] text-white shadow-xs"
                                      : "bg-[#f4efe6] text-[#1b382b] border border-[#e8ded1]"
                                  }`}
                                >
                                  {pack.status === "COMPLETED" ? "✓" : "○"}
                                </span>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#7a5f18]">Kiválasztott felmérés</p>
                                  <h3 className="break-words font-serif text-lg font-bold text-[#1b382b] sm:text-xl">
                                    {pack.titleHu}
                                  </h3>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                    pack.status === "COMPLETED"
                                      ? "bg-[#2d4a3e]/15 text-[#1b382b] border border-[#2d4a3e]/30"
                                      : "bg-stone-200/80 text-stone-700"
                                  }`}
                                >
                                  {pack.status === "COMPLETED" ? "Kitöltve" : "Kitöltésre vár"}
                                </span>
                                <button
                                  type="button"
                                  data-testid={`grow-assessment-toggle-${pack.packKey}`}
                                  aria-label="Összecsukás"
                                  aria-expanded={true}
                                  onClick={() => setSelectedPackKey(null)}
                                  className="p-1 text-stone-500 hover:text-stone-800 transition"
                                >
                                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                                  </svg>
                                </button>
                              </div>
                            </div>

                            <p className="mt-3.5 text-sm leading-relaxed text-stone-700">{pack.descriptionHu}</p>

                            {/* Truthful metrics: estimated time, questions, completion date, findings */}
                            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-2xl border border-[#e8ded1] bg-white p-3.5 text-xs text-stone-700 shadow-xs">
                              <div>
                                <p className="text-[10px] font-semibold uppercase text-stone-500">Becsült idő</p>
                                <p className="mt-0.5 font-bold text-[#1b382b]">~{pack.estimatedMinutes} perc</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase text-stone-500">Kérdések</p>
                                <p className="mt-0.5 font-bold text-[#1b382b]">{pack.questionCount} kérdés</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase text-stone-500">Utolsó kitöltés</p>
                                <p className="mt-0.5 font-bold text-stone-900">
                                  {pack.latestCompletedAt ? formatDate(pack.latestCompletedAt) : "Még nem volt"}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase text-stone-500">Megállapítások</p>
                                <p className="mt-0.5 font-bold text-[#1b382b]">
                                  {pack.latestFindingCount > 0 ? `${pack.latestFindingCount} pont` : "—"}
                                </p>
                              </div>
                            </div>

                            {pack.status === "COMPLETED" && !pack.resultScopes.some((s) => s.resultAvailable) ? (
                              <p className="mt-3 text-xs font-medium text-amber-800">
                                A kitöltés rögzítve van, de az eredmény ehhez a verzióhoz jelenleg nem jeleníthető meg.
                              </p>
                            ) : null}

                            {/* Truthful next actions */}
                            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#e8ded1] pt-4">
                              <button
                                type="button"
                                data-testid={`grow-assessment-start-${pack.packKey}`}
                                onClick={() => void startAssessment(pack.packKey)}
                                disabled={assessmentBusy}
                                className="rounded-full bg-[#1b382b] px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#2d4a3e] disabled:opacity-50"
                              >
                                {pack.status === "COMPLETED" ? "Újra kitöltöm" : "Kitöltöm"}
                              </button>
                              {pack.status === "COMPLETED" &&
                              (pack.allowsProcessReference
                                ? pack.resultScopes.some((s) => s.resultAvailable)
                                : pack.latestResultAvailable) ? (
                                pack.allowsProcessReference && pack.resultScopes.length > 1 ? (
                                  <div className="w-full mt-2" data-testid="grow-assessment-result-scopes">
                                    <p className="text-xs font-semibold text-stone-700 mb-1.5">Eredmény megtekintése folyamatonként:</p>
                                    <div className="flex flex-wrap gap-2">
                                      {pack.resultScopes.map((scope) => (
                                        <button
                                          key={scope.processId ?? "__general__"}
                                          type="button"
                                          data-testid={`grow-assessment-result-${pack.packKey}-${scope.processId ?? "general"}`}
                                          onClick={() => void viewAssessmentResult(pack.packKey, scope.processId)}
                                          disabled={assessmentBusy || !scope.resultAvailable}
                                          className="rounded-full border border-stone-300 bg-white px-4 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-40"
                                        >
                                          {scope.processName || "Általános"}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    data-testid={`grow-assessment-result-${pack.packKey}`}
                                    onClick={() =>
                                      void viewAssessmentResult(pack.packKey, pack.resultScopes[0]?.processId ?? undefined)
                                    }
                                    disabled={assessmentBusy}
                                    className="rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50 shadow-xs transition disabled:opacity-40"
                                  >
                                    Eredmény megtekintése
                                  </button>
                                )
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    ) : catalogueError ? null : (
                      <p className="mt-4 text-sm text-stone-600">A felmérések betöltése folyamatban…</p>
                    )}
                  </div>

                  {/* Right-side Explanatory Panel: "Mi történik a felmérés után?" */}
                  <div className="rounded-3xl border border-[#e8ded1] bg-[#faf6ee] p-6 shadow-xs h-fit space-y-5">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[#7a5f18]">
                        Módszertani útmutató
                      </p>
                      <h3 className="mt-1 font-serif text-xl font-bold text-[#1b382b]">
                        Mi történik a felmérés után?
                      </h3>
                      <p className="mt-1.5 text-xs leading-5 text-stone-600">
                        Mi történik a kitöltés után? A diagnózis célja nem egy absztrakt minősítés, hanem a konkrét működési rések és beavatkozási irányok megalapozása.
                      </p>
                    </div>

                    <div className="space-y-4 border-t border-[#e8ded1] pt-4">
                      <div className="flex items-start gap-3.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1b382b] text-xs font-bold text-white shadow-xs">
                          1
                        </span>
                        <div>
                          <h4 className="text-xs font-bold text-[#1b382b]">Eredmények elemzése</h4>
                          <p className="mt-0.5 text-xs text-stone-600 leading-relaxed">
                            A beérkezett válaszok kiértékelése és a működési szűk keresztmetszetek azonosítása tényalapon.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1b382b] text-xs font-bold text-white shadow-xs">
                          2
                        </span>
                        <div>
                          <h4 className="text-xs font-bold text-[#1b382b]">Fejlesztési lehetőségek kijelölése</h4>
                          <p className="mt-0.5 text-xs text-stone-600 leading-relaxed">
                            Az elérhető szakirodalmi és egyéb bizonyítékokat is figyelembe vevő, szakértői felülvizsgálattal kialakított fejlesztési irányok.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1b382b] text-xs font-bold text-white shadow-xs">
                          3
                        </span>
                        <div>
                          <h4 className="text-xs font-bold text-[#1b382b]">Mérhető eredmények követése</h4>
                          <p className="mt-0.5 text-xs text-stone-600 leading-relaxed">
                            A megvalósult lépések hatását konkrét kapacitás-, idő- és folyamatmérésekkel ellenőrizzük és rögzítjük.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#e8ded1] bg-white/80 p-3.5 text-[11px] text-stone-600 leading-relaxed">
                      <strong className="text-[#1b382b]">Módszertani alapelv:</strong> A felmérések a vállalat által megadott válaszokat és működési megfigyeléseket rendszerezik; ezek további szakértői értékelés és más adatforrások mellett használhatók fel.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Quick operational pain survey — completely preserved */}
          <section className={card} data-testid="grow-feltaras-section">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a5f18]">Gyors működési jelzés</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-[#1b382b]">
              Hol érdemes javítani?
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Ossza meg velünk, milyen nehézségeket tapasztal a napi működésben. Visszajelzése közvetlenül beépül a szervezet közös fejlesztési áttekintésébe.
            </p>

            <form onSubmit={handleSurveySubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-2">
                  Jellemző működési tapasztalatok (válasszon egyet vagy többet)
                </label>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {Object.entries(SURVEY_CATEGORY_LABELS_HU).map(([key, label]) => {
                    const checked = selectedCategories.includes(key);
                    return (
                      <label
                        key={key}
                        className={`flex items-start gap-3 rounded-2xl border p-3.5 cursor-pointer transition ${
                          checked
                            ? "border-[#7a5f18] bg-[#fcf9f2] shadow-xs"
                            : "border-stone-200 bg-white hover:border-stone-300"
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
                          className="mt-0.5 h-4 w-4 rounded border-stone-300 text-[#7a5f18] focus:ring-[#7a5f18]"
                        />
                        <span className="text-sm font-medium text-stone-900 leading-snug">{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {processes.length > 0 ? (
                <div>
                  <label htmlFor="survey-process-felmeres" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1.5">
                    Érintett folyamat (opcionális)
                  </label>
                  <select
                    id="survey-process-felmeres"
                    value={selectedProcessId}
                    onChange={(e) => setSelectedProcessId(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#7a5f18] focus:outline-none"
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
                <label htmlFor="survey-freetext-felmeres" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1.5">
                  Részletes kifejtés (opcionális)
                </label>
                <textarea
                  id="survey-freetext-felmeres"
                  rows={3}
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder="Írja le röviden a konkrét helyzetet vagy példát..."
                  className="w-full rounded-xl border border-stone-200 bg-white p-3.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-[#7a5f18] focus:outline-none"
                />
              </div>

              {submitSuccess ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-sm text-emerald-900 font-medium">
                  ✓ {submitSuccess}
                </div>
              ) : null}

              {submitError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-sm text-rose-900 font-medium">
                  ✕ {submitError}
                </div>
              ) : null}

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={submitting || selectedCategories.length === 0}
                  className="rounded-full bg-[#1b382b] px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#2d4a3e] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Rögzítés folyamatban..." : "Visszajelzés beküldése"}
                </button>
              </div>
            </form>

            {/* Previously submitted feedback by customer */}
            {surveys.length > 0 ? (
              <div className="mt-6 border-t border-stone-100 pt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-3">
                  Korábban beküldött működési visszajelzések
                </h3>
                <div className="space-y-3">
                  {surveys.map((s, idx) => (
                    <div key={idx} className="rounded-xl border border-stone-200/80 bg-stone-50/60 p-3.5 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          {s.categoryLabels.map((cat, cIdx) => (
                            <span key={cIdx} className="rounded-full bg-[#f4efe6] px-2.5 py-0.5 text-xs font-semibold text-[#1b382b]">
                              {cat}
                            </span>
                          ))}
                        </div>
                        <span className="text-xs text-stone-500">{formatDate(s.submittedAt)}</span>
                      </div>
                      {s.processName ? (
                        <p className="mt-2 text-xs text-stone-600">
                          Érintett folyamat: <span className="font-semibold">{s.processName}</span>
                        </p>
                      ) : null}
                      {s.freeText ? (
                        <p className="mt-2 text-sm text-stone-800 whitespace-pre-wrap">{s.freeText}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {/* TAB 3: FOLYAMATOK */}
      {activeTab === "folyamatok" ? (
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a5f18]">Folyamatok és Rendszerek</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#1b382b]">Feltérképezett üzleti folyamatok</h2>
              <p className="mt-1 text-sm text-stone-600">
                A szervezet felmért működési folyamatai, végrehajtási lépései, jóváhagyási pontjai és kapcsolódó informatikai eszközei.
              </p>
            </div>
            <Link
              href="/portal/vallalat"
              className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 shadow-xs hover:bg-stone-50"
            >
              Teljes vállalati kontextus a Vállalat oldalon →
            </Link>
          </div>

          <div className="mt-5 grid gap-5">
            {processes.length > 0 ? (
              processes.map((proc) => (
                <div key={proc.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                        {proc.category} {proc.organizationGroupName ? `· ${proc.organizationGroupName}` : ""}
                      </span>
                      <h3 className="text-lg font-semibold text-stone-950 mt-0.5">{proc.name}</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-700 font-medium">
                        Gyakoriság: {proc.frequency}
                      </span>
                      <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-700 font-medium">
                        Kritikusság: {proc.criticality}
                      </span>
                    </div>
                  </div>

                  {proc.steps.length > 0 ? (
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                        Folyamat lépései ({proc.steps.length} lépés)
                      </p>
                      <div className="mt-2 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                        {proc.steps.map((step) => (
                          <div
                            key={step.id}
                            className="flex flex-col justify-between rounded-xl border border-stone-200/80 bg-stone-50/70 p-3.5 text-sm"
                          >
                            <div>
                              <div className="flex items-center justify-between text-xs text-stone-500">
                                <span className="font-semibold text-stone-600">{step.position}. lépés</span>
                                {step.isApproval ? (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                                    Jóváhagyási kapu
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 font-medium text-stone-900 leading-snug">{step.name}</p>
                            </div>
                            {step.systemName ? (
                              <p className="mt-2.5 text-xs text-stone-600 border-t border-stone-200/60 pt-2">
                                Rendszer: <span className="font-semibold text-stone-800">{step.systemName}</span>
                                {step.systemCategory ? ` (${step.systemCategory})` : ""}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-stone-500">Ehhez a folyamathoz még nincsenek részletes lépések dokumentálva.</p>
                  )}
                </div>
              ))
            ) : (
              <div className={compactState}>
                <p className="text-sm font-semibold text-stone-800">Nincsenek feltérképezett folyamatok</p>
                <p className="text-sm text-stone-500 mt-1">Ehhez a szervezethez még nincsenek üzleti folyamatok rögzítve.</p>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {/* TAB 4: LEHETŐSÉGEK — FAIL-CLOSED GUARDED BOUNDARY */}
      {activeTab === "lehetosegek" ? (
        <section className={card} data-testid="grow-opportunities-section">
          <div className="max-w-2xl">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-semibold text-stone-700"
              data-publication-code="GROW_OPPORTUNITY_CUSTOMER_PUBLICATION_GAP"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-stone-500" />
              Közzétételi állapot
            </span>
            <h2 className="mt-3 font-serif text-2xl font-semibold text-[#1b382b] sm:text-3xl">
              Jelenleg nincs ügyféloldalon közzétett fejlesztési lehetőség.
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-700">
              A fejlesztési lehetőségek csak jóváhagyott ügyféloldali közzétételi folyamaton keresztül jelenhetnek meg ezen a felületen.
            </p>

            <div
              className="mt-6 rounded-2xl border border-stone-200/80 bg-stone-50/60 p-4 text-xs leading-5 text-stone-600"
              data-publication-code="GROW_OPPORTUNITY_CUSTOMER_PUBLICATION_GAP"
            >
              <p className="font-semibold text-stone-800">
                Jelenleg nincs ügyféloldalon közzétett fejlesztési lehetőség.
              </p>
              <p className="mt-0.5">
                {data?.opportunitiesDeferredNotice && !data.opportunitiesDeferredNotice.includes("GROW_OPPORTUNITY_CUSTOMER_PUBLICATION_GAP")
                  ? data.opportunitiesDeferredNotice
                  : "A fejlesztési lehetőségek csak jóváhagyott ügyféloldali közzétételi folyamaton keresztül jelenhetnek meg."}
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/portal/megkeresesek"
                className="rounded-full bg-[#1b382b] px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#2d4a3e]"
              >
                Kérdése van a vizsgálatról? Írjon az irodának →
              </Link>
              <button
                type="button"
                onClick={() => handleTabChange("felmeresek")}
                className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
              >
                Felmérések megnyitása
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {/* TAB 5: KEZDEMÉNYEZÉSEK */}
      {activeTab === "kezdemenyezesek" ? (
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a5f18]">Kezdeményezések</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#1b382b]">Min dolgozunk jelenleg?</h2>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 font-medium text-stone-700">
                Tervezett: <strong className="text-stone-950">{plannedInitiativesCount}</strong>
              </span>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 font-medium text-blue-800">
                Folyamatban: <strong className="text-blue-950">{activeInitiativesCount}</strong>
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-medium text-emerald-800">
                Lezárt: <strong className="text-emerald-950">{completedInitiativesCount}</strong>
              </span>
            </div>
          </div>

          {/* Status Filter Chips */}
          <div className="mt-4 flex flex-wrap gap-2 border-b border-stone-100 pb-3" role="tablist" aria-label="Kezdeményezés szűrők">
            {[
              { id: "all", label: `Összes (${initiatives.length})` },
              { id: "planned", label: `Tervezett (${plannedInitiativesCount})` },
              { id: "active", label: `Folyamatban (${activeInitiativesCount})` },
              { id: "completed", label: `Lezárt (${completedInitiativesCount})` },
            ].map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setInitiativeFilter(filter.id as any)}
                className={`rounded-full px-3.5 py-1 text-xs font-semibold transition ${
                  initiativeFilter === filter.id
                    ? "bg-[#1b382b] text-white shadow-xs"
                    : "border border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Initiative Cards */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {filteredInitiatives.length > 0 ? (
              filteredInitiatives.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-xs transition hover:border-[#1b382b]/60"
                >
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="break-words font-semibold text-stone-950 text-base">{item.title}</h3>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        item.statusLabel === "Folyamatban"
                          ? "bg-blue-100 text-blue-900"
                          : item.statusLabel.includes("Lezárt") || item.statusLabel.includes("Megvalósult")
                          ? "bg-emerald-100 text-emerald-900"
                          : "bg-[#f4efe6] text-[#1b382b]"
                      }`}>
                        {item.statusLabel}
                      </span>
                    </div>

                    {item.targetState ? (
                      <div className="mt-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Célállapot</p>
                        <p className="mt-0.5 text-sm text-stone-700">{item.targetState}</p>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 border-t border-stone-100 pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                      {item.targetAt ? <span>Célhatáridő: <strong>{formatDate(item.targetAt)}</strong></span> : <span />}
                      {item.hasRelatedMatter ? (
                        <Link
                          href={`/portal/ugyek`}
                          className="font-semibold text-[#7a5f18] hover:underline"
                        >
                          Kapcsolódó ügy →
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="col-span-2 text-sm text-stone-500 py-4">Nincs a szűrésnek megfelelő kezdeményezés.</p>
            )}
          </div>
        </section>
      ) : null}

      {/* TAB 6: EREDMÉNYEK */}
      {activeTab === "eredmenyek" ? (
        <section className={card}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a5f18]">Eredmények és Hatás</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-[#1b382b]">Mit értünk el?</h2>
          <p className="mt-1 text-sm text-stone-600">
            Mérési alapon rögzített eredmények, felszabadított kapacitások és folyamathatások.
          </p>

          {measuredOutcomes.length > 0 ? (
            <div className="mt-6">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-600" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-900">
                  Mért eredmények ({measuredOutcomes.length})
                </h3>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {measuredOutcomes.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-xs">
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                      {item.basisLabel}
                    </span>
                    {item.initiativeTitle ? (
                      <p className="mt-2 text-sm font-medium text-stone-900">
                        Kezdeményezés: <span className="font-semibold">{item.initiativeTitle}</span>
                      </p>
                    ) : null}
                    {item.processName ? (
                      <p className="mt-1 text-xs text-stone-600">Érintett folyamat: {item.processName}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {estimatedOutcomes.length > 0 ? (
            <div className="mt-6">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-stone-500" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-700">
                  Számított / becsült eredmények ({estimatedOutcomes.length})
                </h3>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {estimatedOutcomes.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4 shadow-xs">
                    <span className="rounded-full bg-stone-200 px-2.5 py-0.5 text-xs font-semibold text-stone-700">
                      {item.basisLabel}
                    </span>
                    {item.initiativeTitle ? (
                      <p className="mt-2 text-sm font-medium text-stone-900">
                        Kezdeményezés: <span className="font-semibold">{item.initiativeTitle}</span>
                      </p>
                    ) : null}
                    {item.processName ? (
                      <p className="mt-1 text-xs text-stone-600">Érintett folyamat: {item.processName}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {measuredOutcomes.length === 0 && estimatedOutcomes.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-stone-200/80 bg-stone-50/60 p-5 text-sm text-stone-600">
              <p className="font-semibold text-stone-900">Még nincs rögzített eredmény.</p>
              <p className="mt-1">
                Az eredmények akkor jelennek meg, amikor egy fejlesztési kezdeményezéshez mérési alap kerül rögzítésre.
              </p>
            </div>
          ) : null}

          {/* Methodology note */}
          <div className="mt-6 rounded-2xl border border-stone-200/60 bg-stone-50/40 p-4 text-xs leading-5 text-stone-500">
            <p className="font-semibold text-stone-700">Módszertan és forrásmegjelölés</p>
            <p className="mt-0.5">
              Mért eredményként csak MEASURED alapú eredmény jelenik meg. Számított és becsült hatások külön kategóriában szerepelnek.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
