import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const cockpit = () => read("src/components/cases/CaseWorkspaceOverview.tsx");
const caseDetail = () => read("src/components/CaseDetail.tsx");
const api = () => read("src/lib/api.ts");

describe("Case Overview communication snapshot (Phase 3)", () => {
  it("renders current-case communications from the real case workspace projection", () => {
    const src = cockpit();
    // Data source is the per-case cockpit/workspace projection, not a client-wide list.
    assert.match(src, /getCaseWorkspace\(caseId\)/);
    assert.match(src, /ws\.communications/);
    assert.match(src, /ws\.cockpit\.communication/);
    assert.equal((src.match(/getCommunications\(/) || []).length, 0, "must NOT fetch a client-wide/list communication set");
  });

  it("never masquerades client-only or cross-case communication as case-linked", () => {
    const src = cockpit();
    // No clientId-scoped fetch and no cross-case / hardcoded client data in the block.
    assert.doesNotMatch(src, /getCommunications\(\{\s*clientId/);
    assert.doesNotMatch(src, /Demo Kft\.|Példa Kft\.|fallbackClient|mockCase/i);
    assert.doesNotMatch(src, /\bcases\/demo|cases\/fixed/i);
  });

  it("keeps empty (no comms) distinct from failure/unavailable", () => {
    const src = cockpit();
    assert.match(src, /Ehhez az ügyhöz még nincs kommunikáció\./);
    assert.match(src, /A kommunikáció most nem érhető el\./);
    // The two states use different copy, so failure never reads as "no data".
    assert.notEqual(src.indexOf("Ehhez az ügyhöz még nincs kommunikáció."), src.indexOf("A kommunikáció most nem érhető el."));
  });

  it("does not expose provider/storage/graph/sync identifiers in the block", () => {
    const src = cockpit();
    // The rendered list must not print any technical provider/storage/graph/sync id.
    for (const token of ["providerConversationId", "spItemId", "graphId", "tenantId", "syncStatus", "source: \"OUTLOOK\""]) {
      assert.doesNotMatch(src, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("keeps the workspace communication data contract free of unread/thread/counter fields", () => {
    const src = api();
    const commsType = src.slice(src.indexOf("communications: Array<{ id: string; type: string; subject"), src.indexOf("}>", src.indexOf("communications: Array<{ id: string; type: string; subject")) + 2);
    assert.match(commsType, /\bid: string/);
    assert.match(commsType, /\bsender: string \| null/);
    assert.match(commsType, /\btimestamp: string \| null/);
    assert.match(commsType, /\binternal: boolean/);
    assert.doesNotMatch(commsType, /unread|isUnread|threadId|conversation|readAt|lastRead/i);
  });

  it("links to the real case communication workspace via a real route", () => {
    const cockpitSrc = cockpit();
    assert.match(cockpitSrc, /\/cases\/\$\{caseId\}\/communications/);
    const caseDetailSrc = caseDetail();
    assert.match(caseDetailSrc, /\/cases\/\$\{canonicalCaseId\}\/communications/);
    assert.match(caseDetailSrc, /latestCommunication/);
  });

  it("preserves the existing Case Overview cockpit structure (no redesign)", () => {
    const src = cockpit();
    // The senior decision-prep building blocks remain intact.
    for (const token of ["Következő határidő", "KpiCard", "DeadlineRow", "DocumentWorkCard", "CockpitSection"]) {
      assert.match(src, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("keeps the primary navigation registry and sidebar group unchanged", () => {
    const nav = read("src/lib/navigation.ts");
    assert.match(nav, /navItems/);
    assert.match(nav, /notifications/);
    const sidebar = read("src/components/Sidebar.tsx");
    assert.doesNotMatch(sidebar, /case-overview-communication|communicationSnapshot/i);
  });
});
