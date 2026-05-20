# Adminiculum — Expanded Feature / Board / Component Inventory

**Report date:** 2026-05-20
**Author:** MiniMax Agent (audit-only, no code changes)

---

## 1. Executive Summary

### Miért volt alul-lőve az előző inventory?

Az előző inventory kizárólag **Next.js route-okra** koncentrált (`/cases`, `/cases/[caseId]/documents`, stb.). Ez a legszűkebb metszés — a valóságban az Adminiculum egy **moduláris, komponens-alapú alkalmazás**, ahol:

- A legtöbb funkció **komponensként** él, nem önálló page-ként
- Számos **modal/drawer** létezik route nélkül
- Több **API-képesség** van, ami UI-ban alulreprezentált
- Számos **félkész, hidden, vagy legacy** funkció nem jelent meg a route-inventoryban
- Board-ok, panelek, sidebarek nem önálló route-ok, de kritikus UX elemek
- A **legal prompt catalog** csak komponensként létezik
- A **HandoffPackagePanel** és **ClientHouseStylePanel** route nélküli panelek

### Számok

| Kategória | Darab |
|-----------|-------|
| Route-alapú oldal | ~14 |
| Komponens (components/) | ~27 |
| Board / major panel | ~12 |
| Modal / drawer | ~10 |
| API function (api.ts) | ~80+ |
| Backend service file | ~20+ |
| Prisma model | ~20 |
| Design HTML (ismert) | 4 |

### Top 10 hiányzó design target (prioritás szerint)

1. **Ügykommunikáció page** — nincs chat-szerű UI, nincs valódi communications board
2. **Munkaórák page** — case-aware banner + timesheet riport generálás UI hiányzik
3. **Szerződés-workspace backlinkek** — "← Vissza az ügyhöz" nincs
4. **Leadási csomag önálló page** — csak sidebar panel létezik
5. **Feladat/határidő panel polish** — CaseDetail sidebar task panel design
6. **Ügyfelek / House style page** — nincs dedicated client/house-style page
7. **Review queue page** — batch review sor hiányzik
8. **Clause Library page** — önálló clause management page hiányzik
9. **Beállítások page** — settings page nem létezik
10. **Document selection modal** — dokumentum kiválasztó modal hiányzó

### Top 10 hiányzó UI összeköttetés

| # | Kiinduló | Cél | Hiányzó gomb |
|---|---------|-----|-------------|
| 1 | Szerződés-workspace | Ügy áttekintő | "← Vissza az ügyhöz" |
| 2 | Szerződés-workspace | Dokumentumtár | "← Vissza a Dokumentumtárba" |
| 3 | Munkaórák | Ügy áttekintő | "← Vissza az ügyhöz" banner (case pre-filled) |
| 4 | Ügy áttekintő | Leadási csomag | "Leadási csomag készítése" CTA |
| 5 | Ügyfelek | Új ügy | "+ Új ügy" per client row |
| 6 | Dokumentumtár | Leadási csomag | Sidebar header CTA |
| 7 | CaseDetail sidebar | Leadási csomag | Sidebar panel |
| 8 | Ügy áttekintő | Review queue | "Review sor megnyitása" |
| 9 | Kommunikáció | Feladat létrehozás | "Feladat kinyerése" — már van, de polish kell |
| 10 | Client dossier | House style szerkesztés | Inline szerkesztő hiányzik |

---

## 2. Route Inventory (Short)

| Route | Oldal neve | Készültség | Megjegyzés |
|-------|-----------|-----------|-----------|
| `/` | Dashboard | ⚠️ delegates | Wrapper only |
| `/cases` | Ügyek listája | ✅ ~80% | Workplan route builder patched |
| `/cases/[caseId]` | Ügy áttekintő | ✅ ~70% | CaseDetail ~2200 lines |
| `/cases/[caseId]/documents` | Dokumentumtár | ✅ ~85% | Active document panel patched |
| `/cases/[caseId]/communications` | Ügykommunikáció | ✅ ~60% | Belső jegyzet csak |
| `/cases/[caseId]/generate` | Dokumentum-előkészítés | ⚠️ partial | Template-based |
| `/cases/[caseId]/generate/assembly` | Klauzula-alapú összeállítás | ⚠️ partial | Redirected to workspace |
| `/cases/[caseId]/review/[documentId]` | Review | ✅ ~75% | Per-document approve/reject |
| `/cases/[caseId]/review/[documentId]/edit` | Szerkesztés | ⚠️ partial | Clause suggestion |
| `/documents/compare` | Szerződés-workspace | ✅ ~80% | Version panel patched |
| `/time-entries` | Munkaórák | ✅ ~75% | Case-aware patched |
| `/clients` | Ügyfelek | ✅ ~70% | New client modal |
| `/clients/[clientId]` | Ügyfél dosszié | ✅ ~70% | House style inline |
| `/clients/[clientId]/workgroups` | Munkacsoportok | ⚠️ partial | Workload tracking |
| `/stitch` | StitchLayout | ⚠️ legacy | Alternative layout |
| `/settings` | — | ❌ nincs | Settings page not implemented |
| `/tasks` | — | ❌ nincs | Standalone task page not implemented |
| `/deadlines` | — | ❌ nincs | Standalone deadline page not implemented |

---

## 3. Expanded Feature Map

### Ügy / Case Workflow

| Feature / board / modal / panel | Hol található | Route van? | UI látható? | API van? | Készültség | Megjegyzés |
|-------------------------------|---------------|-----------|-----------|---------|-----------|-----------|
| Aktív ügyek lista | `CasesList.tsx` | ✅ `/cases` | ✅ | ✅ | ~80% | Workplan route builder, deep-link |
| Új ügy modal | `CasesList.tsx` inline | ✅ `/cases` modal | ✅ | ✅ | ~80% | 6-step modal, client selection |
| Ügy áttekintő / munkapad | `CaseDetail.tsx` | ✅ `/cases/[caseId]` | ✅ | ✅ | ~70% | ~2200 lines, sidebar panels |
| CaseWorkspaceNav | `cases/CaseWorkspaceNav.tsx` | ✅ | ✅ | ❌ | ✅ | 6 tab: overview, documents, workspace, comm, versions, time |
| Case participants | `CaseDetail.tsx` sidebar | ❌ | ✅ | ✅ | ✅ | Collaborator management |
| Felelős ügyvéd kijelölése | `CaseDetail.tsx` header | ❌ | ✅ | ✅ | ✅ | Dropdown + assign |
| Client role editing | `CaseDetail.tsx` header | ❌ | ✅ | ✅ | ✅ | Edit client role inline |
| Deadline editing | `CaseDetail.tsx` header | ❌ | ✅ | ✅ | ✅ | Date picker inline |
| Matter type display | `CaseDetail.tsx` header | ❌ | ✅ | ✅ | ✅ | Read-only display |
| Ügy lezárása / archive | `CaseDetail.tsx` main | ❌ | ✅ | ✅ | ✅ | Archive CTA box |
| Timeline / case story | `CaseDetail.tsx` main | ❌ | ✅ | ✅ | ✅ | Day-grouped, event type icons |
| Internal notes (add) | `CaseDetail.tsx` main | ❌ | ✅ | ✅ | ✅ | Note creation inline |
| Workflow context collapsed | `CaseDetail.tsx` sidebar | ❌ | ✅ | ✅ | ✅ | `<details>` collapsed |
| Ügyállapot box | `CaseDetail.tsx` main | ❌ | ❌ | ❌ | ❌ | Removed — redundant |
| Adatforrások box | `CaseDetail.tsx` main | ❌ | ❌ | ❌ | ❌ | Removed — decorative only |
| Klauzula CTA | `CaseDetail.tsx` sidebar | ❌ | ✅ | ✅ | ✅ | Redirected to workspace |
| AI / anonimizálás panel | `CaseDetail.tsx` sidebar | ❌ | ✅ | ✅ | ✅ | `<details>` collapsed |
| Workplan task panel | `CaseDetail.tsx` sidebar | ❌ | ✅ | ✅ | ✅ | Filtered by "Munkaterv / review-útvonal" |
| Feladat panel | `CaseDetail.tsx` sidebar | ❌ | ✅ | ✅ | ✅ | Tasks sidebar |
| Kommunikációs összefoglaló | `CaseDetail.tsx` sidebar | ❌ | ✅ | ✅ | ✅ | Comm summary panel |
| Munkafolyamat tracker | `CaseDetail.tsx` sidebar | ❌ | ✅ | ✅ | ✅ | Workflow stage tracker |
| Review queue link | `CaseDetail.tsx` | ❌ | ❌ | ❌ | ❌ | Nincs CTA — missing |
| Clause library link | `CaseDetail.tsx` | ❌ | ❌ | ❌ | ❌ | Nincs CTA — missing |

