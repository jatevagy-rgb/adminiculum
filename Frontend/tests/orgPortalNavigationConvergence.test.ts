import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Organization portal shell + home convergence (Client Portal 3.0).
 *
 * The organization portal must behave like ONE product: the seven canonical V3
 * primary destinations come from a single navigation module, Naptár and
 * Kommunikáció are utilities (never primary), the mobile bottom navigation
 * carries exactly four slots, and the whole cutover is presentation-only (no
 * authorization change, no faked data). INDIVIDUAL and CASE_RELAY navigation
 * stays on the legacy shell untouched.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

const shell = () => read("src/components/client-portal/ClientPortalShell.tsx");
const navModule = () => read("src/components/client-portal-v3/navigation.ts");
const shellV3 = () => read("src/components/client-portal-v3/PortalShellV3.tsx");
const primaryNav = () => read("src/components/client-portal-v3/PortalPrimaryNav.tsx");
const utilityTray = () => read("src/components/client-portal-v3/PortalUtilityTray.tsx");
const mobileNav = () => read("src/components/client-portal-v3/PortalMobileNav.tsx");
const orgHome = () => read("src/components/client-portal/OrgHomeView.tsx");

function orgPrimaryNavBlock(): string {
  const src = navModule();
  const start = src.indexOf("ORG_PRIMARY_NAV");
  const end = src.indexOf("ORG_MOBILE_PRIMARY_NAV");
  assert.ok(start !== -1 && end > start, "the V3 organization primary nav block must exist");
  return src.slice(start, end);
}

const CANONICAL_ORG_PRIMARY_DOMAINS: Array<[string, string]> = [
  ["Áttekintés", "/portal"],
  ["Ügyek", "/portal/ugyek"],
  ["Teendők", "/portal/teendoim"],
  ["Dokumentumok", "/portal/dokumentumok"],
  ["Vállalat", "/portal/vallalat"],
  ["Fejlesztés", "/portal/fejlesztes"],
  ["Megfelelés", "/portal/megfeleles"],
];

