import {
  getTeaor25Entry,
  installTeaor25Catalog,
  isTeaor25CatalogInstalled,
  loadTeaor25CatalogFromJson,
  resetTeaor25Catalog,
  searchTeaor25,
  teaor25CatalogSource,
  validateTeaor25ActivitySelection,
} from '../src/modules/client-workspace/teaor25Catalog';

const SAMPLE = [
  { code: '01.11', labelHu: 'Búzatermesztés', section: 'A' },
  { code: '62.01', labelHu: 'Számítógépes programozás', section: 'J' },
  { code: '62.02', labelHu: 'Információs technológiai szaktanácsadás', section: 'J' },
];

describe('TEÁOR\'25 catalogue mechanism', () => {
  afterEach(() => resetTeaor25Catalog());

  it('starts EMPTY because no authoritative nomenclature ships in the repo', () => {
    resetTeaor25Catalog();
    expect(isTeaor25CatalogInstalled()).toBe(false);
    expect(teaor25CatalogSource()).toBeNull();
    expect(getTeaor25Entry('62.01')).toBeUndefined();
  });

  it('TEAOR_PRIMARY: accepts a primary code once the catalogue is installed', () => {
    installTeaor25Catalog(SAMPLE, 'unit-test');
    const result = validateTeaor25ActivitySelection({ primaryCode: '62.01' });
    expect(result).toMatchObject({ valid: true, catalogInstalled: true, errors: [] });
    expect(teaor25CatalogSource()).toBe('unit-test');
  });

  it('requires a primary code and rejects unknown codes when installed', () => {
    installTeaor25Catalog(SAMPLE);
    expect(validateTeaor25ActivitySelection({ primaryCode: null }).errors).toContain('PRIMARY_TEAOR25_REQUIRED');
    expect(validateTeaor25ActivitySelection({ primaryCode: '99.99' }).errors).toContain('PRIMARY_TEAOR25_UNKNOWN');
  });

  it('TEAOR_ADDITIONAL: supports multi-select and rejects duplicates', () => {
    installTeaor25Catalog(SAMPLE);
    expect(validateTeaor25ActivitySelection({ primaryCode: '62.01', additionalCodes: ['62.02'] }).valid).toBe(true);
    expect(validateTeaor25ActivitySelection({ primaryCode: '62.01', additionalCodes: ['62.01'] }).errors).toContain('ADDITIONAL_TEAOR25_DUPLICATES_PRIMARY');
    expect(validateTeaor25ActivitySelection({ primaryCode: '62.01', additionalCodes: ['62.01'] }).valid).toBe(false);
  });

  it('searches by code prefix and accent-insensitive Hungarian label', () => {
    installTeaor25Catalog(SAMPLE);
    expect(searchTeaor25('62.').map((entry) => entry.code)).toEqual(['62.01', '62.02']);
    expect(searchTeaor25('szamitogepes').map((entry) => entry.code)).toEqual(['62.01']);
    expect(searchTeaor25('informacios').map((entry) => entry.code)).toEqual(['62.02']);
  });

  it('rejects malformed data drops loudly', () => {
    expect(() => installTeaor25Catalog([{ code: '', labelHu: 'x' }])).toThrow();
    expect(() => installTeaor25Catalog([{ code: '62.01', labelHu: 'a' }, { code: '62.01', labelHu: 'b' }])).toThrow(/Duplicate/);
    expect(() => loadTeaor25CatalogFromJson('{"code":"62.01"}')).toThrow();
  });
});
