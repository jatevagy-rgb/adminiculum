# Adminiculum Backend Capability Matrix / Product Readiness Audit

Dátum: 2026-05-20
Scope: audit-only (no app code changes)

## 1. Current Truth
- Az Adminiculum backend **nem üres**: széles modul-készlettel rendelkezik (cases, documents, tasks, communications, legal-analyses, handoff-packages, clause-library, timesheet-reports, workgroups, settings, news-feed, auth, sharepoint).
- A fő gap nem „nulláról építés”, hanem: **felszínre hozás (UI), összekötés (route/nav), és production hardening**.
- Több „kész backend + gyengébb UI” capability azonnal pilot-értéket adhat kis patch-ekkel.

---

## 2. Capability Matrix

| Capability | Prisma model | Backend route/service | Frontend API helper | UI surface | E2E állás | Production gap | Következő patch |
|---|---|---|---|---|---|---|---|
| Ügyfélkezelés | `Client` | `modules/clients/routes.ts` | `getClients/createClient/updateClient` | `/clients`, `/clients/[clientId]` | Részben működő | jogosultság/soft-delete/merge policy | ügyfélsor action-hierarchia + dossier polish |
| Client house style | `ClientHouseStyleProfile` | `GET/PUT /clients/:id/house-style` | `getClientHouseStyle/updateClientHouseStyle` | `ClientHouseStylePanel`, workspace sablonok | Részben működő | validáció + változásnapló | dedikált house-style page |
| Header/branding profile | `ClientHouseStyleProfile.header*` | ugyanott (house style) | ugyanaz | clients panel + workspace sablon blokk | Részben működő | asset governance, storage policy | header asset preview + fallback szabályok |
| Külső AI prompt-copy | (nincs külön) + `LegalAnalysis` | legal-analyses + anonymize modul | `createDocumentLegalAnalysis`, prompt-copy helper-ek | workspace, Anonymize/AI panel | Működő (copy workflow) | audit/log hiányos | prompt-copy telemetry + disclaimer egységesítés |
| Anonimizálás | `AnonymousDocument`, `ClientRedactionProfile` | `modules/anonymize/routes.ts` (feature flag) | `anonymizeDocument`, `getAnonymousDocumentsBySource` | `AnonymizeModal` | Flag-függő működő | `ENABLE_AI_ANONYMIZATION`, provider kulcsok, SLA | fallback/hiba UX + retry path |
| Rehidratálás | `AnonymousDocument` + rehydration mezők | `import-ai-response`, `save-as-document` | `importAnonymousAiResponse`, `saveRehydratedResultAsDocument` | `RehydrateModal` | Flag-függő működő | token-quality + conflict policy | unresolved token kezelési UX |
| Dokumentumtár | `Document`, `DocumentVersion`, `TimelineEvent` | `modules/documents/routes.ts` | `getCaseDocuments/upload/download` | `/cases/[caseId]/documents` | Működő | SP hibaút, konfliktus-monitoring | document search + classification UI felszínre |
| Módosított munkapéldány mentése | `Document.workspaceText` + `documentType=MODIFIED_WORKING_COPY` | `POST /documents/:id/save-workspace-version` | `saveWorkspaceDocumentVersion` | `/documents/compare`, Dokumentumtár | Működő | verzió-visszaállítás hiányzik | workspace version history strip |
| Legal analysis | `LegalAnalysis` | `modules/legal-analyses/routes.ts` | `list/create/update/deleteDocumentLegalAnalysis` | `LegalAnalysisIntakePanel` | Részben működő | státusz-flow governance | önálló analysis oldal + queue |
| Leadási csomag | `LawyerHandoffPackage` | `modules/handoff-packages/routes.ts` | `listCaseHandoffPackages/create/update/review` | `HandoffPackagePanel` | Részben működő | export/approval workflow hardening | dedikált handoff page |
| Kommunikáció | `Communication`, `CommunicationAttachment` | `modules/communications/routes.ts` | `getCommunications/createCommunication/extractTask/extractDeadline` | `/cases/[caseId]/communications` | Részben működő | email/connector integráció nincs | comm feed + follow-up panel polish |
| Feladatok | `Task`, `TaskAssignmentHistory` | `modules/tasks/routes.ts` | `getCaseTasks/start/submit/complete/reassign` | `CaseDetail`, `/tasks`, `/reviews` | Működő (több entrypoint) | queue prioritization és SLA hiány | task board + assignee workload view |
| Határidők | `Deadline` (schema), timeline kapcsolatok | cases/deadline route-ok + comm extract-deadline | `getCaseDeadlines/extractDeadlines` | `/deadlines`, CaseDetail/sidebar | Részben működő | forrás-parsing quality + alerts | deadline board overdue UX |
| Review queue | `Task` + review status + `ContractReviewRecord` | tasks + review-notes + contracts compare | review helper-ek API-ban | `/reviews`, `/cases/[caseId]/review/[documentId]` | Részben működő | batch flow és ownership policy | review queue filters + batch actions |
| Clause Library | `ClauseLibraryItem`, `LawyerProfile`, `ContractAssembly*` | `modules/clause-library/routes.ts` | clause CRUD + assembly + recommend | `/clause-library` | Részben működő | governance/versioning hiány | clause usage + archive workflow |
| Time entries | `TimeEntry` | `routes/timeEntries.ts` | CRUD + summary helper-ek | `/time-entries` | Működő | auth/user mapping fallback kockázat | strict user mapping + validation hardening |
| Timesheet report generation | `TimesheetReportInstance`, `TimesheetReportArtifact`, `TimesheetPreset` | `modules/timesheet-reports/routes.ts` | report/preset/instance helper-ek | `/time-entries`, `/timesheet-presets` | Részben működő | export legal formatting QA | report instance history polish |
| Notifications | `Notification` | **nincs dedikált module/route** | **nincs dedicated notification API helper** | `/notifications` (aggregált feed) | UI-only aggregált | in-app notif persistence hiány | notification CRUD + read/unread API |
| Settings / UI pack | `SystemSetting` | `modules/settings/routes.ts` | `getSettings/getUiSettings/updateUiSettings` | `/settings` (jelenleg local-first) | Részben működő | authz + source-of-truth split | backend-backed UI pack opt-in |
| SharePoint upload/download/sync | `Case.sp*`, `Document.sp*` | `modules/sharepoint/*`, documents/contracts service | upload/download/sync helper-ek | docs/workspace/ledger | Részben működő | Graph permission + resilience + observability | SP health diagnostics endpoint |
| Azure auth / users / roles | `User`, role enum | `auth routes`, `middleware/auth.ts`, `azureAdAuth.ts` | `login/me/getUsers` | login + app shell | Működő, de heterogén | duplicated auth config, noisy logs | auth middleware consolidation |
| Workgroups | `ClientWorkgroup`, `WorkloadRecord` | `modules/workgroups/routes.ts` | workgroup/workload helper-ek | `/clients/[clientId]/workgroups` | Részben működő | KPI semantics + reporting | workload dashboard polish |
| Workflow status engine | `Case.status`, `TimelineEvent` | `modules/workflow/workflow.service.ts` + cases status route | `updateCaseStatus/getWorkflowGraph` | CaseDetail workflow strip | Működő | SP move partial-failure kezelés | workflow reconciliation admin tool |
| Audit/timeline | `TimelineEvent` | cases/documents/contracts/services create events | `getCaseTimeline/getCaseSummary` | CaseDetail timeline | Működő | event taxonomy inconsistency | timeline event normalization pass |
| News feed | (nincs prisma model) | `modules/news-feed/routes.ts` + rss service | `getNewsFeed` | Dashboard | Működő (feature flag) | upstream feed dependency | cache + fallback feed strategy |

