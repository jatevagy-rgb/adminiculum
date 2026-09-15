"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getPortalCompliance,
  answerPortalCompanyProfileQuestion,
  getPortalCompanyProfileDiscovery,
  portalDownloadUrl,
  type PortalComplianceReadModel,
  type PortalComplianceTopic,
  type PortalComplianceMissingInfo,
  type PortalComplianceDocument,
  type PortalComplianceControlSummary,
} from "@/lib/clientPortalApi";
import { clientSafeError } from "@/lib/clientInteractionApi";
import { companyProfileCompletion } from "@/lib/companyProfileCompletion";
import { formatDate } from "./MatterWorkspace";

const card = "min-w-0 rounded-3xl border border-[#eadfbf] bg-white p-5 shadow-sm sm:p-6";
const inputClass =
  "w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-[#b95e4b] focus:outline-none focus:ring-2 focus:ring-[#b95e4b]/25 disabled:bg-stone-50 disabled:text-stone-500";

type ComplianceBucket = "CUSTOMER_ACTION" | "IN_PROGRESS" | "LAWYER_REVIEW" | "NO_ACTION";

const bucketLabels: Record<ComplianceBucket, string> = {
  CUSTOMER_ACTION: "Teendő tőletek",
  IN_PROGRESS: "Folyamatban",
  LAWYER_REVIEW: "Ügyvédi vizsgálat",
  NO_ACTION: "Nincs jelenlegi teendő",
};

const bucketBadge: Record<ComplianceBucket, string> = {
  CUSTOMER_ACTION: "bg-[#fbeae6] text-[#8a4536] border-[#e3b7ab]",
  IN_PROGRESS: "bg-[#f7f1e2] text-[#7a5f18] border-[#d7c48a]",
  LAWYER_REVIEW: "bg-[#f3ead2] text-[#6f5514] border-[#d7c48a]",
  NO_ACTION: "bg-emerald-100 text-emerald-900 border-emerald-300",
};

/**
 * Assigns each topic to exactly one bucket so the summary tiles never
 * double-count. Precedence preserves the current canonical treatment
 * (lawyer review and in-progress are their own states; review-recommended and
 * portal-answerable missing information remain customer attention).
 */
export function classifyTopic(topic: PortalComplianceTopic): ComplianceBucket {
  if (topic.state === "LAWYER_REVIEW_REQUIRED") return "LAWYER_REVIEW";
  if (topic.state === "ACTION_IN_PROGRESS") return "IN_PROGRESS";
  if (topic.state === "MORE_INFORMATION_NEEDED" || topic.state === "REVIEW_RECOMMENDED" || topic.missingInformation.length > 0) {
    return "CUSTOMER_ACTION";
  }
  if (topic.state === "RESOLVED" && topic.missingInformation.length === 0) return "NO_ACTION";
  return "CUSTOMER_ACTION";
}

/** Real counts derived only from the returned topic collection. */
export function summarizeTopics(topics: PortalComplianceTopic[]): Record<ComplianceBucket, number> {
  const counts: Record<ComplianceBucket, number> = { CUSTOMER_ACTION: 0, IN_PROGRESS: 0, LAWYER_REVIEW: 0, NO_ACTION: 0 };
  for (const topic of topics) counts[classifyTopic(topic)] += 1;
  return counts;
}

/** Local, frontend-only search + status filter over already loaded topics. */
export function filterTopics(
  topics: PortalComplianceTopic[],
  search: string,
  statusFilter: ComplianceBucket | "ALL",
): PortalComplianceTopic[] {
  const query = search.trim().toLowerCase();
  return topics.filter((topic) => {
    if (statusFilter !== "ALL" && classifyTopic(topic) !== statusFilter) return false;
    if (!query) return true;
    return `${topic.topicLabel} ${topic.shortExplanation}`.toLowerCase().includes(query);
  });
}

/**
 * Control/checkpoint progress from the already-returned client-safe
 * controlsSummary projection (matched by the topic's safe portal label).
 * Returns null when no authoritative projection exists for the topic.
 */
