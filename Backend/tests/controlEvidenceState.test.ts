import { deriveControlEvidenceState } from '../src/modules/client-workspace/controlEvidenceState';

describe('deriveControlEvidenceState (machine-readable evidence follow-up state)', () => {
  it('unanswered control is PENDING', () => {
    expect(deriveControlEvidenceState({ implementationStatus: null, currentLinked: false, hasStaleEvidence: false })).toBe('PENDING');
    expect(deriveControlEvidenceState({ implementationStatus: 'NOT_ASSESSED', currentLinked: false, hasStaleEvidence: false })).toBe('PENDING');
  });

  it('answered YES with current evidence is ANSWERED', () => {
    expect(deriveControlEvidenceState({ implementationStatus: 'IMPLEMENTED', currentLinked: true, hasStaleEvidence: false })).toBe('ANSWERED');
  });

  it('answered NO (NOT_IMPLEMENTED) is ANSWERED, never PENDING', () => {
    expect(deriveControlEvidenceState({ implementationStatus: 'NOT_IMPLEMENTED', currentLinked: false, hasStaleEvidence: false })).toBe('ANSWERED');
  });

  it('stale evidence keeps its own truthful state, not PENDING', () => {
    expect(deriveControlEvidenceState({ implementationStatus: 'IMPLEMENTED', currentLinked: false, hasStaleEvidence: true })).toBe('STALE');
  });

  it('IMPLEMENTED without current evidence and no history is PENDING (no blind implemented claim)', () => {
    expect(deriveControlEvidenceState({ implementationStatus: 'IMPLEMENTED', currentLinked: false, hasStaleEvidence: false })).toBe('PENDING');
  });

  it('an explicit NO wins over stale history because it is the latest persisted answer', () => {
    expect(deriveControlEvidenceState({ implementationStatus: 'NOT_IMPLEMENTED', currentLinked: false, hasStaleEvidence: true })).toBe('ANSWERED');
  });
});
