import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Client portal HOME convergence — Slice A (UI only).
 *
 * The organization home must present the three canonical primary entry points
 * (Ügyek / Teendők / Dokumentumok) with a restrained terracotta identity, and ONE
 * "Ami most Öntől kell" parent container whose actionable entries come only from
 * signals the existing org-home DTO actually carries. This suite is source-level:
 * it pins the presentation contract and proves no backend call, DTO, schema or
 * route change was introduced.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

const orgHome = () => read("src/components/client-portal/OrgHomeView.tsx");
const api = () => read("src/lib/clientPortalApi.ts");

describe("Client portal home — primary entry tiles", () => {
  it("keeps Ügyek, Teendők and Dokumentumok as the three primary destinations", () => {
    const src = orgHome();
    for (const href of ["/portal/ugyek", "/portal/teendoim", "/portal/dokumentumok"]) {
      assert.ok(src.includes(`href: "${href}", primary: true`), `${href} must stay a primary tile`);
    }
    // Naptár remains reachable, just secondary.
    assert.ok(src.includes('href: "/portal/naptar"'), "Naptár destination must stay reachable");
  });

  it("renders the primary tiles with the canonical terracotta identity", () => {
    const src = orgHome();
    assert.match(src, /data-testid="portal-primary-tile"/);
    assert.match(src, /bg-\[var\(--adm-terracotta-700\)\]/);
    assert.match(src, /border-\[var\(--adm-terracotta-700\)\]/);
    // The remaining destination keeps the calm light tile.
    assert.match(src, /QUICK_ACTIONS\.filter\(\(action\) => !action\.primary\)/);
  });

  it("lays the primary tiles out responsively", () => {
    const src = orgHome();
    assert.match(src, /<div className="grid gap-3 sm:grid-cols-3">/);
  });
});

describe("Client portal home — Ami most Öntől kell container", () => {
  it("keeps one parent container backed by the existing org-home DTO", () => {
    const src = orgHome();
    assert.match(src, /title="Ami most Öntől kell"/);
    // Entries derive from canonical DTO fields only.
    assert.match(src, /actionNow = useMemo\(\(\) => \(home\?\.actions \|\| \[\]\)\.slice\(0, 4\), \[home\]\)/);
    assert.match(src, /home\?\.contactSummary\.unreadCount/);
    assert.match(src, /home\?\.recentDocuments\.length/);
  });

  it("gates every additional group on its own real data (no fabricated rows)", () => {
    const src = orgHome();
    assert.match(src, /\{unreadMessageCount > 0 \? \(/);
    assert.match(src, /\{availableDocumentCount > 0 \? \(/);
    assert.match(src, /const hasAttentionEntries = actionNow\.length > 0 \|\| unreadMessageCount > 0 \|\| availableDocumentCount > 0/);
    assert.match(src, /empty=\{!hasAttentionEntries\}/);
  });

  it("does not invent a calendar-event signal or count", () => {
    const src = orgHome();
    assert.doesNotMatch(src, /esem[eé]ny/i, "no calendar-event wording or count may be invented");
    assert.doesNotMatch(src, /eventCount|calendarEvent|naptarEvent|esemenyCount/i);
    assert.doesNotMatch(src, /getPortalCalendar/);
  });

  it("uses precise wording instead of presenting a recent document as new", () => {
    const src = orgHome();
    assert.doesNotMatch(src, /Új dokumentum érkezett/i);
    assert.match(src, /Nemrég közzétett dokumentum/);
    // Unread messaging IS defined by read state, so naming it "Új üzenet" is truthful.
    assert.match(src, />Új üzenet</);
  });
});

describe("Client portal home — preserved routes and no backend/DTO change", () => {
  it("preserves every canonical customer-portal destination from the home", () => {
    const src = orgHome();
    for (const href of [
      "/portal/ugyek",
      "/portal/teendoim",
      "/portal/dokumentumok",
      "/portal/fejlesztes",
      "/portal/megfeleles",
      "/portal/uzenetek",
      "/portal/naptar",
      "/portal/vallalat",
    ]) {
      assert.ok(src.includes(href), `home must still reach ${href}`);
    }
  });

  it("adds no backend call and no new DTO fetch", () => {
    const src = orgHome();
    // Only the existing org-home getter is consumed; no second aggregate call.
    assert.match(src, /getPortalOrgHome/);
    for (const forbidden of [
      "getPortalCalendar",
      "getPortalOrgGrow",
      "getPortalWorkspace",
      "getPortalCompliance",
      "fetch(",
    ]) {
      assert.ok(!src.includes(forbidden), `home must not add ${forbidden}`);
    }
  });

  it("leaves the shared portal API surface unchanged for the home", () => {
    const src = api();
    assert.equal((src.match(/\/client-portal\/org\/home/g) || []).length, 1);
    assert.match(src, /export async function getPortalOrgHome\(\)/);
  });
});
