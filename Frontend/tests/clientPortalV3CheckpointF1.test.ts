import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Client Portal 3.0 — checkpoint F1 contract (Communication + Calendar V3).
 * Pins the ORGANIZATION runtime cutover for /portal/uzenetek and /portal/naptar,
 * the canonical data sources, EXTERNAL_ONLY truthfulness, calendar date truth,
 * canonical hrefs, INDIVIDUAL/CASE_RELAY preservation and the V3 visual contract.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const exists = (relative: string) => existsSync(path.join(root, relative));

const shell = () => read("src/components/client-portal/ClientPortalShell.tsx");
const communicationV3 = () => read("src/components/client-portal-v3/communication/PortalCommunicationV3.tsx");
const calendarV3 = () => read("src/components/client-portal-v3/calendar/PortalCalendarV3.tsx");
const api = () => read("src/lib/clientPortalApi.ts");

const v3Sources = () => [communicationV3(), calendarV3()].join("\n");

const orgBranch = () => shell().slice(shell().indexOf("CLIENT PORTAL 3.0 CUTOVER"), shell().indexOf("// Customer context label"));

const CALENDAR_CATEGORIES = [
  "MATTER_TARGET",
  "PUBLISHED_DEADLINE",
  "ACTION_REQUEST",
  "CUSTOMER_REQUEST",
  "CONTRACT_DATE",
  "CONTRACT_OCCURRENCE",
  "COMPANY_MILESTONE",
  "GROW_TARGET",
  "COMPLIANCE_REVIEW",
];

describe("Checkpoint F1 — communication runtime", () => {
  it("1. ORGANIZATION /portal/uzenetek renders PortalCommunicationV3", () => {
    const src = orgBranch();
    assert.match(src, /view === 'messages' \? <PortalCommunicationV3 communicationMode=\{state\.context\.selectedWorkspace\?\.communicationMode\} \/> : null/);
  });

  it("2. OrganizationMessages is no longer the ORGANIZATION normal body", () => {
    const src = orgBranch();
    assert.match(src, /view !== 'messages'/);
    assert.doesNotMatch(src, /<OrganizationMessages/);
    // The legacy composition stays available in the repository.
    const orgViews = read("src/components/client-portal/OrganizationPortalViews.tsx");
    assert.match(orgViews, /function OrganizationMessages/);
  });

  it("3. EXTERNAL_ONLY does not expose false portal messaging", () => {
    const src = communicationV3();
    assert.match(src, /communicationMode === "EXTERNAL_ONLY"/);
    assert.match(src, /portal-communication-external-only/);
    // The list can never render in EXTERNAL_ONLY mode.
    assert.match(src, /!externalOnly && !loading && !error && messages && messages\.length > 0/);
    assert.match(src, /Ezen a munkaterületen a portálos üzenetváltás jelenleg nem aktív\./);
  });

  it("4. no fake unread count exists", () => {
    const src = v3Sources();
    assert.doesNotMatch(src, /unread[A-Z]|olvasatlan/);
  });

  it("5. communication rows use the canonical actionUrl", () => {
    const src = communicationV3();
    assert.match(src, /href=\{message\.actionUrl\}/);
    assert.match(src, /getPortalWorkspace\(\)/);
    assert.match(src, /workspace\.messages/);
    assert.match(src, /\{message\.subject\}/);
    assert.match(src, /\{message\.matterTitle\}/);
    assert.match(src, /\{message\.status\}/);
  });

  it("11. empty communication state is truthful", () => {
    const src = communicationV3();
    assert.match(src, /Jelenleg nincs portálos beszélgetése\./);
  });
});

