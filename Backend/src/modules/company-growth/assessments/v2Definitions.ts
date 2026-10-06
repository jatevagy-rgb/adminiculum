import type { AssessmentPack, AssessmentQuestion, AssessmentFindingRule, AssessmentCondition } from './registry';

export const GROW_ASSESSMENT_V2_SCHEMA = 'GROW_ASSESSMENT_V2';
const labels: Record<string, string> = {
  YES: 'Igen', PARTLY: 'Részben', NO: 'Nem', UNKNOWN: 'Nem tudom', NOT_APPLICABLE: 'Nem értelmezhető',
  NEVER: 'Egyszer sem', ONCE_OR_TWICE: '1–2 alkalommal', WEEKLY: 'Körülbelül hetente', SEVERAL_TIMES_A_WEEK: 'Hetente többször', ALMOST_DAILY: 'Szinte minden munkanapon',
  ONE: '1', TWO: '2', THREE_FOUR: '3–4', FIVE_PLUS: '5 vagy több', ALWAYS: 'Igen, mindig', USUALLY: 'Többnyire', SOMETIMES: 'Néha', REGULARLY: 'Igen, rendszeresen',
  ALMOST_ALWAYS: 'Szinte mindig', MOSTLY: 'Többnyire', EIGHT_TEN: '8–10', FOUR_SEVEN: '4–7', ONE_THREE: '1–3', NONE: 'Egy sem', NOT_ENOUGH_CASES: 'Nem volt még 10 hasonló eset',
  DOCUMENTED_AND_USED: 'A közös leírást követjük', DOCUMENTED_INCONSISTENT: 'Van közös leírás, de nem mindig követjük', INFORMAL: 'Nincs leírva, de nagyjából mindenki ismeri',
  ALL: 'Mindegyik', MOST: 'A többségük', SOME: 'Csak egy részük', VARIES: 'Változó helyen', SHARED: 'Többen közösen', NO_BASELINE: 'Nem volt kiinduló mérés', ALL_OR_ALMOST_ALL: 'Igen, szinte mindenki',
};
const frequency = ['NEVER', 'ONCE_OR_TWICE', 'WEEKLY', 'SEVERAL_TIMES_A_WEEK', 'ALMOST_DAILY', 'UNKNOWN'];
const clarity = ['ALWAYS', 'USUALLY', 'SOMETIMES', 'NO', 'UNKNOWN'];
const yes = ['YES', 'PARTLY', 'NO', 'UNKNOWN'];
const measurement = ['REGULARLY', 'SOMETIMES', 'NO', 'UNKNOWN'];
const trigger = (questionKey: string, ...answers: string[]) => ({ questionKey, answers });
const when = (...triggers: AssessmentCondition['triggers']): AssessmentCondition => ({ mode: 'ALL', triggers });
function q(questionKey: string, promptHu: string, values: readonly string[], condition?: AssessmentCondition): AssessmentQuestion {
  return { questionKey, dimensionKey: questionKey, promptHu, type: 'CHOICE', options: values.map(value => ({ value, labelHu: labels[value] })), ...(condition ? { when: condition } : {}) };
}
function finding(findingKey: string, titleHu: string, summaryHu: string, nextCheckHu: string, triggers: AssessmentFindingRule['triggers'], codes: AssessmentFindingRule['suggestedInterventionCodes'], corpus: readonly string[], category?: AssessmentFindingRule['surveyCategoryKey'], defersAutomation = false): AssessmentFindingRule {
  return { findingKey, titleHu, summaryHu, nextCheckHu, dimensionKey: findingKey, mode: 'ALL', triggers, suggestedInterventionCodes: codes, supportingCorpusKeys: corpus, ...(category ? { surveyCategoryKey: category } : {}), ...(defersAutomation ? { defersAutomation: true } : {}) };
}
const transfer = ['pack:EV-DATA-TRANSFER-2025-001'];
const redesign = ['paper:bps-standardization-goel-bandara-gable-2023', 'pack:EV-BPM-RPA-SLR-2026-001'];
const ownership = ['paper:process-owner-role-davenport-1990'];
const measures = ['pack:EV-DT-ROI-2024-001'];
const digital = ['pack:EV-SME-DT-2024-001'];
function pack(packKey: string, titleHu: string, questions: AssessmentQuestion[], findings: AssessmentFindingRule[], process = true): AssessmentPack {
  return { packKey, version: 2, titleHu, descriptionHu: 'Néhány rövid kérdés arról, amit a mindennapi munkában tapasztal.', estimatedMinutes: packKey === 'QUICK_SCAN_V2' ? 3 : 4, allowsProcessReference: process, evidenceCorpusKeys: [...new Set(findings.flatMap(f => f.supportingCorpusKeys))], questions, findings };
}

