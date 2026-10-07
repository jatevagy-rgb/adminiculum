# Grow V2 adaptív felmérés – megvalósítási specifikáció

Állapot: technikai megvalósítás, kognitív ügyfélpilot még nem történt. Kezdő commit: a989a6f9ef4fac6430b4da47924858568a2283a7. Cél PR: #490. A 3 perces gyorsfelmérés és a 4 perces célzott ág tervezési cél, nem mért teljesítmény.

## Út és határok

Elsődleges: **Mondd el, hol fáj** → 1–3 kanonikus kategória, opcionális legfeljebb 4000 karakteres szöveg → egy kiválasztott célzott ág → Mit látunk a válaszokból? → működési adatokkal összevetett diagnózis → emberi döntés → meglévő lehetőség/kezdeményezés/eredmény életciklus. Több jelzésnél az ügyfél választ egy ágat, nem kap egyszerre több kérdéssort. A fájdalomjelzés a meglévő GROW_PAIN_INTAKE producerbe kerül.

Másodlagos: **Gyors állapotfelmérés**, hat univerzális kérdés; kizárólag útválasztás, nulla megállapítás. GENERAL_CONCERN ide vezet. Gyakoriságnál WEEKLY/SEVERAL_TIMES_A_WEEK/ALMOST_DAILY, felelősségnél SOMETIMES/NO, mérésnél SOMETIMES/NO indít célzott irányt. A THREE_FOUR/FIVE_PLUS rendszerszám csak az adatátadás vizsgálatára vezet. Ha nincs erős jel, a felület ezt közli, és önkéntes témaválasztást kínál.

Harmadlagos: **Részletes felmérések**, a négy V1 csomag és eredményeik lenyithatóan elérhetők. Az opcionális kitöltés nem kötelező ügyfélfeladat.

Folyamatot csak a célzott ág kiválasztása után kérünk. Folyamathoz kötött ág és létező ACTIVE folyamat esetén kötelező pontos, azonos ügyfélhez tartozó folyamatot választani. Név jelenik meg; az azonosító csak API-hivatkozás. A szerver idegen, archivált és ismeretlen folyamatot elutasít. Ha nincs aktív folyamat, a meglévő kötetlen út használható. Gyors felmérés és digitális bevezetési ág nem igényel folyamatot.

## Verzió, adattárolás, jogosultság

A registry kulcsa (packKey, version); a teljes definíció és szabályfa mélyen fagyasztott. getCurrentAssessmentPack és getAssessmentPackVersion külön művelet. V1: GROW_ASSESSMENT_V1, változatlan 4 csomag/35 kérdés; V2: külön kulcsok, version=2, GROW_ASSESSMENT_V2. Minden beküldés deklarált Observatory-megfigyelés; questionKey + answer kanonikus sztringpárok, scope/provenance, digest/idempotenciakulcs a meglévő producerben. V2-ben a kliensnek explicit packVersion-t kell küldenie. Ismeretlen kérdés/opció, duplikált válasz, hiányos aktív út, inaktív kérdés és ismeretlen verzió elutasítva. V1 régi, verzió nélküli kliensbeküldése kompatibilis marad.

Történeti kiértékelés mindig a rögzített verzióval történik. Ismeretlen tárolt verzió: explicit nem elérhető eredmény; soha nem egészséges nullaérték. Nincs válaszátírás és nincs adatbázis-migráció. V1 definíció SHA256: d697591362c85b478066b70cbefb6615e095bbbb134f02ba78bb3e2836b1214e; 161 rögzített V1 értékelés SHA256: 77220c19e6c8019180fd92bc0177a8faeb3cb611da6f175147612d2a64e832b1.

A portál meglévő aktív identitás/tagság/szervezeti munkaterület ellenőrzése érvényes. Vázlat csak sessionStorage-ban, szerver által képzett identitás+munkaterület scope alatt. Folytatás előtt újra ellenőrzött scope és verzió; idegen vázlat nem olvasható vissza. A böngészőlap bezárása vagy tiltott tárhely megszüntetheti a folytathatóságot. Nincs szerveroldali félkész kitöltési tábla. Éles adatot a fejlesztés nem módosít.

## Közös felület és állapotok

A GrowAdaptiveJourney mindkét portálon ugyanazt a szerverdefiníciót értelmezi. Kérdésenként halad, visszalépéskor megőrzi az aktív válaszokat, a már nem aktív utódválaszokat törli. A feltételes előrehaladás jelzi, hogy a kérdésszám változhat. Betöltési, hibás, üres és sikeres állapot; dupla beküldés elleni helyi zár és szerveridempotencia; késői válaszok eldobása scope-változás/unmount esetén. Fehér felület, zöld elsődleges művelet, 12 px kártya, legalább 40 px válaszfelület, billentyűzetes rádiógombok és fókusz, legfeljebb kényelmes olvasási szélesség. Kitöltéskor az egyéb dashboardblokkok elrejtve.

Az eredmény legfeljebb négy kiváltott megállapítást mutat; nem töltjük fel kitalált elemekkel, ha nulla vagy egy releváns pont van. Mindegyikhez: megfigyelés, lehetséges jelentőség, következő ellenőrzés, lenyitható forrásháttér. UNKNOWN információhiány, NOT_APPLICABLE semleges; egyik sem negatív megállapítás. Nincs érettségi pontszám, százalék, cégminősítés, ROI-becslés vagy megfelelőségi döntés. A hiányzó digitális beruházás és hiányzó mutató korai lezárást tesz lehetővé (1 kérdés), nem teszünk fel értelmetlen utókérdést a 3–5-ös cél kedvéért.

A munkatársi Adatforrások nézet olvasási jogosultsággal mutatja a beküldőt, dátumot, munkaterületet, folyamatot, fő megállapításokat, ismeretlen területeket, forrásokat és a következő emberi döntést. Teljes válaszlista külön lenyitható. Legutóbbi kitöltés pack+verzió+workspace+process szerint, legfeljebb 50 összefoglaló; ismételt csomag nem szorítja ki a többi ágat. A producer sem ajánlást, sem lehetőséget, sem kezdeményezést, sem feladatot nem hoz létre. A meglévő diagnózis és felülvizsgálat változatlan.

## Kategória → ág

| Kategória | Következő ág |
|---|---|
| MANUAL_ADMIN | PROCESS_STABILITY_V2 |
| SLOW_APPROVAL | APPROVAL_V2 |
| DUPLICATE_DATA | DATA_FLOW_V2 |
| TOO_MANY_SYSTEMS | DATA_FLOW_V2 |
| UNCLEAR_OWNERSHIP | OWNERSHIP_V2 |
| REWORK | PROCESS_STABILITY_REWORK_V2 |
| UNMEASURED_COST | MEASUREMENT_V2 |
| GENERAL_CONCERN | QUICK_SCAN_V2 |

## V2 kérdésbank és feltételes utak

A szabályok az alábbi kódokat fogadják el, nem tetszőleges kliensoldali címkéket. Minden kérdés önálló UNKNOWN lehetőséget ad. A REWORK változat explicit külön pack, nem a rögzített válaszok utólagos átértelmezése.

### QUICK_SCAN_V2 · v2

Gyors állapotfelmérés. Maximum 6 kérdés; folyamat: nem.

- **qs_duplicate_entry_frequency** — Az elmúlt 4 hétben milyen gyakran kellett ugyanazt az adatot egynél több helyre beírni?
  - Opciók: NEVER = Egyszer sem; ONCE_OR_TWICE = 1–2 alkalommal; WEEKLY = Körülbelül hetente; SEVERAL_TIMES_A_WEEK = Hetente többször; ALMOST_DAILY = Szinte minden munkanapon; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.
- **qs_approval_wait_frequency** — Az elmúlt 4 hétben milyen gyakran állt meg a munka azért, mert valaki jóváhagyására vagy döntésére kellett várni?
  - Opciók: NEVER = Egyszer sem; ONCE_OR_TWICE = 1–2 alkalommal; WEEKLY = Körülbelül hetente; SEVERAL_TIMES_A_WEEK = Hetente többször; ALMOST_DAILY = Szinte minden munkanapon; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.
- **qs_rework_frequency** — Az elmúlt 4 hétben milyen gyakran kellett egy már elvégzett lépést javítás miatt újra megcsinálni?
  - Opciók: NEVER = Egyszer sem; ONCE_OR_TWICE = 1–2 alkalommal; WEEKLY = Körülbelül hetente; SEVERAL_TIMES_A_WEEK = Hetente többször; ALMOST_DAILY = Szinte minden munkanapon; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.
