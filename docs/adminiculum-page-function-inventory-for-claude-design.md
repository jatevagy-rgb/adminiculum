# Adminiculum — Page & Function Inventory for Claude Design Handoff

**Report date:** 2026-05-20
**Repo:** `C:\Users\hubay\Documents\Adminiculum`
**Author:** MiniMax Agent (audit-only, no code changes)

---

## 1. Executive Summary

Adminiculum is a Hungarian legal-ops web application for a law firm. The primary workflow is:

> Ügyfél → Új ügy → Ügy áttekintő → Dokumentumtár → Szerződés-workspace → Módosított munkapéldány → Ügykommunikáció → Munkaórák → Ügyvédi leadási csomag

The app has **14 major routes** implemented in Next.js App Router. Most core pages have been patched toward a consistent cream/dark-green/gold Adminiculum palette and Hungarian UI. However, there are significant **missing UI connections** — users can reach dead ends, lose case context, or find no CTA to proceed.

**Design coverage:** Only 3 design HTML files were found in the repo (in a directory named "Új szerződésrész"), covering: munkapad, új ügy modal, dokumentumtár, szerződés-workspace. No HTML exists for: communications, time-entries, clients/house-style, tasks/deadlines, handoff package, settings, review queue, or clause library.

**Recommended priority for Claude Design:** (1) Ügykommunikáció, (2) Munkaórák, (3) Ügyfelek / House style, (4) Feladatok és határidők, (5) Leadási csomag, (6) Beállítások / UI pack, (7) Review sor, (8) Clause Library.

---

## 2. Route Inventory

| Route | Oldal neve | Fájl | Mire való | Fő entity | Készültség | Megjegyzés |
|-------|-----------|------|-----------|-----------|-----------|-----------|
| `/` | Dashboard | `Frontend/src/app/page.tsx` | Entry point | — | ⚠️ delegates to AuthenticatedApp | Wrapper only, content from section prop |
| `/cases` | Ügyek | `Frontend/src/app/cases/page.tsx` | Cases list | Case | ✅ ~80% | Has workplan route builder bugfix; deep-link caseId → CUID works |
| `/cases/[caseId]` | Ügy áttekintő | `Frontend/src/app/cases/[caseId]/page.tsx` + `CaseDetail.tsx` | Case workbench | Case | ✅ ~70% | CaseDetail ~2200 lines; cleaned of noisy panels; munkapad structure; case-aware time-entries link; AI panel collapsed |
| `/cases/[caseId]/documents` | Dokumentumtár | `cases/[caseId]/documents/page.tsx` | Document ledger | Document | ✅ ~85% | 3 categories: feltöltött, módosított munkapéldány, generált; active document panel with action buttons in `<details>`; deep-link selection on first load |
| `/cases/[caseId]/communications` | Ügykommunikáció | `cases/[caseId]/communications/page.tsx` | Internal case journal + note extraction | Communication | ✅ ~60% | Task/deadline extraction from notes; linked to documents; partial chat-style redesign in progress |
| `/cases/[caseId]/generate` | Dokumentum-előkészítés | `cases/[caseId]/generate/page.tsx` | Template-based contract generation | Contract | ⚠️ partial | Uses DOCX templates; has AnonymizeModal; not deep-linked from nav |
| `/cases/[caseId]/generate/assembly` | Klauzula-alapú összeállítás | `cases/[caseId]/generate/assembly/page.tsx` | Clause-based contract builder + AI recommendation | Contract | ⚠️ partial | B400 intake form; recommendClauses API; save as clause; no deep-link from CaseDetail nav (was pointed to /generate/assembly, now redirected to /documents/compare) |
| `/cases/[caseId]/review/[documentId]` | Review | `cases/[caseId]/review/[documentId]/page.tsx` | Generated contract approve/reject workflow | Contract | ✅ ~75% | Approve/reject/finalize; SharePoint sync; task creation on decision; edit mode link |
| `/cases/[caseId]/review/[documentId]/edit` | Szerkesztés | `cases/[caseId]/review/[documentId]/edit/page.tsx` | Contract block editing with clause suggestions | Contract | ⚠️ partial | Clause suggestion insert/replace; save as new clause; edit draft persistence |
| `/documents/compare` | Szerződés-workspace | `Frontend/src/app/documents/compare/page.tsx` | Document comparison + AI prompt workspace | Document/Contract | ✅ ~80% | AI prompt tools, anonymization, rehydration, review notes, save as clause; compare page version panel cleanup applied |
| `/time-entries` | Munkaórák | `Frontend/src/app/time-entries/page.tsx` | Time tracking + timesheet report generation | TimeEntry | ✅ ~75% | 6 work-type presets; case→matter prefill via ?caseId=; timesheet report DOCX generation; grouped by client/case |
| `/clients` | Ügyfelek | `Frontend/src/app/clients/page.tsx` | Client list + new client form | Client | ✅ ~70% | New client modal; dossier link per client; house style link per client |
| `/clients/[clientId]` | Ügyfél dosszié | `Frontend/src/app/clients/[clientId]/page.tsx` | Client detail, linked cases, communications | Client | ✅ ~70% | New case creation; workgroups link; collaborator management |
| `/clients/[clientId]/workgroups` | Munkacsoportok | `Frontend/src/app/clients/[clientId]/workgroups/page.tsx` | Client workgroup management | Workgroup | ⚠️ partial | Create/edit workgroups; record workload; workload summary per period |
| `/settings` | — | — | — | — | ❌ not implemented | No settings page exists |
| `/tasks` | — | — | — | — | ❌ not implemented | No standalone task page; tasks shown within CaseDetail sidebar and communications |
| `/deadlines` | — | — | — | — | ❌ not implemented | No standalone deadline page; shown in case timeline and task due dates |

