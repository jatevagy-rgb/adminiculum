"use client";

/**
 * Case Workspace "AI eredmények" result tile (CASE-WORKSPACE-AI-OUTPUT-TILE).
 *
 * Read-only projection of the canonical AI output persistence: the
 * `AiPromptDraft` records already stored for this case by the existing prompt
 * preparation/import flow. This component never persists anything, never
 * builds a prompt, and never calls an external AI. The only data source is
 * `GET /ai-prompts/cases/:caseId/drafts` (case-scoped, case-read access).
 *
 * Only drafts with an imported AI response are results; preparation-only
 * drafts (status PREPARED, no imported response) are deliberately not shown
 * here, so the tile never implies that an AI has produced an output.
 */
import React, { useCallback, useEffect, useState } from "react";
import { AdminButton } from "@/components/adminiculum/ui";
import { listAiPromptDraftsForCase, type AiPromptDraft } from "@/lib/api";
import { ACCENT, ActionableEmpty, CockpitSection, fmtDateTime } from "@/components/cases/CaseCockpitPanels";
import { statusLabel } from "@/components/ai-prompts/AIPromptPreparationModal";

const LEGAL_WORK_CATEGORY_LABELS: Record<string, string> = {
  CONTRACT_REVIEW: "Szerződés-elemzés",
  CONTRACT_DRAFTING: "Szerződéstervezet",
  LEGAL_RESEARCH: "Jogi kutatás",
  CASE_SUMMARY: "Ügy-összefoglaló",
  DUE_DILIGENCE: "Átvilágítás",
  COMPLIANCE_REVIEW: "Compliance-elemzés",
  CLIENT_EXPLANATION: "Ügyfél-tájékoztatás",
  CLAUSE_ANALYSIS: "Klauzula-elemzés",
  GENERAL_LEGAL_ANALYSIS: "Általános jogi elemzés",
};

function categoryLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return LEGAL_WORK_CATEGORY_LABELS[value] ?? "Egyéb jogi munka";
}

/** A canonical AI result exists only when an AI response was imported. */
export function hasAiOutput(draft: AiPromptDraft): boolean {
  return draft.importedResponse !== null && draft.importedResponse !== undefined;
}

export type AiResultRow = {
  id: string;
  title: string;
  typeLabel: string | null;
  stableKey: string;
  version: number;
  status: string;
  createdAt: string;
  documentNames: string[];
};

export function toAiResultRow(
  draft: AiPromptDraft,
  documents: Array<{ id: string; fileName: string }>,
): AiResultRow {
  const snapshot = draft.promptTemplateSnapshot;
  const title = snapshot?.title?.trim()
    ? snapshot.title
    : `${draft.promptTemplateStableKey} · v${draft.promptTemplateVersion}`;
  const documentNameById = new Map(documents.map((document) => [document.id, document.fileName]));
  const documentNames = (draft.sourceDocumentIds ?? [])
    .map((id) => documentNameById.get(id))
    .filter((name): name is string => Boolean(name));
  return {
    id: draft.id,
    title,
    typeLabel: categoryLabel(snapshot?.legalWorkCategory),
    stableKey: draft.promptTemplateStableKey,
    version: draft.promptTemplateVersion,
    status: draft.status,
    createdAt: draft.createdAt,
    documentNames,
  };
}

export interface AIResultsListProps {
  items: AiResultRow[];
  onOpen: (draftId: string) => void;
}

/** Presentational list: renders only canonical public fields, never prompt internals. */
export function AIResultsList({ items, onOpen }: AIResultsListProps) {
  if (items.length === 0) return null;
  return (
    <ul data-testid="ai-results-list" className="divide-y divide-[rgba(22,32,26,0.06)]">
      {items.map((item) => (
        <li key={item.id} data-testid="ai-result-item" className="px-3 py-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-[12.5px] font-semibold text-[var(--adm-text)]">{item.title}</span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${ACCENT.petrol.soft} ${ACCENT.petrol.text}`}>
              {statusLabel(item.status)}
            </span>
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--adm-text-muted)]">
            {item.typeLabel ? <span data-testid="ai-result-type">{item.typeLabel}</span> : null}
            {item.typeLabel ? <span aria-hidden="true">·</span> : null}
            <span data-testid="ai-result-created">{fmtDateTime(item.createdAt)}</span>
            {item.documentNames.length > 0 ? (
              <>
                <span aria-hidden="true">·</span>
                <span data-testid="ai-result-documents" className="truncate">
                  {item.documentNames.slice(0, 2).join(", ")}
                  {item.documentNames.length > 2 ? ` +${item.documentNames.length - 2}` : ""}
                </span>
              </>
            ) : null}
          </p>
          <div className="mt-1.5">
            <AdminButton variant="primary" size="xs" data-testid="ai-result-open" onClick={() => onOpen(item.id)}>
              Megnyitás
            </AdminButton>
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface AIResultsTileProps {
  caseId: string;
  documents: Array<{ id: string; fileName: string }>;
  refreshKey?: number;
  onOpen: (draftId: string) => void;
  onOpenPreparation?: () => void;
}

export function AIResultsTile({ caseId, documents, refreshKey = 0, onOpen, onOpenPreparation }: AIResultsTileProps) {
  const [drafts, setDrafts] = useState<AiPromptDraft[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const result = await listAiPromptDraftsForCase(caseId);
      setDrafts(result.items);
    } catch {
      setDrafts(null);
      setLoadError("Az AI-eredmények most nem tölthetők be.");
    }
  }, [caseId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const rows = (drafts ?? [])
    .filter((draft) => hasAiOutput(draft))
    .map((draft) => toAiResultRow(draft, documents));

  return (
    <CockpitSection id="ck-ai-results" title="AI eredmények" accent="petrol" count={rows.length}>
      {loadError ? (
        <ActionableEmpty message={loadError} actionLabel="Újratöltés" onAction={() => void load()} />
      ) : drafts === null ? (
        <p className="px-3 py-2 text-[11px] text-[var(--adm-text-muted)]">Betöltés…</p>
      ) : rows.length === 0 ? (
        <ActionableEmpty
          message="Még nincs AI-eredmény ezen az ügyön."
          actionLabel="AI előkészítés"
          onAction={onOpenPreparation}
        />
      ) : (
        <AIResultsList items={rows} onOpen={onOpen} />
      )}
    </CockpitSection>
  );
}
