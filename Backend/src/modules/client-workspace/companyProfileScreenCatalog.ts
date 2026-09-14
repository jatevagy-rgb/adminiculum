/**
 * COMPANY PROFILE 2.0 — GROUPED CLIENT SCREEN CATALOGUE
 *
 * The client-facing presentation authority. The 73 Question_Catalog rows are
 * internal question atoms; the workbook's Ügyfél_kérdőív sheet groups them into
 * ~26 logical screens written in plain Hungarian business language. This module
 * is that grouping, and it is what the portal renders.
 *
 * A screen may collect several facts atomically (e.g. foreign sales/import on a
 * single screen populates cross_border_eu_sales + export_outside_eu +
 * import_into_eu). It never exposes fact keys, rule ids, requirement ids,
 * internal enum keys or legal-engine terminology.
 *
 * Authority: Adminiculum_Compliance_Scoping_System_v2 — Ügyfél_kérdőív.
 */

import { evaluateVisibility, type CompanyProfileFactStateMap, type VisibilityResult } from './companyProfileAdaptive';
import type { CompanyProfileVisibilityAtom, CompanyProfileVisibilityCondition } from './companyProfileQuestionCatalog';

export type CompanyProfileScreenUiKind =
  | 'TOGGLE_SET'
  | 'SINGLE_TOGGLE'
  | 'SINGLE_CHOICE'
  | 'CHIPS'
  | 'NUMBER_SET'
  | 'COUNTRY_SET'
  | 'TEAOR_SELECT'
  | 'EVIDENCE_INTRO';

export type CompanyProfileScreenSectionKey =
  | 'COMPANY'
  | 'CUSTOMER'
  | 'INTERNATIONAL'
  | 'PEOPLE'
  | 'DATA'
  | 'CYBER'
  | 'AI'
  | 'FINANCE'
  | 'PRODUCT'
  | 'ENVIRONMENT'
  | 'SECTOR'
  | 'EXPORT'
  | 'DOCUMENTS';

export const COMPANY_PROFILE_SCREEN_SECTION_TITLES: Readonly<Record<CompanyProfileScreenSectionKey, string>> = {
  COMPANY: 'A vállalkozás alapadatai',
  CUSTOMER: 'Ügyfelek és értékesítés',
  INTERNATIONAL: 'Nemzetközi működés',
  PEOPLE: 'Emberek',
  DATA: 'Személyes adatok',
  CYBER: 'IT és kiberbiztonság',
  AI: 'Mesterséges intelligencia',
  FINANCE: 'Pénzügy és pénzmozgás',
  PRODUCT: 'Termékek',
  ENVIRONMENT: 'Környezet',
  SECTOR: 'Ágazati működés',
  EXPORT: 'Export és szankciók',
  DOCUMENTS: 'Dokumentumok',
};

export interface CompanyProfileScreenDefinition {
  readonly screenKey: string;
  readonly order: number;
  readonly sectionKey: CompanyProfileScreenSectionKey;
  readonly titleHu: string;
  readonly helpTextHu: string;
  readonly whyHu: string;
  readonly uiKind: CompanyProfileScreenUiKind;
  /** Canonical facts this screen may collect. Several facts = one atomic save. */
  readonly factBindings: readonly string[];
  /** Workbook Question_Catalog atom ids behind this screen (traceability). */
  readonly questionAtomKeys: readonly string[];
  readonly showWhen: CompanyProfileVisibilityCondition;
}

const eq = (factKey: string, value: boolean | string | number): CompanyProfileVisibilityAtom => ({ kind: 'factEquals', factKey, value });
const truthy = (factKey: string): CompanyProfileVisibilityAtom => ({ kind: 'factTruthy', factKey });
const contains = (factKey: string, value: string): CompanyProfileVisibilityAtom => ({ kind: 'factContains', factKey, value });
const notContains = (factKey: string, value: string): CompanyProfileVisibilityAtom => ({ kind: 'factNotContains', factKey, value });
const unanswered = (factKey: string): CompanyProfileVisibilityAtom => ({ kind: 'factUnanswered', factKey });
const anyOf = (...conditions: readonly CompanyProfileVisibilityAtom[]): CompanyProfileVisibilityAtom => ({ kind: 'anyOf', conditions });

const B2C = 'Fogyasztók (B2C)';
const PRODUCT_NONE = 'Nincs';

