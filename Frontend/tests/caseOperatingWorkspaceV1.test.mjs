import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (file) => readFileSync(path.resolve(process.cwd(), file), "utf8");

test("case route renders the operational workspace", () => {
  const detail = read("src/components/CaseDetail.tsx");
  assert.match(detail, /<CaseWorkspaceOverview caseId=\{canonicalCaseId\} \/>/);
  assert.match(detail, /<CaseWorkspaceNav/);
});

test("workspace keeps the summary-first operating fields and real deep links", () => {
  const overview = read("src/components/cases/CaseWorkspaceOverview.tsx");
  assert.match(overview, /data-testid="case-summary-fields"/);
  assert.match(overview, /Aktív munka/);
  assert.match(overview, /Munkaidő rögzítése/);
  assert.match(overview, /time-entries\?caseId=/);
  assert.match(overview, /Nincs adat/);
});

test("workspace exposes truthful time attribution when the matter mapping is ambiguous", () => {
  const backend = read("../Backend/src/modules/cases/workspace.ts");
  assert.match(backend, /CASE_TIME_NOT_ATTRIBUTABLE/);
  assert.match(backend, /TimeEntry nincs Case-hez kapcsolva/);
});
