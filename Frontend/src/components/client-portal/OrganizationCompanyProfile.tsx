"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  answerPortalCompanyProfileEvidence,
  answerPortalCompanyProfileScreen,
  getPortalCompanyProfileDiscovery,
  getPortalCompanyProfileEvidence,
  getPortalCompanyProfileTeaor25Options,
  type PortalCompanyProfileAnswerPayload,
  type PortalCompanyProfileDiscovery,
  type PortalCompanyProfileEvidenceItem,
  type PortalCompanyProfileEvidenceJourney,
  type PortalCompanyProfileQuestion,
  type PortalCompanyProfileScreen,
  type PortalCompanyProfileReusableDocument,
} from "@/lib/clientPortalApi";
import { clientSafeError } from "@/lib/clientInteractionApi";
import { companyProfileCompletion } from "@/lib/companyProfileCompletion";

const card = "min-w-0 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm";
const inputClass =
  "w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-[#b95e4b] focus:outline-none focus:ring-2 focus:ring-[#b95e4b]/25 disabled:bg-stone-50 disabled:text-stone-500";
const chipBase = "rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50";
const chipOn = `${chipBase} bg-[#b95e4b] text-white`;
const chipOff = `${chipBase} border border-stone-300 text-stone-700 hover:bg-stone-50`;

const TEAOR_UNAVAILABLE =
  "Az ágazati besorolás jelenleg nem érhető el. A korábban megadott tevékenységi adat megmaradt.";

type DraftValue = {
  status: "ANSWERED" | "UNKNOWN";
  numberValue?: string;
  booleanValue?: boolean;
  stringValue?: string;
  enumValue?: string;
  jsonValue?: string[];
};

function valueToDraft(question: PortalCompanyProfileQuestion): DraftValue | undefined {
  if (question.status !== "ANSWERED" || question.value === null || question.value === undefined) return undefined;
  if (Array.isArray(question.value)) return { status: "ANSWERED", jsonValue: [...question.value] };
  if (question.valueType === "NUMBER" && typeof question.value === "number") return { status: "ANSWERED", numberValue: String(question.value) };
  if (question.valueType === "BOOLEAN" && typeof question.value === "boolean") return { status: "ANSWERED", booleanValue: question.value };
  if (question.valueType === "ENUM" || question.valueType === "JURISDICTION") return { status: "ANSWERED", enumValue: String(question.value) };
  return { status: "ANSWERED", stringValue: String(question.value) };
}

function draftToPayload(question: PortalCompanyProfileQuestion, draft: DraftValue): PortalCompanyProfileAnswerPayload | null {
  if (draft.status === "UNKNOWN") return { status: "UNKNOWN" };
  switch (question.valueType) {
    case "NUMBER": {
      const trimmed = (draft.numberValue ?? "").trim();
      if (!trimmed) return null;
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) return null;
      if (question.integerOnly && !Number.isInteger(parsed)) return null;
      return { status: "ANSWERED", numberValue: parsed };
    }
    case "BOOLEAN":
      return typeof draft.booleanValue === "boolean" ? { status: "ANSWERED", booleanValue: draft.booleanValue } : null;
    case "ENUM":
      return draft.enumValue ? { status: "ANSWERED", enumValue: draft.enumValue } : null;
    case "JURISDICTION": {
      const code = (draft.enumValue ?? "").trim();
      return code ? { status: "ANSWERED", enumValue: code.toUpperCase() } : null;
    }
    case "MULTI_ENUM": {
      const values = draft.jsonValue ?? [];
      return values.length ? { status: "ANSWERED", jsonValue: values } : null;
    }
    case "STRING": {
      const value = (draft.stringValue ?? "").trim();
      return value ? { status: "ANSWERED", stringValue: value } : null;
    }
    default:
      return null;
  }
}

// Customer-safe human label. The technical question key is never a display value.
function questionLabel(question: PortalCompanyProfileQuestion): string {
  return question.label?.trim() || "Szervezeti adat";
}

