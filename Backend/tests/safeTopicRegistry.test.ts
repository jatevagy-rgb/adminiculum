import {
  isPortalVisible,
  lookupSafeControlLabel,
  lookupSafeControlRef,
  lookupSafeTopic,
  portalVisibleKeys,
} from '../src/modules/compliance/safeTopicRegistry';

describe('safeTopicRegistry — compliance discovery verticals', () => {
  it('CLIENT_SAFE_NEW_TOPICS: the three verticals are portal-visible in production', () => {
    for (const key of ['GDPR_GENERAL_SCOPE', 'GDPR_ELEVATED_RISK_DPIA_DPO', 'WHISTLEBLOWING_INTERNAL_CHANNEL', 'NIS2_ORGANISATION_SCOPE', 'NIS2_SECURITY_CONTROLS']) {
      const topic = lookupSafeTopic(key, true);
      expect(topic).not.toBeNull();
      expect(topic!.topicKey).toMatch(/^portal\//);
      expect(topic!.portalLabel.length).toBeGreaterThan(0);
      expect(topic!.demo).toBeUndefined();
      expect(isPortalVisible(key, true)).toBe(true);
    }
    expect(portalVisibleKeys(true).has('GDPR_GENERAL_SCOPE')).toBe(true);
    expect(portalVisibleKeys(true).has('NIS2_SECURITY_CONTROLS')).toBe(true);
  });

  it('UNKNOWN_TOPIC_DENY_BY_DEFAULT: unregistered requirement keys stay hidden', () => {
    expect(lookupSafeTopic('NOT_A_REAL_REQUIREMENT', true)).toBeNull();
    expect(isPortalVisible('NOT_A_REAL_REQUIREMENT', true)).toBe(false);
    expect(portalVisibleKeys(true).has('NOT_A_REAL_REQUIREMENT')).toBe(false);
    expect(lookupSafeTopic('NIS2_SECURITY_CONTROLS', false, false)).not.toBeNull();
  });

  it('EVIDENCE_CONTROL_LABELS: the six seeded controls have safe labels', () => {
    for (const key of ['C-DATA-001', 'C-DATA-002', 'C-DATA-003', 'C-CYBER-001', 'C-CYBER-002', 'C-WB-001']) {
      expect(lookupSafeControlLabel(key)).not.toBeNull();
    }
    expect(lookupSafeControlLabel('UNKNOWN_CONTROL')).toBeNull();
  });

  it('SAFE_CONTROL_IDENTITY: every labelled control has a unique opaque reference', () => {
    const keys = ['GDPR_DATA_PROCESSING_CONTROL', 'C-DATA-001', 'C-DATA-002', 'C-DATA-003', 'C-CYBER-001', 'C-CYBER-002', 'C-WB-001'];
    const refs = keys.map((key) => {
      const ref = lookupSafeControlRef(key);
      expect(ref).toBeTruthy();
      // Never the internal key, never the customer-visible display label.
      expect(ref).not.toBe(key);
      expect(ref).not.toBe(lookupSafeControlLabel(key));
      return ref as string;
    });
    expect(new Set(refs).size).toBe(refs.length);
    expect(lookupSafeControlRef('UNKNOWN_CONTROL')).toBeNull();
  });
});
