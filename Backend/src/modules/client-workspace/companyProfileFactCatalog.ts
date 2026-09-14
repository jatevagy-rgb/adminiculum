/**
 * COMPANY PROFILE 2.0 — CANONICAL FACT CATALOGUE
 *
 * Single source of truth for the canonical company facts the client-facing
 * discovery journey populates. One real-world fact exists once; many rules,
 * requirements and legal sources may depend on it. This module is data + pure
 * mapping only — it never talks to the database.
 *
 * Authority: Adminiculum_Compliance_Scoping_System_v2 (Fact_Dictionary sheet).
 * Row order mirrors that sheet so the catalogue stays auditable against it.
 *
 * The existing FactDefinition / ClientFact persistence is reused. Nothing here
 * creates a second, questionnaire-specific fact silo: every key below is the
 * canonical `FactDefinition.key`.
 */

export type CompanyProfileFactSection =
  | 'COMPANY'
  | 'OPERATIONS'
  | 'PEOPLE'
  | 'SIZE'
  | 'MARKET'
  | 'DIGITAL'
  | 'DATA'
  | 'AI'
  | 'FINANCE'
  | 'PRODUCT'
  | 'ENVIRONMENT'
  | 'SECTOR'
  | 'SPECIAL';

/**
 * Workbook value types mapped onto the existing Prisma `FactValueType` enum.
 * TEAOR25 is stored as a validated STRING code; COUNTRY as JURISDICTION.
 */
export type CompanyProfileFactValueType =
  | 'BOOLEAN'
  | 'ENUM'
  | 'MULTI_ENUM'
  | 'NUMBER'
  | 'STRING'
  | 'JURISDICTION';

export type CompanyProfileFactCardinality = 'single' | 'multi';

export type CompanyProfileFactDeterminationMethod =
  | 'USER_PROVIDED'
  | 'DERIVED'
  | 'LEGAL_CLASSIFICATION_REQUIRED';

export type CompanyProfileFactTemporalPolicy =
  | 'VALIDITY_INTERVAL'
  | 'OBSERVATION'
  | 'EFFECTIVE_INSTANT';

export type CompanyProfileFactDerivation =
  /** employee_count > 0 */
  | 'HAS_EMPLOYEES'
  /** customer_types contains the B2C option */
  | 'B2C_SALES'
  /** customer_types contains the public-sector option */
  | 'PUBLIC_SECTOR_CUSTOMER'
  /** derived from revenue/balance/headcount thresholds (EU 2003/361/EC classes) */
  | 'EU_SME_SIZE_CLASS';

export interface CompanyProfileFactDefinition {
  readonly factKey: string;
  readonly labelHu: string;
  readonly section: CompanyProfileFactSection;
  readonly valueType: CompanyProfileFactValueType;
  readonly cardinality: CompanyProfileFactCardinality;
  readonly baseline: boolean;
  readonly derived: boolean;
  readonly description: string;
  /** Present for ENUM / MULTI_ENUM facts. */
  readonly allowedEnumValues?: readonly string[];
  /** Present for facts whose stored codes come from the TEÁOR'25 catalogue. */
  readonly codeCatalog?: 'TEAOR25';
  readonly determinationMethod: CompanyProfileFactDeterminationMethod;
  /**
   * Declarative derivation. `null` means the fact is directly answered.
   * A derivation that still needs legal/technical classification is expressed
   * as `derived: true` with `determinationMethod: 'LEGAL_CLASSIFICATION_REQUIRED'`
   * and no executable derivation — the engine must route those to review rather
   * than guess.
   */
  readonly derivation: CompanyProfileFactDerivation | null;
}

// [fact_key, label_hu, section, value_type, cardinality, baseline, derived, description]
type FactRow = readonly [
  string,
  string,
  CompanyProfileFactSection,
  CompanyProfileFactValueType,
  CompanyProfileFactCardinality,
  boolean,
  boolean,
  string,
];

