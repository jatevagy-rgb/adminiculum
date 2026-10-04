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
  type PortalCompanyProfileReusableDocument,
  type PortalCompanyProfileScreen,
} from "@/lib/clientPortalApi";
import { clientSafeError } from "@/lib/clientInteractionApi";
import { companyProfileCompletion } from "@/lib/companyProfileCompletion";
import { draftToPayload, seedDrafts, type DraftValue } from "@/lib/companyProfileDraft";
import { countPendingEvidence, evidencePendingLabel } from "@/lib/companyProfileEvidence";
import { Button, SafePanelError } from "@/components/ui";
import { PortalEmptyInline } from "../shared/PortalEmptyInline";

const TEAOR_UNAVAILABLE = "Az ágazati besorolás jelenleg nem érhető el. A korábban megadott tevékenységi adat megmaradt.";

const inputClass =
  "h-10 w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 text-sm text-[var(--adm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] disabled:opacity-60";

function questionLabel(question: PortalCompanyProfileQuestion): string {
  return question.label?.trim() || "Szervezeti adat";
}

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

/**
 * Client Portal 3.0 company-profile editor. Reuses the canonical APIs and
 * helper libraries (companyProfileCompletion / companyProfileDraft /
 * companyProfileEvidence) — the backend discovery response remains the single
 * authority for screens, questions, applicability and fact relevance.
 */
