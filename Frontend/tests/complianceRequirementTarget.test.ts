import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync('src/app/clients/[clientId]/compliance/page.tsx', 'utf8');
const workbench = readFileSync('src/components/clients/compliance/ComplianceWorkbench.tsx', 'utf8');

test('Requirements resolves both stable identity fields in the active client workspace', () => {
  assert.match(page, /requirementsTarget\?\.clientId === clientId/);
  assert.match(page, /area\.applicabilityId === requirementsTarget\.applicabilityId && area\.missingFacts\.some\(\(fact\) => fact\.factKey === requirementsTarget\.factKey\)/);
  assert.match(page, /focusedFactKey=\{area\.applicabilityId === requirementsTarget\?\.applicabilityId && targetArea \? requirementsTarget\.factKey : undefined\}/);
});

test('stale targets fail truthfully without substituting another item', () => {
  assert.match(page, /A kijelölt követelmény vagy hiányzó adat már nem érhető el ennél az ügyfélnél\. Másik tétel nem lett kiválasztva\./);
  assert.match(page, /requirementsTarget && workspaceLoading/);
  assert.match(page, /targetUnavailable \?/);
});

test('manual Requirements navigation clears the targeted selection and UX-02 portal is untouched', () => {
  assert.match(page, /setRequirementsTarget\(null\); setView\(key\)/);
  const portal = readFileSync('src/components/client-portal-v3/compliance/PortalComplianceV3.tsx', 'utf8');
  assert.doesNotMatch(portal, /requirementsTarget|applicabilityId.*factKey/);
  assert.match(workbench, /row\.clientId !== clientId/);
});

test('exact focus retains the existing request controls and requirement-version context', () => {
  assert.match(page, /focusedFactRef\.current\?\.focus\(\)/);
  assert.match(page, /area\.missingFacts\.map\(\(fact\) => \(\s*<li key=\{fact\.factKey\} ref=\{fact\.factKey === focusedFactKey \? focusedFactRef : undefined\} id=\{fact\.factKey === focusedFactKey \? factItemId : undefined\} tabIndex=\{fact\.factKey === focusedFactKey \? -1 : undefined\}/);
  assert.equal((page.match(/complianceContext=\{\{ requirementVersionId: area\.requirementVersionId \}\}/g) || []).length, 2);
  assert.match(page, /triggerLabel="Kérdés az ügyfélnek"/);
  assert.match(page, /triggerLabel="Dokumentum bekérése"/);
});
