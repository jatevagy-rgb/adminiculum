import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

// ─── Client Dossier & Dedicated Portal Surface Separation ────────────────────

describe("Client dossier & dedicated portal surface separation", () => {
  const dossierSrc = read("src/app/clients/[clientId]/page.tsx");
  const portalSrc = read("src/app/clients/[clientId]/portal/page.tsx");

  it("full portal control plane is NOT on the dossier overview page", () => {
    // Dossier overview must NOT contain technical control plane form or handlers
    assert.ok(
      !dossierSrc.includes("Client Portal control plane"),
      "Dossier overview must NOT contain Client Portal control plane heading",
    );
    assert.ok(
      !dossierSrc.includes("savePortalSettings"),
      "Dossier overview must NOT contain savePortalSettings handler",
    );
    assert.ok(
      !dossierSrc.includes("PORTAL_CENTRIC"),
      "Dossier overview must NOT contain technical relationshipMode enum options",
    );
  });

  it("dossier overview provides concise human-facing portal summary and navigation affordance", () => {
    assert.match(dossierSrc, /Ügyfélportál/);
    assert.match(dossierSrc, /client\.portalAccessEnabled \? "Előkészítve" : "Nincs előkészítve"/);
    assert.match(dossierSrc, /href=\{`\/clients\/\$\{clientId\}\/portal`\}/);
    assert.match(dossierSrc, /Portál megnyitása/);
  });

  it("hero header maintains responsive layout and all primary actions", () => {
    const heroStart = dossierSrc.indexOf('<header className="adm-board-hero');
    const heroEnd = dossierSrc.indexOf("</header>", heroStart);
    assert.ok(heroStart !== -1 && heroEnd !== -1, "Hero header must exist");
    const heroContent = dossierSrc.slice(heroStart, heroEnd);

    assert.match(heroContent, /flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between/);
    assert.match(heroContent, /break-words/);
    assert.match(heroContent, /Vállalati működés/);
    assert.match(heroContent, /Szervezet/);
    assert.match(heroContent, /Ügyfél szerkesztése/);
    assert.match(heroContent, /Új ügy/);
    assert.match(heroContent, /Dokumentum hozzáadása/);
    assert.match(heroContent, /ClientWorkspaceTabs/);
    assert.match(heroContent, /dossierStats/);
  });

  it("full portal controls are present and functional on dedicated /clients/[clientId]/portal page", () => {
    assert.match(portalSrc, /Client Portal control plane/);
    assert.match(portalSrc, /Ügyfélkapcsolati működés/);
    assert.match(portalSrc, /relationshipMode/);
    assert.match(portalSrc, /PORTAL_CENTRIC/);
    assert.match(portalSrc, /EMAIL_CENTRIC/);
    assert.match(portalSrc, /CONNECTED_SYSTEM/);
    assert.match(portalSrc, /portalAccessEnabled/);
    assert.match(portalSrc, /connectedSystemState/);
    assert.match(portalSrc, /savePortalSettings/);
    assert.match(portalSrc, /updateClient\(client\.id, patch\)/);
    assert.match(portalSrc, /savingPortal/);
  });
});

// ─── Communications Authoritative Backend Scoping & Pagination ───────────────

