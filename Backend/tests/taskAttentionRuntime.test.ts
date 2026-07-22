import { parseTaskAttentionInput, TaskAttentionValidationError } from '../src/modules/tasks/services';

describe('task attention runtime input validation', () => {
  it('accepts all five exact category values and null', () => {
    for (const attentionCategory of ['QUICK_SCAN', 'APPROVAL', 'SIGNATURE', 'EDITING', 'DETAILED_REVIEW']) {
      expect(parseTaskAttentionInput({ attentionCategory })).toEqual({ attentionCategory, estimatedMinutes: undefined });
    }
    expect(parseTaskAttentionInput({ attentionCategory: null })).toEqual({ attentionCategory: null, estimatedMinutes: undefined });
    expect(parseTaskAttentionInput({ attentionCategory: '' })).toEqual({ attentionCategory: null, estimatedMinutes: undefined });
  });

  it('rejects unknown, lowercase and arbitrary category values with a stable code', () => {
    for (const attentionCategory of ['quick_scan', 'URGENT', 'AI_REVIEW', '']) {
      if (attentionCategory === '') continue;
      expect(() => parseTaskAttentionInput({ attentionCategory })).toThrow(TaskAttentionValidationError);
      try {
        parseTaskAttentionInput({ attentionCategory });
      } catch (error) {
        expect((error as TaskAttentionValidationError).code).toBe('INVALID_ATTENTION_CATEGORY');
      }
    }
  });

  it('accepts null or integer estimate between 1 and 480', () => {
    expect(parseTaskAttentionInput({ estimatedMinutes: null })).toEqual({ attentionCategory: undefined, estimatedMinutes: null });
    expect(parseTaskAttentionInput({ estimatedMinutes: '' })).toEqual({ attentionCategory: undefined, estimatedMinutes: null });
    expect(parseTaskAttentionInput({ estimatedMinutes: 1 })).toEqual({ attentionCategory: undefined, estimatedMinutes: 1 });
    expect(parseTaskAttentionInput({ estimatedMinutes: 480 })).toEqual({ attentionCategory: undefined, estimatedMinutes: 480 });
  });

  it('rejects zero, negative, decimal, NaN and above-cap estimates with a stable code', () => {
    for (const estimatedMinutes of [0, -1, 1.5, Number.NaN, 481, '30']) {
      try {
        parseTaskAttentionInput({ estimatedMinutes });
        throw new Error(`Expected rejection for ${String(estimatedMinutes)}`);
      } catch (error) {
        expect((error as TaskAttentionValidationError).code).toBe('INVALID_ESTIMATED_MINUTES');
      }
    }
  });
});
