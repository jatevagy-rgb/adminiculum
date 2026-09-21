import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (file: string) => {
  const fromCwd = path.resolve(process.cwd(), file);
  if (existsSync(fromCwd)) return readFileSync(fromCwd, "utf8");
  const fromFrontend = path.resolve(process.cwd(), "Frontend", file);
  if (existsSync(fromFrontend)) return readFileSync(fromFrontend, "utf8");
  return readFileSync(path.resolve(__dirname, "..", file), "utf8");
};

const handoffPanel = () => read("src/components/handoff/HandoffPackagePanel.tsx");
const apiSource = () => read("src/lib/api.ts");

test("Lawyer review decisions are wired to the existing review endpoint", () => {
  const src = handoffPanel();
  assert.match(src, /reviewHandoffPackage/);
  assert.match(src, /handleReviewDecision/);
  assert.match(src, /"APPROVED"/);
  assert.match(src, /"REJECTED_NEEDS_REVISION"/);
  assert.match(src, /"REJECTED_BLOCKING"/);
});

test("Decision actions are only offered for SUBMITTED and IN_REVIEW packages", () => {
  const src = handoffPanel();
  assert.match(src, /isReviewableStatus/);
  assert.match(src, /status === "SUBMITTED" \|\| status === "IN_REVIEW"/);
  assert.match(src, /const underReview = isReviewableStatus\(pkg\.status\)/);
});

test("Returning a handoff requires a reviewer comment, approval does not", () => {
  const src = handoffPanel();
  assert.match(src, /decision !== "APPROVED" && !comment/);
  assert.match(src, /Visszaküldéshez reviewer megjegyzés szükséges\./);
  assert.match(src, /disabled=\{isReviewSubmitting \|\| !reviewCommentDraft\.trim\(\)\}/);
  assert.match(src, /reviewComment: comment \|\| undefined/);
});

test("Reviewer gate mirrors backend self-review and role restrictions", () => {
  const src = handoffPanel();
  assert.match(src, /REVIEW_PRIVILEGED_ROLES = new Set\(\["ADMIN", "PARTNER"\]\)/);
  assert.match(src, /REVIEWER_ROLES = new Set\(\["LAWYER", "COLLAB_LAWYER"\]\)/);
  assert.match(src, /preparedById === currentUserId/);
  assert.match(src, /assignedLawyerId === currentUserId && REVIEWER_ROLES\.has\(role\)/);
  assert.match(src, /A saját Leadásod nem hagyhatod jóvá és nem küldheted vissza\./);
});

test("Persisted decision state is surfaced after the lawyer decides", () => {
  const src = handoffPanel();
  assert.match(src, /REVIEW_DECISION_LABELS/);
  assert.match(src, /pkg\.reviewDecision/);
  assert.match(src, /pkg\.reviewComment/);
  assert.match(src, /pkg\.reviewedAt/);
});

test("No auto-approval or automatic decision is performed", () => {
  const src = handoffPanel();
  const callSites = src.match(/await reviewHandoffPackage\(/g);
  assert.equal(callSites?.length, 1, "reviewHandoffPackage must have exactly one explicit call site");
  assert.match(src, /onClick=\{\(\) => handleReviewDecision\(pkg, "APPROVED"\)\}/);
  assert.match(src, /onClick=\{\(\) => handleReviewDecision\(pkg, "REJECTED_NEEDS_REVISION"\)\}/);
  assert.match(src, /onClick=\{\(\) => handleReviewDecision\(pkg, "REJECTED_BLOCKING"\)\}/);
});

test("Existing preparation, submit and archive behaviour stays intact", () => {
  const src = handoffPanel();
  assert.match(src, /createCaseHandoffPackage/);
  assert.match(src, /updateHandoffPackage\(pkgId, \{ preparerSummary: summaryDraft \}\)/);
  assert.match(src, /updateHandoffPackage\(pkgId, \{ status: "SUBMITTED" \}\)/);
  assert.match(src, /archiveHandoffPackage\(pkg\.id\)/);
  assert.match(src, /Beküldés ügyvédi review-ra/);
});

test("Existing review API wrapper contract is unchanged", () => {
  const api = apiSource();
  assert.match(api, /export async function reviewHandoffPackage\(/);
  assert.match(api, /`\/handoff-packages\/\$\{encodeURIComponent\(id\)\}\/review`/);
  assert.match(api, /decision: LawyerHandoffDecision;/);
});
