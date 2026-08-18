import {
  isCompanyAssessmentType,
  isCompanyFactType,
  isCompanyMilestoneType,
} from '../src/modules/client-company/registry';

describe('Company foundation code registries', () => {
  it('accepts known fact types and rejects unknown ones', () => {
    expect(isCompanyFactType('EMPLOYEE_COUNT')).toBe(true);
    expect(isCompanyFactType('REVENUE_BAND')).toBe(true);
    expect(isCompanyFactType('AI_USAGE')).toBe(true);
    expect(isCompanyFactType('NOT_A_REAL_TYPE')).toBe(false);
  });

  it('accepts known milestone types', () => {
    expect(isCompanyMilestoneType('FIRST_EXPORT')).toBe(true);
    expect(isCompanyMilestoneType('NEW_GROUP_COMPANY')).toBe(true);
    expect(isCompanyMilestoneType('UNKNOWN_EVENT')).toBe(false);
  });

  it('accepts known assessment types without needing a migration for future packs', () => {
    expect(isCompanyAssessmentType('COMPANY_OPERATING')).toBe(true);
    expect(isCompanyAssessmentType('CONTRACT_GOVERNANCE')).toBe(true);
    // Future post-release packs are added to the set in code (no DB enum).
    expect(isCompanyAssessmentType('SUPPLIER_READINESS')).toBe(false);
    expect(isCompanyAssessmentType('AI_GOVERNANCE')).toBe(false);
  });
});
