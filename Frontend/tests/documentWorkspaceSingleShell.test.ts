import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
const page = () => read("src/app/cases/[caseId]/documents/page.tsx");
const tabs = () => read("src/components/documents/workContext/DocumentWorkspaceTabs.tsx");

test("single shell exposes exactly four primary work modes", () => {
  const source = page();
  const primary = source.match(/data-testid="primary-document-work-modes"[\s\S]*?<\/div>/)?.[0] ?? "";

  assert.match(primary, /Áttekintés/);
  assert.match(primary, /Változások/);
  assert.match(primary, /Megjegyzések/);
  assert.match(primary, /Jóváhagyás/);
  assert.doesNotMatch(primary, /Elemzés|Ügyfél|Leadás/);
  assert.match(source, /useState<'overview' \| 'changes' \| 'comments' \| 'approval'>\('overview'\)/);
});

test("center reader remains a sibling of the right shell and left ledger", () => {
  const source = page();
  assert.match(source, /data-testid="canonical-left-ledger"/);
  assert.match(source, /data-testid="canonical-center-reading"/);
  assert.match(source, /data-testid="canonical-right-shell"/);
  assert.match(source, /contextualTab === 'overview'/);
  assert.match(source, /contextualTab === 'changes'/);
  assert.match(source, /contextualTab === 'comments'/);
  assert.match(source, /contextualTab === 'approval'/);
});

test("approval uses the canonical document review workflow and secondary lifecycle tools", () => {
  const source = page();
  const shell = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/)?.[0] ?? "";

  assert.match(shell, /data-testid="canonical-document-approval"/);
  assert.match(shell, /<DocumentReviewWorkflowPanel/);
  assert.match(shell, /data-testid="approval-ai-tools"/);
  assert.match(shell, /data-testid="approval-publication-tools"/);
  assert.match(shell, /data-testid="approval-handoff-tools"/);
  assert.doesNotMatch(shell, /setContextualTab\('(elemzes|ugyfel|leadas)'\)/);
});

test("document and version navigation plus metadata compare remain secondary", () => {
  const source = page();
  assert.match(source, /<details data-testid="document-version-navigation">/);
  assert.match(source, /filteredUploadedDocuments/);
  assert.match(source, /filteredGeneratedLedgerItems/);
  assert.match(source, /<details id="preserved-extended-tools-shell"/);
  assert.match(source, /const metaCompareUrl =/);
  assert.match(source, /router\.push\(metaCompareUrl\)/);
  assert.match(source, /<ComparisonWorkspace/);
});

test("tabs component names only the four primary modes", () => {
  const source = tabs();
  for (const label of ["Áttekintés", "Változások", "Megjegyzések", "Jóváhagyás"]) {
    assert.match(source, new RegExp(label));
  }
  assert.doesNotMatch(source, /Felülvizsgálat|Verziók|Elemzés|Ügyfél|Leadás/);
});