---

## 3. Page-by-Page Inventory

### 3.1 Dashboard (`/`)
- **Cél:** Entry point
- **Panelek:** Delegált a `AuthenticatedApp`-ra, nincs saját tartalom
- **Megjegyzés:** Nincs önálló dashboard funkció; a valódi navigáció a bal oldali CaseWorkspaceNav-ból indul

---

### 3.2 Ügyek listája (`/cases`)
- **Cél:** Összes aktív ügy listázása + új ügy létrehozása
- **Fő panelek:** CasesList komponens; felelős ügyvéd; státusz chip; munkaterv route builder (sequence-based step titles, trainee-partner preset roles)
- **Gombok:** "Új ügy" → modal; munkaterv létrehozó gombok (Előkészítés, Ügyvédi review, Javítás/véglegesítés)
- **API-k:** `getCases`, `getUsers`, `createCase`, `getCaseTasks`
- **Üres állapot:** "Még nincs ügy" szöveg
- **Loading:** Spinner / betöltési szöveg
- **Honnan:** Root `/` redirect, vagy bal nav
- **Hova:** `/cases/[caseId]` → case detail
- **Hiányzik:** Nincs szűrési lehetőség; nincs archív ügyek lap; nincs "utolsó 30 nap" filter

---

### 3.3 Ügy áttekintő / Munkapad (`/cases/[caseId]`)
- **Cél:** Case workbench — ügy kontextus, munkaterv, gyorsakciók, timeline
- **Fő panelek:**
  1. Header: case title, client, matter type, status chip, deadline, client role
  2. Quick action grid: Szerződés-workspace, Feltöltés, Kommunikáció, Munkaórák
  3. Ügy története — day-grouped activity timeline with event type icons
  4. Sidebar: Munkaterv, Ügyfél dokumentumai, Generált szerződések, AI prompt-előkészítés (collapsed), Belső jegyzetek, Feladatok, Kommunikációs összefoglaló, Munkafolyamat (collapsed details)
  5. Ügy lezárása box (archive CTA)
- **Gombok:**
  - Szerződés-workspace → `/documents/compare?caseId={id}`
  - Feltöltés → file input trigger
  - Kommunikáció → `/cases/[caseId]/communications`
  - Munkaórák → `/time-entries?caseId={id}` (case-aware)
- **API-k:** `getCaseContracts`, `getCaseDocuments`, `getCaseTimeline`, `getCaseTasks`, `getCaseCollaborators`, `assignCase`, `updateCase`, `getWorkflowGraph`, `getCaseWorkflowHistory`
- **Üres állapotok:** Ügy nem található → "Vissza az ügylistához"
- **Hiányzó:** Review queue link nincs; clause library link nincs; Leadási csomag link nincs a case overview-ból közvetlenül
- **Design coverage:** `Adminiculum munkapad.html` exists — covers this page

---

### 3.4 Dokumentumtár (`/cases/[caseId]/documents`)
- **Cél:** Összes irat kezelése egy ügyben (feltöltött, munkapéldány, generált)
- **Fő panelek:**
  1. Három szekció: Feltöltött dokumentumok / Módosított munkapéldányok / Generált-módosított
  2. Aktív dokumentum panel (középső oszlop): kontextusfüggő gombok
  3. Ügyfélprofil / house style panel (jobb oszlop)
  4. Ügy története (alsó panel)
