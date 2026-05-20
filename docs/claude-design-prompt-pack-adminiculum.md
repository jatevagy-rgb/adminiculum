# Adminiculum — Claude Design Prompt Pack
## Design Handoff from Inventory Report

**Report date:** 2026-05-20
**Source:** `docs/adminiculum-page-function-inventory-for-claude-design.md`
**Author:** MiniMax Agent (design handoff only, no code changes)

---

## Közös Adminiculum Design Brief

**Minden Claude prompt elején használandó.**

### Alkalmazás típusa
- Hungarian legal-ops webapp ügyvédi irodának
- Ügyvédi munkapad — NEM generic SaaS dashboard
- NEM Startup / NEM Consumer app — konzervatív jogi környezet

### Design palette
```
Background:     #FBF9F4 (cream)
Primary nav:    #1F2821 (dark green)
Accent:         #C9A227 (muted gold)
Text primary:   #16201A (near-black green)
Text secondary: #7A8479 (muted sage)
Border:         #DDD7CA (warm gray)
Danger:         #BA1A1A (muted red)
Success:        #23472F (dark green)
Warning:        #92400E (amber)
```

### Nyelv
- Hungarian UI only
- Minden label, gomb, placeholder magyar
- Nincs raw English enum a UI-ban
- Status chip-ek magyarul: "Piszkozat", "Review alatt", "Jóváhagyott", "Visszaküldve", "Végleges"

### Mit NEM tervezel
- **Nincs fake AI execution** — a "Megnyitás workspace-ben" → megnyitja a workspace-t, nem futtat AI-t automatikusan
- **Nincs fake Word track changes** — a módosított munkapéldány szöveges, nem Word change tracking
- **Nincs régi generátor** — a "Klauzula-alapú dokumentumépítő" már át lett irányítva `/documents/compare`-ra; régi `/cases/[caseId]/generate/assembly` route nem aktív
- **Nincs raw enum megjelenítés** — `MODIFIED_WORKING_COPY`, `GENERATED`, `CLIENT_INPUT` soha ne jelenjen meg magyarul fordítás nélkül
- **Nincs fake download** — minden letöltés gombnak valós API handler kell legyen mögötte

### Navigációs elvek
- Bal oldali `CaseWorkspaceNav` minden case oldalon megjelenik case context-tel
- Query param `?caseId=` és `?documentId=` minden workspace/dokumentum oldalon
- "← Vissza az ügyhöz" gomb minden oldalon, ahol a case context el lenne veszve
- Nincs page hop nélkül hogy "vissza kell nyomkodni"

### Existing design HTML-ek (referenciaként)
- `Adminiculum munkapad.html` — ügy áttekintő ✅
- `Új ügy modal.html` — új ügy (részleges, új ügyfél opció kell)
- `Dokumentumtár.html` — dokumentumtár ✅
- `Szerződés-workspace.html` — workspace (részleges, version panel may differ)

---

## A) Claude Design Prompt — Ügykommunikáció

### Page purpose
`/cases/[caseId]/communications` — Belső ügy napló: belső jegyzet típusú kommunikáció, feladat/határidő kinyerés. NEM email küldés — csak belső NOTE típusok.

### Layout
```
┌─────────────────────────────────────────────────────┐
│ CaseWorkspaceNav (bal)                              │
├──────────┬──────────────────────────┬────────────────┤
│          │                          │                │
│ Jegyzet  │  Kiválasztott jegyzet    │ Linked docs    │
│ lista    │  részlete + actions     │ + új jegyzet   │
│          │                          │ szerkesztő     │
└──────────┴──────────────────────────┴────────────────┘
```

### Panels
1. **Bal: Jegyzet lista** — dátum, típus (NOTE), szerző, tárgy; filter bar (dátum, szerző)
2. **Középső: Jegyzet részlete** — tárgy, tartalom, meta (ki, mikor); "Feladat kinyerése" + "Határidő beállítása" gombok; dokumentum linked ha van
3. **Jobb: Linked dokumentumok** + **Új jegyzet szerkesztő** (textarea + Mentés gomb)

### Buttons / CTA-k
- "+ Új belső jegyzet" → jobb oldali szerkesztő
- "Feladat kinyerése" → `extractTaskFromCommunication` API hívás, eredményül feladat creation modal
- "Határidő beállítása" → `extractDeadlineFromCommunication` API hívás
- "Dokumentum kapcsolása" → dokumentum kiválasztó modal (csak feltöltött + generált dokumentumok)