- **qs_typical_system_count** — Egy tipikus munkafolyamat elvégzéséhez hány különböző rendszerben kell dolgozni?
  - Opciók: ONE = 1; TWO = 2; THREE_FOUR = 3–4; FIVE_PLUS = 5 vagy több; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.
- **qs_next_decision_owner_clarity** — Ha a munka elakad, egyértelmű, ki dönt a következő lépésről?
  - Opciók: ALWAYS = Igen, mindig; USUALLY = Többnyire; SOMETIMES = Néha; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.
- **qs_cycle_time_measurement** — Mérik, mennyi idő telik el a folyamat kezdetétől a befejezéséig?
  - Opciók: REGULARLY = Igen, rendszeresen; SOMETIMES = Néha; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.

### DATA_FLOW_V2 · v2

Adatok és rendszerek közötti munka. Maximum 4 kérdés; folyamat: igen, ha van aktív.

- **v2_data_already_digital** — Amikor ugyanazt az adatot újra beírják, az első rendszerben már digitálisan rendelkezésre áll?
  - Opciók: ALMOST_ALWAYS = Szinte mindig; MOSTLY = Többnyire; SOMETIMES = Néha; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.
- **v2_data_transfer_automation** — Az adat átkerül automatikusan a használt rendszerek között?
  - Opciók: YES = Igen; MOSTLY = Többnyire; PARTLY = Részben; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.
- **v2_source_of_truth_clarity** — Ha ugyanarra az adatra két rendszer eltérő értéket mutat, egyértelmű, melyik számít helyesnek?
  - Opciók: ALWAYS = Igen, mindig; USUALLY = Többnyire; SOMETIMES = Néha; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.
- **v2_duplicate_entry_error_frequency** — Az elmúlt 4 hétben az eltérő vagy többször rögzített adatok miatt milyen gyakran kellett javítani a munkát?
  - Opciók: NEVER = Egyszer sem; ONCE_OR_TWICE = 1–2 alkalommal; WEEKLY = Körülbelül hetente; SEVERAL_TIMES_A_WEEK = Hetente többször; ALMOST_DAILY = Szinte minden munkanapon; UNKNOWN = Nem tudom.
  - Megjelenés: {"mode":"ALL","triggers":[{"questionKey":"v2_data_already_digital","answers":["ALMOST_ALWAYS","MOSTLY","SOMETIMES"]},{"questionKey":"v2_data_transfer_automation","answers":["PARTLY","NO"]}]}.

### APPROVAL_V2 · v2

Jóváhagyás és várakozás. Maximum 4 kérdés; folyamat: igen, ha van aktív.

- **v2_approval_decision_wait** — A várakozás leggyakrabban azért történik, mert nem érkezik meg időben a szükséges döntés?
  - Opciók: YES = Igen; MOSTLY = Többnyire; SOMETIMES = Néha; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.
- **v2_approval_criteria** — Egyértelmű, milyen feltételek teljesülésekor adható meg a jóváhagyás?
  - Opciók: ALWAYS = Igen, mindig; USUALLY = Többnyire; SOMETIMES = Néha; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.
- **v2_approval_backup** — Ha a döntéshozó nem elérhető, van előre meghatározott helyettesítő vagy eszkalációs út?
  - Opciók: YES = Igen; PARTLY = Részben; NO = Nem; UNKNOWN = Nem tudom; NOT_APPLICABLE = Nem értelmezhető.
  - Megjelenés: mindig ebben az ágban.
- **v2_approval_wait_measurement** — Mérik, mennyi időt tölt a folyamat jóváhagyásra várva?
  - Opciók: REGULARLY = Igen, rendszeresen; SOMETIMES = Néha; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.

### PROCESS_STABILITY_V2 · v2

A munkamenet és az ismétlődő lépések. Maximum 4 kérdés; folyamat: igen, ha van aktív.

- **v2_same_sequence_count** — Az utóbbi 10 hasonló esetből körülbelül hány ment végig ugyanazzal a lépéssorral?
  - Opciók: EIGHT_TEN = 8–10; FOUR_SEVEN = 4–7; ONE_THREE = 1–3; NONE = Egy sem; NOT_ENOUGH_CASES = Nem volt még 10 hasonló eset; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.
- **v2_process_instructions_use** — A csapat hogyan követi a folyamat lépéseit és döntési szabályait?
  - Opciók: DOCUMENTED_AND_USED = A közös leírást követjük; DOCUMENTED_INCONSISTENT = Van közös leírás, de nem mindig követjük; INFORMAL = Nincs leírva, de nagyjából mindenki ismeri; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.
- **v2_exceptions_recognizable** — A leggyakoribb kivételek már a folyamat elején felismerhetők?
  - Opciók: YES = Igen; MOSTLY = Többnyire; SOMETIMES = Néha; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.
- **v2_repetitive_data_digital** — Az ismétlődő lépésekhez szükséges adatok digitálisan rendelkezésre állnak?
  - Opciók: ALL = Mindegyik; MOST = A többségük; SOME = Csak egy részük; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.

### PROCESS_STABILITY_REWORK_V2 · v2

Visszatérő javítások és munkamenet. Maximum 5 kérdés; folyamat: igen, ha van aktív.

- **v2_same_sequence_count** — Az utóbbi 10 hasonló esetből körülbelül hány ment végig ugyanazzal a lépéssorral?
  - Opciók: EIGHT_TEN = 8–10; FOUR_SEVEN = 4–7; ONE_THREE = 1–3; NONE = Egy sem; NOT_ENOUGH_CASES = Nem volt még 10 hasonló eset; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.
- **v2_process_instructions_use** — A csapat hogyan követi a folyamat lépéseit és döntési szabályait?
  - Opciók: DOCUMENTED_AND_USED = A közös leírást követjük; DOCUMENTED_INCONSISTENT = Van közös leírás, de nem mindig követjük; INFORMAL = Nincs leírva, de nagyjából mindenki ismeri; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.
- **v2_exceptions_recognizable** — A leggyakoribb kivételek már a folyamat elején felismerhetők?
  - Opciók: YES = Igen; MOSTLY = Többnyire; SOMETIMES = Néha; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.
- **v2_repetitive_data_digital** — Az ismétlődő lépésekhez szükséges adatok digitálisan rendelkezésre állnak?
  - Opciók: ALL = Mindegyik; MOST = A többségük; SOME = Csak egy részük; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.
- **v2_rework_same_point** — A javítás leggyakrabban ugyanazon a ponton válik szükségessé?
  - Opciók: YES = Igen; MOSTLY = Többnyire; VARIES = Változó helyen; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.

### OWNERSHIP_V2 · v2

Felelősség és döntések. Maximum 3 kérdés; folyamat: igen, ha van aktív.

- **v2_process_owner** — Van egy megnevezett személy vagy szerepkör, aki a folyamat egészéért felel?
  - Opciók: YES = Igen; SHARED = Többen közösen; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.
- **v2_cross_team_decision** — Ha két csapat között elakad a munka, egyértelmű, ki hozza meg a döntést?
  - Opciók: ALWAYS = Igen, mindig; USUALLY = Többnyire; SOMETIMES = Néha; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.
- **v2_process_review_owner** — Van valaki, aki rendszeresen áttekinti a folyamat eredményét és a visszatérő problémákat?
  - Opciók: YES = Igen; PARTLY = Részben; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.

### MEASUREMENT_V2 · v2

Mérés és visszatekintés. Maximum 3 kérdés; folyamat: igen, ha van aktív.

- **v2_process_metric** — Van olyan mutató, amelyből látszik, hogy ez a folyamat jól működik-e?
  - Opciók: YES = Igen; PARTLY = Részben; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.
- **v2_metric_baseline** — A fejlesztések előtt rögzítik ennek a mutatónak a kiinduló értékét?
  - Opciók: USUALLY = Többnyire; SOMETIMES = Néha; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: {"mode":"ALL","triggers":[{"questionKey":"v2_process_metric","answers":["YES","PARTLY"]}]}.
- **v2_metric_followup** — Egy változtatás után ugyanazt a mutatót újra megnézik?
  - Opciók: USUALLY = Többnyire; SOMETIMES = Néha; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: {"mode":"ALL","triggers":[{"questionKey":"v2_process_metric","answers":["YES","PARTLY"]}]}.

