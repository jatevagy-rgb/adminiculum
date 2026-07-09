# Production-Compatible Baseline Final Rollup

## Purpose

This is a documentation-only production-compatible baseline rollup after the
`documents.workspaceText` privacy-blocked closeout. It makes no runtime change, no schema
change, no migration, no DB connection, no production apply, no CP-SCHEMA-1 authorization,
no Client Portal enablement, no Document/AI enablement, no AI/provider call, and no
SharePoint/export/file-processing call.

The goal is to summarize the current narrow internal baseline, the items that remain
blocked or quarantined, and the conditions required before any future production apply,
CP-SCHEMA-1, or broader schema work.

## Inputs

- `docs/production-compatible-baseline-human-decisions.md`
- `docs/present-compatible-keep-candidates-audit.md`
- `docs/partial-schema-drift-inventory.md`
- `docs/partial-schema-drift-triage.md`
- `docs/production-schema-readonly-compare.md`
- `docs/documents-workspace-text-privacy-audit.md`
- `docs/documents-workspace-text-privacy-model.md`
- `docs/documents-workspace-text-retention-design.md`
- `docs/documents-workspace-text-logging-guard-design.md`
- `docs/cp-schema-1-fresh-clone-verification-no-go.md`

## Final narrow internal KEEP baseline

These items are currently documented as narrow internal baseline items only. `KEEP` here
does not authorize deployment, DB apply, CP-SCHEMA-1, Client Portal exposure, external
visibility, or unrelated schema replay.

| Item | Narrow reason allowed | Boundaries |
| --- | --- | --- |
| `clients.color` | Narrow internal UI metadata for client visual identity. | Internal only; no Client Portal implication; no external visibility implication; no CP-SCHEMA-1 implication; no production apply authorization by itself. |
| `case_collaborators` | Authz-hardened internal case collaboration read/create/delete surface. | Internal only; not a Client Portal or external collaboration model; no future bulk/export/update authorization; no CP-SCHEMA-1 implication; no production apply authorization by itself. |
| `workload_records` | Admin/partner-guarded internal workload/workgroup routes. | Internal only; no self-service lawyer/team or Client Portal visibility; no reporting/export implication; no CP-SCHEMA-1 implication; no production apply authorization by itself. |
| `cases.clientRole` | Internal matter-party metadata after semantics decision and route hardening. | Not an authorization primitive; not broad list exposure; no Client Portal implication; no external visibility implication; no CP-SCHEMA-1 implication; no production apply authorization by itself. |
| Client identity fields | Hardened internal client route behavior with scoped access. | Internal only; no external/client identity model; no Client Portal implication; no CP-SCHEMA-1 implication; no production apply authorization by itself. |

## Explicitly excluded present-compatible item: documents.workspaceText

`documents.workspaceText` is present-compatible in production metadata but remains
**`SECURITY/PRIVACY BLOCKED`**. It is authz-hardened, logging-guard implemented,
AI/provider reviewed, export/SharePoint/generated-document reviewed, external/client/public
mapper reviewed, and retention-designed only. It is **not** retention-implemented, **not**
covered by a human legal/privacy decision for durable storage, **not KEEP**, **not
KEEP-BUT-HARDEN**, and **not safe for enablement**.

The raw text routes remain:

- `GET /documents/:id/text`
- `POST /documents/:id/save-workspace-version`

Both routes are auth-first and default-disabled behind the Document/AI gate. The read route
requires document/case read access; the write route requires case manage access. Broad
internal DTOs omit raw text. External/client/public mappers were reviewed with no silent
exposure found. Client Portal remains disabled/quarantined.

Additional posture:

- raw text is forbidden log content and the logging guard is implemented;
- no in-code provider path in `Backend/src` receives raw `workspaceText`;
- no AI/provider use is authorized;
- no export, SharePoint/Graph upload, generated-document, or external artifact use is
  authorized;
- retention design exists, but no retention implementation, legal-hold implementation, or
  durable-storage decision exists.

## Quarantined / blocked families

