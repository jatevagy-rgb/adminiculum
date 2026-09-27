import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
const overview = () => read("src/components/cases/CaseWorkspaceOverview.tsx");
const matterCell = () => overview().split("\n").find((line) => line.includes(">Matter</dt>")) || "";

test("case matter cell never links to the unsupported /matters/<id> route", () => {
  const line = matterCell();
  assert.ok(line, "matter summary cell must exist in the hero");
  assert.doesNotMatch(line, /\/matters\//);
  assert.doesNotMatch(line, /<Link/);
});

test("case matter cell renders the stored matter identity as non-clickable metadata", () => {
  const line = matterCell();
  assert.match(line, /\{c\.matterId \? <div>/);
  assert.match(line, /<dd[^>]*>\{c\.matterId\}<\/dd>/);
});

test("case workspace keeps its supported routes and matter-conditional rendering", () => {
  const source = overview();
  assert.match(source, /href=\{`\/cases\/\$\{caseId\}\/communications`\}/);
  assert.match(source, /router\.push\(`\/cases\/\$\{caseId\}\/documents\?documentId=\$\{encodeURIComponent\(docId\)\}`\)/);
  assert.match(source, /c\.matterId \?/);
});
