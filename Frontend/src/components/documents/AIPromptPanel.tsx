"use client";

import { useState } from "react";
import { LEGAL_PROMPT_CATALOG, LegalPromptTemplate } from "./legalPromptCatalog";
import type { ClientHouseStyleProfile } from "@/lib/api";

type AIPromptPanelProps = {
  caseId?: string;
  documentId?: string;
  documentTitle?: string;
  anonymizedText?: string;
  clientHouseStyle?: ClientHouseStyleProfile | null;
  className?: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  analysis: "Elemzés",
  risk: "Kockázat",
  modification: "Módosítás",
  handoff: "Leadás",
  communication: "Kommunikáció",
  formatting: "Formázás",
  review: "Review",
  episode: "Epizód",
};

const P0_CATEGORIES = ["analysis", "risk"] as const;
const P1_CATEGORIES = ["modification", "handoff", "communication", "formatting", "review"] as const;

export function AIPromptPanel(props: AIPromptPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [episodesOpen, setEpisodesOpen] = useState(false);
  const [p1Open, setP1Open] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const hasText = Boolean(props.anonymizedText?.trim());

  const p0Templates = LEGAL_PROMPT_CATALOG.filter((t) =>
    P0_CATEGORIES.includes(t.category as typeof P0_CATEGORIES[number])
  );
  const p1Templates = LEGAL_PROMPT_CATALOG.filter((t) =>
    P1_CATEGORIES.includes(t.category as typeof P1_CATEGORIES[number])
  );
  const episodeTemplates = LEGAL_PROMPT_CATALOG.filter((t) => t.category === "episode");

  const allCatalogTemplates = [...p0Templates, ...p1Templates, ...episodeTemplates];

  const filteredTemplates = allCatalogTemplates.filter((t) => {
    const matchesSearch =
      search.trim() === "" ||
      t.label.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "fo" && P0_CATEGORIES.includes(t.category as typeof P0_CATEGORIES[number])) ||
      (activeFilter === "tovabbi" && P1_CATEGORIES.includes(t.category as typeof P1_CATEGORIES[number])) ||
      (activeFilter === "halado" && t.category === "episode");
    return matchesSearch && matchesFilter;
  });

  const filteredP0 = filteredTemplates.filter((t) =>
    P0_CATEGORIES.includes(t.category as typeof P0_CATEGORIES[number])
  );
  const filteredP1 = filteredTemplates.filter((t) =>
    P1_CATEGORIES.includes(t.category as typeof P1_CATEGORIES[number])
  );
  const filteredEpisodes = filteredTemplates.filter((t) => t.category === "episode");

  const handleCopy = async (template: LegalPromptTemplate) => {
    try {
      const { buildLegalPrompt } = await import("./legalPromptCatalog");
      await navigator.clipboard.writeText(buildLegalPrompt(template, props));
      setCopiedId(template.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setCopiedId(null);
    }
  };

  const renderCard = (template: LegalPromptTemplate) => (
    <button
      key={template.id}
      onClick={() => handleCopy(template)}
      className="w-full text-left border border-[#EEE7D9] p-2 hover:bg-[#FBF9F3] transition-colors rounded"
    >
      <span className="block text-[11px] font-semibold text-[#1F2821] leading-snug">
        {copiedId === template.id ? "Vágólapra másolva: " : ""}{template.label}
      </span>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-[9px] px-1.5 py-0.5 rounded border border-[#DDD7CA] bg-white text-[#7B776D]">
          {CATEGORY_LABELS[template.category] ?? template.category}
        </span>
        <span className="text-[10px] text-[#7B776D]">
          {template.requiresDocumentText && hasText ? "Dokumentumszöveggel" : "Csak prompt-váz"}
        </span>
      </div>
    </button>
  );

  return (
    <aside className={`border border-[#DDD7CA] bg-white flex flex-col ${props.className || ""}`}>
      <div className="p-3 border-b border-[#EEE7D9]">
        <p className="text-[9px] uppercase tracking-[0.2em] text-[#7B776D]">Prompt panel</p>
        <h3 className="mt-0.5 text-xs font-semibold text-[#1F2821]">Külső AI promptok</h3>
        <p className="mt-1 text-[10px] text-[#514D45] leading-snug">
          Adminiculum nem hív külső AI-t; a promptok vágólapra másolhatók.
        </p>
        {hasText && (
          <p className="mt-1 text-[10px] text-[#7B776D]">
            A prompt a jelenleg látható szöveget is tartalmazza.
          </p>
        )}
      </div>

      <div className="p-3 border-b border-[#EEE7D9] space-y-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Prompt keresése..."
          className="w-full text-[11px] border border-[#DDD7CA] rounded p-1.5 placeholder:text-[#B0AA9E] text-[#1F2821] focus:outline-none focus:border-[#B5A99A]"
        />
        <div className="flex gap-1 flex-wrap">
          {[
            { key: "all", label: "Mind" },
            { key: "fo", label: "Fő" },
            { key: "tovabbi", label: "További" },
            { key: "halado", label: "Haladó" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
                activeFilter === f.key
                  ? "bg-[#1F2821] text-white border-[#1F2821]"
                  : "bg-white text-[#7B776D] border-[#DDD7CA] hover:border-[#B5A99A]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {filteredP0.length > 0 && (
          <div className="space-y-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#7B776D]">
              Fő munkairatok
            </p>
            {filteredP0.map(renderCard)}
          </div>
        )}

        {filteredP1.length > 0 && (
          <div className="space-y-1">
            <button
              onClick={() => setP1Open((v) => !v)}
              className="w-full flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#7B776D] hover:text-[#1F2821] transition-colors"
            >
              <span>{p1Open ? "▾" : "▸"}</span>
              <span>További munkairatok</span>
              <span className="text-[10px] normal-case font-normal tracking-wide ml-1">
                ({p1Templates.length})
              </span>
            </button>
            {p1Open && filteredP1.map(renderCard)}
          </div>
        )}

        {filteredEpisodes.length > 0 && (
          <div className="space-y-1">
            <button
              onClick={() => setEpisodesOpen((v) => !v)}
              className="w-full flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#7B776D] hover:text-[#1F2821] transition-colors"
            >
              <span>{episodesOpen ? "▾" : "▸"}</span>
              <span>Haladó elemzési epizódok</span>
              <span className="text-[10px] normal-case font-normal tracking-wide ml-1">
                ({episodeTemplates.length})
              </span>
            </button>
            {episodesOpen && filteredEpisodes.map(renderCard)}
          </div>
        )}

        {filteredP0.length === 0 && filteredP1.length === 0 && filteredEpisodes.length === 0 && (
          <p className="text-[10px] text-[#7B776D] text-center py-4">Nincs találat.</p>
        )}
      </div>
    </aside>
  );
}
