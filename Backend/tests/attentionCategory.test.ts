import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReviewAttentionLevel } from '@prisma/client';

import {
  ATTENTION_CATEGORY_ORDER,
  ATTENTION_DURATION_BANDS,
  ESTIMATED_MINUTES_MAX,
  aggregateAttentionWorkload,
  isAttentionCategory,
  isCountableWorkloadTask,
  itemEstimateRange,
  parseEstimatedMinutes,
  type AttentionWorkItem,
} from '../src/modules/tasks/attentionCategory';

describe('attention-category shared domain contract', () => {
  it('exposes exactly the five canonical enum values', () => {
    expect([...ATTENTION_CATEGORY_ORDER]).toEqual([
      'QUICK_SCAN',
      'APPROVAL',
      'SIGNATURE',
      'EDITING',
      'DETAILED_REVIEW',
    ]);
  });

  it('does not drift from the persisted Prisma enum (no manual duplication)', () => {
    // Same set as the deployed enum; ordering is the domain module's canonical tuple.
    expect(new Set(ATTENTION_CATEGORY_ORDER)).toEqual(new Set(Object.values(ReviewAttentionLevel)));
  });

  it('validates category membership', () => {
    expect(isAttentionCategory('DETAILED_REVIEW')).toBe(true);
    expect(isAttentionCategory('quick_scan')).toBe(false);
    expect(isAttentionCategory('URGENT')).toBe(false);
    expect(isAttentionCategory(null)).toBe(false);
  });

  it('defines the exact duration bands', () => {
    expect(ATTENTION_DURATION_BANDS).toEqual({
      QUICK_SCAN: { minMinutes: 5, maxMinutes: 15 },
      APPROVAL: { minMinutes: 10, maxMinutes: 20 },
      SIGNATURE: { minMinutes: 5, maxMinutes: 10 },
      EDITING: { minMinutes: 30, maxMinutes: 60 },
      DETAILED_REVIEW: { minMinutes: 60, maxMinutes: 120 },
    });
  });
});

describe('estimate validation', () => {
  it('accepts a positive integer within the cap', () => {
    expect(parseEstimatedMinutes(25)).toEqual({ ok: true, value: 25 });
    expect(parseEstimatedMinutes(ESTIMATED_MINUTES_MAX)).toEqual({ ok: true, value: ESTIMATED_MINUTES_MAX });
  });
  it('rejects zero', () => { expect(parseEstimatedMinutes(0)).toEqual({ ok: false, reason: 'NOT_POSITIVE' }); });
  it('rejects negative', () => { expect(parseEstimatedMinutes(-5)).toEqual({ ok: false, reason: 'NOT_POSITIVE' }); });
  it('rejects decimal', () => { expect(parseEstimatedMinutes(12.5)).toEqual({ ok: false, reason: 'NOT_INTEGER' }); });
  it('rejects excessive', () => { expect(parseEstimatedMinutes(ESTIMATED_MINUTES_MAX + 1)).toEqual({ ok: false, reason: 'TOO_LARGE' }); });
  it('rejects NaN / non-number', () => {
    expect(parseEstimatedMinutes(NaN)).toEqual({ ok: false, reason: 'NOT_A_NUMBER' });
    expect(parseEstimatedMinutes('30')).toEqual({ ok: false, reason: 'NOT_A_NUMBER' });
  });
  it('does not silently clamp', () => {
    expect(parseEstimatedMinutes(100000).ok).toBe(false);
    expect(parseEstimatedMinutes(-1).ok).toBe(false);
  });
});

describe('per-item estimate range (precedence)', () => {
  it('explicit estimate → min == max', () => {
    expect(itemEstimateRange({ attentionCategory: 'DETAILED_REVIEW', estimatedMinutes: 90 })).toEqual({ minMinutes: 90, maxMinutes: 90 });
  });
  it('category default → band', () => {
    expect(itemEstimateRange({ attentionCategory: 'DETAILED_REVIEW', estimatedMinutes: null })).toEqual({ minMinutes: 60, maxMinutes: 120 });
  });
  it('null category → no duration (null), even with an estimate', () => {
    expect(itemEstimateRange({ attentionCategory: null, estimatedMinutes: 90 })).toBeNull();
  });
});

