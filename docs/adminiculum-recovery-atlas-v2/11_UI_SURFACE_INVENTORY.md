# UI surface inventory

| Surface | Current route/component | Historical variants | Navigation | Backend | Quality/recovery |
|---|---|---|---|---|---|
| Dashboard | `/`, dashboard components | workload cards, simplified grid | reachable | real read models | current clarity improved; preserve attention |
| Cases | `/cases`, `CasesList` | intake wizard, intake workspace, compact dialog | reachable | case APIs | compact/contextual path preferred |
| Case overview | `/cases/[caseId]`, case page | cockpit/workspace generations | reachable | case/workspace services | summary-first semantics preferred |
| Documents | `/cases/[caseId]/documents` | document journey generations | reachable | document/storage | strong; preserve case context |
| Document compare | `/documents/compare` | editor/compare generations | reachable | comparison APIs | metadata current; text diff recovery |
| Review | case review route, `/reviews` | operational review workspace | reachable | review/task APIs | preserve explicit loading/empty states |
| Communications | `/communications` and case route | incoming inbox/contextual stack | reachable | communications routes | merge contextual projections |
| Clients | `/clients`, client dossier | client workspace generations | reachable | clients APIs | case-aware actions |
| Portal admin | `/client-portal-admin/*` | CP0/CP1 generations | reachable by workforce | portal admin APIs | security-sensitive |
| Individual portal | `/portal/*` | private portal generations | mode-scoped | portal identity/grants | preserve truthful unavailable states |
| Organization portal | `/portal/szervezeti-attekintes`, organization pages | Phase 5/CP1 | mode-scoped | org read models | substantial; internal intake cut remains |
| Compliance/Grow | client/company/org surfaces | Phase 6/7 | organization-scoped | evaluator/read models | strong island |
| Tasks | `/tasks` | work-item and review generations | reachable | task lifecycle | connect to case/work package |
| Time | `/time-entries`, `/workload` | time economics/capacity | reachable | time/report services | reconnect task/deadline context |
| Calendar/Agenda | `/calendar`, `/deadlines` | dashboard calendar variants | reachable | agenda service | map intake deadlines |
| Clause library | `/clause-library` | generation/assembly routes | route exists | clause API | surface coherence uncertain |
| Anonymization | modal components | historical editor integrations | modal reachable from docs | anonymize services | keep security boundary |
| Handoff | `/cases/[caseId]/handoff` | handoff package workflow | route evidence | handoff service | backend/UI reconnect candidate |

Historical runtime is not claimed: `HISTORICAL_UI_RUNTIME_UNPROVEN`.
