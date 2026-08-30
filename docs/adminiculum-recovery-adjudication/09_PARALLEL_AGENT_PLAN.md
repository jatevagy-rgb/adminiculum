# Parallel agent plan

## Safe lanes

| Lane | Scope | Likely files | May run beside | Must serialize with | Suggested implementer | Independent reviewer |
|---|---|---|---|---|---|---|
| Case / Work Package | PR96 -> PR98 -> PR100; canonical case composer | `Backend/src/modules/cases/**`, work-package modules, Case Workspace/New Case UI | Document, Portal, Scanner | PR95 case creation; any other Case Workspace edits | Antigravity backend, Devin UI | Claude |
| Communication | PR95; contextual read model; later inbox semantics | communication modules, inbox UI/tests | Document, Scanner, Time/Agenda | Case composer merge; future outgoing/thread models | Codex or communication owner | Claude |
| Document | PR94; Legal Analysis/Clause surfacing | document extract/compare/review and Document Workspace | Portal, Case/WP backend, Time/Agenda | scanner changes in overlapping upload routes; all specialist panels | Codex | Claude/security owner |
| Portal / Organization | PR92; explicit grant/publication policy | client-portal auth, grants, portal UI/tests | Document, Case/WP backend | any other portal identity or publication edit | Devin / Portal owner | Codex |
| Scanner / Infrastructure | PR93 -> PR97 provider integration | scanner adapter/service/config/upload tests | Portal, Case/WP, Time/Agenda | PR68/71 upload route files and Document route edits | Antigravity | Codex security review |
| Time / Agenda | typed deadline projection; Task-Time attribution | agenda/time/task modules and focused UI | Document, Portal, Scanner | Case Workspace integration; task route ownership | Codex | Claude |
| Backend islands UI | Legal Analysis and Clause contextual entry | specialist panels and API adapters | backend-only lanes | Document Workspace lane | Devin | Codex |

```text
SAFE_PARALLEL_LANES=Document/Comparison; Portal/Organization; Scanner/Infrastructure; Case/WorkPackage; Communication; Time/Agenda; Backend-Islands-UI
```

## Conflict ownership rules

1. One owner at a time for `Backend/src/modules/cases/services.ts`, case routes, and the Case Workspace surface. PR96/98/100 precede PR95's canonical composer integration.
2. One owner at a time for document upload routes. Authorization, validation/scanning, storage, and safe error mapping must survive as one ordered pipeline.
3. One owner at a time for portal identity/grant/publication services. PR92 precedes publication policy.
4. UI panels can be developed independently only when the containing workspace file is not edited in parallel. Integrate panels in a dedicated composition commit.
5. Shared API type files require an announced owner and narrow patch; do not use them as a convenient cross-lane refactor target.

## Agent responsibilities

- Antigravity: transactional backend/state-machine work and scanner infrastructure.
- Devin: compact product UI, information hierarchy, responsive acceptance; no new backend truth invented.
- Codex: source/history archaeology, narrow reconnect services, integration tests, security composition review.
- Claude: independent adversarial review of exact heads; no implementation on the reviewed branch.
- Jatevagy/Peterfi: authorized live acceptance, release-data inventory, external provider/configuration verification.

These are suggested roles, not authority boundaries. Current file ownership and active worktrees take precedence.

## Branch and merge discipline

- Start from the current `release/editor-ops-workflow-1`, never `main`.
- Use normal merge commits for canonical sync; no rebase or force push of reviewed history.
- Stacked branches remain stacked until their parent is canonical, then merge-sync and retarget.
- Parallel preparation is allowed; canonical merges follow dependency order.
- After any canonical advance, every pending branch re-fetches, merge-syncs, and reruns exact-head gates.
- Live or release-data actions require a separately authorized operator and are never inferred from repository CI.

## Required handoff packet

Every lane hands off: exact base/head; branch/PR; changed-file list; preserved invariants; test commands and observed results; current P0/P1/P2; dependency and conflict notes; live evidence status; explicit no-schema/no-deploy statements where applicable.
