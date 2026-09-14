/**
 * GROW CUSTOMER ASSESSMENT JOURNEY — backend-owned assessment pack registry.
 *
 * This module is the SINGLE SOURCE OF TRUTH for:
 * - the four first-party customer assessment packs (questions + bounded findings),
 * - the deterministic, rule-based question → finding evaluation, and
 * - the suggested-direction codes (canonical intervention taxonomy reuse).
 *
 * Design constraints (deliberate):
 * - NOT a scoring model. There is no percentage, no 1–100 scale and no
 *   fabricated maturity index. A finding is emitted ONLY when an explicit
 *   answer matches an explicit rule.
 * - UNKNOWN and NOT_APPLICABLE are not negative answers. No rule trigger may
 *   contain them (enforced by unit tests); UNKNOWN only produces a
 *   missing-information state.
 * - Question wording is original Adminiculum wording synthesized from bounded
 *   research claims in ../research/corpus.ts. No proprietary questionnaire text,
 *   no imported effect sizes.
 * - This module is PURE (no Prisma, no corpus/DB import) so the
 *   Observation → GrowSignal normalizer can reuse it without pulling a DB client
 *   into pure unit tests.
 */

import type { InterventionCode } from '../research/interventions';
import { interventionLabelHu } from '../research/interventions';
import type { SurveyCategoryKey } from '../research/observationSignals';

/** Canonical declared assessment schema marker persisted in the observation payload. */
export const GROW_ASSESSMENT_SCHEMA = 'GROW_ASSESSMENT_V1';
/** Symmetric `kind` marker used to distinguish assessments from GROW_PAIN_INTAKE. */
export const GROW_ASSESSMENT_KIND = 'GROW_ASSESSMENT';

export const ASSESSMENT_ANSWER_VALUES = ['YES', 'PARTLY', 'NO', 'UNKNOWN', 'NOT_APPLICABLE'] as const;
export type AssessmentAnswer = (typeof ASSESSMENT_ANSWER_VALUES)[number];

const ANSWER_SET: ReadonlySet<string> = new Set(ASSESSMENT_ANSWER_VALUES);

export interface AssessmentQuestionOption {
  value: AssessmentAnswer;
  labelHu: string;
}

export interface AssessmentQuestion {
  questionKey: string;
  dimensionKey: string;
  promptHu: string;
  helpTextHu?: string;
  type: 'CHOICE';
  options: readonly AssessmentQuestionOption[];
}

export interface AssessmentFindingTrigger {
  questionKey: string;
  answers: readonly AssessmentAnswer[];
}

export interface AssessmentFindingRule {
  findingKey: string;
  titleHu: string;
  summaryHu: string;
  dimensionKey: string;
  /** ALL triggers must match when 'ALL', otherwise any single trigger matches. */
  mode?: 'ANY' | 'ALL';
  triggers: readonly AssessmentFindingTrigger[];
  /**
   * Canonical declared-survey category. When present the finding is safely
   * mappable onto the existing Grow problem domain through the single
   * SURVEY_CATEGORY_TO_DOMAIN map. Absent = intentionally fail-closed
   * (assessment-level finding only, never forced into research).
   */
  surveyCategoryKey?: SurveyCategoryKey;
  suggestedInterventionCodes: readonly InterventionCode[];
  supportingCorpusKeys: readonly string[];
  /**
   * Marks a finding whose presence must defer blind automation: while any such
   * finding is present, AUTOMATE_REPETITIVE_STEP is replaced by
   * REDESIGN_BEFORE_AUTOMATING (mirrors canonical intervention contraindications).
   */
  defersAutomation?: boolean;
}

export interface AssessmentPack {
  packKey: string;
  version: number;
  titleHu: string;
  descriptionHu: string;
  estimatedMinutes: number;
  /** Whether the pack may be scoped to a canonical business process reference. */
  allowsProcessReference?: boolean;
  evidenceCorpusKeys: readonly string[];
  questions: readonly AssessmentQuestion[];
  findings: readonly AssessmentFindingRule[];
}

// ---------------------------------------------------------------------------
// Shared option sets
// ---------------------------------------------------------------------------

const YES: AssessmentQuestionOption = { value: 'YES', labelHu: 'Igen' };
const PARTLY: AssessmentQuestionOption = { value: 'PARTLY', labelHu: 'Részben' };
const NO: AssessmentQuestionOption = { value: 'NO', labelHu: 'Nem' };
const UNKNOWN: AssessmentQuestionOption = { value: 'UNKNOWN', labelHu: 'Nem tudom' };
const NOT_APPLICABLE: AssessmentQuestionOption = { value: 'NOT_APPLICABLE', labelHu: 'Nem értelmezhető' };

const STANDARD_OPTIONS: readonly AssessmentQuestionOption[] = Object.freeze([YES, PARTLY, NO, UNKNOWN]);
const STANDARD_WITH_NA_OPTIONS: readonly AssessmentQuestionOption[] = Object.freeze([YES, PARTLY, NO, UNKNOWN, NOT_APPLICABLE]);

/** Trigger helper. Never accepts UNKNOWN / NOT_APPLICABLE (asserted by tests). */
function on(questionKey: string, ...answers: AssessmentAnswer[]): AssessmentFindingTrigger {
  return { questionKey, answers };
}

// ---------------------------------------------------------------------------
// PACK A — DIGITAL_MATURITY
// ---------------------------------------------------------------------------

