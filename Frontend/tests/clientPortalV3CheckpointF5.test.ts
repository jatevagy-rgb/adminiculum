import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Client Portal 3.0 — Checkpoint F5 contract test (action detail V3).
 * Pins the ORGANIZATION cutover for /portal/action-requests/:requestId, the
 * canonical action-request projection, customer-safe field usage, href
 * convergence and INDIVIDUAL / CASE_RELAY preservation.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const exists = (relative: string) => existsSync(path.join(root, relative));

const shell = () => read("src/components/client-portal/ClientPortalShell.tsx");
const actionDetailV3 = () => read("src/components/client-portal-v3/actions/PortalActionDetailV3.tsx");
const actionRow = () => read("src/components/client-portal-v3/actions/PortalActionRow.tsx");
const actionCenter = () => read("src/components/client-portal-v3/actions/PortalActionCenter.tsx");
const actionRoutePage = () => read("src/app/portal/action-requests/[requestId]/page.tsx");
const api = () => read("src/lib/clientPortalApi.ts");

const orgBranch = () => shell().slice(shell().indexOf("CLIENT PORTAL 3.0 CUTOVER"), shell().indexOf("// Customer context label"));
const legacyMain = () => shell().slice(shell().indexOf("// Customer context label"));

describe("Checkpoint F5 — ORGANIZATION action detail runtime", () => {
  it("1. ORGANIZATION action route renders PortalActionDetailV3", () => {
    const src = orgBranch();
    assert.match(src, /view === 'action' \? <PortalActionDetailV3 requestId=\{resourceId \?\? ''\} \/> : null/);
  });

  it("2. OrganizationPortalViews does not serve action in ORGANIZATION mode", () => {
    const src = orgBranch();
    assert.match(src, /view !== 'action'/);
    assert.match(src, /<OrganizationPortalViews/);
  });

  it("3. ActionView does not render in the ORGANIZATION action branch", () => {
    const src = orgBranch();
    assert.doesNotMatch(src, /<ActionView/);
  });

  it("4. the canonical action-request API remains the authoritative source", () => {
    assert.match(actionDetailV3(), /getPortalActionRequest\(requestId\)/);
    assert.match(api(), /\/client-portal\/action-requests\/\$\{encodeURIComponent\(requestId\)\}/);
  });

  it("5. refresh / deep-link identity remains requestId-based", () => {
    assert.match(actionRoutePage(), /view="action"/);
    assert.match(actionRoutePage(), /resourceId=\{requestId\}/);
    const src = actionDetailV3();
    assert.match(src, /export function PortalActionDetailV3\(\{ requestId \}/);
  });

  it("6. distinct loading / not-found / recoverable-error / valid states exist", () => {
    const src = actionDetailV3();
    assert.match(src, /portal-action-detail-loading/);
    assert.match(src, /portal-action-detail-not-found/);
    assert.match(src, /err instanceof ApiError && \(err\.status === 404 \|\| err\.status === 403\)/);
    assert.match(src, /setNotFound\(true\)/);
    assert.match(src, /<SafePanelError/);
    assert.match(src, /onRetry=\{\(\) => setReloadNonce\(\(value\) => value \+ 1\)\}/);
  });

  it("7. only canonical customer-safe DTO fields are rendered", () => {
    const src = actionDetailV3();
    assert.match(src, /action\.typeLabel/);
    assert.match(src, /action\.title/);
    assert.match(src, /action\.statusLabel/);
    assert.match(src, /action\.instructions/);
    assert.match(src, /action\.dueAt/);
    assert.match(src, /action\.readOnlyNote/);
    assert.match(src, /action\.matterTitle/);
  });

  it("8. no fake score / progress / unread / priority metadata", () => {
    const src = [actionDetailV3(), actionRow(), actionCenter()].join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(src, /\b(?:score|pontszám|priority|SLA|kockázat|risk|unread|olvasatlan)\b|progress%|\{\d+%}/i);
    assert.doesNotMatch(src, /style=\{\{[^}]*width\s*:\s*["']?[0-9]+%/);
  });

  it("9. action detail remains display-only and invents no destination", () => {
    const src = actionDetailV3();
    assert.doesNotMatch(src, /href=\{\/portal\/matters/);
    assert.doesNotMatch(src, /onClick=\{.*submit|complete|finish/i);
    // The canonical navigation affordance is the back link to the action center.
    assert.match(src, /href="\/portal\/teendoim"/);
  });
});

describe("Checkpoint F5 — href convergence", () => {
  it("10. action-requests hrefs resolve to the V3-backed route", () => {
    for (const file of [
      "src/components/client-portal-v3/matters/PortalMatterWorkspaceV3.tsx",
      "src/components/client-portal/MatterWorkspace.tsx",
      "src/components/client-portal/OrganizationPortalViews.tsx",
      "src/components/client-portal/OrgHomeView.tsx",
    ]) {
      assert.equal(exists(file), true, `${file} must remain`);
      assert.match(read(file), /\/portal\/action-requests\/\$\{encodeURIComponent\(action\.id\)\}/);
    }
  });

  it("11. nested matter request hrefs are preserved and deferred for F6", () => {
    const src = read("src/components/client-portal/CustomerRequestDetail.tsx");
    assert.match(src, /export function CustomerRequestDetail/);
    assert.match(read("src/components/client-portal/CustomerInteractionCard.tsx"), /export function CustomerInteractionCard/);
    // The F6 surfaces remain in the repository and are not replaced here.
    assert.doesNotMatch(legacyMain(), /<PortalRequestDetailV3|RequestDetailV3/);
  });

  it("12. intake hrefs resolve to the V3-backed intake detail", () => {
    const src = read("src/components/client-portal-v3/intake/PortalIntakesV3.tsx");
    assert.match(src, /\/portal\/megkeresesek\/\$\{encodeURIComponent\(intake\.reference\)\}/);
    assert.match(orgBranch(), /view === 'intake' \? <PortalIntakeDetailV3/);
  });

  it("13. compliance hrefs resolve to the V3-backed compliance route", () => {
    assert.match(orgBranch(), /view === 'compliance' \? <PortalComplianceV3 \/> : null/);
  });

  it("14. PortalActionRow uses the authoritative backend-provided href", () => {
    const src = actionRow();
    assert.match(src, /href=\{item\.href\}/);
    assert.doesNotMatch(src, /href=\{\/portal\/action-requests/);
  });
});

describe("Checkpoint F5 — preservation", () => {
  it("15. INDIVIDUAL keeps the legacy ActionView runtime", () => {
    const src = legacyMain();
    assert.match(src, /view === 'action' && state\.action \? <ActionView action=\{state\.action\} \/> : null/);
  });

  it("16. CASE_RELAY keeps the legacy runtime", () => {
    assert.match(shell(), /workspace\.mode === 'CASE_RELAY'/);
    assert.match(legacyMain(), /<OrganizationPortalViews/);
  });

  it("17. the eager legacy shell fetch remains for non-ORGANIZATION only", () => {
    const src = shell();
    assert.match(src, /view === 'action' && resourceId && !isOrganizationWorkspace/);
    assert.match(src, /detail = \{ action: await getPortalActionRequest\(resourceId\) \};/);
  });

  it("18. legacy sources remain in the repository", () => {
    for (const file of [
      "src/components/client-portal/ClientPortalShell.tsx",
      "src/components/client-portal/CustomerRequestDetail.tsx",
      "src/components/client-portal/CustomerInteractionCard.tsx",
      "src/components/client-portal/OrganizationPortalViews.tsx",
    ]) {
      assert.equal(exists(file), true, `${file} must remain`);
    }
  });

  it("19. F5 V3 file follows the V3 visual contract", () => {
    const src = actionDetailV3();
    assert.doesNotMatch(src, /(?:bg|text|border|ring|fill|stroke)-\[#(?:[0-9a-fA-F]{3,8})\]/);
    assert.doesNotMatch(src, /stone-/);
    assert.doesNotMatch(src, /--adm-blue/);
    assert.doesNotMatch(src, /--adm-ivory/);
    assert.doesNotMatch(src, /rounded-2xl|rounded-3xl/);
    assert.match(src, /--adm-canvas-white/);
    assert.match(src, /--adm-border-canonical/);
    assert.match(src, /--adm-brand-green/);
    assert.match(src, /focus-visible:ring-2/);
  });
});
