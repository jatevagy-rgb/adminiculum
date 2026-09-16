import { fetchApi } from './api';

export type CompanyOperatingProfile = {
  id: string;
  clientId: string;
  status: string | null;
  summary: string | null;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  updatedAt: string;
};

export type CompanyFact = {
  id: string;
  type: string;
  value: string;
  validFrom: string;
  validTo: string | null;
  sourceReference: string | null;
  verificationStatus: string;
  verifiedAt: string | null;
  updatedAt: string;
};

export type CompanyMilestone = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  milestoneDate: string | null;
  targetDate: string | null;
  status: string;
  developmentInitiativeId: string | null;
  updatedAt: string;
};

export type CompanyAssessment = {
  id: string;
  type: string;
  title: string;
  status: string;
  methodRef: string | null;
  startedAt: string | null;
  completedAt: string | null;
  itemCount?: number;
  findingCount?: number;
  updatedAt: string;
};

export type CompanyAssessmentItem = {
  id: string;
  assessmentId: string;
  key: string;
  label: string;
  kind: string;
  maturityLevel: number | null;
  statusCode: string | null;
  evidenceSummary: string | null;
  comment: string | null;
};

export type CompanyFinding = {
  id: string;
  clientId: string;
  assessmentId: string;
  severity: string;
  title: string;
  description: string | null;
  recommendation: string | null;
  status: string;
  developmentInitiativeId: string | null;
};

export type DevelopmentInitiative = {
  id: string;
  title: string;
  reason: string | null;
  currentState: string | null;
  targetState: string | null;
  priority: string;
  status: string;
  lawFirmOwnerUserId: string | null;
  caseId: string | null;
  targetAt: string | null;
  updatedAt: string;
};

function url(clientId: string, path: string): string {
  return `/client-company/clients/${encodeURIComponent(clientId)}${path}`;
}

