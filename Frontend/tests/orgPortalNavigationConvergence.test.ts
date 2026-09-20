import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Organization portal shell + home convergence.
 *
 * The organization portal must behave like ONE product: every canonical customer
 * domain is reachable from the same navigation the loader serves, and navigation
 * availability must not contradict the route's actual customer-safe availability
 * model. These tests pin the converged information architecture, the responsive
 * contract and the promise that this is presentation-only (no authorization
 * change, no faked data).
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

const shell = () => read("src/components/client-portal/ClientPortalShell.tsx");
const orgHome = () => read("src/components/client-portal/OrgHomeView.tsx");

function orgNavBlock(): string {
  const src = shell();
  const start = src.indexOf("if (workspace.mode === 'ORGANIZATION')");
  const end = src.indexOf("if (workspace.mode === 'CASE_RELAY')");
  assert.ok(start !== -1 && end > start, "the organization nav block must exist");
  return src.slice(start, end);
}

const CANONICAL_ORG_DOMAINS: Array<[string, string]> = [
  ["Áttekintés", "/portal"],
  ["Ügyek", "/portal/ugyek"],
  ["Teendők", "/portal/teendoim"],
  ["Dokumentumok", "/portal/dokumentumok"],
  ["Naptár", "/portal/naptar"],
  ["Fejlesztés", "/portal/fejlesztes"],
  ["Megfelelés", "/portal/megfeleles"],
  ["Kommunikáció", "/portal/uzenetek"],
  ["Vállalat", "/portal/vallalat"],
];

describe("Organization portal navigation convergence", () => {
  it("every canonical organization domain is reachable from the organization navigation", () => {
    const block = orgNavBlock();
    for (const [label, href] of CANONICAL_ORG_DOMAINS) {
      assert.ok(block.includes(`['${label}', '${href}']`), `organization navigation is missing ${label} → ${href}`);
    }
  });

  it("does not hide organization domains behind the individual workspace capability flags", () => {
    const block = orgNavBlock();
    // The loader serves organization content through case grants / org projections,
    // so navigation must not re-hide Ügyek or Dokumentumok on capability flags.
    assert.doesNotMatch(block, /capabilities\.matters/);
    assert.doesNotMatch(block, /capabilities\.tasks/);
    assert.doesNotMatch(block, /capabilities\.documents/);
  });

  it("keeps Kommunikáció gated only by the authoritative communication mode", () => {
    const src = shell();
    const block = orgNavBlock();
    assert.match(src, /communicationMode !== 'EXTERNAL_ONLY'/);
    assert.match(block, /href === '\/portal\/uzenetek' && !communicationEnabled/);
    // The individual messaging capability must not be the organization gate.
    assert.doesNotMatch(block, /capabilities\.messages/);
  });

  it("keeps the individual and case-relay navigation untouched", () => {
    const src = shell();
    assert.ok(src.includes("['Ügyeim', '/portal/ugyeim']"), "INDIVIDUAL nav must still use Ügyeim");
    assert.ok(src.includes("['Együttműködési áttekintés', '/portal/szervezeti-attekintes']"), "CASE_RELAY nav must be preserved");
    assert.match(src, /capabilities\.home \? \['Főoldal', '\/portal'\] : null/);
  });

  it("offers a compact responsive mobile navigation with the remaining domains reachable", () => {
    const src = shell();
    // Preferred compact primary destinations plus an explicit overflow control.
    assert.match(src, /ORG_MOBILE_PRIMARY_HREFS = \['\/portal', '\/portal\/teendoim', '\/portal\/dokumentumok'\]/);
    assert.match(src, /data-testid="org-portal-mobile-nav"/);
    assert.match(src, /aria-expanded=\{mobileNavOpen\}/);
    assert.match(src, /aria-controls="org-portal-more-nav"/);
    assert.match(src, /id="org-portal-more-nav"/);
    assert.match(src, /Továbbiak/);
    // The overflow panel derives from the same canonical navigation, so every
    // remaining domain stays reachable on small screens.
    assert.match(src, /nav\s*\n?\s*\.filter\(\(\[, href\]\) => !ORG_MOBILE_PRIMARY_HREFS\.includes\(href\)\)/);
    // Desktop hides the wrapped nav for organization; mobile must not.
    assert.match(src, /isOrganization \? 'hidden sm:flex' : 'flex'/);
    // Active destination is exposed, never hover-only.
    assert.match(src, /aria-current=\{isActiveNav\(href\) \? 'page' : undefined\}/);
  });

  it("is presentation-only and introduces no authorization change", () => {
    const src = shell();
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
    // The navigation is derived from the exact same workspace context the loader used.
    assert.match(src, /state\.context\.selectedWorkspace/);
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
