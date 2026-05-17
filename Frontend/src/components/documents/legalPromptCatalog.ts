"use client";

import type { ClientHouseStyleProfile } from "@/lib/api";

export type LegalPromptCategory =
  | "analysis"
  | "risk"
  | "modification"
  | "handoff"
  | "communication"
  | "formatting"
  | "review"
  | "episode";

export interface LegalPromptTemplate {
  id: string;
  label: string;
  shortLabel?: string;
  category: LegalPromptCategory;
  description: string;
  requiresDocumentText: boolean;
  buildBody: (input: {
    documentTitle?: string;
    caseId?: string;
    anonymizedText?: string;
  }) => string;
}

export function buildHouseStyleInstructionBlock(profile?: ClientHouseStyleProfile | null): string {
  if (!profile) return "";
  const lines = [
    ["Ügyfél neve", profile.officialName || profile.shortName],
    ["Rövid név", profile.shortName],
    ["Székhely / cím", profile.registeredSeat],
    ["Adószám", profile.taxNumber],
    ["Cégjegyzékszám / nyilvántartási szám", profile.registrationNumber],
    ["Kapcsolattartó", profile.contactPerson],
    ["Kapcsolattartó email", profile.contactEmail],
    ["Kapcsolattartó telefon", profile.contactPhone],
    ["Preferált nyelv", profile.preferredLanguage],
    ["Dokumentum nyelvi mód", profile.documentLanguageMode],
    ["Betűtípus", profile.fontFamily],
    ["Betűméret", profile.fontSize],
    ["Címsorok", profile.headingStyle],
    ["Számozás", profile.numberingStyle],
    ["Fejléc", profile.headerRequirements],
    ["Fejlécminta útvonala", profile.headerAssetPath],
    ["Fejlécminta leírása", profile.headerDescription],
    ["Arculati megjegyzések", profile.brandingNotes],
    ["Lábléc", profile.footerRequirements],
    ["Aláírási blokk", profile.signatureBlock],
    ["Kétnyelvűségi megjegyzések", profile.bilingualNotes],
    ["Fordítási követelmények", profile.translationNotes],
    ["Preferált hangnem", profile.preferredTone],
    ["Tiltott megfogalmazások", profile.prohibitedWording],
    ["Újrahasználható prompt instrukciók", profile.reusablePromptInstructions],
    ["Word formázási instrukciók", profile.wordFormattingInstructions],
    ["Külső AI instrukciók", profile.externalAiInstructions],
    ["Belső megjegyzések", profile.notes],
  ]
    .filter(([, value]) => Boolean(String(value || "").trim()))
    .map(([label, value]) => `- ${label}: ${String(value).trim()}`);

  if (lines.length === 0) return "";
  return [
    "ÜGYFÉL HOUSE STYLE / FORMÁZÁSI PROFIL:",
    ...lines,
    profile.headerAssetPath || profile.headerDescription || profile.brandingNotes
      ? "- Figyelmeztetés: a fejlécminta jelenleg referencia; automatikus Word-beillesztés csak akkor használható, ha az export modul ezt külön támogatja."
      : null,
  ].filter(Boolean).join("\n");
}

const GLOBAL_RULES = `Feladatod: ügyvédi munkairat előkészítése egy bemásolt vagy feltöltött szerződés alapján.

FONTOS SZABÁLYOK:
1. Magyar nyelven válaszolj.
2. Ne találj ki tényeket, iratokat, dátumokat, feleket vagy jogszabályi hivatkozásokat.
3. Ha valamely adat hiányzik, jelöld így: HIÁNYZIK / NEM ÁLLAPÍTHATÓ MEG / ELLENŐRIZENDŐ.
4. A placeholder-eket, kitöltetlen mezőket és ellentmondásokat külön emeld ki.
5. A válasz ügyvédi review-ra szánt munkairat legyen, ne végleges jogi állásfoglalás.
6. Külföldi jog esetén jelezd, ha helyi szakjogász bevonása szükséges.
7. Ne állítsd, hogy cégadatbázist, jogtárat, bírósági adatbázist vagy külső nyilvántartást ellenőriztél, ha erre nincs külön adat.
8. A kockázatokat gyakorlati, tárgyalási és szerződésmódosítási szempontból értékeld.
9. A kimenet legyen jól tagolt, ügyvéd által gyorsan áttekinthető.
10. Ahol lehet, használj táblázatokat.`;

