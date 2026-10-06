import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Client Portal 3.0 — checkpoint E1 contract (Company V3). Pins the
 * ORGANIZATION runtime cutover for /portal/vallalat, the canonical data
 * sources, the no-fake-metrics rule, profile/evidence/TEÁOR preservation and
 * legacy rollback surfaces.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const exists = (relative: string) => existsSync(path.join(root, relative));

const shell = () => read("src/components/client-portal/ClientPortalShell.tsx");
const companyV3 = () => read("src/components/client-portal-v3/company/PortalCompanyV3.tsx");
const profileV3 = () => read("src/components/client-portal-v3/company/PortalCompanyProfileV3.tsx");
const sectionsV3 = () => read("src/components/client-portal-v3/company/PortalCompanySections.tsx");
const api = () => read("src/lib/clientPortalApi.ts");

const v3Sources = () => [companyV3(), profileV3(), sectionsV3()].join("\n");

describe("Checkpoint E1 — company runtime", () => {
  it("1/2. /portal/vallalat renders PortalCompanyV3 and legacy OrganizationCompany is not the ORGANIZATION target", () => {
    const src = shell();
    assert.match(src, /view === 'company' \? <PortalCompanyV3 \/> : null/);
    const orgBranch = src.slice(src.indexOf("CLIENT PORTAL 3.0 CUTOVER"), src.indexOf("// Customer context label"));
    assert.doesNotMatch(orgBranch, /<OrganizationCompany/);
    const orgViews = read("src/components/client-portal/OrganizationPortalViews.tsx");
    assert.match(orgViews, /OrganizationCompany/);
  });

  it("3. company page uses the canonical company overview API", () => {
    const src = companyV3();
    assert.match(src, /getPortalOrganizationCompany\(\)/);
    assert.match(src, /getPortalOrganizationContracts\(\)/);
    assert.doesNotMatch(src, /getPortalOrganizationCases|getPortalOrganizationSummary/);
  });

  it("4. organization summary 403 renders a truthful, recoverable restricted-access state", () => {
    const src = companyV3();
    // The known organization summary-scope denial is classified by code, not by a blanket status list.
    assert.match(src, /failure instanceof ApiError/);
    assert.match(src, /failure\.status === 403 && failure\.code === RESTRICTED_SCOPE_CODE/);
    assert.match(src, /RESTRICTED_SCOPE_CODE = "CLIENT_SUMMARY_SCOPE_FORBIDDEN"/);
    assert.match(src, /testId="portal-company-restricted"/);
    assert.match(src, /A vállalati áttekintés a jelenlegi hozzáférésével nem érhető el\./);
    assert.match(src, /Vissza az áttekintéshez/);
    assert.match(src, /href="\/portal"/);
    // The old blanket 401/403/404 collapse is gone.
    assert.doesNotMatch(src, /\[401, 403, 404\]/);
    // The backend gate is untouched: ORGANIZATION mode + summary scope.
    const backend = read("../Backend/src/modules/client-workspace/orgCompanyService.ts");
    assert.match(backend, /canViewOrganizationSummary/);
    assert.match(backend, /CLIENT_SUMMARY_SCOPE_FORBIDDEN/);
  });

  it("5/6/7. companyName always renders; headline and employeeCount only when present", () => {
    const src = companyV3();
    assert.match(src, /\{company\.companyName\}/);
    assert.match(src, /company\.profileHeadline \? <p/);
    assert.match(src, /typeof company\.employeeCount === "number" \? \(/);
  });

  it("8/9/10. completion is canonical profile-data completion and no compliance percentage exists", () => {
    const src = profileV3();
    assert.match(src, /companyProfileCompletion\(questions, screens\)/);
    assert.match(src, /Profiladatok kitöltöttsége/);
    assert.match(src, /Nem jogi megfelelőségi minősítés\./);
    assert.doesNotMatch(v3Sources(), /compliance.*%|megfelelés.*%/i);
    // The percentage computation lives in the canonical helper library, never here.
    assert.doesNotMatch(src, /Math\.round|answered \/ total \* 100/);
  });

  it("11/12. profile editor uses canonical discovery screens and questionKey is never customer-visible", () => {
    const src = profileV3();
    assert.match(src, /getPortalCompanyProfileDiscovery\(\)/);
    assert.match(src, /activeScreen\.factBindings/);
    assert.match(src, /questionLabel\(atom\)/);
    // The technical key may serve as a React key, but never as visible copy.
    assert.doesNotMatch(src, />\{atom\.questionKey\}</);
  });

  it("13-17. all canonical answer types are preserved", () => {
    const src = profileV3();
    assert.match(src, /valueType === "NUMBER"/);
    assert.match(src, /valueType === "BOOLEAN"/);
    assert.match(src, /valueType === "ENUM"/);
    assert.match(src, /valueType === "MULTI_ENUM"/);
    assert.match(src, /valueType === "DATE"/);
    assert.match(src, /valueType === "JURISDICTION"/);
    assert.match(src, /draftToPayload\(atom, draft\)/);
  });

  it("18. TEAOR25 search uses the existing endpoint only", () => {
    const src = profileV3();
    assert.match(src, /getPortalCompanyProfileTeaor25Options/);
    assert.doesNotMatch(src, /"6201"|"4711"|hardcod/i);
  });

  it("19. UNKNOWN answer remains supported", () => {
    const src = profileV3();
    assert.match(src, /status: "UNKNOWN"/);
    assert.match(src, /Nem tudom/);
  });

  it("20/21. successful save refreshes discovery and save/refresh-failure stays truthful", () => {
    const src = profileV3();
    assert.match(src, /await answerPortalCompanyProfileScreen\(activeScreen\.screenKey, facts\)/);
    assert.match(src, /const refreshed = await refreshDiscovery\(\)/);
    assert.match(src, /resolveAdvanceIndex\(refreshed\?\.screens \?\? screens/);
    assert.match(src, /A mentés megtörtént, de a frissítés nem sikerült\./);
  });

  it("22/23. evidence journey reuses the canonical endpoint and STALE is never unanswered", () => {
    const src = profileV3();
    assert.match(src, /getPortalCompanyProfileEvidence\(\)/);
    assert.match(src, /answerPortalCompanyProfileEvidence\(item\.controlKey/);
    assert.match(src, /countPendingEvidence\(applicableEvidence\)/);
    assert.match(src, /item\.relevance === "LEGAL_REVIEW_REQUIRED"/);
    assert.doesNotMatch(src, /STALE.*UNANSWERED|UNANSWERED.*STALE/);
  });

  it("24/25/26. groups come from the company DTO, no hidden matter inference, no person directory", () => {
    const src = sectionsV3();
    assert.match(src, /company\.groups/);
    assert.match(src, /company\.visibleMattersByArea/);
    assert.match(src, /company\.totalVisibleMatterCount/);
    assert.doesNotMatch(src, /getPortalOrganizationCases|person|manager|deputy|jobTitle|employmentStatus/);
  });

  it("27. systems/processes never display unsafe raw enums", () => {
    const src = sectionsV3();
    assert.match(src, /system\.name/);
    assert.match(src, /process\.name/);
    assert.doesNotMatch(src, /system\.category|process\.category|criticality|frequency/);
  });

  it("28/29. summaries use canonical counts and no fake score/maturity/ROI/trend exists", () => {
    const src = sectionsV3();
    assert.match(src, /company\.documentsSummary|company\.complianceSummary|company\.developmentSummary|company\.outcomeSummary/);
    assert.doesNotMatch(v3Sources(), /maturity|érettség|ROI|megtakarítás|trend|sparkline|kockázati pont|risk score|health score/i);
  });

  it("30/31. contracts use the existing endpoint and the published document route stays canonical", () => {
    const src = companyV3() + sectionsV3();
    assert.match(src, /getPortalOrganizationContracts/);
    assert.match(src, /\/portal\/documents\/\$\{encodeURIComponent\(contract\.publishedDoc\.publicationId\)\}/);
    assert.match(src, /\/portal\/szerzodesek/);
  });

  it("32. dead /portal/vallalat/company-profile CTA is not rendered", () => {
    const src = v3Sources();
    assert.doesNotMatch(src, /\/portal\/vallalat\/company-profile/);
    assert.doesNotMatch(src, /dataSummary\?\.portalPath|portalPath/);
  });

  it("33/34. INDIVIDUAL and CASE_RELAY remain legacy", () => {
    const src = shell();
    assert.match(src, /'Ügyeim', '\/portal\/ugyeim'/);
    assert.match(src, /workspace\.mode === 'CASE_RELAY'/);
    assert.match(src, /OrganizationPortalViews/);
  });

  it("35. no raw hex / stone / adm-blue / adm-ivory / cp-* in the new V3 company files", () => {
    const src = v3Sources();
    assert.doesNotMatch(src, /(?:bg|text|border|ring|fill|stroke)-\[#(?:[0-9a-fA-F]{3,8})\]/);
    assert.doesNotMatch(src, /stone-/);
    assert.doesNotMatch(src, /--adm-blue/);
    assert.doesNotMatch(src, /--adm-ivory/);
    assert.doesNotMatch(src, /cp-/);
    assert.doesNotMatch(src, /rounded-2xl|rounded-3xl/);
    assert.match(src, /--adm-canvas-subtle|--adm-canvas-white/);
    assert.match(src, /--adm-border-canonical/);
    assert.match(src, /--adm-brand-green/);
    assert.match(src, /focus-visible:ring-2/);
    assert.match(src, /h-10/);
  });

  it("legacy company/profile surfaces remain in the repository", () => {
    for (const relative of [
      "src/components/client-portal/OrganizationPortalViews.tsx",
      "src/components/client-portal/OrganizationCompanyProfile.tsx",
      "src/lib/companyProfileCompletion.ts",
      "src/lib/companyProfileDraft.ts",
      "src/lib/companyProfileEvidence.ts",
      "src/app/portal/vallalat/page.tsx",
    ]) {
      assert.equal(exists(relative), true, `${relative} must remain`);
    }
  });
});
