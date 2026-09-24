import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceHarness } from './helpers/asyncRaceHarness';

// Route-generation guard — commit-gated invariant (regression).
//
// The generation must advance ONLY when a route-key change is COMMITTED. A
// speculative render that React discards (interrupted transition, Suspense retry)
// must never invalidate the still-committed route: otherwise the committed
// route's in-flight request is dropped and the page is left stuck.

function makeGuardHarness() {
  return createRaceHarness('src/lib/routeGeneration.ts', 'useRouteGeneration', {});
}

test('route guard: an abandoned (non-committed) route render does not advance the generation', () => {
  const h = makeGuardHarness();

  // Commit route A.
  const route = h.render('A');
  h.effects();
  assert.equal(route.generation, 0, 'route A commits at generation 0');

  // Speculative render to B that is DISCARDED (never committed).
  h.render('B');
  h.discardPendingEffects();

  // The committed route is still A. Re-render A and commit.
  h.render('A');
  h.effects();

  assert.equal(
    route.generation,
    0,
    'an abandoned render must not advance the committed generation',
  );
  assert.equal(route.isActive(0), true, 'route A remains the active identity');
});

test('route guard: a committed route change advances the generation and stales the previous one', () => {
  const h = makeGuardHarness();

  const route = h.render('A');
  h.effects();
  const genA = route.generation;

  // Commit route B.
  h.render('B');
  h.effects();

  assert.equal(route.generation, genA + 1, 'committing B advances the generation');
  assert.equal(route.isActive(genA), false, 'route A responses are now stale');
  assert.equal(route.isActive(route.generation), true, 'route B is active');

  // Commit route C (e.g. history forward).
  h.render('C');
  h.effects();
  assert.equal(route.generation, genA + 2, 'each committed route change advances once');
});
