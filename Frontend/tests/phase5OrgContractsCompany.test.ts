import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("Phase 5B organizational customer contract + company surface", () => {
  const views = () => read("src/components/client-portal/OrganizationPortalViews.tsx");
  const company = () => read("src/components/client-portal/DemoCompanyPresentation.tsx");
  const api = () => read("src/lib/clientPortalApi.ts");
  const shell = () => read("src/components/client-portal/ClientPortalShell.tsx");

  it("keeps the exact Phase 5 IA navigation labels in order", () => {
    const src = shell();
    const orgIdx = src.indexOf("if (workspace.mode === 'ORGANIZATION')");
    const orgBlock = src.slice(orgIdx, src.indexOf("if (workspace.mode === 'CASE_RELAY')"));
    const order = ["Főoldal", "Ügyek", "Szerződések", "Teendők", "Vállalat", "Dokumentumok", "Kapcsolat"];
    let last = -1;
    for (const label of order) {
      const idx = orgBlock.indexOf(`'${label}'`);
      assert.ok(idx > -1, `org IA missing ${label}`);
      assert.ok(idx > last, `org IA order violated for ${label}`);
      last = idx;
    }
  });

  it("Szerződések is functional (not a placeholder) and customer-readable", () => {
    const src = views();
    assert.match(src, /OrganizationContracts/);
    assert.match(src, /contract\.publishedDoc\?\.downloadAvailable/);
    assert.match(src, /Dokumentum megnyitása/);
    assert.match(src, /Közzétett szerződések/);
    assert.match(src, /statusLabel/);
    assert.match(src, /Kulcsdátum/);
    assert.match(src, /formatDate\(contract\.keyDate\)/);
    // honest empty state
    assert.match(src, /Jelenleg nincs közzétett szerződéses áttekintés/);
    assert.doesNotMatch(src, /ContractRecord/);
    assert.doesNotMatch(src, /canonicalDocumentVersionId/);
    assert.doesNotMatch(src, /sourceCaseId/);
    assert.doesNotMatch(src, /workInstruction|taskStatus|reviewer|internalOwner/);
  });

  it("Vállalat is functional (not a placeholder), simple and customer-readable", () => {
    const src = views() + company();
    assert.match(src, /OrganizationCompany/);
    assert.match(src, /Szervezeti egységek/);
    assert.match(src, /Aktív területek/);
    assert.match(src, /company\.profileHeadline/);
    assert.match(src, /company\.groups\.map/);
    assert.match(src, /Közzétett ügy/);
    assert.doesNotMatch(src, /\/vallalati-mukodes/);
    assert.doesNotMatch(src, /getWorkspaceOverview/);
    // The customer person directory is intentionally not rendered.
    assert.doesNotMatch(src, /company\.persons/);
    assert.doesNotMatch(src, /jobTitle|managerName|deputyName|employmentStatus|responsibilities/);
  });

  it("empty states are human, never raw data markers", () => {
    const src = views() + company();
    for (const empty of ["Jelenleg nincs közzétett szerződéses áttekintés", "nincs közzétett vállalati áttekintés", "nincs olyan szervezeti terület, ahol közzétett ügye van"]) {
      assert.match(src, new RegExp(empty));
    }
    assert.doesNotMatch(src, /No data|0 records/);
  });

  it("API client exposes customer-safe contract + company DTOs and endpoints", () => {
    const src = api();
    for (const token of [
      "PortalOrgContract",
      "PortalOrgCompany",
      "getPortalOrganizationContracts",
      "getPortalOrganizationCompany",
      "/client-portal/org/contracts",
      "/client-portal/org/company",
      "PortalOrgContractPublishedDoc",
      "PortalOrgCompanyGroup",
      "PortalOrgCompanyVisibleArea",
    ]) assert.match(src, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(src, /prisma|storageProvider|scanProvider|quarantineStorageReference|spItemId/);
    assert.doesNotMatch(src, /internalNote|securityClassification|lawFirmOwnerUserId/);
    assert.doesNotMatch(src, /PortalOrgCompanyPerson|portalMembershipId/);
  });

  it("no internal technical IDs or legal-workflow terminology in the customer surfaces", () => {
    const src = views() + company();
    assert.doesNotMatch(src, /grantId|membershipId|canonicalDocumentVersionId|sourceCaseId|raw enum|internalStatus/);
    assert.doesNotMatch(src, /AssessmentFinding|taskStatus|workInstruction/);
  });
});
