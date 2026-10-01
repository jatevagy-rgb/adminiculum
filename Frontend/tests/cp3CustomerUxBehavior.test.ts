import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const exists = (relative: string) => existsSync(path.join(root, relative));

const V3_DIR = "src/components/client-portal-v3";

describe("CP3 Customer UX — Shell & Header Contracts", () => {
  it("PortalHeader provides touch-compliant targets and accessible account menu", () => {
    const src = read(`${V3_DIR}/PortalHeader.tsx`);
    assert.match(src, /data-testid="portal-header-v3"/);
    assert.match(src, /data-testid="portal-cta-new-intake"/);
    assert.match(src, /data-testid="portal-account-menu-trigger"/);
    assert.match(src, /data-testid="portal-account-menu"/);
    assert.match(src, /min-h-10/);
    assert.match(src, /h-10/);
    assert.match(src, /ArrowDown/);
    assert.match(src, /ArrowUp/);
    assert.match(src, /Escape/);
  });

  it("PortalMobileNav renders 4 slots with native app-like SVG icons and labels", () => {
    const src = read(`${V3_DIR}/PortalMobileNav.tsx`);
    assert.match(src, /data-testid="org-portal-mobile-nav-v3"/);
    assert.match(src, /grid-cols-4/);
    assert.match(src, /data-testid="org-portal-more-trigger"/);
    assert.match(src, /min-h-\[52px\]/);
    assert.match(src, /min-h-11/);
    assert.match(src, /getPrimaryNavIcon/);
    assert.match(src, /<Modal open=\{moreOpen\}/);
    assert.match(src, /onClose=\{\(\) => setMoreOpen\(false\)\}/);
  });

  it("PortalPage maintains bounded operational reading width and safe bottom padding", () => {
    const src = read(`${V3_DIR}/PortalPage.tsx`);
    assert.match(src, /max-w-6xl/);
    assert.match(src, /pb-24/);
  });

  it("PortalPrimaryNav maintains clean underline active indicator without pills", () => {
    const src = read(`${V3_DIR}/PortalPrimaryNav.tsx`);
    assert.match(src, /data-testid="org-portal-primary-nav"/);
    assert.match(src, /border-\[var\(--adm-brand-green\)\]/);
    assert.doesNotMatch(src, /rounded-full/);
  });
});

describe("CP3 Customer UX — Home & Deliberate Grouping", () => {
  it("PortalHomeV3 includes an executive welcome header and status overview", () => {
    const src = read(`${V3_DIR}/PortalHomeV3.tsx`);
    assert.match(src, /data-testid="portal-home-v3"/);
    assert.match(src, /Szervezeti ügyfélfelület/);
    assert.match(src, /customerName/);
    // The header stat is the canonical complete granted+published matter count,
    // not the bounded preview length — labelled as the published sample.
    assert.match(src, /Közzétett ügy/);
    assert.match(src, /mattersTotalShown/);
    assert.match(src, /Teendő/);
  });

  it("PortalHomeV3 maintains canonical testids for all operational sections", () => {
    const src = read(`${V3_DIR}/PortalHomeV3.tsx`);
    assert.match(src, /data-testid="portal-home-v3-loading"/);
    assert.match(src, /testid="portal-home-v3-actions"/);
    assert.match(src, /testid="portal-home-v3-matters"/);
    assert.match(src, /testid="portal-home-v3-grow"/);
    assert.match(src, /testid="portal-home-v3-compliance"/);
    assert.match(src, /testid="portal-home-v3-documents"/);
  });

  it("PortalHomeV3 elevates the server-resolved current matter with badge and next step callout", () => {
    const src = read(`${V3_DIR}/PortalHomeV3.tsx`);
    assert.match(src, /Kiemelt ügy/);
    assert.match(src, /Következő lépés:/);
    assert.match(src, /matter\.nextStep/);
    assert.match(src, /matter\.waitingOn/);
    // The featured fact comes from the DTO's currentMatter publication id,
    // never from card array order.
    assert.match(src, /featuredMatterId/);
    assert.match(src, /matter\.matterPublicationId === featuredMatterId/);
  });

  it("PortalHomeV3 never masks an action API failure as zero or stale success", () => {
    const src = read(`${V3_DIR}/PortalHomeV3.tsx`);
    assert.match(src, /actionsTrusted/);
    assert.match(src, /data-testid="portal-home-v3-actions-unavailable"/);
    assert.match(src, /setActions\(null\)/);
    assert.match(src, /setHome\(null\)/);
  });

  it("PortalHomeV3 has zero occurrences of percent character and no fake metrics", () => {
    const src = read(`${V3_DIR}/PortalHomeV3.tsx`);
    assert.doesNotMatch(src, /%/);
    assert.doesNotMatch(src, /érettség|megtakarítás|ROI|\bAI\b|sparkline|trend/i);
  });
});

describe("CP3 Customer UX — Shared Primitives", () => {
  it("shared primitives exist and follow design tokens", () => {
    assert.ok(exists(`${V3_DIR}/shared/PortalBadge.tsx`));
    assert.ok(exists(`${V3_DIR}/shared/PortalCard.tsx`));
    assert.ok(exists(`${V3_DIR}/shared/PortalSectionHeader.tsx`));
    assert.ok(exists(`${V3_DIR}/shared/PortalEmptyInline.tsx`));

    const badgeSrc = read(`${V3_DIR}/shared/PortalBadge.tsx`);
    const cardSrc = read(`${V3_DIR}/shared/PortalCard.tsx`);
    const headerSrc = read(`${V3_DIR}/shared/PortalSectionHeader.tsx`);

    const combined = [badgeSrc, cardSrc, headerSrc].join("\n");
    assert.doesNotMatch(combined, /(?:bg|text|border|ring|fill|stroke)-\[#(?:[0-9a-fA-F]{3,8})\]/);
    assert.doesNotMatch(combined, /--adm-blue/);
    assert.doesNotMatch(combined, /--adm-ivory/);
  });
});
