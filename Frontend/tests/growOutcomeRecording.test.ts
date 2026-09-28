/**
 * G2 — Before/after snapshot → canonical outcome recording wiring.
 *
 * Proves the workforce "Eredmények" surface can record a real outcome from two
 * existing measured ProcessObservationSnapshots by reusing the canonical
 * improvement-opportunity outcome endpoint/client. No metric, ROI or delta is
 * calculated in the frontend, no synthetic value is invented, and nothing new
 * reaches the client portal.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

const API = "Frontend/src/lib/growApi.ts";
const WORKBENCH = "Frontend/src/components/clients/GrowWorkbench.tsx";
const PORTAL = "Frontend/src/components/client-portal/OrgGrowView.tsx";
const SNAPSHOT_SURFACE = "Frontend/src/components/clients/ClientCompanyWorkspace.tsx";
const SCHEMA = "Backend/prisma/schema.prisma";

test("1. 'Eredmény rögzítése' exists on the internal Grow Eredmények surface", () => {
  const src = read(WORKBENCH);
  assert.match(src, /function GrowOutcomesTab/);
  assert.match(src, /data-testid="grow-outcomes-tab"/);
  assert.match(src, /data-testid="grow-record-outcome-open"/);
  assert.match(src, /Eredmény rögzítése/);
  // The action is reachable from the outcomes tab, not a separate journey.
  assert.match(src, /<GrowOutcomesTab[\s\S]*?onRecorded=\{\(\) => void load\(\)\}/);
});

test("2. recording requires an existing ImprovementOpportunity", () => {
  const src = read(WORKBENCH);
  // Only accepted recommendations (which own an ImprovementOpportunity) are offered.
  assert.match(src, /\.listOpportunities\(clientId, "ACCEPTED"\)/);
  assert.match(src, /res\.items\.filter\(\(o\) => Boolean\(o\.opportunity\)\)/);
  // The submit path is gated on the canonical opportunity id.
  assert.match(src, /const canSubmit = Boolean\(selectedOpportunity\?\.opportunity\?\.id\)/);
  assert.match(src, /if \(!selectedOpportunity\?\.opportunity\?\.id \|\| !processId \|\| !beforeSnapshotId\) return;/);
  assert.match(src, /disabled=\{busy \|\| !canSubmit\}/);
  // No opportunity created by this surface — it only attaches to an existing one.
  assert.doesNotMatch(src, /createOpportunity|improvementOpportunity\.create/);
});

test("3. before-snapshot options come from canonical snapshot data", () => {
  const api = read(API);
  const src = read(WORKBENCH);
  assert.match(api, /listProcessObservationHistory\(clientId: string, processId: string\)/);
  assert.match(api, /url\(clientId, `\/processes\/\$\{encodeURIComponent\(processId\)\}\/observations`\)/);
  assert.match(src, /\.listProcessObservationHistory\(clientId, processId\)/);
  assert.match(src, /data-testid="grow-record-outcome-before"/);
  assert.match(src, /\{snapshots\.map\(\(s\) => \(/);
});

test("4. after-snapshot options come from canonical snapshot data", () => {
  const src = read(WORKBENCH);
  assert.match(src, /data-testid="grow-record-outcome-after"/);
  assert.match(src, /const afterOptions = beforeSnapshot/);
  assert.match(src, /\{afterOptions\.map\(\(s\) => \(/);
  // Ordering only: the after snapshot cannot precede the baseline.
  assert.match(src, /s\.id !== beforeSnapshot\.id && s\.observedAt >= beforeSnapshot\.observedAt/);
});

test("5. real snapshot observation dates are visible for both selections", () => {
  const src = read(WORKBENCH);
  assert.match(src, /function formatObservedAt/);
  assert.match(src, /s\.observedAt/);
  const dateUsages = src.match(/formatObservedAt\(s\.observedAt\)/g) ?? [];
  assert.ok(dateUsages.length >= 2, "both before and after options must show observedAt");
});

test("6. the canonical existing outcome endpoint/client is reused", () => {
  const api = read(API);
  const src = read(WORKBENCH);
  assert.match(api, /recordOutcome\(clientId: string, opportunityId: string, input:/);
  assert.match(api, /\/grow\/opportunities\/\$\{encodeURIComponent\(opportunityId\)\}\/outcomes/);
  assert.match(src, /growApi[\s\S]*?\.recordOutcome\(clientId, selectedOpportunity\.opportunity\.id, \{/);
  // Snapshot ids are submitted, never copied values or a fabricated payload.
  assert.match(src, /businessProcessId: processId,/);
  assert.match(src, /beforeSnapshotId,/);
  assert.match(src, /afterSnapshotId: afterSnapshotId \|\| undefined,/);
});

test("7. the frontend does not calculate process metrics", () => {
  const src = read(WORKBENCH);
  const api = read(API);
  for (const forbidden of ["calculateProcessMetrics", "TOTAL_ACTIVE_MINUTES", "TOTAL_WAITING_MINUTES"]) {
    assert.doesNotMatch(src, new RegExp(forbidden));
    assert.doesNotMatch(api, new RegExp(forbidden));
  }
});

test("8. the frontend does not calculate ROI", () => {
  const src = read(WORKBENCH);
  for (const forbidden of [
    "computeRoiEstimate",
    "ROI_ENGINE_VERSION",
    "cashSavedHufPerMonth",
    "timeSavedMinutesPerMonth",
    "expectedActiveReductionPct",
    "hourlyCostHuf",
    "runsPerMonth",
  ]) {
    assert.doesNotMatch(src, new RegExp(forbidden));
  }
  // The form only sends ids + an optional note; no declared cash/time inputs.
  assert.match(src, /note: note\.trim\(\) \|\| undefined,/);
});

test("9. a successful record refreshes the canonical outcome list", () => {
  const src = read(WORKBENCH);
  assert.match(src, /setMessage\("Eredmény rögzítve\."\);/);
  assert.match(src, /onRecorded\(\);/);
  assert.match(src, /onRecorded=\{\(\) => void load\(\)\}/);
});

test("10. a server error does not fake success", () => {
  const src = read(WORKBENCH);
  assert.match(src, /setError\("Az eredmény rögzítése nem sikerült\."\);/);
  assert.match(src, /catch \{/);
  // Success message is only set after the awaited canonical call resolves.
  assert.match(src, /await growApi[\s\S]*?\.recordOutcome\([\s\S]*?setMessage\("Eredmény rögzítve\."\)/);
});

test("11. basis/provenance is displayed truthfully where returned", () => {
  const src = read(WORKBENCH);
  const api = read(API);
  assert.match(src, /outcomeBasisLabelHu\(o\.basis\)/);
  // Canonical Hungarian basis labels come from the shared helper, not raw enums.
  assert.match(api, /MEASURED: "Mért"/);
  assert.match(api, /CALCULATED: "Számított"/);
  assert.match(api, /ESTIMATED: "Becsült"/);
  assert.match(api, /ASSUMED: "Feltételezés"/);
  // An unmeasured (no after-snapshot) result is explicitly described as not measured.
  assert.match(src, /Utána mérés nélkül az eredmény nem mért, hanem becsült alapon rögzül/);
});

test("12. the client portal receives no new internal/cash ROI data", () => {
  assert.ok(existsSync(path.join(root, PORTAL)), `expected ${PORTAL} to exist`);
  const portal = read(PORTAL);
  for (const forbidden of [
    "recordOutcome",
    "listProcessObservationHistory",
    "recordOutcomeMeasurement",
    "cashSavedHufPerMonth",
    "computeRoiEstimate",
  ]) {
    assert.doesNotMatch(portal, new RegExp(forbidden));
  }
});

test("13. the #381 snapshot capture surface remains intact", () => {
  const api = read(API);
  const surface = read(SNAPSHOT_SURFACE);
  assert.match(api, /captureProcessObservation\(clientId: string, processId: string\)/);
  assert.match(api, /body: JSON\.stringify\(\{\}\) \}/);
  assert.match(surface, /function ProcessSnapshotCapture/);
  assert.match(surface, /growApi\.captureProcessObservation\(clientId, processId\)/);
  // The new read method is additive and did not replace the existing ones.
  assert.match(api, /getProcessObservationLatest\(clientId: string, processId: string\)/);
});

test("14. no Prisma schema change and no new outcome model", () => {
  const schema = read(SCHEMA);
  const outcomeModels = schema.match(/model OutcomeMeasurement\b/g) ?? [];
  assert.equal(outcomeModels.length, 1, "exactly the canonical OutcomeMeasurement model exists");
  for (const forbidden of ["model OutcomeRecord", "model OutcomeSnapshot", "model ProcessOutcome"]) {
    assert.doesNotMatch(schema, new RegExp(forbidden));
  }
  assert.match(schema, /enum OutcomeMeasurementBasis/);
});

test("15. no second outcome client/model is introduced in the frontend", () => {
  const api = read(API);
  const recordOutcomeCalls = api.match(/\brecordOutcome\(/g) ?? [];
  assert.equal(recordOutcomeCalls.length, 1, "one canonical recordOutcome client method");
  assert.doesNotMatch(api, /recordOutcomeMeasurement\(/);
  assert.doesNotMatch(api, /interface OutcomeRecord\b/);
});