const DIGITAL_MATURITY: AssessmentPack = {
  packKey: 'DIGITAL_MATURITY',
  version: 1,
  titleHu: 'Digitális érettség',
  descriptionHu:
    'Átfogó kép arról, hogyan kapcsolódnak a digitális fejlesztések az üzleti célokhoz, hogyan mérik az eredményeket, és hogyan épülnek be a mindennapi működésbe.',
  estimatedMinutes: 5,
  evidenceCorpusKeys: ['pack:EV-DMM-2024-001', 'pack:EV-DMM-CRITIQUE-2023-001', 'pack:EV-DT-ROI-2024-001'],
  questions: [
    { questionKey: 'dm_strategy_alignment', dimensionKey: 'STRATEGY', promptHu: 'A digitális fejlesztési prioritások egyértelműen az üzleti célokhoz kapcsolódnak?', helpTextHu: 'Gondoljon arra, hogy a következő fejlesztést miért éppen most és éppen ezt választották.', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'dm_outcome_measurement', dimensionKey: 'MEASUREMENT', promptHu: 'A digitális fejlesztések eredményeit meghatározott mutatókkal mérik?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'dm_measurement_review', dimensionKey: 'MEASUREMENT', promptHu: 'Rendszeresen visszatekintenek arra, hogy egy bevezetett rendszer hozta-e az elvárt hatást?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'dm_leadership_review', dimensionKey: 'LEADERSHIP', promptHu: 'A vezetés rendszeresen áttekinti, hogy a technológiai beruházások üzleti értéket hoznak-e?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'dm_training', dimensionKey: 'PEOPLE', promptHu: 'A munkatársak digitális készségfejlesztése rendszeresen megtörténik?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'dm_process_support', dimensionKey: 'PROCESSES', promptHu: 'A fontos folyamatokat megfelelő digitális rendszerek támogatják?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'dm_data_access', dimensionKey: 'TECHNOLOGY', promptHu: 'A döntésekhez szükséges adatok gyorsan és megbízhatóan elérhetők?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'dm_ownership', dimensionKey: 'ORGANIZATION', promptHu: 'Egyértelmű, ki felel a digitális fejlesztésekért a szervezetben?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'dm_prioritization', dimensionKey: 'STRATEGY', promptHu: 'A digitális fejlesztéseket tudatosan rangsorolják, nem alkalmi igények szerint?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'dm_customer_feedback', dimensionKey: 'CUSTOMERS', promptHu: 'Az ügyfélélményt digitális csatornákon is mérik ott, ahol ez értelmezhető?', type: 'CHOICE', options: STANDARD_WITH_NA_OPTIONS },
  ],
  findings: [
    {
      findingKey: 'dm_business_link_unclear',
      titleHu: 'Digitális fejlesztések és üzleti célok kapcsolata nem egyértelmű.',
      summaryHu: 'A válaszok szerint a digitális kezdeményezések és az üzleti célok összekapcsolása nem következetes. Ez megnehezíti annak megítélését, hogy egy fejlesztés valóban a legfontosabb célt szolgálja-e.',
      dimensionKey: 'STRATEGY',
      triggers: [on('dm_strategy_alignment', 'PARTLY', 'NO'), on('dm_prioritization', 'PARTLY', 'NO')],
      suggestedInterventionCodes: ['ALIGN_IT_WITH_BUSINESS_GOALS'],
      supportingCorpusKeys: ['pack:EV-DMM-2024-001', 'pack:EV-DMM-CRITIQUE-2023-001'],
    },
    {
      findingKey: 'dm_outcomes_unmeasured',
      titleHu: 'Digitális fejlesztések eredménye nincs rendszeresen mérve.',
      summaryHu: 'A válaszok alapján a fejlesztések utólagos értékelése és a kapcsolódó mutatók követése hiányos. A szakirodalom szerint ez rontja annak esélyét, hogy a tapasztalat a következő döntésbe beépüljön.',
      dimensionKey: 'MEASUREMENT',
      triggers: [on('dm_outcome_measurement', 'PARTLY', 'NO'), on('dm_measurement_review', 'PARTLY', 'NO')],
      suggestedInterventionCodes: ['IMPLEMENT_PROCESS_MEASUREMENT', 'ALIGN_IT_WITH_BUSINESS_GOALS'],
      supportingCorpusKeys: ['pack:EV-DT-ROI-2024-001', 'pack:EV-DMM-2024-001'],
    },
    {
      findingKey: 'dm_value_review_incomplete',
      titleHu: 'A technológiai beruházások üzleti értékének rendszeres vezetői áttekintése hiányos.',
      summaryHu: 'A válaszok szerint a vezetői szintű értékelés nem rendszeres. Az áttekintés hiánya miatt a beruházások értéke nehezen ítélhető meg.',
      dimensionKey: 'LEADERSHIP',
      triggers: [on('dm_leadership_review', 'PARTLY', 'NO')],
      suggestedInterventionCodes: ['IMPLEMENT_PROCESS_MEASUREMENT', 'ALIGN_IT_WITH_BUSINESS_GOALS'],
      supportingCorpusKeys: ['pack:EV-DT-ROI-2024-001', 'pack:EV-DMM-CRITIQUE-2023-001'],
    },
    {
      findingKey: 'dm_skills_not_systematic',
      titleHu: 'Digitális készségfejlesztés nem rendszeres.',
      summaryHu: 'A válaszok szerint a munkatársak digitális felkészítése eseti. Tartós működési kockázatot jelent, ha a bevezetett megoldásokat nem kíséri rendszeres képzés.',
      dimensionKey: 'PEOPLE',
      triggers: [on('dm_training', 'PARTLY', 'NO')],
      suggestedInterventionCodes: ['TRAIN_DIGITAL_SKILLS'],
      supportingCorpusKeys: ['pack:EV-DMM-2024-001'],
    },
    {
      findingKey: 'dm_customer_feedback_limited',
      titleHu: 'Az ügyféloldali digitális visszacsatolás korlátozott.',
      summaryHu: 'A válaszok szerint az ügyfélélmény digitális mérése nem megoldott. Így a fejlesztések ügyfélhatása nehezen követhető.',
      dimensionKey: 'CUSTOMERS',
      triggers: [on('dm_customer_feedback', 'PARTLY', 'NO')],
      suggestedInterventionCodes: ['ALIGN_IT_WITH_BUSINESS_GOALS'],
      supportingCorpusKeys: ['pack:EV-DMM-2024-001'],
    },
  ],
};