### DIGITAL_VALUE_V2 · v2

Digitális bevezetés és üzleti cél. Maximum 5 kérdés; folyamat: nem.

- **v2_digital_investment_recent** — Vezettek be az elmúlt 12 hónapban új rendszert vagy jelentősebb digitális megoldást?
  - Opciók: YES = Igen; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: mindig ebben az ágban.
- **v2_investment_problem** — A bevezetés előtt rögzítették, milyen konkrét üzleti problémát kell megoldania?
  - Opciók: YES = Igen; PARTLY = Részben; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: {"mode":"ALL","triggers":[{"questionKey":"v2_digital_investment_recent","answers":["YES"]}]}.
- **v2_investment_metric** — A bevezetés előtt rögzítettek olyan mérőszámot, amellyel később ellenőrizhető a hatás?
  - Opciók: YES = Igen; PARTLY = Részben; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: {"mode":"ALL","triggers":[{"questionKey":"v2_digital_investment_recent","answers":["YES"]}]}.
- **v2_investment_remeasurement** — A bevezetés után ugyanazt a mérőszámot újra megmérték?
  - Opciók: YES = Igen; NO = Nem; NO_BASELINE = Nem volt kiinduló mérés; UNKNOWN = Nem tudom.
  - Megjelenés: {"mode":"ALL","triggers":[{"questionKey":"v2_digital_investment_recent","answers":["YES"]}]}.
- **v2_investment_preparation** — Az érintett munkatársak megkapták a szükséges felkészítést az új megoldáshoz?
  - Opciók: ALL_OR_ALMOST_ALL = Igen, szinte mindenki; MOST = A többségük; SOME = Csak egy részük; NO = Nem; UNKNOWN = Nem tudom.
  - Megjelenés: {"mode":"ALL","triggers":[{"questionKey":"v2_digital_investment_recent","answers":["YES"]}]}.

## Megállapítások: pontos kiváltás és forrás

Minden feltétel ALL, az egyes kérdéshez felsorolt válaszok OR-kapcsolatban. Egyik UNKNOWN/N/A érték sem kiváltó. Nem mappelhető stratégiai/képzési jelzést nem kényszerítünk működési domainbe. A defersAutomation jelzés az érintett megfigyelés/folyamat mellett marad, és megakadályozza az automatizálási ajánlást a kanonikus selectorban; explicit halasztási paraméterrel használja a meglévő beavatkozáskészletet; nem állít folyamatváltozékonyságot vagy más új cégadatot.

### DATA_FLOW_V2 / v2_manual_transfer

- Megfigyelés: Digitális adatot kézzel adnak tovább.
- Jelentőség: A válaszai alapján érdemes megvizsgálni a már digitálisan létező adatok ismételt rögzítését. Az átadás módja többletmunkát okozhat.
- Következő ellenőrzés: Kövessenek végig egy konkrét adatot a forrástól a felhasználásig.
- Kiváltás: v2_data_already_digital ∈ [ALMOST_ALWAYS, MOSTLY] AND v2_data_transfer_automation ∈ [PARTLY, NO].
- Kategória: DUPLICATE_DATA.
- Irányok: INTEGRATE_SYSTEMS.
- Automatizálás halasztása: nem.
- Forráskulcsok: pack:EV-DATA-TRANSFER-2025-001.

### DATA_FLOW_V2 / v2_data_authority_unclear

- Megfigyelés: Az eltérő adatok feloldása tisztázást igényelhet.
- Jelentőség: A megadott válasz szerint nem mindig egyértelmű, melyik adatot használják. Ez az egyeztetést nehezítheti; nem jogi vagy megfelelőségi minősítés.
- Következő ellenőrzés: Egy eltérés példáján tisztázzák az adat gazdáját és a döntés módját.
- Kiváltás: v2_source_of_truth_clarity ∈ [SOMETIMES, NO].
- Kategória: UNCLEAR_OWNERSHIP.
- Irányok: CLARIFY_PROCESS_OWNERSHIP.
- Automatizálás halasztása: igen.
- Forráskulcsok: paper:process-owner-role-davenport-1990.

### DATA_FLOW_V2 / v2_transfer_rework

- Megfigyelés: Az adatátadást javítások kísérik.
- Jelentőség: A válaszok ismételt adatbevitelhez kapcsolódó javításokat jeleznek. Az átadás megértése megelőzi az automatizálás mérlegelését.
- Következő ellenőrzés: Nézzenek meg két közelmúltbeli javítást és a hiba keletkezési pontját.
- Kiváltás: v2_data_already_digital ∈ [ALMOST_ALWAYS, MOSTLY, SOMETIMES] AND v2_data_transfer_automation ∈ [PARTLY, NO] AND v2_duplicate_entry_error_frequency ∈ [WEEKLY, SEVERAL_TIMES_A_WEEK, ALMOST_DAILY].
- Kategória: REWORK.
- Irányok: REDESIGN_BEFORE_AUTOMATING.
- Automatizálás halasztása: igen.
- Forráskulcsok: pack:EV-DATA-TRANSFER-2025-001.

### APPROVAL_V2 / v2_approval_criteria_gap

- Megfigyelés: A döntési feltételek tisztázása segíthet.
- Jelentőség: A válaszok döntésre várást és bizonytalan jóváhagyási feltételeket jeleznek. A szükséges kontrollok megtartása mellett érdemes áttekinteni a döntés útját.
- Következő ellenőrzés: Egy várakozó esetnél azonosítsák a szükséges információt és a jóváhagyás célját.
- Kiváltás: v2_approval_decision_wait ∈ [YES, MOSTLY] AND v2_approval_criteria ∈ [SOMETIMES, NO].
- Kategória: SLOW_APPROVAL.
- Irányok: REDESIGN_APPROVAL_ROUTING.
- Automatizálás halasztása: nem.
- Forráskulcsok: pack:EV-DECISION-RIGHTS-2019-001.

### APPROVAL_V2 / v2_approval_backup_gap

- Megfigyelés: A döntéshozó kiesése megállíthatja a munkát.
- Jelentőség: A válaszok szerint a döntésre váráshoz nem társul teljesen tisztázott helyettesítés. Ez nem indokolja önmagában a jóváhagyás eltörlését.
- Következő ellenőrzés: Tisztázzák, ki és milyen felhatalmazással dönthet távollét esetén.
- Kiváltás: v2_approval_decision_wait ∈ [YES, MOSTLY] AND v2_approval_backup ∈ [PARTLY, NO].
- Kategória: UNCLEAR_OWNERSHIP.
- Irányok: CLARIFY_PROCESS_OWNERSHIP.
- Automatizálás halasztása: igen.
- Forráskulcsok: paper:process-owner-role-davenport-1990.

### APPROVAL_V2 / v2_approval_unmeasured

- Megfigyelés: A várakozás időtartama még pontosítandó.
- Jelentőség: A válaszok alapján a döntésre várás ideje nincs rendszeresen mérve. Mérés nélkül a változtatás hatása nehezebben ellenőrizhető.
- Következő ellenőrzés: Néhány esetnél rögzítsék a döntéskérés és a döntés időpontját.
- Kiváltás: v2_approval_decision_wait ∈ [YES, MOSTLY] AND v2_approval_wait_measurement ∈ [SOMETIMES, NO].
- Kategória: UNMEASURED_COST.
- Irányok: IMPLEMENT_PROCESS_MEASUREMENT.
- Automatizálás halasztása: nem.
- Forráskulcsok: pack:EV-DT-ROI-2024-001.

### PROCESS_STABILITY_V2 / v2_sequence_varies

- Megfigyelés: A hasonló esetek menete gyakran eltér.
- Jelentőség: A válaszai alapján az ismétlődőnek tűnő munkának több változata lehet. A változatok megértése szükséges az automatizálás mérlegelése előtt.
- Következő ellenőrzés: Hasonlítsanak össze egy tipikus és egy eltérő esetet.
- Kiváltás: v2_same_sequence_count ∈ [FOUR_SEVEN, ONE_THREE, NONE].
- Kategória: MANUAL_ADMIN.
- Irányok: REDESIGN_BEFORE_AUTOMATING.
- Automatizálás halasztása: igen.
- Forráskulcsok: paper:bps-standardization-goel-bandara-gable-2023, pack:EV-BPM-RPA-SLR-2026-001.

