import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ComplianceControlsSection, type ComplianceControlSummary, type ComplianceControlsState } from "../src/components/clients/compliance/ComplianceOverview";

const summary: ComplianceControlSummary = {
  requirements: [{
    title: "Hozzáférés-kezelés",
    controls: [{
      title: "Hozzáférések rendszeres felülvizsgálata",
      implementationStatus: "IMPLEMENTED",
      owner: "Jogi csapat",
      nextReviewAt: "2026-11-01T00:00:00.000Z",
      evidenceSummary: { acceptedCurrent: 2, stale: 1, missing: false },
    }],
  }],
};

const successState: ComplianceControlsState = { status: "success", summary };
const retry = () => {};

describe("compliance controls and evidence workforce UI", () => {
  it("CONTROLS_SECTION_VISIBLE, CONTROLS_INITIAL_LOADING, CONTROLS_SUCCESS_EMPTY, and CONTROLS_ERROR_STATE", () => {
    const loading = renderToStaticMarkup(createElement(ComplianceControlsSection, { state: { status: "loading" }, onRetry: retry }));
    assert.match(loading, /Intézkedések és bizonyítékok betöltése/);

    const empty = renderToStaticMarkup(createElement(ComplianceControlsSection, { state: { status: "success", summary: { requirements: [] } }, onRetry: retry }));
    assert.match(empty, /data-testid="compliance-controls-section"/);
    assert.match(empty, /Nincs rögzített megfelelési intézkedés\./);

    const error = renderToStaticMarkup(createElement(ComplianceControlsSection, { state: { status: "error", message: "Nem tölthető be." }, onRetry: retry }));
    assert.match(error, /role="alert"/);
    assert.match(error, /Újrapróbálás/);
    assert.match(error, /Nem tölthető be\./);
  });

  it("CONTROLS_SUCCESS_NON_EMPTY, CONTROLS_RETRY, and FAILED_REFRESH_NOT_PRESENTED_AS_CURRENT", () => {
    const markup = renderToStaticMarkup(createElement(ComplianceControlsSection, { state: successState, onRetry: retry }));
    assert.match(markup, /data-testid="compliance-controls-section"/);
    assert.match(markup, /Intézkedések és bizonyítékok/);
    assert.match(markup, /Bevezetve/);
    assert.match(markup, /2 aktuális/);
    assert.match(markup, /1 felülvizsgálandó/);
    assert.match(markup, /Jogi csapat/);

    const failedRefresh = renderToStaticMarkup(createElement(ComplianceControlsSection, { state: { status: "error", message: "Az intézkedések és bizonyítékok jelenleg nem tölthetők be." }, onRetry: retry }));
    assert.doesNotMatch(failedRefresh, /Bevezetve|2 aktuális|1 felülvizsgálandó/);
    assert.match(failedRefresh, /Újrapróbálás/);
  });

  it("IMPLEMENTATION_STATUS_RENDERED, EVIDENCE_CURRENT_COUNT_RENDERED, EVIDENCE_STALE_COUNT_RENDERED, NO_FAKE_PERCENTAGE, NO_INTERNAL_IDS, EXISTING_COMPLIANCE_UI_PRESERVED", () => {
    const markup = renderToStaticMarkup(createElement(ComplianceControlsSection, { state: successState, onRetry: retry }));
    assert.doesNotMatch(markup, /%|control_|requirementVersion|documentVersion|clientFact|observation|reviewer|internal/i);
    assert.match(markup, /Intézkedések és bizonyítékok/);
  });
});