### Empty states
- "Még nincs belső jegyzet ehhez az ügyhöz." + "Új belső jegyzet" CTA prominent

### Loading states
- "Jegyzetek betöltése..." spinner a lista felett
- "Feladat kinyerése..." loading a button-on belül

### Error states
- "A jegyzet betöltése sikertelen." → retry gomb
- "A jegyzet mentése sikertelen." → hibaüzenet + retry

### Real route connections
- Vissza: `/cases/[caseId]` — mindig legyen "← Vissza az ügyhöz"
- Dokumentum kapcsolás: `/cases/[caseId]/documents` modal-ból
- Feladat kinyerés: `/cases/[caseId]` → Feladat panel frissül

### What NOT to include
- Nincs email küldés / postafiók
- Nincs " külső email integráció
- Nincs chat-szerű valós-time messaging
- Nincs " küldés" gomb

### Hungarian labels
- "Belső ügy napló" (page title)
- "Belső jegyzet" (note type label)
- "Feladat kinyerése"
- "Határidő beállítása"
- "Dokumentum kapcsolása"
- "Új belső jegyzet"
- "Mentés" (button)
- "Még nincs belső jegyzet ehhez az ügyhöz."

---

## B) Claude Design Prompt — Munkaórák

### Page purpose
`/time-entries` — Időbejegyzések rögzítése és timesheet riport generálás. Case-aware prefill `?caseId=` query param-ból.

### Layout
```
┌─────────────────────────────────────────────────────┐
│ [Ha caseId pre-filled: arany banner "Ügyhöz        │
│  kapcsolt: {caseName} — {matterName} —             │
│  ← Vissza az ügyhöz"]                               │
├───────────────────────┬──────────────────────────────┤
│                       │                              │
│  Időbejegyzések       │  Új bejegyzés form         │
│  táblázat             │  (6 preset gomb + form)     │
│  (grouped by client)  │                              │
│                       ├──────────────────────────────┤
│                       │  Timesheet riport generálás  │
│                       │  (template + autofill +      │
│                       │   DOCX generálás)           │
└───────────────────────┴──────────────────────────────┘
```

### Panels
1. **Felső banner** (ha `?caseId=` pre-filled): arany/bézs határú, "Ügyhöz kapcsolt" felirat + ügy neve + munkacsomag + "← Vissza az ügyhöz" gomb
2. **Bal: Időbejegyzések táblázat** — dátum, ügy, munkatípus, leírás, idő (óra); grouped by client → case; expandable
3. **Középső felső: Új bejegyzés form** — 6 preset gomb (Dokumentum átnézése, Szerződésmódosítás, Kommunikáció, Partner review, Ügyfél egyeztetés, Adminisztráció) → auto-fill workType + description hint; date picker; duration; matter selector pre-filled from case→matter prefill
4. **Középső alsó: Timesheet riport generálás** — template választó, preset választó, autofill rows, "Generálás DOCX" gomb, letöltés

### Buttons / CTA-k
- "Új bejegyzés" → form focus
- Preset gombok (6 db): Dokumentum átnézése, Szerződésmódosítás, Kommunikáció, Partner review, Ügyfél egyeztetés, Adminisztráció
- "Mentés" (időbejegyzés)
- "Autofill" (timesheet)
- "Generálás DOCX" (timesheet riport)
- "Letöltés" (generált riport)
- "← Vissza az ügyhöz" (bannerben, ha case pre-filled)

### Empty states
- "Nincs még munkaóra ehhez az ügyhöz." (ha case pre-filled)
- "Még nincs rögzített munkaóra." (ha nincs case filter)
- "Válassz ügyet vagy kezdj új bejegyzést."

### Loading states
- "Munkaórák betöltése..." a táblázat felett
- "Generálás..." a DOCX gombon belül

### Error states
- "Munkaóra mentése sikertelen." → retry
- "Riport generálás sikertelen." → retry

### Real route connections
- Vissza az ügyhöz: `/cases/[caseId]` — a bannerben legyen
- Case prefill: `?caseId=` → automatic matterId prefill from `getCaseSummary().matterId`
- Nincs deep-link to elsewhere from this page

### What NOT to include
- Nincs timer/stopwatch
- Nincs recurring entry
- Nincs bulk edit
- Nincs " külső ID" mező

