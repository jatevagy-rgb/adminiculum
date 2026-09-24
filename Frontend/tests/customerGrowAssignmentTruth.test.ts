/**
 * CUSTOMER GROW — assignment-truth regression.
 *
 * The backend assessment catalogue exposes ONLY availability/completion state
 * (NOT_STARTED / COMPLETED). There is no assignment/request signal in the DTO.
 * A brand-new workspace legitimately receives every pack as NOT_STARTED without
 * the office requesting anything.
 *
 * This test proves the customer Grow surface never derives office-assigned
 * customer work from assessment availability:
 *   A. NOT_STARTED is never rendered as assigned/requested/"Nyitott teendők".
 *   B. NOT_STARTED packs stay reachable and usable as available assessments.
 *   C. The Teendők tab has no numeric badge derived from NOT_STARTED packs.
 *   D. Completed vs not-completed catalogue functionality remains intact.
 *   E. Survey/input remains available.
 *   F. The canonical 6-tab IA and legacy mapping are unchanged.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

const VIEW = 'Frontend/src/components/client-portal/OrgGrowView.tsx';
const API = 'Frontend/src/lib/clientPortalApi.ts';

test('A. NOT_STARTED is never interpreted as office-assigned customer work', () => {
  const src = read(VIEW);
  // No assignment/request vocabulary anywhere on the surface.
  for (const forbidden of ['Nyitott teend', 'adatkérés', 'kijelölt', 'assigned', 'assignment', 'hozzárendel']) {
    assert.doesNotMatch(src, new RegExp(forbidden, 'i'), `assignment semantics leaked: ${forbidden}`);
  }
  // The overview instead frames packs as available optional inputs.
  assert.match(src, /eyebrow="Adatmegadás"/);
  assert.match(src, /title="Felmérések és jelzések"/);
  assert.match(src, /\$\{uncompletedPacksCount\} elérhető felmérés segíthet a működés pontosításában\./);
  assert.match(src, /Minden elérhető felmérés kitöltve\. Új működési jelzést továbbra is küldhet\./);
  assert.match(src, /Jelenleg nincs elérhető felmérés\. Működési jelzést továbbra is küldhet\./);
  // The DTO carries no assignment field to (mis)read in the first place.
  const api = read(API);
  assert.match(api, /status: 'NOT_STARTED' \| 'COMPLETED'/);
  assert.doesNotMatch(api, /assignedTo|assignmentId|requestedBy/);
});

test('B. NOT_STARTED packs remain reachable and usable as available assessments', () => {
  const src = read(VIEW);
  // The catalogue lists every pack (status only filters, never hides availability).
  assert.match(src, /const filteredPacks = packs\.filter/);
  assert.match(src, /if \(assessmentFilter === "uncompleted"\) return p\.status !== "COMPLETED";/);
  assert.match(src, /filteredPacks\.map\(/);
  // A not-started pack is labelled as available / not yet completed.
  assert.match(src, /pack\.status === "COMPLETED" \? "Kitöltve" : "Még nincs kitöltve"/);
  assert.match(src, /pack\.status === "COMPLETED" \? "Kitöltve" : "Elérhető"/);
  // ...and it can be started from the catalogue.
  assert.match(src, /data-testid={`grow-assessment-start-\$\{pack\.packKey\}`}/);
  assert.match(src, /pack\.status === "COMPLETED" \? "Újra kitöltöm" : "Kitöltöm"/);
});

test('C. Teendők tab has no numeric badge derived from NOT_STARTED packs', () => {
  const src = read(VIEW);
  assert.match(src, /\{ id: "teendok", label: "Teendők" \},/);
  assert.doesNotMatch(src, /id: "teendok", label: "Teendők", count/);
  // The count is not smuggled in through any other Teendők nav entry.
  assert.doesNotMatch(src, /teendok[^\n]*count:\s*uncompletedPacksCount/);
});

test('D. Completed vs not-completed catalogue functionality remains intact', () => {
  const src = read(VIEW);
  assert.match(src, /if \(assessmentFilter === "completed"\) return p\.status === "COMPLETED";/);
  assert.match(src, /\{ id: "all", label: `Összes \(\$\{packs\.length\}\)` \}/);
  assert.match(src, /\{ id: "uncompleted", label: `Még nincs kitöltve \(\$\{uncompletedPacksCount\}\)` \}/);
  assert.match(src, /\{ id: "completed", label: `Befejezett \(\$\{completedPacksCount\}\)` \}/);
  // Completed result + retake actions survive.
  assert.match(src, /data-testid={`grow-assessment-result-\$\{pack\.packKey\}`}/);
  assert.match(src, /Újra kitöltöm/);
  assert.match(src, /data-testid="grow-assessment-result-unavailable"/);
});

test('E. Survey/operational input remains available', () => {
  const src = read(VIEW);
  assert.match(src, /data-testid="grow-feltaras-section"/);
  assert.match(src, /submitPortalGrowSurvey/);
  assert.match(src, /SURVEY_CATEGORY_LABELS_HU/);
  assert.match(src, /Hol érdemes javítani\?/);
});

test('F. Canonical 6-tab IA and legacy mapping are unchanged', () => {
  const src = read(VIEW);
  for (const id of ['attekintes', 'teendok', 'fejlesztesi-iranyok', 'kezdemenyezesek', 'eredmenyek', 'mukodes']) {
    assert.match(src, new RegExp(`activeTab === "${id}"`));
    assert.match(src, new RegExp(`id: "${id}"`));
  }
  assert.match(src, /felmeresek: "teendok"/);
  assert.match(src, /folyamatok: "mukodes"/);
  assert.match(src, /lehetosegek: "fejlesztesi-iranyok"/);
});
