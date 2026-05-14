"use client";

import { useMemo, useState } from "react";

type IntakeStatus =
  | "Nincs beillesztve"
  | "Jelölt által átnézendő"
  | "Ügyvéd által átnézendő"
  | "Jóváhagyásra kész";

type DetectionItem = {
  label: string;
  found: boolean;
};

const intakeStatuses: IntakeStatus[] = [
  "Nincs beillesztve",
  "Jelölt által átnézendő",
  "Ügyvéd által átnézendő",
  "Jóváhagyásra kész",
];

const containsAny = (value: string, keywords: string[]) => keywords.some((keyword) => value.includes(keyword));

export function LegalAnalysisIntakePanel() {
  const [analysisText, setAnalysisText] = useState("");
  const [status, setStatus] = useState<IntakeStatus>("Nincs beillesztve");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

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
    setAnalysisText("");
    setStatus("Nincs beillesztve");
    setCopyState("idle");
  };

  return (
    <aside className="border border-[#DDD7CA] bg-white p-4">
      <div className="mb-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D]">AI válasz intake</p>
        <h3 className="mt-1 text-sm font-semibold text-[#1F2821]">Jogi elemzés beillesztése</h3>
        <p className="mt-2 text-[11px] text-[#514D45]">
          Ide illeszthető be a külső AI eszköz által készített, ügyvéd által ellenőrizendő jogi elemzés. A tartalom jelenleg nem kerül mentésre.
        </p>
      </div>

      <label className="block text-[10px] uppercase tracking-[0.16em] text-[#7B776D]" htmlFor="legal-analysis-intake-status">
        Review státusz
      </label>
      <select
        id="legal-analysis-intake-status"
        value={status}
        onChange={(event) => setStatus(event.target.value as IntakeStatus)}
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
        onChange={(event) => setAnalysisText(event.target.value)}
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
          onClick={handleCopy}
          disabled={!analysisText.trim()}
          className="px-3 py-2 text-xs border border-[#DDD7CA] bg-[#1F2821] text-white disabled:cursor-not-allowed disabled:border-[#DDD7CA] disabled:bg-[#EEE7D9] disabled:text-[#9C9890]"
        >
          {copyState === "copied" ? "Elemzés másolva" : copyState === "error" ? "Másolás sikertelen" : "Elemzés másolása"}
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={!analysisText && status === "Nincs beillesztve"}
          className="px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3] disabled:cursor-not-allowed disabled:text-[#9C9890]"
        >
          Törlés
        </button>
      </div>
    </aside>
  );
}
