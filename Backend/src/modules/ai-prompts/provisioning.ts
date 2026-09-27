import type { PrismaClient } from '@prisma/client';
import { createPromptTemplateVersion, type PromptBlock } from './service';

/**
 * CANONICAL AI PROMPT CATALOGUE — RUNTIME PROVISIONING
 *
 * Root cause repaired: `AiPromptTemplateVersion` (the canonical runtime source
 * consumed by GET /ai-prompts/templates) had no provisioned active rows, so the
 * Case Workspace AI preparation prompt selector rendered empty.
 *
 * This module deterministically provisions the runtime catalogue from the
 * repository's existing static `LEGAL_PROMPT_CATALOG`
 * (Frontend/src/components/documents/legalPromptCatalog.ts). Phase-0 audit:
 *
 *   STATIC_TEMPLATE_COUNT   = 27
 *   SAFE_TO_PROVISION_COUNT = 27
 *   UNMAPPABLE_COUNT        = 0
 *
 * Every static entry maps without semantic guessing:
 *  - stableKey        <- template.id (stable business key)
 *  - title            <- template.label
 *  - description      <- template.description
 *  - legalWorkCategory<- deterministic category table (see CATEGORY_TO_LEGAL_WORK)
 *  - blocks           <- single deterministic block from template.buildBody({})
 *                        (every static body is a literal, input-independent string)
 *  - outputInstructions <- the static catalogue's existing GLOBAL_RULES verbatim
 *  - requiredContext/optionalContext <- derived from template.requiresDocumentText
 *  - verificationChecklist <- omitted so the service applies its canonical default
 *  - isActive          <- true
 *
 * No new fields are required: the seed shape is a subset of the existing
 * `AiPromptTemplateVersion` schema (SCHEMA_CHANGED=NO).
 *
 * Idempotency / preservation: a template is provisioned only when no row exists
 * for its `stableKey`. Re-running creates no duplicates and never overwrites or
 * deactivates runtime-authored/approved templates.
 */

/** Existing catalogue-wide rules reused verbatim from the static prompt builder. */
export const CANONICAL_AI_PROMPT_GLOBAL_RULES = "Feladatod: ügyvédi munkairat előkészítése egy bemásolt vagy feltöltött szerződés alapján.\n\nFONTOS SZABÁLYOK:\n1. Magyar nyelven válaszolj.\n2. Ne találj ki tényeket, iratokat, dátumokat, feleket vagy jogszabályi hivatkozásokat.\n3. Ha valamely adat hiányzik, jelöld így: HIÁNYZIK / NEM ÁLLAPÍTHATÓ MEG / ELLENŐRIZENDŐ.\n4. A placeholder-eket, kitöltetlen mezőket és ellentmondásokat külön emeld ki.\n5. A válasz ügyvédi review-ra szánt munkairat legyen, ne végleges jogi állásfoglalás.\n6. Külföldi jog esetén jelezd, ha helyi szakjogász bevonása szükséges.\n7. Ne állítsd, hogy cégadatbázist, jogtárat, bírósági adatbázist vagy külső nyilvántartást ellenőriztél, ha erre nincs külön adat.\n8. A kockázatokat gyakorlati, tárgyalási és szerződésmódosítási szempontból értékeld.\n9. A kimenet legyen jól tagolt, ügyvéd által gyorsan áttekinthető.\n10. Ahol lehet, használj táblázatokat.";

/** Deterministic static-category -> canonical legal work category mapping. */
export const CATEGORY_TO_LEGAL_WORK: Record<string, string> = {
  "analysis": "GENERAL_LEGAL_ANALYSIS",
  "risk": "CONTRACT_REVIEW",
  "modification": "CONTRACT_DRAFTING",
  "handoff": "CASE_SUMMARY",
  "communication": "CLIENT_EXPLANATION",
  "formatting": "CONTRACT_DRAFTING",
  "review": "CONTRACT_REVIEW",
  "episode": "GENERAL_LEGAL_ANALYSIS",
};

export type CanonicalAiPromptTemplateSeed = {
  /** Stable natural business key; also used for idempotent existence checks. */
  stableKey: string;
  title: string;
  description: string;
  /** Provenance only: the source category in the static catalogue. */
  sourceCategory: string;
  legalWorkCategory: string;
  requiresDocumentText: boolean;
  /** Deterministic static task body. */
  body: string;
};

