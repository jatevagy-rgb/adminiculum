"use client";

import React, { useState } from "react";
import { getCaseWorkspace } from "@/lib/api";
import { getCaseStatusLabel } from "@/lib/caseLabels";
import { AdminButton } from "@/components/adminiculum/ui";
import {
  copyDirectPromptToClipboard,
  ClipboardFallbackModal,
} from "./clipboard";
import {
  buildDirectCurrentStatePrompt,
  buildDirectCaseContextPrompt,
  buildDirectGoalActionPlanPrompt,
  buildDirectRiskMatrixPrompt,
  buildDirectCatalogPrompt,
  type SanitizedContextSource,
} from "./safeContextAdapter";

export interface WordCompactPromptCollectionProps {
  caseId: string;
  clientId: string | null;
  readOnly?: boolean;
  onChanged?: () => void;
  sanitizedContext?: SanitizedContextSource;
}

interface PromptActionItem {
  id: string;
  label: string;
  category: string;
  tooltip: string;
  buildPrompt: (params: {
    caseNumber?: string;
    caseTitle?: string;
    statusLabel?: string;
    urgencyLabel?: string;
    deadline?: string | null;
    responsibleName?: string | null;
    nextStep?: string | null;
    originReason?: string | null;
    currentSituation?: string | null;
    description?: string | null;
    clientExpectation?: string | null;
    urgentAction?: string | null;
    sanitizedContext?: SanitizedContextSource | null;
  }) => string;
}

const PROMPT_ACTIONS: PromptActionItem[] = [
  {
    id: "current-state",
    label: "Aktuális állás",
    category: "Alap",
    tooltip: "Ügy aktuális helyzetét összegző prompt",
    buildPrompt: (p) => buildDirectCurrentStatePrompt(p),
  },
  {
    id: "case-context",
    label: "Ügykontextus",
    category: "Alap",
    tooltip: "Miről szól az ügy és mi az indoka",
    buildPrompt: (p) => buildDirectCaseContextPrompt(p),
  },
  {
    id: "goal-action-plan",
    label: "Cél és teendők",
    category: "Alap",
    tooltip: "Ügyfél elvárása és következő lépések akcióterve",
    buildPrompt: (p) => buildDirectGoalActionPlanPrompt(p),
  },
  {
    id: "risk-matrix",
    label: "Kockázati mátrix",
    category: "Kockázat",
    tooltip: "Szerződéses és jogi kockázati táblázat prompt",
    buildPrompt: (p) => buildDirectRiskMatrixPrompt(p),
  },
  {
    id: "executiveSummary",
    label: "Vezetői összefoglaló",
    category: "Elemzés",
    tooltip: "Partner/ügyvéd döntési összefoglaló",
    buildPrompt: (p) => buildDirectCatalogPrompt("executiveSummary", p),
  },
  {
    id: "detailedClauseAnalysis",
    label: "Szerződéses elemzés",
    category: "Kockázat",
    tooltip: "Pontonkénti szerződéselemzés javaslatokkal",
    buildPrompt: (p) => buildDirectCatalogPrompt("detailedClauseAnalysis", p),
  },
  {
    id: "missingData",
    label: "Hiányzó adatok",
    category: "Elemzés",
    tooltip: "Bekérendő adatok és iratok listája",
    buildPrompt: (p) => buildDirectCatalogPrompt("missingData", p),
  },
  {
    id: "negotiationStrategy",
    label: "Tárgyalási stratégia",
    category: "Elemzés",
    tooltip: "Kemény és engedhető pontok felkészülése",
    buildPrompt: (p) => buildDirectCatalogPrompt("negotiationStrategy", p),
  },
  {
    id: "redFlagsQuickList",
    label: "Piros zászlók",
    category: "Kockázat",
    tooltip: "Legfeljebb 10 legkritikusabb jogi kockázat",
    buildPrompt: (p) => buildDirectCatalogPrompt("redFlagsQuickList", p),
  },
];

export function WordCompactPromptCollection({
  caseId,
  sanitizedContext,
}: WordCompactPromptCollectionProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCopy = async (action: PromptActionItem) => {
    setError(null);
    try {
      let caseNumber = "";
      let caseTitle = "";
      let statusLabel = "";
      let urgencyLabel = "";
      let deadline: string | null = null;
      let responsibleName: string | null = null;
      let nextStep: string | null = null;
      let originReason: string | null = null;
      let currentSituation: string | null = null;
      let description: string | null = null;
      let clientExpectation: string | null = null;
      let urgentAction: string | null = null;

      if (caseId) {
        const ws = await getCaseWorkspace(caseId).catch(() => null);
        if (ws) {
          caseNumber = ws.case.caseNumber;
          caseTitle = ws.case.title;
          statusLabel = getCaseStatusLabel(ws.case.status);
          urgencyLabel = ws.cockpit.urgency || "Normál";
          deadline = ws.case.deadline;
          responsibleName = ws.cockpit.responsible?.name || null;
          nextStep = ws.cockpit.nextStep?.label || null;
          originReason = ws.case.startingContext?.originReason || null;
          currentSituation = ws.case.startingContext?.currentSituation || null;
          description = ws.case.description || null;
          clientExpectation = ws.case.startingContext?.clientExpectation || null;
          urgentAction = ws.case.startingContext?.urgentAction || null;
        }
      }

      const promptText = action.buildPrompt({
        caseNumber,
        caseTitle,
        statusLabel,
        urgencyLabel,
        deadline,
        responsibleName,
        nextStep,
        originReason,
        currentSituation,
        description,
        clientExpectation,
        urgentAction,
        sanitizedContext,
      });

      const res = await copyDirectPromptToClipboard(promptText);
      if (res.success) {
        setCopiedId(action.id);
        setTimeout(() => setCopiedId(null), 2500);
      } else {
        setFallbackText(promptText);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "A prompt másolása sikertelen.");
    }
  };

  return (
    <div
      className="space-y-3 rounded-lg border border-[var(--adm-border)] bg-white p-4 shadow-sm"
      data-testid="word-compact-prompt-collection"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--adm-border)] pb-2.5">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">
            Gyors promptok vágólapra
          </span>
          <h4 className="text-[14px] font-bold text-[var(--adm-text)]">
            Közvetlen AI prompt gyűjtemény
          </h4>
        </div>
        <span className="text-[11px] text-[var(--adm-text-muted)]">
          1-kattintásos másolás külső LLM-hez
        </span>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-2 text-[11.5px] font-medium text-red-800"
          data-testid="compact-prompts-error"
        >
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3">
        {PROMPT_ACTIONS.map((action) => {
          const isCopied = copiedId === action.id;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => void handleCopy(action)}
              title={action.tooltip}
              data-testid={`compact-prompt-btn-${action.id}`}
              className={`flex min-h-[44px] flex-col items-start justify-center rounded border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-green-800)] ${
                isCopied
                  ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                  : "border-[var(--adm-border)] bg-[var(--adm-surface)] text-[var(--adm-text)] hover:border-[#2D4A7C] hover:bg-[#EAEFF6]"
              }`}
            >
              <span className="text-[10px] font-semibold text-[var(--adm-text-muted)]">
                {action.category}
              </span>
              <span className="text-[12px] font-bold">
                {isCopied ? "✓ Másolva!" : action.label}
              </span>
            </button>
          );
        })}
      </div>

      <ClipboardFallbackModal
        open={Boolean(fallbackText)}
        text={fallbackText || ""}
        onClose={() => setFallbackText(null)}
      />
    </div>
  );
}