### PROCESS_STABILITY_V2 / v2_instructions_gap

- Megfigyelés: A közös munkamenet pontosítható.
- Jelentőség: A leírt szabályok követése vagy a közös leírás még nem egységes. Ezt érdemes a csapattal áttekinteni.
- Következő ellenőrzés: Egyeztessék a ténylegesen követett lépéseket a munkát végzőkkel.
- Kiváltás: v2_process_instructions_use ∈ [DOCUMENTED_INCONSISTENT, INFORMAL, NO].
- Kategória: MANUAL_ADMIN.
- Irányok: REDESIGN_BEFORE_AUTOMATING.
- Automatizálás halasztása: igen.
- Forráskulcsok: paper:bps-standardization-goel-bandara-gable-2023, pack:EV-BPM-RPA-SLR-2026-001.

### PROCESS_STABILITY_V2 / v2_exceptions_late

- Megfigyelés: A kivételek felismerése további vizsgálatot igényelhet.
- Jelentőség: A válaszok szerint a kivételek egy része csak menet közben derül ki. Előbb ezek kezelését érdemes megérteni.
- Következő ellenőrzés: Nézzenek meg két kivételt és a felismeréshez szükséges információt.
- Kiváltás: v2_exceptions_recognizable ∈ [SOMETIMES, NO].
- Kategória: MANUAL_ADMIN.
- Irányok: REDESIGN_BEFORE_AUTOMATING.
- Automatizálás halasztása: igen.
- Forráskulcsok: paper:bps-standardization-goel-bandara-gable-2023, pack:EV-BPM-RPA-SLR-2026-001.

### PROCESS_STABILITY_V2 / v2_digital_input_gap

- Megfigyelés: A szükséges bemeneti adatok egy része nem digitális.
- Jelentőség: A válaszok szerint az adatok előkészítése külön munkát igényelhet. Ez korlátozhatja az ismétlődő lépések gépi támogatását.
- Következő ellenőrzés: Azonosítsák, hogyan keletkeznek és ellenőrizhetők a bemeneti adatok.
- Kiváltás: v2_repetitive_data_digital ∈ [SOME, NO].
- Kategória: MANUAL_ADMIN.
- Irányok: DIGITIZE_INTAKE.
- Automatizálás halasztása: igen.
- Forráskulcsok: pack:EV-BPM-RPA-SLR-2026-001.

### PROCESS_STABILITY_V2 / v2_repeatable_candidate

- Megfigyelés: Érdemes megvizsgálni egy ismétlődő lépés gépi támogatását.
- Jelentőség: A válaszok többnyire azonos munkamenetet, követett szabályokat és digitális adatokat jeleznek. Ez vizsgálati irány, nem automatizálási döntés.
- Következő ellenőrzés: Válasszanak egy lépést, és ellenőrizzék a kivételeket, költségeket és kontrollokat.
- Kiváltás: v2_same_sequence_count ∈ [EIGHT_TEN] AND v2_process_instructions_use ∈ [DOCUMENTED_AND_USED] AND v2_exceptions_recognizable ∈ [YES, MOSTLY] AND v2_repetitive_data_digital ∈ [ALL, MOST].
- Kategória: MANUAL_ADMIN.
- Irányok: AUTOMATE_REPETITIVE_STEP.
- Automatizálás halasztása: nem.
- Forráskulcsok: pack:EV-BPM-RPA-SLR-2026-001.

### PROCESS_STABILITY_REWORK_V2 / v2_sequence_varies

- Megfigyelés: A hasonló esetek menete gyakran eltér.
- Jelentőség: A válaszai alapján az ismétlődőnek tűnő munkának több változata lehet. A változatok megértése szükséges az automatizálás mérlegelése előtt.
- Következő ellenőrzés: Hasonlítsanak össze egy tipikus és egy eltérő esetet.
- Kiváltás: v2_same_sequence_count ∈ [FOUR_SEVEN, ONE_THREE, NONE].
- Kategória: MANUAL_ADMIN.
- Irányok: REDESIGN_BEFORE_AUTOMATING.
- Automatizálás halasztása: igen.
- Forráskulcsok: paper:bps-standardization-goel-bandara-gable-2023, pack:EV-BPM-RPA-SLR-2026-001.

### PROCESS_STABILITY_REWORK_V2 / v2_instructions_gap

- Megfigyelés: A közös munkamenet pontosítható.
- Jelentőség: A leírt szabályok követése vagy a közös leírás még nem egységes. Ezt érdemes a csapattal áttekinteni.
- Következő ellenőrzés: Egyeztessék a ténylegesen követett lépéseket a munkát végzőkkel.
- Kiváltás: v2_process_instructions_use ∈ [DOCUMENTED_INCONSISTENT, INFORMAL, NO].
- Kategória: MANUAL_ADMIN.
- Irányok: REDESIGN_BEFORE_AUTOMATING.
- Automatizálás halasztása: igen.
- Forráskulcsok: paper:bps-standardization-goel-bandara-gable-2023, pack:EV-BPM-RPA-SLR-2026-001.

### PROCESS_STABILITY_REWORK_V2 / v2_exceptions_late

- Megfigyelés: A kivételek felismerése további vizsgálatot igényelhet.
- Jelentőség: A válaszok szerint a kivételek egy része csak menet közben derül ki. Előbb ezek kezelését érdemes megérteni.
- Következő ellenőrzés: Nézzenek meg két kivételt és a felismeréshez szükséges információt.
- Kiváltás: v2_exceptions_recognizable ∈ [SOMETIMES, NO].
- Kategória: MANUAL_ADMIN.
- Irányok: REDESIGN_BEFORE_AUTOMATING.
- Automatizálás halasztása: igen.
- Forráskulcsok: paper:bps-standardization-goel-bandara-gable-2023, pack:EV-BPM-RPA-SLR-2026-001.

### PROCESS_STABILITY_REWORK_V2 / v2_digital_input_gap

- Megfigyelés: A szükséges bemeneti adatok egy része nem digitális.
- Jelentőség: A válaszok szerint az adatok előkészítése külön munkát igényelhet. Ez korlátozhatja az ismétlődő lépések gépi támogatását.
- Következő ellenőrzés: Azonosítsák, hogyan keletkeznek és ellenőrizhetők a bemeneti adatok.
- Kiváltás: v2_repetitive_data_digital ∈ [SOME, NO].
- Kategória: MANUAL_ADMIN.
- Irányok: DIGITIZE_INTAKE.
- Automatizálás halasztása: igen.
- Forráskulcsok: pack:EV-BPM-RPA-SLR-2026-001.

### PROCESS_STABILITY_REWORK_V2 / v2_rework_same_location

- Megfigyelés: A javítások egy visszatérő ponton jelentkeznek.
- Jelentőség: A válasz szerint a javítás jellemzően ugyanott válik szükségessé. Érdemes ezen a ponton ellenőrizni az átadott információt és a munkalépést.
- Következő ellenőrzés: Nézzenek meg két javítást ugyanazon a ponton és az azt megelőző átadást.
- Kiváltás: v2_rework_same_point ∈ [YES, MOSTLY].
- Kategória: REWORK.
- Irányok: REDESIGN_BEFORE_AUTOMATING.
- Automatizálás halasztása: igen.
- Forráskulcsok: paper:bps-standardization-goel-bandara-gable-2023, pack:EV-BPM-RPA-SLR-2026-001.

### PROCESS_STABILITY_REWORK_V2 / v2_rework_varied_locations

- Megfigyelés: A javítások több ponton válnak szükségessé.
- Jelentőség: A válasz szerint a javítás helye változó. Egyetlen lépés automatizálása előtt az eltérő esetek menetét érdemes összehasonlítani.
- Következő ellenőrzés: Hasonlítsanak össze két, eltérő ponton javított esetet és azok kiváltó okait.
- Kiváltás: v2_rework_same_point ∈ [VARIES].
- Kategória: REWORK.
- Irányok: REDESIGN_BEFORE_AUTOMATING.
- Automatizálás halasztása: igen.
- Forráskulcsok: paper:bps-standardization-goel-bandara-gable-2023, pack:EV-BPM-RPA-SLR-2026-001.

### OWNERSHIP_V2 / v2_owner_gap

