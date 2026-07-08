# Production Schema Read-Only Compare

## Purpose

This document compares the repository schema and partial-schema-drift inventory against the production physical database schema using metadata-only read access.

This compare was read-only and schema-metadata-only. It did not read business rows, document text, JSON payload values, communications content, generated content, client/case/task/time-entry data, audit payload values, or legal-analysis content.

It does not authorize runtime change, schema change, migration creation, migration apply, DB apply, Azure deployment, route enablement, or CP-SCHEMA-1.

## Safety constraints followed

- No DDL was run.
- No DML was run.
- No `prisma migrate`, `prisma db push`, or Prisma Client business-model query was run.
- No business row values or row counts were queried.
- No document/content/JSON payload values were inspected.
- No Azure app setting was changed.
- No deployment was performed.
- A direct local DB connection timed out before metadata queries ran.
- The successful compare used Kudu as a command runner with the backend App Service `DATABASE_URL`, installed `pg` only into `/tmp`, ran PostgreSQL catalog queries inside `BEGIN READ ONLY`, and removed the temporary `/tmp` files afterward.
- A transient shell-escaping mistake created a literal `$WORK` folder under `/home/site/wwwroot`; it was immediately removed and verified absent before documentation.

## Sources

- `Backend/prisma/schema.prisma`
- `docs/partial-schema-drift-inventory.md`
- `docs/partial-schema-drift-triage.md`
- `docs/production-compatible-baseline-human-decisions.md`
- Production database metadata via `information_schema` and `pg_catalog` only
- Local migration/schema documentation for context only

No secrets, connection strings, usernames, passwords, business data, or raw environment dumps are recorded in this document.

## Global result

| Area | Status |
| --- | --- |
| Production apply readiness | `BLOCKED` |
| CP-SCHEMA-1 readiness | `BLOCKED` |
| Partial schema drift | Remains `QUARANTINE` |
| Business data read | No |
| DB mutation | No |
| Runtime behavior change | No |

This compare reduces uncertainty for several physical objects, but table existence does not prove product readiness, permission safety, privacy safety, runtime safety, or migration safety.

## Comparison table

