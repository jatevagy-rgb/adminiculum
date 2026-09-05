import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

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
      /casesResponse\.pagination\s*\?\s*casesResponse\.pagination\.total\s*<=\s*casesResponse\.data\.length\s*:\s*true/,
    );
    assert.match(
      controlCenterSrc,
      /\{isCasesComplete \? \([\s\S]*?\{activeCases\}[\s\S]*?\) : \(/,
    );
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
});
