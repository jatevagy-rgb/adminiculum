# Client Color and Dashboard Release GO/NO-GO

## Recommendation

**GO for a separately approved production migration and deployment ticket.** This is not authorization to apply or deploy.

## Release identity

- Integrated release branch: `release/editor-ops-workflow-1`.
- Runtime release commit: `7544fefa95a93ea478829b9a02f23481727ebb91`.
- Source chain: `79e94e9` → `7dec5d2` → `7544fef`.
- Parked commit `24bc6c5`: excluded.
- Migration: `20260719120000_add_client_color_key`.
- Migration SHA-256: `F76F8BF8A1AA6A4289CE13F03F68F1423417741CEC9C4E421F7914D9C1C1978C`.
- Destructive statement count: 0.

## Gate results

| Gate | Result |
| --- | --- |
| Complete ancestry and file classification | pass |
| No unexplained/protected-scope diff | pass |
| Migration additive-only audit | pass |
| Read-only production metadata compatibility | pass |
| Production-head-compatible disposable DB proof | pass |
| Old runtime on new schema | pass |
| Backend contract and authorization review | pass |
| Query/performance review | pass |
| Dashboard resume/group truthfulness | pass |
| Shared frontend palette/accessibility | pass |
| Neutral Notifications boundary | pass |
| Full backend/frontend validation | pass |
| Authenticated two-viewport local browser QA | pass |
| Production DB/Azure unchanged | pass |

## Deployment compatibility matrix

| DB | Backend | Frontend | Safe? | Reason |
| --- | --- | --- | --- | --- |
| old DB | old backend | old frontend | yes | current production combination |
| new DB | old backend | old frontend | yes | nullable additive field is ignored |
| new DB | new backend | old frontend | yes | old frontend ignores the added DTO field |
| new DB | new backend | new frontend | yes | intended release combination |
| old DB | new backend | any frontend | **no** | new backend selects `clients.colorKey` |

## Stable boundaries

- `colorKey` is the only exposed/rendered client-color contract.
- Legacy `Client.color` remains isolated for backward compatibility and is not backfilled or rendered.
- Supported Dashboard groups are deadline, our action, review, client response, and unspecified next action; unsupported waiting parties are not inferred.
- Notifications remain intentionally neutral with no client lookup.
- TaskSubmission transitions and review decisions are unchanged.

## Remaining production conditions

1. Separate explicit human approval for production execution.
2. Reconfirm exact production target, backup/PITR, migration head, no failed migration, and absence of candidate objects.
3. Reconfirm exact SQL checksum.
4. Apply only the candidate through the reviewed one-shot Node/`pg` method; do not replay historical migrations.
5. Prove schema metadata before deploying backend.
6. Deploy backend, smoke, then deploy frontend and run authenticated visual acceptance.
7. Record deployment IDs and retain rollback artifacts.

If any condition differs, stop and return NO-GO without attempting repair in the production ticket.

## Next authorized operation

The next prompt should be a narrowly approved production ticket named `Adminiculum — CLIENT-COLOR-AND-DASHBOARD-PRODUCTION-MIGRATION-AND-DEPLOYMENT-1`, referencing this runbook, the exact migration checksum, and the exact final release branch commit.

## Classification

`CLIENT_COLOR_DASHBOARD_RELEASE_INTEGRATED_READY_FOR_PRODUCTION_APPROVAL`
