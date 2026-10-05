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

  it('NEW-03: agenda CTA wording matches its destination and never duplicates the case link', () => {
    const src = read('src/app/deadlines/page.tsx');
    // CTA wording is derived from the canonical source/sourceType instead of a fixed task label.
    assert.match(src, /function openCtaLabel\(item: WorkflowDeadlineItem, caseHref: string\)/);
    assert.match(src, /item\.sourceType === "CASE_DEADLINE"\) return "Ügy megnyitása"/);
    assert.match(src, /item\.sourceType === "TASK"\) return "Feladat megnyitása"/);
    assert.match(src, /return "Megnyitás"/);
    // A primary href that already is the canonical case href must not render a second case link.
    assert.match(src, /const caseHref = `\/cases\/\$\{encodeURIComponent\(item\.caseId\)\}`/);
    assert.match(src, /const primaryIsCaseHref = item\.href === caseHref/);
    assert.match(src, /\{!primaryIsCaseHref && \(/);
    assert.match(src, /<QuietLink href=\{item\.href\} size="sm">\{openCtaLabel\(item, caseHref\)\}<\/QuietLink>/);
    // Existing completion/reschedule affordances stay scoped to TASK items.
    assert.match(src, /item\.capabilities\.canComplete && item\.sourceType === "TASK"/);
    assert.match(src, /item\.capabilities\.canReschedule && item\.sourceType === "TASK"/);
  });

  it('Case Workspace overview answers responsible / deadline / next without extra tabs', () => {
    const src = read('src/components/cases/CaseWorkspaceOverview.tsx');
    assert.match(src, /Felelős/);   // responsible lawyer
    assert.match(src, /Határidő/);  // deadline
    assert.match(src, /hero-next-deadline/);
  });
});
