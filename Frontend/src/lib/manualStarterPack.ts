/** Generic manual recipe. Registry references are selected by a professional, never applied automatically. */
export const MANUAL_STARTER_PACK_VERSION = '1.0';
export const STARTER_PACK_REGISTRIES = ['FactDefinition', 'ControlDefinition', 'CaseTypeDefinition', 'WorkPackageTemplate', 'WorkflowTemplate', 'ClauseLibraryItem', 'ComplianceDomain', 'ImmutableGrowDefinition'] as const;
export const MANUAL_STARTER_PACK_STEPS = [
  'Kereskedelmi tartalom és kizárások jóváhagyása',
  'Ügyfélazonosság és munkatér ellenőrzése',
  'Felelős kapcsolattartók rögzítése',
  'Minimális szervezet és ismert tények rögzítése; az ismeretlenek külön jelölése',
  'Alkalmazandó megfelelési területek szakmai felülvizsgálata',
  'Jóváhagyott szabványos munkacsomagok kiválasztása',
  'Dokumentumimport: eredet, pontos verzió és tiszta vírusellenőrzés',
  'Postafiók és SharePoint jogosultságok ellenőrzése',
  'Ügyfélfelületi közzététel és bekérés ellenőrzése',
  'Önkéntes folyamat-alapfelmérés',
  'Első valós, befejezett eredmény és szakmai ellenőrzés',
  'Külön, kifejezett ügyfélközzététel',
] as const;
export const BASELINE_CATEGORIES = ['Email triázs', 'Ügyindítás', 'Dokumentum-előkészítés', 'Senior ellenőrzés', 'Ellenőrzési körök', 'Megfelelési felmérés', 'Helyreállítás', 'Ügyfélre várakozás', 'Grow előkészítés', 'Szerződésvizsgálat / megújítás'] as const;
export type BaselineRow = { category: string; basis: 'MEASURED' | 'ESTIMATED'; value: number; unit: 'ACTIVE_MINUTES' | 'ELAPSED_MINUTES' | 'COUNT' };
export function baselineUnit(category: string): BaselineRow['unit'] {
  return category === 'Ügyfélre várakozás' ? 'ELAPSED_MINUTES' : category === 'Ellenőrzési körök' ? 'COUNT' : 'ACTIVE_MINUTES';
}
export function makeBaselineRow(category: string, basis: BaselineRow['basis'], raw: string): BaselineRow | null {
  const value = Number(raw);
  if (!(BASELINE_CATEGORIES as readonly string[]).includes(category) || !['MEASURED', 'ESTIMATED'].includes(basis) || !raw.trim() || !Number.isFinite(value) || value < 0 || value > 1000000 || (baselineUnit(category) === 'COUNT' && !Number.isInteger(value))) return null;
  return { category, basis, value, unit: baselineUnit(category) };
}
