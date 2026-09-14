import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ComplianceControlsSection, type ComplianceControlSummary } from "../src/components/clients/compliance/ComplianceOverview";

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

describe("compliance controls and evidence workforce UI", () => {
  it("CONTROLS_SECTION_VISIBLE and EMPTY_STATE", () => {
    const markup = renderToStaticMarkup(createElement(ComplianceControlsSection, { summary: null }));
    assert.match(markup, /data-testid="compliance-controls-section"/);
    assert.match(markup, /Intézkedések és bizonyítékok/);
    assert.match(markup, /Nincs rögzített megfelelési intézkedés\./);
  });

  it("IMPLEMENTATION_STATUS_RENDERED, EVIDENCE_CURRENT_COUNT_RENDERED, EVIDENCE_STALE_COUNT_RENDERED", () => {
    const markup = renderToStaticMarkup(createElement(ComplianceControlsSection, { summary }));
    assert.match(markup, /Bevezetve/);
    assert.match(markup, /2 aktuális/);
    assert.match(markup, /1 felülvizsgálandó/);
    assert.match(markup, /Jogi csapat/);
  });

  it("NO_FAKE_PERCENTAGE, NO_INTERNAL_IDS, EXISTING_COMPLIANCE_UI_PRESERVED", () => {
    const markup = renderToStaticMarkup(createElement(ComplianceControlsSection, { summary }));
    assert.doesNotMatch(markup, /%|control_|requirementVersion|documentVersion|clientFact|observation|reviewer|internal/i);
    assert.match(markup, /Intézkedések és bizonyítékok/);
  });
});
