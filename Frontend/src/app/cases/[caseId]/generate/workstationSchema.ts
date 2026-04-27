export type DocumentFamilyId = "sale_purchase" | "gift_usufruct" | "standalone_registration";

export type WorkstationSectionId =
  | "bundle"
  | "parties"
  | "property"
  | "title"
  | "price"
  | "financing"
  | "registration"
  | "possession"
  | "tax"
  | "closing"
  | "companions"
  | "validation"
  | "history";

export type DocumentId = "main_sale" | "reg_consent" | "escrow_cert" | "own_funds" | "iny_request" | "gift_main";

export interface WorkstationSection {
  id: WorkstationSectionId;
  label: string;
}

export interface WorkstationToggle {
  id: string;
  label: string;
  section: WorkstationSectionId;
  variableKey: string;
}

export interface WorkstationField {
  id: string;
  label: string;
  variableKey: string;
  section: WorkstationSectionId;
  type: "text" | "textarea" | "date" | "number";
  required?: boolean;
  critical?: boolean;
  documentScope?: "shared" | DocumentId;
  dependsOnToggle?: string;
}

export interface BundleDocument {
  id: DocumentId;
  label: string;
  templateHints: string[];
  requiredFieldIds: string[];
  blockingFieldIds?: string[];
  draftFieldIds?: string[];
  prerequisiteToggleIds?: string[];
  dependencyNote?: string;
  readinessMessage?: string;
}

export interface DocumentFamilySchema {
  id: DocumentFamilyId;
  label: string;
  sections: WorkstationSection[];
  toggles: WorkstationToggle[];
  fields: WorkstationField[];
  documents: BundleDocument[];
}

export interface TemplateLike {
  id: string;
  name: string;
  category?: string;
}

export const LEDGER_SECTIONS: WorkstationSection[] = [
  { id: "bundle", label: "Document Bundle" },
  { id: "parties", label: "Parties" },
  { id: "property", label: "Property" },
  { id: "title", label: "Title / Encumbrances / Pre-emption" },
  { id: "price", label: "Price & Payment" },
  { id: "financing", label: "Financing / Loan / Own Funds" },
  { id: "registration", label: "Title Retention / Registration / Escrow" },
  { id: "possession", label: "Possession / Utilities" },
  { id: "tax", label: "Tax / NAV / Duty" },
  { id: "closing", label: "Attorney / Closing Data" },
  { id: "companions", label: "Companion Documents" },
  { id: "validation", label: "Validation & Generate" },
  { id: "history", label: "Version History" },
];

