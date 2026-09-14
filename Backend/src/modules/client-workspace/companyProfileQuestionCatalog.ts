/**
 * COMPANY PROFILE 2.0 — CANONICAL QUESTION CATALOGUE
 *
 * The client-facing discovery questions, their canonical fact bindings and the
 * declarative visibility rules that make the questionnaire adaptive.
 *
 * Authority: Adminiculum_Compliance_Scoping_System_v2
 *   - Question_Catalog       -> question id, module, fact, answer type, options, show_when
 *   - Ugyfel_kerdoiv          -> the client-facing wording and per-screen grouping
 *   - Valasz_kovetkezmeny    -> the branching consequences encoded as visibility rules
 *   - Modul_Flow             -> module entry triggers
 *
 * Visibility is DECLARATIVE. The renderer and the answer service evaluate
 * `applyCompanyProfileVisibility` against canonical fact state; they never
 * hardcode a nested condition tree.
 *
 * This module is pure data + pure helpers. It never talks to the database and
 * never exposes internal ids or rule-engine terminology to the client.
 */

import { CANONICAL_COMPANY_FACTS, getCanonicalCompanyFact } from './companyProfileFactCatalog';

export type CompanyProfileModule =
  | 'BASE'
  | 'DATA'
  | 'CYBER'
  | 'AI'
  | 'HR'
  | 'CONSUMER'
  | 'DIGITAL'
  | 'FINANCE'
  | 'PRODUCT'
  | 'ENVIRONMENT'
  | 'HEALTH'
  | 'EXPORT';

/**
 * Client answer shapes. `*_UNKNOWN` variants additionally render a
 * "Nem tudom" option that records an UNKNOWN fact answer and can route the
 * area to lawyer review.
 */
export type CompanyProfileAnswerType =
  | 'BOOLEAN'
  | 'BOOLEAN_UNKNOWN'
  | 'ENUM'
  | 'MULTI_ENUM'
  | 'NUMBER'
  | 'COUNTRY'
  | 'COUNTRY_MULTI'
  | 'TEAOR25'
  | 'TEAOR25_MULTI';

export type CompanyProfileVisibilityAtom =
  | { readonly kind: 'factEquals'; readonly factKey: string; readonly value: boolean | string | number }
  | { readonly kind: 'factGreaterThan'; readonly factKey: string; readonly value: number }
  | { readonly kind: 'factGreaterOrEqual'; readonly factKey: string; readonly value: number }
  | { readonly kind: 'factTruthy'; readonly factKey: string }
  | { readonly kind: 'factContains'; readonly factKey: string; readonly value: string }
  | { readonly kind: 'factNotContains'; readonly factKey: string; readonly value: string }
  | { readonly kind: 'allOf'; readonly conditions: readonly CompanyProfileVisibilityAtom[] }
  | { readonly kind: 'anyOf'; readonly conditions: readonly CompanyProfileVisibilityAtom[] };

export type CompanyProfileVisibilityCondition = CompanyProfileVisibilityAtom | null;

const eq = (factKey: string, value: boolean | string | number): CompanyProfileVisibilityAtom => ({ kind: 'factEquals', factKey, value });
const gt = (factKey: string, value: number): CompanyProfileVisibilityAtom => ({ kind: 'factGreaterThan', factKey, value });
const truthy = (factKey: string): CompanyProfileVisibilityAtom => ({ kind: 'factTruthy', factKey });
const contains = (factKey: string, value: string): CompanyProfileVisibilityAtom => ({ kind: 'factContains', factKey, value });
const notContains = (factKey: string, value: string): CompanyProfileVisibilityAtom => ({ kind: 'factNotContains', factKey, value });
const anyOf = (...conditions: readonly CompanyProfileVisibilityAtom[]): CompanyProfileVisibilityAtom => ({ kind: 'anyOf', conditions });

export interface CompanyProfileQuestionDefinition {
  readonly questionKey: string;
  readonly module: CompanyProfileModule;
  /** One screen may populate several canonical facts. */
  readonly factKeys: readonly string[];
  readonly labelHu: string;
  readonly helpTextHu: string;
  /** Optional client-facing "Miért kérdezzük?" explanation. */
  readonly whyHu: string;
  readonly answerType: CompanyProfileAnswerType;
  readonly optionsHu: readonly string[];
  readonly baseline: boolean;
  readonly showWhen: CompanyProfileVisibilityCondition;
  readonly required: boolean;
}

function options(factKey: string): readonly string[] {
  return getCanonicalCompanyFact(factKey)?.allowedEnumValues ?? [];
}

const B2C_OPTION = 'Fogyasztók (B2C)';
const PUBLIC_SECTOR_OPTION = 'Közszféra';
const PRODUCT_ROLE_NONE = 'Nincs';

