import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ATTENTION_CATEGORY_ORDER,
  ATTENTION_PRESENTATIONS,
  attentionPresentation,
  formatEstimateRange,
  UNCLASSIFIED_LABEL,
} from "../src/lib/attentionCategory";
import { ATTENTION_LABELS } from "../src/lib/taskWorkflowPresentation";

describe("attention-category frontend presentation mapping", () => {
  it("has the exact canonical order", () => {
    assert.deepEqual([...ATTENTION_CATEGORY_ORDER], ["QUICK_SCAN", "APPROVAL", "SIGNATURE", "EDITING", "DETAILED_REVIEW"]);
  });

  it("maps every category to a complete presentation (label/mark/tone/accessible)", () => {
    assert.equal(ATTENTION_PRESENTATIONS.length, 5);
    for (const p of ATTENTION_PRESENTATIONS) {
      assert.ok(p.label && p.label.length > 0, `label for ${p.value}`);
      assert.ok(p.mark && p.mark.length > 0, `mark for ${p.value}`);
      assert.ok(["gold", "sage", "violet", "blue", "burgundy"].includes(p.tone), `tone for ${p.value}`);
      assert.ok(p.accessibleLabel.includes(p.label), `accessible label for ${p.value}`);
    }
  });

  it("labels come from the single shared source (taskWorkflowPresentation)", () => {
    for (const value of ATTENTION_CATEGORY_ORDER) {
      assert.equal(attentionPresentation(value).label, ATTENTION_LABELS[value]);
    }
    assert.equal(attentionPresentation("DETAILED_REVIEW").label, "Részletes ellenőrzés");
    assert.equal(attentionPresentation("SIGNATURE").label, "Aláírás");
  });

  it("exposes an explicit unclassified label", () => {
    assert.equal(UNCLASSIFIED_LABEL, "Nincs besorolva");
  });
});

describe("estimate range formatting (presentation only)", () => {
  it("formats under one hour as perc", () => {
    assert.equal(formatEstimateRange(25, 50), "kb. 25–50 perc");
  });
  it("formats one hour and above as óra", () => {
    assert.equal(formatEstimateRange(60, 120), "kb. 1–2 óra");
    assert.equal(formatEstimateRange(180, 360), "kb. 3–6 óra");
  });
  it("formats a mixed range", () => {
    assert.equal(formatEstimateRange(45, 120), "kb. 45 perc–2 óra");
  });
  it("collapses an equal range to a single value", () => {
    assert.equal(formatEstimateRange(50, 50), "kb. 50 perc");
    assert.equal(formatEstimateRange(120, 120), "kb. 2 óra");
  });
  it("uses a Hungarian decimal comma and one decimal for fractional hours", () => {
    assert.equal(formatEstimateRange(90, 90), "kb. 1,5 óra");
    assert.equal(formatEstimateRange(90, 150), "kb. 1,5–2,5 óra");
  });
  it("returns empty string for a zero/empty range (count-only rendering)", () => {
    assert.equal(formatEstimateRange(0, 0), "");
  });
});
