import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (file: string) => {
  const fromCwd = path.resolve(process.cwd(), file);
  if (existsSync(fromCwd)) return readFileSync(fromCwd, "utf8");
  const fromFrontend = path.resolve(process.cwd(), "Frontend", file);
  if (existsSync(fromFrontend)) return readFileSync(fromFrontend, "utf8");
  return readFileSync(path.resolve(__dirname, "..", file), "utf8");
};

test("Case workspace preservation: the canonical cockpit remains the entry point", () => {
  const caseDetail = read("src/components/CaseDetail.tsx");
  assert.match(caseDetail, /CaseWorkspaceOverview/, "CaseDetail must still render CaseWorkspaceOverview");

  const overview = read("src/components/cases/CaseWorkspaceOverview.tsx");
  assert.match(overview, /title="Aktív munka"/);
  assert.match(overview, /title="Határidők"/);
  assert.match(overview, /title="Kommunikáció"/);
  assert.match(overview, /E-mail thread hozzárendelése/);
  assert.match(overview, /title="Dokumentumok"/);
  assert.match(overview, /title="Jegyzetek"/);
  assert.match(overview, /title="Aktivitás"/);
  assert.match(overview, /title="Munkaidő"/);
  assert.match(overview, /CaseTimeBillingSummary/);
  assert.match(overview, /HourlyRateCard/);
});

test("Case time/billing capabilities remain (Munkaidő rögzítése, Riport készítése)", () => {
  const timeBilling = read("src/components/cases/CaseTimeBillingSummary.tsx");
  assert.match(timeBilling, /Munkaidő rögzítése/);
  assert.match(timeBilling, /Riport készítése/);
});

test("Focused Document Workspace returns directly to its parent case", () => {
  const source = read("src/app/cases/[caseId]/documents/page.tsx");
  assert.match(source, /data-testid="document-workspace-case-return"/);
  assert.match(source, /← Ügy áttekintése/);
  assert.match(source, /href=\{`\/cases\/\$\{encodeURIComponent\(canonicalCaseId\)\}`\}/);
});
