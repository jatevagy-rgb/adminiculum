import {
  applyDeterministicDerivations,
  assertVisibilityReferencesAreCanonical,
  buildFactStateMap,
  deriveEuSmeSizeClass,
  questionsOfferingUnknownRoute,
  resolveActiveModules,
  resolveBaselineQuestions,
  resolveVisibleQuestions,
} from '../src/modules/client-workspace/companyProfileAdaptive';

const answered = (value: boolean | number | string | readonly string[]) => ({ status: 'ANSWERED' as const, value });
const unknown = () => ({ status: 'UNKNOWN' as const });

describe('adaptive company profile visibility', () => {
  it('ADAPTIVE_HIDE_IRRELEVANT: hides the GDPR branch when no personal data is processed', () => {
    const report = resolveVisibleQuestions(buildFactStateMap({ personal_data_processing: answered(false) }));
    const visibleKeys = report.visible.map((question) => question.questionKey);
    expect(visibleKeys).not.toContain('Q-DATA-001');
    expect(visibleKeys).not.toContain('Q-DATA-007');
    expect(report.hidden.map((question) => question.questionKey)).toEqual(expect.arrayContaining(['Q-DATA-001', 'Q-DATA-005', 'Q-DATA-009']));
  });

  it('ADAPTIVE_SHOW_RELEVANT: opens the GDPR branch when personal data is processed', () => {
    const report = resolveVisibleQuestions(buildFactStateMap({ personal_data_processing: answered(true) }));
    const visibleKeys = report.visible.map((question) => question.questionKey);
    expect(visibleKeys).toEqual(expect.arrayContaining(['Q-DATA-001', 'Q-DATA-007', 'Q-DATA-009']));
  });

  it('does not ask AI role/risk questions when AI is not used', () => {
    const report = resolveVisibleQuestions(buildFactStateMap({ ai_use: answered(false) }));
    const visibleKeys = report.visible.map((question) => question.questionKey);
    expect(visibleKeys).not.toContain('Q-AI-001');
    expect(visibleKeys).not.toContain('Q-AI-002');
    expect(resolveVisibleQuestions(buildFactStateMap({ ai_use: answered(true) })).visible.map((question) => question.questionKey)).toEqual(expect.arrayContaining(['Q-AI-001', 'Q-AI-002', 'Q-AI-003']));
  });

  it('keeps product / machinery / battery detail closed when there is no product role', () => {
    const none = resolveVisibleQuestions(buildFactStateMap({ product_market_role: answered(['Nincs']) }));
    expect(none.visible.map((question) => question.questionKey)).not.toContain('Q-PROD-002');
    const manufacturer = resolveVisibleQuestions(buildFactStateMap({ product_market_role: answered(['Gyártó']) }));
    expect(manufacturer.visible.map((question) => question.questionKey)).toContain('Q-PROD-002');
  });

  it('activates the whistleblowing-relevant HR branch from headcount alone', () => {
    const small = resolveVisibleQuestions(buildFactStateMap({ employee_count: answered(2) }));
    const large = resolveVisibleQuestions(buildFactStateMap({ employee_count: answered(73) }));
    expect(small.visible.map((question) => question.questionKey)).toContain('Q-HR-002');
    expect(large.visible.map((question) => question.questionKey)).toContain('Q-HR-001');
    expect(resolveActiveModules(buildFactStateMap({ employee_count: answered(73) })).active).toContain('HR');
  });

  it('UNKNOWN_CAN_TRIGGER_REVIEW: an unknown gate is undetermined, never silently hidden', () => {
    const report = resolveVisibleQuestions(buildFactStateMap({ ai_use: unknown() }));
    expect(report.undetermined.map((question) => question.questionKey)).toEqual(expect.arrayContaining(['Q-AI-001', 'Q-AI-002']));
    expect(report.hidden.map((question) => question.questionKey)).not.toContain('Q-AI-001');
    expect(resolveActiveModules(buildFactStateMap({ ai_use: unknown() })).undetermined).toContain('AI');
    const review = questionsOfferingUnknownRoute(buildFactStateMap({ personal_data_processing: answered(true) }));
    expect(review.map((question) => question.questionKey)).toEqual(expect.arrayContaining(['Q-DATA-005', 'Q-DATA-007']));
  });

  it('derives canonical facts deterministically and never guesses sector classes', () => {
    expect(applyDeterministicDerivations(buildFactStateMap({ employee_count: answered(0) })).has_employees).toMatchObject({ status: 'ANSWERED', value: false, derived: true });
    const b2c = applyDeterministicDerivations(buildFactStateMap({ customer_types: answered(['Fogyasztók (B2C)']) }));
    expect(b2c.b2c_sales).toMatchObject({ status: 'ANSWERED', value: true });
    expect(b2c.public_sector_customer).toMatchObject({ status: 'ANSWERED', value: false });
    const sme = applyDeterministicDerivations(buildFactStateMap({ employee_count: answered(73), annual_net_revenue_eur: answered(9_000_000) })).eu_sme_size_class;
    expect(sme).toMatchObject({ status: 'ANSWERED', value: 'KÖZEPES' });
    expect(deriveEuSmeSizeClass({ employeeCount: 300 })).toBe('NAGY');
    expect(deriveEuSmeSizeClass({ employeeCount: 73 })).toBeNull();
    expect(applyDeterministicDerivations(buildFactStateMap({ employee_count: answered(73) })).nis2_sector).toBeUndefined();
  });

  it('baseline questions are always available and visibility only references canonical facts', () => {
    expect(resolveBaselineQuestions().length).toBe(resolveVisibleQuestions(buildFactStateMap({})).visible.length);
    expect(() => assertVisibilityReferencesAreCanonical()).not.toThrow();
  });
});
