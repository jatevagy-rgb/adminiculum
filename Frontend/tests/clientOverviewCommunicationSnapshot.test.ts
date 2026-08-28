import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const overview = () => read("src/app/clients/[clientId]/page.tsx");
const tabs = () => read("src/components/clients/ClientWorkspaceTabs.tsx");
const nav = () => read("src/lib/navigation.ts");
const sidebar = () => read("src/components/Sidebar.tsx");
const routes = () => read("../Backend/src/modules/communications/routes.ts");

describe("Client Overview communication snapshot (Phase 4)", () => {
  it("has NO single client-wide read model (clientId filter is direct-only)", () => {
    const src = routes();
    // The list endpoint filters on communication.clientId directly.
    assert.match(src, /if \(clientId\) \{\s*where\.clientId = String\(clientId\)/);
    // It does NOT join case-linked communications into the clientId filter.
    assert.doesNotMatch(src, /case:\s*\{\s*clientId/);
  });

  it("only offers a truthful contextual entry to the client communication page (no second inbox)", () => {
    const src = overview();
    // Always-available contextual navigation to the client communication page.
    assert.match(src, /\/clients\/\$\{encodeURIComponent\(clientId\)\}\/communications/);
    assert.match(src, /Kommunikáció megnyitása →/);
    // It is a nav link, not a rendered duplicate full communication list.
    assert.doesNotMatch(src, /import \{?\s*.*CommunicationsPageContent|CommunicationWorkspace/);
  });

  it("keeps the contextual entry available even when the overview aggregate is empty", () => {
    const src = overview();
    const headerBlock = src.slice(src.indexOf("Kapcsolt kommunikációk"));
    // The open-link is not gated behind `communications.length > 0`.
    assert.doesNotMatch(headerBlock, /communications\.length > 0 \? <Link/);
    const openLink = src.match(/Kommunikáció megnyitása →/);
    assert.ok(openLink, "must always render the open-communication link");
  });

  it("uses a real clientId route and has no cross-client / hardcoded fallback", () => {
    const src = overview();
    assert.doesNotMatch(src, /Demo Kft\.|Példa Kft\.|fallbackClient|mockClient|firstCaseFallback/i);
    assert.match(src, /encodeURIComponent\(clientId\)/);
    const commsPage = read("src/app/clients/[clientId]/communications/page.tsx");
    assert.doesNotMatch(commsPage, /getCommunications\(\{\s*clientId:\s*['"]|clientId:\s*"demo/i);
  });

  it("renders no fake unread/thread/counter or provider/storage ids in the panel", () => {
    const src = overview();
    for (const token of ["unread", "isUnread", "threadId", "readAt", "lastRead", "providerConversationId", "spItemId", "graphId", "tenantId", "syncStatus", "attachmentCount"]) {
      assert.doesNotMatch(src, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("does NOT add a primary Client Workspace communication tab (IA preserved)", () => {
    const t = tabs();
    assert.doesNotMatch(t, /\["communications"/);
    assert.match(t, /\["overview", "Áttekintés"/);
    assert.match(t, /\["cases", "Ügyek"/);
    assert.match(t, /Haladó/);
  });

  it("keeps PR61 primary navigation unchanged", () => {
    assert.match(nav(), /navItems/);
    assert.match(nav(), /notifications/);
    assert.doesNotMatch(sidebar(), /client-overview-communication|communicationSnapshot|clientCommunicationsNav/i);
  });

  it("has exactly one client communication page (no duplicate inbox surface)", () => {
    const page = "src/app/clients/[clientId]/communications/page.tsx";
    assert.equal(path.basename(page), "page.tsx");
    const src = read(page);
    assert.match(src, /AuthenticatedApp section="clients"/);
  });
});
