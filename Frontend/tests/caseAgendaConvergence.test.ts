import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('Case lifecycle -> deadline -> Agenda convergence (frontend structural)', () => {
  it('single-Case agenda client reuses the existing canonical /cases/:id/deadlines endpoint', () => {
    const src = read('src/lib/caseAgendaApi.ts');
    assert.match(src, /\/cases\/\$\{encodeURIComponent\(caseId\)\}\/deadlines/);
    assert.match(src, /getCaseAgenda/);
  });

  it('Agenda page presents simple human sections and Case-linked items', () => {
    const src = read('src/app/deadlines/page.tsx');
    assert.match(src, /Lejárt/); // overdue
    assert.match(src, /Ma/);     // today
    assert.match(src, /OVERDUE|TODAY|THIS_WEEK/);
  });

  it('Case Workspace overview answers responsible / deadline / next without extra tabs', () => {
    const src = read('src/components/cases/CaseWorkspaceOverview.tsx');
    assert.match(src, /Felelős/);   // responsible lawyer
    assert.match(src, /Határidő/);  // deadline
    assert.match(src, /hero-next-deadline/);
  });
});
