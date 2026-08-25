// ============================================================================
// ANONYMIZATION DTOs — Three-level response shaping (Summary / Working / Sensitive)
// ============================================================================

/**
 * Summary DTO — safe metadata only, no PII, no content.
 * Returned in list endpoints and to any authenticated user with case read access.
 */
export interface AnonymousDocumentSummary {
  id: string;
  name: string;
  caseId: string | null;
  sourceDocId: string | null;
  aiTask: string | null;
  rehydrationStatus: string | null;
  rehydratedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  patternCount: number | null;
}

/**
 * Working DTO — anonymized content visible in workspace.
 * Contains redactedText and redactedItems (token→replacement mapping).
 * No PII mapping, no rehydrated content, no customPrompt.
 */
export interface AnonymousDocumentWorking extends AnonymousDocumentSummary {
  redactedText: string | null;
  redactedItems: unknown;
  customPrompt: string | null;
}

/**
 * Sensitive DTO — full PII mapping, rehydrated content, original metadata.
 * Only for ADMIN/PARTNER/responsible lawyer/reviewer.
 */
export interface AnonymousDocumentSensitive extends AnonymousDocumentWorking {
  rehydratedContent: string | null;
  aiResponseText: string | null;
  rehydrationWarnings: unknown;
  originalDocId: string | null;
  redactionProfile: unknown;
}

// ---------------------------------------------------------------------------
// Builder functions
// ---------------------------------------------------------------------------

type AnyDoc = {
  id: string;
  name: string | null;
  caseId: string | null;
  sourceDocId: string | null;
  aiTask: string | null;
  rehydrationStatus: string | null;
  rehydratedAt: Date | null;
  createdAt: Date;
  updatedAt?: Date | null;
  patternCount: number | null;
  content?: string | null;
  redactedItems?: unknown;
  customPrompt?: string | null;
  rehydratedContent?: string | null;
  aiResponseText?: string | null;
  rehydrationWarnings?: unknown;
  originalDocId?: string | null;
};

export function toSummary(doc: AnyDoc): AnonymousDocumentSummary {
  return {
    id: doc.id,
    name: doc.name ?? '[ANONYMIZED]',
    caseId: doc.caseId,
    sourceDocId: doc.sourceDocId,
    aiTask: doc.aiTask,
    rehydrationStatus: doc.rehydrationStatus,
    rehydratedAt: doc.rehydratedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt ?? doc.createdAt,
    patternCount: doc.patternCount,
  };
}

export function toWorking(doc: AnyDoc): AnonymousDocumentWorking {
  return {
    ...toSummary(doc),
    redactedText: doc.content ?? null,
    redactedItems: doc.redactedItems ?? null,
    customPrompt: doc.customPrompt ?? null,
  };
}

export function toSensitive(doc: AnyDoc): AnonymousDocumentSensitive {
  return {
    ...toWorking(doc),
    rehydratedContent: doc.rehydratedContent ?? null,
    aiResponseText: doc.aiResponseText ?? null,
    rehydrationWarnings: doc.rehydrationWarnings ?? null,
    originalDocId: doc.originalDocId ?? null,
    redactionProfile: null, // caller should populate if needed
  };
}