export function controlProgressFor(
  topic: PortalComplianceTopic,
  controlsSummary: PortalComplianceControlSummary[] | undefined,
): { done: number; total: number; nextReviewAt: string | null } | null {
  const entry = (controlsSummary ?? []).find((candidate) => candidate.requirementTitle === topic.topicLabel);
  if (!entry || entry.controls.length === 0) return null;
  const done = entry.controls.filter((control) => control.implementationStatus === "IMPLEMENTED").length;
  const nextReviewAt = entry.controls
    .map((control) => control.nextReviewAt)
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;
  return { done, total: entry.controls.length, nextReviewAt };
}

/**
 * After a successful inline company-profile answer BOTH the compliance read
 * model and the canonical company-profile discovery (completion) must refresh,
 * so the hero's X/Y count never goes stale. Extracted so the orchestration is
 * testable without a DOM harness, and deliberately narrow: it does not touch
 * any global loading/unmount state.
 */
export async function refreshAfterProfileAnswer(deps: {
  refreshCompliance: () => Promise<void>;
  refreshProfileCompletion: () => Promise<void>;
}): Promise<void> {
  await Promise.all([deps.refreshCompliance(), deps.refreshProfileCompletion()]);
}

function topicStateLabel(topic: PortalComplianceTopic): string {
  switch (topic.state) {
    case "LAWYER_REVIEW_REQUIRED":
      return "Ügyvédi vizsgálat alatt";
    case "ACTION_IN_PROGRESS":
      return "Folyamatban";
    case "MORE_INFORMATION_NEEDED":
    case "REVIEW_RECOMMENDED":
      return "Teendőt igényel";
    case "RESOLVED":
      return "Jelenleg nincs Öntől várt teendő";
    default:
      return "Vizsgálat alatt";
  }
}

type IconKind = "shield" | "megaphone" | "lock" | "helmet" | "bank" | "doc";

function iconKind(topicId: string): IconKind {
  const id = topicId.toLowerCase();
  if (id.includes("whistle")) return "megaphone";
  if (id.includes("nis2") || id.includes("cyber") || id.includes("security")) return "lock";
  if (id.includes("labor") || id.includes("safety") || id.includes("workplace") || id.includes("occupational")) return "helmet";
  if (id.includes("money") || id.includes("aml") || id.includes("laundering")) return "bank";
  if (id.includes("gdpr") || id.includes("data") || id.includes("privacy")) return "shield";
  return "doc";
}

function TopicGlyph({ kind }: { kind: IconKind }) {
  const cls = "h-5 w-5";
  const common = { className: cls, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "shield":
      return <svg {...common}><path d="M12 3l7 3v6c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6l7-3z" /></svg>;
    case "megaphone":
      return <svg {...common}><path d="M4 10v4h3l6 4V6L7 10H4z" /><path d="M17 9a4 4 0 0 1 0 6" /></svg>;
    case "lock":
      return <svg {...common}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
    case "helmet":
      return <svg {...common}><path d="M4 15a8 8 0 0 1 16 0" /><path d="M10 7h4v8h-4z" /><path d="M3 15h18" /></svg>;
    case "bank":
      return <svg {...common}><path d="M4 10h16M5 10V7l7-3 7 3v3M6 10v8m4-8v8m4-8v8m4-8v8M4 18h16" /></svg>;
    default:
      return <svg {...common}><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></svg>;
  }
}

