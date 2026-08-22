import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { VIEWS_BY_MODE, isViewSupported, type PortalMode, type PortalView } from "../src/lib/portalModeViews";

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("Portal mode view support mapping (pure)", () => {
  it("INDIVIDUAL does NOT support contracts, company, leadership, intakes, or new-intake", () => {
    const unsupported: PortalView[] = ["contracts", "company", "leadership", "intakes", "new-intake"];
    for (const view of unsupported) {
      assert.equal(isViewSupported("INDIVIDUAL", view), false, `INDIVIDUAL should not support ${view}`);
    }
  });

  it("INDIVIDUAL supports core views: home, matters, tasks, documents, messages, matter, document, action", () => {
    const supported: PortalView[] = ["home", "matters", "tasks", "documents", "messages", "matter", "document", "action"];
    for (const view of supported) {
      assert.equal(isViewSupported("INDIVIDUAL", view), true, `INDIVIDUAL should support ${view}`);
    }
  });

  it("ORGANIZATION supports all views", () => {
    const allViews: PortalView[] = [
      "home", "matters", "tasks", "documents", "messages",
      "matter", "document", "action",
      "intakes", "new-intake", "leadership", "contracts", "company",
    ];
    for (const view of allViews) {
      assert.equal(isViewSupported("ORGANIZATION", view), true, `ORGANIZATION should support ${view}`);
    }
  });

  it("CASE_RELAY supports matters, documents, messages, leadership, matter, document, action but NOT contracts, company, intakes, new-intake", () => {
    const supported: PortalView[] = ["home", "matters", "documents", "messages", "matter", "document", "action", "leadership"];
    for (const view of supported) {
      assert.equal(isViewSupported("CASE_RELAY", view), true, `CASE_RELAY should support ${view}`);
    }
    const unsupported: PortalView[] = ["contracts", "company", "intakes", "new-intake", "tasks"];
    for (const view of unsupported) {
      assert.equal(isViewSupported("CASE_RELAY", view), false, `CASE_RELAY should not support ${view}`);
    }
  });

  it("VIEWS_BY_MODE has exactly three keys matching the canonical modes", () => {
    const keys = Object.keys(VIEWS_BY_MODE) as PortalMode[];
    assert.deepEqual(keys.sort(), ["CASE_RELAY", "INDIVIDUAL", "ORGANIZATION"]);
  });

  it("every mode set is non-empty and all values are valid PortalView strings", () => {
    const validViews: ReadonlySet<string> = new Set([
      "home", "matters", "tasks", "documents", "messages",
      "matter", "document", "action",
      "intakes", "new-intake", "leadership", "contracts", "company",
    ]);
    for (const [mode, views] of Object.entries(VIEWS_BY_MODE)) {
      assert.ok(views.size > 0, `${mode} has empty view set`);
      for (const v of views) {
        assert.ok(validViews.has(v), `${mode} references unknown view ${v}`);
      }
    }
  });
});

describe("Portal mode view support mapping (source structure)", () => {
  const shell = () => read("src/components/client-portal/ClientPortalShell.tsx");

  it("ClientPortalShell imports isViewSupported from portalModeViews", () => {
    const src = shell();
    assert.match(src, /import.*isViewSupported.*from.*portalModeViews/);
  });

  it("ClientPortalShell uses isViewSupported as the guard for unsupported views", () => {
    const src = shell();
    assert.match(src, /isViewSupported\(.*mode.*view\)/);
  });

  it("unsupported view renders ViewUnavailable component", () => {
    const src = shell();
    assert.match(src, /ViewUnavailable/);
    assert.match(src, /Nem érhető el/);
  });

  it("ViewUnavailable redirects to /portal via router.push", () => {
    const src = shell();
    assert.match(src, /ViewUnavailable.*onGoHome.*router\.push\(.*\/portal.*\)/s);
  });

  it("ClientPortalShell imports useRouter from next/navigation", () => {
    const src = shell();
    assert.match(src, /import.*useRouter.*from.*next\/navigation/);
  });

  it("INDIVIDUAL nav does NOT contain Szerződések, Vállalat, or Megkeresések links", () => {
    const src = shell();
    const caseRelayIdx = src.indexOf("if (workspace.mode === 'CASE_RELAY')");
    const individualBlock = src.slice(caseRelayIdx + "if (workspace.mode === 'CASE_RELAY')".length);
    assert.doesNotMatch(individualBlock, /szerzodesek|vallalat|megkeresesek/i);
  });

  it("INDIVIDUAL nav does NOT reference Grow with us, upgrade, or marketing", () => {
    const src = shell();
    const caseRelayIdx = src.indexOf("if (workspace.mode === 'CASE_RELAY')");
    const individualBlock = src.slice(caseRelayIdx + "if (workspace.mode === 'CASE_RELAY')".length);
    assert.doesNotMatch(individualBlock, /[Gg]row|upgrade|marketing|nőjünk|fejlődjünk/i);
  });
});
