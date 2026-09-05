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

  it('maps email and phone in toPersonDTO cleanly with fallback to null', () => {
    const { toPersonDTO } = require('../src/modules/client-organization/service');
    const row = {
      id: 'p1',
      clientId: 'c1',
      organizationGroupId: null,
      managerPersonId: null,
      deputyPersonId: null,
      name: 'Teszt Elek',
      jobTitle: 'Ügyvezető',
      email: 'elek@example.com',
      phone: '+36 30 123 4567',
      employmentStatus: 'ACTIVE',
      startDate: new Date('2026-01-01'),
      endDate: null,
      responsibilitiesSummary: null,
      portalMembershipId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const dto = toPersonDTO(row);
    expect(dto.email).toBe('elek@example.com');
    expect(dto.phone).toBe('+36 30 123 4567');

    const emptyDto = toPersonDTO({ ...row, email: undefined, phone: null });
    expect(emptyDto.email).toBeNull();
    expect(emptyDto.phone).toBeNull();
  });
});
