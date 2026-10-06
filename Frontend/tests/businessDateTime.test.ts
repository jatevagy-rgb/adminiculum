import { test } from 'node:test';
import assert from 'node:assert/strict';
import { businessDateKey, businessDateTimeInput, businessDateTimeToIso, formatDeadline } from '../src/lib/businessDateTime';
import { formatDateTime } from '../src/lib/taskWorkflowPresentation';

test('UTC midnight timestamps consistently display Budapest winter/summer time', () => {
  for (const [source, input] of [
    ['2026-01-15T00:00:00Z', '2026-01-15T01:00'],
    ['2026-07-15T00:00:00Z', '2026-07-15T02:00'],
  ]) {
    assert.equal(businessDateTimeInput(source), input);
    assert.equal(businessDateTimeToIso(input), new Date(source).toISOString());
    assert.equal(formatDateTime(source), formatDeadline(source));
  }
  assert.equal(businessDateKey('2026-07-15T23:30:00Z'), '2026-07-16');
});

test('date-only values retain their literal day without an invented midnight', () => {
  assert.equal(formatDeadline('2026-03-29', 'DATE_ONLY'), '2026.03.29.');
  assert.equal(formatDeadline('2026-10-25', 'DATE_ONLY'), '2026.10.25.');
  assert.equal(formatDeadline('2026-02-30', 'DATE_ONLY'), '—');
});

test('Budapest DST boundaries reject a nonexistent time and consistently resolve the repeated hour', () => {
  assert.equal(businessDateTimeToIso('2026-03-29T01:30'), '2026-03-29T00:30:00.000Z');
  assert.equal(businessDateTimeToIso('2026-03-29T03:30'), '2026-03-29T01:30:00.000Z');
  assert.throws(() => businessDateTimeToIso('2026-03-29T02:30'));
  assert.equal(businessDateTimeToIso('2026-10-25T02:30'), '2026-10-25T01:30:00.000Z');
  assert.throws(() => businessDateTimeToIso('2026-02-30T12:00'));
});