function buildDocumentBlock(anonymizedText?: string): string {
  const trimmed = anonymizedText?.trim();
  if (trimmed) {
    return `DOKUMENTUMSZÖVEG:\n${trimmed}`;
  }
  return `DOKUMENTUMSZÖVEG:
[Nincs elérhető anonimizált dokumentumszöveg. A prompt szerkezeti vázként használható; a teljes szerződésszöveget külön be kell illeszteni.]`;
}

function buildHeader(docTitle?: string, caseId?: string): string {
  return [
    "Adminiculum — jogi munkaprompt",
    "",
    `Dokumentum: ${docTitle || "nem ismert"}`,
    `Ügy azonosító: ${caseId || "nem ismert"}`,
    "",
  ].join("\n");
}

function buildPromptBody(
  template: LegalPromptTemplate,
  input: { documentTitle?: string; caseId?: string; anonymizedText?: string; clientHouseStyle?: ClientHouseStyleProfile | null }
): string {
  const houseStyleBlock = buildHouseStyleInstructionBlock(input.clientHouseStyle);
  return [
    buildHeader(input.documentTitle, input.caseId),
    GLOBAL_RULES,
    houseStyleBlock ? `\n${houseStyleBlock}` : "",
    "",
    "Feladat:",
    template.buildBody(input),
    "",
    buildDocumentBlock(input.anonymizedText),
  ].join("\n");
}