const salePurchaseFamily: DocumentFamilySchema = {
  id: "sale_purchase",
  label: "Adásvételi ügyletcsomag",
  sections: LEDGER_SECTIONS,
  toggles: [
    { id: "undivided_ownership", label: "Osztatlan közös tulajdon", section: "title", variableKey: "has_undivided_ownership" },
    { id: "usage_agreement", label: "Használati megállapodás", section: "title", variableKey: "has_usage_agreement" },
    { id: "bank_lien", label: "Fennálló banki teher", section: "title", variableKey: "has_bank_lien" },
    { id: "preemption", label: "Elővásárlási jog", section: "title", variableKey: "has_preemption" },
    { id: "advance_payment", label: "Előlegfizetés", section: "price", variableKey: "has_advance_payment" },
    { id: "deposit", label: "Foglaló", section: "price", variableKey: "has_deposit" },
    { id: "otthon_start", label: "Otthon Start hitel", section: "financing", variableKey: "has_otthon_start_loan" },
    { id: "title_retention", label: "Tulajdonjog-fenntartás", section: "registration", variableKey: "has_title_retention" },
    { id: "electrical_cert", label: "Villamos biztonsági felülvizsgálat", section: "possession", variableKey: "has_electrical_certificate" },
    { id: "home_sale_relief", label: "Korábbi lakáseladás miatti kedvezmény", section: "tax", variableKey: "has_previous_home_sale_relief" },
  ],
  fields: [
    { id: "seller_name", label: "Eladó neve", variableKey: "seller_name", section: "parties", type: "text", required: true, critical: true },
    { id: "seller_birth_name", label: "Eladó születési neve", variableKey: "elado_szul_nev", section: "parties", type: "text", required: true, critical: true },
    { id: "seller_mother_name", label: "Eladó anyja neve", variableKey: "elado_anya_neve", section: "parties", type: "text", required: true, critical: true },
    { id: "seller_birth_place", label: "Eladó születési helye", variableKey: "elado_szul_hely", section: "parties", type: "text", required: true, critical: true },
    { id: "seller_birth_date", label: "Eladó születési ideje", variableKey: "elado_szul_ido", section: "parties", type: "date", required: true, critical: true },
    { id: "seller_address", label: "Eladó lakcíme", variableKey: "elado_lakcim", section: "parties", type: "text", required: true, critical: true },
    { id: "seller_id_card", label: "Eladó személyi igazolvány", variableKey: "elado_szemelyi_ig", section: "parties", type: "text", required: true },
    { id: "seller_personal_id", label: "Eladó személyi szám", variableKey: "elado_szemelyi_szam", section: "parties", type: "text", required: true },
    { id: "seller_citizenship", label: "Eladó állampolgárság", variableKey: "elado_allampolgarsag", section: "parties", type: "text", required: true },
    { id: "buyer_name", label: "Vevő neve", variableKey: "buyer_name", section: "parties", type: "text", required: true, critical: true },
    { id: "buyer_birth_name", label: "Vevő születési neve", variableKey: "vevo_szul_nev", section: "parties", type: "text", required: true, critical: true },
    { id: "buyer_mother_name", label: "Vevő anyja neve", variableKey: "vevo_anya_neve", section: "parties", type: "text", required: true, critical: true },
    { id: "buyer_birth_place", label: "Vevő születési helye", variableKey: "vevo_szul_hely", section: "parties", type: "text", required: true, critical: true },
    { id: "buyer_birth_date", label: "Vevő születési ideje", variableKey: "vevo_szul_ido", section: "parties", type: "date", required: true, critical: true },
    { id: "buyer_address", label: "Vevő lakcíme", variableKey: "vevo_lakcim", section: "parties", type: "text", required: true, critical: true },
    { id: "buyer_id_card", label: "Vevő személyi igazolvány", variableKey: "vevo_szemelyi_ig", section: "parties", type: "text", required: true },
    { id: "buyer_personal_id", label: "Vevő személyi szám", variableKey: "vevo_szemelyi_szam", section: "parties", type: "text", required: true },
    { id: "buyer_citizenship", label: "Vevő állampolgárság", variableKey: "vevo_allampolgarsag", section: "parties", type: "text", required: true },
    { id: "buyer_email", label: "Vevő email", variableKey: "buyer_email", section: "parties", type: "text" },
    { id: "property_address", label: "Ingatlan címe", variableKey: "property_address", section: "property", type: "text", required: true, critical: true },
    { id: "property_hrs", label: "Helyrajzi szám", variableKey: "property_hrs", section: "property", type: "text", required: true, critical: true },
    { id: "property_zip", label: "Irányítószám", variableKey: "ingatlan_iranyitoszam", section: "property", type: "text", required: true, critical: true },
    { id: "property_city", label: "Település", variableKey: "ingatlan_telepules", section: "property", type: "text", required: true, critical: true },
    { id: "property_street", label: "Utca", variableKey: "ingatlan_utca", section: "property", type: "text", required: true },
    { id: "property_house_number", label: "Házszám", variableKey: "ingatlan_hazszam", section: "property", type: "text", required: true },
    { id: "property_floor_door", label: "Emelet / ajtó", variableKey: "ingatlan_emelet_ajto", section: "property", type: "text" },
    { id: "property_area", label: "Alapterület (m²)", variableKey: "ingatlan_alapterulet", section: "property", type: "number", required: true, critical: true },
    { id: "property_type_name", label: "Ingatlan típusa", variableKey: "ingatlan_tipus_neve", section: "property", type: "text", required: true },
    { id: "property_title_share", label: "Tulajdoni hányad", variableKey: "ingatlan_tulajdoni_hanyad", section: "property", type: "text", required: true },
    { id: "property_inner_area", label: "Belterület (m²)", variableKey: "belterulet", section: "property", type: "number", required: true },
    { id: "title_sheet_number", label: "Tulajdoni lap sorszám", variableKey: "tulajdoni_lap_sorszam", section: "title", type: "text", required: true, critical: true },
    { id: "land_office", label: "Kormányhivatal / földhivatal", variableKey: "kormanyhivatal", section: "title", type: "text", required: true, critical: true },
    { id: "common_share", label: "Közös tulajdoni hányad", variableKey: "kozos_tulajdoni_hanyad", section: "title", type: "text" },
    { id: "lien_bank_name", label: "Jelzálog jogosult bank", variableKey: "lien_bank_name", section: "title", type: "text", dependsOnToggle: "bank_lien" },
    { id: "preemption_holder", label: "Elővásárlás jogosultja", variableKey: "preemption_holder", section: "title", type: "text", dependsOnToggle: "preemption" },
    { id: "purchase_price", label: "Teljes vételár (HUF)", variableKey: "purchase_price", section: "price", type: "number", required: true, critical: true },
    { id: "cash_amount", label: "Készpénz rész", variableKey: "cash_amount", section: "price", type: "number" },
    { id: "transfer_amount", label: "Átutalás rész", variableKey: "transfer_amount", section: "price", type: "number" },
    { id: "advance_amount", label: "Előleg összege", variableKey: "advance_amount", section: "price", type: "number", dependsOnToggle: "advance_payment" },
    { id: "deposit_amount", label: "Foglaló összege", variableKey: "deposit_amount", section: "price", type: "number", dependsOnToggle: "deposit" },
    { id: "loan_bank", label: "Hitelnyújtó bank", variableKey: "loan_bank", section: "financing", type: "text", dependsOnToggle: "otthon_start" },
    { id: "loan_amount", label: "Hitel összege", variableKey: "loan_amount", section: "financing", type: "number", dependsOnToggle: "otthon_start" },
    { id: "own_funds_amount", label: "Önerő összege", variableKey: "own_funds_amount", section: "financing", type: "number", required: true },
    { id: "retention_until", label: "Tulajdonjog-fenntartás határideje", variableKey: "retention_until", section: "registration", type: "date", dependsOnToggle: "title_retention" },
    { id: "escrow_holder", label: "Letétkezelő ügyvéd", variableKey: "escrow_holder", section: "registration", type: "text", required: true },
    { id: "registration_consent_release", label: "Bejegyzési engedély kiadás feltétele", variableKey: "registration_consent_release", section: "registration", type: "textarea", documentScope: "reg_consent" },
    { id: "registration_copy_count", label: "Bejegyzési engedély példányszám", variableKey: "bejegyzesi_engedely_peldanyszam", section: "registration", type: "number", documentScope: "reg_consent" },
    { id: "registration_submit_deadline_days", label: "Bejegyzési engedély benyújtási határidő (nap)", variableKey: "bejegyzesi_engedely_benyujtasi_hatarido_nap", section: "registration", type: "number", documentScope: "reg_consent" },
    { id: "seller_tax_id", label: "Eladó adóazonosító jel", variableKey: "elado_adoazonosito_jel", section: "parties", type: "text", documentScope: "reg_consent" },
    { id: "buyer1_tax_id", label: "Vevő 1 adóazonosító jel", variableKey: "vevo1_adoazonosito_jel", section: "parties", type: "text", documentScope: "reg_consent" },
    { id: "buyer2_tax_id", label: "Vevő 2 adóazonosító jel", variableKey: "vevo2_adoazonosito_jel", section: "parties", type: "text", documentScope: "reg_consent" },
    { id: "buyer1_name", label: "Vevő 1 neve", variableKey: "vevo1_nev", section: "parties", type: "text", documentScope: "reg_consent" },
    { id: "buyer1_birth_name", label: "Vevő 1 születési neve", variableKey: "vevo1_szul_nev", section: "parties", type: "text", documentScope: "reg_consent" },
    { id: "buyer1_birth_place", label: "Vevő 1 születési helye", variableKey: "vevo1_szul_hely", section: "parties", type: "text", documentScope: "reg_consent" },
    { id: "buyer1_birth_date", label: "Vevő 1 születési ideje", variableKey: "vevo1_szul_ido", section: "parties", type: "date", documentScope: "reg_consent" },
    { id: "buyer1_mother_name", label: "Vevő 1 anyja neve", variableKey: "vevo1_anya_neve", section: "parties", type: "text", documentScope: "reg_consent" },
    { id: "buyer1_address", label: "Vevő 1 lakcíme", variableKey: "vevo1_lakcim", section: "parties", type: "text", documentScope: "reg_consent" },
    { id: "buyer1_id_card", label: "Vevő 1 személyi igazolvány", variableKey: "vevo1_szemelyi_ig", section: "parties", type: "text", documentScope: "reg_consent" },
    { id: "buyer1_personal_id", label: "Vevő 1 személyi szám", variableKey: "vevo1_szemelyi_szam", section: "parties", type: "text", documentScope: "reg_consent" },
    { id: "buyer1_citizenship", label: "Vevő 1 állampolgárság", variableKey: "vevo1_allampolgarsag", section: "parties", type: "text", documentScope: "reg_consent" },
    { id: "buyer1_share", label: "Vevő 1 tulajdoni hányad", variableKey: "vevo1_tulajdoni_hanyad", section: "registration", type: "text", documentScope: "reg_consent" },
    { id: "buyer2_name", label: "Vevő 2 neve", variableKey: "vevo2_nev", section: "parties", type: "text", documentScope: "reg_consent" },
    { id: "buyer2_birth_name", label: "Vevő 2 születési neve", variableKey: "vevo2_szul_nev", section: "parties", type: "text", documentScope: "reg_consent" },
    { id: "buyer2_birth_place", label: "Vevő 2 születési helye", variableKey: "vevo2_szul_hely", section: "parties", type: "text", documentScope: "reg_consent" },
    { id: "buyer2_birth_date", label: "Vevő 2 születési ideje", variableKey: "vevo2_szul_ido", section: "parties", type: "date", documentScope: "reg_consent" },
    { id: "buyer2_mother_name", label: "Vevő 2 anyja neve", variableKey: "vevo2_anya_neve", section: "parties", type: "text", documentScope: "reg_consent" },
    { id: "buyer2_address", label: "Vevő 2 lakcíme", variableKey: "vevo2_lakcim", section: "parties", type: "text", documentScope: "reg_consent" },
    { id: "buyer2_id_card", label: "Vevő 2 személyi igazolvány", variableKey: "vevo2_szemelyi_ig", section: "parties", type: "text", documentScope: "reg_consent" },
    { id: "buyer2_personal_id", label: "Vevő 2 személyi szám", variableKey: "vevo2_szemelyi_szam", section: "parties", type: "text", documentScope: "reg_consent" },
    { id: "buyer2_citizenship", label: "Vevő 2 állampolgárság", variableKey: "vevo2_allampolgarsag", section: "parties", type: "text", documentScope: "reg_consent" },
    { id: "buyer2_share", label: "Vevő 2 tulajdoni hányad", variableKey: "vevo2_tulajdoni_hanyad", section: "registration", type: "text", documentScope: "reg_consent" },
    { id: "attorney_display_name", label: "Ügyvéd neve", variableKey: "ugyved_nev", section: "closing", type: "text", documentScope: "reg_consent" },
    { id: "attorney_kasz", label: "Ügyvéd KASZ száma", variableKey: "ugyved_kasz", section: "closing", type: "text", documentScope: "reg_consent" },
    { id: "counter_sign_date", label: "Ellenjegyzés dátuma", variableKey: "ellenjegyzes_datuma", section: "closing", type: "date", documentScope: "reg_consent" },
    { id: "property_location_type", label: "Ingatlan fekvése", variableKey: "ingatlan_fekves", section: "property", type: "text", documentScope: "reg_consent" },
    { id: "law_firm_name", label: "Ügyvédi iroda neve", variableKey: "ugyvedi_iroda_neve", section: "closing", type: "text", documentScope: "escrow_cert" },
    { id: "law_firm_address", label: "Ügyvédi iroda székhelye", variableKey: "ugyvedi_iroda_szekhelye", section: "closing", type: "text", documentScope: "escrow_cert" },
    { id: "escrow_clause_reference", label: "Letéti hivatkozás pontja", variableKey: "leteti_hivatkozas_pontja", section: "registration", type: "text", documentScope: "escrow_cert" },
    { id: "sale_contract_date", label: "Adásvételi szerződés dátuma", variableKey: "adasveteli_szerzodes_datuma", section: "closing", type: "date", documentScope: "escrow_cert" },
    { id: "own_funds_clause_reference", label: "Önerő hivatkozás pontja", variableKey: "onero_hivatkozas_pontja", section: "financing", type: "text", documentScope: "own_funds" },
    { id: "own_funds_amount_number", label: "Önerő összege (szám)", variableKey: "onero_osszeg_szam", section: "financing", type: "number", documentScope: "own_funds" },
    { id: "own_funds_amount_words", label: "Önerő összege (betű)", variableKey: "onero_osszeg_betu", section: "financing", type: "text", documentScope: "own_funds" },
    { id: "counter_sign_place", label: "Ellenjegyzés helye", variableKey: "ellenjegyzes_helye", section: "closing", type: "text", documentScope: "own_funds" },
    { id: "request_place", label: "Kérelem helye", variableKey: "kerelem_helye", section: "closing", type: "text", documentScope: "iny_request" },
    { id: "request_date", label: "Kérelem dátuma", variableKey: "kerelem_datuma", section: "closing", type: "date", documentScope: "iny_request" },
    { id: "request_subject", label: "Kérelem tárgya", variableKey: "kerelem_targya", section: "closing", type: "text", documentScope: "iny_request" },
    { id: "legal_representative_name", label: "Jogi képviselő neve", variableKey: "jogi_kepviselo_neve", section: "closing", type: "text", documentScope: "iny_request" },
    { id: "legal_representative_address", label: "Jogi képviselő székhelye", variableKey: "jogi_kepviselo_szekhelye", section: "closing", type: "text", documentScope: "iny_request" },
    { id: "legal_representative_storage", label: "Jogi képviselő tárhelye", variableKey: "jogi_kepviselo_tarhely", section: "closing", type: "text", documentScope: "iny_request" },
    { id: "registry_case_number", label: "Ingatlan-nyilvántartási iktatószám", variableKey: "ingatlan_nyilvantartasi_iktatoszam", section: "registration", type: "text", documentScope: "iny_request" },
    { id: "requester1_name", label: "Kérelmező 1 neve", variableKey: "kerelmezo1_nev", section: "parties", type: "text", documentScope: "iny_request" },
    { id: "requester1_birth_name", label: "Kérelmező 1 születési neve", variableKey: "kerelmezo1_szul_nev", section: "parties", type: "text", documentScope: "iny_request" },
    { id: "requester1_tax_id", label: "Kérelmező 1 adóazonosító jel", variableKey: "kerelmezo1_adoazonosito_jel", section: "parties", type: "text", documentScope: "iny_request" },
    { id: "requester1_personal_id", label: "Kérelmező 1 személyi azonosító", variableKey: "kerelmezo1_szemelyi_azonosito", section: "parties", type: "text", documentScope: "iny_request" },
    { id: "requester2_name", label: "Kérelmező 2 neve", variableKey: "kerelmezo2_nev", section: "parties", type: "text", documentScope: "iny_request" },
    { id: "requester2_birth_name", label: "Kérelmező 2 születési neve", variableKey: "kerelmezo2_szul_nev", section: "parties", type: "text", documentScope: "iny_request" },
    { id: "requester2_tax_id", label: "Kérelmező 2 adóazonosító jel", variableKey: "kerelmezo2_adoazonosito_jel", section: "parties", type: "text", documentScope: "iny_request" },
    { id: "requester2_personal_id", label: "Kérelmező 2 személyi azonosító", variableKey: "kerelmezo2_szemelyi_azonosito", section: "parties", type: "text", documentScope: "iny_request" },
    { id: "requester3_name", label: "Kérelmező 3 neve", variableKey: "kerelmezo3_nev", section: "parties", type: "text", documentScope: "iny_request" },
    { id: "requester3_birth_name", label: "Kérelmező 3 születési neve", variableKey: "kerelmezo3_szul_nev", section: "parties", type: "text", documentScope: "iny_request" },
    { id: "requester3_tax_id", label: "Kérelmező 3 adóazonosító jel", variableKey: "kerelmezo3_adoazonosito_jel", section: "parties", type: "text", documentScope: "iny_request" },
    { id: "requester3_personal_id", label: "Kérelmező 3 személyi azonosító", variableKey: "kerelmezo3_szemelyi_azonosito", section: "parties", type: "text", documentScope: "iny_request" },
    { id: "attachments_list", label: "Mellékletek felsorolása", variableKey: "mellekletek_felsorolasa", section: "closing", type: "textarea", documentScope: "iny_request" },
    { id: "fee_amount", label: "Igazgatási szolgáltatási díj", variableKey: "igazgatasi_szolgaltatasi_dij", section: "closing", type: "number", documentScope: "iny_request" },
    { id: "property_fee", label: "Ingatlan díj", variableKey: "ingatlan_dij", section: "closing", type: "number", documentScope: "iny_request" },
    { id: "payment_method", label: "Fizetési mód", variableKey: "fizetesi_mod", section: "closing", type: "text", documentScope: "iny_request" },
    { id: "exemption_basis", label: "Mentesség jogalapja", variableKey: "mentesseg_jogalapja", section: "closing", type: "text", documentScope: "iny_request" },
    { id: "agri_approval_note", label: "Mezőgazdasági jóváhagyás nyilatkozat", variableKey: "mezogazdasagi_jovahagyas_nyilatkozat", section: "closing", type: "text", documentScope: "iny_request" },
    { id: "priority_request", label: "Soron kívüli igénylés", variableKey: "soron_kivuli_igenyles", section: "closing", type: "text", documentScope: "iny_request" },
    { id: "other_note", label: "Egyéb megjegyzés", variableKey: "egyeb_megjegyzes", section: "closing", type: "textarea", documentScope: "iny_request" },
    { id: "possession_date", label: "Birtokbaadás dátuma", variableKey: "possession_date", section: "possession", type: "date", required: true },
    { id: "utility_transfer_deadline", label: "Közműátírás határideje", variableKey: "utility_transfer_deadline", section: "possession", type: "date" },
    { id: "duty_notes", label: "Illeték/NAV megjegyzés", variableKey: "duty_notes", section: "tax", type: "textarea" },
    { id: "contract_location", label: "Szerződés helye", variableKey: "szerzodes_helye", section: "closing", type: "text", required: true, critical: true },
    { id: "attorney_name", label: "Eljáró ügyvéd", variableKey: "attorney_name", section: "closing", type: "text", required: true },
    { id: "closing_date", label: "Szerződéskötés dátuma", variableKey: "closing_date", section: "closing", type: "date", required: true, critical: true },
    { id: "iny_request_note", label: "INY kérelem megjegyzés", variableKey: "iny_request_note", section: "closing", type: "textarea", documentScope: "iny_request" },
  ],
  documents: [
    {
      id: "main_sale",
      label: "Adásvételi szerződés",
      templateHints: ["adásvét", "sale"],
      requiredFieldIds: [
        "seller_name",
        "seller_birth_name",
        "seller_mother_name",
        "seller_birth_place",
        "seller_birth_date",
        "seller_address",
        "buyer_name",
        "buyer_birth_name",
        "buyer_mother_name",
        "buyer_birth_place",
        "buyer_birth_date",
        "buyer_address",
        "property_hrs",
        "property_zip",
        "property_city",
        "property_street",
        "property_house_number",
        "property_area",
        "property_type_name",
        "property_title_share",
        "title_sheet_number",
        "land_office",
        "purchase_price",
        "possession_date",
        "contract_location",
        "closing_date",
      ],
      draftFieldIds: [
        "seller_id_card",
        "seller_personal_id",
        "seller_citizenship",
        "buyer_id_card",
        "buyer_personal_id",
        "buyer_citizenship",
        "property_floor_door",
        "property_inner_area",
        "common_share",
        "attorney_name",
        "own_funds_amount",
      ],
      dependencyNote: "Fő szerződés; alap ügyadatok és ellenjegyzési adatok szükségesek.",
      readinessMessage: "Ready",
    },
    {
      id: "reg_consent",
      label: "Bejegyzési engedély",
      templateHints: ["bejegyz", "consent"],
      requiredFieldIds: ["seller_name", "buyer1_name", "property_hrs", "registration_copy_count", "attorney_display_name", "attorney_kasz"],
      blockingFieldIds: ["registration_consent_release", "buyer1_birth_name", "buyer1_birth_place", "buyer1_birth_date", "buyer1_mother_name"],
      draftFieldIds: ["buyer2_name", "buyer2_birth_name", "buyer2_share", "counter_sign_date", "property_location_type", "seller_tax_id", "buyer1_tax_id", "buyer2_tax_id"],
      dependencyNote: "Regisztrációs / tulajdon-átruházási adatok és kiadási feltétel szükséges.",
      readinessMessage: "Ready",
    },
    {
      id: "escrow_cert",
      label: "Letéti igazolás",
      templateHints: ["letéti", "escrow"],
      requiredFieldIds: ["escrow_holder", "attorney_display_name", "attorney_kasz", "sale_contract_date"],
      blockingFieldIds: ["registration_copy_count", "registration_submit_deadline_days", "law_firm_name", "law_firm_address", "escrow_clause_reference"],
      draftFieldIds: ["property_location_type", "buyer2_name", "buyer2_share"],
      dependencyNote: "Letéti / tulajdonjog-fenntartási logika és kiadási feltétel szükséges.",
      readinessMessage: "Ready",
    },
    {
      id: "own_funds",
      label: "Önerő nyilatkozat",
      templateHints: ["öner", "own"],
      requiredFieldIds: ["buyer1_name", "own_funds_amount_number", "own_funds_amount_words", "attorney_display_name", "attorney_kasz"],
      blockingFieldIds: ["own_funds_clause_reference", "sale_contract_date"],
      draftFieldIds: ["counter_sign_place", "counter_sign_date", "buyer2_name", "seller_tax_id", "buyer1_tax_id", "buyer2_tax_id"],
      dependencyNote: "Önerő és fizetési ütemezés / tranche adatok szükségesek.",
      readinessMessage: "Ready",
    },
    {
      id: "iny_request",
      label: "INY kérelem",
      templateHints: ["iny", "földhivatal", "registry"],
      requiredFieldIds: ["property_hrs", "request_place", "request_date", "request_subject", "legal_representative_name", "legal_representative_address"],
      blockingFieldIds: ["requester1_name", "requester1_birth_name", "requester1_tax_id", "requester1_personal_id", "attachments_list"],
      draftFieldIds: ["requester2_name", "requester3_name", "registry_case_number", "fee_amount", "property_fee", "payment_method", "other_note"],
      dependencyNote: "Beadványozási / jogi képviselői / földhivatali adatok szükségesek.",
      readinessMessage: "Ready",
    },
  ],
};