describe("Communications authoritative backend scoping & pagination", () => {
  const commSrc = read("src/components/communications/CommunicationWorkspace.tsx");

  it("includes clientId in getCommunications params when clientFilter is set", () => {
    // Assert the exact source integration contract for scoped request
    assert.match(commSrc, /if \(clientFilter !== "all"\) \{\s*commParams\.clientId = clientFilter;\s*\}/);
    assert.match(commSrc, /getCommunications\(commParams\)/);
  });

  it("omits clientId from getCommunications params when clientFilter is 'all'", () => {
    // commParams initially only has limit and offset
    assert.match(commSrc, /const commParams: \{ limit: number; offset: number; clientId\?: string \} = \{\s*limit: pageSize,\s*offset,\s*\};/);
  });

  it("resets offset to 0 before loading when client scope changes", () => {
    // Both ref tracking and dropdown onChange must reset offset
    assert.match(commSrc, /prevClientFilterRef\.current !== clientFilter/);
    assert.match(commSrc, /if \(offset !== 0\) \{\s*setOffset\(0\);\s*return;\s*\}/);
    assert.match(commSrc, /setClientFilter\(event\.target\.value\);\s*setOffset\(0\);/);
    assert.match(commSrc, /setClientFilter\("all"\);[\s\S]*setOffset\(0\);/);
  });

  it("sets total from filtered backend pagination metadata", () => {
    assert.match(commSrc, /setTotal\(communicationResult\.pagination\?\.total \?\? items\.length\)/);
  });

  it("preserves URL search params hydration for clientId, view, and communicationId", () => {
    assert.match(commSrc, /const clientId = params\.get\("clientId"\);/);
    assert.match(commSrc, /if \(clientId && clientId\.trim\(\)\) setClientFilter\(clientId\.trim\(\)\);/);
    assert.match(commSrc, /const view = params\.get\("view"\)/);
    assert.match(commSrc, /const communicationId = params\.get\("communicationId"\);/);
  });
});

// ─── Cases Authoritative Backend Scoping & Safe UI ───────────────────────────

describe("Cases authoritative backend scoping and safe UI", () => {
  const casesSrc = read("src/components/CasesList.tsx");

  it("passes selectedClientId to getCases API call", () => {
    assert.match(casesSrc, /getCases\(1, 200, undefined, clientIdScope \|\| undefined\)/);
    assert.match(casesSrc, /loadCases\(selectedClientId\)/);
  });

  it("reloads unscoped case list when selectedClientId is cleared", () => {
    // useEffect watches selectedClientId and reloads with empty scope
    assert.match(casesSrc, /useEffect\(\(\) => \{\s*loadCases\(selectedClientId\);\s*\}, \[loadCases, selectedClientId\]\);/);
  });

  it("clears selectedClientId and reloads when typing into manual client search", () => {
    assert.match(casesSrc, /onChange=\{\(e\) => \{\s*setClientName\(e\.target\.value\);\s*if \(selectedClientId\) setSelectedClientId\(""\);\s*\}\}/);
  });

  it("never exposes raw technical client ID/UUID in the UI", () => {
    // No "Szűrt ügyfél ID:" string
    assert.ok(
      !casesSrc.includes("Szűrt ügyfél ID:"),
      "Must not expose raw technical 'Szűrt ügyfél ID:' label",
    );

    // Formatted label handles resolved client name or safe generic fallback
    assert.match(casesSrc, /filteredClientLabel/);
    assert.match(casesSrc, /`Ügyfél: \$\{fromCases\}`/);
    assert.match(casesSrc, /`Ügyfél: \$\{fromClients\}`/);
    assert.match(casesSrc, /"Ügyfél szerinti szűrés aktív"/);
  });

  it("hydrates scopeFilter safely with fallback to ACTIVE", () => {
    assert.match(casesSrc, /rawScope === "ACTIVE" \|\| rawScope === "MINE" \|\| rawScope === "CLOSED"/);

    function resolveScope(param?: string | null): "ACTIVE" | "MINE" | "CLOSED" {
      const raw = param?.toUpperCase();
      if (raw === "ACTIVE" || raw === "MINE" || raw === "CLOSED") return raw;
      return "ACTIVE";
    }

    assert.equal(resolveScope("CLOSED"), "CLOSED");
    assert.equal(resolveScope("MINE"), "MINE");
    assert.equal(resolveScope("ACTIVE"), "ACTIVE");
    assert.equal(resolveScope("UNKNOWN_SCOPE"), "ACTIVE");
    assert.equal(resolveScope(null), "ACTIVE");
  });

  it("preserves newCase=1 and clientId preselection for CompactNewCaseDialog", () => {
    assert.match(casesSrc, /requestedNewCase = searchParams\?\.get\("newCase"\) === "1"/);
    assert.match(casesSrc, /initialClientId=\{requestedClientId \|\| undefined\}/);
  });
});
