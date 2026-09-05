import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CLIENT_COLOR_DEFINITIONS,
  CLIENT_COLOR_KEYS,
  NEUTRAL_CLIENT_COLOR,
  getClientAccentTopBorderClass,
} from "../src/lib/clientColors";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

describe("Client Control Center Semantic Truthfulness & Information Architecture", () => {
  const pageSrc = read("src/app/clients/[clientId]/page.tsx");
  const controlCenterSrc = read("src/components/clients/ClientControlCenter.tsx");
  const tabsSrc = read("src/components/clients/ClientWorkspaceTabs.tsx");

  it("1. Control center does NOT label recent mixed summary length as 'Beérkezett kommunikációk' total", () => {
    assert.ok(
      !controlCenterSrc.includes("Beérkezett kommunikációk"),
      "Must not use misleading 'Beérkezett kommunikációk' title without an authoritative inbound read projection",
    );
    assert.match(controlCenterSrc, /Kommunikációk/);
    assert.match(controlCenterSrc, /href=\{`\/communications\?clientId=\$\{encodedId\}`\}/);
  });

  it("2. Control center does NOT render dossierStats.communications as a total communication metric", () => {
    assert.ok(
      !controlCenterSrc.includes("dossierStats.communications"),
      "Must not render recent display sample as total communication metric",
    );
    assert.ok(
      !controlCenterSrc.includes("communications.length"),
      "Must not render sample communications.length in card",
    );
    assert.match(controlCenterSrc, /Kommunikáció megnyitása/);
  });

  it("3. ClientControlCenter no longer contains the misleading Dokumentumok card", () => {
    assert.ok(
      !controlCenterSrc.includes("Dokumentumok"),
      "ClientControlCenter must not contain Dokumentumok card until canonical client-level projection exists",
    );
  });

  it("4. No first-active-case document routing exists in ClientControlCenter", () => {
    assert.ok(
      !controlCenterSrc.includes("documentsHref"),
      "Must not route client-level document context to an arbitrary first active case",
    );
    assert.ok(
      !controlCenterSrc.includes("/documents"),
      "Must not contain arbitrary document workspace deep link in control center",
    );
  });

  it("5. Archived cases are excluded from activeCases", () => {
    assert.match(pageSrc, /!\["CLOSED",\s*"ARCHIVED"\]\.includes/);
    assert.match(pageSrc, /String\(item\.status\s*\|\|\s*""\)\.toUpperCase\(\)/);

    // Test case filtering logic behaviorally
    const sampleCases = [
      { id: "1", status: "DRAFT" },
      { id: "2", status: "IN_REVIEW" },
      { id: "3", status: "CLOSED" },
      { id: "4", status: "ARCHIVED" },
      { id: "5", status: "CLIENT_INPUT" },
    ];
    const active = sampleCases.filter(
      (c) => !["CLOSED", "ARCHIVED"].includes(String(c.status || "").toUpperCase()),
    );
    assert.equal(active.length, 3);
    assert.deepEqual(active.map((c) => c.id), ["1", "2", "5"]);
  });

  it("6. Numeric active-case count is rendered only when the loaded client case set is complete", () => {
    assert.match(pageSrc, /isCasesComplete/);
    assert.match(
      pageSrc,
      /setIsCasesComplete\(total !== null && total <= casesResponse\.data\.length\)/,
    );
    assert.match(
      controlCenterSrc,
      /\{isCasesComplete \? \([\s\S]*?\{activeCases\}[\s\S]*?\) : \(/,
    );
  });

  it("6a. Hero case metrics use completeness-aware and authoritative values", () => {
    assert.match(pageSrc, /const \[caseTotalCount, setCaseTotalCount\] = useState<number \| null>\(null\)/);
    assert.match(pageSrc, /const total = casesResponse\.pagination\?\.total \?\? null;/);
    assert.match(pageSrc, /setIsCasesComplete\(total !== null && total <= casesResponse\.data\.length\)/);
    assert.match(pageSrc, /\{isCasesComplete \? dossierStats\.activeCases : "—"\}/);
    assert.match(pageSrc, /\{caseTotalCount \?\? "—"\}/);
    assert.doesNotMatch(pageSrc, /<p className="font-serif text-2xl">\{dossierStats\.totalCases\}<\/p>/);
  });

  it("6b. Hero case metrics preserve truthfulness for complete, incomplete, and failed case queries", () => {
    const resolveHeroMetrics = (
      dataLength: number,
      total: number | null,
      activeCases: number,
    ) => ({
      active: total !== null && total <= dataLength ? activeCases : "—",
      total: total ?? "—",
    });

    assert.deepEqual(resolveHeroMetrics(3, 3, 2), { active: 2, total: 3 });
    assert.deepEqual(resolveHeroMetrics(100, 143, 80), { active: "—", total: 143 });
    assert.deepEqual(resolveHeroMetrics(0, null, 0), { active: "—", total: "—" });
  });

  it("7. In incomplete-case-set state the card remains usable but uses a non-numeric CTA", () => {
    assert.match(controlCenterSrc, /Ügyek megnyitása/);
    assert.match(controlCenterSrc, /href=\{`\/cases\?clientId=\$\{encodedId\}&scope=ACTIVE`\}/);
  });

  it("8. organizationMode is exactly ORGANIZATION || CASE_RELAY", () => {
    assert.match(
      pageSrc,
      /const organizationMode =\s*portalWorkspace\?\.mode === "ORGANIZATION" \|\|\s*portalWorkspace\?\.mode === "CASE_RELAY";/,
    );
    assert.ok(
      !pageSrc.includes('portalWorkspace.mode !== "INDIVIDUAL"'),
      "Must not broaden organizationMode beyond accepted ORGANIZATION || CASE_RELAY contract",
    );
  });

  it("9. Organization-only cards remain hidden in individual mode", () => {
    assert.match(
      controlCenterSrc,
      /\{organizationMode\s*&&\s*\(\s*<Link[^>]+href=\{`\/clients\/\$\{encodedId\}\/szervezet`\}[\s\S]*?Szervezeti felépítés/,
    );
    assert.match(
      controlCenterSrc,
      /\{organizationMode\s*&&\s*\(\s*<Link[^>]+href=\{`\/clients\/\$\{encodedId\}\/vallalati-mukodes`\}[\s\S]*?Vállalati működés/,
    );
  });

  it("10. Child-page tabs and Haladó behavior remain preserved", () => {
    const casesPage = read("src/app/clients/[clientId]/cases/page.tsx");
    const orgPage = read("src/app/clients/[clientId]/szervezet/page.tsx");
    const opsPage = read("src/app/clients/[clientId]/vallalati-mukodes/page.tsx");
    const portalPage = read("src/app/clients/[clientId]/portal/page.tsx");

    assert.match(casesPage, /<ClientWorkspaceTabs clientId=\{client\.id\} active="cases"/);
    assert.match(orgPage, /<ClientWorkspaceTabs clientId=\{client\.id\} active="organization"/);
    assert.match(opsPage, /<ClientWorkspaceTabs clientId=\{client\.id\} active="company-operations"/);
    assert.match(portalPage, /<ClientWorkspaceTabs clientId=\{client\.id\} active="portal"/);

    assert.match(tabsSrc, /••• Haladó/);
    assert.match(tabsSrc, /Munkacsoportok/);
    assert.match(tabsSrc, /Dokumentumstílus/);
    assert.match(tabsSrc, /#house-style/);

    assert.match(pageSrc, /••• Haladó/);
    assert.match(pageSrc, /#house-style/);
    assert.match(pageSrc, /Munkacsoportok/);
  });

  it("11. No separate long right-hand sidebar rail exists in dossier overview layout", () => {
    assert.ok(
      !pageSrc.includes("<aside"),
      "Dossier overview must NOT contain a separate <aside> sidebar rail",
    );
    assert.ok(
      !pageSrc.includes("xl:grid-cols-[minmax(0,1fr)_360px]"),
      "Dossier overview must NOT use split 360px sidebar layout",
    );
  });

  it("12. Former sidebar modules are fully integrated into main dashboard content", () => {
    assert.match(pageSrc, /Ügyfélazonosság és kapcsolódó adatok/);
    assert.match(pageSrc, /Gyors műveletek/);
    assert.match(controlCenterSrc, /Ügyfélportál/);
    assert.match(pageSrc, /House style/);
    assert.match(pageSrc, /ClientHouseStylePanel/);
    assert.match(pageSrc, /ClientCompanyFoundation/);
    assert.match(pageSrc, /ClientContractLibrary/);
    assert.match(pageSrc, /ClientOrganization/);
  });

  it("13. Client color visual language is strengthened in dashboard and control center", () => {
    assert.match(pageSrc, /getClientColorDefinition/);
    assert.match(pageSrc, /clientColorDef\.accentClass/);
    assert.match(pageSrc, /clientColorDef\.softBackgroundClass/);
    assert.match(controlCenterSrc, /colorDef\.accentBorderClass/);
    assert.match(controlCenterSrc, /colorDef\.softBackgroundClass/);
    assert.match(controlCenterSrc, /colorDef\.accentClass/);
  });

  it("14. Connected working lists (cases, documents, communications) remain present and rendered", () => {
    assert.match(pageSrc, /Kapcsolt ügyek/);
    assert.match(pageSrc, /Kapcsolt dokumentumok/);
    assert.match(pageSrc, /Kapcsolt kommunikációk/);
  });

  it("15. Workgroups capability boundary in Quick Actions and Haladó dropdown is strictly guarded by organizationMode", () => {
    // Quick Actions card workgroups link is guarded strictly by organizationMode
    assert.match(
      pageSrc,
      /\{organizationMode && \(\s*<Link\s+href=\{`\/clients\/\$\{encodeURIComponent\(clientId\)\}\/workgroups`\}[\s\S]*?Munkacsoportok[\s\S]*?<\/Link>\s*\)\}/,
      "Quick Actions workgroups link must be strictly guarded by organizationMode",
    );

    // Header Haladó dropdown workgroups link is guarded strictly by organizationMode
    assert.match(
      pageSrc,
      /\{organizationMode \? \(\s*<Link[\s\S]*?\/workgroups`\}[\s\S]*?Munkacsoportok[\s\S]*?<\/Link>\s*\) : null\}/,
      "Header Haladó dropdown workgroups link must be guarded by organizationMode",
    );
  });

  it("16. Quick Actions contains NO duplicate portal card or 'Portál megnyitása' affordance", () => {
    assert.ok(
      !pageSrc.includes("Portál megnyitása"),
      "Dossier overview must NOT contain duplicate 'Portál megnyitása' action",
    );
    assert.ok(
      !pageSrc.includes("portalAccessEnabled ?"),
      "Dossier overview must NOT duplicate portal status toggle in secondary cards",
    );
    assert.match(
      controlCenterSrc,
      /Ügyfélportál/,
      "ClientControlCenter must contain canonical Ügyfélportál card",
    );
    assert.match(
      controlCenterSrc,
      /href=\{`\/clients\/\$\{encodedId\}\/portal`\}/,
      "ClientControlCenter must link to dedicated portal page",
    );
  });

  it("17. No dynamic Tailwind class synthesis exists in pageSrc, controlCenterSrc, or tabsSrc", () => {
    assert.ok(
      !pageSrc.includes('.replace("border-l-'),
      "pageSrc must NOT perform runtime .replace('border-l-', ...) class synthesis",
    );
    assert.ok(
      !controlCenterSrc.includes('.replace("border-l-'),
      "controlCenterSrc must NOT perform runtime .replace('border-l-', ...) class synthesis",
    );
    assert.ok(
      !tabsSrc.includes('.replace("border-l-'),
      "tabsSrc must NOT perform runtime .replace('border-l-', ...) class synthesis",
    );
  });

  it("18. All client color definitions in clientColors.ts define static accentTopBorderClass", () => {
    assert.equal(NEUTRAL_CLIENT_COLOR.accentTopBorderClass, "border-t-transparent");
    for (const key of CLIENT_COLOR_KEYS) {
      const def = CLIENT_COLOR_DEFINITIONS[key];
      assert.ok(
        def.accentTopBorderClass && def.accentTopBorderClass.startsWith("border-t-"),
        `Color ${key} must have static accentTopBorderClass starting with border-t-`,
      );
      assert.equal(getClientAccentTopBorderClass(key), def.accentTopBorderClass);
    }
    assert.equal(getClientAccentTopBorderClass(null), "border-t-transparent");
    assert.equal(getClientAccentTopBorderClass(undefined), "border-t-transparent");
    assert.equal(getClientAccentTopBorderClass("UNKNOWN_COLOR"), "border-t-transparent");
  });

  it("19. Organization mode resolution correctly distinguishes INDIVIDUAL from ORGANIZATION and CASE_RELAY", () => {
    const resolveOrgMode = (mode?: string | null) =>
      mode === "ORGANIZATION" || mode === "CASE_RELAY";

    assert.equal(resolveOrgMode("INDIVIDUAL"), false, "INDIVIDUAL mode must not enable organizationMode");
    assert.equal(resolveOrgMode(null), false, "Null mode must not enable organizationMode");
    assert.equal(resolveOrgMode(undefined), false, "Undefined mode must not enable organizationMode");
    assert.equal(resolveOrgMode("UNKNOWN"), false, "Unknown mode must not enable organizationMode");
    assert.equal(resolveOrgMode("ORGANIZATION"), true, "ORGANIZATION mode must enable organizationMode");
    assert.equal(resolveOrgMode("CASE_RELAY"), true, "CASE_RELAY mode must enable organizationMode");
  });

  it("20. Dashboard panels utilize static clientColorDef.accentTopBorderClass for top accents", () => {
    assert.match(pageSrc, /clientColorDef\.accentTopBorderClass/);
    const matches = pageSrc.match(/clientColorDef\.accentTopBorderClass/g);
    assert.ok(matches && matches.length >= 7, "All accented panels must use clientColorDef.accentTopBorderClass");
  });
});
