# Adminiculum Workspace Modes v1

## 1. Product Principle

Adminiculum nem generic dokumentumszerkesztő és nem AI-demófelület.
Adminiculum ügyvéd-központú workflow rendszer, ahol minden nagy jogi munkamód ugyanarra az őszinte működési gerincre épül:

1. Bemenet
2. Strukturálás / stratégiai előkészítés
3. Szövegblokkok / jogi építőkockák
4. Dokumentum összeállítása
5. Ügyvédi review
6. Export / leadás

Kulcsszabály:
A stratégiai térkép nem végállapot, hanem előkészítő fázis. Peres és beadvány-jellegű munkamódokban a workflow-nak mindig át kell fordulnia a `Dokumentum összeállítása` fázisba.

További alapelvek:
- Az ügyvédi munka legyen a legnagyobb vizuális fókusz, ne a navigáció.
- A fő munkafelület mindig a tényleges jogi munkatermékhez kapcsolódjon.
- A technikai összevetés, roadmap, AI vagy knowledge base csak támogató réteg lehet.
- Külső AI-ból érkező input minden esetben jelölendő: `Külső AI javaslat — ügyvédi ellenőrzést igényel`.
- Disabled/foundation állapotok legyenek őszinték: `Előkészítés alatt`, `Későbbi patchben aktiválható`, `Ügyvédi ellenőrzést igényel`.

## 2. Visual Principles

A Stitch irányból és a meglévő Adminiculum design-bible-ből megtartandó vizuális alapok:
- modern notary / legal-office hangulat
- papír és tinta metafora
- meleg bézs legal-paper háttér
- sötétzöld kompakt globális navigáció
- tompa arany kiemelések
- törtfehér / fehér dokumentumkártyák
- serif címsorok
- sűrű, de jól olvasható legal workspace-ek
- stratégiai térképekhez kártyás struktúra
- őszinte disabled/foundation state-ek

Mit kell kerülni:
- nagy, domináns második bal oldali sidebarek
- fake AI-certainty, fake heatmap, fake win probability
- random chartok jogi jelentés nélkül
- angol workflow copy: `Case Overview`, `Phase 2`, `Discovery`, `AI Suggestion`
- generic SaaS dashboard vizuális nyelv
- olyan gombok, mintha a dokumentumgenerálás már kész lenne
- olyan workflow-k, amelyek stratégiai térképnél megállnak dokumentum-összeállítás nélkül
- olyan layoutok, ahol a navigáció több helyet visz el, mint maga a jogi munka

## 3. Global Layout Rules

### 3.1 Fő elrendezés
- A globális navigáció kompakt, sötétzöld ikonsín maradjon, kb. `56–64px` szélességgel.
- Ne legyen domináns második bal oldali app-szintű sidebar.
- Kontextus-specifikus panel csak akkor jelenjen meg bal oldalon, ha szükséges, és akkor is:
  - világos / paper stílusú
  - kompakt
  - nem sticky domináns oszlop
  - egyértelműen alárendelve a fő workspace-nek
- A legnagyobb terület mindig a fő jogi munkafelület legyen.

### 3.2 Workspace tab logika
A case-aware felső tab sor legyen az alapértelmezett navigációs minta:
- `Áttekintés`
- `Dokumentumok`
- `Munkatér`
- `Kommunikáció`
- `Előzmények`
- `Munkaórák`

### 3.3 Jobb oldali támogató panel
A jobb panel tarthat:
- teendőket
- hiányzó bizonyítékokat / adatokat
- jogi referenciát
- szövegblokkokat
- export / review státuszt

A jobb oldali panel nem lehet hosszú, végtelen főlista, amely kiszorítja az editort.

### 3.4 UI copy szabályok
- Magyar UI copy legyen elsődleges.
- Az AI csak külső vagy foundation szerepben kommunikálható.
- Semmi ne állítsa valósként a nem implementált funkciót.

## 4. Workspace Mode Registry

