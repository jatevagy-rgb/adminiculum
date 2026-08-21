#!/usr/bin/env node
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const corpus = 'C:/Users/hubay/Documents/Adminiculum/tvek';
const dir = path.join(root, 'docs/compliance/legal-review');
const S = 'LEGAL_REVIEW_REQUIRED';
const hash = (text) => crypto.createHash('sha256').update(Buffer.from(text.replace(/\s+/g, ' ').trim(), 'utf8')).digest('hex');
const load = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const save = (name, value) => fs.writeFileSync(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`);
function anchor(file, sourceKey, sourceSha256, provisionReference, start, end) {
  const lines = fs.readFileSync(path.join(corpus, file), 'utf8').split(/\r?\n/);
  return { sourceKey, sourceSha256, sourceVersion: 'CORPUS_CAPTURE', provisionReference, headingContext: 'Wave 4B substantive review', lineSpan: { start, end }, excerptSha256: hash(lines.slice(start - 1, end).join('\n')), provenance: 'STANDALONE_SOURCE' };
}
function upsert(list, key, item) { const index = list.findIndex((value) => value[key] === item[key]); if (index < 0) list.push(item); else list[index] = item; }
const anchors = {
  'A-CC-45-11': anchor('45_2014. (II. 26.) Korm. rendelet.txt', 'HU:DECREE:45/2014:KORM', 'c58d42ea66cdf9c05e200c0bf370ba0dcb5476f9ea74cfd8d053a16573d66792', '11. § (1)-(7)', 211, 271),
  'A-CC-45-14-18': anchor('45_2014. (II. 26.) Korm. rendelet.txt', 'HU:DECREE:45/2014:KORM', 'c58d42ea66cdf9c05e200c0bf370ba0dcb5476f9ea74cfd8d053a16573d66792', '14-18. §', 303, 367),
  'A-CC-45-20-23': anchor('45_2014. (II. 26.) Korm. rendelet.txt', 'HU:DECREE:45/2014:KORM', 'c58d42ea66cdf9c05e200c0bf370ba0dcb5476f9ea74cfd8d053a16573d66792', '20-23. §', 347, 401),
  'A-CC-151-1-3': anchor('151_2003. (IX. 22.) Korm. rendelet.txt', 'HU:DECREE:151/2003:KORM', 'ea8c57c09bf080b8861e330daa108686d9712f6c38b70fc73c966ef10aca939d', '1-3/A. §', 11, 85),
  'A-CC-2022-1-6': anchor('2022. évi XVII. törvény.txt', 'HU:ACT:2022:XVII', '32915a89275c1cb32fe881bd5e9bf8e7c7e0f8cb88b2ccab28e53eb594310cf3', '1. § (2), 6. §', 27, 259),
};
function req(key, titleHu, trigger, action, deadline, evidence, anchorKeys, need, notes) { return { requirementKey: key, titleHu, summaryHu: action, domain: 'fogyasztovedelem', subdomain: 'consumer_commerce', requirementType: 'DOCUMENTATION', mandatoryLevel: 'CONDITIONAL_MANDATORY', regulatedActor: 'Vállalkozás', trigger, requiredAction: action, deadline, frequency: 'Az érintett szerződéshez vagy eseményhez igazodóan.', evidenceExpected: evidence, sourceAnchors: anchorKeys, documentationNeed: need, legalReviewStatus: S, legalReviewNotes: notes }; }
const requirementsToAdd = [
  req('DISTANCE_CONTRACT_PRECONTRACT_INFORMATION', 'Távollévők közötti fogyasztói szerződés szerződéskötés előtti tájékoztatása', 'Fogyasztóval távollévők között kötendő szerződés.', 'Világosan és közérthetően megadja a 11. § (1) szerinti, operatívan összetartozó szerződéses tájékoztatási csomagot, beleértve az azonosítást, árat és költségeket, teljesítést, panaszkezelést, elállást és a releváns digitális jellemzőket.', 'A fogyasztó szerződési nyilatkozata előtt.', 'A közzétett vagy közölt tájékoztatás és annak verziója.', ['A-CC-45-11'], 'EXPLICIT_DOCUMENT_REQUIRED', 'Nem kötelező ÁSZF-et modellez; a jogszabály a tájékoztatás tartalmát és idejét írja elő.'),
  req('ONLINE_ORDER_PAYMENT_ACKNOWLEDGEMENT', 'Elektronikus fizetési kötelezettséget keletkeztető megrendelés jelölése', 'Elektronikus úton kötött távollévők közötti szerződés fizetési kötelezettséget keletkeztet.', 'Közvetlenül a szerződési nyilatkozat előtt jól láthatóan közli a törvényben felsorolt kulcsinformációkat, és a megrendelési funkció egyértelműen jelzi a fizetési kötelezettséget.', 'Közvetlenül a fogyasztói nyilatkozat előtt.', 'Rendelési felület és verziózott felirati bizonyíték.', ['A-CC-45-14-18'], 'DOCUMENTED_EVIDENCE_REQUIRED', 'Csak elektronikus, fizetési kötelezettséget keletkeztető távollévők közötti szerződésre vonatkozik.'),
  req('DISTANCE_CONTRACT_DURABLE_MEDIUM_CONFIRMATION', 'Távollévők közötti fogyasztói szerződés visszaigazolása tartós adathordozón', 'Távollévők között fogyasztói szerződés jön létre.', 'Tartós adathordozón visszaigazolja a megkötött szerződést és a forrás szerinti tájékoztatást.', 'Ésszerű időn belül; áru esetén legkésőbb átadáskor, szolgáltatásnál legkésőbb a teljesítés megkezdésekor.', 'Visszaigazolás és küldési bizonyíték.', ['A-CC-45-14-18'], 'DOCUMENTED_EVIDENCE_REQUIRED', 'Az előzetesen tartós adathordozón már átadott információ kivételét a specialistai review kezeli.'),
  req('DISTANCE_CONTRACT_WITHDRAWAL_INFORMATION', 'Elállási/felmondási jog előzetes tájékoztatása', 'Üzlethelyiségen kívül vagy távollévők között fogyasztói szerződés jön létre, és az elállási/felmondási jog nem kizárt.', 'Tájékoztatja a fogyasztót a jog határidejéről, feltételeiről, következményeiről és a nyilatkozatmintáról.', 'A fogyasztó szerződési nyilatkozata előtt.', 'Tájékoztatás és nyilatkozatminta verziója.', ['A-CC-45-11', 'A-CC-45-20-23'], 'EXPLICIT_DOCUMENT_REQUIRED', 'A 29. § szerinti kizárások és a digitális/szolgáltatási feltételek külön specialistai minősítést igényelnek.'),
  req('DISTANCE_CONTRACT_WITHDRAWAL_REFUND', 'Elállás vagy felmondás utáni fogyasztói visszatérítés', 'A fogyasztó szabályszerűen eláll vagy felmond egy üzlethelyiségen kívül vagy távollévők között kötött szerződést.', 'Visszatéríti a fogyasztó által megfizetett teljes összeget a forrás szerinti módban és korlátokkal.', 'Haladéktalanul, de legkésőbb az elállásról való tudomásszerzéstől számított 14 napon belül.', 'Visszatérítési tranzakció és az elállási nyilatkozat nyoma.', ['A-CC-45-20-23'], 'DOCUMENTED_EVIDENCE_REQUIRED', 'Áru esetén a visszatartási jog, illetve a fuvarozási költség kivételei megmaradnak.'),
  req('MANDATORY_GUARANTEE_INFORMATION', 'Kötelező jótállás tájékoztatása és jótállási jegye', 'A vállalkozás a rendelet szerinti új, kötelező jótállás alá tartozó tartós fogyasztási cikket értékesít fogyasztónak.', 'A fogyasztási cikkel együtt vagy a forrás szerinti határidőben a szükséges jótállási tájékoztatást, adott esetben jótállási jegyet bocsátja rendelkezésre.', 'A fogyasztási cikkel együtt; elektronikus átadásnál legkésőbb az átadást vagy üzembe helyezést követő napon.', 'Jótállási jegy vagy a 3/A. § szerinti jól olvasható tájékoztatás és átadási bizonyíték.', ['A-CC-151-1-3'], 'EXPLICIT_DOCUMENT_REQUIRED', 'A termékcsoport és értékhatár minősítése szükséges; a hiányos 19/2014. NGM forrás miatt igényintézési sablon nem készül.'),
  req('ECOMMERCE_ACCESSIBILITY_DOCUMENTATION', 'E-kereskedelmi szolgáltatás akadálymentességi dokumentációja', 'A szolgáltató a 2022. évi XVII. törvény hatálya alá tartozó e-kereskedelmi szolgáltatást nyújt fogyasztóknak.', 'Értékeli, dokumentálja és hozzáférhető formában nyilvánosságra hozza a szolgáltatás akadálymentességi követelményeknek való megfelelését.', 'A forrás szerinti szolgáltatás nyújtása alatt; a megfelelés változásait folyamatosan követi.', 'Akadálymentességi értékelés, dokumentáció és közzétételi bizonyíték.', ['A-CC-2022-1-6'], 'EXPLICIT_DOCUMENT_REQUIRED', 'Nem minden webshop tartozik a hatály alá; a szolgáltatási minősítés külön jogi/technikai kapu.'),
];
const rulesToAdd = [
  ['APPL-DISTANCE-PRECONTRACT', 'DISTANCE_CONTRACT_PRECONTRACT_INFORMATION', 'distanceConsumerContractConcluded'],
  ['APPL-ONLINE-PAYMENT-ORDER', 'ONLINE_ORDER_PAYMENT_ACKNOWLEDGEMENT', 'electronicDistanceContractWithPayment'],
  ['APPL-DISTANCE-CONFIRMATION', 'DISTANCE_CONTRACT_DURABLE_MEDIUM_CONFIRMATION', 'distanceConsumerContractConcluded'],
  ['APPL-WITHDRAWAL-INFORMATION', 'DISTANCE_CONTRACT_WITHDRAWAL_INFORMATION', 'withdrawalRightClassification'],
  ['APPL-WITHDRAWAL-REFUND', 'DISTANCE_CONTRACT_WITHDRAWAL_REFUND', 'consumerWithdrawalExercised'],
  ['APPL-MANDATORY-GUARANTEE', 'MANDATORY_GUARANTEE_INFORMATION', 'mandatoryGuaranteeProductClassification'],
  ['APPL-ECOMMERCE-ACCESSIBILITY', 'ECOMMERCE_ACCESSIBILITY_DOCUMENTATION', 'ecommerceAccessibilityScopeClassification'],
].map(([ruleKey, requirementKey, fact]) => ({ ruleKey, requirementKey, logic: { ENUM_MATCH: { fact, value: fact === 'withdrawalRightClassification' || fact === 'mandatoryGuaranteeProductClassification' || fact === 'ecommerceAccessibilityScopeClassification' ? 'IN_SCOPE' : true } }, requiredFacts: [fact], sourceAnchor: requirementsToAdd.find((item) => item.requirementKey === requirementKey).sourceAnchors[0], missingFactOutcome: 'LEGAL_CLASSIFICATION_REQUIRED', legalReviewStatus: S }));
function fact(factKey, labelHu, dataType, scope, question, refreshPolicy, allowedValues = null) { return { factKey, labelHu, dataType, allowedValues, scope, legalMeaning: question, collectionQuestionHu: question, usedByRules: rulesToAdd.filter((rule) => rule.requiredFacts.includes(factKey)).map((rule) => rule.ruleKey), sourceBasis: [], sensitive: false, refreshPolicy, legalReviewStatus: S }; }
const factsToAdd = [
  fact('distanceConsumerContractConcluded', 'Távollévők közötti fogyasztói szerződés', 'boolean', 'CONTRACT', 'Távollévők között jön létre fogyasztói szerződés?', 'USER_PROVIDED'),
  fact('electronicDistanceContractWithPayment', 'Elektronikus fizetési kötelezettség', 'boolean', 'CONTRACT', 'Elektronikus úton kötött szerződés fizetési kötelezettséget keletkeztet?', 'USER_PROVIDED'),
  fact('withdrawalRightClassification', 'Elállási/felmondási jog hatálya', 'enum', 'CONTRACT', 'Az elállási vagy felmondási jog hatályának specialistai minősítése.', 'LEGAL_CLASSIFICATION_REQUIRED', ['IN_SCOPE', 'OUT_OF_SCOPE', 'UNKNOWN']),
  fact('consumerWithdrawalExercised', 'Fogyasztói elállás vagy felmondás', 'boolean', 'EVENT', 'A fogyasztó elállási vagy felmondási nyilatkozatot tett?', 'USER_PROVIDED'),
  fact('mandatoryGuaranteeProductClassification', 'Kötelező jótállási termékkategória', 'enum', 'PRODUCT_SERVICE', 'A termék kötelező jótállási hatályának és értékhatárának specialistai minősítése.', 'LEGAL_CLASSIFICATION_REQUIRED', ['IN_SCOPE', 'OUT_OF_SCOPE', 'UNKNOWN']),
  fact('ecommerceAccessibilityScopeClassification', 'E-kereskedelmi akadálymentességi hatály', 'enum', 'SALES_CHANNEL', 'Az e-kereskedelmi szolgáltatás 2022. évi XVII. törvény szerinti hatályának specialistai minősítése.', 'LEGAL_CLASSIFICATION_REQUIRED', ['IN_SCOPE', 'OUT_OF_SCOPE', 'UNKNOWN']),
];
const requirements = load('requirements-candidates.json'); Object.assign(requirements.anchors, anchors); requirementsToAdd.forEach((item) => upsert(requirements.requirements, 'requirementKey', item)); save('requirements-candidates.json', requirements);
const applicability = load('applicability-candidates.json'); rulesToAdd.forEach((item) => upsert(applicability.rules, 'ruleKey', item)); save('applicability-candidates.json', applicability);
const facts = load('fact-registry-candidates.json'); factsToAdd.forEach((item) => upsert(facts.facts, 'factKey', item)); save('fact-registry-candidates.json', facts);
const coverage = load('source-coverage.json'); const reviewed = {
  'HU:DECREE:45/2014:KORM': { provisions: ['11-23. §', '29. § exclusions require specialist classification'], keys: requirementsToAdd.slice(0, 5).map((item) => item.requirementKey) },
  'HU:DECREE:151/2003:KORM': { provisions: ['1-3/A. §'], keys: ['MANDATORY_GUARANTEE_INFORMATION'] },
  'HU:ACT:2022:XVII': { provisions: ['1. § (2)', '6. §'], keys: ['ECOMMERCE_ACCESSIBILITY_DOCUMENTATION'] },
  'HU:ACT:2008:XLVII': { provisions: ['3-7. §'], keys: [] }, 'HU:ACT:2008:XLVIII': { provisions: ['3-6. §'], keys: [] },
};
for (const entry of coverage.coverage) if (reviewed[entry.sourceKey]) { const update = reviewed[entry.sourceKey]; entry.coverageStatus = update.keys.length ? 'REQUIREMENTS_EXTRACTED' : 'NO_DIRECT_COMPANY_REQUIREMENT_IDENTIFIED'; entry.domains = ['fogyasztovedelem']; entry.requirementsExtracted = update.keys; entry.reviewedProvisions = update.provisions; entry.reviewMethod = 'SUBSTANTIVE_LEGAL_REVIEW'; entry.reviewNotes = update.keys.length ? 'Wave 4B tényleges rendelkezés-alapú review; minden candidate LEGAL_REVIEW_REQUIRED.' : 'Wave 4B tényleges rendelkezés-alapú review; a vizsgált általános tilalmakhoz nem keletkezett determinisztikus, önálló company candidate.'; entry.unreviewedReason = update.keys.length ? null : 'Termék-, állítás- és reklámkörnyezet-specifikus jogi értékelést igényel.'; }
save('source-coverage.json', coverage); console.log(JSON.stringify({ requirements: requirementsToAdd.length, rules: rulesToAdd.length, facts: factsToAdd.length }, null, 2));
