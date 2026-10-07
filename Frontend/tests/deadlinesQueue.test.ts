import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceHarness, deferred, flatten, settle, textOf } from './helpers/asyncRaceHarness';
import * as dates from '../src/lib/businessDateTime';

function result(id: string, more = false, offset = 0) {
  return { timezone: dates.BUSINESS_TIME_ZONE, range: { from: '2026-07-15', to: '2026-07-29' },
    days: [{ date: '2026-01-01', items: [{ id, dueAt: '2026-01-01T00:00:00Z', urgency: 'OVERDUE', status: 'OPEN' }] }],
    pagination: { limit: 100, offset, hasMore: more } };
}

function setup() {
  const calls: Array<{ query: any; response: ReturnType<typeof deferred> }> = [];
  const h = createRaceHarness('src/app/deadlines/page.tsx', 'DeadlinesAgendaContent', {
    'next/navigation': { useSearchParams: () => new URLSearchParams() },
    'next/link': { default: 'a' },
    '@/lib/businessDateTime': dates,
    '@/lib/api': { getWorkflowAgenda: (query: any) => { const response = deferred(); calls.push({ query, response }); return response.promise; } },
    '@/components/ui': { Button: 'button', Alert: 'alert', PageHeader: 'header', EmptyState: 'empty', Badge: 'badge' },
  });
  return { h, calls };
}

test('calendar and overdue load independently and all old overdue pages remain reachable', async () => {
  const { h, calls } = setup();
  h.commit();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].query.queue, undefined);
  assert.equal(calls[1].query.queue, 'OVERDUE');
  calls[0].response.resolve({ ...result('unused'), days: [] });
  calls[1].response.resolve(result('months-old', true));
  await settle();
  let tree = h.commit();
  assert.ok(flatten(tree).some((node) => node.props?.item?.id === 'months-old'));
  const button = flatten(tree).find((node) => node.type === 'button' && textOf(node) === 'További lejárt tételek');
  button.props.onClick();
  assert.equal(calls[2].query.offset, 100);
  calls[2].response.resolve(result('weeks-old', false, 100));
  await settle();
  tree = h.commit();
  assert.deepEqual(flatten(tree).filter((node) => node.props?.item).map((node) => node.props.item.id), ['months-old', 'weeks-old']);
});

test('a failed agenda read is an error with retry, and an old scope cannot replace a new one', async () => {
  const { h, calls } = setup();
  let tree = h.commit();
  const header = flatten(tree).find((node) => node.type === 'header');
  const scope = flatten(header.props.actions).find((node) => node.type === 'button' && textOf(node) === 'Saját ügyeim');
  scope.props.onClick();
  h.commit();
  calls[2].response.reject(new Error('synthetic failure'));
  calls[3].response.resolve(result('new'));
  await settle();
  calls[0].response.resolve(result('stale'));
  calls[1].response.resolve(result('stale-overdue'));
  await settle();
  tree = h.commit();
  assert.match(textOf(tree), /Az agenda most nem érhető el/);
  assert.match(textOf(tree), /Újrapróbálás/);
  assert.equal(flatten(tree).some((node) => node.type === 'empty' || node.props?.item), false);
});
