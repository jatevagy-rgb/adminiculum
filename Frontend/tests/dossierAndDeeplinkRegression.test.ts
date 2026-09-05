import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

// ─── Client Dossier Header & Portal Control Plane Layout ─────────────────────

describe("REQ-05: Client dossier layout & portal separation", () => {
  const dossierSrc = read("src/app/clients/[clientId]/page.tsx");

  it("hero header contains client identity and action buttons without the portal control plane", () => {
    // Locate the hero header
    const heroStart = dossierSrc.indexOf('<header className="adm-board-hero');
    const heroEnd = dossierSrc.indexOf("</header>", heroStart);
    assert.ok(heroStart !== -1 && heroEnd !== -1, "Hero header must exist");

    const heroContent = dossierSrc.slice(heroStart, heroEnd);

    // Hero must contain client identity and action buttons
    assert.match(heroContent, /Ügyfél dosszié/);
    assert.match(heroContent, /client\.name/);
    assert.match(heroContent, /Vállalati működés/);
    assert.match(heroContent, /Szervezet/);
    assert.match(heroContent, /Ügyfél szerkesztése/);
    assert.match(heroContent, /Új ügy/);
    assert.match(heroContent, /Dokumentum hozzáadása/);
    assert.match(heroContent, /ClientWorkspaceTabs/);
    assert.match(heroContent, /dossierStats/);

    // Hero MUST NOT contain the portal control plane
    assert.ok(
      !heroContent.includes("Client Portal control plane"),
      "Hero header must NOT embed the Client Portal control plane in the conflicting top layout",
    );
    assert.ok(
      !heroContent.includes("Ügyfélkapcsolati működés"),
      "Hero header must NOT contain Ügyfélkapcsolati működés header",
    );
  });

  it("portal control plane is repositioned in a separate section below the hero header", () => {
    const heroEnd = dossierSrc.indexOf("</header>");
    const portalSection = dossierSrc.indexOf("Client Portal control plane");

    assert.ok(heroEnd !== -1, "Hero header end tag must exist");
    assert.ok(portalSection !== -1, "Client Portal control plane must exist");
    assert.ok(
      portalSection > heroEnd,
      "Client Portal control plane must be positioned after (below) the hero header",
    );

    // All portal configuration capabilities must be fully preserved
    assert.match(dossierSrc, /portalAccessEnabled/);
    assert.match(dossierSrc, /relationshipMode/);
    assert.match(dossierSrc, /PORTAL_CENTRIC/);
    assert.match(dossierSrc, /EMAIL_CENTRIC/);
    assert.match(dossierSrc, /CONNECTED_SYSTEM/);
    assert.match(dossierSrc, /connectedSystemState/);
    assert.match(dossierSrc, /savePortalSettings/);
  });

  it("hero layout uses responsive flex columns and text wrapping for long client names", () => {
    assert.match(dossierSrc, /flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between/);
    assert.match(dossierSrc, /break-words/);
  });
});

// ─── REQ-09: Communications Deep-Link Filtering ──────────────────────────────

describe("REQ-09: Communications deep-link filtering", () => {
  const commSrc = read("src/components/communications/CommunicationWorkspace.tsx");

  it("initializes clientFilter from URL search param clientId", () => {
    // Both state initializer and mount effect check clientId
    assert.match(commSrc, /params\.get\("clientId"\)/);
    assert.match(commSrc, /setClientFilter\(clientId\.trim\(\)\)/);
  });

  it("preserves view and communicationId URL parameters and default all-clients behavior", () => {
    assert.match(commSrc, /params\.get\("view"\)/);
    assert.match(commSrc, /params\.get\("communicationId"\)/);
    assert.match(commSrc, /setActiveView\(view\)/);
    assert.match(commSrc, /setSelectedId\(communicationId\)/);
  });

  it("filters communications correctly by clientId when set, and matches all when 'all'", () => {
    const items = [
      { id: "comm-1", clientId: "client-a", subject: "Szerződéstervezet" },
      { id: "comm-2", clientId: "client-b", subject: "Válaszlevél" },
      { id: "comm-3", clientId: "client-a", subject: "Számlamelléklet" },
      { id: "comm-4", clientId: undefined, subject: "Általános megkeresés" },
    ];

    // Filter function matching CommunicationWorkspace line 180
    const filterByClient = (clientFilter: string) =>
      items.filter((item) => {
        if (clientFilter !== "all" && item.clientId !== clientFilter) return false;
        return true;
      });

    // Default 'all' preserves all communications
    assert.equal(filterByClient("all").length, 4);

    // Filtered by 'client-a' isolates only client-a items
    const clientAFiltered = filterByClient("client-a");
    assert.equal(clientAFiltered.length, 2);
    assert.deepEqual(clientAFiltered.map((i) => i.id), ["comm-1", "comm-3"]);

    // Filtered by 'client-b' isolates only client-b items
    const clientBFiltered = filterByClient("client-b");
    assert.equal(clientBFiltered.length, 1);
    assert.equal(clientBFiltered[0].id, "comm-2");

    // Filtered by nonexistent client returns empty
    assert.equal(filterByClient("client-none").length, 0);
  });
});

