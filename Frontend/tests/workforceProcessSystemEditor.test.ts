import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const API = 'src/lib/clientCompanyApi.ts';
const SYSTEM_PANEL = 'src/components/clients/company-operations/BusinessSystemPanel.tsx';
const PROCESS_PANEL = 'src/components/clients/company-operations/BusinessProcessPanel.tsx';
const STEPS_PANEL = 'src/components/clients/company-operations/BusinessProcessStepsPanel.tsx';
const WORKSPACE = 'src/components/clients/ClientCompanyWorkspace.tsx';

describe('Workforce process/system editor — API helpers (source contract)', () => {
  const api = () => read(API);

  it('create process → POST /clients/:clientId/processes', () => {
    assert.match(api(), /createBusinessProcess\(clientId: string, payload: BusinessProcessWriteInput\)/);
    assert.match(api(), /url\(clientId, '\/processes'\), \{ method: 'POST'/);
  });

  it('create system → POST /clients/:clientId/systems', () => {
    assert.match(api(), /createBusinessSystem\(clientId: string, payload: BusinessSystemWriteInput\)/);
    assert.match(api(), /url\(clientId, '\/systems'\), \{ method: 'POST'/);
  });

  it('add step → POST /processes/:processId/steps', () => {
    assert.match(api(), /addBusinessProcessStep\(processId: string, payload: BusinessProcessStepWriteInput\)/);
    assert.match(api(), /\/client-company\/processes\/\$\{encodeURIComponent\(processId\)\}\/steps/);
  });

  it('patch process → PATCH /processes/:processId', () => {
    assert.match(api(), /updateBusinessProcess\(processId: string, payload: Partial<BusinessProcessWriteInput>\)/);
    assert.match(api(), /\/client-company\/processes\/\$\{encodeURIComponent\(processId\)\}`, \{ method: 'PATCH'/);
  });

  it('patch step → PATCH /steps/:stepId', () => {
    assert.match(api(), /updateBusinessProcessStep\(stepId: string, payload: Partial<BusinessProcessStepWriteInput>\)/);
    assert.match(api(), /\/client-company\/steps\/\$\{encodeURIComponent\(stepId\)\}`, \{ method: 'PATCH'/);
  });

  it('reorder → POST /processes/:processId/reorder-steps with ordered stepIds', () => {
    assert.match(api(), /reorderBusinessProcessSteps\(processId: string, stepIds: string\[\]\)/);
    assert.match(api(), /\/client-company\/processes\/\$\{encodeURIComponent\(processId\)\}\/reorder-steps/);
    assert.match(api(), /JSON\.stringify\(\{ stepIds \}\)/);
  });

  it('exposes no delete helpers for systems, processes or steps', () => {
    assert.doesNotMatch(api(), /method: 'DELETE'/);
    assert.doesNotMatch(api(), /deleteBusinessSystem|deleteBusinessProcess|removeProcessStep/);
  });
});

describe('Workforce process/system editor — estimate truthfulness (null ≠ 0)', () => {
  const steps = () => read(STEPS_PANEL);

  it('parses blank as null, not 0', () => {
    assert.match(steps(), /if \(trimmed === ""\) return null;/);
  });

  it('rejects negative and non-integer estimates client-side', () => {
    assert.match(steps(), /!Number\.isFinite\(value\) \|\| !Number\.isInteger\(value\) \|\| value < 0/);
    assert.match(steps(), /"A becslés egész, nem negatív perc lehet\."/);
  });

  it('keeps zero as a valid explicit value', () => {
    // The invalid branch rejects only < 0; 0 stays a valid number.
    assert.match(steps(), /value < 0/);
    assert.match(steps(), /estimatedActiveMinutes: active/);
    assert.match(steps(), /estimatedWaitingMinutes: waiting/);
  });
});

describe('Workforce process/system editor — relations and approval semantics', () => {
  const steps = () => read(STEPS_PANEL);

  it('persists system relation by systemId, never systemName', () => {
    assert.match(steps(), /systemId: systemId \|\| null/);
    assert.doesNotMatch(steps(), /systemName: systemId/);
  });

  it('produces isApproval=false for normal steps and true for APPROVAL', () => {
    assert.match(steps(), /const isApproval = stepType === "APPROVAL" \|\| approval;/);
    assert.match(steps(), /if \(next === "APPROVAL"\) setApproval\(true\);/);
  });

  it('reorder sends deterministic canonical step id ordering from server state', () => {
    assert.match(steps(), /reorderBusinessProcessSteps\(processId, next\.map\(\(s\) => s\.id\)\)/);
    assert.match(steps(), /setSteps\(sortSteps\(reordered\)\)/);
  });

  it('step failure never deletes the process and keeps it accessible for retry', () => {
    const src = steps();
    assert.doesNotMatch(src, /deleteBusinessProcess|removeProcessStep/);
    assert.match(src, /setFormError\(stepErrorMessage\(err\)\)/);
    assert.match(src, /A folyamat vagy a lépés már nem található\./);
  });
});

describe('Workforce process/system editor — duplicate system safety', () => {
  it('shows a concise product message and never renames/overwrites', () => {
    const src = read(SYSTEM_PANEL);
    assert.match(src, /error\.code === "DUPLICATE_SYSTEM_NAME"/);
    assert.match(src, /Ilyen nevű rendszer már szerepel ennél az ügyfélnél\./);
    assert.doesNotMatch(src, /\(2\)|append|auto.*rename/i);
  });
});

describe('Workforce process/system editor — workspace integration', () => {
  it('adds create/edit actions into the workforce workspace only', () => {
    const src = read(WORKSPACE);
    assert.match(src, /from "@\/components\/clients\/company-operations\/BusinessSystemPanel"/);
    assert.match(src, /from "@\/components\/clients\/company-operations\/BusinessProcessPanel"/);
    assert.match(src, /from "@\/components\/clients\/company-operations\/BusinessProcessStepsPanel"/);
    assert.match(src, /data-testid="add-system"/);
    assert.match(src, /data-testid="add-process"/);
    assert.match(src, /data-testid=\{`manage-steps-\$\{process\.id\}`\}/);
    assert.match(src, /data-testid=\{`edit-system-\$\{system\.id\}`\}/);
    assert.match(src, /data-testid=\{`edit-process-\$\{process\.id\}`\}/);
  });

  it('refreshes the authoritative read model after mutation (no local aggregate patching)', () => {
    const src = read(WORKSPACE);
    assert.match(src, /refreshWorkspace/);
    assert.match(src, /clientWorkspaceApi\.getDataRoom\(clientId\)/);
  });

  it('keeps editor surface out of the customer portal', () => {
    const portal = read('src/components/client-portal/OrgGrowView.tsx');
    assert.doesNotMatch(portal, /BusinessSystemPanel|BusinessProcessPanel|BusinessProcessStepsPanel|clientCompanyApi\.(create|update|add|reorder)/);
  });
});