### Ügyfél / Client Workflow

| Feature | Hol található | Route van? | UI látható? | API van? | Készültség | Megjegyzés |
|---------|---------------|-----------|-----------|---------|-----------|-----------|
| Ügyfelek lista | `clients/page.tsx` | ✅ `/clients` | ✅ | ✅ | ~70% | Table + per-row actions |
| Új ügyfél modal | `clients/page.tsx` inline | ✅ `/clients` modal | ✅ | ✅ | ~70% | Név, email, tel, szerepkör |
| Ügyfél dossier | `clients/[clientId]/page.tsx` | ✅ `/clients/[clientId]` | ✅ | ✅ | ~70% | Cases list, collaborators |
| House style panel | `clients/ClientHouseStylePanel.tsx` | ❌ (inline) | ✅ | ✅ | ~50% | Used in docs sidebar + dossier |
| House style szerkesztő | `ClientHouseStylePanel.tsx` | ❌ | ✅ | ✅ | ~50% | Groups: basic, language, formatting, branding, AI instructions |
| Client workgroups | `clients/[clientId]/workgroups/page.tsx` | ✅ `/clients/[clientId]/workgroups` | ✅ | ✅ | ⚠️ partial | Workload per period |
| New case from client | `clients/[clientId]/page.tsx` | ✅ | ✅ | ✅ | ✅ | → `/cases?newCase=1&clientId=X` |
| Client collaborator management | `ClientHouseStylePanel.tsx` + dossier | ❌ | ✅ | ✅ | ✅ | In dossier page |
| BlackBelt/Saubermacher core support | ❌ | ❌ | ❌ | ❌ | ❌ | No special UI identified |

### Dokumentum Workflow

| Feature | Hol található | Route van? | UI látható? | API van? | Készültség | Megjegyzés |
|---------|---------------|-----------|-----------|---------|-----------|-----------|
| Dokumentumtár | `cases/[caseId]/documents/page.tsx` | ✅ | ✅ | ✅ | ~85% | 3 category ledger |
| Document upload | same page | ✅ | ✅ | ✅ | ✅ | File input trigger |
| Active document panel | same page | ❌ | ✅ | ✅ | ✅ | Context-dependent buttons |
| Uploaded documents list | same page | ❌ | ✅ | ✅ | ✅ | CLIENT_INPUT type |
| Modified working copies | same page | ❌ | ✅ | ✅ | ✅ | MODIFIED_WORKING_COPY type |
| Generated documents | same page | ❌ | ✅ | ✅ | ✅ | Contract generations |
| Document text extraction | `getDocumentText` API | ❌ | ❌ | ✅ | ✅ | Used in workspace |
| Workspace open | same page + compare page | ✅ `/documents/compare` | ✅ | ✅ | ✅ | Megnyitás workspace-ben |
| Document download | same page | ❌ | ✅ | ✅ | ✅ | `downloadDocument`, `downloadContract` |
| Package creation | same page sidebar | ❌ | ✅ | ✅ | ✅ | HandoffPackagePanel |
| SharePoint sync | same page | ❌ | ✅ | ✅ | ✅ | `uploadGeneratedContractToSharePoint` |
| Document status pills | same page | ❌ | ✅ | ✅ | ✅ | "Ready", "Review Needed", "Archived" |
| Document selection modal | ❌ | ❌ | ❌ | ❌ | ❌ | Missing — Bridge 3 |
| Document preview / metadata panel | compare page | ✅ `/documents/compare` | ✅ | ✅ | ✅ | Right sidebar metadata |
| Legal analysis intake | `LegalAnalysisIntakePanel.tsx` | ❌ | ✅ | ✅ | ✅ | Panel in workspace |
| Legal analysis list | `LegalAnalysisIntakePanel.tsx` | ❌ | ✅ | ✅ | ✅ | `listDocumentLegalAnalyses` |
| Document classification | `api.ts` | ❌ | ❌ | ✅ | ✅ | `classifyDocument` — no UI |
| Document search | `api.ts` | ❌ | ❌ | ✅ | ✅ | `searchDocuments` — no UI |

### Szerződés-workspace

| Feature | Hol található | Route van? | UI látható? | API van? | Készültség | Megjegyzés |
|---------|---------------|-----------|-----------|---------|-----------|-----------|
| Document compare/workspace | `documents/compare/page.tsx` | ✅ `/documents/compare` | ✅ | ✅ | ~80% | Version panel patched |
| Editor draft | same page | ❌ | ✅ | ✅ | ✅ | Block editor |
| Save modified working copy | same page | ❌ | ✅ | ✅ | ✅ | `saveWorkspaceDocumentVersion` |
| Document text loading states | same page | ❌ | ✅ | ✅ | ✅ | Loading spinner |
| No-document state | same page | ❌ | ✅ | ✅ | ✅ | Select document prompt |
| AI prompt panel | same page + `AIPromptPanel.tsx` | ❌ | ✅ | ✅ | ✅ | Tool tabs |
| Prompt copy buttons | same page | ❌ | ✅ | ❌ | ✅ | Clipboard only |
| Anonymization | `AnonymizeModal.tsx` | ❌ (modal) | ✅ | ✅ | ✅ | Full modal |
| Rehydration | `RehydrateModal.tsx` | ❌ (modal) | ✅ | ✅ | ✅ | Full modal |
| Clause insertion | same page | ❌ | ✅ | ✅ | ✅ | "Insert Clause" |
| Comments | same page | ❌ | ✅ | ❌ | ✅ | Review notes |
| Corrections | same page | ❌ | ✅ | ❌ | ✅ | Workspace corrections |
| Version comparison | same page | ❌ | ✅ | ✅ | ✅ | Compare page version panel |
| Baseline selection | same page | ❌ | ✅ | ✅ | ✅ | Baseline picker |
| Block comparison | same page | ❌ | ✅ | ✅ | ✅ | Block-level compare |
| Legal analysis intake | `LegalAnalysisIntakePanel.tsx` | ❌ | ✅ | ✅ | ✅ | In workspace |
| Word export | `contracts` API | ❌ | ❌ | ✅ | ✅ | `downloadContract` |
| Save button state | same page | ❌ | ✅ | ✅ | ✅ | Mentés / Véglegesítés |
| Vissza gombok | same page | ❌ | ❌ | ❌ | ❌ | Missing — HIGH priority |

