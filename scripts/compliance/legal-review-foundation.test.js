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
  for (const rule of applicability.rules) assert.ok(keys.has(rule.requirementKey));
});

test('captured anchor excerpt hashes resolve against the read-only corpus', () => {
  const sourceFiles = {
    'EU:EU_REGULATION:CELEX:32016R0679': 'L_2016119HU.01000101.xml.txt',
    'HU:ACT:1997:CLV': '1997. évi CLV. törvény.txt',
    'HU:ACT:2023:XXV': '2023. évi XXV. törvény.txt',
  };
  for (const anchor of Object.values(requirements.anchors)) {
    const lines = fs.readFileSync(path.join(corpus, sourceFiles[anchor.sourceKey]), 'utf8').split(/\r?\n/);
    const excerpt = lines.slice(anchor.lineSpan.start - 1, anchor.lineSpan.end).join('\n');
    assert.strictEqual(compactHash(excerpt), anchor.excerptSha256);
  }
});

test('template packages carry source basis, known fields and no automatic approval', () => {
  const registry = new Set(fields.map((field) => field.key));
  assert.strictEqual(templates.length, 6);
  for (const template of templates) {
    const folder = path.join(root, 'artifacts/compliance-templates', template.name);
    const spec = JSON.parse(fs.readFileSync(path.join(folder, 'template-spec.json'), 'utf8'));
    const basis = JSON.parse(fs.readFileSync(path.join(folder, 'legal-basis.json'), 'utf8'));
    const fieldRefs = JSON.parse(fs.readFileSync(path.join(folder, 'fields.json'), 'utf8'));
    assert.strictEqual(spec.legalReviewStatus, 'LEGAL_REVIEW_REQUIRED');
    assert.strictEqual(spec.approvedAt, null);
    assert.ok(basis.sourceAnchors.length > 0);
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
