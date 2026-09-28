/**
 * Case Context V2 — workforce-internal API client.
 *
 * Mirrors the Backend PR #393 contract (CaseContextSource):
 *  - create PASTED / COMMUNICATION sources (immutable rawText, server-verified
 *    provenance for communications)
 *  - list sources
 *  - detect (deterministic, returns sourceHash + optionsDigest + candidates)
 *  - anonymize (one-shot apply, fail-closed on stale review)
 *
 * Manual terms are EPHEMERAL by contract: they are accepted only by the
 * detect/anonymize endpoints and are never persisted. This module exposes them
 * as request payloads only — no caching, no storage.
 *
 * Internal workforce surface only; never used from the Client Portal.
 */

import { fetchApi } from "./api";

export type CaseContextOrigin = "PASTED" | "COMMUNICATION";

export type SensitiveCategory =
  | "EMAIL"
  | "PHONE"
  | "IBAN"
  | "TAX_ID"
  | "IDENTIFIER"
  | "ADDRESS"
  | "PERSON"
  | "ORGANIZATION"
  | "PROJECT"
  | "BUSINESS_SECRET"
  | "OTHER_SENSITIVE";

export type CandidateConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface ManualSensitiveTerm {
  term: string;
  category: SensitiveCategory;
}

export interface SafeAnonymizationSnapshot {
  algorithmRevision: number;
  sourceHash: string;
  resultHash: string;
  appliedCount: number;
  categoryCounts: Record<string, number>;
  warnings: string[];
  mappingLocation: "in-memory-only";
}

export interface CaseContextSourceDTO {
  id: string;
  origin: CaseContextOrigin;
  sourceCommunicationId: string | null;
  rawText: string;
  anonymizedText: string | null;
  anonymizationSnapshot: SafeAnonymizationSnapshot | null;
  createdBy: { id: string; name: string; email: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewCandidate {
  id: string;
  type: SensitiveCategory;
  start: number;
  end: number;
  originalText: string;
  proposedReplacement: string;
  detector: string;
  confidence: CandidateConfidence;
  note?: string;
}

export interface DetectResponse {
  sourceHash: string;
  optionsDigest: string;
  candidates: ReviewCandidate[];
}

export interface AnonymizeResponse {
  id: string;
  origin: CaseContextOrigin;
  anonymizedText: string;
  anonymizationSnapshot: SafeAnonymizationSnapshot;
  updatedAt: string;
}

/** Backend error codes that mean the review is stale and Detect must run again. */
export const STALE_REVIEW_CODES: ReadonlySet<string> = new Set([
  "SOURCE_HASH_MISMATCH",
  "OPTIONS_DIGEST_MISMATCH",
  "UNKNOWN_CANDIDATE_ID",
  "CONTEXT_SOURCE_ALREADY_ANONYMIZED",
]);

export const SENSITIVE_CATEGORY_ORDER: readonly SensitiveCategory[] = [
  "PERSON",
  "ORGANIZATION",
  "EMAIL",
  "PHONE",
  "IBAN",
  "TAX_ID",
  "IDENTIFIER",
  "ADDRESS",
  "PROJECT",
  "BUSINESS_SECRET",
  "OTHER_SENSITIVE",
];

export const SENSITIVE_CATEGORY_LABELS: Record<SensitiveCategory, string> = {
  PERSON: "Személy",
  ORGANIZATION: "Szervezet",
  EMAIL: "E-mail cím",
  PHONE: "Telefonszám",
  IBAN: "Bankszámlaszám",
  TAX_ID: "Adószám",
  IDENTIFIER: "Azonosító",
  ADDRESS: "Cím",
  PROJECT: "Projekt",
  BUSINESS_SECRET: "Üzleti titok",
  OTHER_SENSITIVE: "Egyéb érzékeny adat",
};

export const CONFIDENCE_LABELS: Record<CandidateConfidence, string> = {
  HIGH: "Nagy bizonyosság",
  MEDIUM: "Közepes bizonyosság",
  LOW: "Alacsony bizonyosság",
};

export function categoryLabel(category: SensitiveCategory): string {
  return SENSITIVE_CATEGORY_LABELS[category] ?? category;
}

const casePath = (caseId: string) => `/cases/${encodeURIComponent(caseId)}/context-sources`;

export async function createPastedCaseContextSource(caseId: string, rawText: string): Promise<CaseContextSourceDTO> {
  return fetchApi<CaseContextSourceDTO>(casePath(caseId), {
    method: "POST",
    body: JSON.stringify({ rawText }),
  });
}

export async function createCommunicationCaseContextSource(caseId: string, communicationId: string): Promise<CaseContextSourceDTO> {
  return fetchApi<CaseContextSourceDTO>(`${casePath(caseId)}/from-communication`, {
    method: "POST",
    body: JSON.stringify({ communicationId }),
  });
}

export async function listCaseContextSources(caseId: string): Promise<CaseContextSourceDTO[]> {
  const response = await fetchApi<{ items: CaseContextSourceDTO[] }>(casePath(caseId), { cache: "no-store" });
  return response.items ?? [];
}

export async function detectCaseContextSource(
  caseId: string,
  sourceId: string,
  manualTerms: ManualSensitiveTerm[],
): Promise<DetectResponse> {
  return fetchApi<DetectResponse>(`${casePath(caseId)}/${encodeURIComponent(sourceId)}/detect`, {
    method: "POST",
    body: JSON.stringify({ manualTerms }),
  });
}

export async function anonymizeCaseContextSource(
  caseId: string,
  sourceId: string,
  payload: {
    sourceHash: string;
    optionsDigest: string;
    manualTerms: ManualSensitiveTerm[];
    approvedCandidateIds: string[];
  },
): Promise<AnonymizeResponse> {
  return fetchApi<AnonymizeResponse>(`${casePath(caseId)}/${encodeURIComponent(sourceId)}/anonymize`, {
    method: "POST",
    body: JSON.stringify({
      sourceHash: payload.sourceHash,
      optionsDigest: payload.optionsDigest,
      manualTerms: payload.manualTerms,
      approvedCandidateIds: payload.approvedCandidateIds,
    }),
  });
}