### AI / Prompt Workflow

| Feature | Hol található | Route van? | UI látható? | API van? | Készültség | Megjegyzés |
|---------|---------------|-----------|-----------|---------|-----------|-----------|
| Legal prompt catalog | `legalPromptCatalog.ts` | ❌ | ✅ | ❌ | ✅ | 20+ templates |
| Prompt groups | `AIPromptPanel.tsx` | ❌ | ✅ | ❌ | ✅ | Categories |
| External AI prompt buttons | same + `AnonymizeModal` | ❌ | ✅ | ❌ | ✅ | Copy prompt only |
| Copy prompt | same page | ❌ | ✅ | ❌ | ✅ | Copy Prompt button |
| Copy prompt + text | same page | ❌ | ✅ | ❌ | ✅ | Copy + text button |
| Anonymized text prompt | `AnonymizeModal.tsx` | ❌ (modal) | ✅ | ✅ | ✅ | Source text workspace |
| Client house style prompt | `AIPromptPanel.tsx` | ❌ | ✅ | ❌ | ✅ | `buildHouseStyleInstructionBlock` |
| AI bridge panel | `CaseDetail.tsx` sidebar | ❌ | ✅ | ✅ | ✅ | Collapsed details |
| Analysis document workflow | `LegalAnalysisIntakePanel.tsx` | ❌ | ✅ | ✅ | ✅ | Status: Nincs/ Jelölt/ Ügyvéd/ Jóváhagyásra kész |

### Anonymizálás / Rehidratálás

| Feature | Hol található | Route van? | UI látható? | API van? | Készültség | Megjegyzés |
|---------|---------------|-----------|-----------|---------|-----------|-----------|
| Anonymization modal | `AnonymizeModal.tsx` | ❌ (modal) | ✅ | ✅ | ✅ | Fullscreen modal |
| Rehydration modal | `RehydrateModal.tsx` | ❌ (modal) | ✅ | ✅ | ✅ | Fullscreen modal |
| Redacted text display | `AnonymizeModal.tsx` | ❌ | ✅ | ✅ | ✅ | Source text workspace |
| Placeholder map | `AnonymizeModal.tsx` | ❌ | ✅ | ✅ | ✅ | Party metadata |
| Copy redacted text | `AnonymizeModal.tsx` | ❌ | ✅ | ❌ | ✅ | Clipboard |
| AI task selection | `AnonymizeModal.tsx` | ❌ | ✅ | ✅ | ✅ | REVIEW_RISKS, COMPARE_TEMPLATE, SUMMARIZE, CUSTOM |
| Redaction level | `AnonymizeModal.tsx` | ❌ | ✅ | ✅ | ✅ | Slider/selector |
| Rehydration status | `RehydrateModal.tsx` | ❌ | ✅ | ✅ | ✅ | Status display |
| Token resolution | `RehydrateModal.tsx` | ❌ | ✅ | ✅ | ✅ | Resolved/unresolved count |
| Save as modified working copy | `RehydrateModal.tsx` | ❌ | ✅ | ✅ | ✅ | `saveRehydratedResultAsDocument` |

### Clause / Template Workflow

| Feature | Hol található | Route van? | UI látható? | API van? | Készültség | Megjegyzés |
|---------|---------------|-----------|-----------|---------|-----------|-----------|
| Clause Library page | ❌ | ❌ | ❌ | ✅ | ⚠️ partial | Route exists but no dedicated page |
| Clause catalog | `legalPromptCatalog.ts` | ❌ | ✅ | ❌ | ✅ | 20+ templates |
| Clause insertion | `documents/compare/page.tsx` | ✅ | ✅ | ✅ | ✅ | Insert Clause button |
| Clause preview | same page | ❌ | ✅ | ✅ | ✅ | In suggest panel |
| Contract templates | `contracts` API | ❌ | ❌ | ✅ | ✅ | `getContractTemplates` |
| Contract generation | `generateContract` API | ❌ | ❌ | ✅ | ✅ | `/cases/[caseId]/generate` page |
| Old generator remnants | `generate/page.tsx` | ✅ | ⚠️ partial | ✅ | ⚠️ partial | Redirected to workspace |
| `/generate/assembly` | `assembly/page.tsx` | ✅ | ⚠️ partial | ✅ | ⚠️ partial | Clause assembly page |
| Template categories | `contracts` API | ❌ | ❌ | ✅ | ✅ | By category filter |
| Clause library routes | `clause-library/routes.ts` | ✅ | ⚠️ partial | ✅ | ✅ | 14 endpoints |
| Clause usage analytics | `clause-library/service.ts` | ❌ | ❌ | ✅ | ✅ | Usage count tracked |

### Kommunikáció

| Feature | Hol található | Route van? | UI látható? | API van? | Készültség | Megjegyzés |
|---------|---------------|-----------|-----------|---------|-----------|-----------|
| Communications page | `communications/page.tsx` | ✅ | ✅ | ✅ | ~60% | Belső jegyzet only |
| Participant strip | same page | ❌ | ✅ | ✅ | ✅ | Case participants |
| Internal notes | same page | ❌ | ✅ | ✅ | ✅ | NOTE type only |
| Quick note composer | same page | ❌ | ✅ | ✅ | ✅ | Textarea + save |
| Communication list | same page | ❌ | ✅ | ✅ | ✅ | List view |
| Message detail | same page | ❌ | ✅ | ✅ | ✅ | Selected note detail |
| Linked task | same page | ❌ | ✅ | ✅ | ✅ | "Feladat kinyerése" |
| Linked deadline | same page | ❌ | ✅ | ✅ | ✅ | "Határidő beállítása" |
| Attachments | same page | ❌ | ✅ | ✅ | ✅ | Document linking |
| Communication type handling | same page | ❌ | ✅ | ✅ | ✅ | NOTE, EMAIL, PHONE, MEETING |
| Communication summary panel | `CaseDetail.tsx` sidebar | ❌ | ✅ | ✅ | ✅ | Comm summary |
| `extractTaskFromCommunication` | `communications/routes.ts` | ❌ | ⚠️ partial | ✅ | ✅ | UI button exists |
| `extractDeadlineFromCommunication` | `communications/routes.ts` | ❌ | ⚠️ partial | ✅ | ✅ | UI button exists |

### Munkaórák

| Feature | Hol található | Route van? | UI látható? | API van? | Készültség | Megjegyzés |
|---------|---------------|-----------|-----------|---------|-----------|-----------|
| Time entries page | `time-entries/page.tsx` | ✅ `/time-entries` | ✅ | ✅ | ~75% | Case-aware patched |
| Case-aware mode | same page | ✅ | ✅ | ✅ | ✅ | `?caseId=` query param |
| Matter prefill from caseId | same page | ✅ | ✅ | ✅ | ✅ | `getCaseSummary().matterId` |
| Preset work types | same page | ❌ | ✅ | ✅ | ✅ | 6 presets |
| Timesheet reports | same page | ❌ | ✅ | ✅ | ✅ | Template + preset + autofill |
| Saved report instances | same page | ❌ | ✅ | ✅ | ✅ | `listTimesheetReportInstances` |
| Monthly report generation | same page | ❌ | ✅ | ✅ | ✅ | DOCX output |
| Billing/export | same page | ❌ | ❌ | ✅ | ❌ | Placeholder only |
| TimeEntry CRUD | `timeEntries.ts` routes | ❌ | ✅ | ✅ | ✅ | `createTimeEntry`, etc. |

