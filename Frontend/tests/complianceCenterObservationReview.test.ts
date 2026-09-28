import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEGAL_SOURCE_OBSERVATION_DECISIONS,
  LEGAL_SOURCE_OBSERVATION_KINDS,
  LEGAL_SOURCE_OBSERVATION_REVIEW_STATUSES,
  buildLegalSourceObservationListQuery,
} from '../src/lib/complianceCenterApi';
import { hasMoreObservationPages } from '../src/components/compliance-center/LegalSourceObservationReviewPanel';

/**
 * W3C-A — Compliance Center review UI for legal-source observations.
 *
 * Proves the locked W3A contract is consumed from the existing
 * Jogforrás-változások tab: human review lifecycle, safe Hungarian review
 * labels, no internal capture provenance rendered, and the existing Compliance
 * Center surfaces preserved. The explicit W3B observation-impact entry point is
 * covered by complianceCenterObservationImpact.test.ts.
 */

const frontendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readSrc = (relative: string): string => readFileSync(path.join(frontendRoot, relative), 'utf8');

const panelSource = readSrc('src/components/compliance-center/LegalSourceObservationReviewPanel.tsx');
const centerSource = readSrc('src/components/compliance-center/ComplianceCenter.tsx');
const trackedLegislationPanelSource = readSrc('src/components/compliance-center/TrackedLegislationPanel.tsx');
const clientSource = readSrc('src/lib/complianceCenterApi.ts');

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

test('the W3A list query builder serializes only the locked filters', () => {
  assert.equal(buildLegalSourceObservationListQuery(), '');
  assert.equal(buildLegalSourceObservationListQuery({ sourceIdentifier: '   ' }), '');
  assert.equal(
    buildLegalSourceObservationListQuery({
      reviewStatus: 'NEW',
      kind: 'AMENDMENT_PUBLISHED',
      sourceIdentifier: ' 32016R0679 ',
      limit: 25,
      offset: 50,
    }),
    '?reviewStatus=NEW&kind=AMENDMENT_PUBLISHED&sourceIdentifier=32016R0679&limit=25&offset=50',
  );
});

test('the W3A review states, kinds and decisions match the locked lifecycle', () => {
  assert.deepEqual(
    [...LEGAL_SOURCE_OBSERVATION_REVIEW_STATUSES],
    ['NEW', 'IN_REVIEW', 'NO_IMPACT', 'IMPACT_CONFIRMED', 'REJECTED'],
  );
  assert.deepEqual([...LEGAL_SOURCE_OBSERVATION_DECISIONS], ['NO_IMPACT', 'IMPACT_CONFIRMED', 'REJECTED']);
  assert.deepEqual(
    [...LEGAL_SOURCE_OBSERVATION_KINDS],
    ['AMENDMENT_PUBLISHED', 'CONSOLIDATED_VERSION_AVAILABLE'],
  );
});

test('the API client calls the locked W3A endpoints', () => {
  for (const endpoint of [
    '/compliance/legal-source-observations${buildLegalSourceObservationListQuery(params)}',
    '/compliance/legal-source-observations/${encodeURIComponent(id)}',
    '/compliance/legal-source-observations/${encodeURIComponent(id)}/start-review',
    '/compliance/legal-source-observations/${encodeURIComponent(id)}/decision',
  ]) {
    assert.ok(clientSource.includes(endpoint), `missing W3A endpoint: ${endpoint}`);
  }
  assert.ok(clientSource.includes('{ decision, note: trimmedNote }'), 'decision body must carry decision + note');
});

test('the queue section uses the required Hungarian labels and the shared DataTable', () => {
  assert.ok(panelSource.includes('Beérkezett jogforrás-változások'));
  assert.ok(panelSource.includes('<DataTable'), 'the queue must reuse the existing DataTable');
  for (const header of [
    'Állapot',
    'Esemény',
    'Jogforrás',
    'Kapcsolódó azonosító',
    'Észlelve',
    'Beérkezett',
    'Felülvizsgáló',
    'Művelet',
  ]) {
    assert.ok(panelSource.includes(header), `missing queue header: ${header}`);
  }
  for (const label of [
    'Új',
    'Felülvizsgálat alatt',
    'Nincs további hatásvizsgálat',
    'Hatásvizsgálat szükséges',
    'Elutasítva',
  ]) {
    assert.ok(panelSource.includes(label), `missing review status label: ${label}`);
  }
});

