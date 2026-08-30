"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createDocumentLegalAnalysis,
  getLegalAnalysis,
  listDocumentLegalAnalyses,
  updateLegalAnalysis,
  type LegalAnalysisRecord,
  type LegalAnalysisSourceDocumentType,
  type LegalAnalysisStatus,
} from "@/lib/api";

type IntakeStatus =
  | "Nincs beillesztve"
  | "Jelölt által átnézendő"
  | "Ügyvéd által átnézendő"
  | "Jóváhagyásra kész";

type DetectionItem = {
  label: string;
  found: boolean;
};

type LegalAnalysisIntakePanelProps = {
  caseId: string;
  documentId: string;
  documentSourceType?: LegalAnalysisSourceDocumentType;
  documentTitle?: string;
};

const intakeStatuses: IntakeStatus[] = [
  "Nincs beillesztve",
  "Jelölt által átnézendő",
  "Ügyvéd által átnézendő",
  "Jóváhagyásra kész",
];

const intakeStatusToApiStatus: Record<IntakeStatus, LegalAnalysisStatus> = {
  "Nincs beillesztve": "DRAFT",
  "Jelölt által átnézendő": "CANDIDATE_REVIEW",
  "Ügyvéd által átnézendő": "LAWYER_REVIEW",
  "Jóváhagyásra kész": "READY_FOR_APPROVAL",
};

const apiStatusToIntakeStatus: Record<LegalAnalysisStatus, IntakeStatus> = {
  DRAFT: "Nincs beillesztve",
  CANDIDATE_REVIEW: "Jelölt által átnézendő",
  LAWYER_REVIEW: "Ügyvéd által átnézendő",
  READY_FOR_APPROVAL: "Jóváhagyásra kész",
  APPROVED: "Jóváhagyásra kész",
  ARCHIVED: "Nincs beillesztve",
};

const containsAny = (value: string, keywords: string[]) => keywords.some((keyword) => value.includes(keyword));

const formatSavedAt = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("hu-HU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return value;
  }
};

const getSavedSnapshot = (record: LegalAnalysisRecord | null) => ({
  title: record?.title || "Jogi elemzés",
  analysisText: record?.analysisText || "",
  status: apiStatusToIntakeStatus[record?.status || "DRAFT"],
  aiToolName: record?.aiToolName || "",
});

