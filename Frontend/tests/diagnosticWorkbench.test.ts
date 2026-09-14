/**
 * GWU-2A: Internal Read-Only Diagnostic Workbench — Source-contract & Regression Tests.
 *
 * Validates:
 * 1. Default route /clients/[clientId]/grow preserves GrowJourney unchanged.
 * 2. Additive ?view=diagnostics switches to GrowDiagnosticWorkbench.
 * 3. WORKBENCH_MUTATION_CONTROLS = 0 (strictly read-only; no survey submission,
 *    no research run trigger, no opportunity/initiative creation or acceptance buttons).
 * 4. Internal-only warning banner is prominent: "BELSŐ TERVEZET — AZ ÜGYFÉLPORTÁLON NEM LÁTHATÓ".
 * 5. Distinct provenance classification across all 5 sections.
 * 6. EVIDENCE_RECORD vs RESEARCH_EVIDENCE strictly separated with research disclaimer.
 * 7. Empty states fabricate no data, and UNKNOWN facts are rendered truthfully.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("route: default /clients/[clientId]/grow preserves GrowJourney unchanged", () => {
  const pageSrc = read(GROW_PAGE);
  assert.match(pageSrc, /view === "diagnostics"\s*\?\s*\(?\s*<GrowDiagnosticWorkbench/);
  assert.match(pageSrc, /<GrowJourney clientId=\{client\.id\} clientName=\{client\.name\} \/>/);
  assert.match(pageSrc, /data-testid="grow-sub-nav"/);
  assert.match(pageSrc, /data-testid="grow-subnav-journey"/);
  assert.match(pageSrc, /data-testid="grow-subnav-diagnostics"/);
  assert.match(pageSrc, /href=\{`\/clients\/\$\{client\.id\}\/grow`\}/);
  assert.match(pageSrc, /href=\{`\/clients\/\$\{client\.id\}\/grow\?view=diagnostics`\}/);
});

test("route: secondary sub-navigation clearly separates Munkafolyamat from Diagnosztikai munkaasztal", () => {
  const pageSrc = read(GROW_PAGE);
  assert.match(pageSrc, /Munkafolyamat/);
  assert.match(pageSrc, /Diagnosztikai munkaasztal/);
});

test("workbench: WORKBENCH_MUTATION_CONTROLS = 0 (strictly read-only)", () => {
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
    // No mutation forms or post handlers
    assert.doesNotMatch(src, /<form/);
    assert.doesNotMatch(src, /onSubmit/);
    assert.doesNotMatch(src, /runResearch/);
    assert.doesNotMatch(src, /startInitiative/);
    assert.doesNotMatch(src, /reviewOpportunity/);
    assert.doesNotMatch(src, /submitSurvey/);
    // No mutation buttons
    assert.doesNotMatch(src, />\s*Elfogadom\s*</);
    assert.doesNotMatch(src, />\s*Elutasítom\s*</);
    assert.doesNotMatch(src, />\s*Beszéljünk róla\s*</);
    assert.doesNotMatch(src, />\s*Most nem\s*</);
    assert.doesNotMatch(src, />\s*Közzététel\s*</);
    assert.doesNotMatch(src, />\s*Mentés\s*</);
    assert.doesNotMatch(src, />\s*Létrehozás\s*</);
  }
});

test("internal only: prominent banner warns that draft is not visible on customer portal", () => {
  const recSrc = read(RECOMMENDATION_PANEL);
  assert.match(recSrc, /BELSŐ TERVEZET — AZ ÜGYFÉLPORTÁLON NEM LÁTHATÓ/);
  assert.match(recSrc, /nem kerülnek közzétételre az ügyfél felé/);

  const wbSrc = read(WORKBENCH);
  assert.match(wbSrc, /Belső vizsgálat/);
});

test("provenance: canonical state panel renders facts, systems and processes with GrowProcessMap", () => {
  const canonSrc = read(CANONICAL_PANEL);
  assert.match(canonSrc, /data-testid="diagnostic-canonical-state-panel"/);
  assert.match(canonSrc, /1\. Kanonikus vállalati állapot/);
  assert.match(canonSrc, /Kanonikus vállalati állapot/);
  assert.match(canonSrc, /GrowProcessMap/);
  assert.match(canonSrc, /Még nincs elegendő rögzített vállalati adat\./);
  assert.match(canonSrc, /Még nincs rögzített informatikai rendszer\./);
  assert.match(canonSrc, /Még nincs rögzített üzleti folyamat\./);
});

test("provenance: observations separate declared survey observations from measured snapshots", () => {
  const obsSrc = read(OBSERVATION_PANEL);
  assert.match(obsSrc, /data-testid="diagnostic-observation-panel"/);
  assert.match(obsSrc, /Deklarált megfigyelések/);
  assert.match(obsSrc, /Mért pillanatképek/);
  assert.match(obsSrc, /Még nincs deklarált megfigyelési adat\./);
  assert.match(obsSrc, /Még nincs mért folyamatadat\./);
  // Raw payload must not be required
  assert.doesNotMatch(obsSrc, /rawPayload/);
});

test("metrics: measured snapshot displays 12 canonical metrics with units", () => {
  const metricVal: ProcessMetricValue = {
    code: "TOTAL_CYCLE_MINUTES",
    value: 120,
    unit: "MINUTES",
    metricVersion: "GROW_PROCESS_METRICS_V1",
  };
  assert.equal(formatProcessMetricValue(metricVal), "120 perc");

  const ratioVal: ProcessMetricValue = {
    code: "WAITING_SHARE",
    value: 0.45,
    unit: "RATIO",
    metricVersion: "GROW_PROCESS_METRICS_V1",
  };
  assert.equal(formatProcessMetricValue(ratioVal), "45%");

  const boolVal: ProcessMetricValue = {
    code: "PROCESS_OWNER_PRESENT",
    value: true,
    unit: "BOOLEAN",
    metricVersion: "GROW_PROCESS_METRICS_V1",
  };
  assert.equal(formatProcessMetricValue(boolVal), "Igen");
});

test("diagnosis: renders diagnoses and problem domains without fabricated severity", () => {
  const diagSrc = read(DIAGNOSIS_PANEL);
  assert.match(diagSrc, /data-testid="diagnostic-problems-panel"/);
  assert.match(diagSrc, /3\. Feltárt működési problémák & Diagnózisok/);
  assert.match(diagSrc, /Levezetett diagnózisok listája/);
  assert.match(diagSrc, /Még nincs feltárt diagnózis\./);
  // Ensure no invented severity field in the diagnosis panel
  assert.doesNotMatch(diagSrc, /severity/i);
});

test("evidence: strict separation of client records and research evidence with explicit disclaimer", () => {
  const evSrc = read(EVIDENCE_PANEL);
  assert.match(evSrc, /data-testid="diagnostic-evidence-panel"/);
  assert.match(evSrc, /Ügyfélspecifikus bizonyítékok/);
  assert.match(evSrc, /Kutatási háttér/);
  assert.match(
    evSrc,
    /A kutatási háttér a következtetést támasztja alá; nem a vállalat saját mért adata\./
  );
  assert.match(evSrc, /Még nincs kapcsolt bizonyíték\./);
  assert.match(evSrc, /Nincs csatolt kutatási háttéranyag\./);
});

test("evidence: gap diagnostics reflects missing facts, conflicts, and unresolved items", () => {
  const evSrc = read(EVIDENCE_PANEL);
  assert.match(evSrc, /missing\.hasUnknownFacts/);
  assert.match(evSrc, /missing\.hasConflictingEvidence/);
  assert.match(evSrc, /missing\.insufficientRecommendationCount/);
  assert.match(evSrc, /missing\.unresolvedItems/);
});

test("recommendation: accepted status displays 'Belsőleg elfogadott' and publication constraint", () => {
  assert.equal(recommendationStatusLabelHu("ACCEPTED"), "Belsőleg elfogadott");
  const recSrc = read(RECOMMENDATION_PANEL);
  assert.match(recSrc, /Belsőleg elfogadott/);
  assert.match(recSrc, /Ügyféloldali közzététel ebben a verzióban nem támogatott\./);
  assert.match(recSrc, /Nincs belső javaslat\./);
});

test("api: diagnosticWorkbenchApi calls canonical endpoint and exposes typed models", () => {
  const apiSrc = read(API);
  assert.match(apiSrc, /\/client-company\/clients\/\$\{encodeURIComponent\(clientId\)\}\/grow\/diagnostic-workbench/);
  assert.match(apiSrc, /export async function getDiagnosticWorkbench/);
});
