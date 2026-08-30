# Adminiculum recovery adjudication

## Authority and scope

- Release canonical: `release/editor-ops-workflow-1` at `c0ec1dfa2f13be267cab76e91d263ea0e0df8a28`.
- Atlas reviewed: PR99 at `21218f187c57394d38869c2f074983ed012c67e6`.
- This adjudication is recovery planning evidence. It is not product code, deployment evidence, or permission to restore historical commits.
- Active recovery branches remain non-canonical until merged and independently accepted.

## Executive verdict

The recovery-first hypothesis is **STRONGLY_SUPPORTED**. Adminiculum already has most of the domain foundations needed for a legal-work product. The shortest route is to converge current services, reconnect missing edges, and selectively replay historical semantics through current security boundaries. The repository does not support a claim that the product is 87/90 complete, production-ready, or live-accepted.

Seventeen PR99 candidates were reviewed. Ten are genuine recovery, reconnection, surfacing, or active-merge work. Seven do not belong in a recovery queue: search and handoff are already surfaced; case-level reviewer, Outlook thread state, outgoing mail, and billing require genuinely new core semantics; the mock portal must never return.

## Corrections to PR99

1. The graph is not internally complete: 12 of 77 edges reference node IDs absent from `graph/nodes.csv`. The graph remains useful as an evidence index, but its connectivity counts are not authoritative.
2. Search is not backend-only. Canonical has `/search`, `searchDocuments`, `GET /documents/search`, and a top-bar entry.
3. Handoff is not navigation-orphaned. Canonical links it from Case Detail, Documents, Comparison, and Communications and mounts `HandoffPackagePanel` in three surfaces.
4. Legal Analysis is the real surfacing candidate: backend routes, safe DTO levels, API methods, and `LegalAnalysisIntakePanel` exist, but the panel has no current consumer.
5. Canonical case creation already calls `createCaseWorkPackageSnapshot` atomically. PR96 adds immutable operational semantics; PR98 adds compact case creation; PR100, discovered after the PR99 overlay, adds the stacked Case Workspace panel.
6. Typed intake deadlines are persisted as `CaseIntakeDeadline`, but the agenda projector reads Case and Task deadlines, not typed intake rows. This is a genuine reconnect.
7. `TimeEntry.taskId` and submission-time links exist, but `POST /time-entries` rejects `taskId`. Historical Time-0 branches contain useful fail-closed attribution semantics; billing does not.
8. Historical UI SHAs `b1d1d82` and `338eaac` cannot be resolved locally or through the GitHub commit API. Their conclusions are not accepted as exact historical evidence.
9. PR93 is required for the backend scanner adapter and PR97 for the scanner service. PR97 alone does not activate production scanning.
10. PR100 at `0de767bdb9910e17c5fb6f6557a63795d66e1629` is stacked on PR98 and already recovers the Case Workspace Work Package block. It must be added to the merge train rather than rebuilt.

## Authoritative recovery order

`REUSE CURRENT -> RECONNECT CURRENT -> MERGE CURRENT RECOVERY -> SEMANTIC REPLAY -> SECURITY REWRITE AND REPLAY -> TRUE GREENFIELD`.

The highest-value dependency chain is:

1. land current identity, document-comparison, scanner, and Work Package recovery safely;
2. complete the PR96 -> PR98 -> PR100 Work Package stack;
3. repair PR95's mailbox DTO and converge Communication -> canonical Case creation;
4. replay the contextual communication read model;
5. reconnect typed deadlines to agenda and tasks to time attribution;
6. define explicit internal-intake portal grant/publication policy;
7. surface Legal Analysis in the existing Document Workspace;
8. evaluate true-greenfield communication and reviewer work only after recovery acceptance.

## Product rules

- Word remains the primary editor. Recover document context, extraction, diff, review, annotation, decision, approval, delivery, and explanation, never a browser Word clone.
- Hierarchy, title, job title, client metadata, and organization structure never imply authorization.
- Historical routes may supply semantics, not authority. Current exact object/case resolution, safe DTOs, portal/workforce separation, upload scanning, String-ID validation, and safe errors always win.
- A route, test, active PR, or green CI check is not live acceptance.
- No fake state, fake progress, fake task, fake metric, technical ID, duplicate primary navigation, or redirect-only pseudo-workspace may be introduced.
- Tax Engine remains outside the active roadmap.

## Weighted outlook

The bounded master-roadmap estimate is 58% for current canonical, 67% after the active recovery train, 77% after high-value reconnects, 84% after all safe recovery, and 90% after remaining core greenfield work. Each point estimate carries a documented range in `10_MASTER_ROADMAP_REESTIMATE.md`; none is derived from `87/90`.

## Acceptance boundary

The strategy becomes product truth only through independent exact-head review, required CI, correctly provisioned PostgreSQL tests, security regression suites, and scenario-specific live acceptance. Repository audit still provides zero direct production acceptance rows.
