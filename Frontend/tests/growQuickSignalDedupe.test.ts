import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The lightweight "Gyors működési jelzés / Hol érdemes javítani?" customer signal
 * is an INPUT CHANNEL. In the canonical customer Grow IA it belongs to the
 * "Teendők" tab — together with the formal assessments — and must NOT dominate
 * the "Áttekintés" tab.
 *
 * This is a presentation/IA boundary: the signal and the formal assessments are
 * different capabilities and neither may be removed.
 */

const root = process.cwd();
const VIEW = "src/components/client-portal/OrgGrowView.tsx";
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const FEELTARAS = 'data-testid="grow-feltaras-section"';
const QUICK_TITLE = "Gyors működési jelzés";
const QUICK_QUESTION = "Hol érdemes javítani?";
const NOT_FORMAL = "nem formális felmérés";
const SURVEY_HISTORY = "Korábban beküldött működési visszajelzések";

/** Slice a single tab's rendered block out of the activeTab conditional chain. */
function tabBlock(src: string, tab: string, nextTab?: string): string {
  const marker = `{activeTab === "${tab}" ? (`;
  const start = src.indexOf(marker);
  assert.ok(start > -1, `tab ${tab} not found`);
  if (!nextTab) return src.slice(start);
  const end = src.indexOf(`{activeTab === "${nextTab}" ? (`, start);
  assert.ok(end > start, `next tab ${nextTab} not found`);
  return src.slice(start, end);
}

const overview = () => tabBlock(read(VIEW), "attekintes", "teendok");
const teendok = () => tabBlock(read(VIEW), "teendok", "fejlesztesi-iranyok");

