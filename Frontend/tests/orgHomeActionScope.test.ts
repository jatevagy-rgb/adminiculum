import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Customer portal Home — action-preview scope + empty informational density.
 *
 * The Home action list is a preview. A hero total ("N Öntől vár teendő") must never
 * be contradicted by a silently truncated list that looks complete. When the backend
 * publishes more actions than the preview shows, the section states the real scope
 * and offers the canonical Teendők destination. When there is nothing to disclose
 * (<= preview), no redundant count copy is added.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const orgHome = () => read("src/components/client-portal/OrgHomeView.tsx");

describe("Organization home action preview scope", () => {
  it("keeps the compact preview at four rows and does not change action order/hrefs", () => {
    const src = orgHome();
    // The preview slice is the preserved runtime contract.
    assert.match(src, /const actionNow = useMemo\(\(\) => \(home\?\.actions \|\| \[\]\)\.slice\(0, 4\), \[home\]\)/);
    // Ordering and href resolution are untouched.
    assert.match(src, /actionNow\.map\(\(action\) => \(/);
    assert.match(src, /function orgActionHref\(action: PortalOrgHome\["actions"\]\[number\]\): string/);
    assert.match(src, /if \(action\.matterPublicationId\) return `\/portal\/matters\/\$\{encodeURIComponent\(action\.matterPublicationId\)\}`/);
    assert.match(src, /if \(action\.area === "COMPLIANCE"\) return "\/portal\/megfeleles"/);
    assert.match(src, /return `\/portal\/action-requests\/\$\{encodeURIComponent\(action\.id\)\}`/);
  });

  it("derives the scope from the real total, not from the visible slice", () => {
    const src = orgHome();
    assert.match(src, /const actionTotal = home\?\.actions\.length \?\? 0/);
    assert.match(src, /const actionScopeNote = actionTotal > actionNow\.length \? `\$\{actionNow\.length\} megjelenítve · \$\{actionTotal\} összesen` : undefined/);
  });

  it("surfaces 'megjelenítve · összesen' plus the canonical Teendők link only when truncated", () => {
    const src = orgHome();
    // Scope note and link are gated on the same truncated condition, so a full list
    // never shows redundant count copy.
    assert.match(src, /note=\{actionScopeNote\}/);
    assert.match(src, /actionLink=\{actionScopeNote \? "\/portal\/teendoim" : undefined\}/);
    assert.match(src, /actionLabel=\{actionScopeNote \? "Összes teendő" : undefined\}/);
  });

  it("renders the scope note in the section header, not as a fake data row", () => {
    const src = orgHome();
    // The note sits with the section title inside the shared header.
    assert.match(
      src,
      /<h2 className="mt-1 font-serif text-2xl font-semibold text-stone-950">\{title\}<\/h2>[\s\S]{0,240}data-testid="portal-section-scope"/,
    );
  });

  it("invents no urgency or due date for the scope copy", () => {
    const src = orgHome();
    assert.doesNotMatch(src, /Math\.random|faker|lorem|mockData|sampleData/i);
    assert.doesNotMatch(src, /sürgős|lejárt|hamarosan lejár/i);
  });
});

describe("Organization home informational density", () => {
  it("keeps the company profile compact while unpublished, with its destination intact", () => {
    const src = orgHome();
    assert.match(src, /const profileHasContent = Boolean\(/);
    // The published branch keeps the real figures and headline.
    assert.match(src, /data-testid="org-company-profile"/);
    assert.match(src, /Vállalati profil/);
    assert.match(src, /company\?\.profileHeadline/);
    // The unpublished branch is the same compact state used by empty sections and
    // still links to the canonical company surface.
    assert.match(src, /\{profileHasContent \? \([\s\S]*portal-compact-empty[\s\S]*A vállalati profil adatai még nem kerültek közzétételre\.[\s\S]*\/portal\/vallalat/);
  });

  it("keeps customer actions ahead of the informational company profile", () => {
    const src = orgHome();
    const body = src.slice(src.indexOf('data-testid="org-home-view"'));
    const actions = body.indexOf('title="Ami most Öntől kell"');
    const profile = body.indexOf('data-testid="org-company-profile"');
    assert.ok(actions > -1 && profile > actions, "customer actions must precede the company profile");
  });

  it("does not drop the other canonical empty states or destinations", () => {
    const src = orgHome();
    for (const token of [
      "Jelenleg nincs Önnek szóló teendő",
      "Jelenleg nincs közzétett aktív ügy",
      "Még nincs közzétett frissítés",
      "Nincs közzétett közelgő határidő",
      "Még nincs folyamatban kérdés vagy üzenetváltás",
      "/portal/ugyek",
      "/portal/dokumentumok",
      "/portal/naptar",
      "/portal/uzenetek",
      "/portal/vallalat",
    ]) {
      assert.ok(src.includes(token), `missing preserved contract: ${token}`);
    }
  });
});
