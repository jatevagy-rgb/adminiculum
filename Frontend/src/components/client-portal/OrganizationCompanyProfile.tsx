"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getPortalCompanyProfileDiscovery,
  answerPortalCompanyProfileQuestion,
  type PortalCompanyProfileDiscovery,
  type PortalCompanyProfileQuestion,
} from "@/lib/clientPortalApi";
import { clientSafeError } from "@/lib/clientInteractionApi";

const card = "min-w-0 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm";
const inputClass =
  "w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-stone-950 focus:outline-none focus:ring-1 focus:ring-stone-950 disabled:bg-stone-50 disabled:text-stone-500";

function statusTag(status: PortalCompanyProfileQuestion["status"]) {
  switch (status) {
    case "ANSWERED":
      return {
        label: "Megadva",
        className: "bg-emerald-50 text-emerald-800 border-emerald-200",
      };
    case "UNKNOWN":
      return {
        label: "Nem ismertként jelölve",
        className: "bg-amber-50 text-amber-800 border-amber-200",
      };
    case "UNANSWERED":
    default:
      return {
        label: "Nincs megadva",
        className: "bg-stone-100 text-stone-700 border-stone-200",
      };
  }
}

function questionDisplayLabel(question: PortalCompanyProfileQuestion) {
  if (question.questionKey === "employee_count") return "Foglalkoztatottak létszáma";
  return question.label?.trim() || "Szervezeti adat";
}

function sectionLabel(section: PortalCompanyProfileQuestion["section"]) {
  return {
    COMPANY: "Vállalat",
    OPERATIONS: "Működés",
    PEOPLE: "Munkavállalók",
    SIZE: "Vállalkozás mérete",
    DATA: "Adatkezelés",
    DIGITAL: "Digitális működés",
    MARKET: "Piac és ügyfelek",
    AI: "Mesterséges intelligencia",
    FINANCE: "Pénzügy",
    PRODUCT: "Termékek",
    ENVIRONMENT: "Környezet",
    SECTOR: "Ágazat",
    SPECIAL: "Speciális / szabályozott működés",
  }[section];
}

function formatQuestionValue(question: PortalCompanyProfileQuestion) {
  if (question.status === "UNKNOWN") {
    return "A szervezet jelenleg nem rendelkezik pontos adattal.";
  }
  if (question.status === "UNANSWERED" || question.value === null || question.value === undefined) {
    return "Ehhez még szükségünk van egy adatra.";
  }
  if (Array.isArray(question.value)) {
    return question.value.length ? question.value.join(", ") : "Ehhez még szükségünk van egy adatra.";
  }
  if (question.valueType === "NUMBER" && typeof question.value === "number") {
    return `${question.value} fő`;
  }
  if (typeof question.value === "boolean") {
    return question.value ? "Igen" : "Nem";
  }
  return String(question.value);
}

type Props = {
  onProfileUpdated?: () => void | Promise<void>;
};

