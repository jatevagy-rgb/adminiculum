import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  UPCOMING_DEADLINE_LIMIT,
  deadlineDayKey,
  isUpcomingDeadline,
  localDayKey,
  selectUpcomingDeadlines,
} from "../src/lib/clientPortalUpcoming";

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const orgHome = () => read("src/components/client-portal/OrgHomeView.tsx");

// Local wall-clock 2026-09-20 00:30 on the machine running the test. This is the
// user's calendar day and must hold in every host timezone, unlike a UTC string.
const NOW = new Date(2026, 8, 20, 0, 30, 0);
// Build an instant from local wall-clock so the expectation is timezone-independent.
const local = (year: number, monthIndex: number, day: number, hour: number, minute: number) =>
  new Date(year, monthIndex, day, hour, minute, 0);
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

  it("keys date-only values literally and timestamps by their local calendar day", () => {
    // A date-only value is compared by its literal day, with no conversion at all.
    assert.equal(deadlineDayKey("2026-09-20"), "2026-09-20");
    assert.equal(localDayKey(NOW), "2026-09-20");
    // Timestamps use the local day of the instant, built from local wall-clock.
    assert.equal(deadlineDayKey(local(2026, 8, 19, 23, 30).toISOString()), "2026-09-19");
    assert.equal(deadlineDayKey(local(2026, 8, 20, 0, 15).toISOString()), "2026-09-20");
    assert.equal(deadlineDayKey(local(2026, 8, 21, 1, 0).toISOString()), "2026-09-21");
  });

  it("classifies timestamps by the local day the user sees, independent of the host timezone", () => {
    // Local 2026-09-19 23:30 is already yesterday even though it is late in the day.
    assert.equal(isUpcomingDeadline(local(2026, 8, 19, 23, 30).toISOString(), NOW), false);
    // Local 2026-09-20 00:15 is today — the local-midnight edge the UTC date missed.
    assert.equal(isUpcomingDeadline(local(2026, 8, 20, 0, 15).toISOString(), NOW), true);
    // Local 2026-09-21 01:00 is tomorrow.
    assert.equal(isUpcomingDeadline(local(2026, 8, 21, 1, 0).toISOString(), NOW), true);
  });

  it("derives today from local calendar components at the local-midnight edge", () => {
    assert.equal(isUpcomingDeadline("2026-09-19", NOW), false);
    assert.equal(isUpcomingDeadline("2026-09-20", NOW), true);
    assert.equal(isUpcomingDeadline("2026-09-21", NOW), true);
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
    assert.ok(src.includes("Nincs nyitott lépés"), "no-action bucket must read Nincs nyitott lépés");
  });

  it("labels the summary unit explicitly as compliance areas, not tasks", () => {
    const src = orgHome();
    assert.ok(
      src.includes("Az összesítő a megfelelési területek számát mutatja, nem a teendők számát."),
      "compliance summary must state it counts compliance areas, not tasks",
    );
    // The no-action bucket must not reuse task-language ("ügyfélteendő"), which
    // collides with the separate open-task list.
    assert.ok(!src.includes("ügyfélteendő"), "no-action bucket must not reuse the task unit");
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