- Megfigyelés: A teljes folyamat felelőse tisztázandó lehet.
- Jelentőség: A válasz szerint nincs megnevezett felelős a folyamat egészére. Ez az átadási pontokon bizonytalanságot okozhat.
- Következő ellenőrzés: Tisztázzák a felelősségi kört és a hozzá tartozó döntési jogot.
- Kiváltás: v2_process_owner ∈ [NO].
- Kategória: UNCLEAR_OWNERSHIP.
- Irányok: CLARIFY_PROCESS_OWNERSHIP.
- Automatizálás halasztása: igen.
- Forráskulcsok: paper:process-owner-role-davenport-1990.

### OWNERSHIP_V2 / v2_team_decision_gap

- Megfigyelés: A csapatok közötti döntés útja pontosítható.
- Jelentőség: A válasz alapján elakadáskor nem mindig egyértelmű a döntéshozó. A közös felelősség önmagában nem hiba.
- Következő ellenőrzés: Egy konkrét elakadáson egyeztessék a döntés útját.
- Kiváltás: v2_cross_team_decision ∈ [SOMETIMES, NO].
- Kategória: UNCLEAR_OWNERSHIP.
- Irányok: CLARIFY_PROCESS_OWNERSHIP.
- Automatizálás halasztása: igen.
- Forráskulcsok: paper:process-owner-role-davenport-1990.

### OWNERSHIP_V2 / v2_review_owner_gap

- Megfigyelés: Az eredmények rendszeres áttekintése nem teljesen rendezett.
- Jelentőség: A megadott válasz szerint az eredmények áttekintése nem egyértelműen gazdásított. Emiatt visszatérő problémák maradhatnak észrevétlenek.
- Következő ellenőrzés: Beszéljék meg, ki és milyen időközönként nézi át a tapasztalatokat.
- Kiváltás: v2_process_review_owner ∈ [PARTLY, NO].
- Kategória: UNCLEAR_OWNERSHIP.
- Irányok: CLARIFY_PROCESS_OWNERSHIP.
- Automatizálás halasztása: nem.
- Forráskulcsok: paper:process-owner-role-davenport-1990.

### MEASUREMENT_V2 / v2_metric_missing

- Megfigyelés: A folyamat eredménye még nehezen követhető.
- Jelentőség: A válasz alapján nincs meghatározott mutató. Enélkül a fejlesztés előtti és utáni állapot összevetése nehezebb.
- Következő ellenőrzés: Válasszanak egy, az üzleti célhoz kapcsolódó egyszerű mutatót.
- Kiváltás: v2_process_metric ∈ [NO].
- Kategória: UNMEASURED_COST.
- Irányok: IMPLEMENT_PROCESS_MEASUREMENT.
- Automatizálás halasztása: nem.
- Forráskulcsok: pack:EV-DT-ROI-2024-001.

### MEASUREMENT_V2 / v2_baseline_gap

- Megfigyelés: A kiinduló mérés nem rendszeres.
- Jelentőség: A válaszok alapján van mutató, de a fejlesztés előtti értéket nem mindig rögzítik. Így a későbbi különbség nehezebben értelmezhető.
- Következő ellenőrzés: A következő változtatás előtt rögzítsék a mutató értékét és mérési módját.
- Kiváltás: v2_process_metric ∈ [YES, PARTLY] AND v2_metric_baseline ∈ [SOMETIMES, NO].
- Kategória: UNMEASURED_COST.
- Irányok: IMPLEMENT_PROCESS_MEASUREMENT.
- Automatizálás halasztása: nem.
- Forráskulcsok: pack:EV-DT-ROI-2024-001.

### MEASUREMENT_V2 / v2_followup_gap

- Megfigyelés: A változtatás utáni visszamérés nem rendszeres.
- Jelentőség: A megadott válaszok szerint a mutató későbbi értékét nem mindig nézik meg. Ebből megtakarítás vagy ROI nem állapítható meg.
- Következő ellenőrzés: Rögzítsék, mikor és ugyanazzal a módszerrel hogyan mérnek újra.
- Kiváltás: v2_process_metric ∈ [YES, PARTLY] AND v2_metric_followup ∈ [SOMETIMES, NO].
- Kategória: UNMEASURED_COST.
- Irányok: IMPLEMENT_PROCESS_MEASUREMENT.
- Automatizálás halasztása: nem.
- Forráskulcsok: pack:EV-DT-ROI-2024-001.

### DIGITAL_VALUE_V2 / v2_investment_goal_gap

- Megfigyelés: A bevezetés üzleti célja pontosítható.
- Jelentőség: A válaszok szerint az új megoldáshoz nem teljesen rögzített üzleti probléma tartozik. Ez megnehezítheti az eredmény megítélését.
- Következő ellenőrzés: Egyeztessék, milyen konkrét munkabeli problémát vártak megoldani.
- Kiváltás: v2_digital_investment_recent ∈ [YES] AND v2_investment_problem ∈ [PARTLY, NO].
- Kategória: nincs; felmérési szintű kontextus.
- Irányok: ALIGN_IT_WITH_BUSINESS_GOALS.
- Automatizálás halasztása: nem.
- Forráskulcsok: pack:EV-SME-DT-2024-001.

### DIGITAL_VALUE_V2 / v2_investment_measure_gap

- Megfigyelés: A bevezetés hatása mérési alapot igényel.
- Jelentőség: A válaszok alapján a bevezetés előtt nem volt teljes mérési alap. A rendszer használata önmagában nem bizonyít üzleti eredményt.
- Következő ellenőrzés: Tisztázzák az értékelhető mutatót és az összehasonlítás korlátait.
- Kiváltás: v2_digital_investment_recent ∈ [YES] AND v2_investment_metric ∈ [PARTLY, NO].
- Kategória: UNMEASURED_COST.
- Irányok: IMPLEMENT_PROCESS_MEASUREMENT.
- Automatizálás halasztása: nem.
- Forráskulcsok: pack:EV-DT-ROI-2024-001.

### DIGITAL_VALUE_V2 / v2_investment_followup_gap

- Megfigyelés: A hatás utólagos ellenőrzése még hiányozhat.
- Jelentőség: A válaszok szerint az új megoldás hatását nem mérték vissza azonos mutatóval. Megtérülést ebből nem lehet állítani.
- Következő ellenőrzés: Ellenőrizzék, milyen összehasonlítható adat áll rendelkezésre.
- Kiváltás: v2_digital_investment_recent ∈ [YES] AND v2_investment_remeasurement ∈ [NO, NO_BASELINE].
- Kategória: UNMEASURED_COST.
- Irányok: IMPLEMENT_PROCESS_MEASUREMENT.
- Automatizálás halasztása: nem.
- Forráskulcsok: pack:EV-DT-ROI-2024-001.

### DIGITAL_VALUE_V2 / v2_investment_preparation_check

- Megfigyelés: A felkészítés és a bevezetés célja közös tisztázást igényelhet.
- Jelentőség: A válaszok részleges felkészítést és nem teljesen rögzített célt jeleznek. Egy válaszadó jelzése nem bizonyít képzési problémát.
- Következő ellenőrzés: Kérdezzék meg az érintetteket, mely konkrét feladatokban kell támogatás.
- Kiváltás: v2_digital_investment_recent ∈ [YES] AND v2_investment_problem ∈ [PARTLY, NO] AND v2_investment_preparation ∈ [SOME, NO].
- Kategória: nincs; felmérési szintű kontextus.
- Irányok: TRAIN_DIGITAL_SKILLS.
- Automatizálás halasztása: nem.
- Forráskulcsok: pack:EV-KOUMAS-2021-001.

## Bizonyítékaudit

Az alkalmazott hivatkozások a meglévő kurált korpuszból származnak. A VERIFIED jelölést örököljük, nem állítunk új bibliográfiai ellenőrzést vagy pilotbizonyítékot. UNVERIFIED csak tájékoztató kontextusként jelenhet meg. A forrás a vizsgálati irányt támasztja alá; nem bizonyítja a konkrét ügyfél állapotát, a kérdés validitását vagy az alkalmazott kategóriahatárokat. A gyakorisági útválasztási határ terméktervezési döntés, nem tudományos küszöb. Saját kérdésszöveg; nem importált szerzői kérdőív.

