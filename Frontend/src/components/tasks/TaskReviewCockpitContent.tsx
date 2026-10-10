"use client";

import React, { useState, type ReactNode } from "react";
import { QuietLink } from "@/components/ui";
import { AdminStatusPill } from "@/components/adminiculum/ui";
import type { TaskSubmissionReviewDetail, TaskSubmissionWorkflow } from "@/lib/taskLifecycleApi";
import { reviewTimeState, submittedOutputHref, submissionReviewHref } from "@/lib/taskReviewCockpit";
import { ATTENTION_LABELS, DOCUMENT_ROLE_LABELS, EXTERNAL_ACTION_LABELS, formatDate, formatDateTime, formatMinutes, submissionStatusLabel, taskStatusLabel, documentReviewStatusLabel, reviewUrgency, URGENCY_LABELS } from "@/lib/taskWorkflowPresentation";
import { reviewActionLabel } from "@/lib/notificationPresentation";

const panel = "min-w-0 rounded-lg border border-[var(--adm-border)] bg-white p-4";
const heading = "font-serif text-lg text-[var(--adm-text)]";
const copy = "mt-2 whitespace-pre-wrap break-words text-sm leading-6";

export function TaskReviewCockpitContent({ review, workflow, actions, externalAction }: {
  review: TaskSubmissionReviewDetail;
  workflow: TaskSubmissionWorkflow | null;
  actions: ReactNode;
  externalAction: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const output = review.outputs.find((entry) => entry.id === selectedId) || review.outputs[0] || null;
  const outputHref = output ? submittedOutputHref(review.case.id, output) : null;
  const currentRevision = workflow?.submissions.find((entry) => entry.id === review.submission.id);
  const time = reviewTimeState(review);
  const urgency = reviewUrgency({ dueDate: review.task.deadline, priority: review.task.priority });
  const groups = output ? review.documentReviews.filter((group) => group.documentId === output.documentId && group.documentVersionId === output.documentVersionId) : [];

  return <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" data-testid="review-cockpit">
    <div className="grid min-w-0 gap-4 pr-1 focus-visible:outline focus-visible:outline-2 xl:col-span-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" role="region" aria-label="Leadás döntési adatai" tabIndex={0}>
    <section className={`${panel} xl:col-span-2`} data-review-section="ReviewIdentity" aria-label="Leadás azonosítása">
      <div className="flex flex-wrap gap-2"><AdminStatusPill tone="gold">{submissionStatusLabel(review.submission.status, review.submission.revisionNumber)}</AdminStatusPill><AdminStatusPill tone="neutral">{taskStatusLabel(review.task.status)}</AdminStatusPill><AdminStatusPill tone={urgency === "CRITICAL" ? "burgundy" : urgency === "URGENT" ? "amber" : "neutral"}>{URGENCY_LABELS[urgency]}</AdminStatusPill></div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm xl:grid-cols-4">
        <div><dt>Ügy / ügyfél</dt><dd className="font-semibold">{review.case.caseNumber} · {review.client.displayName}</dd></div>
        <div><dt>Beküldő</dt><dd className="font-semibold">{review.submission.submittedBy?.displayName || "Nincs rögzítve"}</dd></div>
        <div><dt>Kijelölt reviewer</dt><dd className="font-semibold">{review.submission.assignedReviewer.displayName}</dd></div>
        <div><dt>Beküldve</dt><dd className="font-semibold">{formatDateTime(review.submission.submittedAt)}</dd></div>
      </dl>
      <p className="mt-3 break-all text-xs text-[var(--adm-text-muted)]">Leadás: {review.submission.id} · {review.submission.revisionNumber}. verzió</p>
    </section>

    <section className={`${panel} xl:col-span-2`} data-review-section="DecisionSummary">
      <h3 className={heading}>Döntési összefoglaló</h3>
      <p className={copy}>{review.submission.workSummary || "Az elvégzett munka összefoglalója nincs rögzítve."}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm xl:grid-cols-4">
        <div><dt>Kért figyelem</dt><dd className="font-semibold">{ATTENTION_LABELS[review.submission.requestedAttention || ""] || "Nincs rögzítve"}</dd>{review.submission.attentionEstimate && <dd className="text-xs">{review.submission.attentionEstimate.minMinutes}–{review.submission.attentionEstimate.maxMinutes} perc · becslés</dd>}</div>
        <div><dt>Feladat felelőse</dt><dd>{review.task.assignee?.displayName || "Nincs rögzítve"}</dd></div>
        <div><dt>Határidő</dt><dd>{review.task.deadline ? formatDate(review.task.deadline) : "Nincs rögzített határidő"}</dd></div>
        <div><dt>Leadott eredmények</dt><dd>{review.outputs.length} dokumentum · {time.label}</dd></div>
      </dl>
      <p className="mt-3 text-sm">Külső lépés: {review.submission.externalActionRequired ? EXTERNAL_ACTION_LABELS[review.submission.externalActionType || ""] || "Szükséges; a típusa nincs rögzítve" : "Nem szükséges"}</p>
      <p className="mt-3 border-l-2 border-[var(--adm-terracotta-700)] pl-3 text-sm">A szakmai jóváhagyás nem teszi közzé a leadást az ügyfélnek.</p>
      {!review.permittedActions.approve && !review.permittedActions.return && <p className="mt-2 text-sm" role="status">Csak megtekintés. Döntést az aktuális állapotban jogosult kijelölt reviewer hozhat; saját leadás nem ellenőrizhető.</p>}
    </section>

    <section className={`${panel} xl:col-start-1`} data-review-section="SubmittedOutputs">
      <h3 className={heading}>Leadott eredmények</h3>
      {review.outputs.length ? <>
        <label className="mt-3 block text-sm font-semibold">Kiválasztott eredmény<select className="mt-1 min-h-11 w-full rounded border border-[var(--adm-border)] bg-white px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" value={output?.id || ""} onChange={(event) => setSelectedId(event.target.value)}>{review.outputs.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.documentVersionId ? `leadott v${entry.linkedVersion ?? "?"}` : "leadott verzió nincs rögzítve"}</option>)}</select></label>
        {output && <div className="mt-3 space-y-2 break-words"><p className="font-semibold">{output.name}</p><p className="text-sm">{DOCUMENT_ROLE_LABELS[output.role] || "Dokumentum"} · {output.category}</p>{output.newerVersionExists && <p role="status" className="border-l-2 border-[var(--adm-terracotta-700)] pl-3 text-sm">Újabb aktuális verzió érhető el. A kiválasztott eredmény továbbra is a leadott verzió.</p>}{outputHref ? <QuietLink href={outputHref}>Beküldött pontos verzió megnyitása</QuietLink> : <p role="status">A leadott verzió nincs rögzítve.</p>}</div>}
      </> : <p className={copy}>Nincs leadott eredmény.</p>}
    </section>

    <section className={`${panel} xl:col-start-1`} data-review-section="VersionComparisonContext">
      <h3 className={heading}>Verziók összevetési alapja</h3>
      {output ? <><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><dt>Leadott verzió</dt><dd>{output.documentVersionId ? `v${output.linkedVersion ?? "?"}` : "Nincs rögzítve"}</dd><dd className="break-all text-xs">{output.documentVersionId}</dd></div><div><dt>Aktuális verzió</dt><dd>v{output.currentVersion}</dd><dd className="text-xs">A megnyitás nem vált erre automatikusan.</dd></div></dl>{outputHref && <QuietLink href={`${outputHref}&mode=versions`}>Pontos verzió és verziótörténet</QuietLink>}</> : <p className={copy}>Nincs kiválasztott eredmény.</p>}
      <p className="mt-3 text-xs text-[var(--adm-text-muted)]">Az összevetés alapja a rögzített verziómetaadat. Szöveges különbség nem áll rendelkezésre ezen a felületen.</p>
    </section>

    <section className={`${panel} xl:col-start-2 xl:row-start-3 xl:row-span-2`} data-review-section="OpenReviewPoints">
      <h3 className={heading}>Nyitott review pontok</h3>
      <p className={copy}>{review.submission.remainingIssues || "A beküldő nem rögzített nyitott kérdést."}</p>
      <p className="mt-3 text-xs">Az alábbi dokumentumreview a kiválasztott pontos leadott verzióhoz tartozik. A feladat és a dokumentum jóváhagyása külön döntés.</p>
      {!output?.documentVersionId ? <p className={copy}>Pontos leadott verzió nélkül a dokumentumreview kapcsolata nem állapítható meg.</p> : groups.length === 0 ? <p className={copy}>Ehhez a leadott verzióhoz nincs megjeleníthető formális dokumentumreview-adat.</p> : groups.map((group) => <div key={`${group.documentId}:${group.documentVersionId}`} className="mt-3 space-y-3">{group.reviews.length === 0 && <p className="text-sm">Ehhez a beküldött verzióhoz nincs kapcsolt formális dokumentumreview.</p>}{group.reviews.map((entry) => <div key={entry.id} className="rounded border border-[var(--adm-border)] p-3 text-sm"><p className="font-semibold">{documentReviewStatusLabel(entry.status)} · {entry.currentRoundNumber}. kör</p><p>Reviewer: {entry.reviewer?.displayName || "Nincs rögzítve"}</p><p className="mt-2">{entry.counts.open} nyitott · {entry.counts.blocking} blokkoló · {entry.counts.total} összes pont</p>{entry.rounds.length > 0 && <p>Körök: {entry.rounds.map((round) => `${round.roundNumber}.`).join(" · ")}</p>}{entry.lastDecision && <p className="mt-2 text-xs">Utolsó döntés: {reviewActionLabel(entry.lastDecision.action)} · {formatDateTime(entry.lastDecision.createdAt)}</p>}{entry.approvedVersionId && <p className="mt-2 break-all text-xs">Jóváhagyott verzió: {entry.approvedVersionId}</p>}<QuietLink href={entry.reviewLink}>Dokumentumreview és pontok megnyitása</QuietLink></div>)}</div>)}
    </section>

    <section className={`${panel} xl:col-start-2 xl:row-start-5`} data-review-section="WorkInstructionAndRisks">
      <h3 className={heading}>Munkautasítás és jelzett kockázatok</h3>
      <p className={copy}>{workflow ? workflow.task.description || "Munkautasítás nincs rögzítve." : "A munkautasítás jelenleg nem érhető el."}</p>
      <h4 className="mt-3 text-sm font-semibold">Megjegyzés a reviewernek</h4><p className={copy}>{currentRevision ? currentRevision.reviewerNote || "Nincs külön megjegyzés." : "A beküldő részletes megjegyzése jelenleg nem érhető el."}</p>
      <p className="mt-3 text-xs">Az összefoglaló és a nyitott kérdések a beküldő rögzített közlései. Önálló kockázatértékelés nincs rögzítve; a hiánya nem jelent kockázatmentességet.</p>
    </section>

    <section className={`${panel} xl:col-start-1 xl:row-start-5`} data-review-section="TimeSummary">
      <h3 className={heading}>Kapcsolt munkaidő</h3><p className="mt-2 font-semibold" data-time-state={time.state}>{time.label}</p>
      {time.state === "CONFIRMED_ZERO" && <p className="mt-2 text-sm">A beküldő megerősítette, hogy nincs rögzítendő idő.</p>}
      {time.state === "MISSING" && <p className="mt-2 text-sm">Nincs kapcsolt időbejegyzés és nincs kifejezett nullaidő-megerősítés.</p>}
      {time.state === "RECORDED" && <><ul className="mt-3 space-y-2 text-sm">{review.time.entries.map((entry) => <li key={entry.id} className="rounded border border-[var(--adm-border)] p-2">{entry.workType} · {formatMinutes(entry.minutes)}<span className="block text-xs">{formatDate(entry.workDate)} · {entry.billable ? "Elszámolható" : "Nem elszámolható"}</span></li>)}</ul><p className="mt-3 text-xs">Elszámolható: {formatMinutes(review.time.billableMinutes)} · Nem elszámolható: {formatMinutes(review.time.nonBillableMinutes)}</p></>}
    </section>

    </div>

    <section className={`min-w-0 rounded-lg border border-[var(--adm-border)] bg-white p-3 shadow-sm xl:col-start-1 ${actions ? "sticky bottom-0 z-10 pb-[max(0.75rem,env(safe-area-inset-bottom))] xl:static xl:z-auto xl:pb-3" : ""}`} data-review-section="DecisionActions" aria-label="Döntési műveletek">
      {review.decision && <div className="mb-3 space-y-2 text-sm"><p className="font-semibold">{review.decision.decision === "RETURNED" ? "Visszaküldve" : "Jóváhagyva"} · {review.decision.reviewer.displayName} · {formatDateTime(review.decision.createdAt)}</p>{review.decision.note && <p className="whitespace-pre-wrap">{review.decision.note}</p>}{review.decision.requestedCorrections && <p className="whitespace-pre-wrap">Kért javítások: {review.decision.requestedCorrections}</p>}{review.decision.decision === "RETURNED" && <p>Teljes review: {review.decision.requiresFullReview ? "Szükséges" : "Nem kért"} · Javítási határidő: {review.decision.correctionDeadline ? formatDate(review.decision.correctionDeadline) : "Nincs rögzítve"}</p>}</div>}
      {externalAction}{actions}
      {review.submission.status === "APPROVED" && <div className="mt-3 text-sm"><p>A leadás jóváhagyott. Az ügyfélnek szánt tartalom és a közzététel külön ellenőrzést igényel.</p>{outputHref ? <QuietLink href={`${outputHref}&mode=review#approval-publication-tools`}>Ügyfélnek közzététel előkészítése</QuietLink> : <p className="mt-2">A dokumentum közzétételéhez pontos verzió szükséges.</p>}</div>}
    </section>

    <details className={`${panel} xl:col-start-2`} data-review-section="ContextDrawer">
      <summary className="cursor-pointer font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Háttér és leadástörténet</summary>
      <p className="mt-3 text-sm">Ügycsoport: {review.matter.displayName || "Nincs kapcsolt ügycsoport"}</p><QuietLink href={`/cases/${encodeURIComponent(review.case.id)}`}>Ügy megnyitása</QuietLink>
      <ol className="mt-3 space-y-3">{[...review.history].sort((a, b) => b.revisionNumber - a.revisionNumber).map((revision) => { const full = workflow?.submissions.find((entry) => entry.id === revision.id); return <li key={revision.id} className="rounded border border-[var(--adm-border)] p-3 text-sm"><p className="font-semibold">{revision.revisionNumber}. verzió · {submissionStatusLabel(revision.status)}</p><p className="text-xs">{formatDateTime(revision.submittedAt || revision.returnedAt || revision.approvedAt)}</p><p className="mt-2 text-xs">{full ? full.documentCount + " dokumentum · " + (full.timeEntries.length ? formatMinutes(full.linkedTimeMinutes) : full.zeroTimeConfirmed ? "Megerősített nulla idő" : "A munkaidő nincs rögzítve") + " · reviewer: " + full.assignedReviewer.displayName : "A korábbi leadás részletes kapcsolatai nem érhetők el."}</p>{revision.decision && <><p className="mt-2">{revision.decision.decision === "RETURNED" ? "Visszaküldve" : "Jóváhagyva"} · {revision.decision.reviewer.displayName}</p>{revision.decision.requestedCorrections && <p className="whitespace-pre-wrap">Kért javítások: {revision.decision.requestedCorrections}</p>}</>}{revision.outputs?.map((entry, index) => { const href = submittedOutputHref(review.case.id, entry); return <p key={`${entry.documentId}:${index}`} className="mt-2 break-all text-xs">{href ? <QuietLink href={href}>Leadott v{entry.linkedVersion ?? "?"} · {entry.documentId}</QuietLink> : "A leadott verzió nincs rögzítve."}</p>; })}<QuietLink href={submissionReviewHref(review.task.id, revision.id)}>A leadás pontos részletei</QuietLink></li>; })}</ol>
    </details>
  </div>;
}
