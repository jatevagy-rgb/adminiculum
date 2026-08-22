import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("organizational workspace read-only map — internal route/UI structure", () => {
  it("exposes a dedicated Szervezet route page", () => {
    const page = read("src/app/clients/[clientId]/szervezet/page.tsx");
    assert.match(page, /SzervezetPageContent/);
  });

  it("adds a Szervezet quick-action link on the client detail page", () => {
    const page = read("src/app/clients/[clientId]/page.tsx");
    assert.match(page, /\/clients\/\$\{clientId\}\/szervezet/);
    assert.match(page, />Szervezet</);
  });

  it("the org map content component applies an INDIVIDUAL-mode guard (not CSS-only)", () => {
    const content = read("src/components/org-workspace/SzervezetPageContent.tsx");
    assert.match(content, /isOrganizationClient\(map\)/);
    assert.match(content, /nem szervezeti \(INDIVIDUAL\)/);
  });

  it("the org chart page renders an empty state when there are no people", () => {
    const content = read("src/components/org-workspace/SzervezetPageContent.tsx");
    assert.match(content, /persons\.length === 0/);
    assert.match(content, /Nincs rögzített szervezeti adat/);
  });

  it("the person card never shows cases, documents, comments, or permission matrices", () => {
    const card = read("src/components/org-workspace/OrgPersonCard.tsx");
    // Only inspect the rendered JSX (after `return (`); the file's leading doc
    // comment is allowed to mention what the card does NOT show.
    const jsx = card.slice(card.indexOf("return ("));
    assert.doesNotMatch(jsx, /ownedCases|ownedContracts|ownedObligations|comment|permission matrix|finding/i);
  });

  it("the access summary caption states portal link does not grant access", () => {
    const drawer = read("src/components/org-workspace/OrgPersonDrawer.tsx");
    assert.match(drawer, /portál-kapcsolat önmagában nem ad hozzáférést/i);
    assert.match(drawer, /kizárólag tényleges hozzáférési jogosultságokból/i);
  });

  it("the org chart uses React Flow as a client component (no SSR dynamic layout)", () => {
    const canvas = read("src/components/org-workspace/OrgTreeCanvas.tsx");
    assert.match(canvas, /"use client"/);
    assert.match(canvas, /@xyflow\/react/);
    assert.match(canvas, /elkjs/);
  });

  it("the org tree is read-only (no mutation controls)", () => {
    const content = read("src/components/org-workspace/SzervezetPageContent.tsx");
    assert.doesNotMatch(content, /onDragStart|onNodeDragStop|updatePerson|createPerson|setManager|createGroup/i);
  });
});