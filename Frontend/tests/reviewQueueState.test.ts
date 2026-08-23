import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "../src/lib/api";
import { REVIEW_QUEUE_COPY, deriveReviewQueueView, reviewQueueCountLabel } from "../src/lib/reviewQueueState";

describe("deriveReviewQueueView", () => {
  it("loading → dedicated loading state, never an empty claim", () => {
    const view = deriveReviewQueueView({ status: "loading", totalCount: 0, filteredCount: 0 });
    assert.equal(view.kind, "loading");
    assert.equal(view.kind === "loading" ? view.title : "", REVIEW_QUEUE_COPY.loading);
  });

  it("successful empty → calm empty state", () => {
    const view = deriveReviewQueueView({ status: "ready", totalCount: 0, filteredCount: 0 });
    assert.equal(view.kind, "empty");
    assert.equal(view.kind === "empty" ? view.title : "", REVIEW_QUEUE_COPY.emptyTitle);
  });

  it("successful populated → list stays rendered", () => {
    assert.equal(deriveReviewQueueView({ status: "ready", totalCount: 4, filteredCount: 4 }).kind, "populated");
  });

  it("populated but filtered out → no-match state, not an empty queue", () => {
    const view = deriveReviewQueueView({ status: "ready", totalCount: 4, filteredCount: 0 });
    assert.equal(view.kind, "no-match");
    assert.equal(view.kind === "no-match" ? view.title : "", REVIEW_QUEUE_COPY.noMatchTitle);
  });

  it("failed load → unavailable state, never 'no review items'", () => {
    const view = deriveReviewQueueView({ status: "failed", totalCount: 0, filteredCount: 0, error: new Error("boom") });
    assert.equal(view.kind, "unavailable");
    assert.equal(view.kind === "unavailable" ? view.title : "", REVIEW_QUEUE_COPY.unavailableTitle);
    assert.notEqual(view.kind, "empty");
  });

  it("failed load wins over any stale counts", () => {
    assert.equal(deriveReviewQueueView({ status: "failed", totalCount: 7, filteredCount: 7 }).kind, "unavailable");
  });

  it("raw error content is never part of the shown copy", () => {
    const raw = "Request failed: GET https://api.internal/api/v1/tasks/review-queue 500 token=abc123 at Object.fetchApi";
    const errors: unknown[] = [
      new Error(raw),
      new ApiError(500, raw, "https://api.internal/api/v1/tasks/review-queue", "INTERNAL"),
      { message: raw, stack: raw },
      raw,
    ];
    for (const error of errors) {
      const view = deriveReviewQueueView({ status: "failed", totalCount: 0, filteredCount: 0, error });
      const rendered = JSON.stringify(view);
      for (const leak of ["Request failed", "https://", "api/v1", "token=", "abc123", "submission-42", "fetchApi", "500"]) {
        assert.ok(!rendered.includes(leak), `leaked "${leak}" into review queue copy: ${rendered}`);
      }
    }
  });
});

describe("reviewQueueCountLabel", () => {
  it("shows counts only for a successful load", () => {
    assert.equal(reviewQueueCountLabel("ready", 3), "3");
    assert.equal(reviewQueueCountLabel("ready", 0), "0");
    assert.equal(reviewQueueCountLabel("loading", 0), REVIEW_QUEUE_COPY.unknownCount);
    assert.equal(reviewQueueCountLabel("failed", 0), REVIEW_QUEUE_COPY.unknownCount);
  });
});
