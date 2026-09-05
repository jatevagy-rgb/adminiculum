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
      /\{organizationMode\s*&&\s*\(\s*<Link[^>]+href=\{`\/clients\/\$\{encodedId\}\/vallalati-mukodes`\}[\s\S]*?Grow with us/,
    );
    assert.match(
      controlCenterSrc,
      /\{organizationMode\s*&&\s*\(\s*<Link[^>]+href=\{`\/clients\/\$\{encodedId\}\/vallalati-mukodes#compliance`\}[\s\S]*?Compliance/,
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
    assert.match(pageSrc, /ClientOrganizationPreview/);
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

  it("21. Hero contains only Új ügy and Haladó, with no duplicate module entrypoints or secondary actions", () => {
    const heroStart = pageSrc.indexOf('<header className="adm-board-hero');
    const heroEnd = pageSrc.indexOf("</header>", heroStart);
    assert.ok(heroStart !== -1 && heroEnd !== -1, "Hero header must exist");
    const heroContent = pageSrc.slice(heroStart, heroEnd);

    // Kept in HERO:
    assert.match(heroContent, /Új ügy/);
    assert.match(heroContent, /••• Haladó/);

    // Removed from HERO:
    assert.ok(!heroContent.includes("Vállalati működés"), "Hero must not contain Vállalati működés");
    assert.ok(!heroContent.includes("Szervezet"), "Hero must not contain Szervezet");
    assert.ok(!heroContent.includes("Ügyfél szerkesztése"), "Hero must not contain Ügyfél szerkesztése");
    assert.ok(!heroContent.includes("Dokumentum hozzáadása"), "Hero must not contain Dokumentum hozzáadása");
  });

  it("22. Gyors műveletek contains actions only, without duplicate Új ügy or Ügyfél kommunikációk", () => {
    const qmStart = pageSrc.indexOf("Gyors műveletek");
    const qmEnd = pageSrc.indexOf("House style", qmStart);
    assert.ok(qmStart !== -1 && qmEnd !== -1, "Gyors műveletek section must exist");
    const qmContent = pageSrc.slice(qmStart, qmEnd);

    // Kept in Gyors műveletek:
    assert.match(qmContent, /Ügyfél szerkesztése/);
    assert.match(qmContent, /Dokumentum hozzáadása/);
    assert.match(qmContent, /Munkacsoportok/);

    // Removed from Gyors műveletek:
    assert.ok(!qmContent.includes("Új ügy indítása"), "Gyors műveletek must not contain Új ügy indítása");
    assert.ok(!qmContent.includes("Ügyfél kommunikációk"), "Gyors műveletek must not contain Ügyfél kommunikációk");
  });

  it("23. Removing duplicate entrypoints preserves all canonical functional targets elsewhere", () => {
    // Primary New Case modal is in Hero
    assert.match(pageSrc, /setShowNewCaseModal\(true\)/);
    assert.match(pageSrc, /<CompactNewCaseDialog/);

    // Edit Client modal is in Gyors műveletek
    assert.match(pageSrc, /openEditClient/);
    assert.match(pageSrc, /showEditModal &&/);

    // Document add action is in Gyors műveletek
    assert.match(pageSrc, /Dokumentum hozzáadása/);

    // Canonical Control Center modules
    assert.match(controlCenterSrc, /Nyitott ügyek/);
    assert.match(controlCenterSrc, /Kommunikációk/);
    assert.match(controlCenterSrc, /Ügyfélportál/);
    assert.match(controlCenterSrc, /Szervezeti felépítés/);
    assert.match(controlCenterSrc, /Grow with us/);
    assert.match(controlCenterSrc, /Compliance/);

    // Canonical lower panels
    assert.match(pageSrc, /<ClientCompanyFoundation/);
    assert.match(pageSrc, /<ClientContractLibrary/);
    assert.match(pageSrc, /<ClientOrganizationPreview/);
    assert.match(pageSrc, /<ClientHouseStylePanel/);
  });

  it("24. Dossier overview no longer directly renders full ClientOrganization, but renders ClientOrganizationPreview for organizationMode clients", () => {
    assert.ok(
      !pageSrc.includes("<ClientOrganization "),
      "Dossier overview must NOT render full ClientOrganization",
    );
    assert.ok(
      !pageSrc.includes("<ClientOrganization/"),
      "Dossier overview must NOT render full ClientOrganization",
    );
    assert.match(
      pageSrc,
      /\{organizationMode && \(\s*<section id="szervezet"[\s\S]*?<ClientOrganizationPreview/,
      "Dossier overview must render ClientOrganizationPreview guarded by organizationMode",
    );

    // Dedicated /szervezet page still renders full ClientOrganization
    const orgPageSrc = read("src/app/clients/[clientId]/szervezet/page.tsx");
    assert.match(
      orgPageSrc,
      /<ClientOrganization clientId=\{client\.id\} clientName=\{client\.name\} \/>/,
      "Dedicated /szervezet page must still render full ClientOrganization",
    );
  });

  it("25. ClientOrganizationPreview remains compact and does NOT contain person search, person editor, or full linked case list", () => {
    const previewSrc = read("src/components/clients/ClientOrganizationPreview.tsx");

    // No search
    assert.ok(!previewSrc.includes("setQuery"), "Preview must NOT contain query search state");
    assert.ok(!previewSrc.includes('type="search"'), "Preview must NOT contain search input");

    // No person editor
    assert.ok(!previewSrc.includes("updatePerson"), "Preview must NOT contain person editor handler");
    assert.ok(!previewSrc.includes("setEditTitle"), "Preview must NOT contain person edit title state");

    // No full responsibilities or contracts/cases lists
    assert.ok(!previewSrc.includes("ownedContracts"), "Preview must NOT contain full ownedContracts list");
    assert.ok(!previewSrc.includes("ownedObligations"), "Preview must NOT contain full ownedObligations list");

    // Snapshot counts and clear CTA
    assert.match(previewSrc, /Szervezeti felépítés megnyitása/);
    assert.match(previewSrc, /\/szervezet/);
    assert.match(previewSrc, /\{persons\.length\}/);
    assert.match(previewSrc, /\{groups\.length\}/);
  });

  it("26. Organization-mode ClientControlCenter contains exact 6-card set with Grow with us and Compliance", () => {
    // 6 canonical cards
    assert.match(controlCenterSrc, /Nyitott ügyek/);
    assert.match(controlCenterSrc, /Kommunikációk/);
    assert.match(controlCenterSrc, /Ügyfélportál/);
    assert.match(controlCenterSrc, /Szervezeti felépítés/);
    assert.match(controlCenterSrc, /Grow with us/);
    assert.match(controlCenterSrc, /Compliance/);

    // Old generic card title replaced
    assert.ok(
      !controlCenterSrc.includes('<h3 className="mt-2 font-serif text-xl text-[var(--adm-text)] group-hover:text-[var(--adm-ochre-600)]">\n                Vállalati működés'),
      "Old generic Vállalati működés primary card title must be replaced",
    );

    // Grow with us links to existing company workspace
    assert.match(
      controlCenterSrc,
      /href=\{`\/clients\/\$\{encodedId\}\/vallalati-mukodes`\}[\s\S]*?Grow with us/,
      "Grow with us must link to /vallalati-mukodes",
    );

    // Grow with us card does NOT present demo-specific numeric data
    assert.ok(!controlCenterSrc.includes("DEMO_KFT_COMPANY_EMPLOYEE_COUNT"), "Must NOT consume DEMO_KFT_COMPANY_EMPLOYEE_COUNT");
    assert.ok(!controlCenterSrc.includes("growthNarrative"), "Must NOT consume growth narrative generically");

    // Compliance links to /vallalati-mukodes#compliance
    assert.match(
      controlCenterSrc,
      /href=\{`\/clients\/\$\{encodedId\}\/vallalati-mukodes#compliance`\}[\s\S]*?Compliance/,
      "Compliance must link to /vallalati-mukodes#compliance",
    );
  });

  it("27. ClientCompanyWorkspace has stable id='compliance' on relevant-areas panel", () => {
    const companyWsSrc = read("src/components/clients/ClientCompanyWorkspace.tsx");
    assert.match(
      companyWsSrc,
      /<Panel id="compliance" title="Releváns területek">/,
      "Existing compliance panel must have stable id='compliance'",
    );
  });

  it("28. Individual mode does not expose organization-only cards", () => {
    // Cards 4, 5, 6 in ClientControlCenter are all guarded by organizationMode
    assert.match(
      controlCenterSrc,
      /\{organizationMode && \(\s*<Link[^>]+href=\{`\/clients\/\$\{encodedId\}\/szervezet`\}[\s\S]*?Szervezeti felépítés/,
    );
    assert.match(
      controlCenterSrc,
      /\{organizationMode && \(\s*<Link[^>]+href=\{`\/clients\/\$\{encodedId\}\/vallalati-mukodes`\}[\s\S]*?Grow with us/,
    );
    assert.match(
      controlCenterSrc,
      /\{organizationMode && \(\s*<Link[^>]+href=\{`\/clients\/\$\{encodedId\}\/vallalati-mukodes#compliance`\}[\s\S]*?Compliance/,
    );
  });

  it("29. ClientOrganizationPreview does not swallow API errors and reaches outer error state with truthful copy", () => {
    const previewSrc = read("src/components/clients/ClientOrganizationPreview.tsx");

    // Must NOT swallow errors with fallback empty array inside Promise.all
    assert.ok(
      !previewSrc.includes(".catch(() => ({ items: []"),
      "Preview must NOT swallow API rejection with fake empty arrays in Promise.all",
    );
    assert.match(
      previewSrc,
      /Promise\.all\(\[\s*clientOrganizationApi\.listGroups\(clientId\),\s*clientOrganizationApi\.listPersons\(clientId\),?\s*\]\)/,
      "Preview must pass direct API promises to Promise.all",
    );

    // Outer error state must be reachable and set the canonical truthful message
    assert.match(
      previewSrc,
      /setError\("A szervezeti pillanatkép jelenleg nem tölthető be\."\)/,
      "Preview outer catch must set truthful error message",
    );
  });

  it("30. ClientOrganizationPreview failure, genuine-empty, and populated states maintain strict truthfulness and reset stale data", () => {
    const previewSrc = read("src/components/clients/ClientOrganizationPreview.tsx");

    // Stale data reset on reload/new client
    assert.match(
      previewSrc,
      /setLoading\(true\);\s*setError\(null\);\s*setGroups\(\[\]\);\s*setPersons\(\[\]\);/,
      "Must clear stale groups and persons immediately upon clientId change",
    );

    // Header counts only rendered when not loading and not in error
    assert.match(
      previewSrc,
      /\{!loading && !error && \(/,
      "Header counts must only be rendered when !loading && !error",
    );

    // Error state rendered distinctly
    assert.match(previewSrc, /: error \? \(\s*<div[^>]*>\s*\{error\}\s*<\/div>/);

    // Genuine empty state rendered only when both authoritative arrays are empty
    assert.match(previewSrc, /: persons\.length === 0 && groups\.length === 0 \?/);
    assert.match(previewSrc, /Még nincsenek rögzített szervezeti egységek vagy munkatársak\./);

    // Behavioral simulation of render semantics
    type State = {
      loading: boolean;
      error: string | null;
      persons: Array<{ id: string }>;
      groups: Array<{ id: string }>;
    };

    const renderPreviewSemantics = (state: State) => {
      const countsAuthoritative = !state.loading && !state.error;
      const body = state.loading
        ? "LOADING"
        : state.error
          ? `ERROR: ${state.error}`
          : state.persons.length === 0 && state.groups.length === 0
            ? "GENUINE_EMPTY"
            : "POPULATED_PREVIEW";
      return { countsAuthoritative, body };
    };

    // 1. Failure state (API rejection): counts NOT authoritative, error shown, empty state NOT shown
    const failureRes = renderPreviewSemantics({
      loading: false,
      error: "A szervezeti pillanatkép jelenleg nem tölthető be.",
      persons: [],
      groups: [],
    });
    assert.equal(failureRes.countsAuthoritative, false, "Zero counts must not be authoritative on failure");
    assert.equal(failureRes.body, "ERROR: A szervezeti pillanatkép jelenleg nem tölthető be.");
    assert.ok(!failureRes.body.includes("GENUINE_EMPTY"));

    // 2. Genuine empty state: counts authoritative (0, 0), empty copy shown
    const emptyRes = renderPreviewSemantics({
      loading: false,
      error: null,
      persons: [],
      groups: [],
    });
    assert.equal(emptyRes.countsAuthoritative, true);
    assert.equal(emptyRes.body, "GENUINE_EMPTY");

    // 3. Populated state: counts authoritative, preview shown
    const populatedRes = renderPreviewSemantics({
      loading: false,
      error: null,
      persons: [{ id: "p1" }],
      groups: [{ id: "g1" }],
    });
    assert.equal(populatedRes.countsAuthoritative, true);
    assert.equal(populatedRes.body, "POPULATED_PREVIEW");
  });

  it("31. Dedicated /szervezet page accepts ORGANIZATION and CASE_RELAY, rejecting INDIVIDUAL, unknown modes, and ARCHIVED workspaces", () => {
    const orgPageSrc = read("src/app/clients/[clientId]/szervezet/page.tsx");

    assert.match(
      orgPageSrc,
      /item\.status !== "ARCHIVED" &&\s*\(item\.mode === "ORGANIZATION" \|\| item\.mode === "CASE_RELAY"\)/,
      "Dedicated /szervezet page must accept ORGANIZATION and CASE_RELAY while excluding ARCHIVED",
    );
    assert.ok(
      !orgPageSrc.includes('item.mode !== "INDIVIDUAL"'),
      "Dedicated /szervezet page must NOT use mode !== 'INDIVIDUAL'",
    );

    // Behavioral test of /szervezet workspace resolution
    const checkSzervezetAccess = (items: Array<{ mode?: string | null; status?: string }>) =>
      items.some(
        (item) =>
          item.status !== "ARCHIVED" &&
          (item.mode === "ORGANIZATION" || item.mode === "CASE_RELAY"),
      );

    // Accepts ORGANIZATION
    assert.equal(checkSzervezetAccess([{ mode: "ORGANIZATION", status: "ACTIVE" }]), true);
    // Accepts CASE_RELAY
    assert.equal(checkSzervezetAccess([{ mode: "CASE_RELAY", status: "ACTIVE" }]), true);
    // Rejects INDIVIDUAL
    assert.equal(checkSzervezetAccess([{ mode: "INDIVIDUAL", status: "ACTIVE" }]), false);
    // Rejects unknown/null modes
    assert.equal(checkSzervezetAccess([{ mode: "CUSTOM", status: "ACTIVE" }]), false);
    assert.equal(checkSzervezetAccess([{ mode: null, status: "ACTIVE" }]), false);
    assert.equal(checkSzervezetAccess([{ status: "ACTIVE" }]), false);
    // Rejects ARCHIVED workspace even if mode is ORGANIZATION or CASE_RELAY
    assert.equal(checkSzervezetAccess([{ mode: "ORGANIZATION", status: "ARCHIVED" }]), false);
    assert.equal(checkSzervezetAccess([{ mode: "CASE_RELAY", status: "ARCHIVED" }]), false);
  });

  it("32. Full ClientOrganization detail workspace remains rendered on dedicated /szervezet page", () => {
    const orgPageSrc = read("src/app/clients/[clientId]/szervezet/page.tsx");
    assert.match(
      orgPageSrc,
      /<ClientOrganization clientId=\{client\.id\} clientName=\{client\.name\} \/>/,
      "Dedicated /szervezet page must still render full ClientOrganization component",
    );
  });
});
