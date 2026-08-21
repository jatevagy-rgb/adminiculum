#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const corpus = 'C:/Users/hubay/Documents/Adminiculum/tvek';
const reviewDir = path.join(root, 'docs/compliance/legal-review');
const LEGAL_REVIEW_REQUIRED = 'LEGAL_REVIEW_REQUIRED';

const compactHash = (text) => crypto.createHash('sha256')
  .update(Buffer.from(text.replace(/\s+/g, ' ').trim(), 'utf8'))
  .digest('hex');

function sourceAnchor(fileName, sourceKey, sourceSha256, provisionReference, start, end) {
  const lines = fs.readFileSync(path.join(corpus, fileName), 'utf8').split(/\r?\n/);
  return {
    sourceKey,
    sourceSha256,
    sourceVersion: 'CORPUS_CAPTURE',
    provisionReference,
    headingContext: 'Wave 4A substantive review',
    lineSpan: { start, end },
    excerptSha256: compactHash(lines.slice(start - 1, end).join('\n')),
    provenance: 'STANDALONE_SOURCE',
  };
}

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(reviewDir, name), 'utf8'));
}

function save(name, value) {
  fs.writeFileSync(path.join(reviewDir, name), `${JSON.stringify(value, null, 2)}\n`);
}

function upsert(items, key, value) {
  const index = items.findIndex((item) => item[key] === value[key]);
  if (index === -1) items.push(value);
  else items[index] = value;
}

const anchors = {
  'A-MVT-54': sourceAnchor(
    '1993. évi XCIII. törvény.txt',
    'HU:ACT:1993:XCIII',
    'b7cbae3e25952a041e25e74d216b4c3e347997de42dc9494a8f08ffc7a296088',
    '54. § (2)-(5)', 369, 403,
  ),
  'A-MUM-5-8': sourceAnchor(
    '5_1993. (XII. 26.) MüM rendelet.txt',
    'HU:DECREE:5/1993:MÜM',
    '8d3f809bdcf6757c9e5af92193bea5553558f45d19ed15ad01f3be782cccf657',
    '5-8. §', 148, 198,
  ),
  'A-MT-46': sourceAnchor(
    '2012. évi I. törvény.txt',
    'HU:ACT:2012:I',
    '0896a91665e2c6bf663dff863a2f06fd2ab6a4af48c6f8f69ff88c40f6f87400',
    '46. § (1), (5)', 522, 558,
  ),
};

function requirement(requirementKey, titleHu, trigger, requiredAction, deadline, frequency, evidenceExpected, sourceAnchors, documentationNeed, legalReviewNotes) {
  return {
    requirementKey,
    titleHu,
    summaryHu: requiredAction,
    domain: 'employment_hr_safety',
    subdomain: 'employment_hr_safety',
    requirementType: 'DOCUMENTATION',
    mandatoryLevel: 'CONDITIONAL_MANDATORY',
    regulatedActor: 'Munkáltató',
    trigger,
    requiredAction,
    deadline,
    frequency,
    evidenceExpected,
    sourceAnchors,
    documentationNeed,
    legalReviewStatus: LEGAL_REVIEW_REQUIRED,
    legalReviewNotes,
  };
}

