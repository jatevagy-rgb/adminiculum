/**
 * Client Portal Documents — Slice 1 (reuse-only categories) frontend contract.
 *
 * Locks the grouped customer-safe Documents surface:
 *  - "Nemrég közzétett dokumentumok" reuses the canonical org-home
 *    recentDocuments projection (publishedAt semantics; no local recency math);
 *  - "Aktív szerződések" / "Ebben a hónapban lejáró szerződések" reuse the
 *    canonical Slice B selectors and flags (isActive / expiresThisMonth);
 *  - no uploaded/compliance/grow category is inferred and no internal
 *    publication metadata is exposed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  selectActiveContracts,
  selectExpiringThisMonthContracts,
} from "../src/components/client-portal/OrganizationPortalViews";
import type { PortalOrgContract } from "../src/lib/clientPortalApi";

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

function contract(overrides: Partial<PortalOrgContract> = {}): PortalOrgContract {
  return {
    reference: "ref-1",
    title: "Keretszerződés",
    statusLabel: "Hatályban",
    lifecycle: "active",
    isActive: true,
    relatedMatterTitle: null,
    nextStep: null,
    customerActionRequired: false,
    keyDate: "2027-01-01T00:00:00.000Z",
    effectiveDate: "2026-01-01T00:00:00.000Z",
    expiryDate: "2027-01-01T00:00:00.000Z",
    nextCriticalDate: null,
    signatureDate: null,
    expiresThisMonth: false,
    publishedDoc: { publicationId: "p1", title: null, versionLabel: "Közzétett változat 1", publishedAt: null, downloadAvailable: true },
    ...overrides,
  };
}

const viewsSource = () => read("src/components/client-portal/OrganizationPortalViews.tsx");
const documentsSurface = () => {
  const src = viewsSource();
  const start = src.indexOf("function OrganizationDocuments(");
  const end = src.indexOf("function OrganizationMessages(");
  assert.ok(start !== -1 && end !== -1 && end > start, "OrganizationDocuments surface not found");
  return src.slice(start, end);
};

describe("recent documents reuse the canonical publishedAt projection", () => {
  it("uses the truthful published wording and never the uploaded wording", () => {
    const src = documentsSurface();
    assert.ok(src.includes("Nemrég közzétett dokumentumok"));
    assert.ok(src.includes("Közzétéve:"));
    assert.ok(!src.includes("Frissen feltöltött"));
    assert.ok(!src.includes("Feltöltött dokumentumok"));
  });

  it("renders the canonical publishedAt and links to the canonical document destination", () => {
    const src = documentsSurface();
    assert.ok(src.includes("item.publishedAt"));
    assert.ok(src.includes("`/portal/documents/${encodeURIComponent(item.id)}`"));
  });

  it("derives no recency or upload category locally (no date math, no upload inference)", () => {
    const src = documentsSurface();
    for (const forbidden of ["new Date(", "getMonth", "getFullYear", "toISOString", "uploadSource", "uploadKind", "fileName"]) {
      assert.ok(!src.includes(forbidden), `documents surface must not derive ${forbidden}`);
    }
  });

  it("consumes the canonical org-home recentDocuments projection only for the documents view", () => {
    const src = viewsSource();
    assert.ok(src.includes("getPortalOrgHome"));
    assert.ok(src.includes("result.recentDocuments"));
    assert.ok(!/client-portal\/org\/documents/.test(src));
  });
});

describe("contract groups reuse the canonical Slice B selectors", () => {
  it("reuses selectActiveContracts for the active group", () => {
    const src = documentsSurface();
    assert.ok(src.includes("selectActiveContracts(contracts)"));
    const active = contract({ reference: "a", isActive: true });
    const notActive = contract({ reference: "b", isActive: false });
    assert.deepEqual(selectActiveContracts([active, notActive]).map((item) => item.reference), ["a"]);
  });

  it("reuses selectExpiringThisMonthContracts for the expiring group and renders the canonical expiryDate", () => {
    const src = documentsSurface();
    assert.ok(src.includes("selectExpiringThisMonthContracts(contracts)"));
    assert.ok(src.includes("formatDate(contract.expiryDate)"));
    const expiring = contract({ reference: "a", expiresThisMonth: true, expiryDate: "2027-01-10T00:00:00.000Z" });
    const other = contract({ reference: "b", expiresThisMonth: false });
    assert.deepEqual(selectExpiringThisMonthContracts([expiring, other]).map((item) => item.reference), ["a"]);
  });

  it("links contracts only to the canonical published-document destination", () => {
    const src = documentsSurface();
    assert.ok(src.includes("contract.publishedDoc?.downloadAvailable"));
    assert.ok(src.includes("`/portal/documents/${encodeURIComponent(contract.publishedDoc.publicationId)}`"));
  });
});

describe("slice boundaries", () => {
  it("adds no uploaded, compliance or grow category to the documents surface", () => {
    const src = documentsSurface();
    for (const forbidden of ["Feltöltött", "Compliance dokumentumok", "Grow With Us", "megfeleles", "fejlesztes"]) {
      assert.ok(!src.includes(forbidden), `must not add category ${forbidden}`);
    }
  });

  it("exposes no internal publication metadata", () => {
    const src = documentsSurface();
    for (const forbidden of ["canonicalDocumentVersionId", "recipientMembershipIds", "documentVersionId", "visibility", "publicationStatus"]) {
      assert.ok(!src.includes(forbidden), `must not expose ${forbidden}`);
    }
  });

  it("keeps the existing published-document library section intact", () => {
    const src = documentsSurface();
    assert.ok(src.includes("Közzétett dokumentumok"));
    assert.ok(src.includes("selectCustomerPublishedDocuments(workspace.documents)"));
    assert.ok(src.includes("item.actionUrl"));
  });
});