### Hungarian labels
- "Munkaórák" (page title)
- "Ügyhöz kapcsolt" (banner)
- "Vissza az ügyhöz" (banner gomb)
- "Új bejegyzés"
- "Dokumentum átnézése" / "Szerződésmódosítás" / "Kommunikáció" / "Partner review" / "Ügyfél egyeztetés" / "Adminisztráció" (preset gombok)
- "Mentés"
- "Autofill"
- "Generálás DOCX"
- "Nincs még munkaóra"

---

## C) Claude Design Prompt — Ügyfelek / House Style

### Page purpose
`/clients` — Ügyfél lista + új ügyfél modal; `/clients/[clientId]` — Ügyfél dosszié + house style szerkesztés

### Layout (Clients list)
```
┌─────────────────────────────────────────────────────┐
│ "Ügyfelek" (h1)                    [+ Új ügyfél]   │
├─────────────────────────────────────────────────────┤
│ Search: _______________                           │
├─────────────────────────────────────────────────────┤
│ Név          │ Ügyek │ Utolsó aktivitás │ Actions │
│ Client A     │ 3     │ 2026.05.15        │ Dosszié │
│ Client B     │ 1     │ 2026.05.10        │ House style │
│ ...                                            │ Szerkesztés │
└─────────────────────────────────────────────────────┘
```

### Layout (Client Dossier — `/clients/[clientId]`)
```
┌─────────────────────────────────────────────────────┐
│ [← Vissza az ügyfelekhez]                           │
├─────────────────────┬───────────────────────────────┤
│                     │                               │
│  Ügyfél info       │  House style szerkesztő       │
│  (név, email, tel)  │  (officialName, shortName,     │
│  + Ügyek listája   │   registeredSeat, preferred   │
│  + Munkacsoportok   │   language, documentLanguage │
│  link              │   mode, fontFamily, heading)   │
│  + Collaborators   │                               │
└─────────────────────┴───────────────────────────────┘
```

### Buttons / CTA-k (Clients list)
- "+ Új ügyfél" → modal
- Per row: "Dosszié" → `/clients/[clientId]`, "House style" → dossier page-en belül scroll, "Új ügy" → `/cases?newCase=1&clientId=X`, "Szerkesztés" → modal

### Buttons / CTA-k (Client Dossier)
- "Ügyfél szerkesztése" → inline vagy modal
- "Új ügy" → `/cases?newCase=1&clientId=X`
- "Munkacsoportok" → `/clients/[clientId]/workgroups`
- "House style szerkesztése" → dossier jobb oldali panel

### Empty states
- "Még nincs ügyfél." + "+ Új ügyfél" CTA
- "Ehhez az ügyfélhez nincs még ügy." (dossier)

### Loading states
- "Ügyfelek betöltése..." spinner a táblázat felett

### Error states
- "Ügyfél betöltése sikertelen." → retry

### Real route connections
- Dossier → `/cases/[caseId]` on case row click
- New case → `/cases?newCase=1&clientId=X`
- Workgroups → `/clients/[clientId]/workgroups`
- Back: clients list ← dossier

### What NOT to include
- Nincs bulk ügyfél törlés
- Nincs ügyfél merge
- Nincs külső CRM integráció

### Hungarian labels
- "Ügyfelek" (page title)
- "+ Új ügyfél"
- "Dosszié"
- "House style"
- "Új ügy"
- "Szerkesztés"
- "Munkacsoportok"
- "Még nincs ügyfél."
- "Utolsó aktivitás"

---

## D) Claude Design Prompt — Feladatok és határidők

### Page purpose
Integrált feladat+határidő megjelenítő case contextben. Ez NEM önálló page — a CaseDetail sidebar-jában és a Kommunikáció page-en már létezik. A prompt a sidebar panel polish-hoz és az önálló task panel elkészítéséhez kell.

### Layout (Sidebar task panel — CaseDetail)
```
┌─────────────────────────────┐
│ Feladatok              [3]  │
├─────────────────────────────┤
│ ┌───────────────────────┐  │
│ │ Task title            │  │
│ │ Felelős: Dr. Kovács   │  │
│ │ Határidő: 2026.05.25  │  │
│ │ [INDÍTÁS] [BEKÜLDÉS]  │  │
│ └───────────────────────┘  │
│ ...                        │
│ [Új feladat létrehozása]  │
└─────────────────────────────┘
```