const FACT_ROWS: readonly FactRow[] = [
  ['company_legal_form', 'Jogi forma', 'COMPANY', 'ENUM', 'single', true, false, 'A szervezet jogi formája.'],
  ['registered_country', 'Bejegyzés országa', 'COMPANY', 'JURISDICTION', 'single', true, false, 'A szervezet bejegyzésének országa.'],
  ['operating_countries', 'Működési országok', 'COMPANY', 'JURISDICTION', 'multi', true, false, 'Mely országokban működik ténylegesen.'],
  ['primary_teaor25_code', "Fő TEÁOR'25 kód", 'OPERATIONS', 'STRING', 'single', true, false, "A fő tevékenység TEÁOR'25 kódja."],
  ['additional_teaor25_codes', "További TEÁOR'25 kódok", 'OPERATIONS', 'STRING', 'multi', true, false, 'További ténylegesen végzett tevékenységek.'],
  ['sites_count', 'Telephelyek száma', 'COMPANY', 'NUMBER', 'single', true, false, 'Telephelyek/fióktelepek száma.'],
  ['group_member', 'Vállalatcsoport tagja', 'COMPANY', 'BOOLEAN', 'single', true, false, 'Csoporttagság.'],
  ['parent_country', 'Anyavállalat országa', 'COMPANY', 'JURISDICTION', 'single', false, false, 'Csoporttagság esetén.'],
  ['listed_company', 'Tőzsdei jelenlét', 'COMPANY', 'BOOLEAN', 'single', true, false, 'Nyilvánosan jegyzett vállalkozás-e.'],
  ['state_or_public_control', 'Állami/önkormányzati kontroll', 'COMPANY', 'BOOLEAN', 'single', true, false, 'Közszféra/állami tulajdon relevanciája.'],
  ['employee_count', 'Munkavállalói létszám', 'PEOPLE', 'NUMBER', 'single', true, false, 'Aktuális foglalkoztatotti létszám.'],
  ['annual_net_revenue_eur', 'Éves nettó árbevétel EUR-ban', 'SIZE', 'NUMBER', 'single', true, false, 'Utolsó lezárt üzleti év.'],
  ['balance_sheet_total_eur', 'Mérlegfőösszeg EUR-ban', 'SIZE', 'NUMBER', 'single', true, false, 'Utolsó lezárt üzleti év.'],
  ['eu_sme_size_class', 'EU KKV méretkategória', 'SIZE', 'ENUM', 'single', false, true, 'A létszám/árbevétel/mérlegadatokból származtatott.'],
  ['public_interest_entity', 'Közérdeklődésre számot tartó gazdálkodó', 'SIZE', 'BOOLEAN', 'single', false, false, 'Számviteli/audit relevancia.'],
  ['customer_types', 'Ügyféltípusok', 'MARKET', 'MULTI_ENUM', 'multi', true, false, 'B2B/B2C/közszféra.'],
  ['b2c_sales', 'Fogyasztóknak értékesít', 'MARKET', 'BOOLEAN', 'single', true, true, 'customer_types alapján származtatható.'],
  ['distance_sales', 'Távértékesítés', 'MARKET', 'BOOLEAN', 'single', false, false, 'Webshop, telefon, e-mail stb.'],
  ['off_premises_sales', 'Üzlethelyiségen kívüli értékesítés', 'MARKET', 'BOOLEAN', 'single', false, false, 'Fogyasztói szerződések.'],
  ['ecommerce_site', 'Webshop / online rendelés', 'DIGITAL', 'BOOLEAN', 'single', true, false, 'Online értékesítés vagy rendelés.'],
  ['digital_service_provider', 'Digitális szolgáltatás nyújtása', 'DIGITAL', 'BOOLEAN', 'single', true, false, 'Digitális tartalom/szolgáltatás.'],
  ['online_intermediary_service', 'Online közvetítő/platform szolgáltatás', 'DIGITAL', 'BOOLEAN', 'single', false, false, 'DSA/P2B relevancia.'],
  ['public_sector_customer', 'Közszféra ügyfél', 'MARKET', 'BOOLEAN', 'single', true, true, 'customer_types alapján.'],
  ['public_procurement_activity', 'Közbeszerzési részvétel', 'MARKET', 'BOOLEAN', 'single', true, false, 'Ajánlattevő/ajánlatkérő érintettség.'],
  ['cross_border_eu_sales', 'EU-n belüli határon átnyúló értékesítés', 'MARKET', 'BOOLEAN', 'single', true, false, 'Más tagállami értékesítés.'],
  ['export_outside_eu', 'EU-n kívüli export', 'MARKET', 'BOOLEAN', 'single', true, false, 'Exportkontroll/szankció relevancia.'],
  ['import_into_eu', 'EU-importőr szerep', 'MARKET', 'BOOLEAN', 'single', true, false, 'EU-n kívülről behozott áru.'],
  ['personal_data_processing', 'Személyes adatok kezelése', 'DATA', 'BOOLEAN', 'single', true, false, 'Természetes személyhez kapcsolódó adat.'],
  ['special_category_data', 'Különleges adatok kezelése', 'DATA', 'BOOLEAN', 'single', true, false, 'Egészségügyi, biometrikus stb.'],
  ['criminal_data', 'Bűnügyi személyes adatok', 'DATA', 'BOOLEAN', 'single', false, false, 'Bűnügyi adatok kezelése.'],
  ['children_data', 'Gyermekek adatainak kezelése', 'DATA', 'BOOLEAN', 'single', false, false, 'Kiskorúak adatai.'],
  ['employee_monitoring', 'Munkavállalói megfigyelés', 'DATA', 'BOOLEAN', 'single', false, false, 'IT/kommunikáció/helymeghatározás stb.'],
  ['cctv_monitoring', 'Kamerás megfigyelés', 'DATA', 'BOOLEAN', 'single', false, false, 'CCTV.'],
  ['systematic_monitoring', 'Rendszeres/szisztematikus megfigyelés', 'DATA', 'BOOLEAN', 'single', false, false, 'Profilalkotás/monitoring.'],
  ['large_scale_processing', 'Nagy léptékű adatkezelés', 'DATA', 'BOOLEAN', 'single', false, false, 'GDPR kockázati trigger.'],
  ['third_country_data_transfer', 'EGT-n kívüli adattovábbítás', 'DATA', 'BOOLEAN', 'single', false, false, 'Harmadik ország.'],
  ['processor_for_clients', 'Adatfeldolgozóként jár el', 'DATA', 'BOOLEAN', 'single', false, false, 'Más adatkezelő megbízásából.'],
  ['direct_marketing', 'Direkt marketing', 'DATA', 'BOOLEAN', 'single', false, false, 'E-mail/SMS/online marketing.'],
  ['critical_it_dependency', 'Kritikus IT-függőség', 'DIGITAL', 'BOOLEAN', 'single', true, false, 'Működés lényeges informatikai rendszerektől függ.'],
  ['cloud_or_saas_use', 'Cloud/SaaS használat', 'DIGITAL', 'BOOLEAN', 'single', true, false, 'Külső felhő/szoftver szolgáltatás.'],
  ['managed_it_service_provider', 'IT/MSP/MSSP szolgáltató', 'DIGITAL', 'BOOLEAN', 'single', false, false, 'NIS2 ágazati relevancia.'],
  ['data_center_or_cloud_provider', 'Adatközpont/felhő szolgáltató', 'DIGITAL', 'BOOLEAN', 'single', false, false, 'NIS2/DSA jellegű ágazati relevancia.'],
  ['nis2_sector', 'NIS2 érintett ágazat/típus', 'DIGITAL', 'ENUM', 'single', false, true, 'TEÁOR + szolgáltatás alapján származtatandó.'],
  ['ai_use', 'MI-rendszer használata', 'AI', 'BOOLEAN', 'single', true, false, 'Bármilyen AI/MI-rendszer üzleti használata.'],
  ['ai_role', 'MI szerepkör', 'AI', 'MULTI_ENUM', 'multi', false, false, 'Provider/deployer/importer/distributor/product manufacturer.'],
  ['ai_high_risk_context', 'MI nagy kockázatú felhasználási kontextus', 'AI', 'MULTI_ENUM', 'multi', false, false, 'HR, hitelbírálat, biometria, alapvető szolgáltatás stb.'],
  ['ai_customer_facing', 'Ügyféllel közvetlenül interakcióba lépő MI', 'AI', 'BOOLEAN', 'single', false, false, 'Transzparencia relevancia.'],
  ['has_employees', 'Foglalkoztató', 'PEOPLE', 'BOOLEAN', 'single', true, true, 'employee_count > 0.'],
  ['temporary_agency_work', 'Munkaerő-kölcsönzés', 'PEOPLE', 'BOOLEAN', 'single', false, false, 'Kölcsönbeadó/kölcsönvevő.'],
  ['posted_workers', 'Kiküldött munkavállalók', 'PEOPLE', 'BOOLEAN', 'single', false, false, 'EU-s kiküldetés.'],
  ['whistle_special_sector', 'Speciális whistleblowing ágazat', 'PEOPLE', 'BOOLEAN', 'single', false, true, 'Ágazati tényekből származtatandó.'],
  ['financial_service_activity', 'Pénzügyi szolgáltatás', 'FINANCE', 'BOOLEAN', 'single', true, false, 'Hitel, pénzforgalom, befektetés, biztosítás stb.'],
  ['payment_service_activity', 'Pénzforgalmi szolgáltatás', 'FINANCE', 'BOOLEAN', 'single', false, false, 'PSD2/DORA.'],
  ['investment_service_activity', 'Befektetési szolgáltatás', 'FINANCE', 'BOOLEAN', 'single', false, false, 'Bszt./DORA.'],
  ['insurance_activity', 'Biztosítási tevékenység', 'FINANCE', 'BOOLEAN', 'single', false, false, 'Bit./DORA.'],
  ['crypto_asset_activity', 'Kriptoeszköz-szolgáltatás/kibocsátás', 'FINANCE', 'BOOLEAN', 'single', false, false, 'MiCA/AML.'],
  ['aml_obliged_entity', 'Pmt. szerinti szolgáltatói kör', 'FINANCE', 'BOOLEAN', 'single', false, true, 'Ágazat/tevékenység alapján származtatandó.'],
  ['sanctions_exposure', 'Szankciós kitettség', 'FINANCE', 'BOOLEAN', 'single', false, false, 'Országok, partnerek, áruk alapján.'],
  ['product_market_role', 'Termékpiaci szerep', 'PRODUCT', 'MULTI_ENUM', 'multi', true, false, 'Gyártó/importőr/forgalmazó/szolgáltató.'],
  ['consumer_products', 'Fogyasztói termék forgalmazása', 'PRODUCT', 'BOOLEAN', 'single', true, false, 'GPSR relevancia.'],
  ['machinery_activity', 'Gép/gépi termék érintettség', 'PRODUCT', 'BOOLEAN', 'single', false, false, 'Machinery Regulation.'],
  ['electrical_electronic_equipment', 'EEE érintettség', 'PRODUCT', 'BOOLEAN', 'single', false, false, 'WEEE/RoHS.'],
  ['battery_activity', 'Elem/akkumulátor érintettség', 'PRODUCT', 'BOOLEAN', 'single', false, false, 'Battery Regulation.'],
  ['packaging_activity', 'Csomagolás forgalomba hozatala/használata', 'ENVIRONMENT', 'BOOLEAN', 'single', true, false, 'PPWR/EPR.'],
  ['epr_product_category', 'EPR termékkategória', 'ENVIRONMENT', 'MULTI_ENUM', 'multi', false, false, 'HU EPR.'],
  ['waste_generation', 'Hulladék keletkezik', 'ENVIRONMENT', 'BOOLEAN', 'single', true, false, 'Hulladékgazdálkodás.'],
  ['hazardous_waste', 'Veszélyes hulladék', 'ENVIRONMENT', 'BOOLEAN', 'single', false, false, 'Hulladék compliance.'],
  ['chemical_substances', 'Vegyi anyag/keverék gyártása vagy forgalmazása', 'ENVIRONMENT', 'BOOLEAN', 'single', true, false, 'REACH/CLP.'],
  ['hazardous_chemicals', 'Veszélyesként osztályozott anyag/keverék', 'ENVIRONMENT', 'BOOLEAN', 'single', false, false, 'CLP/kémiai biztonság.'],
  ['industrial_installation', 'Ipari létesítmény / engedélyköteles tevékenység', 'ENVIRONMENT', 'BOOLEAN', 'single', true, false, 'IED/EKHE.'],
  ['eu_ets_activity', 'EU ETS hatályú tevékenység', 'ENVIRONMENT', 'BOOLEAN', 'single', false, true, 'Tevékenységlista alapján.'],
  ['water_use_or_discharge', 'Vízkivétel/vízhasználat/kibocsátás', 'ENVIRONMENT', 'BOOLEAN', 'single', false, false, 'Vízjog.'],
  ['high_energy_use', 'Jelentős energiafelhasználás', 'ENVIRONMENT', 'BOOLEAN', 'single', false, false, 'Energiahatékonyság.'],
  ['cbam_imports', 'CBAM-termék importja', 'ENVIRONMENT', 'BOOLEAN', 'single', false, false, 'CBAM.'],
  ['eudr_commodities', 'EUDR releváns áru/termék', 'ENVIRONMENT', 'MULTI_ENUM', 'multi', false, false, 'Szarvasmarha, kakaó, kávé, olajpálma, gumi, szója, fa és releváns termékek.'],
  ['food_business', 'Élelmiszer-vállalkozás', 'SECTOR', 'BOOLEAN', 'single', true, false, 'Élelmiszerlánc.'],
  ['healthcare_provider', 'Egészségügyi szolgáltató', 'SECTOR', 'BOOLEAN', 'single', true, false, 'Egészségügyi jog.'],
  ['medical_device_role', 'Orvostechnikai eszköz/IVD szerep', 'SECTOR', 'MULTI_ENUM', 'multi', false, false, 'Gyártó/importőr/forgalmazó/intézmény.'],
  ['construction_activity', 'Építőipari/építészeti tevékenység', 'SECTOR', 'BOOLEAN', 'single', true, false, 'Építésjog.'],
  ['energy_sector_activity', 'Energiaágazati tevékenység', 'SECTOR', 'BOOLEAN', 'single', true, false, 'Villamos energia/földgáz/energiahatékonyság.'],
  ['regulated_or_licensed_activity', 'Engedélyköteles/szabályozott tevékenység', 'SPECIAL', 'BOOLEAN', 'single', true, false, 'Ágazati szabályok aktiválása.'],
  ['dual_use_goods_or_technology', 'Kettősfelhasználású termék/technológia', 'SPECIAL', 'BOOLEAN', 'single', false, false, 'Exportkontroll.'],
];