- **Aktív dokumentum panel gombjai (max 2-3 látható + details):**
  - Feltöltött: Megnyitás workspace-ben | Letöltés → details: Anonimizálás, Csomag készítése, Metaadat összevetés
  - Módosított munkapéldány: Megnyitás workspace-ben | Letöltés → details: Csomag készítése, Metaadat összevetés
  - Generált: Megnyitás workspace-ben | Letöltés | SharePoint szinkron → details: Review megnyitása, Csomag készítése, Metaadat összevetés
- **API-k:** `getCaseContracts`, `getCaseDocuments`, `getCaseTimeline`, `downloadContract`, `downloadDocument`, `uploadCaseDocument`, `uploadGeneratedContractToSharePoint`, `createContractGenerationRevision`, `finalizeContractGeneration`, `getCommunications`, `createCommunication`, `createCaseHandoffPackage`, `getCaseClientHouseStyle`, `listDocumentLegalAnalyses`
- **Üres állapot:** "Nincs még munkadokumentum" + feltöltés/generálás CTA-k
- **Design coverage:** `Dokumentumtár.html` exists — covers this page

---

### 3.5 Szerződés-workspace (`/documents/compare`)
- **Cél:** Document comparison + AI prompt workspace; szöveges workspace munkapéldányokhoz; anonymization/rehydration
- **Fő panelek:**
  1. Bal oldali: eszközválasztó tabs (Klauzulák, AI-promptok, Sablonok, Anonimizálás, Rehidratalás, Megjegyzések, Javítások)
  2. Középső: workspace editor + prompt display
  3. Jobb oldali: dokumentum meta + action buttons (Mentés, Véglegesítés, Letöltés, Copy Prompt, Save as Clause, Insert Clause)
  4. Version panel (collapsed by default) — compare page cleanup applied: Hungarian labels for all status values, `<details>` wrapper, compact fallback card
- **API-k:** `getCases`, `getCaseSummary`, `getCaseTasks`, `getCaseContracts`, `getCaseDocuments`, `getContractComparison`, `getContractTimeline`, `downloadReviewSummary`, `downloadContract`, `getReviewNotes`, `saveReviewNotes`, `getAnonymousDocumentsBySource`, `getCaseClientHouseStyle`, `getDocumentText`, `saveWorkspaceDocumentVersion`
- **Üres állapot:** Nincs documentId → prompt to select document from case
- **Hiányzó:** Vissza gomb a dokumentumtárba nem explicit; nincs "Vissza az ügyhöz" fixed gomb
- **Design coverage:** `Szerződés-workspace.html` exists — covers this page

---

### 3.6 Ügykommunikáció (`/cases/[caseId]/communications`)
- **Cél:** Belső ügy napló; jegyzet típusú kommunikáció; feladat/határidő kinyerés
- **Fő panelek:**
  1. Belső jegyzet hozzáadás (Belső megjegyzés gomb + textarea)
  2. Kommunikációs lista (NOTE, EMAIL, PHONE, MEETING típusok)
  3. Feladat kinyerés: "Feladat létrehozása" button
  4. Határidő beállítása
  5. Dokumentum kapcsolás
- **API-k:** `getCommunications`, `createCommunication`, `linkCommunicationToCase`, `extractTaskFromCommunication`, `extractDeadlineFromCommunication`, `getCaseDocuments`, `addCommunicationAttachment`
- **Üres állapot:** "Még nincs kommunikáció" + jegyzet szerkesztő üres
- **Hiányzó:** Nincs valódi "kommunikáció" csak belső jegyzet; külső email nem integrated; nincs chat-szerű felület ténylegesen — csak lista + jegyzet textarea
- **Design coverage:** ❌ No HTML found — **this is a top priority for Claude Design**

---

### 3.7 Munkaórák (`/time-entries`)
- **Cél:** Időbejegyzések rögzítése és timesheet riport generálás
- **Fő panelek:**
  1. Időbejegyzések táblázat (grouped by client → case)
  2. Új bejegyzés form (6 work-type preset gombok, description, duration, date, matterId prefill)
  3. Case-aware banner: "Ügyhöz kapcsolt" + munkacsomag info + "Vissza az ügyhöz" gomb
  4. Timesheet riport generálás: template választó, preset választó, autofill, DOCX generálás
- **Gombok:** Új bejegyzés | Mentés | Autofill | Generálás DOCX | Letöltés
- **API-k:** `getTimeEntries`, `getMatters`, `getClients`, `createTimeEntry`, `updateTimeEntry`, `deleteTimeEntry`, `getTimesheetReportTemplates`, `getTimesheetReportPresets`, `resolveTimesheetPreset`, `autofillTimesheetReportRows`, `generateTimesheetReportPayload`, `renderTimesheetReportDocxOutput`, `getCaseSummary`
- **Üres állapot:** "Nincs még munkaóra" szöveg
- **Design coverage:** ❌ No HTML found — **this is a top priority for Claude Design**

