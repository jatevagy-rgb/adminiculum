"use client";

import { useEffect, useState } from "react";
import { LEGAL_PROMPT_CATALOG, LegalPromptTemplate } from "./legalPromptCatalog";
import { listAiPromptTemplates, type AiPromptTemplate } from "@/lib/api";
import { AIPromptPreparationModal } from "@/components/ai-prompts/AIPromptPreparationModal";
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
  review: "Áttekintés",
  episode: "Epizód",
};

const P0_CATEGORIES = ["analysis", "risk"] as const;
const P1_CATEGORIES = ["modification", "handoff", "communication", "formatting", "review"] as const;

const COPY_FAILURE_MESSAGE = "Nem sikerült a vágólapra másolni. Jelöld ki és másold kézzel.";

export function AIPromptPanel(props: AIPromptPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [canonicalTemplates, setCanonicalTemplates] = useState<AiPromptTemplate[]>([]);
  const [canonicalLoaded, setCanonicalLoaded] = useState(false);
  const [preparationOpen, setPreparationOpen] = useState(false);
  const [preselectedTemplateId, setPreselectedTemplateId] = useState<string | null>(null);
  const [episodesOpen, setEpisodesOpen] = useState(false);
  const [p1Open, setP1Open] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const hasText = Boolean(props.anonymizedText?.trim());

  useEffect(() => {
    let active = true;
    listAiPromptTemplates()
      .then((res) => {
        if (active) setCanonicalTemplates(res.items);
      })
      .catch(() => {
        // Canonical templates unavailable; fall back to the static catalog.
      })
      .finally(() => {
        if (active) setCanonicalLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Canonical Prompt System 2.0 templates never build their external handoff in
  // the frontend. Selecting one opens the canonical preparation flow, which calls
  // prepareAiPrompt() and returns the server-generated draft.externalPromptText
  // that is the only authorized external handoff.
  const openPreparation = (templateId: string) => {
    if (!props.caseId) return;
    setPreselectedTemplateId(templateId);
    setPreparationOpen(true);
  };

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

  // Static catalog prompt copy — clipboard-only, clearly fallback/advanced.
  const handleCopy = async (template: LegalPromptTemplate) => {
    try {
      const { buildLegalPrompt } = await import("./legalPromptCatalog");
      await navigator.clipboard.writeText(buildLegalPrompt(template, props));
      setCopiedId(template.id);
      setCopyError(null);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setCopyError(COPY_FAILURE_MESSAGE);
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
    <>
      <aside className={`border border-[#DDD7CA] bg-white flex flex-col ${props.className || ""}`}>
        <div className="p-3 border-b border-[#EEE7D9]">
          <p className="text-[9px] uppercase tracking-[0.2em] text-[#7B776D]">AI munkafolyamat</p>
          <h3 className="mt-0.5 text-xs font-semibold text-[#1F2821]">Külső AI promptok</h3>
          <p className="mt-1 text-[10px] text-[#514D45] leading-snug">
            Adminiculum nem hív külső AI-t; a promptok vágólapra másolhatók.
          </p>
          {copyError && (
            <p className="mt-1 text-[10px] text-[#8b3a3a]">{copyError}</p>
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
          {/* Canonical Prompt System 2.0 templates — primary workflow (prepare + draft lifecycle). */}
          <div className="space-y-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#7B776D]">
              Kanonikus jogi promptok
            </p>
            {canonicalTemplates.length > 0 ? (
              canonicalTemplates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => openPreparation(t.id)}
                  disabled={!props.caseId}
                  className="w-full text-left border border-[#DDE5DC] p-2 hover:bg-[#F0F5F1] transition-colors rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="block text-[11px] font-semibold text-[#1F2821] leading-snug">
                    {t.title}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[9px] px-1.5 py-0.5 rounded border border-[#C9D5CB] bg-white text-[#23472F]">
                      v{t.version}
                    </span>
                    <span className="text-[10px] text-[#7B776D] truncate">
                      {t.description || t.legalWorkCategory}
                    </span>
                  </div>
                </button>
              ))
            ) : (
              <p className="text-[10px] text-[#7B776D]">
                {canonicalLoaded
                  ? "Nincs aktív kanonikus prompt-sablon. Az alábbi egyedi sablonok érhetők el."
                  : "Kanonikus promptok betöltése..."}
              </p>
            )}
            {canonicalTemplates.length > 0 && !props.caseId && (
              <p className="text-[10px] text-[#7B776D]">
                A kanonikus előkészítés ügy-kontextusból érhető el.
              </p>
            )}
          </div>

          {/* Static legal prompt catalog — preserved fallback / advanced prompts. */}
          <div className="space-y-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#B0AA9E]">
              Egyedi prompt-sablonok
            </p>
          </div>

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

      {preparationOpen && props.caseId ? (
        <AIPromptPreparationModal
          caseId={props.caseId}
          documentId={props.documentId}
          initialTemplateId={preselectedTemplateId ?? undefined}
          onClose={() => {
            setPreparationOpen(false);
            setPreselectedTemplateId(null);
          }}
        />
      ) : null}
    </>
  );
}