Auditdöntés: a digitális bemenet hiányára eredetileg megfontolt Hammer-hivatkozást eltávolítottuk, mert az adott korpuszrekord jóváhagyási rétegekről szól. Helyette a BPM/RPA alkalmassági szűrés ad korlátozott hátteret a bemenetek ellenőrzéséhez. A forrás nem igazol konkrét digitalizálási eredményt. Az adateltéréshez rendelt folyamatfelelős-forrás kizárólag az adatgazda/döntési út tisztázását támogatja, nem adatminőség- vagy jogsértési diagnózist. A képzési megállapítás két jelzést kíván, és kifejezetten további érintetti ellenőrzést kér.

### pack:EV-DT-ROI-2024-001

Digital initiative outcome and ROI measurement (maturity dimensions review) · Ellenőrzött szakirodalmi háttér

Korlátozott állítás: Digital initiatives should be tracked with KPIs and evaluated after implementation using business-performance measures such as ROI where applicable, complemented by intermediate process metrics.

Korlát: Review synthesizes maturity-model literature; it does not prescribe one universal ROI formula or effect size.

### pack:EV-SME-DT-2024-001

Toward SMEs digital transformation success: a systematic literature review · Ellenőrzött szakirodalmi háttér

Korlátozott állítás: SME digital transformation should reflect the firm's baseline, limitations and idiosyncrasies; incremental learning, alignment and measurable cost-benefit reasoning recur as success factors.

Korlát: Literature is heterogeneous and concentrated in developed-country contexts; recommendations are not universal causal prescriptions.

### pack:EV-KOUMAS-2021-001

Digital Transformation of Small and Medium Sized Enterprises Production Manufacturing · Ellenőrzött szakirodalmi háttér

Korlátozott állítás: A progressive SME transformation framework combines organizational improvement with technology, cost-quality-time performance criteria and human/training considerations.

Korlát: Manufacturing-focused framework and use cases; should not be directly generalized to professional-services processes. The paper's own numerical decision rules must not be imported as Adminiculum thresholds.

### paper:bps-standardization-goel-bandara-gable-2023

Conceptualizing Business Process Standardization: A Review and Synthesis · Ellenőrzött szakirodalmi háttér

Korlátozott állítás: A szisztematikus áttekintés szerint a folyamatstandardizálás csökkenti a varianciát és a kézi újramunkát; az áttekintés nem állít konkrét százalékos megtakarítást.

Korlát: Szakirodalmi szintézis, nem konkrét cégmérés; a hatás nagysága kontextusfüggő.

### pack:EV-BPM-RPA-SLR-2026-001

Systematic literature review on BPM and robotic process automation · Ellenőrzött szakirodalmi háttér

Korlátozott állítás: Process quality and suitability should be assessed before automation because automating an unstable or poorly designed process can reproduce or accelerate waste and errors.

Korlát: Automation/RPA literature is heterogeneous; the evidence supports screening process suitability rather than a universal redesign recipe.

### pack:EV-DATA-TRANSFER-2025-001

Application-assisted electronic data transfer study · Ellenőrzött szakirodalmi háttér

Korlátozott állítás: Application-assisted electronic data transfer can reduce manual transcription burden and error compared with repeated manual entry where source data already exists digitally.

Korlát: Healthcare data-transfer context; numerical effect sizes are not transferable to law/SME workflows.

### paper:process-owner-role-davenport-1990

The New Industrial Engineering: Information Technology and Business Process Redesign · Ellenőrzött szakirodalmi háttér

Korlátozott állítás: A cikk elvi szinten érvel amellett, hogy a folyamatfelelős és az IT-támogatás együtt csökkenti a rendszerközi váltást és a felelősségi réseket.

Korlát: Korai, pre-digitalizációs cikk; elvi irányok, nem mért hatások.

### pack:EV-DECISION-RIGHTS-2019-001

Empirical research on decision-rights delegation in hierarchical credit approval · Ellenőrzött szakirodalmi háttér

Korlátozott állítás: Empirical research on hierarchical decision rights shows that information transmission and escalation can be costly and that delegation can alter decision speed/quality trade-offs.

Korlát: Banking/credit-decision context; delegation must remain compatible with risk and control requirements.

## V1 → V2 fogalmi migrációs térkép (35/35)

Ez tervezési térkép, **nem adattovábbítás vagy válaszkonverzió**. Minden sor visszamenőleges szabálya: eredeti V1 kulcs, kérdés, opció és kiértékelés változatlan; régi kitöltés csak V1 szabállyal. SECONDARY_ONLY nem törlést jelent: a részletes csomagban megmarad.

### dm_strategy_alignment

- CURRENT_PACK: DIGITAL_MATURITY v1
- CURRENT_PROMPT: A digitális fejlesztési prioritások egyértelműen az üzleti célokhoz kapcsolódnak?
- ACTION: REWORD
- REASON: Absztrakt prioritások helyett egy tényleges, 12 hónapon belüli bevezetés célja.
- REPLACEMENT_KEYS: v2_investment_problem
- FINDING_EFFECT: v2_investment_goal_gap, v2_investment_preparation_check
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### dm_outcome_measurement

- CURRENT_PACK: DIGITAL_MATURITY v1
- CURRENT_PROMPT: A digitális fejlesztések eredményeit meghatározott mutatókkal mérik?
- ACTION: MERGE
- REASON: A bevezetés előtti konkrét mérőszámra szűkítve.
- REPLACEMENT_KEYS: v2_investment_metric
- FINDING_EFFECT: v2_investment_measure_gap
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### dm_measurement_review

- CURRENT_PACK: DIGITAL_MATURITY v1
- CURRENT_PROMPT: Rendszeresen visszatekintenek arra, hogy egy bevezetett rendszer hozta-e az elvárt hatást?
- ACTION: MERGE
- REASON: Azonos mutatóval végzett visszamérés.
- REPLACEMENT_KEYS: v2_investment_remeasurement
- FINDING_EFFECT: v2_investment_followup_gap
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### dm_leadership_review

- CURRENT_PACK: DIGITAL_MATURITY v1
- CURRENT_PROMPT: A vezetés rendszeresen áttekinti, hogy a technológiai beruházások üzleti értéket hoznak-e?
- ACTION: SECONDARY_ONLY
- REASON: A vezetés általános működését nem következtetjük ki egy rövid ügyféljelzésből.
- REPLACEMENT_KEYS: nincs az aktív V2 útban
- FINDING_EFFECT: nincs V2 megállapítás; részletes V1-ben megőrizve
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### dm_training

- CURRENT_PACK: DIGITAL_MATURITY v1
- CURRENT_PROMPT: A munkatársak digitális készségfejlesztése rendszeresen megtörténik?
- ACTION: REPLACE
- REASON: Egy konkrét bevezetéshez szükséges felkészítés, általános készségminősítés nélkül.
- REPLACEMENT_KEYS: v2_investment_preparation
- FINDING_EFFECT: v2_investment_preparation_check
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### dm_process_support

- CURRENT_PACK: DIGITAL_MATURITY v1
- CURRENT_PROMPT: A fontos folyamatokat megfelelő digitális rendszerek támogatják?
- ACTION: REPLACE
- REASON: A megfelelő rendszer megítélése helyett megfigyelhető adat-hozzáférhetőség.
- REPLACEMENT_KEYS: v2_repetitive_data_digital
- FINDING_EFFECT: v2_digital_input_gap, v2_repeatable_candidate
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### dm_data_access

- CURRENT_PACK: DIGITAL_MATURITY v1
- CURRENT_PROMPT: A döntésekhez szükséges adatok gyorsan és megbízhatóan elérhetők?
- ACTION: REPLACE
- REASON: Egy adateltérés feloldására szűkítve, gyorsaság és megbízhatóság összevonása nélkül.
- REPLACEMENT_KEYS: v2_source_of_truth_clarity
- FINDING_EFFECT: v2_data_authority_unclear
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### dm_ownership

- CURRENT_PACK: DIGITAL_MATURITY v1
- CURRENT_PROMPT: Egyértelmű, ki felel a digitális fejlesztésekért a szervezetben?
- ACTION: SECONDARY_ONLY
- REASON: A digitális fejlesztés felelőse eltér a folyamatfelelőstől; nem azonosítjuk őket.
- REPLACEMENT_KEYS: nincs az aktív V2 útban
- FINDING_EFFECT: nincs V2 megállapítás; részletes V1-ben megőrizve
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### dm_prioritization

