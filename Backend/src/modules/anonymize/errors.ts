export type AnonymizeFailureCode = 'FEATURE_DISABLED' | 'AUTHORIZATION_DENIED' | 'SECURITY_SCAN_BLOCKED' | 'SOURCE_NOT_AVAILABLE' | 'PROCESSING_FAILURE';
export const ANONYMIZE_MESSAGES: Record<AnonymizeFailureCode, string> = {
  FEATURE_DISABLED: 'Az AI-anonimizálás jelenleg ki van kapcsolva.',
  AUTHORIZATION_DENIED: 'Nincs jogosultsága a dokumentum anonimizálásához.',
  SECURITY_SCAN_BLOCKED: 'A dokumentum biztonsági ellenőrzése még nem engedélyezi a feldolgozást.',
  SOURCE_NOT_AVAILABLE: 'A dokumentum hiteles forrásszövege jelenleg nem érhető el.',
  PROCESSING_FAILURE: 'A dokumentum feldolgozása nem sikerült. Próbálja újra később.',
};
export class AnonymizeFailure extends Error {
  constructor(public code: AnonymizeFailureCode) { super(ANONYMIZE_MESSAGES[code]); }
}
export function anonymizeFailure(code: AnonymizeFailureCode) {
  return { success: false as const, code, error: ANONYMIZE_MESSAGES[code], scanBlocked: code === 'SECURITY_SCAN_BLOCKED' };
}
