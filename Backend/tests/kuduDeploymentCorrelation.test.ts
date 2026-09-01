import { selectDeploymentCandidate } from '../../.github/scripts/kudu-deployment-correlation';

const requestStartedAt = Date.parse('2026-09-01T12:00:00Z');
const expectedSha = 'a'.repeat(40);

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'deployment-1',
    status: 4,
    complete: true,
    start_time: '2026-09-01T12:00:05Z',
    message: `release ${expectedSha}`,
    ...overrides,
  };
}

function correlate(after: unknown[], before: unknown[] = []) {
  return selectDeploymentCandidate({
    before,
    after,
    requestStartedAt,
    expectedSha,
  });
}

describe('Kudu no-Location deployment correlation', () => {
  it('accepts exactly one new terminal-success deployment', () => {
    expect(correlate([deployment()])).toEqual({
      outcome: 'success',
      id: 'deployment-1',
    });
  });

  it('rejects zero candidates and multiple candidates', () => {
    expect(correlate([])).toEqual({ outcome: 'none' });
    expect(correlate([deployment(), deployment({ id: 'deployment-2' })])).toEqual({
      outcome: 'ambiguous',
    });
  });

  it('does not mistake a pre-existing deployment for this request', () => {
    expect(correlate([deployment()], [deployment()])).toEqual({ outcome: 'none' });
  });

  it('rejects a candidate with a wrong SHA or failed terminal state', () => {
    expect(correlate([deployment({ message: `release ${'b'.repeat(40)}` })])).toEqual({
      outcome: 'wrong-identity',
    });
    expect(correlate([deployment({ status: 3, complete: true })])).toEqual({
      outcome: 'failed',
      id: 'deployment-1',
    });
  });

  it('keeps an active candidate bounded and rejects concurrent activity', () => {
    expect(correlate([deployment({ status: 2, complete: false })])).toEqual({
      outcome: 'active',
      id: 'deployment-1',
    });
    expect(correlate([
      deployment(),
      deployment({ id: 'deployment-2', status: 2, complete: false }),
    ])).toEqual({ outcome: 'ambiguous' });
  });

  it('allows unique timestamp-correlated records when Kudu omits identity metadata', () => {
    expect(correlate([deployment({ message: 'zip deployment' })])).toEqual({
      outcome: 'success',
      id: 'deployment-1',
    });
  });
});