---

### 3.8 Ügyfelek (`/clients`)
- **Cél:** Ügyfél lista + új ügyfél létrehozása
- **Fő panelek:** Client list table (név, ügyek száma, legutóbbi aktivitás); "Új ügyfél" modal
- **Gombok:** "+ Új ügyfél" → modal; per-client: Dosszié, House style, Új ügy, Szerkesztés
- **API-k:** `getClients`, `createClient`, `updateClient`
- **Üres állapot:** "Még nincs ügyfél" szöveg
- **Design coverage:** ❌ No HTML found — needs dedicated page design

---

### 3.9 Ügyfél dosszié (`/clients/[clientId]`)
- **Cél:** Egy ügyfél összes adata, linked cases, documents, communications
- **Fő panelek:** Client info (név, szerepkör, email, tel); linked cases list; munkacsoportok link; collaborator management
- **API-k:** `getClient`, `updateClient`, `getCases`, `createCase`, `getCaseDocuments`, `getCommunications`
- **Hiányzó:** House style section itt kellene legyen, de a docs say House style külön szekció a jobb oldali panelben — nincs önálló page

---

### 3.10 Munkacsoportok (`/clients/[clientId]/workgroups`)
- **Cél:** Ügyfél-specifikus munkacsoportok és workload tracking per period
- **Fő panelek:** Workgroup list; create/edit modal; workload summary per period (napszak/hét)
- **API-k:** `getClientWorkgroups`, `createWorkgroup`, `updateWorkgroup`, `recordWorkload`, `getWorkgroupWorkload`, `getClientWorkloadSummary`
- **Megjegyzés:** Ez egy újabb funkció, részben implementált

---

### 3.11 Review (`/cases/[caseId]/review/[documentId]`)
- **Cél:** Generált dokumentum approve/reject workflow
- **Fő panelek:** Document preview; approve/reject buttons; SharePoint sync; task creation from decision; review notes
- **API-k:** `approveDocument`, `rejectDocument`, `finalizeContractGeneration`, `submitDocumentForReview`, `backToReview`, `uploadGeneratedContractToSharePoint`, `getReviewNotes`, `saveReviewNotes`, `createTask`
- **Hiányzó:** Nincs deep-link from case overview directly; nincs batch review; nincs "sender e-mail" küldés review után

---

### 3.12 Clause Assembly (`/cases/[caseId]/generate/assembly`)
- **Cél:** Klauzula-alapú dokumentum összeállítás AI ajánlásokkal
- **Fő panelek:** Clause selector; AI recommend clauses; B400 intake form; bundle options
- **API-k:** `getClauseLibraryProfiles`, `getClauseLibraryClauses`, `recommendClauses`, `generateContract`, `getClauseLibraryAssembly`, `upsertClauseLibraryAssembly`
- **Megjegyzés:** Ez a funkció félkész — korábban a CaseDetail sidebar-ból ide mutatott, most már `/documents/compare`-ra mutat

---

### 3.13 Dokumentum-előkészítés (`/cases/[caseId]/generate`)
- **Cél:** Template-alapú contract generation
- **API-k:** `getContractTemplates`, `generateContract`, `previewContract`, `downloadContract`, `submitDocumentForReview`
- **Megjegyzés:** Ezt a "Klauzula-alapú dokumentumépítő" gomb korábban a CaseDetail overview-on triggelte — most már átirányítva

---

### 3.14 Szerkesztés (`/cases/[caseId]/review/[documentId]/edit`)
- **Cél:** Contract block edit + clause suggestion insert
- **API-k:** `getContractEditDraft`, `saveContractEditDraft`, `getContractEditSuggestions`, `generateContractEditDraftRevision`, `createClauseLibraryClause`
- **Hiányzó:** Csak a review page-ről érhető el; nincs önálló navigáció ide

---

## 4. Workflow Map

### Step 1: Ügyfél kiválasztása
- **Oldal:** `/clients`
- **Van-e:** ✅ Igen — client list + "Új ügyfél" modal
- **API:** `getClients`, `createClient`
- **Tovább:** Client row → `/clients/[clientId]`

### Step 2: Új ügy létrehozása
- **Oldal:** `/clients/[clientId]` vagy `/cases`
- **Van-e:** ✅ Igen — "Új ügy" gomb → create case modal
- **API:** `createCase`
- **Hiányzó:** Nincs wizard; a modal elég egyszerű; nincs munkaterv auto-creation

### Step 3: Munkaterv / résztvevők kiválasztása
- **Oldal:** `/cases/[caseId]` — munkaterv panel sidebar
- **Van-e:** ✅ Igen — workplan route builder (sequence-based steps); assign lawyer; add collaborators
- **Hiányzó:** Nincs automatikus munkaterv generálás ügytípus alapján

