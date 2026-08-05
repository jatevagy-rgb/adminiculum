import {
  classifyRelationship,
  decidePermissions,
  normalizeParticipantRole,
} from '../src/modules/client-workspace/organizationalAccessPolicy';

describe('CP1 organizational access policy (pure decisions)', () => {
  it('treats legacy/unknown roles as least-privileged PARTICIPANT', () => {
    expect(normalizeParticipantRole(null)).toBe('PARTICIPANT');
    expect(normalizeParticipantRole('')).toBe('PARTICIPANT');
    expect(normalizeParticipantRole('nonsense')).toBe('PARTICIPANT');
    expect(normalizeParticipantRole('requester')).toBe('REQUESTER');
    expect(normalizeParticipantRole('OBSERVER')).toBe('OBSERVER');
  });

  it('classifies OWN only for requester / client owner', () => {
    expect(classifyRelationship('REQUESTER', false)).toBe('OWN');
    expect(classifyRelationship('CLIENT_OWNER', false)).toBe('OWN');
    expect(classifyRelationship('PARTICIPANT', false)).toBe('SHARED');
    expect(classifyRelationship('OBSERVER', false)).toBe('SHARED');
    // isRequester flag also yields OWN even if the role column lags.
    expect(classifyRelationship('PARTICIPANT', true)).toBe('OWN');
  });

  it('derives permissions from the granted set, never from role alone', () => {
    const none = decidePermissions('PARTICIPANT', []);
    expect(none.canListCase).toBe(false);
    expect(none.canViewSummary).toBe(false);
    expect(none.canViewMessages).toBe(false);
    expect(none.canViewDocuments).toBe(false);

    const reader = decidePermissions('PARTICIPANT', ['MATTER_READ', 'DOCUMENT_READ']);
    expect(reader.canListCase).toBe(true);
    expect(reader.canViewSummary).toBe(true);
    expect(reader.canViewDocuments).toBe(true);
    expect(reader.canDownloadDocument).toBe(false);
    expect(reader.canViewMessages).toBe(false);
  });

  it('never lets an OBSERVER send or upload even with over-broad permissions', () => {
    const observer = decidePermissions('OBSERVER', ['MATTER_READ', 'MESSAGE_READ', 'MESSAGE_SEND', 'DOCUMENT_UPLOAD']);
    expect(observer.canViewMessages).toBe(true);
    expect(observer.canSendMessages).toBe(false);
    expect(observer.canUploadDocuments).toBe(false);

    const participant = decidePermissions('PARTICIPANT', ['MESSAGE_SEND', 'DOCUMENT_UPLOAD']);
    expect(participant.canSendMessages).toBe(true);
    expect(participant.canUploadDocuments).toBe(true);
  });

  it('keeps hours and billing false unless explicitly granted', () => {
    const withoutMoney = decidePermissions('CLIENT_OWNER', ['MATTER_READ']);
    expect(withoutMoney.canViewHours).toBe(false);
    expect(withoutMoney.canViewBillingStatement).toBe(false);
    const withMoney = decidePermissions('CLIENT_OWNER', ['HOURS_READ', 'BILLING_STATEMENT_READ']);
    expect(withMoney.canViewHours).toBe(true);
    expect(withMoney.canViewBillingStatement).toBe(true);
  });
});