export function PortalCompanyProfileV3({ onProfileUpdated }: { onProfileUpdated?: () => void | Promise<void> }) {
  const [discovery, setDiscovery] = useState<PortalCompanyProfileDiscovery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, DraftValue>>({});
  const [teaorLabels, setTeaorLabels] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<PortalCompanyProfileEvidenceJourney | null>(null);
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
    setError(false);
    try {
      await refreshDiscovery();
      await refreshEvidence();
    } catch {
      setError(true);
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

  const progress = useMemo(() => companyProfileCompletion(questions, screens), [questions, screens]);

  const activeScreen: PortalCompanyProfileScreen | undefined = screens[activeIndex];

  const activeAtoms = useMemo(() => {
    if (!activeScreen) return [] as PortalCompanyProfileQuestion[];
    return activeScreen.factBindings.map((factKey) => atomsByKey.get(factKey)).filter((atom): atom is PortalCompanyProfileQuestion => Boolean(atom));
  }, [activeScreen, atomsByKey]);

  const topicGroups = useMemo(() => {
    const groups: Array<{ sectionTitle: string; topics: Array<{ screen: PortalCompanyProfileScreen; index: number; answered: number; total: number }> }> = [];
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

  const applicableEvidence = useMemo(() => (evidence?.items ?? []).filter((item) => item.relevance === "APPLIES"), [evidence]);
  const pendingEvidenceCount = useMemo(() => countPendingEvidence(applicableEvidence), [applicableEvidence]);

  const hasTeaorAtom = activeAtoms.some((atom) => atom.codeCatalog === "TEAOR25");

  useEffect(() => {
    if (!activeScreen) return;
    setDrafts((previous) => seedDrafts(previous, activeAtoms));
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
    } catch {
      if (saved) setRefreshWarning("A mentés megtörtént, de a frissítés nem sikerült. Kérjük, töltse újra az oldalt.");
      else setActionError("A válaszok mentése nem sikerült. Próbálja újra.");
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
    } catch {
      setActionError("A válasz mentése nem sikerült. Próbálja újra.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div aria-label="Profiladatok betöltése" data-testid="portal-company-profile-loading" className="h-32 animate-pulse rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]" />
    );
  }

  if (error) {
    return <SafePanelError detail="A profiladatok jelenleg nem tölthetők be. Próbálja újra." onRetry={() => void load()} />;
  }

  return (
    <section data-testid="portal-company-profile-v3" className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--adm-border-canonical)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">Profiladatok</h2>
          <p className="mt-1 text-sm text-[var(--adm-text-secondary)]">Segítsen pontosítani, milyen szabályok érintik a vállalkozását.</p>
        </div>
        <div className="w-full sm:w-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--adm-text-secondary)]">Profiladatok kitöltöttsége</p>
          <p className="mt-1 text-lg font-semibold text-[var(--adm-text-primary)]">
            {progress.answered} / {progress.total}
          </p>
          <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-[var(--adm-canvas-subtle)]" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profiladatok kitöltöttsége">
            <div className="h-full bg-[var(--adm-brand-green)]" style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="mt-2 max-w-[16rem] text-[11px] leading-4 text-[var(--adm-text-secondary)]">
            A megadott profiladatok arányát mutatja. Nem jogi megfelelőségi minősítés.
          </p>
        </div>
      </div>

      {!editorOpen ? (
        <div className="px-4 py-4">
          {screens.length === 0 ? (
            <PortalEmptyInline>A jelenlegi adatok alapján nincs további tisztázandó kérdés.</PortalEmptyInline>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[var(--adm-text-primary)]">
                Következő téma: <span className="font-medium">{screens[activeIndex]?.titleHu}</span>
              </p>
              <Button variant="primary" size="md" onClick={() => setEditorOpen(true)} data-testid="portal-company-profile-edit">
                Profiladatok szerkesztése
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {editorOpen && screens.length > 0 && activeScreen ? (
        <div className="px-4 pb-4" data-testid="portal-company-profile-editor">
          {successMessage ? <p className="mt-3 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 text-sm text-[var(--adm-text-primary)]" role="status">{successMessage}</p> : null}
          {refreshWarning ? <p className="mt-3 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 text-sm text-[var(--adm-semantic-warning)]" role="status">{refreshWarning}</p> : null}
          {actionError ? <p className="mt-3 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 text-sm text-[var(--adm-brand-terracotta)]" role="alert">{actionError}</p> : null}

          <div className="mt-3 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 text-sm font-semibold text-[var(--adm-text-primary)]">
                <span className="text-[var(--adm-text-secondary)]">{activeIndex + 1} / {screens.length} · </span>
                {activeScreen.sectionTitleHu}
              </p>
              <Button variant="neutral" size="sm" onClick={() => setTopicListOpen((open) => !open)} aria-expanded={topicListOpen}>
                {topicListOpen ? "Témakörlista bezárása" : "Témakörlista"}
              </Button>
            </div>
            {topicListOpen ? (
              <div className="mt-3 space-y-3" data-testid="company-profile-topics">
                {topicGroups.map((group) => (
                  <div key={group.sectionTitle}>
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--adm-text-secondary)]">{group.sectionTitle}</p>
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
                            className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-[8px] border px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] ${
                              isActive ? "border-[var(--adm-brand-green)] bg-[var(--adm-canvas-white)] font-semibold text-[var(--adm-text-primary)]" : "border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] text-[var(--adm-text-primary)]"
                            }`}
                          >
                            <span className="min-w-0">{topic.screen.titleHu}</span>
                            <span className="shrink-0 text-xs font-normal text-[var(--adm-text-secondary)]">{topic.answered} / {topic.total} adat megadva</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-3 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-4" data-testid="company-profile-screen">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--adm-text-secondary)]">{activeScreen.sectionTitleHu}</p>
            <h3 className="mt-1 font-semibold text-[var(--adm-text-primary)]">{activeScreen.titleHu}</h3>
            <p className="mt-1 text-sm text-[var(--adm-text-primary)]">{activeScreen.helpTextHu}</p>
            {activeScreen.whyHu ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-[var(--adm-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]">Miért kérdezzük?</summary>
                <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">{activeScreen.whyHu}</p>
              </details>
            ) : null}
            {hasTeaorAtom && !teaorInstalled ? (
              <p className="mt-3 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 text-xs text-[var(--adm-semantic-warning)]">{TEAOR_UNAVAILABLE}</p>
            ) : null}

            <div className="mt-4 space-y-5">
              {activeAtoms.map((atom) => {
                const draft = drafts[atom.questionKey];
                const isTeaor = atom.codeCatalog === "TEAOR25";
                return (
                  <div key={atom.questionKey} data-testid="company-profile-question" className="border-t border-[var(--adm-border-canonical)] pt-3">
                    <label className="block text-sm font-semibold text-[var(--adm-text-primary)]">{questionLabel(atom)}</label>
                    {atom.helpText ? <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">{atom.helpText}</p> : null}

                    <div className="mt-2">
                      {isTeaor && !teaorInstalled ? (
                        <p className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 text-xs text-[var(--adm-text-secondary)]">A korábban rögzített tevékenységi besorolás megmaradt.</p>
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
                        <select className={inputClass} value={typeof draft?.booleanValue === "boolean" ? String(draft.booleanValue) : ""} onChange={(event) => setDraft(atom.questionKey, { status: "ANSWERED", booleanValue: event.target.value === "true" })} disabled={saving}>
                          <option value="">Válasszon</option>
                          <option value="true">Igen</option>
                          <option value="false">Nem</option>
                        </select>
                      ) : atom.valueType === "ENUM" ? (
                        <select className={inputClass} value={draft?.enumValue ?? ""} onChange={(event) => setDraft(atom.questionKey, { status: "ANSWERED", enumValue: event.target.value })} disabled={saving}>
                          <option value="">Válasszon</option>
                          {(atom.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      ) : atom.valueType === "MULTI_ENUM" ? (
                        <div className="flex flex-wrap gap-2">
                          {(atom.options ?? []).map((option) => {
                            const active = (draft?.jsonValue ?? []).includes(option);
                            return (
                              <Button key={option} variant={active ? "secondary" : "neutral"} size="sm" aria-pressed={active} disabled={saving} onClick={() => toggleMultiValue(atom, option)}>
                                {option}
                              </Button>
                            );
                          })}
                        </div>
                      ) : atom.valueType === "JURISDICTION" ? (
                        <input type="text" className={inputClass} placeholder="Pl. HU" value={draft?.enumValue ?? ""} onChange={(event) => setDraft(atom.questionKey, { status: "ANSWERED", enumValue: event.target.value })} disabled={saving} />
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
                      <button type="button" onClick={() => void markUnknown(atom)} disabled={saving} className="text-xs font-semibold text-[var(--adm-semantic-warning)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] disabled:opacity-60">
                        Nem tudom
                      </button>
                      {atom.why ? (
                        <details className="min-w-0">
                          <summary className="cursor-pointer text-xs text-[var(--adm-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]">Miért kérdezzük?</summary>
                          <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">{atom.why}</p>
                        </details>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--adm-border-canonical)] pt-4">
              <Button variant="neutral" size="md" disabled={saving || activeIndex === 0} onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}>
                ← Vissza
              </Button>
              <Button variant="primary" size="md" disabled={saving} onClick={() => void saveActiveScreen(true)}>
                {saving ? "Mentés folyamatban…" : activeIndex >= screens.length - 1 ? "Mentés" : "Mentés és tovább →"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {evidence ? (
        <div className="border-t border-[var(--adm-border-canonical)] px-4 py-4" data-testid="company-profile-evidence">
          <button
            type="button"
            onClick={() => setEvidenceOpen((open) => !open)}
            aria-expanded={evidenceOpen}
            className="flex w-full items-start justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
          >
            <span className="min-w-0">
              <span className="block font-semibold text-[var(--adm-text-primary)]">Dokumentumok és intézkedések</span>
              <span className="mt-1 block text-sm text-[var(--adm-text-secondary)]">A rátok vonatkozó területeken ellenőrizzük, hogy rendelkezésre áll-e a szükséges dokumentum vagy intézkedés.</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-[var(--adm-text-secondary)]">{evidencePendingLabel(applicableEvidence.length, pendingEvidenceCount)}</span>
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
                <p className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 text-sm text-[var(--adm-semantic-warning)]">
                  Egyes területek a tevékenység vagy méret miatt jogi pontosítást igényelnek, ezért azokat ügyvédünk ellenőrzi.
                </p>
              ) : null}
              {evidence.items.length > 0 && evidence.items.every((item) => item.relevance === "INSUFFICIENT_FACTS" || item.relevance === "DOES_NOT_APPLY") ? (
                <p className="text-sm text-[var(--adm-text-secondary)]">A dokumentumokkal kapcsolatos kérdések a vállalati profil kitöltése után jelennek meg.</p>
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
      await answerPortalCompanyProfileEvidence(item.controlKey, { answer, ...(answer === "YES" ? { documentVersionId } : {}) });
      setMode(null);
      onAnswered();
    } catch {
      setError("A válasz mentése nem sikerült. Próbálja újra.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start justify-between gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--adm-brand-green)]">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[var(--adm-text-primary)]">{item.questionHu}</span>
          <span className="mt-1 block text-xs text-[var(--adm-text-secondary)]">{item.stateHu}</span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-[var(--adm-text-secondary)]">{open ? "Bezárás" : "Válaszadás"}</span>
      </button>
      {open ? (
        <div className="border-t border-[var(--adm-border-canonical)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="neutral" size="sm" disabled={busy} onClick={() => setMode("YES")}>Igen</Button>
            <Button variant="neutral" size="sm" disabled={busy} onClick={() => void submit("NO")}>Nem</Button>
            <Button variant="neutral" size="sm" disabled={busy} onClick={() => void submit("UNKNOWN")}>Nem tudom</Button>
          </div>
          {mode === "YES" ? (
            <div className="mt-3">
              {documents.length ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select className={inputClass} value={documentVersionId} onChange={(event) => setDocumentVersionId(event.target.value)} disabled={busy}>
                    <option value="">Válassz dokumentumot…</option>
                    {documents.map((doc) => (
                      <option key={doc.documentVersionId} value={doc.documentVersionId}>{doc.label}</option>
                    ))}
                  </select>
                  <Button variant="primary" size="md" disabled={busy || !documentVersionId} onClick={() => void submit("YES")}>
                    {busy ? "Mentés…" : "Mentés"}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-[var(--adm-text-secondary)]">Nincs elérhető dokumentum a kiválasztáshoz.</p>
              )}
            </div>
          ) : null}
          {error ? <p className="mt-2 text-xs text-[var(--adm-brand-terracotta)]">{error}</p> : null}
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
            <span key={code} className="inline-flex items-center gap-2 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] px-3 py-1 text-xs font-semibold text-[var(--adm-text-primary)]">
              {labels[code] ? `${code} — ${labels[code]}` : code}
              <button type="button" onClick={() => onRemove(code)} disabled={disabled} className="text-[var(--adm-text-secondary)] hover:text-[var(--adm-text-primary)]" aria-label={`Eltávolítás: ${code}`}>
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
        <ul className="mt-1 max-h-56 overflow-auto rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]" role="listbox">
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
                className="block min-h-10 w-full px-3 py-2 text-left text-sm text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--adm-brand-green)]"
              >
                {option.code} — {option.labelHu}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!multi ? <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">A fő tevékenységet egy kód jelöli.</p> : null}
    </div>
  );
}