### Layout (Standalone — future `/tasks` page if needed)
```
┌─────────────────────────────────────────────────────┐
│ Feladatok                          [Szűrés] [Új +] │
├──────────┬──────────────────────────┬──────────────┤
│ TODO     │ IN_PROGRESS  │ SUBMITTED │ COMPLETED    │
│ task     │ task         │ task      │ task         │
└──────────┴──────────────┴──────────┴──────────────┘
```

### Buttons / CTA-k
- "Indítás" → `startTask` API → status: IN_PROGRESS
- "Beküldés" → `submitTask` API → status: SUBMITTED
- "Jóváhagyás" → `completeTask(approved=true)` API → COMPLETED
- "Elutasítás" → `completeTask(approved=false)` API → REJECTED
- "Új feladat létrehozása" → create task modal (caseId pre-filled)

### States
- **Határidő színek:** overdue = piros (#BA1A1A), today = narancs (#92400E), future = zöld (#23472F)
- **Priority badge:** HIGH = piros, MEDIUM = narancs, LOW = zöld
- **Status badge:** TODO = gray, IN_PROGRESS = blue, SUBMITTED = purple, COMPLETED = green, REJECTED = red

### Empty states
- "Még nincs feladat ehhez az ügyhöz." + "Új feladat létrehozása"

### Real route connections
- Feladat létrehozása kommunikációból: `/cases/[caseId]/communications` → extractTaskFromCommunication → Feladat panel
- Határidő beállítás kommunikációból: similar

### Hungarian labels
- "Feladatok"
- "Indítás" / "Beküldés" / "Jóváhagyás" / "Elutasítás"
- "Felelős"
- "Határidő"
- "Még nincs feladat"
- "Új feladat létrehozása"
- "HIGH" / "MEDIUM" / "LOW" → Hungarian badge text: "Magas" / "Közepes" / "Alacsony"
- "TODO" / "IN_PROGRESS" / "SUBMITTED" / "COMPLETED" / "REJECTED" → Hungarian badge text

---

## E) Claude Design Prompt — Ügyvédi leadási csomag

### Page purpose
`/cases/[caseId]/documents` sidebar — HandoffPackagePanel már implementált. Ez a prompt a önálló leadási csomag page-heöz kell, ami jelenleg nem létezik.

### Layout (HandoffPackagePanel — current, in documents sidebar)
```
┌─────────────────────────────────────┐
│ Leadási csomag                      │
├─────────────────────────────────────┤
│ [Dokumentum kiválasztása ▾]        │
│ Anonymizált szöveg: [auto-filled]   │
│ Jogi elemzés: [auto-filled]        │
│                                     │
│ [Leadási csomag létrehozása]       │
└─────────────────────────────────────┘
```

### Layout (Standalone handoff page — future)
```
┌─────────────────────────────────────────────────────┐
│ Leadási csomag — {caseName}         [← Vissza az ügyhöz]│
├─────────────────────────────────────────────────────┤
│ Csomagpiszkozatok listája                           │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Csomag #1 — 2026.05.20 — Piszkozat  [Megnyitás]│ │
│ │ Csomag #2 — 2026.05.18 — Beküldve   [Megnyitás]│ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ [+ Új leadási csomag létrehozása]                  │
└─────────────────────────────────────────────────────┘
```

### Buttons / CTA-k
- "Leadási csomag létrehozása" → `createCaseHandoffPackage` API
- "Megnyitás" → open existing package detail
- "Véglegesítés" / "Beküldés" → future states
- "Export PDF" / "Export DOCX" → future

### States
- Piszkozat (draft)
- Beküldve (submitted) — future
- Review alatt (in review) — future
- Jóváhagyva (approved) — future

### Real route connections
- Dokumentum kiválasztás: only uploaded documents + generated contracts from `/cases/[caseId]/documents`
- Anonymized document: from `getAnonymousDocumentsBySource` API
- Legal analysis: from `listDocumentLegalAnalyses` API
- Back: `/cases/[caseId]`

### What NOT to include
- Nincs valódi email küldés a csomagra
- Nincs batch handoff multiple case-re

### Hungarian labels
- "Leadási csomag"
- "Leadási csomag létrehozása"
- "Csomagpiszkozatok"
- "Piszkozat" / "Beküldve" / "Review alatt" / "Jóváhagyva"
- "Dokumentum kiválasztása"
- "Anonymizált szöveg"
- "Jogi elemzés"
- "Export PDF" / "Export DOCX"

---

## F) Claude Design Prompt — Beállítások / UI pack

### Page purpose
`/settings` — Nem létezik jelenleg. Settings page needed for UI pack switch + FIrelegal data + user profile.

### Layout
```
┌─────────────────────────────────────────────────────┐
│ Beállítások                                         │
├───────────────────────┬─────────────────────────────┤
│                       │                             │
│  Navigáció            │  Tartalom                   │
│  ─────────────        │  ──────────                 │
│  FIrelegal adatok     │  [sections]                 │
│  Felhasználói profil  │                             │
│  UI megjelenés        │                             │
│  Értesítések         │                             │
│  SharePoint           │                             │
│                       │                             │
└───────────────────────┴─────────────────────────────┘
```

### Sections

**FIrelegal adatok**
- Cégnév, székhely, adószám, bankszámla
- Ezek a dokumentum fejlécekbe kerülnek

**Felhasználói profil**
- Név, email, szerepkör
- Aláírás asset (optional)

**UI megjelenés**
- UI pack választó: "Adminiculum default" (cream/green/gold) vs. "Signal Tiles Console" (dark/slate)
- Előnézet mindkét stílusra

**Értesítések**
- Email notification preference (future)

**SharePoint**
- SharePoint site URL
- Connect status

### Buttons / CTA-k
- "Mentés" per section
- "UI előnézet frissítése"

### Hungarian labels
- "Beállítások"
- "FIrelegal adatok"
- "Felhasználói profil"
- "UI megjelenés"
- "Értesítések"
- "SharePoint"
- "Mentés"
- "UI előnézet"

---

## G) Claude Design Prompt — Review sor

### Page purpose
`/cases/[caseId]/review/[documentId]` — per-document review már létezik. A prompt a batch review queue oldalhooz kell, ami nem létezik.

### Layout (Batch review queue — standalone page)
```
┌─────────────────────────────────────────────────────┐
│ Review sor                          [Szűrés] [Export]│
├─────────────────────────────────────────────────────┤
│ Szűrő: [Ügy ▾] [Státusz ▾] [Dátum ▾]               │
├─────────────────────────────────────────────────────┤
│ Ügy              │ Dok.      │ Generálva  │ Státusz│
│ ADASVETEL-2026-01│ Szerződés │ 2026.05.19│ SUBMITTED│
│ ADASVETEL-2026-02│ Szerződés │ 2026.05.18│ REJECTED │
│ ...                                               │ [Megnyitás]│
└─────────────────────────────────────────────────────┘
```

### Priority
- Overdue határidő = piros sor
- "Review needed" status = felső

### Filters
- By case
- By status (SUBMITTED, REJECTED, PENDING)
- By assignee
- By date range

### Real route connections
- "Megnyitás" → `/cases/[caseId]/review/[documentId]`
- Nincs batch approve — minden dokumentum külön review page-en

### Hungarian labels
- "Review sor"
- "Szűrés"
- "Export"
- "SUBMITTED" → "Review alatt"
- "REJECTED" → "Visszaküldve"
- "PENDING" → "Függőben"
- "Megnyitás"

---

## H) Claude Design Prompt — Clause Library

### Page purpose
`/cases/[caseId]/generate/assembly` Clause Assembly már létezik. Ez a prompt az önálló Clause Library management oldalhoz kell.

### Layout
```
┌─────────────────────────────────────────────────────┐
│ Záradék könyvtár                   [+ Új záradék]   │
├────────────┬────────────────────────────────────────┤
│            │                                        │
│  Kategória │  Záradék lista / keresés               │
│  szűrő     │  ┌──────────────────────────────────┐   │
│            │  │ Név: Vételár és fizetés          │   │
│  [Mind]    │  │ Kategória: Adásvétel            │   │
│  [Adásvétel]│  │ Használat: 12x — Utolsó: 2026.05│  │
│  [Munkaviszony]│ [Szerkesztés] [Törlés]         │  │
│  [Kárszerződés]│└──────────────────────────────────┘   │
│            │                                        │
└────────────┴────────────────────────────────────────┘
```

### Buttons / CTA-k
- "+ Új záradék" → modal/editor
- "Szerkesztés" → modal
- "Törlés" → confirm modal
- "Használat" → analytics modal (melyik ügyben, melyik szerződésben)

### Hungarian labels
- "Záradék könyvtár"
- "+ Új záradék"
- "Kategória"
- "Használat"
- "Szerkesztés"
- "Törlés"
- "Keresés"
- "Záradék tartalma" (modal)
- "Név" / "Tartalom" / "Kategória" / "Címkék"

---

## Bridge Promptok — Kisebb komponensek és modálok

### Bridge 1: Leadási csomag indítása modal

**Cél:** Dokumentum kiválasztás után a leadási csomag létrehozásának flow-ja. Ez a `HandoffPackagePanel`-ben már létezik — design polish needed.

**Flow:**
1. User a dokumentumtár sidebar-jában rákattint "Leadási csomag" header-re
2. Modal megnyílik: dokumentum kiválasztó (uploaded + generated)
3. Ha van anonymized document → auto-fill checkbox
4. Ha van legal analysis → auto-fill checkbox
5. "Leadási csomag létrehozása" gomb → API hívás → success toast

**Labels:**
- "Leadási csomag létrehozása" (modal title)
- "Válassz dokumentumot" (dropdown label)
- "Anonymizált szöveg csatolása" (checkbox, ha van AI response)
- "Jogi elemzés csatolása" (checkbox, ha van analysis)
- "Létrehozás"
- "Mégse"

---

### Bridge 2: Ügyfélprofil mini panel / House style status card

**Cél:** Kompakt összefoglaló az ügyfél house style státuszáról — a dokumentumtár jobb oldali paneljében már létezik, de polish needed.

**Tartalom:**
- Ügyfél neve
- Profil: Van / Nincs / Létrehozva de üres
- Preferred language
- Document language mode
- Font family
- "Szerkesztés" gomb → house style form

**Labels:**
- "Ügyfélprofil / house style"
- "Profil: Van" / "Profil: Nincs" / "Profil létrehozva, de nincs kitöltve"
- "Szerkesztés"
- "Profil megnyitása"

---

### Bridge 3: Dokumentum kiválasztó modal

**Cél:** Általános dokumentum kiválasztó — Kommunikáció page-en dokumentum kapcsoláshoz, Leadási csomag indításhoz, stb.

**Tartalom:**
- Search bar
- 3 tabs: Feltöltött / Módosított munkapéldány / Generált
- Lista checkbox-okkal
- "Kiválasztás" gomb

**Labels:**
- "Dokumentum kiválasztása"
- "Keresés..."
- "Feltöltött" / "Módosított munkapéldány" / "Generált"
- "Kiválasztás"
- "Mégse"

---

### Bridge 4: Munkaterv route builder compact component

**Cél:** A CaseDetail sidebar-ban a Munkaterv panel compact verziója. Sequence-based step titles + assignee selector.

**Tartalom:**
- Step list: Előkészítés → Ügyvédi review → Javítás/véglegesítés (default)
- Per step: assignee dropdown, due date optional
- "Munkaterv mentése" gomb

**Labels:**
- "Munkaterv"
- "Előkészítés" / "Ügyvédi review" / "Javítás/véglegesítés"
- "Felelős kijelölése"
- "Határidő (opcionális)"
- "Munkaterv mentése"
- "Még nincs munkaterv ehhez az ügyhöz."

---

### Bridge 5: Case-aware Munkaóra quick modal

**Cél:** Gyors időbejegyzés egy ügyből — a case overview-ból indítható legyen. NEM teljes page, hanem quick-add modal.

**Tartalom:**
- Case pre-filled from context
- 6 preset gomb (Dokumentum átnézése, etc.)
- Description textarea
- Duration (hours/minutes)
- Date picker
- Matter pre-filled from case→matter
- "Mentés" / "Mégse"

**Labels:**
- "Munkaóra rögzítése" (modal title)
- "Ügy: {caseName}"
- Preset gombok mint a time-entries page-en
- "Leírás"
- "Időtartam"
- "Dátum"
- "Mentés"
- "Mégse"

---

### Bridge 6: Kommunikációból feladat / határidő létrehozás panel

**Cél:** A Kommunikáció page jobb oldali panelje, ahol a kiválasztott jegyzetből feladat vagy határidő generálható.

**Tartalom:**
- Kiválasztott jegyzet tárgya + tartalom preview
- "Feladat kinyerése" section: assignee dropdown, due date, priority select, "Létrehozás" gomb
- "Határidő beállítása" section: due date picker, "Beállítás" gomb
- Success/error state

**Labels:**
- "Feladat kinyerése"
- "Határidő beállítása"
- "Felelős"
- "Határidő"
- "Prioritás" → "Magas" / "Közepes" / "Alacsony"
- "Létrehozás"
- "Beállítás"

---

## Missing Connections — Design Prompt Coverage Table

| Kiinduló oldal | Cél oldal / funkció | Javasolt gomb | Claude promptban szerepeljen? | Megjegyzés |
|----------------|---------------------|---------------|-------------------------------|-----------|
| Ügy áttekintő | Leadási csomag | "Leadási csomag készítése" | ✅ Igen — Bridge 1 | Sidebar panel, de CTA kell |
| Ügy áttekintő | Review queue | "Review sor megnyitása" | ✅ Igen — G) Review sor | Nincs önálló page, de CTA kell |
| Szerződés-workspace | Vissza az ügyhöz | "← Vissza az ügyhöz" | ✅ Igen — E) workspace | Fix header backlink |
| Szerződés-workspace | Vissza dokumentumtárba | "← Vissza a Dokumentumtárba" | ✅ Igen — E) workspace | Fix header backlink |
| Dokumentumtár | Leadási csomag sidebar | "Leadási csomag" header CTA | ✅ Igen — E) Leadási csomag | Sidebar banner |
| Dokumentumtár | Clause Assembly | (nincs link — OK) | ❌ Nem | Korábban átirányítva workspace-re |
| Ügykommunikáció | Feladat létrehozás | "Feladat kinyerése" | ✅ Igen — A) Ügykommunikáció | Már van, polish |
| Ügykommunikáció | Határidő beállítás | "Határidő beállítása" | ✅ Igen — A) Ügykommunikáció | Már van, polish |
| Munkaórák | Vissza az ügyhöz | "← Vissza az ügyhöz" banner | ✅ Igen — B) Munkaórák | Banner gomb case pre-filled |
| Ügyfelek | Új ügy indítása | "+ Új ügy" per client | ✅ Igen — C) Ügyfelek | Per-row gomb |
| CaseDetail sidebar | Leadási csomag | "Leadási csomag" sidebar | ✅ Igen — E) Leadási csomag | Sidebar header |
| Review page | Szerkesztés | "Szerkesztés" gomb | ✅ Igen — Review page | Már van |
| Szerkesztés | Review vissza | "← Vissza a review-hoz" | ✅ Igen — Szerkesztés page | Már van |
| Client dossier | House style szerkesztés | "House style szerkesztése" | ✅ Igen — C) Ügyfelek | Sidebar section |
| Dokumentumtár | SharePoint megnyitás | "Megnyitás SharePoint-ban" | ❌ Nem | Alacsony prioritás, nincs real route |
| Dokumentumtár | Ügy áttekintő | (nav-ból megy) | ❌ Nem | CaseWorkspaceNav-ból megy |
| Munkaórák | Időbejegyzés gyors modal | "Új bejegyzés" quick-add | ✅ Igen — Bridge 5 | Case context-ből indítható |