| Item / family | Repo evidence | Production physical schema evidence | Metadata-only result | Risk / mismatch | Suggested next decision lane | Required next step |
| --- | --- | --- | --- | --- | --- | --- |
| Case collaborators | `CaseCollaborator` model; cases routes/services; handoff authorization | `case_collaborators` exists with `id`, `caseId`, `userId`, `role`, `addedAt`; expected case/user indexes and FKs present | present-compatible | Physical shape looks aligned at metadata level, but route authorization/role semantics still need safety review before baseline `KEEP` | KEEP-BUT-HARDEN candidate | Route/permission hardening review and targeted collaborator tests; do not use this alone as apply authorization |
| Anonymous document compatibility fields | `AnonymousDocument` model; anonymize routes/services | `anonymous_documents` exists, but columns found are `id`, `name`, `content`, `addresses`, `sourceDocId`, `originalDocId`, `caseId`, `redactedAt`, `patternCount`, `spItemId`, `spWebUrl`, `createdAt`; only PK and source-document FK found | present-partial | Missing Prisma-declared/sensitive fields such as `redactedItems`, AI task/prompt/response, and rehydration fields; indexes expected by historical docs were not present in metadata result | QUARANTINE pending product/security decision | Privacy model plus targeted additive remediation design if anonymization persistence remains product scope |
| Rehydration / reidentification fields | `AnonymousDocument` rehydration fields; anonymize rehydration service | Rehydration columns were not present on `anonymous_documents`; no rehydration enum was checked/found | absent | Rehydration persistence would fail if runtime reaches those fields; reidentification is privacy-sensitive | BRING-FORWARD candidate / SECURITY-PRIVACY BLOCKED | Rehydration threat model and separate column-addition design only if approved |
| Contract generation drift | `ContractGeneration` model; contracts service | `contract_generations` exists with baseline generation fields only; `comparisonSnapshot`, SharePoint/revision lineage fields were not present | present-partial | Runtime services reference fields beyond production physical shape; contracts remain default-disabled/hardened | QUARANTINE pending product/security decision | Storage/retention model and targeted field-remediation plan if contracts are brought forward |
| `GenerationStatus` enum drift | Prisma `GenerationStatus` includes `PENDING`, `PREVIEW`, `GENERATED`, `UPLOADED`, `APPROVED`, `REJECTED`, `FAILED`, `EXPIRED` | Production `GenerationStatus` exists with `PENDING`, `PREVIEW`, `GENERATED`, `UPLOADED`, `FAILED`, `EXPIRED` | enum-drift | `APPROVED` and `REJECTED` are present in Prisma but absent physically; writes using those values can fail | BRING-FORWARD candidate | Enum write-path audit and additive enum-value migration design only after contracts decision |
| Generation drafts | `GenerationDraft` model and feature-flagged generation-draft routes | `generation_drafts` absent | absent | Feature remains future/optional; enabling route without schema would fail | NEEDS PRODUCT DECISION | Decide whether draft persistence is in scope before migration design |
| Legal analyses | `LegalAnalysis` model/enums and guarded legal-analysis routes | `legal_analyses` absent; `LegalAnalysisStatus`, `LegalAnalysisSourceType`, and `LegalAnalysisSourceDocumentType` absent | absent | Sensitive legal work-product persistence is not physically present | QUARANTINE pending product/security decision | Product/privacy decision before any bring-forward |
| Comparison snapshot | `ContractGeneration.comparisonSnapshot`; contracts comparison/edit service | `comparisonSnapshot` column absent on `contract_generations` | absent | Runtime reference exists, but contracts family remains quarantined and default-disabled | KEEP-BUT-HARDEN candidate only if current comparison workflow requires it | Requirement decision plus targeted additive column design if approved |
| Client house style | `ClientHouseStyleProfile` model and guarded clients house-style routes | `client_house_style_profiles` absent | absent | Reads degrade to `null` while disabled; writes remain guarded | NEEDS PRODUCT DECISION | Decide whether house-style persistence is product scope |
| Clause library | `ClauseLibraryItem`, lawyer profile/preferred clause models; guarded clause-library routes | `clause_library_items`, `lawyer_profiles`, and `lawyer_preferred_clauses` absent | absent | DB-backed clause governance/versioning not physically present | NEEDS PRODUCT DECISION | Clause-library governance and migration split plan if approved |
| Contract assembly | Contract assembly draft/clause models and guarded assembly routes | `contract_assembly_drafts` and `contract_assembly_clauses` absent | absent | Assembly depends on clause-library and generation/storage decisions | BRING-FORWARD candidate only after clause library | Do not bring forward independently |
| Timesheet reports / artifacts / presets | Timesheet report instance/artifact/preset models and guarded persistence routes | `timesheet_report_instances`, `timesheet_report_artifacts`, and `timesheet_presets` absent; checked timesheet report enums absent | absent | Some non-persistent helpers may remain usable, but persistence is not physically present | NEEDS PRODUCT DECISION | Reporting/privacy scope decision before migration design |
| Workload tracking | `WorkloadRecord` model and prior ambiguous migration-history docs | `workload_records` exists with expected period/hour/note/workgroup columns, unique/indexes, and workgroup FK | present-compatible | Physical object exists, but product/runtime baseline decision remains separate from metadata proof | KEEP-BUT-HARDEN candidate | Runtime usage review and targeted tests before baseline claim |
| Client identity fields | `Client` model fields | `clients` includes `taxNumber`, `companyRegistrationNumber`, `authorizedRepresentative`, and `color` | present-compatible | Physical fields exist; data quality/backfill and product semantics not assessed | KEEP-BUT-HARDEN candidate | Product/legal semantics review before treating as baseline |
| Case client role | `Case.clientRole`; anonymize service references | `cases.clientRole` exists and is nullable | present-compatible | Physical field exists; allowed values and privacy semantics remain undefined | KEEP-BUT-HARDEN candidate | Define semantics and route/use-path tests |
| Client color | `Client.color` | `clients.color` exists as nullable `varchar` | present-compatible | Low technical risk, but not a product/readiness decision by itself | KEEP-BUT-HARDEN candidate | UI/runtime usage review |
| Workspace text | `Document.workspaceText`; document workspace routes | `documents.workspaceText` exists and is nullable | present-compatible | May contain privileged legal drafting text; client-visible payload designs must continue to exclude it | KEEP-BUT-HARDEN candidate / SECURITY-PRIVACY BLOCKED | Privacy/storage/retention review and tests proving no client exposure |
| Review persistence | `DocumentReviewSuggestion` model/enums and review-suggestion services | `document_review_suggestions` absent; `DocumentReviewSuggestionType` and `DocumentReviewSuggestionStatus` absent | absent | Review persistence is not physically present and remains document-AI/privacy-sensitive | BRING-FORWARD candidate / SECURITY-PRIVACY BLOCKED | Review persistence privacy model before schema design |
| DB-only rolled-back kb/learning/escalation migration | Documentation-only prior history | No kb/learning/escalation tables were part of this focused query; prior docs reported no active objects | not applicable | This compare did not re-query unknown ghost names beyond focused drift inventory | REMOVE candidate | Human decision to archive/exclude historical rolled-back migration from future baseline planning |
| CP-SCHEMA-1 / Client Portal foundation | CP-SCHEMA-1 schema candidate and migration file | `client_portal_users`, `client_portal_memberships`, `client_visible_artifacts`, `client_portal_grants`, `client_submissions`, `client_submission_attachments`, and `client_portal_audit_events` absent; checked client-portal enums absent | absent | CP-SCHEMA-1 remains future work and cannot be applied until baseline blockers are resolved | CP-SCHEMA-1 BLOCKER | Keep blocked; resume only after production-compatible baseline remediation and security model decisions |

