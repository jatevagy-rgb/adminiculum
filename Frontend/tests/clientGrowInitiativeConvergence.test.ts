/**
 * CUSTOMER-FACING GROW WITH US convergence — frontend source-contract regression.
 *
 * Locks the customer-safe initiative/project-progress view (reusing the existing
 * CompanyMilestone relation), the horizontal responsive process flow, and the
 * preserved published-opportunity boundary. Proves no internal research /
 * recommendation / workbench data reaches /portal/fejlesztes.
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
const SERVICE = 'Backend/src/modules/client-workspace/orgGrowService.ts';

test('initiative DTO exposes customer-safe milestones only', () => {
  const api = read(API);
  assert.match(api, /export type PortalGrowInitiativeMilestone/);
  assert.match(api, /milestones: PortalGrowInitiativeMilestone\[\]/);
  assert.match(api, /statusLabel: string;/);
  assert.match(api, /date: string \| null;/);
  for (const forbidden of ['createdByUserId', 'responsiblePerson', 'reviewer', 'milestoneDescription']) {
    assert.doesNotMatch(api, new RegExp(forbidden));
  }
});

test('initiative detail renders milestones, target state, target date and related outcomes', () => {
  const src = read(VIEW);
  assert.match(src, /data-testid="grow-initiative-detail"/);
  assert.match(src, /data-testid="grow-initiative-detail-milestones"/);
  assert.match(src, /data-testid="grow-initiative-milestone"/);
  assert.match(src, /data-testid="grow-initiative-detail-title"/);
  assert.match(src, /data-testid="grow-initiative-detail-back"/);
  assert.match(src, /Mérföldkövek/);
  assert.match(src, /teljesítve/);
  assert.match(src, /activeInitiative\.targetState/);
  assert.match(src, /activeInitiative\.targetAt/);
  assert.match(src, /activeInitiative\.milestones/);
  assert.match(src, /relatedOutcomes/);
  // Honest empty state when an initiative has no milestones.
  assert.match(src, /Ehhez a kezdeményezéshez még nincsenek mérföldkövek rögzítve\./);
});

test('initiative list keeps detail navigation and milestone progress', () => {
  const src = read(VIEW);
  assert.match(src, /handleSelectInitiative/);
  assert.match(src, /handleBackToInitiatives/);
  assert.match(src, /url\.searchParams\.set\("initiative",/);
  assert.match(src, /url\.searchParams\.delete\("initiative"\)/);
  assert.ok(src.includes('grow-initiative-milestones-'));
});

test('process tab renders a horizontal, responsive customer-safe flow', () => {
  const src = read(VIEW);
  assert.ok(src.includes('grow-process-flow-'));
  assert.ok(src.includes('grow-process-step-'));
  assert.match(src, /overflow-x-auto/);
  assert.match(src, /Jóváhagyási kapu/);
  assert.match(src, /Rendszer:/);
  assert.match(src, /step\.systemName/);
  assert.match(src, /step\.systemCategory/);
});

test('GROW_CUSTOMER_SAFE_BOUNDARY=PASS — no internal research/recommendation data in the portal view', () => {
  const src = read(VIEW);
  for (const forbidden of [
    'RecommendationCandidate',
    'DiagnosisCandidate',
    'ResearchEvidence',
    'Új mérési és kutatási futás',
    'Bejelentés rögzítése',
    'createdByUserId',
    'responsiblePerson',
    'internalNote',
    'reviewNote',
    'ASSUMED',
    'evidenceStrength',
  ]) {
    assert.doesNotMatch(src, new RegExp(forbidden));
  }
});

test('PUBLISHED_OPPORTUNITY_BOUNDARY_PRESERVED=PASS', () => {
  const src = read(VIEW);
  assert.match(src, /data-testid="grow-opportunities-section"/);
  assert.match(src, /Közzétett lehetőségek/);
  assert.match(src, /data\?\.opportunities/);
  assert.match(src, /opportunitiesDeferredNotice/);
  // No internal accept/reject/research controls on the customer opportunity surface.
  assert.doesNotMatch(src, /Elfogadás|Elutasítás|acceptOpportunity|rejectOpportunity/);
});

test('OUTCOME_BASIS_DISTINCTION_PRESERVED=PASS', () => {
  const src = read(VIEW);
  assert.match(src, /Mért eredmények/);
  assert.match(src, /Számított \/ becsült eredmények/);
  assert.match(src, /Mért eredményként csak MEASURED alapú eredmény jelenik meg/);
});

test('milestone source reuses the existing CompanyMilestone relation only', () => {
  const service = read(SERVICE);
  assert.ok(service.includes('milestones: {'));
  assert.ok(service.includes('MILESTONE_STATUS_LABELS'));
  assert.doesNotMatch(service, /responsiblePerson/);
  assert.doesNotMatch(service, /recommendationCandidate/);
  assert.doesNotMatch(service, /researchEvidence/);
});