---

## Claude Design Execution Order

### 1. Ügykommunikáció (A)
**Miért első:** A Kommunikáció page 60%-os készültségű, de nincs chat-szerű UI, nincs valódi "actionable notes" flow. A feladat/határidő kinyerés már működik API-val, csak a UI polish hiányzik.

**Deliverable:** `/cases/[caseId]/communications` page — teljes design, ami:
- Bal oldali jegyzet lista + szűrés
- Középső jegyzet részlet + "Feladat kinyerése" + "Határidő beállítása" gombok
- Jobb oldali: linked docs + új jegyzet szerkesztő
- Empty state, loading state, error state

### 2. Munkaórák (B)
**Miért második:** A Munkaórák oldal 75%-os, de a case-aware banner + timesheet riport generálás UI nem designolt. A 6 preset gomb + timesheet DOCX output kell designt.

**Deliverable:** `/time-entries` page — teljes design, ami:
- Case pre-filled banner "Ügyhöz kapcsolt" + Vissza gomb
- Bal: time entries táblázat grouped by client
- Középső: új bejegyzés form + 6 preset
- Jobb alsó: timesheet riport generálás
- Empty state, loading, error

### 3. Ügyfelek / House style (C)
**Miért harmadik:** Ügyfélkezelés 75%-os, de nincs dedicated house style page, és az új ügyfél modal részleges (hiányzik az "új ügyfél opció").