test('the queue selects a row through an explicit keyboard-accessible button', () => {
  assert.ok(panelSource.includes('aria-pressed={selectedId === item.id}'));
  assert.ok(panelSource.includes('Megnyitás'));
  assert.ok(!/<tr[^>]*onClick/.test(panelSource), 'row selection must not rely on a clickable <tr>');
});

test('the panel starts review from NEW and exposes exactly the three IN_REVIEW decisions', () => {
  assert.equal(count(panelSource, 'startLegalSourceObservationReview'), 1);
  assert.equal(count(panelSource, 'decideLegalSourceObservationReview'), 1);
  assert.ok(panelSource.includes('const canStartReview = detail?.reviewStatus === "NEW";'));
  assert.ok(panelSource.includes('const canDecide = detail?.reviewStatus === "IN_REVIEW";'));

  const startBlockIndex = panelSource.indexOf('{canStartReview ?');
  const decideBlockIndex = panelSource.indexOf('{canDecide ?');
  const terminalIndex = panelSource.indexOf('{terminalCopy ?');
  assert.ok(startBlockIndex >= 0 && decideBlockIndex > startBlockIndex && terminalIndex > decideBlockIndex);

  const startBlock = panelSource.slice(startBlockIndex, decideBlockIndex);
  assert.ok(startBlock.includes('Felülvizsgálat megkezdése'));
  assert.ok(!startBlock.includes('submitDecision('), 'NEW must not expose terminal decisions');

  const decideBlock = panelSource.slice(decideBlockIndex, terminalIndex);
  assert.ok(decideBlock.includes('submitDecision("NO_IMPACT")'), 'missing IN_REVIEW decision: NO_IMPACT');
  assert.ok(decideBlock.includes('submitDecision("IMPACT_CONFIRMED")'), 'missing IN_REVIEW decision: IMPACT_CONFIRMED');
  assert.ok(decideBlock.includes('setConfirmRejectOpen(true)'), 'the reject confirmation must open from IN_REVIEW');
  assert.equal(count(decideBlock, 'submitDecision("'), 2, 'IN_REVIEW exposes two direct decisions plus one confirmed reject');
  assert.equal(count(panelSource, 'submitDecision("'), 3, 'exactly three terminal decisions exist in the file');
  assert.ok(decideBlock.includes('maxLength={2000}'), 'the decision note must be capped at 2000 characters');
  assert.ok(decideBlock.includes('Elutasítás'));
});

test('terminal decisions are never rendered outside the IN_REVIEW block', () => {
  const decideBlockIndex = panelSource.indexOf('{canDecide ?');
  const terminalIndex = panelSource.indexOf('{terminalCopy ?');
  const before = panelSource.slice(0, decideBlockIndex);
  const decideBlock = panelSource.slice(decideBlockIndex, terminalIndex);
  const dialogIndex = panelSource.indexOf('<ConfirmationDialog');
  const dialog = panelSource.slice(dialogIndex);

  assert.equal(count(before, 'submitDecision('), 0, 'no decision may be exposed before IN_REVIEW');
  assert.equal(count(decideBlock, 'submitDecision("NO_IMPACT")'), 1);
  assert.equal(count(decideBlock, 'submitDecision("IMPACT_CONFIRMED")'), 1);
  assert.equal(count(decideBlock, 'setConfirmRejectOpen(true)'), 1, 'reject is only reachable from IN_REVIEW');
  assert.ok(dialogIndex > terminalIndex, 'the reject confirmation must live outside the terminal copy block');
  assert.equal(count(dialog, 'submitDecision("REJECTED")'), 1);
  assert.equal(
    count(panelSource.slice(0, dialogIndex), 'submitDecision("REJECTED")'),
    0,
    'the reject decision only fires from its confirmation',
  );
});

