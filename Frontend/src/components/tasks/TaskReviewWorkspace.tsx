"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminButton, AdminStatusPill } from "@/components/adminiculum/ui";
import { CompactState, SafePanelError } from "@/components/adminiculum/OperationalPrimitives";
import { WorkflowDialog } from "@/components/tasks/WorkflowDialog";
import { ClientAccent } from "@/components/clients/ClientAccent";
import {
  StableMutationAttempt,
  approveTaskSubmission,
  isStaleReviewError,
  isUncertainMutationError,
  readTaskSubmissionReview,
  readTaskSubmissionWorkflow,
  recordTaskExternalCompletion,
  returnTaskSubmission,
  type TaskReviewQueueItem,
  type TaskSubmissionReviewDetail,
  type TaskSubmissionWorkflow,
} from "@/lib/taskLifecycleApi";
import {
  ATTENTION_LABELS,
  attentionDurationLabel,
  DOCUMENT_ROLE_LABELS,
  EXTERNAL_ACTION_LABELS,
  URGENCY_LABELS,
  formatDate,
  formatDateTime,
  formatMinutes,
  reviewUrgency,
  submissionStatusLabel,
  taskStatusLabel,
  taskWorkflowErrorMessage,
} from "@/lib/taskWorkflowPresentation";

type ReturnForm = {
  note: string;
  requestedCorrections: string;
  requiresFullReview: boolean;
  correctionDeadline: string;
};

const EMPTY_RETURN_FORM: ReturnForm = {
  note: "",
  requestedCorrections: "",
  requiresFullReview: true,
  correctionDeadline: "",
};

