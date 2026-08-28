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
    assert.match(src, /Cégadatok/);
    assert.match(src, /A szervezeti áttekintéshez szükséges cégadatok\./);
  });

  it("supports ANSWERED with typed numeric mutation (e.g. 47 -> 52) and UNKNOWN transitions", () => {
    const src = profileSrc();
    const answered = src.slice(src.indexOf("const handleSaveAnswer"), src.indexOf("const handleMarkUnknown"));
    const unknown = src.slice(src.indexOf("const handleMarkUnknown"), src.indexOf("if (loading)"));
    // Saving ANSWERED
    assert.match(src, /status:\s*"ANSWERED"/);
    assert.match(src, /numberValue/);
    assert.match(src, /Mentés/);
    // Saving UNKNOWN
    assert.match(src, /status:\s*"UNKNOWN"/);
    assert.match(src, /Nem ismertként jelölöm/);
    assert.match(src, /const refreshDiscovery = useCallback\(async \(\) => \{/);
    assert.match(src, /await refreshDiscovery\(\);/);
    assert.match(src, /void loadDiscovery\(\);/);
    assert.match(src, /mutationCompleted/);
    assert.match(src, /Az adat mentése megtörtént, de a frissített áttekintés betöltése nem sikerült/);
    // Both handlers use the throwing refresh primitive before awaiting the parent refresh.
    for (const handler of [answered, unknown]) {
      assert.ok(handler.indexOf("await answerPortalCompanyProfileQuestion") < handler.indexOf("await refreshDiscovery"));
      assert.ok(handler.indexOf("await refreshDiscovery") < handler.indexOf("await onProfileUpdated?.()"));
      assert.doesNotMatch(handler, /await loadDiscovery\(\)/);
    }
    assert.match(
      src,
      /A cégadatokat frissítettük\. A szervezeti áttekintést az új adatok alapján frissítettük\./,
    );
  });

  it("keeps mutation failures distinct from persisted-but-stale refresh failures", () => {
    const src = profileSrc();
    const answered = src.slice(src.indexOf("const handleSaveAnswer"), src.indexOf("const handleMarkUnknown"));
    const unknown = src.slice(src.indexOf("const handleMarkUnknown"), src.indexOf("if (loading)"));
    for (const handler of [answered, unknown]) {
      assert.match(handler, /if \(mutationCompleted\)/);
      assert.match(handler, /setRefreshWarning\(/);
      assert.match(handler, /setActionError\(clientSafeError\(err\)\)/);
    }
    assert.match(src, /<div[\s\S]*role="status"[\s\S]*\{refreshWarning\}/);
  });

  it("never exposes a technical question key as a visible label or test marker", () => {
    const src = profileSrc();
    assert.match(src, /return question\.label\?\.trim\(\) \|\| "Szervezeti adat"/);
    assert.doesNotMatch(src, /return question\.label \|\| question\.questionKey/);
    assert.match(src, /data-testid="company-profile-question"/);
    assert.doesNotMatch(src, /data-testid=\{`company-profile-question-\$\{question\.questionKey\}\`\}/);
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

  it("removes compliance-console language from customer-facing organization views", () => {
    const profile = profileSrc();
    const home = read("src/components/client-portal/OrgHomeView.tsx");
    for (const source of [profile, home]) {
      assert.doesNotMatch(source, /Vállalat és megfelelőség/);
      assert.doesNotMatch(source, /Megfelelőségi áttekintés/);
      assert.doesNotMatch(
        source,
        /jogi megfelelőségi és működési értékeléshez szükséges alapvető szervezeti adatok/,
      );
    }
    assert.match(home, /Vállalati profil/);
    assert.match(home, /Szervezeti területek/);
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