function draftLabel(question: PortalCompanyProfileQuestion, draft: DraftValue | undefined) {
  if (!draft) return "";
  if (draft.status === "UNKNOWN") return "Nem ismertként jelölve";
  const payload = draftToPayload(question, draft);
  if (!payload) return "Nincs megadva";
  if (payload.jsonValue) return payload.jsonValue.join(", ");
  if (typeof payload.numberValue === "number") return String(payload.numberValue);
  if (typeof payload.booleanValue === "boolean") return payload.booleanValue ? "Igen" : "Nem";
  return String(payload.enumValue ?? payload.stringValue ?? "");
}

// Resolve the next screen index after an adaptive discovery refresh. Prefer the
// previously-computed "next" screen key; if it disappeared because answers
// changed visibility, advance to the screen after the current one; if the
// current one also disappeared, fall back to a clamped position.
function resolveAdvanceIndex(
  screens: PortalCompanyProfileScreen[],
  currentKey: string,
  nextKey: string | null,
  fallbackIndex: number,
): number {
  const clamp = (index: number) => Math.min(Math.max(0, index), Math.max(0, screens.length - 1));
  if (nextKey) {
    const index = screens.findIndex((screen) => screen.screenKey === nextKey);
    if (index >= 0) return index;
  }
  const currentIndex = screens.findIndex((screen) => screen.screenKey === currentKey);
  if (currentIndex >= 0) return clamp(currentIndex + 1);
  return clamp(fallbackIndex);
}

