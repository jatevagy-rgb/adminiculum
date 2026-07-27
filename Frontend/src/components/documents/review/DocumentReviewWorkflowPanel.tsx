"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminBadge, AdminButton } from "@/components/adminiculum/ui";
import {
  addReviewPoint,
  createDocumentReview,
  getDocumentReview,
  listDocumentReviews,
  listReviewDecisions,
  listReviewPoints,
  transitionDocumentReview,
  updateReviewPoint,
  type DocumentReviewDto,
  type ReviewDecisionDto,
  type ReviewPointDto,
  type ReviewPointSeverity,
  type ReviewPointType,
} from "@/lib/documents/reviewWorkflowApi";
import { ApiError } from "@/lib/api";

type VersionOption = { id: string; versionNumber: number; isCurrent?: boolean; originalFileName?: string | null };

const statusLabel: Record<string, string> = {
  DRAFT: "Piszkozat",
  ASSIGNED: "Reviewer kijelölve",
  IN_REVIEW: "Review folyamatban",
  CHANGES_REQUESTED: "Változtatás kérve",
  RESUBMITTED: "Új kör review-ra küldve",
  APPROVED: "Jóváhagyva",
  CANCELLED: "Megszakítva",
  CLOSED: "Lezárva",
};
const typeLabel: Record<string, string> = { WHOLE_DOCUMENT: "Teljes dokumentum", ANNOTATION: "Annotáció", COMPARISON_CHANGE: "Összehasonlítási változás" };
const severityLabel: Record<string, string> = { INFO: "Info", NORMAL: "Normál", IMPORTANT: "Fontos", BLOCKING: "Blokkoló" };
const closedPointStatuses = new Set(["RESOLVED", "REJECTED", "DEFERRED"]);