export function LegalAnalysisIntakePanel({
  caseId,
  documentId,
  documentSourceType = "DOCUMENT",
  documentTitle,
}: LegalAnalysisIntakePanelProps) {
  const [title, setTitle] = useState("Jogi elemzés");
  const [analysisText, setAnalysisText] = useState("");
  const [status, setStatus] = useState<IntakeStatus>("Nincs beillesztve");
  const [aiToolName, setAiToolName] = useState("");
  const [savedAnalysis, setSavedAnalysis] = useState<LegalAnalysisRecord | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    let cancelled = false;

    const loadAnalyses = async () => {
      setLoadState("loading");
      setSaveState("idle");
      setErrorMessage(null);
      setCopyState("idle");
      try {
        const analyses = await listDocumentLegalAnalyses(documentId, { caseId, documentSourceType });
        if (cancelled) return;
        const latestSummary = [...analyses].sort(
          (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime(),
        )[0] || null;
        const latest = latestSummary ? await getLegalAnalysis(latestSummary.id) : null;
        setSavedAnalysis(latest);
        const snapshot = getSavedSnapshot(latest);
        setTitle(snapshot.title);
        setAnalysisText(snapshot.analysisText);
        setStatus(snapshot.status);
        setAiToolName(snapshot.aiToolName);
        setLoadState("loaded");
      } catch {
        if (cancelled) return;
        setSavedAnalysis(null);
        setTitle("Jogi elemzés");
        setAnalysisText("");
        setStatus("Nincs beillesztve");
        setAiToolName("");
        setLoadState("error");
        setErrorMessage("A mentett jogi elemzés betöltése sikertelen.");
      }
    };

    loadAnalyses();

    return () => {
      cancelled = true;
    };
  }, [caseId, documentId, documentSourceType]);

  const normalizedText = analysisText.toLocaleLowerCase("hu-HU");
  const detections = useMemo<DetectionItem[]>(
    () => [
      {
        label: "kockázati mátrix",
        found: containsAny(normalizedText, ["kockázati mátrix"]),
      },
      {
        label: "hiányzó adatok/iratok",
        found: containsAny(normalizedText, ["hiányzó adatok", "hiányzó iratok"]),
      },
      {
        label: "módosítási javaslatok",
        found: containsAny(normalizedText, ["javasolt módosítás", "módosítási javaslat"]),
      },
      {
        label: "ügyvédi döntési pont",
        found: containsAny(normalizedText, ["ügyvédi döntési pont"]),
      },
    ],
    [normalizedText],
  );

  const savedSnapshot = useMemo(() => getSavedSnapshot(savedAnalysis), [savedAnalysis]);

  const isDirty =
    title !== savedSnapshot.title ||
    analysisText !== savedSnapshot.analysisText ||
    status !== savedSnapshot.status ||
    aiToolName !== savedSnapshot.aiToolName;

  const canSave = analysisText.trim().length > 0 && saveState !== "saving";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(analysisText);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 2200);
    }
  };

  const handleClear = () => {
    setTitle("Jogi elemzés");
    setAnalysisText("");
    setStatus("Nincs beillesztve");
    setAiToolName("");
    setSaveState("idle");
    setErrorMessage(null);
    setCopyState("idle");
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaveState("saving");
    setErrorMessage(null);
    try {
      const payload = {
        caseId,
        documentSourceType,
        title: title.trim() || "Jogi elemzés",
        analysisText,
        status: intakeStatusToApiStatus[status],
        sourceType: "PASTED_AI_OUTPUT" as const,
        aiToolName: aiToolName.trim() || null,
      };
      const saved = savedAnalysis
        ? await updateLegalAnalysis(savedAnalysis.id, payload)
        : await createDocumentLegalAnalysis(documentId, payload);
      setSavedAnalysis(saved);
      const snapshot = getSavedSnapshot(saved);
      setTitle(snapshot.title);
      setAnalysisText(snapshot.analysisText);
      setStatus(snapshot.status);
      setAiToolName(snapshot.aiToolName);
      setSaveState("saved");
    } catch {
      setSaveState("error");
      setErrorMessage("A jogi elemzés mentése sikertelen.");
    }
  };

  return (
    <aside data-testid="legal-analysis-intake" className="border border-[#DDD7CA] bg-white p-4">
      <div className="mb-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D]">AI válasz intake</p>
        <h3 className="mt-1 text-sm font-semibold text-[#1F2821]">Jogi elemzés beillesztése</h3>
        <p className="mt-2 text-[11px] text-[#514D45]">
          Ide illeszthető be a külső AI eszköz által készített, ügyvéd által ellenőrizendő jogi elemzés.
        </p>
        <p className="mt-2 text-[11px] font-medium text-[#6E5D2F]">
          Az elemzés ügyvédi felülvizsgálatot igényel; nem minősül végleges jogi állásfoglalásnak.
        </p>
        {documentTitle ? <p className="mt-2 text-[11px] text-[#7B776D]">Dokumentum: {documentTitle}</p> : null}
      </div>

      <div className="mb-4 border border-[#EEE7D9] bg-[#FBF9F3] p-3 text-[11px] text-[#514D45]">
        {loadState === "loading" ? (
          <p>Mentett jogi elemzés betöltése...</p>
        ) : savedAnalysis ? (
          <div className="space-y-1">
            <p className="font-semibold text-[#1F2821]">Mentett elemzés: {savedAnalysis.title}</p>
            <p>Státusz: {apiStatusToIntakeStatus[savedAnalysis.status]}</p>
            <p>Utolsó módosítás: {formatSavedAt(savedAnalysis.updatedAt)}</p>
          </div>
        ) : (
          <p>Még nincs mentett jogi elemzés ehhez a dokumentumhoz.</p>
        )}
        {isDirty ? <p className="mt-2 font-semibold text-[#8A5A1F]">Nem mentett módosítások</p> : null}
      </div>

      <label className="block text-[10px] uppercase tracking-[0.16em] text-[#7B776D]" htmlFor="legal-analysis-intake-title">
        Elemzés címe
      </label>
      <input
        id="legal-analysis-intake-title"
        type="text"
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          setSaveState("idle");
        }}
        className="mt-2 w-full border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821] outline-none focus:border-[#8A6F3E]"
      />

      <label className="mt-4 block text-[10px] uppercase tracking-[0.16em] text-[#7B776D]" htmlFor="legal-analysis-intake-ai-tool">
        AI eszköz neve opcionális
      </label>
      <input
        id="legal-analysis-intake-ai-tool"
        type="text"
        value={aiToolName}
        onChange={(event) => {
          setAiToolName(event.target.value);
          setSaveState("idle");
        }}
        placeholder="Például ChatGPT, Claude, Copilot"
        className="mt-2 w-full border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821] outline-none focus:border-[#8A6F3E]"
      />

      <label className="mt-4 block text-[10px] uppercase tracking-[0.16em] text-[#7B776D]" htmlFor="legal-analysis-intake-status">
        Review státusz
      </label>
      <select
        id="legal-analysis-intake-status"
        value={status}
        onChange={(event) => {
          setStatus(event.target.value as IntakeStatus);
          setSaveState("idle");
        }}
        className="mt-2 w-full border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821]"
      >
        {intakeStatuses.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>

      <label className="mt-4 block text-[10px] uppercase tracking-[0.16em] text-[#7B776D]" htmlFor="legal-analysis-intake-text">
        Beillesztett jogi elemzés
      </label>
      <textarea
        id="legal-analysis-intake-text"
        value={analysisText}
        onChange={(event) => {
          setAnalysisText(event.target.value);
          setSaveState("idle");
        }}
        rows={10}
        placeholder="Illeszd be ide a külső AI eszköz válaszát."
        className="mt-2 w-full resize-y border border-[#DDD7CA] bg-[#FBF9F3] px-3 py-2 text-xs text-[#1F2821] outline-none focus:border-[#8A6F3E]"
      />

      <div className="mt-4 border border-[#EEE7D9] bg-[#FBF9F3] p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-[#1F2821]">Előnézeti összefoglaló</p>
          <span className="text-[10px] text-[#7B776D]">{analysisText.length} karakter</span>
        </div>
        <div className="mt-3 space-y-2">
          {detections.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="text-[#514D45]">{item.label}</span>
              <span className={item.found ? "font-semibold text-[#2F6B3F]" : "text-[#9C9890]"}>
                {item.found ? "található" : "nem található"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="px-3 py-2 text-xs border border-[#1F2821] bg-[#1F2821] text-white disabled:cursor-not-allowed disabled:border-[#DDD7CA] disabled:bg-[#EEE7D9] disabled:text-[#9C9890]"
        >
          {saveState === "saving" ? "Mentés..." : saveState === "saved" ? "Mentve" : "Mentés"}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!analysisText.trim()}
          className="px-3 py-2 text-xs border border-[#DDD7CA] bg-[#1F2821] text-white disabled:cursor-not-allowed disabled:border-[#DDD7CA] disabled:bg-[#EEE7D9] disabled:text-[#9C9890]"
        >
          {copyState === "copied" ? "Elemzés másolva" : copyState === "error" ? "Másolás sikertelen" : "Elemzés másolása"}
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={!analysisText && !aiToolName && title === "Jogi elemzés" && status === "Nincs beillesztve"}
          className="px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3] disabled:cursor-not-allowed disabled:text-[#9C9890]"
        >
          Törlés
        </button>
      </div>
      <p className="mt-2 text-[11px] text-[#7B776D]">
        A törlés csak a helyi beviteli mezőt üríti, a már mentett elemzést nem törli.
      </p>
      {errorMessage ? <p className="mt-3 text-[11px] font-semibold text-[#A33A2B]">{errorMessage}</p> : null}
    </aside>
  );
}