export function OrganizationCompanyProfile({ onProfileUpdated }: { onProfileUpdated?: () => void | Promise<void> }) {
  const [discovery, setDiscovery] = useState<PortalCompanyProfileDiscovery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, DraftValue>>({});
  const [teaorLabels, setTeaorLabels] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<PortalCompanyProfileEvidenceJourney | null>(null);
  // Progressive disclosure: the full topic list and the follow-up evidence
  // journey stay collapsed until the customer asks for them, so the landing
  // surface shows one focused question group instead of every control at once.
  const [topicListOpen, setTopicListOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [openEvidenceKey, setOpenEvidenceKey] = useState<string | null>(null);

  const refreshDiscovery = useCallback(async () => {
    const result = await getPortalCompanyProfileDiscovery();
    setDiscovery(result);
    return result;
  }, []);

  const refreshEvidence = useCallback(async () => {
    try {
      setEvidence(await getPortalCompanyProfileEvidence());
    } catch {
      setEvidence(null);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshDiscovery();
      await refreshEvidence();
    } catch (err) {
      setError(clientSafeError(err));
    } finally {
      setLoading(false);
    }
  }, [refreshDiscovery, refreshEvidence]);

  useEffect(() => {
    void load();
  }, [load]);

  const questions = useMemo(() => discovery?.questions ?? [], [discovery]);
  const screens = useMemo(() => discovery?.screens ?? [], [discovery]);
  const teaorInstalled = discovery?.capabilities.teaor25CatalogInstalled ?? false;

  const atomsByKey = useMemo(() => {
    const index = new Map<string, PortalCompanyProfileQuestion>();
    for (const question of questions) index.set(question.questionKey, question);
    return index;
  }, [questions]);

  // Completion denominator = facts reachable through the current adaptive screens
  // (not the raw discovery.questions list, which can include hidden facts).
  const progress = useMemo(() => companyProfileCompletion(questions, screens), [questions, screens]);

  const activeScreen: PortalCompanyProfileScreen | undefined = screens[activeIndex];

  const activeAtoms = useMemo(() => {
    if (!activeScreen) return [] as PortalCompanyProfileQuestion[];
    return activeScreen.factBindings
      .map((factKey) => atomsByKey.get(factKey))
      .filter((atom): atom is PortalCompanyProfileQuestion => Boolean(atom));
  }, [activeScreen, atomsByKey]);

  // Grouped, labelled topic navigator. Every currently reachable screen is kept
  // as a selectable topic; only the presentation is collapsed. Counts reflect
  // persisted answers (discovery), never in-flight drafts.
  const topicGroups = useMemo(() => {
    const groups: Array<{
      sectionTitle: string;
      topics: Array<{ screen: PortalCompanyProfileScreen; index: number; answered: number; total: number }>;
    }> = [];
    screens.forEach((screen, index) => {
      const boundKeys = screen.factBindings.filter((factKey) => atomsByKey.has(factKey));
      const answered = boundKeys.filter((factKey) => atomsByKey.get(factKey)?.status === "ANSWERED").length;
      const topic = { screen, index, answered, total: boundKeys.length };
      const existing = groups.find((group) => group.sectionTitle === screen.sectionTitleHu);
      if (existing) existing.topics.push(topic);
      else groups.push({ sectionTitle: screen.sectionTitleHu, topics: [topic] });
    });
    return groups;
  }, [screens, atomsByKey]);

  const applicableEvidence = useMemo(
    () => (evidence?.items ?? []).filter((item) => item.relevance === "APPLIES"),
    [evidence],
  );

  const hasTeaorAtom = activeAtoms.some((atom) => atom.codeCatalog === "TEAOR25");

  // Seed drafts from persisted answers, and resolve TEÁOR labels for stored codes.
  useEffect(() => {
    if (!activeScreen) return;
    setDrafts((previous) => {
      const next = { ...previous };
      for (const atom of activeAtoms) {
        if (next[atom.questionKey]) continue;
        const seeded = valueToDraft(atom);
        if (seeded) next[atom.questionKey] = seeded;
      }
      return next;
    });
    for (const atom of activeAtoms) {
      if (atom.codeCatalog !== "TEAOR25") continue;
      const draft = drafts[atom.questionKey];
      const codes = draft?.jsonValue ?? (draft?.stringValue ? [draft.stringValue] : []);
      for (const code of codes) {
        if (teaorLabels[code]) continue;
        void getPortalCompanyProfileTeaor25Options(code)
          .then((result) => {
            const match = result.options.find((option) => option.code === code);
            if (match) setTeaorLabels((labels) => ({ ...labels, [match.code]: match.labelHu }));
          })
          .catch(() => undefined);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScreen?.screenKey]);

  const setDraft = (questionKey: string, draft: DraftValue) => {
    setActionError(null);
    setSuccessMessage(null);
    setDrafts((previous) => ({ ...previous, [questionKey]: draft }));
  };

  const clearDraft = (questionKey: string) => {
    setDrafts((previous) => {
      const next = { ...previous };
      delete next[questionKey];
      return next;
    });
  };

  const toggleMultiValue = (question: PortalCompanyProfileQuestion, value: string) => {
    const current = drafts[question.questionKey]?.jsonValue ?? [];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    setDraft(question.questionKey, { status: "ANSWERED", jsonValue: next });
  };

  const selectTopic = (index: number) => {
    setActiveIndex(index);
    setTopicListOpen(false);
  };

  const saveActiveScreen = async (advance: boolean) => {
    if (!activeScreen) return;
    const currentKey = activeScreen.screenKey;
    const nextKey = screens[activeIndex + 1]?.screenKey ?? null;
    setActionError(null);
    setSuccessMessage(null);
    setRefreshWarning(null);
    const facts: Record<string, PortalCompanyProfileAnswerPayload> = {};
    for (const atom of activeAtoms) {
      const draft = drafts[atom.questionKey];
      if (!draft) continue;
      const payload = draftToPayload(atom, draft);
      if (!payload) {
        setActionError(`Hiányos vagy érvénytelen válasz: ${questionLabel(atom)}.`);
        return;
      }
      facts[atom.questionKey] = payload;
    }
    if (Object.keys(facts).length === 0) {
      if (advance) setActiveIndex(resolveAdvanceIndex(screens, currentKey, nextKey, activeIndex));
      return;
    }
    setSaving(true);
    let saved = false;
    try {
      await answerPortalCompanyProfileScreen(activeScreen.screenKey, facts);
      saved = true;
      const refreshed = await refreshDiscovery();
      await refreshEvidence();
      await onProfileUpdated?.();
      setSuccessMessage("A válaszokat elmentettük.");
      if (advance) setActiveIndex(resolveAdvanceIndex(refreshed?.screens ?? screens, currentKey, nextKey, activeIndex));
    } catch (err) {
      if (saved) setRefreshWarning("A mentés megtörtént, de a frissítés nem sikerült. Kérjük, töltse újra az oldalt.");
      else setActionError(clientSafeError(err));
    } finally {
      setSaving(false);
    }
  };

  const markUnknown = async (question: PortalCompanyProfileQuestion) => {
    setActionError(null);
    setSuccessMessage(null);
    setSaving(true);
    try {
      await answerPortalCompanyProfileScreen(activeScreen?.screenKey ?? "", { [question.questionKey]: { status: "UNKNOWN" } });
      setDraft(question.questionKey, { status: "UNKNOWN" });
      await refreshDiscovery();
    } catch (err) {
      setActionError(clientSafeError(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <section className={card}>Vállalati profil betöltése…</section>;
  if (error) return <section className={card}>{error}</section>;

  return (
    <section className={card} data-testid="organization-company-profile">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9b7b25]">Profiladatok</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-950">Vállalati profil</h2>
          <p className="mt-2 text-sm text-stone-600">
            Segítsen pontosítani, milyen szabályok érintik a vállalkozását.
          </p>
          <p className="mt-2 max-w-xl text-xs leading-5 text-stone-500">
            Itt az Ön által megadott profiladatokat rögzítjük. A közzétett vállalati áttekintést ettől elkülönülten az
            iroda állítja össze.
          </p>
        </div>
        <div className="w-full rounded-2xl border border-[#eadfbf] bg-[#fffdf8] px-4 py-3 sm:w-auto">
          <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">Profiladat-kitöltöttség</span>
          <p className="text-lg font-semibold text-stone-900">
            {progress.answered} / {progress.total}
          </p>
          <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-stone-200">
            <div className="h-full bg-[#b95e4b]" style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="mt-2 max-w-[16rem] text-[11px] leading-4 text-stone-500">
            A megadott profiladatok arányát mutatja. Nem jogi megfelelőségi minősítés.
          </p>
        </div>
      </div>

      {successMessage ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">{successMessage}</div> : null}
      {refreshWarning ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">{refreshWarning}</div> : null}
      {actionError ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">{actionError}</div> : null}

      {screens.length === 0 || !activeScreen ? (
        <p className="mt-6 text-sm text-stone-600">A jelenlegi adatok alapján nincs további tisztázandó kérdés.</p>
      ) : (
        <div className="mt-6">
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 text-sm font-semibold text-stone-800">
                <span className="text-stone-500">{activeIndex + 1} / {screens.length} · </span>
                {activeScreen.sectionTitleHu}
              </p>
              <button
                type="button"
                onClick={() => setTopicListOpen((open) => !open)}
                aria-expanded={topicListOpen}
                className="rounded-full border border-stone-300 px-3 py-1 text-xs font-semibold text-stone-700 hover:bg-white"
              >
                {topicListOpen ? "Témakörlista bezárása" : "Témakörlista"}
              </button>
            </div>
            {topicListOpen ? (
              <div className="mt-3 space-y-3" data-testid="company-profile-topics">
                {topicGroups.map((group) => (
                  <div key={group.sectionTitle}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">{group.sectionTitle}</p>
                    <div className="mt-1 space-y-1">
                      {group.topics.map((topic) => {
                        const isActive = topic.index === activeIndex;
                        return (
                          <button
                            key={topic.screen.screenKey}
                            type="button"
                            data-testid="company-profile-topic"
                            onClick={() => selectTopic(topic.index)}
                            aria-current={isActive ? "step" : undefined}
                            className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm ${
                              isActive ? "border-[#b95e4b] bg-white font-semibold text-stone-950" : "border-stone-200 bg-white text-stone-800 hover:border-[#d3a08f]"
                            }`}
                          >
                            <span className="min-w-0">{topic.screen.titleHu}</span>
                            <span className="shrink-0 text-xs font-normal text-stone-500">
                              {topic.answered} / {topic.total} adat megadva
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-3 rounded-2xl border border-[#eadfbf] bg-white p-4" data-testid="company-profile-screen">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">{activeScreen.sectionTitleHu}</p>
            <h3 className="mt-1 font-semibold text-stone-950">{activeScreen.titleHu}</h3>
            <p className="mt-1 text-sm text-stone-700">{activeScreen.helpTextHu}</p>
            {activeScreen.whyHu ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-stone-500 hover:text-stone-700">Miért kérdezzük?</summary>
                <p className="mt-1 text-xs text-stone-500">{activeScreen.whyHu}</p>
              </details>
            ) : null}
            {hasTeaorAtom && !teaorInstalled ? (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{TEAOR_UNAVAILABLE}</p>
            ) : null}

            <div className="mt-4 space-y-5">
              {activeAtoms.map((atom) => {
                const draft = drafts[atom.questionKey];
                const isTeaor = atom.codeCatalog === "TEAOR25";
                return (
                  <div key={atom.questionKey} data-testid="company-profile-question" className="border-t border-stone-100 pt-3">
                    <label className="block text-sm font-semibold text-stone-900">{questionLabel(atom)}</label>
                    {atom.helpText ? <p className="mt-1 text-xs text-stone-500">{atom.helpText}</p> : null}

                    <div className="mt-2">
                      {isTeaor && !teaorInstalled ? (
                        <p className="rounded-xl bg-stone-50 p-3 text-xs text-stone-600">A korábban rögzített tevékenységi besorolás megmaradt.</p>
                      ) : isTeaor ? (
                        <TeaorSelector
                          multi={atom.valueType === "MULTI_ENUM"}
                          selected={atom.valueType === "MULTI_ENUM" ? draft?.jsonValue ?? [] : draft?.stringValue ? [draft.stringValue] : []}
                          labels={teaorLabels}
                          disabled={saving}
                          onSelect={(option) => {
                            setTeaorLabels((labels) => ({ ...labels, [option.code]: option.labelHu }));
                            if (atom.valueType === "MULTI_ENUM") toggleMultiValue(atom, option.code);
                            else setDraft(atom.questionKey, { status: "ANSWERED", stringValue: option.code });
                          }}
                          onRemove={(code) => {
                            if (atom.valueType === "MULTI_ENUM") toggleMultiValue(atom, code);
                            else clearDraft(atom.questionKey);
                          }}
                        />
                      ) : atom.valueType === "BOOLEAN" ? (
                        <select
                          className={inputClass}
                          value={typeof draft?.booleanValue === "boolean" ? String(draft.booleanValue) : ""}
                          onChange={(event) => setDraft(atom.questionKey, { status: "ANSWERED", booleanValue: event.target.value === "true" })}
                          disabled={saving}
                        >
                          <option value="">Válasszon</option>
                          <option value="true">Igen</option>
                          <option value="false">Nem</option>
                        </select>
                      ) : atom.valueType === "ENUM" ? (
                        <select
                          className={inputClass}
                          value={draft?.enumValue ?? ""}
                          onChange={(event) => setDraft(atom.questionKey, { status: "ANSWERED", enumValue: event.target.value })}
                          disabled={saving}
                        >
                          <option value="">Válasszon</option>
                          {(atom.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      ) : atom.valueType === "MULTI_ENUM" ? (
                        <div className="flex flex-wrap gap-2">
                          {(atom.options ?? []).map((option) => {
                            const active = (draft?.jsonValue ?? []).includes(option);
                            return (
                              <button key={option} type="button" aria-pressed={active} disabled={saving} onClick={() => toggleMultiValue(atom, option)} className={active ? chipOn : chipOff}>
                                {option}
                              </button>
                            );
                          })}
                        </div>
                      ) : atom.valueType === "JURISDICTION" ? (
                        <input
                          type="text"
                          className={inputClass}
                          placeholder="Pl. HU"
                          value={draft?.enumValue ?? ""}
                          onChange={(event) => setDraft(atom.questionKey, { status: "ANSWERED", enumValue: event.target.value })}
                          disabled={saving}
                        />
                      ) : (
                        <input
                          type={atom.valueType === "NUMBER" ? "number" : atom.valueType === "DATE" ? "date" : "text"}
                          className={inputClass}
                          placeholder={atom.valueType === "NUMBER" ? "Pl. 52" : undefined}
                          value={atom.valueType === "NUMBER" ? draft?.numberValue ?? "" : draft?.stringValue ?? ""}
                          onChange={(event) => setDraft(atom.questionKey, atom.valueType === "NUMBER" ? { status: "ANSWERED", numberValue: event.target.value } : { status: "ANSWERED", stringValue: event.target.value })}
                          disabled={saving}
                        />
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {draft ? <span className="text-xs text-stone-500">{draftLabel(atom, draft)}</span> : null}
                      <button type="button" onClick={() => void markUnknown(atom)} disabled={saving} className="text-xs font-semibold text-amber-800 hover:underline">
                        Nem tudom
                      </button>
                      {atom.why ? (
                        <details className="min-w-0">
                          <summary className="cursor-pointer text-xs text-stone-400 hover:text-stone-600">Miért kérdezzük?</summary>
                          <p className="mt-1 text-xs text-stone-400">{atom.why}</p>
                        </details>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-4">
              <button
                type="button"
                onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
                disabled={saving || activeIndex === 0}
                className="rounded-full border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                ← Vissza
              </button>
              <button
                type="button"
                onClick={() => void saveActiveScreen(true)}
                disabled={saving}
                className="rounded-full bg-[#b95e4b] px-5 py-2 text-xs font-semibold text-white hover:bg-[#a54f3f] disabled:opacity-50"
              >
                {saving ? "Mentés folyamatban…" : activeIndex >= screens.length - 1 ? "Mentés" : "Mentés és tovább →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {evidence ? (
        <div className="mt-6 border-t border-stone-200 pt-5" data-testid="company-profile-evidence">
          <button
            type="button"
            onClick={() => setEvidenceOpen((open) => !open)}
            aria-expanded={evidenceOpen}
            className="flex w-full items-start justify-between gap-3 text-left"
          >
            <span className="min-w-0">
              <span className="block font-semibold text-stone-950">Dokumentumok és intézkedések</span>
              <span className="mt-1 block text-sm text-stone-600">
                A rátok vonatkozó területeken ellenőrizzük, hogy rendelkezésre áll-e a szükséges dokumentum vagy intézkedés.
              </span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-stone-500">
              {applicableEvidence.length ? `${applicableEvidence.length} megválaszolandó` : "Részletek"}
            </span>
          </button>
          {evidenceOpen ? (
            <div className="mt-4 space-y-3">
              {applicableEvidence.map((item) => (
                <EvidenceQuestion
                  key={item.controlKey}
                  item={item}
                  documents={evidence.reusableDocuments}
                  open={openEvidenceKey === item.controlKey}
                  onToggle={() => setOpenEvidenceKey((current) => (current === item.controlKey ? null : item.controlKey))}
                  onAnswered={() => void refreshEvidence()}
                />
              ))}
              {evidence.items.some((item) => item.relevance === "LEGAL_REVIEW_REQUIRED") ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Egyes területek a tevékenység vagy méret miatt jogi pontosítást igényelnek, ezért azokat ügyvédünk ellenőrzi.
                </p>
              ) : null}
              {evidence.items.length > 0 && evidence.items.every((item) => item.relevance === "INSUFFICIENT_FACTS" || item.relevance === "DOES_NOT_APPLY") ? (
                <p className="text-sm text-stone-500">A dokumentumokkal kapcsolatos kérdések a vállalati profil kitöltése után jelennek meg.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function EvidenceQuestion({
  item,
  documents,
  open,
  onToggle,
  onAnswered,
}: {
  item: PortalCompanyProfileEvidenceItem;
  documents: PortalCompanyProfileReusableDocument[];
  open: boolean;
  onToggle: () => void;
  onAnswered: () => void;
}) {
  const [mode, setMode] = useState<"YES" | "NO" | "UNKNOWN" | null>(null);
  const [documentVersionId, setDocumentVersionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (answer: "YES" | "NO" | "UNKNOWN") => {
    if (answer === "YES" && !documentVersionId) {
      setError("Válassz egy meglévő dokumentumot.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await answerPortalCompanyProfileEvidence(item.controlKey, {
        answer,
        ...(answer === "YES" ? { documentVersionId } : {}),
      });
      setMode(null);
      onAnswered();
    } catch (err) {
      setError(clientSafeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 p-4 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-stone-900">{item.questionHu}</span>
          <span className="mt-1 block text-xs text-stone-500">{item.stateHu}</span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-stone-500">{open ? "Bezárás" : "Válaszadás"}</span>
      </button>
      {open ? (
        <div className="border-t border-stone-100 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setMode("YES")} disabled={busy} className="rounded-full border border-stone-300 px-4 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50">
              Igen
            </button>
            <button type="button" onClick={() => void submit("NO")} disabled={busy} className="rounded-full border border-stone-300 px-4 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50">
              Nem
            </button>
            <button type="button" onClick={() => void submit("UNKNOWN")} disabled={busy} className="rounded-full border border-stone-300 px-4 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50">
              Nem tudom
            </button>
          </div>
          {mode === "YES" ? (
            <div className="mt-3">
              {documents.length ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select className={inputClass} value={documentVersionId} onChange={(event) => setDocumentVersionId(event.target.value)} disabled={busy}>
                    <option value="">Válassz dokumentumot…</option>
                    {documents.map((doc) => (
                      <option key={doc.documentVersionId} value={doc.documentVersionId}>
                        {doc.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => void submit("YES")} disabled={busy || !documentVersionId} className="rounded-full bg-[#b95e4b] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#a54f3f] disabled:opacity-50">
                    {busy ? "Mentés…" : "Mentés"}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-stone-500">Nincs elérhető dokumentum a kiválasztáshoz.</p>
              )}
            </div>
          ) : null}
          {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function TeaorSelector({
  multi,
  selected,
  labels,
  disabled,
  onSelect,
  onRemove,
}: {
  multi: boolean;
  selected: string[];
  labels: Record<string, string>;
  disabled: boolean;
  onSelect: (option: { code: string; labelHu: string }) => void;
  onRemove: (code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Array<{ code: string; labelHu: string }>>([]);
  const [open, setOpen] = useState(false);

  const search = async (value: string) => {
    setQuery(value);
    setOpen(true);
    try {
      const result = await getPortalCompanyProfileTeaor25Options(value);
      setOptions(result.options);
    } catch {
      setOptions([]);
    }
  };

  return (
    <div>
      {selected.length ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {selected.map((code) => (
            <span key={code} className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-stone-50 px-3 py-1 text-xs font-semibold text-stone-800">
              {labels[code] ? `${code} — ${labels[code]}` : code}
              <button type="button" onClick={() => onRemove(code)} disabled={disabled} className="text-stone-500 hover:text-stone-900" aria-label={`Eltávolítás: ${code}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <input
        type="text"
        className={inputClass}
        placeholder="Kezdje el beírni a tevékenységet, pl. programozás"
        value={query}
        onChange={(event) => void search(event.target.value)}
        onFocus={() => setOpen(true)}
        disabled={disabled}
        aria-autocomplete="list"
      />
      {open && options.length ? (
        <ul className="mt-1 max-h-56 overflow-auto rounded-xl border border-stone-200 bg-white shadow-sm" role="listbox">
          {options.map((option) => (
            <li key={option.code}>
              <button
                type="button"
                onClick={() => {
                  onSelect(option);
                  setQuery("");
                  setOpen(false);
                }}
                disabled={disabled}
                className="block w-full px-3 py-2 text-left text-sm text-stone-800 hover:bg-stone-50"
              >
                {option.code} — {option.labelHu}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!multi ? <p className="mt-1 text-xs text-stone-400">A fő tevékenységet egy kód jelöli.</p> : null}
    </div>
  );
}