---

## 3. "Már van, csak nincs jól felszínre hozva"

### Backendben létezik, UI-ban gyenge
- Clause library ajánlás/assembly backend képességek mélyebbek, mint a jelenlegi napi UI használat.
- Legal analysis státuszmodell erős, de page-level workflow gyenge.
- Handoff package review/state backend korrekt, de csak paneles UX.
- Timesheet report instance/artifact backend erős, UI-ban kevesebb életciklus-kezelés.
- Workflow graph/history backend kész, UX-ben részleges.

### UI-ban létezik, backend nincs vagy gyenge
- `/notifications` oldal aggregált feed, de nincs `Notification` API CRUD/read-state.
- Settings oldalon több blokk "későbbi patch", backend bridge részben hiányzik / nem kötött.

### API helper van, de nincs jó route/page kihasználás
- `searchDocuments`, `classifyDocument`, `getDocumentClassification` helper-ek nincsenek erősen felszínen.
- `extractDeadlines` helper nincs erős operatív flow-ba kötve.
- több clause-library helper csak részben használt.

### Route van, de gyenge navigáció
- review/deadline/task gyors útvonalak inkonzisztensek page-ek között.
- workspace és documents közötti kontextus-folytonosság javítandó.

### Feature van, de csak panelben (önálló page kellene)
- Handoff package
- Legal analysis operations
- House style operations (mélyebb admin nézet)

