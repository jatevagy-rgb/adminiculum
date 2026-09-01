/**
 * Restored legacy "Napi munka összefoglaló" workload cards — focused tests.
 *
 * Imports the REAL production module (@/lib/dashboardWorkloadSummary) that the
 * DashboardFocused component renders from — no parallel/duplicated definitions.
 * Rendering, live counts, navigation, zero/failure states and Quick-Actions
 * preservation are additionally proven in the browser harness.
 *
 * Run: npx tsx --test tests/dashboardWorkloadCards.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  WORKLOAD_SUMMARY_CARDS,
  workloadSummaryToneClass,
  workloadSummaryPanelClass,
  workloadSummaryCaption,
  type WorkloadSummaryTone,
} from "../src/lib/dashboardWorkloadSummary";

// The exact historical definition from DashboardFocused @ a948839 (6-card grid).
const HISTORICAL = [
  { valueKey: "openCases", label: "Nyitott ügyek", emptyLabel: "Nincs ügy", href: "/cases", tone: "petrol" },
  { valueKey: "todayTasks", label: "Mai teendők", emptyLabel: "Nincs mai teendő", href: "/deadlines?view=day", tone: "amber" },
  { valueKey: "deadlines", label: "Közeli határidők", emptyLabel: "Nincs közeli határidő", href: "/deadlines", tone: "gold" },
  { valueKey: "reviews", label: "Review tételek", emptyLabel: "Nincs review tétel", href: "/reviews", tone: "navy" },
  { valueKey: "externalComms", label: "Külső kommunikáció", emptyLabel: "Nincs külső tétel", href: "/communications?view=external", tone: "terracotta" },
  { valueKey: "internalComms", label: "Belső kommunikáció", emptyLabel: "Nincs belső tétel", href: "/communications?view=internal", tone: "green" },
] as const;

describe("Legacy workload cards — exact restoration", () => {
  it("restores exactly six cards (count)", () => {
    assert.equal(WORKLOAD_SUMMARY_CARDS.length, 6);
  });

  it("restores the exact historical labels", () => {
    assert.deepEqual(
      WORKLOAD_SUMMARY_CARDS.map((c) => c.label),
      HISTORICAL.map((c) => c.label),
    );
  });

  it("preserves the exact historical ordering (label + tone in sequence)", () => {
    WORKLOAD_SUMMARY_CARDS.forEach((card, i) => {
      assert.equal(card.label, HISTORICAL[i].label, `card ${i} label`);
      assert.equal(card.tone, HISTORICAL[i].tone, `card ${i} tone`);
      assert.equal(card.valueKey, HISTORICAL[i].valueKey, `card ${i} valueKey`);
    });
  });

  it("preserves the exact navigation targets", () => {
    assert.deepEqual(
      WORKLOAD_SUMMARY_CARDS.map((c) => c.href),
      HISTORICAL.map((c) => c.href),
    );
  });

  it("preserves the exact empty labels", () => {
    assert.deepEqual(
      WORKLOAD_SUMMARY_CARDS.map((c) => c.emptyLabel),
      HISTORICAL.map((c) => c.emptyLabel),
    );
  });
});

describe("Legacy workload cards — colors/variants", () => {
  it("maps terracotta to the established --adm-terracotta-700 token", () => {
    assert.equal(workloadSummaryToneClass("terracotta"), "bg-[var(--adm-terracotta-700)] text-white");
  });

  it("maps green (dark green) to the established --adm-green-800 token", () => {
    assert.equal(workloadSummaryToneClass("green"), "bg-[var(--adm-green-800)] text-white");
  });

  it("maps the remaining historical tones to their exact colors", () => {
    assert.equal(workloadSummaryToneClass("petrol"), "bg-[#126782] text-white");
    assert.equal(workloadSummaryToneClass("amber"), "bg-[#FD9E02] text-[#3E2400]");
    assert.equal(workloadSummaryToneClass("gold"), "bg-[#FFB703] text-[#4A3300]");
    assert.equal(workloadSummaryToneClass("navy"), "bg-[#023047] text-white");
  });

  it("uses a dark inner panel only for the light amber/gold tones", () => {
    assert.match(workloadSummaryPanelClass("amber"), /bg-black/);
    assert.match(workloadSummaryPanelClass("gold"), /bg-black/);
    assert.match(workloadSummaryPanelClass("terracotta"), /bg-white/);
    assert.match(workloadSummaryPanelClass("green"), /bg-white/);
  });

  it("uses terracotta and dark green exactly once each (the user-named colors)", () => {
    const tones = WORKLOAD_SUMMARY_CARDS.map((c) => c.tone);
    assert.equal(tones.filter((t) => t === "terracotta").length, 1);
    assert.equal(tones.filter((t) => t === "green").length, 1);
  });

  it("introduces no tone outside the historical palette", () => {
    const allowed = new Set<WorkloadSummaryTone>(["petrol", "amber", "gold", "navy", "terracotta", "green"]);
    for (const card of WORKLOAD_SUMMARY_CARDS) assert.ok(allowed.has(card.tone), `unexpected tone ${card.tone}`);
  });
});

describe("Legacy workload cards — zero vs failure caption (partial-load safe)", () => {
  it("shows the successful-empty label for a real 0 count", () => {
    assert.equal(workloadSummaryCaption(0, "Nincs ügy"), "Nincs ügy");
  });

  it("shows 'Most nem elérhető' for a failed source (null), NOT a fake empty", () => {
    assert.equal(workloadSummaryCaption(null, "Nincs ügy"), "Most nem elérhető");
    assert.notEqual(workloadSummaryCaption(null, "Nincs ügy"), "Nincs ügy");
  });

  it("shows 'Aktív tétel' for a positive count", () => {
    assert.equal(workloadSummaryCaption(3, "Nincs ügy"), "Aktív tétel");
  });
});

describe("Legacy workload cards — guards against invention", () => {
  it("introduces no minute/effort estimate copy", () => {
    for (const card of WORKLOAD_SUMMARY_CARDS) {
      const text = `${card.label} ${card.emptyLabel}`.toLowerCase();
      assert.doesNotMatch(text, /perc|min\b|becsült|effort|estimate/, `card ${card.valueKey} must not invent minute estimates`);
    }
  });

  it("does not hardcode any count into the definitions (values are data-driven)", () => {
    for (const card of WORKLOAD_SUMMARY_CARDS) {
      assert.equal("value" in card, false);
      assert.doesNotMatch(card.label, /\d/, `card ${card.valueKey} label must carry no baked-in number`);
    }
  });
});
