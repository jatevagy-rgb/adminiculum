import { isPersonDocumentRole, isResponsibilityType } from '../src/modules/client-organization/registry';

describe('Organization registries', () => {
  it('accepts known responsibility types and rejects future/deferred ones', () => {
    expect(isResponsibilityType('MANAGEMENT')).toBe(true);
    expect(isResponsibilityType('FINANCE')).toBe(true);
    expect(isResponsibilityType('CONTRACT_OWNER')).toBe(true);
    expect(isResponsibilityType('OBLIGATION_OWNER')).toBe(true);
    expect(isResponsibilityType('RISK_OWNER')).toBe(false); // deferred engine
    expect(isResponsibilityType('CONTROL_OWNER')).toBe(false);
  });

  it('accepts known person-document roles', () => {
    expect(isPersonDocumentRole('EMPLOYMENT_CONTRACT')).toBe(true);
    expect(isPersonDocumentRole('EMPLOYMENT_AMENDMENT')).toBe(true);
    expect(isPersonDocumentRole('JOB_DESCRIPTION')).toBe(true);
    expect(isPersonDocumentRole('NDA')).toBe(true);
    expect(isPersonDocumentRole('POLICY_ACKNOWLEDGEMENT')).toBe(true);
    expect(isPersonDocumentRole('PAYSLIP')).toBe(false);
  });
});
