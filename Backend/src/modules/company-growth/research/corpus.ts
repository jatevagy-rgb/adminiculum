/**
 * GROW — research evidence corpus.
 *
 * The corpus is a small, curated library of external research evidence plus
 * client-internal evidence derived from canonical observations/measurements.
 *
 * Rigor rules (reconstructed from the interrupted implementation contract):
 * - Only VERIFIED entries may support a SUPPORTED recommendation.
 * - Provisional / unverifiable claims stay UNVERIFIED and are rendered as
 *   context, never as citation backing. They are INELIGIBLE for the
 *   sufficiency gate's "verified external evidence" requirement.
 * - Seeded entries are keyed by a stable corpusKey so seeding is idempotent.
 *
 * Verified citations are real publications with checked metadata:
 * - Goel, Bandara & Gable (2023), "Conceptualizing Business Process
 *   Standardization: A Review and Synthesis", Schmalenbach Journal of
 *   Business Research 75(2):195-237, DOI 10.1007/s41471-023-00158-y.
 */

import { EvidenceVerificationStatus, Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../prisma/prisma.service';
import { assertClientReadAccess, InternalActor } from '../../client-interaction/base';

type Db = PrismaClient | Prisma.TransactionClient;

export const EVIDENCE_KINDS = [
  'PAPER',
  'BENCHMARK',
  'INTERNAL_OBSERVATION',
  'INTERNAL_MEASUREMENT',
  'ORG_FACT',
  'SYSTEMATIC_REVIEW',
  'FRAMEWORK',
  'SURVEY',
  'CASE_STUDY',
  'INSTITUTIONAL_EVIDENCE',
  'GENERAL_ECONOMIC_PRINCIPLE',
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const EVIDENCE_STRENGTHS = ['STRONG', 'MODERATE', 'WEAK'] as const;
export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number];

/** Problem-domain keys the seeded corpus can speak to. */
export const DOMAIN_KEYS = [
  'MANUAL_ADMIN_LOAD',
  'APPROVAL_DELAY',
  'DUPLICATE_DATA_ENTRY',
  'SYSTEM_SWITCHING',
  'UNCLEAR_OWNERSHIP',
  'REWORK',
  'UNMEASURED_COST',
  'GENERAL_FLOW',
] as const;
export type ProblemDomainKey = (typeof DOMAIN_KEYS)[number];

export const EVIDENCE_ORIGINS = ['USER_LIBRARY', 'ONLINE_VERIFIED', 'GENERAL_KNOWLEDGE', 'CLIENT_INTERNAL'] as const;
export type EvidenceOrigin = (typeof EVIDENCE_ORIGINS)[number];

export interface CorpusSeedEntry {
  corpusKey: string;
  kind: EvidenceKind;
  title: string;
  authors?: string;
  venue?: string;
  year?: number;
  doi?: string;
  locator?: string;
  origin?: EvidenceOrigin;
  boundedClaim?: string;
  evidenceType?: string;
  verificationStatus: EvidenceVerificationStatus;
  strength: EvidenceStrength;
  domainKeys: string[];
  supportedInterventions?: string[];
  supportedOutcomes?: string[];
  applicabilityNotes?: string;
  limitations?: string;
}

/**
 * Curated seed corpus. Only entries whose bibliographic metadata was verified
 * carry VERIFIED; anything provisional is explicitly UNVERIFIED with a stated
 * limitation, and is therefore ineligible to lift a recommendation to
 * SUPPORTED on its own.
 */
export const SEEDED_CORPUS: readonly CorpusSeedEntry[] = [
  {
    corpusKey: 'paper:bps-standardization-goel-bandara-gable-2023',
    kind: 'PAPER',
    title: 'Conceptualizing Business Process Standardization: A Review and Synthesis',
    authors: 'Kanika Goel, Wasana Bandara, Guy Gable',
    venue: 'Schmalenbach Journal of Business Research',
    year: 2023,
    doi: '10.1007/s41471-023-00158-y',
    locator: 'https://doi.org/10.1007/s41471-023-00158-y',
    origin: 'ONLINE_VERIFIED',
    evidenceType: 'SYSTEMATIC_REVIEW',
    boundedClaim:
      'A szisztematikus áttekintés szerint a folyamatstandardizálás csökkenti a varianciát és a kézi újramunkát; az áttekintés nem állít konkrét százalékos megtakarítást.',
    verificationStatus: 'VERIFIED',
    strength: 'STRONG',
    domainKeys: ['MANUAL_ADMIN_LOAD', 'DUPLICATE_DATA_ENTRY', 'REWORK', 'GENERAL_FLOW'],
    supportedInterventions: ['STANDARDIZE_PROCESS', 'REDESIGN_BEFORE_AUTOMATING'],
    supportedOutcomes: ['TOTAL_ACTIVE_MINUTES', 'REWORK_INDICATOR'],
    applicabilityNotes:
      'Szisztematikus szakirodalmi áttekintés a folyamatstandardizálásról: a standardizált folyamatok csökkentik a varianciát, a kézi újramunkát és a többszörös adatrögzítést.',
    limitations: 'Szakirodalmi szintézis, nem konkrét cégmérés; a hatás nagysága kontextusfüggő.',
  },
  {
    corpusKey: 'paper:process-owner-role-davenport-1990',
    kind: 'PAPER',
    title: 'The New Industrial Engineering: Information Technology and Business Process Redesign',
    authors: 'Thomas H. Davenport, James E. Short',
    venue: 'Sloan Management Review',
    year: 1990,
    locator: 'https://sloanreview.mit.edu/article/the-new-industrial-engineering-information-technology-and-business-process-redesign/',
    origin: 'ONLINE_VERIFIED',
    evidenceType: 'CONCEPTUAL',
    boundedClaim:
      'A cikk elvi szinten érvel amellett, hogy a folyamatfelelős és az IT-támogatás együtt csökkenti a rendszerközi váltást és a felelősségi réseket.',
    verificationStatus: 'VERIFIED',
    strength: 'MODERATE',
    domainKeys: ['UNCLEAR_OWNERSHIP', 'SYSTEM_SWITCHING', 'GENERAL_FLOW'],
    supportedInterventions: ['CLARIFY_PROCESS_OWNERSHIP', 'INTEGRATE_SYSTEMS', 'ALIGN_IT_WITH_BUSINESS_GOALS'],
    supportedOutcomes: ['SYSTEM_SWITCH_COUNT', 'UNASSIGNED_STEP_COUNT'],
    applicabilityNotes:
      'Klasszikus érvelés: a folyamatfelelős és az IT-támogatás együtt csökkenti a rendszerközi váltást és a felelősségi réseket.',
    limitations: 'Korai, pre-digitalizációs cikk; elvi irányok, nem mért hatások.',
  },
  {
    corpusKey: 'paper:reengineering-work-hammer-1990',
    kind: 'PAPER',
    title: "Reengineering Work: Don't Automate, Obliterate",
    authors: 'Michael Hammer',
    venue: 'Harvard Business Review',
    year: 1990,
    locator: 'https://hbr.org/1990/07/reengineering-work-dont-automate-obliterate',
    origin: 'ONLINE_VERIFIED',
    evidenceType: 'CONCEPTUAL',
    boundedClaim:
      'A cikk elvi szinten érvel amellett, hogy a felesleges jóváhagyási és várakozási rétegek eltörlése — nem automatizálása — csökkenti az átfutási időt.',
    verificationStatus: 'VERIFIED',
    strength: 'MODERATE',
    domainKeys: ['APPROVAL_DELAY', 'MANUAL_ADMIN_LOAD', 'SYSTEM_SWITCHING'],
    supportedInterventions: ['REMOVE_NON_VALUE_ADDING_STEP', 'REDESIGN_APPROVAL_ROUTING', 'REDESIGN_BEFORE_AUTOMATING'],
    supportedOutcomes: ['TOTAL_WAITING_MINUTES', 'TOTAL_CYCLE_MINUTES'],
    applicabilityNotes:
      'A klasszikus reengineering-érvelés: a felesleges jóváhagyási és várakozási rétegek eltörlése (nem automatizálása) csökkenti az átfutási időt.',
    limitations: 'Esettanulmány-alapú érvelés; nem kontrollált mérés — irányadó, nem hatásnagyságot igazoló.',
  },
  {
    corpusKey: 'benchmark:unverified-sme-admin-share',
    kind: 'BENCHMARK',
    title: 'Iparági állítás: az adminisztráció aránya kis- és középvállalkozásoknál',
    origin: 'USER_LIBRARY',
    evidenceType: 'INDUSTRY_CLAIM',
    boundedClaim: 'Felhasználói könyvtári állítás; bibliográfiai forrás nem ellenőrizhető.',
    verificationStatus: 'UNVERIFIED',
    strength: 'WEAK',
    domainKeys: ['UNMEASURED_COST', 'MANUAL_ADMIN_LOAD'],
    supportedInterventions: [],
    supportedOutcomes: [],
    applicabilityNotes: 'Csak tájékozódási kontextus; forráshivatkozás nélküli gyakori állítás.',
    limitations: 'Nem ellenőrizhető forrás — nem támaszthat alá SUPPORTED javaslatot.',
  },
  {
    corpusKey: 'benchmark:unverified-approval-cycle-time',
    kind: 'BENCHMARK',
    title: 'Iparági állítás: a jóváhagyási átfutás lerövidíthető',
    origin: 'USER_LIBRARY',
    evidenceType: 'INDUSTRY_CLAIM',
    boundedClaim: 'Felhasználói könyvtári állítás; bibliográfiai forrás nem ellenőrizhető.',
    verificationStatus: 'UNVERIFIED',
    strength: 'WEAK',
    domainKeys: ['APPROVAL_DELAY'],
    supportedInterventions: [],
    supportedOutcomes: [],
    applicabilityNotes: 'Tájékoztató kontextus a jóváhagyási várakozásokhoz.',
    limitations: 'Nem ellenőrizhető forrás — mérés nélkül nem hivatkozható.',
  },
  // -------------------------------------------------------------------------
  // SUPPLIED RESEARCH CORPUS (Grow With Us v3 pack, seed/research-corpus.v2.json)
  // Bounded claims + provenance only; no full text. The pack's supportedDomains
  // vocabulary is mapped onto the engine's canonical problem domains so the
  // evidence is actually reachable by findCorpusEvidenceForDomains.
  // Records without a verifiable locator stay UNVERIFIED and cannot satisfy the
  // SUPPORTED gate. EV-BPS-SLR-2023-001 is already represented by the curated
  // "bps-standardization-goel-bandara-gable-2023" record above.
  // -------------------------------------------------------------------------
  {
    corpusKey: 'pack:EV-DMM-2024-001',
    kind: 'SYSTEMATIC_REVIEW',
    title: 'Key Dimensions That Measure the Digital Maturity Levels of Small and Medium-Sized Enterprises (SMEs)',
    authors: 'van Tonder, Bossink, Schachtebeck & Nieuwenhuizen',
    year: 2024,
    doi: '10.4067/S0718-27242024000100110',
    locator: 'https://doi.org/10.4067/S0718-27242024000100110',
    origin: 'USER_LIBRARY',
    evidenceType: 'SYSTEMATIC_REVIEW',
    boundedClaim: 'SME digital maturity is multidimensional rather than technology-only; recurring dimensions include strategy, leadership, culture, organization, people, technology, processes, products and customers.',
    verificationStatus: 'VERIFIED',
    strength: 'STRONG',
    domainKeys: ['SYSTEM_SWITCHING', 'UNMEASURED_COST', 'GENERAL_FLOW'],
    supportedInterventions: ['ALIGN_IT_WITH_BUSINESS_GOALS', 'TRAIN_DIGITAL_SKILLS', 'IMPLEMENT_PROCESS_MEASUREMENT'],
    supportedOutcomes: ['QUALITY', 'COST', 'DIGITAL_SKILL_COVERAGE'],
    applicabilityNotes: 'SME GENERIC',
    limitations: 'Review covers models published mainly during 2011-2021; dimensions do not by themselves prove that a specific intervention causes a specific firm outcome.',
  },
  {
    corpusKey: 'pack:EV-SME-DT-2024-001',
    kind: 'SYSTEMATIC_REVIEW',
    title: 'Toward SMEs digital transformation success: a systematic literature review',
    authors: 'Sagala & Őri',
    year: 2024,
    doi: '10.1007/s10257-024-00682-2',
    locator: 'https://doi.org/10.1007/s10257-024-00682-2',
    origin: 'ONLINE_VERIFIED',
    evidenceType: 'SYSTEMATIC_REVIEW',
    boundedClaim: "SME digital transformation should reflect the firm's baseline, limitations and idiosyncrasies; incremental learning, alignment and measurable cost-benefit reasoning recur as success factors.",
    verificationStatus: 'VERIFIED',
    strength: 'STRONG',
    domainKeys: ['SYSTEM_SWITCHING', 'UNMEASURED_COST', 'GENERAL_FLOW'],
    supportedInterventions: ['ALIGN_IT_WITH_BUSINESS_GOALS', 'PHASE_DIGITAL_INVESTMENT', 'TRAIN_DIGITAL_SKILLS'],
    supportedOutcomes: ['COST', 'QUALITY', 'DIGITAL_SKILL_COVERAGE'],
    applicabilityNotes: 'SME GENERIC',
    limitations: 'Literature is heterogeneous and concentrated in developed-country contexts; recommendations are not universal causal prescriptions.',
  },
  {
    corpusKey: 'pack:EV-KOUMAS-2021-001',
    kind: 'FRAMEWORK',
    title: 'Digital Transformation of Small and Medium Sized Enterprises Production Manufacturing',
    authors: 'Koumas, Dossou & Didier',
    year: 2021,
    doi: '10.4236/jsea.2021.1412036',
    locator: 'https://doi.org/10.4236/jsea.2021.1412036',
    origin: 'USER_LIBRARY',
    evidenceType: 'FRAMEWORK',
    boundedClaim: 'A progressive SME transformation framework combines organizational improvement with technology, cost-quality-time performance criteria and human/training considerations.',
    verificationStatus: 'VERIFIED',
    strength: 'MODERATE',
    domainKeys: ['MANUAL_ADMIN_LOAD', 'APPROVAL_DELAY', 'REWORK', 'SYSTEM_SWITCHING', 'GENERAL_FLOW'],
    supportedInterventions: ['REMOVE_NON_VALUE_ADDING_STEP', 'TRAIN_DIGITAL_SKILLS', 'PHASE_DIGITAL_INVESTMENT', 'REDESIGN_BEFORE_AUTOMATING'],
    supportedOutcomes: ['CYCLE_TIME', 'COST', 'QUALITY', 'DIGITAL_SKILL_COVERAGE'],
    applicabilityNotes: 'SME MANUFACTURING',
    limitations: "Manufacturing-focused framework and use cases; should not be directly generalized to professional-services processes. The paper's own numerical decision rules must not be imported as Adminiculum thresholds.",
  },
  {
    corpusKey: 'pack:EV-IP-BPM-2022-001',
    kind: 'SURVEY',
    title: "How to Enhance Intellectual Property Business Organizations' Capabilities? A Business Process Maturity Perspective",
    authors: 'Fu & Chou',
    year: 2022,
    doi: '10.5539/ijbm.v17n7p43',
    locator: 'https://doi.org/10.5539/ijbm.v17n7p43',
    origin: 'USER_LIBRARY',
    evidenceType: 'SURVEY',
    boundedClaim: 'In IP/legal professional-service organizations, process roles/responsibilities, strategy-process linkage, governance and professional capabilities are relevant maturity areas; professional work should not be treated like factory output.',
    verificationStatus: 'VERIFIED',
    strength: 'MODERATE',
    domainKeys: ['UNCLEAR_OWNERSHIP', 'UNMEASURED_COST', 'SYSTEM_SWITCHING', 'MANUAL_ADMIN_LOAD', 'GENERAL_FLOW'],
    supportedInterventions: ['CLARIFY_PROCESS_OWNERSHIP', 'IMPLEMENT_PROCESS_MEASUREMENT', 'ALIGN_IT_WITH_BUSINESS_GOALS', 'STANDARDIZE_PROCESS'],
    supportedOutcomes: ['PROCESS_OWNERSHIP_COVERAGE', 'QUALITY', 'COST', 'CYCLE_TIME'],
    applicabilityNotes: 'PROFESSIONAL_SERVICES LAW_FIRM IN_HOUSE_LEGAL',
    limitations: 'Specific to IP-related organizations and based on expert weighting/AHP; some conclusions reflect respondent perceptions rather than controlled outcome measurement.',
  },
  {
    corpusKey: 'pack:EV-HU-OECD-2026-001',
    kind: 'INSTITUTIONAL_EVIDENCE',
    title: 'OECD Economic Surveys: Hungary 2026 - Enhancing opportunities for SMEs',
    year: 2026,
    locator: 'https://www.oecd.org/en/publications/oecd-economic-surveys-hungary-2026_1d93d51d-en/full-report/enhancing-opportunities-for-smes_c0587db4.html',
    origin: 'ONLINE_VERIFIED',
    evidenceType: 'INSTITUTIONAL_EVIDENCE',
    boundedClaim: 'Hungarian SMEs lag in digitalisation and digital training; assessment initiatives should be followed by evaluation of what follow-up actions firms actually undertake.',
    verificationStatus: 'VERIFIED',
    strength: 'STRONG',
    domainKeys: ['SYSTEM_SWITCHING', 'UNMEASURED_COST', 'GENERAL_FLOW'],
    supportedInterventions: ['TRAIN_DIGITAL_SKILLS', 'IMPLEMENT_PROCESS_MEASUREMENT'],
    supportedOutcomes: ['DIGITAL_SKILL_COVERAGE'],
    applicabilityNotes: 'SME HUNGARY',
    limitations: 'Institutional economic survey, not a causal trial of any Adminiculum intervention.',
  },
  {
    corpusKey: 'pack:EV-DT-ROI-2024-001',
    kind: 'SYSTEMATIC_REVIEW',
    title: 'Digital initiative outcome and ROI measurement (maturity dimensions review)',
    year: 2024,
    doi: '10.4067/S0718-27242024000100110',
    locator: 'https://doi.org/10.4067/S0718-27242024000100110',
    origin: 'USER_LIBRARY',
    evidenceType: 'SYSTEMATIC_REVIEW',
    boundedClaim: 'Digital initiatives should be tracked with KPIs and evaluated after implementation using business-performance measures such as ROI where applicable, complemented by intermediate process metrics.',
    verificationStatus: 'VERIFIED',
    strength: 'STRONG',
    domainKeys: ['UNMEASURED_COST', 'SYSTEM_SWITCHING', 'GENERAL_FLOW'],
    supportedInterventions: ['IMPLEMENT_PROCESS_MEASUREMENT', 'ALIGN_IT_WITH_BUSINESS_GOALS'],
    supportedOutcomes: ['COST', 'CYCLE_TIME', 'QUALITY'],
    applicabilityNotes: 'SME GENERIC',
    limitations: 'Review synthesizes maturity-model literature; it does not prescribe one universal ROI formula or effect size.',
  },
  {
    corpusKey: 'pack:EV-DMM-CRITIQUE-2023-001',
    kind: 'SYSTEMATIC_REVIEW',
    title: 'A decade of digital maturity models: much ado about nothing?',
    year: 2023,
    locator: 'https://link.springer.com/article/10.1007/s10257-023-00656-w',
    origin: 'ONLINE_VERIFIED',
    evidenceType: 'SYSTEMATIC_REVIEW',
    boundedClaim: 'Digital maturity models vary substantially in quality and empirical grounding; maturity scores should not be treated as self-validating proof of business performance.',
    verificationStatus: 'VERIFIED',
    strength: 'STRONG',
    domainKeys: ['SYSTEM_SWITCHING', 'UNMEASURED_COST', 'GENERAL_FLOW'],
    supportedInterventions: ['ALIGN_IT_WITH_BUSINESS_GOALS', 'IMPLEMENT_PROCESS_MEASUREMENT'],
    supportedOutcomes: ['QUALITY', 'COST'],
    applicabilityNotes: 'GENERIC SME',
    limitations: 'Focuses on maturity-model literature generally, not on one SME sector.',
  },
  {
    corpusKey: 'pack:EV-PROJECT-TAXONOMY-2024-001',
    kind: 'FRAMEWORK',
    title: 'Digital transformation in SMEs: A taxonomy of externally supported digital innovation projects',
    authors: 'Hermann et al.',
    year: 2024,
    doi: '10.1016/j.ijinfomgt.2023.102713',
    locator: 'https://doi.org/10.1016/j.ijinfomgt.2023.102713',
    origin: 'ONLINE_VERIFIED',
    evidenceType: 'FRAMEWORK',
    boundedClaim: 'Externally supported SME digital innovation projects can be structured around why/what/how dimensions rather than selected solely by technology category.',
    verificationStatus: 'VERIFIED',
    strength: 'MODERATE',
    domainKeys: ['SYSTEM_SWITCHING', 'UNMEASURED_COST', 'GENERAL_FLOW'],
    supportedInterventions: ['ALIGN_IT_WITH_BUSINESS_GOALS', 'PHASE_DIGITAL_INVESTMENT'],
    supportedOutcomes: ['COST', 'QUALITY', 'CUSTOMER_TIME_TO_VALUE'],
    applicabilityNotes: 'SME GENERIC',
    limitations: 'Taxonomy supports project initiation/classification; it is not causal evidence that a specific project type improves a specific metric.',
  },
  {
    corpusKey: 'pack:EV-TECH-TRANSFORM-2023-001',
    kind: 'SYSTEMATIC_REVIEW',
    title: 'Systematic literature review on technological transformation in SMEs: technology assimilation and business model innovation',
    year: 2023,
    locator: 'https://link.springer.com/article/10.1007/s11301-023-00327-7',
    origin: 'ONLINE_VERIFIED',
    evidenceType: 'SYSTEMATIC_REVIEW',
    boundedClaim: 'Technology transformation outcomes should distinguish assimilation/deployment from business-model and performance outcomes; adoption itself is not equivalent to realized value.',
    verificationStatus: 'VERIFIED',
    strength: 'STRONG',
    domainKeys: ['SYSTEM_SWITCHING', 'UNMEASURED_COST', 'GENERAL_FLOW'],
    supportedInterventions: ['ALIGN_IT_WITH_BUSINESS_GOALS', 'PHASE_DIGITAL_INVESTMENT'],
    supportedOutcomes: ['QUALITY', 'COST'],
    applicabilityNotes: 'SME GENERIC',
    limitations: 'Broad technology-transformation review; outcome metrics vary by study.',
  },
  {
    corpusKey: 'pack:EV-PHASED-CBA-2026-001',
    kind: 'CASE_STUDY',
    title: 'Economic Evaluation of Phased Digital Transformation Investments in SMEs: A Cost–Benefit Analysis in the Turkish Metal Processing Sector',
    year: 2026,
    locator: 'https://www.mdpi.com/2076-3387/16/5/214',
    origin: 'ONLINE_VERIFIED',
    evidenceType: 'CASE_STUDY',
    boundedClaim: 'A phased digital-transformation investment can condition later spending on measurable earlier-stage performance, limiting downside under uncertainty while preserving option value.',
    verificationStatus: 'VERIFIED',
    strength: 'MODERATE',
    domainKeys: ['UNMEASURED_COST', 'GENERAL_FLOW'],
    supportedInterventions: ['PHASE_DIGITAL_INVESTMENT', 'IMPLEMENT_PROCESS_MEASUREMENT'],
    supportedOutcomes: ['COST', 'LABOR_HOURS', 'CYCLE_TIME'],
    applicabilityNotes: 'SME MANUFACTURING',
    limitations: 'Single-sector/firms context; financial assumptions and thresholds are case-specific and must not be copied as general Adminiculum rules.',
  },
  {
    corpusKey: 'pack:EV-DECISION-RIGHTS-2019-001',
    kind: 'CASE_STUDY',
    title: 'Empirical research on decision-rights delegation in hierarchical credit approval',
    year: 2019,
    locator: 'https://www.sciencedirect.com/science/article/pii/S1044500518300398',
    origin: 'ONLINE_VERIFIED',
    evidenceType: 'CASE_STUDY',
    boundedClaim: 'Empirical research on hierarchical decision rights shows that information transmission and escalation can be costly and that delegation can alter decision speed/quality trade-offs.',
    verificationStatus: 'VERIFIED',
    strength: 'MODERATE',
    domainKeys: ['APPROVAL_DELAY', 'UNCLEAR_OWNERSHIP'],
    supportedInterventions: ['REDESIGN_APPROVAL_ROUTING', 'CLARIFY_PROCESS_OWNERSHIP'],
    supportedOutcomes: ['WAITING_TIME', 'CYCLE_TIME', 'PROCESS_OWNERSHIP_COVERAGE'],
    applicabilityNotes: 'GENERIC',
    limitations: 'Banking/credit-decision context; delegation must remain compatible with risk and control requirements.',
  },
  {
    corpusKey: 'pack:EV-BPM-RPA-SLR-2026-001',
    kind: 'SYSTEMATIC_REVIEW',
    title: 'Systematic literature review on BPM and robotic process automation',
    year: 2026,
    locator: 'https://www.mdpi.com/2227-7080/14/4/225',
    origin: 'ONLINE_VERIFIED',
    evidenceType: 'SYSTEMATIC_REVIEW',
    boundedClaim: 'Process quality and suitability should be assessed before automation because automating an unstable or poorly designed process can reproduce or accelerate waste and errors.',
    verificationStatus: 'VERIFIED',
    strength: 'STRONG',
    domainKeys: ['REWORK', 'MANUAL_ADMIN_LOAD', 'DUPLICATE_DATA_ENTRY', 'GENERAL_FLOW'],
    supportedInterventions: ['REDESIGN_BEFORE_AUTOMATING', 'STANDARDIZE_PROCESS'],
    supportedOutcomes: ['CYCLE_TIME', 'REWORK_RATE', 'ERROR_RATE'],
    applicabilityNotes: 'GENERIC',
    limitations: 'Automation/RPA literature is heterogeneous; the evidence supports screening process suitability rather than a universal redesign recipe.',
  },
  {
    corpusKey: 'pack:EV-DT-REDESIGN-2024-001',
    kind: 'SYSTEMATIC_REVIEW',
    title: 'Systematic review and case synthesis on digital process redesign',
    year: 2024,
    locator: 'https://www.sciencedirect.com/science/article/abs/pii/S0169023X24000910',
    origin: 'ONLINE_VERIFIED',
    evidenceType: 'SYSTEMATIC_REVIEW',
    boundedClaim: 'Digital transformation creates more value when technology capabilities are used to redesign processes rather than merely replace legacy technology one-for-one.',
    verificationStatus: 'VERIFIED',
    strength: 'STRONG',
    domainKeys: ['REWORK', 'MANUAL_ADMIN_LOAD', 'GENERAL_FLOW'],
    supportedInterventions: ['REDESIGN_BEFORE_AUTOMATING', 'STANDARDIZE_PROCESS'],
    supportedOutcomes: ['CYCLE_TIME', 'QUALITY', 'LABOR_HOURS'],
    applicabilityNotes: 'GENERIC',
    limitations: 'Cross-industry case synthesis; exact effects are context-dependent.',
  },
  {
    corpusKey: 'pack:EV-APP-LANDSCAPE-2011-001',
    kind: 'CASE_STUDY',
    title: 'Empirical Results for Application Landscape Complexity',
    locator: 'https://portal.fis.tum.de/en/publications/empirical-results-for-application-landscape-complexity/',
    origin: 'ONLINE_VERIFIED',
    evidenceType: 'CASE_STUDY',
    boundedClaim: 'Application-landscape complexity and redundancy can be measured and used as evidence for rationalization review; mere application count is insufficient.',
    verificationStatus: 'VERIFIED',
    strength: 'MODERATE',
    domainKeys: ['SYSTEM_SWITCHING'],
    supportedInterventions: ['CONSOLIDATE_SYSTEMS'],
    supportedOutcomes: ['COST', 'LABOR_HOURS', 'SYSTEM_SWITCH_COUNT'],
    applicabilityNotes: 'GENERIC',
    limitations: 'Application-landscape complexity metrics do not by themselves prove consolidation is optimal; capability overlap and business criticality require human review.',
  },
  {
    corpusKey: 'pack:EV-DATA-TRANSFER-2025-001',
    kind: 'CASE_STUDY',
    title: 'Application-assisted electronic data transfer study',
    year: 2025,
    locator: 'https://www.jscdm.org/article/id/371/',
    origin: 'ONLINE_VERIFIED',
    evidenceType: 'CASE_STUDY',
    boundedClaim: 'Application-assisted electronic data transfer can reduce manual transcription burden and error compared with repeated manual entry where source data already exists digitally.',
    verificationStatus: 'VERIFIED',
    strength: 'MODERATE',
    domainKeys: ['DUPLICATE_DATA_ENTRY', 'SYSTEM_SWITCHING', 'MANUAL_ADMIN_LOAD'],
    supportedInterventions: ['INTEGRATE_SYSTEMS', 'AUTOMATE_REPETITIVE_STEP'],
    supportedOutcomes: ['ERROR_RATE', 'LABOR_HOURS', 'CYCLE_TIME'],
    applicabilityNotes: 'GENERIC',
    limitations: 'Healthcare data-transfer context; numerical effect sizes are not transferable to law/SME workflows.',
  },
  // --- UNVERIFIED / provisional (retained for research backlog; INELIGIBLE for the SUPPORTED gate) ---
  {
    corpusKey: 'pack:EV-ECON-TCE-001',
    kind: 'GENERAL_ECONOMIC_PRINCIPLE',
    title: 'General transaction-cost and coordination-cost reasoning',
    origin: 'GENERAL_KNOWLEDGE',
    evidenceType: 'GENERAL_ECONOMIC_PRINCIPLE',
    boundedClaim: 'Coordination, search, contracting and information-transfer frictions can create transaction costs; reducing avoidable coordination burden may create economic value.',
    verificationStatus: 'UNVERIFIED',
    strength: 'WEAK',
    domainKeys: ['MANUAL_ADMIN_LOAD', 'SYSTEM_SWITCHING', 'UNCLEAR_OWNERSHIP', 'GENERAL_FLOW'],
    supportedInterventions: ['STANDARDIZE_PROCESS', 'INTEGRATE_SYSTEMS', 'CLARIFY_PROCESS_OWNERSHIP'],
    supportedOutcomes: ['LABOR_HOURS', 'COST', 'CYCLE_TIME'],
    applicabilityNotes: 'GENERIC',
    limitations: 'General economic reasoning, not empirical evidence that any particular handoff/system switch is wasteful. Legal/control-required coordination may be valuable.',
  },
  {
    corpusKey: 'pack:EV-ECON-OPPCOST-001',
    kind: 'GENERAL_ECONOMIC_PRINCIPLE',
    title: 'General opportunity-cost and capacity-value reasoning',
    origin: 'GENERAL_KNOWLEDGE',
    evidenceType: 'GENERAL_ECONOMIC_PRINCIPLE',
    boundedClaim: 'Time saved is capacity released, not automatically cash saved. Financial ROI should distinguish avoided cash cost from redeployable employee capacity.',
    verificationStatus: 'UNVERIFIED',
    strength: 'WEAK',
    domainKeys: ['DUPLICATE_DATA_ENTRY', 'MANUAL_ADMIN_LOAD'],
    supportedInterventions: ['AUTOMATE_REPETITIVE_STEP', 'DIGITIZE_INTAKE'],
    supportedOutcomes: ['LABOR_HOURS', 'COST'],
    applicabilityNotes: 'GENERIC',
    limitations: 'Accounting treatment depends on whether staffing spend actually changes or capacity is redeployed; a modelling discipline, not a causal claim.',
  },
  {
    corpusKey: 'pack:EV-STD-CASE-2019-001',
    kind: 'CASE_STUDY',
    title: 'User-library standardization case study (2019)',
    origin: 'USER_LIBRARY',
    evidenceType: 'CASE_STUDY',
    boundedClaim: 'A manufacturing SME case combining standardization, line balancing and time-and-motion redesign reported material improvements in standard time, movement and throughput.',
    verificationStatus: 'UNVERIFIED',
    strength: 'MODERATE',
    domainKeys: ['REWORK', 'MANUAL_ADMIN_LOAD'],
    supportedInterventions: ['STANDARDIZE_PROCESS'],
    supportedOutcomes: ['CYCLE_TIME', 'LABOR_HOURS', 'QUALITY'],
    applicabilityNotes: 'SME MANUFACTURING',
    limitations: 'Single manufacturing SME case with no verifiable locator; numerical effect sizes must not be transferred to professional services.',
  },
  {
    corpusKey: 'pack:EV-APPROVAL-DELPHI-2026-001',
    kind: 'SURVEY',
    title: 'User-library approval bottleneck / decision-rights Delphi evidence',
    year: 2026,
    origin: 'USER_LIBRARY',
    evidenceType: 'SURVEY',
    boundedClaim: 'Hierarchical approval bottlenecks can justify reviewing decision rights, escalation and risk-calibrated oversight when delay is demonstrably concentrated in approvals.',
    verificationStatus: 'UNVERIFIED',
    strength: 'MODERATE',
    domainKeys: ['APPROVAL_DELAY', 'UNCLEAR_OWNERSHIP'],
    supportedInterventions: ['REDESIGN_APPROVAL_ROUTING', 'CLARIFY_PROCESS_OWNERSHIP'],
    supportedOutcomes: ['WAITING_TIME', 'CYCLE_TIME', 'PROCESS_OWNERSHIP_COVERAGE'],
    applicabilityNotes: 'GENERIC',
    limitations: 'Expert/Delphi evidence with no verifiable locator; control requirements may legitimately require approvals.',
  },
  {
    corpusKey: 'pack:EV-INTAKE-GENERAL-001',
    kind: 'GENERAL_ECONOMIC_PRINCIPLE',
    title: 'General structured-intake and single-source capture reasoning',
    origin: 'GENERAL_KNOWLEDGE',
    evidenceType: 'GENERAL_ECONOMIC_PRINCIPLE',
    boundedClaim: 'Capturing required data once in a structured format can reduce repeated collection and downstream transcription when the same information is reused.',
    verificationStatus: 'UNVERIFIED',
    strength: 'WEAK',
    domainKeys: ['MANUAL_ADMIN_LOAD', 'DUPLICATE_DATA_ENTRY'],
    supportedInterventions: ['DIGITIZE_INTAKE'],
    supportedOutcomes: ['MANUAL_DATA_ENTRY_COUNT', 'ERROR_RATE', 'LABOR_HOURS', 'CYCLE_TIME'],
    applicabilityNotes: 'GENERIC',
    limitations: 'Design heuristic only; should be upgraded with sector-specific empirical evidence before strong recommendation claims.',
  },
];

export interface EvidenceDTO {
  id: string;
  clientId: string | null;
  corpusKey: string | null;
  kind: string;
  title: string;
  authors: string | null;
  venue: string | null;
  year: number | null;
  doi: string | null;
  locator: string | null;
  origin: string | null;
  boundedClaim: string | null;
  evidenceType: string | null;
  verificationStatus: EvidenceVerificationStatus;
  strength: string;
  domainKeys: string[];
  supportedInterventions: string[];
  supportedOutcomes: string[];
  applicabilityNotes: string | null;
  limitations: string | null;
  createdAt: string;
}

export function toEvidenceDTO(row: {
  id: string; clientId: string | null; corpusKey: string | null; kind: string; title: string;
  authors: string | null; venue: string | null; year: number | null; doi: string | null; locator: string | null;
  origin?: string | null; boundedClaim?: string | null; evidenceType?: string | null;
  verificationStatus: EvidenceVerificationStatus; strength: string; domainKeys: string[];
  supportedInterventions?: string[]; supportedOutcomes?: string[];
  applicabilityNotes: string | null; limitations: string | null; createdAt: Date;
}): EvidenceDTO {
  return {
    id: row.id,
    clientId: row.clientId,
    corpusKey: row.corpusKey,
    kind: row.kind,
    title: row.title,
    authors: row.authors,
    venue: row.venue,
    year: row.year,
    doi: row.doi,
    locator: row.locator,
    origin: row.origin ?? null,
    boundedClaim: row.boundedClaim ?? null,
    evidenceType: row.evidenceType ?? null,
    verificationStatus: row.verificationStatus,
    strength: row.strength,
    domainKeys: row.domainKeys,
    supportedInterventions: row.supportedInterventions ?? [],
    supportedOutcomes: row.supportedOutcomes ?? [],
    applicabilityNotes: row.applicabilityNotes,
    limitations: row.limitations,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Idempotently seeds the curated corpus. Safe to call repeatedly; only inserts
 * missing corpusKey rows, never rewrites existing entries.
 */
export async function ensureCorpusSeeded(db: Db = defaultPrisma): Promise<{ seeded: number; total: number }> {
  let seeded = 0;
  for (const entry of SEEDED_CORPUS) {
    const existing = await db.researchEvidence.findUnique({ where: { corpusKey: entry.corpusKey } });
    if (existing) {
      // Backfill only metadata that is still missing; never rewrite an existing
      // verified citation's substance.
      const needsBackfill =
        (existing.origin == null && entry.origin != null) ||
        (existing.boundedClaim == null && entry.boundedClaim != null) ||
        (existing.evidenceType == null && entry.evidenceType != null) ||
        existing.supportedInterventions.length === 0 ||
        existing.supportedOutcomes.length === 0;
      if (needsBackfill) {
        await db.researchEvidence.update({
          where: { corpusKey: entry.corpusKey },
          data: {
            origin: existing.origin ?? entry.origin ?? null,
            boundedClaim: existing.boundedClaim ?? entry.boundedClaim ?? null,
            evidenceType: existing.evidenceType ?? entry.evidenceType ?? null,
            supportedInterventions: existing.supportedInterventions.length
              ? existing.supportedInterventions
              : entry.supportedInterventions ?? [],
            supportedOutcomes: existing.supportedOutcomes.length
              ? existing.supportedOutcomes
              : entry.supportedOutcomes ?? [],
          },
        });
      }
      continue;
    }
    await db.researchEvidence.create({
      data: {
        corpusKey: entry.corpusKey,
        clientId: null,
        kind: entry.kind,
        title: entry.title,
        authors: entry.authors ?? null,
        venue: entry.venue ?? null,
        year: entry.year ?? null,
        doi: entry.doi ?? null,
        locator: entry.locator ?? null,
        origin: entry.origin ?? null,
        boundedClaim: entry.boundedClaim ?? null,
        evidenceType: entry.evidenceType ?? entry.kind,
        verificationStatus: entry.verificationStatus,
        strength: entry.strength,
        domainKeys: entry.domainKeys,
        supportedInterventions: entry.supportedInterventions ?? [],
        supportedOutcomes: entry.supportedOutcomes ?? [],
        applicabilityNotes: entry.applicabilityNotes ?? null,
        limitations: entry.limitations ?? null,
      },
    });
    seeded += 1;
  }
  return { seeded, total: SEEDED_CORPUS.length };
}

/**
 * Lists evidence visible to a client scope: the global verified/unverified
 * corpus plus client-internal evidence rows.
 */
export async function listEvidence(
  actor: InternalActor,
  clientId: string,
  db: Db = defaultPrisma,
): Promise<EvidenceDTO[]> {
  await assertClientReadAccess(actor, clientId, db as PrismaClient);
  const rows = await db.researchEvidence.findMany({
    where: { OR: [{ clientId: null }, { clientId }] },
    orderBy: [{ verificationStatus: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(toEvidenceDTO);
}

/**
 * Registers client-internal evidence derived from a canonical source
 * (observation, snapshot, fact). Idempotent per corpusKey.
 */
export async function registerInternalEvidence(
  actor: InternalActor,
  args: {
    clientId: string;
    corpusKey: string;
    kind: Extract<EvidenceKind, 'INTERNAL_OBSERVATION' | 'INTERNAL_MEASUREMENT' | 'ORG_FACT'>;
    title: string;
    locator?: string;
    strength?: EvidenceStrength;
    domainKeys?: string[];
    boundedClaim?: string;
    supportedInterventions?: string[];
    supportedOutcomes?: string[];
    applicabilityNotes?: string;
    limitations?: string;
  },
  db: Db = defaultPrisma,
): Promise<EvidenceDTO> {
  await assertClientReadAccess(actor, args.clientId, db as PrismaClient);
  const existing = await db.researchEvidence.findUnique({ where: { corpusKey: args.corpusKey } });
  if (existing) return toEvidenceDTO(existing);
  const row = await db.researchEvidence.create({
    data: {
      clientId: args.clientId,
      corpusKey: args.corpusKey,
      kind: args.kind,
      title: args.title,
      locator: args.locator ?? null,
      origin: 'CLIENT_INTERNAL',
      evidenceType: args.kind,
      boundedClaim: args.boundedClaim ?? null,
      // Internal evidence is VERIFIED in the sense that it is canonical tenant
      // data; strength still reflects how directly it measures the problem.
      verificationStatus: 'VERIFIED',
      strength: args.strength ?? 'MODERATE',
      domainKeys: args.domainKeys ?? [],
      supportedInterventions: args.supportedInterventions ?? [],
      supportedOutcomes: args.supportedOutcomes ?? [],
      applicabilityNotes: args.applicabilityNotes ?? null,
      limitations: args.limitations ?? 'Belső megfigyelés — csak erre az ügyfélre érvényes.',
    },
  });
  return toEvidenceDTO(row);
}

/**
 * Finds corpus evidence eligible for a problem domain. `verifiedOnly`
 * enforces the eligibility gate: unverified/disputed entries are excluded.
 */
export async function findCorpusEvidenceForDomains(
  domainKeys: string[],
  opts: { verifiedOnly?: boolean; verificationStatuses?: EvidenceVerificationStatus[] } = {},
  db: Db = defaultPrisma,
): Promise<EvidenceDTO[]> {
  if (!domainKeys.length) return [];
  const rows = await db.researchEvidence.findMany({
    where: {
      clientId: null,
      domainKeys: { hasSome: domainKeys },
      ...(opts.verifiedOnly ? { verificationStatus: 'VERIFIED' as const } : {}),
      ...(opts.verificationStatuses ? { verificationStatus: { in: opts.verificationStatuses } } : {}),
    },
    orderBy: [{ verificationStatus: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(toEvidenceDTO);
}