describe("Organization portal navigation convergence (V3)", () => {
  it("every canonical V3 primary domain is reachable from the organization navigation", () => {
    const block = orgPrimaryNavBlock();
    for (const [label, href] of CANONICAL_ORG_PRIMARY_DOMAINS) {
      assert.ok(block.includes(`label: "${label}", href: "${href}"`), `organization navigation is missing ${label} → ${href}`);
    }
  });

  it("the ORGANIZATION primary navigation has exactly seven destinations", () => {
    const block = orgPrimaryNavBlock();
    const count = (block.match(/label: "/g) || []).length;
    assert.equal(count, 7, "the ORGANIZATION primary navigation must contain exactly seven destinations");
  });

  it("Naptár and Kommunikáció are utilities, never primary destinations", () => {
    const block = orgPrimaryNavBlock();
    assert.ok(!block.includes('label: "Naptár"'), "Naptár must not be a primary destination");
    assert.ok(!block.includes('label: "Kommunikáció"'), "Kommunikáció must not be a primary destination");
    assert.ok(!block.includes("Szerződés"), "Szerződések must not be a primary destination");
    assert.ok(!block.includes("Szervezeti áttekintés"), "Szervezeti áttekintés must not be a primary destination");
  });

  it("does not hide organization domains behind the individual workspace capability flags", () => {
    const src = primaryNav() + navModule();
    assert.doesNotMatch(src, /capabilities\.matters/);
    assert.doesNotMatch(src, /capabilities\.tasks/);
    assert.doesNotMatch(src, /capabilities\.documents/);
  });

  it("keeps Kommunikáció gated only by the authoritative communication mode", () => {
    const src = shellV3() + utilityTray();
    assert.match(src, /communicationMode !== ['"]EXTERNAL_ONLY['"]/);
    assert.match(src, /communicationEnabled/);
    // The individual messaging capability must not be the organization gate.
    assert.doesNotMatch(src, /capabilities\.messages/);
  });

  it("keeps the individual and case-relay navigation untouched", () => {
    const src = shell();
    assert.ok(src.includes("['Ügyeim', '/portal/ugyeim']"), "INDIVIDUAL nav must still use Ügyeim");
    assert.ok(src.includes("['Együttműködési áttekintés', '/portal/szervezeti-attekintes']"), "CASE_RELAY nav must be preserved");
    assert.match(src, /capabilities\.home \? \['Főoldal', '\/portal'\] : null/);
  });

  it("offers a four-slot mobile bottom navigation with Több exposing the remaining domains", () => {
    const src = mobileNav();
    const nav = navModule();
    assert.match(src, /data-testid="org-portal-mobile-nav-v3"/);
    assert.match(src, /grid grid-cols-4/);
    assert.match(src, /data-testid="org-portal-more-trigger"/);
    assert.match(src, /Több/);
    assert.match(src, /aria-haspopup="dialog"/);
    assert.match(src, /<Modal/);
    // The three compact primary destinations plus Több.
    for (const label of ['label: "Áttekintés"', 'label: "Ügyek"', 'label: "Teendők"']) {
      assert.ok(nav.includes(label), `mobile primary nav missing ${label}`);
    }
    // The remaining domains stay reachable through the Több sheet.
    for (const label of ["Dokumentumok", "Vállalat", "Fejlesztés", "Megfelelés", "Naptár", "Kommunikáció"]) {
      assert.ok(nav.includes(`label: "${label}"`), `mobile Több nav missing ${label}`);
    }
    // Active destination is exposed, never hover-only.
    assert.match(src, /aria-current=\{active \? ['"]page['"] : undefined\}/);
  });

  it("renders the V3 shell for the ready ORGANIZATION runtime", () => {
    const src = shell();
    assert.match(src, /<PortalShellV3/);
    assert.match(shellV3(), /data-testid="client-portal-shell-v3"/);
  });

  it("is presentation-only and introduces no authorization change", () => {
    const src = shellV3() + primaryNav() + utilityTray() + mobileNav() + navModule();
    for (const forbidden of [
      /bypass/i,
      /escalat/i,
      /overrideCapabilit/i,
      /forceGrant/i,
      /isAdmin/,
      /permissions\.push/,
      /role\s*===\s*'admin'/i,
    ]) {
      assert.doesNotMatch(src, forbidden, `navigation must not introduce an authorization change: ${forbidden}`);
    }
    // The shell receives the exact same server-resolved context the loader used.
    assert.match(shellV3(), /context\.selectedWorkspace/);
  });
});

describe("Organization home convergence", () => {
  it("answers company → attention → continue → recent → documents → upcoming, in order", () => {
    const src = orgHome();
    // Compare within the returned JSX so function-declaration order cannot confuse it.
    const body = src.slice(src.indexOf('data-testid="org-home-view"'));
    const ordered = ["Szervezeti ügyfélfelület", "Ami most Öntől kell", "currentMatter", "Legutóbbi tevékenység", "Közelgő határidők", "Vállalati profil"];
    let last = -1;
    for (const token of ordered) {
      const idx = body.indexOf(token);
      assert.ok(idx > -1, `organization home is missing ${token}`);
      assert.ok(idx > last, `organization home order violated for ${token}`);
      last = idx;
    }
    // The continued-matter card is explicit and truthful.
    assert.match(src, /Innen folytassa/);
  });

  it("keeps canonical destination quick actions and reachable documents/deadlines", () => {
    const src = orgHome();
    for (const href of ["/portal/ugyek", "/portal/teendoim", "/portal/dokumentumok", "/portal/naptar"]) {
      assert.ok(src.includes(`href: "${href}"`), `quick actions must reach ${href}`);
    }
    assert.match(src, /actionLink="\/portal\/dokumentumok"/);
    assert.match(src, /actionLink="\/portal\/naptar"/);
  });

  it("derives deadlines from real published dates only", () => {
    const src = orgHome();
    assert.match(src, /matter\.publicTargetDate/);
    assert.match(src, /action\.dueAt/);
    assert.doesNotMatch(src, /Math\.random|faker|lorem|mockData|sampleData/i);
  });

  it("shows truthful empty states instead of huge empty cards", () => {
    const src = orgHome();
    for (const empty of [
      "Jelenleg nincs Önnek szóló teendő",
      "Jelenleg nincs közzétett aktív ügy",
      "Még nincs közzétett frissítés",
      "Nincs közzétett közelgő határidő",
      "Még nincs közzétett szervezeti területi összesítés",
      "Még nincs folyamatban kérdés vagy üzenetváltás",
    ]) {
      assert.ok(src.includes(empty), `missing honest empty state: ${empty}`);
    }
  });
});
