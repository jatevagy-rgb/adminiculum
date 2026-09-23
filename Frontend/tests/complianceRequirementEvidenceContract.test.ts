import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ComplianceControlsSection,
  type ComplianceControlSummary,
} from "../src/components/clients/compliance/ComplianceOverview";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const retry = () => {};

const summary: ComplianceControlSummary = {
  requirements: [{
    title: "Hozzáférés-kezelés",
    controls: [{
      title: "Hozzáférési jogosultságok felülvizsgálata",
      description: "Csatolja a legutóbbi jogosultsági felülvizsgálat jegyzőkönyvét.",
      type: "PROCEDURAL",
      reviewCadenceDays: 365,
      implementationStatus: "IMPLEMENTED",
      owner: "Jogi csapat",
      lastReviewedAt: "2026-09-01T00:00:00.000Z",
      nextReviewAt: "2026-11-01T00:00:00.000Z",
      evidenceSummary: { acceptedCurrent: 1, stale: 1, missing: false },
      evidence: [
        { title: "Felülvizsgálati jegyzőkönyv 2026", status: "ACCEPTED", validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2099-01-01T00:00:00.000Z", freshness: "CURRENT" },
        { title: "Korábbi jegyzőkönyv", status: "ACCEPTED", validFrom: null, validUntil: "2020-01-01T00:00:00.000Z", freshness: "STALE" },
      ],
      gap: "EVIDENCED",
    }],
  }],
};

describe("compliance requirement -> evidence contract (workforce UI)", () => {
  it("renders WHAT_EVIDENCE_IS_EXPECTED from the persisted control description and cadence", () => {
    const markup = renderToStaticMarkup(createElement(ComplianceControlsSection, { state: { status: "success", summary }, onRetry: retry }));
    assert.match(markup, /Elvárt bizonyíték:/);
    assert.match(markup, /jogosultsági felülvizsgálat jegyzőkönyvét/);
    assert.match(markup, /Felülvizsgálati ütem: 365 nap/);
  });

  it("renders RECORDED_EVIDENCE with freshness and expiry, keeping current and stale distinct", () => {
    const markup = renderToStaticMarkup(createElement(ComplianceControlsSection, { state: { status: "success", summary }, onRetry: retry }));
    assert.match(markup, /Felülvizsgálati jegyzőkönyv 2026/);
    assert.match(markup, /Érvényes/);
    assert.match(markup, /Nem érvényes/);
    assert.match(markup, /2099/);
    assert.match(markup, /1 aktuális/);
    assert.match(markup, /1 felülvizsgálandó/);
  });

  it("is honest when a control has no recorded evidence", () => {
    const noEvidence: ComplianceControlSummary = {
      requirements: [{ title: "K", controls: [{ title: "C", implementationStatus: "IMPLEMENTED", owner: null, nextReviewAt: null, evidenceSummary: { acceptedCurrent: 0, stale: 0, missing: true }, evidence: [], gap: "MISSING_EVIDENCE" }] }],
    };
    const markup = renderToStaticMarkup(createElement(ComplianceControlsSection, { state: { status: "success", summary: noEvidence }, onRetry: retry }));
    assert.match(markup, /Nincs csatolt bizonyíték\./);
    assert.match(markup, /Hiányzó bizonyíték/);
  });

  it("does not introduce a fabricated compliance score or leak internal identifiers", () => {
    const markup = renderToStaticMarkup(createElement(ComplianceControlsSection, { state: { status: "success", summary }, onRetry: retry }));
    assert.doesNotMatch(markup, /%|control_|requirementVersion|documentVersion|clientFact|observation|snapshot|ruleAst/i);
  });

  it("projects the requirement normative statement on the workforce workspace only", () => {
    assert.match(read("src/lib/complianceWorkspaceApi.ts"), /normativeStatement: string \| null;/);
    const page = read("src/app/clients/[clientId]/compliance/page.tsx");
    assert.match(page, /Előírt követelmény/);
    assert.match(page, /area\.normativeStatement/);
    // The customer portal surface must not receive internal requirement wording.
    assert.doesNotMatch(read("src/components/client-portal/OrgComplianceView.tsx"), /normativeStatement/);
  });
});
