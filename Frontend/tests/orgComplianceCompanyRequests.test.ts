import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { requestStateLabel, groupComplianceRequests } from "../src/components/client-portal/OrgComplianceView";
import type { PortalComplianceRequest } from "../src/lib/clientPortalApi";

const root = process.cwd();
const source = () => readFileSync(path.join(root, "src/components/client-portal/OrgComplianceView.tsx"), "utf8");

const request = (overrides: Partial<PortalComplianceRequest> = {}): PortalComplianceRequest => ({
  id: "r1",
  caseId: "caseA",
  type: "DOCUMENT_UPLOAD",
  title: "Munkavédelmi oktatási nyilvántartás",
  instructions: null,
  dueAt: null,
  required: true,
  status: "PUBLISHED",
  documentSpec: null,
  publishedAt: null,
  fields: [],
  contextLabel: "Munkavédelmi követelmények",
  category: "DOCUMENT",
  state: "AWAITING_CUSTOMER",
  canRespond: true,
  canUpload: true,
  ...overrides,
});

describe("Company-level customer request projection UI", () => {
  it("uses the grant-scoped company projection endpoint", () => {
    const src = source();
    assert.match(src, /getPortalComplianceRequests\(\)/);
    assert.match(src, /from "@\/lib\/clientPortalApi"/);
  });

  it("presents the five customer jobs", () => {
    const src = source();
    for (const label of ["Áttekintés", "Teendők", "Dokumentumok", "Kérdések és kérések", "Állapotok"]) {
      assert.ok(src.includes(label), `missing customer job: ${label}`);
    }
  });

  it("distinguishes already provided documents from requested documents", () => {
    const src = source();
    assert.ok(src.includes("Már megadott / elérhető"));
    assert.ok(src.includes("Bekért dokumentumok"));
  });

  it("translates request states and never renders a raw internal enum alone", () => {
    assert.equal(requestStateLabel("AWAITING_CUSTOMER"), "Válaszra vár Öntől");
    assert.equal(requestStateLabel("OFFICE_PROCESSING"), "Irodai feldolgozás alatt");
    assert.equal(requestStateLabel("CLOSED"), "Lezárt");

    const src = source();
    assert.match(src, /requestStateLabel\(item\.state\)/);
    assert.doesNotMatch(src, /item\.status\b/);
  });

  it("never exposes Compliance internal identifiers or the raw document spec", () => {
    const src = source();
    assert.doesNotMatch(src, /requirementVersionId|clientControlId|findingId/);
    assert.doesNotMatch(src, /documentSpec/);
  });

  it("groups by the translated customer state", () => {
    const groups = groupComplianceRequests([
      request({ id: "a" }),
      request({ id: "b", state: "OFFICE_PROCESSING", category: "QUESTION", type: "INFORMATION_REQUEST" }),
      request({ id: "c", state: "CLOSED", category: "QUESTION", type: "QUESTION_RESPONSE" }),
    ]);
    assert.deepEqual(groups.awaiting.map((item) => item.id), ["a"]);
    assert.deepEqual(groups.office.map((item) => item.id), ["b"]);
    assert.deepEqual(groups.closed.map((item) => item.id), ["c"]);
  });

  it("shows WHAT / WHY / STATUS / DUE / ACTION for requested documents", () => {
    const src = source();
    assert.match(src, /item\.title/);
    assert.match(src, /Adatforrás: \{item\.contextLabel\}/);
    assert.match(src, /item\.instructions/);
    assert.match(src, /AdminStatusPill tone=\{requestStateTone\[item\.state\]\}/);
    assert.match(src, /Határidő: \{formatDate\(item\.dueAt\)\}/);
    assert.match(src, /item\.canUpload \? "Feltöltés" : "Megnyitás"/);
  });
});

describe("Customer compliance visual convergence", () => {
  it("carries no route-local palette, oversized cards or stone identity", () => {
    const src = source();
    assert.doesNotMatch(src, /rounded-3xl/);
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(src, /stone-/);
  });

  it("reuses the canonical Adminiculum primitives and semantic tokens", () => {
    const src = source();
    assert.match(src, /OperationalPageHeader/);
    assert.match(src, /AdminSectionHeader/);
    assert.match(src, /AdminPanel/);
    assert.match(src, /AdminButton/);
    assert.match(src, /AdminStatusPill/);
    assert.match(src, /CompactState|SafePanelError/);
    assert.match(src, /--adm-/);
  });

  it("routes status through the canonical status primitive, not a bespoke bucket badge map", () => {
    const src = source();
    assert.doesNotMatch(src, /bucketBadge/);
    assert.match(src, /AdminStatusPill tone=\{bucketTone\[bucket\]\}/);
  });
});
