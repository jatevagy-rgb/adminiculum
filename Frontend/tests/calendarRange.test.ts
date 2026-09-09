import assert from "node:assert/strict";
import test from "node:test";
import { dateKey, parseKey, rangeForView, stepAnchor } from "../src/lib/calendarRange";

test("month stepping lands in the immediately adjacent month, clamped to its last day", () => {
  // Jan 31 +1 -> February (non-leap): clamps, never skips to March.
  assert.equal(dateKey(stepAnchor("month", new Date(2026, 0, 31), 1)), "2026-02-28");
  // Mar 31 -1 -> February, not March-overflow arithmetic.
  assert.equal(dateKey(stepAnchor("month", new Date(2026, 2, 31), -1)), "2026-02-28");
  // Leap year: Jan 31 2024 +1 -> Feb 29.
  assert.equal(dateKey(stepAnchor("month", new Date(2024, 0, 31), 1)), "2024-02-29");
  // May 31 +1 -> Jun 30 (June has 30 days).
  assert.equal(dateKey(stepAnchor("month", new Date(2026, 4, 31), 1)), "2026-06-30");
  // Ordinary days pass through untouched.
  assert.equal(dateKey(stepAnchor("month", new Date(2026, 4, 15), 1)), "2026-06-15");
  assert.equal(dateKey(stepAnchor("month", new Date(2026, 4, 15), -1)), "2026-04-15");
  // Year boundary without clamping issues.
  assert.equal(dateKey(stepAnchor("month", new Date(2026, 11, 31), 1)), "2027-01-31");
  assert.equal(dateKey(stepAnchor("month", new Date(2026, 0, 1), -1)), "2025-12-01");
});

test("year and five-year stepping clamp Feb 29 in non-leap targets", () => {
  assert.equal(dateKey(stepAnchor("year", new Date(2024, 1, 29), 1)), "2025-02-28");
  assert.equal(dateKey(stepAnchor("year", new Date(2024, 1, 29), -1)), "2023-02-28");
  assert.equal(dateKey(stepAnchor("five-year", new Date(2024, 1, 29), 1)), "2029-02-28");
  // Five-year still spans exactly five calendar years on normal days.
  assert.equal(dateKey(stepAnchor("five-year", new Date(2026, 8, 9), 1)), "2031-09-09");
});

test("day stepping keeps correct rollover across month boundaries", () => {
  assert.equal(dateKey(stepAnchor("day", new Date(2026, 0, 31), 1)), "2026-02-01");
  assert.equal(dateKey(stepAnchor("day", new Date(2026, 2, 1), -1)), "2026-02-28");
});

test("rangeForView emits day/month/year/five-year windows unchanged", () => {
  assert.deepEqual(rangeForView("day", new Date(2026, 8, 9)), { from: "2026-09-09", to: "2026-09-09" });
  assert.deepEqual(rangeForView("month", new Date(2026, 1, 15)), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(rangeForView("year", new Date(2026, 5, 1)), { from: "2026-01-01", to: "2026-12-31" });
  assert.deepEqual(rangeForView("five-year", new Date(2026, 5, 1)), { from: "2026-01-01", to: "2030-12-31" });
});

test("parseKey/dateKey round-trip and reject malformed input", () => {
  assert.equal(dateKey(parseKey("2026-09-09") as Date), "2026-09-09");
  assert.equal(parseKey("not-a-date"), null);
  assert.equal(parseKey(""), null);
  assert.equal(parseKey("2026-9-9"), null);
});