### Step 4: Dokumentum feltöltése
- **Oldal:** `/cases/[caseId]/documents`
- **Van-e:** ✅ Igen — feltöltés gomb + upload handler
- **API:** `uploadCaseDocument`
- **Tovább:** Aktív dokumentum → "Megnyitás workspace-ben"

### Step 5: Dokumentum megnyitása workspace-ben
- **Oldal:** `/documents/compare?caseId={id}&documentId={docId}`
- **Van-e:** ✅ Igen — workspace gomb minden dokumentum típushoz
- **Hiányzó:** Vissza gomb nincs explicit a workspace-ben; nincs "Vissza az ügyhöz" fixed

### Step 6: Anonimizálás / prompt másolás / AI külső használata
- **Oldal:** `/documents/compare` + AnonymizeModal/RehydrateModal
- **Van-e:** ✅ Igen — AI prompt tools, anonymize gomb, rehydration
- **Hiányzó:** Nincs "prompt másolás" egy click-re? — van Copy Prompt gomb

### Step 7: Módosított munkapéldány mentése
- **Oldal:** `/documents/compare` → `saveWorkspaceDocumentVersion`
- **Van-e:** ✅ Igen — Mentés gomb
- **Tovább:** Vissza a dokumentumtárba → új "Módosított munkapéldány" listaelem

### Step 8: Vissza Dokumentumtárba
- **Oldal:** `/cases/[caseId]/documents`
- **Van-e:** ✅ Igen
- **Hiányzó:** Nincs "Vissza" gomb workspace-ből explicit; navigáció a workspace nav-on keresztül

### Step 9: Kommunikáció / belső jegyzet
- **Oldal:** `/cases/[caseId]/communications`
- **Van-e:** ✅ Igen — jegyzet szerkesztő + belső jegyzet lista
- **Hiányzó:** Nincs chat-szerű UI; nincs külső email integráció

### Step 10: Munkaóra rögzítés
- **Oldal:** `/time-entries?caseId={id}`
- **Van-e:** ✅ Igen — case-aware prefill; 6 work-type preset
- **API:** `createTimeEntry`, `getMatters`
- **Tovább:** Timesheet riport generálás

### Step 11: Ügyvédi leadási csomag
- **Oldal:** HandoffPackagePanel — a Dokumentumtár jobb oldali paneljében
- **Van-e:** ✅ Igen — `createCaseHandoffPackage` API
- **API:** `createCaseHandoffPackage`, `getAnonymousDocumentsBySource`, `listDocumentLegalAnalyses`
- **Hiányzó:** Nincs önálló leadási csomag oldal; nincs handoff package overview; nincs submit/export

---

## 5. Missing Connections ("Csendek az oldalak között")

| Kiinduló oldal | Hiányzó összekötés | Cél oldal/funkció | Javasolt gombszöveg | Prioritás |
|----------------|-------------------|-------------------|---------------------|-----------|
| Ügy áttekintő | → Leadási csomag | HandoffPackagePanel a sidebarban | "Leadási csomag készítése" | HIGH |
| Ügy áttekintő | → Review queue | Nincs review queue page | "Review queue megnyitása" | MEDIUM |
| Szerződés-workspace | → Vissza az ügyhöz | `/cases/[caseId]` nincs explicit backlink | "← Vissza az ügyhöz" | HIGH |
| Szerződés-workspace | → Vissza dokumentumtárba | `/cases/[caseId]/documents` | "← Vissza a Dokumentumtárba" | HIGH |
| Dokumentumtár | → Leadási csomag section | Már a sidebarban van, de nincs CTA | "Leadási csomag" (sidebar header) | MEDIUM |
| Dokumentumtár | → Clause Assembly | `/cases/[caseId]/generate/assembly` | Nincs nav link — korábban a workspace-re mutat | LOW |
| Ügykommunikáció | → Feladat létrehozás | Van már `extractTaskFromCommunication` | "Feladat kinyerése" — már van | — |
| Ügykommunikáció | → Határidő beállítás | Van már `extractDeadlineFromCommunication` | "Határidő beállítása" — már van | — |
| Munkaórák | → Ügy áttekintő | `/cases/[caseId]` | "← Vissza az ügyhöz" banner gomb | HIGH |
| Ügyfelek | → Új ügy indítása | `/cases?newCase=1&clientId=X` | "+ Új ügy" per client | HIGH |
| CaseDetail sidebar | → Clause Assembly | `/cases/[caseId]/generate/assembly` | Korábban volt, most workspace-re mutat | LOW |
| Review page | → Szerkesztés | `/cases/[caseId]/review/[documentId]/edit` | "Szerkesztés" gomb — már van | — |
| Szerkesztés | → Review vissza | `/cases/[caseId]/review/[documentId]` | "← Vissza a review-hoz" — már van | — |
| Client dossier | → House style szerkesztés | Inline a jobb oldali panelben | "House style szerkesztése" — már van | — |
| Documents | → SharePoint link | Nincs SharePoint fájl megnyitás link | "Megnyitás SharePoint-ban" | LOW |