/**
 * Fixed option sets for ENUM / MULTI_ENUM facts. The option strings are the
 * client-facing Hungarian values and are also the stored canonical values.
 */
const ENUM_VALUES: Readonly<Record<string, readonly string[]>> = {
  company_legal_form: ['Kft.', 'Zrt.', 'Nyrt.', 'Bt.', 'Kkt.', 'Egyéni vállalkozó', 'Egyesület', 'Alapítvány', 'Közszerv', 'Egyéb'],
  eu_sme_size_class: ['MIKRO', 'KIS', 'KÖZEPES', 'NAGY'],
  customer_types: ['Vállalkozások (B2B)', 'Fogyasztók (B2C)', 'Közszféra', 'Kapcsolt vállalkozások', 'Egyéb'],
  ai_role: ['Fejlesztő/szolgáltató', 'Üzembe helyező/felhasználó', 'Importőr', 'Forgalmazó', 'MI-t tartalmazó termék gyártója', 'Nem tudom'],
  ai_high_risk_context: ['Toborzás/HR', 'Hitelképesség/árképzés', 'Biometria', 'Egészségügy', 'Oktatás', 'Alapvető szolgáltatáshoz hozzáférés', 'Biztonsági funkció', 'Egyéb', 'Nem tudom'],
  product_market_role: ['Gyártó', 'Importőr', 'Forgalmazó', 'Meghatalmazott képviselő', 'Nincs'],
  epr_product_category: ['Csomagolás', 'Elektromos/elektronikus berendezés', 'Elem/akkumulátor', 'Gépjármű', 'Gumiabroncs', 'Irodai/reklámhordozó papír', 'Sütőolaj/zsír', 'Textil', 'Fa bútor', 'Egyéb', 'Nem tudom'],
  eudr_commodities: ['Szarvasmarha', 'Kakaó', 'Kávé', 'Olajpálma', 'Gumi', 'Szója', 'Fa', 'Egyik sem', 'Nem tudom'],
  medical_device_role: ['Gyártó', 'Importőr', 'Forgalmazó', 'Egészségügyi intézmény', 'Nincs'],
  // Conservative NIS2 sector list (Annex I/II domains). Membership still
  // requires legal classification; the value is never auto-derived here.
  nis2_sector: [
    'ENERGIA', 'KÖZLEKEDÉS', 'BANK', 'PÉNZÜGYI PIACI INFRASTRUKTÚRA', 'EGÉSZSÉGÜGY', 'IVÓVÍZ',
    'SZENNYVÍZ', 'DIGITÁLIS INFRASTRUKTÚRA', 'IKT-SZOLGÁLTATÁSMENEDZSMENT', 'KÖZIGAZGATÁS',
    'ŰR', 'POSTAI ÉS FUTÁRSZOLGÁLTATÁS', 'HULLADÉKGAZDÁLKODÁS', 'VEGYI ANYAGOK', 'ÉLELMISZER',
    'GYÁRTÁS', 'DIGITÁLIS SZOLGÁLTATÁSOK', 'KUTATÁS',
  ],
};

