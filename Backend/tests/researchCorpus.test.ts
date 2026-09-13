/**
 * Supplied research corpus coverage + eligibility (pure, no database).
 *
 * Guards the doctrine: verified evidence only, bounded claims, canonical
 * domain/intervention vocabulary, and honest coverage-gap reporting.
 */

import { DOMAIN_KEYS, SEEDED_CORPUS } from '../src/modules/company-growth/research/corpus';
import { INTERVENTION_CODES } from '../src/modules/company-growth/research/interventions';

const verified = SEEDED_CORPUS.filter((e) => e.verificationStatus === 'VERIFIED');
const unverified = SEEDED_CORPUS.filter((e) => e.verificationStatus !== 'VERIFIED');

function verifiedSupport(code: string): number {
  return verified.filter((e) => (e.supportedInterventions ?? []).includes(code)).length;
}

describe('supplied research corpus', () => {
  it('has unique corpus keys', () => {
    const keys = SEEDED_CORPUS.map((e) => e.corpusKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every record declares a bounded claim, evidence type, origin and limitations', () => {
    for (const e of SEEDED_CORPUS) {
      expect(e.boundedClaim).toBeTruthy();
      expect(e.evidenceType).toBeTruthy();
      expect(e.origin).toBeTruthy();
      expect(e.limitations).toBeTruthy();
    }
  });

  it('all supported domains and interventions use canonical vocabulary', () => {
    const domains = new Set<string>(DOMAIN_KEYS as readonly string[]);
    const codes = new Set<string>(INTERVENTION_CODES as readonly string[]);
    for (const e of SEEDED_CORPUS) {
      for (const d of e.domainKeys) expect(domains.has(d)).toBe(true);
      for (const i of e.supportedInterventions ?? []) expect(codes.has(i)).toBe(true);
    }
  });

  it('integrates the supplied corpus with a substantially larger verified set', () => {
    expect(verified.length).toBeGreaterThanOrEqual(10);
    // Provisional/backlog records exist but must be ineligible.
    expect(unverified.length).toBeGreaterThan(0);
    for (const e of unverified) expect(e.verificationStatus).toBe('UNVERIFIED');
  });

  it('provides verified support for the interventions the literature supports', () => {
    const supported = [
      'STANDARDIZE_PROCESS',
      'REDESIGN_APPROVAL_ROUTING',
      'CONSOLIDATE_SYSTEMS',
      'INTEGRATE_SYSTEMS',
      'AUTOMATE_REPETITIVE_STEP',
      'CLARIFY_PROCESS_OWNERSHIP',
      'TRAIN_DIGITAL_SKILLS',
      'ALIGN_IT_WITH_BUSINESS_GOALS',
      'IMPLEMENT_PROCESS_MEASUREMENT',
      'PHASE_DIGITAL_INVESTMENT',
      'REMOVE_NON_VALUE_ADDING_STEP',
      'REDESIGN_BEFORE_AUTOMATING',
    ];
    for (const code of supported) {
      expect(verifiedSupport(code)).toBeGreaterThan(0);
    }
  });

  it('documents the honest coverage gap: DIGITIZE_INTAKE has no verified source yet', () => {
    // Only provisional/general records speak to structured intake; do not
    // fabricate empirical support. This locks the known gap.
    expect(verifiedSupport('DIGITIZE_INTAKE')).toBe(0);
  });

  it('does not use manufacturing case effect sizes as engine domains/thresholds', () => {
    for (const e of SEEDED_CORPUS) {
      expect(e.boundedClaim).not.toMatch(/\b\d+(\.\d+)?\s?%/);
    }
  });
});