const requirementsToAdd = [
  requirement(
    'WORKPLACE_RISK_ASSESSMENT_INITIAL_PERIODIC',
    'Munkavédelmi kockázatértékelés elkészítése és időszakos felülvizsgálata',
    'A munkáltató szervezett munkavégzéshez tevékenységet kezd vagy munkahelyet működtet.',
    'A tevékenység megkezdése előtt elkészíti és dokumentálja a kockázatértékelést, majd azt eltérő jogszabályi rendelkezés hiányában legalább öt évente elvégzi.',
    'A tevékenység megkezdése előtt.',
    'Ezt követően indokolt esetben, de eltérő jogszabályi rendelkezés hiányában legalább 5 évente.',
    'Kockázatértékelés a forrás szerinti dokumentált tartalmi elemekkel.',
    ['A-MVT-54'],
    'EXPLICIT_DOCUMENT_REQUIRED',
    'A legalább ötéves ciklus és az esemény-/változás-alapú felülvizsgálat külön kötelezettségként szerepel.',
  ),
  requirement(
    'WORKPLACE_RISK_ASSESSMENT_EVENT_REVIEW',
    'Munkavédelmi kockázatértékelés esemény- vagy változás-alapú felülvizsgálata',
    'A 54. § (3) szerinti tevékenység-, technológia-, munkaeszköz-, munkamód- vagy munkakörülmény-változás, illetve munkabaleset, fokozott expozíció vagy foglalkozási megbetegedés történik.',
    'Elvégzi és dokumentálja a kockázatértékelést, annak részeként a kockázatkezelést és a megelőző intézkedések meghatározását.',
    'Az indokolt eset bekövetkezésekor.',
    'Eseményhez vagy változáshoz kötötten.',
    'Felülvizsgált kockázatértékelés és a forrás szerinti dokumentált tartalmi elemek.',
    ['A-MVT-54'],
    'EXPLICIT_DOCUMENT_REQUIRED',
    'Nem rövidíti le és nem helyettesíti a törvényi, legalább ötéves időszakos felülvizsgálatot.',
  ),
  requirement(
    'WORK_ACCIDENT_INVESTIGATION_RECORD',
    'Munkabaleset kivizsgálása és dokumentálása',
    'Munkaképtelenséggel járó munkabaleset történik.',
    'A munkabalesetet haladéktalanul kivizsgálja; a három munkanapot meghaladó munkaképtelenséggel járó esetet a forrás szerint nyilvántartásba veszi és bejelenti, a vizsgálat megállapításait részletesen rögzíti.',
    'A bekövetkezést követően haladéktalanul.',
    'Minden érintett munkabalesetnél.',
    'Vizsgálati dokumentáció, jegyzőkönyv és a forrás szerinti nyilvántartási/bejelentési bizonyíték.',
    ['A-MUM-5-8'],
    'EXPLICIT_DOCUMENT_REQUIRED',
    'A három munkanapot meghaladó munkaképtelenség tényének megállapítása és a további bejelentési részletszabályok specialistai ellenőrzést igényelnek.',
  ),
  requirement(
    'SERIOUS_WORK_ACCIDENT_NOTIFICATION',
    'Súlyos munkabaleset haladéktalan hatósági bejelentése és bizonyítékmegőrzése',
    'A munkabaleset súlyosnak minősül.',
    'Haladéktalanul bejelenti a munkavédelmi hatóságnak, és a hatóság megérkezéséig megőrzi a baleseti helyszínt, vagy a forrás szerinti veszély/kár esetén dokumentálja annak állapotát.',
    'Haladéktalanul.',
    'Minden súlyos munkabalesetnél.',
    'Bejelentési bizonyíték és helyszínmegőrzési vagy helyszíndokumentációs bizonyíték.',
    ['A-MUM-5-8'],
    'DOCUMENTED_EVIDENCE_REQUIRED',
    'A súlyos munkabaleset minősítése munkavédelmi és jogi specialistai kapu; a felhasználó nem minősít saját maga.',
  ),
  requirement(
    'EMPLOYER_WRITTEN_INFORMATION_INITIAL',
    'Munkáltatói írásbeli tájékoztatás új munkaviszony kezdetén',
    'Új munkaviszony kezdődik.',
    'A munkavállalót írásban tájékoztatja a 46. § (1) szerinti munkafeltételekről, a forrás szerinti kivételek figyelembevételével.',
    'Legkésőbb a munkaviszony kezdetétől számított hét napon belül.',
    'Minden új munkaviszonynál.',
    'Átadott írásbeli tájékoztató és átadási bizonyíték.',
    ['A-MT-46'],
    'EXPLICIT_DOCUMENT_REQUIRED',
    'Nem munkaszerződés-generálás; a forrás szerinti kivételek és egyedi feltételek jogi ellenőrzést igényelnek.',
  ),
  requirement(
    'EMPLOYER_WRITTEN_INFORMATION_CHANGE',
    'Munkáltatói írásbeli tájékoztatás munkafeltétel-változáskor',
    'A 46. § (1) vagy a 23. § (2) szerinti írásban közlendő feltétel megváltozik.',
    'A munkavállalót a változásról írásban tájékoztatja, a forrás szerinti kivételek figyelembevételével.',
    'Legkésőbb a változás hatálybalépésének időpontjában.',
    'Minden érintett változáskor.',
    'Változási írásbeli tájékoztató és átadási bizonyíték.',
    ['A-MT-46'],
    'EXPLICIT_DOCUMENT_REQUIRED',
    'A 46. § (5) önálló, a kezdeti tájékoztatástól különböző kötelezettség.',
  ),
];

