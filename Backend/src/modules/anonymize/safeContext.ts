// ============================================================================
// SAFE ANONYMIZATION CONTEXT — WF04 prompt-adapter handoff (sanitized only).
// ============================================================================
//
// Pure adapter (no database, no I/O) that produces the ONLY document-bound
// context an external prompt adapter may receive: sanitized text, artifact
// identity, honest readiness and server-side association verification.
//
// The rehydration map (redactedItems original→token mapping), rehydrated
// content, raw AI responses and prompts are intentionally NOT part of this
// type and can never appear in its output. `isReady` is a data-derived
// availability flag; it is not a safety guarantee and not a claim that the
// mapping was verified. Association is verified server-side per
// AnonymousDocument row (sourceDocId + caseId) through the existing case
// authorization resolvers.

export interface SafeContextProvenance {
  /** Id the anonymization was created from (Document.id or ContractGeneration.id). */
  sourceId: string;
  caseId: string | null;
  clientId: string | null;
  /** AnonymousDocument row id — the artifact identity WF04 may reference. */
  documentId: string | null;
  /** Immutable version id when known; null when the lane has no persisted version binding. */
  versionId: string | null;
}

export interface SafeContextArtifact {
  anonymizedDocumentId: string | null;
  name: string | null;
  redactedText: string | null;
  rehydrationStatus: string | null;
  available: boolean;
}

export interface SafeContextReadiness {
  isReady: boolean;
  reasons: string[];
}

export interface SafeContextServerAssociation {
  mechanism: 'anonymous-document-row';
  verifiedBy: string[];
  fields: string[];
}

export interface SafeAnonymizationContext {
  provenance: SafeContextProvenance;
  artifact: SafeContextArtifact;
  readiness: SafeContextReadiness;
  serverAssociation: SafeContextServerAssociation;
  safetyNotes: string[];
}

const SAFETY_NOTES = [
  'This context never contains the rehydration map or raw originals.',
  'isReady describes availability of sanitized text, not proven safety.',
  'The server verifies association per AnonymousDocument row via case authorization.',
] as const;

export function buildSafeAnonymizationContext(input: {
  sourceId: string;
  caseId?: string | null;
  clientId?: string | null;
  documentId?: string | null;
  versionId?: string | null;
  anonymizedDocumentId?: string | null;
  name?: string | null;
  redactedText?: string | null;
  rehydrationStatus?: string | null;
}): SafeAnonymizationContext {
  const redactedText =
    typeof input.redactedText === 'string' && input.redactedText.trim().length > 0
      ? input.redactedText
      : null;
  const anonymizedDocumentId = input.anonymizedDocumentId || null;

  const available = redactedText !== null && anonymizedDocumentId !== null;

  const reasons: string[] = [];
  if (redactedText === null) reasons.push('Sanitized text is not available.');
  if (anonymizedDocumentId === null) reasons.push('Anonymized artifact identity is missing.');
  if (input.rehydrationStatus === 'FAILED') reasons.push('Rehydration status is FAILED.');

  return {
    provenance: {
      sourceId: input.sourceId,
      caseId: input.caseId ?? null,
      clientId: input.clientId ?? null,
      documentId: input.documentId ?? null,
      versionId: input.versionId ?? null,
    },
    artifact: {
      anonymizedDocumentId,
      name: input.name ?? null,
      redactedText,
      rehydrationStatus: input.rehydrationStatus ?? null,
      available,
    },
    readiness: {
      isReady: available && reasons.length === 0,
      reasons,
    },
    serverAssociation: {
      mechanism: 'anonymous-document-row',
      verifiedBy: [
        'resolveCaseFromAnonymousDocumentId',
        'requireAnonymizeReadAccess',
      ],
      fields: ['sourceDocId', 'caseId'],
    },
    safetyNotes: [...SAFETY_NOTES],
  };
}