---

## 6. Claude Design Coverage

| Funkcionális oldal | Van már Claude HTML? | HTML neve | Elégséges? | Kell új prompt? | Megjegyzés |
|-------------------|---------------------|-----------|-----------|----------------|-----------|
| Ügy áttekintő / Munkapad | ✅ Igen | `Adminiculum munkapad.html` | ✅ Elégséges | ❌ Nem | Cream/green/gold palette; case header + sidebar + quick actions |
| Új ügy modal | ✅ Igen | `Új ügy modal.html` | ⚠️ Részben | ⚠️ Igen | Korlátozottabb; új ügyfél opció hiányzik |
| Dokumentumtár | ✅ Igen | `Dokumentumtár.html` | ✅ Elégséges | ❌ Nem | 3 category layout; active document panel; house style sidebar |
| Szerződés-workspace | ✅ Igen | `Szerződés-workspace.html` | ⚠️ Részben | ⚠️ Igen | Eszközválasztó tabs + workspace; version panel details may need polish |
| Ügykommunikáció | ❌ Nincs | — | — | ✅ Igen | **TOP PRIORITY** — belső jegyzet + extraction UI needed |
| Munkaórák | ❌ Nincs | — | — | ✅ Igen | **TOP PRIORITY** — time entry form + timesheet report gen UI |
| Ügyfelek / Ügyfél dosszié | ❌ Nincs | — | — | ✅ Igen | Client list + dossier page needed |
| House style / ügyfélprofil | ❌ Nincs | — | — | ✅ Igen | ClientHouseStylePanel exists in code; needs proper page design |
| Feladatok és határidők | ❌ Nincs | — | — | ✅ Igen | Task/deadline extraction UI from communications |
| Ügyvédi leadási csomag | ❌ Nincs | — | — | ✅ Igen | HandoffPackagePanel exists in code; needs dedicated page |
| Beállítások / UI pack | ❌ Nincs | — | — | ✅ Igen | No settings page exists at all |
| Review sor | ❌ Nincs | — | — | ✅ Igen | No batch review queue; only per-document review |
| Clause Library | ❌ Nincs | — | — | ✅ Igen | Clause management UI separate from assembly |
| Munkacsoportok | ❌ Nincs | — | — | ✅ Igen | Workgroup management + workload tracking |
| Verzió-összevetés | ❌ Nincs | — | — | ✅ Igen | Metadata compare only; text-diff not implemented |

**Jelenleg ismert HTML-ek:**
- `Adminiculum munkapad.html` — coverage: ✅ Ügy áttekintő
- `Új ügy modal.html` — coverage: ⚠️ Új ügy (részleges, új ügyfél opció kell)
- `Dokumentumtár.html` — coverage: ✅ Dokumentumtár
- `Szerződés-workspace.html` — coverage: ⚠️ Szerződés-workspace (részleges, version panel details may differ)

---

## 7. Feature Readiness Scoring

### Ügyfélkezelés — **75%**
- **Működik:** Client list, create, dossier, workgroups, collaborator management
- **Félkész:** Workgroup workload tracking per period; house style panel inline a dossier-oldalon
- **Hiányzik:** Nincs dedicated house style page; nincs client-specific clause profile

### Ügy létrehozása — **70%**
- **Működik:** Create case modal, caseNumber auto-generate, client selection
- **Félkész:** Nincs wizard; nincs munkaterv auto-creation; nincs ügyfél szerepkör auto-default
- **Hiányzik:** Template-based case creation; case type → default steps mapping

### Munkaterv / review útvonal — **75%**
- **Működik:** Sequence-based step titles, assignee selection, trainee-partner preset roles, workplan filter in CaseDetail sidebar
- **Félkész:** Nincs automatikus step suggestion ügytípus alapján; nincs deadline auto-suggestion
- **Hiányzik:** Munkaterv másolása másik ügyből

### Dokumentumtár — **85%**
- **Működik:** 3 category layout, active document panel with correct button hierarchy, deep-link selection, upload, download, SharePoint sync, create revision
- **Félkész:** Review megnyitása generált contract-hoz; Csomag készítése; Metaadat összevetés
- **Hiányzik:** Batch upload; drag-drop támogatás; verzió-összevetés

