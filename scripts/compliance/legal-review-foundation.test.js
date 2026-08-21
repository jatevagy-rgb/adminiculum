'use strict';
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const corpus = 'C:/Users/hubay/Documents/Adminiculum/tvek';
const requirements = JSON.parse(fs.readFileSync(path.join(root, 'docs/compliance/legal-review/requirements-candidates.json'), 'utf8'));
const applicability = JSON.parse(fs.readFileSync(path.join(root, 'docs/compliance/legal-review/applicability-candidates.json'), 'utf8'));
const coverage = JSON.parse(fs.readFileSync(path.join(root, 'docs/compliance/legal-review/source-coverage.json'), 'utf8'));
const facts = JSON.parse(fs.readFileSync(path.join(root, 'docs/compliance/legal-review/fact-registry-candidates.json'), 'utf8'));
const fields = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/compliance-templates/template-fields.json'), 'utf8')).fields;
const templates = fs.readdirSync(path.join(root, 'artifacts/compliance-templates'), { withFileTypes: true }).filter((entry) => entry.isDirectory());
const compactHash = (text) => crypto.createHash('sha256').update(Buffer.from(text.replace(/\s+/g, ' ').trim(), 'utf8')).digest('hex');

function readDocxDocumentXml(docxPath) {
  const python = process.env.CODEX_DOCUMENT_PYTHON || 'python';
  return execFileSync(python, ['-c', "import sys,zipfile; print(zipfile.ZipFile(sys.argv[1]).read('word/document.xml').decode('utf-8'))", docxPath], { encoding: 'utf8' });
}

test('every requirement has a complete source anchor and every applicability rule references it', () => {
  const keys = new Set(requirements.requirements.map((item) => item.requirementKey));
  for (const requirement of requirements.requirements) {
    assert.ok(requirement.sourceAnchors.length > 0);
    for (const key of requirement.sourceAnchors) {
      const anchor = requirements.anchors[key];
      assert.match(anchor.sourceSha256, /^[a-f0-9]{64}$/);
      assert.match(anchor.excerptSha256, /^[a-f0-9]{64}$/);
      assert.ok(anchor.provisionReference && anchor.provenance);
    }
  }
  const factKeys = new Set(facts.facts.map((fact) => fact.factKey));
  for (const rule of applicability.rules) {
    assert.ok(keys.has(rule.requirementKey));
    for (const fact of rule.requiredFacts) assert.ok(factKeys.has(fact), fact);
  }
});

function evaluateRopa(input) {
  const required = ['employeeCount', 'processingRiskLikely', 'processingIsOccasional', 'specialCategoryData', 'criminalOffenceData'];
  if (required.some((key) => typeof input[key] === 'undefined')) return 'REQUIRES_LEGAL_REVIEW';
  if (input.employeeCount >= 250) return 'APPLIES';
  return input.processingRiskLikely || !input.processingIsOccasional || input.specialCategoryData || input.criminalOffenceData
    ? 'APPLIES'
    : 'DOES_NOT_APPLY';
}

test('GDPR Article 30(5) ROPA exception retains each statutory exception', () => {
  assert.strictEqual(evaluateRopa({ employeeCount: 250, processingRiskLikely: false, processingIsOccasional: true, specialCategoryData: false, criminalOffenceData: false }), 'APPLIES');
  assert.strictEqual(evaluateRopa({ employeeCount: 20, processingRiskLikely: false, processingIsOccasional: true, specialCategoryData: false, criminalOffenceData: false }), 'DOES_NOT_APPLY');
  for (const exceptionKey of ['processingRiskLikely', 'specialCategoryData', 'criminalOffenceData']) {
    const input = { employeeCount: 20, processingRiskLikely: false, processingIsOccasional: true, specialCategoryData: false, criminalOffenceData: false };
    input[exceptionKey] = true;
    assert.strictEqual(evaluateRopa(input), 'APPLIES', exceptionKey);
  }
  assert.strictEqual(evaluateRopa({ employeeCount: 20, processingRiskLikely: false, processingIsOccasional: false, specialCategoryData: false, criminalOffenceData: false }), 'APPLIES');
  assert.strictEqual(evaluateRopa({ employeeCount: 20, processingRiskLikely: false, processingIsOccasional: true, specialCategoryData: false }), 'REQUIRES_LEGAL_REVIEW');
});

