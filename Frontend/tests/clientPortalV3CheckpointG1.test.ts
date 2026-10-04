import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Client Portal 3.0 — checkpoint G1 contract (Grow + Compliance V3).
 * Pins the ORGANIZATION runtime cutover for /portal/fejlesztes and
 * /portal/megfeleles, the canonical data sources, assessment/survey/answer
 * workflows, deep-link preservation, INDIVIDUAL/CASE_RELAY preservation and
 * the V3 visual contract.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const exists = (relative: string) => existsSync(path.join(root, relative));

const shell = () => read("src/components/client-portal/ClientPortalShell.tsx");
const growV3 = () => read("src/components/client-portal-v3/grow/PortalGrowV3.tsx");
const complianceV3 = () => read("src/components/client-portal-v3/compliance/PortalComplianceV3.tsx");

const v3Sources = () => [growV3(), complianceV3()].join("\n");

const orgBranch = () => shell().slice(shell().indexOf("CLIENT PORTAL 3.0 CUTOVER"), shell().indexOf("// Customer context label"));

describe("Checkpoint G1 — grow runtime", () => {
  it("1. ORGANIZATION /portal/fejlesztes renders PortalGrowV3", () => {
    const src = orgBranch();
    assert.match(src, /view === 'grow' \? <PortalGrowV3 \/> : null/);
  });

  it("2. OrgGrowView is no longer the ORGANIZATION normal body", () => {
    const src = orgBranch();
    assert.match(src, /view !== 'grow'/);
    assert.doesNotMatch(src, /<OrgGrowView/);
    // The legacy composition stays available in the repository.
    const orgViews = read("src/components/client-portal/OrganizationPortalViews.tsx");
    assert.match(orgViews, /<OrgGrowView/);
    assert.equal(exists("src/components/client-portal/OrgGrowView.tsx"), true);
  });

  it("3. grow consumes the canonical customer-safe projections only", () => {
    const src = growV3();
    assert.match(src, /getPortalOrgGrow\(\)/);
    assert.match(src, /listPortalGrowAssessments\(\)/);
    assert.match(src, /getPortalGrowAssessment\(/);
    assert.match(src, /submitPortalGrowAssessment\(/);
    assert.match(src, /submitPortalGrowSurvey\(/);
    assert.match(src, /listPortalGrowSurveys\(\)/);
  });

  it("4. no score, maturity rating or invented metric exists", () => {
    const src = growV3().replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(src, /maturity|érettségi|pontszám|százalék/i);
    assert.doesNotMatch(src, /score[A-Z]/i);
  });

  it("5. legacy deep links keep resolving", () => {
    const src = growV3();
    for (const pair of [
      ["felmeresek", "teendok"],
      ["folyamatok", "mukodes"],
      ["lehetosegek", "fejlesztesi-iranyok"],
    ]) {
      assert.ok(src.includes(`${pair[0]}: "${pair[1]}"`) || src.includes(`${pair[0]}": "${pair[1]}"`), `${pair[0]} -> ${pair[1]} mapping missing`);
    }
    assert.match(src, /url\.searchParams\.set\("tab", tab\)/);
    assert.match(src, /window\.history\.pushState/);
  });

  it("6. outcomes keep the MEASURED / CALCULATED / ESTIMATED truthfulness split", () => {
    const src = growV3();
    assert.match(src, /o\.basis === "CALCULATED"/);
    assert.match(src, /o\.basis === "ESTIMATED"/);
    assert.match(src, /measuredOutcomes\.length/);
    assert.match(src, /Mért eredményként csak MEASURED alapú eredmény jelenik meg/);
  });

  it("7. operating canvas reuses the canonical projection and canvas components", () => {
    const src = growV3();
    assert.match(src, /projectGrowOperatingProcess/);
    assert.match(src, /<OrgGrowOperatingCanvas/);
    assert.match(src, /<OrgGrowContextInspector/);
  });

  it("8. the canonical grow QA testids stay resolvable", () => {
    const src = growV3();
    for (const testid of [
      "grow-sub-nav",
      'grow-tab-${tab.id}',
      "grow-assessments-section",
      "grow-assessment-catalogue",
      "grow-assessment-runner",
      "grow-assessment-result",
      "grow-aggregated-findings",
      "grow-feltaras-section",
      "grow-opportunities-list",
      "grow-opportunity-item",
      "grow-opportunity-detail",
      "grow-initiatives-section",
    ]) {
      assert.ok(src.includes(testid), `${testid} missing`);
    }
  });
});

describe("Checkpoint G1 — compliance runtime", () => {
  it("9. ORGANIZATION /portal/megfeleles renders PortalComplianceV3", () => {
    const src = orgBranch();
    assert.match(src, /view === 'compliance' \? <PortalComplianceV3 \/> : null/);
  });

  it("10. OrgComplianceView is no longer the ORGANIZATION normal body", () => {
    const src = orgBranch();
    assert.match(src, /view !== 'compliance'/);
    assert.doesNotMatch(src, /<OrgComplianceView/);
    const orgViews = read("src/components/client-portal/OrganizationPortalViews.tsx");
    assert.match(orgViews, /<OrgComplianceView/);
    assert.equal(exists("src/components/client-portal/OrgComplianceView.tsx"), true);
  });

  it("11. compliance consumes the canonical projections and answering mechanism", () => {
    const src = complianceV3();
    assert.match(src, /getPortalCompliance\(\)/);
    assert.match(src, /getPortalComplianceRequests\(\)/);
    assert.match(src, /answerPortalCompanyProfileQuestion\(/);
    assert.match(src, /getPortalCompanyProfileDiscovery\(\)/);
    assert.match(src, /companyProfileCompletion\(/);
  });

  it("12. compliance classification reuses the canonical legacy module (single source of truth)", () => {
    const src = complianceV3();
    assert.match(src, /from "@\/components\/client-portal\/OrgComplianceView"/);
    assert.match(src, /classifyTopic/);
    assert.match(src, /summaryGroups/);
    assert.match(src, /filterTopics/);
    assert.match(src, /nextActionFor/);
    assert.match(src, /buildAnswerPayload/);
    assert.match(src, /<TopicDetailView/);
  });

  it("13. no score percentage or quality rating is invented", () => {
    const src = complianceV3();
    assert.match(src, /Nincs pontszám és nincs százalékos minősítés\./);
    assert.doesNotMatch(src, /\{[^}]*\}%|%\{[^}]*\}/);
    assert.doesNotMatch(src, /score[A-Z]|maturity/);
  });

  it("14. ?topic= deep links and answering states are preserved", () => {
    const src = complianceV3();
    assert.match(src, /readTopicParam/);
    assert.match(src, /withTopicParam/);
    assert.match(src, /applyTopicSelection/);
    assert.match(src, /status: "UNKNOWN"/);
    assert.match(src, /refreshAfterProfileAnswer/);
  });

  it("15. the canonical compliance QA testids stay resolvable", () => {
    const src = complianceV3();
    for (const testid of ["org-compliance-view", "compliance-section-nav"]) {
      assert.ok(src.includes(testid), `${testid} missing`);
    }
  });
});

describe("Checkpoint G1 — preservation", () => {
  it("16. INDIVIDUAL and CASE_RELAY keep the legacy grow/compliance path", () => {
    const src = shell();
    const legacyMain = src.slice(src.indexOf("// Customer context label"));
    assert.match(legacyMain, /<OrganizationPortalViews/);
    assert.match(src, /workspace\.mode === 'CASE_RELAY'/);
  });

  it("17. legacy surfaces remain in the repository", () => {
    for (const relative of [
      "src/components/client-portal/OrgGrowView.tsx",
      "src/components/client-portal/OrgComplianceView.tsx",
      "src/components/client-portal/OrganizationPortalViews.tsx",
      "src/components/client-portal/OrgGrowOperatingCanvas.tsx",
      "src/components/client-portal/OrgGrowContextInspector.tsx",
      "src/app/portal/fejlesztes/page.tsx",
      "src/app/portal/megfeleles/page.tsx",
    ]) {
      assert.equal(exists(relative), true, `${relative} must remain`);
    }
  });
});

describe("Checkpoint G1 — visual contract", () => {
  it("18. no raw hex / stone / cp-* / adm-blue / adm-ivory / marketing radius in the new V3 files", () => {
    const src = v3Sources();
    assert.doesNotMatch(src, /(?:bg|text|border|ring|fill|stroke)-\[#(?:[0-9a-fA-F]{3,8})\]/);
    assert.doesNotMatch(src, /style=\{\{[^}]*(?:color|backgroundColor|borderColor)\s*:\s*["']#/);
    assert.doesNotMatch(src, /stone-/);
    assert.doesNotMatch(src, /cp-/);
    assert.doesNotMatch(src, /--adm-blue/);
    assert.doesNotMatch(src, /--adm-ivory/);
    assert.doesNotMatch(src, /rounded-2xl|rounded-3xl/);
    assert.match(src, /--adm-canvas-subtle|--adm-canvas-white/);
    assert.match(src, /--adm-border-canonical/);
    assert.match(src, /--adm-brand-green/);
    assert.match(src, /focus-visible:ring-2/);
  });

  it("19. truthful loading and empty states exist in both surfaces", () => {
    const grow = growV3();
    assert.match(grow, /portal-grow-loading/);
    assert.match(grow, /Még nincs kitöltött felmérés/);
    assert.match(grow, /Jelenleg nincs ügyféloldalon közzétett fejlesztési lehetőség\./);
    const compliance = complianceV3();
    assert.match(compliance, /portal-compliance-loading/);
    assert.match(compliance, /Jelenleg nincs Öntől várt teendő/);
  });
});
