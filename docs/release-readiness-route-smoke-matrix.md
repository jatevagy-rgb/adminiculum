# Release Readiness Route Smoke Matrix

Date: 2026-07-15
Current HEAD: `6800b13`

## Backend smoke matrix

| Route | Method | Auth | Feature gate | Mutation? | Expected success | Expected disabled behavior | Smoke priority |
|---|---|---|---|---|---|---|---|
| `/health` | GET | No | None | No | 200 | N/A | P0 |
| `/api/v1/auth/me` | GET | Yes | Auth config | No | 200 with token | 401 without token | P0 |
| `/api/v1/cases` | GET | Yes | None | No | 200 list | 401 unauth | P0 |
| `/api/v1/cases/:caseId/workflow-summary` | GET | Yes | None | No | 200 if case accessible | 401/403/404 | P0 |
| `/api/v1/cases/:caseId/work-items` | GET | Yes | None | No | 200 bounded work items | 401/403/404 | P1 |
| `/api/v1/cases/:caseId/activity` | GET | Yes | None | No | 200 activity | 401/403/404 | P1 |
| `/api/v1/cases/:caseId/deadlines` | GET | Yes | None | No | 200 deadlines | 401/403/404 | P1 |
| `/api/v1/agenda` | GET | Yes | None | No | 200 agenda | 401 unauth | P0 |
| `/api/v1/tasks` | GET | Yes | None | No | 200 list | 401 unauth | P0 |
| `/api/v1/tasks/:id/reschedule` | PATCH/POST as implemented | Yes | None | Yes | 200/204 with valid payload | 401/403/404/409 | P1 |
| `/api/v1/workload` | GET | Yes | None | No | 200 workload | 401 unauth | P0 |
| `/api/v1/time-entries` | GET/POST/PATCH/DELETE | Yes | None | Mixed | 200/201/204 as applicable | 401 unauth | P1 |
| `/api/v1/intake` | GET | Yes | None | No | 200 bounded queue | 401 unauth | P0 |
| `/api/v1/clients/lookup` | GET | Yes | None | No | 200 lookup | 401 unauth | P1 |
| `/api/v1/documents/:documentId/editor-metadata` | GET | Yes | None | No | 200 metadata | 401/403/404 | P0 |
| `/api/v1/documents/:documentId/comments` | GET/POST | Yes | None | Mixed | 200/201 if authorized | 401/403/404 | P1 |
| `/api/v1/contracts/template-capabilities` | GET | Yes | None | No | 200 capabilities | 401 unauth | P1 |
| `/api/v1/clause-library` | GET | Yes | `ENABLE_CLAUSE_LIBRARY` | No | 200 if enabled | 501/disabled payload if off | P1 |
| `/api/v1/client-portal/*` | GET/POST | Portal auth/gates | Client portal flags | Mixed | Not expected in this release | Fail-closed/unavailable | P0 guard |
| `/api/v1/communications?limit=8` | GET | Yes | Persistence list is read-only | No | 200 with token | 401 unauth | P0 |
| `/api/v1/communications/outlook/import` | POST | Yes | `ENABLE_OUTLOOK_IMPORT` | Yes if enabled | 501 while off | 501 feature unavailable | P0 guard |
| `/api/v1/openapi.json` and `/openapi.json` | GET | No/current behavior | OpenAPI exposure policy | No | 200 sanitized spec if exposed | N/A | P1 guard |
| `/api/v1/no-such-route` | Any | Any | None | No | 404 | N/A | P0 |

## Frontend smoke matrix

| Route | Runtime API dependencies | Feature flags | Empty state | Release risk | Post-deploy smoke |
|---|---|---|---|---|---|
| `/` | auth/me, dashboard APIs | auth | Honest dashboard state | Medium | 200, no auth base localhost. |
| `/cases` | cases list | none | Empty cases list | Medium | 200, filters/actions render. |
| `/cases/<id>` | case detail, workflow summary, tasks/docs/comms | none | Case not found/empty sections | High | 200/404 as expected with real/smoke case. |
| `/tasks` | tasks list/update | none | Empty task list | Medium | 200 and task handoff links. |
| `/deadlines` | agenda/deadlines | none | Empty deadline agenda | Medium | 200 and compact hierarchy. |
| `/workload` | workload routes | none | Empty workload | Medium | 200; no fake utilization. |
| `/time-entries` | time entries | none | Empty time list | Medium | 200; reports secondary. |
| `/intake` | intake queue/readiness/opening actions | none | Empty intake queue | High | 200; no fake conflict clearance. |
| `/litigation-workspace` | case/litigation/document context | none | Missing context prompt | Medium | 200 with and without query. |
| `/documents/[documentId]/edit` | editor metadata/comments/capabilities | document flags affect server save only | Export-only Mode C state | High | 200; internal scroll top/mid/bottom. |
| `/documents/compare` | compare metadata | none | Metadata-only compare | Medium | 200; no text-diff claim. |
| `/editor-lab` | redirect/no durable editor | none | Redirect/blank draft | Low | Verify remains redirect/sandbox-safe. |
| `/clause-library` | clause-library API | `ENABLE_CLAUSE_LIBRARY` | Truthful unavailable state | Medium | 200 in enabled/disabled posture. |
| `/notifications` | communications list/intake actions | communications flags | Empty comms state | Medium | 200; no Outlook/AI claim. |
| `/portal` and subroutes | mock/disabled portal shell | Client portal flags off | Parked/mock state | High guard | 200 only if inert shell intended; no live client data. |

## Editor visual smoke

- Open `/documents/<real-or-smoke-document-id>/edit`.
- Verify workbench header/toolbar/status bar stay visible at top, middle, bottom.
- Verify central document viewport owns scrolling, not browser page.
- Verify Mode C copy states export-only/no server save.
- Verify DOCX import/export controls are present and local-only.
- Verify comments panel and review warning are visible without fake persistence.