### Feladatok / Határidők / Review

| Feature | Hol található | Route van? | UI látható? | API van? | Készültség | Megjegyzés |
|---------|---------------|-----------|-----------|---------|-----------|-----------|
| Tasks page | ❌ | ❌ | ❌ | ✅ | ❌ | Not standalone |
| Deadlines page | ❌ | ❌ | ❌ | ✅ | ❌ | Not standalone |
| Review queue | ❌ | ❌ | ❌ | ✅ | ❌ | Not standalone — only per-doc |
| Task creation | `CaseDetail.tsx` + comms | ❌ | ✅ | ✅ | ✅ | From comms extract + inline |
| Task status actions | `CaseDetail.tsx` sidebar | ❌ | ✅ | ✅ | ✅ | Indítás/Beküldés/Jóváhagyás/Elutasítás |
| Task assignment | `CaseDetail.tsx` + cases | ❌ | ✅ | ✅ | ✅ | `reassignTask` |
| Workplan-created tasks | `CasesList.tsx` | ❌ | ✅ | ✅ | ✅ | Workplan route builder |
| Review-needed documents | `review/[documentId]/page.tsx` | ✅ | ✅ | ✅ | ✅ | Per-document |
| Deadline from communication | `communications/routes.ts` | ❌ | ✅ | ✅ | ✅ | `extractDeadlineFromCommunication` |
| Case right sidebar task panel | `CaseDetail.tsx` sidebar | ❌ | ✅ | ✅ | ✅ | Task panel |
| `getCaseDeadlines` | `cases/routes.ts` | ❌ | ❌ | ✅ | ✅ | No UI |
| `extractDeadlines` | `cases/routes.ts` | ❌ | ❌ | ✅ | ⚠️ partial | Document → deadline extraction |

### Leadási Csomag

| Feature | Hol található | Route van? | UI látható? | API van? | Készültség | Megjegyzés |
|---------|---------------|-----------|-----------|---------|-----------|-----------|
| HandoffPackagePanel | `handoff/HandoffPackagePanel.tsx` | ❌ (panel) | ✅ | ✅ | ~55% | In document ledger sidebar |
| Package creation | same panel | ❌ | ✅ | ✅ | ✅ | `createCaseHandoffPackage` |
| Package status | same panel | ❌ | ✅ | ✅ | ✅ | DRAFT/PREPARED/SUBMITTED/IN_REVIEW/APPROVED/REJECTED/ARCHIVED |
| Package items | same panel | ❌ | ✅ | ✅ | ✅ | Source doc, anonymized, legal analysis |
| Original document link | same panel | ❌ | ✅ | ✅ | ✅ | Source document |
| Modified working copy | same panel | ❌ | ✅ | ✅ | ✅ | From workspace |
| Legal analysis link | same panel | ❌ | ✅ | ✅ | ✅ | From LegalAnalysisIntake |
| Communication summary | same panel | ❌ | ⚠️ partial | ✅ | ✅ | Extract from communications |
| Time entries extract | same panel | ❌ | ❌ | ✅ | ❌ | Not implemented |
| Approval warning | same panel | ❌ | ✅ | ✅ | ✅ | Yellow warning box |
| Export placeholders | same panel | ❌ | ❌ | ✅ | ❌ | No export UI |
| Standalone handoff page | ❌ | ❌ | ❌ | ❌ | ❌ | Missing — HIGH priority |

### Settings / Admin

| Feature | Hol található | Route van? | UI látható? | API van? | Készültség | Megjegyzés |
|---------|---------------|-----------|-----------|---------|-----------|-----------|
| Settings page | ❌ | ❌ | ❌ | ❌ | ❌ | Not implemented |
| UI pack/theme selector | `uiPack.ts` + docs sidebar | ❌ | ✅ | ❌ | ⚠️ partial | `useUiPack` hook + signal_tiles_console |
| User settings | ❌ | ❌ | ❌ | ❌ | ❌ | Not implemented |
| Notifications | ❌ | ❌ | ❌ | ❌ | ❌ | Not implemented |
| SharePoint status | `HandoffPackagePanel` | ❌ | ✅ | ✅ | ✅ | SP sync status |
| Azure/MS auth status | `AuthenticatedApp.tsx` | ✅ | ✅ | ✅ | ✅ | MSAL flow |
| Local dev/test attorney | `LoginScreen.tsx` | ❌ | ✅ | ❌ | ✅ | Dev sign-in |
| FIrelegal data | ❌ | ❌ | ❌ | ❌ | ❌ | Not implemented |
| Appearance options | ❌ | ❌ | ❌ | ❌ | ❌ | Not implemented |

### Dashboard / Misc

| Feature | Hol található | Route van? | UI látható? | API van? | Készültség | Megjegyzés |
|---------|---------------|-----------|-----------|---------|-----------|-----------|
| Main dashboard | `Dashboard.tsx` | ✅ `/` | ✅ | ✅ | ✅ | Has two UI modes |
| RightPanel (deadlines) | `RightPanel.tsx` | ❌ | ✅ | ❌ | ✅ | Dashboard panel |
| Notifications | `Sidebar.tsx` | ❌ | ✅ | ❌ | ⚠️ partial | Icon in topbar |
| Search | `search.ts` lib | ❌ | ❌ | ✅ | ⚠️ partial | `searchDocuments` — no UI |
| Global sidebar | `Sidebar.tsx` | ✅ | ✅ | ❌ | ✅ | Navigation |
| Header buttons | `TopBar.tsx` | ✅ | ✅ | ❌ | ✅ | Search, notifications, sign out |
| Audit logs | ❌ | ❌ | ❌ | ❌ | ❌ | Not implemented |
| TimelineBoard | `TimelineBoard.tsx` | ❌ | ⚠️ partial | ✅ | ⚠️ partial | Not clearly used in routes |
| StitchLayout | `Layout/StitchLayout.tsx` | ✅ `/stitch` | ⚠️ partial | ❌ | ⚠️ legacy | Alternative layout |
| AuthenticatedLanding | `AuthenticatedLanding.tsx` | ❌ | ⚠️ partial | ❌ | ⚠️ legacy | Transition page |
| AppProviders | `AppProviders.tsx` | ✅ | ✅ | ❌ | ✅ | MSAL init |
| AppShell | `AppShell.tsx` | ✅ | ✅ | ❌ | ✅ | Layout shell |

---

## 4. Board Inventory

