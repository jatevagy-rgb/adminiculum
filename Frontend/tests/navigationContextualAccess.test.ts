import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), 'utf8');

describe('primary navigation contextual access', () => {
  it('keeps exactly the six-item workforce primary navigation', () => {
    const sidebar = read('src/components/Sidebar.tsx');
    assert.match(
      sidebar,
      /items: \["dashboard", "cases", "clients", "tasks", "communications", "settings"\]/,
    );
    assert.doesNotMatch(sidebar, /items:.*documents-compare/);
    assert.doesNotMatch(sidebar, /items:.*calendar/);
    for (const label of ['Műszerfal', 'Ügyek', 'Ügyfelek', 'Feladatok', 'Bejövő kommunikáció', 'Beállítások']) {
      assert.match(sidebar, new RegExp(label));
    }
  });

  it('keeps document comparison reachable from document and review context', () => {
    const documents = read('src/app/cases/[caseId]/documents/page.tsx');
    const review = read('src/app/cases/[caseId]/review/[documentId]/ReviewPageContent.tsx');
    assert.match(documents, /documents\/compare/);
    assert.match(review, /documents\/compare/);
  });

  it('keeps deadlines reachable from dashboard and case context', () => {
    const dashboard = read('src/components/DashboardFocused.tsx') + read('src/components/Dashboard.tsx');
    const caseDetail = read('src/components/CaseDetail.tsx');
    assert.match(dashboard, /\/deadlines/);
    assert.match(caseDetail, /\/deadlines/);
  });
});
