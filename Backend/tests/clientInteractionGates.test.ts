import {
  isMasterActionsEnabled,
  isCapabilityEnabled,
  requireCapability,
  ClientInteractionGateError,
} from '../src/modules/client-interaction/gates';

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

describe('client interaction gates', () => {
  it('master switch is off unless exactly "true"', () => {
    expect(isMasterActionsEnabled(env({}))).toBe(false);
    expect(isMasterActionsEnabled(env({ CLIENT_PORTAL_ACTIONS_ENABLED: 'false' }))).toBe(false);
    expect(isMasterActionsEnabled(env({ CLIENT_PORTAL_ACTIONS_ENABLED: '1' }))).toBe(false);
    expect(isMasterActionsEnabled(env({ CLIENT_PORTAL_ACTIONS_ENABLED: 'true' }))).toBe(true);
  });

  it('a capability requires BOTH the master switch and its own gate', () => {
    // granular on but master off -> disabled
    expect(isCapabilityEnabled('QUESTIONS', env({ CLIENT_PORTAL_QUESTIONS_ENABLED: 'true' }))).toBe(false);
    // master on but granular off -> disabled
    expect(isCapabilityEnabled('QUESTIONS', env({ CLIENT_PORTAL_ACTIONS_ENABLED: 'true' }))).toBe(false);
    // both on -> enabled
    expect(isCapabilityEnabled('QUESTIONS', env({ CLIENT_PORTAL_ACTIONS_ENABLED: 'true', CLIENT_PORTAL_QUESTIONS_ENABLED: 'true' }))).toBe(true);
  });

  it('master kill switch disables every capability at once', () => {
    const all = env({
      CLIENT_PORTAL_QUESTIONS_ENABLED: 'true',
      CLIENT_PORTAL_DOCUMENT_REQUESTS_ENABLED: 'true',
      CLIENT_PORTAL_DATA_REQUESTS_ENABLED: 'true',
      CLIENT_PORTAL_DOCUMENT_UPLOADS_ENABLED: 'true',
      CLIENT_PORTAL_EMAIL_NOTIFICATIONS_ENABLED: 'true',
      CLIENT_PORTAL_SUBMISSION_REVIEW_ENABLED: 'true',
      // master intentionally omitted (off)
    });
    for (const cap of ['QUESTIONS', 'DOCUMENT_REQUESTS', 'DATA_REQUESTS', 'DOCUMENT_UPLOADS', 'EMAIL_NOTIFICATIONS', 'SUBMISSION_REVIEW'] as const) {
      expect(isCapabilityEnabled(cap, all)).toBe(false);
    }
  });

  it('requireCapability throws 403 with the right code when disabled', () => {
    try {
      requireCapability('DOCUMENT_UPLOADS', env({}));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ClientInteractionGateError);
      expect((e as ClientInteractionGateError).status).toBe(403);
      expect((e as ClientInteractionGateError).code).toBe('CLIENT_PORTAL_ACTIONS_DISABLED');
    }
    try {
      requireCapability('DOCUMENT_UPLOADS', env({ CLIENT_PORTAL_ACTIONS_ENABLED: 'true' }));
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as ClientInteractionGateError).code).toBe('CLIENT_PORTAL_DOCUMENT_UPLOADS_ENABLED_DISABLED');
    }
  });

  it('requireCapability passes when both gates are on', () => {
    expect(() => requireCapability('QUESTIONS', env({ CLIENT_PORTAL_ACTIONS_ENABLED: 'true', CLIENT_PORTAL_QUESTIONS_ENABLED: 'true' }))).not.toThrow();
  });
});