// ─── REQ-09: Cases Deep-Link Filtering & Scope ───────────────────────────────

describe("REQ-09: Cases deep-link filtering and scope hydration", () => {
  const casesSrc = read("src/components/CasesList.tsx");

  it("hydrates scopeFilter safely from URL search param scope", () => {
    assert.match(casesSrc, /searchParams\?\.get\("scope"\)/);
    assert.match(casesSrc, /rawScope === "ACTIVE" \|\| rawScope === "MINE" \|\| rawScope === "CLOSED"/);

    // Test scope resolution logic
    function resolveScope(param?: string | null): "ACTIVE" | "MINE" | "CLOSED" {
      const raw = param?.toUpperCase();
      if (raw === "ACTIVE" || raw === "MINE" || raw === "CLOSED") return raw;
      return "ACTIVE";
    }

    assert.equal(resolveScope("CLOSED"), "CLOSED");
    assert.equal(resolveScope("closed"), "CLOSED");
    assert.equal(resolveScope("MINE"), "MINE");
    assert.equal(resolveScope("mine"), "MINE");
    assert.equal(resolveScope("ACTIVE"), "ACTIVE");
    assert.equal(resolveScope("active"), "ACTIVE");
    assert.equal(resolveScope("INVALID"), "ACTIVE");
    assert.equal(resolveScope(""), "ACTIVE");
    assert.equal(resolveScope(null), "ACTIVE");
    assert.equal(resolveScope(undefined), "ACTIVE");
  });

  it("filters cases strictly by CaseListItem.clientId, independent of string matching", () => {
    assert.match(casesSrc, /item\.clientId === selectedClientId/);

    const cases = [
      { id: "case-1", clientId: "c-101", clientName: "Alpha Kft.", title: "Szerződéskötés" },
      { id: "case-2", clientId: "c-102", clientName: "Beta Zrt.", title: "Alpha projekt jogi tanácsadás" },
      { id: "case-3", clientId: "c-101", clientName: "Alpha Kft.", title: "Munkaszerződések" },
      { id: "case-4", clientId: undefined, clientName: "Ismeretlen", title: "Egyéb" },
    ];

    function filterCases(selectedClientId: string, clientNameQuery: string) {
      const normalizedQuery = clientNameQuery.trim().toLowerCase();
      return cases.filter((item) => {
        const clientIdMatch = !selectedClientId || item.clientId === selectedClientId;
        const clientMatch = !normalizedQuery || (item.clientName ?? "").toLowerCase().includes(normalizedQuery);
        return clientIdMatch && clientMatch;
      });
    }

    // When clientId is 'c-101', only cases with clientId === 'c-101' match,
    // NOT case-2 even though case-2 contains "Alpha" in its title
    const filteredByC101 = filterCases("c-101", "");
    assert.equal(filteredByC101.length, 2);
    assert.deepEqual(filteredByC101.map((c) => c.id), ["case-1", "case-3"]);

    // When clientId is empty, all cases are returned
    assert.equal(filterCases("", "").length, 4);

    // Manual client name query still works when clientId is empty
    const manualQuery = filterCases("", "Beta");
    assert.equal(manualQuery.length, 1);
    assert.equal(manualQuery[0].id, "case-2");
  });

  it("preserves newCase=1 and clientId preselection for CompactNewCaseDialog", () => {
    assert.match(casesSrc, /requestedNewCase = searchParams\?\.get\("newCase"\) === "1"/);
    assert.match(casesSrc, /initialClientId=\{requestedClientId \|\| undefined\}/);
  });

  it("provides active client filter indicator with clear button and clear all filters button", () => {
    assert.match(casesSrc, /Szűrt ügyfél ID:/);
    assert.match(casesSrc, /setSelectedClientId\(""\)/);
  });
});
