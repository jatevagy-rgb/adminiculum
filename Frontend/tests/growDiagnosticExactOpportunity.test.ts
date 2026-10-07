/**
 * GROW DIAGNOSTIC WORKLIST — EXACT OPPORTUNITY NAVIGATION CONTRACT.
 *
 * The diagnostic worklist row action ("Döntés megnyitása") must retain the exact
 * Grow opportunity identity of its own row and reuse the already-working
 * canonical deep-link contract:
 *
 *   /clients/<clientId>/grow?tab=dontesek&opportunity=<opportunityId>
 *
 * These are focused source-contract checks: the diagnostic row resolves its
 * recommendation by `diagnosisId`, that recommendation id is the canonical
 * opportunity id (the same identity the decision queue already deep-links with),
 * and no new selection mechanism or decision mutation is introduced.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

const WORKBENCH = "src/components/clients/GrowWorkbench.tsx";
const GROW_PAGE = "src/app/clients/[clientId]/grow/page.tsx";

function worklistSource(src: string): string {
  const start = src.indexOf("function GrowDiagnosticWorklist(");
  assert.ok(start >= 0, "GrowDiagnosticWorklist not found");
  const end = src.indexOf("function GrowDecisionQueue(", start);
  assert.ok(end > start, "GrowDiagnosticWorklist end marker not found");
  return src.slice(start, end);
}

test("1. diagnostic row action href carries the exact per-row opportunity id", () => {
  const src = read(WORKBENCH);
  const worklist = worklistSource(src);
  assert.match(
    worklist,
    /grow\?tab=dontesek&opportunity=\$\{encodeURIComponent\(rec\.id\)\}/,
    "diagnostic row action must deep-link with its own recommendation/opportunity id",
  );
});

test("2. every diagnostic decision link retains identity (no bare tab=dontesek)", () => {
  const src = read(WORKBENCH);
  // No diagnostic/decision link may drop the opportunity identity.
  assert.doesNotMatch(
    src,
    /grow\?tab=dontesek(?!&opportunity=)/,
    "a Grow link navigates to the generic decision list without an opportunity id",
  );
});

test("3. the recommendation id is the canonical opportunity identity", () => {
  const src = read(WORKBENCH);
  // The row resolves its recommendation by diagnosisId...
  assert.match(src, /const rec = recommendations\.find\(\(r\) => r\.diagnosisId === d\.id\)/);
  // ...and the same identity space is used to resolve the linked opportunity and
  // to deep-link the decision queue (id equality, never title matching).
  assert.match(src, /opportunities\.find\(\(o\) => o\.id === rec\?\.id\)/);
  assert.match(src, /recommendations\.find\(\(r\) => r\.id === o\.id\)/);
  assert.match(src, /grow\?tab=dontesek&opportunity=\$\{encodeURIComponent\(o\.id\)\}/);
});

test("4. no opportunity -> no invented link (never guesses by title)", () => {
  const src = read(WORKBENCH);
  const worklist = worklistSource(src);
  // The decision link only renders when a recommendation exists in
  // PENDING_REVIEW; otherwise the row renders an explicit dash.
  assert.match(worklist, /rec\?\.status === "PENDING_REVIEW" \?/);
  assert.match(worklist, /<span className="text-\[11px\] text-\[var\(--adm-text-muted\)\]">—<\/span>/);
  assert.doesNotMatch(worklist, /indexOf\(|includes\(.*\.title|find\(.*\.title ===/);
});

test("5. diagnostic row action is navigation only, never a decision mutation", () => {
  const src = read(WORKBENCH);
  const worklist = worklistSource(src);
  assert.doesNotMatch(worklist, /reviewOpportunity/);
  assert.doesNotMatch(worklist, /growApi\./);
  assert.doesNotMatch(worklist, /fetch\(|fetchApi/);
  assert.doesNotMatch(worklist, /decide\(/);
  assert.doesNotMatch(worklist, /onClick=/);
  assert.doesNotMatch(worklist, /onSubmit/);
});

test("6. destination consumes the canonical opportunity deep link", () => {
  const pageSrc = read(GROW_PAGE);
  assert.match(pageSrc, /searchParams\.get\("opportunity"\)/);
  assert.match(pageSrc, /requestedOpportunityId=\{opportunityId\}/);
  const src = read(WORKBENCH);
  // Existing stale/invalid semantics stay untouched and are reused as-is.
  assert.match(src, /data-testid="grow-opportunity-unavailable"/);
  assert.match(src, /data-testid="grow-opportunity-check-failed"/);
  assert.match(src, /const requestedOpportunity = opportunities\.find\(\(o\) => o\.id === requestedOpportunityId\)/);
});

test("7. existing decision-queue exact links are unchanged", () => {
  const src = read(WORKBENCH);
  const queueStart = src.indexOf("function GrowDecisionQueue(");
  const queueEnd = src.indexOf("function GrowActiveInitiatives(", queueStart);
  const queue = src.slice(queueStart, queueEnd);
  assert.match(queue, /grow\?tab=dontesek&opportunity=\$\{encodeURIComponent\(o\.id\)\}/);
});
