import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveRequirementsTarget } from '../src/lib/complianceWorkspaceApi';

const area = (applicabilityId: string, factKeys: string[]) => ({
  applicabilityId,
  title: 'Azonos megjelenő követelmény',
  missingFacts: factKeys.map((factKey) => ({ factKey, label: null, profileAnswerable: false })),
}) as any;
const workspace = { areas: [area('app-1', ['fact-a', 'fact-b']), area('app-2', ['fact-a'])] } as any;

test('requirements target resolves exact applicability and missing fact, not identical titles', () => {
  assert.equal(resolveRequirementsTarget(workspace, 'client-1', { clientId: 'client-1', applicabilityId: 'app-2', factKey: 'fact-a' }), workspace.areas[1]);
  assert.equal(resolveRequirementsTarget(workspace, 'client-1', { clientId: 'client-1', applicabilityId: 'app-1', factKey: 'fact-b' }), workspace.areas[0]);
});

test('stale, cross-client and absent targets fail closed without selecting another area', () => {
  assert.equal(resolveRequirementsTarget(workspace, 'client-1', { clientId: 'client-1', applicabilityId: 'app-1', factKey: 'stale-fact' }), null);
  assert.equal(resolveRequirementsTarget(workspace, 'client-1', { clientId: 'client-2', applicabilityId: 'app-1', factKey: 'fact-a' }), null);
  assert.equal(resolveRequirementsTarget(workspace, 'client-1', null), null);
});

test('targeted Requirements focuses the missing fact and preserves existing request version context', () => {
  const page = readFileSync('src/app/clients/[clientId]/compliance/page.tsx', 'utf8');
  assert.match(page, /focusFactKey=\{targetedRequirementArea\?\.applicabilityId === area\.applicabilityId \? requirementsTarget\?\.factKey : undefined\}/);
  assert.match(page, /tabIndex=\{fact\.factKey === focusFactKey \? 0 : undefined\}/);
  assert.equal((page.match(/complianceContext=\{\{ requirementVersionId: area\.requirementVersionId \}\}/g) || []).length, 2);
});
