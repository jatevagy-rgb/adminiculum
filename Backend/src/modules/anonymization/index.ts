/**
 * Anonymization foundation — public surface and integration seams
 * (ANONYMIZATION-FOUNDATION-1).
 *
 * This module is a SAFE, isolated library. It has no routes, no database
 * persistence, no Prisma models, no external AI calls and no file I/O. It is a
 * pure in-memory DETECT → REVIEW → APPLY pipeline.
 *
 * Integration seams below are TYPE-ONLY contracts for future work packages.
 * They document the intended flow WITHOUT wiring any production path:
 *
 *   DocumentVersion
 *     → authorized source-text extraction
 *     → detectCandidates()
 *     → human approval
 *     → applyApprovedRedactions()
 *     → buildSanitizedPackage()   // safe export — never contains the mapping
 *     → external AI work package / Contract Workspace
 *
 * The safe exported object contains only the sanitized content and non-content
 * metadata. The reversible original→placeholder mapping exists only inside the
 * in-memory operation result (runAnonymization().mapping) and must never be
 * persisted, logged, or exported.
 */

export * from './types';

export { foldForMatch, findOccurrences } from './textNormalization';
export type { Occurrence } from './textNormalization';

export { placeholderFor, PseudonymAssigner } from './pseudonyms';

export {
  detectExactTermCandidates,
  detectRegexCandidates,
  EXACT_TERM_PRECEDENCE,
  REGEX_PRECEDENCE,
} from './detectors';

export {
  AnonymizationInputTooLargeError,
  applyApprovedRedactions,
  buildInternalMapping,
  buildResult,
  buildSanitizedPackage,
  createApprovedRedactions,
  detectCandidates,
  runAnonymization,
} from './engine';

import type { SanitizedExternalPackage } from './types';

/**
 * Integration seam — authorization gate (HR-CONFIDENTIAL compatibility).
 *
 * Anonymization must NEVER be treated as authorization. An unauthorized user
 * may not anonymize a document they cannot read. Future integration MUST call
 * the canonical document authorization before extracting source text for
 * candidate detection. This type exists so the seam is visible; the foundation
 * itself contains no route and cannot be reached without an authorized source
 * text having been obtained upstream.
 */
export interface DocumentAuthorizationGate {
  /**
   * Returns true only if the requesting principal may READ the document version
   * whose source text will be anonymized. Implementations must reuse the
   * canonical document authorization (including HR_CONFIDENTIAL handling) —
   * never a parallel copy of the policy.
   */
  assertCanReadSourceText(params: {
    documentVersionId: string;
    principalId: string;
  }): Promise<void>;
}

/**
 * Integration seam — source text extraction for the future work package flow.
 *
 * The provider is responsible for extracting text from the canonical
 * DocumentVersion after the authorization gate has passed. The foundation never
 * writes into the canonical document: anonymization produces a DERIVED working
 * representation, never a mutation of Document / DocumentVersion.
 */
export interface AnonymizationSourceProvider {
  readAuthorizedSourceText(params: { documentVersionId: string; principalId: string }): Promise<string>;
}

/**
 * Integration seam — external AI work package producer.
 *
 * NOT implemented in this wave. This is the documented contract a future
 * ExternalAiWorkPackage or Contract Workspace integration will satisfy: the
 * exported object is `buildSanitizedPackage()` output — sanitized content and
 * metadata ONLY. The reversible mapping is intentionally out of scope for
 * anything that leaves the canonical environment.
 */
export type ExternalAiWorkPackageProducer = (params: {
  documentVersionId: string;
  sanitizedPackage: SanitizedExternalPackage;
}) => Promise<{ externalReferenceId: string }>;