---

## 4. Notification Audit

### Prisma
- `Notification` modell létezik (`id, type, title, message, link, isRead, userId, createdAt`).
- `NotificationType` enum létezik.

### Backend route/service állapot
- Nem találtam dedikált `modules/notifications` route/service implementációt.
- Nincs explicit create/read/mark-read notification endpoint.

### Hol keletkeznek ma “jelzések”
- Eventek `TimelineEvent`-ként több modulban létrejönnek (cases/documents/handoff/workflow).
- `/notifications` UI ezeket + task/communication/dashboard adatokat aggregál operatív feeddé.

### Frontend megjelenítés
- Van `/notifications` oldal, de ez nem `Notification` táblát olvas.
- Nincs read/unread, dismiss, preference-persistence end-to-end.

### Kell-e notification center?
- Igen, pilothoz kell minimális **in-app notification center** (`list`, `mark read`, `unread count`).

### Email/Teams szükséges?
- Pilot fázisban elég: **in-app first**.
- Email/Teams: későbbi hardening (high-severity eventekre), nem P0.

---

## 5. SharePoint Readiness Audit

### Mit tud a Graph + drive service jelenleg
- Token szerzés `client_credentials` flow-val.
- Site feloldás URL-ből.
- Upload/download, version upload, checkout/checkin, move, case folder create, search, list.

### Case folder mapping
- Van workflow→folder mapping (`01_Client_Input` ... `08_Anonymized`).
- Workflow service document move-ot hív státuszváltáskor.

### Error handling
- Részben van (try/catch, retry a workflow service-ben).
- Hiány: egységes structured error + telemetry + alerting.
- `downloadDocument` Graph kliens jelenlegi GET JSON elvárása miatt különösen érzékeny (binary handling risk).

### Production config/env igény
- `DATABASE_URL`, `JWT_SECRET`.
- egyik auth credential set kötelező (SP/AZURE alternatívák).
- `AZURE_AD_TENANT_ID`, `AZURE_AD_AUDIENCE` auth validációhoz.
- `SHAREPOINT_SITE_URL`, esetenként `SP_SITE_ID`, `SP_DRIVE_ID`.

### Azure App Registration / permissions gap
- szükséges Graph app permissionek: legalább `Sites.ReadWrite.All`, `Files.ReadWrite.All` (+ consent).
- deploymentenként explicit audience/tenant tisztítás kell.
- prod hardening: per-env app registration + secret rotation policy.

---

## 6. Azure Deployment Readiness Audit

### DEPLOY/env/middleware megállapítások
- `DEPLOY.md` jó migration-discipline dokumentációt ad.
- env example-ek részletesek, de több auth-prefix él együtt (legacy + új).
- auth réteg jelenleg kettős jellegű (`auth.ts`, `azureAdAuth.ts`) és részben debug-verbose.
- health endpoint ad startup config health-et.

### DB config + migration stratégia
- Prisma migrate discipline jól dokumentált.
- production path: `migrate deploy` + `generate` rendben.

### Health/dbcheck
- `/health` van; dbcheck route is létezik a kódban.

### Fő production/staging gapek
- auth konfiguráció konzisztencia.
- sharepoint binary/telemetry hardening.
- notification domain nincs backendben kihasználva.
- feature-flag matrix per environment formalizálása hiányzik.

---

## 7. Product Readiness Score (0–100)

