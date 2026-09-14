import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  COMPANY_PROFILE_SCREENS,
  COMPANY_PROFILE_SCREEN_SECTION_TITLES,
  assertScreenCatalogIntegrity,
  getCompanyProfileScreen,
  resolveVisibleScreens,
  screensForFact,
} from '../src/modules/client-workspace/companyProfileScreenCatalog';
import { CANONICAL_COMPANY_FACT_KEYS } from '../src/modules/client-workspace/companyProfileFactCatalog';
import { COMPANY_PROFILE_QUESTION_KEYS } from '../src/modules/client-workspace/companyProfileQuestionCatalog';
import { buildFactStateMap } from '../src/modules/client-workspace/companyProfileAdaptive';

const answered = (value: boolean | number | string | readonly string[]) => ({ status: 'ANSWERED' as const, value });
const PORTAL = path.resolve(__dirname, '../../Frontend/src/components/client-portal/OrganizationCompanyProfile.tsx');
const SERVICE = path.resolve(__dirname, '../src/modules/client-workspace/companyProfileAnswerService.ts');

describe('grouped client screens (Ügyfél_kérdőív)', () => {
  it('GROUPED_SCREEN_CATALOG: every screen is complete and references real facts and atoms', () => {
    expect(() => assertScreenCatalogIntegrity(new Set(CANONICAL_COMPANY_FACT_KEYS), new Set(COMPANY_PROFILE_QUESTION_KEYS))).not.toThrow();
    for (const screen of COMPANY_PROFILE_SCREENS) {
      expect(screen.titleHu.length).toBeGreaterThan(3);
      expect(screen.helpTextHu.length).toBeGreaterThan(3);
      expect(screen.whyHu.length).toBeGreaterThan(3);
      expect(COMPANY_PROFILE_SCREEN_SECTION_TITLES[screen.sectionKey]).toBeTruthy();
    }
    expect(COMPANY_PROFILE_SCREENS.map((screen) => screen.order)).toEqual(Array.from({ length: 26 }, (_, index) => index + 1));
  });

  it('CLIENT_SCREEN_COUNT_MATCHES_WORKBOOK_MODEL: exactly the 26 workbook screens', () => {
    expect(COMPANY_PROFILE_SCREENS).toHaveLength(26);
    expect(new Set(COMPANY_PROFILE_SCREENS.map((screen) => screen.screenKey)).size).toBe(26);
  });

  it('keeps the international screen as one screen collecting three facts', () => {
    const screen = getCompanyProfileScreen('SCREEN-INTERNATIONAL-SALES');
    expect(screen?.factBindings).toEqual(['cross_border_eu_sales', 'export_outside_eu', 'import_into_eu']);
    expect(screensForFact('import_into_eu').map((item) => item.screenKey)).toContain('SCREEN-INTERNATIONAL-SALES');
  });

  it('MULTI_FACT_SCREEN_ATOMIC_SAVE: the grouped save commits all facts in one transaction', () => {
    const service = readFileSync(SERVICE, 'utf8');
    expect(service).toContain('export async function answerCompanyProfileScreen');
    expect(service).toContain('screen.factBindings.includes(factKey)');
    expect(service).toContain('isCompanyProfileQuestion(factKey)');
    expect(service).toContain('async (tx)');
    expect(service).toContain('TransactionIsolationLevel.Serializable');
  });

  it('NO_FLAT_ATOMIC_QUESTION_LIST: the portal renders grouped screens, not one card per atom', () => {
    const portal = readFileSync(PORTAL, 'utf8');
    expect(portal).not.toContain('questions.map(');
    expect(portal).toContain('screens');
    expect(portal).toContain('factBindings');
  });

  it('NO_COMMA_TEXT_INPUT: no comma-separated TEÁOR input remains', () => {
    const portal = readFileSync(PORTAL, 'utf8');
    expect(portal).not.toContain('vesszővel elválasztva');
    expect(portal).toContain('Teaor25');
    expect(portal).toContain('TEAOR25');
    expect(portal).toContain('TEAOR_UNAVAILABLE');
  });

  it('show/hide gating follows canonical fact state', () => {
    const base = resolveVisibleScreens(buildFactStateMap({}));
    expect(base.map((screen) => screen.screenKey)).toContain('SCREEN-COMPANY-OPERATING-COUNTRIES');
    expect(base.map((screen) => screen.screenKey)).not.toContain('SCREEN-INTERNATIONAL-SALES'.replace('INTERNATIONAL-SALES', 'AI-PURPOSE'));
    expect(resolveVisibleScreens(buildFactStateMap({ ai_use: answered(true) })).map((screen) => screen.screenKey)).toContain('SCREEN-AI-PURPOSE');
    expect(resolveVisibleScreens(buildFactStateMap({ ai_use: answered(false) })).map((screen) => screen.screenKey)).not.toContain('SCREEN-AI-PURPOSE');
    expect(resolveVisibleScreens(buildFactStateMap({ import_into_eu: answered(true) })).map((screen) => screen.screenKey)).toContain('SCREEN-ENVIRONMENT-IMPORT');
    expect(resolveVisibleScreens(buildFactStateMap({ import_into_eu: answered(false) })).map((screen) => screen.screenKey)).not.toContain('SCREEN-ENVIRONMENT-IMPORT');
    expect(resolveVisibleScreens(buildFactStateMap({ personal_data_processing: answered(true) })).map((screen) => screen.screenKey)).toContain('SCREEN-DATA-SENSITIVE');
    expect(resolveVisibleScreens(buildFactStateMap({ personal_data_processing: answered(false) })).map((screen) => screen.screenKey)).not.toContain('SCREEN-DATA-SENSITIVE');
  });

  it('asks for headcount only when it is still missing', () => {
    expect(resolveVisibleScreens(buildFactStateMap({})).map((screen) => screen.screenKey)).toContain('SCREEN-PEOPLE-EMPLOYEES');
    expect(resolveVisibleScreens(buildFactStateMap({ employee_count: answered(20) })).map((screen) => screen.screenKey)).not.toContain('SCREEN-PEOPLE-EMPLOYEES');
  });

  it('TEÁOR fails closed in the service and exposes capability state', () => {
    const service = readFileSync(SERVICE, 'utf8');
    expect(service).toContain("'TEAOR25_CATALOG_NOT_INSTALLED'");
    expect(service).toContain('isTeaor25CatalogInstalled()');
    expect(service).toContain('teaor25CatalogInstalled');
    expect(service).not.toMatch(/isTeaor25CatalogInstalled\(\)\s*&&\s*!isValidTeaor25Code/);
  });
});