### Szerződés-workspace — **80%**
- **Működik:** Document comparison, AI prompt tools, anonymize/rehydrate modals, review notes, save as clause, insert clause, compare page version panel cleanup (Hungarian labels, details wrapper)
- **Félkész:** Vissza gomb nincs; nincs explicit "Vissza az ügyhöz" fixed header
- **Hiányzik:** Real-time collaborative editing; track changes display

### Módosított munkapéldány mentése — **75%**
- **Működik:** `saveWorkspaceDocumentVersion` API; MODIFIED_WORKING_COPY documentType; workspace save + finalize flow
- **Hiányzik:** Nincs versioning UI; nincs "Újabb munkapéldány készítése" gomb (no real route)

### Kommunikáció — **60%**
- **Működik:** Belső jegyzet creation, list view, task/deadline extraction from notes
- **Félkész:** Csak jegyzet típusok; nincs chat-szerű UI; nincs külső email integráció
- **Hiányzik:** Real-time messaging; email send capability; communication templates

### Munkaórák — **75%**
- **Működik:** Time entry CRUD, 6 work-type presets, case→matter prefill via ?caseId=, timesheet report generation, DOCX output, grouped view by client/case
- **Félkész:** Case-aware banner with link back; munkacsomag prefill from CaseSummaryDTO.matterId
- **Hiányzik:** Nincs timer/stopwatch; nincs recurring entry; nincs bulk edit

### House style / ügyfélprofil — **50%**
- **Működik:** `getCaseClientHouseStyle`, `ClientHouseStylePanel` komponens inline a dokumentumtárban és kliens oldalon
- **Félkész:** Nincs önálló house style page; inline panel részleges
- **Hiányzik:** Full house style szerkesztő page; logo/fejléc asset management; clause profile per client

### Leadási csomag — **55%**
- **Működik:** `createCaseHandoffPackage` API; `HandoffPackagePanel` komponens a dokumentumtár sidebar-jában
- **Félkész:** Csak piszkozat creation; nincs áttekintés/edit/export
- **Hiányzik:** Nincs önálló leadási csomag page; nincs submit/export; nincs batch handoff

### Feladatok és határidők — **40%**
- **Működik:** Task CRUD via `getCaseTasks`, `startTask`, `submitTask`, `completeTask`; due date in task items
- **Félkész:** Task panel a CaseDetail sidebar-jában; kommunikációból kinyerés
- **Hiányzik:** Nincs önálló task page; nincs board/gantt view; nincs recurring task; nincs task template

### Verzió-összevetés — **35%**
- **Működik:** Metadata compare (`metaCompareUrl`) + `getContractComparison` API; compare page version panel cleanup applied
- **Félkész:** Csak metadata comparison; text-diff NEM implementált
- **Hiányzik:** Text-level diff; visual diff highlighting; side-by-side comparison

### Beállítások / UI pack — **20%**
- **Működik:** `useUiPack` hook a dokumentumtárban (signal_tiles_console opció)
- **Hiányzik:** Nincs settings page; nincs UI pack switch; nincs theme editor; nincs font/logo customization

### Review sor — **55%**
- **Működik:** Per-document approve/reject/finalize workflow; SharePoint sync; task creation on decision
- **Félkész:** Nincs batch review; nincs "waiting for my review" queue list
- **Hiányzik:** Review queue page; assignee-based filtering; deadline-aware review prioritization

---

## 8. Recommended Next Claude Design Prompts (Priority Order)

### 1. Ügykommunikáció
**Prompt:**
- Tervezz egy "Belső ügy napló" oldalt `/cases/[caseId]/communications` számára
- Bal oldali: belső jegyzet lista (NOTE típus, dátum, szerző, tárgy)
- Középső: kiválasztott jegyzet részlete + "Feladat kinyerése" + "Határidő beállítása" gombok
- Jobb oldali: linked dokumentumok + "Új jegyzet" szerkesztő (textarea + mentés)
- Szűrés: dátum, típus, szerző
- Üres állapot: "Még nincs kommunikáció" + "Új belső jegyzet" prompt
- Adminiculum palette: cream háttér, dark green nav, gold accent

### 2. Munkaórák
**Prompt:**
- Tervezz egy "Munkaórák" oldalt `/time-entries` számára
- Felső banner: case-aware megjelenítés (ügy neve + munkacsomag + "Vissza az ügyhöz" gomb ha caseId pre-filled)
- Bal panel: időbejegyzések táblázat (dátum, ügy, munkatípus, leírás, idő) — grouped by client
- Középső: új bejegyzés form (6 preset gomb: Dokumentum átnézése, Szerződésmódosítás, Kommunikáció, Partner review, Ügyfél egyeztetés, Adminisztráció)
- Jobb panel: timesheet riport generálás (template választó, generálás gomb, letöltés)
- Üres állapot: "Nincs még munkaóra" + új bejegyzés prompt