// ---------------------------------------------------------------------------
// PACK B — TRANSFORMATION_READINESS
// ---------------------------------------------------------------------------

const TRANSFORMATION_READINESS: AssessmentPack = {
  packKey: 'TRANSFORMATION_READINESS',
  version: 1,
  titleHu: 'Transzformációs felkészültség',
  descriptionHu:
    'Annak áttekintése, hogy egy fejlesztés elindítása előtt rendelkezésre áll-e a cél, a felelős, a kapacitás és a mérési alap.',
  estimatedMinutes: 4,
  evidenceCorpusKeys: [
    'pack:EV-SME-DT-2024-001',
    'pack:EV-KOUMAS-2021-001',
    'pack:EV-PROJECT-TAXONOMY-2024-001',
    'pack:EV-PHASED-CBA-2026-001',
  ],
  questions: [
    { questionKey: 'tr_goal_clarity', dimensionKey: 'ALIGNMENT', promptHu: 'A következő fejlesztés mögött egyértelmű üzleti cél áll?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'tr_leader_owner', dimensionKey: 'SPONSORSHIP', promptHu: 'Ki van jelölve vezetői felelőse a változásnak?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'tr_capacity', dimensionKey: 'CAPACITY', promptHu: 'Rendelkezésre áll a szükséges idő és kapacitás a bevezetéshez?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'tr_employee_involvement', dimensionKey: 'INVOLVEMENT', promptHu: 'A munkatársakat bevonják a bevezetés előkészítésébe?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'tr_training_readiness', dimensionKey: 'TRAINING', promptHu: 'A munkatársak megkapják a szükséges felkészítést az új megoldáshoz?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'tr_baseline', dimensionKey: 'BASELINE', promptHu: 'A fejlesztés előtt rögzítik a kiinduló állapotot (mérőszámot)?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'tr_phased', dimensionKey: 'PHASING', promptHu: 'A bevezetéseket szakaszos, mérhető lépésekre bontják?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'tr_review_loop', dimensionKey: 'REVIEW', promptHu: 'A bevezetés után visszatekintenek és tanulnak az eredményekből?', type: 'CHOICE', options: STANDARD_OPTIONS },
  ],
  findings: [
    {
      findingKey: 'tr_no_leader',
      titleHu: 'Nincs kijelölt vezetői felelőse a változásnak.',
      summaryHu: 'A válaszok szerint a változás mögött nincs egyértelmű vezetői felelős. A szakirodalom a vezetői támogatást a bevezetések egyik visszatérő sikerfeltételeként írja le.',
      dimensionKey: 'SPONSORSHIP',
      triggers: [on('tr_leader_owner', 'PARTLY', 'NO')],
      suggestedInterventionCodes: ['ALIGN_IT_WITH_BUSINESS_GOALS', 'PHASE_DIGITAL_INVESTMENT'],
      supportingCorpusKeys: ['pack:EV-SME-DT-2024-001', 'pack:EV-KOUMAS-2021-001'],
    },
    {
      findingKey: 'tr_no_baseline',
      titleHu: 'A fejlesztések előtt nincs rögzített kiinduló mérés.',
      summaryHu: 'A válaszok szerint a kiinduló állapot rögzítése elmarad. Kiinduló mérés nélkül a későbbi hatás nem igazolható.',
      dimensionKey: 'BASELINE',
      triggers: [on('tr_baseline', 'PARTLY', 'NO')],
      surveyCategoryKey: 'UNMEASURED_COST',
      suggestedInterventionCodes: ['IMPLEMENT_PROCESS_MEASUREMENT'],
      supportingCorpusKeys: ['pack:EV-PHASED-CBA-2026-001', 'pack:EV-SME-DT-2024-001'],
    },
    {
      findingKey: 'tr_not_phased',
      titleHu: 'A bevezetéseket nem szakaszos, mérhető lépésekben kezelik.',
      summaryHu: 'A válaszok szerint a bevezetés nem bontódik mérhető szakaszokra. A szakaszolás a visszafordíthatóságot és a kockázatkezelést segíti.',
      dimensionKey: 'PHASING',
      triggers: [on('tr_phased', 'PARTLY', 'NO')],
      suggestedInterventionCodes: ['PHASE_DIGITAL_INVESTMENT'],
      supportingCorpusKeys: ['pack:EV-PHASED-CBA-2026-001'],
    },
    {
      findingKey: 'tr_involvement_ad_hoc',
      titleHu: 'A munkatársak bevonása esetleges.',
      summaryHu: 'A válaszok szerint a munkatársak bevonása nem tervezett. A bevonás hiánya növeli a bevezetés elakadásának kockázatát.',
      dimensionKey: 'INVOLVEMENT',
      triggers: [on('tr_employee_involvement', 'PARTLY', 'NO'), on('tr_training_readiness', 'PARTLY', 'NO')],
      suggestedInterventionCodes: ['TRAIN_DIGITAL_SKILLS', 'PHASE_DIGITAL_INVESTMENT'],
      supportingCorpusKeys: ['pack:EV-KOUMAS-2021-001', 'pack:EV-SME-DT-2024-001'],
    },
    {
      findingKey: 'tr_capacity_gap',
      titleHu: 'A fejlesztéshez szükséges idő és kapacitás nem biztosított.',
      summaryHu: 'A válaszok szerint a végrehajtáshoz szükséges kapacitás nem áll rendelkezésre. Ez a bevezetés csúszásának visszatérő oka.',
      dimensionKey: 'CAPACITY',
      triggers: [on('tr_capacity', 'PARTLY', 'NO')],
      suggestedInterventionCodes: ['PHASE_DIGITAL_INVESTMENT'],
      supportingCorpusKeys: ['pack:EV-SME-DT-2024-001'],
    },
    {
      findingKey: 'tr_goal_alignment_gap',
      titleHu: 'A fejlesztés üzleti célja nem kellően egyértelmű.',
      summaryHu: 'A válaszok szerint a fejlesztés mögötti üzleti cél nem kellően tisztázott. Ez megnehezíti a fejlesztés indokolását és rangsorolását.',
      dimensionKey: 'ALIGNMENT',
      triggers: [on('tr_goal_clarity', 'PARTLY', 'NO')],
      suggestedInterventionCodes: ['ALIGN_IT_WITH_BUSINESS_GOALS'],
      supportingCorpusKeys: ['pack:EV-SME-DT-2024-001', 'pack:EV-PROJECT-TAXONOMY-2024-001'],
    },
    {
      findingKey: 'tr_review_missing',
      titleHu: 'A bevezetések utáni visszatekintés és tanulás nem rendszeres.',
      summaryHu: 'A válaszok szerint a bevezetést nem követi rendszeres értékelés. A tanulási hurok hiánya miatt a tapasztalat nem épül vissza a következő döntésbe.',
      dimensionKey: 'REVIEW',
      triggers: [on('tr_review_loop', 'PARTLY', 'NO')],
      suggestedInterventionCodes: ['IMPLEMENT_PROCESS_MEASUREMENT'],
      supportingCorpusKeys: ['pack:EV-PHASED-CBA-2026-001', 'pack:EV-SME-DT-2024-001'],
    },
  ],
};

// ---------------------------------------------------------------------------
// PACK C — PROCESS_AUTOMATION_READINESS
// ---------------------------------------------------------------------------

const PROCESS_AUTOMATION_READINESS: AssessmentPack = {
  packKey: 'PROCESS_AUTOMATION_READINESS',
  version: 1,
  titleHu: 'Folyamatok és automatizálás',
  descriptionHu:
    'Egy kiválasztott folyamat stabilitásának, ismétlődő lépéseinek és automatizálhatóságának áttekintése.',
  estimatedMinutes: 5,
  allowsProcessReference: true,
  evidenceCorpusKeys: [
    'paper:bps-standardization-goel-bandara-gable-2023',
    'pack:EV-BPM-RPA-SLR-2026-001',
    'pack:EV-DT-REDESIGN-2024-001',
    'paper:reengineering-work-hammer-1990',
    'pack:EV-DATA-TRANSFER-2025-001',
    'paper:process-owner-role-davenport-1990',
  ],
  questions: [
    { questionKey: 'pa_owner', dimensionKey: 'OWNERSHIP', promptHu: 'A vizsgált folyamatnak egyértelmű felelőse van?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'pa_documented', dimensionKey: 'DOCUMENTATION', promptHu: 'A folyamat lépései dokumentáltak és ismertek?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'pa_stable', dimensionKey: 'STABILITY', promptHu: 'A folyamat minden esetben ugyanúgy zajlik, nem eseti kivételek sorozata?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'pa_rework', dimensionKey: 'REWORK', promptHu: 'Előfordul, hogy a folyamatot javítani vagy újracsinálni kell?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'pa_manual_repetitive', dimensionKey: 'MANUAL_WORK', promptHu: 'Van rendszeresen ismétlődő, kézzel végzett lépés a folyamatban?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'pa_duplicate_entry', dimensionKey: 'DATA_ENTRY', promptHu: 'Ugyanazt az adatot több helyen is rögzíteni kell?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'pa_approval_wait', dimensionKey: 'APPROVALS', promptHu: 'A folyamatban jelentős jóváhagyási lépés vagy várakozás van?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'pa_measured', dimensionKey: 'MEASUREMENT', promptHu: 'A folyamat idejét és eredményét mérik?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'pa_automation_suitable', dimensionKey: 'SUITABILITY', promptHu: 'Az ismétlődő lépések szabályai kellően egyértelműek az automatizáláshoz?', type: 'CHOICE', options: STANDARD_OPTIONS },
  ],
  findings: [
    {
      findingKey: 'pa_process_undefined',
      titleHu: 'Az érintett folyamat nincs stabilan definiálva.',
      summaryHu: 'A válaszok szerint a folyamat lépései vagy lefolyása nem kellően rögzítettek. Szakirodalmi irány: instabil folyamat automatizálása előtt érdemes magát a folyamatot rendezni.',
      dimensionKey: 'DOCUMENTATION',
      triggers: [on('pa_documented', 'PARTLY', 'NO'), on('pa_stable', 'PARTLY', 'NO')],
      suggestedInterventionCodes: ['STANDARDIZE_PROCESS'],
      supportingCorpusKeys: [
        'paper:bps-standardization-goel-bandara-gable-2023',
        'pack:EV-DT-REDESIGN-2024-001',
        'pack:EV-BPM-RPA-SLR-2026-001',
      ],
      defersAutomation: true,
    },
    {
      findingKey: 'pa_rework_present',
      titleHu: 'A folyamatban javítás vagy újramunka jelenik meg.',
      summaryHu: 'A válaszok szerint a folyamatban visszatérő javítás fordul elő. Az újramunka önmagában is indokolja a folyamat felülvizsgálatát.',
      dimensionKey: 'REWORK',
      triggers: [on('pa_rework', 'YES', 'PARTLY')],
      surveyCategoryKey: 'REWORK',
      suggestedInterventionCodes: ['STANDARDIZE_PROCESS', 'REDESIGN_BEFORE_AUTOMATING'],
      supportingCorpusKeys: [
        'pack:EV-DT-REDESIGN-2024-001',
        'pack:EV-BPM-RPA-SLR-2026-001',
        'paper:bps-standardization-goel-bandara-gable-2023',
      ],
      defersAutomation: true,
    },
    {
      findingKey: 'pa_manual_repetitive',
      titleHu: 'Ismétlődő kézi munka látszik a folyamatban.',
      summaryHu: 'A válaszok szerint rendszeresen ismétlődő, kézzel végzett lépés van a folyamatban. Ha a folyamat stabil, ez automatizálási jelölt lehet; egyébként előbb rendezés indokolt.',
      dimensionKey: 'MANUAL_WORK',
      triggers: [on('pa_manual_repetitive', 'YES', 'PARTLY')],
      surveyCategoryKey: 'MANUAL_ADMIN',
      suggestedInterventionCodes: ['AUTOMATE_REPETITIVE_STEP', 'STANDARDIZE_PROCESS'],
      supportingCorpusKeys: ['pack:EV-BPM-RPA-SLR-2026-001', 'paper:bps-standardization-goel-bandara-gable-2023'],
    },
    {
      findingKey: 'pa_duplicate_entry',
      titleHu: 'Ugyanazt az adatot több helyen is rögzíteni kell a folyamatban.',
      summaryHu: 'A válaszok szerint az adat többszörös rögzítése jelen van. Ez tipikusan összekapcsolható adatátadási vagy integrációs kérdés.',
      dimensionKey: 'DATA_ENTRY',
      triggers: [on('pa_duplicate_entry', 'YES', 'PARTLY')],
      surveyCategoryKey: 'DUPLICATE_DATA',
      suggestedInterventionCodes: ['DIGITIZE_INTAKE', 'INTEGRATE_SYSTEMS'],
      supportingCorpusKeys: ['pack:EV-DATA-TRANSFER-2025-001', 'pack:EV-BPM-RPA-SLR-2026-001'],
    },
    {
      findingKey: 'pa_ownership_unclear',
      titleHu: 'A folyamat felelőse nem egyértelmű.',
      summaryHu: 'A válaszok szerint a folyamatért viselt felelősség nem tisztázott. A felelősségi rés a folyamatjavítás egyik visszatérő akadálya.',
      dimensionKey: 'OWNERSHIP',
      triggers: [on('pa_owner', 'PARTLY', 'NO')],
      surveyCategoryKey: 'UNCLEAR_OWNERSHIP',
      suggestedInterventionCodes: ['CLARIFY_PROCESS_OWNERSHIP'],
      supportingCorpusKeys: ['paper:process-owner-role-davenport-1990', 'paper:bps-standardization-goel-bandara-gable-2023'],
      defersAutomation: true,
    },
    {
      findingKey: 'pa_approval_wait',
      titleHu: 'A folyamatban jelentős jóváhagyási lépés vagy várakozás van.',
      summaryHu: 'A válaszok szerint a folyamat jóváhagyási vagy várakozási pontot tartalmaz. A klasszikus reengineering-érvelés szerint érdemes megvizsgálni, hogy a lépés valóban értéket teremt-e.',
      dimensionKey: 'APPROVALS',
      triggers: [on('pa_approval_wait', 'YES', 'PARTLY')],
      surveyCategoryKey: 'SLOW_APPROVAL',
      suggestedInterventionCodes: ['REMOVE_NON_VALUE_ADDING_STEP', 'REDESIGN_APPROVAL_ROUTING'],
      supportingCorpusKeys: ['paper:reengineering-work-hammer-1990', 'paper:bps-standardization-goel-bandara-gable-2023'],
    },
    {
      findingKey: 'pa_unmeasured',
      titleHu: 'A folyamat mérése hiányos.',
      summaryHu: 'A válaszok szerint a folyamat idejét vagy eredményét nem mérik. Mérés nélkül a javulás nem igazolható.',
      dimensionKey: 'MEASUREMENT',
      triggers: [on('pa_measured', 'PARTLY', 'NO')],
      surveyCategoryKey: 'UNMEASURED_COST',
      suggestedInterventionCodes: ['IMPLEMENT_PROCESS_MEASUREMENT'],
      supportingCorpusKeys: ['paper:bps-standardization-goel-bandara-gable-2023', 'pack:EV-BPM-RPA-SLR-2026-001'],
    },
    {
      findingKey: 'pa_automation_not_suitable',
      titleHu: 'Az ismétlődő lépések automatizálhatósága további vizsgálatot igényel.',
      summaryHu: 'A válaszok szerint nem egyértelmű, hogy a lépések szabályai elég egyértelműek-e az automatizáláshoz. Az automatizálás előtt a folyamat rendezése indokolt.',
      dimensionKey: 'SUITABILITY',
      triggers: [on('pa_automation_suitable', 'PARTLY', 'NO')],
      suggestedInterventionCodes: ['REDESIGN_BEFORE_AUTOMATING'],
      supportingCorpusKeys: ['pack:EV-BPM-RPA-SLR-2026-001'],
      defersAutomation: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// PACK D — SYSTEMS_DATA_FLOW
// ---------------------------------------------------------------------------

const SYSTEMS_DATA_FLOW: AssessmentPack = {
  packKey: 'SYSTEMS_DATA_FLOW',
  version: 1,
  titleHu: 'Rendszerek és adatáramlás',
  descriptionHu:
    'A rendszerek számának, az adatok rendszerközi áramlásának és az elsődleges adatforrás tisztázottságának áttekintése.',
  estimatedMinutes: 4,
  allowsProcessReference: true,
  evidenceCorpusKeys: [
    'pack:EV-APP-LANDSCAPE-2011-001',
    'pack:EV-DATA-TRANSFER-2025-001',
    'paper:process-owner-role-davenport-1990',
    'pack:EV-DMM-2024-001',
  ],
  questions: [
    { questionKey: 'sd_system_count', dimensionKey: 'FRAGMENTATION', promptHu: 'Több különböző rendszert használnak a munkához, amelyek között váltani kell?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'sd_reentry', dimensionKey: 'DATA_ENTRY', promptHu: 'Ugyanazt az adatot több rendszerben is manuálisan rögzítik?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'sd_manual_transfer', dimensionKey: 'INTEGRATION', promptHu: 'Az adatok rendszerek közötti átadása részben manuális?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'sd_owner', dimensionKey: 'OWNERSHIP', promptHu: 'Egyértelmű, ki felel egy-egy rendszerért?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'sd_single_source', dimensionKey: 'GOVERNANCE', promptHu: 'Egyértelmű, melyik az adott adat elsődleges forrása?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'sd_integration', dimensionKey: 'INTEGRATION', promptHu: 'A rendszerek közötti kapcsolatok megoldottak (integráció vagy automatikus átadás)?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'sd_overlap', dimensionKey: 'TECHNOLOGY', promptHu: 'Vannak átfedő funkciójú rendszerek?', type: 'CHOICE', options: STANDARD_OPTIONS },
    { questionKey: 'sd_impact_measured', dimensionKey: 'MEASUREMENT', promptHu: 'Mérik, hogy a rendszerek használata javítja-e a folyamatot?', type: 'CHOICE', options: STANDARD_OPTIONS },
  ],
  findings: [
    {
      findingKey: 'sd_duplicate_entry',
      titleHu: 'Ugyanaz az adat több rendszerben manuálisan kerül rögzítésre.',
      summaryHu: 'A válaszok szerint az adat többszörös, kézi rögzítése jelen van. A korábban digitalizált adat ismételt kézi bevitele elkerülhető lehet integrációval vagy automatizált átadással.',
      dimensionKey: 'DATA_ENTRY',
      triggers: [on('sd_reentry', 'YES', 'PARTLY')],
      surveyCategoryKey: 'DUPLICATE_DATA',
      suggestedInterventionCodes: ['INTEGRATE_SYSTEMS', 'AUTOMATE_REPETITIVE_STEP', 'DIGITIZE_INTAKE'],
      supportingCorpusKeys: ['pack:EV-DATA-TRANSFER-2025-001', 'pack:EV-APP-LANDSCAPE-2011-001'],
    },
    {
      findingKey: 'sd_manual_transfer',
      titleHu: 'Az adatok rendszerközi átadása részben manuális.',
      summaryHu: 'A válaszok szerint az adatátadás részben kézi. A manuális átadás hibalehetőséget és többletmunkát hordoz.',
      dimensionKey: 'INTEGRATION',
      triggers: [on('sd_manual_transfer', 'YES', 'PARTLY'), on('sd_integration', 'PARTLY', 'NO')],
      surveyCategoryKey: 'TOO_MANY_SYSTEMS',
      suggestedInterventionCodes: ['INTEGRATE_SYSTEMS'],
      supportingCorpusKeys: ['pack:EV-DATA-TRANSFER-2025-001', 'pack:EV-APP-LANDSCAPE-2011-001'],
      defersAutomation: true,
    },
    {
      findingKey: 'sd_no_single_source',
      titleHu: 'Nem egyértelmű az elsődleges adatforrás.',
      summaryHu: 'A válaszok szerint nem tisztázott, melyik rendszer számít elsődleges forrásnak. Ez adatminőségi és felelősségi kérdéseket vet fel.',
      dimensionKey: 'GOVERNANCE',
      triggers: [on('sd_single_source', 'PARTLY', 'NO')],
      surveyCategoryKey: 'UNCLEAR_OWNERSHIP',
      suggestedInterventionCodes: ['INTEGRATE_SYSTEMS', 'CLARIFY_PROCESS_OWNERSHIP'],
      supportingCorpusKeys: ['pack:EV-APP-LANDSCAPE-2011-001', 'paper:process-owner-role-davenport-1990'],
      defersAutomation: true,
    },
    {
      findingKey: 'sd_overlap_review',
      titleHu: 'Rendszerátfedés további vizsgálatot igényel.',
      summaryHu: 'A válaszok szerint átfedő funkciójú rendszerek vannak. Az átfedés önmagában nem indokol összevonást; a funkciók, a kritikusság és a használat együttes vizsgálata szükséges.',
      dimensionKey: 'TECHNOLOGY',
      triggers: [on('sd_overlap', 'YES', 'PARTLY')],
      suggestedInterventionCodes: ['ALIGN_IT_WITH_BUSINESS_GOALS'],
      supportingCorpusKeys: ['pack:EV-APP-LANDSCAPE-2011-001'],
    },
    {
      findingKey: 'sd_no_system_owner',
      titleHu: 'Nem egyértelmű, ki felel az egyes rendszerekért.',
      summaryHu: 'A válaszok szerint a rendszerfelelősség nem tisztázott. A felelősségi rés rendszerhasználati és adatminőségi kockázatot jelent.',
      dimensionKey: 'OWNERSHIP',
      triggers: [on('sd_owner', 'PARTLY', 'NO')],
      surveyCategoryKey: 'UNCLEAR_OWNERSHIP',
      suggestedInterventionCodes: ['CLARIFY_PROCESS_OWNERSHIP'],
      supportingCorpusKeys: ['paper:process-owner-role-davenport-1990'],
    },
    {
      findingKey: 'sd_fragmentation_load',
      titleHu: 'Több rendszer közötti váltás terhelheti a munkát.',
      summaryHu: 'A válaszok szerint a munka több rendszer közötti váltással jár. A rendszerek puszta száma önmagában nem indokol összevonást; először az adatáramlás és a használat tisztázása indokolt.',
      dimensionKey: 'FRAGMENTATION',
      triggers: [on('sd_system_count', 'YES', 'PARTLY')],
      surveyCategoryKey: 'TOO_MANY_SYSTEMS',
      suggestedInterventionCodes: ['ALIGN_IT_WITH_BUSINESS_GOALS'],
      supportingCorpusKeys: ['pack:EV-DMM-2024-001', 'pack:EV-APP-LANDSCAPE-2011-001'],
    },
    {
      findingKey: 'sd_impact_unmeasured',
      titleHu: 'A rendszerhasználat folyamati hatása nincs mérve.',
      summaryHu: 'A válaszok szerint nem követik, hogy a rendszerek javítják-e a folyamatot. Mérés nélkül a rendszerberuházás értéke nem igazolható.',
      dimensionKey: 'MEASUREMENT',
      triggers: [on('sd_impact_measured', 'PARTLY', 'NO')],
      surveyCategoryKey: 'UNMEASURED_COST',
      suggestedInterventionCodes: ['IMPLEMENT_PROCESS_MEASUREMENT'],
      supportingCorpusKeys: ['pack:EV-DMM-2024-001'],
    },
  ],
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const ASSESSMENT_PACKS: readonly AssessmentPack[] = Object.freeze([
  DIGITAL_MATURITY,
  TRANSFORMATION_READINESS,
  PROCESS_AUTOMATION_READINESS,
  SYSTEMS_DATA_FLOW,
]);

const PACK_BY_KEY = new Map<string, AssessmentPack>(ASSESSMENT_PACKS.map((p) => [p.packKey, p]));

export function listAssessmentPacks(): readonly AssessmentPack[] {
  return ASSESSMENT_PACKS;
}

export function getAssessmentPack(packKey: string): AssessmentPack | undefined {
  return PACK_BY_KEY.get(String(packKey ?? ''));
}

export function assessmentQuestionKeys(pack: AssessmentPack): string[] {
  return pack.questions.map((q) => q.questionKey);
}

// ---------------------------------------------------------------------------
// Deterministic evaluation
// ---------------------------------------------------------------------------

export interface AssessmentFindingResult {
  findingKey: string;
  titleHu: string;
  summaryHu: string;
  dimensionKey: string;
  surveyCategoryKey: string | null;
  suggestedInterventionCodes: InterventionCode[];
  supportingCorpusKeys: string[];
  triggeringQuestionKeys: string[];
}

export interface AssessmentDirectionResult {
  code: InterventionCode;
  labelHu: string;
}

export interface AssessmentEvaluation {
  packKey: string;
  packVersion: number;
  findings: AssessmentFindingResult[];
  directions: AssessmentDirectionResult[];
  /** Dimension keys for which at least one answer was UNKNOWN (never negative). */
  unknownDimensions: string[];
  /** Dimension keys for which at least one answer was NOT_APPLICABLE. */
  notApplicableDimensions: string[];
  answeredCount: number;
  questionCount: number;
}

export interface AssessmentAnswerInput {
  questionKey: string;
  answer: string;
}

function ruleTriggeringQuestions(
  rule: AssessmentFindingRule,
  answerByKey: Map<string, string>,
): string[] {
  const hits = rule.triggers.filter((t) => t.answers.includes(answerByKey.get(t.questionKey) as AssessmentAnswer));
  const mode = rule.mode ?? 'ANY';
  if (mode === 'ALL') {
    return hits.length === rule.triggers.length ? hits.map((t) => t.questionKey) : [];
  }
  return hits.map((t) => t.questionKey);
}

/**
 * Deterministic question → finding evaluation.
 *
 * Returns `null` when the pack/version is unknown or the answer set is not a
 * valid, exactly-covering answer list for the pack (fail-closed; the normalizer
 * and the service both rely on this).
 */
export function evaluateAssessmentAnswers(
  packKey: string,
  packVersion: number,
  answers: readonly AssessmentAnswerInput[],
): AssessmentEvaluation | null {
  const pack = getAssessmentPack(packKey);
  if (!pack) return null;
  if (Number(packVersion) !== pack.version) return null;
  if (!Array.isArray(answers) || answers.length !== pack.questions.length) return null;

  const answerByKey = new Map<string, string>();
  for (const item of answers) {
    if (!item || typeof item.questionKey !== 'string' || typeof item.answer !== 'string') return null;
    const key = item.questionKey;
    if (!pack.questions.some((q) => q.questionKey === key)) return null;
    if (answerByKey.has(key)) return null;
    const normalized = item.answer.trim().toUpperCase();
    if (!ANSWER_SET.has(normalized)) return null;
    const question = pack.questions.find((q) => q.questionKey === key)!;
    if (!question.options.some((o) => o.value === normalized)) return null;
    answerByKey.set(key, normalized);
  }
  if (answerByKey.size !== pack.questions.length) return null;

  // Collect findings. First rule for a findingKey wins; subsequent rules with
  // the same key union their supporting intervention codes deterministically.
  const findings: AssessmentFindingResult[] = [];
  const byKey = new Map<string, AssessmentFindingResult>();
  for (const rule of pack.findings) {
    const triggers = ruleTriggeringQuestions(rule, answerByKey);
    if (!triggers.length) continue;
    const existing = byKey.get(rule.findingKey);
    if (existing) {
      for (const code of rule.suggestedInterventionCodes) {
        if (!existing.suggestedInterventionCodes.includes(code)) existing.suggestedInterventionCodes.push(code);
      }
      for (const corpusKey of rule.supportingCorpusKeys) {
        if (!existing.supportingCorpusKeys.includes(corpusKey)) existing.supportingCorpusKeys.push(corpusKey);
      }
      continue;
    }
    const result: AssessmentFindingResult = {
      findingKey: rule.findingKey,
      titleHu: rule.titleHu,
      summaryHu: rule.summaryHu,
      dimensionKey: rule.dimensionKey,
      surveyCategoryKey: rule.surveyCategoryKey ?? null,
      suggestedInterventionCodes: [...rule.suggestedInterventionCodes],
      supportingCorpusKeys: [...rule.supportingCorpusKeys],
      triggeringQuestionKeys: triggers,
    };
    byKey.set(rule.findingKey, result);
    findings.push(result);
  }

  // Automation guardrail: any deferral finding blocks blind repetitive-step
  // automation and offers redesign instead. Mirrors interventions.ts
  // contraindications (PROCESS_VARIABILITY / REWORK_PRESENT /
  // UNCLEAR_PROCESS_OWNERSHIP) which must keep blocking automation.
  const deferralPresent = pack.findings.some((rule) => rule.defersAutomation && byKey.has(rule.findingKey));
  if (deferralPresent) {
    for (const finding of findings) {
      const idx = finding.suggestedInterventionCodes.indexOf('AUTOMATE_REPETITIVE_STEP');
      if (idx === -1) continue;
      if (!finding.suggestedInterventionCodes.includes('REDESIGN_BEFORE_AUTOMATING')) {
        finding.suggestedInterventionCodes[idx] = 'REDESIGN_BEFORE_AUTOMATING';
      } else {
        finding.suggestedInterventionCodes.splice(idx, 1);
      }
    }
  }

  // Suggested directions: canonical intervention codes in first-appearance order.
  const directions: AssessmentDirectionResult[] = [];
  const seen = new Set<string>();
  for (const finding of findings) {
    for (const code of finding.suggestedInterventionCodes) {
      if (seen.has(code)) continue;
      seen.add(code);
      directions.push({ code, labelHu: interventionLabelHu(code) });
    }
  }

  const unknownDimensions: string[] = [];
  const notApplicableDimensions: string[] = [];
  for (const question of pack.questions) {
    if (answerByKey.get(question.questionKey) === 'UNKNOWN' && !unknownDimensions.includes(question.dimensionKey)) {
      unknownDimensions.push(question.dimensionKey);
    }
    if (answerByKey.get(question.questionKey) === 'NOT_APPLICABLE' && !notApplicableDimensions.includes(question.dimensionKey)) {
      notApplicableDimensions.push(question.dimensionKey);
    }
  }

  return {
    packKey: pack.packKey,
    packVersion: pack.version,
    findings,
    directions,
    unknownDimensions,
    notApplicableDimensions,
    answeredCount: pack.questions.length,
    questionCount: pack.questions.length,
  };
}

// ---------------------------------------------------------------------------
// Submission validation
// ---------------------------------------------------------------------------

export class AssessmentValidationError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AssessmentValidationError';
    this.status = status;
    this.code = code;
  }
}

export const ASSESSMENT_MAX_ANSWERS = 64;

export interface ValidatedAssessmentSubmission {
  pack: AssessmentPack;
  answers: AssessmentAnswerInput[];
}

/**
 * Strict, exact validation of a customer assessment submission.
 * Rejects unknown pack/version/question, duplicate questions, invalid answers,
 * incomplete submissions and oversized payloads. No raw user-controlled labels
 * are accepted: only canonical question keys and canonical answer enums.
 */
export function validateAssessmentSubmission(
  packKey: string,
  packVersion: unknown,
  rawAnswers: unknown,
): ValidatedAssessmentSubmission {
  const pack = getAssessmentPack(packKey);
  if (!pack) {
    throw new AssessmentValidationError(400, 'ASSESSMENT_UNKNOWN_PACK', 'Ismeretlen felmérés.');
  }
  const version = Number(packVersion);
  if (!Number.isInteger(version) || version !== pack.version) {
    throw new AssessmentValidationError(400, 'ASSESSMENT_UNKNOWN_VERSION', 'Nem támogatott felmérés-verzió.');
  }
  if (!Array.isArray(rawAnswers)) {
    throw new AssessmentValidationError(400, 'ASSESSMENT_INVALID_ANSWERS', 'A válaszok formátuma érvénytelen.');
  }
  if (rawAnswers.length > ASSESSMENT_MAX_ANSWERS) {
    throw new AssessmentValidationError(400, 'ASSESSMENT_PAYLOAD_TOO_LARGE', 'A beküldött válaszok száma túl nagy.');
  }
  if (rawAnswers.length !== pack.questions.length) {
    throw new AssessmentValidationError(400, 'ASSESSMENT_INCOMPLETE', 'A felmérés befejezéséhez minden kérdést meg kell válaszolni.');
  }

  const questionKeys = new Set(pack.questions.map((q) => q.questionKey));
  const seen = new Set<string>();
  const answers: AssessmentAnswerInput[] = [];
  for (const raw of rawAnswers) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new AssessmentValidationError(400, 'ASSESSMENT_INVALID_ANSWERS', 'A válaszok formátuma érvénytelen.');
    }
    const record = raw as Record<string, unknown>;
    const questionKey = record.questionKey;
    const answer = record.answer;
    if (typeof questionKey !== 'string' || !questionKeys.has(questionKey)) {
      throw new AssessmentValidationError(400, 'ASSESSMENT_UNKNOWN_QUESTION', 'Ismeretlen kérdés a beküldött válaszok között.');
    }
    if (seen.has(questionKey)) {
      throw new AssessmentValidationError(400, 'ASSESSMENT_DUPLICATE_QUESTION', 'Egy kérdés csak egyszer szerepelhet.');
    }
    seen.add(questionKey);
    if (typeof answer !== 'string') {
      throw new AssessmentValidationError(400, 'ASSESSMENT_INVALID_ANSWER', 'Érvénytelen válasz.');
    }
    const normalized = answer.trim().toUpperCase();
    if (!ANSWER_SET.has(normalized)) {
      throw new AssessmentValidationError(400, 'ASSESSMENT_INVALID_ANSWER', 'Érvénytelen válasz.');
    }
    const question = pack.questions.find((q) => q.questionKey === questionKey)!;
    if (!question.options.some((o) => o.value === normalized)) {
      throw new AssessmentValidationError(400, 'ASSESSMENT_INVALID_ANSWER', 'Érvénytelen válasz.');
    }
    answers.push({ questionKey, answer: normalized });
  }

  // Canonical deterministic order (pack question order) so identical answer sets
  // always produce an identical canonical payload/digest.
  const ordered = pack.questions.map((q) => answers.find((a) => a.questionKey === q.questionKey)!);
  return { pack, answers: ordered };
}
