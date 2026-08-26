import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("Organization Customer Company Profile / AnswerState UI", () => {
  const profileSrc = () => read("src/components/client-portal/OrganizationCompanyProfile.tsx");
  const viewsSrc = () => read("src/components/client-portal/OrganizationPortalViews.tsx");
  const apiSrc = () => read("src/lib/clientPortalApi.ts");

  it("exposes canonical Company Profile Discovery & AnswerState API methods and DTOs", () => {
    const api = apiSrc();
    assert.match(api, /export async function getPortalCompanyProfileDiscovery/);
    assert.match(api, /'\/client-portal\/org\/company-profile'/);
    assert.match(api, /export async function answerPortalCompanyProfileQuestion/);
    assert.match(api, /\/client-portal\/org\/company-profile\/questions\//);
    assert.match(api, /PortalCompanyProfileDiscovery/);
    assert.match(api, /PortalCompanyProfileQuestion/);
    assert.match(api, /PortalCompanyProfileAnswerPayload/);
    assert.match(api, /status:\s*"ANSWERED"\s*\|\s*"UNKNOWN"/);
  });

  it("OrganizationCompanyProfile is functional, client-safe, and renders questions with human labels", () => {
    const src = profileSrc();
    assert.match(src, /OrganizationCompanyProfile/);
    assert.match(src, /getPortalCompanyProfileDiscovery/);
    assert.match(src, /answerPortalCompanyProfileQuestion/);
    assert.match(src, /Vállalati profil/);
    assert.match(src, /Foglalkoztatottak létszáma/);
    assert.match(src, /Megadva/);
    assert.match(src, /Nem ismertként jelölve/);
    assert.match(src, /Nincs megadva/);
    assert.match(src, /Kitöltöttség/);
  });

  it("supports ANSWERED with typed numeric mutation (e.g. 47 -> 52) and UNKNOWN transitions", () => {
    const src = profileSrc();
    // Saving ANSWERED
    assert.match(src, /status:\s*"ANSWERED"/);
    assert.match(src, /numberValue/);
    assert.match(src, /Mentés/);
    // Saving UNKNOWN
    assert.match(src, /status:\s*"UNKNOWN"/);
    assert.match(src, /Nem ismertként jelölöm/);
    // Refreshing discovery and notifying parent after save
    assert.match(src, /loadDiscovery/);
    assert.match(src, /onProfileUpdated\?\.()/);
  });

  it("uses neutral, client-safe copy and preserves UNANSWERED as absence", () => {
    const src = profileSrc();
    assert.match(src, /Ehhez még szükségünk van egy adatra\./);
    assert.match(src, /A szervezet jelenleg nem rendelkezik pontos adattal\./);
    // Guard against accusing or legal-breach customer language
    assert.doesNotMatch(src, /Hiányos a megfelelősége/);
    assert.doesNotMatch(src, /Ön jogszabályt sért/);
    assert.doesNotMatch(src, /Jogszabálysértés/);
  });

  it("strictly prohibits internal technical IDs, rule ASTs, and severity scores from leaking", () => {
    const src = profileSrc();
    assert.doesNotMatch(src, /factDefinitionId/);
    assert.doesNotMatch(src, /clientFactId/);
    assert.doesNotMatch(src, /ruleAst|astExpression|operator/i);
    assert.doesNotMatch(src, /internalSeverity|severityScore/i);
    assert.doesNotMatch(src, /workforceOwner|internalReviewer/i);
  });

  it("is designed for arbitrary authorized organization clients (no hardcoded Demo Kft strings/IDs)", () => {
    const src = profileSrc();
    assert.doesNotMatch(src, /Demo Kft/);
    assert.doesNotMatch(src, /DEMO_KFT_/);
    assert.doesNotMatch(src, /Péterfi János/);
  });

  it("is integrated into OrganizationPortalViews under the company view (/portal/vallalat)", () => {
    const views = viewsSrc();
    assert.match(views, /import \{.*OrganizationCompanyProfile.*\} from "\.\/OrganizationCompanyProfile"/);
    assert.match(views, /<OrganizationCompanyProfile onProfileUpdated=\{onProfileUpdated\} \/>/);
    assert.match(views, /view === "company" \? <OrganizationCompany company=\{state\.company\} onProfileUpdated=\{load\} \/>/);
  });
});
