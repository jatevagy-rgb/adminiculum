/**
 * GROW WORKFORCE LIFECYCLE — source-contract regression.
 *
 * Locks the walkable workforce journey around the EXISTING customer publication
 * contract:
 *   discovery -> analysis -> recommendation -> human review -> opportunity ->
 *   optional customer publication -> initiative -> milestones -> outcome.
 *
 * Proves the UI reuses the canonical publication model (no second engine), keeps
 * human review explicit, keeps ASSUMED out of achieved results, and never
 * presents synthetic data as a real business result.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

const API = 'Frontend/src/lib/growApi.ts';
const JOURNEY = 'Frontend/src/components/clients/GrowJourney.tsx';

test('growApi reuses the existing opportunity publication routes', () => {
  const src = read(API);
  assert.match(src, /\/grow\/opportunity-publications/);
  assert.match(src, /\/publications/);
  assert.match(src, /transitionOpportunityPublication/);
  assert.match(src, /listOpportunityPublicationWorkspaces/);
  assert.match(src, /createOpportunityPublicationDraft/);
  assert.match(src, /clientSafeTitle/);
  assert.match(src, /clientSafeSummary/);
});

test('no second publication model and no raw customer visibility flag is invented', () => {
  const src = read(API) + read(JOURNEY);
  for (const forbidden of [
    'publishedToClient',
    'customerVisible',
    'portalVisible',
    'ClientMatterPublication',
    'ClientDocumentPublication',
  ]) {
    assert.doesNotMatch(src, new RegExp(forbidden));
  }
});

test('reviewed recommendations stay reachable after the human decision', () => {
  const api = read(API);
  const src = read(JOURNEY);
  assert.match(api, /listOpportunities\(clientId: string, status\?:/);
  assert.match(src, /growApi\.listOpportunities\(clientId, "ACCEPTED"\)/);
  assert.match(src, /onOpenDetail\(o\.id\)/);
  assert.match(src, /data-testid="accepted-opportunities"/);
  // The open detail is re-read after a decision/handoff instead of trusting the
  // stale pre-decision DTO.
  assert.match(src, /const refreshDetail = useCallback/);
  assert.match(src, /await onRefreshDetail\(\)/);
});

test('human review stays explicit and only ACCEPT creates the internal opportunity', () => {
  const src = read(JOURNEY);
  assert.match(src, /reviewOpportunity\(clientId, detail\.id, decision/);
  assert.match(src, /"ACCEPT" \| "DECLINE" \| "REQUEST_MORE_INFO"/);
  assert.match(src, /decide\("ACCEPT"\)/);
  assert.match(src, /decide\("DECLINE"\)/);
  assert.match(src, /decide\("REQUEST_MORE_INFO"\)/);
  // Initiative handoff remains a separate explicit action.
  assert.match(src, /startInitiative/);
  assert.match(src, /Kezdeményezés indítása/);
  // ACCEPT must never auto-create an initiative or publication.
  assert.doesNotMatch(src, /reviewOpportunity[\s\S]{0,240}startInitiativeFromOpportunity/);
});

test('publication is explicit, approved and revocable from the workforce journey', () => {
  const src = read(JOURNEY);
  assert.match(src, /transition\(publication, "submit"\)/);
  assert.match(src, /transition\(publication, "approve"\)/);
  assert.match(src, /transition\(publication, "publish"\)/);
  assert.match(src, /transition\(publication, "revoke"\)/);
  assert.match(src, /Az előkészítés nem tesz közzé semmit/);
  assert.match(src, /PUBLISHER_ROLES|közzétételi jogosultság/);
  assert.match(src, /canPublishOpportunities/);
});

test('evidence basis categories stay distinct (measured vs declared vs research)', () => {
  const api = read(API);
  const src = read(JOURNEY);
  assert.match(api, /MEASURED_COMPANY/);
  assert.match(api, /DECLARED_COMPANY/);
  assert.match(api, /RESEARCH/);
  assert.match(src, /evidenceBasisLabelHu/);
  assert.match(src, /evidence-basis-summary/);
  assert.match(src, /kutatási háttér alátámasztó kontextus/i);
  assert.match(src, /diagnosis\?\.sourceRefs/);
  assert.match(src, /sourceRefs\?\.snapshotIds/);
  assert.match(src, /sourceRefs\?\.observationIds/);
});

test('initiative cockpit shows milestones, next step and related outcomes', () => {
  const src = read(JOURNEY);
  assert.match(src, /data-testid="initiative-cockpit"/);
  assert.match(src, /companyMilestoneStatusLabel/);
  assert.match(src, /Mérföldkövek/);
  assert.match(src, /Következő mérföldkő/);
  assert.match(src, /Kapcsolódó lehetőség/);
  assert.match(src, /Kapcsolódó eredmények/);
  // Missing canonical values are omitted, never inferred from Task assignees.
  assert.match(src, /Nincs adat\./);
});

test('ASSUMED is never presented as an achieved result', () => {
  const src = read(JOURNEY);
  assert.match(src, /Feltételezés — nem elért eredmény/);
  assert.match(src, /Nem mért vagy számított eredmények/);
  assert.match(src, /o\.basis === "ASSUMED"/);
  // The achieved list is built only from MEASURED / CALCULATED / ESTIMATED.
  assert.match(src, /o\.basis === "MEASURED"/);
  assert.match(src, /o\.basis === "CALCULATED" \|\| o\.basis === "ESTIMATED"/);
  assert.match(src, /o\.basis !== "ASSUMED"/);
});

test('outcomes without before/after data show an honest empty state, no invented delta', () => {
  const src = read(JOURNEY);
  assert.match(src, /Nincs mérési adat\./);
  assert.match(src, /outcome\.metricsSummary\?\.before \?/);
  // No fabricated percentage/score wording anywhere in the journey.
  assert.doesNotMatch(src, /%\-os javulás|százalékos javulás|maturityScore|fake|mock/i);
});

test('synthetic data is labelled and never claimed as a real business result', () => {
  const src = read(JOURNEY);
  assert.match(src, /Szintetikus tesztadat — nem valós üzleti eredmény/);
});