describe("Checkpoint F1 — calendar runtime", () => {
  it("6. ORGANIZATION /portal/naptar renders PortalCalendarV3", () => {
    const src = orgBranch();
    assert.match(src, /view === 'calendar' \? <PortalCalendarV3 \/> : null/);
  });

  it("7. legacy PortalCalendarView is not the ORGANIZATION render target", () => {
    const src = orgBranch();
    assert.doesNotMatch(src, /<PortalCalendarView/);
    // The legacy view stays available in the repository for the legacy paths.
    assert.equal(exists("src/components/client-portal/PortalCalendarView.tsx"), true);
  });

  it("8. all 9 calendar category keys remain supported in the canonical DTO", () => {
    const src = api();
    for (const category of CALENDAR_CATEGORIES) {
      assert.ok(src.includes(`'${category}'`), `${category} missing from the calendar DTO`);
    }
    // The V3 component renders server categories; it never hardcodes a subset.
    assert.match(calendarV3(), /data\.categories\.map/);
    assert.match(calendarV3(), /activeSet\.has\(category\.key\)/);
  });

  it("9. no date is invented client-side", () => {
    const src = calendarV3();
    assert.match(src, /getPortalCalendar\(\{ from: windowFrom, to: windowTo \}\)/);
    assert.doesNotMatch(src, /createdAt|estimate|statusLabel.*getDate|review.*Date/i);
    // Item metadata is never turned into new dates.
    assert.doesNotMatch(src, /new Date\(item\./);
  });

  it("10. canonical calendar hrefs are preserved", () => {
    const src = calendarV3();
    assert.match(src, /href=\{item\.href\}/);
    assert.doesNotMatch(src, /\/portal\/naptar\/|href=\{`\/portal\//);
  });

  it("12. empty calendar state is truthful", () => {
    const src = calendarV3();
    assert.match(src, /Ebben az időszakban nincs közzétett határidő vagy esemény\./);
  });
});

describe("Checkpoint F1 — preservation", () => {
  it("13. INDIVIDUAL still uses its existing calendar path", () => {
    const src = shell();
    const legacyMain = src.slice(src.indexOf("// Customer context label"));
    assert.match(legacyMain, /view === 'calendar' \? <PortalCalendarView \/> : null/);
  });

  it("14. CASE_RELAY remains unchanged", () => {
    const src = shell();
    assert.match(src, /workspace\.mode === 'CASE_RELAY'/);
    const legacyMain = src.slice(src.indexOf("// Customer context label"));
    assert.match(legacyMain, /<OrganizationPortalViews/);
    assert.match(src, /\['Együttműködési áttekintés', '\/portal\/szervezeti-attekintes'\]/);
  });
});

describe("Checkpoint F1 — visual contract", () => {
  it("15. no raw hex / stone / cp-* / adm-blue / adm-ivory / marketing radius in the new V3 files", () => {
    const src = v3Sources();
    assert.doesNotMatch(src, /(?:bg|text|border|ring|fill|stroke)-\[#(?:[0-9a-fA-F]{3,8})\]/);
    assert.doesNotMatch(src, /style=\{\{[^}]*(?:color|backgroundColor|borderColor)\s*:\s*["']#/);
    assert.doesNotMatch(src, /stone-/);
    assert.doesNotMatch(src, /cp-/);
    assert.doesNotMatch(src, /--adm-blue/);
    assert.doesNotMatch(src, /--adm-ivory/);
    assert.doesNotMatch(src, /rounded-2xl|rounded-3xl/);
    assert.match(src, /--adm-canvas-subtle|--adm-canvas-white/);
    assert.match(src, /--adm-border-canonical/);
    assert.match(src, /--adm-brand-green/);
    assert.match(src, /focus-visible:ring-2/);
  });

  it("16. mobile layout has no fixed wide table and provides the compact day strip", () => {
    const src = calendarV3();
    assert.match(src, /portal-calendar-day-strip/);
    assert.match(src, /lg:hidden/);
    assert.match(src, /hidden gap-1 text-center lg:grid lg:grid-cols-7/);
    assert.doesNotMatch(src, /min-w-\[\d{3,}px\]/);
    assert.match(src, /h-10 w-10 shrink-0/);
  });

  it("legacy communication/calendar surfaces remain in the repository", () => {
    for (const relative of [
      "src/components/client-portal/PortalCalendarView.tsx",
      "src/components/client-portal/OrganizationPortalViews.tsx",
      "src/app/portal/uzenetek/page.tsx",
      "src/app/portal/naptar/page.tsx",
    ]) {
      assert.equal(exists(relative), true, `${relative} must remain`);
    }
  });
});
