import {
  isContractType,
  isEntitlementType,
  isObligationFrequency,
  isObligationSourceType,
  isObligationTriggerType,
  isPartyRole,
} from '../src/modules/client-contracts/registry';

describe('Contract library code registries', () => {
  it('accepts known contract types and rejects unknown ones', () => {
    expect(isContractType('LEASE')).toBe(true);
    expect(isContractType('SERVICE')).toBe(true);
    expect(isContractType('NOT_A_REAL_TYPE')).toBe(false);
  });

  it('accepts known party roles', () => {
    expect(isPartyRole('CUSTOMER')).toBe(true);
    expect(isPartyRole('SUPPLIER')).toBe(true);
    expect(isPartyRole('UNKNOWN_ROLE')).toBe(false);
  });

  it('accepts obligation source/trigger/frequency codes', () => {
    expect(isObligationSourceType('CONTRACT')).toBe(true);
    expect(isObligationTriggerType('RECURRING')).toBe(true);
    expect(isObligationFrequency('ANNUAL')).toBe(true);
    expect(isObligationSourceType('LEGAL_REQUIREMENT')).toBe(false); // future, no migration yet
    expect(isObligationFrequency('NOPE')).toBe(false);
  });

  it('accepts entitlement types', () => {
    expect(isEntitlementType('RENEWAL_OPTION')).toBe(true);
    expect(isEntitlementType('AUDIT_RIGHT')).toBe(true);
    expect(isEntitlementType('NOT_A_RIGHT')).toBe(false);
  });
});
