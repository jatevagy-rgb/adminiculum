# PACK MANIFEST: Deterministic Anonymization Foundation

**Status:** FOUNDATION (isolated, integration-ready)
**Branch:** `opencode/anonymization-foundation`
**Baseline:** `d57f88be1b02bc52942cbaa6c8c81243fcd527bc` (Phase 3 security-reviewed)
**Version:** v1.0.0

---

## 1. Purpose

Safe anonymization/pseudonymization foundation for workflows where legal text
may later be used outside the canonical document environment, including external
AI work packages. It makes it easier to remove or replace: personal names, email
addresses, phone numbers, postal addresses, personal identifiers, tax/registration
identifiers, bank account / IBAN data, customer-confidential terms, and manually
selected business secrets.

This is NOT an AI anonymization engine: no runtime LLM, no embeddings, no third-party
anonymization API. Everything is deterministic and runs in-process.

## 2. Critical Document Invariant

The canonical `Document` → `DocumentVersion` must NEVER be modified. Anonymization
produces a DERIVED working representation. The foundation:

- never overwrites `DocumentVersion`
- never alters the original uploaded file
- never marks an anonymized derivative as the original
- never creates a fake `DocumentVersion`
- never bypasses document permissions (no route exists in this wave)

Word remains the primary document editor.

## 3. Two-Stage Model

```
DETECT → REVIEW → APPLY
```

There is NO path from DETECT to publish/export. Detection produces reviewable
candidates; a human decides which are approved; ONLY approved redactions are
applied. Unapproved candidates leave the text byte-for-byte unchanged.

## 4. Architecture

Pure in-memory TypeScript library, isolated under `Backend/src/modules/anonymization/`
(distinct from the AI-assisted `anonymize/` module, which is protected and untouched).

| File | Responsibility |
|------|----------------|
| `types.ts` | Core typed contract (candidate / redaction / result / safe export) |
| `textNormalization.ts` | Accent/case folding + occurrence search for exact terms |
| `pseudonyms.ts` | Deterministic placeholder prefixes + consistent assigner |
| `detectors.ts` | Conservative regex detectors + manual exact-term detection |
| `engine.ts` | DETECT → REVIEW → APPLY pipeline, overlap resolution, offset-safe apply |
| `index.ts` | Public API + integration seams (authorization, source provider, work package) |

No routes, no Prisma models, no persistence, no external calls, no file I/O.

## 5. Candidate Types / Detectors

Categories: `EMAIL`, `PHONE`, `IBAN`, `TAX_ID`, `IDENTIFIER`, `ADDRESS`, `PERSON`,
`ORGANIZATION`, `PROJECT`, `BUSINESS_SECRET`, `OTHER_SENSITIVE`.

Deterministic detectors (all conservative, all reviewable):

| Detector | Shape | Confidence |
|----------|-------|------------|
| `email` | `user@host.tld` | HIGH |
| `phone` | `+36 / 06` Hungarian + generic `+CC` numbers | HIGH |
| `iban` | validated IBAN shape (length + digit count + no dashes) | HIGH |
| `tax-number` | Hungarian adószám `8-1-2` | HIGH |
| `eu-vat` | two letters + 8-12 digits | MEDIUM |
| `company-registry` | Hungarian cégjegyzékszám `2-2-6` | HIGH |
| `exact-term` | user-supplied exact sensitive terms (any category) | HIGH |

Person-name recognition is NOT attempted via regex. Phase-1 identification of
names/companies/projects is explicit manual input.

## 6. Manual Sensitive-Term Support

The workflow supplies terms such as `Kovács Péter`, `Nagy Anna`,
`Teszt Bérbeadó Kft.`, `Projekt Főnix`. Matching is case-insensitive and
diacritic-insensitive by default; offsets always map back to the true original
substring. Terms shorter than `minTermLength` (default 2) are ignored with a warning.

## 7. Pseudonymization Design

Repeated values in one work package receive the same placeholder; different
values receive different placeholders. Deterministic placeholders:

```
[SZEMÉLY_1]  [EMAIL_1]  [TELEFON_1]  [CÍM_1]  [IBAN_1]
[AZONOSÍTÓ_1] [ADÓSZÁM_1] [SZERVEZET_1] [PROJEKT_1]
[ÜZLETI_TITOK_1] [EGYÉB_1]
```

Assignment is a pure function of the ordered approved set, so identical input +
identical approvals always yield identical output. The module is pseudonymization;
it never claims irreversible anonymization.

## 8. Overlap / Offset Handling

- Cross-detector overlap (e.g. an email inside a larger manual term) is resolved
  deterministically: exact terms outrank regex; longer spans outrank shorter;
  then earlier start; then stable id. Dropped candidates produce id-only warnings.
- All replacements are applied against original source offsets, from right to
  left, so edits never shift unprocessed offsets. No incremental offset mutation.

## 9. Output Structures

- `AnonymizationCandidate` — id, type, start/end, original text, proposed replacement,
  detector, confidence, note, precedence.
- `ApprovedRedaction` — start/end, type, replacement.
- `AnonymizationResult` — anonymized text, applied count, category counts,
  source/result hashes, warnings, `mappingLocation: 'in-memory-only'`.
- `SanitizedExternalPackage` — safe export object (content + metadata only).

## 10. Safe vs Internal Mapping Boundary

- SAFE: `AnonymizationResult` and `SanitizedExternalPackage` contain sanitized
  content and metadata only. No original values, no mapping.
- INTERNAL: `InternalReplacementMapping` (original → placeholder) exists ONLY in
  the in-memory operation result (`runAnonymization().mapping`). It is never
  persisted, logged, or exported.

## 11. Logging / Privacy

The library performs no logging. Operational logging MAY contain: job/request id,
counts, categories, result state, elapsed time. It must NEVER contain original
document text, candidate source values, the original→replacement mapping, or
business secrets. No secrets in code, docs, or fixtures (tests use synthetic data).

## 12. HR-CONFIDENTIAL Compatibility

Anonymization is NOT authorization. An unauthorized user may not anonymize a
document they cannot read. This wave ships no route, so the invariant is enforced
by construction and by the `DocumentAuthorizationGate` seam: future integration
MUST call canonical document authorization (including `HR_CONFIDENTIAL` handling)
BEFORE extracting source text. The foundation never bypasses authorization.

## 13. Contract Workspace Checkpoint

NOT integrated into Contract Workspace. The task/product architecture is being
rethought before any refactor. This module delivers a documented API and typed
integration seams only — no browser editor, no workflow UI, no Word clone.

## 14. Scope Boundaries

Implemented now: safe core domain library, deterministic detectors, manual
replacement inputs, reviewable plan, deterministic apply, pseudonym consistency,
safe result metadata, unit tests, integration seams.

Deferred (NOT implemented): DB persistence, Prisma migration, public API endpoint,
customer portal UI, production document export, DOCX/PDF rewriting, external AI
integration, automatic semantic person-name recognition.

## 15. Verification

- Focused unit tests: `tests/anonymizationEngine.test.ts`
- `tsc --noEmit` (backend)
- `npm run build` (backend)
- `git diff --check`
- No PG test needed (no persistence). No frontend build (no frontend change).

## 16. Changelog

- **v1.0.0** — Foundation wave: isolated deterministic library + integration seams.