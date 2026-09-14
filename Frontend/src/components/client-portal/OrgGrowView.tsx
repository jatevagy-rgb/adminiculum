"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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
  type PortalGrowSurveyItem,
  type PortalOrgGrow,
} from "@/lib/clientPortalApi";
import { clientSafeError } from "@/lib/clientInteractionApi";
import { SURVEY_CATEGORY_LABELS_HU } from "@/lib/growApi";

const card = "min-w-0 rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm";
const compactState = "min-w-0 rounded-2xl border border-stone-200 bg-white px-4 py-3";

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

function Section({
  kicker,
  title,
  children,
  empty,
  emptyText,
}: {
  kicker?: string;
  title: string;
  children?: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
}) {
  if (empty) {
    return (
      <section className={compactState}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-semibold text-stone-800">{title}</p>
          <p className="text-sm text-stone-500">{emptyText || "Nincs megjeleníthető elem."}</p>
        </div>
      </section>
    );
  }
  return (
    <section className={card}>
      {kicker ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a5f18]">{kicker}</p> : null}
      <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-950">{title}</h2>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

type AssessmentView = { mode: "catalogue" } | { mode: "runner"; packKey: string } | { mode: "result"; packKey: string };

export function OrgGrowView() {
  const [data, setData] = useState<PortalOrgGrow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  const [assessmentBusy, setAssessmentBusy] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [assessmentProcessId, setAssessmentProcessId] = useState<string>("");
  const assessmentKeyRef = useRef<string>(generateUUID());

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
      }
    } catch (err) {
      // Non-blocking for the survey/initiatives/outcomes journey, but NEVER
      // presented as "still loading": a failed catalogue request gets an
      // explicit unavailable + retry state instead of a permanent spinner.
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

  const startAssessment = useCallback(async (packKey: string) => {
    setAssessmentBusy(true);
    setAssessmentError(null);
    try {
      const detail = await getPortalGrowAssessment(packKey);
      setRunnerDetail(detail);
      setRunnerIndex(0);
      setRunnerAnswers({});
      setAssessmentProcessId("");
      assessmentKeyRef.current = generateUUID();
      setAssessmentView({ mode: "runner", packKey });
    } catch (err) {
      setAssessmentError(clientSafeError(err));
    } finally {
      setAssessmentBusy(false);
    }
  }, []);

  const viewAssessmentResult = useCallback(async (packKey: string) => {
    setAssessmentBusy(true);
    setAssessmentError(null);
    try {
      const detail = await getPortalGrowAssessment(packKey);
      setAssessmentResult(detail.latestResult);
      setAssessmentResultUnavailable(detail.latestResult === null);
      setAssessmentView({ mode: "result", packKey });
    } catch (err) {
      setAssessmentError(clientSafeError(err));
    } finally {
      setAssessmentBusy(false);
    }
  }, []);

  const backToCatalogue = useCallback(async () => {
    setAssessmentView({ mode: "catalogue" });
    setRunnerDetail(null);
    setAssessmentResult(null);
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
        // Process-oriented packs must carry the selected process so their
        // findings are scoped to that process instead of every matching process.
        processId: assessmentProcessId || undefined,
      });
      setAssessmentResult(res.result);
      setAssessmentResultUnavailable(false);
      setAssessmentView({ mode: "result", packKey: runnerDetail.definition.packKey });
      await loadCatalogue();
    } catch (err) {
      setAssessmentError(clientSafeError(err));
    } finally {
      setAssessmentBusy(false);
    }
  }, [runnerDetail, runnerAnswers, assessmentProcessId, loadCatalogue]);

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

  const processes = data?.processes || [];
  const initiatives = data?.initiatives || [];
  const measuredOutcomes = data?.outcomes.measured || [];
  const estimatedOutcomes = data?.outcomes.calculatedOrEstimated || [];
  const packs = catalogue?.packs || [];
  const aggregatedFindings = catalogue?.aggregatedFindings || [];
  const hasCompletedPack = packs.some((p) => p.status === "COMPLETED");
  const hasEvaluableCompletedPack = packs.some(
    (p) => p.status === "COMPLETED" && p.latestResultAvailable,
  );

  const runnerQuestions = runnerDetail?.definition.questions || [];
  const currentQuestion = runnerQuestions[runnerIndex];
  const isLastQuestion = runnerQuestions.length > 0 && runnerIndex === runnerQuestions.length - 1;
  const currentAnswered = currentQuestion ? Boolean(runnerAnswers[currentQuestion.questionKey]) : false;
  // Process-oriented packs are scoped to a chosen process. When the workspace has
  // processes, a selection is required so findings cannot leak across processes.
  const requiresProcess = Boolean(
    runnerDetail?.definition.allowsProcessReference && processes.length > 0,
  );
  const processReady = !requiresProcess || assessmentProcessId !== "";

  return (
    <div className="space-y-6" data-testid="org-grow-view">
      {/* Header Banner */}
      <section className={`${card} bg-gradient-to-br from-white to-[#fcf9f2]`}>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#7a5f18]">
          Grow With Us · Vállalatfejlesztés
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-stone-950 sm:text-4xl">
          Fejlesztési Áttekintés
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-700">
          Az Adminiculum és vállalata közös fejlesztési programjai, feltérképezett üzleti folyamatai és
          mért eredményei.
        </p>
      </section>

      {/* Section 1: FELMÉRÉSEK — customer assessment journey */}
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
                className="h-full rounded-full bg-[#b99b45] transition-all"
                style={{ width: `${((runnerIndex + 1) / runnerQuestions.length) * 100}%` }}
              />
            </div>

            <h2 className="mt-5 font-serif text-xl font-semibold text-stone-950 sm:text-2xl">
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
                    aria-pressed={selected}
                    onClick={() =>
                      setRunnerAnswers((prev) => ({ ...prev, [currentQuestion.questionKey]: option.value }))
                    }
                    className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5f18] ${
                      selected
                        ? "border-[#7a5f18] bg-[#fcf9f2] text-stone-950 shadow-xs"
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
                className="rounded-full bg-stone-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLastQuestion ? (assessmentBusy ? "Beküldés…" : "Befejezés") : "Tovább →"}
              </button>
            </div>
          </div>
        ) : assessmentView.mode === "result" && assessmentResult ? (
          <div data-testid="grow-assessment-result">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a5f18]">Felmérés elkészült</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-950">{assessmentResult.titleHu}</h2>
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
                      className="rounded-full bg-[#f3ead2] px-3.5 py-1.5 text-sm font-semibold text-[#6f5514]"
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
                        <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-[#6f5514]">
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
                onClick={() => void backToCatalogue()}
                className="rounded-full bg-stone-950 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-stone-800"
              >
                Vissza a felmérésekhez
              </button>
              <button
                type="button"
                onClick={() => void startAssessment(assessmentResult.packKey)}
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
              className="mt-5 rounded-full bg-stone-950 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-stone-800"
            >
              Vissza a felmérésekhez
            </button>
          </div>
        ) : (
          <div data-testid="grow-assessment-catalogue">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a5f18]">Felmérések</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-950">Cégfelmérések / diagnózisok</h2>
            <p className="mt-1 text-sm text-stone-600">
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

            {packs.length > 0 ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {packs.map((pack) => (
                  <div
                    key={pack.packKey}
                    className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-xs transition hover:border-[#b99b45]"
                  >
                    <div>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="break-words font-semibold text-stone-950">{pack.titleHu}</h3>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            pack.status === "COMPLETED"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-stone-100 text-stone-600"
                          }`}
                        >
                          {pack.status === "COMPLETED" ? "Kitöltve" : "Nincs kitöltve"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-stone-700">{pack.descriptionHu}</p>
                      <p className="mt-2 text-xs text-stone-500">
                        Kérdések: {pack.questionCount} · Becsült idő: ~{pack.estimatedMinutes} perc
                      </p>
                      {pack.status === "COMPLETED" ? (
                        <p className="mt-2 text-xs text-stone-500">
                          Utolsó kitöltés: {formatDate(pack.latestCompletedAt)}
                          {pack.latestResultAvailable && pack.latestFindingCount > 0
                            ? ` · ${pack.latestFindingCount} megállapítás`
                            : ""}
                        </p>
                      ) : null}
                      {pack.status === "COMPLETED" && !pack.latestResultAvailable ? (
                        <p className="mt-2 text-xs font-medium text-amber-800">
                          A kitöltés rögzítve van, de az eredmény ehhez a verzióhoz jelenleg nem jeleníthető meg.
                        </p>
                      ) : null}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void startAssessment(pack.packKey)}
                        disabled={assessmentBusy}
                        className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
                      >
                        {pack.status === "COMPLETED" ? "Újra kitöltöm" : "Kitöltöm"}
                      </button>
                      {pack.status === "COMPLETED" && pack.latestResultAvailable ? (
                        <button
                          type="button"
                          onClick={() => void viewAssessmentResult(pack.packKey)}
                          disabled={assessmentBusy}
                          className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 disabled:opacity-40"
                        >
                          Eredmény megtekintése
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : catalogueError ? null : (
              <p className="mt-4 text-sm text-stone-600">A felmérések betöltése folyamatban…</p>
            )}
          </div>
        )}
      </section>

      {/* Section 2: Mit látunk eddig? — aggregated latest findings */}
      <section className={card} data-testid="grow-aggregated-findings">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a5f18]">Összegzés</p>
        <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-950">Mit látunk eddig?</h2>
        {aggregatedFindings.length > 0 ? (
          <>
            <p className="mt-1 text-sm text-stone-600">
              {catalogue?.aggregatedAttentionAreaCount || aggregatedFindings.length} terület igényel figyelmet
              {catalogue && catalogue.aggregatedUnknownAreaCount > 0
                ? `, ${catalogue.aggregatedUnknownAreaCount} területen nincs elég információ`
                : ""}
              .
            </p>
            <div className="mt-4 grid gap-3">
              {aggregatedFindings.map((finding, idx) => (
                <div key={idx} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
                  <p className="font-semibold text-stone-950">{finding.titleHu}</p>
                  <p className="mt-1 text-sm leading-6 text-stone-700">{finding.summaryHu}</p>
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
          </p>
        ) : hasCompletedPack ? (
          <p className="mt-2 text-sm text-stone-600">
            A kitöltött felmérések eredménye jelenleg nem jeleníthető meg. A kitöltéseket rögzítettük.
          </p>
        ) : (
          <p className="mt-2 text-sm text-stone-600">
            Még nincs kitöltött felmérés. Töltse ki az egyik fenti felmérést, és itt összegződnek a megállapítások.
          </p>
        )}
      </section>

      {/* Section 3: Gyors működési jelzés (existing generic survey — preserved) */}
      <section className={card} data-testid="grow-feltaras-section">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a5f18]">Gyors működési jelzés</p>
        <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-950">
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
              className="rounded-full bg-stone-950 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
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
                        <span key={cIdx} className="rounded-full bg-amber-100/70 px-2.5 py-0.5 text-xs font-semibold text-[#6f5514]">
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

        {/* Truthful deferred notice */}
        <div className="mt-5 rounded-2xl border border-stone-200/70 bg-stone-50/50 p-4 text-xs leading-5 text-stone-600">
          Jelenleg nincs közvetlen ügyféloldali jóváhagyott fejlesztési lehetőség közzétéve. Az iroda elemzései a fenti visszajelzések alapján az aktív kezdeményezésekben öltenek formát.
        </div>
      </section>

      {/* Section 4: Min dolgozunk? (Active Initiatives) */}
      <Section
        kicker="Kezdeményezések"
        title="Min dolgozunk jelenleg?"
        empty={!initiatives.length}
        emptyText="Jelenleg nincs aktív fejlesztési kezdeményezés rögzítve."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {initiatives.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs transition hover:border-[#b99b45]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="break-words font-semibold text-stone-950">{item.title}</h3>
                <span className="rounded-full bg-[#f3ead2] px-3 py-1 text-xs font-semibold text-[#6f5514]">
                  {item.statusLabel}
                </span>
              </div>

              {item.targetState ? (
                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Célállapot</p>
                  <p className="mt-0.5 text-sm text-stone-700">{item.targetState}</p>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center justify-between border-t border-stone-100 pt-3 text-xs text-stone-500">
                {item.targetAt ? <span>Célhatáridő: {formatDate(item.targetAt)}</span> : <span />}
                {item.hasRelatedMatter ? (
                  <Link
                    href={`/portal/ugyek`}
                    className="font-medium text-[#7a5f18] hover:underline"
                  >
                    Kapcsolódó ügy →
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Section 5: Üzleti folyamatok és rendszerek (Process Visibility) */}
      <Section
        kicker="Folyamatok és Rendszerek"
        title="Feltérképezett üzleti folyamatok"
        empty={!processes.length}
        emptyText="Ehhez a szervezethez még nincsenek üzleti folyamatok rögzítve."
      >
        <div className="grid gap-5">
          {processes.map((proc) => (
            <div key={proc.id} className="rounded-2xl border border-stone-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    {proc.category} {proc.organizationGroupName ? `· ${proc.organizationGroupName}` : ''}
                  </span>
                  <h3 className="text-lg font-semibold text-stone-950">{proc.name}</h3>
                </div>
                <div className="flex gap-2">
                  <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-700">
                    Gyakoriság: {proc.frequency}
                  </span>
                  <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-700">
                    Kritikusság: {proc.criticality}
                  </span>
                </div>
              </div>

              {proc.steps.length > 0 ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Folyamat lépései
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {proc.steps.map((step) => (
                      <div
                        key={step.id}
                        className="flex flex-col justify-between rounded-xl border border-stone-100 bg-stone-50/70 p-3 text-sm"
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs text-stone-500">
                            <span>{step.position}. lépés</span>
                            {step.isApproval ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                                Jóváhagyás
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 font-medium text-stone-900">{step.name}</p>
                        </div>
                        {step.systemName ? (
                          <p className="mt-2 text-xs text-stone-600">
                            Rendszer: <span className="font-semibold">{step.systemName}</span>
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      {/* Section 6: Mit értünk el? (Outcomes) */}
      <Section
        kicker="Eredmények"
        title="Mit értünk el?"
        empty={!measuredOutcomes.length && !estimatedOutcomes.length}
        emptyText="Jelenleg nincs lezárt mérési eredmény rögzítve."
      >
        {measuredOutcomes.length > 0 ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
              Mért eredmények
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {measuredOutcomes.map((item) => (
                <div key={item.id} className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                    {item.basisLabel}
                  </span>
                  {item.initiativeTitle ? (
                    <p className="mt-2 text-xs text-stone-500">Kezdeményezés: {item.initiativeTitle}</p>
                  ) : null}
                  {item.processName ? (
                    <p className="mt-1 text-xs text-stone-500">Érintett folyamat: {item.processName}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {estimatedOutcomes.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-600">
              Számított / becsült kapacitás és hatások
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {estimatedOutcomes.map((item) => (
                <div key={item.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <span className="rounded-full bg-stone-200 px-2.5 py-0.5 text-xs font-semibold text-stone-700">
                    {item.basisLabel}
                  </span>
                  {item.initiativeTitle ? (
                    <p className="mt-2 text-xs text-stone-500">Kezdeményezés: {item.initiativeTitle}</p>
                  ) : null}
                  {item.processName ? (
                    <p className="mt-1 text-xs text-stone-500">Érintett folyamat: {item.processName}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
