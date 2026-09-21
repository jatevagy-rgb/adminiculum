/**
 * WORKFORCE GROW JOURNEY — truthful progression + presentation de-duplication.
 *
 * Locks the targeted repair of `GrowJourney.tsx` (workforce/internal journey):
 *  1. the five entries are reachable destinations, not a false gated wizard;
 *  2. "Részletek" truthfully states that an opportunity must be selected first;
 *  3. an opportunity whose title equals the problem statement is not printed twice;
 *  4. the methodology block is a secondary reference, not the current state.
 *
 * Everything the journey already did (evidence, decision, research, initiatives,
 * outcomes, process map, customer publication) must survive unchanged.
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

test("the five Grow entries are reachable destinations, not a gated wizard", () => {
  const src = read(JOURNEY);
  // The false gate is gone: no disabled destination and no disabled styling rule.
  assert.doesNotMatch(src, /disabled=\{item\.disabled\}/);
  assert.doesNotMatch(src, /disabled:opacity-40 disabled:hover:bg-transparent/);
  assert.doesNotMatch(src, /disabled\?: boolean/);
  // Every destination is rendered with an explicit, testable handle.
  assert.match(src, /data-testid=\{`grow-destination-\$\{item\.id\}`\}/);
  assert.match(src, /aria-current=\{active \? "step" : undefined\}/);
  // All five screens survive.
  for (const screen of ["home", "feed", "detail", "progress", "results"]) {
    assert.match(src, new RegExp(`screen === "${screen}"`));
    assert.match(src, new RegExp(`id: "${screen}"`));
  }
});

test("navigation states are derived from canonical DTO data only", () => {
  const src = read(JOURNEY);
  // Real loaded arrays/records drive the hints; nothing synthetic is introduced.
  assert.match(src, /const activeInitiativeCount = initiatives\.filter/);
  assert.match(src, /\["PLANNED", "ACTIVE", "ON_HOLD"\]\.includes\(i\.status\)/);
  assert.match(src, /hint: opportunities\.length > 0/);
  assert.match(src, /hint: selectedId \?/);
  assert.match(src, /hint: activeInitiativeCount > 0/);
  assert.match(src, /hint: outcomes\.length > 0/);
  assert.match(src, /\{item\.hint\}/);
});

test("navigation distinguishes destinations from the gated detail context", () => {
  const src = read(JOURNEY);
  assert.match(src, /Mindegyik nézet bármikor elérhető\./);
  assert.match(src, /A „Részletek” nem sorrendi lépés/);
  // "Részletek" communicates the selection requirement instead of looking broken.
  assert.match(src, /"Előbb válassz lehetőséget"/);
  assert.match(src, /"Kiválasztott lehetőség"/);
});

test("the detail empty state is actionable and truthful", () => {
  const src = read(JOURNEY);
  assert.match(src, /A részletek nézet egy kiválasztott javítási lehetőséghez tartozik/);
  assert.match(src, /Ez nem sorrendi lépés: a többi nézet addig is elérhető\./);
  assert.match(src, /onClick=\{onShowFeed\}/);
  assert.match(src, /Javítási lehetőségek megnyitása/);
  // The parent wires the empty state back to the opportunity list.
  assert.match(src, /onShowFeed=\{\(\) => setScreen\("feed"\)\}/);
});

test("identical normalized title and problem statement are never printed twice", () => {
  const src = read(JOURNEY);
  assert.match(src, /function normalizeComparableText/);
  assert.match(src, /\.replace\(\/\\s\+\/g, " "\)/);
  assert.match(src, /function repeatsComparableText/);
  // Feed card: skip the second print, keep the underlying DTO untouched.
  assert.match(src, /repeatsComparableText\(opp\.title, opp\.problemStatement\) \? null/);
  // Detail: title (header) vs problem statement ("Mi lehet az oka?").
  assert.match(src, /const problemRepeatsTitle = repeatsComparableText\(detail\.title, detail\.problemStatement\)/);
  assert.match(src, /\{problemRepeatsTitle \? \(/);
  // Publication internal preview.
  assert.match(src, /repeatsComparableText\(internalTitle, internalProblem\) \? null/);
  // The real problem statement still renders whenever it is not a repeat.
  assert.match(src, /\{detail\.problemStatement\}/);
  // Source data is compared, never reassigned or blanked.
  assert.doesNotMatch(src, /detail\.problemStatement\s*=\s*["'`]/);
  assert.doesNotMatch(src, /opp\.problemStatement\s*=\s*["'`]/);
});

test("the methodology block is demoted to a labelled reference", () => {
  const src = read(JOURNEY);
  assert.match(src, /data-testid="grow-method-reference"/);
  assert.match(src, /Módszertani háttér/);
  assert.match(src, /nem a cég aktuális állapota/);
  assert.match(src, /A jelenlegi helyzetet az\s+„Áttekintés” és a „Folyamatban” nézetek mutatják\./);
  // The former high-prominence tinted hero card and large serif heading are gone.
  assert.doesNotMatch(src, /bg-\[#faf6ee\]\/80 p-6 sm:p-7/);
  assert.doesNotMatch(src, /text-xl font-bold text-\[#1b382b\]">A fejlődés 5 mérföldköve/);
  assert.match(src, /text-sm font-semibold text-\[#1b382b\]">A fejlődés 5 mérföldköve/);
  // The internal-workflow pill is no longer a filled badge.
  assert.doesNotMatch(src, /Grow with us · Belső munkafolyamat/);
  assert.match(src, /Grow with us · Belső nézet/);
});

test("every existing journey capability is preserved", () => {
  const src = read(JOURNEY);
  // Evidence
  assert.match(src, /evidence-basis-summary/);
  assert.match(src, /evidence-drawer/);
  assert.match(src, /Bizonyíték fiók bezárása/);
  assert.match(src, /evidenceBasisLabelHu/);
  // Human decision
  assert.match(src, /reviewOpportunity\(clientId, detail\.id, decision/);
  assert.match(src, /decide\("ACCEPT"\)/);
  assert.match(src, /decide\("DECLINE"\)/);
  assert.match(src, /decide\("REQUEST_MORE_INFO"\)/);
  // Research
  assert.match(src, /Új mérési és kutatási futás/);
  assert.match(src, /runResearch/);
  assert.match(src, /canRunResearch/);
  // Initiatives + milestones
  assert.match(src, /initiative-cockpit/);
  assert.match(src, /Kezdeményezés indítása/);
  assert.match(src, /Mérföldkövek/);
  // Outcomes
  assert.match(src, /Feltételezés — nem elért eredmény/);
  assert.match(src, /Mért eredmények/);
  // Process map
  assert.match(src, /GrowProcessMap/);
  assert.match(src, /Folyamatok lépésről lépésre/);
  // Customer publication stays a separate explicit path
  assert.match(src, /Ügyfél-közzététel/);
  assert.match(src, /Az előkészítés nem tesz közzé semmit/);
});

test("no synthetic score or percentage is introduced", () => {
  const src = read(JOURNEY);
  assert.doesNotMatch(src, /maturityScore|maturityPercent|maturityLevel/i);
  assert.doesNotMatch(src, /százalék/i);
  // The only score mention stays the honest negative disclaimer.
  assert.match(src, /Nincs érettségi pontszám\./);
});

test("the customer Grow surface is untouched by this repair", () => {
  const src = read(CUSTOMER_VIEW);
  assert.match(src, /data-testid="grow-feltaras-section"/);
  assert.doesNotMatch(src, /grow-destination-/);
  assert.doesNotMatch(src, /grow-method-reference/);
});