### 3. Ügyfelek / House style
**Prompt:**
- Tervezz egy "Ügyfelek" oldalt `/clients` + "Ügyfél dosszié" `/clients/[clientId]` számára
- Clients list: táblázat (név, ügyek száma, legutóbbi aktivitás, House style ikon)
- Per-client action gombok: Dosszié, House style, Új ügy, Szerkesztés
- Dossier page: ügyfél info + linked cases list + munkacsoportok link + house style szerkesztő szekció
- House style szerkesztő: official name, short name, registered seat, preferred language, document language mode, font family, heading style, header asset

### 4. Feladatok és határidők
**Prompt:**
- Tervezz egy integrált feladat+határidő megjelenítőt case contextben
- Feladat panel: assignee, title, due date, priority (HIGH/MEDIUM/LOW), status (TODO/IN_PROGRESS/SUBMITTED/COMPLETED)
- Inline action gombok: Indítás, Beküldés, Jóváhagyás, Elutasítás
- Határidő vizuális: overdue = piros, today = narancs, future = zöld
- Empty state: "Még nincs feladat" + "Új feladat létrehozása" gomb

### 5. Ügyvédi leadási csomag
**Prompt:**
- Tervezz egy "Leadási csomag" oldalt vagy áttekintő panelt
- Csomag overview: case name, preparer, date, document list
- Create handoff: dokumentum kiválasztás, anonymized document csatolás (ha van), legal analysis csatolás (ha van)
- Export: PDF/DOCX generálás
- Status: piszkozat / beküldve / review alatt / jóváhagyva

### 6. Beállítások / UI pack
**Prompt:**
- Tervezz egy "Beállítások" oldalt `/settings` számára
- Szekciók: FIrelegal adatok, felhasználói profil, UI pack választó (default / signal_tiles_console), notification preferences, SharePoint beállítások
- UI pack preview: cream/dark green/gold default vs. signal_tiles alternative

### 7. Review sor
**Prompt:**
- Tervezz egy "Review queue" oldalt — külön a `/cases/[caseId]/review/[documentId]`-tól
- Lista: review needed contract-ok, case name, generated date, assigned lawyer, status (SUBMITTED/REJECTED/PENDING)
- Filter: case, assignee, date range, status
- Prioritás: overdue deadline = top

### 8. Clause Library
**Prompt:**
- Tervezz egy "Clause Library" oldalt — önálló a Clause Assembly-től
- Clause list: name, category, tags, last used date, usage count
- Create clause: name, content (rich text), category, tags
- Search/filter by category or tag
- Usage analytics: melyik ügyben, melyik szerződésben használták

---

## 9. Developer Notes / Risks

### Navigációs konzisztencia
- A bal oldali `CaseWorkspaceNav` minden oldalon megjelenik case context-tel, de néhány page (pl. `/time-entries`, `/documents/compare`) a caseId-t query param-ként kapja, nem a nav-ból
- A "Vissza az ügyhöz" gomb csak néhány page-en van implementálva

### API consistency
- `getCaseSummary` most már tartalmazza a `matterId`-t — a munkaórák oldal ezt használja prefill-re
- De a `Case.matterId` FK az Prisma schema 472. sorában van — a backend service-t nem módosítottuk a korábbi patch-ek során, csak a frontend API type-okat igazítottuk

### Prisma schema
- `Case.matterId` FK létezik (line 472) — valós, nem fake
- `TimeEntry.matterId` FK — a timesheet riportok ezt használják
- `Case.clientId` FK → `Client`

### Anonymization pipeline
- A `AnonymizeModal` → `RehydrateModal` flow működik: anonymize → AI response → rehydrate → save modified working copy
- Ez a legkritikusabb AI-aspektus, amit nem szabad törni

### Workspace save persistence
- `saveWorkspaceDocumentVersion` API működik — a workspace-ből mentett munkapéldány a dokumentumtárba kerül `MODIFIED_WORKING_COPY` típussal
- A compare page-hez van `getDocumentText` API is

### SharePoint integráció
- `uploadGeneratedContractToSharePoint` működik, de csak generált contract-okra
- Feltöltött dokumentumok SharePoint-ba töltése: csak `uploadCaseDocument` → nincs külön SP upload

### Build és deploy
- Frontend tsc mindig clean kell maradjon
- A Backend tsc is clean kell maradjon
- A 22 DOCX template a `Backend/templates/` mappában maradjon mindig tracked

---

*Report generated by MiniMax agent audit. No code was modified. No packages were installed. No commits were made.*