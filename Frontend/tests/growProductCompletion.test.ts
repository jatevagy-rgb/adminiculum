/**
 * GROW product completion — source-contract regression test.
 *
 * Locks the repaired frontend↔backend API shapes and the completed
 * sufficiency/provenance taxonomies so they cannot silently regress.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

test('growApi uses the canonical runResearch response shape', () => {
  const src = read('Frontend/src/lib/growApi.ts');
  assert.match(src, /runId: string; status: string; diagnosisCount: number; recommendationCount: number; replayed: boolean/);
  assert.doesNotMatch(src, /idempotentReplay/);
});

test('growApi uses the canonical observatory sources shape', () => {
  const src = read('Frontend/src/lib/growApi.ts');
  assert.match(src, /sourceType: string; name: string; status: string; createdAt: string/);
  assert.doesNotMatch(src, /displayName/);
});

test('growApi exposes all six sufficiency states', () => {
  const src = read('Frontend/src/lib/growApi.ts');
  for (const state of [
    'SUPPORTED',
    'NEEDS_MORE_DATA',
    'INSUFFICIENT_EVIDENCE',
    'CONFLICTING_EVIDENCE',
    'OUT_OF_SCOPE',
    'HUMAN_DOMAIN_REVIEW',
  ]) {
    assert.match(src, new RegExp(`"${state}"`));
  }
});

test('growApi exposes all six ROI provenance categories', () => {
  const src = read('Frontend/src/lib/growApi.ts');
  for (const prov of [
    'MEASURED',
    'CALCULATED',
    'CLIENT_ESTIMATE',
    'CONSULTANT_ESTIMATE',
    'RESEARCH_BENCHMARK',
    'GENERAL_ASSUMPTION',
  ]) {
    assert.match(src, new RegExp(`"${prov}"`));
  }
});

test('GrowJourney gates the research run by role and shows the results delta column', () => {
  const src = read('Frontend/src/components/clients/GrowJourney.tsx');
  assert.match(src, /canRunResearch/);
  assert.match(src, /result\.replayed/);
  assert.match(src, /Változás/);
});

test('backend intervention taxonomy defines all 13 canonical codes', () => {
  const src = read('Backend/src/modules/company-growth/research/interventions.ts');
  for (const code of [
    'STANDARDIZE_PROCESS',
    'REDESIGN_APPROVAL_ROUTING',
    'DIGITIZE_INTAKE',
    'CONSOLIDATE_SYSTEMS',
    'INTEGRATE_SYSTEMS',
    'AUTOMATE_REPETITIVE_STEP',
    'CLARIFY_PROCESS_OWNERSHIP',
    'TRAIN_DIGITAL_SKILLS',
    'ALIGN_IT_WITH_BUSINESS_GOALS',
    'IMPLEMENT_PROCESS_MEASUREMENT',
    'PHASE_DIGITAL_INVESTMENT',
    'REMOVE_NON_VALUE_ADDING_STEP',
    'REDESIGN_BEFORE_AUTOMATING',
  ]) {
    assert.match(src, new RegExp(code));
  }
});

test('additive completion migration adds the two missing sufficiency values without dropping anything', () => {
  const sql = read('Backend/prisma/migrations/20260913160000_grow_product_completion/migration.sql');
  assert.match(sql, /ALTER TYPE "SufficiencyDecision" ADD VALUE IF NOT EXISTS 'CONFLICTING_EVIDENCE'/);
  assert.match(sql, /ALTER TYPE "SufficiencyDecision" ADD VALUE IF NOT EXISTS 'HUMAN_DOMAIN_REVIEW'/);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /DROP\s+COLUMN/i);
});