export const clientCompanyApi = {
  getProfile(clientId: string) {
    return fetchApi<CompanyOperatingProfile | null>(url(clientId, '/operating-profile'), { suppressErrorStatuses: [404] });
  },
  saveProfile(clientId: string, payload: Partial<CompanyOperatingProfile>) {
    return fetchApi<CompanyOperatingProfile>(url(clientId, '/operating-profile'), { method: 'PUT', body: JSON.stringify(payload) });
  },
  listFacts(clientId: string) {
    return fetchApi<{ items: CompanyFact[] }>(url(clientId, '/facts'));
  },
  createFact(clientId: string, payload: { type: string; value: string; validFrom?: string; sourceReference?: string }) {
    return fetchApi<CompanyFact>(url(clientId, '/facts'), { method: 'POST', body: JSON.stringify(payload) });
  },
  verifyFact(factId: string, verificationStatus: string) {
    return fetchApi<CompanyFact>(`/client-company/facts/${encodeURIComponent(factId)}/verify`, { method: 'POST', body: JSON.stringify({ verificationStatus }) });
  },
  listMilestones(clientId: string) {
    return fetchApi<{ items: CompanyMilestone[] }>(url(clientId, '/milestones'));
  },
  createMilestone(clientId: string, payload: { type: string; title: string; targetDate?: string; developmentInitiativeId?: string }) {
    return fetchApi<CompanyMilestone>(url(clientId, '/milestones'), { method: 'POST', body: JSON.stringify(payload) });
  },
  listAssessments(clientId: string) {
    return fetchApi<{ items: CompanyAssessment[] }>(url(clientId, '/assessments'));
  },
  createAssessment(clientId: string, payload: { type: string; title: string }) {
    return fetchApi<CompanyAssessment>(url(clientId, '/assessments'), { method: 'POST', body: JSON.stringify(payload) });
  },
  getAssessment(assessmentId: string) {
    return fetchApi<CompanyAssessment & { items: CompanyAssessmentItem[]; findings: CompanyFinding[] }>(`/client-company/assessments/${encodeURIComponent(assessmentId)}`);
  },
  transitionAssessment(assessmentId: string, action: 'start' | 'complete') {
    return fetchApi<CompanyAssessment>(`/client-company/assessments/${encodeURIComponent(assessmentId)}/${action}`, { method: 'POST' });
  },
  addItem(assessmentId: string, payload: { key: string; label: string; kind: string; maturityLevel?: number }) {
    return fetchApi<CompanyAssessmentItem>(`/client-company/assessments/${encodeURIComponent(assessmentId)}/items`, { method: 'POST', body: JSON.stringify(payload) });
  },
  listFindings(clientId: string) {
    return fetchApi<{ items: CompanyFinding[] }>(url(clientId, '/findings'));
  },
  transitionFinding(findingId: string, status: string) {
    return fetchApi<CompanyFinding>(`/client-company/findings/${encodeURIComponent(findingId)}/status`, { method: 'POST', body: JSON.stringify({ status }) });
  },
  listInitiatives(clientId: string) {
    return fetchApi<{ items: DevelopmentInitiative[] }>(url(clientId, '/initiatives'));
  },
  createInitiative(clientId: string, payload: { title: string; priority: string; targetState?: string }) {
    return fetchApi<DevelopmentInitiative>(url(clientId, '/initiatives'), { method: 'POST', body: JSON.stringify(payload) });
  },
  updateInitiative(initiativeId: string, payload: { status?: string; caseId?: string | null }) {
    return fetchApi<DevelopmentInitiative>(`/client-company/initiatives/${encodeURIComponent(initiativeId)}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },
};

export function companyFactTypeLabel(type: string): string {
  const normalized = (type || '').trim();
  const upperKey = normalized.toUpperCase().replace(/[-\s]/g, '_');
  const lowerKey = normalized.toLowerCase().replace(/[-\s]/g, '_');

  const labels: Record<string, string> = {
    // Upper case enum keys (legacy / DB)
    EMPLOYEE_COUNT: 'Létszám',
    REVENUE_BAND: 'Bevételi sáv',
    MAIN_ACTIVITY: 'Fő tevékenység',
    OPERATING_COUNTRY: 'Működési ország',
    SITE: 'Telephely',
    EXPORT_ACTIVITY: 'Exporttevékenység',
    OWNERSHIP: 'Tulajdonosi szerkezet',
    MANAGEMENT_STRUCTURE: 'Vezetési struktúra',
    REGULATED_ACTIVITY: 'Szabályozott tevékenység',
    CRITICAL_CUSTOMER: 'Kritikus ügyfél',
    CRITICAL_SUPPLIER: 'Kritikus beszállító',
    FINANCING: 'Finanszírozás',
    IMPORTANT_IT_SYSTEM: 'Fontos IT-rendszer',
    SENSITIVE_DATA_USAGE: 'Érzékeny adatok kezelése',
    AI_USAGE: 'AI-használat',
    CERTIFICATION: 'Tanúsítvány',

    // Canonical Company Profile 2.0 keys
    employee_count: 'Létszám',
    annual_net_revenue_eur: 'Éves nettó árbevétel',
    balance_sheet_total_eur: 'Mérlegfőösszeg',
    eu_sme_size_class: 'EU KKV méretkategória',
    public_interest_entity: 'Közérdeklődésre számot tartó gazdálkodó',
    company_legal_form: 'Jogi forma',
    registered_country: 'Bejegyzés országa',
    operating_countries: 'Működési országok',
    primary_teaor25_code: "Fő TEÁOR'25 kód",
    additional_teaor25_codes: "További TEÁOR'25 kódok",
    sites_count: 'Telephelyek száma',
    group_member: 'Vállalatcsoport tagja',
    parent_country: 'Anyavállalat országa',
    listed_company: 'Tőzsdei jelenlét',
    state_or_public_control: 'Állami/önkormányzati kontroll',
    customer_types: 'Ügyféltípusok',
    b2c_sales: 'Fogyasztóknak értékesít',
    distance_sales: 'Távértékesítés',
    off_premises_sales: 'Üzlethelyiségen kívüli értékesítés',
    ecommerce_site: 'Webshop / online rendelés',
    digital_service_provider: 'Digitális szolgáltatás nyújtása',
    online_intermediary_service: 'Online platform szolgáltatás',
    public_sector_customer: 'Közszféra ügyfél',
    public_procurement_activity: 'Közbeszerzési részvétel',
    cross_border_eu_sales: 'EU-n belüli értékesítés',
    export_outside_eu: 'EU-n kívüli export',
    import_into_eu: 'EU-importőr szerep',
    personal_data_processing: 'Személyes adatok kezelése',
    special_category_data: 'Különleges adatok kezelése',
    criminal_data: 'Bűnügyi személyes adatok',
    children_data: 'Gyermekek adatainak kezelése',
    employee_monitoring: 'Munkavállalói megfigyelés',
    cctv_monitoring: 'Kamerás megfigyelés',
    systematic_monitoring: 'Rendszeres megfigyelés',
    large_scale_processing: 'Nagy léptékű adatkezelés',
    third_country_data_transfer: 'EGT-n kívüli adattovábbítás',
    processor_for_clients: 'Adatfeldolgozóként jár el',
    direct_marketing: 'Direkt marketing',
    critical_it_dependency: 'Kritikus IT-függőség',
    cloud_or_saas_use: 'Cloud/SaaS használat',
    managed_it_service_provider: 'IT/MSP szolgáltató',
    data_center_or_cloud_provider: 'Adatközpont/felhő szolgáltató',
    nis2_sector: 'NIS2 érintett ágazat',
    ai_use: 'AI használata',
    ai_role: 'MI szerepkör',
    ai_high_risk_context: 'MI nagy kockázatú kontextus',
    ai_customer_facing: 'Ügyféllel közvetlen interakcióba lépő MI',
    has_employees: 'Foglalkoztató',
    temporary_agency_work: 'Munkaerő-kölcsönzés',
    posted_workers: 'Kiküldött munkavállalók',
    whistle_special_sector: 'Speciális visszaélés-bejelentési ágazat',
    financial_service_activity: 'Pénzügyi szolgáltatás',
    payment_service_activity: 'Pénzforgalmi szolgáltatás',
    investment_service_activity: 'Befektetési szolgáltatás',
    insurance_activity: 'Biztosítási tevékenység',
    crypto_asset_activity: 'Kriptoeszköz-szolgáltatás',
    aml_obliged_entity: 'Pmt. szerinti kötelezett',
    sanctions_exposure: 'Szankciós kitettség',
    product_market_role: 'Termékpiaci szerep',
    consumer_products: 'Fogyasztói termék forgalmazása',
    environmental_permit_required: 'Környezetvédelmi engedélyköteles',
    hazardous_material_handling: 'Veszélyes anyagok kezelése',
    waste_producer_or_handler: 'Hulladékkezelő vagy termelő',
    packaging_obligation_epr: 'EPR / csomagolási kötelezettség',
    energy_intensive_activity: 'Energiaintenzív tevékenység',
    esg_reporting_obligation: 'ESG beszámolási kötelezettség',
    cbam_affected: 'CBAM érintett termékek',
    eu_deforestation_regulation: 'EUDR érintettség',
    founded_year: 'Alapítás éve',
    company_name: 'Cégnév',
    registration_number: 'Cégjegyzékszám',
    tax_number: 'Adószám',
  };

  if (labels[upperKey]) return labels[upperKey];
  if (labels[lowerKey]) return labels[lowerKey];
  if (labels[normalized]) return labels[normalized];

  // Secondary humanized fallback rather than generic wall of "Rögzített adat"
  if (normalized.includes('_') || normalized.includes('-')) {
    const parts = normalized.split(/[_-]+/).filter(Boolean);
    if (parts.length > 0) {
      return parts.map((p, i) => i === 0 ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p.toLowerCase()).join(' ');
    }
  }

  return normalized || 'Rögzített adat';
}


export function factVerificationLabel(status: string): string {
  const labels: Record<string, string> = {
    UNVERIFIED: 'Nem ellenőrzött',
    CLIENT_PROVIDED: 'Ügyfél által közölt',
    DOCUMENT_VERIFIED: 'Dokumentummal igazolva',
    LAW_FIRM_VERIFIED: 'Iroda által igazolt',
  };
  return labels[status] || status;
}

export function assessmentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    COMPANY_OPERATING: 'Működési felmérés',
    MANAGEMENT_MATURITY: 'Vezetési érettség',
    CONTRACT_GOVERNANCE: 'Szerződés-kormányzás',
    HR_GOVERNANCE: 'HR-kormányzás',
    DIGITAL_MATURITY: 'Digitális érettség',
  };
  return labels[type] || type;
}

export function initiativeStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    BACKLOG: 'Visszaváró',
    PLANNED: 'Tervezett',
    ACTIVE: 'Folyamatban',
    ON_HOLD: 'Szünetel',
    COMPLETED: 'Kész',
    CANCELLED: 'Törölve',
  };
  return labels[status] || status;
}

export function companyFindingSeverityLabel(severity: string): string {
  const labels: Record<string, string> = {
    LOW: 'Alacsony',
    MEDIUM: 'Közepes',
    HIGH: 'Magas',
    CRITICAL: 'Kritikus',
  };
  return labels[severity] || severity;
}

export function companyFindingStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    OPEN: 'Nyitott',
    ACKNOWLEDGED: 'Tudomásul véve',
    ACTION_PLANNED: 'Intézkedés tervezve',
    RESOLVED: 'Megoldva',
  };
  return labels[status] || status;
}

export function assessmentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Piszkozat',
    IN_PROGRESS: 'Folyamatban',
    COMPLETED: 'Lezárva',
    ARCHIVED: 'Archivált',
  };
  return labels[status] || status;
}

export function companyMilestoneStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PLANNED: 'Tervezett',
    ACHIEVED: 'Teljesült',
    CANCELLED: 'Törölve',
  };
  return labels[status] || status;
}
