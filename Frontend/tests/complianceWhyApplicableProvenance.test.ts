import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('workforce why-applicable provenance (structural)', () => {
  it('projects canonical requirement and rule version identities alongside facts and citations', () => {
    const api = read('src/lib/complianceWorkspaceApi.ts');
    assert.match(api, /requirementVersionKey: string \| null;/);
    assert.match(api, /ruleVersionKey: string \| null;/);

    const page = read('src/app/clients/[clientId]/compliance/page.tsx');
    assert.match(page, /Követelményverzió:/);
    assert.match(page, /Értékelő szabályverzió:/);
    assert.match(page, /area\.usedFacts/);
    assert.match(page, /area\.citations/);
  });

  it('never recomputes legal applicability in the frontend', () => {
    const page = read('src/app/clients/[clientId]/compliance/page.tsx');
    assert.doesNotMatch(page, /astJson|evaluateRule|canonicalDigest|snapshotDigest|ruleVersionId\s*===/);
  });
});
