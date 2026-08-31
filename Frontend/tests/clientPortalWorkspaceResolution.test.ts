import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

describe('Frontend Portal Identity and Multi-Workspace Resolution (R0)', () => {
  const shellSrc = () => read('src/components/client-portal/ClientPortalShell.tsx');
  const selectorSrc = () => read('src/components/client-portal/PortalWorkspaceSelector.tsx');
  const apiSrc = () => read('src/lib/clientPortalApi.ts');

  it('1. ORGANIZATION navigation uses "Ügyeink"', () => {
    const src = shellSrc();
    assert.ok(src.includes("workspace.mode === 'ORGANIZATION'"));
    assert.ok(src.includes("['Ügyeink', '/portal/ugyeim']"));
  });

  it('2. INDIVIDUAL navigation uses "Ügyeim"', () => {
    const src = shellSrc();
    assert.ok(src.includes("['Ügyeim', '/portal/ugyeim']"));
  });

  it('3. CASE_RELAY navigation uses "Ügyek" and "Együttműködési áttekintés"', () => {
    const src = shellSrc();
    assert.ok(src.includes("workspace.mode === 'CASE_RELAY'"));
    assert.ok(src.includes("['Ügyek', '/portal/ugyeim']"));
    assert.ok(src.includes("['Együttműködési áttekintés', '/portal/szervezeti-attekintes']"));
  });

  it('4. PortalWorkspaceSelector displays clean human labels and no technical IDs', () => {
    const src = selectorSrc();
    assert.ok(src.includes('modeLabels'));
    assert.ok(src.includes('roleLabels'));
    assert.ok(src.includes('workspace.clientDisplayName'));
    assert.ok(src.includes('workspace.name'));
    assert.ok(!src.includes('workspace.id'));
    assert.ok(!src.includes('workspace.clientId'));
    assert.ok(!src.includes('membershipId'));
    assert.ok(!src.includes('issuer'));
    assert.ok(!src.includes('subject'));
  });

  it('5. selection flow triggers setSelectedPortalWorkspace and reloads context', () => {
    const src = shellSrc();
    assert.ok(src.includes('setSelectedPortalWorkspace(reference)'));
    assert.ok(src.includes('setSelectedReference(reference)'));
    assert.ok(src.includes('setReloadNonce'));
  });

  it('6. Munkatérváltás button resets stored selection and transitions to select state', () => {
    const src = shellSrc();
    assert.ok(src.includes('Munkatérváltás'));
    assert.ok(src.includes('setSelectedPortalWorkspace(null)'));
    assert.ok(src.includes('SELECTION_REQUIRED'));
  });

  it('7. Stale workspace 403 or invalid selection clears stored workspace and retries', () => {
    const src = shellSrc();
    assert.ok(src.includes('error instanceof ApiError && error.status === 403 && selectedReference'));
    assert.ok(src.includes('setSelectedPortalWorkspace(null)'));
    assert.ok(src.includes('setSelectedReference(null)'));
  });

  it('8. Context label prioritizes canonical client name + mode over raw identity name', () => {
    const src = shellSrc();
    assert.ok(src.includes('ws.clientDisplayName'));
    assert.ok(src.includes('Szervezeti ügyfél'));
    assert.ok(src.includes('Magánügyfél'));
  });
});