export const COMPANY_PROFILE_SCREENS: readonly CompanyProfileScreenDefinition[] = [
  {
    screenKey: 'SCREEN-COMPANY-OPERATING-COUNTRIES', order: 1, sectionKey: 'COMPANY', uiKind: 'COUNTRY_SET',
    titleHu: 'Hol működik a vállalkozás?',
    helpTextHu: 'Válaszd ki a bejegyzés országát és azokat az országokat, ahol ténylegesen dolgoztok, van telephelyetek vagy rendszeresen értékesítetek.',
    whyHu: 'Ez határozza meg, mely országok szabályai vonatkozhatnak rátok.',
    factBindings: ['registered_country', 'operating_countries'], questionAtomKeys: ['Q-B-002', 'Q-B-003'], showWhen: null,
  },
  {
    screenKey: 'SCREEN-COMPANY-ACTIVITY', order: 2, sectionKey: 'COMPANY', uiKind: 'TEAOR_SELECT',
    titleHu: 'Mivel foglalkoztok?',
    helpTextHu: 'Kezdd el beírni a fő tevékenységet; a rendszer felajánlja a TEÁOR’25 kódot. Utána további tényleges tevékenységeket is hozzáadhatsz.',
    whyHu: 'A tevékenység az ágazati szabályok első szűrője; jogszabályt nem kell ismerned hozzá.',
    factBindings: ['primary_teaor25_code', 'additional_teaor25_codes'], questionAtomKeys: ['Q-B-004', 'Q-B-005'], showWhen: null,
  },
  {
    screenKey: 'SCREEN-COMPANY-SIZE', order: 3, sectionKey: 'COMPANY', uiKind: 'NUMBER_SET',
    titleHu: 'Mekkora a vállalkozás?',
    helpTextHu: 'Add meg a jelenlegi létszámot, az utolsó lezárt év árbevételét és mérlegfőösszegét. Ha valamelyiket nem tudod, később is pótolható.',
    whyHu: 'A vállalkozás méretkategóriáját a megadott adatok és a vállalatcsoporti kapcsolatok alapján ellenőrizzük.',
    factBindings: ['employee_count', 'annual_net_revenue_eur', 'balance_sheet_total_eur', 'eu_sme_size_class'], questionAtomKeys: ['Q-B-010', 'Q-B-011', 'Q-B-012'], showWhen: null,
  },
  {
    screenKey: 'SCREEN-COMPANY-GROUP', order: 4, sectionKey: 'COMPANY', uiKind: 'TOGGLE_SET',
    titleHu: 'Része vagytok vállalatcsoportnak?',
    helpTextHu: 'Ide értjük az anya- és leányvállalati kapcsolatokat is.',
    whyHu: 'A csoporttagság csoportszintű beszámolási és átvilágítási kötelezettségeket hozhat.',
    factBindings: ['group_member', 'parent_country'], questionAtomKeys: ['Q-B-007', 'Q-B-036'], showWhen: null,
  },
  {
    screenKey: 'SCREEN-CUSTOMER-TYPES', order: 5, sectionKey: 'CUSTOMER', uiKind: 'CHIPS',
    titleHu: 'Kiknek adtok el vagy nyújtotok szolgáltatást?',
    helpTextHu: 'Jelöld mindet, ami jellemző: cégeknek, magánszemélyeknek, közszférának, kapcsolt vállalkozásnak.',
    whyHu: 'Az ügyfélkör dönti el, hogy fogyasztóvédelmi és közbeszerzési szabályok relevánsak-e.',
    factBindings: ['customer_types', 'b2c_sales', 'public_sector_customer'], questionAtomKeys: ['Q-B-013'], showWhen: null,
  },
  {
    screenKey: 'SCREEN-CUSTOMER-ONLINE', order: 6, sectionKey: 'CUSTOMER', uiKind: 'TOGGLE_SET',
    titleHu: 'Lehet nálatok online rendelni, előfizetni vagy szerződést kötni?',
    helpTextHu: 'Webshop, applikáció, online előfizetés vagy teljesen online szerződéskötés is ide tartozik.',
    whyHu: 'Az online értékesítéshez fogyasztói tájékoztatási szabályok kapcsolódnak.',
    factBindings: ['ecommerce_site', 'distance_sales'], questionAtomKeys: ['Q-B-014', 'Q-CONS-001'], showWhen: null,
  },
  {
    screenKey: 'SCREEN-CUSTOMER-PLATFORM', order: 7, sectionKey: 'CUSTOMER', uiKind: 'SINGLE_CHOICE',
    titleHu: 'Működtettek online platformot vagy piacteret?',
    helpTextHu: 'Olyan felületre gondolunk, ahol más vállalkozások vagy felhasználók kínálnak terméket, szolgáltatást vagy tartalmat.',
    whyHu: 'A platform jellege miatt speciális digitális szabályok merülhetnek fel.',
    factBindings: ['online_intermediary_service'], questionAtomKeys: ['Q-CONS-003'],
    showWhen: anyOf(eq('ecommerce_site', true), eq('digital_service_provider', true)),
  },
  {
    screenKey: 'SCREEN-INTERNATIONAL-SALES', order: 8, sectionKey: 'INTERNATIONAL', uiKind: 'TOGGLE_SET',
    titleHu: 'Van külföldi értékesítésetek vagy beszerzésetek?',
    helpTextHu: 'Jelöld külön: más EU-tagállamba értékesítés, EU-n kívüli export, EU-n kívülről import.',
    whyHu: 'Az áfa, az exportkontroll és egyes termékszabályok ettől függnek.',
    factBindings: ['cross_border_eu_sales', 'export_outside_eu', 'import_into_eu'], questionAtomKeys: ['Q-B-017', 'Q-B-018', 'Q-B-019'], showWhen: null,
  },
  {
    screenKey: 'SCREEN-PEOPLE-EMPLOYEES', order: 9, sectionKey: 'PEOPLE', uiKind: 'NUMBER_SET',
    titleHu: 'Foglalkoztattok munkavállalókat?',
    helpTextHu: 'A létszám alapján ezt általában automatikusan tudjuk; csak akkor kérdezzük külön, ha bizonytalan. Add meg a hozzávetőleges létszámot.',
    whyHu: 'A munkajogi, munkavédelmi és bejelentési kötelezettségek a foglalkoztatástól függnek.',
    factBindings: ['employee_count'], questionAtomKeys: ['Q-B-010'], showWhen: unanswered('employee_count'),
  },
  {
    screenKey: 'SCREEN-PEOPLE-SPECIAL', order: 10, sectionKey: 'PEOPLE', uiKind: 'TOGGLE_SET',
    titleHu: 'Dolgoznak nálatok kölcsönzött vagy más EU-országba kiküldött munkavállalók?',
    helpTextHu: 'Jelöld, ha munkaerő-kölcsönzést használtok, vagy munkatársat más tagállamba küldtök dolgozni.',
    whyHu: 'A kölcsönzés és a kiküldetés speciális munkajogi szabályokat hoz.',
    factBindings: ['temporary_agency_work', 'posted_workers'], questionAtomKeys: ['Q-HR-001', 'Q-HR-002'], showWhen: eq('has_employees', true),
  },
  {
    screenKey: 'SCREEN-DATA-PEOPLE', order: 11, sectionKey: 'DATA', uiKind: 'SINGLE_CHOICE',
    titleHu: 'Kezeltek személyes adatokat?',
    helpTextHu: 'Például munkavállalók, ügyfelek, kapcsolattartók, weboldal-látogatók, jelentkezők adatait.',
    whyHu: 'A személyes adat kezelése nyitja meg az adatvédelmi kérdéseket.',
    factBindings: ['personal_data_processing'], questionAtomKeys: ['Q-B-020'], showWhen: null,
  },
  {
    screenKey: 'SCREEN-DATA-SENSITIVE', order: 12, sectionKey: 'DATA', uiKind: 'TOGGLE_SET',
    titleHu: 'Kezeltek érzékenyebb adatokat?',
    helpTextHu: 'Egészségügyi adat, biometria, genetikai adat, kiskorúak adata vagy bűnügyi adat.',
    whyHu: 'A különleges adatok fokozott védelmi és hatásvizsgálati kötelezettségeket hozhatnak. Ha nem tudod, jelezheted, és ügyvéd ellenőrzi.',
    factBindings: ['special_category_data', 'children_data', 'criminal_data'], questionAtomKeys: ['Q-B-021', 'Q-DATA-002', 'Q-DATA-001'], showWhen: eq('personal_data_processing', true),
  },
  {
    screenKey: 'SCREEN-DATA-MONITORING', order: 13, sectionKey: 'DATA', uiKind: 'TOGGLE_SET',
    titleHu: 'Figyelitek vagy rendszeresen elemzitek emberek viselkedését?',
    helpTextHu: 'Ide tartozhat kamera, munkavállalói megfigyelés, profilalkotás vagy nagyszámú felhasználó követése.',
    whyHu: 'A megfigyelés és profilalkotás magasabb adatvédelmi kockázatot jelez.',
    factBindings: ['cctv_monitoring', 'employee_monitoring', 'systematic_monitoring'], questionAtomKeys: ['Q-DATA-004', 'Q-DATA-003', 'Q-DATA-005'], showWhen: eq('personal_data_processing', true),
  },
  {
    screenKey: 'SCREEN-DATA-TRANSFER', order: 14, sectionKey: 'DATA', uiKind: 'SINGLE_CHOICE',
    titleHu: 'Kerülhet személyes adat az EGT-n kívülre?',
    helpTextHu: 'Például amerikai vagy ázsiai felhőszolgáltatóhoz, külső ügyfélszolgálathoz vagy cégcsoporttaghoz.',
    whyHu: 'A harmadik országba történő továbbítás jogalapját külön ellenőrizni kell.',
    factBindings: ['third_country_data_transfer'], questionAtomKeys: ['Q-DATA-007'], showWhen: eq('personal_data_processing', true),
  },
  {
    screenKey: 'SCREEN-CYBER-DEPENDENCY', order: 15, sectionKey: 'CYBER', uiKind: 'SINGLE_CHOICE',
    titleHu: 'Mi történne, ha egy napra leállnának a fő informatikai rendszereitek?',
    helpTextHu: 'Ha a vállalkozás működése komolyan akadna, válaszd a „lényegesen akadna” lehetőséget.',
    whyHu: 'A kritikus informatikai függőség kiberbiztonsági kockázatot és kontrollokat jelez.',
    factBindings: ['critical_it_dependency'], questionAtomKeys: ['Q-B-022'], showWhen: null,
  },
  {
    screenKey: 'SCREEN-CYBER-PROVIDER', order: 16, sectionKey: 'CYBER', uiKind: 'TOGGLE_SET',
    titleHu: 'Ti magatok nyújtotok IT-, felhő-, hosting- vagy biztonsági szolgáltatást másoknak?',
    helpTextHu: 'Például rendszerüzemeltetés, MSP/MSSP, cloud, adatközpont, hosting.',
    whyHu: 'A szolgáltatói szerep speciális kiberbiztonsági kötelezettségeket jelölhet.',
    factBindings: ['managed_it_service_provider', 'data_center_or_cloud_provider'], questionAtomKeys: ['Q-CYBER-001', 'Q-CYBER-002'],
    showWhen: anyOf(truthy('primary_teaor25_code'), eq('critical_it_dependency', true), eq('ecommerce_site', true)),
  },
  {
    screenKey: 'SCREEN-AI-USE', order: 17, sectionKey: 'AI', uiKind: 'SINGLE_CHOICE',
    titleHu: 'Használtok mesterséges intelligencián alapuló rendszert?',
    helpTextHu: 'Például ChatGPT/Copilot, chatbot, toborzási rendszer, automatizált értékelés vagy saját AI-funkció.',
    whyHu: 'Az MI használata nyitja meg az MI-jogi kérdéseket. Ha nem tudod, jelezheted, és ügyvéd ellenőrzi.',
    factBindings: ['ai_use'], questionAtomKeys: ['Q-B-024'], showWhen: null,
  },
  {
    screenKey: 'SCREEN-AI-PURPOSE', order: 18, sectionKey: 'AI', uiKind: 'CHIPS',
    titleHu: 'Mire használjátok az MI-t?',
    helpTextHu: 'Jelöld a fő felhasználásokat. Nem kell tudnod, hogy jogilag milyen kategória.',
    whyHu: 'A felhasználás módja dönti el, merülhet-e fel magas kockázatú eset.',
    factBindings: ['ai_high_risk_context', 'ai_customer_facing'], questionAtomKeys: ['Q-AI-002', 'Q-AI-003'], showWhen: eq('ai_use', true),
  },
  {
    screenKey: 'SCREEN-FINANCE-SERVICES', order: 19, sectionKey: 'FINANCE', uiKind: 'TOGGLE_SET',
    titleHu: 'Nyújtotok pénzügyi jellegű szolgáltatást?',
    helpTextHu: 'Banki, fizetési, befektetési, biztosítási vagy kriptoeszköz-szolgáltatás.',
    whyHu: 'A pénzügyi szolgáltatás külön ágazati és reziliencia-szabályokat aktivál.',
    factBindings: ['financial_service_activity', 'payment_service_activity', 'investment_service_activity', 'insurance_activity', 'crypto_asset_activity'], questionAtomKeys: ['Q-B-025', 'Q-FIN-001', 'Q-FIN-002', 'Q-FIN-003', 'Q-FIN-004'], showWhen: null,
  },
  {
    screenKey: 'SCREEN-PRODUCT-ROLE', order: 20, sectionKey: 'PRODUCT', uiKind: 'CHIPS',
    titleHu: 'Gyártotok, importáltok vagy forgalmaztok fizikai terméket?',
    helpTextHu: 'Több szerepet is jelölhetsz.',
    whyHu: 'A termékpiaci szerep határozza meg a termékmegfelelőségi kötelezettségeket.',
    factBindings: ['product_market_role', 'consumer_products'], questionAtomKeys: ['Q-B-026', 'Q-PROD-001'], showWhen: null,
  },
  {
    screenKey: 'SCREEN-PRODUCT-TYPES', order: 21, sectionKey: 'PRODUCT', uiKind: 'TOGGLE_SET',
    titleHu: 'Milyen termékekkel foglalkoztok?',
    helpTextHu: 'Jelöld, ha van gép, elektronikai berendezés, elem/akkumulátor, orvostechnikai eszköz vagy más szabályozott termék.',
    whyHu: 'Egyes termékkörökre külön megfelelőségi szabályok vonatkoznak.',
    factBindings: ['machinery_activity', 'electrical_electronic_equipment', 'battery_activity', 'medical_device_role'], questionAtomKeys: ['Q-PROD-002', 'Q-PROD-003', 'Q-PROD-004', 'Q-SEC-001'],
    showWhen: notContains('product_market_role', PRODUCT_NONE),
  },
  {
    screenKey: 'SCREEN-ENVIRONMENT-STATEMENTS', order: 22, sectionKey: 'ENVIRONMENT', uiKind: 'TOGGLE_SET',
    titleHu: 'Melyik állítás igaz rátok?',
    helpTextHu: 'Jelöld mindet: csomagolás, üzleti/ipari hulladék, vegyi anyag, ipari létesítmény, jelentős energiafelhasználás, vízkibocsátás.',
    whyHu: 'Ezek a környezetvédelmi kötelezettségek fő belépő feltételei.',
    factBindings: ['packaging_activity', 'waste_generation', 'chemical_substances', 'industrial_installation', 'high_energy_use', 'water_use_or_discharge'], questionAtomKeys: ['Q-B-027', 'Q-B-028', 'Q-B-029', 'Q-B-030', 'Q-ENV-006', 'Q-ENV-005'], showWhen: null,
  },
  {
    screenKey: 'SCREEN-ENVIRONMENT-IMPORT', order: 23, sectionKey: 'ENVIRONMENT', uiKind: 'TOGGLE_SET',
    titleHu: 'Importáltok olyan árut, amely speciális környezeti szabály alá eshet?',
    helpTextHu: 'Például cement, acél, alumínium, műtrágya, fa, kávé, kakaó, szója, gumi vagy marhahús.',
    whyHu: 'Egyes importált áruknál kibocsátásjelentési vagy átvilágítási kötelezettség merülhet fel.',
    factBindings: ['cbam_imports', 'eudr_commodities'], questionAtomKeys: ['Q-ENV-007', 'Q-ENV-008'], showWhen: eq('import_into_eu', true),
  },
  {
    screenKey: 'SCREEN-SECTOR-ACTIVITY', order: 24, sectionKey: 'SECTOR', uiKind: 'TOGGLE_SET',
    titleHu: 'Érint benneteket valamelyik speciális ágazat?',
    helpTextHu: 'Élelmiszer, egészségügy, építőipar, energia, közbeszerzés vagy más engedélyköteles tevékenység.',
    whyHu: 'Az ágazati érintettség további követelménycsomagokat jelölhet.',
    factBindings: ['food_business', 'healthcare_provider', 'construction_activity', 'energy_sector_activity', 'public_procurement_activity', 'regulated_or_licensed_activity'], questionAtomKeys: ['Q-B-031', 'Q-B-032', 'Q-B-033', 'Q-B-034', 'Q-B-016', 'Q-B-035'], showWhen: null,
  },
  {
    screenKey: 'SCREEN-EXPORT-SANCTIONS', order: 25, sectionKey: 'EXPORT', uiKind: 'TOGGLE_SET',
    titleHu: 'Exportáltok érzékeny technológiát, vagy lehet kapcsolat szankciós országokkal/szereplőkkel?',
    helpTextHu: 'Ha nem vagytok biztosak benne, válasszátok a „nem tudom” opciót; ezt ügyvéd ellenőrzi.',
    whyHu: 'Az export- és szankciós érintettséget ügyvéd ellenőrzi.',
    factBindings: ['dual_use_goods_or_technology', 'sanctions_exposure'], questionAtomKeys: ['Q-SEC-002', 'Q-FIN-005'],
    showWhen: anyOf(eq('export_outside_eu', true), eq('import_into_eu', true), eq('financial_service_activity', true)),
  },
  {
    screenKey: 'SCREEN-DOCUMENTS-INTRO', order: 26, sectionKey: 'DOCUMENTS', uiKind: 'EVIDENCE_INTRO',
    titleHu: 'Van már compliance-felelős vagy rendszeresen felülvizsgált szabályzatcsomag?',
    helpTextHu: 'Ez nem dönti el, hogy vonatkozik-e rátok egy jogszabály; csak abban segít, hogy a hiányokat gyorsabban azonosítsuk.',
    whyHu: 'A hiányzó dokumentumokat és intézkedéseket ezek után kérdezzük meg, a rátok vonatkozó területeken.',
    factBindings: [], questionAtomKeys: [], showWhen: null,
  },
];

