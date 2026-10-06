import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Client Portal 3.0 — checkpoint A shell cutover contract.
 *
 * Pins the real ORGANIZATION runtime cutover: seven primary destinations,
 * utilities out of the primary nav, EXTERNAL_ONLY gating, the four-slot mobile
 * bottom navigation, the single green CTA, preserved route bodies, untouched
 * INDIVIDUAL/CASE_RELAY behavior, no raw hex / legacy tokens in the V3 family,
 * and no legacy deletion.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const exists = (relative: string) => existsSync(path.join(root, relative));

const V3_DIR = "src/components/client-portal-v3";

const v3Sources = () =>
  [
    `${V3_DIR}/navigation.ts`,
    `${V3_DIR}/PortalShellV3.tsx`,
    `${V3_DIR}/PortalHeader.tsx`,
    `${V3_DIR}/PortalPrimaryNav.tsx`,
    `${V3_DIR}/PortalMobileNav.tsx`,
    `${V3_DIR}/PortalUtilityTray.tsx`,
    `${V3_DIR}/PortalPage.tsx`,
    `${V3_DIR}/shared/PortalEmptyInline.tsx`,
  ]
    .map((file) => read(file))
    .join("\n");

describe("Checkpoint A — ORGANIZATION primary navigation", () => {
  it("1. the seven desktop primary destinations are exact and in order", () => {
    const src = read(`${V3_DIR}/navigation.ts`);
    const block = src.slice(src.indexOf("ORG_PRIMARY_NAV"), src.indexOf("ORG_MOBILE_PRIMARY_NAV"));
    const expected = [
      'label: "Áttekintés", href: "/portal"',
      'label: "Ügyek", href: "/portal/ugyek"',
      'label: "Teendők", href: "/portal/teendoim"',
      'label: "Dokumentumok", href: "/portal/dokumentumok"',
      'label: "Vállalat", href: "/portal/vallalat"',
      'label: "Fejlesztés", href: "/portal/fejlesztes"',
      'label: "Megfelelés", href: "/portal/megfeleles"',
    ];
    let last = -1;
    for (const entry of expected) {
      const idx = block.indexOf(entry);
      assert.ok(idx > -1, `missing primary destination ${entry}`);
      assert.ok(idx > last, `primary destination order violated for ${entry}`);
      last = idx;
    }
    assert.equal((block.match(/label: "/g) || []).length, 7, "exactly seven primary destinations");
  });

  it("2. Calendar is absent from the primary nav and present as a header utility", () => {
    const nav = read(`${V3_DIR}/navigation.ts`);
    const primaryBlock = nav.slice(nav.indexOf("ORG_PRIMARY_NAV"), nav.indexOf("ORG_MOBILE_PRIMARY_NAV"));
    assert.ok(!primaryBlock.includes('label: "Naptár"'), "Naptár must not be a primary destination");
    const tray = read(`${V3_DIR}/PortalUtilityTray.tsx`);
    assert.match(tray, /href="\/portal\/naptar"/);
  });

  it("3. Communication is absent from the primary nav and present as a utility unless EXTERNAL_ONLY", () => {
    const nav = read(`${V3_DIR}/navigation.ts`);
    const primaryBlock = nav.slice(nav.indexOf("ORG_PRIMARY_NAV"), nav.indexOf("ORG_MOBILE_PRIMARY_NAV"));
    assert.ok(!primaryBlock.includes('label: "Kommunikáció"'), "Kommunikáció must not be a primary destination");
    const tray = read(`${V3_DIR}/PortalUtilityTray.tsx`);
    assert.match(tray, /href=\{ORG_COMMUNICATION_HREF\}/);
    assert.match(tray, /communicationEnabled \? \(/);
    assert.match(tray, /\) : null/);
  });

  it("4. EXTERNAL_ONLY hides the Communication utility completely", () => {
    const shell = read(`${V3_DIR}/PortalShellV3.tsx`);
    assert.match(shell, /communicationMode !== ["']EXTERNAL_ONLY["']/);
    assert.match(shell, /communicationEnabled=\{communicationEnabled\}/);
    // The tray renders the communication entry only when communicationEnabled is true.
    const tray = read(`${V3_DIR}/PortalUtilityTray.tsx`);
    assert.match(tray, /communicationEnabled \? \(/);
  });

  it("5. exactly one green Új megkeresés CTA links to the canonical intake route", () => {
    const header = read(`${V3_DIR}/PortalHeader.tsx`);
    assert.match(header, /ORG_NEW_INTAKE_HREF/);
    assert.match(header, /data-testid="portal-cta-new-intake"/);
    assert.equal((header.match(/data-testid="portal-cta-new-intake"/g) || []).length, 1);
    assert.match(header, /bg-\[var\(--adm-brand-green\)\]/);
    assert.match(header, />Új megkeresés</);
    const nav = read(`${V3_DIR}/navigation.ts`);
    assert.match(nav, /ORG_NEW_INTAKE_HREF = "\/portal\/megkeresesek\/uj"/);
  });
});

describe("Checkpoint A — mobile navigation", () => {
  it("6. the 390px bottom nav carries exactly four slots: three primary + Több", () => {
    const src = read(`${V3_DIR}/PortalMobileNav.tsx`);
    assert.match(src, /data-testid="org-portal-mobile-nav-v3"/);
    assert.match(src, /grid grid-cols-4/);
    assert.match(src, /data-testid="org-portal-more-trigger"/);
    const nav = read(`${V3_DIR}/navigation.ts`);
    const mobileBlock = nav.slice(nav.indexOf("ORG_MOBILE_PRIMARY_NAV"), nav.indexOf("ORG_MOBILE_MORE_NAV"));
    assert.equal((mobileBlock.match(/label: "/g) || []).length, 3, "exactly three compact mobile primary destinations");
    for (const label of ["Áttekintés", "Ügyek", "Teendők"]) {
      assert.ok(mobileBlock.includes(`label: "${label}"`), `mobile primary nav missing ${label}`);
    }
  });

  it("7. Több exposes the secondary destinations with Kommunikáció gated", () => {
    const nav = read(`${V3_DIR}/navigation.ts`);
    const moreBlock = nav.slice(nav.indexOf("ORG_MOBILE_MORE_NAV"), nav.indexOf("ORG_COMMUNICATION_HREF"));
    for (const label of ["Dokumentumok", "Vállalat", "Fejlesztés", "Megfelelés", "Naptár", "Kommunikáció"]) {
      assert.ok(moreBlock.includes(`label: "${label}"`), `Több nav missing ${label}`);
    }
    const src = read(`${V3_DIR}/PortalMobileNav.tsx`);
    assert.match(src, /item\.href !== ORG_COMMUNICATION_HREF \|\| communicationEnabled/);
    assert.match(src, /<Modal/);
    assert.match(src, /onClose=\{\(\) => setMoreOpen\(false\)\}/);
  });

  it("8. the Több sheet is keyboard accessible via the canonical focus-trapped Modal", () => {
    const src = read(`${V3_DIR}/PortalMobileNav.tsx`);
    assert.match(src, /aria-haspopup="dialog"/);
    assert.match(src, /aria-expanded=\{moreOpen\}/);
    assert.match(src, /import \{ Modal \} from "@\/components\/ui"/);
    // The canonical Modal provides focus trap, Escape handling and focus restore
    // through the shared dialog accessibility hook.
    const modal = read("src/components/ui/Modal.tsx");
    const dialogA11y = read("src/components/ui/useDialogAccessibility.ts");
    assert.match(modal, /useDialogAccessibility/);
    assert.match(dialogA11y, /event\.key === "Escape"/);
    assert.match(dialogA11y, /previousFocusRef/);
  });
});

describe("Checkpoint A — runtime cutover", () => {
  it("9. the ready ORGANIZATION runtime renders PortalShellV3", () => {
    const shell = read("src/components/client-portal/ClientPortalShell.tsx");
    const cutover = shell.indexOf("<PortalShellV3");
    const providerGate = shell.indexOf("state.status === 'provider-unavailable') return");
    const loginGate = shell.indexOf("state.status === 'login' && view === 'home'");
    assert.ok(cutover > -1, "PortalShellV3 cutover missing");
    assert.ok(providerGate > -1 && providerGate < cutover, "provider fail-closed gate must precede the V3 cutover");
    assert.ok(loginGate > -1 && loginGate < cutover, "login landing must precede the V3 cutover");
    assert.match(shell, /state\.status === 'ready' && state\.context\.selectedWorkspace\?\.mode === 'ORGANIZATION'/);
  });

  it("10. the existing ORGANIZATION route bodies still render inside the V3 frame", () => {
    const shell = read("src/components/client-portal/ClientPortalShell.tsx");
    // Client Portal 3.0 checkpoint B: home and tasks now use the V3 bodies.
    assert.match(shell, /<PortalHomeV3 identityName=\{state\.context\.identity\?\.displayName\} \/>/);
    assert.match(shell, /<PortalActionCenter \/>/);
    assert.match(shell, /<PortalCalendarView \/>/);
    assert.match(shell, /<OrganizationPortalViews[\s\S]*?requestId=\{requestId\}[\s\S]*?context=\{state\.context\}/);
    assert.match(shell, /view=\{view as OrganizationPortalView\}/);
    assert.match(shell, /<DocumentView document=\{state\.document\} \/>/);
    assert.match(shell, /<ActionView action=\{state\.action\} \/>/);
  });

  it("11. INDIVIDUAL behavior remains on the legacy shell", () => {
    const shell = read("src/components/client-portal/ClientPortalShell.tsx");
    assert.ok(shell.includes("['Ügyeim', '/portal/ugyeim']"));
    assert.ok(shell.includes("['Teendőim', '/portal/teendoim']"));
    assert.ok(shell.includes("['Üzenetek', '/portal/uzenetek']"));
    assert.match(shell, /data-testid="client-portal-shell"/);
  });

  it("12. CASE_RELAY behavior remains on the legacy shell", () => {
    const shell = read("src/components/client-portal/ClientPortalShell.tsx");
    assert.ok(shell.includes("['Együttműködési áttekintés', '/portal/szervezeti-attekintes']"));
    assert.match(shell, /workspace\.mode === 'CASE_RELAY'/);
  });

  it("13. the auth/workspace state machine stays in the canonical shell", () => {
    const shell = read("src/components/client-portal/ClientPortalShell.tsx");
    for (const pattern of [
      /isCustomerProviderConfigured/,
      /status: 'provider-unavailable'/,
      /acquireTokenSilent/,
      /pickAccountByTenant\(accounts, customerTenantId\)/,
      /setAuthToken\(token\.accessToken, 'customer'\)/,
      /PortalWorkspaceSelector/,
      /PortalOnboarding/,
      /ACCESS_SUSPENDED/,
      /setSelectedPortalWorkspace\(null\)/,
    ]) {
      assert.match(shell, pattern);
    }
  });
});

describe("Checkpoint A — visual contract", () => {
  it("14. no raw hex color classes in the V3 component family", () => {
    const src = v3Sources();
    assert.doesNotMatch(src, /(?:bg|text|border|ring|fill|stroke)-\[#(?:[0-9a-fA-F]{3,8})\]/);
    assert.doesNotMatch(src, /style=\{\{[^}]*(?:color|backgroundColor|borderColor)\s*:\s*["']#/);
  });

  it("15. no legacy --adm-blue / --adm-ivory tokens in the V3 component family", () => {
    const src = v3Sources();
    assert.doesNotMatch(src, /--adm-blue/);
    assert.doesNotMatch(src, /--adm-ivory/);
  });

  it("16. canonical V3 tokens and visible focus are used", () => {
    const src = v3Sources();
    assert.match(src, /--adm-canvas-subtle/);
    assert.match(src, /--adm-border-canonical/);
    assert.match(src, /--adm-brand-green/);
    assert.match(src, /focus-visible:ring-2/);
    // No pill-navigation treatment in the primary navigation.
    const primary = read(`${V3_DIR}/PortalPrimaryNav.tsx`);
    assert.doesNotMatch(primary, /rounded-full/);
  });

  it("17. interactive targets respect the 40px minimum", () => {
    const src = v3Sources();
    assert.match(src, /h-10/);
    assert.match(src, /min-h-\[52px\]/);
  });
});

describe("Checkpoint A — legacy preservation", () => {
  it("18. legacy portal components and routes are not deleted", () => {
    for (const relative of [
      "src/components/client-portal/ClientPortalShell.tsx",
      "src/components/client-portal/OrganizationPortalViews.tsx",
      "src/components/client-portal/OrgHomeView.tsx",
      "src/components/client-portal/PortalCalendarView.tsx",
      "src/app/portal/page.tsx",
      "src/app/portal/ugyek/page.tsx",
      "src/app/portal/ugyeim/page.tsx",
      "src/app/portal/szervezeti-attekintes/page.tsx",
      "src/app/portal/szerzodesek/page.tsx",
    ]) {
      assert.equal(exists(relative), true, `${relative} must remain in the repository`);
    }
  });

  it("19. legacy deep links remain mapped (/portal/ugyeim alias)", () => {
    const nav = read(`${V3_DIR}/navigation.ts`);
    assert.match(nav, /"\/portal\/ugyeim": "matters"/);
    const routes = ["src/app/portal/ugyeim/page.tsx", "src/app/portal/matters/[publicationId]/page.tsx", "src/app/portal/documents/[publicationId]/page.tsx"];
    for (const route of routes) {
      assert.equal(exists(route), true, `${route} must remain`);
      assert.match(read(route), /ClientPortalShell/);
    }
  });

  it("20. no legacy pill-nav or warm route background enters the V3 shell", () => {
    const src = v3Sources();
    assert.doesNotMatch(src, /cp-shell|cp-hero|cp-pill/);
    assert.doesNotMatch(src, /ivory|cream/);
    // Terracotta is reserved for critical/destructive semantics and stays out of the shell.
    assert.doesNotMatch(src, /--adm-brand-terracotta/);
  });
});