**Deliverable:** `/clients` + `/clients/[clientId]` page design, ami:
- Client list table + search + per-row actions
- Dossier page + house style szerkesztő inline
- New client modal teljes (név, email, tel, szerepkör)
- Empty state, loading, error

### 4. Leadási csomag (E)
**Miért negyedik:** Leadási csomag 55%-os, HandoffPackagePanel létezik kódban, de nincs önálló page, nincs export, nincs piszkozat overview.

**Deliverable:** Önálló leadási csomag page design + Bridge 1 modal, ami:
- Csomagpiszkozatok lista
- Új csomag létrehozása modal (dokumentum kiválasztás, anonymized doc checkbox, legal analysis checkbox)
- Piszkozat / Beküldve / Review alatt / Jóváhagyva status
- Export DOCX

### 5. Feladatok és határidők (D)
**Miért ötödik:** Feladatok 40%-os, a CaseDetail sidebar-jában már van task panel, de az action gombok (Indítás/Beküldés/Jóváhagyás/Elutasítás) + határidő vizuális nem designolt.

**Deliverable:** Task panel polish + Bridge 6, ami:
- Task card: assignee, due date (színkódolt), priority, status badge
- Inline action gombok (színkódolt: zöld = Indítás, narancs = Beküldés, kék = Jóváhagyás, piros = Elutasítás)
- Határidő színkódolás (overdue=piros, today=narancs, future=zöld)
- Empty state "Még nincs feladat"
- Bridge 6: kiválasztott jegyzetből feladat/határidő létrehozás panel