const rulesToAdd = [
  {
    ruleKey: 'APPL-WORK-RISK-INITIAL-PERIODIC', requirementKey: 'WORKPLACE_RISK_ASSESSMENT_INITIAL_PERIODIC',
    logic: { AND: [{ EXISTS: { fact: 'hasEmployees' } }] }, requiredFacts: ['hasEmployees'],
    sourceAnchor: 'A-MVT-54', missingFactOutcome: 'LEGAL_CLASSIFICATION_REQUIRED', legalReviewStatus: LEGAL_REVIEW_REQUIRED,
  },
  {
    ruleKey: 'APPL-WORK-RISK-EVENT-REVIEW', requirementKey: 'WORKPLACE_RISK_ASSESSMENT_EVENT_REVIEW',
    logic: { AND: [{ EXISTS: { fact: 'workplaceRiskAssessmentReviewTriggerOccurred' } }] }, requiredFacts: ['workplaceRiskAssessmentReviewTriggerOccurred'],
    sourceAnchor: 'A-MVT-54', missingFactOutcome: 'LEGAL_CLASSIFICATION_REQUIRED', legalReviewStatus: LEGAL_REVIEW_REQUIRED,
  },
  {
    ruleKey: 'APPL-ACCIDENT-RECORD', requirementKey: 'WORK_ACCIDENT_INVESTIGATION_RECORD',
    logic: { AND: [{ EXISTS: { fact: 'workAccidentOccurred' } }] }, requiredFacts: ['workAccidentOccurred'],
    sourceAnchor: 'A-MUM-5-8', missingFactOutcome: 'LEGAL_CLASSIFICATION_REQUIRED', legalReviewStatus: LEGAL_REVIEW_REQUIRED,
  },
  {
    ruleKey: 'APPL-SERIOUS-ACCIDENT', requirementKey: 'SERIOUS_WORK_ACCIDENT_NOTIFICATION',
    logic: { AND: [{ ENUM_MATCH: { fact: 'seriousWorkAccidentClassification', value: 'SERIOUS' } }] }, requiredFacts: ['seriousWorkAccidentClassification'],
    sourceAnchor: 'A-MUM-5-8', missingFactOutcome: 'LEGAL_CLASSIFICATION_REQUIRED', legalReviewStatus: LEGAL_REVIEW_REQUIRED,
  },
  {
    ruleKey: 'APPL-EMPLOYER-INFO-INITIAL', requirementKey: 'EMPLOYER_WRITTEN_INFORMATION_INITIAL',
    logic: { AND: [{ EXISTS: { fact: 'employmentRelationshipStarted' } }] }, requiredFacts: ['employmentRelationshipStarted'],
    sourceAnchor: 'A-MT-46', missingFactOutcome: 'LEGAL_CLASSIFICATION_REQUIRED', legalReviewStatus: LEGAL_REVIEW_REQUIRED,
  },
  {
    ruleKey: 'APPL-EMPLOYER-INFO-CHANGE', requirementKey: 'EMPLOYER_WRITTEN_INFORMATION_CHANGE',
    logic: { AND: [{ EXISTS: { fact: 'employmentInformationChangeOccurred' } }] }, requiredFacts: ['employmentInformationChangeOccurred'],
    sourceAnchor: 'A-MT-46', missingFactOutcome: 'LEGAL_CLASSIFICATION_REQUIRED', legalReviewStatus: LEGAL_REVIEW_REQUIRED,
  },
];

function fact(factKey, labelHu, dataType, scope, collectionQuestionHu, refreshPolicy, allowedValues = null) {
  return {
    factKey, labelHu, dataType, allowedValues, scope, legalMeaning: collectionQuestionHu,
    collectionQuestionHu, usedByRules: rulesToAdd.filter((rule) => rule.requiredFacts.includes(factKey)).map((rule) => rule.ruleKey),
    sourceBasis: [], sensitive: false, refreshPolicy, legalReviewStatus: LEGAL_REVIEW_REQUIRED,
  };
}

