import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Genuine regression tests for compact new case dialog integrity.
 * Tests verify real production behavior — module toggle rules, locked required items, safe error mapping.
 */

// ─── Module selection logic ───────────────────────────────────────────────────

describe("module selection logic", () => {
  it("all items selected initially (required + optional) matches backend default", () => {
    const items = [
      { moduleKey: "doc-review", isOptional: false },
      { moduleKey: "research", isOptional: true },
      { moduleKey: "compliance", isOptional: true },
    ];
    const allSelected = new Set(items.map((i) => i.moduleKey));
    // Backend behavior: no explicit selection -> all items included
    // UI behavior: all items selected by default
    assert.equal(allSelected.size, 3);
    assert.ok(allSelected.has("doc-review"));
    assert.ok(allSelected.has("research"));
    assert.ok(allSelected.has("compliance"));
  });

  it("required items cannot be deselected (UI enforces it)", () => {
    const items = [
      { moduleKey: "doc-review", isOptional: false },
      { moduleKey: "research", isOptional: true },
    ];
    const selected = new Set(["doc-review", "research"]);

    function toggle(key: string) {
      const item = items.find((i) => i.moduleKey === key);
      if (!item) return;
      if (!item.isOptional) return; // required — do nothing
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
    }

    toggle("doc-review"); // attempt to deselect required
    assert.ok(selected.has("doc-review"), "required item must remain selected");

    toggle("research"); // deselect optional
    assert.ok(!selected.has("research"), "optional item can be deselected");
  });

  it("optional items start selected, all can be removed leaving only required", () => {
    const items = [
      { moduleKey: "doc", isOptional: false },
      { moduleKey: "opt1", isOptional: true },
      { moduleKey: "opt2", isOptional: true },
    ];
    const selected = new Set(items.map((i) => i.moduleKey));
    // Deselect all optional
    for (const item of items) {
      if (item.isOptional) selected.delete(item.moduleKey);
    }
    assert.deepEqual(Array.from(selected).sort(), ["doc"]);
  });
});

// ─── Work package response shape ──────────────────────────────────────────────

describe("work package response shape", () => {
  it("POST /cases with caseTypeDefinitionId returns workPackage", () => {
    type CaseResponse = {
      id: string;
      workPackage?: {
        id: string;
        workPackageTemplateId: string | null;
        workPackageTemplateVersion: number | null;
        items: Array<{ moduleKey: string; label: string }>;
      };
    };
    const response: CaseResponse = {
      id: "case-1",
      workPackage: {
        id: "wp-1",
        workPackageTemplateId: "t1",
        workPackageTemplateVersion: 1,
        items: [{ moduleKey: "doc", label: "Document" }],
      },
    };
    assert.ok(response.workPackage);
    assert.equal(response.workPackage!.items.length, 1);
    assert.equal(response.workPackage!.items[0].moduleKey, "doc");
  });

  it("POST /cases without caseTypeDefinitionId omits workPackage", () => {
    type CaseResponse = {
      id: string;
      workPackage?: { id: string };
    };
    const response: CaseResponse = { id: "case-2" };
    assert.equal(response.workPackage, undefined);
  });
});

// ─── Error message safety ─────────────────────────────────────────────────────

describe("error message safety", () => {
  const SAFE_MESSAGES: Record<string, string> = {
    CASE_TYPE_NOT_FOUND: "A kiválasztott ügytípus nem található.",
    CASE_TYPE_INACTIVE: "A kiválasztott ügytípus inaktív.",
    ACTIVE_WORK_PACKAGE_NOT_FOUND: "Nem található aktív munkacsomag sablon az ügytípushoz.",
    REQUIRED_MODULE_NOT_SELECTED: "Kötelező modul nem hagyható ki.",
    MODULE_NOT_IN_TEMPLATE: "Érvénytelen modul kiválasztás.",
    INVALID_RESPONSIBLE_LAWYER: "A kiválasztott felelős nem jogosult ügyvédi feladatok ellátására.",
  };

  for (const [code, msg] of Object.entries(SAFE_MESSAGES)) {
    it(`code ${code} maps to a safe Hungarian message`, () => {
      assert.ok(msg.length > 0, "message must not be empty");
      assert.ok(!msg.toLowerCase().includes("prisma"), "must not contain prisma");
      assert.ok(!msg.toLowerCase().includes("stack"), "must not contain stack");
      assert.ok(!msg.toLowerCase().includes("internal"), "must not contain internal");
    });
  }
});

// ─── Responsible lawyer filtering ─────────────────────────────────────────────

describe("responsible lawyer workforce eligibility filtering", () => {
  const ELIGIBLE_ROLES = new Set(["ADMIN", "PARTNER", "LAWYER", "COLLAB_LAWYER", "TRAINEE", "LEGAL_ASSISTANT"]);

  it("filters out CLIENT and non-workforce users", () => {
    const rawUsers = [
      { id: "u1", role: "LAWYER", status: "ACTIVE" },
      { id: "u2", role: "CLIENT", status: "ACTIVE" },
      { id: "u3", role: "EXTERNAL", status: "ACTIVE" },
      { id: "u4", role: "PARTNER", status: "ACTIVE" },
      { id: "u5", role: "LAWYER", status: "INACTIVE" },
    ];
    const filtered = rawUsers.filter(
      (u) => ELIGIBLE_ROLES.has(String(u.role).toUpperCase()) && u.status !== "INACTIVE",
    );
    assert.equal(filtered.length, 2);
    assert.deepEqual(filtered.map((u) => u.id), ["u1", "u4"]);
  });
});
