import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The lightweight "Gyors működési jelzés / Hol érdemes javítani?" customer signal
 * is an OVERVIEW capability. It must render exactly once, on the Áttekintés tab,
 * and must NOT be duplicated inside the formal "Felmérések / diagnózisok" journey.
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

const overview = () => tabBlock(read(VIEW), "attekintes", "felmeresek");
const assessments = () => tabBlock(read(VIEW), "felmeresek", "folyamatok");

describe("Grow quick operational signal renders exactly once, on Overview", () => {
  it("1-3. Overview renders exactly one quick-signal section, title and question", () => {
    const block = overview();
    assert.equal(count(block, FEELTARAS), 1, "Overview must render exactly one grow-feltaras-section");
    assert.equal(count(block, QUICK_TITLE), 1, "Overview must render the quick-signal title exactly once");
    assert.equal(count(block, QUICK_QUESTION), 1, "Overview must render the quick-signal question exactly once");
    assert.equal(count(block, NOT_FORMAL), 1, "Overview must state this is not a formal assessment");
  });

  it("4. Overview keeps the category checkboxes", () => {
    const block = overview();
    assert.match(block, /SURVEY_CATEGORY_LABELS_HU/);
    assert.match(block, /type="checkbox"/);
    assert.match(block, /setSelectedCategories/);
  });

  it("5. Overview keeps the optional process selector when processes exist", () => {
    const block = overview();
    assert.match(block, /processes\.length > 0/);
    assert.match(block, /id="survey-process"/);
    assert.match(block, /value=\{selectedProcessId\}/);
    assert.match(block, /setSelectedProcessId/);
  });

  it("6. Overview keeps the free-text input", () => {
    const block = overview();
    assert.match(block, /id="survey-freetext"/);
    assert.match(block, /value=\{freeText\}/);
    assert.match(block, /setFreeText/);
  });

  it("7. Overview keeps the submit wiring", () => {
    const block = overview();
    assert.match(block, /onSubmit=\{handleSurveySubmit\}/);
    assert.match(block, /Visszajelzés beküldése/);
    // The survey API call stays in the component handler, shared by the Overview form.
    assert.match(read(VIEW), /submitPortalGrowSurvey/);
    assert.match(read(VIEW), /const handleSurveySubmit = async/);
  });

  it("8-9. Overview keeps the submitted feedback history and the not-a-formal-assessment note", () => {
    const block = overview();
    assert.ok(block.includes(SURVEY_HISTORY), "survey history heading must remain on Overview");
    assert.match(block, /\{surveys\.length > 0 \?/);
    assert.ok(block.includes(NOT_FORMAL), "the informal-signal distinction must remain");
  });

  it("16. the whole file renders the quick-signal section exactly once", () => {
    const src = read(VIEW);
    assert.equal(count(src, FEELTARAS), 1, "no second grow-feltaras-section may exist");
    assert.equal(count(src, QUICK_TITLE), 1);
    assert.equal(count(src, QUICK_QUESTION), 1);
    assert.equal(count(src, SURVEY_HISTORY), 1);
    // The removed duplicate also carried duplicate DOM ids.
    assert.equal(count(src, 'id="survey-process-felmeres"'), 0);
    assert.equal(count(src, 'id="survey-freetext-felmeres"'), 0);
    assert.equal(count(src, 'id="survey-process"'), 1);
    assert.equal(count(src, 'id="survey-freetext"'), 1);
  });
});

describe("Formal assessments tab no longer duplicates the quick signal", () => {
  it("14-15. Felmérések renders no quick-signal form at all", () => {
    const block = assessments();
    assert.equal(count(block, FEELTARAS), 0, "Felmérések must not render a grow-feltaras-section");
    assert.equal(count(block, QUICK_TITLE), 0, "Felmérések must not render the quick-signal title");
    assert.equal(count(block, QUICK_QUESTION), 0, "Felmérések must not render the quick-signal question");
    assert.equal(count(block, NOT_FORMAL), 0);
    assert.equal(count(block, SURVEY_HISTORY), 0);
    assert.equal(count(block, "SURVEY_CATEGORY_LABELS_HU"), 0);
    // No survey submission or free-text form is left behind either.
    assert.equal(count(block, "submitPortalGrowSurvey"), 0);
    assert.equal(count(block, 'id="survey-freetext"'), 0);
  });

  it("10-13. Felmérések keeps the full formal assessment journey", () => {
    const block = assessments();
    assert.match(block, /data-testid="grow-assessments-section"/);
    assert.match(block, /Cégfelmérések \/ diagnózisok/);
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

  it("17. Folyamatok preserved", () => {
    const block = tabBlock(src(), "folyamatok", "lehetosegek");
    assert.match(block, /Feltérképezett üzleti folyamatok/);
    assert.match(block, /grow-process-flow-/);
  });

  it("18. Lehetőségek preserved (published-only projection)", () => {
    const block = tabBlock(src(), "lehetosegek", "kezdemenyezesek");
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
    const block = tabBlock(src(), "eredmenyek");
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
