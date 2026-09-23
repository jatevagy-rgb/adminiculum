import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ComplianceControlsSection,
  ComplianceControlEvidencePanel,
  complianceEvidenceSourceLabels,
  complianceEvidenceStatusLabels,
  complianceEvidenceFreshnessLabels,
  deriveControlEvidenceGap,
  type ComplianceControlSummary,
} from "../src/components/clients/compliance/ComplianceOverview";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const noop = () => {};

describe("compliance convergence E2E chain & invariants (#351 + #354)", () => {
  it("LAW_CHAIN: verifies full chain (why applies -> required -> expected evidence -> recorded -> freshness -> review due)", () => {
    const summary: ComplianceControlSummary = {
      requirements: [{
        title: "Kétlépcsős azonosítás előírása",
        applicability: "APPLIES",
        controls: [{
          title: "MFA kötelezővé tétele rendszergazdáknak",
          description: "MFA beállítási szabályzat és audit napló csatolása szükséges.",
          type: "TECHNICAL",
          reviewCadenceDays: 180,
          implementationStatus: "IMPLEMENTED",
          owner: "IT Biztonsági Vezető",
          nextReviewAt: "2026-12-15T00:00:00.000Z",
          evidenceSummary: { acceptedCurrent: 1, stale: 1, missing: false },
          evidence: [
            {
              id: "ev-doc-v1",
              title: "MFA Szabályzat v1.2",
              sourceType: "DOCUMENT_VERSION",
              documentVersionId: "doc-ver-12345",
              status: "ACCEPTED",
              validFrom: "2026-01-01T00:00:00.000Z",
              validUntil: "2027-01-01T00:00:00.000Z",
              freshness: "CURRENT",
            },
            {
              id: "ev-ext-old",
              title: "Előző évi audit jelentés",
              sourceType: "EXTERNAL_REFERENCE",
              status: "ACCEPTED",
              validFrom: "2024-01-01T00:00:00.000Z",
              validUntil: "2025-01-01T00:00:00.000Z",
              freshness: "STALE",
            },
          ],
          gap: "EVIDENCED",
        }],
      }],
    };

    const markup = renderToStaticMarkup(createElement(ComplianceControlsSection, {
      state: { status: "success", summary },
      onRetry: noop,
      clientId: "client-test-1",
      onChanged: noop,
    }));

    // WHAT IS REQUIRED & EXPECTED
    assert.match(markup, /MFA kötelezővé tétele rendszergazdáknak/);
    assert.match(markup, /Elvárt bizonyíték:/);
    assert.match(markup, /MFA beállítási szabályzat és audit napló/);
    assert.match(markup, /Felülvizsgálati ütem: 180 nap/);

    // WHAT EVIDENCE EXISTS & FRESHNESS
    assert.match(markup, /MFA Szabályzat v1\.2/);
    assert.match(markup, /Érvényes/);
    assert.match(markup, /Előző évi audit jelentés/);
    assert.match(markup, /Nem érvényes \/ lejárt/);

    // WHEN IS REVIEW DUE
    assert.match(markup, /Következő felülvizsgálat: 2026-12-15/);

    // INTERACTIVE EVIDENCE ACTIONS
    assert.match(markup, /Bizonyítékok kezelése/);

    // INVARIANT: exact internal ids never leak to presentation
    assert.doesNotMatch(markup, /ev-doc-v1|doc-ver-12345|ev-ext-old|client-test-1/);
  });

  it("INVARIANT: evidence missing != compliant, stale != current", () => {
    // Missing evidence must yield MISSING_EVIDENCE gap
    const missingGap = deriveControlEvidenceGap({
      implementationStatus: "IMPLEMENTED",
      evidenceSummary: { acceptedCurrent: 0, stale: 0, missing: true },
    });
    assert.equal(missingGap, "MISSING_EVIDENCE");

    // Stale evidence must yield STALE_EVIDENCE gap
    const staleGap = deriveControlEvidenceGap({
      implementationStatus: "IMPLEMENTED",
      evidenceSummary: { acceptedCurrent: 0, stale: 2, missing: false },
    });
    assert.equal(staleGap, "STALE_EVIDENCE");

    // Not assessed without evidence remains NOT_ASSESSED
    const unassessedGap = deriveControlEvidenceGap({
      implementationStatus: "NOT_ASSESSED",
      evidenceSummary: { acceptedCurrent: 0, stale: 0, missing: true },
    });
    assert.equal(unassessedGap, "NOT_ASSESSED");
  });

  it("INVARIANT: internal normative statement and identifiers never leak to client portal", () => {
    const portalComponent = read("src/components/client-portal/OrgComplianceView.tsx");
    assert.doesNotMatch(portalComponent, /normativeStatement/);
    assert.doesNotMatch(portalComponent, /ruleAst|astJson|snapshotJson|ruleDigest/i);
  });

  it("INVARIANT: legal review authority remains with human lawyer", () => {
    const control = {
      title: "C",
      implementationStatus: "IMPLEMENTED",
      owner: null,
      nextReviewAt: null,
      evidenceSummary: { acceptedCurrent: 0, stale: 0, missing: false },
      evidence: [{
        id: "ev-pending",
        title: "Beküldött tervezet",
        sourceType: "EXTERNAL_REFERENCE" as const,
        status: "PROVIDED" as const,
        validFrom: null,
        validUntil: null,
        freshness: "CURRENT" as const,
      }],
    };
    const panelMarkup = renderToStaticMarkup(createElement(ComplianceControlEvidencePanel, {
      control,
      busy: false,
      adding: false,
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
    // Pending evidence requires human lawyer review affordance
    assert.match(panelMarkup, /Elfogadás/);
    assert.match(panelMarkup, /Elutasítás/);
    assert.match(panelMarkup, /Rögzítve/);
  });
});