/** Declarative derivations that are deterministic from already-answered facts. */
const DETERMINISTIC_DERIVATIONS: Readonly<Record<string, CompanyProfileFactDerivation>> = {
  has_employees: 'HAS_EMPLOYEES',
  b2c_sales: 'B2C_SALES',
  public_sector_customer: 'PUBLIC_SECTOR_CUSTOMER',
  eu_sme_size_class: 'EU_SME_SIZE_CLASS',
};

function determinationFor(row: FactRow): CompanyProfileFactDeterminationMethod {
  const [key, , , , , , derived] = row;
  if (!derived) return 'USER_PROVIDED';
  if (DETERMINISTIC_DERIVATIONS[key]) return 'DERIVED';
  // Derived, but the derivation depends on sector/legal classification that
  // this slice cannot perform: nis2_sector, whistle_special_sector,
  // aml_obliged_entity, eu_ets_activity.
  return 'LEGAL_CLASSIFICATION_REQUIRED';
}

function toDefinition(row: FactRow): CompanyProfileFactDefinition {
  const [factKey, labelHu, section, valueType, cardinality, baseline, derived, description] = row;
  const isCoded = factKey === 'primary_teaor25_code' || factKey === 'additional_teaor25_codes';
  return {
    factKey,
    labelHu,
    section,
    valueType,
    cardinality,
    baseline,
    derived,
    description,
    allowedEnumValues: ENUM_VALUES[factKey],
    codeCatalog: isCoded ? 'TEAOR25' : undefined,
    determinationMethod: determinationFor(row),
    derivation: DETERMINISTIC_DERIVATIONS[factKey] ?? null,
  };
}