test('full corpus disposition is unique, complete and never an approval', () => {
  assert.strictEqual(coverage.coverage.length, 62);
  assert.strictEqual(new Set(coverage.coverage.map((entry) => entry.sourceKey)).size, 62);
  for (const entry of coverage.coverage) {
    assert.ok(['REQUIREMENTS_EXTRACTED', 'REQUIRES_SPECIALIST_LEGAL_REVIEW', 'VERSION_AMBIGUOUS', 'REFERENCE_OR_PROMULGATION_ONLY', 'SOURCE_INCOMPLETE', 'IMPLEMENTATION_REQUIRED_NO_DIRECT_COMPANY_RULE', 'NO_DIRECT_COMPANY_REQUIREMENT_IDENTIFIED'].includes(entry.coverageStatus));
    assert.notStrictEqual(entry.coverageStatus, 'APPROVED');
  }
});

test('captured anchor excerpt hashes resolve against the read-only corpus', () => {
  const sourceFiles = {
    'EU:EU_REGULATION:CELEX:32016R0679': 'L_2016119HU.01000101.xml.txt',
    'HU:ACT:1997:CLV': '1997. évi CLV. törvény.txt',
    'HU:ACT:2023:XXV': '2023. évi XXV. törvény.txt',
    'EU:EU_REGULATION:CELEX:32024R1689': 'L_202401689HU.000101.fmx.xml.txt',
    'HU:ACT:2024:LXIX': '2024. évi LXIX. törvény.txt',
    'HU:DECREE:418/2024:KORM': '418_2024. (XII. 23.) Korm. rendelet.txt',
    'EU:EU_REGULATION:CELEX:32022R2554': 'L_2022333HU.01000101.xml.txt',
    'EU:EU_REGULATION:CELEX:32022R2065': 'L_2022277HU.01000101.xml.txt',
    'HU:ACT:2001:CVIII': '2001. évi CVIII. törvény.txt',
    'HU:DECREE:373/2021:KORM': '373_2021. (VI. 30.) Korm. rendelet.txt',
    'EU:EU_DIRECTIVE:CELEX:32022L2555': 'L_2022333HU.01008001.xml.txt',
    'EU:EU_REGULATION:CELEX:32006R1907': 'Egységes szerkezetbe foglalt SZÖVEG_ 32006R1907 — HU — 11.05.2026.txt',
    'EU:EU_REGULATION:CELEX:32008R1272': 'Egységes szerkezetbe foglalt SZÖVEG_ 32008R1272 — HU — 01.07.2026.txt',
    'EU:EU_REGULATION:CELEX:32021R0821': 'Egységes szerkezetbe foglalt SZÖVEG_ 32021R0821 — HU — 15.11.2025.txt',
    'EU:EU_REGULATION:CELEX:32013R0952': 'L_2013269HU.01000101.xml.txt',
    'EU:EU_REGULATION:CELEX:32019R1020': 'L_2019169HU.01000101.xml.txt',
  };
  for (const anchor of Object.values(requirements.anchors)) {
    const reachFirstCapture = anchor.sourceKey === 'EU:EU_REGULATION:CELEX:32006R1907' && anchor.sourceSha256 === '489f4181edde13eed8af1aeeb62c19665f54de600f8943caa014f4dd0171f873';
    const sourceFile = reachFirstCapture ? 'Egységes szerkezetbe foglalt SZÖVEG_ 32006R1907 — HU — 11.05.2026 (1).txt' : sourceFiles[anchor.sourceKey];
    const lines = fs.readFileSync(path.join(corpus, sourceFile), 'utf8').split(/\r?\n/);
    const excerpt = lines.slice(anchor.lineSpan.start - 1, anchor.lineSpan.end).join('\n');
    assert.strictEqual(compactHash(excerpt), anchor.excerptSha256);
  }
});