function TopicDocuments({ documents }: { documents: PortalComplianceDocument[] }) {
  if (documents.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Közzétett dokumentumok</p>
      <ul className="mt-2 space-y-2">
        {documents.map((doc) => (
          <li key={doc.publicationId} className="rounded-xl border border-stone-200 bg-white p-3 text-sm">
            <p className="font-medium text-stone-800">{doc.title}</p>
            <p className="mt-0.5 text-xs text-stone-500">
              {doc.versionLabel}
              {doc.publishedAt ? ` · Közzétéve: ${formatDate(doc.publishedAt)}` : ""}
            </p>
            {doc.downloadAvailable ? (
              <a
                href={portalDownloadUrl(doc.publicationId)}
                className="mt-2 inline-block rounded-full border border-[#b95e4b] px-3 py-1 text-xs font-semibold text-[#b95e4b] hover:bg-[#fbeae6]"
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

function Tile({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-w-0 rounded-2xl border p-4 text-left transition ${
        active ? "border-[#b95e4b] bg-[#fff8f6] shadow-sm" : "border-[#eadfbf] bg-white hover:border-[#d9a396]"
      }`}
    >
      <span className="block text-2xl font-semibold text-stone-900">{count}</span>
      <span className="mt-1 block text-xs text-stone-600">{label}</span>
    </button>
  );
}

function Collapsible({ summary, children }: { summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="text-xs font-semibold text-[#8a4536] hover:underline"
      >
        {summary} {open ? "▾" : "▸"}
      </button>
      {open ? <div className="mt-2 text-sm text-stone-700">{children}</div> : null}
    </div>
  );
}

export function OrgComplianceView() {
  const [data, setData] = useState<PortalComplianceReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileCompletion, setProfileCompletion] = useState<{ answered: number; total: number } | null>(null);

  // Inline answering state for portal-answerable missing info
  const [activeQuestionKey, setActiveQuestionKey] = useState<string | null>(null);
  const [answerInput, setAnswerInput] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ComplianceBucket | "ALL">("ALL");

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const res = await getPortalCompliance();
      setData(res);
    } catch (e) {
      setError(clientSafeError(e));
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const discovery = await getPortalCompanyProfileDiscovery();
      // Canonical completion: only ANSWERED facts count (UNKNOWN does not), over
      // the facts reachable through the current adaptive screens.
      const progress = companyProfileCompletion(discovery.questions, discovery.screens);
      setProfileCompletion({ answered: progress.answered, total: progress.total });
    } catch {
      // Non-fatal: the profile card falls back to a plain link.
      setProfileCompletion(null);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadProfile();
  }, [load, loadProfile]);

  const topics = useMemo(() => data?.topics || [], [data]);

  const bucketFor = useMemo(() => {
    const map = new Map<string, ComplianceBucket>();
    for (const topic of topics) map.set(topic.topicId, classifyTopic(topic));
    return map;
  }, [topics]);

  const counts = useMemo(() => summarizeTopics(topics), [topics]);

  const visibleTopics = useMemo(() => filterTopics(topics, search, statusFilter), [topics, search, statusFilter]);

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
      await refreshAfterProfileAnswer({
        refreshCompliance: () => load({ silent: true }),
        refreshProfileCompletion: loadProfile,
      });
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
      await refreshAfterProfileAnswer({
        refreshCompliance: () => load({ silent: true }),
        refreshProfileCompletion: loadProfile,
      });
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
      {/* HERO */}
      <section className="min-w-0 rounded-3xl border border-[#eadfbf] bg-[#fffdf8] p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9b7b25]">Megfelelés és szabályozás</p>
            <h1 className="mt-2 font-serif text-3xl font-semibold text-stone-950 sm:text-4xl">Compliance térkép</h1>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Ez a térkép a vállalkozás érintett megfelelési területeit, a nyitott teendőket, az ügyvédi vizsgálat
              állapotát és az iroda által közzétett dokumentumokat mutatja. Az állapot kizárólag rögzített tények,
              dokumentumok és ügyvédi elemzés alapján kerül kimutatásra — nem tartalmaz szintetikus pontszámot.
            </p>
          </div>
          <div className="w-full max-w-xs rounded-2xl border border-[#eadfbf] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Vállalati profil</p>
            {profileCompletion && profileCompletion.total > 0 ? (
              <p className="mt-1 text-sm text-stone-800">
                <span className="text-lg font-semibold text-stone-900">{profileCompletion.answered}</span>
                {" / "}
                {profileCompletion.total} adat megadva
              </p>
            ) : (
              <p className="mt-1 text-sm text-stone-600">A megfelelési térkép a vállalati profil adataira épül.</p>
            )}
            <Link href="/portal/vallalat" className="mt-3 inline-block text-sm font-semibold text-[#8a4536] hover:underline">
              Vállalati profil megnyitása →
            </Link>
          </div>
        </div>

        {actionSuccess ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{actionSuccess}</div>
        ) : null}
      </section>

      {/* SUMMARY TILES */}
      <section className={card}>
        <h2 className="font-serif text-xl font-semibold text-stone-950">Áttekintés</h2>
        <p className="mt-1 text-xs text-stone-500">A csempék a feltárt megfelelési területek valós állapotát összegzik.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(["CUSTOMER_ACTION", "IN_PROGRESS", "LAWYER_REVIEW", "NO_ACTION"] as ComplianceBucket[]).map((bucket) => (
            <Tile
              key={bucket}
              label={bucketLabels[bucket]}
              count={counts[bucket]}
              active={statusFilter === bucket}
              onClick={() => setStatusFilter((current) => (current === bucket ? "ALL" : bucket))}
            />
          ))}
        </div>
      </section>

      {/* TOPIC LIST */}
      <section className={card}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl font-semibold text-stone-950">Megfelelési területek</h2>
            <p className="mt-1 text-xs text-stone-500">{visibleTopics.length} megjelenített terület</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <input
              type="search"
              className={`${inputClass} sm:w-64`}
              placeholder="Terület keresése…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select className={`${inputClass} sm:w-52`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ComplianceBucket | "ALL")}>
              <option value="ALL">Minden állapot</option>
              {(["CUSTOMER_ACTION", "IN_PROGRESS", "LAWYER_REVIEW", "NO_ACTION"] as ComplianceBucket[]).map((bucket) => (
                <option key={bucket} value={bucket}>{bucketLabels[bucket]}</option>
              ))}
            </select>
          </div>
        </div>

        {topics.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-500">
            Ehhez a vállalkozáshoz még nem készült megfelelési értékelés.
          </div>
        ) : visibleTopics.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-500">
            Nincs a keresésnek vagy a szűrőnek megfelelő terület.
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {visibleTopics.map((topic) => {
              const bucket = bucketFor.get(topic.topicId) ?? "CUSTOMER_ACTION";
              const progress = controlProgressFor(topic, data?.controlsSummary);
              return (
                <article key={topic.topicId} className="rounded-2xl border border-[#eadfbf] bg-white p-5 shadow-xs">
                  <div className="grid gap-5 lg:grid-cols-12">
                    {/* LEFT — what this area is */}
                    <div className="lg:col-span-4">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#eadfbf] bg-[#fffdf8] text-[#8a4536]">
                          <TopicGlyph kind={iconKind(topic.topicId)} />
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-lg font-semibold text-stone-950">{topic.topicLabel}</h3>
                          <p className="mt-1 text-sm text-stone-700">{topic.shortExplanation}</p>
                        </div>
                      </div>
                      <Collapsible summary="Részletek megnyitása">
                        <p>{topic.shortExplanation}</p>
                        {topic.nextAction ? <p className="mt-2"><strong>Következő lépés:</strong> {topic.nextAction}</p> : null}
                        {progress ? (
                          <p className="mt-2">
                            <strong>Implementált kontrollok:</strong> {progress.done} / {progress.total}
                            {progress.nextReviewAt ? ` · Következő felülvizsgálat: ${formatDate(progress.nextReviewAt)}` : ""}
                          </p>
                        ) : null}
                      </Collapsible>
                    </div>

                    {/* MIDDLE — current state / next step */}
                    <div className="lg:col-span-5">
                      <span className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${bucketBadge[bucket]}`}>
                        {topicStateLabel(topic)}
                      </span>

                      {progress ? (
                        <div className="mt-3 rounded-xl bg-[#fffdf8] p-3 text-xs text-stone-700">
                          Implementált kontrollok: <b>{progress.done} / {progress.total}</b>
                          {progress.nextReviewAt ? ` · Következő felülvizsgálat: ${formatDate(progress.nextReviewAt)}` : ""}
                        </div>
                      ) : null}

                      {topic.missingInformation.length > 0 ? (
                        <div className="mt-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Szükséges adatok Öntől</p>
                          <ul className="mt-2 space-y-2">
                            {topic.missingInformation.map((info, idx) => (
                              <li key={idx} className="rounded-xl border border-stone-200 bg-white p-3 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-medium text-stone-800">{info.label}</span>
                                  {info.portalAnswerable && info.questionKey ? (
                                    activeQuestionKey === info.questionKey ? null : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveQuestionKey(info.questionKey!);
                                          setAnswerInput("");
                                          setActionError(null);
                                        }}
                                        className="rounded-lg bg-[#b95e4b] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#a54f3f]"
                                      >
                                        Adat megadása →
                                      </button>
                                    )
                                  ) : (
                                    <span className="text-xs text-stone-500">Irodai egyeztetés szükséges</span>
                                  )}
                                </div>

                                {info.portalAnswerable && info.questionKey && activeQuestionKey === info.questionKey ? (
                                  <div className="mt-2 space-y-2">
                                    {info.valueType === "BOOLEAN" ? (
                                      <select className={inputClass} value={answerInput} onChange={(e) => setAnswerInput(e.target.value)} disabled={saving}>
                                        <option value="">Válasszon</option>
                                        <option value="true">Igen</option>
                                        <option value="false">Nem</option>
                                      </select>
                                    ) : info.valueType === "ENUM" ? (
                                      <select className={inputClass} value={answerInput} onChange={(e) => setAnswerInput(e.target.value)} disabled={saving}>
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
                                    {actionError ? <p className="text-xs text-rose-600">{actionError}</p> : null}
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
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {topic.nextAction ? (
                        <div className="mt-3 rounded-xl bg-[#fff8f6] p-3 text-xs text-[#8a4536]">
                          <strong>Következő lépés:</strong> {topic.nextAction}
                        </div>
                      ) : null}
                    </div>

                    {/* RIGHT — documents */}
                    <div className="lg:col-span-3">
                      <TopicDocuments documents={topic.documents} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* HOW THE MAP IS BUILT */}
      <section className="rounded-3xl border border-[#eadfbf] bg-[#fffdf8] p-6 text-stone-800">
        <h3 className="font-serif text-xl font-semibold text-stone-950">Hogyan készül a compliance térkép?</h3>
        <p className="mt-2 text-sm leading-6 text-stone-700">
          Az Adminiculum a jogi és megfelelési állapotot kizárólag ellenőrizhető tényekre alapozza:
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 shadow-xs">
            <p className="font-semibold text-stone-950 text-sm">1. Rögzített tények</p>
            <p className="mt-1 text-xs text-stone-600">A vállalat profiljában megadott strukturált adatok (pl. létszám, tevékenységek, rendszerek).</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-xs">
            <p className="font-semibold text-stone-950 text-sm">2. Dokumentumok</p>
            <p className="mt-1 text-xs text-stone-600">Érvényes belső szabályzatok, szerződések, adatkezelési tájékoztatók és jegyzőkönyvek megléte.</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-xs">
            <p className="font-semibold text-stone-950 text-sm">3. Ügyvédi vizsgálat</p>
            <p className="mt-1 text-xs text-stone-600">A jogi szakértők által elvégzett átvilágítási megállapítások és jóváhagyott lépések.</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-stone-500">
          A jelölések nem jelentenek felelősségkizáró abszolút garanciát vagy 100%-os minősítést. Kérdése van a
          megállapításokkal kapcsolatban? Forduljon bizalommal az eljáró ügyvédhez a portál üzenetküldő felületén.
        </p>
      </section>
    </div>
  );
}
