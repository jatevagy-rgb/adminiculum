# Active Artifact Commit Confidence Matrix

Date: 2026-07-15

## Scoring Model

| Evidence | Weight |
|---|---:|
| Deployment timestamp fit | 15 |
| Package/lock fingerprint | 15 |
| Route set | 20 |
| Stable source/module hashes | 25 |
| Marker strings | 15 |
| Absence of contradictory markers | 10 |

Scores are qualitative release-engineering scores, not mathematical proof. Exact proof still requires embedded SHA, deployment metadata SHA, or byte-identical deterministic artifact proof.

## Frontend Matrix

| Commit | Timestamp | Lockfile | Route set | Module hashes | Markers | Contradictions | Score | Classification |
|---|---|---|---|---|---|---|---:|---|
| `dc0780e` | Fits: 12 minutes before active deployment received | Package state matches pre-`jszip`/pre-table extension | Matches deployed route set; no `/documents/[documentId]/edit`, no `/portal`, no `/intake`, no `/workload` | Unique normalized deployment-window tuple match across seven frontend source files | Notification/create-case intake and existing dashboard/case/detail markers align | No material contradiction found | 95 | `UNIQUE_COMMIT_MATCH_HIGH_CONFIDENCE` |
| `ab5b96d` | Fits timestamp | Package state compatible | Similar route set | `notifications/page.tsx` differs from artifact | Missing final create-case frontend state | Contradicted by notification source hash | 55 | Rejected |
| `1fdf76a` / `d6c3061` | Fits timestamp | Package state compatible | Similar route set | Notification source differs | Earlier communication intake state only | Contradicted by notification source hash | 50 | Rejected |
| `f436798` / `b70d85f` / `00194a4` | Fits timestamp | Package state compatible | Similar route set | One or more selected files differ | Partial client/communication changes only | Contradicted by source tuple | 45 | Rejected |
| `a8aca78` and later editor commits | Too late for deployment | Package adds editor/DOCX dependencies later | Adds `/documents/[documentId]/edit` later | Artifact lacks route/dependencies | Professional editor absent | Strong contradiction | 10 | Rejected |

## Backend Matrix

| Commit | Timestamp | Lockfile | Route set | Module hashes | Markers | Contradictions | Score | Classification |
|---|---|---|---|---|---|---|---:|---|
| `2cf1594` | Fits: before active deployment received | Backend package state compatible | Matches pre-agenda/pre-workload/pre-intake route set | Runtime files match artifact | Outlook Graph adapter present; CP-SCHEMA-1 absent | No runtime contradiction | 88 | Candidate lower-bound, not unique |
| `8ce26c0` | Fits: docs-only commit before active deployment received | Backend package/runtime state equivalent to `2cf1594` | Same artifact-relevant route set | Runtime files match artifact | Same runtime markers | Docs-only commit cannot be distinguished from artifact | 86 | Candidate same-artifact range |
| `d950e87` | Fits earlier, but before active deployment | Package state compatible | Route set mostly matches | Missing `outlookGraph.adapter` | Contradicted by adapter file present | Strong contradiction | 50 | Rejected as final active artifact |
| `03d0854` / `ccf992d` / `59269eb` | Fit earlier | Package state compatible | Route set mostly matches | Missing later service/adapter pieces | Incomplete Outlook foundation | Contradicted by adapter/service markers | 40 | Rejected |
| `2818b0b` and later workflow commits | Too late for active backend deployment | Package may still match | Adds agenda/workload/intake routes absent from artifact | `src/index.ts` differs | Workflow route mounts absent | Strong contradiction | 10 | Rejected |
| `6fc5582` / `1f43dab` | Too late and schema adds CP-SCHEMA-1 | Package may match | Runtime may be same for some files | Prisma schema differs from artifact | CP-SCHEMA-1 absent in artifact | Strong contradiction | 10 | Rejected |

## Overall Classification

Frontend reached `UNIQUE_COMMIT_MATCH_HIGH_CONFIDENCE`.

Backend reached `COMMIT_RANGE_NARROWED` because multiple timestamp-plausible or runtime-equivalent commits can produce the same artifact and no embedded SHA exists.

Overall final classification for the active baseline remains:

`active_artifact_git_baseline_commit_ranges_narrowed`
