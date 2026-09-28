import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Customer portal case progress strip (source contract).
 *
 * The strip on the customer matter detail may only render:
 *  - steps from the immutable published milestone snapshot (`matter.milestones`),
 *  - a fill from the canonical published `progressPercentage` of the organization
 *    case detail DTO (stored on the published matter revision, computed from
 *    published milestone weights at publish time) — never locally inferred.
 *
 * Internal workflow events, task state, anonymization internals and unpublished
 * data must never reach this surface. Zero/empty published progress stays honest.
 */

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const strip = () => {
  const src = read('src/components/client-portal/MatterWorkspace.tsx');
  const start = src.indexOf('function PublishedProgressStrip');
  const end = src.indexOf('function MatterProgressSection');
  assert.ok(start > -1 && end > start, 'PublishedProgressStrip not found');
  return src.slice(start, end);
};

describe('client portal case progress strip (source contract)', () => {
  it('renders steps only from the published milestone snapshot', () => {
    const src = strip();
    assert.match(src, /const ordered = \(milestones \?\? \[\]\)\.slice\(\)\.sort\(\(a, b\) => a\.displayOrder - b\.displayOrder\)/);
    assert.match(src, /ordered\.map\(\(milestone, index\)/);
    const maps = src.match(/ordered\.map/g) || [];
    assert.equal(maps.length, 1, 'the strip must not synthesize stages beyond the published snapshot');
    assert.doesNotMatch(src, /stages\s*=|stageLabels\s*=|Array\.from\(|\[0\]\.\.\./);
  });

  it('drives the fill only from the canonical published progressPercentage', () => {
    const src = strip();
    assert.match(src, /const percent = typeof progressPercentage === 'number' \? progressPercentage : null/);
    assert.match(src, /\{percent !== null \? \(/);
    assert.doesNotMatch(src, /Number\.isFinite|\.reduce\(|Math\.round|Math\.floor|completed\s*\/\s*total|\/\s*ordered\.length/);
  });

  it('exposes no internal workflow state on the strip', () => {
    const src = strip();
    assert.doesNotMatch(src, /taskNotes|workInstruction|internalNotes|aiPrompt|activityFeed|auditEvent|sourceTaskId|taskId|workflowStep|internalStatus|statusLog|annotation/i);
  });

  it('stays truthful on zero and empty published progress', () => {
    const src = strip();
    assert.match(src, /if \(!ordered\.length\) return null/);
    const matter = read('src/components/client-portal/MatterWorkspace.tsx');
    assert.match(matter, /Az iroda hamarosan közzéteszi az ügy mérföldköveit\./);
  });

  it('claims completion only when every published milestone is COMPLETED', () => {
    const src = strip();
    assert.match(src, /ordered\.every\(\(milestone\) => milestone\.state === 'COMPLETED'\)/);
    assert.match(src, /Minden közzétett mérföldkő teljesült\./);
    assert.match(src, /current \? `Jelenlegi állomás: \$\{current\.title\}` : allCompleted \? 'Minden közzétett mérföldkő teljesült\.' : null/);
  });

  it('keeps the mobile variant compact and overflow-safe', () => {
    const src = strip();
    assert.match(src, /cp-progress-strip mt-5 hidden sm:flex/);
    assert.match(src, /sm:hidden/);
    assert.doesNotMatch(src, /w-\[\d+px\]|min-w-\[\d+px\]|whitespace-nowrap/);
    const shell = read('src/components/client-portal/ClientPortalShell.tsx');
    assert.match(shell, /cp-shell min-h-screen overflow-x-hidden/);
  });

  it('receives the percentage only from the canonical organization case detail DTO', () => {
    const views = read('src/components/client-portal/OrganizationPortalViews.tsx');
    assert.match(views, /publishedProgressPercentage=\{detail\.progressPercentage\}/);
    const api = read('src/lib/clientPortalApi.ts');
    assert.match(api, /progressPercentage: number \| null/);
    const matter = read('src/components/client-portal/MatterWorkspace.tsx');
    assert.match(matter, /publishedProgressPercentage\?: number \| null/);
    assert.match(matter, /progressPercentage=\{publishedProgressPercentage\}/);
  });

  it('preserves the canonical published matter sections and customer wording', () => {
    const matter = read('src/components/client-portal/MatterWorkspace.tsx');
    for (const section of ['Az ügy előrehaladása', 'Közzétett mérföldkövek', 'Jelenlegi állomás', 'Folyamatban', 'Előttünk áll']) {
      assert.ok(matter.includes(section), `missing: ${section}`);
    }
  });
});