| Family | Current lane | Reason blocked | Required before unblocking |
| --- | --- | --- | --- |
| Client Portal / external visibility | `QUARANTINE` / blocked | External client-facing visibility requires explicit ownership, need-to-know authorization, internal/external mappers, and privacy/GDPR review. | Client identity/ownership model, feature flag behavior, spoofed access tests, strict publication artifact model, OpenAPI exposure decision, privacy review. |
| Document/AI privacy boundary | `QUARANTINE` / `SECURITY/PRIVACY BLOCKED` | Document upload/extraction/review/anonymize/rehydrate/AI paths can process privileged legal content and personal data. | Storage model, provider policy, anonymization/rehydration threat model, permission model, retention/delete policy, privacy-safe logging, targeted route tests. |
| Contracts / generated documents | `QUARANTINE` | Not read-only; includes generation, local/generated files, SharePoint upload, DB writes, cleanup/delete, and retention/privacy implications. | Explicit storage policy, SharePoint/approved storage decision, retention/delete policy, permission model, audit/privacy review, targeted route tests. |
| Temporary ops / DB admin routes | `QUARANTINE` | Runtime migration/dbcheck/sync surfaces are not product features and must not be baseline dependencies. | Route inventory, admin-only exposure decision, feature/internal-only model, OpenAPI decision, Azure/prod access review, unauth rejection tests. |
| OpenAPI / CORS exposure boundary | `QUARANTINE` | Public metadata and browser-origin policy can reveal or enable access paths to quarantined/future operations. | Public/authenticated/admin-only OpenAPI decision, runtime/spec parity, stale path cleanup/labeling, production CORS allowlist, exposure tests. |
| Partial schema drift leftovers | `QUARANTINE` | Present-partial, absent, enum-drift, future, and code-compat-only families must not be silently included. | Per-family inventory, production physical comparison, runtime usage review, product/security decision, clone-proofed migration strategy if retained. |
| CP-SCHEMA-1 | `BLOCKED` / future work | Client Portal foundation must not be mixed into baseline reconciliation and remains absent/future. | Production-compatible baseline/remediation stability, client identity/security model, fresh clone proof, separate migration/review path. |
| Production apply | `BLOCKED` | Migration history and schema posture remain unsuitable for apply. Metadata compatibility does not equal apply readiness. | Separate apply plan, migration review, clone proof, rollback plan, smoke tests, and explicit human approval. |

## Production apply posture

Production apply remains blocked. No migration/apply was authorized by this chain, no DB
change was made, and no DB connection was used for this rollup. Production metadata
compatibility does not equal apply readiness. Any future production apply requires a
separate apply plan, migration review, rollback plan, route/API smoke plan, fresh clone
proof where relevant, and human approval.

## CP-SCHEMA-1 posture

CP-SCHEMA-1 remains blocked. Nothing in the narrow internal KEEP baseline authorizes
CP-SCHEMA-1. Client Portal remains disabled/quarantined. External/client-facing schema
changes require separate product, privacy, security, and authorization decisions before any
implementation or migration planning.

## Future package families

1. `PRODUCTION-APPLY-NO-GO-RECONFIRM-1`
   - Docs-only confirmation that production apply remains blocked.
2. `PARTIAL-SCHEMA-DRIFT-RESIDUAL-ROLLUP-1`
   - Summarize remaining absent/partial schema families after KEEP decisions.
3. `CLIENT-PORTAL-NO-GO-CLOSEOUT-1`
   - Separate blocked closeout if Client Portal direction needs its own final index.
4. `DOCUMENT-AI-BOUNDARY-FINAL-CLOSEOUT-1`
   - Separate Document/AI closeout beyond the `workspaceText` chain.
5. `PRODUCTION-APPLY-READINESS-DESIGN-1`
   - Only when a human explicitly requests an apply plan; still not an apply.

## Final decision statement

The narrow internal baseline is documented. `documents.workspaceText` remains blocked.
Quarantined families remain quarantined. Production apply remains blocked. CP-SCHEMA-1
remains blocked. No external visibility is authorized. No Client Portal is authorized. No
AI/provider use is authorized. No SharePoint/export enablement is authorized.

## Follow-up — PRODUCTION-APPLY-NO-GO-RECONFIRM-1

- `PRODUCTION-APPLY-NO-GO-RECONFIRM-1` created
  `docs/production-apply-no-go-reconfirmation.md` as a standalone NO-GO reaffirmation.
- Production apply and CP-SCHEMA-1 remain blocked.
- The narrow internal KEEP baseline does **not** authorize DB apply, migration creation or
  application, CP-SCHEMA-1, Client Portal, external visibility, Document/AI enablement,
  AI/provider use, SharePoint/export, or Azure deployment.

## Follow-up — CLIENT-PORTAL-PRODUCT-BOUNDARY-DESIGN-1

- `CLIENT-PORTAL-PRODUCT-BOUNDARY-DESIGN-1` created
  `docs/client-portal-product-boundary-design.md`.
- The design defines a future Client Portal as a safe external matter-status and
  client-action surface, not a mirror of the internal lawyer workflow app.
- This design does not alter the final rollup posture: Client Portal remains
  disabled/quarantined, CP-SCHEMA-1 remains blocked, production apply remains NO-GO, and
  external visibility remains unauthorized.
- The narrow internal KEEP baseline remains internal only and does not authorize
  client-facing exposure.

## Non-actions

- No runtime changed.
- No schema changed.
- No migration was created.
- No DB connection was used.
- No DB apply was performed.
- No business data was read.
- No Azure deployment or app setting was changed.
- No route behavior changed.
- No OpenAPI/CORS behavior changed.
- No frontend changed.
- No tests changed.
- No Client Portal was enabled.
- No Document/AI flag was enabled.
- No AI/provider call was made.
- No file processing was run.
- No SharePoint/Graph call was made.
- No export/generation job was run.

## Final classification

`production_compatible_baseline_final_rollup_documented_no_db_change_no_runtime_change`
