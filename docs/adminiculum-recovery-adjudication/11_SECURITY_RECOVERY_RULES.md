# Security recovery rules

Historical semantics may be replayed only through current security contracts. A historical branch is evidence, not an authorization model.

## Mandatory baseline

1. Authenticate, then enforce the workforce or portal boundary before object work.
2. Resolve the exact consumed object and owning Case/Client/Workspace server-side.
3. Apply Case read/manage and classification gates; hierarchy, title, and job title never grant authority.
4. Reject body/query identifiers as ownership authority. Mismatched redundant identifiers fail closed.
5. Use bounded canonical String-ID validation unless the Prisma/native database contract proves UUID.
6. Return purpose-built Summary/Working/Sensitive or portal-safe DTOs; never spread raw Prisma/provider objects.
7. Preserve portal/workforce separation and same-workspace/client isolation.
8. Do not expose provider IDs, storage paths, raw exceptions, PII, internal rates, or internal compliance semantics.
9. No fake state, progress, tasks, counts, labels, or success confirmation.
10. Test same-ID substitution, parent-child mismatch, dual-linked rows, cross-case/client/workspace access, and local CLIENT denial.

## Recovery-mode gates

| Mode | Minimum gate |
|---|---|
| `KEEP_AS_IS` | prove current entry point and regressions; remove from rebuild queue |
| `RECONNECT_CURRENT` | current services only; exact scope; transaction/query behavior; PG and UI proof |
| `SURFACE_EXISTING` | audit existing DTO/auth; add no backend capability unless a proven gap exists |
| `SEMANTIC_REPLAY` | write against current architecture; do not merge historical branch wholesale |
| `SECURITY_REWRITE_AND_REPLAY` | preserve product semantics only; replace historical auth/DTO/query assumptions |
| `MERGE_CURRENT_RECOVERY` | exact-head independent review, canonical sync, dependency order, current central gates |
| `TRUE_GREENFIELD` | frozen domain/security contract before schema or implementation |
| `DO_NOT_RECOVER` | retain only evidence explaining the rejection |

## Workforce upload composition

The final order is:

```text
AUTHENTICATE
-> WORKFORCE BOUNDARY
-> EXACT OBJECT / CASE AUTHORIZATION
-> HR GATE WHEN APPLICABLE
-> CONTENT VALIDATION
-> MALWARE SCAN
-> STORAGE
-> SAFE FAILURE MAPPING
-> SAFE DTO
```

Only `CLEAN` proceeds. Rejected input makes no storage call. The validated buffer is the stored buffer. Client Portal uploads may use their separate quarantine pipeline only when explicitly identified and tested.

## Sensitive product rules

- Document Workspace remains view/version/diff/review/annotation/decision/approval/delivery/explanation. Word remains the editor.
- AnonymousDocument and LegalAnalysis Summary/Working DTOs contain no raw PII, rehydrated content, source payload, or sensitive AI metadata. Sensitive DTOs require the existing sensitive gate.
- Communications linked to both client and case require exact readable-case authorization; client linkage cannot bypass it.
- Communication-to-case creation derives client ownership from the communication and calls the canonical Case composer.
- Portal publication is explicit, auditable, and grant-scoped. Internal creation never silently publishes.
- Compliance remains temporal, scope-safe, subject-safe, enrollment-gated, and fail-closed.
- Task, submission, document, and time-entry identifiers follow canonical String-ID contracts without weakening object authorization.
- Time attribution is fail closed and never becomes billing by implication.

## Active recovery overlay

- PR92: preserve exact membership/workspace selection and portal isolation.
- PR94: preserve document authorization, SEC-2 upload rules, safe storage errors, extractor limits, and revision semantics.
- PR93/97: compose adapter and production scanner; no dev mock or bypass in production.
- PR96/98/100: preserve immutable Work Package snapshots, required/completed protections, revision guards, exact workforce eligibility, and no automatic task explosion.
- PR95: close mailbox provider-identifier leakage and use canonical Case creation before integration.

## Acceptance

Every recovery needs source review, focused tests, central exact-head CI, and scenario-specific acceptance. State-changing authorization requires real PostgreSQL. UI security requires browser proof that forbidden actions/data are absent, not merely disabled. External scanner, Outlook, storage, and hosted-runtime behavior require authorized environment evidence before a live claim.