const giftFamily: DocumentFamilySchema = {
  id: "gift_usufruct",
  label: "Ajándékozás haszonélvezettel",
  sections: LEDGER_SECTIONS,
  toggles: [],
  fields: [
    { id: "giver_name", label: "Ajándékozó neve", variableKey: "giver_name", section: "parties", type: "text", required: true, critical: true },
    { id: "receiver_name", label: "Megajándékozott neve", variableKey: "receiver_name", section: "parties", type: "text", required: true, critical: true },
    { id: "usufruct_holder", label: "Haszonélvező", variableKey: "usufruct_holder", section: "title", type: "text", required: true },
    { id: "gift_property_address", label: "Ingatlan címe", variableKey: "property_address", section: "property", type: "text", required: true, critical: true },
  ],
  documents: [
    {
      id: "gift_main",
      label: "Ajándékozási szerződés",
      templateHints: ["ajánd", "gift"],
      requiredFieldIds: ["giver_name", "receiver_name", "usufruct_holder", "gift_property_address"],
      readinessMessage: "Ready",
    },
  ],
};

const standaloneRegistrationFamily: DocumentFamilySchema = {
  id: "standalone_registration",
  label: "Önálló bejegyzési engedély",
  sections: LEDGER_SECTIONS,
  toggles: [],
  fields: [
    { id: "owner_name", label: "Tulajdonos neve", variableKey: "owner_name", section: "parties", type: "text", required: true, critical: true },
    { id: "beneficiary_name", label: "Jogosult neve", variableKey: "beneficiary_name", section: "parties", type: "text", required: true, critical: true },
    { id: "reg_property_hrs", label: "Helyrajzi szám", variableKey: "property_hrs", section: "property", type: "text", required: true, critical: true },
  ],
  documents: [
    {
      id: "reg_consent",
      label: "Bejegyzési engedély",
      templateHints: ["bejegyz", "consent"],
      requiredFieldIds: ["owner_name", "beneficiary_name", "reg_property_hrs"],
      readinessMessage: "Ready",
    },
  ],
};

export const DOCUMENT_FAMILIES: Record<DocumentFamilyId, DocumentFamilySchema> = {
  sale_purchase: salePurchaseFamily,
  gift_usufruct: giftFamily,
  standalone_registration: standaloneRegistrationFamily,
};

export function pickFamilyFromTemplate(template: TemplateLike | null | undefined): DocumentFamilyId {
  const hay = `${template?.name || ""} ${template?.category || ""}`.toLowerCase();
  if (hay.includes("ajánd") || hay.includes("gift") || hay.includes("haszonélvez")) {
    return "gift_usufruct";
  }
  if (hay.includes("bejegyz") && !hay.includes("adás") && !hay.includes("sale")) {
    return "standalone_registration";
  }
  return "sale_purchase";
}

export function buildTemplateSearch(hints: string[]): (tpl: TemplateLike) => boolean {
  return (tpl) => {
    const hay = `${tpl.name} ${tpl.category || ""}`.toLowerCase();
    return hints.some((h) => hay.includes(h.toLowerCase()));
  };
}