export const LEGAL_PROMPT_CATALOG: LegalPromptTemplate[] = [
  // =====================================================================
  // P0 — Jogi elemzés
  // =====================================================================

  {
    id: "fullLegalAnalysis",
    label: "Teljes jogi elemzés",
    shortLabel: "Teljes elemzés",
    category: "analysis",
    description: "17 szekciós teljes ügyvédi munkairat.",
    requiresDocumentText: false,
    buildBody: () =>
      `Készíts teljes, ügyvédi review-ra szánt jogi elemzést a bemásolt szerződés alapján.

A kimenet legyen „JOGI ELEMZÉS – MUNKAIRAT" jellegű dokumentum, az alábbi fejezetekkel:

1. Az ügy / szerződés rövid összefoglalása
2. Feltöltött / vizsgált dokumentumok
3. Felhasznált joganyag és workspace snapshot
4. Vezetői összefoglaló
5. Tények és forrásuk
6. A szerződés fő jogi kérdései
7. Részletes szerződéses elemzés pontonként
8. Kockázati mátrix
9. Hiányzó vagy ellenőrizendő elemek
10. Ellenoldali érvek és válaszaink
11. Tárgyalási stratégia
12. Beilleszthető szerződéses szövegblokkok
13. Mit NE használjunk ellenőrzés nélkül
14. Dokumentum-összehasonlítás
15. Ügyvédi döntési pontok
16. Konkrét teendők
17. Végső összefoglaló

Ha valamely fejezet nem alkalmazható, ezt írd le röviden, ne találj ki tartalmat.`,
  },

  {
    id: "executiveSummary",
    label: "Vezetői összefoglaló",
    shortLabel: "Vezetői össz.",
    category: "analysis",
    description: "Partner / ügyvéd számára gyors döntési összefoglaló.",
    requiresDocumentText: false,
    buildBody: () =>
      `Készítsd el a „Vezetői összefoglaló" című fejezetet.

Kimeneti szerkezet:

1. Egy bevezető értékelő bekezdés:
- összesített kockázati szint: Alacsony / Közepes / Közepes-magas / Magas / Kritikus,
- aláírásra javasolt-e jelen formában,
- miért.

2. Legfontosabb megállapítások táblázata:
| Terület | Megállapítás | Értékelés |
|---|---|---|
(ismételd soronként)

Értékelési kategóriák:
ALACSONY KOCKÁZAT / KÖZEPES KOCKÁZAT / MAGAS KOCKÁZAT / KRITIKUS KOCKÁZAT / SÜRGŐSEN JAVÍTANDÓ / ELLENŐRIZENDŐ / ELFOGADHATÓ

3. Javasolt tárgyalási pozíció:
- kemény tárgyalási pontok,
- engedhető pontok,
- ügyfél döntését igénylő üzleti pontok.

4. Rövid végkövetkeztetés:
- mi a következő logikus lépés,
- mit kell pótolni vagy módosítani aláírás előtt.`,
  },

  {
    id: "riskMatrix",
    label: "Kockázati mátrix",
    shortLabel: "Kockázati mátrix",
    category: "risk",
    description: "Másolható kockázati táblázat súlyossággal és kezelési javaslattal.",
    requiresDocumentText: true,
    buildBody: () =>
      `Készítsd el a szerződés alapján a „Kockázati mátrix" című fejezetet.

Táblázat:
| Kockázat | Súlyosság | Valószínűség | Érintett pont | Javasolt kezelés |
|---|---|---|---|---|
(soronként)

Súlyosság:
Alacsony / Közepes / Magas / Kritikus

Valószínűség:
Alacsony / Közepes / Magas / Biztos vagy szöveg alapján fennáll

Keresd különösen:
- kitöltetlen placeholder-ek,
- hiányzó mellékletek,
- fizetési bizonytalanság,
- felmondási aszimmetria,
- felelősségkorlátozás,
- jogválasztás / joghatóság,
- IP,
- adatvédelem,
- audit/compliance,
- non-solicitation,
- harmadik fél szerződésére való hivatkozás,
- pénzügyi mechanizmusok, díjak, rebate, kötbér.

Csak a valóban fontos kockázatokat listázd.`,
  },

  {
    id: "detailedClauseAnalysis",
    label: "Részletes szerződéses elemzés",
    shortLabel: "Szerződéses elemzés",
    category: "risk",
    description: "Pontonkénti elemzés kockázattal és módosítási javaslattal.",
    requiresDocumentText: true,
    buildBody: () =>
      `Készítsd el a „Részletes szerződéses elemzés pontonként" című fejezetet.

Ne elemezz minden apró rendelkezést, csak a jogilag vagy üzletileg fontos pontokat.

Minden alpont kötelező szerkezete:

[7.x Cím – szerződéses pont megnevezése]

Mit mond a szerződés?
- Foglald össze röviden, mit tartalmaz az adott rendelkezés.

Jogi értékelés:
- Értékeld a képviselt fél szempontjából.
- Jelezd, ha egyoldalú, hiányos, ellentmondásos, túl széles, túl szigorú vagy elfogadható.
- Ha külföldi jogi kérdés, jelezd a szakjogász szükségességét.

Kockázat:
- [Alacsony] / [Közepes] / [Magas] / [Kritikus]
- Egy mondatban indokold.

Javasolt módosítás:
- Konkrétan írd le, mit kell módosítani.
- Ha lehet, jelezd, hogy külön szövegjavaslat szükséges-e.`,
  },

  {
    id: "missingData",
    label: "Hiányzó adatok / iratok",
    shortLabel: "Hiányzó adatok",
    category: "analysis",
    description: "Bekérési lista ügyfélnek vagy ellenoldalnak.",
    requiresDocumentText: true,
    buildBody: () =>
      `Készítsd el a „Hiányzó vagy ellenőrizendő elemek" című fejezetet.

Szerkezet:

1. Kötelezően pótlandó aláírás előtt
Minden elemnél írd:
- mit kell pótolni,
- hol hiányzik,
- miért fontos.

2. Ellenőrizendő dokumentumok
Minden elemnél írd:
- milyen irat kell,
- kitől kell bekérni,
- milyen kockázatot csökkent.

3. Ügyfél által eldöntendő / megadandó üzleti adatok

4. Táblázatos összefoglaló:
| Elem | Kategória | Forráshely | Miért szükséges? | Prioritás |
|---|---|---|---|---|
(soronként)

Prioritás:
SÜRGŐS / Magas / Közepes / Alacsony`,
  },

  {
    id: "negotiationStrategy",
    label: "Tárgyalási stratégia",
    shortLabel: "Tárgyalási strat.",
    category: "analysis",
    description: "Kemény pontok, engedhető pontok, ellenoldali érvek.",
    requiresDocumentText: true,
    buildBody: () =>
      `Készítsd el a „Tárgyalási stratégia" című fejezetet.

Szerkezet:

1. Kemény tárgyalási pontok
- mit kell kérni,
- miért,
- milyen kockázatot kezel.

2. Engedhető pontok
- miért engedhető,
- milyen feltétellel.

3. Ügyfél döntését igénylő pontok
- üzleti / pénzügyi / stratégiai kérdések.

4. Jogilag nem javasolt tárgyalás nélkül elfogadni
- jelentős kockázatú pontok.

Emellett készíts rövid táblázatot:
| Várható ellenoldali álláspont | Lehetséges válaszunk | Erősség | Bizonyítékigény |
|---|---|---|---|
(soronként)`,
  },

  {
    id: "insertableClauseBlocks",
    label: "Beilleszthető szövegblokkok",
    shortLabel: "Szövegblokkok",
    category: "modification",
    description: "Konkrét szerződésmódosítási szövegblokkok.",
    requiresDocumentText: true,
    buildBody: () =>
      `Készítsd el a „Beilleszthető szerződéses szövegblokkok" című fejezetet.

Minden szövegblokk előtt szerepeljen:
„FIGYELEM: Az alábbi szövegblokk munkairat-javaslat. Ügyvédi ellenőrzés és jóváhagyás után használható fel végleges szerződésbe."

Minden blokk szerkezete:

[12.x Cím – milyen rendelkezéshez kapcsolódik]

Mikor használható:
- rövid magyarázat.

Javasolt szöveg:
- szerződésbe illeszthető szöveg.

Ügyvédi ellenőrzési pont:
- mit kell még ellenőrizni,
- milyen adatot kell kitölteni,
- milyen jogi kérdés lehet nyitott.

Adj 4–8 legfontosabb blokkot.`,
  },

  {
    id: "lawyerHandoffSummary",
    label: "Ügyvédi leadási csomag összefoglaló",
    shortLabel: "Leadási csomag",
    category: "handoff",
    description: "Rövid csomagösszefoglaló ügyvédi review-hoz.",
    requiresDocumentText: false,
    buildBody: () =>
      `Készíts ügyvédi leadási csomag összefoglalót a szerződés és az elemzés alapján.

Szerkezet:

1. Mit kap az ügyvéd?
- eredeti dokumentum,
- anonimizált munkaszöveg,
- jogi elemzés,
- módosítási javaslatok,
- hiányzó adatok,
- döntési pontok.

2. Fő kockázatok röviden
Táblázat:
| Kockázat | Súlyosság | Javasolt ügyvédi döntés |
|---|---|---|
(soronként)

3. Mit módosítanánk?
Táblázat:
| Érintett pont | Probléma | Javasolt módosítás | Miért fontos? |
|---|---|---|---|
(soronként)

4. Ügyvédi döntési pontok
Számozott lista.

5. Előkészítő megjegyzés
Írd bele:
„Ez előkészítő munkairat; ügyvédi jóváhagyás nélkül nem minősül végleges jogi állásfoglalásnak."`,
  },

  // =====================================================================
  // EPISODE — Haladó elemzési epizódok
  // =====================================================================

  {
    id: "episodeContractSummary",
    label: "Az ügy / szerződés rövid összefoglalása",
    shortLabel: "Összefoglaló fejezet",
    category: "episode",
    description: "1. fejezet: ügy leírása, szerződés típusa, felek, tárgy, fő kötelezettségek.",
    requiresDocumentText: false,
    buildBody: () =>
      `Készítsd el az „Az ügy / szerződés rövid összefoglalása" című fejezetet.

Szerkezet:
1. Az ügy rövid leírása
2. A szerződés típusa
3. A felek
4. A szerződés tárgya
5. Főbb kötelezettségek
6. Különösen fontos szerződési elemek

A végén adj egy mondatos előzetes fő kockázat összefoglalót.`,
  },

  {
    id: "episodeDocumentsReviewed",
    label: "Feltöltött / vizsgált dokumentumok",
    shortLabel: "Dokumentumok táblázat",
    category: "episode",
    description: "2. fejezet: rendelkezésre álló és hiányzó dokumentumok táblázata.",
    requiresDocumentText: true,
    buildBody: () =>
      `Készítsd el a „Feltöltött / vizsgált dokumentumok" című fejezetet.

Táblázat:
| Dokumentum | Verzió / dátum | Szerepe az elemzésben | Megjegyzés |
|---|---|---|---|
(soronként)

Második táblázat:
| Hiányzó dokumentum | Hol hivatkozik rá a szerződés? | Miért fontos? | Teendő |
|---|---|---|---|
(soronként)

Ha csak egy dokumentum áll rendelkezésre, ezt írd le. Ne találj ki nem látott dokumentumot.`,
  },

  {
    id: "episodeLegalMaterialsSnapshot",
    label: "Felhasznált joganyag és workspace snapshot",
    shortLabel: "Joganyag snapshot",
    category: "episode",
    description: "3. fejezet: alkalmazandó jog, jogterületek, workspace állapot.",
    requiresDocumentText: false,
    buildBody: () =>
      `Készítsd el a „Felhasznált joganyag és workspace snapshot" című fejezetet.

Szerkezet:
1. Elsődlegesen alkalmazandó jog
2. Párhuzamosan releváns magyar jog / képviselt fél joga
3. Egyéb releváns jogterületek
4. Külföldi jogi figyelmeztetés
5. Workspace snapshot

Ne találj ki pontos jogszabályhelyet, ha nem biztos. Írd: ügyvédi ellenőrzést igényel.`,
  },

  {
    id: "episodeFactsAndSources",
    label: "Tények és forrásuk",
    shortLabel: "Tények táblázat",
    category: "episode",
    description: "5. fejezet: tények, források, bizonyítottság táblázattal.",
    requiresDocumentText: true,
    buildBody: () =>
      `Készítsd el a „Tények és forrásuk" című fejezetet.

Táblázat:
| Tény / szerződéses állítás | Forrás | Bizonyítottság | Megjegyzés |
|---|---|---|---|
(soronként)

Bizonyítottság:
Igazolt / Hiányzik / Ellentmondásos / Ellenőrizendő / Feltételezés / Nem állapítható meg`,
  },

  {
    id: "episodeKeyLegalQuestions",
    label: "Fő jogi kérdések",
    shortLabel: "Jogi kérdések",
    category: "episode",
    description: "6. fejezet: 8–15 számozott issue-spotting kérdés.",
    requiresDocumentText: true,
    buildBody: () =>
      `Készítsd el „A szerződés fő jogi kérdései" című fejezetet.

Adj 8–15 számozott kérdést.
Minden kérdés formája:
[Jogi kérdés?] – rövid magyarázat, hogy miért fontos.

Ne írj teljes elemzést, csak issue spottingot.`,
  },

  {
    id: "episodeCounterpartyArguments",
    label: "Ellenoldali érvek és válaszaink",
    shortLabel: "Ellenoldali érvek",
    category: "episode",
    description: "10. fejezet: várható ellenérvek, válaszok, erősség, bizonyítékigény.",
    requiresDocumentText: true,
    buildBody: () =>
      `Készítsd el az „Ellenoldali érvek és válaszaink" című fejezetet.

Táblázat:
| Várható ellenoldali álláspont | Lehetséges válaszunk | Erősség | Bizonyítékigény |
|---|---|---|---|
(soronként)

Ha egy ellenoldali érv feltételezés, jelöld: „feltételezés".`,
  },

  {
    id: "episodeDoNotUseWithoutReview",
    label: "Mit NE használjunk ellenőrzés nélkül",
    shortLabel: "Ne használd checklist",
    category: "episode",
    description: "13. fejezet: bizonytalan érvek, tényállítások, érzékeny javaslatok.",
    requiresDocumentText: false,
    buildBody: () =>
      `Készítsd el a „Mit NE használjunk ellenőrzés nélkül" című fejezetet.

Szerkezet:
1. Bizonytalan jogi érvek
2. Tényállítások, amelyek igazolásra szorulnak
3. Tárgyalásilag érzékeny módosítási javaslatok
4. Állítások, amelyek automatikusan NEM vihetők végleges iratba

Ez ügyvédi quality-control checklist legyen.`,
  },

  {
    id: "episodeDocumentComparison",
    label: "Dokumentum-összehasonlítás",
    shortLabel: "Dokumentum-összehasonlítás",
    category: "episode",
    description: "14. fejezet: verziók összehasonlítása vagy egyverziós megjegyzés.",
    requiresDocumentText: true,
    buildBody: () =>
      `Készítsd el a „Dokumentum-összehasonlítás" című fejezetet.

Ha csak egy szerződésverzió áll rendelkezésre, írd:
„Jelen elemzés során csak egyetlen szerződésverzió áll rendelkezésre. Összehasonlítható verzió nem áll rendelkezésre, ezért ez a fejezet nem alkalmazható."

Ha két verzió áll rendelkezésre, használd:
| Érintett pont | Eredeti szöveg lényege | Módosított szöveg lényege | Hatás | Javaslat |
|---|---|---|---|---|
(soronként)`,
  },

  {
    id: "episodeLawyerDecisionPoints",
    label: "Ügyvédi döntési pontok",
    shortLabel: "Döntési pontok",
    category: "episode",
    description: "15. fejezet: döntési kérdések és döntéshozók listája.",
    requiresDocumentText: false,
    buildBody: () =>
      `Készítsd el az „Ügyvédi döntési pontok" című fejezetet.

Minden pont formátuma:
[Konkrét döntési kérdés] → [Kinek kell döntenie?]

Döntéshozó kategóriák:
Ügyvéd / Ügyvéd + ügyfél / Ügyfél üzleti döntés / Ügyfél pénzügyi csapat / Adatvédelmi specialista / Külföldi szakjogász / Könyvelő vagy adótanácsadó / Technikai szakértő`,
  },

  {
    id: "episodeActionItems",
    label: "Konkrét teendők",
    shortLabel: "Teendők táblázat",
    category: "episode",
    description: "16. fejezet: teendők, felelősök, határidők, prioritás.",
    requiresDocumentText: false,
    buildBody: () =>
      `Készítsd el a „Konkrét teendők" című fejezetet.

Táblázat:
| Teendő | Felelős | Határidő | Prioritás |
|---|---|---|---|
(soronként)

Felelős:
Ügyvéd / Ügyvéd + ügyfél / Ügyfél vezetése / Ügyfél pénzügyi csapat / Ügyfél jogi csapat / Adatvédelmi specialista / Külföldi szakjogász / Technikai vagy IT csapat / Biztosító / Ellenoldal

Prioritás:
SÜRGŐS / Magas / Közepes / Alacsony`,
  },

  {
    id: "episodeFinalSummaryDisclaimer",
    label: "Végső összefoglaló és disclaimer",
    shortLabel: "Végső összefoglaló",
    category: "episode",
    description: "17. fejezet: értékelés, feltételek, figyelmeztetés.",
    requiresDocumentText: false,
    buildBody: () =>
      `Készítsd el a „Végső összefoglaló" című zárófejezetet.

Szerkezet:
1. Összesített értékelés:
ALÁÍRÁSRA JAVASOLT / ALÁÍRÁSRA NEM JAVASOLT / CSAK MÓDOSÍTÁSOKKAL JAVASOLT / TOVÁBBI ADATOK NÉLKÜL NEM ÍTÉLHETŐ MEG

2. Fő indokok
3. Aláírhatóság feltételei
4. Elfogadható / tárgyalható rendelkezések
5. Figyelmeztetés / disclaimer

Disclaimer:
„Ez a dokumentum ügyvédi munkairat. Nem minősül végleges jogi állásfoglalásnak vagy aláírásra kész szerződésnek. A benne szereplő javaslatok kizárólag ügyvédi ellenőrzés és jóváhagyás után használhatók fel."`,
  },

  // =====================================================================
  // P1 — További munkairatok
  // =====================================================================

  {
    id: "amendmentLog",
    label: "Módosítási napló",
    shortLabel: "Módosítási napló",
    category: "modification",
    description: "Módosított rendelkezések jegyzéke indoklással.",
    requiresDocumentText: false,
    buildBody: () =>
      `Készíts „Módosítási napló" munkairatot.

Táblázat:
| Érintett rendelkezés | Eredeti probléma | Javasolt módosítás | Indoklás | Kockázati hatás | Ügyvédi review megjegyzés |
|---|---|---|---|---|---|
(soronként)

A cél annak bemutatása, hogy mit változtatnánk a szerződésen és miért.`,
  },

  {
    id: "clientQuestionList",
    label: "Ügyfélnek küldhető kérdéslista",
    shortLabel: "Ügyfél kérdések",
    category: "communication",
    description: "Közérthető kérdések ügyfél számára.",
    requiresDocumentText: true,
    buildBody: () =>
      `Készíts ügyfélnek küldhető, közérthető kérdéslistát.

Szerkezet:

1. Rövid bevezető ügyfélbarát nyelven.

2. Kérdéslista táblázat:
| Kérdés | Miért szükséges? | Kapcsolódó szerződéses pont | Prioritás |
|---|---|---|
(soronként)

3. Bekérendő iratok listája.

4. Határidőjavaslat.

Ne használj túl technikai jogi nyelvet.`,
  },

  {
    id: "internalLawyerEmail",
    label: "Ügyvédnek küldhető belső email",
    shortLabel: "Belső email",
    category: "communication",
    description: "Rövid belső email-tervezet ügyvédi review-hoz.",
    requiresDocumentText: false,
    buildBody: () =>
      `Készíts rövid belső email-tervezetet az ügyvédnek a leadási csomag mellé.

Szerkezet:
- Tárgy
- Rövid bevezető
- Csatolt / előkészített anyagok listája
- 5 legfontosabb kockázat
- Ügyvédi döntést igénylő pontok
- Javasolt következő lépés

Hangnem: professzionális, rövid, belső irodai kommunikáció.`,
  },

  {
    id: "bilingualTwoColumnPrep",
    label: "Kétnyelvű / kéthasábos előkészítés",
    shortLabel: "Kéthasábos előkészítés",
    category: "formatting",
    description: "Munkaverzió kétnyelvű szerződéshez.",
    requiresDocumentText: true,
    buildBody: () =>
      `Készíts elő kétnyelvű / kéthasábos szerződéses munkaverziót.

Szerkezet:

1. Előkészítési szabályok

2. Táblázatos kéthasábos váz:
| Magyar szöveg | Angol szöveg | Megjegyzés |
|---|---|---|
(soronként)

3. Fordítási / megfeleltetési problémák listája

4. Ügyvédi kontrollpontok

Ne állítsd, hogy hiteles fordítást készítettél. Írd: „fordítási munkaverzió, ügyvédi és nyelvi kontroll szükséges".`,
  },

  {
    id: "houseStyleAdaptation",
    label: "Ügyfél house style alkalmazása",
    shortLabel: "House style",
    category: "formatting",
    description: "Szerződéses munkaszöveg ügyfél-stílusra alakítása.",
    requiresDocumentText: true,
    buildBody: () =>
      `Alakítsd át a szerződéses munkaszöveget ügyfél house style követelmények szerint.

Ha nincs megadva house style profil, először készíts ellenőrző listát:
| House style elem | Státusz | Megjegyzés |
|---|---|---|
(soronként)

Vizsgálandó:
- betűtípus,
- címsorok,
- számozás,
- definíciók,
- fejléc/lábléc,
- kétnyelvű szerkezet,
- aláírási blokk,
- mellékletek,
- hivatkozási stílus.

Ne találj ki ügyfélprofil-adatot.`,
  },

  {
    id: "wordCompatibleDraft",
    label: "Word-kompatibilis munkaverzió",
    shortLabel: "Word-verzió",
    category: "formatting",
    description: "Wordbe másolható szerződéses munkavázlat.",
    requiresDocumentText: true,
    buildBody: () =>
      `Készíts Word-kompatibilis szerződéses munkaverziót a bemásolt szövegből.

Cél:
- tiszta címsorok,
- rendezett számozás,
- egységes definíciók,
- Wordbe másolható szerkezet.

Kimenet:

1. Dokumentumstruktúra

2. Javított címsor- és számozási javaslat

3. Formázási hibák táblázata:
| Hiba | Hol látható? | Javasolt javítás |
|---|---|---|
(soronként)

4. Word-kompatibilis munkaszöveg-váz

Ne változtass érdemi jogi tartalmat külön jelzés nélkül.`,
  },

  {
    id: "redFlags",
    label: "Piros zászlók gyorslista",
    shortLabel: "Piros zászlók",
    category: "risk",
    description: "Legfontosabb kritikus kockázatok listája.",
    requiresDocumentText: true,
    buildBody: () =>
      `Készíts „Piros zászlók" gyorslistát ügyvéd számára.

Kimenet:
| # | Piros zászló | Miért kritikus? | Azonnali teendő |
|---|---|---|
(soronként)

Legfeljebb 10 pontot adj.
Csak a legfontosabbakat.`,
  },

  {
    id: "finalReviewChecklist",
    label: "Végleges review checklist",
    shortLabel: "Review checklist",
    category: "review",
    description: "Leadás előtti ellenőrzőlista.",
    requiresDocumentText: false,
    buildBody: () =>
      `Készíts végleges leadás előtti review checklistet.

Táblázat:
| Ellenőrzési pont | Státusz | Megjegyzés |
|---|---|---|
(soronként)

Ellenőrizd:
- eredeti dokumentum megvan-e,
- módosított változat megvan-e,
- jogi elemzés megvan-e,
- kockázati mátrix megvan-e,
- hiányzó adatok rendezve vannak-e,
- ügyvédi döntési pontok le vannak-e zárva,
- disclaimer szerepel-e,
- külföldi jogi/adatvédelmi kérdések specialistához kerültek-e.`,
  },
];

export function buildLegalPrompt(
  template: LegalPromptTemplate,
  input: { documentTitle?: string; caseId?: string; anonymizedText?: string; clientHouseStyle?: ClientHouseStyleProfile | null }
): string {
  return buildPromptBody(template, input);
}
