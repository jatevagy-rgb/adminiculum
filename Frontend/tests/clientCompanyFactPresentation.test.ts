import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  companyFactLabel,
  companyFactTypeLabel,
  factSourceKindLabel,
} from '../src/lib/clientCompanyApi';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('C4E fact presentation — canonical label resolution', () => {
  it('STALE_TYPE_CANONICAL_LABEL: prefers factDefinition.labelHu over the stale type', () => {
    assert.equal(
      companyFactLabel({ type: 'DEMO_KFT_COMPANY_EMPLOYEE_COUNT', factDefinition: { key: 'employee_count', labelHu: 'Munkavállalói létszám' } }),
      'Munkavállalói létszám',
    );
  });

  it('falls back to the canonical key, then to the legacy type map', () => {
    // No labelHu, but a canonical key is present.
    assert.equal(
      companyFactLabel({ type: 'DEMO_KFT_COMPANY_EMPLOYEE_COUNT', factDefinition: { key: 'employee_count', labelHu: null } }),
      'Létszám',
    );
    // No factDefinition at all: the stale demo type must still be localized.
    assert.equal(
      companyFactLabel({ type: 'DEMO_KFT_COMPANY_EMPLOYEE_COUNT', factDefinition: null }),
      'Munkavállalói létszám',
    );
    assert.equal(companyFactLabel({ type: 'company_main_activity', factDefinition: null }), 'Fő tevékenység vagy ágazat');
    assert.equal(companyFactLabel({ type: 'company_operating_country', factDefinition: null }), 'Működési ország');
  });

  it('never renders the raw English humanisation for the known stale type', () => {
    const label = companyFactLabel({ type: 'DEMO_KFT_COMPANY_EMPLOYEE_COUNT', factDefinition: null });
    assert.doesNotMatch(label, /Demo kft company employee count/);
    assert.doesNotMatch(companyFactTypeLabel('DEMO_KFT_COMPANY_EMPLOYEE_COUNT'), /Demo kft company employee count/);
  });

  it('keeps a bounded humanised fallback for genuinely unknown keys', () => {
    assert.equal(companyFactLabel({ type: 'brand_new_fact_key', factDefinition: null }), 'Brand new fact key');
    assert.equal(companyFactLabel({ type: '', factDefinition: null }), 'Rögzített adat');
  });

  it('RAW_PORTAL_SOURCE: maps provenance categories, never the raw handle', () => {
    assert.equal(factSourceKindLabel('CLIENT_PORTAL_ANSWER'), 'Ügyfélportálon közölte');
    assert.equal(factSourceKindLabel('DOCUMENT'), 'Dokumentum alapján');
    assert.equal(factSourceKindLabel('MANUAL'), 'Belső rögzítés');
    assert.equal(factSourceKindLabel('UNKNOWN'), 'Ismeretlen eredet');
    assert.equal(factSourceKindLabel(null), 'Ismeretlen eredet');
    assert.equal(factSourceKindLabel(undefined), 'Ismeretlen eredet');
  });
});

describe('C4E fact presentation — ClientCompanyFoundation', () => {
  const component = () => read('src/components/clients/ClientCompanyFoundation.tsx');

  it('splits current facts from collapsed history without deleting history', () => {
    const src = component();
    assert.match(src, /supersededAt/);
    assert.match(src, /company-fact-current/);
    assert.match(src, /company-fact-history/);
    assert.match(src, /Korábbi tények/);
    assert.match(src, /Nem aktuális, versengő tények/);
  });

  it('uses the canonical label helper and the human provenance label', () => {
    const src = component();
    assert.match(src, /companyFactLabel\(/);
    assert.match(src, /factSourceKindLabel\(/);
  });

  it('never prints the raw sourceReference handle in the normal UI', () => {
    const src = component();
    assert.doesNotMatch(src, /sourceReference/);
    assert.doesNotMatch(src, /CLIENT_PORTAL_IDENTITY/);
  });

  it('surfaces duplicate current concepts for review instead of collapsing them', () => {
    const src = component();
    assert.match(src, /fact-review-required/);
    assert.match(src, /több érvényes érték/);
    assert.doesNotMatch(src, /dedupe|latestWins|latest-wins/);
  });
});

describe('C4E fact presentation — ClientCompanyOperationsLegacy', () => {
  const component = () => read('src/components/clients/ClientCompanyOperationsLegacy.tsx');

  it('does not print superseded facts as current in the default Cégprofil', () => {
    const src = component();
    assert.match(src, /fact\.isCurrent && !fact\.supersededAt/);
    assert.match(src, /company-operations-fact-history/);
    assert.match(src, /Korábbi tények/);
  });

  it('uses the canonical label before the raw technical type', () => {
    const src = component();
    assert.match(src, /companyFactLabel\(/);
    assert.doesNotMatch(src, /companyFactTypeLabel\(fact\.type\)/);
  });
});

describe('C4E fact presentation — additive DTO contract', () => {
  const api = () => read('src/lib/clientCompanyApi.ts');

  it('adds read-only supersededAt / factDefinition / sourceKind metadata', () => {
    const src = api();
    assert.match(src, /supersededAt\?: string \| null/);
    assert.match(src, /factDefinition\?: \{ key: string \| null; valueType: string \| null; labelHu: string \| null \} \| null/);
    assert.match(src, /sourceKind\?: CompanyFactSourceKind/);
  });
});
