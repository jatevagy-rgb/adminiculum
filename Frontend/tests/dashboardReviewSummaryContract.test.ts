/**
 * T02 — "Review tételek" dashboard tile semantic contract.
 *
 * COUNT + LABEL + DESTINATION must describe the same population: the eligible
 * review queue the /reviews page renders via listTaskReviewQueue() →
 * GET /tasks/review-queue.
 *
 * Guarded here:
 *  - critical fixture: 2 cases with status IN_REVIEW and 0 queue items must
 *    NOT produce a "2 review items" tile — the tile counts the queue only;
 *  - the tile must NOT derive from the case-status count (stats.inReview);
 *  - the tile must NOT use the /review|ellenőrz/i task-title heuristic;
 *  - the count is the raw queue length — no client-side re-filtering, so
 *    returned/completed/unauthorized eligibility stays server-authoritative
 *    and identical to the /reviews destination (restricted-user scope parity);
 *  - failure → null → "Most nem elérhető", never a fake 0.
 *
 * Run: npx tsx --test tests/dashboardReviewSummaryContract.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  reviewQueueSummaryCount,
  WORKLOAD_SUMMARY_CARDS,
  workloadSummaryCaption,
} from "../src/lib/dashboardWorkloadSummary";

const componentSource = fs.readFileSync(path.join(process.cwd(), "src/components/DashboardFocused.tsx"), "utf8");
const reviewsRouteSource = fs.readFileSync(path.join(process.cwd(), "src/app/reviews/page.tsx"), "utf8");

describe("review tile count — canonical queue population", () => {
  it("critical fixture: 2 IN_REVIEW cases with an empty queue show 0, never 2", () => {
    // The tile receives the queue population only; case status is not an input.
    assert.equal(reviewQueueSummaryCount([]), 0);
  });

  it("counts every eligible queue item (multiple submissions)", () => {
    assert.equal(reviewQueueSummaryCount([{ id: "s1" }, { id: "s2" }, { id: "s3" }]), 3);
  });

  it("zero eligible items → successful empty label (zero submissions)", () => {
    assert.equal(workloadSummaryCaption(reviewQueueSummaryCount([]), "Nincs review tétel"), "Nincs review tétel");
  });

  it("a failed source is null → 'Most nem elérhető', never a fake 0", () => {
    assert.equal(reviewQueueSummaryCount(null), null);
    assert.equal(reviewQueueSummaryCount(undefined), null);
    assert.equal(workloadSummaryCaption(reviewQueueSummaryCount(null), "Nincs review tétel"), "Most nem elérhető");
  });

  it("counts the raw queue length — returned/completed/ineligible stay server-side decisions", () => {
    const queue = [{ id: "submitted" }, { id: "legacy" }];
    assert.equal(reviewQueueSummaryCount(queue), queue.length);
  });
});

describe("review tile — label and destination describe the queue", () => {
  it("card keeps review-item wording and points to /reviews", () => {
    const card = WORKLOAD_SUMMARY_CARDS.find((item) => item.valueKey === "reviews");
    assert.ok(card, "reviews card definition missing");
    assert.equal(card.label, "Review tételek");
    assert.equal(card.emptyLabel, "Nincs review tétel");
    assert.equal(card.href, "/reviews");
  });

  it("/reviews renders the same queue function the dashboard counts", () => {
    assert.match(reviewsRouteSource, /listTaskReviewQueue\(\)/);
  });
});

describe("DashboardFocused source contract — old count sources removed", () => {
  it("counts the review queue and derives the tile from it", () => {
    assert.match(componentSource, /listTaskReviewQueue\(\)/);
    assert.match(componentSource, /reviewQueueSummaryCount\(reviewQueueResult\)/);
    assert.match(componentSource, /summaryReviewCount = reviewQueueCount/);
  });

  it("does not derive the review tile from the case-status count", () => {
    assert.doesNotMatch(componentSource, /inReview/);
  });

  it("does not use the task-title heuristic for the review tile", () => {
    assert.doesNotMatch(componentSource, /review\|ellenőrz/i);
    assert.doesNotMatch(componentSource, /reviewTasks/);
    assert.doesNotMatch(componentSource, /isReviewTask/);
  });
});