export function getCompanyProfileScreen(screenKey: string): CompanyProfileScreenDefinition | undefined {
  return COMPANY_PROFILE_SCREENS.find((screen) => screen.screenKey === screenKey);
}

const SCREEN_BY_KEY = new Map(COMPANY_PROFILE_SCREENS.map((screen) => [screen.screenKey, screen]));

export function screenHasFactBinding(screenKey: string, factKey: string): boolean {
  return SCREEN_BY_KEY.get(screenKey)?.factBindings.includes(factKey) ?? false;
}

export interface VisibleScreenResult {
  readonly screen: CompanyProfileScreenDefinition;
  readonly visibility: VisibilityResult;
}

/**
 * Screens the client should currently see. A screen is shown only when its gate
 * is definitively satisfied; undetermined gates are not shown as follow-ups
 * (the applicability engine owns the "more information / review" outcome).
 */
export function resolveVisibleScreens(state: CompanyProfileFactStateMap): readonly CompanyProfileScreenDefinition[] {
  return COMPANY_PROFILE_SCREENS
    .filter((screen) => evaluateVisibility(screen.showWhen, state) === 'VISIBLE')
    .slice()
    .sort((left, right) => left.order - right.order);
}

/** All screens that involve a given fact key (used to bound grouped saves). */
export function screensForFact(factKey: string): readonly CompanyProfileScreenDefinition[] {
  return COMPANY_PROFILE_SCREENS.filter((screen) => screen.factBindings.includes(factKey));
}

export function assertScreenCatalogIntegrity(canonicalFactKeys: ReadonlySet<string>, questionKeys: ReadonlySet<string>): void {
  const seen = new Set<string>();
  for (const screen of COMPANY_PROFILE_SCREENS) {
    if (seen.has(screen.screenKey)) throw new Error(`Duplicate screen key: ${screen.screenKey}`);
    seen.add(screen.screenKey);
    for (const factKey of screen.factBindings) {
      if (!canonicalFactKeys.has(factKey)) throw new Error(`Screen ${screen.screenKey} binds unknown fact ${factKey}`);
    }
    for (const atomKey of screen.questionAtomKeys) {
      if (!questionKeys.has(atomKey)) throw new Error(`Screen ${screen.screenKey} references unknown question atom ${atomKey}`);
    }
  }
}