### 6. Review sor (G)
**Miért hatodik:** Review sor 55%-os, csak per-document review van, nincs batch queue.

**Deliverable:** Review queue page design, ami:
- Lista: case name, document, generated date, assigned lawyer, status
- Filter: case, status, assignee, date range
- Priority: overdue = piros sor
- "Megnyitás" → per-document review

### 7. Clause Library (H)
**Miért hetedik:** Clause Library önálló management oldal, nem Clause Assembly. Alacsonyabb prioritás, mert az assembly már működik.

**Deliverable:** Clause Library page design, ami:
- Category filter sidebar
- Clause list: name, category, tags, last used, usage count
- Create/edit clause modal
- Usage analytics modal

### 8. Beállítások / UI pack (F)
**Miért utolsó:** Beállítások 20%-os, nincs settings page egyáltalán. Alacsony prioritás, de fontos a UI pack váltáshoz.

**Deliverable:** Settings page design, ami:
- Left nav: FIrelegal adatok, Felhasználói profil, UI megjelenés, Értesítések, SharePoint
- UI pack preview: default vs. signal_tiles_console

---

## Final Report

### Files inspected
- `docs/adminiculum-page-function-inventory-for-claude-design.md` (inventory report)
- All 14 Next.js page routes
- `CaseDetail.tsx`, `CasesList.tsx`, `CaseWorkspaceNav.tsx`
- `Frontend/src/lib/api.ts`