describe('workload aggregation', () => {
  const items: AttentionWorkItem[] = [
    { attentionCategory: 'DETAILED_REVIEW', estimatedMinutes: null }, // band 60–120
    { attentionCategory: 'DETAILED_REVIEW', estimatedMinutes: null }, // band 60–120
    { attentionCategory: 'DETAILED_REVIEW', estimatedMinutes: null }, // band 60–120
    { attentionCategory: 'QUICK_SCAN', estimatedMinutes: 8 },          // explicit 8–8
    { attentionCategory: null, estimatedMinutes: null },               // unclassified
    { attentionCategory: null, estimatedMinutes: 45 },                 // unclassified (count only)
  ];

  it('aggregates category ranges and unclassified count', () => {
    const summary = aggregateAttentionWorkload(items);
    const detailed = summary.categories.find((c) => c.attentionCategory === 'DETAILED_REVIEW')!;
    expect(detailed).toEqual({ attentionCategory: 'DETAILED_REVIEW', count: 3, minMinutes: 180, maxMinutes: 360 });
    const quick = summary.categories.find((c) => c.attentionCategory === 'QUICK_SCAN')!;
    expect(quick).toEqual({ attentionCategory: 'QUICK_SCAN', count: 1, minMinutes: 8, maxMinutes: 8 });
    expect(summary.unclassified).toEqual({ count: 2 });
  });

  it('returns all five categories in canonical order, zeros included', () => {
    const summary = aggregateAttentionWorkload([]);
    expect(summary.categories.map((c) => c.attentionCategory)).toEqual([...ATTENTION_CATEGORY_ORDER]);
    expect(summary.categories.every((c) => c.count === 0 && c.minMinutes === 0 && c.maxMinutes === 0)).toBe(true);
    expect(summary.unclassified.count).toBe(0);
  });

  it('counts each item exactly once (one item per task; submissions do not multiply)', () => {
    const summary = aggregateAttentionWorkload([
      { attentionCategory: 'EDITING', estimatedMinutes: null },
    ]);
    expect(summary.categories.find((c) => c.attentionCategory === 'EDITING')!.count).toBe(1);
  });
});

describe('workload scope predicate (no double count + user scope)', () => {
  const me = 'user-1';
  it('excludes closed tasks', () => {
    expect(isCountableWorkloadTask({ status: 'COMPLETED', assignedToId: me }, me)).toBe(false);
    expect(isCountableWorkloadTask({ status: 'DONE', assignedToId: me }, me)).toBe(false);
  });
  it('excludes tasks assigned to another user', () => {
    expect(isCountableWorkloadTask({ status: 'IN_PROGRESS', assignedToId: 'user-2' }, me)).toBe(false);
    expect(isCountableWorkloadTask({ status: 'IN_PROGRESS', assignedToId: null }, me)).toBe(false);
  });
  it('includes my open task', () => {
    expect(isCountableWorkloadTask({ status: 'IN_PROGRESS', assignedToId: me }, me)).toBe(true);
  });
});

describe('schema candidate is nullable/additive only', () => {
  it('Task.attentionCategory and Task.estimatedMinutes are nullable with no default', () => {
    const schema = readFileSync(join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
    expect(schema).toMatch(/attentionCategory\s+ReviewAttentionLevel\?/);
    expect(schema).toMatch(/estimatedMinutes\s+Int\?/);
    // No default classification for legacy rows.
    expect(schema).not.toMatch(/attentionCategory\s+ReviewAttentionLevel\?\s*@default/);
    // Enum not renamed.
    expect(schema).toMatch(/enum ReviewAttentionLevel/);
  });
});