export function OrganizationCompanyProfile({ onProfileUpdated }: Props) {
  const [discovery, setDiscovery] = useState<PortalCompanyProfileDiscovery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state per questionKey
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [editMulti, setEditMulti] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const refreshDiscovery = useCallback(async () => {
    const result = await getPortalCompanyProfileDiscovery();
    setDiscovery(result);
  }, []);

  const loadDiscovery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshDiscovery();
    } catch (err) {
      setError(clientSafeError(err));
    } finally {
      setLoading(false);
    }
  }, [refreshDiscovery]);

  useEffect(() => {
    void loadDiscovery();
  }, [loadDiscovery]);

  const questions = useMemo(() => discovery?.questions || [], [discovery]);

  const stats = useMemo(() => {
    const total = questions.length;
    const answered = questions.filter((q) => q.status === "ANSWERED").length;
    const unknown = questions.filter((q) => q.status === "UNKNOWN").length;
    return { total, answered, unknown };
  }, [questions]);

  const handleStartEdit = (question: PortalCompanyProfileQuestion) => {
    setEditingKey(question.questionKey);
    setActionError(null);
    setRefreshWarning(null);
    setSuccessMessage(null);
    if (question.status === "ANSWERED" && question.value !== null && question.value !== undefined) {
      if (Array.isArray(question.value)) {
        setEditMulti(question.value);
        setEditValue(question.value.join(", "));
      } else {
        setEditMulti([]);
        setEditValue(String(question.value));
      }
    } else {
      setEditValue("");
      setEditMulti([]);
    }
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditValue("");
    setEditMulti([]);
    setActionError(null);
    setRefreshWarning(null);
  };

  const handleSaveAnswer = async (question: PortalCompanyProfileQuestion) => {
    setActionError(null);
    setRefreshWarning(null);
    setSuccessMessage(null);

    let payload: Parameters<typeof answerPortalCompanyProfileQuestion>[1] = { status: "ANSWERED" };
    if (question.valueType === "NUMBER") {
      const trimmed = editValue.trim();
      if (trimmed === "") {
        setActionError("Kérjük, adjon meg egy érvényes számértéket.");
        return;
      }
      const parsedNumber = Number(trimmed);
      if (!Number.isFinite(parsedNumber) || parsedNumber < 0) {
        setActionError("Kérjük, pozitív egész számot adjon meg.");
        return;
      }
      payload.numberValue = parsedNumber;
    } else if (question.valueType === "BOOLEAN") {
      if (editValue !== "true" && editValue !== "false") {
        setActionError("Kérjük, válasszon Igen vagy Nem értéket.");
        return;
      }
      payload.booleanValue = editValue === "true";
    } else if (question.valueType === "ENUM") {
      if (!question.options?.includes(editValue)) {
        setActionError("Kérjük, válasszon a megadott lehetőségek közül.");
        return;
      }
      payload.enumValue = editValue;
    } else if (question.valueType === "DATE") {
      if (!editValue) {
        setActionError("Kérjük, adjon meg egy dátumot.");
        return;
      }
      payload.dateValue = editValue;
    } else if (question.valueType === "STRING") {
      if (!editValue.trim()) {
        setActionError("Kérjük, adjon meg egy értéket.");
        return;
      }
      payload.stringValue = editValue.trim();
    } else if (question.valueType === "MULTI_ENUM") {
      const hasOptions = (question.options || []).length > 0;
      const values = hasOptions
        ? editMulti
        : editValue.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
      if (!values.length) {
        setActionError("Kérjük, válasszon legalább egy lehetőséget.");
        return;
      }
      payload.jsonValue = values;
    } else if (question.valueType === "JURISDICTION") {
      if (!editValue.trim()) {
        setActionError("Kérjük, adjon meg egy országkódot.");
        return;
      }
      payload.enumValue = editValue.trim().toUpperCase();
    }

    setSaving(true);
    let mutationCompleted = false;
    try {
      await answerPortalCompanyProfileQuestion(question.questionKey, payload);
      mutationCompleted = true;
      setEditingKey(null);
      setEditValue("");
      await refreshDiscovery();
      await onProfileUpdated?.();
      setSuccessMessage(
        "A cégadatokat frissítettük. A szervezeti áttekintést az új adatok alapján frissítettük.",
      );
    } catch (err) {
      if (mutationCompleted) {
        setRefreshWarning("Az adat mentése megtörtént, de a frissített áttekintés betöltése nem sikerült. Kérjük, frissítse az oldalt.");
      } else {
        setActionError(clientSafeError(err));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleMarkUnknown = async (question: PortalCompanyProfileQuestion) => {
    setActionError(null);
    setRefreshWarning(null);
    setSuccessMessage(null);
    setSaving(true);
    let mutationCompleted = false;
    try {
      await answerPortalCompanyProfileQuestion(question.questionKey, {
        status: "UNKNOWN",
      });
      mutationCompleted = true;
      setEditingKey(null);
      setEditValue("");
      await refreshDiscovery();
      await onProfileUpdated?.();
      setSuccessMessage("Nem ismertként jelölve.");
    } catch (err) {
      if (mutationCompleted) {
        setRefreshWarning("Az adat mentése megtörtént, de a frissített áttekintés betöltése nem sikerült. Kérjük, frissítse az oldalt.");
      } else {
        setActionError(clientSafeError(err));
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <section className={card}>Vállalati profil betöltése…</section>;
  }

  if (error) {
    return <section className={card}>{error}</section>;
  }

  return (
    <section className={card} data-testid="organization-company-profile">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9b7b25]">
            Cégadatok
          </p>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-950">
            Vállalati profil
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            A szervezeti áttekintéshez szükséges cégadatok.
          </p>
        </div>

        {stats.total > 0 ? (
          <div className="rounded-2xl bg-stone-50 px-4 py-3 text-right">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Adatállapot
            </span>
            <p className="text-lg font-semibold text-stone-900">
              {stats.answered} adat ismert · {Math.max(0, stats.total - stats.answered)} tisztázandó
            </p>
          </div>
        ) : null}
      </div>

      {successMessage ? (
        <div
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
          role="status"
        >
          {successMessage}
        </div>
      ) : null}

      {refreshWarning ? (
        <div
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          role="status"
        >
          {refreshWarning}
        </div>
      ) : null}

      {actionError ? (
        <div
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900"
          role="alert"
        >
          {actionError}
        </div>
      ) : null}

      <div className="mt-6 space-y-6">
        {questions.length === 0 ? (
          <p className="text-sm text-stone-600">A jelenlegi adatok alapján nincs további tisztázandó kérdés.</p>
        ) : (
          questions.map((question, index) => {
            const isEditing = editingKey === question.questionKey;
            const tag = statusTag(question.status);
            const previous = questions[index - 1];
            const showSection = !previous || previous.section !== question.section;

            return (
              <div key={question.questionKey}>
                {showSection ? <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{sectionLabel(question.section)}</h3> : null}
                <div className="rounded-2xl border border-stone-200 bg-white p-4 transition" data-testid="company-profile-question">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-stone-950">
                      {questionDisplayLabel(question)}
                    </h3>
                    <p className="mt-1 text-sm text-stone-700">
                      {formatQuestionValue(question)}
                    </p>
                    {question.helpText ? <p className="mt-1 text-xs text-stone-500">{question.helpText}</p> : null}
                    {question.why ? <p className="mt-1 text-xs text-stone-400">Miért kérdezzük? {question.why}</p> : null}
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${tag.className}`}
                  >
                    {tag.label}
                  </span>
                </div>

                {isEditing ? (
                  <div className="mt-4 space-y-3 border-t border-stone-100 pt-3">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
                      Érték megadása
                    </label>
                    {question.valueType === "BOOLEAN" ? (
                      <select className={inputClass} value={editValue} onChange={(e) => setEditValue(e.target.value)} disabled={saving} autoFocus>
                        <option value="">Válasszon</option><option value="true">Igen</option><option value="false">Nem</option>
                      </select>
                    ) : question.valueType === "ENUM" ? (
                      <select className={inputClass} value={editValue} onChange={(e) => setEditValue(e.target.value)} disabled={saving} autoFocus>
                        <option value="">Válasszon</option>{(question.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    ) : question.valueType === "MULTI_ENUM" ? (
                      (question.options || []).length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {(question.options || []).map((option) => {
                            const active = editMulti.includes(option);
                            return (
                              <button
                                key={option}
                                type="button"
                                aria-pressed={active}
                                disabled={saving}
                                onClick={() => setEditMulti((prev) => (active ? prev.filter((value) => value !== option) : [...prev, option]))}
                                className={active
                                  ? "rounded-full bg-stone-950 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                                  : "rounded-full border border-stone-300 px-3 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"}
                              >
                                {option}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <input
                          type="text"
                          className={inputClass}
                          placeholder="Kódok vesszővel elválasztva, pl. 62.01, 62.02"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          disabled={saving}
                          autoFocus
                        />
                      )
                    ) : (
                      <input
                        type={question.valueType === "NUMBER" ? "number" : question.valueType === "DATE" ? "date" : "text"}
                        className={inputClass}
                        placeholder={question.valueType === "NUMBER" ? "Pl. 52" : question.valueType === "JURISDICTION" ? "Pl. HU" : question.codeCatalog === "TEAOR25" ? "Pl. 62.01" : undefined}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        disabled={saving}
                        autoFocus
                      />
                    )}
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={saving}
                        className="rounded-full border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                      >
                        Mégse
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMarkUnknown(question)}
                        disabled={saving}
                        className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        Nem ismertként jelölöm
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveAnswer(question)}
                        disabled={saving}
                        className="rounded-full bg-stone-950 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
                      >
                        {saving ? "Mentés folyamatban…" : "Mentés"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(question)}
                      className="inline-flex items-center text-xs font-semibold text-[#7a5f18] hover:underline"
                    >
                      {question.status === "ANSWERED" ? "Módosítás →" : "Kitöltés →"}
                    </button>
                  </div>
                )}
                  </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
