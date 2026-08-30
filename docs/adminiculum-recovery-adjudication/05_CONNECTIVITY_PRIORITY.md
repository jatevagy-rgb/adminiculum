# Connectivity priority

Ranking is based on capabilities unlocked, daily user value, dependency order, security risk, and file conflict risk. Already-connected edges are not ranked as cuts.

| Rank | Cut | Upstream unlocked | Downstream unlocked | User value | Implementation risk | Security risk | File conflict risk | Dependencies |
|---:|---|---|---|---|---|---|---|---|
| 1 | Case -> Work Package runtime -> Case Workspace | Case Type, template, snapshot | requiredness, progress, responsibility, explicit tasks, task provenance | Very high | Medium | Medium | High in case routes/services/UI | PR96 -> PR98 -> PR100; PR96 release-data gate |
| 2 | Communication -> canonical Case composer -> Work Package | Outlook/import, communication ledger, client association | operational case, responsible lawyer, package, workflow, portal policy | Very high | Medium | High | High with PR95 and WP stack | Finish WP stack; repair PR95 mailbox DTO; replay read model |
| 3 | Document Version -> safe DOCX/PDF extraction -> comparison/review | Version/storage/auth | typed diff, review decision, explanation | High | Medium | High | Medium in document modules | PR94 exact head; preserve PR62/68/71 semantics |
| 4 | Task/Work Package -> Time attribution | Task lifecycle, package provenance | reliable workload, case time, later economics | High daily value | Medium | Medium | Medium in task/time APIs | PR96/98/100; replay Time-0 classifier |
| 5 | Typed intake deadline -> Agenda | intake deadline persistence | daily agenda, reminders, attention | High daily value | Low | Low/medium | Low | projection and auth tests |
| 6 | Organization/internal intake -> explicit Portal grant -> publication | identity, workspace, grants | customer-visible matters/documents/progress | High | Medium | Very high | Medium in portal routes/services | PR92; explicit product policy and audit event |
| 7 | Contextual communication projection -> Case/Client workspaces | ledger, client/case associations | no-N+1 summaries, next action, safe counts | High | Medium | High | Medium in communication files | PR95 then b361 semantic replay |
| 8 | Compliance proposal -> Case/Work Package action | Fact/Rule/Finding/Proposal | operational task and customer-safe progress | Medium/high | Medium | High | Medium across compliance/case | existing bindProposalToCase; use canonical composer, never auto-create silently |
| 9 | Outlook import -> attention/inbox | Graph reader/import | daily triage and deterministic next work | High if live | Medium | High | Medium | PR95, external config, live acceptance |
| 10 | Legal Analysis/Clause tools -> Document/Case Workspace | secure backend APIs | discoverable specialist work | Medium | Low/medium | High for Legal Analysis | High in document UI | mount existing component after PR94; no new backend |

## Corrections to PR99 ranking

- `Case -> Document -> Review` is already connected in canonical source and tests; preserve it as a regression spine rather than treat it as a missing cut.
- `Document -> Review decision` is also current.
- Handoff is already surfaced and is not a priority cut.
- Search is already reachable and is not a recovery cut.
- The communication-to-case cut must follow the Work Package service convergence because PR95 and PR96/98 overlap canonical case creation files.

## Acceptance contract per cut

Every cut requires: source-level caller-to-persistence proof; exact object/case scope; route tests; real PostgreSQL where state/authorization matters; no-N+1 proof for aggregate reads; frontend contract tests; exact-head Preflight/Backend PG/Migration-path result; and scenario-specific browser/live acceptance before the capability is called live.

```text
TOP_CONNECTIVITY_CUTS=Case->WorkPackage->Workspace; Communication->canonical Case->WorkPackage; Version->DOCX/PDF comparison->Review; Task/WorkPackage->Time; Typed deadline->Agenda; Internal intake->explicit Portal grant/publication
```