| Mode ID | Magyar név | Cél | Fő input | Fő munkatér | Végső output | Állapot |
|---|---|---|---|---|---|---|
| `CONTRACT_REVIEW` | Szerződésátnézés | Módosított szerződés / munkapéldány ügyvédi review-ja | feltöltött vagy generált dokumentum, módosított verzió | review-központú dokumentum-workspace | ügyvéd által jóváhagyott munkapéldány / export | v1 aktív alap |
| `CONTRACT_DRAFTING` | Szerződéskészítés | Szerződés összeállítása klauzulákból, struktúrából és house style-ból | instrukciók, klauzulák, ügyfélprofil | clause assembly workshop | tiszta szerződéstervezet | foundation |
| `CLAIM_DRAFTING` | Keresetlevél előkészítés | Kereseti igények strukturálása és beadvány összeállítása | tényállás, bizonyítékok, jogalapok | claim builder + document assembly | keresetlevél munkapéldány | foundation |
| `DEFENSE_RESPONSE` | Ellenirat / védekezés | Ellenfél iratának lebontása és válaszok strukturálása | keresetlevél, ellenfél iratai, bizonyítékok | argument-response map + assembly | ellenirat munkapéldány | foundation |
| `COUNTERCLAIM` | Viszontkereset | Ellenkövetelések felépítése és viszontkereseti szerkezet | ellenfél igényei, saját ellenigények | counterclaim map + assembly | viszontkereset munkapéldány | foundation |
| `LEGAL_ANALYSIS` | Jogi elemzés / ügyvédi memo | Döntéstámogató jogi memo készítése | forrásiratok, kutatási jegyzetek | decision memo workspace | ügyvédi review memo / export | foundation |
| `AUTHORITY_REQUEST` | Hatósági / bírósági kérelem | Rövid, célzott hatósági vagy bírósági kérelem előkészítése | címzett, kérelem, indokolás, mellékletek | lean application builder | benyújtásra kész kérelem | foundation |
| `DUE_DILIGENCE` | Átvilágítás | Anyagok áttekintése és kockázati munkairat készítése | dokumentumlista, checklist, megállapítások | risk/checklist workspace | átvilágítási jelentés / ügyvédi munkairat | foundation |

## 5. Detailed Mode Specifications

### 5.1 CONTRACT_REVIEW — Szerződésátnézés

**Purpose**
A módosított szerződés vagy kapcsolódó munkapéldány ügyvédi áttekintése, döntési pontokkal és kontrollált review-lépésekkel.

**Correct UI logic**
- Közép: dokumentum / work product preview vagy szerkeszthető munkapéldány.
- Jobb oldal: javasolt módosítások, megjegyzések, accept/reject/edit műveletek.
- Felső sáv: ügy / ügyfél / dokumentum / feladatkontekstus.
- Másodlagos: technikai history és összevetés.
- A klauzulatár támogató panel, nem fő workflow.

**Main tabs**
- `Módosításokkal`
- `Tiszta példány`
- `Eredeti`
- `Kommentek`
- `Előzmények`

**Progress model**
- `Függőben`
- `Elfogadva`
- `Elutasítva`
- `Ügyvéd által szerkesztve`

**Review controls**
- `Elfogadás`
- `Elutasítás`
- `Szerkesztés`
- `Válasz`

**Formatting toolbar foundation**
Disabled/őszinte alapon jelenhet meg:
- `Nagybetű`
- `Kisbetű`
- `Számozás`
- `Felsorolás`
- `Sorkizárt`
- `Behúzás`
- `Bekezdés térköz`

**Key rule**
A `Verziók és összevetés` nem lehet fő workflow cím. Helyette:
`Előzmények és technikai összevetés`
mint másodlagos audit-réteg.

### 5.2 CONTRACT_DRAFTING — Szerződéskészítés

**Purpose**
Szerződés összeállítása szerkezeti logikából, klauzulatárból, ügyfélprofilból és house style-ból.

**Correct UI logic**
Ez clause assembly workshop, nem generic editor.

**Main structure rail**
- `Felek`
- `Szerződés tárgya`
- `Díjazás`
- `Teljesítés`
- `Felelősség`
- `Titoktartás`
- `Felmondás`
- `Vegyes rendelkezések`

**Center area**
- aktív szerkezeti szakasz
- dokumentum-összeállítási preview
- blokk- és szövegépítés

**Right panel**
- `Klauzulatár`
- ügyfélprofil / house style
- szakasz-specifikus ajánlott blokkok

**Workflow end state**
`Dokumentum összeállítása` → `Review` → `Word export`

**Clause card model**
- cím
- kategória
- szerződéstípus
- nyelv
- kockázati profil
- ügyfélbarát / kiegyensúlyozott / másik félnek kedvező
- rövid magyarázat
- mikor használd
- mikor ne használd
- kapcsolódó jogi hivatkozás
- house style kompatibilitás

**Guardrails**
- Nincs fake finalization.
- Nincs csillogó AI-generálás gomb, csak külső prompt/foundation framinggel.

### 5.3 CLAIM_DRAFTING — Keresetlevél előkészítés

**Purpose**
Kereseti igények felépítése tényállás, bizonyíték, jogalap és kereseti kérelem mentén.

**Correct UI logic**
Ez `igényépítő / claim builder`, nem stratégiai térkép-végállapot.

**Left structure**
- `Főkövetelés`
- `Járulékos igények`
- `Perköltség`
- `Mellékletek`
- `Munkafázisok`

**Center claim cards**
Minden claim elem tartalmazzon:
- tényállás
- bizonyíték
- jogalap
- joggyakorlat / kommentár
- kockázat
- kereseti kérelem
- beadványba illeszthető szöveg

