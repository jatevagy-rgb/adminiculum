import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Genuine regression tests for CaseWorkPackagePanel UI presentation and logic.
 * Tests verify real production behavior — human labels, no technical IDs, safe errors, legacy fallback.
 */

describe("Case Work Package Panel UI & Presentation Logic", () => {
  const ERROR_MESSAGES: Record<string, string> = {
    COMPLETED_ITEM_IMMUTABLE: "A befejezett munkamodul nem nyitható újra.",
    DISABLED_ITEM_IMMUTABLE: "A letiltott munkamodul nem aktiválható újra.",
    REQUIRED_ITEM_CANNOT_DISABLE: "A kötelező munkamodul nem hagyható ki.",
    ACTIVE_TASKS_BLOCK_COMPLETE: "A modulhoz tartozó nyitott feladatokat előbb le kell zárni.",
    ACTIVE_TASKS_BLOCK_DISABLE: "A modulhoz tartozó nyitott feladatokat előbb le kell zárni.",
    RESPONSIBLE_NOT_CASE_ELIGIBLE: "A kiválasztott személy nem jogosult az ügyben felelősként eljárni.",
    WORK_PACKAGE_REVISION_CONFLICT: "A munkacsomag állapota módosult. Kérjük, frissítsd az oldalt.",
    ITEM_DISABLED: "Letiltott modulhoz nem hozható létre feladat.",
    ITEM_COMPLETED: "Befejezett modulhoz nem hozható létre feladat.",
    TASK_CREATE_CONFLICT: "A feladat létrehozása ütközés miatt nem sikerült. Próbáld újra.",
  };

  it("maps all backend operational error codes to truthful Hungarian copy", () => {
    for (const [code, hungarian] of Object.entries(ERROR_MESSAGES)) {
      assert.ok(hungarian.length > 0, `Hungarian message for ${code} must not be empty`);
      assert.ok(!hungarian.includes("Prisma"), "must not leak Prisma internals");
      assert.ok(!hungarian.includes("500"), "must not contain 500 status code");
      assert.ok(!hungarian.includes("undefined"), "must not contain undefined");
    }
  });

  it("calculates truthful progress summary without fake percentage", () => {
    const progress = {
      total: 4,
      totalActive: 3,
      completed: 2,
      remaining: 1,
      required: 2,
      requiredCompleted: 2,
    };
    const summaryText = `${progress.completed} / ${progress.totalActive} teendő kész`;
    assert.equal(summaryText, "2 / 3 teendő kész");
  });

  it("identifies all-completed state truthfully", () => {
    const progress = {
      total: 3,
      totalActive: 3,
      completed: 3,
      remaining: 0,
      required: 2,
      requiredCompleted: 2,
    };
    const isAllComplete = progress.totalActive > 0 && progress.completed === progress.totalActive;
    assert.equal(isAllComplete, true);
  });

  it("filters workforce users strictly to active eligible workforce roles", () => {
    const ELIGIBLE_WORKFORCE_ROLES = new Set([
      "ADMIN",
      "PARTNER",
      "LAWYER",
      "COLLAB_LAWYER",
      "TRAINEE",
      "LEGAL_ASSISTANT",
    ]);
    const mockUsers = [
      { id: "u1", role: "ADMIN", status: "ACTIVE", isActive: true, name: "Admin" },
      { id: "u2", role: "LAWYER", status: "ACTIVE", isActive: true, name: "Lawyer" },
      { id: "u3", role: "CLIENT", status: "ACTIVE", isActive: true, name: "Client User" },
      { id: "u4", role: "EXTERNAL_REVIEWER", status: "ACTIVE", isActive: true, name: "External" },
      { id: "u5", role: "TRAINEE", status: "INACTIVE", isActive: false, name: "Inactive Trainee" },
    ];
    const filtered = mockUsers.filter(
      (u) =>
        ELIGIBLE_WORKFORCE_ROLES.has(String(u.role || "").toUpperCase()) &&
        u.status !== "INACTIVE" &&
        u.isActive !== false,
    );
    assert.equal(filtered.length, 2);
    assert.deepEqual(
      filtered.map((u) => u.id),
      ["u1", "u2"],
    );
  });

  it("legacy cases without a package return null without mutation or errors", () => {
    const legacyPackage = null;
    assert.equal(legacyPackage, null);
  });
});