| Board neve | Hol jelenik meg | Oszlopok/panelek | Gombok | Állapotok | Design kell? |
|-----------|----------------|-----------------|--------|-----------|-----------|
| **Ügy munkapad** | `/cases/[caseId]` | Header + quick action grid + timeline + sidebar (munkaterv, dokumentumok, generált, AI, jegyzetek, feladatok, komm, workflow) | Szerződés-workspace, Feltöltés, Kommunikáció, Munkaórák | case status chip | ✅ Munkapad.html |
| **Dokumentumtár ledger** | `/cases/[caseId]/documents` | 3 category list (feltöltött/módosított/generált) + active document panel + house style sidebar + timeline | Megnyitás workspace, Letöltés, SharePoint, Review, Anonimizálás, Csomag | document status | ✅ Dokumentumtár.html |
| **Szerződés-workspace** | `/documents/compare` | Tool tabs (Klauzulák/AI/Sablonok/Anonimizálás/Rehidratalás/Megjegyzések/Javítások) + editor + metadata sidebar | Mentés, Véglegesítés, Letöltés, Copy Prompt, Save as Clause, Insert | draft state | ✅ Workspace.html (részleges) |
| **Ügykommunikációs board** | `/cases/[caseId]/communications` | Jegyzet lista + jegyzet részlet + linked docs + új jegyzet szerkesztő | Feladat kinyerése, Határidő beállítása, Dokumentum kapcsolása | note type badges | ❌ Nincs HTML |
| **Munkaóra board** | `/time-entries` | Entries táblázat (grouped by client) + új bejegyzés form (6 preset) + timesheet riport generálás | Mentés, Autofill, Generálás DOCX, Letöltés | loading, empty | ❌ Nincs HTML |
| **Feladat/review board** | CaseDetail sidebar | Task list (assignee, due date, priority, status) + inline action buttons | Indítás, Beküldés, Jóváhagyás, Elutasítás | overdue/today/future colors | ❌ Nincs HTML |
| **House style editor board** | `ClientHouseStylePanel.tsx` | 5 group: basic info, language/document, word formatting, header/branding, AI instructions | Mentés | has content / empty | ❌ Nincs önálló HTML |
| **Prompt catalog board** | `AIPromptPanel.tsx` | Category filter + prompt list + preview + copy buttons | Copy Prompt, Copy + text | category selected | ❌ Nincs önálló HTML |
| **Leadási csomag board** | `HandoffPackagePanel.tsx` | Package list + create form (dokumentum + anonymized + legal analysis) | Létrehozás, Megnyitás, Export (future) | DRAFT/SUBMITTED/IN_REVIEW/APPROVED/REJECTED | ❌ Nincs önálló HTML |
| **Verzió-összevetés board** | `/documents/compare` sidebar | Version panel: baseline selector + comparison results + lineage | Metaadat összevetés, Verzió-összevetés (future) | has data / empty | ❌ Nincs önálló HTML |
| **Clause Library board** | `/cases/[caseId]/generate/assembly` | Clause selector + AI recommend + B400 intake + bundle options | Záradékok ajánlása, Tervezet mentése, Generálás | has clauses / empty | ❌ Nincs önálló HTML |
| **Ügyfél board** | `/clients` | Client table + search + per-row actions | Dosszié, House style, Új ügy, Szerkesztés | has clients / empty | ❌ Nincs önálló HTML |

---

## 5. Modal / Panel Inventory

| Modal/panel | Trigger gomb | Hol található | Mire való | Ment adatot? | Design kell? |
|------------|-------------|---------------|----------|-------------|-----------|
| **Új ügy modal** | "+ Új ügy" | `CasesList.tsx` | 6-step case creation (client, matter type, role, deadline, participants, workplan) | ✅ `createCase` | ⚠️ Új ügy modal.html (részleges) |
| **Upload document modal** | "Dokumentum feltöltése" | `cases/[caseId]/documents/page.tsx` | File picker + upload to SharePoint + link to case | ✅ `uploadCaseDocument` | ❌ Nincs külön modal |
| **Anonymize modal** | "Anonimizálás" | `cases/[caseId]/documents/page.tsx` + `CaseDetail.tsx` | Source text workspace, party metadata, AI task, redaction level | ✅ `anonymizeDocument` | ✅ Van design (modal flow) |
| **Rehydrate modal** | "AI válasz beillesztése" | `CaseDetail.tsx` | AI response import, token resolution, save as draft | ✅ `importAIResponse` + `saveRehydratedResultAsDocument` | ✅ Van design (modal flow) |
| **Client house style panel** | "House style" | `cases/[caseId]/documents/page.tsx` sidebar | House style profile editor (5 groups) | ✅ `upsertClientHouseStyle` | ❌ Nincs önálló HTML |
| **Leadási csomag panel** | "Leadási csomag" header | `cases/[caseId]/documents/page.tsx` sidebar | Package creation + status | ✅ `createCaseHandoffPackage` | ❌ Nincs önálló HTML |
| **Task creation from communication** | "Feladat kinyerése" | `communications/page.tsx` | Extract task from note: assignee, due date, priority | ✅ `extractTaskFromCommunication` → `createTask` | ❌ Nincs külön modal |
| **Deadline creation from communication** | "Határidő beállítása" | `communications/page.tsx` | Set deadline from note | ✅ `extractDeadlineFromCommunication` | ❌ Nincs külön modal |
| **Communication composer** | "+ Új belső jegyzet" | `communications/page.tsx` | Textarea + save | ✅ `createCommunication` | ❌ Nincs külön modal |
| **Workplan route builder** | "Munkaterv" sidebar | `CaseDetail.tsx` sidebar | Sequence-based step titles + assignee | ✅ `createTask` | ❌ Nincs külön modal |
| **Document selector** | "Dokumentum kapcsolása" | `communications/page.tsx` | Search + tabs (feltöltött/módosított/generált) + select | ✅ `linkCommunicationToCase` | ❌ Missing — Bridge 3 |
| **Prompt copy panel** | "Copy Prompt" | `AIPromptPanel.tsx` + workspace | Display prompt text + copy to clipboard | ❌ (clipboard only) | ❌ Nincs külön modal |
| **Legal analysis intake panel** | "Jogi elemzés" tab | `LegalAnalysisIntakePanel.tsx` | AI analysis text import, section detection, status | ✅ `createDocumentLegalAnalysis` | ❌ Nincs külön modal |
| **Client create modal** | "+ Új ügyfél" | `clients/page.tsx` | Név, email, tel, szerepkör | ✅ `createClient` | ❌ Nincs külön HTML |
| **Workgroup create/edit modal** | "Munkacsoport létrehozása" | `clients/[clientId]/workgroups/page.tsx` | Workgroup name, member selection | ✅ `createWorkgroup` | ❌ Nincs külön modal |
| **Case complete confirm modal** | "Lezárás és archiválás" | `CaseDetail.tsx` | Confirmation + ARCHIVED status | ✅ `updateCaseStatus` | ❌ Angol szöveg — patched |
| **Review approve/reject modal** | "Jóváhagyás" / "Elutasítás" | `review/[documentId]/page.tsx` | Comment textarea + action | ✅ `approveDocument` / `rejectDocument` | ❌ Inline button + optional comment |
| **Clause insert/suggest panel** | "Insert Clause" | `documents/compare/page.tsx` | Clause list + search + insert/replace | ✅ `createClauseLibraryClause` | ❌ Nincs külön modal |
| **Timesheet preset resolver** | "Autofill" | `time-entries/page.tsx` | Preset selection + apply | ✅ `resolveTimesheetPreset` | ❌ Inline |
| **House style preview** | "Profil megnyitása" | `cases/[caseId]/documents/page.tsx` sidebar | Inline house style display | ❌ (display only) | ❌ Nincs külön modal |

---

## 6. API Capability Inventory

