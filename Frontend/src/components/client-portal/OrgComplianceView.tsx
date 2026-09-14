"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getPortalCompliance,
  answerPortalCompanyProfileQuestion,
  portalDownloadUrl,
  type PortalComplianceReadModel,
  type PortalComplianceTopic,
  type PortalComplianceMissingInfo,
  type PortalComplianceDocument,
} from "@/lib/clientPortalApi";
import { clientSafeError } from "@/lib/clientInteractionApi";
import { formatDate } from "./MatterWorkspace";

const card = "min-w-0 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm";
const compactState = "min-w-0 rounded-2xl border border-stone-200 bg-white px-4 py-3";
const inputClass =
  "w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-[#b95e4b] focus:outline-none focus:ring-2 focus:ring-[#b95e4b]/25 disabled:bg-stone-50 disabled:text-stone-500";

function statusTone(state: PortalComplianceTopic["state"]) {
  switch (state) {
    case "REVIEW_RECOMMENDED":
    case "MORE_INFORMATION_NEEDED":
      return {
        label: "Teendőt igényel",
        badgeClass: "bg-[#fbeae6] text-[#8a4536] border-[#e3b7ab]",
      };
    case "LAWYER_REVIEW_REQUIRED":
      return {
        label: "Ügyvédi vizsgálat alatt",
        badgeClass: "bg-[#f3ead2] text-[#6f5514] border-[#d7c48a]",
      };
    case "ACTION_IN_PROGRESS":
      return {
        label: "Folyamatban",
        badgeClass: "bg-[#f7f1e2] text-[#7a5f18] border-[#d7c48a]",
      };
    case "RESOLVED":
      return {
        label: "Jelenleg nincs Öntől várt teendő",
        badgeClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
      };
    default:
      return {
        label: "Vizsgálat alatt",
        badgeClass: "bg-stone-100 text-stone-800 border-stone-300",
      };
  }
}

