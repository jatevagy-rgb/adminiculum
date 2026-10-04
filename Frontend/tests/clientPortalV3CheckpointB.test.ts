import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Client Portal 3.0 — checkpoint B contract (Action Center + Home V3).
 *
 * Pins the ORGANIZATION runtime cutover: /portal/teendoim renders the unified
 * V3 Action Center (active customer work only, no completed group, one CTA per
 * row), /portal renders PortalHomeV3 consuming the canonical org-home read
 * model and the Action Center (max 3 top items, zero-action section hidden,
 * no fabricated metrics), INDIVIDUAL and CASE_RELAY stay legacy, and the new
 * V3 surface adds no raw hex or legacy tokens.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const exists = (relative: string) => existsSync(path.join(root, relative));

const shell = () => read("src/components/client-portal/ClientPortalShell.tsx");
const actionCenter = () => read("src/components/client-portal-v3/actions/PortalActionCenter.tsx");
const actionRow = () => read("src/components/client-portal-v3/actions/PortalActionRow.tsx");
const homeV3 = () => read("src/components/client-portal-v3/PortalHomeV3.tsx");
const api = () => read("src/lib/clientPortalApi.ts");
const backendRoute = () => read("../Backend/src/routes/clientPortal.ts");
const backendService = () => read("../Backend/src/modules/client-workspace/orgActionCenterService.ts");

const v3Sources = () =>
  [actionCenter(), actionRow(), homeV3()].join("\n");

describe("Checkpoint B — Action Center runtime", () => {
  it("14. /portal/teendoim ORGANIZATION renders PortalActionCenter", () => {
    const src = shell();
    assert.match(src, /view === 'tasks' \? <PortalActionCenter \/> : null/);
    assert.match(src, /import \{ PortalActionCenter \} from '@\/components\/client-portal-v3\/actions\/PortalActionCenter'/);
  });

  it("15. no completed task group in the Action Center", () => {
    const src = actionCenter();
    assert.doesNotMatch(src, /Teljesített|Lezárt teendők|historical group/i);
    // Active customer work only — the backend read model excludes terminal rows.
    assert.match(backendService(), /ACTIVE_CUSTOMER_REQUEST_STATUSES/);
  });

  it("16. max one CTA per action row", () => {
    const src = actionRow();
    const ctaCount = (src.match(/data-testid="portal-action-cta"/g) || []).length;
    assert.equal(ctaCount, 1, "exactly one CTA per action row");
    assert.match(src, /<Link/);
  });

  it("filters are minimal and only rendered for real dimensions", () => {
    const src = actionCenter();
    for (const label of ['Minden', 'Határidős', 'Ügyek', 'Megfelelés', 'Adatkérés']) {
      assert.ok(src.includes(`"${label}"`), `missing filter ${label}`);
    }
    assert.match(src, /availableFilters/);
    assert.doesNotMatch(src, /FILTER_LABELS\.GROW/);
  });

  it("shows the compact honest empty state", () => {
    assert.match(actionCenter(), /Jelenleg nincs teendője\./);
  });

  it("retryable error uses the canonical SafePanelError", () => {
    assert.match(actionCenter(), /<SafePanelError/);
    assert.match(actionCenter(), /onRetry=\{\(\) => setReloadNonce\(/);
  });

  it("the new backend endpoint is a projection-only read", () => {
    const route = backendRoute();
    assert.match(route, /router\.get\('\/org\/action-center'/);
    assert.match(route, /getOrganizationalActionCenter/);
    const service = backendService();
    assert.match(service, /portalRead|resolveActiveCustomerGrant/);
    assert.doesNotMatch(service, /\.create\(\{|\.update\(|\.delete\(/);
  });
});

describe("Checkpoint B — Home V3", () => {
  it("17. uses max 3 Action Center items", () => {
    const src = homeV3();
    assert.match(src, /\.slice\(0, 3\)/);
    assert.match(src, /URGENCY_ORDER/);
  });

  it("18. zero-action home hides the large action block", () => {
    const src = homeV3();
    assert.match(src, /topActions\.length > 0 \? \(/);
    assert.match(src, /SectionPanel title="Most Önre vár"/);
  });

  it("19. uses the canonical org matter summary fields", () => {
    const src = homeV3();
    for (const field of ["publicTitle", "publicReference", "publicStatus", "waitingOn", "nextStep", "publicTargetDate"]) {
      assert.ok(src.includes(`matter.${field}`), `missing canonical matter field ${field}`);
    }
    assert.match(src, /getPortalOrgHome/);
    assert.match(src, /getPortalActionCenter/);
  });

  it("20. no fake compliance percentage or derived metric", () => {
    const src = homeV3() + actionCenter();
    assert.doesNotMatch(src, /%|\bcompliance %\b/i);
    assert.doesNotMatch(src, /érettség|megtakarítás|ROI|\bAI\b|sparkline|trend/i);
  });

  it("21. legacy OrgHomeView is no longer the normal ORGANIZATION /portal render target", () => {
    const src = shell();
    assert.doesNotMatch(src, /<OrgHomeView/);
    assert.match(src, /<PortalHomeV3/);
    assert.equal(exists("src/components/client-portal/OrgHomeView.tsx"), true, "legacy OrgHomeView must remain in the repository");
  });

  it("22. INDIVIDUAL remains legacy", () => {
    const src = shell();
    assert.match(src, /'Ügyeim', '\/portal\/ugyeim'/);
    assert.match(src, /'Teendőim', '\/portal\/teendoim'/);
    assert.match(src, /HomeView|ListView/);
  });

  it("23. CASE_RELAY remains legacy", () => {
    const src = shell();
    assert.match(src, /'Együttműködési áttekintés', '\/portal\/szervezeti-attekintes'/);
    assert.match(src, /workspace\.mode === 'CASE_RELAY'/);
  });

  it("home consumes the typed action-center API", () => {
    const src = api();
    assert.match(src, /export async function getPortalActionCenter\(\)/);
    assert.match(src, /'\/client-portal\/org\/action-center'/);
    assert.match(src, /export type PortalActionItem = \{/);
    assert.match(src, /counts: \{ open: number; overdue: number; dueSoon: number \}/);
  });

  it("no raw hex or legacy tokens in the new V3 surfaces", () => {
    const src = v3Sources();
    assert.doesNotMatch(src, /(?:bg|text|border|ring|fill|stroke)-\[#(?:[0-9a-fA-F]{3,8})\]/);
    assert.doesNotMatch(src, /--adm-blue/);
    assert.doesNotMatch(src, /--adm-ivory/);
    assert.match(src, /--adm-brand-terracotta/);
    assert.match(src, /--adm-canvas-white/);
    assert.match(src, /--adm-border-canonical/);
    assert.match(src, /focus-visible:ring-2/);
  });

  it("mobile rows remain usable and interactive targets stay >=40px", () => {
    const src = v3Sources();
    assert.match(src, /h-10/);
    assert.match(src, /sm:flex-row/);
  });
});
