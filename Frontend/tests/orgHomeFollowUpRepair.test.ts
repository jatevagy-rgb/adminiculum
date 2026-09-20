import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  UPCOMING_DEADLINE_LIMIT,
  deadlineDayKey,
  isUpcomingDeadline,
  selectUpcomingDeadlines,
} from "../src/lib/clientPortalUpcoming";

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const orgHome = () => read("src/components/client-portal/OrgHomeView.tsx");

const NOW = new Date("2026-09-20T00:00:00.000Z");
const row = (dueAt: string | null) => ({ dueAt, id: `row-${dueAt}` });
const days = (rows: Array<{ dueAt: string | null }>) => rows.map((r) => deadlineDayKey(r.dueAt));

describe("Közelgő határidők is future-only", () => {
  const input = [
    row("2026-07-10"),
    row("2026-09-19"),
    row("2026-09-20"),
    row("2026-09-25"),
    row("2026-10-04"),
  ];

  it("keeps today and the future, drops every past date", () => {
    const selected = selectUpcomingDeadlines(input, NOW);
    assert.deepEqual(days(selected), ["2026-09-20", "2026-09-25", "2026-10-04"]);
  });

  it("excludes a past date and yesterday explicitly", () => {
    assert.equal(isUpcomingDeadline("2026-07-10", NOW), false);
    assert.equal(isUpcomingDeadline("2026-09-19", NOW), false);
  });

  it("includes today and future dates", () => {
    assert.equal(isUpcomingDeadline("2026-09-20", NOW), true);
    assert.equal(isUpcomingDeadline("2026-09-25", NOW), true);
    assert.equal(isUpcomingDeadline("2026-10-04", NOW), true);
  });

  it("orders ascending and caps the list", () => {
    const many = [
      row("2026-12-01"),
      row("2026-09-25"),
      row("2026-10-04"),
      row("2026-09-20"),
      row("2026-11-11"),
    ];
    const selected = selectUpcomingDeadlines(many, NOW);
    assert.deepEqual(days(selected), ["2026-09-20", "2026-09-25", "2026-10-04"]);
    assert.equal(selected.length, UPCOMING_DEADLINE_LIMIT);
  });

  it("never turns a same-day timestamp into a past date through timezone conversion", () => {
    // Same UTC calendar day as NOW must stay upcoming even late in the day.
    assert.equal(isUpcomingDeadline("2026-09-20T23:59:59.000Z", NOW), true);
    // The previous UTC calendar day must stay excluded even late in the day.
    assert.equal(isUpcomingDeadline("2026-09-19T23:59:59.000Z", NOW), false);
    // A date-only value is compared by its literal day, with no conversion at all.
    assert.equal(deadlineDayKey("2026-09-20"), "2026-09-20");
  });

  it("ignores unusable values and keeps equal-day input order stable", () => {
    const selected = selectUpcomingDeadlines(
      [row(null), row("not-a-date"), row("2026-10-01"), row("2026-10-01"), row("2026-09-19")],
      NOW,
    );
    assert.deepEqual(days(selected), ["2026-10-01", "2026-10-01"]);
    assert.deepEqual(selected.map((r) => r.id), ["row-2026-10-01", "row-2026-10-01"]);
  });
});

describe("OrgHomeView deadline block uses the future-only selector", () => {
  it("filters the deadline block through the shared selector", () => {
    const src = orgHome();
    assert.match(src, /import \{ selectUpcomingDeadlines \} from "@\/lib\/clientPortalUpcoming"/);
    assert.match(src, /selectUpcomingDeadlines\(\[\.\.\.fromMatters, \.\.\.fromActions\], new Date\(\)\)/);
  });

  it("keeps past customer actions on their canonical attention surface", () => {
    const src = orgHome();
    // The attention list is not date-filtered: an overdue action keeps its row.
    assert.match(src, /const actionNow = useMemo\(\(\) => \(home\?\.actions \|\| \[\]\)\.slice\(0, 4\), \[home\]\)/);
    assert.doesNotMatch(src, /actionNow[\s\S]{0,200}isUpcomingDeadline/);
  });
});

describe("Organization home compliance summary labels match the next-actor meaning", () => {
  it("names the three buckets by their immediate next actor", () => {
    const src = orgHome();
    assert.ok(src.includes("Öntől szükséges"), "attention must read Öntől szükséges");
    assert.ok(src.includes("Irodánál van"), "office bucket must read Irodánál van");
    assert.ok(src.includes("Jelenleg nincs ügyfélteendő"), "no-action bucket must read Jelenleg nincs ügyfélteendő");
  });

  it("does not keep the stale office/attention wording and does not overload Állapot", () => {
    const src = orgHome();
    assert.ok(!src.includes("Teendőt igényel"), "stale attention wording must be gone");
    assert.ok(!src.includes("Folyamatban lévő intézkedés"), "stale office wording must be gone");
    assert.ok(!src.includes("Jelenleg nincs Öntől várt teendő"), "stale no-action wording must be gone");
    // A single concept keeps a single name.
    assert.equal((src.match(/Állapot/g) || []).length, 0);
  });
});