- CURRENT_PACK: DIGITAL_MATURITY v1
- CURRENT_PROMPT: A digitális fejlesztéseket tudatosan rangsorolják, nem alkalmi igények szerint?
- ACTION: SECONDARY_ONLY
- REASON: Szervezeti prioritások szakmai áttekintésben vizsgálandók.
- REPLACEMENT_KEYS: nincs az aktív V2 útban
- FINDING_EFFECT: nincs V2 megállapítás; részletes V1-ben megőrizve
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### dm_customer_feedback

- CURRENT_PACK: DIGITAL_MATURITY v1
- CURRENT_PROMPT: Az ügyfélélményt digitális csatornákon is mérik ott, ahol ez értelmezhető?
- ACTION: SECONDARY_ONLY
- REASON: A jelenlegi rövid problémaágakban nem változtat önálló döntést.
- REPLACEMENT_KEYS: nincs az aktív V2 útban
- FINDING_EFFECT: nincs V2 megállapítás; részletes V1-ben megőrizve
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### tr_goal_clarity

- CURRENT_PACK: TRANSFORMATION_READINESS v1
- CURRENT_PROMPT: A következő fejlesztés mögött egyértelmű üzleti cél áll?
- ACTION: MERGE
- REASON: Ugyanaz a fogalom konkrét, megvalósult bevezetéshez kötve.
- REPLACEMENT_KEYS: v2_investment_problem
- FINDING_EFFECT: v2_investment_goal_gap, v2_investment_preparation_check
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### tr_leader_owner

- CURRENT_PACK: TRANSFORMATION_READINESS v1
- CURRENT_PROMPT: Ki van jelölve vezetői felelőse a változásnak?
- ACTION: SECONDARY_ONLY
- REASON: Projektvezető nem helyettesíthető folyamatfelelőssel.
- REPLACEMENT_KEYS: nincs az aktív V2 útban
- FINDING_EFFECT: nincs V2 megállapítás; részletes V1-ben megőrizve
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### tr_capacity

- CURRENT_PACK: TRANSFORMATION_READINESS v1
- CURRENT_PROMPT: Rendelkezésre áll a szükséges idő és kapacitás a bevezetéshez?
- ACTION: SECONDARY_ONLY
- REASON: Bevezetési kapacitás a későbbi emberi kezdeményezésdöntés része.
- REPLACEMENT_KEYS: nincs az aktív V2 útban
- FINDING_EFFECT: nincs V2 megállapítás; részletes V1-ben megőrizve
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### tr_employee_involvement

- CURRENT_PACK: TRANSFORMATION_READINESS v1
- CURRENT_PROMPT: A munkatársakat bevonják a bevezetés előkészítésébe?
- ACTION: SECONDARY_ONLY
- REASON: Bevonás nem azonos a felkészítéssel; nem olvasztjuk össze.
- REPLACEMENT_KEYS: nincs az aktív V2 útban
- FINDING_EFFECT: nincs V2 megállapítás; részletes V1-ben megőrizve
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### tr_training_readiness

- CURRENT_PACK: TRANSFORMATION_READINESS v1
- CURRENT_PROMPT: A munkatársak megkapják a szükséges felkészítést az új megoldáshoz?
- ACTION: REWORD
- REASON: Megvalósult bevezetésnél megfigyelhető felkészítés és érintetti arány.
- REPLACEMENT_KEYS: v2_investment_preparation
- FINDING_EFFECT: v2_investment_preparation_check
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### tr_baseline

- CURRENT_PACK: TRANSFORMATION_READINESS v1
- CURRENT_PROMPT: A fejlesztés előtt rögzítik a kiinduló állapotot (mérőszámot)?
- ACTION: REWORD
- REASON: Folyamat vagy konkrét digitális bevezetés szerinti kiinduló mérés.
- REPLACEMENT_KEYS: v2_metric_baseline, v2_investment_metric
- FINDING_EFFECT: v2_baseline_gap, v2_investment_measure_gap
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### tr_phased

- CURRENT_PACK: TRANSFORMATION_READINESS v1
- CURRENT_PROMPT: A bevezetéseket szakaszos, mérhető lépésekre bontják?
- ACTION: SECONDARY_ONLY
- REASON: Szakmai projekttervezési döntés, nem rövid ügyféldiagnózis.
- REPLACEMENT_KEYS: nincs az aktív V2 útban
- FINDING_EFFECT: nincs V2 megállapítás; részletes V1-ben megőrizve
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### tr_review_loop

- CURRENT_PACK: TRANSFORMATION_READINESS v1
- CURRENT_PROMPT: A bevezetés után visszatekintenek és tanulnak az eredményekből?
- ACTION: REPLACE
- REASON: Általános tanulás helyett azonos mutató ismételt ellenőrzése.
- REPLACEMENT_KEYS: v2_metric_followup, v2_investment_remeasurement
- FINDING_EFFECT: v2_followup_gap, v2_investment_followup_gap
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### pa_owner

- CURRENT_PACK: PROCESS_AUTOMATION_READINESS v1
- CURRENT_PROMPT: A vizsgált folyamatnak egyértelmű felelőse van?
- ACTION: REWORD
- REASON: Megnevezett felelős és elakadáskori döntés külön kérdésben.
- REPLACEMENT_KEYS: v2_process_owner, v2_cross_team_decision
- FINDING_EFFECT: v2_owner_gap, v2_team_decision_gap
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### pa_documented

- CURRENT_PACK: PROCESS_AUTOMATION_READINESS v1
- CURRENT_PROMPT: A folyamat lépései dokumentáltak és ismertek?
- ACTION: REPLACE
- REASON: Dokumentáltság és tényleges használat válaszkategóriákkal elkülönítve.
- REPLACEMENT_KEYS: v2_process_instructions_use
- FINDING_EFFECT: v2_instructions_gap, v2_repeatable_candidate
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### pa_stable

- CURRENT_PACK: PROCESS_AUTOMATION_READINESS v1
- CURRENT_PROMPT: A folyamat minden esetben ugyanúgy zajlik, nem eseti kivételek sorozata?
- ACTION: REPLACE
- REASON: Abszolút állítás helyett az utóbbi tíz hasonló eset és felismerhető kivételek.
- REPLACEMENT_KEYS: v2_same_sequence_count, v2_exceptions_recognizable
- FINDING_EFFECT: v2_sequence_varies, v2_exceptions_late, v2_repeatable_candidate
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### pa_rework

- CURRENT_PACK: PROCESS_AUTOMATION_READINESS v1
- CURRENT_PROMPT: Előfordul, hogy a folyamatot javítani vagy újracsinálni kell?
- ACTION: REWORD
- REASON: Négyhetes gyakoriság irányít; a célzott ág a javítás helyét vizsgálja.
- REPLACEMENT_KEYS: qs_rework_frequency, v2_rework_same_point
- FINDING_EFFECT: v2_rework_same_location, v2_rework_varied_locations; QS-kulcsok kizárólag útválasztók
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### pa_manual_repetitive

- CURRENT_PACK: PROCESS_AUTOMATION_READINESS v1
- CURRENT_PROMPT: Van rendszeresen ismétlődő, kézzel végzett lépés a folyamatban?
- ACTION: REPLACE
- REASON: A MANUAL_ADMIN jelzés után megfigyelhető alkalmassági szempontok.
- REPLACEMENT_KEYS: v2_same_sequence_count, v2_repetitive_data_digital
- FINDING_EFFECT: v2_sequence_varies, v2_digital_input_gap, v2_repeatable_candidate
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### pa_duplicate_entry

- CURRENT_PACK: PROCESS_AUTOMATION_READINESS v1
- CURRENT_PROMPT: Ugyanazt az adatot több helyen is rögzíteni kell?
- ACTION: MERGE
- REASON: Ismételt adatbevitel egy közös adatátadási ágban.
- REPLACEMENT_KEYS: qs_duplicate_entry_frequency, v2_data_already_digital
- FINDING_EFFECT: v2_manual_transfer, v2_transfer_rework; QS-kulcsok kizárólag útválasztók
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### pa_approval_wait

- CURRENT_PACK: PROCESS_AUTOMATION_READINESS v1
- CURRENT_PROMPT: A folyamatban jelentős jóváhagyási lépés vagy várakozás van?
- ACTION: REPLACE
- REASON: A szükséges kontroll és a tényleges várakozás megkülönböztetése.
- REPLACEMENT_KEYS: qs_approval_wait_frequency, v2_approval_decision_wait, v2_approval_criteria, v2_approval_backup, v2_approval_wait_measurement
- FINDING_EFFECT: v2_approval_criteria_gap, v2_approval_backup_gap, v2_approval_unmeasured; QS-kulcsok kizárólag útválasztók
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### pa_measured

