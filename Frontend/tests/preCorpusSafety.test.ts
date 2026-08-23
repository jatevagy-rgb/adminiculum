import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("pre-corpus frontend safety boundaries", () => {
  it("removes the unsourced GDPR clause from the compare catalogue", () => {
    const source = read("src/app/documents/compare/page.tsx");
    assert.doesNotMatch(source, /clause-adatkezelesi-rendelkezes|Adatkezelési rendelkezés/);
    assert.doesNotMatch(source, /gdpr/i);
    assert.match(source, /demoMode \? workspaceClauseCatalogue : \[\]/);
    assert.match(source, /DEMO_WARNING/);
  });

  it("removes the legal mock-data module from production imports", () => {
    assert.equal(existsSync(path.join(root, "src/lib/mockData.ts")), false);
    assert.doesNotMatch(read("src/components/Sidebar.tsx"), /mockData/);
    assert.match(read("src/components/Sidebar.tsx"), /@\/lib\/navigation/);
  });

  it("does not fabricate watched clients on the dashboard", () => {
    const source = read("src/components/Dashboard.tsx");
    for (const name of ["BlackBelt", "Saubermacher", "Bálintfy"]) {
      assert.doesNotMatch(source, new RegExp(name));
    }
    assert.match(source, /Nincs ügyfélhez sorolt kommunikáció/);
  });

  it("frames company findings as internal assessments", () => {
    assert.match(read("src/components/clients/ClientCompanyFoundation.tsx"), /Belső értékelési megállapítások/);
    assert.match(read("src/components/clients/ClientCompanyWorkspace.tsx"), /nem igazolt jogi kötelezettségek/);
  });

  it("keeps demo policy centralized", () => {
    const source = read("src/lib/demoPolicy.ts");
    assert.match(source, /NEXT_PUBLIC_ADMINICULUM_DEMO_MODE/);
    assert.doesNotMatch(source, /localStorage|URLSearchParams|searchParams/);
    const productionSources = [
      "src/components/Dashboard.tsx",
      "src/components/Sidebar.tsx",
      "src/app/documents/compare/page.tsx",
    ].map(read).join("\n");
    assert.doesNotMatch(productionSources, /NEXT_PUBLIC_ADMINICULUM_DEMO_MODE/);
  });
});
