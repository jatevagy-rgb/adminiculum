import { classifyControlEvidenceGap } from '../src/modules/compliance/controlEvidenceGap';

describe('control evidence gap classification (unit)', () => {
  it('DISTINCT_GAP_TYPES: missing control, stale, missing, not assessed and evidenced are distinct', () => {
    expect(classifyControlEvidenceGap({ implementationStatus: 'NOT_IMPLEMENTED', acceptedCurrent: 0, stale: 0 })).toBe('MISSING_CONTROL');
    expect(classifyControlEvidenceGap({ implementationStatus: 'IMPLEMENTED', acceptedCurrent: 0, stale: 1 })).toBe('STALE_EVIDENCE');
    expect(classifyControlEvidenceGap({ implementationStatus: 'IMPLEMENTED', acceptedCurrent: 0, stale: 0 })).toBe('MISSING_EVIDENCE');
    expect(classifyControlEvidenceGap({ implementationStatus: 'PARTIAL', acceptedCurrent: 0, stale: 0 })).toBe('MISSING_EVIDENCE');
    expect(classifyControlEvidenceGap({ implementationStatus: 'IMPLEMENTING', acceptedCurrent: 0, stale: 0 })).toBe('MISSING_EVIDENCE');
    expect(classifyControlEvidenceGap({ implementationStatus: 'NOT_ASSESSED', acceptedCurrent: 0, stale: 0 })).toBe('NOT_ASSESSED');
    expect(classifyControlEvidenceGap({ implementationStatus: 'IMPLEMENTED', acceptedCurrent: 1, stale: 0 })).toBe('EVIDENCED');
  });

  it('STALE_ONLY_NEVER_COUNTS_AS_CURRENT: stale evidence cannot yield an evidenced gap', () => {
    expect(classifyControlEvidenceGap({ implementationStatus: 'IMPLEMENTED', acceptedCurrent: 0, stale: 3 })).not.toBe('EVIDENCED');
    expect(classifyControlEvidenceGap({ implementationStatus: 'IMPLEMENTED', acceptedCurrent: 0, stale: 3 })).toBe('STALE_EVIDENCE');
  });

  it('MISSING_CONTROL_WINS: an explicitly not-implemented control is never evidenced', () => {
    expect(classifyControlEvidenceGap({ implementationStatus: 'NOT_IMPLEMENTED', acceptedCurrent: 2, stale: 0 })).toBe('MISSING_CONTROL');
  });
});
