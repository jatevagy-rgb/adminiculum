import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ComplianceAttentionSummary,
  ComplianceFindingRow,
  ComplianceRequirementGroup,
  ComplianceState,
  getComplianceAttentionFindings,
  getComplianceFindingStatus,
  getComplianceScopeLabel,
  isComplianceProposalCandidate,
  groupComplianceFindings,
  isComplianceGroupInitiallyOpen,
  type ComplianceFindingView,
} from "../src/components/clients/compliance/ComplianceOverview";

const finding = (overrides: Partial<ComplianceFindingView> = {}): ComplianceFindingView => ({
  id: "finding-1",
  title: "Adatkezelési folyamat",
  ...overrides,
});

describe("7C-A compliance overview behavior", () => {
  it("labels every canonical scope and uses a neutral unknown fallback", () => {
    const labels: Record<string, string> = {
      COMPANY: "Vállalat",
      EMPLOYEE: "Munkavállaló",
      CONTRACT: "Szerződés",
      WORKPLACE_SITE: "Munkahelyszín",
      EVENT: "Esemény",
      SALES_CHANNEL: "Értékesítési csatorna",
      PRODUCT_SERVICE: "Termék vagy szolgáltatás",
      TAX_PERIOD: "Adóidőszak",
      TRANSACTION: "Tranzakció",
      REPORTING_EVENT: "Jelentési esemény",
    };

    for (const [scopeType, label] of Object.entries(labels)) {
      assert.equal(getComplianceScopeLabel(finding({ scopeType })), label);
    }
    assert.equal(getComplianceScopeLabel(finding({ scopeType: "FUTURE_SCOPE" })), "Nem azonosított hatókör");
    assert.equal(getComplianceScopeLabel(finding({ scopeType: null })), "Nem azonosított hatókör");
    assert.equal(getComplianceScopeLabel(finding({ scopeType: "COMPANY", subjectLabel: "Telephely A" })), "Telephely A");
  });

  it("keeps same-title manual findings in separate singleton groups", () => {
    const groups = groupComplianceFindings([
      finding({ id: "manual-1" }),
      finding({ id: "manual-2" }),
    ]);

    assert.deepEqual(groups.map((group) => group.key), ["manual:manual-1", "manual:manual-2"]);
    assert.deepEqual(groups.map((group) => group.findings.map(({ id }) => id)), [["manual-1"], ["manual-2"]]);
  });

  it("groups only stable requirement identities while retaining independent rows", () => {
    const groups = groupComplianceFindings([
      finding({ id: "company", requirementKey: "req-1", scopeType: "COMPANY" }),
      finding({ id: "employee", requirementKey: "req-1", scopeType: "EMPLOYEE" }),
      finding({ id: "other", requirementKey: "req-2", scopeType: "COMPANY", title: "Adatkezelési folyamat" }),
    ]);

    assert.deepEqual(groups.map((group) => group.key), ["requirement:req-1", "requirement:req-2"]);
    assert.deepEqual(groups[0].findings.map(({ id }) => id), ["company", "employee"]);
  });

  it("excludes DOES_NOT_APPLY and only keeps unresolved manual findings in attention", () => {
    const findings = [
      finding({ id: "quiet", applicabilityStatus: "DOES_NOT_APPLY" }),
      finding({ id: "unknown", applicabilityStatus: null, operationalStatus: "OPEN" }),
      finding({ id: "resolved-manual", applicabilityStatus: null, operationalStatus: "RESOLVED" }),
      finding({ id: "applies", applicabilityStatus: "APPLIES" }),
    ];

    assert.deepEqual(getComplianceAttentionFindings(findings).map(({ id }) => id), ["unknown", "applies"]);
    assert.equal(getComplianceFindingStatus(findings[1]), null);

    const markup = renderToStaticMarkup(createElement(ComplianceAttentionSummary, { findings }));
    assert.match(markup, /2 belső értékelési megállapítás/);
    assert.doesNotMatch(markup, /Nem releváns/);
  });

  it("renders distinct loading, empty, and unavailable states", () => {
    const loading = renderToStaticMarkup(createElement(ComplianceState, { state: "loading" }));
    const empty = renderToStaticMarkup(createElement(ComplianceState, { state: "empty" }));
    const unavailable = renderToStaticMarkup(createElement(ComplianceState, { state: "unavailable", detail: "Átmeneti hiba" }));

    assert.match(loading, /Megállapítások betöltése/);
    assert.match(empty, /Nincs megjeleníthető belső értékelési megállapítás/);
    assert.doesNotMatch(empty, /Átmeneti hiba/);
    assert.match(unavailable, /role="alert"/);
    assert.match(unavailable, /Átmeneti hiba/);
    assert.doesNotMatch(unavailable, /Nincs megjeleníthető/);
  });

  it("uses progressive disclosure for multi-scope groups", () => {
    const one = finding({ id: "one" });
    const two = finding({ id: "two", scopeType: "EMPLOYEE" });
    const closed = renderToStaticMarkup(createElement(ComplianceRequirementGroup, { title: "Követelmény", findings: [one, two] }));
    const open = renderToStaticMarkup(createElement(ComplianceRequirementGroup, { title: "Követelmény", findings: [one] }));

    assert.equal(isComplianceGroupInitiallyOpen([one, two]), false);
    assert.equal(isComplianceGroupInitiallyOpen([one]), true);
    assert.match(closed, /aria-expanded="false"/);
    assert.doesNotMatch(closed, /Hatókör:/);
    assert.match(open, /aria-expanded="true"/);
    assert.match(open, /Hatókör:/);
  });

  it("keeps finding rows internal and free of invented provenance or actions", () => {
    const markup = renderToStaticMarkup(createElement(ComplianceFindingRow, {
      finding: finding({
        applicabilityStatus: "APPLIES",
        scopeType: "TRANSACTION",
        description: "Belső megállapítás",
        recommendation: "Jogi áttekintés szükséges",
      }),
    }));

    assert.match(markup, /Belső értékelés szerint releváns/);
    assert.match(markup, /Tranzakció/);
    assert.doesNotMatch(markup, /cikk|joghatóság|citation|sourceVersion|reviewStatus|Teendő indítása/i);
  });

  it("offers proposal actions only as a requirement/applicability UI hint", () => {
    assert.equal(isComplianceProposalCandidate(finding({ requirementKey: "req-1", applicabilityStatus: "DOES_NOT_APPLY" })), true);
    assert.equal(isComplianceProposalCandidate(finding({ requirementKey: "req-1", applicabilityStatus: null })), false);
    assert.equal(isComplianceProposalCandidate(finding({ requirementKey: null, applicabilityStatus: "APPLIES" })), false);
    assert.equal(isComplianceProposalCandidate(finding({ requirementKey: "req-1", applicabilityStatus: "INSUFFICIENT_FACTS" })), true);
  });
});
