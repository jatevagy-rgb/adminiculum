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

  it('normalizes organization email and rejects malformed strings without false positives', () => {
    const { normalizeOrganizationEmail } = require('../src/modules/client-organization/service');
    expect(normalizeOrganizationEmail(null)).toBeNull();
    expect(normalizeOrganizationEmail(undefined)).toBeNull();
    expect(normalizeOrganizationEmail('')).toBeNull();
    expect(normalizeOrganizationEmail('   ')).toBeNull();

    expect(normalizeOrganizationEmail('secretary@example.com')).toBe('secretary@example.com');
    expect(normalizeOrganizationEmail('token.smith@example.com')).toBe('token.smith@example.com');
    expect(normalizeOrganizationEmail('  Secretary@Example.COM  ')).toBe('secretary@example.com');

    expect(() => normalizeOrganizationEmail('not-an-email')).toThrow(
      expect.objectContaining({ status: 400, code: 'EMAIL_INVALID' })
    );
    expect(() => normalizeOrganizationEmail('user@')).toThrow(
      expect.objectContaining({ status: 400, code: 'EMAIL_INVALID' })
    );
  });

  it('normalizes organization phone and strips control whitespace without customer-facing scanner', () => {
    const { normalizeOrganizationPhone } = require('../src/modules/client-organization/service');
    expect(normalizeOrganizationPhone(null)).toBeNull();
    expect(normalizeOrganizationPhone(undefined)).toBeNull();
    expect(normalizeOrganizationPhone('')).toBeNull();
    expect(normalizeOrganizationPhone('   ')).toBeNull();

    expect(normalizeOrganizationPhone(' +36 1 234 5678 \t ')).toBe('+36 1 234 5678');
    expect(normalizeOrganizationPhone('+36-30-token-secret-123')).toBe('+36-30-token-secret-123');
  });

  it('assertOrganizationInternalDto permits internal contacts without triggering forbidden scanner, but protects other fields', () => {
    const { assertOrganizationInternalDto } = require('../src/modules/client-organization/service');
    // DTO carrying token.smith@example.com and secretary@example.com should NOT throw
    expect(() => {
      assertOrganizationInternalDto({
        id: 'p1',
        name: 'Normal Person',
        email: 'token.smith@example.com',
        phone: '+36 1 234 5678',
      });
    }).not.toThrow();

    // DTO with array of persons
    expect(() => {
      assertOrganizationInternalDto([
        { id: 'p1', name: 'Person 1', email: 'secretary@example.com' },
        { id: 'p2', name: 'Person 2', email: 'token.smith@example.com' },
      ]);
    }).not.toThrow();

    // DTO carrying forbidden content in another field (e.g. name or workInstruction) MUST throw
    expect(() => {
      assertOrganizationInternalDto({
        id: 'p1',
        name: 'Reviewer workInstruction internal notes',
        email: 'safe@example.com',
      });
    }).toThrow();
  });
});
