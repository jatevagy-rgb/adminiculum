import { describe, it, test } from "node:test";
import assert from "node:assert/strict";
import { componentHarness, flatten, textOf } from "./helpers/componentHarness";
import * as due from "../src/lib/duePresets";

const HOUR = 3_600_000;

describe("due preset helpers", () => {
  it("resolves every preset with calendar semantics (1 day = 24 hours)", () => {
    const now = new Date("2026-10-01T10:00:00");
    assert.equal(due.resolvePresetDueAt("1h", now).getTime(), now.getTime() + 1 * HOUR);
    assert.equal(due.resolvePresetDueAt("4h", now).getTime(), now.getTime() + 4 * HOUR);
    assert.equal(due.resolvePresetDueAt("8h", now).getTime(), now.getTime() + 8 * HOUR);
    assert.equal(due.resolvePresetDueAt("2d", now).getTime(), now.getTime() + 48 * HOUR);
    assert.equal(due.resolvePresetDueAt("5d", now).getTime(), now.getTime() + 120 * HOUR);
    // Calendar day: 2d spans midnight without business-day skipping.
    const evening = new Date("2026-10-01T23:00:00");
    assert.equal(due.resolvePresetDueAt("2d", evening).getTime(), evening.getTime() + 48 * HOUR);
  });

  it("a resolved preset persists: the stored moment does not drift with later clocks", () => {
    const resolved = due.resolvePresetDueAt("2d", new Date("2026-10-01T10:00:00")).toISOString();
    const oneHourLater = due.countdownFromIso(resolved, new Date("2026-10-01T11:00:00"));
    assert.ok(oneHourLater);
    // Stored due is fixed at 2026-10-03T10:00:00; at +1h the countdown is exactly 1h shorter.
    assert.equal(oneHourLater.countdown, "1 nap 23 óra múlva");
  });

  it("an expired countdown never resets — later reads only grow the elapsed label", () => {
    const dueAt = new Date("2026-10-01T10:00:00");
    const t1 = due.formatDueCountdown(dueAt, new Date("2026-10-01T11:00:00"));
    const t2 = due.formatDueCountdown(dueAt, new Date("2026-10-02T11:00:00"));
    assert.equal(t1.expired, true);
    assert.equal(t2.expired, true);
    assert.match(t1.countdown, /^lejárt/);
    assert.match(t2.countdown, /^lejárt/);
    assert.notEqual(t1.countdown, t2.countdown);
    // Never a future-looking label after expiry.
    assert.doesNotMatch(t2.countdown, /múlva/);
  });

  it("custom absolute date remains a secondary option", () => {
    const custom = due.resolveCustomDueAt("2027-05-05", "14:30");
    assert.ok(custom);
    assert.equal(custom.getHours(), 14);
    assert.equal(custom.getMinutes(), 30);
    assert.equal(due.resolveCustomDueAt("", "10:00"), null);
  });

  it("isDuePresetKey accepts only the five canonical presets", () => {
    for (const key of ["1h", "4h", "8h", "2d", "5d"]) assert.ok(due.isDuePresetKey(key));
    assert.equal(due.isDuePresetKey("3h"), false);
    assert.equal(due.isDuePresetKey(null), false);
  });
});

describe("DueDatePresetPicker interaction", () => {
  const h = componentHarness("src/components/cases/intake/DueDatePresetPicker.tsx", "DueDatePresetPicker", {
    "@/lib/duePresets": due,
  });

  test("clicking a preset chip resolves once and shows a live countdown", () => {
    const selections: any[] = [];
    let value = { presetKey: null, customDate: "", customTime: "", resolvedIso: null };
    const render = () => h.render({ value, onChange: (next: any) => selections.push(next), idPrefix: "t" });
    let tree = render();
    const chip = flatten(tree).find((n: any) => n.type === "button" && textOf(n) === "1 óra");
    assert.ok(chip, "1 óra chip exists");
    chip.props.onClick();
    assert.equal(selections.length, 1);
    assert.equal(selections[0].presetKey, "1h");
    assert.ok(selections[0].resolvedIso, "resolved exactly once at selection time");
    // The resolved moment is ~1 hour from now.
    const delta = new Date(selections[0].resolvedIso).getTime() - Date.now();
    assert.ok(delta > HOUR - 5_000 && delta <= HOUR + 5_000, `delta ${delta}`);
    value = selections[0];
    tree = render();
    assert.match(textOf(tree), /múlva/);
    const pressed = flatten(tree).find((n: any) => n.type === "button" && textOf(n) === "1 óra");
    assert.equal(pressed.props["aria-pressed"], true);
  });

  test("custom date toggle opens date/time inputs and resolves them", () => {
    const selections: any[] = [];
    const value = { presetKey: null, customDate: "", customTime: "", resolvedIso: null };
    let tree = h.render({ value, onChange: (next: any) => selections.push(next), idPrefix: "t" });
    flatten(tree).find((n: any) => n.type === "button" && textOf(n) === "Egyedi dátum").props.onClick();
    tree = h.render({ value, onChange: (next: any) => selections.push(next), idPrefix: "t" });
    const dateInput = flatten(tree).find((n: any) => n.type === "input" && n.props["data-testid"] === "due-custom-date");
    assert.ok(dateInput, "custom date input appears");
    dateInput.props.onChange({ target: { value: "2027-05-05" } });
    assert.equal(selections.length, 1);
    assert.equal(selections[0].presetKey, null);
    assert.match(String(selections[0].resolvedIso), /^2027-05-05/);
  });

  test("deadlineMode error is surfaced and clear resets the selection", () => {
    const selections: any[] = [];
    const value = { presetKey: "2d", customDate: "", customTime: "", resolvedIso: "2030-01-01T10:00:00.000Z" };
    let tree = h.render({ value, onChange: (next: any) => selections.push(next), idPrefix: "t", error: "A feladathatáridő megadása kötelező." });
    assert.ok(flatten(tree).some((n: any) => n.props?.["data-testid"] === "due-error"));
    flatten(tree).find((n: any) => n.type === "button" && textOf(n) === "Nincs határidő").props.onClick();
    assert.equal(selections.length, 1);
    assert.deepEqual({ ...selections[0] }, { presetKey: null, customDate: "", customTime: "", resolvedIso: null });
  });
});