| API capability | Backend endpoint/service | Frontend használja? | UI oldala | Hiányzó UI |
|---------------|-------------------------|-------------------|---------|-----------|
| **Cases** | `modules/cases/routes.ts` + `services.ts` | ✅ | Full CRUD + timeline + collaborators + workflow | Review queue link, clause library link |
| **Tasks** | `modules/tasks/routes.ts` + `services.ts` | ✅ | Task panel in sidebar + comms extract | Standalone task page, board view |
| **Deadlines** | `modules/cases/routes.ts` (`getCaseDeadlines`, `extractDeadlines`) | ⚠️ partial | Only in task panel | Standalone deadline page |
| **Documents** | `modules/documents/routes.ts` + `services.ts` | ✅ | Document ledger + upload + download | Document search UI, classification UI |
| **Document text** | `modules/documents/services.ts` (`getDocumentText`) | ✅ | Workspace text loading | No direct document text view |
| **Save workspace version** | `modules/documents/services.ts` (`saveWorkspaceDocumentVersion`) | ✅ | Workspace Mentés button | No version history UI |
| **Communications** | `modules/communications/routes.ts` | ✅ | Communications page | Chat-szerű UI, email send |
| **Time entries** | `src/routes/timeEntries.ts` | ✅ | Time entries page | Timer, recurring entries |
| **Matters** | `src/routes/matters.ts` | ✅ | Time entries matter selector | Standalone matter page |
| **Clients** | `modules/clients/routes.ts` | ✅ | Clients list + dossier | Client merge, bulk actions |
| **House style profiles** | `modules/clients/routes.ts` | ✅ | `ClientHouseStylePanel` | Dedicated house style page |
| **Anonymization** | `modules/anonymize/routes.ts` + `services.ts` | ✅ | `AnonymizeModal` | Full — modal exists |
| **Rehydration** | `modules/anonymize/routes.ts` + `services.ts` | ✅ | `RehydrateModal` | Full — modal exists |
| **SharePoint** | `modules/contracts/services.ts` (`uploadGeneratedContractToSharePoint`) | ✅ | SharePoint sync button | SP file open link |
| **Handoff packages** | `modules/handoff-packages/routes.ts` + `service.ts` | ✅ | `HandoffPackagePanel` | Standalone handoff page, export |
| **Templates/generation** | `modules/contracts/routes.ts` + `services.ts` | ✅ | `generate/page.tsx` + `assembly/page.tsx` | Clause assembly polish |
| **Review** | `modules/contracts/routes.ts` + `services.ts` | ✅ | `review/[documentId]/page.tsx` | Batch review queue |
| **Clause library** | `modules/clause-library/routes.ts` + `service.ts` | ⚠️ partial | Clause assembly page only | Standalone clause library page |
| **Legal analysis** | `modules/legal-analyses/routes.ts` + `service.ts` | ✅ | `LegalAnalysisIntakePanel` | Full — panel exists |
| **Review notes** | `modules/review-notes/routes.ts` + `service.ts` | ✅ | Workspace comments panel | Full |
| **Timesheet reports** | `modules/timesheet-reports/routes.ts` + `service.ts` | ✅ | Time entries page | Report history page |
| **Workgroups** | `modules/workgroups/routes.ts` + `services.ts` | ✅ | Workgroups page | Workgroup analytics |
| **Instructions** | `modules/cases/routes.ts` | ⚠️ partial | CaseDetail notes | Instruction management page |
| **Contract comparison** | `modules/contracts/services.ts` (`getContractComparison`) | ✅ | Compare page version panel | Text-diff (not implemented) |
| **Change reports** | `modules/contracts/services.ts` | ❌ | No UI | No UI |
| **Contract edit draft** | `modules/contracts/services.ts` | ✅ | `review/[documentId]/edit/page.tsx` | Full |
| **News feed** | `modules/news-feed/routes.ts` | ✅ | Dashboard | Full |
| **Users** | `modules/users/routes.ts` + `services.ts` | ✅ | Assignment dropdowns, collaborator picker | User management page |
| **Auth** | `modules/auth/routes.ts` + `services.ts` | ✅ | `AuthenticatedApp` | Full |
| **Dashboard stats** | `api.ts` (`getDashboardStats`) | ✅ | Dashboard | Full |
| **Contract templates** | `modules/contracts/routes.ts` | ✅ | `generate/page.tsx` | Template management page |
| **Search documents** | `modules/documents/routes.ts` (`searchDocuments`) | ❌ | No UI | Search UI |
| **Case summary** | `modules/cases/services.ts` (`getCaseSummary`) | ✅ | Time entries prefill | Full |
| **Client profiles** | `modules/contracts/routes.ts` (`getClientProfiles`) | ⚠️ partial | House style panel | Client profile page |
| **Thread revisions** | `modules/contracts/routes.ts` (`getThreadRevisions`) | ✅ | Document ledger versions | Version history UI |

---

## 7. Design HTML Coverage (Feature-szint)

| Feature/board | Van Claude HTML? | HTML neve | Lefedi teljesen? | Hiányzó állapot/gomb | Kell új prompt? |
|--------------|-----------------|-----------|----------------|---------------------|----------------|
| Ügy áttekintő / munkapad | ✅ Igen | `Adminiculum munkapad.html` | ✅ Elégséges | — | ❌ Nem |
| Új ügy modal | ✅ Igen | `Új ügy modal.html` | ⚠️ Részben | Új ügyfél opció hiányzik | ⚠️ Igen |
| Dokumentumtár | ✅ Igen | `Dokumentumtár.html` | ✅ Elégséges | — | ❌ Nem |
| Szerződés-workspace | ✅ Igen | `Szerződés-workspace.html` | ⚠️ Részben | Vissza gombok hiányoznak | ⚠️ Igen |
| Ügykommunikáció | ❌ Nincs | — | — | Teljes page | ✅ Igen |
| Munkaórák | ❌ Nincs | — | — | Case banner + timesheet UI | ✅ Igen |
| Ügyfelek / Ügyfél dossié | ❌ Nincs | — | — | Full page design | ✅ Igen |
| House style szerkesztő | ❌ Nincs | — | — | Dedicated page | ✅ Igen |
| Feladat/határidő panel | ❌ Nincs | — | — | Task panel polish | ✅ Igen |
| Leadási csomag | ❌ Nincs | — | — | Standalone page | ✅ Igen |
| Beállítások | ❌ Nincs | — | — | Full page | ✅ Igen |
| Review queue | ❌ Nincs | — | — | Batch review page | ✅ Igen |
| Clause Library | ❌ Nincs | — | — | Standalone page | ✅ Igen |
| Munkacsoportok | ❌ Nincs | — | — | Workgroup page | ✅ Igen |
| Verzió-összevetés | ❌ Nincs | — | — | Text-diff (not implemented) | ✅ Igen |
| Dashboard | ❌ Nincs | — | — | Dashboard redesign? | ⚠️ Maybe |
| Prompt catalog | ❌ Nincs | — | — | Standalone board | ✅ Igen |
| Legal analysis intake | ❌ Nincs | — | — | Panel design polish | ✅ Igen |
| TimelineBoard | ❌ Nincs | — | — | Visual timeline | ✅ Igen |
| Settings/UI pack | ❌ Nincs | — | — | Full page | ✅ Igen |

---

## 8. Missing Feature / Design Gaps

### A) Van kódban, nincs design HTML

