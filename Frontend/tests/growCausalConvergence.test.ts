/**
 * GROW WITH US — CAUSAL CONVERGENCE & PRODUCT TRUTHFULNESS TESTS
 *
 * Verifies:
 * 1. 8-step causal chain tracker (grow-causal-chain) and its steps.
 * 2. Company state panel (grow-company-state-panel) with link to /vallalati-mukodes.
 * 3. Diagnostic overview panel (grow-diagnostic-overview-panel) with link to /grow?view=diagnostics.
 * 4. Proposed improvement directions truthful disclaimer (generic directions, NOT products).
 * 5. Initiative cockpit causal breadcrumb & milestone truthfulness notice.
 * 6. Results screen truthfulness notice (no fake ROI or automatic maturity score).
 * 7. Customer portal boundary preservation (OrgGrowView.tsx).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

const JOURNEY = "Frontend/src/components/clients/GrowJourney.tsx";
const CUSTOMER_VIEW = "Frontend/src/components/client-portal/OrgGrowView.tsx";

test("grow-causal-chain tracker renders the complete 8-step causal chain", () => {
  const src = read(JOURNEY);
  assert.match(src, /data-testid="grow-causal-chain"/);

  // Step 1: Vállalati állapot
  assert.match(src, /title: "1\. Vállalati állapot"/);
  assert.match(src, /question: "Mit tudunk a cégről\?"/);

  // Step 2: Diagnosztika
  assert.match(src, /title: "2\. Diagnosztika"/);
  assert.match(src, /question: "Mit azonosítottunk\?"/);

  // Step 3: Támogató jelek
  assert.match(src, /title: "3\. Támogató jelek"/);
  assert.match(src, /question: "Miért gondoljuk ezt\?"/);

  // Step 4: Bizonyítékok
  assert.match(src, /title: "4\. Bizonyítékok"/);
  assert.match(src, /question: "Milyen bizonyíték támasztja alá\?"/);

  // Step 5: Javasolt irányok
  assert.match(src, /title: "5\. Javasolt irányok"/);
  assert.match(src, /question: "Mi javíthat rajta\?"/);

  // Step 6: Döntéshozatal
  assert.match(src, /title: "6\. Döntéshozatal"/);
  assert.match(src, /question: "Miről döntöttünk\?"/);

  // Step 7: Cél & mérföldkövek
  assert.match(src, /title: "7\. Cél & mérföldkövek"/);
  assert.match(src, /question: "Milyen célért dolgozunk\?"/);

  // Step 8: Mért eredmények
  assert.match(src, /title: "8\. Mért eredmények"/);
  assert.match(src, /question: "Mit értünk el ténylegesen\?"/);
});

test("grow-company-state-panel reflects real operating profile and links to /vallalati-mukodes", () => {
  const src = read(JOURNEY);
  assert.match(src, /data-testid="grow-company-state-panel"/);
  assert.match(src, /\/clients\/\$\{clientId\}\/vallalati-mukodes/);
  assert.match(src, /Vállalati működés →/);
  assert.match(src, /workbench\?\.client\.operatingProfile/);
  assert.match(src, /f\.verificationStatus === "VERIFIED"/);
  assert.match(src, /workbench\?\.missing\.hasUnknownFacts/);
});

test("grow-diagnostic-overview-panel reflects workbench state and links to /grow?view=diagnostics", () => {
  const src = read(JOURNEY);
  assert.match(src, /data-testid="grow-diagnostic-overview-panel"/);
  assert.match(src, /\/clients\/\$\{clientId\}\/grow\?view=diagnostics/);
  assert.match(src, /Részletes diagnosztikai munkaasztal/);
  assert.match(src, /workbench\?\.problems\.diagnoses/);
  assert.match(src, /workbench\?\.observed\.observations/);
  assert.match(src, /workbench\?\.observed\.processSnapshots/);
  assert.match(src, /workbench\?\.missing\.unresolvedItems/);
});

test("proposed directions are labeled truthfully without fake product claims", () => {
  const src = read(JOURNEY);
  assert.match(src, /Javasolt fejlesztési irányok/);
  assert.match(src, /Általános fejlesztési irányok — nem megvásárolható külső termékek/);
  assert.match(src, /nem BlackBelt termékek és nem véglegesített megvalósítási tervek/);
  assert.match(src, /Kezdeményezés megtekintése a Folyamatban nézetben/);
});

test("initiative cockpit contains causal breadcrumb and milestone truthfulness notice", () => {
  const src = read(JOURNEY);
  assert.match(src, /Diagnózis → Javítási lehetőség:[\s\S]*?→ Kezdeményezés → Mérföldkövek → Eredmény/);
  assert.match(src, /A határidő lejárta nem azonos elért üzleti hatással/);
});

test("results screen adheres to truthful impact doctrine without fake scores or ROI", () => {
  const src = read(JOURNEY);
  assert.match(src, /A hatásvizsgálat kizárólag azonos ügyfél azonos folyamatához tartozó/);
  assert.match(src, /rögzített előtte\/utána mérésekből származik/);
  assert.match(src, /A rendszer nem számol fiktív megtérülést vagy automatikus sikerességi pontszámot/);
});

test("customer portal boundary remains strictly preserved and isolated from internal workbench", () => {
  const custSrc = read(CUSTOMER_VIEW);
  assert.doesNotMatch(custSrc, /getDiagnosticWorkbench/);
  assert.doesNotMatch(custSrc, /grow-diagnostic-overview-panel/);
  assert.doesNotMatch(custSrc, /grow-company-state-panel/);
  assert.doesNotMatch(custSrc, /unresolvedItems/);
  assert.doesNotMatch(custSrc, /research-drawer/);
  assert.doesNotMatch(custSrc, /RecommendationCandidate/);
  assert.doesNotMatch(custSrc, /DiagnosisCandidate/);
  assert.match(custSrc, /data-testid="grow-feltaras-section"/);
  assert.match(custSrc, /data-testid="grow-opportunities-section"/);
  assert.match(custSrc, /data-testid="grow-initiative-detail"/);
});
