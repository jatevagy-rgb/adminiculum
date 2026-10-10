import type { TaskSubmissionReviewDetail, TaskSubmissionWorkflow } from "../../src/lib/taskLifecycleApi";

export function reviewFixture(): TaskSubmissionReviewDetail {
  return {
    reviewVersion: "review-etag-1",
    task: { id: "task-1", title: "Szerződés döntési ellenőrzése", status: "IN_REVIEW", priority: "HIGH", deadline: null, assignee: { id: "worker", displayName: "Beküldő", role: "TRAINEE" } },
    matter: { id: "matter-1", displayName: "Szerződésvizsgálat" },
    case: { id: "case-1", caseNumber: "TESZT/001", displayName: "Kizárólag tesztügy" },
    client: { id: "client-1", displayName: "Kizárólag tesztügyfél" },
    submission: { id: "submission-1", revisionNumber: 2, status: "SUBMITTED", submittedBy: { id: "worker", displayName: "Beküldő", role: "TRAINEE" }, submittedAt: "2026-10-08T10:00:00Z", assignedReviewer: { id: "reviewer", displayName: "Kijelölt ügyvéd", role: "LAWYER" }, requestedAttention: "DETAILED_REVIEW", attentionEstimate: { minMinutes: 30, maxMinutes: 60 }, externalActionRequired: false, externalActionType: null, externalCompletedAt: null, workSummary: "A módosított szerződés ellenőrzésre vár.", remainingIssues: "A felmondási feltétel szakmai döntést igényel.", zeroTimeConfirmed: false },
    outputs: [
      { id: "output-1", documentId: "document-1", documentVersionId: "version-2", role: "OUTPUT", name: "Módosított szerződés", category: "CONTRACT", currentVersion: 3, linkedVersion: 2, isCurrentVersion: false, newerVersionExists: true },
      { id: "output-legacy", documentId: "document-legacy", documentVersionId: null, role: "OUTPUT", name: "Korábbi verzióazonosító nélküli eredmény", category: "OTHER", currentVersion: 6, linkedVersion: null, isCurrentVersion: false, newerVersionExists: false },
    ],
    documentReviews: [{ documentId: "document-1", documentVersionId: "version-2", reviews: [{ id: "document-review-1", status: "IN_REVIEW", currentRoundNumber: 2, documentVersionId: "version-2", approvedVersionId: null, reviewer: { id: "reviewer", displayName: "Kijelölt ügyvéd", role: "LAWYER" }, rounds: [{ id: "round-2", roundNumber: 2, reviewVersionId: "version-2", status: "OPEN" }], counts: { open: 2, blocking: 1, total: 3 }, lastDecision: null, reviewLink: "/cases/case-1/documents?documentId=document-1&versionId=version-2&mode=review" }] }],
    time: { entries: [], totalMinutes: 0, billableMinutes: 0, nonBillableMinutes: 0 },
    history: [{ id: "submission-1", revisionNumber: 2, status: "SUBMITTED", submittedAt: "2026-10-08T10:00:00Z", returnedAt: null, approvedAt: null, supersedesSubmissionId: null, outputs: [{ documentId: "document-1", documentVersionId: "version-2", linkedVersion: 2 }], decision: null }],
    decision: null,
    permittedActions: { read: true, return: true, approve: true, revise: false, recordExternalCompletion: false },
    nextActionCode: "REVIEW_SUBMISSION",
  };
}

export function workflowFixture(): TaskSubmissionWorkflow {
  return { task: { id: "task-1", title: "Szerződés döntési ellenőrzése", description: "Ellenőrizze a szerződés felmondási feltételét.", status: "IN_REVIEW", priority: "HIGH", dueDate: null, caseId: "case-1", matterId: "matter-1", assignee: null, case: { id: "case-1", caseNumber: "TESZT/001", title: "Teszt", client: { id: "client-1", name: "Teszt" } } }, activeDraft: null, submissions: [], latestSubmittedRevision: null, latestDecision: null, currentReviewer: null, responsibleLawyerFlow: true, responsibleLawyer: null, readiness: null, permittedActions: { read: true, createDraft: false, editDraft: false, attachDocument: false, attachTimeEntry: false, assignReviewer: false, submit: false, reviewSubmitted: true, reviseReturned: false, recordExternalCompletion: false }, nextActionCode: "REVIEW_SUBMISSION" };
}

export function longNoteFixture() {
  const review = reviewFixture();
  const workflow = workflowFixture();
  const note = "Hosszú leadási megjegyzés: a szerződés részletes ellenőrzése és a kapcsolódó döntési szempontok.\n".repeat(40);
  review.submission.workSummary = note;
  workflow.task.description = note;
  workflow.submissions = [{
    ...review.submission, taskId: review.task.id, createdBy: review.submission.assignedReviewer,
    reviewerNote: note, createdAt: "2026-10-08T10:00:00Z", updatedAt: "2026-10-08T10:00:00Z",
    returnedAt: null, approvedAt: null, supersededAt: null, reviewDecision: null,
    documents: [], timeEntries: [], documentCount: review.outputs.length, linkedTimeMinutes: 0,
  }];
  return { review, workflow };
}