| Feature | Kódban hol | UI létezik? | Hiányzik |
|---------|-----------|-----------|---------|
| `HandoffPackagePanel` | `handoff/HandoffPackagePanel.tsx` | ✅ sidebar panel | Önálló page design |
| `ClientHouseStylePanel` | `clients/ClientHouseStylePanel.tsx` | ✅ inline panel | Önálló page design |
| `LegalAnalysisIntakePanel` | `documents/LegalAnalysisIntakePanel.tsx` | ✅ workspace panel | Page design |
| `AIPromptPanel` | `documents/AIPromptPanel.tsx` | ✅ sidebar panel | Önálló board design |
| `LegalPromptCatalog` | `documents/legalPromptCatalog.ts` | ✅ component | Prompt catalog board |
| Task panel (CaseDetail) | `CaseDetail.tsx` sidebar | ✅ sidebar panel | Task board polish |
| Communication panel | `CaseDetail.tsx` sidebar | ✅ sidebar panel | Comm summary polish |
| Workflow tracker | `CaseDetail.tsx` sidebar | ✅ collapsed details | Workflow board |
| Munkafolyamat kontextus | `CaseDetail.tsx` sidebar | ✅ collapsed details | Technical details board |
| Review notes panel | workspace | ✅ workspace | Comments board |

### B) Van design HTML, nincs implementálva

| HTML fájl | Mi van benne | Implementálva? |
|----------|-------------|---------------|
| `Adminiculum újratervezés.html` | Nem scanned — tartalma ismeretlen | ❌ Not reviewed |

### C) Van API, nincs UI

| API capability | API van | UI nincs |
|---------------|---------|---------|
| `searchDocuments` | ✅ | ❌ Search UI |
| `getCaseDeadlines` | ✅ | ❌ Standalone deadline page |
| `extractDeadlines` | ✅ | ❌ Deadline extraction UI |
| `getClientProfiles` | ✅ | ❌ Client profile page |
| `getChangeReport` | ✅ | ❌ Change report UI |
| `validateContractTemplateData` | ✅ | ❌ Template validation UI |
| `generateChangeReport` | ✅ | ❌ Change report generation UI |
| `reassignTask` | ✅ | ❌ Task reassignment modal |
| `setTaskDeadline` | ✅ | ❌ Deadline setter UI |
| `getContractBundleOptions` | ✅ | ❌ Bundle options UI |
| `getThreadRevisions` | ✅ | ❌ Version history UI |
| `listDocumentLegalAnalyses` | ✅ | ⚠️ Partial — LegalAnalysisIntakePanel |

### D) Van UI, de nincs összekötve

| UI | Összekötés hiányzik |
|----|-------------------|
| Munkaórák → Ügy áttekintő | "← Vissza az ügyhöz" banner gomb |
| Szerződés-workspace → Ügy áttekintő | "← Vissza az ügyhöz" backlink |
| Szerződés-workspace → Dokumentumtár | "← Vissza a Dokumentumtárba" backlink |
| Ügy áttekintő → Leadási csomag | CTA gomb |
| Ügy áttekintő → Review queue | CTA gomb |
| Ügyfelek → Új ügy | "+ Új ügy" per row |
| Dokumentumtár → Leadási csomag | Sidebar CTA |
| CaseDetail sidebar → Leadási csomag | Sidebar header CTA |

### E) Legacy / régi / kerülendő funkció

| Funkció | Hol | Státusz |
|---------|-----|--------|
| `/generate/assembly` klauzula CTA | CaseDetail sidebar | ⚠️ Átirányítva workspace-re |
| "Klauzula-alapú dokumentumépítő" gomb | CaseDetail sidebar | ✅ Átirányítva workspace-re |
| `generate/page.tsx` template generation | `/cases/[caseId]/generate` | ⚠️ Redirected to workspace |
| TimelineBoard component | `TimelineBoard.tsx` | ⚠️ Not used in routes |
| StitchLayout | `/stitch` | ⚠️ Legacy alternative layout |
| AuthenticatedLanding | N/A | ⚠️ Legacy transition page |
| AI Secure Bridge jellegű panel | CaseDetail sidebar | ✅ Collapsed details |
| Adatforrások decorative box | CaseDetail main | ❌ Removed |
| Ügyállapot decorative box | CaseDetail main | ❌ Removed |

### F) Félkész / későbbi patch funkció

| Funkció | Készültség | Megjegyzés |
|---------|-----------|-----------|
| Verzió-összevetés (text-diff) | 35% | Csak metadata compare, text-diff NEM implementált |
| Batch review | 55% | Csak per-document review |
| Clause Library önálló page | ⚠️ partial | 14 API endpoints, de nincs önálló page |
| Leadási csomag export | 55% | Piszkozat creation only, nincs export |
| Beállítások page | 20% | Nincs settings page |
| Timer/stopwatch munkaóráknál | 75% | Timesheet riport igen, stopwatch nem |
| Batch upload dokumentumtárba | 85% | Single upload működik, batch nem |
| Recurring time entries | 75% | Egyszerű entry működik, recurring nem |
| Email küldés kommunikációból | 60% | Belső jegyzet működik, külső email nem |
| SharePoint fájl megnyitás link | 85% | Upload működik, open link nem |
| Task template | 40% | Task CRUD működik, template nem |
| Munkaterv másolása ügyből | 75% | Új munkaterv működik, másolás nem |

---

## 9. Claude Design Prompt Roadmap

### P0 — Must-have workflow gaps (legsürgősebb)

#### P0-A: Szerződés-workspace visszagombok
**Miért:** User elakad a workspace-ben, nem tud visszamenni az ügyhöz vagy a dokumentumtárba.

**Prompt:**
- Tervezd meg a Szerződés-workspace fixed header backlink-eket
- "← Vissza az ügyhöz" / "← Vissza a Dokumentumtárba" fix pozícióban
- Case context mindig látható legyen
- Adminiculum palette: cream háttér, dark green nav
- Reszponzív: mobil nézetben összecsukható

#### P0-B: Munkaórák case-aware banner
**Miért:** A munkaórák oldal case pre-filled, de nincs "Vissza az ügyhöz" gomb.

**Prompt:**
- Tervezd meg a case-aware banner-t `/time-entries?caseId=` esetén
- "Ügyhöz kapcsolt: {caseName} — {matterName}" felirat
- "← Vissza az ügyhöz" gomb prominence
- Bézs/arany keretes banner design
- Ha nincs case pre-fill, ne jelenjen meg banner

#### P0-C: Ügykommunikációs page teljes redesign
**Miért:** A Kommunikáció page csak belső jegyzet, nincs chat-szerű UI.

**Prompt:**
- Bal: jegyzet lista (NOTE típus, dátum, szerző, tárgy) + szűrés
- Középső: kiválasztott jegyzet részlete + "Feladat kinyerése" + "Határidő beállítása"
- Jobb: linked dokumentumok + új jegyzet szerkesztő
- Empty state: "Még nincs belső jegyzet" + CTA
- Loading: spinner a lista felett
- Error: retry gomb
- Szűrés: dátum, szerző

#### P0-D: Leadási csomag önálló page
**Miért:** Csak sidebar panel létezik, nincs áttekintés, export, piszkozat history.

**Prompt:**
- Felső: case name + "Leadási csomag" title + "← Vissza az ügyhöz"
- Lista: piszkozatok (DRAFT/SUBMITTED/IN_REVIEW/APPROVED/REJECTED státusz)
- Create panel: dokumentum kiválasztó + anonymized doc checkbox + legal analysis checkbox
- Export: "Export DOCX" gomb (future)
- Status badge-ek magyarul
- Üres állapot: "Még nincs leadási csomag" + create CTA

---

### P1 — Important product boards

#### P1-A: Munkaórák teljes page design
**Miért:** Case-aware prefill + timesheet riport generálás UI hiányzik.

