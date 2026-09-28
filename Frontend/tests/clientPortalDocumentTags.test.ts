/**
 * Client Portal Documents — Slice 2 (client-uploaded + compliance tags)
 * frontend contract.
 *
 * Locks the two new filtered sections on the grouped Documents surface:
 *  - "Feltöltött dokumentumok" filters ONLY document.clientUploaded === true
 *    (customer-originated portal uploads; never claims personal authorship);
 *  - "Compliance dokumentumok" filters ONLY document.isCompliancePolicy ===
 *    true (canonical CLIENT_POLICY-backed publications).
 *
 * The sections are filtered views of the same customer-safe published library;
 * no raw uploadSource / INTERNAL_ANALYSIS data may appear, and all Slice 1
 * sections must remain.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

const viewsSource = () => read("src/components/client-portal/OrganizationPortalViews.tsx");
const documentsSurface = () => {
  const src = viewsSource();
  const start = src.indexOf("function OrganizationDocuments(");
  const end = src.indexOf("function OrganizationMessages(");
  assert.ok(start !== -1 && end !== -1 && end > start, "OrganizationDocuments surface not found");
  return src.slice(start, end);
};

describe("Feltöltött dokumentumok section", () => {
  it("filters only the canonical clientUploaded boolean", () => {
    const src = documentsSurface();
    assert.ok(src.includes("Feltöltött dokumentumok"));
    assert.ok(src.includes("shared.filter((item) => item.clientUploaded)"));
  });

  it("never claims personal authorship and never exposes raw provenance", () => {
    const src = documentsSurface();
    assert.ok(!src.includes("Ön által feltöltött"));
    assert.ok(!src.includes("uploadSource"));
  });
});

describe("Compliance dokumentumok section", () => {
  it("filters only the canonical isCompliancePolicy boolean", () => {
    const src = documentsSurface();
    assert.ok(src.includes("Compliance dokumentumok"));
    assert.ok(src.includes("shared.filter((item) => item.isCompliancePolicy)"));
  });

  it("never exposes INTERNAL_ANALYSIS or compliance analysis metadata", () => {
    const src = documentsSurface();
    assert.ok(!src.includes("INTERNAL_ANALYSIS"));
    assert.ok(!src.includes("CLIENT_POLICY"));
    assert.ok(!src.includes("complianceAnalysis"));
  });
});

describe("Slice 1 regression + boundaries", () => {
  it("keeps the Slice 1 sections and the full published library", () => {
    const src = documentsSurface();
    for (const token of [
      "Nemrég közzétett dokumentumok",
      "Aktív szerződések",
      "Ebben a hónapban lejáró szerződések",
      "Közzétett dokumentumok",
      "selectActiveContracts(contracts)",
      "selectExpiringThisMonthContracts(contracts)",
      "selectCustomerPublishedDocuments(workspace.documents)",
    ]) {
      assert.ok(src.includes(token), `missing Slice 1 surface: ${token}`);
    }
  });

  it("adds no Grow document category", () => {
    const src = documentsSurface();
    assert.ok(!src.includes("Grow"));
    assert.ok(!src.includes("fejlesztes"));
  });
});

describe("customer-safe DTO contract", () => {
  it("declares the derived booleans on the workspace document type", () => {
    const api = read("src/lib/clientPortalApi.ts");
    assert.ok(api.includes("clientUploaded: boolean"));
    assert.ok(api.includes("isCompliancePolicy: boolean"));
    assert.ok(!/uploadSource\s*:/.test(api));
  });
});