/** Opaque provisioning actor; the column is a plain string, not a foreign key. */
export const SYSTEM_AI_PROMPT_PROVISIONING_ACTOR_ID = 'system:ai-prompt-catalogue-provisioning';

export const CANONICAL_AI_PROMPT_TEMPLATE_SEEDS: CanonicalAiPromptTemplateSeed[] = [
  {
    stableKey: "fullLegalAnalysis",
    title: "Teljes jogi elemzés",
    description: "17 szekciós teljes ügyvédi munkairat.",
    sourceCategory: "analysis",
    legalWorkCategory: "GENERAL_LEGAL_ANALYSIS",
    requiresDocumentText: false,
    body: "Készíts teljes, ügyvédi review-ra szánt jogi elemzést a bemásolt szerződés alapján.\n\nA kimenet legyen „JOGI ELEMZÉS – MUNKAIRAT\" jellegű dokumentum, az alábbi fejezetekkel:\n\n1. Az ügy / szerződés rövid összefoglalása\n2. Feltöltött / vizsgált dokumentumok\n3. Felhasznált joganyag és workspace snapshot\n4. Vezetői összefoglaló\n5. Tények és forrásuk\n6. A szerződés fő jogi kérdései\n7. Részletes szerződéses elemzés pontonként\n8. Kockázati mátrix\n9. Hiányzó vagy ellenőrizendő elemek\n10. Ellenoldali érvek és válaszaink\n11. Tárgyalási stratégia\n12. Beilleszthető szerződéses szövegblokkok\n13. Mit NE használjunk ellenőrzés nélkül\n14. Dokumentum-összehasonlítás\n15. Ügyvédi döntési pontok\n16. Konkrét teendők\n17. Végső összefoglaló\n\nHa valamely fejezet nem alkalmazható, ezt írd le röviden, ne találj ki tartalmat.",
  },
  {
    stableKey: "executiveSummary",
    title: "Vezetői összefoglaló",
    description: "Partner / ügyvéd számára gyors döntési összefoglaló.",
    sourceCategory: "analysis",
    legalWorkCategory: "GENERAL_LEGAL_ANALYSIS",
    requiresDocumentText: false,
    body: "Készítsd el a „Vezetői összefoglaló\" című fejezetet.\n\nKimeneti szerkezet:\n\n1. Egy bevezető értékelő bekezdés:\n- összesített kockázati szint: Alacsony / Közepes / Közepes-magas / Magas / Kritikus,\n- aláírásra javasolt-e jelen formában,\n- miért.\n\n2. Legfontosabb megállapítások táblázata:\n| Terület | Megállapítás | Értékelés |\n|---|---|---|\n(ismételd soronként)\n\nÉrtékelési kategóriák:\nALACSONY KOCKÁZAT / KÖZEPES KOCKÁZAT / MAGAS KOCKÁZAT / KRITIKUS KOCKÁZAT / SÜRGŐSEN JAVÍTANDÓ / ELLENŐRIZENDŐ / ELFOGADHATÓ\n\n3. Javasolt tárgyalási pozíció:\n- kemény tárgyalási pontok,\n- engedhető pontok,\n- ügyfél döntését igénylő üzleti pontok.\n\n4. Rövid végkövetkeztetés:\n- mi a következő logikus lépés,\n- mit kell pótolni vagy módosítani aláírás előtt.",
  },
  {
    stableKey: "riskMatrix",
    title: "Kockázati mátrix",
    description: "Másolható kockázati táblázat súlyossággal és kezelési javaslattal.",
    sourceCategory: "risk",
    legalWorkCategory: "CONTRACT_REVIEW",
    requiresDocumentText: true,
    body: "Készítsd el a szerződés alapján a „Kockázati mátrix\" című fejezetet.\n\nTáblázat:\n| Kockázat | Súlyosság | Valószínűség | Érintett pont | Javasolt kezelés |\n|---|---|---|---|---|\n(soronként)\n\nSúlyosság:\nAlacsony / Közepes / Magas / Kritikus\n\nValószínűség:\nAlacsony / Közepes / Magas / Biztos vagy szöveg alapján fennáll\n\nKeresd különösen:\n- kitöltetlen placeholder-ek,\n- hiányzó mellékletek,\n- fizetési bizonytalanság,\n- felmondási aszimmetria,\n- felelősségkorlátozás,\n- jogválasztás / joghatóság,\n- IP,\n- adatvédelem,\n- audit/compliance,\n- non-solicitation,\n- harmadik fél szerződésére való hivatkozás,\n- pénzügyi mechanizmusok, díjak, rebate, kötbér.\n\nCsak a valóban fontos kockázatokat listázd.",
  },
  {
    stableKey: "detailedClauseAnalysis",
    title: "Részletes szerződéses elemzés",
    description: "Pontonkénti elemzés kockázattal és módosítási javaslattal.",
    sourceCategory: "risk",
    legalWorkCategory: "CONTRACT_REVIEW",
    requiresDocumentText: true,
    body: "Készítsd el a „Részletes szerződéses elemzés pontonként\" című fejezetet.\n\nNe elemezz minden apró rendelkezést, csak a jogilag vagy üzletileg fontos pontokat.\n\nMinden alpont kötelező szerkezete:\n\n[7.x Cím – szerződéses pont megnevezése]\n\nMit mond a szerződés?\n- Foglald össze röviden, mit tartalmaz az adott rendelkezés.\n\nJogi értékelés:\n- Értékeld a képviselt fél szempontjából.\n- Jelezd, ha egyoldalú, hiányos, ellentmondásos, túl széles, túl szigorú vagy elfogadható.\n- Ha külföldi jogi kérdés, jelezd a szakjogász szükségességét.\n\nKockázat:\n- [Alacsony] / [Közepes] / [Magas] / [Kritikus]\n- Egy mondatban indokold.\n\nJavasolt módosítás:\n- Konkrétan írd le, mit kell módosítani.\n- Ha lehet, jelezd, hogy külön szövegjavaslat szükséges-e.",
  },
  {
    stableKey: "missingData",
    title: "Hiányzó adatok / iratok",
    description: "Bekérési lista ügyfélnek vagy ellenoldalnak.",
    sourceCategory: "analysis",
    legalWorkCategory: "GENERAL_LEGAL_ANALYSIS",
    requiresDocumentText: true,
    body: "Készítsd el a „Hiányzó vagy ellenőrizendő elemek\" című fejezetet.\n\nSzerkezet:\n\n1. Kötelezően pótlandó aláírás előtt\nMinden elemnél írd:\n- mit kell pótolni,\n- hol hiányzik,\n- miért fontos.\n\n2. Ellenőrizendő dokumentumok\nMinden elemnél írd:\n- milyen irat kell,\n- kitől kell bekérni,\n- milyen kockázatot csökkent.\n\n3. Ügyfél által eldöntendő / megadandó üzleti adatok\n\n4. Táblázatos összefoglaló:\n| Elem | Kategória | Forráshely | Miért szükséges? | Prioritás |\n|---|---|---|---|---|\n(soronként)\n\nPrioritás:\nSÜRGŐS / Magas / Közepes / Alacsony",
  },
  {
    stableKey: "negotiationStrategy",
    title: "Tárgyalási stratégia",
    description: "Kemény pontok, engedhető pontok, ellenoldali érvek.",
    sourceCategory: "analysis",
    legalWorkCategory: "GENERAL_LEGAL_ANALYSIS",
    requiresDocumentText: true,
    body: "Készítsd el a „Tárgyalási stratégia\" című fejezetet.\n\nSzerkezet:\n\n1. Kemény tárgyalási pontok\n- mit kell kérni,\n- miért,\n- milyen kockázatot kezel.\n\n2. Engedhető pontok\n- miért engedhető,\n- milyen feltétellel.\n\n3. Ügyfél döntését igénylő pontok\n- üzleti / pénzügyi / stratégiai kérdések.\n\n4. Jogilag nem javasolt tárgyalás nélkül elfogadni\n- jelentős kockázatú pontok.\n\nEmellett készíts rövid táblázatot:\n| Várható ellenoldali álláspont | Lehetséges válaszunk | Erősség | Bizonyítékigény |\n|---|---|---|---|\n(soronként)",
  },
  {
    stableKey: "insertableClauseBlocks",
    title: "Beilleszthető szövegblokkok",
    description: "Konkrét szerződésmódosítási szövegblokkok.",
    sourceCategory: "modification",
    legalWorkCategory: "CONTRACT_DRAFTING",
    requiresDocumentText: true,
    body: "Készítsd el a „Beilleszthető szerződéses szövegblokkok\" című fejezetet.\n\nMinden szövegblokk előtt szerepeljen:\n„FIGYELEM: Az alábbi szövegblokk munkairat-javaslat. Ügyvédi ellenőrzés és jóváhagyás után használható fel végleges szerződésbe.\"\n\nMinden blokk szerkezete:\n\n[12.x Cím – milyen rendelkezéshez kapcsolódik]\n\nMikor használható:\n- rövid magyarázat.\n\nJavasolt szöveg:\n- szerződésbe illeszthető szöveg.\n\nÜgyvédi ellenőrzési pont:\n- mit kell még ellenőrizni,\n- milyen adatot kell kitölteni,\n- milyen jogi kérdés lehet nyitott.\n\nAdj 4–8 legfontosabb blokkot.",
  },
  {
    stableKey: "lawyerHandoffSummary",
    title: "Ügyvédi leadási csomag összefoglaló",
    description: "Rövid csomagösszefoglaló ügyvédi review-hoz.",
    sourceCategory: "handoff",
    legalWorkCategory: "CASE_SUMMARY",
    requiresDocumentText: false,
    body: "Készíts ügyvédi leadási csomag összefoglalót a szerződés és az elemzés alapján.\n\nSzerkezet:\n\n1. Mit kap az ügyvéd?\n- eredeti dokumentum,\n- anonimizált munkaszöveg,\n- jogi elemzés,\n- módosítási javaslatok,\n- hiányzó adatok,\n- döntési pontok.\n\n2. Fő kockázatok röviden\nTáblázat:\n| Kockázat | Súlyosság | Javasolt ügyvédi döntés |\n|---|---|---|\n(soronként)\n\n3. Mit módosítanánk?\nTáblázat:\n| Érintett pont | Probléma | Javasolt módosítás | Miért fontos? |\n|---|---|---|---|\n(soronként)\n\n4. Ügyvédi döntési pontok\nSzámozott lista.\n\n5. Előkészítő megjegyzés\nÍrd bele:\n„Ez előkészítő munkairat; ügyvédi jóváhagyás nélkül nem minősül végleges jogi állásfoglalásnak.\"",
  },
  {
    stableKey: "episodeContractSummary",
    title: "Az ügy / szerződés rövid összefoglalása",
    description: "1. fejezet: ügy leírása, szerződés típusa, felek, tárgy, fő kötelezettségek.",
    sourceCategory: "episode",
    legalWorkCategory: "GENERAL_LEGAL_ANALYSIS",
    requiresDocumentText: false,
    body: "Készítsd el az „Az ügy / szerződés rövid összefoglalása\" című fejezetet.\n\nSzerkezet:\n1. Az ügy rövid leírása\n2. A szerződés típusa\n3. A felek\n4. A szerződés tárgya\n5. Főbb kötelezettségek\n6. Különösen fontos szerződési elemek\n\nA végén adj egy mondatos előzetes fő kockázat összefoglalót.",
  },
  {
    stableKey: "episodeDocumentsReviewed",
    title: "Feltöltött / vizsgált dokumentumok",
    description: "2. fejezet: rendelkezésre álló és hiányzó dokumentumok táblázata.",
    sourceCategory: "episode",
    legalWorkCategory: "GENERAL_LEGAL_ANALYSIS",
    requiresDocumentText: true,
    body: "Készítsd el a „Feltöltött / vizsgált dokumentumok\" című fejezetet.\n\nTáblázat:\n| Dokumentum | Verzió / dátum | Szerepe az elemzésben | Megjegyzés |\n|---|---|---|---|\n(soronként)\n\nMásodik táblázat:\n| Hiányzó dokumentum | Hol hivatkozik rá a szerződés? | Miért fontos? | Teendő |\n|---|---|---|---|\n(soronként)\n\nHa csak egy dokumentum áll rendelkezésre, ezt írd le. Ne találj ki nem látott dokumentumot.",
  },
  {
    stableKey: "episodeLegalMaterialsSnapshot",
    title: "Felhasznált joganyag és workspace snapshot",
    description: "3. fejezet: alkalmazandó jog, jogterületek, workspace állapot.",
    sourceCategory: "episode",
    legalWorkCategory: "GENERAL_LEGAL_ANALYSIS",
    requiresDocumentText: false,
    body: "Készítsd el a „Felhasznált joganyag és workspace snapshot\" című fejezetet.\n\nSzerkezet:\n1. Elsődlegesen alkalmazandó jog\n2. Párhuzamosan releváns magyar jog / képviselt fél joga\n3. Egyéb releváns jogterületek\n4. Külföldi jogi figyelmeztetés\n5. Workspace snapshot\n\nNe találj ki pontos jogszabályhelyet, ha nem biztos. Írd: ügyvédi ellenőrzést igényel.",
  },
  {
    stableKey: "episodeFactsAndSources",
    title: "Tények és forrásuk",
    description: "5. fejezet: tények, források, bizonyítottság táblázattal.",
    sourceCategory: "episode",
    legalWorkCategory: "GENERAL_LEGAL_ANALYSIS",
    requiresDocumentText: true,
    body: "Készítsd el a „Tények és forrásuk\" című fejezetet.\n\nTáblázat:\n| Tény / szerződéses állítás | Forrás | Bizonyítottság | Megjegyzés |\n|---|---|---|---|\n(soronként)\n\nBizonyítottság:\nIgazolt / Hiányzik / Ellentmondásos / Ellenőrizendő / Feltételezés / Nem állapítható meg",
  },
  {
    stableKey: "episodeKeyLegalQuestions",
    title: "Fő jogi kérdések",
    description: "6. fejezet: 8–15 számozott issue-spotting kérdés.",
    sourceCategory: "episode",
    legalWorkCategory: "GENERAL_LEGAL_ANALYSIS",
    requiresDocumentText: true,
    body: "Készítsd el „A szerződés fő jogi kérdései\" című fejezetet.\n\nAdj 8–15 számozott kérdést.\nMinden kérdés formája:\n[Jogi kérdés?] – rövid magyarázat, hogy miért fontos.\n\nNe írj teljes elemzést, csak issue spottingot.",
  },
  {
    stableKey: "episodeCounterpartyArguments",
    title: "Ellenoldali érvek és válaszaink",
    description: "10. fejezet: várható ellenérvek, válaszok, erősség, bizonyítékigény.",
    sourceCategory: "episode",
    legalWorkCategory: "GENERAL_LEGAL_ANALYSIS",
    requiresDocumentText: true,
    body: "Készítsd el az „Ellenoldali érvek és válaszaink\" című fejezetet.\n\nTáblázat:\n| Várható ellenoldali álláspont | Lehetséges válaszunk | Erősség | Bizonyítékigény |\n|---|---|---|---|\n(soronként)\n\nHa egy ellenoldali érv feltételezés, jelöld: „feltételezés\".",
  },
  {
    stableKey: "episodeDoNotUseWithoutReview",
    title: "Mit NE használjunk ellenőrzés nélkül",
    description: "13. fejezet: bizonytalan érvek, tényállítások, érzékeny javaslatok.",
    sourceCategory: "episode",
    legalWorkCategory: "GENERAL_LEGAL_ANALYSIS",
    requiresDocumentText: false,
    body: "Készítsd el a „Mit NE használjunk ellenőrzés nélkül\" című fejezetet.\n\nSzerkezet:\n1. Bizonytalan jogi érvek\n2. Tényállítások, amelyek igazolásra szorulnak\n3. Tárgyalásilag érzékeny módosítási javaslatok\n4. Állítások, amelyek automatikusan NEM vihetők végleges iratba\n\nEz ügyvédi quality-control checklist legyen.",
  },
  {
    stableKey: "episodeDocumentComparison",
    title: "Dokumentum-összehasonlítás",
    description: "14. fejezet: verziók összehasonlítása vagy egyverziós megjegyzés.",
    sourceCategory: "episode",
    legalWorkCategory: "GENERAL_LEGAL_ANALYSIS",
    requiresDocumentText: true,
    body: "Készítsd el a „Dokumentum-összehasonlítás\" című fejezetet.\n\nHa csak egy szerződésverzió áll rendelkezésre, írd:\n„Jelen elemzés során csak egyetlen szerződésverzió áll rendelkezésre. Összehasonlítható verzió nem áll rendelkezésre, ezért ez a fejezet nem alkalmazható.\"\n\nHa két verzió áll rendelkezésre, használd:\n| Érintett pont | Eredeti szöveg lényege | Módosított szöveg lényege | Hatás | Javaslat |\n|---|---|---|---|---|\n(soronként)",
  },
  {
    stableKey: "episodeLawyerDecisionPoints",
    title: "Ügyvédi döntési pontok",
    description: "15. fejezet: döntési kérdések és döntéshozók listája.",
    sourceCategory: "episode",
    legalWorkCategory: "GENERAL_LEGAL_ANALYSIS",
    requiresDocumentText: false,
    body: "Készítsd el az „Ügyvédi döntési pontok\" című fejezetet.\n\nMinden pont formátuma:\n[Konkrét döntési kérdés] → [Kinek kell döntenie?]\n\nDöntéshozó kategóriák:\nÜgyvéd / Ügyvéd + ügyfél / Ügyfél üzleti döntés / Ügyfél pénzügyi csapat / Adatvédelmi specialista / Külföldi szakjogász / Könyvelő vagy adótanácsadó / Technikai szakértő",
  },
  {
    stableKey: "episodeActionItems",
    title: "Konkrét teendők",
    description: "16. fejezet: teendők, felelősök, határidők, prioritás.",
    sourceCategory: "episode",
    legalWorkCategory: "GENERAL_LEGAL_ANALYSIS",
    requiresDocumentText: false,
    body: "Készítsd el a „Konkrét teendők\" című fejezetet.\n\nTáblázat:\n| Teendő | Felelős | Határidő | Prioritás |\n|---|---|---|---|\n(soronként)\n\nFelelős:\nÜgyvéd / Ügyvéd + ügyfél / Ügyfél vezetése / Ügyfél pénzügyi csapat / Ügyfél jogi csapat / Adatvédelmi specialista / Külföldi szakjogász / Technikai vagy IT csapat / Biztosító / Ellenoldal\n\nPrioritás:\nSÜRGŐS / Magas / Közepes / Alacsony",
  },
  {
    stableKey: "episodeFinalSummaryDisclaimer",
    title: "Végső összefoglaló és disclaimer",
    description: "17. fejezet: értékelés, feltételek, figyelmeztetés.",
    sourceCategory: "episode",
    legalWorkCategory: "GENERAL_LEGAL_ANALYSIS",
    requiresDocumentText: false,
    body: "Készítsd el a „Végső összefoglaló\" című zárófejezetet.\n\nSzerkezet:\n1. Összesített értékelés:\nALÁÍRÁSRA JAVASOLT / ALÁÍRÁSRA NEM JAVASOLT / CSAK MÓDOSÍTÁSOKKAL JAVASOLT / TOVÁBBI ADATOK NÉLKÜL NEM ÍTÉLHETŐ MEG\n\n2. Fő indokok\n3. Aláírhatóság feltételei\n4. Elfogadható / tárgyalható rendelkezések\n5. Figyelmeztetés / disclaimer\n\nDisclaimer:\n„Ez a dokumentum ügyvédi munkairat. Nem minősül végleges jogi állásfoglalásnak vagy aláírásra kész szerződésnek. A benne szereplő javaslatok kizárólag ügyvédi ellenőrzés és jóváhagyás után használhatók fel.\"",
  },
  {
    stableKey: "amendmentLog",
    title: "Módosítási napló",
    description: "Módosított rendelkezések jegyzéke indoklással.",
    sourceCategory: "modification",
    legalWorkCategory: "CONTRACT_DRAFTING",
    requiresDocumentText: false,
    body: "Készíts „Módosítási napló\" munkairatot.\n\nTáblázat:\n| Érintett rendelkezés | Eredeti probléma | Javasolt módosítás | Indoklás | Kockázati hatás | Ügyvédi review megjegyzés |\n|---|---|---|---|---|---|\n(soronként)\n\nA cél annak bemutatása, hogy mit változtatnánk a szerződésen és miért.",
  },
  {
    stableKey: "clientQuestionList",
    title: "Ügyfélnek küldhető kérdéslista",
    description: "Közérthető kérdések ügyfél számára.",
    sourceCategory: "communication",
    legalWorkCategory: "CLIENT_EXPLANATION",
    requiresDocumentText: true,
    body: "Készíts ügyfélnek küldhető, közérthető kérdéslistát.\n\nSzerkezet:\n\n1. Rövid bevezető ügyfélbarát nyelven.\n\n2. Kérdéslista táblázat:\n| Kérdés | Miért szükséges? | Kapcsolódó szerződéses pont | Prioritás |\n|---|---|---|\n(soronként)\n\n3. Bekérendő iratok listája.\n\n4. Határidőjavaslat.\n\nNe használj túl technikai jogi nyelvet.",
  },
  {
    stableKey: "internalLawyerEmail",
    title: "Ügyvédnek küldhető belső email",
    description: "Rövid belső email-tervezet ügyvédi review-hoz.",
    sourceCategory: "communication",
    legalWorkCategory: "CLIENT_EXPLANATION",
    requiresDocumentText: false,
    body: "Készíts rövid belső email-tervezetet az ügyvédnek a leadási csomag mellé.\n\nSzerkezet:\n- Tárgy\n- Rövid bevezető\n- Csatolt / előkészített anyagok listája\n- 5 legfontosabb kockázat\n- Ügyvédi döntést igénylő pontok\n- Javasolt következő lépés\n\nHangnem: professzionális, rövid, belső irodai kommunikáció.",
  },
  {
    stableKey: "bilingualTwoColumnPrep",
    title: "Kétnyelvű / kéthasábos előkészítés",
    description: "Munkaverzió kétnyelvű szerződéshez.",
    sourceCategory: "formatting",
    legalWorkCategory: "CONTRACT_DRAFTING",
    requiresDocumentText: true,
    body: "Készíts elő kétnyelvű / kéthasábos szerződéses munkaverziót.\n\nSzerkezet:\n\n1. Előkészítési szabályok\n\n2. Táblázatos kéthasábos váz:\n| Magyar szöveg | Angol szöveg | Megjegyzés |\n|---|---|---|\n(soronként)\n\n3. Fordítási / megfeleltetési problémák listája\n\n4. Ügyvédi kontrollpontok\n\nNe állítsd, hogy hiteles fordítást készítettél. Írd: „fordítási munkaverzió, ügyvédi és nyelvi kontroll szükséges\".",
  },
  {
    stableKey: "houseStyleAdaptation",
    title: "Ügyfél dokumentumstílus alkalmazása",
    description: "Szerződéses munkaszöveg ügyfél-stílusra alakítása.",
    sourceCategory: "formatting",
    legalWorkCategory: "CONTRACT_DRAFTING",
    requiresDocumentText: true,
    body: "Alakítsd át a szerződéses munkaszöveget ügyfél dokumentumstílus követelmények szerint.\n\nHa nincs megadva dokumentumstílus profil, először készíts ellenőrző listát:\n| Dokumentumstílus elem | Státusz | Megjegyzés |\n|---|---|---|\n(soronként)\n\nVizsgálandó:\n- betűtípus,\n- címsorok,\n- számozás,\n- definíciók,\n- fejléc/lábléc,\n- kétnyelvű szerkezet,\n- aláírási blokk,\n- mellékletek,\n- hivatkozási stílus.\n\nNe találj ki ügyfélprofil-adatot.",
  },
  {
    stableKey: "wordCompatibleDraft",
    title: "Word-kompatibilis munkaverzió",
    description: "Wordbe másolható szerződéses munkavázlat.",
    sourceCategory: "formatting",
    legalWorkCategory: "CONTRACT_DRAFTING",
    requiresDocumentText: true,
    body: "Készíts Word-kompatibilis szerződéses munkaverziót a bemásolt szövegből.\n\nCél:\n- tiszta címsorok,\n- rendezett számozás,\n- egységes definíciók,\n- Wordbe másolható szerkezet.\n\nKimenet:\n\n1. Dokumentumstruktúra\n\n2. Javított címsor- és számozási javaslat\n\n3. Formázási hibák táblázata:\n| Hiba | Hol látható? | Javasolt javítás |\n|---|---|---|\n(soronként)\n\n4. Word-kompatibilis munkaszöveg-váz\n\nNe változtass érdemi jogi tartalmat külön jelzés nélkül.",
  },
  {
    stableKey: "redFlags",
    title: "Piros zászlók gyorslista",
    description: "Legfontosabb kritikus kockázatok listája.",
    sourceCategory: "risk",
    legalWorkCategory: "CONTRACT_REVIEW",
    requiresDocumentText: true,
    body: "Készíts „Piros zászlók\" gyorslistát ügyvéd számára.\n\nKimenet:\n| # | Piros zászló | Miért kritikus? | Azonnali teendő |\n|---|---|---|\n(soronként)\n\nLegfeljebb 10 pontot adj.\nCsak a legfontosabbakat.",
  },
  {
    stableKey: "finalReviewChecklist",
    title: "Végleges review checklist",
    description: "Leadás előtti ellenőrzőlista.",
    sourceCategory: "review",
    legalWorkCategory: "CONTRACT_REVIEW",
    requiresDocumentText: false,
    body: "Készíts végleges leadás előtti review checklistet.\n\nTáblázat:\n| Ellenőrzési pont | Státusz | Megjegyzés |\n|---|---|---|\n(soronként)\n\nEllenőrizd:\n- eredeti dokumentum megvan-e,\n- módosított változat megvan-e,\n- jogi elemzés megvan-e,\n- kockázati mátrix megvan-e,\n- hiányzó adatok rendezve vannak-e,\n- ügyvédi döntési pontok le vannak-e zárva,\n- disclaimer szerepel-e,\n- külföldi jogi/adatvédelmi kérdések specialistához kerültek-e.",
  },
];