export const CANONICAL_COMPANY_FACTS: readonly CompanyProfileFactDefinition[] = FACT_ROWS.map(toDefinition);

const FACT_BY_KEY = new Map(CANONICAL_COMPANY_FACTS.map((fact) => [fact.factKey, fact]));

export function getCanonicalCompanyFact(factKey: string): CompanyProfileFactDefinition | undefined {
  return FACT_BY_KEY.get(factKey);
}

export function isCanonicalCompanyFactKey(factKey: string): boolean {
  return FACT_BY_KEY.has(factKey);
}

export const CANONICAL_COMPANY_FACT_KEYS: readonly string[] = CANONICAL_COMPANY_FACTS.map((fact) => fact.factKey);

export const BASELINE_COMPANY_FACT_KEYS: readonly string[] = CANONICAL_COMPANY_FACTS.filter((fact) => fact.baseline).map((fact) => fact.factKey);

export const DERIVED_COMPANY_FACT_KEYS: readonly string[] = CANONICAL_COMPANY_FACTS.filter((fact) => fact.derived).map((fact) => fact.factKey);

/**
 * RECONCILIATION WITH EXISTING MASTER FACT KEYS
 *
 * The repository already provisions and stores a small set of company-profile
 * fact keys (`fact_definitions` rows created by migration
 * 20260914100000_provision_company_profile_fact_definitions). Those keys are
 * NOT destroyed or renamed. They are declared here as legacy aliases of the
 * canonical workbook fact so that:
 *
 *   - there is still exactly ONE canonical namespace (no parallel fact silo);
 *   - previously stored ClientFact rows keep resolving to a canonical meaning;
 *   - new questions can bind to canonical keys while the legacy keys remain
 *     readable until the portal is migrated.
 *
 * `employee_count` is already canonical and maps to itself.
 */