### Files created
- `docs/claude-design-prompt-pack-adminiculum.md` — this document

### Top 5 missing UI bridges (highest priority to close)

| # | Missing connection | Why it matters |
|---|-------------------|----------------|
| 1 | Szerződés-workspace → "← Vissza az ügyhöz" backlink | User loses case context when working in workspace |
| 2 | Szerződés-workspace → "← Vissza a Dokumentumtárba" backlink | User doesn't know how to return after saving working copy |
| 3 | Munkaórák → case pre-filled banner + "Vissza az ügyhöz" gomb | User loses case context when entering from case nav |
| 4 | Ügy áttekintő → Leadási csomag CTA | User can't find handoff creation from case overview |
| 5 | Ügyfelek → "+ Új ügy" per client row | Can't start new case directly from client list |

### Recommended first 3 Claude prompts
1. **Ügykommunikáció (A)** — Kommunikációs page teljes redesign; legkritikusabb missing connection + legnagyobb UX gap
2. **Munkaórák (B)** — Case-aware banner + timesheet riport generálás UI; hiányzó "Vissza az ügyhöz" gomb; fontos workflow elem
3. **Ügyfelek / House style (C)** — Ügyfél lista + dossier + house style editor; új ügyfél modal kiegészítés;per-client "Új ügy" CTA

### git status --short
```
?? docs/claude-design-prompt-pack-adminiculum.md
```

---

*Készült: 2026-05-20. No code modified. No packages installed. No commits made.*