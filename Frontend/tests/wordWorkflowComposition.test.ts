import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { caseContextTiles, deadlineRemaining } from "../src/components/cases/word-workflow/layout/CaseContextTiles";
import { prepareExactVersionSubmission, submissionEntryApi } from "../src/components/cases/word-workflow/layout/submissionEntry";
import type { CaseWorkspace } from "../src/lib/api";
import type { TaskSubmissionWorkflow } from "../src/lib/taskLifecycleApi";

test("canonical context keeps stable identities across placements and truthful missing values", () => {
  const c = { id: "case-1", status: "ACTIVE", description: "Legacy subject", startingContext: {} } as CaseWorkspace["case"];
  const tiles = caseContextTiles(c);
  assert.equal(tiles[1].body, "Legacy subject");
  assert.match(tiles[2].body, /még nincs rögzítve/);
  assert.deepEqual(tiles.map(t => t.placements), Array(3).fill(["overview", "document"]));
  c.startingContext.clientExpectation = "A szerződés módosítása";
  const next = caseContextTiles(c);
  assert.equal(next[2].body, c.startingContext.clientExpectation);
  assert.deepEqual(next.map(t => t.id), tiles.map(t => t.id));
});

test("countdown is calculated from the saved instant, including reload and overdue cases", () => {
  const due = "2026-10-01T12:00:00Z";
  assert.equal(deadlineRemaining(due, Date.parse("2026-10-01T11:00:00Z")), "1 óra 0 perc van hátra");
  assert.equal(deadlineRemaining(due, Date.parse("2026-10-01T11:30:00Z")), "30 perc van hátra");
  assert.equal(deadlineRemaining(due, Date.parse("2026-10-01T12:30:00Z")), "30 perc késés");
  assert.match(deadlineRemaining("invalid", 0), /nem értelmezhető/);
});

const identity = { caseId: "case-1", taskId: "chosen-task", documentId: "doc-1", versionId: "historical-v1" };
function fixture(options: { readOnly?: boolean; noDraft?: boolean; existingVersion?: string; wrongCase?: boolean; failure?: boolean } = {}) {
  const calls: unknown[][] = [];
  const workflow = {
    task: { id: identity.taskId, caseId: options.wrongCase ? "other-case" : identity.caseId },
    activeDraft: options.noDraft ? null : { id: "draft-1", documents: options.existingVersion ? [{ documentId: identity.documentId, documentVersionId: options.existingVersion }] : [] },
    permittedActions: { createDraft: !options.readOnly, attachDocument: !options.readOnly },
  } as TaskSubmissionWorkflow;
  const api: typeof submissionEntryApi = {
    read: async () => workflow,
    create: async (...args) => { calls.push(["create", ...args]); workflow.activeDraft = { id: "new-draft", documents: [] } as unknown as NonNullable<TaskSubmissionWorkflow["activeDraft"]>; return workflow; },
    attach: async (...args) => { calls.push(["attach", ...args]); if (options.failure) throw new Error("save rejected"); return workflow; },
  };
  return { api, calls, workflow };
}

test("Leadás carries the explicitly chosen task and historical version without substituting current", async () => {
  const f = fixture(); await prepareExactVersionSubmission(identity, f.api);
  assert.deepEqual(f.calls, [["attach", "chosen-task", "draft-1", "doc-1", "PRIMARY_OUTPUT", "historical-v1"]]);
});
test("read-only and wrong-case workflows cause no writes", async () => {
  for (const options of [{ readOnly: true }, { readOnly: true, noDraft: true }, { wrongCase: true }]) {
    const f = fixture(options); await assert.rejects(prepareExactVersionSubmission(identity, f.api)); assert.deepEqual(f.calls, []);
  }
});
test("an existing different version is never silently replaced; same version is idempotent", async () => {
  const other = fixture({ existingVersion: "current-v2" });
  await assert.rejects(prepareExactVersionSubmission(identity, other.api), /másik verzió/);
  assert.deepEqual(other.calls, []);
  const same = fixture({ existingVersion: identity.versionId });
  await prepareExactVersionSubmission(identity, same.api); assert.deepEqual(same.calls, []);
});
test("permitted draft creation uses canonical flow; attachment failure is not reported as success", async () => {
  const f = fixture({ noDraft: true, failure: true });
  await assert.rejects(prepareExactVersionSubmission(identity, f.api), /save rejected/);
  assert.deepEqual(f.calls[0], ["create", "chosen-task"]);
  assert.equal(f.workflow.activeDraft?.id, "new-draft");
});
test("real hosts mount composition and preserve adjacent actions and exact version identity", () => {
  const overview = readFileSync("src/components/cases/CaseWorkspaceOverview.tsx", "utf8");
  const ordered = ['<CaseContextTiles', 'title="Aktív munka"', 'id="ck-comms"', '<CaseWorkspaceDocumentsSection', 'id="ck-prompts"', '<DocumentPreparationDashboard', 'aria-label="Ügytörténet"'];
  const positions = ordered.map(marker => overview.indexOf(marker));
  assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])));
  for (const marker of ["CaseTimeBillingSummary", "HourlyRateCard", "CaseSubmissionHandoff", "CaseCommentModal", "DocumentUploadModal", "CaseWorkPackagePanel"]) assert.ok(overview.includes(marker));
  assert.doesNotMatch(overview, /label="Aktív dokumentumok"|cp.nextStep \? "Kijelölve"/);
  const document = readFileSync("src/app/cases/[caseId]/documents/page.tsx", "utf8");
  assert.match(document, /<WordDocumentWorkspaceHeader[\s\S]*?versionId=\{canonicalActiveVersion\?\.id \?\? null\}/);
  assert.ok(document.indexOf("<WordDocumentWorkspaceHeader") < document.indexOf('data-testid="canonical-top-region"'));
});