| Modul | Backend completeness | Frontend completeness | UX clarity | Production readiness |
|---|---:|---:|---:|---:|
| Ügykezelés + workflow | 85 | 78 | 72 | 68 |
| Dokumentumtár + workspace copy | 82 | 80 | 76 | 66 |
| Anonimizálás/Rehidratálás | 78 | 74 | 70 | 58 |
| Kommunikáció | 76 | 70 | 68 | 60 |
| Feladat + review queue | 80 | 72 | 66 | 62 |
| Clause library | 84 | 68 | 60 | 58 |
| Time entries + timesheet | 82 | 75 | 73 | 64 |
| House style / clients | 79 | 72 | 70 | 63 |
| Handoff package | 78 | 66 | 64 | 57 |
| Notifications | 35 | 58 | 62 | 40 |
| Settings / UI pack | 62 | 65 | 67 | 52 |
| SharePoint integration | 72 | 70 | 69 | 54 |
| Azure auth/users/roles | 74 | 68 | 65 | 56 |
| Workgroups | 77 | 69 | 65 | 58 |
| News feed | 70 | 72 | 74 | 55 |

Összkép (pilot readiness): **~64/100**.

---

## 8. Roadmap Correction (Surfacing / Integration / Hardening)

### 8.1 Current truth
- A backend erősebb, mint amit a jelenlegi UI láttat.
- A hiány nagy része integrációs és UX-felszínre hozási probléma.

### 8.2 What already exists
- workflow engine + timeline eventing
- document/sharepoint pipeline
- anonymize/rehydrate flow
- legal analyses + handoff + clause library domain model
- timesheet presets/instances/artifacts

### 8.3 What needs surfacing
- Notification model backendbe kötése.
- Clause + legal analysis + handoff domain mélyebb UI.
- Search/classification/deadline extraction operatív felülete.

### 8.4 What needs integration
- Route/nav konzisztencia pages között.
- Settings backend bridge (ui pack + policy scope).
- Review queue és task ownership flow egységesítése.

### 8.5 What needs production hardening
- auth middleware konszolidáció (Azure/custom JWT).
- sharepoint binary handling + telemetry + structured errors.
- env credential strategy egyszerűsítése.
- audit/event taxonomy normalizálás.

### 8.6 Pilot readiness checklist
- [ ] Auth matrix (Azure + local fallback) per environment validált
- [ ] SharePoint app permissions + consent + smoke-test script
- [ ] Core workflow E2E smoke (case->docs->workspace->handoff)
- [ ] Notification minimum (list/read/unread)
- [ ] Error budget + observability baseline (API + SP)
- [ ] Migration/deploy runbook dry-run stagingen
- [ ] Role/permission acceptance checklist

### 8.7 Recommended next 10 patches
1. Notification backend module (`GET list`, `PATCH read`, `unread count`) + frontend bekötés.
2. Auth hardening patch: `auth.ts`/`azureAdAuth.ts` konszolidált validációs policy.
3. SharePoint diagnostics endpoint + binary download handling hardening.
4. Settings backend-bridge patch (UI pack persistence toggle per-user/system scope).
5. Review queue ownership/actions egységesítés (task/document review states).
6. Handoff package standalone page (panelből page-re emelés).
7. Legal analysis standalone queue + state transitions UX.
8. Deadline board extraction pipeline felszínre hozás.
9. Document search + classification UI bekötés.
10. Timeline event normalization patch (egységes eventType/type/payload séma).

---

## 9. Top 10 Existing Backend Capabilities Not Fully Surfaced
1. `Notification` domain model (persisted) backend route nélkül.
2. Clause-library recommendation + assembly backend mélység.
3. LegalAnalysis státuszfolyam.
4. Handoff package review/decision lifecycle.
5. Workflow graph/history és role-gated transitions.
6. Timesheet artifact/instance lifecycle.
7. Document metadata search endpoint.
8. Document classification endpoints.
9. Deadline extraction + case deadline listing.
10. Workgroup workload summary domain.

## 10. Top 10 Production Gaps
1. Notification backend hiány.
2. Auth middleware duplikáció/inkonzisztencia.
3. SharePoint binary/error/telemetry hardening hiány.
4. Env credential set komplexitás (legacy+new együtt).
5. Feature-flag matrix governance hiány.
6. E2E smoke automation hiány pilot flow-ra.
7. Timeline event taxonomy nem teljesen egységes.
8. Settings source-of-truth szétválik (local vs backend).
9. Review/task ownership policy részben implicit.
10. Export/compliance auditing hiányos (timesheet/handoff).