describe("Grow survey/input channel lives in Teendők and never leads Áttekintés", () => {
  it("1-3. Teendők renders exactly one quick-signal section, title and question", () => {
    const block = teendok();
    assert.equal(count(block, FEELTARAS), 1, "Teendők must render exactly one grow-feltaras-section");
    assert.equal(count(block, QUICK_TITLE), 1, "Teendők must render the quick-signal title exactly once");
    assert.equal(count(block, QUICK_QUESTION), 1, "Teendők must render the quick-signal question exactly once");
    assert.equal(count(block, NOT_FORMAL), 1, "Teendők must state this is not a formal assessment");
  });

  it("Overview must not lead with the survey/assessment input channel", () => {
    const block = overview();
    assert.equal(count(block, FEELTARAS), 0, "Overview must not render grow-feltaras-section");
    assert.equal(count(block, QUICK_TITLE), 0);
    assert.equal(count(block, QUICK_QUESTION), 0);
  });

  it("4. Teendők keeps the category checkboxes", () => {
    const block = teendok();
    assert.match(block, /SURVEY_CATEGORY_LABELS_HU/);
    assert.match(block, /type="checkbox"/);
    assert.match(block, /setSelectedCategories/);
  });

  it("5. Teendők keeps the optional process selector when processes exist", () => {
    const block = teendok();
    assert.match(block, /processes\.length > 0/);
    assert.match(block, /id="survey-process"/);
    assert.match(block, /value=\{selectedProcessId\}/);
    assert.match(block, /setSelectedProcessId/);
  });

  it("6. Teendők keeps the free-text input", () => {
    const block = teendok();
    assert.match(block, /id="survey-freetext"/);
    assert.match(block, /value=\{freeText\}/);
    assert.match(block, /setFreeText/);
  });

  it("7. Teendők keeps the submit wiring", () => {
    const block = teendok();
    assert.match(block, /onSubmit=\{handleSurveySubmit\}/);
    assert.match(block, /Visszajelzés beküldése/);
    assert.match(read(VIEW), /submitPortalGrowSurvey/);
    assert.match(read(VIEW), /const handleSurveySubmit = async/);
  });

  it("8-9. Teendők keeps the submitted feedback history and the not-a-formal-assessment note", () => {
    const block = teendok();
    assert.ok(block.includes(SURVEY_HISTORY), "survey history heading must remain in Teendők");
    assert.match(block, /\{surveys\.length > 0 \?/);
    assert.ok(block.includes(NOT_FORMAL), "the informal-signal distinction must remain");
  });

  it("16. the whole file renders the quick-signal section exactly once", () => {
    const src = read(VIEW);
    assert.equal(count(src, FEELTARAS), 1, "no second grow-feltaras-section may exist");
    assert.equal(count(src, QUICK_TITLE), 1);
    assert.equal(count(src, QUICK_QUESTION), 1);
    assert.equal(count(src, SURVEY_HISTORY), 1);
    assert.equal(count(src, 'id="survey-process-felmeres"'), 0);
    assert.equal(count(src, 'id="survey-freetext-felmeres"'), 0);
    assert.equal(count(src, 'id="survey-process"'), 1);
    assert.equal(count(src, 'id="survey-freetext"'), 1);
  });
});

describe("Teendők keeps the full formal assessment journey", () => {
  it("10-15. Teendők renders the assessment catalogue, runner and result states", () => {
    const block = teendok();
    assert.match(block, /data-testid="grow-assessments-section"/);
    assert.match(block, /Felmérési csomagok/);
    assert.match(block, /data-testid="grow-assessment-catalogue"/);
    assert.match(block, /data-testid="grow-assessment-runner"/);
    assert.match(block, /data-testid="grow-assessment-result"/);
    assert.match(block, /data-testid="grow-assessment-result-unavailable"/);
    assert.match(block, /Újra kitöltöm/);
    assert.match(block, /Módszertani alapelv/);
    // The assessment loader/submit wiring lives in component scope, not in the tab JSX.
    assert.match(read(VIEW), /listPortalGrowAssessments/);
    assert.match(read(VIEW), /submitPortalGrowAssessment/);
  });
});

describe("Other Grow tabs and URL state remain intact", () => {
  const src = () => read(VIEW);

  it("17. Működés preserved", () => {
    const block = tabBlock(src(), "mukodes");
    assert.match(block, /Feltérképezett üzleti folyamatok/);
    assert.match(block, /grow-process-flow-/);
  });

  it("18. Fejlesztési irányok preserved (published-only projection)", () => {
    const block = tabBlock(src(), "fejlesztesi-iranyok", "kezdemenyezesek");
    assert.match(block, /data-testid="grow-opportunities-section"/);
    assert.match(block, /data-testid="grow-opportunity-item"/);
    assert.match(block, /data-testid="grow-opportunity-detail"/);
  });

  it("19. Kezdeményezések preserved", () => {
    const block = tabBlock(src(), "kezdemenyezesek", "eredmenyek");
    assert.match(block, /data-testid="grow-initiative-detail"/);
    assert.match(block, /data-testid="grow-initiative-milestone"/);
  });

  it("20. Eredmények preserved", () => {
    const block = tabBlock(src(), "eredmenyek", "mukodes");
    assert.match(block, /measuredOutcomes/);
    assert.match(block, /estimatedOutcomes/);
  });

  it("21-22. tab, opportunity and initiative URL state preserved", () => {
    const source = src();
    assert.match(source, /url\.searchParams\.set\("tab", tab\)/);
    assert.match(source, /url\.searchParams\.set\("opportunity", pubId\)/);
    assert.match(source, /url\.searchParams\.delete\("opportunity"\)/);
    assert.match(source, /url\.searchParams\.set\("initiative", initiativeId\)/);
    assert.match(source, /window\.addEventListener\("popstate"/);
  });
});

describe("Grow customer-safe boundary unchanged", () => {
  it("23-26. no raw recommendation, research, responsible person or ASSUMED outcome", () => {
    const source = read(VIEW);
    for (const forbidden of ["responsiblePerson", "rawRecommendation", "rawResearch", "ASSUMED", "assessmentFinding", "workInstruction", "internalNotes"]) {
      assert.equal(count(source, forbidden), 0, `Grow must not expose ${forbidden}`);
    }
  });
});