export function DocumentReviewWorkflowPanel({ documentId, selectedVersionId, versions }: { documentId: string; selectedVersionId: string | null; versions: VersionOption[] }) {
  const [review, setReview] = useState<DocumentReviewDto | null>(null);
  const [points, setPoints] = useState<ReviewPointDto[]>([]);
  const [decisions, setDecisions] = useState<ReviewDecisionDto[]>([]);
  const [filter, setFilter] = useState("all");
  const [reviewerId, setReviewerId] = useState("");
  const [title, setTitle] = useState("Teljes dokumentum review pont");
  const [type, setType] = useState<ReviewPointType>("WHOLE_DOCUMENT");
  const [severity, setSeverity] = useState<ReviewPointSeverity>("NORMAL");
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedVersion = versions.find((v) => v.id === selectedVersionId) || null;
  const reviewVersion = versions.find((v) => v.id === review?.reviewVersionId) || null;
  const latestVersion = [...versions].sort((a, b) => b.versionNumber - a.versionNumber)[0] || null;
  const mismatch = Boolean(review && selectedVersionId && review.reviewVersionId && selectedVersionId !== review.reviewVersionId);

  const load = useCallback(async () => {
    const reviews = await listDocumentReviews(documentId);
    const active = reviews.find((item) => !["CLOSED", "CANCELLED"].includes(String(item.status))) || reviews[0] || null;
    setReview(active);
    if (active) {
      const [pointPage, decisionPage, refreshed] = await Promise.all([listReviewPoints(active.id), listReviewDecisions(active.id), getDocumentReview(active.id)]);
      setReview(refreshed);
      setPoints(pointPage.data);
      setDecisions(decisionPage.data);
    } else {
      setPoints([]);
      setDecisions([]);
    }
  }, [documentId]);

  useEffect(() => { void load().catch(() => setError("A review adatok betöltése nem sikerült.")); }, [load]);

  const run = async (fn: () => Promise<DocumentReviewDto | ReviewPointDto>) => {
    setBusy(true); setError(null);
    try { await fn(); await load(); }
    catch (err) { setError(err instanceof ApiError ? `${err.code || err.status}: ${err.message}` : "A review művelet nem sikerült."); }
    finally { setBusy(false); }
  };

  const filteredPoints = useMemo(() => points.filter((point) => {
    if (filter === "all") return true;
    if (filter === "open") return !closedPointStatuses.has(point.status);
    if (filter === "blocking") return point.severity === "BLOCKING" && !closedPointStatuses.has(point.status);
    if (filter === "resolved") return closedPointStatuses.has(point.status);
    if (filter === "annotation") return point.type === "ANNOTATION";
    if (filter === "comparison") return point.type === "COMPARISON_CHANGE";
    if (filter === "whole") return point.type === "WHOLE_DOCUMENT";
    if (filter === "task") return Boolean(point.linkedTaskId);
    return true;
  }), [filter, points]);

  return (
    <section data-testid="review-workflow" className="min-w-0 space-y-4 rounded-[var(--adm-radius-md)] border border-[rgba(22,32,26,0.12)] bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Belső dokumentum review</p>
          <h3 className="font-serif text-2xl font-semibold text-[var(--adm-text)]" data-testid="review-summary-title">Review mód</h3>
          <p className="mt-1 text-sm text-[#3D4842]">Belső jóváhagyás pontos immutable verzióra. Nem publikál ügyfélportálra.</p>
        </div>
        <AdminBadge tone={review?.status === "APPROVED" ? "green" : review ? "gold" : "neutral"}>{review ? statusLabel[String(review.status)] || review.status : "Nincs review"}</AdminBadge>
      </div>

      {error ? <p role="alert" className="rounded border border-[#F2DAD6] bg-[var(--adm-terracotta-100)] p-2 text-xs font-semibold text-[var(--adm-terracotta-700)]">{error}</p> : null}

      {!review ? (
        <div data-testid="review-empty" className="rounded border border-dashed border-[rgba(22,32,26,0.18)] bg-[var(--adm-surface)] p-4">
          <p className="text-sm text-[#3D4842]">Ehhez a dokumentumhoz még nincs aktív belső review workflow.</p>
          <AdminButton className="mt-3" variant="primary" disabled={busy || !selectedVersionId} onClick={() => run(() => createDocumentReview(documentId, { reviewVersionId: selectedVersionId || undefined }))}>Review létrehozása</AdminButton>
        </div>
      ) : (
        <>
          <div data-testid="review-summary" className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Info label="Státusz" value={statusLabel[String(review.status)] || review.status} />
            <Info label="Kör" value={`#${review.currentRoundNumber}`} />
            <Info label="Review verzió" value={reviewVersion ? `v${reviewVersion.versionNumber}` : review.reviewVersionId?.slice(0, 8) || "—"} />
            <Info label="Jóváhagyott verzió" value={review.approvedVersionId ? (versions.find((v) => v.id === review.approvedVersionId) ? `v${versions.find((v) => v.id === review.approvedVersionId)?.versionNumber}` : review.approvedVersionId.slice(0, 8)) : "—"} />
            <Info label="Reviewer" value={review.reviewer?.name || "Nincs kijelölve"} />
            <Info label="Határidő" value={review.dueAt ? new Date(review.dueAt).toLocaleDateString("hu-HU") : "—"} />
            <Info label="Nyitott / blokkoló" value={`${review.counts.open} / ${review.counts.blocking}`} />
            <Info label="Utolsó döntés" value={review.lastDecision?.action || "—"} />
          </div>

          {mismatch ? <p data-testid="review-version-warning" className="rounded border border-[#E7DECB] bg-[var(--adm-sand-100)] p-3 text-xs font-semibold text-[#8A6A20]">A kiválasztott verzió eltér a review verziótól: a review döntés csak a review verzióra vonatkozik.</p> : null}

          <div data-testid="review-actions" className="flex flex-wrap gap-2">
            <input value={reviewerId} onChange={(e) => setReviewerId(e.target.value)} placeholder="Reviewer felhasználó ID" className="min-w-[220px] rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm" />
            <AdminButton variant="neutral" disabled={busy || review.status !== "DRAFT" || !reviewerId.trim()} onClick={() => run(() => transitionDocumentReview(review.id, "assign", { reviewerId: reviewerId.trim(), expectedRevision: review.revision }))}>Reviewer kijelölése</AdminButton>
            <AdminButton variant="neutral" disabled={busy || review.status !== "ASSIGNED"} onClick={() => run(() => transitionDocumentReview(review.id, "start", { expectedRevision: review.revision }))}>Review indítása</AdminButton>
            <AdminButton variant="gold" disabled={busy || !["IN_REVIEW", "RESUBMITTED"].includes(String(review.status))} onClick={() => run(() => transitionDocumentReview(review.id, "request-changes", { safeRationale: rationale || undefined, expectedRevision: review.revision }))}>Változtatás kérése</AdminButton>
            <AdminButton variant="neutral" disabled={busy || review.status !== "CHANGES_REQUESTED" || !latestVersion} onClick={() => run(() => transitionDocumentReview(review.id, "resubmit", { versionId: latestVersion?.id, expectedRevision: review.revision }))}>Új verzió review-ra küldése</AdminButton>
            <AdminButton variant="primary" disabled={busy || review.counts.blocking > 0 || !["IN_REVIEW", "RESUBMITTED"].includes(String(review.status)) || mismatch} onClick={() => run(() => transitionDocumentReview(review.id, "approve", { versionId: review.reviewVersionId, expectedRevision: review.revision }))}>Jóváhagyás</AdminButton>
            <AdminButton variant="neutral" disabled={busy || !["APPROVED", "IN_REVIEW", "CHANGES_REQUESTED", "RESUBMITTED", "ASSIGNED", "DRAFT"].includes(String(review.status))} onClick={() => run(() => transitionDocumentReview(review.id, "close", { expectedRevision: review.revision }))}>Review lezárása</AdminButton>
            <AdminButton variant="muted" disabled={busy || ["APPROVED", "CLOSED", "CANCELLED"].includes(String(review.status))} onClick={() => run(() => transitionDocumentReview(review.id, "cancel", { expectedRevision: review.revision }))}>Review megszakítása</AdminButton>
          </div>
          {review.counts.blocking > 0 ? <p data-testid="approval-blocked" className="text-xs font-semibold text-[var(--adm-terracotta-700)]">Jóváhagyás blokkolva: van nyitott blokkoló review pont.</p> : null}

          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
            <div className="min-w-0 space-y-3">
              <div data-testid="review-point-filters" className="flex flex-wrap gap-2">
                {[['all','Mind'],['open','Nyitott'],['blocking','Blokkoló'],['resolved','Megoldott'],['annotation','Annotáció'],['comparison','Összehasonlítás'],['whole','Teljes dokumentum'],['task','Feladat']].map(([value,label]) => (
                  <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded px-2 py-1 text-xs font-semibold ${filter === value ? 'bg-[var(--adm-green-800)] text-white' : 'bg-[var(--adm-surface)] text-[#3D4842]'}`}>{label}</button>
                ))}
              </div>
              <div data-testid="review-point-list" className="space-y-2">
                {filteredPoints.length === 0 ? <p className="rounded border border-dashed border-[rgba(22,32,26,0.18)] p-3 text-xs text-[var(--adm-text-muted)]">Nincs ilyen review pont.</p> : filteredPoints.map((point) => (
                  <div key={point.id} className="rounded border border-[rgba(22,32,26,0.12)] bg-[var(--adm-surface)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <b className="text-sm text-[var(--adm-text)]">{point.title}</b>
                      <span className="flex flex-wrap gap-1"><AdminBadge tone={point.severity === "BLOCKING" ? "burgundy" : "neutral"}>{severityLabel[point.severity]}</AdminBadge><AdminBadge tone={closedPointStatuses.has(point.status) ? "green" : "gold"}>{point.status}</AdminBadge></span>
                    </div>
                    <p className="mt-1 text-xs text-[#3D4842]">{typeLabel[point.type]} · kör: {review.rounds.find((r) => r.id === point.reviewRoundId)?.roundNumber || "—"}{point.carriedFromPointId ? " · továbbvitt pont" : ""}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--adm-text-muted)]">
                      {point.annotationId ? <a href={`#annotation-${point.annotationId}`}>Annotáció link</a> : null}
                      {point.comparisonSegmentId ? <a href={`#comparison-segment-${point.comparisonSegmentId}`}>Összehasonlítási szegmens</a> : null}
                      {point.linkedTaskId ? <span>Feladat: {point.linkedTaskId.slice(0, 8)}…</span> : null}
                    </div>
                    {!closedPointStatuses.has(point.status) ? <AdminButton className="mt-2" size="xs" variant="neutral" disabled={busy} onClick={() => run(() => updateReviewPoint(review.id, point.id, { status: "RESOLVED", expectedRevision: point.revision }))}>Pont lezárása</AdminButton> : null}
                  </div>
                ))}
              </div>
            </div>
            <aside data-testid="review-point-editor" className="min-w-0 rounded border border-[rgba(22,32,26,0.12)] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Review pont szerkesztő</p>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-2 w-full rounded border px-3 py-2 text-sm" />
              <select value={type} onChange={(e) => setType(e.target.value as ReviewPointType)} className="mt-2 w-full rounded border px-3 py-2 text-sm"><option value="WHOLE_DOCUMENT">Teljes dokumentum</option><option value="ANNOTATION">Annotáció</option><option value="COMPARISON_CHANGE">Összehasonlítási változás</option></select>
              <select value={severity} onChange={(e) => setSeverity(e.target.value as ReviewPointSeverity)} className="mt-2 w-full rounded border px-3 py-2 text-sm"><option value="INFO">Info</option><option value="NORMAL">Normál</option><option value="IMPORTANT">Fontos</option><option value="BLOCKING">Blokkoló</option></select>
              <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={3} maxLength={2000} placeholder="Belső indoklás" className="mt-2 w-full rounded border px-3 py-2 text-sm" />
              <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{rationale.length}/2000 · dokumentumtörzs nem kerül mentésre</p>
              <AdminButton className="mt-3 w-full" variant="primary" disabled={busy || !title.trim()} onClick={() => run(() => addReviewPoint(review.id, { title, type, severity, internalRationale: rationale || undefined }))}>Review pont hozzáadása</AdminButton>
            </aside>
          </div>

          <div data-testid="review-decision-history" className="rounded border border-[rgba(22,32,26,0.12)] bg-[var(--adm-surface)] p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Döntési napló</p>
            <div className="mt-2 grid gap-2">
              {decisions.map((decision) => <p key={decision.id} className="text-xs text-[#3D4842]"><b>{decision.action}</b> · {new Date(decision.createdAt).toLocaleString("hu-HU")} · verzió: {decision.versionId ? decision.versionId.slice(0, 8) : "—"}</p>)}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded border border-[rgba(22,32,26,0.10)] bg-[var(--adm-surface)] p-3"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">{label}</p><p className="mt-1 truncate text-sm font-semibold text-[var(--adm-text)]">{value}</p></div>;
}
