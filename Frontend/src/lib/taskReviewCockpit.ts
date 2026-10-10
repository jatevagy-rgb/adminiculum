import type { TaskSubmissionReviewDetail } from "./taskLifecycleApi";

type ReviewOutput = TaskSubmissionReviewDetail["outputs"][number];

/** Missing historical identity must never become a link to the current file. */
export function submittedOutputHref(caseId: string, output: Pick<ReviewOutput, "documentId" | "documentVersionId">): string | null {
  if (!output.documentVersionId) return null;
  return `/cases/${encodeURIComponent(caseId)}/documents?documentId=${encodeURIComponent(output.documentId)}&versionId=${encodeURIComponent(output.documentVersionId)}`;
}

export function submissionReviewHref(taskId: string, submissionId: string): string {
  return `/tasks?taskId=${encodeURIComponent(taskId)}&submissionId=${encodeURIComponent(submissionId)}&view=review`;
}

export function reviewTimeState(review: Pick<TaskSubmissionReviewDetail, "time" | "submission">): { state: "RECORDED" | "CONFIRMED_ZERO" | "MISSING"; minutes: number | null; label: string } {
  if (review.time.entries.length > 0) return { state: "RECORDED", minutes: review.time.totalMinutes, label: `${review.time.totalMinutes} perc rögzítve` };
  if (review.submission.zeroTimeConfirmed) return { state: "CONFIRMED_ZERO", minutes: 0, label: "Megerősített nulla idő" };
  return { state: "MISSING", minutes: null, label: "A munkaidő nincs rögzítve" };
}