test('terminal state copy is safe and never claims noncompliance', () => {
  assert.ok(
    panelSource.includes(
      'A forrásváltozás további hatásvizsgálatot igényel. Ez önmagában nem jelent ügyféloldali meg nem felelést.',
    ),
  );
  assert.ok(
    panelSource.includes(
      'A jogforrás-esemény emberi felülvizsgálata alapján nincs szükség további hatásvizsgálatra.',
    ),
  );
  assert.ok(
    panelSource.includes(
      'Az esemény a felülvizsgálati folyamatban elutasításra került. Az eredeti megfigyelési adat megmarad.',
    ),
  );
  for (const forbidden of ['Jogsértés', 'jogsértés', 'ügyfél hibás', 'meg nem felelő', 'nem felel meg']) {
    assert.ok(!panelSource.includes(forbidden), `forbidden compliance claim: ${forbidden}`);
  }
});

test('the review UI never renders internal capture provenance', () => {
  for (const token of ['payloadDigest', 'evidenceSha256', 'queryProvenance', 'sourceSha256']) {
    assert.ok(!panelSource.includes(token), `internal provenance token leaked: ${token}`);
  }
});

test('the review UI calls the typed client, never raw observation endpoints', () => {
  assert.equal(count(panelSource, 'observations/'), 0, 'panel must call the typed client, not raw endpoints');
});

test('ComplianceCenter mounts the queue above the registry and preserves existing surfaces', () => {
  const panelIndex = centerSource.indexOf('<LegalSourceObservationReviewPanel />');
  const registryIndex = centerSource.indexOf('Jogforrás-nyilvántartás');
  assert.ok(panelIndex >= 0, 'panel must be mounted');
  assert.ok(registryIndex > panelIndex, 'the queue must sit above the existing legal-source registry');

  for (const tab of ['Áttekintés', 'Jogforrás-változások', 'Dokumentumok', 'Felülvizsgálati munka']) {
    assert.ok(centerSource.includes(tab), `existing tab lost: ${tab}`);
  }
  assert.ok(centerSource.includes('<TrackedLegislationPanel'), 'the tracked-legislation (monitoring manifest) surface must remain mounted');
  assert.ok(
    trackedLegislationPanelSource.includes('Külső jogforrás-figyelést ez a felület nem végez.'),
    'the truthful no-continuous-monitoring boundary must remain visible',
  );
  assert.ok(centerSource.includes('<LegalSourceImpactPanel'), 'the existing impact panel must remain mounted');
  assert.ok(centerSource.includes('Jogforrás-nyilvántartás'));
});

test('load-more is gated by the accumulated rendered population, not the raw offset', () => {
  assert.ok(
    panelSource.includes('const hasMore = hasMoreObservationPages(items.length, total);'),
    'hasMore must derive from the accumulated items length',
  );
  assert.ok(
    !panelSource.includes('offset + items.length'),
    'hasMore must not re-count already loaded pages',
  );
  assert.ok(panelSource.includes('{hasMore ? ('), 'the load-more control must be gated by hasMore');
  assert.ok(panelSource.includes('Továbbiak betöltése'));
});

test('total=60: after two 25-row pages the load-more stays available until the final 10 rows load', () => {
  const pageSizes = [25, 25, 10];
  let loaded = 0;

  loaded += pageSizes[0];
  assert.equal(loaded, 25);
  assert.equal(hasMoreObservationPages(loaded, 60), true, 'page 1 of 3 must offer load-more');

  loaded += pageSizes[1];
  assert.equal(loaded, 50);
  assert.equal(
    hasMoreObservationPages(loaded, 60),
    true,
    'after page 2 the final 10 records must remain reachable',
  );

  loaded += pageSizes[2];
  assert.equal(loaded, 60);
  assert.equal(
    hasMoreObservationPages(loaded, 60),
    false,
    'after page 3 the load-more button must disappear',
  );
});

test('total=50: an exact multiple of the page size hides the load-more after two pages', () => {
  let loaded = 0;

  loaded += 25;
  assert.equal(hasMoreObservationPages(loaded, 50), true, 'page 1 of 2 must offer load-more');

  loaded += 25;
  assert.equal(loaded, 50);
  assert.equal(
    hasMoreObservationPages(loaded, 50),
    false,
    'no further records exist, so no further button is shown',
  );
});