export const CANONICAL_COMPANY_QUESTIONS: readonly CompanyProfileQuestionDefinition[] = [
  // ---------------------------------------------------------------- BASE
  { questionKey: 'Q-B-001', module: 'BASE', factKeys: ['company_legal_form'], labelHu: 'Mi a vállalkozás jogi formája?', helpTextHu: 'Pl. Kft., Zrt., Nyrt., egyesület, alapítvány.', whyHu: 'A jogi forma határozza meg a társasági és beszámolási kötelezettségek alapját.', answerType: 'ENUM', optionsHu: options('company_legal_form'), baseline: true, showWhen: null, required: true },
  { questionKey: 'Q-B-002', module: 'BASE', factKeys: ['registered_country'], labelHu: 'Melyik országban van bejegyezve a szervezet?', helpTextHu: 'A hivatalos bejegyzés szerinti ország.', whyHu: 'A bejegyzés országa határozza meg, melyik jogrend alapkövetelményeit kell vizsgálni.', answerType: 'COUNTRY', optionsHu: [], baseline: true, showWhen: null, required: true },
  { questionKey: 'Q-B-003', module: 'BASE', factKeys: ['operating_countries'], labelHu: 'Mely országokban működik ténylegesen?', helpTextHu: 'Jelölje azokat az országokat is, ahol telephelye, munkavállalója vagy rendszeres üzleti tevékenysége van.', whyHu: 'A tényleges működési országok területi hatályt jelölnek ki több jogterületen.', answerType: 'COUNTRY_MULTI', optionsHu: [], baseline: true, showWhen: null, required: true },
  { questionKey: 'Q-B-004', module: 'BASE', factKeys: ['primary_teaor25_code'], labelHu: "Mi a fő tevékenység TEÁOR'25 kódja?", helpTextHu: 'Kód + megnevezés keresőből.', whyHu: 'A fő tevékenység az ágazati szabályok első szűrője.', answerType: 'TEAOR25', optionsHu: [], baseline: true, showWhen: null, required: true },
  { questionKey: 'Q-B-005', module: 'BASE', factKeys: ['additional_teaor25_codes'], labelHu: 'Milyen további tevékenységeket végez ténylegesen?', helpTextHu: "Több TEÁOR'25 kód is megadható.", whyHu: 'A ténylegesen végzett további tevékenységek további ágazati szabályokat aktiválhatnak.', answerType: 'TEAOR25_MULTI', optionsHu: [], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-006', module: 'BASE', factKeys: ['sites_count'], labelHu: 'Hány telephelyen/fióktelepen működik?', helpTextHu: '', whyHu: 'A telephelyek száma a munkavédelmi és környezeti kötelezettségeket befolyásolja.', answerType: 'NUMBER', optionsHu: [], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-007', module: 'BASE', factKeys: ['group_member'], labelHu: 'Vállalatcsoport tagja a szervezet?', helpTextHu: '', whyHu: 'A csoporttagság csoportszintű beszámolási és átvilágítási kötelezettségeket hozhat.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-008', module: 'BASE', factKeys: ['listed_company'], labelHu: 'Tőzsdén jegyzett társaság?', helpTextHu: '', whyHu: 'A tőzsdei jelenlét szigorúbb beszámolási és fenntarthatósági küszöböket jelenthet.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-009', module: 'BASE', factKeys: ['state_or_public_control'], labelHu: 'Állami vagy önkormányzati tulajdon/irányítás alatt áll?', helpTextHu: '', whyHu: 'A közszféra kontroll egyes reziliencia- és átláthatósági szabályokat aktivál.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-010', module: 'BASE', factKeys: ['employee_count'], labelHu: 'Hány főt foglalkoztat jelenleg?', helpTextHu: 'A munkaviszonyban és egyéb foglalkoztatási jogviszonyban állók számát külön később pontosíthatjuk.', whyHu: 'A létszám számos méretküszöb (bejelentés, kiberbiztonság, beszámolás) alapja.', answerType: 'NUMBER', optionsHu: [], baseline: true, showWhen: null, required: true },
  { questionKey: 'Q-B-011', module: 'BASE', factKeys: ['annual_net_revenue_eur'], labelHu: 'Mekkora volt az utolsó lezárt üzleti év nettó árbevétele?', helpTextHu: 'EUR-ban vagy automatikusan átszámítva.', whyHu: 'Az árbevétel a méretkategória és küszöbszabályok része.', answerType: 'NUMBER', optionsHu: [], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-012', module: 'BASE', factKeys: ['balance_sheet_total_eur'], labelHu: 'Mekkora volt az utolsó lezárt üzleti év mérlegfőösszege?', helpTextHu: 'EUR-ban vagy automatikusan átszámítva.', whyHu: 'A mérlegfőösszeg a méretkategória és küszöbszabályok része.', answerType: 'NUMBER', optionsHu: [], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-013', module: 'BASE', factKeys: ['customer_types'], labelHu: 'Kiknek értékesít vagy nyújt szolgáltatást?', helpTextHu: 'Több is jelölhető.', whyHu: 'Az ügyféltípus dönti el, hogy fogyasztóvédelmi és közbeszerzési szabályok relevánsak-e.', answerType: 'MULTI_ENUM', optionsHu: options('customer_types'), baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-014', module: 'BASE', factKeys: ['ecommerce_site'], labelHu: 'Van webshopja vagy online rendelési/előfizetési felülete?', helpTextHu: '', whyHu: 'Az online értékesítéshez külön fogyasztói tájékoztatási szabályok kapcsolódnak.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-015', module: 'BASE', factKeys: ['digital_service_provider'], labelHu: 'Nyújt digitális szolgáltatást vagy digitális tartalmat?', helpTextHu: 'Pl. SaaS, app, online platform, digitális tartalom.', whyHu: 'A digitális szolgáltatás több digitális jogterület hatályát jelölheti ki.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-016', module: 'BASE', factKeys: ['public_procurement_activity'], labelHu: 'Részt vesz közbeszerzésben ajánlattevőként vagy ajánlatkérőként?', helpTextHu: '', whyHu: 'A közbeszerzési részvétel külön eljárási kötelezettségeket jelent.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-017', module: 'BASE', factKeys: ['cross_border_eu_sales'], labelHu: 'Értékesít vagy szolgáltat más EU-tagállamba?', helpTextHu: '', whyHu: 'A határon átnyúló értékesítés áfa- és fogyasztóvédelmi szabályokat érint.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-018', module: 'BASE', factKeys: ['export_outside_eu'], labelHu: 'Exportál EU-n kívüli országba?', helpTextHu: '', whyHu: 'Az EU-n kívüli export exportkontroll- és szankciós kérdéseket vet fel.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-019', module: 'BASE', factKeys: ['import_into_eu'], labelHu: 'Importál árut EU-n kívülről?', helpTextHu: '', whyHu: 'Az import termék- és környezeti kötelezettségeket hozhat (CBAM, EUDR, GPSR).', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-020', module: 'BASE', factKeys: ['personal_data_processing'], labelHu: 'Kezel természetes személyekhez kapcsolódó személyes adatokat?', helpTextHu: 'Ide tartozik a munkavállalói, ügyfél-, kapcsolattartói és felhasználói adat is.', whyHu: 'A személyes adat kezelése nyitja meg az adatvédelmi kérdéseket.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: true, showWhen: null, required: true },
  { questionKey: 'Q-B-021', module: 'BASE', factKeys: ['special_category_data'], labelHu: 'Kezel egészségügyi, biometrikus, genetikai vagy más különleges személyes adatot?', helpTextHu: '', whyHu: 'A különleges adatok fokozott védelmi és hatásvizsgálati kötelezettségeket hozhatnak.', answerType: 'BOOLEAN_UNKNOWN', optionsHu: ['Igen', 'Nem', 'Nem tudom'], baseline: false, showWhen: anyOf(eq('personal_data_processing', true)), required: false },
  { questionKey: 'Q-B-022', module: 'BASE', factKeys: ['critical_it_dependency'], labelHu: 'A működés lényegesen függ informatikai rendszerektől?', helpTextHu: 'Olyan rendszer, amelynek kiesése érdemben akadályozná a működést.', whyHu: 'A kritikus IT-függőség kiberbiztonsági kockázatot és kontrollokat jelez.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-023', module: 'BASE', factKeys: ['cloud_or_saas_use'], labelHu: 'Használ külső felhő- vagy SaaS-szolgáltatásokat?', helpTextHu: '', whyHu: 'A felhőszolgáltatások adatkezelési és beszállítói kockázatot jelentenek.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-024', module: 'BASE', factKeys: ['ai_use'], labelHu: 'Használ mesterséges intelligencián alapuló rendszert vagy szolgáltatást?', helpTextHu: 'Pl. generatív AI, HR/értékelő rendszer, chatbot, döntéstámogatás.', whyHu: 'Az MI használata nyitja meg az MI-jogi kérdéseket.', answerType: 'BOOLEAN_UNKNOWN', optionsHu: ['Igen', 'Nem', 'Nem tudom'], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-025', module: 'BASE', factKeys: ['financial_service_activity'], labelHu: 'Végez pénzügyi, pénzforgalmi, befektetési, biztosítási vagy kriptoeszköz-szolgáltatást?', helpTextHu: '', whyHu: 'A pénzügyi szolgáltatás külön ágazati és reziliencia-szabályokat aktivál.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-026', module: 'BASE', factKeys: ['product_market_role'], labelHu: 'Van termékpiaci szerepe?', helpTextHu: 'Több is jelölhető.', whyHu: 'A termékpiaci szerep határozza meg a termékmegfelelőségi kötelezettségeket.', answerType: 'MULTI_ENUM', optionsHu: options('product_market_role'), baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-027', module: 'BASE', factKeys: ['packaging_activity'], labelHu: 'Helyez forgalomba vagy használ csomagolást termékértékesítéshez?', helpTextHu: '', whyHu: 'A csomagolás EPR- és csomagolási kötelezettségeket jelent.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-028', module: 'BASE', factKeys: ['waste_generation'], labelHu: 'Keletkezik a működés során üzleti/ipari hulladék?', helpTextHu: '', whyHu: 'A hulladékképződés hulladékgazdálkodási kötelezettségeket hoz.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-029', module: 'BASE', factKeys: ['chemical_substances'], labelHu: 'Gyárt, importál, használ vagy forgalmaz vegyi anyagot vagy keveréket?', helpTextHu: '', whyHu: 'A vegyi anyagok REACH/CLP kötelezettségeket aktiválnak.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-030', module: 'BASE', factKeys: ['industrial_installation'], labelHu: 'Üzemeltet ipari létesítményt vagy környezeti engedélyköteles technológiát?', helpTextHu: '', whyHu: 'Az ipari létesítmény környezetvédelmi engedélyezési kört jelölhet.', answerType: 'BOOLEAN_UNKNOWN', optionsHu: ['Igen', 'Nem', 'Nem tudom'], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-031', module: 'BASE', factKeys: ['food_business'], labelHu: 'Élelmiszer előállításával, forgalmazásával vagy vendéglátással foglalkozik?', helpTextHu: '', whyHu: 'Az élelmiszervállalkozás élelmiszer-biztonsági kötelezettségeket hoz.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-032', module: 'BASE', factKeys: ['healthcare_provider'], labelHu: 'Nyújt egészségügyi szolgáltatást?', helpTextHu: '', whyHu: 'Az egészségügyi szolgáltatás ágazati és adatvédelmi kötelezettségeket aktivál.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-033', module: 'BASE', factKeys: ['construction_activity'], labelHu: 'Végez építőipari, kivitelezési, tervezési vagy építészeti tevékenységet?', helpTextHu: '', whyHu: 'Az építőipari tevékenység építésjogi kötelezettségeket hoz.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-034', module: 'BASE', factKeys: ['energy_sector_activity'], labelHu: 'Végez villamosenergia-, földgáz- vagy más energiaágazati tevékenységet?', helpTextHu: '', whyHu: 'Az energiaágazati tevékenység ágazati szabályokat aktivál.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: true, showWhen: null, required: false },
  { questionKey: 'Q-B-035', module: 'BASE', factKeys: ['regulated_or_licensed_activity'], labelHu: 'Végez külön engedélyhez, nyilvántartásba vételhez vagy szakhatósági feltételhez kötött tevékenységet?', helpTextHu: '', whyHu: 'Az engedélyköteles tevékenység további ágazati követelményeket jelölhet.', answerType: 'BOOLEAN_UNKNOWN', optionsHu: ['Igen', 'Nem', 'Nem tudom'], baseline: true, showWhen: null, required: false },

  // ---------------------------------------------------------------- DATA
  { questionKey: 'Q-DATA-001', module: 'DATA', factKeys: ['criminal_data'], labelHu: 'Kezel bűnügyi személyes adatot?', helpTextHu: '', whyHu: 'A bűnügyi adatok kezelése fokozott követelményeket hoz.', answerType: 'BOOLEAN_UNKNOWN', optionsHu: ['Igen', 'Nem', 'Nem tudom'], baseline: false, showWhen: eq('personal_data_processing', true), required: false },
  { questionKey: 'Q-DATA-002', module: 'DATA', factKeys: ['children_data'], labelHu: 'Kezel kiskorúak személyes adatait?', helpTextHu: '', whyHu: 'A kiskorúak adatai fokozott védelmet igényelnek.', answerType: 'BOOLEAN_UNKNOWN', optionsHu: ['Igen', 'Nem', 'Nem tudom'], baseline: false, showWhen: eq('personal_data_processing', true), required: false },
  { questionKey: 'Q-DATA-003', module: 'DATA', factKeys: ['employee_monitoring'], labelHu: 'Figyeli munkavállalók e-mailjét, internet-használatát, helyzetét vagy eszközhasználatát?', helpTextHu: '', whyHu: 'A munkavállalói megfigyelés adatvédelmi és munkajogi kérdéseket vet fel.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: false, showWhen: gt('employee_count', 0), required: false },
  { questionKey: 'Q-DATA-004', module: 'DATA', factKeys: ['cctv_monitoring'], labelHu: 'Működtet kamerás megfigyelést?', helpTextHu: '', whyHu: 'A kamerás megfigyeléshez külön dokumentáció és tájékoztatás szükséges.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: false, showWhen: eq('personal_data_processing', true), required: false },
  { questionKey: 'Q-DATA-005', module: 'DATA', factKeys: ['systematic_monitoring'], labelHu: 'Végez rendszeres profilalkotást vagy nagyszámú személy szisztematikus megfigyelését?', helpTextHu: '', whyHu: 'A szisztematikus megfigyelés hatásvizsgálati kötelezettséget hozhat.', answerType: 'BOOLEAN_UNKNOWN', optionsHu: ['Igen', 'Nem', 'Nem tudom'], baseline: false, showWhen: eq('personal_data_processing', true), required: false },
  { questionKey: 'Q-DATA-006', module: 'DATA', factKeys: ['large_scale_processing'], labelHu: 'Nagy léptékben kezel személyes vagy különleges adatot?', helpTextHu: '', whyHu: 'A nagy léptékű adatkezelés magasabb kockázati szintet jelenthet.', answerType: 'BOOLEAN_UNKNOWN', optionsHu: ['Igen', 'Nem', 'Nem tudom'], baseline: false, showWhen: eq('personal_data_processing', true), required: false },
  { questionKey: 'Q-DATA-007', module: 'DATA', factKeys: ['third_country_data_transfer'], labelHu: 'Továbbít személyes adatot az EGT-n kívülre, vagy fér hozzá ilyen országból szolgáltató?', helpTextHu: '', whyHu: 'A harmadik országba történő továbbítás jogalapját külön ellenőrizni kell.', answerType: 'BOOLEAN_UNKNOWN', optionsHu: ['Igen', 'Nem', 'Nem tudom'], baseline: false, showWhen: eq('personal_data_processing', true), required: false },
  { questionKey: 'Q-DATA-008', module: 'DATA', factKeys: ['processor_for_clients'], labelHu: 'Kezel ügyfelei nevében személyes adatot adatfeldolgozóként?', helpTextHu: '', whyHu: 'Az adatfeldolgozói szerep szerződéses és dokumentációs kötelezettségeket hoz.', answerType: 'BOOLEAN_UNKNOWN', optionsHu: ['Igen', 'Nem', 'Nem tudom'], baseline: false, showWhen: eq('personal_data_processing', true), required: false },
  { questionKey: 'Q-DATA-009', module: 'DATA', factKeys: ['direct_marketing'], labelHu: 'Küld marketing e-mailt/SMS-t vagy végez célzott direkt marketinget?', helpTextHu: '', whyHu: 'A direkt marketing hozzájárulási és tájékoztatási szabályokat érint.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: false, showWhen: eq('personal_data_processing', true), required: false },

  // --------------------------------------------------------------- CYBER
  { questionKey: 'Q-CYBER-001', module: 'CYBER', factKeys: ['managed_it_service_provider'], labelHu: 'Nyújt irányított IT-, biztonsági vagy rendszerüzemeltetési szolgáltatást más szervezeteknek?', helpTextHu: '', whyHu: 'Az IT-szolgáltatói szerep kiberbiztonsági kötelezettségeket jelölhet.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: false, showWhen: anyOf(eq('critical_it_dependency', true), truthy('primary_teaor25_code')), required: false },
  { questionKey: 'Q-CYBER-002', module: 'CYBER', factKeys: ['data_center_or_cloud_provider'], labelHu: 'Nyújt felhő-, adatközponti vagy hosting szolgáltatást?', helpTextHu: '', whyHu: 'A felhő/adatközponti szerep speciális szolgáltatói kategóriát jelölhet.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: false, showWhen: eq('digital_service_provider', true), required: false },

  // ------------------------------------------------------------------ AI
  { questionKey: 'Q-AI-001', module: 'AI', factKeys: ['ai_role'], labelHu: 'Milyen szerepben érintett MI-rendszerrel?', helpTextHu: '', whyHu: 'A szerep dönti el, milyen MI-jogi kötelezettségek vonatkozhatnak Önökre.', answerType: 'MULTI_ENUM', optionsHu: options('ai_role'), baseline: false, showWhen: eq('ai_use', true), required: false },
  { questionKey: 'Q-AI-002', module: 'AI', factKeys: ['ai_high_risk_context'], labelHu: 'Mire használják az MI-t?', helpTextHu: 'Több is jelölhető.', whyHu: 'A felhasználás módja dönti el, merülhet-e fel magas kockázatú eset.', answerType: 'MULTI_ENUM', optionsHu: options('ai_high_risk_context'), baseline: false, showWhen: eq('ai_use', true), required: false },
  { questionKey: 'Q-AI-003', module: 'AI', factKeys: ['ai_customer_facing'], labelHu: 'Kommunikál az MI közvetlenül ügyfelekkel/felhasználókkal?', helpTextHu: '', whyHu: 'Az ügyfélkapcsolati MI átláthatósági kötelezettséget hozhat.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: false, showWhen: eq('ai_use', true), required: false },

  // ------------------------------------------------------------------ HR
  { questionKey: 'Q-HR-001', module: 'HR', factKeys: ['temporary_agency_work'], labelHu: 'Munkaerő-kölcsönzőként vagy kölcsönvevőként foglalkoztat?', helpTextHu: '', whyHu: 'A munkaerő-kölcsönzés speciális munkajogi szabályokat hoz.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: false, showWhen: gt('employee_count', 0), required: false },
  { questionKey: 'Q-HR-002', module: 'HR', factKeys: ['posted_workers'], labelHu: 'Küld munkavállalót más EU-tagállamba munkavégzésre, vagy fogad kiküldött munkavállalót?', helpTextHu: '', whyHu: 'A kiküldött munkavállalók speciális szabályai alkalmazandók lehetnek.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: false, showWhen: gt('employee_count', 0), required: false },

  // ------------------------------------------------------------ CONSUMER
  { questionKey: 'Q-CONS-001', module: 'CONSUMER', factKeys: ['distance_sales'], labelHu: 'Köt fogyasztóval szerződést kizárólag távközlő eszközzel?', helpTextHu: 'Webshop, telefon, e-mail, alkalmazás.', whyHu: 'A távértékesítés elállási és tájékoztatási szabályokat hoz.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: false, showWhen: anyOf(eq('b2c_sales', true), contains('customer_types', B2C_OPTION)), required: false },
  { questionKey: 'Q-CONS-002', module: 'CONSUMER', factKeys: ['off_premises_sales'], labelHu: 'Köt fogyasztói szerződést üzlethelyiségen kívül?', helpTextHu: '', whyHu: 'Az üzlethelyiségen kívüli értékesítés elállási szabályokat hoz.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: false, showWhen: anyOf(eq('b2c_sales', true), contains('customer_types', B2C_OPTION)), required: false },

  // ------------------------------------------------------------- DIGITAL
  { questionKey: 'Q-CONS-003', module: 'DIGITAL', factKeys: ['online_intermediary_service'], labelHu: 'Közvetít harmadik felek között online termék-, szolgáltatás- vagy tartalomügyleteket?', helpTextHu: '', whyHu: 'A platform jellege miatt speciális digitális szabályok merülhetnek fel.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: false, showWhen: eq('digital_service_provider', true), required: false },

  // ------------------------------------------------------------- FINANCE
  { questionKey: 'Q-FIN-001', module: 'FINANCE', factKeys: ['payment_service_activity'], labelHu: 'Nyújt pénzforgalmi szolgáltatást vagy elektronikuspénz-szolgáltatást?', helpTextHu: '', whyHu: 'A pénzforgalmi szolgáltatás ágazati és reziliencia-szabályokat aktivál.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: false, showWhen: eq('financial_service_activity', true), required: false },
  { questionKey: 'Q-FIN-002', module: 'FINANCE', factKeys: ['investment_service_activity'], labelHu: 'Nyújt befektetési szolgáltatást?', helpTextHu: '', whyHu: 'A befektetési szolgáltatás tőkepiaci szabályokat aktivál.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: false, showWhen: eq('financial_service_activity', true), required: false },
  { questionKey: 'Q-FIN-003', module: 'FINANCE', factKeys: ['insurance_activity'], labelHu: 'Végez biztosítási vagy biztosításközvetítői tevékenységet?', helpTextHu: '', whyHu: 'A biztosítási tevékenység ágazati szabályokat aktivál.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: false, showWhen: eq('financial_service_activity', true), required: false },
  { questionKey: 'Q-FIN-004', module: 'FINANCE', factKeys: ['crypto_asset_activity'], labelHu: 'Bocsát ki kriptoeszközt vagy nyújt kriptoeszköz-szolgáltatást?', helpTextHu: '', whyHu: 'A kriptoeszköz-tevékenység pénzügyi és AML szabályokat aktivál.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: false, showWhen: eq('financial_service_activity', true), required: false },
  { questionKey: 'Q-FIN-005', module: 'FINANCE', factKeys: ['sanctions_exposure'], labelHu: 'Van rendszeres ügylete szankciós kockázatú országokkal/személyekkel vagy exportérzékeny termékekkel?', helpTextHu: '', whyHu: 'A szankciós kitettség szűrési és folyamatkövetelményeket hozhat.', answerType: 'BOOLEAN_UNKNOWN', optionsHu: ['Igen', 'Nem', 'Nem tudom'], baseline: false, showWhen: anyOf(eq('export_outside_eu', true), eq('import_into_eu', true), eq('financial_service_activity', true)), required: false },

  // ------------------------------------------------------------- PRODUCT
  { questionKey: 'Q-PROD-001', module: 'PRODUCT', factKeys: ['consumer_products'], labelHu: 'Helyez fogyasztóknak szánt terméket az EU piacára?', helpTextHu: '', whyHu: 'A fogyasztói termékek általános termékbiztonsági szabályok alá eshetnek.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: false, showWhen: notContains('product_market_role', PRODUCT_ROLE_NONE), required: false },
  { questionKey: 'Q-PROD-002', module: 'PRODUCT', factKeys: ['machinery_activity'], labelHu: 'Érintett gép vagy kapcsolódó termék gyártásában, importjában vagy forgalmazásában?', helpTextHu: '', whyHu: 'A gépi termékek külön megfelelőségi szabályok alá eshetnek.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: false, showWhen: notContains('product_market_role', PRODUCT_ROLE_NONE), required: false },
  { questionKey: 'Q-PROD-003', module: 'PRODUCT', factKeys: ['electrical_electronic_equipment'], labelHu: 'Érintett elektromos/elektronikus berendezés gyártásában, importjában vagy forgalmazásában?', helpTextHu: '', whyHu: 'Az elektromos berendezések WEEE/RoHS kötelezettségeket hozhatnak.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: false, showWhen: notContains('product_market_role', PRODUCT_ROLE_NONE), required: false },
  { questionKey: 'Q-PROD-004', module: 'PRODUCT', factKeys: ['battery_activity'], labelHu: 'Érintett elem vagy akkumulátor gyártásában, importjában vagy forgalmazásában?', helpTextHu: '', whyHu: 'Az elemekre és akkumulátorokra külön szabályok vonatkozhatnak.', answerType: 'BOOLEAN', optionsHu: ['Igen', 'Nem'], baseline: false, showWhen: notContains('product_market_role', PRODUCT_ROLE_NONE), required: false },

  // --------------------------------------------------------- ENVIRONMENT
  { questionKey: 'Q-ENV-001', module: 'ENVIRONMENT', factKeys: ['epr_product_category'], labelHu: 'Mely EPR-köteles termékkörökben érintett?', helpTextHu: '', whyHu: 'Az EPR termékkör kiterjesztett gyártói felelősséget jelent.', answerType: 'MULTI_ENUM', optionsHu: options('epr_product_category'), baseline: false, showWhen: anyOf(eq('packaging_activity', true), notContains('product_market_role', PRODUCT_ROLE_NONE)), required: false },
  { questionKey: 'Q-ENV-002', module: 'ENVIRONMENT', factKeys: ['hazardous_waste'], labelHu: 'Keletkezik veszélyes hulladék?', helpTextHu: '', whyHu: 'A veszélyes hulladék szigorúbb nyilvántartási és kezelési szabályokat hoz.', answerType: 'BOOLEAN_UNKNOWN', optionsHu: ['Igen', 'Nem', 'Nem tudom'], baseline: false, showWhen: eq('waste_generation', true), required: false },
  { questionKey: 'Q-ENV-003', module: 'ENVIRONMENT', factKeys: ['hazardous_chemicals'], labelHu: 'Használ vagy forgalmaz veszélyesként osztályozott anyagot/keveréket?', helpTextHu: '', whyHu: 'A veszélyes anyagok osztályozási és címkézési kötelezettségeket hoznak.', answerType: 'BOOLEAN_UNKNOWN', optionsHu: ['Igen', 'Nem', 'Nem tudom'], baseline: false, showWhen: eq('chemical_substances', true), required: false },
  { questionKey: 'Q-ENV-004', module: 'ENVIRONMENT', factKeys: ['eu_ets_activity'], labelHu: 'Tartozik bármely telephelye az EU ETS alá?', helpTextHu: '', whyHu: 'Az ETS hatályú tevékenység kibocsátáskereskedelmi kötelezettséget hozhat.', answerType: 'BOOLEAN_UNKNOWN', optionsHu: ['Igen', 'Nem', 'Nem tudom'], baseline: false, showWhen: eq('industrial_installation', true), required: false },
  { questionKey: 'Q-ENV-005', module: 'ENVIRONMENT', factKeys: ['water_use_or_discharge'], labelHu: 'Van engedélyköteles vízkivétel, vízhasználat vagy kibocsátás?', helpTextHu: '', whyHu: 'A vízhasználat vízjogi engedélyezési kört jelölhet.', answerType: 'BOOLEAN_UNKNOWN', optionsHu: ['Igen', 'Nem', 'Nem tudom'], baseline: false, showWhen: eq('industrial_installation', true), required: false },
  { questionKey: 'Q-ENV-006', module: 'ENVIRONMENT', factKeys: ['high_energy_use'], labelHu: 'Jelentős energiafelhasználó vagy energetikai audit/energiahatékonysági kötelezettséggel érintett?', helpTextHu: '', whyHu: 'A jelentős energiafelhasználás energiahatékonysági kötelezettségeket hozhat.', answerType: 'BOOLEAN_UNKNOWN', optionsHu: ['Igen', 'Nem', 'Nem tudom'], baseline: false, showWhen: anyOf(gt('employee_count', 0), eq('industrial_installation', true)), required: false },
  { questionKey: 'Q-ENV-007', module: 'ENVIRONMENT', factKeys: ['cbam_imports'], labelHu: 'Importál CBAM alá tartozó árut?', helpTextHu: 'Pl. cement, vas/acél, alumínium, műtrágya, villamos energia, hidrogén és egyes kapcsolódó termékek.', whyHu: 'A CBAM-termékek importja kibocsátásjelentési kötelezettséget hozhat.', answerType: 'BOOLEAN_UNKNOWN', optionsHu: ['Igen', 'Nem', 'Nem tudom'], baseline: false, showWhen: eq('import_into_eu', true), required: false },
  { questionKey: 'Q-ENV-008', module: 'ENVIRONMENT', factKeys: ['eudr_commodities'], labelHu: 'Érintett EUDR szerinti árukban/termékekben?', helpTextHu: '', whyHu: 'Az EUDR-áruknál átvilágítási kötelezettség merülhet fel.', answerType: 'MULTI_ENUM', optionsHu: options('eudr_commodities'), baseline: false, showWhen: anyOf(notContains('product_market_role', PRODUCT_ROLE_NONE), eq('import_into_eu', true), eq('export_outside_eu', true)), required: false },

  // -------------------------------------------------------------- HEALTH
  { questionKey: 'Q-SEC-001', module: 'HEALTH', factKeys: ['medical_device_role'], labelHu: 'Érintett orvostechnikai eszköz vagy IVD gyártásában, importjában, forgalmazásában vagy használatában?', helpTextHu: '', whyHu: 'Az orvostechnikai szerep MDR/IVDR kötelezettségeket hozhat.', answerType: 'MULTI_ENUM', optionsHu: options('medical_device_role'), baseline: false, showWhen: anyOf(eq('healthcare_provider', true), notContains('product_market_role', PRODUCT_ROLE_NONE)), required: false },

  // -------------------------------------------------------------- EXPORT
  { questionKey: 'Q-SEC-002', module: 'EXPORT', factKeys: ['dual_use_goods_or_technology'], labelHu: 'Exportál vagy továbbít kettősfelhasználású terméket, szoftvert vagy technológiát?', helpTextHu: '', whyHu: 'A kettősfelhasználású termékek exportja engedélyezési kört jelölhet.', answerType: 'BOOLEAN_UNKNOWN', optionsHu: ['Igen', 'Nem', 'Nem tudom'], baseline: false, showWhen: eq('export_outside_eu', true), required: false },
];

const QUESTION_BY_KEY = new Map(CANONICAL_COMPANY_QUESTIONS.map((question) => [question.questionKey, question]));

export function getCompanyProfileQuestionDefinition(questionKey: string): CompanyProfileQuestionDefinition | undefined {
  return QUESTION_BY_KEY.get(questionKey);
}

export const COMPANY_PROFILE_QUESTION_KEYS: readonly string[] = CANONICAL_COMPANY_QUESTIONS.map((question) => question.questionKey);

/** Baseline (always-asked) questions, in workbook order. */
export function baselineCompanyProfileQuestions(): readonly CompanyProfileQuestionDefinition[] {
  return CANONICAL_COMPANY_QUESTIONS.filter((question) => question.baseline);
}

export function questionsForModule(module: CompanyProfileModule): readonly CompanyProfileQuestionDefinition[] {
  return CANONICAL_COMPANY_QUESTIONS.filter((question) => question.module === module);
}

/**
 * Module entry triggers (Modul_Flow). Canonical facts that, once answered,
 * activate the deterministic follow-up questions of the module.
 */
export const COMPANY_PROFILE_MODULE_ENTRY_TRIGGERS: readonly { module: CompanyProfileModule; trigger: CompanyProfileVisibilityCondition }[] = [
  { module: 'DATA', trigger: eq('personal_data_processing', true) },
  { module: 'CYBER', trigger: anyOf(eq('critical_it_dependency', true), truthy('primary_teaor25_code')) },
  { module: 'AI', trigger: eq('ai_use', true) },
  { module: 'HR', trigger: gt('employee_count', 0) },
  { module: 'CONSUMER', trigger: anyOf(eq('b2c_sales', true), contains('customer_types', B2C_OPTION)) },
  { module: 'DIGITAL', trigger: eq('digital_service_provider', true) },
  { module: 'FINANCE', trigger: eq('financial_service_activity', true) },
  { module: 'PRODUCT', trigger: notContains('product_market_role', PRODUCT_ROLE_NONE) },
  { module: 'ENVIRONMENT', trigger: anyOf(eq('waste_generation', true), eq('packaging_activity', true), eq('chemical_substances', true), eq('industrial_installation', true)) },
  { module: 'HEALTH', trigger: anyOf(eq('healthcare_provider', true), notContains('product_market_role', PRODUCT_ROLE_NONE)) },
  { module: 'EXPORT', trigger: eq('export_outside_eu', true) },
];

/**
 * Fail-fast integrity guard used by tests and by callers that want to be sure
 * the catalogue has not drifted from the canonical fact dictionary.
 */
export function assertCompanyProfileCatalogIntegrity(): void {
  const knownFacts = new Set(CANONICAL_COMPANY_FACTS.map((fact) => fact.factKey));
  const seen = new Set<string>();
  for (const question of CANONICAL_COMPANY_QUESTIONS) {
    if (seen.has(question.questionKey)) throw new Error(`Duplicate question key: ${question.questionKey}`);
    seen.add(question.questionKey);
    if (question.factKeys.length === 0) throw new Error(`Question ${question.questionKey} has no canonical fact binding.`);
    for (const factKey of question.factKeys) {
      if (!knownFacts.has(factKey)) throw new Error(`Question ${question.questionKey} references unknown fact ${factKey}.`);
    }
  }
}