## Enum comparison

| Enum | Repo values | Production values | Metadata-only result | Risk | Required next step |
| --- | --- | --- | --- | --- | --- |
| `GenerationStatus` | `PENDING`, `PREVIEW`, `GENERATED`, `UPLOADED`, `APPROVED`, `REJECTED`, `FAILED`, `EXPIRED` | `PENDING`, `PREVIEW`, `GENERATED`, `UPLOADED`, `FAILED`, `EXPIRED` | enum-drift | Writes using `APPROVED` or `REJECTED` can fail against production | Audit write paths and design additive enum-value migration only if contracts/generation status flow is approved |
| `LegalAnalysisStatus` | `DRAFT`, `CANDIDATE_REVIEW`, `LAWYER_REVIEW`, `READY_FOR_APPROVAL`, `APPROVED`, `ARCHIVED` | enum absent | absent | Legal-analysis persistence cannot be enabled without schema | Keep quarantined pending privacy/product decision |
| `LegalAnalysisSourceType` | `PASTED_AI_OUTPUT`, `MANUAL` | enum absent | absent | Same as legal analyses | Keep quarantined |
| `LegalAnalysisSourceDocumentType` | `DOCUMENT`, `CONTRACT_GENERATION`, `ANONYMOUS_DOCUMENT` | enum absent | absent | Same as legal analyses | Keep quarantined |
| `DocumentReviewSuggestionType` | `COMMENT`, `REPLACEMENT`, `DELETION` | enum absent | absent | Review-suggestion persistence cannot be enabled without schema | Keep document-AI/review persistence quarantined |
| `DocumentReviewSuggestionStatus` | `PENDING`, `ACCEPTED`, `REJECTED` | enum absent | absent | Same as review suggestions | Keep quarantined |
| Client Portal enums | Present in schema candidate | absent | absent | CP-SCHEMA-1 not applied | Keep CP-SCHEMA-1 blocked |

## High-risk blockers

- Privacy/security-sensitive fields remain blocked: anonymization, rehydration, workspace text, document review suggestions, legal analyses, and generated legal documents.
- `GenerationStatus` has confirmed enum drift.
- Many future feature tables are absent: generation drafts, legal analyses, client house style, clause library, contract assembly, timesheet persistence, document review suggestions, and CP-SCHEMA-1.
- Several present-compatible items still need hardening or product semantics: case collaborators, workload tracking, client identity fields, case client role, client color, and workspace text.
- Existing physical tables do not authorize production apply or Prisma migration replay.
- CP-SCHEMA-1 remains blocked because the Client Portal foundation objects are absent and baseline remediation is still unresolved.

## Recommended next sequence

1. Update triage/decision docs with this metadata compare result if needed.
2. Human decision for the likely stale DB-only rolled-back kb/learning/escalation migration.
3. KEEP-BUT-HARDEN packages for present-compatible active/low-risk items: case collaborators, workload tracking, client identity fields, case client role, client color, workspace text.
4. Product/security decision packages for absent future features: generation drafts, legal analyses, client house style, clause library/assembly, timesheet reports, review persistence, anonymization/rehydration, and contracts.
5. Separate migration design for any approved BRING-FORWARD item; do not replay historical migrations blindly.
6. CP-SCHEMA-1 only after baseline blockers, product/security decisions, and clone proof are resolved.

## Non-actions

- No schema changed.
- No migration was created.
- No migration was applied.
- No DB apply was performed.
- No business data was read.
- No Azure deployment or app setting change occurred.
- No runtime behavior changed.
- No route behavior changed.
- No OpenAPI or CORS behavior changed.
- No frontend changed.
- No persisted script, package, generated file, or DB output artifact was committed.

## Final classification

`production_schema_metadata_compared_readonly_no_business_data_no_db_change_no_runtime_change`
