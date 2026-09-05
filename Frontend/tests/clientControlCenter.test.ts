import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

describe("Client Control Center (Dashboard Card Grid / Rubrikák)", () => {
  const pageSrc = read("src/app/clients/[clientId]/page.tsx");
  const controlCenterSrc = read("src/components/clients/ClientControlCenter.tsx");
  const tabsSrc = read("src/components/clients/ClientWorkspaceTabs.tsx");

  it("1. Client overview renders the ClientControlCenter dashboard card grid as primary navigation", () => {
    assert.match(pageSrc, /import \{ ClientControlCenter \} from "@\/components\/clients\/ClientControlCenter"/);
    assert.match(pageSrc, /<ClientControlCenter[\s\S]*clientId=\{clientId\}[\s\S]*client=\{client\}[\s\S]*cases=\{cases\}[\s\S]*dossierStats=\{dossierStats\}[\s\S]*organizationMode=\{organizationMode\}/);
    // Overview hero header no longer hosts dominant horizontal tabs
    const heroStart = pageSrc.indexOf('<header className="adm-board-hero');
    const heroEnd = pageSrc.indexOf("</header>", heroStart);
    const heroContent = pageSrc.slice(heroStart, heroEnd);
    assert.ok(!heroContent.includes("<ClientWorkspaceTabs"), "Overview hero header must not embed dominant horizontal tabs");
  });

  it("2. Communications card targets /communications?clientId=<encoded id> with concise count and no message listing", () => {
    assert.match(controlCenterSrc, /href=\{`\/communications\?clientId=\$\{encodedId\}`\}/);
    assert.match(controlCenterSrc, /Beérkezett kommunikációk/);
    assert.match(controlCenterSrc, /\{dossierStats\.communications\}/);
    // Does not list individual messages inside the card
    assert.ok(!controlCenterSrc.includes("communications.map"), "Card must not list individual messages");
  });

  it("3. Active Cases card targets /cases?clientId=<encoded id>&scope=ACTIVE with active count", () => {
    assert.match(controlCenterSrc, /href=\{`\/cases\?clientId=\$\{encodedId\}&scope=ACTIVE`\}/);
    assert.match(controlCenterSrc, /Nyitott ügyek/);
    assert.match(controlCenterSrc, /\{dossierStats\.activeCases\}/);
  });

  it("4. Organization client shows organization-specific cards (Szervezeti felépítés and Vállalati működés)", () => {
    assert.match(controlCenterSrc, /\{organizationMode && \(/);
    assert.match(controlCenterSrc, /href=\{`\/clients\/\$\{encodedId\}\/szervezet`\}/);
    assert.match(controlCenterSrc, /Szervezeti felépítés/);
    assert.match(controlCenterSrc, /href=\{`\/clients\/\$\{encodedId\}\/vallalati-mukodes`\}/);
    assert.match(controlCenterSrc, /Vállalati működés/);
  });

  it("5. Individual client does not expose organization-only cards", () => {
    // Both organization cards are guarded by organizationMode
    assert.match(
      controlCenterSrc,
      /\{organizationMode\s*&&\s*\(\s*<Link[^>]+href=\{`\/clients\/\$\{encodedId\}\/szervezet`\}[\s\S]*?Szervezeti felépítés/,
    );
    assert.match(
      controlCenterSrc,
      /\{organizationMode\s*&&\s*\(\s*<Link[^>]+href=\{`\/clients\/\$\{encodedId\}\/vallalati-mukodes`\}[\s\S]*?Vállalati működés/,
    );
  });

  it("6. Portal card reaches existing client portal context /clients/[id]/portal with concise status", () => {
    assert.match(controlCenterSrc, /href=\{`\/clients\/\$\{encodedId\}\/portal`\}/);
    assert.match(controlCenterSrc, /Ügyfélportál/);
    assert.match(controlCenterSrc, /client\.portalAccessEnabled \? "Előkészítve" : "Nincs előkészítve"/);
    // Technical control plane is not in the card
    assert.ok(!controlCenterSrc.includes("relationshipMode"), "Portal card must not expose relationshipMode");
    assert.ok(!controlCenterSrc.includes("connectedSystemState"), "Portal card must not expose connectedSystemState");
  });

  it("7. Existing child pages still render ClientWorkspaceTabs", () => {
    const casesPage = read("src/app/clients/[clientId]/cases/page.tsx");
    const orgPage = read("src/app/clients/[clientId]/szervezet/page.tsx");
    const opsPage = read("src/app/clients/[clientId]/vallalati-mukodes/page.tsx");
    const portalPage = read("src/app/clients/[clientId]/portal/page.tsx");

    assert.match(casesPage, /<ClientWorkspaceTabs clientId=\{client\.id\} active="cases"/);
    assert.match(orgPage, /<ClientWorkspaceTabs clientId=\{client\.id\} active="organization"/);
    assert.match(opsPage, /<ClientWorkspaceTabs clientId=\{client\.id\} active="company-operations"/);
    assert.match(portalPage, /<ClientWorkspaceTabs clientId=\{client\.id\} active="portal"/);
  });

  it("8. Haladó behavior from PR #170 remains unchanged and reachable", () => {
    // In ClientWorkspaceTabs (used on child pages)
    assert.match(tabsSrc, /••• Haladó/);
    assert.match(tabsSrc, /Munkacsoportok/);
    assert.match(tabsSrc, /Dokumentumstílus/);
    assert.match(tabsSrc, /#house-style/);

    // On overview page (accessible as secondary utility navigation)
    assert.match(pageSrc, /••• Haladó/);
    assert.match(pageSrc, /#house-style/);
    assert.match(pageSrc, /Munkacsoportok/);
  });

  it("9. Client color is used as a meaningful visual card accent without destroying readability", () => {
    assert.match(controlCenterSrc, /getClientColorDefinition\(client\.colorKey\)/);
    assert.match(controlCenterSrc, /colorDef\.accentBorderClass/);
    assert.match(controlCenterSrc, /border-l-4/);
    assert.match(controlCenterSrc, /colorDef\.accentClass/);
  });

  it("10. Existing dossier content and primary actions remain present", () => {
    assert.match(pageSrc, /Ügyfél szerkesztése/);
    assert.match(pageSrc, /Új ügy/);
    assert.match(pageSrc, /Dokumentum hozzáadása/);
    assert.match(pageSrc, /Kapcsolt ügyek/);
    assert.match(pageSrc, /Kapcsolt dokumentumok/);
    assert.match(pageSrc, /Kapcsolt kommunikációk/);
    assert.match(pageSrc, /ClientHouseStylePanel/);
    assert.match(pageSrc, /ClientCompanyFoundation/);
    assert.match(pageSrc, /ClientContractLibrary/);
    assert.match(pageSrc, /ClientOrganization/);
    assert.match(pageSrc, /CompactNewCaseDialog/);
    assert.match(pageSrc, /dossierStats/);
  });
});
