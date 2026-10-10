import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { selectTaskDocumentSections } from "../src/lib/taskDocumentPresentation";
import type { TaskDocumentsResponse } from "../src/lib/api";
import type { TaskSubmissionWorkflow } from "../src/lib/taskLifecycleApi";

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
const linkedDocument: TaskDocumentsResponse["documents"][number] = {
  linkId: "link-1", note: null, linkedAt: null, id: "linked-doc", title: "Általános kapcsolat",
  fileName: "linked.docx", workStatus: "IN_PROGRESS", documentRole: null, dueDate: null,
  currentVersion: 8, responsible: null, reviewer: null,
};
const submission = (documentVersionId: string | null, linkedVersion: number | null, currentVersion = 9) => ({
  id: `submission-${documentVersionId || "missing"}`, taskId: "task-1", revisionNumber: 2,
  submittedAt: "2026-10-10T08:00:00.000Z",
  documents: [{
    id: "submission-doc-link", documentId: "submitted-doc", documentVersionId, role: "OUTPUT",
    createdAt: "2026-10-10T07:00:00.000Z", linkedVersion, isCurrentVersion: false,
    document: { id: "submitted-doc", name: "Leadott eredmény.docx", category: "OTHER", currentVersion },
  }],
});
const workflow = (...submissions: Array<ReturnType<typeof submission>>) => ({ submissions }) as Pick<TaskSubmissionWorkflow, "submissions">;

describe("F07 canonical task document sections", () => {
  it("shows a DocumentTaskLink without requiring a submission link", () => {
    const sections = selectTaskDocumentSections([linkedDocument], null);
    assert.deepEqual(sections.linkedDocuments.map((item) => item.id), ["linked-doc"]);
    assert.deepEqual(sections.submittedOutputs, []);
  });

  it("shows a TaskSubmissionDocument without inferring a general link", () => {
    const sections = selectTaskDocumentSections([], workflow(submission("version-4", 4)));
    assert.deepEqual(sections.linkedDocuments, []);
    assert.equal(sections.submittedOutputs[0].document.documentVersionId, "version-4");
  });

  it("keeps both relationship kinds separate when both exist", () => {
    const sections = selectTaskDocumentSections([linkedDocument], workflow(submission("version-4", 4)));
    assert.deepEqual(sections.linkedDocuments.map((item) => item.id), ["linked-doc"]);
    assert.deepEqual(sections.submittedOutputs.map(({ document }) => document.documentId), ["submitted-doc"]);
  });

  it("preserves empty sections when there is no relationship", () => {
    assert.deepEqual(selectTaskDocumentSections([], null), { linkedDocuments: [], submittedOutputs: [] });
  });

  it("does not treat legacy Task.documentId context as a canonical relationship", () => {
    const legacyTask = { id: "task-1", documentId: "legacy-doc" };
    const sections = selectTaskDocumentSections([], null);
    assert.equal(legacyTask.documentId, "legacy-doc");
    assert.deepEqual(sections, { linkedDocuments: [], submittedOutputs: [] });
  });

  it("retains the exact historical version even when a newer current version exists", () => {
    const output = selectTaskDocumentSections([], workflow(submission("historical-version-4", 4, 9))).submittedOutputs[0].document;
    assert.equal(output.documentVersionId, "historical-version-4");
    assert.equal(output.linkedVersion, 4);
    assert.equal(output.document.currentVersion, 9);
  });

  it("uses the required message for historical submissions without a pinned version", () => {
    const overview = read("src/components/cases/CaseWorkspaceOverview.tsx");
    assert.match(overview, /A leadott verzió nincs rögzítve\./);
    assert.match(overview, /versionId=\$\{encodeURIComponent\(document\.documentVersionId\)\}/);
    assert.match(overview, /getTaskDocuments\(taskId\)/);
    assert.match(overview, /readTaskSubmissionWorkflow\(taskId\)/);
    assert.match(overview, /sm:grid-cols-2/);
  });
});