const quick = pack('QUICK_SCAN_V2', 'Gyors állapotfelmérés', [
  q('qs_duplicate_entry_frequency', 'Az elmúlt 4 hétben milyen gyakran kellett ugyanazt az adatot egynél több helyre beírni?', frequency),
  q('qs_approval_wait_frequency', 'Az elmúlt 4 hétben milyen gyakran állt meg a munka azért, mert valaki jóváhagyására vagy döntésére kellett várni?', frequency),
  q('qs_rework_frequency', 'Az elmúlt 4 hétben milyen gyakran kellett egy már elvégzett lépést javítás miatt újra megcsinálni?', frequency),
  q('qs_typical_system_count', 'Egy tipikus munkafolyamat elvégzéséhez hány különböző rendszerben kell dolgozni?', ['ONE', 'TWO', 'THREE_FOUR', 'FIVE_PLUS', 'UNKNOWN']),
  q('qs_next_decision_owner_clarity', 'Ha a munka elakad, egyértelmű, ki dönt a következő lépésről?', clarity),
  q('qs_cycle_time_measurement', 'Mérik, mennyi idő telik el a folyamat kezdetétől a befejezéséig?', measurement),
], [], false);

const dataFlow = pack('DATA_FLOW_V2', 'Adatok és rendszerek közötti munka', [
  q('v2_data_already_digital', 'Amikor ugyanazt az adatot újra beírják, az első rendszerben már digitálisan rendelkezésre áll?', ['ALMOST_ALWAYS', 'MOSTLY', 'SOMETIMES', 'NO', 'UNKNOWN']),
  q('v2_data_transfer_automation', 'Az adat átkerül automatikusan a használt rendszerek között?', ['YES', 'MOSTLY', 'PARTLY', 'NO', 'UNKNOWN']),
  q('v2_source_of_truth_clarity', 'Ha ugyanarra az adatra két rendszer eltérő értéket mutat, egyértelmű, melyik számít helyesnek?', clarity),
  q('v2_duplicate_entry_error_frequency', 'Az elmúlt 4 hétben az eltérő vagy többször rögzített adatok miatt milyen gyakran kellett javítani a munkát?', frequency, when(trigger('v2_data_already_digital', 'ALMOST_ALWAYS', 'MOSTLY', 'SOMETIMES'), trigger('v2_data_transfer_automation', 'PARTLY', 'NO'))),
], [
  finding('v2_manual_transfer', 'Digitális adatot kézzel adnak tovább.', 'A válaszai alapján érdemes megvizsgálni a már digitálisan létező adatok ismételt rögzítését. Az átadás módja többletmunkát okozhat.', 'Kövessenek végig egy konkrét adatot a forrástól a felhasználásig.', [trigger('v2_data_already_digital', 'ALMOST_ALWAYS', 'MOSTLY'), trigger('v2_data_transfer_automation', 'PARTLY', 'NO')], ['INTEGRATE_SYSTEMS'], transfer, 'DUPLICATE_DATA'),
  finding('v2_data_authority_unclear', 'Az eltérő adatok feloldása tisztázást igényelhet.', 'A megadott válasz szerint nem mindig egyértelmű, melyik adatot használják. Ez az egyeztetést nehezítheti; nem jogi vagy megfelelőségi minősítés.', 'Egy eltérés példáján tisztázzák az adat gazdáját és a döntés módját.', [trigger('v2_source_of_truth_clarity', 'SOMETIMES', 'NO')], ['CLARIFY_PROCESS_OWNERSHIP'], ownership, 'UNCLEAR_OWNERSHIP', true),
  finding('v2_transfer_rework', 'Az adatátadást javítások kísérik.', 'A válaszok ismételt adatbevitelhez kapcsolódó javításokat jeleznek. Az átadás megértése megelőzi az automatizálás mérlegelését.', 'Nézzenek meg két közelmúltbeli javítást és a hiba keletkezési pontját.', [trigger('v2_data_already_digital', 'ALMOST_ALWAYS', 'MOSTLY', 'SOMETIMES'), trigger('v2_data_transfer_automation', 'PARTLY', 'NO'), trigger('v2_duplicate_entry_error_frequency', 'WEEKLY', 'SEVERAL_TIMES_A_WEEK', 'ALMOST_DAILY')], ['REDESIGN_BEFORE_AUTOMATING'], transfer, 'REWORK', true),
]);
const approval = pack('APPROVAL_V2', 'Jóváhagyás és várakozás', [
  q('v2_approval_decision_wait', 'A várakozás leggyakrabban azért történik, mert nem érkezik meg időben a szükséges döntés?', ['YES', 'MOSTLY', 'SOMETIMES', 'NO', 'UNKNOWN']),
  q('v2_approval_criteria', 'Egyértelmű, milyen feltételek teljesülésekor adható meg a jóváhagyás?', clarity),
  q('v2_approval_backup', 'Ha a döntéshozó nem elérhető, van előre meghatározott helyettesítő vagy eszkalációs út?', [...yes, 'NOT_APPLICABLE']),
  q('v2_approval_wait_measurement', 'Mérik, mennyi időt tölt a folyamat jóváhagyásra várva?', measurement),
], [
  finding('v2_approval_criteria_gap', 'A döntési feltételek tisztázása segíthet.', 'A válaszok döntésre várást és bizonytalan jóváhagyási feltételeket jeleznek. A szükséges kontrollok megtartása mellett érdemes áttekinteni a döntés útját.', 'Egy várakozó esetnél azonosítsák a szükséges információt és a jóváhagyás célját.', [trigger('v2_approval_decision_wait', 'YES', 'MOSTLY'), trigger('v2_approval_criteria', 'SOMETIMES', 'NO')], ['REDESIGN_APPROVAL_ROUTING'], ['pack:EV-DECISION-RIGHTS-2019-001'], 'SLOW_APPROVAL'),
  finding('v2_approval_backup_gap', 'A döntéshozó kiesése megállíthatja a munkát.', 'A válaszok szerint a döntésre váráshoz nem társul teljesen tisztázott helyettesítés. Ez nem indokolja önmagában a jóváhagyás eltörlését.', 'Tisztázzák, ki és milyen felhatalmazással dönthet távollét esetén.', [trigger('v2_approval_decision_wait', 'YES', 'MOSTLY'), trigger('v2_approval_backup', 'PARTLY', 'NO')], ['CLARIFY_PROCESS_OWNERSHIP'], ownership, 'UNCLEAR_OWNERSHIP', true),
  finding('v2_approval_unmeasured', 'A várakozás időtartama még pontosítandó.', 'A válaszok alapján a döntésre várás ideje nincs rendszeresen mérve. Mérés nélkül a változtatás hatása nehezebben ellenőrizhető.', 'Néhány esetnél rögzítsék a döntéskérés és a döntés időpontját.', [trigger('v2_approval_decision_wait', 'YES', 'MOSTLY'), trigger('v2_approval_wait_measurement', 'SOMETIMES', 'NO')], ['IMPLEMENT_PROCESS_MEASUREMENT'], measures, 'UNMEASURED_COST'),
]);
const stabilityQuestions = [
  q('v2_same_sequence_count', 'Az utóbbi 10 hasonló esetből körülbelül hány ment végig ugyanazzal a lépéssorral?', ['EIGHT_TEN', 'FOUR_SEVEN', 'ONE_THREE', 'NONE', 'NOT_ENOUGH_CASES', 'UNKNOWN']),
  q('v2_process_instructions_use', 'A csapat hogyan követi a folyamat lépéseit és döntési szabályait?', ['DOCUMENTED_AND_USED', 'DOCUMENTED_INCONSISTENT', 'INFORMAL', 'NO', 'UNKNOWN']),
  q('v2_exceptions_recognizable', 'A leggyakoribb kivételek már a folyamat elején felismerhetők?', ['YES', 'MOSTLY', 'SOMETIMES', 'NO', 'UNKNOWN']),
  q('v2_repetitive_data_digital', 'Az ismétlődő lépésekhez szükséges adatok digitálisan rendelkezésre állnak?', ['ALL', 'MOST', 'SOME', 'NO', 'UNKNOWN']),
];
const stabilityRules = [
  finding('v2_sequence_varies', 'A hasonló esetek menete gyakran eltér.', 'A válaszai alapján az ismétlődőnek tűnő munkának több változata lehet. A változatok megértése szükséges az automatizálás mérlegelése előtt.', 'Hasonlítsanak össze egy tipikus és egy eltérő esetet.', [trigger('v2_same_sequence_count', 'FOUR_SEVEN', 'ONE_THREE', 'NONE')], ['REDESIGN_BEFORE_AUTOMATING'], redesign, 'MANUAL_ADMIN', true),
  finding('v2_instructions_gap', 'A közös munkamenet pontosítható.', 'A leírt szabályok követése vagy a közös leírás még nem egységes. Ezt érdemes a csapattal áttekinteni.', 'Egyeztessék a ténylegesen követett lépéseket a munkát végzőkkel.', [trigger('v2_process_instructions_use', 'DOCUMENTED_INCONSISTENT', 'INFORMAL', 'NO')], ['REDESIGN_BEFORE_AUTOMATING'], redesign, 'MANUAL_ADMIN', true),
  finding('v2_exceptions_late', 'A kivételek felismerése további vizsgálatot igényelhet.', 'A válaszok szerint a kivételek egy része csak menet közben derül ki. Előbb ezek kezelését érdemes megérteni.', 'Nézzenek meg két kivételt és a felismeréshez szükséges információt.', [trigger('v2_exceptions_recognizable', 'SOMETIMES', 'NO')], ['REDESIGN_BEFORE_AUTOMATING'], redesign, 'MANUAL_ADMIN', true),
  finding('v2_digital_input_gap', 'A szükséges bemeneti adatok egy része nem digitális.', 'A válaszok szerint az adatok előkészítése külön munkát igényelhet. Ez korlátozhatja az ismétlődő lépések gépi támogatását.', 'Azonosítsák, hogyan keletkeznek és ellenőrizhetők a bemeneti adatok.', [trigger('v2_repetitive_data_digital', 'SOME', 'NO')], ['DIGITIZE_INTAKE'], ['paper:reengineering-work-hammer-1990'], 'MANUAL_ADMIN', true),
  finding('v2_repeatable_candidate', 'Érdemes megvizsgálni egy ismétlődő lépés gépi támogatását.', 'A válaszok többnyire azonos munkamenetet, követett szabályokat és digitális adatokat jeleznek. Ez vizsgálati irány, nem automatizálási döntés.', 'Válasszanak egy lépést, és ellenőrizzék a kivételeket, költségeket és kontrollokat.', [trigger('v2_same_sequence_count', 'EIGHT_TEN'), trigger('v2_process_instructions_use', 'DOCUMENTED_AND_USED'), trigger('v2_exceptions_recognizable', 'YES', 'MOSTLY'), trigger('v2_repetitive_data_digital', 'ALL', 'MOST')], ['AUTOMATE_REPETITIVE_STEP'], ['pack:EV-BPM-RPA-SLR-2026-001'], 'MANUAL_ADMIN'),
];
const stability = pack('PROCESS_STABILITY_V2', 'A munkamenet és az ismétlődő lépések', stabilityQuestions, stabilityRules);
// Explicit immutable variant: the fifth question is offered only after a
// customer-declared REWORK entry or a matching quick-scan routing signal.
const rework = pack('PROCESS_STABILITY_REWORK_V2', 'Visszatérő javítások és munkamenet', [...stabilityQuestions, q('v2_rework_same_point', 'A javítás leggyakrabban ugyanazon a ponton válik szükségessé?', ['YES', 'MOSTLY', 'VARIES', 'UNKNOWN'])], [...stabilityRules.filter(rule => rule.findingKey !== 'v2_repeatable_candidate'),
  finding('v2_rework_location', 'A javítások helyét érdemes áttekinteni.', 'A javításokról megadott válasz segíthet eldönteni, hogy egyetlen átadási pontot vagy több esetváltozatot vizsgáljanak először.', 'Gyűjtsenek néhány példát a javítás helyéről és kiváltó okáról.', [trigger('v2_rework_same_point', 'YES', 'MOSTLY', 'VARIES')], ['REDESIGN_BEFORE_AUTOMATING'], redesign, 'REWORK', true),
]);
const owner = pack('OWNERSHIP_V2', 'Felelősség és döntések', [
  q('v2_process_owner', 'Van egy megnevezett személy vagy szerepkör, aki a folyamat egészéért felel?', ['YES', 'SHARED', 'NO', 'UNKNOWN']),
  q('v2_cross_team_decision', 'Ha két csapat között elakad a munka, egyértelmű, ki hozza meg a döntést?', clarity),
  q('v2_process_review_owner', 'Van valaki, aki rendszeresen áttekinti a folyamat eredményét és a visszatérő problémákat?', yes),
], [
  finding('v2_owner_gap', 'A teljes folyamat felelőse tisztázandó lehet.', 'A válasz szerint nincs megnevezett felelős a folyamat egészére. Ez az átadási pontokon bizonytalanságot okozhat.', 'Tisztázzák a felelősségi kört és a hozzá tartozó döntési jogot.', [trigger('v2_process_owner', 'NO')], ['CLARIFY_PROCESS_OWNERSHIP'], ownership, 'UNCLEAR_OWNERSHIP', true),
  finding('v2_team_decision_gap', 'A csapatok közötti döntés útja pontosítható.', 'A válasz alapján elakadáskor nem mindig egyértelmű a döntéshozó. A közös felelősség önmagában nem hiba.', 'Egy konkrét elakadáson egyeztessék a döntés útját.', [trigger('v2_cross_team_decision', 'SOMETIMES', 'NO')], ['CLARIFY_PROCESS_OWNERSHIP'], ownership, 'UNCLEAR_OWNERSHIP', true),
  finding('v2_review_owner_gap', 'Az eredmények rendszeres áttekintése nem teljesen rendezett.', 'A megadott válasz szerint az eredmények áttekintése nem egyértelműen gazdásított. Emiatt visszatérő problémák maradhatnak észrevétlenek.', 'Beszéljék meg, ki és milyen időközönként nézi át a tapasztalatokat.', [trigger('v2_process_review_owner', 'PARTLY', 'NO')], ['CLARIFY_PROCESS_OWNERSHIP'], ownership, 'UNCLEAR_OWNERSHIP'),
]);
const hasMeasure = when(trigger('v2_process_metric', 'YES', 'PARTLY'));
const measure = pack('MEASUREMENT_V2', 'Mérés és visszatekintés', [
  q('v2_process_metric', 'Van olyan mutató, amelyből látszik, hogy ez a folyamat jól működik-e?', yes),
  q('v2_metric_baseline', 'A fejlesztések előtt rögzítik ennek a mutatónak a kiinduló értékét?', ['USUALLY', 'SOMETIMES', 'NO', 'UNKNOWN'], hasMeasure),
  q('v2_metric_followup', 'Egy változtatás után ugyanazt a mutatót újra megnézik?', ['USUALLY', 'SOMETIMES', 'NO', 'UNKNOWN'], hasMeasure),
], [
  finding('v2_metric_missing', 'A folyamat eredménye még nehezen követhető.', 'A válasz alapján nincs meghatározott mutató. Enélkül a fejlesztés előtti és utáni állapot összevetése nehezebb.', 'Válasszanak egy, az üzleti célhoz kapcsolódó egyszerű mutatót.', [trigger('v2_process_metric', 'NO')], ['IMPLEMENT_PROCESS_MEASUREMENT'], measures, 'UNMEASURED_COST'),
  finding('v2_baseline_gap', 'A kiinduló mérés nem rendszeres.', 'A válaszok alapján van mutató, de a fejlesztés előtti értéket nem mindig rögzítik. Így a későbbi különbség nehezebben értelmezhető.', 'A következő változtatás előtt rögzítsék a mutató értékét és mérési módját.', [trigger('v2_process_metric', 'YES', 'PARTLY'), trigger('v2_metric_baseline', 'SOMETIMES', 'NO')], ['IMPLEMENT_PROCESS_MEASUREMENT'], measures, 'UNMEASURED_COST'),
  finding('v2_followup_gap', 'A változtatás utáni visszamérés nem rendszeres.', 'A megadott válaszok szerint a mutató későbbi értékét nem mindig nézik meg. Ebből megtakarítás vagy ROI nem állapítható meg.', 'Rögzítsék, mikor és ugyanazzal a módszerrel hogyan mérnek újra.', [trigger('v2_process_metric', 'YES', 'PARTLY'), trigger('v2_metric_followup', 'SOMETIMES', 'NO')], ['IMPLEMENT_PROCESS_MEASUREMENT'], measures, 'UNMEASURED_COST'),
]);
const invested = when(trigger('v2_digital_investment_recent', 'YES'));
const investment = pack('DIGITAL_VALUE_V2', 'Digitális bevezetés és üzleti cél', [
  q('v2_digital_investment_recent', 'Vezettek be az elmúlt 12 hónapban új rendszert vagy jelentősebb digitális megoldást?', ['YES', 'NO', 'UNKNOWN']),
  q('v2_investment_problem', 'A bevezetés előtt rögzítették, milyen konkrét üzleti problémát kell megoldania?', yes, invested),
  q('v2_investment_metric', 'A bevezetés előtt rögzítettek olyan mérőszámot, amellyel később ellenőrizhető a hatás?', yes, invested),
  q('v2_investment_remeasurement', 'A bevezetés után ugyanazt a mérőszámot újra megmérték?', ['YES', 'NO', 'NO_BASELINE', 'UNKNOWN'], invested),
  q('v2_investment_preparation', 'Az érintett munkatársak megkapták a szükséges felkészítést az új megoldáshoz?', ['ALL_OR_ALMOST_ALL', 'MOST', 'SOME', 'NO', 'UNKNOWN'], invested),
], [
  finding('v2_investment_goal_gap', 'A bevezetés üzleti célja pontosítható.', 'A válaszok szerint az új megoldáshoz nem teljesen rögzített üzleti probléma tartozik. Ez megnehezítheti az eredmény megítélését.', 'Egyeztessék, milyen konkrét munkabeli problémát vártak megoldani.', [trigger('v2_digital_investment_recent', 'YES'), trigger('v2_investment_problem', 'PARTLY', 'NO')], ['ALIGN_IT_WITH_BUSINESS_GOALS'], digital),
  finding('v2_investment_measure_gap', 'A bevezetés hatása mérési alapot igényel.', 'A válaszok alapján a bevezetés előtt nem volt teljes mérési alap. A rendszer használata önmagában nem bizonyít üzleti eredményt.', 'Tisztázzák az értékelhető mutatót és az összehasonlítás korlátait.', [trigger('v2_digital_investment_recent', 'YES'), trigger('v2_investment_metric', 'PARTLY', 'NO')], ['IMPLEMENT_PROCESS_MEASUREMENT'], measures, 'UNMEASURED_COST'),
  finding('v2_investment_followup_gap', 'A hatás utólagos ellenőrzése még hiányozhat.', 'A válaszok szerint az új megoldás hatását nem mérték vissza azonos mutatóval. Megtérülést ebből nem lehet állítani.', 'Ellenőrizzék, milyen összehasonlítható adat áll rendelkezésre.', [trigger('v2_digital_investment_recent', 'YES'), trigger('v2_investment_remeasurement', 'NO', 'NO_BASELINE')], ['IMPLEMENT_PROCESS_MEASUREMENT'], measures, 'UNMEASURED_COST'),
  finding('v2_investment_preparation_check', 'A felkészítés és a bevezetés célja közös tisztázást igényelhet.', 'A válaszok részleges felkészítést és nem teljesen rögzített célt jeleznek. Egy válaszadó jelzése nem bizonyít képzési problémát.', 'Kérdezzék meg az érintetteket, mely konkrét feladatokban kell támogatás.', [trigger('v2_digital_investment_recent', 'YES'), trigger('v2_investment_problem', 'PARTLY', 'NO'), trigger('v2_investment_preparation', 'SOME', 'NO')], ['TRAIN_DIGITAL_SKILLS'], ['pack:EV-KOUMAS-2021-001']),
], false);
export const V2_ASSESSMENT_PACKS: readonly AssessmentPack[] = [quick, dataFlow, approval, stability, rework, owner, measure, investment];

