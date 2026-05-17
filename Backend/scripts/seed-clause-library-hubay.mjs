/**
 * Seed Script: Clause Library — Hubay ADASVETEL v1
 *
 * Scope (Patch 4H.1):
 * - Create/reuse Hubay lawyer profile
 * - Seed first-pass ADASVETEL clauses grouped into 6 families
 * - Keep Trugly profile/clauses untouched
 *
 * Run: node scripts/seed-clause-library-hubay.mjs
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const HUBAY_PROFILE = {
  lawyerName: 'Dr. Hubay',
  lawyerEmail: 'hubay@example.hu',
  preferredNumbering: 'DECIMAL',
  defaultClosingText:
    'Jelen szerződést a felek elolvasás és értelmezés után, mint akaratukkal mindenben egyezőt írják alá.',
  styleNotes:
    'Hubay adásvételi alapprofil v1 — gyakorlati fókusz: fizetési ütemezés, bejegyzési együttműködés, birtokbaadási kontroll.',
};

const HUBAY_CLAUSES = [
  // ---------------------------------------------------------------------------
  // 1) PARTY (FAMILY)
  // ---------------------------------------------------------------------------
  {
    title: 'Több vevő tulajdoni arányainak rögzítése',
    slug: 'hubay-tobb-vevo-tulajdoni-arany',
    summary: 'Több vevő esetén a szerzés arányát és felelősségi arányát rögzíti.',
    body: `Amennyiben a Vevői oldalon egynél több személy szerepel, a Felek rögzítik, hogy a tulajdonszerzés aránya az alábbiak szerint alakul: [VEVOI_TULAJDONI_HANYADOK]. A Vevők kijelentik, hogy a jelen szerződésből eredő fizetési és együttműködési kötelezettségeik a rögzített arányok szerint terhelik őket.`,
    contractType: 'ADASVETEL',
    clauseKind: 'RECOMMENDED',
    representedSide: 'NEUTRAL',
    category: 'PARTY',
    keywords: ['több vevő', 'tulajdoni hányad', 'megosztás', 'szerzési arány'],
    triggerConditions: [{ field: 'buyerCount', operator: 'gt', value: 1 }],
    sortOrder: 10,
    sourceType: 'STANDARD',
  },

  // ---------------------------------------------------------------------------
  // 2) PRICE (FAMILY)
  // ---------------------------------------------------------------------------
  {
    title: 'Vételár-részletek teljesítési sorrendje',
    slug: 'hubay-vetelar-reszletek-teljesitesi-sorrendje',
    summary: 'A vételár-részletek sorrendiségét és beszámítását tisztázza.',
    body: `A Felek rögzítik, hogy a vételár-részletek teljesítése a jelen szerződésben meghatározott sorrendben történik. A korábban teljesített részletek a teljes vételárba beszámítanak. A teljesítések elszámolásának alapja a jóváírás napja.`,
    contractType: 'ADASVETEL',
    clauseKind: 'RECOMMENDED',
    representedSide: 'NEUTRAL',
    category: 'PRICE',
    keywords: ['vételár', 'részlet', 'jóváírás', 'beszámítás', 'sorrend'],
    triggerConditions: [],
    sortOrder: 20,
    sourceType: 'STANDARD',
  },
  {
    title: 'Visszatartott vételárrész a bejegyzési feltételhez kötve',
    slug: 'hubay-visszatartott-vetelarresz-bejegyzeshez-kotve',
    summary: 'A végső vételárrész kiadását bejegyzési feltételhez köti.',
    body: `A Felek megállapodnak, hogy a vételár [VISSZATARTOTT_OSSZEG] Ft összegű része visszatartásra kerül, és kizárólag a tulajdonjog-bejegyzéshez szükséges okiratok hiánytalan rendelkezésre állása esetén kerül kifizetésre az Eladó részére.`,
    contractType: 'ADASVETEL',
    clauseKind: 'SPECIAL',
    representedSide: 'VEVO',
    category: 'PRICE',
    keywords: ['visszatartás', 'vételárrész', 'feltételes kifizetés', 'bejegyzés'],
    triggerConditions: [
      { field: 'financingType', operator: 'in', value: ['OTP_BANK_LOAN', 'OTHER_BANK_LOAN'] },
    ],
    sortOrder: 30,
    sourceType: 'STANDARD',
  },

  // ---------------------------------------------------------------------------
  // 3) FINANCING (FAMILY)
  // ---------------------------------------------------------------------------
  {
    title: 'Banki folyósítási előfeltételek együttműködési klauzulája',
    slug: 'hubay-banki-folyositas-elofeltetel-egyuttmukodes',
    summary: 'A banki folyósításhoz szükséges közreműködést rögzíti.',
    body: `A Felek kötelezettséget vállalnak arra, hogy a finanszírozó bank által előírt, a folyósításhoz szükséges nyilatkozatokat és okiratokat késedelem nélkül aláírják, illetve rendelkezésre bocsátják. A késedelemből eredő többletköltséget az a fél viseli, akinek mulasztása a késedelmet okozta.`,
    contractType: 'ADASVETEL',
    clauseKind: 'RECOMMENDED',
    representedSide: 'NEUTRAL',
    category: 'FINANCING',
    keywords: ['banki folyósítás', 'előfeltétel', 'együttműködés', 'okirat'],
    triggerConditions: [
      { field: 'financingType', operator: 'in', value: ['OTP_BANK_LOAN', 'OTHER_BANK_LOAN', 'MIXED'] },
    ],
    sortOrder: 40,
    sourceType: 'BANK_TEMPLATE',
    bankPackTag: 'GENERIC_BANK',
  },
  {
    title: 'Banki csomag-elsőbbségi iratkezelési klauzula',
    slug: 'hubay-banki-csomag-elsosegi-iratkezeles',
    summary: 'Banki csomag esetén prioritást ad az aláírási és iratkezelési lépéseknek.',
    body: `Banki csomag alkalmazása esetén a Felek elfogadják, hogy a finanszírozó intézmény által megjelölt okirati sorrend és aláírási rend elsőbbséget élvez a szerződés teljesítési ütemében, feltéve, hogy az nem ellentétes jogszabállyal.`,
    contractType: 'ADASVETEL',
    clauseKind: 'SPECIAL',
    representedSide: 'NEUTRAL',
    category: 'FINANCING',
    keywords: ['banki csomag', 'iratkezelés', 'aláírási rend', 'prioritás'],
    triggerConditions: [
      { field: 'bankPackRequired', operator: 'eq', value: true },
    ],
    sortOrder: 50,
    sourceType: 'BANK_TEMPLATE',
    bankPackTag: 'GENERIC_BANK',
  },

  // ---------------------------------------------------------------------------
  // 4) TITLE (FAMILY)
  // ---------------------------------------------------------------------------
  {
    title: 'Tulajdonjog-bejegyzési együttműködés és pótnyilatkozat',
    slug: 'hubay-tulajdonjog-bejegyzesi-egyuttmukodes-potnyilatkozat',
    summary: 'Hiánypótlás esetén pótnyilatkozati kötelezettséget állapít meg.',
    body: `A Felek vállalják, hogy a földhivatali eljárás során felmerülő hiánypótlási felhívás esetén a szükséges pótnyilatkozatokat legkésőbb a felhívás kézhezvételétől számított [POTLASI_HATARIDO_NAP] napon belül megadják.`,
    contractType: 'ADASVETEL',
    clauseKind: 'RECOMMENDED',
    representedSide: 'NEUTRAL',
    category: 'TITLE',
    keywords: ['bejegyzés', 'hiánypótlás', 'pótnyilatkozat', 'földhivatal'],
    triggerConditions: [],
    sortOrder: 60,
    sourceType: 'STANDARD',
  },
  {
    title: 'Elővásárlási jog fennállása esetére feltételes teljesítés',
    slug: 'hubay-elovasarlasi-jog-fennallasa-felteteles-teljesites',
    summary: 'Elővásárlási jogosultság esetén feltételes teljesítési rendet ad.',
    body: `Amennyiben az Ingatlan tekintetében elővásárlási jog fennállása igazolt, a Felek a teljesítési cselekményeket az elővásárlási jog gyakorlására nyitva álló határidő eredményes leteltéhez kötik.`,
    contractType: 'ADASVETEL',
    clauseKind: 'SPECIAL',
    representedSide: 'NEUTRAL',
    category: 'TITLE',
    keywords: ['elővásárlási jog', 'feltételes teljesítés', 'határidő'],
    triggerConditions: [
      { field: 'hasPreemptiveRights', operator: 'eq', value: true },
    ],
    sortOrder: 70,
    sourceType: 'STANDARD',
  },

  // ---------------------------------------------------------------------------
  // 5) POSSESSION (FAMILY)
  // ---------------------------------------------------------------------------
  {
    title: 'Birtokbaadási jegyzőkönyv kötelező tartalma',
    slug: 'hubay-birtokbaadasi-jegyzokonyv-kotelezo-tartalom',
    summary: 'A jegyzőkönyv minimális adattartalmát előírja.',
    body: `A birtokbaadás során a Felek részletes jegyzőkönyvet vesznek fel, amely legalább az ingatlan állapotát, közműórák állását, átadott kulcsok számát, valamint az esetleges hiányosságokat tartalmazza. A jegyzőkönyv a szerződés elválaszthatatlan mellékletét képezi.`,
    contractType: 'ADASVETEL',
    clauseKind: 'RECOMMENDED',
    representedSide: 'NEUTRAL',
    category: 'POSSESSION',
    keywords: ['birtokbaadás', 'jegyzőkönyv', 'óraállás', 'kulcsátadás'],
    triggerConditions: [],
    sortOrder: 80,
    sourceType: 'STANDARD',
  },
  {
    title: 'Közüzemi átírás felelősségi szabálya',
    slug: 'hubay-kozuzemi-atiras-felelossegi-szabaly',
    summary: 'A közüzemi átírás adminisztratív felelősségét rendezi.',
    body: `A birtokbaadást követő közüzemi átírásokhoz szükséges nyilatkozatokat a Felek haladéktalanul megteszik. Az átírás elmulasztásából eredő költségeket az a fél viseli, akinek együttműködési mulasztása az eljárás késedelmét okozta.`,
    contractType: 'ADASVETEL',
    clauseKind: 'OPTIONAL',
    representedSide: 'NEUTRAL',
    category: 'POSSESSION',
    keywords: ['közüzemi átírás', 'együttműködés', 'késedelem', 'költségviselés'],
    triggerConditions: [],
    sortOrder: 90,
    sourceType: 'STANDARD',
  },

  // ---------------------------------------------------------------------------
  // 6) SPECIAL (FAMILY)
  // ---------------------------------------------------------------------------
  {
    title: 'Társasházi albetét-rendezési nyilatkozat',
    slug: 'hubay-tarsashazi-albetet-rendezesi-nyilatkozat',
    summary: 'Társasházi ingatlan esetén közös képviselői/okirati rendezést céloz.',
    body: `Társasházi ingatlan esetén az Eladó kijelenti, hogy a közös képviselő által vezetett nyilvántartás szerinti közös költség tartozásról valós adatot szolgáltat, és a birtokbaadásig esedékes terheket rendezi.`,
    contractType: 'ADASVETEL',
    clauseKind: 'SPECIAL',
    representedSide: 'VEVO',
    category: 'SPECIAL',
    keywords: ['társasház', 'albetét', 'közös költség', 'közös képviselő'],
    triggerConditions: [
      { field: 'condominiumProperty', operator: 'eq', value: true },
    ],
    sortOrder: 100,
    sourceType: 'STANDARD',
  },
  {
    title: 'Külföldi fél nyilatkozatai és okirati megfelelés',
    slug: 'hubay-kulfoldi-fel-nyilatkozatai-okirati-megfeleles',
    summary: 'Külföldi fél esetén az azonosítási és okirati megfelelést erősíti.',
    body: `Külföldi fél részvétele esetén a Felek rögzítik, hogy az azonosításhoz, képviselethez és nyilatkozattételhez szükséges okiratok hiteles formában kerülnek bemutatásra, szükség esetén hiteles magyar fordítással.`,
    contractType: 'ADASVETEL',
    clauseKind: 'SPECIAL',
    representedSide: 'NEUTRAL',
    category: 'SPECIAL',
    keywords: ['külföldi fél', 'hiteles fordítás', 'azonosítás', 'okirati megfelelés'],
    triggerConditions: [
      { field: 'foreignParty', operator: 'eq', value: true },
    ],
    sortOrder: 110,
    sourceType: 'STANDARD',
  },

  // ---------------------------------------------------------------------------
  // 7) SPECIAL PROPERTY / FACT PATTERNS (Patch 4H.2)
  // ---------------------------------------------------------------------------
  {
    title: 'Osztatlan közös tulajdon ténye és jogkövetkezményei',
    slug: 'hubay-osztatlan-kozos-tulajdon-tenye-jogkovetkezmenyek',
    summary: 'Osztatlan közös tulajdon esetén a használati és együttműködési kereteket rögzíti.',
    body: `A Felek rögzítik, hogy az Ingatlan osztatlan közös tulajdonban áll. A Vevő tudomásul veszi, hogy az osztatlan közös tulajdoni jellegből eredő jogokat és kötelezettségeket a vonatkozó jogszabályok és az esetleges használati megállapodás határozza meg.`,
    contractType: 'ADASVETEL',
    clauseKind: 'SPECIAL',
    representedSide: 'NEUTRAL',
    category: 'SPECIAL',
    keywords: ['osztatlan közös tulajdon', 'közös tulajdon', 'jogkövetkezmény'],
    triggerConditions: [
      { field: 'undividedCommonOwnership', operator: 'eq', value: true },
    ],
    sortOrder: 120,
    sourceType: 'STANDARD',
  },
  {
    title: 'Használati megállapodásra hivatkozó klauzula',
    slug: 'hubay-hasznalati-megallapodasra-hivatkozo-klauzula',
    summary: 'A felek használati megállapodásra való hivatkozását és kötöttségét rögzíti.',
    body: `A Felek kijelentik, hogy az Ingatlan használati rendjét a külön okiratba foglalt használati megállapodás rendezi. A Vevő kijelenti, hogy a használati megállapodás tartalmát megismerte és magára nézve kötelezőnek elfogadja.`,
    contractType: 'ADASVETEL',
    clauseKind: 'SPECIAL',
    representedSide: 'NEUTRAL',
    category: 'SPECIAL',
    keywords: ['használati megállapodás', 'használati rend', 'külön okirat'],
    triggerConditions: [
      { field: 'usageAgreementExists', operator: 'eq', value: true },
    ],
    sortOrder: 130,
    sourceType: 'STANDARD',
  },
  {
    title: 'Tulajdonostársi elővásárlási jog kezelése',
    slug: 'hubay-tulajdonostarsi-elovasarlasi-jog-kezelese',
    summary: 'Tulajdonostársi elővásárlási jog esetén a közlési és határidős rendet rögzíti.',
    body: `Amennyiben tulajdonostársi elővásárlási jog fennáll, az Eladó köteles igazolni, hogy az elővásárlásra jogosultak jogszabályszerű értesítése megtörtént, és a jog gyakorlására nyitva álló határidő eredménytelenül telt el, vagy a jogosultak a jogukról kifejezetten lemondtak.`,
    contractType: 'ADASVETEL',
    clauseKind: 'SPECIAL',
    representedSide: 'VEVO',
    category: 'TITLE',
    keywords: ['tulajdonostárs', 'elővásárlási jog', 'értesítés', 'lemondás'],
    triggerConditions: [
      { field: 'coOwnerPreemptiveRight', operator: 'eq', value: true },
    ],
    sortOrder: 140,
    sourceType: 'STANDARD',
  },
  {
    title: 'Parkoló és kizárólagos használati jog átadása',
    slug: 'hubay-parkolo-kizarolagos-hasznalati-jog-atadasa',
    summary: 'Parkolóhely és kizárólagos használati jogosultság kezelését rendezi.',
    body: `A Felek rögzítik, hogy az Ingatlanhoz kapcsolódó parkolóhely és/vagy kizárólagos használati jog a jelen szerződés szerinti feltételekkel kerül a Vevő használatába. Az Eladó köteles átadni a jogosultság igazolására szolgáló rendelkezésre álló dokumentumokat.`,
    contractType: 'ADASVETEL',
    clauseKind: 'SPECIAL',
    representedSide: 'NEUTRAL',
    category: 'SPECIAL',
    keywords: ['parkoló', 'kizárólagos használati jog', 'átadás'],
    triggerConditions: [
      { field: 'hasExclusiveParkingRight', operator: 'eq', value: true },
    ],
    sortOrder: 150,
    sourceType: 'STANDARD',
  },

  // ---------------------------------------------------------------------------
  // 8) LOCAL RULE / NOTICE PATTERNS (Patch 4H.2)
  // ---------------------------------------------------------------------------
  {
    title: 'Helyi önazonossági rendelet hiányának rögzítése',
    slug: 'hubay-hotv-rendelet-hianya-rogzites',
    summary: 'Rögzíti, ha az érintett településen Hötv szerinti rendelet nincs hatályban.',
    body: `A Felek kijelentik, hogy az Ingatlan fekvése szerinti településen a helyi önazonosság védelméről szóló helyi rendelet jelen szerződéskötéskor nem ismert, illetve nem alkalmazandó.`,
    contractType: 'ADASVETEL',
    clauseKind: 'OPTIONAL',
    representedSide: 'NEUTRAL',
    category: 'SPECIAL',
    keywords: ['Hötv', 'helyi önazonosság', 'rendelet hiánya'],
    triggerConditions: [
      { field: 'localIdentityRegulationStatus', operator: 'eq', value: 'NONE' },
    ],
    sortOrder: 160,
    sourceType: 'STANDARD',
  },
  {
    title: 'Helyi önazonossági rendeletre figyelmeztető tájékoztatás',
    slug: 'hubay-hotv-rendeletre-figyelmezteto-tajekoztatas',
    summary: 'Rögzíti, ha a helyi önazonossági rendelet alkalmazhatósága fennállhat.',
    body: `A Felek rögzítik, hogy az Ingatlan fekvése szerinti településen a helyi önazonosság védelmére vonatkozó helyi rendelet alkalmazhatósága felmerülhet, ezért a Vevő köteles a szerződés teljesítését érintő önkormányzati tájékoztatást és eljárási feltételeket ellenőrizni.`,
    contractType: 'ADASVETEL',
    clauseKind: 'SPECIAL',
    representedSide: 'NEUTRAL',
    category: 'SPECIAL',
    keywords: ['Hötv', 'helyi rendelet', 'önkormányzati tájékoztatás'],
    triggerConditions: [
      { field: 'localIdentityRegulationStatus', operator: 'eq', value: 'APPLIES' },
    ],
    sortOrder: 170,
    sourceType: 'STANDARD',
  },
  {
    title: 'Betelepülési hozzájárulás tájékoztatási klauzula',
    slug: 'hubay-betelepulesi-hozzajarulas-tajekoztatasi-klauzula',
    summary: 'Betelepülési hozzájárulás esetleges kötelezettségéről ad figyelmeztetést.',
    body: `A Vevő tudomásul veszi, hogy az Ingatlan megszerzését egyes helyi szabályok betelepülési hozzájárulás megfizetéséhez köthetik. A Felek rögzítik, hogy e kötelezettség fennállásának ellenőrzése és teljesítése a Vevő feladata.`,
    contractType: 'ADASVETEL',
    clauseKind: 'SPECIAL',
    representedSide: 'NEUTRAL',
    category: 'SPECIAL',
    keywords: ['betelepülési hozzájárulás', 'helyi szabály', 'tájékoztatás'],
    triggerConditions: [
      { field: 'settlementContributionMayApply', operator: 'eq', value: true },
    ],
    sortOrder: 180,
    sourceType: 'STANDARD',
  },

  // ---------------------------------------------------------------------------
  // 9) TECHNICAL / COMPLIANCE PATTERNS (Patch 4H.2)
  // ---------------------------------------------------------------------------
  {
    title: 'Energetikai tanúsítvány kötelező átadása',
    slug: 'hubay-energetikai-tanusitvany-kotelezo-atadas',
    summary: 'Előírja az energetikai tanúsítvány átadását, ha kötelező.',
    body: `Az Eladó kijelenti, hogy az energetikai tanúsítvány rendelkezésre áll, és azt a jelen szerződés aláírásáig vagy legkésőbb a birtokbaadásig a Vevő részére átadja.`,
    contractType: 'ADASVETEL',
    clauseKind: 'RECOMMENDED',
    representedSide: 'NEUTRAL',
    category: 'SPECIAL',
    keywords: ['energetikai tanúsítvány', 'kötelező átadás', 'birtokbaadás'],
    triggerConditions: [
      { field: 'energyCertificateRequired', operator: 'eq', value: true },
    ],
    sortOrder: 190,
    sourceType: 'STANDARD',
  },
  {
    title: 'Energetikai tanúsítvány alóli kivétel nyilatkozata',
    slug: 'hubay-energetikai-tanusitvany-kivetel-nyilatkozat',
    summary: 'Kivételi helyzetben rögzíti a tanúsítvány hiányának jogalapját.',
    body: `A Felek rögzítik, hogy az Ingatlanra az energetikai tanúsítvány beszerzési kötelezettség alóli kivétel alkalmazható. A kivétel jogalapját az Eladó nyilatkozatban ismerteti és szükség szerint igazolja.`,
    contractType: 'ADASVETEL',
    clauseKind: 'OPTIONAL',
    representedSide: 'NEUTRAL',
    category: 'SPECIAL',
    keywords: ['energetikai kivétel', 'nyilatkozat', 'jogalap'],
    triggerConditions: [
      { field: 'energyCertificateExempt', operator: 'eq', value: true },
    ],
    sortOrder: 200,
    sourceType: 'STANDARD',
  },
  {
    title: 'Villamos biztonsági felülvizsgálat vagy mentességi nyilatkozat',
    slug: 'hubay-villamos-biztonsagi-felulvizsgalat-vagy-mentesseg',
    summary: 'Villamos biztonsági megfelelés igazolását vagy mentességét rögzíti.',
    body: `A Felek megállapodnak, hogy az Ingatlan villamos biztonsági megfelelőségét az Eladó felülvizsgálati dokumentummal igazolja, vagy nyilatkozik a jogszabály szerinti mentességi feltétel fennállásáról.`,
    contractType: 'ADASVETEL',
    clauseKind: 'SPECIAL',
    representedSide: 'NEUTRAL',
    category: 'SPECIAL',
    keywords: ['villamos biztonsági felülvizsgálat', 'mentességi nyilatkozat', 'műszaki megfelelés'],
    triggerConditions: [
      { field: 'electricalSafetyDeclarationNeeded', operator: 'eq', value: true },
    ],
    sortOrder: 210,
    sourceType: 'STANDARD',
  },

  // ---------------------------------------------------------------------------
  // 10) BANK / TEHERMENTESÍTÉS VARIANTS (Patch 4H.2)
  // ---------------------------------------------------------------------------
  {
    title: 'Jelzálog és elidegenítési-terhelési tilalom törlésének részletes rendje',
    slug: 'hubay-jelzalog-es-elidegenitesi-terhelesi-tilalom-torles-rendje',
    summary: 'A terhek törléséhez szükséges banki és földhivatali lépések rendjét részletezi.',
    body: `Amennyiben az Ingatlant jelzálogjog és/vagy elidegenítési és terhelési tilalom terheli, az Eladó köteles a jogosult hitelintézettől törlési engedélyt beszerezni, és annak földhivatali benyújtásában teljeskörűen közreműködni. A tehermentesítés elmaradásából eredő késedelemért az Eladó felel.`,
    contractType: 'ADASVETEL',
    clauseKind: 'SPECIAL',
    representedSide: 'VEVO',
    category: 'FINANCING',
    keywords: ['jelzálog törlés', 'elidegenítési és terhelési tilalom', 'törlési engedély', 'tehermentesítés'],
    triggerConditions: [
      { field: 'encumberedByMortgage', operator: 'eq', value: true },
    ],
    sortOrder: 220,
    sourceType: 'BANK_TEMPLATE',
    bankPackTag: 'GENERIC_BANK',
  },
  {
    title: 'Tehermentes tulajdoni lap vagy széljegyes igazolás bemutatása',
    slug: 'hubay-tehermentes-tulajdoni-lap-vagy-szeljegyes-igazolas',
    summary: 'A tehermentesség igazolásának dokumentumszintű bizonyítását írja elő.',
    body: `Az Eladó köteles a Vevő részére a teljesítéshez igazodóan tehermentes tulajdoni lap másolatot vagy a tehermentesítési kérelem széljegyes igazolását bemutatni. A Felek ezt a teljesítési feltételek körében értékelik.`,
    contractType: 'ADASVETEL',
    clauseKind: 'RECOMMENDED',
    representedSide: 'NEUTRAL',
    category: 'TITLE',
    keywords: ['tehermentes tulajdoni lap', 'széljegy', 'igazolás'],
    triggerConditions: [
      { field: 'requiresClearTitleProof', operator: 'eq', value: true },
    ],
    sortOrder: 230,
    sourceType: 'STANDARD',
  },
  {
    title: 'Banki előtörlesztési nyilatkozat variáns kezelése',
    slug: 'hubay-banki-elotorlesztesi-nyilatkozat-varians',
    summary: 'A banki előtörlesztési nyilatkozat eltérő tartalmú variánsainak kezelését rendezi.',
    body: `A Felek megállapodnak, hogy amennyiben a tehermentesítés banki előtörlesztési nyilatkozathoz kötött, az Eladó a hitelintézet által kiadott, aktuális követelés-összeget tartalmazó nyilatkozatot bemutatja, és annak megfelelő teljesítési rendben működik közre.`,
    contractType: 'ADASVETEL',
    clauseKind: 'SPECIAL',
    representedSide: 'NEUTRAL',
    category: 'FINANCING',
    keywords: ['előtörlesztési nyilatkozat', 'hitelintézet', 'tehermentesítés'],
    triggerConditions: [
      { field: 'prepaymentStatementVariantNeeded', operator: 'eq', value: true },
    ],
    sortOrder: 240,
    sourceType: 'BANK_TEMPLATE',
    bankPackTag: 'GENERIC_BANK',
  },
];

async function seedHubay() {
  console.log('🌱 Starting Hubay clause-library seed...');

  const profile = await prisma.lawyerProfile.upsert({
    where: { lawyerEmail: HUBAY_PROFILE.lawyerEmail },
    update: {
      lawyerName: HUBAY_PROFILE.lawyerName,
      preferredNumbering: HUBAY_PROFILE.preferredNumbering,
      defaultClosingText: HUBAY_PROFILE.defaultClosingText,
      styleNotes: HUBAY_PROFILE.styleNotes,
      isActive: true,
    },
    create: HUBAY_PROFILE,
  });

  console.log(`✅ Lawyer profile ready: ${profile.lawyerName} (${profile.id})`);

  let created = 0;
  let updated = 0;

  for (const clauseData of HUBAY_CLAUSES) {
    const clause = await prisma.clauseLibraryItem.upsert({
      where: {
        slug_lawyerProfileId: {
          slug: clauseData.slug,
          lawyerProfileId: profile.id,
        },
      },
      update: {
        title: clauseData.title,
        body: clauseData.body,
        summary: clauseData.summary,
        contractType: clauseData.contractType,
        clauseKind: clauseData.clauseKind,
        representedSide: clauseData.representedSide,
        category: clauseData.category,
        keywords: clauseData.keywords,
        triggerConditions: clauseData.triggerConditions,
        sortOrder: clauseData.sortOrder,
        sourceType: clauseData.sourceType,
        bankPackTag: clauseData.bankPackTag || null,
        isActive: true,
      },
      create: {
        title: clauseData.title,
        slug: clauseData.slug,
        body: clauseData.body,
        summary: clauseData.summary,
        contractType: clauseData.contractType,
        clauseKind: clauseData.clauseKind,
        representedSide: clauseData.representedSide,
        category: clauseData.category,
        keywords: clauseData.keywords,
        triggerConditions: clauseData.triggerConditions,
        sortOrder: clauseData.sortOrder,
        sourceType: clauseData.sourceType,
        bankPackTag: clauseData.bankPackTag || null,
        lawyerProfileId: profile.id,
      },
    });

    if (clause.createdAt.getTime() === clause.updatedAt.getTime()) created += 1;
    else updated += 1;
  }

  console.log(`✅ Hubay clauses: ${created} created, ${updated} updated`);
  console.log(`📚 Hubay clause set size: ${HUBAY_CLAUSES.length}`);
  console.log('🎉 Hubay seed complete.');
}

seedHubay()
  .catch((error) => {
    console.error('❌ Hubay seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
