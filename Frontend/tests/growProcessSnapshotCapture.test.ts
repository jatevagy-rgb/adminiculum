/**
 * G1 — Process Observation Snapshot Capture wiring.
 *
 * Proves the existing canonical capture endpoint is exposed from the internal
 * workforce process surface without duplicating backend metric calculation,
 * without inventing input, and without leaking anything into the client portal.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

const GROW_API = "src/lib/growApi.ts";
const COMPANY_WORKSPACE = "src/components/clients/ClientCompanyWorkspace.tsx";

test("growApi reuses the canonical POST /processes/:processId/observations endpoint", () => {
  const src = read(GROW_API);
  assert.match(src, /captureProcessObservation\(clientId: string, processId: string\)/);
  assert.match(src, /url\(clientId, `\/processes\/\$\{encodeURIComponent\(processId\)\}\/observations`\)/);
  assert.match(src, /\{ method: "POST", body: JSON\.stringify\(\{\}\) \}/);
});

test("capture action is wired into the internal process detail surface with the existing process id", () => {
  const src = read(COMPANY_WORKSPACE);
  assert.match(src, /import \{ growApi \} from "@\/lib\/growApi";/);
  assert.match(src, /function ProcessSnapshotCapture\(\{/);
  assert.match(src, /await growApi\.captureProcessObservation\(clientId, processId\);/);
  assert.match(src, /<ProcessSnapshotCapture[\s\S]*?processId=\{process\.id\}/);
  assert.match(src, /data-testid=\{`capture-process-snapshot-\$\{processId\}`\}/);
});

test("capture is the thinnest interaction: no form, no invented input, no metric duplication", () => {
  const src = read(COMPANY_WORKSPACE);
  const api = read(GROW_API);
  // Server stays authoritative for snapshot structure, metrics and timestamps.
  assert.match(src, /A mérés a rögzített folyamatlépésekből determinisztikusan számított pillanatképet rögzít\./);
  // No client-side metric formula or backend metric calculator is imported/used.
  assert.doesNotMatch(api, /calculateProcessMetrics/);
  assert.doesNotMatch(src, /calculateProcessMetrics|TOTAL_ACTIVE_MINUTES\s*=|TOTAL_WAITING_MINUTES\s*=/);
  // The capture request sends an empty body — the server derives everything.
  assert.match(api, /body: JSON\.stringify\(\{\}\) \}/);
});

test("successful capture refreshes the latest snapshot and confirms; failure does not fake success", () => {
  const src = read(COMPANY_WORKSPACE);
  assert.match(src, /setMessage\("Mérés rögzítve\."\);/);
  assert.match(src, /onCaptured\(\);/);
  assert.match(src, /setCaptureError\("A mérés rögzítése nem sikerült\."\);/);
  // Soft re-read keeps the confirmation visible and refreshes the data room.
  assert.match(src, /refreshDataRoom/);
  assert.match(src, /setRoom\(await clientWorkspaceApi\.getDataRoom\(clientId\)\);/);
});

test("client portal receives no new internal snapshot-capture surface", () => {
  const portalDir = path.join(root, "src", "components", "client-portal");
  const portalApp = path.join(root, "src", "app", "portal");
  assert.ok(existsSync(portalDir));
  for (const entry of [portalDir, portalApp]) {
    assert.ok(existsSync(entry), `expected ${entry} to exist`);
  }
  const portal = read("src/components/client-portal/OrgGrowView.tsx");
  assert.doesNotMatch(portal, /captureProcessObservation|ProcessSnapshotCapture/);
});