export type ProvisionAiPromptTemplatesResult = {
  total: number;
  created: number;
  skipped: number;
};

/**
 * Unique-constraint guard for concurrent boots: if two instances provision the
 * same \`stableKey\` simultaneously, the canonical \`@@unique([stableKey, version])\`
 * constraint rejects one create. That row now exists (owned by the winner), so
 * the loser treats it as preserved instead of failing the whole startup batch.
 */
function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002');
}

function toBlocks(seed: CanonicalAiPromptTemplateSeed): PromptBlock[] {
  return [{ key: 'task', label: 'Feladat', content: seed.body }];
}

function toRequiredContext(seed: CanonicalAiPromptTemplateSeed): string[] {
  return seed.requiresDocumentText ? ['selectedDocuments'] : [];
}

function toOptionalContext(seed: CanonicalAiPromptTemplateSeed): string[] {
  return seed.requiresDocumentText
    ? ['lawyerInstruction', 'additionalContext']
    : ['selectedDocuments', 'lawyerInstruction', 'additionalContext'];
}

/**
 * Idempotently provisions the canonical AI prompt catalogue.
 *
 * Additive and fail-safe: existing rows are detected by `stableKey` and left
 * byte-for-byte untouched (no overwrite, no deactivation, no version bump).
 */
export async function provisionCanonicalAiPromptTemplates(
  db: PrismaClient,
  actorUserId: string = SYSTEM_AI_PROMPT_PROVISIONING_ACTOR_ID,
): Promise<ProvisionAiPromptTemplatesResult> {
  let created = 0;
  let skipped = 0;

  for (const seed of CANONICAL_AI_PROMPT_TEMPLATE_SEEDS) {
    const existing = await db.aiPromptTemplateVersion.findFirst({
      where: { stableKey: seed.stableKey },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    try {
      await createPromptTemplateVersion({
        stableKey: seed.stableKey,
        title: seed.title,
        description: seed.description,
        legalWorkCategory: seed.legalWorkCategory,
        caseTypeKeys: [],
        workPackageModuleKeys: [],
        taskTypes: [],
        blocks: toBlocks(seed),
        requiredContext: toRequiredContext(seed),
        optionalContext: toOptionalContext(seed),
        outputInstructions: CANONICAL_AI_PROMPT_GLOBAL_RULES,
        isActive: true,
        createdById: actorUserId,
      }, db);
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      skipped += 1;
      continue;
    }

    created += 1;
  }

  return { total: CANONICAL_AI_PROMPT_TEMPLATE_SEEDS.length, created, skipped };
}
