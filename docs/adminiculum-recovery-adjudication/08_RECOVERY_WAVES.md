# Recovery waves

The waves distinguish parallel preparation from serial canonical merge order. A branch is not canonical, live, or production-accepted merely because its exact-head CI is green.

## Wave 0 - current blockers and merge train

| Order | Capability / PR | Dependency | Parallel preparation | File-overlap rule | Implementation owner | Independent review | Central gates | Live acceptance |
|---:|---|---|---|---|---|---|---|---|
| 1 | PR92 portal identity/workspace | current canonical | Yes, Portal lane | Serialize with later publication work | Devin / Portal owner | Claude | Preflight, Backend PG, Migration path, frontend tests | Multi-membership login selects intended workspace; cross-workspace denial |
| 2 | PR94 document comparison | current canonical | Yes, Document lane | Serialize later document-specialist UI | Codex / Document owner | Claude | Required Node 20 DOCX/PDF gate, Preflight, Backend PG, build | Real version pairs: identical, changed, image-only, malformed |
| 3 | PR93 scanner adapter then PR97 scanner service | PR93 before PR97 | Yes, Scanner lane | One serial scanner chain | Antigravity / Infra owner | Codex security review | SEC-2, route guards, Backend PG, Preflight | Clean/rejected workforce uploads; no provider leakage |
| 4 | PR96 Work Package runtime | authorized release-data inventory gate | Yes, Case/WP lane until merge | Serial with PR98, PR100 and PR95 case composer | Antigravity | Claude | Focused WP PG, Backend PG, Preflight, migration path | Requiredness, revision, cross-client, portal denial |
| 5 | PR98 compact New Case UX | PR96 canonical | Prepare stacked only | Same Case/WP lane | Devin | Codex | Frontend tests/build plus Backend PG/Preflight | Required locked, optional toggles, atomic snapshot |
| 6 | PR100 Case Workspace Work Package block | PR98 canonical | Prepare stacked only | Same Case/WP lane | Devin / Antigravity | Claude | Focused WP PG, browser 1440/1100/390, central gates | Status/responsible/task actions without duplicate case UI |
| 7 | PR95 communication/Outlook case creation | WP stack canonical; mailbox DTO P1 repaired | Prepare tests separately | Merge after Case/WP due to case service overlap | Communication owner | Codex security review | Communication PG, auth regressions, central gates | Real inbox sync/import and canonical case creation |

Wave 0 exit requires every merged branch to be re-fetched from the release branch, have exact ancestry proven, and pass its own required central and scenario acceptance. No automatic deployment follows.

## Wave 1 - highest-value connectivity recovery

1. Replay the safe contextual communication read model after PR95. Preserve dual-linked row case authorization and no provider IDs.
2. Connect typed intake deadlines to Agenda as a projection, not duplicated storage.
3. Replay fail-closed Task/Case/Work Package time attribution from Time-0 semantics.
4. Define and implement the explicit internal-intake to Portal grant/publication command after PR92.
5. Surface the existing Legal Analysis intake inside Document Workspace after PR94.

Parallel lanes: Communication, Time/Agenda, Portal policy, and Document specialist UI may prepare concurrently when their file lists are disjoint. Case/Work Package and Communication-to-case merges remain serialized.

Acceptance: focused route/UI tests; real PostgreSQL for authorization and persistence; query-count proof for summaries; browser checks for surfaced UI; exact-head central gates; explicit live scenarios before any `LIVE_ACCEPTED` label.

## Wave 2 - daily lawyer workflow convergence

Converge Case Attention, Work Package next action, communications, deadlines, tasks, document review, and attributed time into one summary-first Case Workspace. Do not add a second dashboard or duplicate first-level navigation.

- Dependency: Waves 0-1 canonical.
- Parallel work: read-model contracts and UI composition can proceed separately; one owner integrates the Case Workspace files.
- File conflict: `Frontend/src/app/cases/[caseId]/**`, Case services, attention projections, and shared API types require a single integration lane.
- Acceptance: deterministic next action, no fake progress, no automatic task explosion, responsive browser checks, full affected PostgreSQL suites.

## Wave 3 - client, organization, and compliance convergence

Connect confirmed compliance proposals to existing cases and Work Packages, then expose only deliberately published, client-safe progress through current grants/publication. Keep Facts, Requirements, internal findings, and workforce state out of portal DTOs.

- Dependency: PR92 and Work Package stack canonical; explicit publication policy accepted.
- Parallel work: compliance action and portal safe read projection may prepare separately, but publication service changes merge serially.
- Acceptance: cross-client/cross-workspace denial, temporal/fail-closed compliance regressions, portal browser scenarios, real organization persona.

## Wave 4 - backend islands surfaced

Surface existing Legal Analysis and Clause operations contextually in Document Workspace. Keep Search and Handoff as current capabilities and strengthen acceptance instead of rebuilding them. Preserve Word as the primary editor.

- Dependency: PR94 and document security train canonical.
- File conflict: all Document Workspace specialist panels share one UI integration owner.
- Acceptance: exact document/case authorization, sensitive DTO gates, browser discoverability, no technical IDs, no browser Word clone.

## Wave 5 - genuine greenfield

Implement only after the recovery evidence gates are closed:

1. persisted workforce/Outlook thread, unread, and reply state;
2. outgoing mail with transactional outbox and attachment security;
3. case-level reviewer assignment;
4. billing, last and only after a commercial contract is frozen.

Tax Engine remains outside the active roadmap. Greenfield work must begin with a domain and security contract, not historical code restoration.

## Universal wave gate

Every wave requires: exact release ancestry; feature-only diff; no duplicate architecture; current authorization and safe DTO review; central CI; scenario acceptance; and a separate declaration of whether live evidence exists. CI success alone is not production acceptance.
