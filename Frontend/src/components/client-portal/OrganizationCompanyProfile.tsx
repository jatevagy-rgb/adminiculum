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
  if (question.questionKey === "employee_count") {
    return "Foglalkoztatottak létszáma";
  }
  return question.label || question.questionKey;
}

function formatQuestionValue(question: PortalCompanyProfileQuestion) {
  if (question.status === "UNKNOWN") {
    return "A szervezet jelenleg nem rendelkezik pontos adattal.";
  }
  if (question.status === "UNANSWERED" || question.value === null || question.value === undefined) {
    return "Ehhez még szükségünk van egy adatra.";
  }
  if (question.questionKey === "employee_count" && typeof question.value === "number") {
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
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadDiscovery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getPortalCompanyProfileDiscovery();
      setDiscovery(result);
    } catch (err) {
      setError(clientSafeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

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
    setSuccessMessage(null);
    if (question.status === "ANSWERED" && question.value !== null && question.value !== undefined) {
      setEditValue(String(question.value));
    } else {
      setEditValue("");
    }
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditValue("");
    setActionError(null);
  };

  const handleSaveAnswer = async (question: PortalCompanyProfileQuestion) => {
    setActionError(null);
    setSuccessMessage(null);

    let parsedNumber: number | undefined;
    if (question.questionKey === "employee_count" || typeof question.value === "number") {
      const trimmed = editValue.trim();
      if (trimmed === "") {
        setActionError("Kérjük, adjon meg egy érvényes számértéket.");
        return;
      }
      parsedNumber = parseInt(trimmed, 10);
      if (Number.isNaN(parsedNumber) || parsedNumber < 0) {
        setActionError("Kérjük, pozitív egész számot adjon meg.");
        return;
      }
    }

    setSaving(true);
    try {
      await answerPortalCompanyProfileQuestion(question.questionKey, {
        status: "ANSWERED",
        ...(parsedNumber !== undefined ? { numberValue: parsedNumber } : {}),
      });
      setEditingKey(null);
      setEditValue("");
      await loadDiscovery();
      await onProfileUpdated?.();
      setSuccessMessage(
        "A cégadatokat frissítettük. A szervezeti áttekintést az új adatok alapján frissítettük.",
      );
    } catch (err) {
      setActionError(clientSafeError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleMarkUnknown = async (question: PortalCompanyProfileQuestion) => {
    setActionError(null);
    setSuccessMessage(null);
    setSaving(true);
    try {
      await answerPortalCompanyProfileQuestion(question.questionKey, {
        status: "UNKNOWN",
      });
      setEditingKey(null);
      setEditValue("");
      await loadDiscovery();
      await onProfileUpdated?.();
      setSuccessMessage("Nem ismertként jelölve.");
    } catch (err) {
      setActionError(clientSafeError(err));
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
              Kitöltöttség
            </span>
            <p className="text-lg font-semibold text-stone-900">
              {stats.answered} / {stats.total} adat megadva
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

      {actionError ? (
        <div
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900"
          role="alert"
        >
          {actionError}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {questions.length === 0 ? (
          <p className="text-sm text-stone-600">Jelenleg nincsenek megválaszolandó kérdések.</p>
        ) : (
          questions.map((question) => {
            const isEditing = editingKey === question.questionKey;
            const tag = statusTag(question.status);

            return (
              <div
                key={question.questionKey}
                className="rounded-2xl border border-stone-200 bg-white p-4 transition"
                data-testid={`company-profile-question-${question.questionKey}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-stone-950">
                      {questionDisplayLabel(question)}
                    </h3>
                    <p className="mt-1 text-sm text-stone-700">
                      {formatQuestionValue(question)}
                    </p>
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
                    <input
                      type="number"
                      className={inputClass}
                      placeholder="Pl. 52"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      disabled={saving}
                      autoFocus
                    />
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
            );
          })
        )}
      </div>
    </section>
  );
}
