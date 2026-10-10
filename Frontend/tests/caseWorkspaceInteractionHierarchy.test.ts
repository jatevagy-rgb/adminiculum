import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source = readFileSync("src/components/cases/CaseWorkspaceOverview.tsx", "utf8");
test("primary work precedes communication, documents and optional tools", () => {
  const markers = ['data-testid="matter-hero"', '<CaseContextTiles', 'aria-label="Következő feladat"', 'aria-label="Műveletek"', 'title="Aktív munka"', 'id="ck-comms"', '<CaseWorkspaceDocumentsSection', 'id="case-secondary-details"'];
  const positions = markers.map(marker => source.indexOf(marker));
  assert.ok(positions.every((p, i) => p >= 0 && (!i || p > positions[i - 1])));
  assert.equal(source.split('aria-label="Műveletek"').length - 1, 1);
  assert.doesNotMatch(source, /data-testid="kpi-row"|case-workspace-section-nav/);
});
test("one communication, one primary notes list and one history preserve distinct content", () => {
  for (const tag of ['<WordWideCommunicationLeaf', '<CaseWorkspaceNotesSection', '<CaseHistoryPanel']) assert.equal(source.split(tag).length - 1, 1);
  assert.doesNotMatch(source, /<CaseInsightTiles|data-testid="activity-feed"|title="Jegyzetek"/);
  for (const tag of ['<CaseWorkPackagePanel', '<CaseTimeBillingSummary', '<HourlyRateCard', '<CaseSubmissionHandoff', '<DocumentPreparationDashboard']) assert.ok(source.includes(tag));
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
test("review work and next-task documents use their canonical relationship identities", () => {
  assert.ok(source.includes('Ellenőrzés és jóváhagyás'));
  assert.ok(source.includes('data-testid="task-submission-leadas"'));
  assert.ok(source.includes('<TaskSubmissionWorkspace'));
  assert.ok(source.includes('getTaskDocuments(taskId)'));
  assert.ok(source.includes('readTaskSubmissionWorkflow(taskId)'));
  assert.ok(source.includes('data-testid="next-task-linked-documents"'));
  assert.ok(source.includes('data-testid="next-task-submitted-outputs"'));
  assert.ok(source.includes('document.documentVersionId') && source.includes('versionId='));
  assert.ok(source.includes('A leadott verzió nincs rögzítve.'));
  assert.doesNotMatch(source, /nextTask\?\.documentId/);
});