- CURRENT_PACK: PROCESS_AUTOMATION_READINESS v1
- CURRENT_PROMPT: A folyamat idejét és eredményét mérik?
- ACTION: REPLACE
- REASON: Idő és eredmény szétválasztása; kiinduló és utólagos érték külön.
- REPLACEMENT_KEYS: qs_cycle_time_measurement, v2_process_metric, v2_metric_baseline, v2_metric_followup
- FINDING_EFFECT: v2_metric_missing, v2_baseline_gap, v2_followup_gap; QS-kulcsok kizárólag útválasztók
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### pa_automation_suitable

- CURRENT_PACK: PROCESS_AUTOMATION_READINESS v1
- CURRENT_PROMPT: Az ismétlődő lépések szabályai kellően egyértelműek az automatizáláshoz?
- ACTION: REPLACE
- REASON: Alkalmasság diagnosztizálása helyett megfigyelhető feltételek.
- REPLACEMENT_KEYS: v2_same_sequence_count, v2_process_instructions_use, v2_exceptions_recognizable, v2_repetitive_data_digital
- FINDING_EFFECT: v2_sequence_varies, v2_instructions_gap, v2_exceptions_late, v2_digital_input_gap, v2_repeatable_candidate
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### sd_system_count

- CURRENT_PACK: SYSTEMS_DATA_FLOW v1
- CURRENT_PROMPT: Több különböző rendszert használnak a munkához, amelyek között váltani kell?
- ACTION: REWORD
- REASON: Darabszám csak útválasztás, nem konszolidációs javaslat.
- REPLACEMENT_KEYS: qs_typical_system_count
- FINDING_EFFECT: nincs V2 megállapítás; részletes V1-ben megőrizve; QS-kulcsok kizárólag útválasztók
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### sd_reentry

- CURRENT_PACK: SYSTEMS_DATA_FLOW v1
- CURRENT_PROMPT: Ugyanazt az adatot több rendszerben is manuálisan rögzítik?
- ACTION: MERGE
- REASON: Az ismételt rögzítés és következmény konkrét időszakra szűkítve.
- REPLACEMENT_KEYS: qs_duplicate_entry_frequency, v2_data_already_digital, v2_duplicate_entry_error_frequency
- FINDING_EFFECT: v2_manual_transfer, v2_transfer_rework; QS-kulcsok kizárólag útválasztók
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### sd_manual_transfer

- CURRENT_PACK: SYSTEMS_DATA_FLOW v1
- CURRENT_PROMPT: Az adatok rendszerek közötti átadása részben manuális?
- ACTION: MERGE
- REASON: Az átadás egy közös kérdésben, részleges automatikus átadást is megengedve.
- REPLACEMENT_KEYS: v2_data_transfer_automation
- FINDING_EFFECT: v2_manual_transfer, v2_transfer_rework
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### sd_owner

- CURRENT_PACK: SYSTEMS_DATA_FLOW v1
- CURRENT_PROMPT: Egyértelmű, ki felel egy-egy rendszerért?
- ACTION: SECONDARY_ONLY
- REASON: Rendszergazda nem azonos adatgazdával vagy folyamatfelelőssel.
- REPLACEMENT_KEYS: nincs az aktív V2 útban
- FINDING_EFFECT: nincs V2 megállapítás; részletes V1-ben megőrizve
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### sd_single_source

- CURRENT_PACK: SYSTEMS_DATA_FLOW v1
- CURRENT_PROMPT: Egyértelmű, melyik az adott adat elsődleges forrása?
- ACTION: REWORD
- REASON: Elvont elsődleges forrás helyett tényleges eltérés feloldása.
- REPLACEMENT_KEYS: v2_source_of_truth_clarity
- FINDING_EFFECT: v2_data_authority_unclear
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### sd_integration

- CURRENT_PACK: SYSTEMS_DATA_FLOW v1
- CURRENT_PROMPT: A rendszerek közötti kapcsolatok megoldottak (integráció vagy automatikus átadás)?
- ACTION: MERGE
- REASON: Technikai integráció helyett az adat tényleges átkerülése.
- REPLACEMENT_KEYS: v2_data_transfer_automation
- FINDING_EFFECT: v2_manual_transfer, v2_transfer_rework
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### sd_overlap

- CURRENT_PACK: SYSTEMS_DATA_FLOW v1
- CURRENT_PROMPT: Vannak átfedő funkciójú rendszerek?
- ACTION: SECONDARY_ONLY
- REASON: Funkcionális átfedés feltérképezés nélkül nem indokol rendszerkiváltást.
- REPLACEMENT_KEYS: nincs az aktív V2 útban
- FINDING_EFFECT: nincs V2 megállapítás; részletes V1-ben megőrizve
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

### sd_impact_measured

- CURRENT_PACK: SYSTEMS_DATA_FLOW v1
- CURRENT_PROMPT: Mérik, hogy a rendszerek használata javítja-e a folyamatot?
- ACTION: MERGE
- REASON: Azonos mutatóra visszatérő, kontextushoz kötött kérdések.
- REPLACEMENT_KEYS: v2_process_metric, v2_metric_followup, v2_investment_remeasurement
- FINDING_EFFECT: v2_metric_missing, v2_baseline_gap, v2_followup_gap, v2_investment_followup_gap
- BACKWARD_COMPATIBILITY: változatlan V1-visszaolvasás és kiértékelés; nincs válaszátírás.

## Technikai ellenőrzés és emberi validálás

A típusok, szabályok, HTTP+PostgreSQL határok és a szintetikus böngészőutak tesztjei technikai helyességet ellenőriznek. Nem igazolják az érthetőséget vagy a kitöltési időt. A külön GROW_V2_QUESTIONNAIRE_VALIDATION_PLAN.md szerinti kognitív pilot még végrehajtandó. A végleges futtatási bizonyítékokat a PR validációs összefoglalója tartalmazza.

2026-10-07 helyi ellenőrzés, Node 20:

| Csoport | Eredmény |
|---|---|
| Végső V2-szabály/verzió + portál- és kutatási PostgreSQL határok | 57/57 sikeres |
| Grow/portál frontend | 521/521 sikeres, 0 kihagyott |
| Elsődleges PostgreSQL csoportok | 31 + 63 sikeres, egymástól külön tesztfájlok |
| További életciklus/pillanatkép csoport | 46 sikeres, 1 változatlan dátumfüggő teszthiba |
| Szélesebb backend Grow/jogosultsági csoport | 188 sikeres, 7 induló CI-ben is meglévő munkaterület-mock hiba, 6 kihagyott |
| Böngésző 390×844, 768×1024, 1440×1000 | Ügyfélút és munkatársi összefoglaló sikeres, 0 vízszintes túlcsordulás; ügyféloldali futási hiba 0 |
| UI anti-drift | 0 új eltérés; meglévő 3629 változatlan |

A csoportok részben átfednek; nem összeadható teljes tesztszámok. A böngészőteszt valódi Chromium és helyi Next futtatás, registryből származó szintetikus API-válaszokkal; nem éles bejelentkezési vagy üzleti pilot.

A régi pillanatkép-teszt 2026-09-11T14:00Z-t vár legutóbbiként, miközben korábbi tesztesete az aktuális októberi időponttal hoz létre megfigyelést. A teszt és nyolc saját forrásfüggősége byte-tartalmilag (sorvég-normalizálással) azonos a kezdő committal. Az érintett régi tesztet és működést nem módosítottuk. Az induló CI-ben a hét munkaterület-mock hiba ugyanazokon a sorokon jelentkezett. Új V2-regressziót az ellenőrzések nem mutattak.

Újrafuttatás: a Backend Jest tesztjei Node 20 alatt, helyi MIGRATION_REPLAY_DATABASE_URL-lal; a frontend tesztek node --import tsx --test paranccsal. A böngészőhöz előbb a Frontend könyvtárból node --import tsx ../Backend/tests/generateGrowV2BrowserFixture.ts (GROW_V2_QA_FIXTURE egy helyi JSON fájl), majd node tests/growV2BrowserRunner.mjs ugyanazzal a változóval és opcionális GROW_V2_QA_OUTPUT könyvtárral. A runner csak a saját helyi folyamatát állítja le. Éles konfigurációt nem módosít.
