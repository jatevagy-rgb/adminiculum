import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { componentHarness, flatten, textOf } from './helpers/componentHarness';
import { versionIdentity } from '../src/lib/documents/comparisonModel';

// UX-06: the comparison presentation must decide "current vs historical" from
// the canonical version identity (isCurrent), never from numeric ordering.
// Adminiculum supports explicitly promoting an older version as canonical
// current, so the numerically highest version is not necessarily current.

test('versionIdentity: numerically highest + canonical current is current', () => {
  const id = versionIdentity({ baseVersionNumber: 2, targetVersionNumber: 3, currentVersionNumber: 3, targetIsCurrent: true });
  assert.equal(id.targetIsHistorical, false);
  assert.equal(id.targetLabel, 'v3');
  assert.equal(id.baseLabel, 'v2');
});

test('versionIdentity: numerically lower but explicitly promoted current is current', () => {
  const id = versionIdentity({ baseVersionNumber: 3, targetVersionNumber: 1, currentVersionNumber: 1, targetIsCurrent: true });
  assert.equal(id.targetIsHistorical, false);
  assert.equal(id.targetLabel, 'v1');
});

test('versionIdentity: numerically higher but not canonical current is historical', () => {
  const id = versionIdentity({ baseVersionNumber: 3, targetVersionNumber: 4, currentVersionNumber: 1, targetIsCurrent: false });
  assert.equal(id.targetIsHistorical, true);
});

test('versionIdentity: canonical false marks a lower-numbered non-current version historical', () => {
  const id = versionIdentity({ baseVersionNumber: 1, targetVersionNumber: 2, currentVersionNumber: 3, targetIsCurrent: false });
  assert.equal(id.targetIsHistorical, true);
});

test('versionIdentity: null target is never historical and keeps the dash label', () => {
  const id = versionIdentity({ baseVersionNumber: 1, targetVersionNumber: null, currentVersionNumber: 2, targetIsCurrent: null });
  assert.equal(id.targetIsHistorical, false);
  assert.equal(id.targetLabel, '—');
});

test('versionIdentity: legacy numeric fallback is preserved when canonical identity is unknown', () => {
  const older = versionIdentity({ baseVersionNumber: null, targetVersionNumber: 1, currentVersionNumber: 3 });
  assert.equal(older.targetIsHistorical, true);
  const newer = versionIdentity({ baseVersionNumber: null, targetVersionNumber: 4, currentVersionNumber: 3 });
  assert.equal(newer.targetIsHistorical, false);
});

function renderHeader(props: {
  baseVersionNumber: number | null;
  targetVersionNumber: number | null;
  targetIsCurrent: boolean;
  currentVersionNumber: number | null;
  comparison?: any;
}) {
  const harness = componentHarness('src/components/documents/comparison/header.tsx', 'ComparisonHeader', {
    '@/components/adminiculum/ui': { AdminButton: (p: any) => ({ type: 'button', props: p }) },
    '@/lib/documents/comparisonModel': { versionIdentity },
  });
  const tree = harness.render({
    documentTitle: 'Teszt dokumentum',
    comparison: props.comparison ?? null,
    base: { versionNumber: props.baseVersionNumber },
    target: { versionNumber: props.targetVersionNumber, isCurrent: props.targetIsCurrent },
    currentVersionNumber: props.currentVersionNumber,
  });
  return { tree, text: textOf(tree) };
}

test('ComparisonHeader: canonical current target is not labelled historical', () => {
  // Highest numbered AND canonical current.
  const { text } = renderHeader({ baseVersionNumber: 2, targetVersionNumber: 3, targetIsCurrent: true, currentVersionNumber: 3 });
  assert.match(text, /Alap:\s*v2\b/);
  assert.match(text, /Cél:\s*v3\b/);
  assert.doesNotMatch(text, /Cél:\s*v3\s*\(korábbi\)/);
});

test('ComparisonHeader: promoted older version that is canonical current is not historical', () => {
  const { text } = renderHeader({ baseVersionNumber: 3, targetVersionNumber: 1, targetIsCurrent: true, currentVersionNumber: 1 });
  assert.match(text, /Cél:\s*v1\b/);
  assert.doesNotMatch(text, /korábbi/);
});

test('ComparisonHeader: numerically higher non-current target is labelled historical', () => {
  const { text } = renderHeader({ baseVersionNumber: 3, targetVersionNumber: 4, targetIsCurrent: false, currentVersionNumber: 1 });
  assert.match(text, /Cél:\s*v4\s*\(korábbi\)/);
});

test('ComparisonHeader: a non-current lower-numbered target stays clearly historical', () => {
  const { text } = renderHeader({ baseVersionNumber: 4, targetVersionNumber: 2, targetIsCurrent: false, currentVersionNumber: 3 });
  assert.match(text, /Cél:\s*v2\s*\(korábbi\)/);
});

test('comparison source/target semantics and review binding remain unchanged in the workspace', () => {
  const workspace = readFileSync('src/components/documents/comparison/ComparisonWorkspace.tsx', 'utf8');
  // base/target still resolve from the comparison's canonical version ids first.
  assert.match(workspace, /comparison\?\.baseVersionId \?\? baseId/);
  assert.match(workspace, /comparison\?\.targetVersionId \?\? targetId/);
  // the header now receives canonical current identity, not just a number.
  assert.match(workspace, /isCurrent: target\.isCurrent/);
});

test('documents page still supplies canonical isCurrent to the comparison version list', () => {
  const page = readFileSync('src/app/cases/[caseId]/documents/page.tsx', 'utf8');
  assert.match(page, /versions=\{versions\.map\(\(v\) => \(\{ id: v\.id, versionNumber: v\.versionNumber, isCurrent: v\.isCurrent/);
});
