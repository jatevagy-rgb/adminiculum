/**
 * Seed Script: Clause Library — Adásvételi Trugly Clause Set
 * 
 * Run: node scripts/seed-clause-library.mjs
 * Requires DATABASE_URL in .env or environment
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const LAWYER_PROFILE = {
  lawyerName: 'Dr. Trugly Csanád',
  lawyerEmail: 'trugly@example.hu',
  preferredNumbering: 'DECIMAL',
  defaultClosingText: 'Jelen szerződés ... példányban került aláírásra, amelyek minden tekintetben azonos szövegűek és érvényesek.',
  styleNotes: 'Trugly Csanád standard adásvételi gyakorlata — OTP bank finanszírozás esetén jelzálogjog bejegyzés kötelező.',
};

const CLAUSES = [
  // =========================================================================
  // 1. PARTY / FELTÉTELEK — Felek megnevezése
  // =========================================================================
  {
    title: 'Szerződő felek megnevezése',
    slug: 'szerzodo-felek-megnevezese',
    summary: 'Eladó és Vevő pontos megnevezése és azonosító adatai',
    body: `A jelen adásvételi szerződés Eladója és Vevője a szerződésben rögzített személyes adataik alapján kerülnek azonosításra. Eladó és Vevő a szerződés aláírásával kijelentik, hogy cselekvőképes természetes személyek, és a szerződés megkötésére jogosultak.`,
    contractType: 'ADASVETEL',
    clauseKind: 'REQUIRED',
    representedSide: 'NEUTRAL',
    category: 'PARTY',
    keywords: ['felek', 'eladó', 'vevő', 'személyes adat', 'azonosítás'],
    triggerConditions: [],
    sortOrder: 1,
    sourceType: 'STANDARD',
  },

  // =========================================================================
  // 2. PROPERTY / INGATLAN LEÍRÁSA
  // =========================================================================
  {
    title: 'Ingatlan azonosítása és leírása',
    slug: 'ingatlan-azonosito-es-leiras',
    summary: 'Az ingatlan főbb azonosító adatai: cím, helyrajzi szám, alapterület',
    body: `A jelen szerződés tárgyát képező ingatlan az alábbiakban meghatározott ingatlan (a továbbiakban: "Ingatlan"):\n\nCím: [INGATLAN_CÍM]\nHelyrajzi szám: [HELYRAJZI_SZÁM]\nAlapterület: [ALAPTERÜLET] m²\nTulajdoni lap szerinti megnevezés: [TULAJDONI_LAP_SZERINTI_MEGNEVEZÉS]\n\nAz Eladó kijelenti, hogy az Ingatlan a tulajdoni lap alapján az ő kizárólagos tulajdonát képezi, és az Ingatlannak harmadik személyrel szembeni jogügylete nincs.`,
    contractType: 'ADASVETEL',
    clauseKind: 'REQUIRED',
    representedSide: 'NEUTRAL',
    category: 'PROPERTY',
    keywords: ['ingatlan', 'cím', 'helyrajzi szám', 'alapterület', 'tulajdon'],
    triggerConditions: [],
    sortOrder: 2,
    sourceType: 'STANDARD',
  },

  // =========================================================================
  // 3. OWNERSHIP PROOF / TULAJDONJOG IGAZOLÁSA
  // =========================================================================
  {
    title: 'Tulajdonjog igazolása',
    slug: 'tulajdonjog-igazolasa',
    summary: 'Eladó tulajdonjogának igazolása tulajdoni lap másolattal',
    body: `Az Eladó tulajdonjogát a [MILLER_KÖZHASZNÚ_SZEMLE] által kiadott, [KIÁLLÍTÁS_DÁTUMA]-i keltezésű tulajdoni lap másolat igazolja, amely az Ingatlanra vonatkozóan az Eladó kizárólagos tulajdonjogát tartalmazza. Eladó kijelenti, hogy a tulajdoni lap tartalma a szerződéskötés időpontjában is hatályos és a való jogi állapotot tükrözi.`,
    contractType: 'ADASVETEL',
    clauseKind: 'REQUIRED',
    representedSide: 'EITHER',
    category: 'OWNERSHIP_PROOF',
    keywords: ['tulajdoni lap', 'közhiteles', 'szemle', 'tulajdonjog igazolás'],
    triggerConditions: [],
    sortOrder: 3,
    sourceType: 'STANDARD',
  },

  // =========================================================================
  // 4. TITLE / TULAJDONJOG, BEJEGYZÉS
  // =========================================================================
  {
    title: 'Tulajdonjog átruházása és bejegyzés',
    slug: 'tulajdonjog-aruha-zas-es-bejegyzes',
    summary: 'Eladó kötelezettsége a tulajdonjog Vevőre történő átruházására és a földhivatali bejegyzés kezdeményezésére',
    body: `Az Eladó kötelezi magát, hogy a teljes vételár megfizetését követően haladéktalanul, de legkésőbb [ATUTASÍTÁS_DÁTUMA]-ig kezdeményezi az ingatlanügyi hatóságnál a tulajdonjog Vevő javára történő bejegyzéséhez szükséges eljárást. Az Eladó a tulajdonjog átruházásához szükséges valamennyi dokumentumot köteles a Vevő rendelkezésére bocsátani. A bejegyzési kérelem benyújtásának költsége az Eladót terheli.`,
    contractType: 'ADASVETEL',
    clauseKind: 'REQUIRED',
    representedSide: 'EITHER',
    category: 'TITLE',
    keywords: ['tulajdonjog', 'átruházás', 'bejegyzés', 'földhivatal', 'ingatlanügyi'],
    triggerConditions: [],
    sortOrder: 4,
    sourceType: 'STANDARD',
  },

  // =========================================================================
  // 5. PRICE / VÉTELÁR
  // =========================================================================
  {
    title: 'Vételár és megfizetése',
    slug: 'vetelar-es-megfizetése',
    summary: 'Vételár összege, fizetési módok és határidők',
    body: `A Felek a jelen adásvételi szerződés tárgyát képező Ingatlan ellenértékeként a következő vételárarban állapodnak meg:\n\nVételár: [VÉTELÁR] Ft, azaz [VÉTELÁR_SZÁMMAL] forint.\n\nA vételár megfizetése a következő módon történik:\n- Foglaló összege: [FOGLALÓ] Ft — a szerződés aláírásával egyidejűleg\n- Végösszeg: [VÉGÖSSZEG] Ft — [FIZETÉSI_HATÁRIDŐ] napján, de legkésőbb a birtokbaadásig\n\nAmennyiben a Vevő a vételárfizetési kötelezettségét nem teljesíti határidőben, a késedelmes napokra a Ptk. szerinti késedelmi kamatot köteles fizetni.`,
    contractType: 'ADASVETEL',
    clauseKind: 'REQUIRED',
    representedSide: 'NEUTRAL',
    category: 'PRICE',
    keywords: ['vételár', 'fizetés', 'foglaló', 'végösszeg', 'határidő', 'kamategyezmény'],
    triggerConditions: [],
    sortOrder: 5,
    sourceType: 'STANDARD',
  },

  // =========================================================================
  // 6. FINANCING / FINANSZÍROZÁS, OTP
  // =========================================================================
  {
    title: 'Banki finanszírozás — OTP jelzáloghitel',
    slug: 'otp-jelzagohitel-finanszirozas',
    summary: 'OTP Bank jelzáloghitel esetén a zálogjog bejegyzése és fedezeti rendelkezés',
    body: `Amennyiben a Vevő a vételár megfizetéséhez OTP Bank Zrt. (a továbbiakban: "Bank") által nyújtott jelzáloghitelt vesz igénybe, a Felek az alábbiakban állapodnak meg:\n\n1. A Bank a folyósított kölcsön biztosítékaként jelzálogjogot jegyeztet be az Ingatlanra a Vevő terhére.\n2. Az Eladó kijelenti, hogy a Bank zálogszerződését és a hozzá kapcsolódó jelzálogjog bejegyzéséhez szükséges valamennyi dokumentumot a Bank rendelkezésére bocsátja.\n3. A Bank zálogszerződésének aláírása a szerződéskötéssel egyidejűleg, vagy a Bank által meghatározott időpontban történik.\n4. A jelzálogjog bejegyzésének költségei a Vevőt terhelik.`,
    contractType: 'ADASVETEL',
    clauseKind: 'RECOMMENDED',
    representedSide: 'NEUTRAL',
    category: 'FINANCING',
    keywords: ['OTP', 'bank', 'jelzáloghitel', 'finanszírozás', 'zálogszerződés', 'fedezet'],
    triggerConditions: [
      { field: 'financingType', operator: 'eq', value: 'OTP_BANK_LOAN' },
    ],
    sortOrder: 6,
    sourceType: 'BANK_TEMPLATE',
    bankPackTag: 'OTP_BANK',
  },

  // =========================================================================
  // 7. FINANCING / ÖNERŐ
  // =========================================================================
  {
    title: 'Önerő megfizetése',
    slug: 'onero-megfizetése',
    summary: 'Vevő önerőrészletének megfizetése a banki folyósítással egyidejűleg',
    body: `A Vevő kijelenti, hogy a Bank által folyósított kölcsönen felüli fennmaradó összeget, azaz [ÖNERŐ] Ft-ot (a továbbiakban: "Önerő") saját forrásból biztosítja. Az Önerő megfizetése a Bank általi kölcsönfolyósítással egyidejűleg, [ÖNERŐ_FIZETÉS_DÁTUMA]-án történik meg az Eladó bankszámlájára.`,
    contractType: 'ADASVETEL',
    clauseKind: 'RECOMMENDED',
    representedSide: 'NEUTRAL',
    category: 'FINANCING',
    keywords: ['önerő', 'saját forrás', 'banki kölcsön', 'folyósítás'],
    triggerConditions: [
      { field: 'financingType', operator: 'in', value: ['OTP_BANK_LOAN', 'OTHER_BANK_LOAN'] },
    ],
    sortOrder: 7,
    sourceType: 'STANDARD',
  },

  // =========================================================================
  // 8. WARRANTIES / SZAVATOSSÁG — ELADÓI NYILATKOZATOK
  // =========================================================================
  {
    title: 'Eladói szavatosság és nyilatkozatok',
    slug: 'eladoi-szavatossag-es-nyilatkozatok',
    summary: 'Eladó garanciavállalása az ingatlan per-, igény- és tehermentessége tekintetében',
    body: `Az Eladó kijelenti és szavatolja a Vevő felé, hogy:\n\na) az Ingatlan a szerződéskötés időpontjában per-, igény- és tehermentes, kivéve a jelen szerződésben rögzített banki jelzálogjogot;\nb) az Ingatlannak nincs olyan haszonélvezeti, használati joga, amely a Vevő tulajdonjogát korlátozná;\nc) az Ingatlanra vonatkozóan harmadik személynek nincs olyan jogszolgáltatása, amely a tulajdonjog átruházását akadályozza;\nd) az Ingatlan állapotával kapcsolatosan a Vevő által ismert körülményeket a szerződés tartalmazza, az Eladó nem hallgatott el a Vevőket lényeges körülményekről.\n\ne) Amennyiben a fenti nyilatkozatok bármelyike valótlannak bizonyul, az Eladó kötelezettséget vállal a Ptk. szerinti szavatossági felelősség alá tartozó valamennyi kár megtérítésére.`,
    contractType: 'ADASVETEL',
    clauseKind: 'REQUIRED',
    representedSide: 'ELOADO',
    category: 'WARRANTIES',
    keywords: ['szavatosság', 'eladó', 'nyilatkozat', 'permentesség', 'tehermentesség', 'felelősség'],
    triggerConditions: [],
    sortOrder: 8,
    sourceType: 'STANDARD',
  },

  // =========================================================================
  // 9. WARRANTIES / BIZONYOS ESEMÉNYEKRE VONATKOZÓ FELTÉTELEK
  // =========================================================================
  {
    title: 'Ingatlan állagával kapcsolatos kikötések',
    slug: 'ingatlan-allag-kikötések',
    summary: 'Az ingatlan átadáskori állapotára vonatkozó felelősségi szabályok',
    body: `Az Eladó kötelezettséget vállal arra, hogy az Ingatlant a birtokbaadás időpontjáig megőrzi, és azt a Vevő részére a jelen szerződésben meghatározott állapotban adja át. Az Ingatlan birtokbaadásakor a Felek átadás-átvételi jegyzőkönyvet vesznek fel, amelyben rögzítik az Ingatlan átadáskori állapotát, a mérőóra-állásokat, valamint az esetleges hibákat és hiányosságokat.\n\nAmennyiben az Ingatlan az átadás időpontjában nem felel meg a szerződésben rögzített állapotnak, a Vevő jogosult az Eladótól a kijavítás vagy árengedmény követelésére a Ptk. szabályai szerint.`,
    contractType: 'ADASVETEL',
    clauseKind: 'REQUIRED',
    representedSide: 'NEUTRAL',
    category: 'WARRANTIES',
    keywords: ['állag', 'birtokbaadás', 'átadás-átvétel', 'mérőóra', 'hiba', 'jegyzőkönyv'],
    triggerConditions: [],
    sortOrder: 9,
    sourceType: 'STANDARD',
  },

  // =========================================================================
  // 10. POSSESSION / BIRTOKBAADÁS
  // =========================================================================
  {
    title: 'Birtokbaadás és kulcsátadás',
    slug: 'birtokbaadás-es-kulcsatadas',
    summary: 'Birtokbaadás időpontja, feltételei és a kulcsok átadásának rendje',
    body: `Az Eladó kötelezettséget vállal arra, hogy a teljes vételár — ide értve a Bank által folyósított kölcsönt és az Önerőt is — Eladó bankszámlájára történő beérkezését követően legkésőbb [BIRTOKBAADÁS_IG] nappal átadja a Vevő részére az Ingatlan birtokát a Felek által aláírt birtokbaadási jegyzőkönyvvel egyidejűleg.\n\nA birtokbaadással egyidejűleg az Eladó átadja a Vevőnek az Ingatlanhoz tartozó valamennyi kulcsot, távirányítót és egyéb, az Ingatlanhoz rendszeresített nyitóeszközt.\n\nA birtokbaadás időpontja: [BIRTOKBAADÁS_DÁTUMA], helye: az Ingatlan címe.`,
    contractType: 'ADASVETEL',
    clauseKind: 'REQUIRED',
    representedSide: 'EITHER',
    category: 'POSSESSION',
    keywords: ['birtokbaadás', 'kulcs', 'átadás', 'jegyzőkönyv', 'birakóeszköz'],
    triggerConditions: [],
    sortOrder: 10,
    sourceType: 'STANDARD',
  },

  // =========================================================================
  // 11. TITLE / ELŐVÁSÁRLÁSI JOG KIZÁRÁSA
  // =========================================================================
  {
    title: 'Elővásárlási jog és hozzájárulás',
    slug: 'elovasarlasi-jog-kizarasa',
    summary: 'Haszonélvező/egyéb jogosult elővásárlási jogának kizárása és lemondása',
    body: `Az Eladó kijelenti, hogy az Ingatlan tekintetében harmadik személynek elővásárlási joga nincs, vagy ha van, azt az érintett személy a jelen szerződés aláírásával egyidejűleg kifejezetten gyakorolja / lemond róla.\n\nAmennyiben az Ingatlannal kapcsolatban bármely harmadik személy elővásárlási jogát állapítanák meg, az Eladó kötelezettséget vállal a Vevő teljes kárának megtérítésére, ide értve a szerződéskötéssel kapcsolatos valamennyi költséget.`,
    contractType: 'ADASVETEL',
    clauseKind: 'REQUIRED',
    representedSide: 'EITHER',
    category: 'TITLE',
    keywords: ['elővásárlási jog', 'hozzájárulás', 'harmadik személy', 'lemondás'],
    triggerConditions: [
      { field: 'hasPreemptiveRights', operator: 'eq', value: false },
    ],
    sortOrder: 11,
    sourceType: 'STANDARD',
  },

  // =========================================================================
  // 12. SPECIAL / OTP TÁRSSZOLGÁLTATÁS
  // =========================================================================
  {
    title: 'OTP Társzolgáltatások — közüzemi átírás',
    slug: 'otp-tarsszolgalaltatasok-kouzzemi-atirás',
    summary: 'OTP Bank által koordinált közüzemi szolgáltatóváltás lebonyolítása',
    body: `A Felek megbízzák az OTP Bankot a következő közüzemi szolgáltatások Vevő nevére történő átírásának koordinálásával:\n\n1. Villamosenergia-szolgáltatás\n2. Gázszolgáltatás\n3. Vízszolgáltatás\n4. Távfűtési szolgáltatás\n5. Internet és kábeltelevízió\n\nAz Eladó kötelezettséget vállal arra, hogy a birtokbaadás időpontjáig az összes közüzemi szolgáltatást saját nevéről törli, és a szükséges átírási dokumentumokat aláírja. Az átírással kapcsolatos költségek a Vevőt terhelik.`,
    contractType: 'ADASVETEL',
    clauseKind: 'SPECIAL',
    representedSide: 'NEUTRAL',
    category: 'SPECIAL',
    keywords: ['OTP', 'társzolgáltatás', 'közüzemi', 'átírás', 'szolgáltató', 'villamosenergia', 'gáz', 'víz'],
    triggerConditions: [
      { field: 'bankPackRequired', operator: 'eq', value: true },
      { field: 'bankPackTag', operator: 'eq', value: 'OTP_BANK' },
    ],
    sortOrder: 12,
    sourceType: 'BANK_TEMPLATE',
    bankPackTag: 'OTP_BANK',
  },

  // =========================================================================
  // 13. CLOSING / ZÁRÓ RENDELKEZÉSEK
  // =========================================================================
  {
    title: 'Záró rendelkezések és aláírás',
    slug: 'zaro-rendelkezések-es-alairas',
    summary: 'Irányadó jog, mellékletek, szerződés példányszáma és aláírás',
    body: `A jelen szerződésben nem szabályozott kérdésekben a Polgári Törvénykönyvről szóló 2013. évi V. törvény (Ptk.), valamint az ingatlan-nyilvántartásról szóló 1997. évi CXLI. törvény rendelkezései az irányadók.\n\nA jelen szerződés mellékletei:\n1. számú melléklet: Tulajdoni lap másolat\n2. számú melléklet: Ingatlan alaprajza\n3. számú melléklet: Fényképfelvételek az Ingatlanról\n4. számú melléklet: Foglaló átvételét igazoló elismervény\n\nJelen szerződés ... példányban került aláírásra, amelyből ... példány az Eladót, ... példány a Vevőt, ... példány a hitelező bankot illeti meg.`,
    contractType: 'ADASVETEL',
    clauseKind: 'REQUIRED',
    representedSide: 'NEUTRAL',
    category: 'CLOSING',
    keywords: ['záró rendelkezés', 'Ptk.', 'melléklet', 'példányszám', 'aláírás', 'irányadó jog'],
    triggerConditions: [],
    sortOrder: 13,
    sourceType: 'STANDARD',
  },

  // =========================================================================
  // 14. CLOSING / TÚLÁRÉLŐ BIZTOSÍTÁS
  // =========================================================================
  {
    title: 'Túlélő biztosítással kapcsolatos rendelkezések',
    slug: 'tulalö-biztositas',
    summary: 'Lakásbiztosítás átadása vagy új biztosítás kötése',
    body: `Az Eladó tájékoztatja a Vevőt, hogy az Ingatlanra vonatkozóan [BIZTOSÍTÓ_TÍPUS] biztosítás áll fenn, kötvényszáma: [KÖTVÉNYSZÁM]. A Felek megállapodnak, hogy a biztosítási szerződés a birtokbaadás napjától a Vevő nevére szól, és az Eladó kötelezettséget vállal a szükséges átírást a birtokbaadástól számított 8 napon belül kezdeményezni.\n\nAmennyiben a Vevő a biztosítást nem kívánja átvenni, az Eladó köteles a biztosítást a birtokbaadás napjával megszüntetni. Az át nem vett biztosítási díj Vevőt nem illeti meg.`,
    contractType: 'ADASVETEL',
    clauseKind: 'OPTIONAL',
    representedSide: 'NEUTRAL',
    category: 'CLOSING',
    keywords: ['biztosítás', 'lakásbiztosítás', 'kötvény', 'átírás', 'túlélő'],
    triggerConditions: [
      { field: 'insuranceRequired', operator: 'exists', value: true },
    ],
    sortOrder: 14,
    sourceType: 'STANDARD',
  },
];

// ============================================================================
// Seed Logic
// ============================================================================

async function seed() {
  console.log('🌱 Starting clause library seed...');

  // 1. Upsert lawyer profile
  const lawyerProfile = await prisma.lawyerProfile.upsert({
    where: { lawyerEmail: LAWYER_PROFILE.lawyerEmail },
    update: {
      lawyerName: LAWYER_PROFILE.lawyerName,
      preferredNumbering: LAWYER_PROFILE.preferredNumbering,
      defaultClosingText: LAWYER_PROFILE.defaultClosingText,
      styleNotes: LAWYER_PROFILE.styleNotes,
    },
    create: LAWYER_PROFILE,
  });
  console.log(`✅ Lawyer profile: ${lawyerProfile.lawyerName} (${lawyerProfile.id})`);

  // 2. Insert clauses
  let created = 0;
  let updated = 0;

  for (const clauseData of CLAUSES) {
    const clause = await prisma.clauseLibraryItem.upsert({
      where: {
        slug_lawyerProfileId: {
          slug: clauseData.slug,
          lawyerProfileId: lawyerProfile.id,
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
        bankPackTag: clauseData.bankPackTag,
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
        bankPackTag: clauseData.bankPackTag,
        lawyerProfileId: lawyerProfile.id,
      },
    });
    if (clause.createdAt.getTime() === clause.updatedAt.getTime()) {
      created++;
    } else {
      updated++;
    }
  }

  console.log(`✅ Clauses: ${created} created, ${updated} updated`);
  console.log(`📚 Total clauses in library: ${CLAUSES.length}`);
  console.log('🎉 Seed complete!');
}

seed()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