**Prompt:**
- Felső banner (case pre-filled): "Ügyhöz kapcsolt" + case name + matter + "← Vissza az ügyhöz"
- Bal: időbejegyzések táblázat (dátum, ügy, munkatípus, leírás, idő) — grouped by client → case
- Középső felső: új bejegyzés form (6 preset gomb + form mezők)
- Középső alsó: timesheet riport generálás (template, preset, autofill, generálás, letöltés)
- Üres állapot, loading, error

#### P1-B: Ügyfelek + House style teljes page
**Miért:** Nincs dedicated client/house-style page, az új ügyfél modal részleges.

**Prompt:**
- Clients list: táblázat + search + per-row actions (Dosszié, House style, Új ügy, Szerkesztés)
- Dossier page: ügyfél info + linked cases + collaborator management + house style szerkesztő szekció
- House style szerkesztő: 5 group (basic, language, word formatting, header/branding, AI instructions)
- New client modal: teljes (név, email, tel, szerepkör) — nem csak részleges
- Üres állapot, loading, error

#### P1-C: Feladat/határidő panel polish
**Miért:** CaseDetail sidebar task panel action gombjai nem designoltak.

**Prompt:**
- Task card: assignee, due date (színkódolt: overdue=piros, today=narancs, future=zöld), priority badge, status badge
- Inline action gombok színkódolva: Indítás (zöld), Beküldés (narancs), Jóváhagyás (kék), Elutasítás (piros)
- Priority badge: HIGH (piros), MEDIUM (narancs), LOW (zöld)
- Status badge magyarul: TODO, IN_PROGRESS, SUBMITTED, COMPLETED, REJECTED
- Empty state: "Még nincs feladat" + "Új feladat létrehozása"
- Bridge 6: Kommunikációból feladat/határidő létrehozás panel

#### P1-D: Review queue page
**Miért:** Nincs batch review, csak per-document.

**Prompt:**
- Felső: "Review sor" + filter bar (case, status, assignee, date range)
- Lista: case name, document, generated date, assigned lawyer, status badge
- Priority: overdue = piros sor
- "Megnyitás" → `/cases/[caseId]/review/[documentId]`
- Empty state: "Nincs review-ra váró dokumentum"

---

### P2 — Admin/settings/later

#### P2-A: Beállítások page
**Miért:** Settings page nem létezik.

**Prompt:**
- Bal nav: FIrelegal adatok, Felhasználói profil, UI megjelenés, Értesítések, SharePoint
- FIrelegal: cégnév, székhely, adószám, bankszámla (dokumentum fejlécbe)
- Felhasználói profil: név, email, szerepkör, aláírás asset
- UI megjelenés: UI pack választó (default vs. signal_tiles_console) + preview
- Értesítések: email notification preference (future)
- SharePoint: site URL + connect status

#### P2-B: Clause Library önálló page
**Miért:** Clause management only in assembly page, nincs önálló library.

**Prompt:**
- Bal: category filter sidebar
- Jobb: clause list (name, category, tags, last used, usage count)
- Create/edit clause modal
- Usage analytics modal: melyik ügyben, melyik szerződésben
- Search by name/tag

#### P2-C: Munkacsoportok page
**Miért:** Workgroup management részben implementált.

**Prompt:**
- Workgroup list + create/edit modal
- Workload summary per period (napszak/hét)
- Record workload panel
- Create case from workgroup

---

### P3 — Legacy cleanup / future

#### P3-A: Dashboard redesign
**Miért:** Dashboard két mode-ban van (default + signal_tiles_console), UI pack switch needed.

**Prompt:**
- KPI metrics section
- News feeds (legal/ecofin)
- Task list
- Case radar
- Communications recent
- Right panel: upcoming deadlines
- UI pack toggle: default vs. signal_tiles_console preview

#### P3-B: Verzió-összevetés text-diff
**Miért:** Csak metadata compare, text-diff nem implementált.

**Prompt:**
- Side-by-side text diff highlighting
- Line-level change indicators
- Block-level comparison view
- Baseline + target version selector
- NOTE: text-diff not implemented in codebase — only metadata compare available

#### P3-C: Legal analysis intake panel polish
**Miért:** `LegalAnalysisIntakePanel` létezik, de nincs önálló page/design.

**Prompt:**
- AI analysis text import textarea
- Section detection: kockázati mátrix, hiányzó adatok, módosítási javaslatok, döntési pont
- Status: Nincs beillesztve / Jelölt által átnézendő / Ügyvéd által átnézendő / Jóváhagyásra kész
- Save/update buttons
- History of analyses

---

## 10. Developer Notes / Risks

### Navigációs konzisztencia
- `CaseWorkspaceNav` minden case oldalon megjelenik, de workspace (`/documents/compare`) és time-entries (`/time-entries`) query param-et használ, nem a nav-ból kap case context-et
- "← Vissza az ügyhöz" gomb hiányzik workspace-ből és time-entries-ből — P0 priority

### API consistency
- `getCaseSummary` tartalmazza a `matterId`-t — time-entries prefill ezt használja
- `Case.matterId` FK a Prisma schema 472. sorában van — valós, nem fake
- `TimeEntry.matterId` FK — timesheet riportok ezt használják

### Prisma schema modellek (20 db)
Case, Client, ContractTemplate, ContractGeneration, LawyerHandoffPackage, AnonymousDocument, Document, LegalAnalysis, Task, Instruction, TimelineEvent, CaseCollaborator, User, ClientHouseStyleProfile, ClientWorkgroup, WorkloadRecord, Matter, TimeEntry, Communication, CommunicationAttachment

### Anonymization pipeline — KRITIKUS
- `AnonymizeModal` → AI response → `RehydrateModal` → `saveWorkspaceDocumentVersion` → MODIFIED_WORKING_COPY in document ledger
- Ezt a flow-t NEM szabad törni

### Workspace save persistence
- `saveWorkspaceDocumentVersion` működik — mentett munkapéldány MODIFIED_WORKING_COPY típussal jelenik meg
- `getDocumentText` API elérhető workspace számára

### SharePoint integráció
- `uploadGeneratedContractToSharePoint` — csak generált contract-okra
- Feltöltött dokumentumok: `uploadCaseDocument` → nincs külön SP upload

### 22 DOCX template
`Backend/templates/` mappában — mindig tracked maradjon

### Build/deploy
- Frontend `npx tsc --noEmit` mindig clean kell legyen
- Backend `npx tsc --noEmit` mindig clean kell legyen

### Feature flag-ek (backend)
- `ENABLE_AI_ANONYMIZATION` — anonymize modul
- `ENABLE_NEWS_FEED` — news-feed modul
- `ENABLE_CONTRACT_GENERATION` — contracts modul
- `ENABLE_CLAUSE_LIBRARY` — clause-library modul
- `ENABLE_GENERATION_DRAFT` — generation-draft modul

### Route-alapú megfontolások
- `/cases/[caseId]/generate/assembly` és `/cases/[caseId]/generate` — mindkettő félkész, átirányítva workspace-re
- `/stitch` — legacy alternative layout, nem aktív
- `/settings` — nem létezik

### UI pack / theme
- `useUiPack` hook + `signal_tiles_console` opció — csak dokumentumtárban aktív
- Settings page nem létezik, de a UI pack váltás a Beállítások page P2-A prompt-ban van

---

*Report generated by MiniMax agent audit. No code was modified. No packages were installed. No commits were made.*