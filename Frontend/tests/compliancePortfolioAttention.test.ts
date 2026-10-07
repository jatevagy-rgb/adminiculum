import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { ComplianceCenterOverview } from '../src/lib/complianceCenterApi';
import { portfolioAttention } from '../src/lib/compliancePortfolioAttention';

const overview: ComplianceCenterOverview = {
  schemaVersion: 1, generatedAt: '2026-10-07T12:00:00Z',
  summary: { clientsWithOpenWork: 2, openFindings: 1, staleEvidence: 1, controlsNeedingReview: 1, legalSourcesReviewRequired: 0 },
  clients: [
    { clientId: 'quiet', clientName: 'Csendes', openFindings: 0, staleEvidence: 0, controlsNeedingReview: 0 },
    { clientId: 'a', clientName: 'Alfa', openFindings: 1, staleEvidence: 1, controlsNeedingReview: 0 },
    { clientId: 'b', clientName: 'Béta', openFindings: 0, staleEvidence: 0, controlsNeedingReview: 1 },
  ],
  reviewWork: [
    { kind: 'FINDING', clientId: 'a', clientName: 'Alfa', refId: 'f1', title: 'Emberi felülvizsgálat szükséges', dueAt: null },
    { kind: 'STALE_EVIDENCE', clientId: 'a', clientName: 'Alfa', refId: 'e1', title: 'Bizonyíték', dueAt: '2026-07-01T00:00:00Z' },
    { kind: 'CONTROL_REVIEW', clientId: 'b', clientName: 'Béta', refId: 'c1', title: 'Kontroll', dueAt: '2026-10-01T00:00:00Z' },
    { kind: 'FINDING', clientId: 'other', clientName: 'Más ügyfél', refId: 'f2', title: 'Nem látható', dueAt: null },
  ],
  legalSources: [],
};

test('portfolio shows only authorized clients with recorded attention, ranked by actual work rows', () => {
  const rows = portfolioAttention(overview);
  assert.deepEqual(rows.map(({ client, attentionCount }) => [client.clientId, attentionCount]), [['a', 2], ['b', 1]]);
  assert.deepEqual(rows[0].work.map((item) => item.refId), ['f1', 'e1']);
  assert.doesNotMatch(JSON.stringify(rows), /Nem látható|Más ügyfél/);
  assert.equal(portfolioAttention({ ...overview, clients: [], reviewWork: [] }).length, 0);
});

test('portfolio UI distinguishes authorized, attention and unknown active client counts without legal scoring', () => {
  const source = readFileSync(path.resolve(process.cwd(), 'src/components/compliance-center/ComplianceCenter.tsx'), 'utf8');
  assert.match(source, /label: "Jogosult ügyfelek", value: overview\.clients\.length/);
  assert.match(source, /label: "Figyelmet kérő ügyfelek", value: attentionClientsCount/);
  assert.match(source, /Az aktív ügyfelek külön száma nem része a kimutatásnak/);
  assert.match(source, /portfolioAttention\(overview\)/);
  assert.match(source, /Határidő nincs rögzítve/);
  assert.match(source, /Felelős nincs rögzítve ebben a kimutatásban/);
  assert.match(source, /Teljes jogosult ügyféllista/);
  assert.match(source, /\/clients\/\$\{encodeURIComponent\(client\.clientId\)\}\/compliance/);
  assert.doesNotMatch(source, /label: "Aktív ügyfelek"/);
});
