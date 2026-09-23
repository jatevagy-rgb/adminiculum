import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ComplianceControlEvidencePanel,
  ComplianceControlsSection,
  complianceEvidenceSourceLabels,
  complianceEvidenceStatusLabels,
  type ComplianceControlSummary,
} from "../src/components/clients/compliance/ComplianceOverview";

type ControlEntry = ComplianceControlSummary["requirements"][number]["controls"][number];

const noop = () => {};

const evidenceControl: ControlEntry = {
  title: "Hozzáférések rendszeres felülvizsgálata",
  controlDefinitionId: "ctrl_def_1",
  controlId: "ctrl_1",
  implementationStatus: "IMPLEMENTED",
  owner: "Jogi csapat",
  nextReviewAt: "2026-11-01T00:00:00.000Z",
  evidenceSummary: { acceptedCurrent: 1, stale: 0, missing: false },
  evidence: [
    { id: "ev_1", title: "Felülvizsgálati jegyzőkönyv", status: "ACCEPTED", sourceType: "DOCUMENT_VERSION", validFrom: null, validUntil: null },
    { id: "ev_2", title: "Külső szabályzat", status: "PROVIDED", sourceType: "EXTERNAL_REFERENCE", validFrom: null, validUntil: null },
  ],
};

function renderPanel(control: ControlEntry, adding = false) {
  return renderToStaticMarkup(createElement(ComplianceControlEvidencePanel, {
    control,
    busy: false,
    adding,
    title: "",
    reference: "",
    error: null,
    onToggleAdd: noop,
    onTitleChange: noop,
    onReferenceChange: noop,
    onCancelAdd: noop,
    onSubmitAdd: noop,
    onReview: noop,
  }));
}

describe("compliance evidence recording and review workforce UI", () => {
  it("EVIDENCE_LABELS_HUMAN_FACING: source and status labels never expose machine enums", () => {
    assert.equal(complianceEvidenceSourceLabels.DOCUMENT_VERSION, "Dokumentumverzió");
    assert.equal(complianceEvidenceSourceLabels.CLIENT_FACT, "Vállalati adat");
    assert.equal(complianceEvidenceSourceLabels.OBSERVATION, "Megfigyelés");
    assert.equal(complianceEvidenceSourceLabels.EXTERNAL_REFERENCE, "Külső hivatkozás");
    assert.equal(complianceEvidenceStatusLabels.PROVIDED, "Rögzítve");
    assert.equal(complianceEvidenceStatusLabels.ACCEPTED, "Elfogadva");
    assert.equal(complianceEvidenceStatusLabels.REJECTED, "Elutasítva");
    for (const label of Object.values(complianceEvidenceSourceLabels).concat(Object.values(complianceEvidenceStatusLabels))) {
      assert.doesNotMatch(label, /control_|requirementVersion|documentVersion|clientFact|observation|reviewer|internal|sourceVersion|%/i);
    }
  });

  it("EVIDENCE_RECORDED_AND_REVIEWABLE: evidence list renders human labels and review controls without leaking internal ids", () => {
    const markup = renderPanel(evidenceControl);
    assert.match(markup, /Felülvizsgálati jegyzőkönyv/);
    assert.match(markup, /Dokumentumverzió/);
    assert.match(markup, /Elfogadva/);
    assert.match(markup, /Külső szabályzat/);
    assert.match(markup, /Elfogadás/);
    assert.match(markup, /Elutasítás/);
    assert.match(markup, /Bizonyíték hozzáadása/);
    assert.doesNotMatch(markup, /%|control_|requirementVersion|documentVersion|clientFact|observation|reviewer|internal|sourceVersion|ev_1|ev_2|ctrl_1|ctrl_def_1/i);
  });

  it("EVIDENCE_REVIEW_ACTIONS_ONLY_FOR_PENDING: accepted evidence shows no accept/reject affordance", () => {
    const onlyAccepted: ControlEntry = {
      ...evidenceControl,
      evidence: [{ id: "ev_1", title: "Elfogadott jegyzőkönyv", status: "ACCEPTED", sourceType: "EXTERNAL_REFERENCE", validFrom: null, validUntil: null }],
    };
    const markup = renderPanel(onlyAccepted);
    assert.match(markup, /Elfogadott jegyzőkönyv/);
    assert.doesNotMatch(markup, /Elfogadás/);
    assert.doesNotMatch(markup, /Elutasítás/);
  });

  it("EVIDENCE_ADD_FORM_HONEST: empty state and add form render without machine fields", () => {
    const empty = renderPanel({ ...evidenceControl, evidence: [] });
    assert.match(empty, /nincs rögzített bizonyíték/);
    assert.match(empty, /Bizonyíték hozzáadása/);
    const form = renderPanel({ ...evidenceControl, evidence: [] }, true);
    assert.match(form, /Bizonyíték címe/);
    assert.match(form, /Külső hivatkozás/);
    assert.doesNotMatch(form, /documentVersion|clientFact|observation|reviewer|internal|%/i);
  });

  it("CONTROLS_SECTION_EVIDENCE_AFFORDANCE: evidence management appears only when a client is wired", () => {
    const successState = { status: "success" as const, summary: { requirements: [{ title: "T", controls: [evidenceControl] }] } };
    const wired = renderToStaticMarkup(createElement(ComplianceControlsSection, { state: successState, onRetry: noop, clientId: "client-1", onChanged: noop }));
    assert.match(wired, /Bizonyítékok kezelése/);
    const readOnly = renderToStaticMarkup(createElement(ComplianceControlsSection, { state: successState, onRetry: noop }));
    assert.doesNotMatch(readOnly, /Bizonyítékok kezelése/);
    assert.doesNotMatch(readOnly, /ev_1|ctrl_1|ctrl_def_1|documentVersion|clientFact|observation|reviewer|internal|%/i);
  });
});