export const LEGACY_FACT_KEY_ALIASES: Readonly<Record<string, string>> = {
  employee_count: 'employee_count',
  company_main_activity: 'primary_teaor25_code',
  company_operating_country: 'operating_countries',
  company_regulated_activity: 'regulated_or_licensed_activity',
  company_sensitive_data_usage: 'special_category_data',
  company_important_it_system: 'critical_it_dependency',
  company_ai_usage: 'ai_use',
  company_export_activity: 'export_outside_eu',
};

/** Resolves a legacy stored fact key to its canonical workbook key. */
export function canonicalKeyForLegacyFactKey(factKey: string): string | undefined {
  return LEGACY_FACT_KEY_ALIASES[factKey];
}

/** True when the key is a retained legacy alias rather than a canonical key. */
export function isLegacyFactKeyAlias(factKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(LEGACY_FACT_KEY_ALIASES, factKey)
    && LEGACY_FACT_KEY_ALIASES[factKey] !== factKey;
}

/**
 * Guard: every legacy alias must resolve to a real canonical fact, and no alias
 * may shadow a canonical key with a different meaning. This is what prevents
 * the reconciliation from drifting into a second fact silo.
 */
export function assertFactReconciliationIntegrity(): void {
  for (const [legacyKey, canonicalKey] of Object.entries(LEGACY_FACT_KEY_ALIASES)) {
    if (!FACT_BY_KEY.has(canonicalKey)) {
      throw new Error(`Legacy fact alias ${legacyKey} points at unknown canonical fact ${canonicalKey}.`);
    }
    if (legacyKey !== canonicalKey && FACT_BY_KEY.has(legacyKey)) {
      throw new Error(`Legacy fact alias ${legacyKey} shadows an existing canonical fact key.`);
    }
  }
}
