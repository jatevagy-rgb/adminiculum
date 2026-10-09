/**
 * GROW F14 — explicit pain-intake persistence contract.
 *
 * Navigation into the pain step must not silently persist anything. The only
 * write happens when the customer explicitly saves, exactly once, and a retry
 * reuses the stored idempotency key so the backend can reconcile instead of
 * creating a duplicate signal.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = () => readFileSync(path.resolve(process.cwd(), 'src/components/client-portal/GrowAdaptiveJourney.tsx'), 'utf8');

test('navigation into the pain step performs no write', () => {
  const src = source();
  assert.match(src, /onClick=\{\(\) => \{ setCategories\(\[\]\); setFreeText\(''\); painKey\.current = ''; setStep\('pain'\); \}\}/);
  const enterPain = src.slice(src.indexOf("setStep('pain')") - 220, src.indexOf("setStep('pain')") + 4);
  assert.doesNotMatch(enterPain, /submitPortalGrowPain/);
});

test('pain is persisted exactly once, only from the explicit save action', () => {
  const src = source();
  const writes = src.match(/submitPortalGrowPain\(/g) ?? [];
  assert.equal(writes.length, 1, 'exactly one explicit pain write call site');
  assert.match(src, /const submitPain = \(\) => run\(async current => \{/);
  assert.match(src, /await submitPortalGrowPain\(\{ categories, freeText: freeText\.trim\(\) \|\| undefined, idempotencyKey: painKey\.current \}\)/);
});

test('a retry reuses the stored key while a changed selection requests a new signal', () => {
  const src = source();
  assert.match(src, /if \(!painKey\.current\) painKey\.current = crypto\.randomUUID\(\);/);
  assert.match(src, /onChange=\{\(\) => \{ painKey\.current = ''; setCategories/);
  assert.match(src, /onChange=\{e => \{ painKey\.current = ''; setFreeText\(e\.target\.value\); \}\}/);
});

test('the save is disclosed as a save and cannot create a task by itself', () => {
  const src = source();
  assert.match(src, /A kiválasztott témákat és a megadott kiegészítést mentjük a visszajelzéséhez/);
  assert.match(src, /Ebből nem jön létre automatikusan feladat vagy fejlesztési kezdeményezés/);
  assert.match(src, /busy \? 'Mentés…' : 'Mentés és folytatás'/);
  assert.doesNotMatch(src, /'Mutassa a következő lépést'/);
});
