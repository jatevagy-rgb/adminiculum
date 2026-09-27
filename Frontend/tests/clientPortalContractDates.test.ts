/**
 * Client portal contract dates (Slice B) — frontend contract.
 *
 * Locks the additive customer-safe contract lifecycle surface on the existing
 * Szerződések page: active contracts, expiring-this-month contracts and the
 * allowed Hungarian date labels. The date fields are read from the canonical
 * customer-safe contract DTO; no occurrence/obligation data is exposed and no
 * new backend call or route is introduced.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  contractDateRows,
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

describe("contract date rows", () => {
  it("orders the allowed Hungarian labels and omits null dates", () => {
    const rows = contractDateRows(contract({
      signatureDate: "2025-12-20T00:00:00.000Z",
      effectiveDate: "2026-01-01T00:00:00.000Z",
      expiryDate: "2027-01-01T00:00:00.000Z",
      nextCriticalDate: "2026-11-30T00:00:00.000Z",
    }));
    assert.deepEqual(rows.map((row) => row.label), ["Aláírás dátuma", "Hatálybalépés", "Lejárat", "Következő kritikus dátum"]);
    assert.deepEqual(rows.map((row) => row.key), ["signature", "effective", "expiry", "critical"]);
  });

  it("produces no row for a null date (never a fake entry)", () => {
    const rows = contractDateRows(contract({ signatureDate: null, nextCriticalDate: null, effectiveDate: null, expiryDate: null }));
    assert.deepEqual(rows, []);
  });
});

describe("active + expiring selection", () => {
  it("selects active contracts by the canonical isActive flag only", () => {
    const active = contract({ reference: "a", isActive: true, lifecycle: "active" });
    const upcoming = contract({ reference: "b", isActive: false, lifecycle: "upcoming", statusLabel: "Aláírva, hatálybalépés előtt" });
    const terminating = contract({ reference: "c", isActive: false, lifecycle: "terminating" });
    assert.deepEqual(selectActiveContracts([active, upcoming, terminating]).map((item) => item.reference), ["a"]);
  });

  it("selects expiring-this-month contracts only when the flag and a real expiry date are present", () => {
    const expiring = contract({ reference: "a", expiresThisMonth: true, expiryDate: "2027-01-10T00:00:00.000Z" });
    const otherMonth = contract({ reference: "b", expiresThisMonth: false, expiryDate: "2027-05-10T00:00:00.000Z" });
    const missingDate = contract({ reference: "c", expiresThisMonth: true, expiryDate: null });
    assert.deepEqual(selectExpiringThisMonthContracts([expiring, otherMonth, missingDate]).map((item) => item.reference), ["a"]);
  });
});

describe("organization contract surface (source contract)", () => {
  const views = () => read("src/components/client-portal/OrganizationPortalViews.tsx");
  const api = () => read("src/lib/clientPortalApi.ts");

  it("surfaces active contracts, expiring-this-month contracts and the concise Hungarian date labels", () => {
    const src = views();
    for (const token of [
      "Aktív szerződések",
      "Ebben a hónapban lejáró szerződések",
      "Hatálybalépés",
      "Lejárat",
      "Következő kritikus dátum",
      "Aláírás dátuma",
      "selectActiveContracts",
      "selectExpiringThisMonthContracts",
      "contractDateRows",
    ]) {
      assert.ok(src.includes(token), `missing contract-date surface: ${token}`);
    }
  });

  it("preserves the existing published-contract behavior", () => {
    const src = views();
    for (const token of [
      "OrganizationContracts",
      "Közzétett szerződések",
      "Kulcsdátum",
      "formatDate(contract.keyDate)",
      "contract.publishedDoc?.downloadAvailable",
      "Dokumentum megnyitása",
      "Jelenleg nincs közzétett szerződéses áttekintés",
    ]) {
      assert.ok(src.includes(token), `lost existing contract behavior: ${token}`);
    }
  });

  it("never exposes internal occurrences, obligations or technical ids", () => {
    const src = views();
    for (const forbidden of ["obligation", "entitlement", "occurrence", "canonicalDocumentVersionId", "sourceCaseId", "workInstruction", "taskStatus"]) {
      assert.doesNotMatch(src, new RegExp(forbidden, "i"), `contract surface must not expose ${forbidden}`);
    }
  });

  it("adds no new backend call or route for contract dates", () => {
    const src = views();
    assert.doesNotMatch(src, /getPortalOrganizationContractDates|portal\/org\/contract-dates/);
  });

  it("extends the customer-safe contract DTO with the exposed date fields", () => {
    const src = api();
    for (const token of ["isActive", "effectiveDate", "expiryDate", "nextCriticalDate", "signatureDate", "expiresThisMonth"]) {
      assert.ok(src.includes(token), `PortalOrgContract missing ${token}`);
    }
  });
});
