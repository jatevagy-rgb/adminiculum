"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getPortalOrgGrow,
  listPortalGrowSurveys,
  submitPortalGrowSurvey,
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
    } catch (err) {
      setError(clientSafeError(err));
    } finally {
      setLoading(false);
    }
  }, [loadSurveys]);

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

      {/* Section 1: Hol érdemes javítani? / Működési visszajelzés (Feltárás) */}
      <section className={card} data-testid="grow-feltaras-section">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a5f18]">Feltárás</p>
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

      {/* Section 2: Min dolgozunk? (Active Initiatives) */}
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

      {/* Section 3: Üzleti folyamatok és rendszerek (Process Visibility) */}
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

      {/* Section 4: Mit értünk el? (Outcomes) */}
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
