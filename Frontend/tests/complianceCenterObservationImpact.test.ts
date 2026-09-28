import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * W3B — observation-specific legal-source impact from the W3C-A review queue.
 *
 * Proves the impact entry point is explicit (never auto-fetched), exists only
 * for IMPACT_CONFIRMED, calls the locked observation impact endpoint, renders
 * the SAME shared LegalSourceImpactView as the C4C registry panel, and maps the
 * locked 404/409/422 failures truthfully without inventing an empty impact or an
 * automatic compliance conclusion.
 */

const frontendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readSrc = (relative: string): string => readFileSync(path.join(frontendRoot, relative), 'utf8');

const panelSource = readSrc('src/components/compliance-center/LegalSourceObservationReviewPanel.tsx');
const impactPanelSource = readSrc('src/components/compliance-center/LegalSourceImpactPanel.tsx');
const centerClientSource = readSrc('src/lib/complianceCenterApi.ts');

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

test('the impact action exists only for IMPACT_CONFIRMED; all other review statuses stay hidden', () => {
  assert.ok(panelSource.includes('const canOpenImpact = detail?.reviewStatus === "IMPACT_CONFIRMED";'));
  assert.equal(count(panelSource, '{canOpenImpact ?'), 1, 'exactly one gated impact action block');
  assert.equal(
    count(panelSource, 'Hatásvizsgálat megnyitása'),
    1,
    'the impact action label must appear exactly once',
  );
  const gateIndex = panelSource.indexOf('{canOpenImpact ?');
  const errorIndex = panelSource.indexOf('{impactError ?');
  const buttonIndex = panelSource.indexOf('Hatásvizsgálat megnyitása');
  assert.ok(
    gateIndex >= 0 && errorIndex > gateIndex && buttonIndex > gateIndex && buttonIndex < errorIndex,
    'the impact button must live inside the canOpenImpact gate',
  );
});

test('the impact projection is not fetched on selection or mount, only through the explicit action', () => {
  assert.equal(
    count(panelSource, 'getLegalSourceObservationImpact'),
    1,
    'exactly one explicit impact call site',
  );
  const openDetailIndex = panelSource.indexOf('const openDetail');
  const refreshIndex = panelSource.indexOf('const refreshSelectedDetail');
  assert.ok(openDetailIndex >= 0 && refreshIndex > openDetailIndex);
  assert.ok(
    !panelSource.slice(openDetailIndex, refreshIndex).includes('getLegalSourceObservationImpact'),
    'selecting a row must not fetch the impact projection',
  );
  const handlerIndex = panelSource.indexOf('const openImpact = () => {');
  const callIndex = panelSource.indexOf('getLegalSourceObservationImpact');
  assert.ok(handlerIndex >= 0 && callIndex > handlerIndex, 'the only fetch lives in the explicit open action');
  assert.ok(panelSource.includes('onClick={openImpact}'), 'the fetch is reachable through an explicit button');
});

test('the button calls the exact observation impact endpoint through the typed client', () => {
  assert.ok(panelSource.includes('getLegalSourceObservationImpact(selectedId)'));
  assert.ok(
    centerClientSource.includes('`/compliance/legal-source-observations/${encodeURIComponent(id)}/impact`'),
    'the locked W3B endpoint must be called',
  );
  assert.ok(centerClientSource.includes('getLegalSourceObservationImpact(id: string)'));
  assert.equal(count(centerClientSource, '/impact'), 1, 'exactly one impact endpoint exists in the client');
});

test('the observation flow renders the SAME shared impact view as the registry panel', () => {
  assert.ok(impactPanelSource.includes('export function LegalSourceImpactView('));
  assert.equal(
    count(impactPanelSource, 'Nincs pontosan hivatkozott dokumentumverzió ehhez a jogforráshoz.'),
    1,
    'the rendering tree exists once',
  );
  assert.ok(impactPanelSource.includes('<LegalSourceImpactView impact={impact} onReload={load} />'));
  assert.ok(panelSource.includes('<LegalSourceImpactView impact={impact} onReload={openImpact} />'));
  assert.equal(count(panelSource, 'Érintett dokumentumok'), 0, 'the observation panel must not duplicate the tree');
  assert.equal(count(panelSource, 'Érintett követelmények'), 0);
});

