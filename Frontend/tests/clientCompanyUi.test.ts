import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('Company foundation internal UI (structural)', () => {
  const component = () => read('src/components/clients/ClientCompanyFoundation.tsx');
  const api = () => read('src/lib/clientCompanyApi.ts');

  it('renders Vállalati működés within the canonical Client detail', () => {
    const page = read('src/app/clients/[clientId]/page.tsx');
    assert.match(page, /ClientCompanyFoundation/);
    assert.match(page, /vallalati-mukodes/);
    assert.match(component(), /Vállalati működés/);
  });

  it('renders profile, assessments, a single compliance overview link, initiatives and milestones', () => {
    const src = component();
    for (const label of ['Profil', 'Felmérések', 'Compliance áttekintés', 'Fejlődési terv', 'Vállalati mérföldkövek']) {
      assert.match(src, new RegExp(label));
    }
  });

  it('keeps empty, loading and error states', () => {
    const src = component();
    assert.match(src, /Betöltés…/);
    assert.match(src, /nem tölthetők be/);
    assert.match(src, /Nincs megjeleníthető elem/);
  });

  it('localizes codes instead of exposing raw enums/IDs in the normal UI', () => {
    const src = component();
    // The component maps codes through label helpers, not raw enum literals.
    assert.match(src, /companyFactTypeLabel|factVerificationLabel|assessmentTypeLabel|initiativeStatusLabel/);
    assert.doesNotMatch(src, /verificationStatus\}|LAW_FIRM_VERIFIED\}|DIGITAL_MATURITY\}/);
  });

  it('does not load the full finding feed in the client detail', () => {
    const src = component();
    for (const token of ['getProfile', 'listFacts', 'listMilestones', 'listAssessments', 'listInitiatives']) {
      assert.match(src, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.doesNotMatch(src, /listFindings/);
  });

  it('is registered and type-safe (component exists)', () => {
    assert.equal(existsSync(path.join(root, 'src/components/clients/ClientCompanyFoundation.tsx')), true);
    assert.equal(existsSync(path.join(root, 'src/lib/clientCompanyApi.ts')), true);
  });
});