export const V2_PAIN_ROUTES: Readonly<Record<string, string>> = Object.freeze({ MANUAL_ADMIN: 'PROCESS_STABILITY_V2', SLOW_APPROVAL: 'APPROVAL_V2', DUPLICATE_DATA: 'DATA_FLOW_V2', TOO_MANY_SYSTEMS: 'DATA_FLOW_V2', UNCLEAR_OWNERSHIP: 'OWNERSHIP_V2', REWORK: 'PROCESS_STABILITY_REWORK_V2', UNMEASURED_COST: 'MEASUREMENT_V2', GENERAL_CONCERN: 'QUICK_SCAN_V2' });
export function quickScanRoutes(answers: readonly { questionKey: string; answer: string }[]): string[] {
  const a = Object.fromEntries(answers.map(x => [x.questionKey, x.answer]));
  const frequent = (key: string) => ['WEEKLY', 'SEVERAL_TIMES_A_WEEK', 'ALMOST_DAILY'].includes(a[key]);
  const routes: string[] = [];
  if (frequent('qs_duplicate_entry_frequency')) routes.push('DATA_FLOW_V2');
  if (frequent('qs_approval_wait_frequency')) routes.push('APPROVAL_V2');
  if (frequent('qs_rework_frequency')) routes.push('PROCESS_STABILITY_REWORK_V2');
  if (['SOMETIMES', 'NO'].includes(a.qs_next_decision_owner_clarity)) routes.push('OWNERSHIP_V2');
  if (['SOMETIMES', 'NO'].includes(a.qs_cycle_time_measurement)) routes.push('MEASUREMENT_V2');
  if (['THREE_FOUR', 'FIVE_PLUS'].includes(a.qs_typical_system_count)) routes.push('DATA_FLOW_V2');
  return [...new Set(routes)];
}
