import { validateStructuredAnswer } from '../src/modules/client-interaction/submissionService';

describe('structured client answer validation', () => {
  it('rejects malformed typed values', () => {
    expect(() => validateStructuredAnswer({ type: 'EMAIL' }, 'not-an-email')).toThrow('Érvényes e-mail-cím szükséges.');
    expect(() => validateStructuredAnswer({ type: 'NUMBER' }, 'abc')).toThrow('Érvényes szám szükséges.');
    expect(() => validateStructuredAnswer({ type: 'DATE' }, '2026-99-99')).toThrow('Érvényes dátum szükséges.');
  });

  it('bounds choices and text length', () => {
    expect(() => validateStructuredAnswer({ type: 'SINGLE_CHOICE', options: ['A', 'B'] }, 'C')).toThrow('Érvényes választási lehetőség szükséges.');
    expect(() => validateStructuredAnswer({ type: 'MULTIPLE_CHOICE', options: ['A', 'B'] }, 'A | A')).toThrow('Érvényes választási lehetőségek szükségesek.');
    expect(() => validateStructuredAnswer({ type: 'SHORT_TEXT', maxLength: 3 }, 'abcd')).toThrow('Az adatmező értéke túl hosszú.');
  });
});