**Right panel**
- bizonyítéktár
- jogi tudástár placeholder
- kapcsolódó Ptk. / Pp. / kommentár
- hiányzó mellékletek

**Required phase transition**
A stratégiai/claim builder szakasz után egyértelműen jönnie kell:
`Dokumentum összeállítása`

**Target final structure**
- `I. Felek`
- `II. Tényállás`
- `III. Jogi indokolás`
- `IV. Bizonyítékok`
- `V. Kereseti kérelem`
- `VI. Mellékletek`

**Guardrails**
- Nincs `Phase 2: Discovery` jellegű angol sabloncopy.
- Nincs fake AI generation.

### 5.4 DEFENSE_RESPONSE — Ellenirat / védekezés

**Purpose**
Az ellenfél iratának lebontása és strukturált védekezési válaszok építése.

**Correct UI logic**
Ez stratégiai argument-response map, amelynek végén dokumentum-összeállítás áll.

**Main three-column map**
- `Ellenfél állításai`
- `Támadási felületek / gyenge pontok`
- `Saját válaszok`

**Opposing argument card**
- állítás
- forráshely az ellenfél iratában
- hivatkozott bizonyíték
- jogalap
- követelt jogkövetkezmény

**Weakness card**
- ténybeli hiány
- bizonyítéki hiány
- jogi hiba
- ellentmondás
- elévülés / határidő / perjogi kifogás

**Response card**
- ténybeli válasz
- bizonyítéki válasz
- jogi ellenérv
- joggyakorlat / kommentár
- beadványszöveg blokk
- státusz: `hiányos` / `kész` / `ügyvédi review`

**Right panel**
- teendők
- hiányzó bizonyítékok
- kapcsolódó jogi anyagok
- reusable pleading text

**Final phase**
`Dokumentum összeállítása`

Ha még nincs működő assembly:
`Ellenirat összeállítása — előkészítés alatt`

### 5.5 COUNTERCLAIM — Viszontkereset

**Purpose**
Viszontkövetelések strukturálása az ellenfél követeléseivel összefüggésben.

**Correct UI logic**
Ez stratégiai counterclaim map, nem AI-analytics képernyő.

**Layout**
**Left**
- ellenfél követelései
- összeg
- jogalap
- bizonyíték
- kockázat

**Center**
- kapcsolat / támadási pont
- gyenge pont
- bizonyítéki hiány
- perjogi kifogás

**Right**
- saját viszontkövetelések
- tényállási alap
- bizonyíték
- jogalap
- kereseti / viszontkereseti kérelem
- beadványba illeszthető szöveg

**Downgrade/remove**
- fake risk heatmap
- fake win probability
- fake AI certainty
- fake draft export

**Final phase**
`Dokumentum összeállítása` → `Ügyvédi review` → `Export / leadás`

### 5.6 LEGAL_ANALYSIS — Jogi elemzés / ügyvédi memo

**Purpose**
Lawyer-reviewable jogi elemzés vagy döntési memo előállítása.

**Correct UI logic**
Ez decision memo workspace, nem AI summary dashboard.

**Main sections**
- `Jogi kérdés`
- `Rövid válasz`
- `Tényállás / feltételezések`
- `Alkalmazandó jog`
- `Érvek mellette`
- `Érvek ellene`
- `Kockázati értékelés`
- `Várható ellenérvek`
- `Ügyvédi döntési javaslat`
- `Dokumentum összeállítása / memo export`

**Right panel**
- újrahasznosítható szövegblokkok
- kapcsolódó Ptk. / Pp. / kommentár
- memo státusz
- export állapot

**Guardrails**
- Nincs fake végleges AI legal conclusion.
- AI-s input esetén kötelező label:
  `Külső AI javaslat — ügyvédi ellenőrzést igényel`

### 5.7 AUTHORITY_REQUEST — Hatósági / bírósági kérelem

**Purpose**
Rövid, célzott hatósági vagy bírósági kérelem előkészítése.

**Correct UI logic**
Ez lean application builder, nem hosszú memo.

**Main sections**
- `Címzett hatóság / bíróság`
- `Ügy tárgya`
- `Kérelem`
- `Rövid indokolás`
- `Hivatkozott mellékletek`
- `Korábban csatolt iratok`
- `Kért intézkedés`
- `Leadási ellenőrzés`

**Visual feeling**
Kompakt, gyakorlati, gyors leadásra optimalizált munkafelület.

### 5.8 DUE_DILIGENCE — Átvilágítás

**Purpose**
Anyagok áttekintése és kockázati/checklist jellegű ügyvédi munkairat készítése.

**Main structure**
- `Dokumentumlista`
- `Ellenőrzési területek`
- `Megállapítások`
- `Kockázati szint`
- `Hiányzó iratok`
- `Javasolt intézkedés`
- `Ügyvédi review`
- `Jelentés összeállítása`

