import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source = readFileSync("src/components/cases/CaseWorkspaceOverview.tsx", "utf8");
test("primary work precedes communication, documents and optional tools", () => {
  const markers = [
    'data-testid="matter-hero"', 'aria-label="Következő feladat"', 'aria-label="Műveletek"',
    'title="Aktív munka"', 'id="ck-deadlines"', 'id="ck-notes"', '<CaseContextTiles',
    'id="ck-comms"', '<CaseWorkspaceDocumentsSection', 'id="case-secondary-details"',
  ];
  const positions = markers.map(marker => source.indexOf(marker));
  assert.ok(positions.every((p, i) => p >= 0 && (!i || p > positions[i - 1])));
  assert.equal(source.split('aria-label="Műveletek"').length - 1, 1);
  assert.doesNotMatch(source, /data-testid="kpi-row"|case-workspace-section-nav/);
  const secondaryStart = source.indexOf('id="case-secondary-details"');
  const historyStart = source.indexOf('<section aria-label="Ügytörténet"');
  for (const marker of ['id="ck-risk-matrix"', 'id="ck-ai-flow"', 'id="ck-prompts"', '<DocumentPreparationDashboard', '<CaseWorkPackagePanel', '<CaseTimeBillingSummary']) {
    const position = source.indexOf(marker);
    assert.ok(position > secondaryStart && position < historyStart, `${marker} remains reachable as a secondary tool`);
  }
});
test("one communication, one primary notes list and one history preserve distinct content", () => {
  for (const tag of ['<WordWideCommunicationLeaf', '<CaseWorkspaceNotesSection', '<CaseHistoryPanel']) assert.equal(source.split(tag).length - 1, 1);
  assert.doesNotMatch(source, /<CaseInsightTiles|data-testid="activity-feed"|title="Jegyzetek"/);
  for (const tag of ['<CaseWorkPackagePanel', '<CaseTimeBillingSummary', '<HourlyRateCard', '<CaseSubmissionHandoff', '<DocumentPreparationDashboard']) assert.ok(source.includes(tag));
  assert.ok(source.indexOf('<CaseWorkspaceNotesSection') < source.indexOf('<CaseHistoryPanel'));
  assert.equal(source.split('<CaseContextTiles').length - 1, 1);
  assert.equal(source.split('<details ref={secondaryDetailsRef} id="case-secondary-details"').length - 1, 1);
  assert.match(source, /secondaryDetailsRef\.current\?\.setAttribute\("open", ""\); const panel = document\.getElementById\("ck-risk-matrix"\)/);
  assert.match(source, /<details id="ck-activity"[\s\S]*?<CaseHistoryPanel/);
});
test("secondary deep links reveal all ancestor details after asynchronous load", () => {
  assert.ok(source.includes('document.getElementById(targetId)'));
  assert.ok(source.includes("parent.tagName === 'DETAILS'"));
  assert.ok(source.includes("parent = parent.parentElement"));
  assert.ok(source.includes('target.scrollIntoView'));
  assert.ok(source.includes('[loading, ws]'));
  assert.ok(source.includes("removeEventListener('hashchange'"));
  for (const id of ['ck-starting-context', 'ck-work-package', 'ck-notes', 'ck-activity', 'ck-time']) assert.ok(source.includes('id="' + id + '"'));
});
test("review work and active document use canonical identities", () => {
  assert.ok(source.includes('Ellenőrzés és jóváhagyás'));
  assert.ok(source.includes('data-testid="task-submission-leadas"'));
  assert.ok(source.includes('reviewSummary?.currentVersionId'));
  assert.ok(source.includes('activeDocument.id'));
  assert.ok(source.includes('versionId='));
  assert.ok(source.includes('<TaskSubmissionWorkspace'));
});
