import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
const overview = () => read("src/components/cases/CaseWorkspaceOverview.tsx");

test("Case workspace keeps the primary cockpit order and compact quick actions", () => {
  const source = overview();
  const hero = source.indexOf('data-testid="matter-hero"');
  const kpis = source.indexOf('data-testid="kpi-row"');
  const insights = source.indexOf('<CaseInsightTiles workspace={ws} caseId={caseId} />');
  const quickActions = source.indexOf('data-testid="case-workspace-quick-actions"');
  const primaryWork = source.indexOf('title="Aktív munka"');
  assert.ok(hero < kpis && kpis < insights && insights < quickActions && quickActions < primaryWork);

  assert.match(source, /setModal\(\{ type: "task-create" \}\).*\+ Feladat/);
  assert.match(source, /setModal\(\{ type: "deadline-create" \}\).*\+ Határidő/);
  assert.match(source, /setModal\(\{ type: "doc-upload" \}\).*\+ Dokumentum/);
  assert.match(source, /setModal\(\{ type: "case-comment" \}\).*Megjegyzés/);
  assert.match(source, /setAiPromptOpen\(true\).*AI előkészítés/);
  assert.match(source, /setTimeDialogOpen\(true\).*Munkaidő rögzítése/);
});

test("Secondary capabilities remain composed in an expandable, hash-safe detail area", () => {
  const source = overview();
  assert.match(source, /<details ref=\{secondaryDetailsRef\} id="case-secondary-details" data-testid="case-secondary-details"/);
  assert.match(source, /Ügy részletei és további eszközök/);
  assert.match(source, /StartingContextPanel/);
  assert.match(source, /CaseWorkPackagePanel/);
  assert.match(source, /title="Jegyzetek"/);
  assert.match(source, /title="Aktivitás"/);
  assert.match(source, /CaseTimeBillingSummary/);
  assert.match(source, /HourlyRateCard/);
  assert.match(source, /\['ck-starting-context', 'ck-work-package', 'ck-notes', 'ck-activity', 'ck-time'\]/);
  assert.match(source, /secondaryDetailsRef\.current\?\.setAttribute\('open', ''\)/);
  assert.match(source, /document\.getElementById\(targetId\)\?\.scrollIntoView/);
});

test("Primary anchors and existing document/communication routes remain unchanged", () => {
  const source = overview();
  for (const target of ['#ck-tasks', '#ck-deadlines', '#ck-comms', '#ck-documents']) {
    assert.match(source, new RegExp(`href="${target}"`));
  }
  assert.match(source, /href=\{`\/cases\/\$\{caseId\}\/communications`\}/);
  assert.match(source, /router\.push\(`\/cases\/\$\{caseId\}\/documents\?documentId=\$\{encodeURIComponent\(docId\)\}`\)/);
  assert.match(source, /data-testid="case-workspace-section-nav"/);
});

test("Interaction hierarchy does not duplicate CaseInsightTile derivation or document review logic", () => {
  const source = overview();
  assert.match(source, /<CaseInsightTiles workspace=\{ws\} caseId=\{caseId\} \/>/);
  assert.doesNotMatch(source, /CASE_INSIGHT_TILE_REGISTRY|deriveCaseInsightTiles/);
  assert.doesNotMatch(source, /reviewSummary/);
});