export function TaskReviewWorkspace({
  item,
  onClose,
  onQueueChanged,
}: {
  item: TaskReviewQueueItem;
  onClose: () => void;
  onQueueChanged: () => Promise<void> | void;
}) {
  const [review, setReview] = useState<TaskSubmissionReviewDetail | null>(null);
  const [workflow, setWorkflow] = useState<TaskSubmissionWorkflow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changedNotice, setChangedNotice] = useState<string | null>(null);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [externalDialogOpen, setExternalDialogOpen] = useState(false);
  const [returnForm, setReturnForm] = useState<ReturnForm>(EMPTY_RETURN_FORM);
  const [approvalNote, setApprovalNote] = useState("");
  const returnAttempt = useRef(new StableMutationAttempt("return"));
  const approveAttempt = useRef(new StableMutationAttempt("approve"));
  const externalAttempt = useRef(new StableMutationAttempt("external-completion"));

  const loadReview = useCallback(async (): Promise<TaskSubmissionReviewDetail | null> => {
    if (!item.submissionId) return null;
    setIsLoading(true);
    setError(null);
    try {
      const [detail, taskWorkflow] = await Promise.all([
        readTaskSubmissionReview(item.taskId, item.submissionId),
        readTaskSubmissionWorkflow(item.taskId),
      ]);
      setReview(detail);
      setWorkflow(taskWorkflow);
      return detail;
    } catch (loadError) {
      setError(taskWorkflowErrorMessage(loadError));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [item.submissionId, item.taskId]);

  useEffect(() => {
    setReview(null);
    setWorkflow(null);
    setChangedNotice(null);
    void loadReview();
  }, [loadReview]);

  const currentRevision = useMemo(
    () => workflow?.submissions.find((submission) => submission.id === review?.submission.id) || null,
    [review?.submission.id, workflow?.submissions],
  );
  const urgency = reviewUrgency(item);
  const returnInvalid = !returnForm.note.trim() || !returnForm.requestedCorrections.trim();

  const handleStaleOrTimeout = async (actionError: unknown) => {
    if (isStaleReviewError(actionError)) {
      setChangedNotice("A Review időközben megváltozott. Az adatokat újratöltöttük; a döntést nem írtuk felül.");
      await loadReview();
      return true;
    }
    if (isUncertainMutationError(actionError)) {
      setChangedNotice("A válasz nem érkezett meg biztosan. Az aktuális backend állapotot újraolvastuk.");
      await loadReview();
      return true;
    }
    return false;
  };

  const returnForCorrection = async () => {
    if (!review || returnInvalid) return;
    setBusyAction("return");
    setError(null);
    setChangedNotice(null);
    try {
      await returnTaskSubmission(item.taskId, review.submission.id, review.reviewVersion, returnAttempt.current.key(), {
        note: returnForm.note,
        requestedCorrections: returnForm.requestedCorrections,
        requiresFullReview: returnForm.requiresFullReview,
        correctionDeadline: returnForm.correctionDeadline || undefined,
      });
      returnAttempt.current.complete();
      setReturnDialogOpen(false);
      setReturnForm(EMPTY_RETURN_FORM);
      await onQueueChanged();
      onClose();
    } catch (actionError) {
      if (!(await handleStaleOrTimeout(actionError))) setError(taskWorkflowErrorMessage(actionError));
    } finally {
      setBusyAction(null);
    }
  };

  const approve = async () => {
    if (!review) return;
    setBusyAction("approve");
    setError(null);
    setChangedNotice(null);
    try {
      const result = await approveTaskSubmission(item.taskId, review.submission.id, review.reviewVersion, approveAttempt.current.key(), approvalNote);
      approveAttempt.current.complete();
      setApproveDialogOpen(false);
      setApprovalNote("");
      setReview(result.review);
      if (result.review.submission.externalActionRequired) return;
      await onQueueChanged();
      onClose();
    } catch (actionError) {
      if (!(await handleStaleOrTimeout(actionError))) setError(taskWorkflowErrorMessage(actionError));
    } finally {
      setBusyAction(null);
    }
  };

  const completeExternalAction = async () => {
    if (!review?.submission.externalActionType) return;
    setBusyAction("external-completion");
    setError(null);
    setChangedNotice(null);
    try {
      const result = await recordTaskExternalCompletion(item.taskId, review.submission.id, externalAttempt.current.key(), {
        actionType: review.submission.externalActionType,
      });
      externalAttempt.current.complete();
      setExternalDialogOpen(false);
      setReview(result.review);
      await onQueueChanged();
    } catch (actionError) {
      if (!(await handleStaleOrTimeout(actionError))) setError(taskWorkflowErrorMessage(actionError));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="min-w-0 overflow-hidden rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-white" aria-labelledby="review-workspace-title">
      <header className="relative flex items-start justify-between gap-3 border-b border-[var(--adm-border)] px-4 py-3 pl-5">
        <ClientAccent colorKey={review?.client.clientColorKey || item.case.clientColorKey} className="absolute inset-y-0 left-0 w-1" />
        <div className="flex items-start gap-2 min-w-0">
          <button
            type="button"
            data-testid="task-review-back-to-queue"
            onClick={onClose}
            className="xl:hidden inline-flex min-h-[40px] items-center gap-1 rounded-[6px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--adm-text-primary)] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] shrink-0"
            aria-label="Vissza a review sorhoz"
          >
            <span aria-hidden="true">←</span>
            <span>Sor</span>
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--adm-text-muted)]">Kiválasztott Review</p>
            <h2 id="review-workspace-title" className="mt-1 truncate font-serif text-[19px] sm:text-[22px] text-[var(--adm-text)]">{item.title}</h2>
            <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{item.case.caseNumber} · {item.case.clientName}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded p-2 text-xl text-[var(--adm-text-muted)] hover:text-[var(--adm-text)] min-h-[40px] min-w-[40px] flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 shrink-0" aria-label="Review részlet bezárása">×</button>
      </header>

      <div className="space-y-4 p-4">
        {error ? <div role="alert" aria-live="assertive"><CompactState tone="error" title="A review művelet nem fejeződött be." detail={error} action={<AdminButton size="sm" variant="neutral" onClick={() => void loadReview()}>Review újratöltése</AdminButton>} /></div> : null}
        {changedNotice ? <div role="status" className="rounded border border-[var(--adm-ochre-500)]/40 bg-[var(--adm-sand-100)] px-3 py-2 text-[11px] text-[var(--adm-text)]">{changedNotice}</div> : null}
        {isLoading ? <CompactState title="A review részletei betöltődnek…" /> : null}
        {!isLoading && !review ? <SafePanelError onRetry={() => void loadReview()} /> : null}

        {review ? (
          <>
            <section className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <AdminStatusPill tone="gold">{submissionStatusLabel(review.submission.status, review.submission.revisionNumber)}</AdminStatusPill>
                <AdminStatusPill tone="blue">{ATTENTION_LABELS[review.submission.requestedAttention || ""] || "Nincs review típus"}</AdminStatusPill>
                {review.submission.attentionEstimate ? <AdminStatusPill tone="neutral">{attentionDurationLabel(review.submission.requestedAttention)} · tervezett</AdminStatusPill> : null}
                <AdminStatusPill tone={urgency === "CRITICAL" ? "burgundy" : urgency === "URGENT" ? "amber" : "neutral"}>{URGENCY_LABELS[urgency]}</AdminStatusPill>
              </div>
              <dl className="mt-4 grid gap-3 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
                <div><dt className="text-[var(--adm-text-muted)]">Feladatállapot</dt><dd className="mt-1 font-semibold">{taskStatusLabel(review.task.status)}</dd></div>
                <div><dt className="text-[var(--adm-text-muted)]">Beküldő</dt><dd className="mt-1 font-semibold">{review.submission.submittedBy?.displayName || "Nincs adat"}</dd></div>
                <div><dt className="text-[var(--adm-text-muted)]">Beküldve</dt><dd className="mt-1 font-semibold">{formatDateTime(review.submission.submittedAt)}</dd></div>
                <div><dt className="text-[var(--adm-text-muted)]">Ügy / ügyfél</dt><dd className="mt-1 font-semibold"><Link href={`/cases/${review.case.id}`} className="hover:underline">{review.case.caseNumber}</Link> · {review.client.displayName}</dd></div>
                <div><dt className="text-[var(--adm-text-muted)]">Munkacsomag</dt><dd className="mt-1 font-semibold">{review.matter.displayName || "Nincs kapcsolt munkacsomag"}</dd></div>
                <div><dt className="text-[var(--adm-text-muted)]">Határidő</dt><dd className="mt-1 font-semibold">{formatDate(review.task.deadline)}</dd></div>
              </dl>
            </section>

            {/* Exact Submitted Version Hero Card */}
            {review.outputs.length > 0 ? (
              <section data-testid="exact-version-hero" className="rounded-[8px] border-2 border-[var(--adm-border-canonical)] bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--adm-border-canonical)] pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--adm-brand-green)]">Ellenőrizendő munkaanyag</span>
                    <AdminBadge tone="green">Pontos verzió</AdminBadge>
                  </div>
                  <span className="text-xs text-[var(--adm-text-secondary)]">{review.outputs.length} csatolt dokumentum</span>
                </div>
                <div className="mt-3 space-y-3">
                  {review.outputs.map((output) => {
                    const isExact = Boolean(output.documentVersionId);
                    const versionLabel = output.linkedVersion ? `v${output.linkedVersion}` : "kötetlen";
                    const targetUrl = output.documentVersionId
                      ? `/cases/${review.case.id}/documents?documentId=${encodeURIComponent(output.documentId)}&versionId=${encodeURIComponent(output.documentVersionId)}`
                      : `/cases/${review.case.id}/documents?documentId=${encodeURIComponent(output.documentId)}`;
                    return (
                      <div key={output.id} className="rounded-[6px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--adm-text-primary)]">{output.name}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--adm-text-secondary)]">
                              <AdminStatusPill tone={isExact ? "green" : "neutral"}>
                                {isExact ? `Beküldött: ${versionLabel}` : "Nincs verziókötés"}
                              </AdminStatusPill>
                              {output.newerVersionExists ? (
                                <AdminStatusPill tone="amber">
                                  Létezik újabb: v{output.currentVersion}
                                </AdminStatusPill>
                              ) : (
                                <span className="text-[11px] text-[var(--adm-text-secondary)]">
                                  Ez a legfrissebb verzió (v{output.currentVersion})
                                </span>
                              )}
                            </div>
                            {output.newerVersionExists ? (
                              <p data-testid="newer-version-notice" className="mt-1.5 text-[11px] font-medium text-[var(--adm-terracotta-700)]">
                                Figyelem: azóta újabb verzió (v{output.currentVersion}) készült, de a döntés a beküldött {versionLabel} verzióra érvényes.
                              </p>
                            ) : null}
                          </div>
                          <div className="shrink-0 pt-1 sm:pt-0">
                            <Link
                              href={targetUrl}
                              data-testid="exact-version-open-button"
                              className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-1.5 rounded-[6px] bg-[var(--adm-brand-green)] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[var(--adm-brand-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2"
                            >
                              <span>{versionLabel} megnyitása és olvasása</span>
                              <span aria-hidden="true">→</span>
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded border border-[var(--adm-border)] bg-white p-4"><h3 className="font-serif text-[17px] text-[var(--adm-text)]">Elvégzett munka</h3><p className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-[var(--adm-text)]">{review.submission.workSummary || "Nincs megadva"}</p></div>
              <div className="rounded border border-[var(--adm-border)] bg-white p-4"><h3 className="font-serif text-[17px] text-[var(--adm-text)]">Nyitott pontok</h3><p className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-[var(--adm-text)]">{review.submission.remainingIssues || "Nincs megadva"}</p></div>
              <div className="rounded border border-[var(--adm-border)] bg-white p-4 lg:col-span-2"><h3 className="font-serif text-[17px] text-[var(--adm-text)]">Megjegyzés a reviewernek</h3><p className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-[var(--adm-text)]">{currentRevision?.reviewerNote || "Nincs külön megjegyzés."}</p></div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded border border-[var(--adm-border)] bg-white p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-serif text-[17px] text-[var(--adm-text)]">Beküldött eredmények</h3><span className="text-[11px] text-[var(--adm-text-muted)]">{review.outputs.length} db</span></div>{review.outputs.length === 0 ? <p className="mt-2 text-[11px] text-[var(--adm-text-muted)]">Nincs beküldött eredmény.</p> : <ul className="mt-3 space-y-2">{review.outputs.map((output) => <li key={output.id} className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3"><p className="truncate text-[12px] font-semibold">{output.name}</p><p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{DOCUMENT_ROLE_LABELS[output.role] || "Dokumentum"} · {output.category}</p><div className="mt-2 flex flex-wrap gap-1.5"><AdminStatusPill tone={output.documentVersionId ? "green" : "neutral"}>{output.documentVersionId ? `Beküldött: v${output.linkedVersion || "?"}` : "Nincs kötött verzió"}</AdminStatusPill><AdminStatusPill tone={output.newerVersionExists ? "amber" : "neutral"}>{output.newerVersionExists ? `Aktuális: v${output.currentVersion}` : `Aktuális verzió: v${output.currentVersion}`}</AdminStatusPill></div>{output.documentVersionId ? <Link href={`/cases/${review.case.id}/documents?documentId=${encodeURIComponent(output.documentId)}&versionId=${encodeURIComponent(output.documentVersionId)}`} className="mt-2 inline-flex min-h-[36px] items-center text-xs font-semibold text-[var(--adm-blue-700)] hover:underline">Beküldött pontos verzió megnyitása</Link> : <Link href={`/cases/${review.case.id}/documents?documentId=${encodeURIComponent(output.documentId)}`} className="mt-2 inline-flex min-h-[36px] items-center text-xs font-semibold text-[var(--adm-blue-700)] hover:underline">Dokumentum megnyitása</Link>}</li>)}</ul>}</div>
              <div className="rounded border border-[var(--adm-border)] bg-white p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-serif text-[17px] text-[var(--adm-text)]">Kapcsolt munkaidő</h3><span className="text-[11px] font-semibold">{review.submission.zeroTimeConfirmed ? "Nulla idő" : formatMinutes(review.time.totalMinutes)}</span></div>{review.time.entries.length === 0 ? <p className="mt-2 text-[11px] text-[var(--adm-text-muted)]">{review.submission.zeroTimeConfirmed ? "A beküldő megerősítette, hogy nincs rögzítendő idő." : "Nincs kapcsolt munkaóra."}</p> : <ul className="mt-3 space-y-2">{review.time.entries.map((entry) => <li key={entry.id} className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 text-[11px]"><span className="font-semibold">{entry.workType} · {formatMinutes(entry.minutes)}</span><span className="mt-1 block text-[10px] text-[var(--adm-text-muted)]">{formatDate(entry.workDate)} · {entry.billable ? "Elszámolható" : "Nem elszámolható"}</span></li>)}</ul>}<p className="mt-3 text-[10px] text-[var(--adm-text-muted)]">Elszámolható: {formatMinutes(review.time.billableMinutes)} · Nem elszámolható: {formatMinutes(review.time.nonBillableMinutes)}</p></div>
            </section>

            {review.documentReviews.length > 0 ? <section className="rounded border border-[var(--adm-border)] bg-white p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-serif text-[17px] text-[var(--adm-text)]">Dokumentum review kontextus</h3><p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">A beküldött pontos verzióhoz kapcsolódó formális dokumentumreview. A feladat jóváhagyása és a dokumentum jóváhagyása két külön döntés.</p></div></div><div className="mt-3 space-y-3">{review.documentReviews.map((group) => group.reviews.length === 0 ? <div key={group.documentId} className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 text-[11px] text-[var(--adm-text-muted)]">Ehhez a beküldött verzióhoz nincs kapcsolt formális dokumentumreview.</div> : group.reviews.map((documentReview) => <div key={documentReview.id} className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3"><div className="flex flex-wrap items-center gap-2"><AdminStatusPill tone={documentReview.status === "APPROVED" ? "green" : documentReview.status === "CHANGES_REQUESTED" ? "burgundy" : "gold"}>{documentReview.status}</AdminStatusPill><span className="text-[11px] font-semibold">Review · {documentReview.currentRoundNumber}. kör</span>{documentReview.reviewer ? <span className="text-[10px] text-[var(--adm-text-muted)]">Reviewer: {documentReview.reviewer.displayName}</span> : null}</div><p className="mt-2 text-[10px] text-[var(--adm-text-muted)]">Pontok: {documentReview.counts.open} nyitott · {documentReview.counts.blocking} blokkoló · {documentReview.counts.total} összes</p>{documentReview.rounds.length > 0 ? <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">Körök: {documentReview.rounds.map((round) => `${round.roundNumber}. kör`).join(" · ")}</p> : null}{documentReview.lastDecision ? <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">Utolsó döntés: {documentReview.lastDecision.action} · {formatDateTime(documentReview.lastDecision.createdAt)}</p> : null}{documentReview.approvedVersionId ? <p className="mt-1 text-[10px] font-semibold text-[var(--adm-green-900)]">A formális dokumentum-jóváhagyás a pontos beküldött verzióra vonatkozik.</p> : null}<Link href={documentReview.reviewLink} className="mt-2 inline-flex min-h-[36px] items-center text-xs font-semibold text-[var(--adm-blue-700)] hover:underline">Dokumentumreview megnyitása</Link></div>))}</div></section> : null}

            {review.decision ? <section className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4"><h3 className="font-serif text-[17px] text-[var(--adm-text)]">Döntés</h3><p className="mt-2 text-[12px] font-semibold">{review.decision.decision === "RETURNED" ? "Visszaküldve" : "Jóváhagyva"} · {review.decision.reviewer.displayName} · {formatDateTime(review.decision.createdAt)}</p>{review.decision.note ? <p className="mt-2 whitespace-pre-wrap text-[11px] text-[var(--adm-text-muted)]">{review.decision.note}</p> : null}{review.decision.requestedCorrections ? <p className="mt-3 whitespace-pre-wrap rounded border border-[#e3c5c0] bg-white p-3 text-[11px] text-[var(--adm-terracotta-700)]"><strong>Kért javítások:</strong> {review.decision.requestedCorrections}</p> : null}</section> : null}

            <section className="rounded border border-[var(--adm-border)] bg-white p-4"><h3 className="font-serif text-[17px] text-[var(--adm-text)]">Revision történet</h3><ol className="mt-3 space-y-2">{[...review.history].sort((left, right) => right.revisionNumber - left.revisionNumber).map((revision) => { const full = workflow?.submissions.find((entry) => entry.id === revision.id); return <li key={revision.id} className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[12px] font-semibold">{revision.revisionNumber}. verzió · {submissionStatusLabel(revision.status)}</span><span className="text-[10px] text-[var(--adm-text-muted)]">{formatDateTime(revision.submittedAt || revision.returnedAt || revision.approvedAt)}</span></div><p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{full ? `${full.documentCount} dokumentum · ${formatMinutes(full.linkedTimeMinutes)} · reviewer: ${full.assignedReviewer.displayName}` : "A korábbi revision részletes kapcsolatai nem érhetők el."}</p>{revision.outputs && revision.outputs.length > 0 ? <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">Beküldött pontos verziók: {revision.outputs.map((output) => `v${output.linkedVersion || "nincs verzió"}`).join(" · ")}</p> : null}{revision.decision ? <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">Döntés: {revision.decision.decision === "RETURNED" ? "Visszaküldve" : "Jóváhagyva"} · {revision.decision.reviewer.displayName}</p> : null}</li>; })}</ol></section>

            {review.submission.status === "APPROVED" && review.submission.externalActionRequired && !review.submission.externalCompletedAt ? <CompactState title="Külső lépésre vár" detail={`A Leadás jóváhagyott, de a feladat még nincs lezárva. Rögzítendő: ${EXTERNAL_ACTION_LABELS[review.submission.externalActionType || ""] || "külső művelet"}.`} action={review.permittedActions.recordExternalCompletion ? <AdminButton variant="primary" onClick={() => { externalAttempt.current.begin(); setExternalDialogOpen(true); }}>Külső lépés teljesítésének rögzítése</AdminButton> : undefined} /> : null}

            {(review.permittedActions.return || review.permittedActions.approve) ? (
              <div className="sticky bottom-0 z-20 rounded-[8px] border border-[var(--adm-border)] bg-white/95 p-3 shadow-lg backdrop-blur">
                <div data-testid="exact-decision-version" className="mb-2 flex flex-wrap items-center justify-between gap-1 border-b border-[var(--adm-border-canonical)] pb-2 text-xs">
                  <div className="flex items-center gap-1.5 text-[var(--adm-text-secondary)]">
                    <span className="font-semibold text-[var(--adm-text-primary)]">Döntési verzió:</span>
                    {review.outputs.length > 0 ? (
                      <span className="font-mono font-bold text-[var(--adm-brand-green)]">
                        {review.outputs.map((o) => `${o.name} v${o.linkedVersion || "?"}`).join(", ")}
                      </span>
                    ) : (
                      <span>Általános feladatleadás</span>
                    )}
                  </div>
                  <span className="text-[11px] text-[var(--adm-text-secondary)]">
                    {review.submission.revisionNumber}. revision
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2.5">
                  <AdminButton
                    data-testid="task-review-action-return"
                    variant="neutral"
                    size="md"
                    className="min-h-[44px] w-full sm:w-auto text-[var(--adm-terracotta-700)] hover:border-[var(--adm-terracotta-700)]"
                    disabled={!review.permittedActions.return || busyAction !== null}
                    onClick={() => {
                      returnAttempt.current.begin();
                      setReturnDialogOpen(true);
                    }}
                  >
                    Visszaküldés javításra
                  </AdminButton>
                  <AdminButton
                    data-testid="task-review-action-approve"
                    variant="primary"
                    size="md"
                    className="min-h-[44px] w-full sm:w-auto"
                    disabled={!review.permittedActions.approve || busyAction !== null}
                    onClick={() => {
                      approveAttempt.current.begin();
                      setApproveDialogOpen(true);
                    }}
                  >
                    {busyAction === "approve" ? "Jóváhagyás folyamatban…" : "Leadás jóváhagyása"}
                  </AdminButton>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <WorkflowDialog open={returnDialogOpen} title="Leadás visszaküldése" description="A döntés és a kért javítások változatlan review-előzményként maradnak meg." primaryLabel="Visszaküldés" primaryDisabled={returnInvalid} busy={busyAction === "return"} destructive onClose={() => { if (busyAction !== "return") setReturnDialogOpen(false); }} onConfirm={() => void returnForCorrection()}>
        <div className="space-y-4"><label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Review megjegyzés<textarea autoFocus maxLength={4000} rows={3} value={returnForm.note} onChange={(event) => setReturnForm((current) => ({ ...current, note: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-sm sm:text-xs min-h-[72px]" />{!returnForm.note.trim() ? <span className="mt-1 block text-[10px] text-[var(--adm-terracotta-700)]">A review megjegyzés kötelező.</span> : null}</label><label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Kért javítások<textarea maxLength={8000} rows={5} value={returnForm.requestedCorrections} onChange={(event) => setReturnForm((current) => ({ ...current, requestedCorrections: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-sm sm:text-xs min-h-[100px]" />{!returnForm.requestedCorrections.trim() ? <span className="mt-1 block text-[10px] text-[var(--adm-terracotta-700)]">A kért javítások megadása kötelező.</span> : null}</label><label className="flex items-center gap-2 text-[11px] font-semibold text-[var(--adm-text)] min-h-[36px]"><input type="checkbox" checked={returnForm.requiresFullReview} onChange={(event) => setReturnForm((current) => ({ ...current, requiresFullReview: event.target.checked }))} className="h-4 w-4" /> Teljes review szükséges az új revisionnél</label><label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Javítási határidő (opcionális)<input type="date" value={returnForm.correctionDeadline} onChange={(event) => setReturnForm((current) => ({ ...current, correctionDeadline: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-sm sm:text-xs min-h-[40px]" /></label></div>
      </WorkflowDialog>

      <WorkflowDialog open={approveDialogOpen} title="Leadás jóváhagyása" description="A jóváhagyás rendes esetben lezárja a feladatot. Külső lépésnél a feladat csak annak külön rögzítése után zárul le." primaryLabel="Jóváhagyás" busy={busyAction === "approve"} onClose={() => { if (busyAction !== "approve") setApproveDialogOpen(false); }} onConfirm={() => void approve()}>
        {review ? (
          <div className="space-y-4">
            {/* Explicit document version confirmation */}
            <div className="rounded-[6px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3">
              <p className="text-xs font-semibold text-[var(--adm-text-primary)]">Jóváhagyandó pontos dokumentumverziók:</p>
              {review.outputs.length > 0 ? (
                <ul className="mt-2 space-y-1.5 text-xs text-[var(--adm-text-primary)]">
                  {review.outputs.map((out) => (
                    <li key={out.id} className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{out.name}</span>
                      <AdminBadge tone="green">v{out.linkedVersion || "?"}</AdminBadge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">Nincs csatolt dokumentum.</p>
              )}
            </div>
            <dl className="grid gap-3 text-[12px] sm:grid-cols-2">
              <div><dt className="text-[var(--adm-text-muted)]">Revision</dt><dd className="font-semibold">{review.submission.revisionNumber}. verzió</dd></div>
              <div><dt className="text-[var(--adm-text-muted)]">Beküldő</dt><dd className="font-semibold">{review.submission.submittedBy?.displayName || "Nincs adat"}</dd></div>
              <div><dt className="text-[var(--adm-text-muted)]">Eredmények</dt><dd className="font-semibold">{review.outputs.length} dokumentum</dd></div>
              <div><dt className="text-[var(--adm-text-muted)]">Munkaidő</dt><dd className="font-semibold">{review.submission.zeroTimeConfirmed ? "Nulla idő" : formatMinutes(review.time.totalMinutes)}</dd></div>
              <div className="sm:col-span-2"><dt className="text-[var(--adm-text-muted)]">Külső lépés</dt><dd className="font-semibold">{review.submission.externalActionRequired ? EXTERNAL_ACTION_LABELS[review.submission.externalActionType || ""] || "Szükséges" : "Nem szükséges; a feladat lezárul"}</dd></div>
            </dl>
            <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Jóváhagyási megjegyzés (opcionális)<textarea maxLength={4000} rows={3} value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} className="adm-board-field mt-1 w-full px-3 py-2 text-sm sm:text-xs min-h-[72px]" /></label>
          </div>
        ) : null}
      </WorkflowDialog>

      <WorkflowDialog open={externalDialogOpen} title="Külső lépés teljesítésének rögzítése" description="A rendszer csak a teljesítés metaadatát rögzíti; nem hajt végre küldést, aláírást vagy benyújtást." primaryLabel="Teljesítés rögzítése" busy={busyAction === "external-completion"} onClose={() => { if (busyAction !== "external-completion") setExternalDialogOpen(false); }} onConfirm={() => void completeExternalAction()}>
        <div className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4 text-[12px]"><p className="text-[var(--adm-text-muted)]">Megerősítendő külső lépés</p><p className="mt-1 font-semibold">{EXTERNAL_ACTION_LABELS[review?.submission.externalActionType || ""] || "Nincs típusadat"}</p></div>
      </WorkflowDialog>
    </section>
  );
}