**Output**
`Átvilágítási jelentés / ügyvédi munkairat`

## 6. Shared Modules

### 6.1 Document Assembly Engine

**Purpose**
A strukturált jogi munka végső dokumentummá alakítása.

**Potential inputs**
- elfogadott módosítások
- claim cardok
- response cardok
- counterclaim cardok
- klauzula blokkok
- legal analysis blokkok
- bizonyíték hivatkozások
- jogi referenciák
- ügyvédi döntések

**Outputs**
- Word munkapéldány
- ügyvédi review példány
- leadási csomag
- végleges export

**UI placement**
- minden releváns munkamódban külön fázisként jelenjen meg
- nem lehet eldugott technikai action
- nem lehet fake primary CTA működő backend nélkül

### 6.2 Clause Library

**Shared by**
- `CONTRACT_DRAFTING`
- `CONTRACT_REVIEW`
- litigation reusable text blocks

**Role by mode**
- contract drafting: központi
- contract review: támogató
- litigation modes: reusable pleading text blocks

### 6.3 Legal Knowledge Base

**Future scope**
- `Ptk.`
- `Pp.`
- kommentárok
- case law / `BH`
- belső irodai álláspontok
- újrahasznosítható jogi érvelések

**Not now**
- nincs indexelés ebben a fázisban
- nincs fake “AI researched” státusz

**UI appearance**
- jobb oldali támogató panelben vagy collapsible secondary blokkban
- csak őszinte placeholderrel, ha még nincs adat:
  `Jogi tudástár előkészítés alatt.`

### 6.4 External AI Prompt Buttons

**Purpose**
Későbbi featureként prompt generálása külső AI-eszközökhöz.

**Rules**
- ügyfél- vagy cégspecifikus legyen
- house-style aware legyen
- mindenhol explicit címke kell:
  `Külső AI prompt — ügyvédi ellenőrzést igényel`
- nem jelenthet automatikus kész dokumentumot
- nem jelenthet automatikus jogi állásfoglalást

## 7. What Not to Implement Yet

Az alábbiak ne jelenjenek meg működő kész funkcióként a v1 foundation szakaszban:
- fake AI certainty / win probability / heatmap
- fake document insertion vagy fake export success
- fake Word track changes
- automatikus generálásként kommunikált assembly, ha nincs mögötte működő engine
- teljes jogi tudástár indexelés
- kötelező második bal oldali domináns workspace-sidebar
- generic analytics dashboard elemek workspace-ekben
- stratégiai térkép mint végállapot document assembly nélkül

## 8. First Implementation Roadmap

### Patch 1
**Restore contract workspace editor focus and sidebar minimization**
- belső case/workspace sidebar lehalkítása
- editor visszaemelése elsődleges munkatérként
- history és roadmap blokkok másodlagossá tétele

### Patch 2
**Contract Review foundation polish**
- review progress finomhangolása
- javasolt módosítások panel használhatósága
- disabled review controls őszinte, tiszta UX-szel
- formatting toolbar foundation konszolidálása

### Patch 3
**Clause Library model/UI foundation**
- klauzulatár rendezett listanézet
- clause card modell rögzítése
- house style és contract type metahelyek
- insertion honest disabled állapotban

### Patch 4
**Litigation Strategic Map foundation**
- claim / defense / counterclaim stratégiai kártyamodell
- bizonyíték / jogalap / érvelési blokkok UI-váza
- kötelező átvezetés a dokumentum-összeállítás fázisba

### Patch 5
**Document Assembly foundation**
- shared assembly phase UI
- structured inputs → munkapéldány preview
- review / export status layer

### Patch 6
**Legal Knowledge Base foundation**
- hely kijelölése minden releváns módban
- őszinte placeholder állapotok
- kapcsolódó Ptk. / Pp. / kommentár referenciapanelek vázlata

## 9. Stitch-Derived Guidance Summary

### Megtartandó inspiráció
- sűrű, kártyás munkafelületi szervezés
- jogi munkára hangolt paper-like felületek
- kompakt navigáció és funkcionális oldalpanelek
- stratégiai gondolkodást támogató kártyás modellek

### Elvetendő inspiráció
- alternatív app-shell, amely túl nagy navigációs felületeket ad
- generic admin / analytics jellegű header-panelek
- angol workflow nyelv
- olyan vizuális AI-elemek, amelyek nem fednek valós backend vagy workflow képességet

## 10. Notes for Implementation

- A React implementáció minden módban a valós route-okra, state-re és API-kra épüljön.
- A design-spec semmilyen pontja nem írhatja felül a működő alkalmazáslogikát.
- Az első aktív mód a `CONTRACT_REVIEW`; a többi mód csak foundation vagy disabled state-ként jelenjen meg addig, amíg nincs biztonságos workflow- és adatmodelljük.
