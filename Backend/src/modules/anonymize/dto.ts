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
 *
 * SECURITY: redactedItems are sanitized to safe fields only (type, replacement,
 * position). The `original` field containing PII is NEVER included.
 * customPrompt is NEVER included.
 */
export interface AnonymousDocumentWorking extends AnonymousDocumentSummary {
  redactedText: string | null;
  redactedItems: unknown;
}

/**
 * Sensitive DTO — full PII mapping, rehydrated content, original metadata.
 * Only for ADMIN/PARTNER/responsible lawyer/reviewer.
 * Includes full redactedItems (with original) and customPrompt.
 */
export interface AnonymousDocumentSensitive extends AnonymousDocumentWorking {
  rehydratedContent: string | null;
  aiResponseText: string | null;
  rehydrationWarnings: unknown;
  originalDocId: string | null;
  redactionProfile: unknown;
  redactedItemsFull: unknown;
  customPrompt: string | null;
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

/**
 * Sanitize redactedItems for Working DTO exposure.
 * Strips the `original` field (PII) from each item, keeping only safe fields:
 * type, replacement, position.
 */
export function sanitizeRedactedItems(items: unknown): unknown[] | null {
  if (!items || !Array.isArray(items)) return null;
  return items.map((item: any) => {
    if (!item || typeof item !== 'object') return item;
    const safe: Record<string, unknown> = {};
    if (item.type != null) safe.type = item.type;
    if (item.replacement != null) safe.replacement = item.replacement;
    if (typeof item.position === 'number') {
      safe.position = item.position;
    } else if (item.position && typeof item.position === 'object' && !Array.isArray(item.position)) {
      const position: Record<string, number> = {};
      for (const key of ['start', 'end', 'line']) {
        if (typeof item.position[key] === 'number') position[key] = item.position[key];
      }
      safe.position = position;
    }
    // `original` is NEVER included — it contains PII
    return safe;
  });
}

export function toWorkingAnonymizationResult(result: {
  success: boolean;
  anonymizedDocumentId?: string;
  redactedText?: string | null;
  redactedItems?: unknown;
}) {
  return {
    success: result.success,
    anonymizedDocumentId: result.anonymizedDocumentId ?? null,
    redactedText: result.redactedText ?? null,
    redactedItems: sanitizeRedactedItems(result.redactedItems),
  };
}

export function toSensitiveClientRedactionProfile(profile: Record<string, unknown>) {
  const fields = [
    'id', 'clientId', 'fullName', 'aliases', 'addresses', 'taxId', 'personalId',
    'bankAccounts', 'phones', 'emails', 'patterns', 'personas', 'useLLM', 'llmPrompt',
    'createdAt', 'updatedAt',
  ];
  return Object.fromEntries(fields
    .filter((field) => Object.prototype.hasOwnProperty.call(profile, field))
    .map((field) => [field, profile[field]]));
}

export function toWorking(doc: AnyDoc): AnonymousDocumentWorking {
  return {
    ...toSummary(doc),
    redactedText: doc.content ?? null,
    redactedItems: sanitizeRedactedItems(doc.redactedItems),
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
    redactedItemsFull: doc.redactedItems ?? null, // full persisted items including original
    customPrompt: doc.customPrompt ?? null, // full customPrompt — only behind sensitive access
  };
}
