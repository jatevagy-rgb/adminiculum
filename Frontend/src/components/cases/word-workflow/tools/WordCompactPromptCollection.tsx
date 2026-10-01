"use client";

import React, { useEffect, useRef, useState } from "react";
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
  resolveSafePromptContext,
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
    caseId?: string;
    clientId?: string | null;
    documentId?: string | null;
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
  clientId,
  sanitizedContext,
}: WordCompactPromptCollectionProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const [fallbackScope, setFallbackScope] = useState<string | null>(null);
  const [copiedScope, setCopiedScope] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scope = `${caseId}\u0000${clientId ?? ""}\u0000${sanitizedContext?.documentId ?? ""}\u0000${sanitizedContext?.sourceId ?? ""}\u0000${sanitizedContext?.documentVersionId ?? ""}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => {
    setCopiedId(null);
    setFallbackText(null);
    setError(null);
    return () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); };
  }, [scope]);

  const handleCopy = async (action: PromptActionItem) => {
    const requestScope = scope;
    setError(null);
    try {
      const safeContext = await resolveSafePromptContext(sanitizedContext, { caseId, clientId, documentId: sanitizedContext?.documentId });
      if (currentScope.current !== requestScope) return;

      const promptText = action.buildPrompt({
        caseId,
        clientId,
        documentId: sanitizedContext?.documentId,
        sanitizedContext: safeContext,
      });

      const res = await copyDirectPromptToClipboard(promptText);
      if (currentScope.current !== requestScope) return;
      if (res.success) {
        setCopiedId(action.id);
        setCopiedScope(requestScope);
        if (copiedTimer.current) clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopiedId(null), 2500);
      } else {
        setFallbackText(promptText);
        setFallbackScope(requestScope);
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
          const isCopied = copiedId === action.id && copiedScope === scope;
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
                  : "border-[var(--adm-border)] bg-[var(--adm-surface)] text-[var(--adm-text)] hover:border-[var(--adm-blue-700)] hover:bg-[var(--adm-surface)]"
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
        open={Boolean(fallbackText && fallbackScope === scope)}
        text={fallbackScope === scope ? fallbackText || "" : ""}
        onClose={() => setFallbackText(null)}
      />
    </div>
  );
}