const factsToAdd = [
  fact('hasEmployees', 'Munkavállalók foglalkoztatása', 'boolean', 'COMPANY', 'Foglalkoztat munkavállalót?', 'USER_PROVIDED'),
  fact('workplaceRiskAssessmentReviewTriggerOccurred', 'Kockázatértékelés felülvizsgálati kiváltó eseménye', 'boolean', 'WORKPLACE_SITE', 'Történt-e a munkahelyet vagy munkavégzést érintő olyan változás vagy esemény, amely a kockázatértékelés felülvizsgálatát kiválthatja?', 'LEGAL_CLASSIFICATION_REQUIRED'),
  fact('workAccidentOccurred', 'Munkabaleset bekövetkezése', 'boolean', 'EVENT', 'Történt munkabaleset?', 'USER_PROVIDED'),
  fact('seriousWorkAccidentClassification', 'Súlyos munkabaleset minősítése', 'enum', 'EVENT', 'A munkabaleset súlyosságának munkavédelmi és jogi specialistai minősítése.', 'TECHNICAL_CLASSIFICATION_REQUIRED', ['SERIOUS', 'NOT_SERIOUS', 'UNKNOWN']),
  fact('employmentRelationshipStarted', 'Munkaviszony kezdete', 'boolean', 'EMPLOYEE', 'Kezdődött új munkaviszony?', 'USER_PROVIDED'),
  fact('employmentInformationChangeOccurred', 'Írásbeli munkáltatói tájékoztatást érintő változás', 'boolean', 'EMPLOYEE', 'Változtak a munkavállalónak írásban közölt munkafeltételek?', 'USER_PROVIDED'),
];

const requirements = load('requirements-candidates.json');
Object.assign(requirements.anchors, anchors);
for (const item of requirementsToAdd) upsert(requirements.requirements, 'requirementKey', item);
save('requirements-candidates.json', requirements);

const applicability = load('applicability-candidates.json');
for (const item of rulesToAdd) upsert(applicability.rules, 'ruleKey', item);
save('applicability-candidates.json', applicability);

const factRegistry = load('fact-registry-candidates.json');
for (const item of factsToAdd) upsert(factRegistry.facts, 'factKey', item);
save('fact-registry-candidates.json', factRegistry);

const coverage = load('source-coverage.json');
const coverageUpdates = {
  'HU:ACT:1993:XCIII': {
    provisions: ['54. § (2)-(5)'],
    requirements: ['WORKPLACE_RISK_ASSESSMENT_INITIAL_PERIODIC', 'WORKPLACE_RISK_ASSESSMENT_EVENT_REVIEW'],
  },
  'HU:DECREE:5/1993:MÜM': {
    provisions: ['5-8. §'],
    requirements: ['WORK_ACCIDENT_INVESTIGATION_RECORD', 'SERIOUS_WORK_ACCIDENT_NOTIFICATION'],
  },
  'HU:ACT:2012:I': {
    provisions: ['46. § (1), (5)'],
    requirements: ['EMPLOYER_WRITTEN_INFORMATION_INITIAL', 'EMPLOYER_WRITTEN_INFORMATION_CHANGE'],
  },
};
for (const entry of coverage.coverage) {
  if (coverageUpdates[entry.sourceKey]) {
    const update = coverageUpdates[entry.sourceKey];
    entry.coverageStatus = 'REQUIREMENTS_EXTRACTED';
    entry.reviewMethod = 'SUBSTANTIVE_LEGAL_REVIEW';
    entry.reviewedProvisions = update.provisions;
    entry.requirementsExtracted = update.requirements;
    entry.domains = ['employment_hr_safety'];
    entry.reviewNotes = 'Wave 4A tényleges rendelkezés-alapú review; csak a megjelölt candidate követelmények kerültek kinyerésre, mind LEGAL_REVIEW_REQUIRED.';
    entry.unreviewedReason = null;
  }
}
save('source-coverage.json', coverage);

console.log(JSON.stringify({ requirements: requirementsToAdd.length, rules: rulesToAdd.length, facts: factsToAdd.length }, null, 2));
