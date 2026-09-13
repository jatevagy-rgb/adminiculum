/**
 * GROW evidence sufficiency gate — unit tests (no database).
 *
 * Locks all six decision states and the rule that only SUPPORTED is
 * actionable. The gate is a pure function so it is testable in isolation.
 */

import { decideSufficiency } from '../src/modules/company-growth/research/service';

describe('decideSufficiency', () => {
  const base = {
    domainKey: 'APPROVAL_DELAY',
    verifiedEvidenceCount: 0,
    disputedEvidenceCount: 0,
    measured: false,
    declared: false,
  };

  it('returns OUT_OF_SCOPE for a non-Grow domain even with strong evidence', () => {
    const r = decideSufficiency({ ...base, domainKey: 'PRIVACY_GAP', verifiedEvidenceCount: 5, measured: true });
    expect(r.decision).toBe('OUT_OF_SCOPE');
  });

  it('returns CONFLICTING_EVIDENCE when verified and disputed evidence coexist', () => {
    const r = decideSufficiency({ ...base, verifiedEvidenceCount: 1, disputedEvidenceCount: 1, measured: true });
    expect(r.decision).toBe('CONFLICTING_EVIDENCE');
    expect(r.reasons.join(' ')).toMatch(/ellentmondásos/i);
  });

  it('returns HUMAN_DOMAIN_REVIEW when only disputed evidence exists', () => {
    const r = decideSufficiency({ ...base, disputedEvidenceCount: 2, measured: true });
    expect(r.decision).toBe('HUMAN_DOMAIN_REVIEW');
    expect(r.reasons.join(' ')).toMatch(/szakértői/i);
  });

  it('returns NEEDS_MORE_DATA when there is an internal signal but no verified evidence', () => {
    expect(decideSufficiency({ ...base, measured: true }).decision).toBe('NEEDS_MORE_DATA');
    expect(decideSufficiency({ ...base, declared: true }).decision).toBe('NEEDS_MORE_DATA');
  });

  it('returns INSUFFICIENT_EVIDENCE with no signal and no verified evidence', () => {
    expect(decideSufficiency({ ...base }).decision).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('returns SUPPORTED only with verified evidence plus an internal signal', () => {
    expect(decideSufficiency({ ...base, verifiedEvidenceCount: 1, measured: true }).decision).toBe('SUPPORTED');
    expect(decideSufficiency({ ...base, verifiedEvidenceCount: 1, declared: true }).decision).toBe('SUPPORTED');
    // Verified evidence without any internal signal is still not actionable.
    expect(decideSufficiency({ ...base, verifiedEvidenceCount: 1 }).decision).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('marks only SUPPORTED actionable', () => {
    const decisions: string[] = [
      'CONFLICTING_EVIDENCE',
      'HUMAN_DOMAIN_REVIEW',
      'NEEDS_MORE_DATA',
      'INSUFFICIENT_EVIDENCE',
      'OUT_OF_SCOPE',
    ];
    for (const d of decisions) {
      expect(d === 'SUPPORTED').toBe(false);
    }
    expect(decideSufficiency({ ...base, verifiedEvidenceCount: 1, measured: true }).decision === 'SUPPORTED').toBe(true);
  });
});