function TopicDocuments({ documents }: { documents: PortalComplianceDocument[] }) {
  if (documents.length === 0) return null;
  return (
    <div className="mt-4 border-t border-stone-100 pt-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Közzétett dokumentumok</p>
      <ul className="mt-2 space-y-2">
        {documents.map((doc) => (
          <li key={doc.publicationId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white p-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-stone-800">{doc.title}</p>
              <p className="mt-0.5 text-xs text-stone-500">
                {doc.versionLabel}
                {doc.publishedAt ? ` · Közzétéve: ${formatDate(doc.publishedAt)}` : ""}
              </p>
            </div>
            {doc.downloadAvailable ? (
              <a
                href={portalDownloadUrl(doc.publicationId)}
                className="rounded-full border border-[#b95e4b] px-3 py-1 text-xs font-semibold text-[#b95e4b] hover:bg-[#fbeae6]"
              >
                Letöltés
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OrgComplianceView() {
  const [data, setData] = useState<PortalComplianceReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline answering state for portal-answerable missing info
  const [activeQuestionKey, setActiveQuestionKey] = useState<string | null>(null);
  const [answerInput, setAnswerInput] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPortalCompliance();
      setData(res);
    } catch (e) {
      setError(clientSafeError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const topics = useMemo(() => data?.topics || [], [data]);

  // 1. TEENDŐT IGÉNYEL
  const attentionTopics = useMemo(
    () =>
      topics.filter(
        (t) =>
          t.state === "MORE_INFORMATION_NEEDED" ||
          t.state === "REVIEW_RECOMMENDED" ||
          t.missingInformation.length > 0,
      ),
    [topics],
  );

  // 2. FOLYAMATBAN
  const inProgressTopics = useMemo(
    () =>
      topics.filter(
        (t) =>
          t.state === "ACTION_IN_PROGRESS" ||
          t.state === "LAWYER_REVIEW_REQUIRED",
      ),
    [topics],
  );

  // 3. JELENLEG NINCS ÖNTŐL VÁRT TEENDŐ
  const resolvedTopics = useMemo(
    () =>
      topics.filter(
        (t) =>
          t.state === "RESOLVED" &&
          t.missingInformation.length === 0,
      ),
    [topics],
  );

  const handleSaveAnswer = async (info: PortalComplianceMissingInfo) => {
    if (!info.questionKey) return;
    const trimmed = answerInput.trim();
    if (info.valueType !== "BOOLEAN" && !trimmed) return;
    setSaving(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const payload = info.valueType === "BOOLEAN"
        ? (answerInput === "true" || answerInput === "false"
          ? { status: "ANSWERED" as const, booleanValue: answerInput === "true" }
          : null)
        : info.valueType === "NUMBER"
          ? (() => {
            const numberValue = Number(trimmed);
            if (!Number.isFinite(numberValue) || (info.integerOnly && !Number.isInteger(numberValue))) return null;
            return { status: "ANSWERED" as const, numberValue };
          })()
          : info.valueType === "ENUM"
            ? (info.options?.includes(trimmed) ? { status: "ANSWERED" as const, enumValue: trimmed } : null)
            : info.valueType === "DATE"
              ? { status: "ANSWERED" as const, dateValue: trimmed }
              : { status: "ANSWERED" as const, stringValue: trimmed };
      if (!payload) return;
      await answerPortalCompanyProfileQuestion(info.questionKey, payload);
      setActionSuccess("Adat sikeresen rögzítve.");
      setActiveQuestionKey(null);
      setAnswerInput("");
      await load();
    } catch (err) {
      setActionError(clientSafeError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleMarkUnknown = async (questionKey: string) => {
    setSaving(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await answerPortalCompanyProfileQuestion(questionKey, {
        status: "UNKNOWN",
      });
      setActionSuccess("Jelezve az iroda felé, hogy az adat nem ismert.");
      setActiveQuestionKey(null);
      setAnswerInput("");
      await load();
    } catch (err) {
      setActionError(clientSafeError(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <section className={card}>Megfelelési áttekintés betöltése…</section>;
  if (error) return <section className={card}>{error}</section>;

  return (
    <div className="space-y-6" data-testid="org-compliance-view">
      {/* Kicker & Title */}
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9b7b25]">
              Megfelelés és Szabályozási Háttér
            </p>
            <h1 className="mt-1 font-serif text-3xl font-semibold text-stone-950">
              Megfelelési áttekintés
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              A megfelelési státusz a rendelkezésre álló és igazolt vállalati tények, rögzített dokumentumok,
              valamint az ügyvédi iroda által lefolytatott jogi elemzések alapján kerül kimutatásra.
              A rendszer nem használ szintetikus vagy feltételezett megfelelési pontszámokat.
            </p>
          </div>
          <Link
            href="/portal/vallalat"
            className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
          >
            Vállalati profil megnyitása →
          </Link>
        </div>

        {actionSuccess ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {actionSuccess}
          </div>
        ) : null}
      </section>

      {/* 1. Szekció: TEENDŐT IGÉNYEL */}
      <section className={card}>
        <div className="flex items-center justify-between">
          <div>
            <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-900">
              Teendőt igényel
            </span>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-stone-950">
              Azonnali figyelmet és adatot igénylő témák
            </h2>
          </div>
          <span className="text-sm font-semibold text-stone-600">
            {attentionTopics.length} tétel
          </span>
        </div>

        {attentionTopics.length === 0 ? (
          <div className={`${compactState} mt-4 text-sm text-stone-500`}>
            Jelenleg nincs Önre váró vagy adatpótlásra szoruló megfelelési teendő.
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {attentionTopics.map((topic) => {
              const tone = statusTone(topic.state);
              return (
                <div
                  key={topic.topicId}
                  className="rounded-2xl border border-amber-200 bg-[#fffdf8] p-5 shadow-xs transition hover:border-amber-400"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-stone-950">{topic.topicLabel}</h3>
                      <p className="mt-1 text-sm text-stone-700">{topic.shortExplanation}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone.badgeClass}`}>
                      {tone.label}
                    </span>
                  </div>

                  {topic.nextAction ? (
                    <div className="mt-3 rounded-xl bg-amber-50/80 p-3 text-xs text-amber-950">
                      <strong>Következő javasolt lépés:</strong> {topic.nextAction}
                    </div>
                  ) : null}

                  {topic.missingInformation.length > 0 ? (
                    <div className="mt-4 border-t border-amber-100 pt-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-900">
                        Szükséges adatok / hiánypótlás:
                      </p>
                      <ul className="mt-2 space-y-2">
                        {topic.missingInformation.map((info, idx) => (
                          <li
                            key={idx}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 text-sm border border-stone-200"
                          >
                            <span className="font-medium text-stone-800">{info.label}</span>
                            {info.portalAnswerable && info.questionKey ? (
                              activeQuestionKey === info.questionKey ? (
                                <div className="mt-2 w-full space-y-2">
                                  {info.valueType === "BOOLEAN" ? (
                                    <select
                                      className={inputClass}
                                      value={answerInput}
                                      onChange={(e) => setAnswerInput(e.target.value)}
                                      disabled={saving}
                                    >
                                      <option value="">Válasszon</option>
                                      <option value="true">Igen</option>
                                      <option value="false">Nem</option>
                                    </select>
                                  ) : info.valueType === "ENUM" ? (
                                    <select
                                      className={inputClass}
                                      value={answerInput}
                                      onChange={(e) => setAnswerInput(e.target.value)}
                                      disabled={saving}
                                    >
                                      <option value="">Válasszon</option>
                                      {(info.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                                    </select>
                                  ) : (
                                    <input
                                      type={info.valueType === "NUMBER" ? "number" : info.valueType === "DATE" ? "date" : "text"}
                                      step={info.valueType === "NUMBER" ? (info.integerOnly ? 1 : "any") : undefined}
                                      className={inputClass}
                                      placeholder="Érték megadása..."
                                      value={answerInput}
                                      onChange={(e) => setAnswerInput(e.target.value)}
                                      disabled={saving}
                                    />
                                  )}
                                  {actionError ? (
                                    <p className="text-xs text-rose-600">{actionError}</p>
                                  ) : null}
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleSaveAnswer(info)}
                                      disabled={saving || !answerInput.trim()}
                                      className="rounded-lg bg-[#b95e4b] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#a54f3f] disabled:opacity-50"
                                    >
                                      {saving ? "Mentés…" : "Mentés"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleMarkUnknown(info.questionKey!)}
                                      disabled={saving}
                                      className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                                    >
                                      Nem ismertként jelölés
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveQuestionKey(null);
                                        setAnswerInput("");
                                        setActionError(null);
                                      }}
                                      className="text-xs text-stone-500 hover:underline"
                                    >
                                      Mégse
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveQuestionKey(info.questionKey!);
                                    setAnswerInput("");
                                    setActionError(null);
                                  }}
                                  className="rounded-lg bg-[#9b7b25] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#83671f]"
                                >
                                  Adat megadása →
                                </button>
                              )
                            ) : (
                              <span className="text-xs text-stone-500">Irodai egyeztetés szükséges</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <TopicDocuments documents={topic.documents} />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. Szekció: FOLYAMATBAN */}
      <section className={card}>
        <div className="flex items-center justify-between">
          <div>
            <span className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-900">
              Folyamatban
            </span>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-stone-950">
              Ügyvédi intézkedés vagy felülvizsgálat alatt álló területek
            </h2>
          </div>
          <span className="text-sm font-semibold text-stone-600">
            {inProgressTopics.length} tétel
          </span>
        </div>

        {inProgressTopics.length === 0 ? (
          <div className={`${compactState} mt-4 text-sm text-stone-500`}>
            Jelenleg nincs folyamatban lévő intézkedés vagy felülvizsgálat.
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {inProgressTopics.map((topic) => {
              const tone = statusTone(topic.state);
              return (
                <div
                  key={topic.topicId}
                  className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-stone-950">{topic.topicLabel}</h3>
                      <p className="mt-1 text-sm text-stone-700">{topic.shortExplanation}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone.badgeClass}`}>
                      {tone.label}
                    </span>
                  </div>
                  {topic.nextAction ? (
                    <div className="mt-3 rounded-xl bg-stone-50 p-3 text-xs text-stone-700">
                      <strong>Következő lépés:</strong> {topic.nextAction}
                    </div>
                  ) : null}
                  <TopicDocuments documents={topic.documents} />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. Szekció: JELENLEG NINCS ÖNTŐL VÁRT TEENDŐ */}
      <section className={card}>
        <div className="flex items-center justify-between">
          <div>
            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900">
              Jelenleg nincs Öntől várt teendő
            </span>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-stone-950">
              Rendezett és áttekintett megfelelési témák
            </h2>
          </div>
          <span className="text-sm font-semibold text-stone-600">
            {resolvedTopics.length} tétel
          </span>
        </div>

        <p className="mt-2 text-xs text-stone-500">
          A zöld jelölés azt igazolja, hogy a rendelkezésre álló tények és dokumentumok alapján az adott témában jelenleg
          nincs nyitott cselekvési pont. Nem jelent felelősségkizáró abszolút garanciát vagy 100%-os minősítést.
        </p>

        {resolvedTopics.length === 0 ? (
          <div className={`${compactState} mt-4 text-sm text-stone-500`}>
            A témakörök felülvizsgálata vagy adatbekérése folyamatban van.
          </div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {resolvedTopics.map((topic) => (
              <div
                key={topic.topicId}
                className="rounded-2xl border border-emerald-100 bg-[#f9fdfa] p-4 text-sm"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-stone-900">{topic.topicLabel}</h4>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                    Rendezett
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-stone-600">{topic.shortExplanation}</p>
                <TopicDocuments documents={topic.documents} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4. Szekció: MI ALAPJÁN? ÉS IGAZOLÁSI DOKTRÍNA */}
      <section className="rounded-3xl border border-stone-200 bg-stone-50 p-6 text-stone-800">
        <h3 className="font-serif text-xl font-semibold text-stone-950">
          Mi alapján történik a megfelelőség megállapítása?
        </h3>
        <p className="mt-2 text-sm leading-6 text-stone-700">
          Az Adminiculum a jogi és megfelelési állapotot kizárólag ellenőrizhető tényekre alapozza:
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 shadow-xs">
            <p className="font-semibold text-stone-950 text-sm">1. Rögzített tények</p>
            <p className="mt-1 text-xs text-stone-600">
              A vállalat profiljában megadott strukturált adatok (pl. létszám, tevékenységek, rendszerek).
            </p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-xs">
            <p className="font-semibold text-stone-950 text-sm">2. Dokumentumok</p>
            <p className="mt-1 text-xs text-stone-600">
              Érvényes belső szabályzatok, szerződések, adatkezelési tájékoztatók és jegyzőkönyvek megléte.
            </p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-xs">
            <p className="font-semibold text-stone-950 text-sm">3. Ügyvédi vizsgálat</p>
            <p className="mt-1 text-xs text-stone-600">
              A jogi szakértők által elvégzett átvilágítási megállapítások és jóváhagyott lépések.
            </p>
          </div>
        </div>
        <p className="mt-4 text-xs text-stone-500">
          Kérdése van a megállapításokkal kapcsolatban? Forduljon bizalommal az eljáró ügyvédhez a portál üzenetküldő felületén.
        </p>
      </section>
    </div>
  );
}