test('a failed impact request is never rendered as an empty projection', () => {
  const blockIndex = panelSource.indexOf('{canOpenImpact && impactRequested ?');
  const viewIndex = panelSource.indexOf('<LegalSourceImpactView');
  assert.ok(blockIndex >= 0 && viewIndex > blockIndex);
  const block = panelSource.slice(blockIndex, viewIndex);
  assert.ok(block.includes('impactLoading ?'), 'the loading state renders before any projection');
  assert.ok(block.includes('impact ? ('), 'the shared view renders only from a successful projection');
  assert.ok(panelSource.includes('{impactError ?'), 'errors render separately from the projection');
});

test('409 stale review state refreshes the selected detail without automatic retry', () => {
  const staleIndex = panelSource.indexOf('OBSERVATION_IMPACT_NOT_CONFIRMED');
  const ambiguousIndex = panelSource.indexOf('OBSERVATION_IMPACT_VERSION_AMBIGUOUS');
  assert.ok(staleIndex >= 0 && ambiguousIndex > staleIndex);
  const staleBlock = panelSource.slice(staleIndex, ambiguousIndex);
  assert.ok(staleBlock.includes('refreshSelectedDetail(selectedId)'), 'stale review state must refresh the detail');
  assert.ok(
    !staleBlock.includes('getLegalSourceObservationImpact'),
    'stale review state must not retry the impact call automatically',
  );
});

test('404 refreshes the queue truthfully and clears the stale selection', () => {
  const start = panelSource.indexOf('const handleImpactError');
  const end = panelSource.indexOf('const openImpact');
  assert.ok(start >= 0 && end > start);
  const handler = panelSource.slice(start, end);
  assert.ok(handler.includes('status === 404'));
  assert.ok(handler.includes('void loadPage(0)'));
  assert.ok(handler.includes('setSelectedId(null)'));
});

test('ambiguous and unavailable runtime states show the exact truthful Hungarian messages', () => {
  const ambiguousMessage =
    'A hatásvizsgálat nem indítható egyértelműen, mert több aktuális jogforrás-verzió található.';
  const unavailableMessage =
    'A hatásvizsgálathoz szükséges pontos jogforrás-verzió jelenleg nem áll rendelkezésre.';
  assert.equal(count(panelSource, ambiguousMessage), 1);
  assert.equal(count(panelSource, unavailableMessage), 1);

  const ambiguousIndex = panelSource.indexOf('OBSERVATION_IMPACT_VERSION_AMBIGUOUS');
  const unavailableIndex = panelSource.indexOf('OBSERVATION_IMPACT_VERSION_UNAVAILABLE');
  assert.ok(ambiguousIndex >= 0 && unavailableIndex > ambiguousIndex);
  assert.ok(panelSource.slice(ambiguousIndex, unavailableIndex).includes(ambiguousMessage));
  assert.ok(panelSource.slice(unavailableIndex).includes(unavailableMessage));
});

test('existing LegalSourceImpactPanel behavior is preserved through the shared view', () => {
  assert.ok(
    impactPanelSource.includes('export function LegalSourceImpactPanel({ legalSourceVersionId }'),
    'the existing panel entry point must remain',
  );
  assert.ok(impactPanelSource.includes('complianceIntelligenceApi'));
  assert.ok(impactPanelSource.includes('.legalSourceImpact(legalSourceVersionId)'));
  assert.ok(impactPanelSource.includes('Hatásvizsgálat betöltése…'));
  assert.ok(
    impactPanelSource.includes(
      '<SafePanelError onRetry={load} detail={error ?? "A hatásvizsgálat nem érhető el."} />',
    ),
  );
  assert.ok(impactPanelSource.includes('<LegalSourceImpactView impact={impact} onReload={load} />'));
});

test('semantic safety is preserved: review signal only, no automatic compliance conclusion', () => {
  assert.ok(
    impactPanelSource.includes(
      'A jogforrás-változás felülvizsgálati kötelezettséget jelez; nem állít automatikus meg nem felelést.',
    ),
    'the impact renderer disclaimer must remain',
  );
  assert.ok(
    panelSource.includes(
      'A forrásváltozás további hatásvizsgálatot igényel. Ez önmagában nem jelent ügyféloldali meg nem felelést.',
    ),
    'the safe IMPACT_CONFIRMED copy must remain next to the impact action',
  );
  for (const forbidden of ['Jogsértés', 'jogsértés', 'ügyfél hibás', 'meg nem felelő', 'nem felel meg']) {
    assert.ok(!panelSource.includes(forbidden), `forbidden compliance claim in observation panel: ${forbidden}`);
    assert.ok(!impactPanelSource.includes(forbidden), `forbidden compliance claim in impact view: ${forbidden}`);
  }
});