test('Wave 3A maintains role, temporal and directive implementation gates', () => {
  const byKey = new Map(applicability.rules.map((rule) => [rule.ruleKey, rule]));
  assert.ok(JSON.stringify(byKey.get('APPL-AIA-LITERACY').logic).includes('aiUsedUnderOrganisationAuthority'));
  assert.ok(JSON.stringify(byKey.get('APPL-AIA-HIGH-RISK-OPERATION').logic).includes('DATE_ON_OR_AFTER'));
  assert.ok(JSON.stringify(byKey.get('APPL-DORA-ICT-GOVERNANCE').logic).includes('doraFinancialEntityScope'));
  assert.ok(JSON.stringify(byKey.get('APPL-DSA-AUTHORITY-CONTACT').logic).includes('dsaIntermediaryServiceClassification'));
  const nis2 = coverage.coverage.find((entry) => entry.sourceKey === 'EU:EU_DIRECTIVE:CELEX:32022L2555');
  assert.strictEqual(nis2.coverageStatus, 'IMPLEMENTATION_REQUIRED_NO_DIRECT_COMPANY_RULE');
  assert.strictEqual(nis2.reviewMethod, 'SUBSTANTIVE_LEGAL_REVIEW');
  for (const requirement of requirements.requirements.filter((item) => item.domain === 'ai')) assert.ok(requirement.effectiveDate);
});

test('template packages carry source basis, known fields and no automatic approval', () => {
  const registry = new Set(fields.map((field) => field.key));
  assert.strictEqual(templates.length, 11);
  const requirementKeys = new Set(requirements.requirements.map((item) => item.requirementKey));
  for (const template of templates) {
    const folder = path.join(root, 'artifacts/compliance-templates', template.name);
    const spec = JSON.parse(fs.readFileSync(path.join(folder, 'template-spec.json'), 'utf8'));
    const basis = JSON.parse(fs.readFileSync(path.join(folder, 'legal-basis.json'), 'utf8'));
    const fieldRefs = JSON.parse(fs.readFileSync(path.join(folder, 'fields.json'), 'utf8'));
    assert.strictEqual(spec.legalReviewStatus, 'LEGAL_REVIEW_REQUIRED');
    assert.strictEqual(spec.approvedAt, null);
    assert.ok(basis.sourceAnchors.length > 0);
    for (const key of basis.requirementKeys) assert.ok(requirementKeys.has(key), key);
    for (const key of fieldRefs.fieldKeys) assert.ok(registry.has(key), key);
    assert.ok(fs.statSync(path.join(folder, 'template.docx')).size > 1000);
    const xml = readDocxDocumentXml(path.join(folder, 'template.docx'));
    const logicalTokens = [...xml.matchAll(/\{\{([a-z0-9_.]+)\}\}/g)].map((match) => match[1]);
    assert.ok(logicalTokens.length > 0);
    for (const token of logicalTokens) assert.ok(registry.has(token), token);
    assert.ok(!xml.includes('{{</w:t>'), 'placeholder split at opening boundary');
    assert.ok(!xml.includes('</w:t>}}'), 'placeholder split at closing boundary');
  }
});

test('deterministic renderer preserves source template and fails on missing required values', () => {
  const source = path.join(root, 'artifacts/compliance-templates/gdpr-direct-collection-privacy-notice/template.docx');
  const before = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'adminiculum-template-proof-'));
  const values = path.join(temp, 'values.json');
  const emptyValues = path.join(temp, 'empty.json');
  const output = path.join(temp, 'rendered.docx');
  fs.writeFileSync(values, JSON.stringify({'company.legal_name':'Minta Kereskedelmi Kft.','company.registered_office':'1111 Budapest, Minta utca 12.','document.version':'0.1','document.effective_date':'2026. szeptember 1.','document.owner_name':'Jogi vezető','document.approved_by':'Minta Anna','privacy.processing_purpose':'Megrendelések teljesítése','privacy.legal_basis':'GDPR 6. cikk (1) b) pont'}));
  fs.writeFileSync(emptyValues, '{}');
  const python = process.env.CODEX_DOCUMENT_PYTHON || 'python';
  execFileSync(python, [path.join(root, 'scripts/compliance/template-render-proof/render_template.py'), source, output, '--fields', path.join(root, 'artifacts/compliance-templates/template-fields.json'), '--values', values]);
  assert.ok(fs.existsSync(output));
  assert.strictEqual(before, crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'));
  assert.throws(() => execFileSync(python, [path.join(root, 'scripts/compliance/template-render-proof/render_template.py'), source, path.join(temp, 'missing.docx'), '--fields', path.join(root, 'artifacts/compliance-templates/template-fields.json'), '--values', emptyValues], { stdio: 'pipe' }), /Missing required values/);
});
