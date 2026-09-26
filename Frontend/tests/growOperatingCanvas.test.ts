/**
 * GROW 2.0 PHASE 1 — interactive read-only operating canvas + contextual inspector.
 *
 * Proves the customer-facing operating canvas:
 *  - the pure projection preserves process ids and canonical step order,
 *  - it never invents missing values (no responsible persons, no time metrics)
 *    and never converts absent data to zero,
 *  - process selection is URL-backed and scoped to the Működés tab,
 *  - the existing opportunity/initiative URL state is untouched,
 *  - the customer publication boundary (no research/recommendation/diagnosis data)
 *    is preserved,
 *  - the canvas is semantically accessible with a list equivalent.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectGrowOperatingProcess, sortGrowStepsDeterministically } from '../src/lib/growOperatingProjection';
import type { PortalGrowProcess, PortalGrowProcessStep } from '../src/lib/clientPortalApi';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

const VIEW = 'Frontend/src/components/client-portal/OrgGrowView.tsx';
const CANVAS = 'Frontend/src/components/client-portal/OrgGrowOperatingCanvas.tsx';
const INSPECTOR = 'Frontend/src/components/client-portal/OrgGrowContextInspector.tsx';
const PROJECTION = 'Frontend/src/lib/growOperatingProjection.ts';

function step(partial: Partial<PortalGrowProcessStep> & { id: string; position: number; name: string }): PortalGrowProcessStep {
  return {
    stepType: 'MANUAL',
    isApproval: false,
    systemName: null,
    systemCategory: null,
    ...partial,
  };
}

function process(partial: Partial<PortalGrowProcess> & { id: string; name: string }): PortalGrowProcess {
  return {
    category: 'Működés',
    criticality: 'Közepes',
    frequency: 'Havi',
    organizationGroupName: null,
    steps: [],
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Projection truthfulness (runtime)
// ---------------------------------------------------------------------------

test('projection preserves the canonical process id and name', () => {
  const view = projectGrowOperatingProcess(
    process({ id: 'proc-1', name: 'Beszerzés', steps: [step({ id: 's1', position: 1, name: 'Igény' })] }),
  );
  assert.equal(view.id, 'proc-1');
  assert.equal(view.name, 'Beszerzés');
  assert.equal(view.stepCount, 1);
});

test('projection preserves canonical step order (position asc, id asc)', () => {
  const steps = [
    step({ id: 's3', position: 3, name: 'Harmadik' }),
    step({ id: 's1b', position: 1, name: 'Első-b' }),
    step({ id: 's1a', position: 1, name: 'Első-a' }),
    step({ id: 's2', position: 2, name: 'Második' }),
  ];
  const ordered = sortGrowStepsDeterministically(steps);
  assert.deepEqual(ordered.map((s) => s.id), ['s1a', 's1b', 's2', 's3']);

  const view = projectGrowOperatingProcess(process({ id: 'p', name: 'P', steps }));
  assert.deepEqual(view.steps.map((s) => s.orderIndex), [0, 1, 2, 3]);
  assert.equal(view.steps[0].id, 's1a');
});

test('projection does not invent missing values and never converts absent data to zero', () => {
  const view = projectGrowOperatingProcess(
    process({
      id: 'p',
      name: 'P',
      steps: [step({ id: 's1', position: 1, name: 'A', systemName: null })],
    }),
  );
  // No responsible-person data and no time metrics may appear anywhere.
  for (const s of view.steps) {
    assert.equal('responsiblePersonName' in s, false);
    assert.equal('responsiblePersonId' in s, false);
    assert.equal('estimatedActiveMinutes' in s, false);
    assert.equal('estimatedWaitingMinutes' in s, false);
  }
  assert.equal('totalEstimatedActiveMinutes' in view, false);
  assert.equal('totalEstimatedWaitingMinutes' in view, false);
  // Missing system stays missing (null), not turned into an empty string or zero.
  assert.equal(view.steps[0].systemName, null);
  // System count / switch are NOT derived from display names.
  assert.equal('distinctSystemCount' in view, false);
  assert.equal('systemSwitch' in view.steps[0], false);
  // A process with no approval gates reports zero approvals truthfully.
  assert.equal(view.approvalCount, 0);
});

test('projection derives approval from the flag or the APPROVAL step type', () => {
  const view = projectGrowOperatingProcess(
    process({
      id: 'p',
      name: 'P',
      steps: [
        step({ id: 's1', position: 1, name: 'Ellenőrzés', isApproval: true }),
        step({ id: 's2', position: 2, name: 'Jóváhagyás', stepType: 'APPROVAL' }),
        step({ id: 's3', position: 3, name: 'Kézbesítés' }),
      ],
    }),
  );
  assert.equal(view.approvalCount, 2);
  assert.equal(view.steps[0].isApproval, true);
  assert.equal(view.steps[1].isApproval, true);
  assert.equal(view.steps[2].isApproval, false);
});

test('projection does NOT manufacture a system count or system switch from display names', () => {
  const view = projectGrowOperatingProcess(
    process({
      id: 'p',
      name: 'P',
      steps: [
        step({ id: 's1', position: 1, name: 'A', systemName: 'SAP' }),
        step({ id: 's2', position: 2, name: 'B', systemName: 'CRM' }),
      ],
    }),
  );
  // No system-switch flag and no system count are present in the view model.
  assert.equal('distinctSystemCount' in view, false);
  for (const s of view.steps) {
    assert.equal('systemSwitch' in s, false);
  }
  // Individual recorded system labels are still preserved.
  assert.equal(view.steps[0].systemName, 'SAP');
  assert.equal(view.steps[1].systemName, 'CRM');
});

// ---------------------------------------------------------------------------
// Selection + URL state (source contract)
// ---------------------------------------------------------------------------

test('process selection is URL-backed and scoped to the Működés tab', () => {
  const src = read(VIEW);
  assert.match(src, /handleSelectOperatingProcess/);
  assert.match(src, /url\.searchParams\.set\("processId", processId\)/);
  assert.match(src, /url\.searchParams\.set\("tab", "mukodes"\)/);
  assert.match(src, /handleClearOperatingSelection/);
  assert.match(src, /url\.searchParams\.delete\("processId"\)/);
  // Pop state restores the process selection and resets the ephemeral step.
  assert.match(src, /const processId = p\.get\("processId"\)/);
  assert.match(src, /setSelectedOperatingProcessId\(tab === "mukodes" && processId \? processId : null\)/);
  assert.match(src, /setSelectedOperatingStepId\(null\)/);
});

test('invalid process selection fails safely without crashing', () => {
  const src = read(VIEW);
  // Selection is resolved against the customer-safe DTO; a missing id yields null.
  assert.match(src, /processes\.find\(\(p\) => p\.id === selectedOperatingProcessId\) \?\? null/);
  // The inspector handles a null process with a graceful empty state.
  const inspector = read(INSPECTOR);
  assert.match(inspector, /if \(!process\)/);
  assert.match(inspector, /Válasszon egy folyamatot a részletek megtekintéséhez\./);
});

test('existing opportunity and initiative URL state remains intact', () => {
  const src = read(VIEW);
  assert.match(src, /url\.searchParams\.set\("opportunity", pubId\)/);
  assert.match(src, /url\.searchParams\.delete\("opportunity"\)/);
  assert.match(src, /url\.searchParams\.set\("initiative", initiativeId\)/);
  assert.match(src, /url\.searchParams\.delete\("initiative"\)/);
  assert.match(src, /window\.addEventListener\("popstate"/);
  assert.match(src, /window\.history\.pushState/);
  assert.match(src, /window\.history\.replaceState/);
});

test('switching away from Működés clears the process query parameter', () => {
  const src = read(VIEW);
  assert.match(src, /if \(tab !== "mukodes"\) \{\n\s*url\.searchParams\.delete\("processId"\);/);
});

// ---------------------------------------------------------------------------
// Customer safety boundary
// ---------------------------------------------------------------------------

test('no internal research, recommendation, diagnosis or person data is surfaced', () => {
  for (const file of [VIEW, CANVAS, INSPECTOR, PROJECTION]) {
    const src = read(file);
    for (const forbidden of [
      'RecommendationCandidate',
      'DiagnosisCandidate',
      'ResearchEvidence',
      'responsiblePerson',
      'responsiblePersonId',
      'internalNote',
      'reviewNote',
      'ASSUMED',
      'evidenceStrength',
      'confidence',
    ]) {
      assert.doesNotMatch(src, new RegExp(forbidden), `${file} must not expose ${forbidden}`);
    }
  }
});

test('the canvas never renders invented time metrics', () => {
  const canvas = read(CANVAS);
  const inspector = read(INSPECTOR);
  for (const src of [canvas, inspector]) {
    assert.doesNotMatch(src, /\bperc\b|\bóra\b|\bminutes\b/i);
  }
});

test('SYSTEM_COUNT_FROM_NAMES and SYSTEM_SWITCH_FROM_NAMES are NOT present', () => {
  for (const file of [CANVAS, INSPECTOR, PROJECTION]) {
    const src = read(file);
    assert.doesNotMatch(src, /distinctSystemCount/, `${file} must not derive a system count from names`);
    assert.doesNotMatch(src, /systemSwitch/, `${file} must not derive a system switch from names`);
    assert.doesNotMatch(src, /Rendszerváltás/, `${file} must not render a system-switch label`);
  }
});

test('individual recorded system labels are still displayed', () => {
  const canvas = read(CANVAS);
  const inspector = read(INSPECTOR);
  assert.match(canvas, /Rendszer:/);
  assert.match(canvas, /step\.systemName/);
  assert.match(inspector, /selectedStep\.systemName/);
});

// ---------------------------------------------------------------------------
// Accessibility contract
// ---------------------------------------------------------------------------

test('canvas exposes semantic selectable controls with a non-color indicator', () => {
  const canvas = read(CANVAS);
  // Process selector and step nodes are pressed-state buttons, not ARIA radios.
  assert.match(canvas, /aria-pressed=\{selected\}/);
  assert.doesNotMatch(canvas, /role="radiogroup"/);
  assert.doesNotMatch(canvas, /role="radio"/);
  assert.doesNotMatch(canvas, /aria-checked/);
  assert.match(canvas, /Kiválasztva/);
  assert.match(canvas, /data-testid="grow-operating-canvas"/);
  assert.match(canvas, /data-testid={`grow-operating-process-\$\{view\.id\}`}/);
  assert.match(canvas, /data-testid={`grow-operating-step-\$\{step\.id\}`}/);
});

test('map/list toggle is a pressed-state button control, not ARIA tabs', () => {
  const src = read(VIEW);
  assert.match(src, /data-testid="grow-view-toggle-map"/);
  assert.match(src, /data-testid="grow-view-toggle-list"/);
  assert.match(src, /aria-pressed=\{growViewMode === "map"\}/);
  assert.match(src, /aria-pressed=\{growViewMode === "list"\}/);
  assert.doesNotMatch(src, /aria-selected=\{growViewMode/);
});

test('map/list parity: every process remains reachable from the list alternative', () => {
  const src = read(VIEW);
  assert.match(src, /data-testid="grow-view-toggle-map"/);
  assert.match(src, /data-testid="grow-view-toggle-list"/);
  // The existing truthful horizontal flow is preserved as the list alternative.
  assert.match(src, /data-testid={`grow-process-flow-\$\{proc\.id\}`}/);
  assert.match(src, /data-testid={`grow-process-step-\$\{step\.id\}`}/);
});

test('inspector provides a close control and step list', () => {
  const inspector = read(INSPECTOR);
  assert.match(inspector, /data-testid="grow-context-inspector"/);
  assert.match(inspector, /aria-label="Bezárás"/);
  assert.match(inspector, /data-testid="grow-context-inspector-close"/);
  assert.match(inspector, /data-testid={`grow-context-inspector-step-\$\{step\.id\}`}/);
  assert.match(inspector, /Mi alapján\?/);
});
