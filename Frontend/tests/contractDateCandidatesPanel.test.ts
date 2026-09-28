/**
 * Contract date candidates — tile contract.
 *
 * The Document Workspace "Szerződéses dátumok" tile must keep CONFIRMED
 * canonical dates and PENDING candidate dates visibly separate, require an
 * explicit per-candidate Confirm/Reject (never bulk auto-confirm), and gate
 * extraction on an exact selected version. Source-contract assertions plus
 * pure label-function tests, matching the repo's frontend test conventions.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  candidateStatusLabel,
  contractDateTypeLabel,
  formatCandidateDate,
} from "../src/lib/contractDateCandidatesApi";

const panelSource = readFileSync(
  path.resolve(process.cwd(), "src/components/documents/contractDates/ContractDateCandidatesPanel.tsx"),
  "utf8",
);

const documentsPageSource = readFileSync(
  path.resolve(process.cwd(), "src/app/cases/[caseId]/documents/page.tsx"),
  "utf8",
);

test("the tile separates confirmed canonical dates from pending candidates", () => {
  assert.match(panelSource, /contract-date-confirmed-list/);
  assert.match(panelSource, /contract-date-pending-list/);
  assert.match(panelSource, /Megerősített kanonikus dátumok/);
  assert.match(panelSource, /Jóváhagyásra váró dátumjelöltek/);
  assert.match(panelSource, /Szerződéses dátumok/);
});

test("confirmation is per-candidate only — no bulk auto-confirm exists", () => {
  assert.match(panelSource, /candidate-confirm-\$\{candidate\.id\}/);
  assert.match(panelSource, /candidate-reject-\$\{candidate\.id\}/);
  assert.doesNotMatch(panelSource, /megerősítés(é|e) mind|összes.*megerősít|confirmAll|bulkConfirm/i);
});

test("every pending candidate shows date, meaning, source excerpt and explicit decisions", () => {
  assert.match(panelSource, /contractDateTypeLabel\(candidate\.dateType\)/);
  assert.match(panelSource, /formatCandidateDate\(candidate\.proposedDate\)/);
  assert.match(panelSource, /candidate\.sourceExcerpt/);
  assert.match(panelSource, /Megerősít/);
  assert.match(panelSource, /Elutasít/);
});

test("extraction is gated on an exact selected version and explicit user action", () => {
  assert.match(panelSource, /disabled=\{!documentVersionId \|\| !canManage \|\| isExtracting\}/);
  assert.match(panelSource, /handleExtract/);
  // No provider call on open: extraction only runs from the explicit button.
  assert.match(panelSource, /onClick=\{\(\) => void handleExtract\(\)\}/);
});

test("the panel is mounted in the Document Workspace overview (document mode)", () => {
  assert.match(documentsPageSource, /import \{ ContractDateCandidatesPanel \}/);
  assert.match(documentsPageSource, /<ContractDateCandidatesPanel/);
  assert.match(documentsPageSource, /data-testid="document-mode-overview"/);
  const overviewStart = documentsPageSource.indexOf('data-testid="document-mode-overview"');
  const panelIndex = documentsPageSource.indexOf("<ContractDateCandidatesPanel");
  assert.ok(overviewStart !== -1 && panelIndex > overviewStart, "panel must render inside the document-mode overview region");
});

test("label helpers are honest and bounded", () => {
  assert.equal(contractDateTypeLabel("EFFECTIVE"), "Hatálybalépés");
  assert.equal(contractDateTypeLabel("PAYMENT_DUE"), "Fizetési határidő");
  assert.equal(contractDateTypeLabel("UNKNOWN_X"), "UNKNOWN_X");
  assert.equal(candidateStatusLabel("PENDING"), "Jóváhagyásra vár");
  assert.equal(candidateStatusLabel("REJECTED"), "Elutasítva");
  assert.equal(formatCandidateDate(null), "—");
  assert.equal(formatCandidateDate("2024-06-30T12:00:00.000Z"), new Date("2024-06-30T12:00:00.000Z").toLocaleDateString("hu-HU"));
});

test("client-side labels never fabricate confidence", () => {
  assert.doesNotMatch(panelSource, /confidence|bizalm|pontosság/i);
});
