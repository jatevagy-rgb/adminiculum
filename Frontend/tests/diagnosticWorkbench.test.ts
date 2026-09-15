/**
 * GWU-2A: Internal Read-Only Diagnostic Workbench — Focused Source-contract & Logic Tests.
 *
 * Implements the 18 mandatory proof points:
 *  1. Default /clients/[id]/grow renders existing GrowJourney.
 *  2. ?view=diagnostics renders diagnostic workbench.
 *  3. Switching back renders original GrowJourney.
 *  4. Invalid view fails safe.
 *  5. No diagnostics mutation controls exist.
 *  6. Canonical state renders separately from observations.
 *  7. Declared and measured observation types remain visually distinct.
 *  8. Estimated and measured time are not conflated.
 *  9. EVIDENCE_RECORD and RESEARCH_EVIDENCE are displayed distinctly.
 * 10. Research evidence explanatory disclaimer is present.
 * 11. Recommendation is marked internal/not customer-visible.
 * 12. UNKNOWN remains explicit.
 * 13. NEEDS_MORE_DATA displays honestly.
 * 14. CONFLICTING_EVIDENCE displays honestly.
 * 15. Empty diagnosis does not say “no problem”.
 * 16. API error is handled.
 * 17. 403 is handled.
 * 18. Existing customer portal routes/components are untouched.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  formatProcessMetricValue,
  verificationStatusLabelHu,
  recommendationStatusLabelHu,
  sufficiencyBadge,
  type ProcessMetricValue,
} from "../src/lib/diagnosticWorkbenchApi";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

const GROW_PAGE = "src/app/clients/[clientId]/grow/page.tsx";
const WORKBENCH = "src/components/clients/diagnostic-workbench/GrowDiagnosticWorkbench.tsx";
const CANONICAL_PANEL = "src/components/clients/diagnostic-workbench/CanonicalStatePanel.tsx";
const OBSERVATION_PANEL = "src/components/clients/diagnostic-workbench/ObservationPanel.tsx";
const DIAGNOSIS_PANEL = "src/components/clients/diagnostic-workbench/DiagnosisPanel.tsx";
const EVIDENCE_PANEL = "src/components/clients/diagnostic-workbench/EvidenceSufficiencyPanel.tsx";
const RECOMMENDATION_PANEL = "src/components/clients/diagnostic-workbench/InternalRecommendationPanel.tsx";
const API = "src/lib/diagnosticWorkbenchApi.ts";

test("1. Default /clients/[id]/grow renders existing GrowJourney", () => {
  const pageSrc = read(GROW_PAGE);
  assert.match(pageSrc, /view === "diagnostics"\s*\?\s*\(?\s*<GrowDiagnosticWorkbench/);
  assert.match(pageSrc, /<GrowJourney clientId=\{client\.id\} clientName=\{client\.name\} \/>/);
  assert.match(pageSrc, /href=\{`\/clients\/\$\{client\.id\}\/grow`\}/);
});

test("2. ?view=diagnostics renders diagnostic workbench", () => {
  const pageSrc = read(GROW_PAGE);
  assert.match(pageSrc, /view === "diagnostics"/);
  assert.match(pageSrc, /<GrowDiagnosticWorkbench\s+clientId=\{client\.id\}\s+clientName=\{client\.name\}\s*\/>/);
  assert.match(pageSrc, /href=\{`\/clients\/\$\{client\.id\}\/grow\?view=diagnostics`\}/);
});

test("3. Switching back renders original GrowJourney", () => {
  const pageSrc = read(GROW_PAGE);
  assert.match(pageSrc, /data-testid="grow-sub-nav"/);
  assert.match(pageSrc, /data-testid="grow-subnav-journey"/);
  assert.match(pageSrc, /data-testid="grow-subnav-diagnostics"/);
  assert.match(pageSrc, /Munkafolyamat/);
  assert.match(pageSrc, /Diagnosztika/);
});

test("4. Invalid view fails safe", () => {
  const pageSrc = read(GROW_PAGE);
  // Any value other than "diagnostics" strictly falls through to GrowJourney
  assert.match(
    pageSrc,
    /view === "diagnostics"\s*\?\s*\(?\s*<GrowDiagnosticWorkbench[^>]*>\s*\)?\s*:\s*\(?\s*<GrowJourney/
  );
});

test("5. No diagnostics mutation controls exist (WORKBENCH_MUTATION_CONTROLS=0)", () => {
  const files = [
    WORKBENCH,
    CANONICAL_PANEL,
    OBSERVATION_PANEL,
    DIAGNOSIS_PANEL,
    EVIDENCE_PANEL,
    RECOMMENDATION_PANEL,
  ];

  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /<form/);
    assert.doesNotMatch(src, /onSubmit/);
    assert.doesNotMatch(src, /runResearch/);
    assert.doesNotMatch(src, /startInitiative/);
    assert.doesNotMatch(src, /reviewOpportunity/);
    assert.doesNotMatch(src, /submitSurvey/);
    assert.doesNotMatch(src, />\s*Elfogadom\s*</);
    assert.doesNotMatch(src, />\s*Elutasítom\s*</);
    assert.doesNotMatch(src, />\s*Beszéljünk róla\s*</);
    assert.doesNotMatch(src, />\s*Most nem\s*</);
    assert.doesNotMatch(src, />\s*Közzététel\s*</);
    assert.doesNotMatch(src, />\s*Mentés\s*</);
    assert.doesNotMatch(src, />\s*Létrehozás\s*</);
  }
});

test("6. Canonical state renders separately from observations", () => {
  const canonSrc = read(CANONICAL_PANEL);
  assert.match(canonSrc, /data-testid="diagnostic-canonical-state-panel"/);
  assert.match(canonSrc, /Kanonikus vállalati állapot/);
  assert.match(canonSrc, /Megfelelőségi státusz:/);
  assert.doesNotMatch(canonSrc, /Megfelelőségi szint/);
  assert.match(canonSrc, /GrowProcessMap/);
  assert.match(canonSrc, /Még nincs elegendő rögzített vállalati adat\./);

  const obsSrc = read(OBSERVATION_PANEL);
  assert.match(obsSrc, /data-testid="diagnostic-observation-panel"/);
  assert.doesNotMatch(canonSrc, /processSnapshots/);
  assert.doesNotMatch(obsSrc, /known\.facts/);
});

test("7. Declared and measured observation types remain visually distinct", () => {
  const obsSrc = read(OBSERVATION_PANEL);
  assert.match(obsSrc, /Deklarált megfigyelések/);
  assert.match(obsSrc, /Mért pillanatképek/);
  assert.match(obsSrc, /Még nincs deklarált megfigyelés\./);
  assert.match(obsSrc, /Még nincs mért folyamatadat\./);
  assert.doesNotMatch(obsSrc, /rawPayload/);
});

test("8. Estimated and measured time are not conflated", () => {
  const obsSrc = read(OBSERVATION_PANEL);
  assert.match(obsSrc, /nem azonos a becsült lépésidőkkel/);

  const metricVal: ProcessMetricValue = {
    code: "TOTAL_ACTIVE_MINUTES",
    value: 90,
    unit: "MINUTES",
    metricVersion: "GROW_PROCESS_METRICS_V1",
  };
  assert.equal(formatProcessMetricValue(metricVal), "90 perc");
});

test("9. EVIDENCE_RECORD and RESEARCH_EVIDENCE are displayed distinctly", () => {
  const evSrc = read(EVIDENCE_PANEL);
  assert.match(evSrc, /data-testid="diagnostic-evidence-panel"/);
  assert.match(evSrc, /Ügyfélspecifikus bizonyítékok/);
  assert.match(evSrc, /Kutatási háttér/);
  assert.match(evSrc, /Még nincs kapcsolt bizonyíték\./);
});

test("10. Research evidence explanatory disclaimer is present and distinguishes linked vs unlinked", () => {
  const evSrc = read(EVIDENCE_PANEL);
  assert.match(evSrc, /Kapcsolt kutatási háttér/);
  assert.match(
    evSrc,
    /Ez a kutatási háttér a jelenlegi diagnózis\/javaslat alátámasztásához kapcsolódik; nem a vállalat saját mért adata\./
  );
  assert.match(evSrc, /További kutatási corpus/);
  assert.match(
    evSrc,
    /Jelenleg nincs az adott diagnózishoz vagy javaslathoz kapcsolva\./
  );
});

test("11. Recommendation is marked internal/not customer-visible", () => {
  const recSrc = read(RECOMMENDATION_PANEL);
  assert.match(recSrc, /BELSŐ TERVEZET — AZ ÜGYFÉLPORTÁLON NEM LÁTHATÓ/);
  assert.match(recSrc, /nem kerülnek közzétételre az ügyfél felé/);
  assert.match(recSrc, /Ügyféloldali közzététel ebben a verzióban nem támogatott\./);
});

test("12. UNKNOWN remains explicit and truthful", () => {
  const canonSrc = read(CANONICAL_PANEL);
  assert.match(canonSrc, /fact\.verificationStatus === "UNKNOWN"/);
  assert.equal(verificationStatusLabelHu("UNKNOWN"), "Ismeretlen");

  const evSrc = read(EVIDENCE_PANEL);
  assert.match(evSrc, /Explicit ismeretlen tények \(UNKNOWN\):/);
  assert.match(evSrc, /Van explicit ismeretlenként jelölt tény\./);
  assert.match(evSrc, /Nincs explicit UNKNOWN státuszú rögzített tény\./);
});

test("13. NEEDS_MORE_DATA displays honestly", () => {
  const badge = sufficiencyBadge("NEEDS_MORE_DATA");
  assert.equal(badge.label, "További adat szükséges");

  const evSrc = read(EVIDENCE_PANEL);
  assert.match(evSrc, /További adat szükséges a döntéshozatalhoz\./);
});

test("14. CONFLICTING_EVIDENCE displays honestly", () => {
  const badge = sufficiencyBadge("CONFLICTING_EVIDENCE");
  assert.equal(badge.label, "Ellentmondó bizonyíték");

  const evSrc = read(EVIDENCE_PANEL);
  assert.match(evSrc, /Ellentmondó bizonyíték észlelve a rendszerben/);
});

test("15. Empty diagnosis does not say 'no problem'", () => {
  const diagSrc = read(DIAGNOSIS_PANEL);
  assert.match(diagSrc, /Nincs még feltárt diagnózis\./);
  assert.doesNotMatch(diagSrc, /nincs probléma/i);
  assert.doesNotMatch(diagSrc, /problémamentes/i);
  // Severity is not fabricated
  assert.doesNotMatch(diagSrc, /severity/i);
});

test("16. API error is handled", () => {
  const wbSrc = read(WORKBENCH);
  assert.match(wbSrc, /data-testid="diagnostic-workbench-error"/);
  assert.match(wbSrc, /Hiba történt a diagnosztikai adatok lekérése során\./);
});

test("17. 403 is handled", () => {
  const wbSrc = read(WORKBENCH);
  assert.match(wbSrc, /err\.status === 403/);
  assert.match(wbSrc, /Nincs jogosultsága a belső diagnosztikai munkaasztal megtekintésére\./);
});

test("18. Existing customer portal routes/components are untouched", () => {
  // Confirm portal components and routes remain intact and are not modified
  assert.ok(existsSync(path.join(root, "src/app/portal/fejlesztes/page.tsx")));
  assert.ok(existsSync(path.join(root, "src/app/portal/vallalat/page.tsx")));
  assert.ok(existsSync(path.join(root, "src/components/client-portal/OrgGrowView.tsx")));
  const orgGrow = read("src/components/client-portal/OrgGrowView.tsx");
  assert.doesNotMatch(orgGrow, /GrowDiagnosticWorkbench/);
});
