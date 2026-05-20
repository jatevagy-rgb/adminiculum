# Adminiculum Design Bible

## 1. Design Source of Truth
- Központi vizuális forrásmappa:
  `C:\Users\hubay\Documents\Adminiculum\új szerzgenrész\adminiculum UI design`
- Ismert HTML referenciafájlok ebben a mappában:
  - `Adminiculum munkapad.html`
  - `Adminiculum újratervezés.html`
  - `Beállítások.html`
  - `Dokumentumtár.html`
  - `Feladatok és határidők.html`
  - `Munkaórák.html`
  - `Szerződés-workspace.html`
  - `Új ügy modal.html`
  - `Ügyfelek & House style.html`
  - `Ügykommunikáció.html`
  - `Záradék könyvtár.html`
- Ezek **vizuális referenciafájlok**: komponens-hierarchia, elrendezés, tipográfia, vizuális ritmus.
- Nem tekinthetők közvetlen implementációs HTML-nek React oldalakhoz.

## 2. Általános Design Elvek
- Magyar legal-ops munkapad, ügyvédi irodai használatra.
- Cream háttér és papír-jellegű felületek.
- Dark legal green navigáció és fő akciósávok.
- Muted gold kiemelések az aktív/elsődleges elemekhez.
- Dokumentumközpontú workflow és ügyközpontú navigáció.
- Kompakt, gyorsan olvasható ügyvédi boardok.
- Nem generic SaaS dashboard vizuális nyelv.

## 3. Implementációs Szabályok
- A meglévő React state, API-hívások, handler-ek és route-logika maradjon érintetlen.
- A design HTML-ből átvehető:
  - layout és oszlopstruktúra,
  - spacing,
  - card hierarchy,
  - vizuális hangsúly,
  - magyar UI copy (ha valós működéssel kompatibilis).
- A design HTML-ből **nem** vehető át:
  - statikus mock adatok,
  - nem bekötött gombok,
  - pszeudo workflow-elemek,
  - vakon másolt teljes HTML blokk.
- Tilos fake action létrehozása.
- Tilos a régi generator workflow visszahozása elsődleges útként.
- Tilos fake AI futtatás, fake Word változáskövetés, fake export, fake approval, fake persistence jelzés.

## 4. Timeline vs Next Step Rule
- A **Timeline / Ügy története** csak megtörtént eseményeket mutat.
- A Timeline nem mutathat jövőbeli lépéseket vagy feltételezett workflow-fázisokat.
- A jövőbeli vagy ajánlott lépés külön **Következő lépés** panelben jelenjen meg.
- A workflow progress / aktuális státusz külön progress strip vagy status panel lehet.
- Az audit timeline és a jövőbeli ajánlás nem keverhető.

Példa (helyes):
- Timeline: „Dokumentum feltöltve”, „Anonimizálás elkészült”, „Módosított munkapéldány mentve”.
- Következő lépés panel: „Anonimizálás indítása” vagy „Szerződés-workspace megnyitása”.

Példa (helytelen):
- Timeline-ban előre felsorolni: „Jogi elemzés”, „Leadási csomag”, „Ügyvédi review”, ha ezek még nem történtek meg.

## 5. Page-Specific Notes
- **Dokumentumtár**: 3 fő lista (feltöltött, módosított munkapéldány, generált/módosított), egy aktív dokumentum fókusz, technikai műveletek részletek alatt.
- **Szerződés-workspace**: dokumentum-szöveg fókusz, review és AI prompt-copy workflow, hamis track changes és hamis export nélkül.
- **Ügy áttekintő / munkapad**: döntéstámogató összkép, feladatok és határidők jól olvashatóan, ügyközpontú CTA-k.
- **Új ügy modal**: rövid, gyors adatfelvétel, minimális súrlódás.
- **Záradék könyvtár**: önálló záradékkezelő, nem régi generátor UI.
- **Kommunikáció**: belső ügykommunikációs napló, nem chat-szimulátor.
- **Munkaórák**: case-aware időrögzítés, riport külön panelen, export státusz őszinte jelzéssel.
- **Ügyfelek / House style**: core ügyfelek kiemelése, house style státusz tiszta jelölése.
- **Leadási csomag**: belső review-előkészítő csomag, nem végleges jogi állásfoglalás UI.

## 6. Future Codex Usage
Minden design implementation patch előtt Codex kötelezően ellenőrizze:
1. `docs/adminiculum-design-bible.md`
2. Az adott oldalhoztartozó HTML design fájlt a source-of-truth mappából
3. Az érintett React page/component fájlt

Alapelv: vizuális hűség + működési integritás. A design követése nem írhatja felül a valós, bekötött alkalmazáslogikát.
