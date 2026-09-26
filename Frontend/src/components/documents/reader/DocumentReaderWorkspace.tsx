"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  acceptDocumentModificationProposal,
  createDocumentModificationProposal,
  createDocumentReviewComment,
  createDocumentReviewCommentReply,
  getCurrentUser,
  getDocumentAnnotationComments,
  rejectDocumentModificationProposal,
  withdrawDocumentModificationProposal,
  type CurrentUser,
  type DocumentAnnotationComment,
  type DocumentReviewRailComment,
  type DocumentReviewRailProposal,
} from "@/lib/api";
import { isVersionScopedTextPlan, type VersionTextPlan } from "@/lib/documents/versionTextPlan";
import { findReaderMatchOffsets } from "@/lib/documents/readerSearch";
import { AdminBadge } from "@/components/adminiculum/ui";
import {
  computeExactSelectionAnchor,
  splitTextByHighlights,
  type ExactSelectionAnchor,
  type HighlightRange,
} from "@/lib/documents/readerDomRange";
import { DocumentReviewRail, type RailFilter } from "./DocumentReviewRail";
import { DocumentReaderRailDrawer } from "./DocumentReaderRailDrawer";
import { DocumentSelectionToolbar } from "./DocumentSelectionToolbar";
import { ReviewCommentComposer } from "./ReviewCommentComposer";
import { ModificationProposalComposer } from "./ModificationProposalComposer";
import { ProposalDecisionDialog } from "./ProposalDecisionDialog";
import { useDocumentReviewRail } from "./useDocumentReviewRail";
import { canDecideProposal } from "./readerContracts";
import { readerCopy } from "./readerCopy";

export interface DocumentReaderWorkspaceProps {
  caseId: string;
  caseLabel: string;
  clientLabel: string | null;
  documentId: string | null;
  documentVersionId: string | null;
  documentTitle: string;
  fileTypeLabel: string;
  versionNumber: number | null;
  isHistoricalVersion: boolean;
  plan: VersionTextPlan;
  versionText: string | null;
  documentTextPreview: string | null;
  isLoadingText: boolean;
  textUnavailableReason: string | null;
  onBackToCase: () => void;
  onDownload: (() => void) | null;
  onNewVersion: (() => void) | null;
  wordHandoffUrl: string | null;
  onOpenAdvanced: (mode: 'changes' | 'review' | 'versions') => void;
}

function actionErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return readerCopy.decisionForbidden;
  return readerCopy.actionFailed;
}

export function DocumentReaderWorkspace(props: DocumentReaderWorkspaceProps) {
  const {
    caseId,
    caseLabel,
    clientLabel,
    documentId,
    documentVersionId,
    documentTitle,
    fileTypeLabel,
    versionNumber,
    isHistoricalVersion,
    plan,
    versionText,
    documentTextPreview,
    isLoadingText,
    textUnavailableReason,
    onBackToCase,
    onDownload,
    onNewVersion,
    wordHandoffUrl,
    onOpenAdvanced,
  } = props;

  const versionScoped = isVersionScopedTextPlan(plan);
  const exactText = versionScoped ? versionText : documentTextPreview;
  const canAnchor = versionScoped && Boolean(versionText);

  const readerRootRef = useRef<HTMLDivElement | null>(null);
  const highlightRef = useRef<HTMLElement | null>(null);
  const railToggleRef = useRef<HTMLButtonElement | null>(null);

  const { rail, loading: railLoading, error: railError, reload: reloadRail } = useDocumentReviewRail(documentId, documentVersionId);
  const [railFilter, setRailFilter] = useState<RailFilter>('all');
  const [railDrawerOpen, setRailDrawerOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  const [anchor, setAnchor] = useState<ExactSelectionAnchor | null>(null);
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(null);
  const [anchorError, setAnchorError] = useState<string | null>(null);

  const [commentComposerOpen, setCommentComposerOpen] = useState(false);
  const [proposalComposerOpen, setProposalComposerOpen] = useState(false);
  const [composerBusy, setComposerBusy] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);

  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [highlightRange, setHighlightRange] = useState<{ start: number; end: number } | null>(null);

  const [rejectTarget, setRejectTarget] = useState<DocumentReviewRailProposal | null>(null);
  const [decisionBusyId, setDecisionBusyId] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const [repliesByAnnotationId, setRepliesByAnnotationId] = useState<Record<string, DocumentAnnotationComment[]>>({});
  const [replyBusyId, setReplyBusyId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then((user) => { if (!cancelled) setCurrentUser(user); })
      .catch(() => { if (!cancelled) setCurrentUser(null); });
    return () => { cancelled = true; };
  }, []);

  // Any document/version change must clear every version-scoped transient.
  useEffect(() => {
    setAnchor(null);
    setToolbarPos(null);
    setAnchorError(null);
    setCommentComposerOpen(false);
    setProposalComposerOpen(false);
    setComposerError(null);
    setActiveItemId(null);
    setHighlightRange(null);
    setRejectTarget(null);
    setDecisionError(null);
    setRepliesByAnnotationId({});
    setSearchQuery('');
    setSearchIndex(0);
    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    selection?.removeAllRanges();
  }, [documentId, documentVersionId]);

  const captureSelection = useCallback(() => {
    if (!canAnchor || !versionText) return;
    const selection = typeof window !== 'undefined' ? window.getSelection() : null;

    // Collapsed / empty selection: silently clear without a noisy error.
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setAnchor(null);
      setToolbarPos(null);
      return;
    }

    const next = computeExactSelectionAnchor(readerRootRef.current, selection, versionText);
    if (!next) {
      // A non-collapsed selection that cannot be mapped to the exact version text
      // must NEVER reuse the previous anchor: the toolbar could otherwise submit
      // a comment/proposal against the wrong (earlier) range.
      setAnchor(null);
      setToolbarPos(null);
      setCommentComposerOpen(false);
      setProposalComposerOpen(false);
      setComposerError(null);
      setAnchorError(readerCopy.anchorUnavailable);
      return;
    }
    setAnchor(next);
    setAnchorError(null);
    setCommentComposerOpen(false);
    setProposalComposerOpen(false);
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const rect = range?.getBoundingClientRect();
    if (rect) {
      setToolbarPos({
        top: Math.max(8, rect.top - 44),
        left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - 300)),
      });
    } else {
      setToolbarPos(null);
    }
  }, [canAnchor, versionText]);

  const clearSelection = useCallback(() => {
    if (typeof window !== 'undefined') window.getSelection()?.removeAllRanges();
    setAnchor(null);
    setToolbarPos(null);
  }, []);

  const openCommentComposer = useCallback(() => {
    if (!anchor) return;
    setComposerError(null);
    setCommentComposerOpen(true);
  }, [anchor]);

  const openProposalComposer = useCallback(() => {
    if (!anchor) return;
    setComposerError(null);
    setProposalComposerOpen(true);
  }, [anchor]);

  const submitComment = useCallback(async (body: string) => {
    if (!documentId || !documentVersionId || !anchor) return;
    setComposerBusy(true);
    setComposerError(null);
    try {
      await createDocumentReviewComment(documentId, documentVersionId, {
        selectedText: anchor.selectedText,
        startOffset: anchor.startOffset,
        endOffset: anchor.endOffset,
        textPrefix: anchor.textPrefix,
        textSuffix: anchor.textSuffix,
        body,
      });
      setCommentComposerOpen(false);
      clearSelection();
      reloadRail();
    } catch (error) {
      setComposerError(actionErrorMessage(error));
    } finally {
      setComposerBusy(false);
    }
  }, [anchor, clearSelection, documentId, documentVersionId, reloadRail]);

  const submitProposal = useCallback(async (payload: { proposedText: string; rationale: string }) => {
    if (!documentId || !documentVersionId || !anchor) return;
    setComposerBusy(true);
    setComposerError(null);
    try {
      const created = await createDocumentModificationProposal(documentId, documentVersionId, {
        selectedText: anchor.selectedText,
        startOffset: anchor.startOffset,
        endOffset: anchor.endOffset,
        textPrefix: anchor.textPrefix,
        textSuffix: anchor.textSuffix,
        proposedText: payload.proposedText,
        rationale: payload.rationale || undefined,
      });
      setProposalComposerOpen(false);
      clearSelection();
      setActiveItemId(created.id);
      reloadRail();
    } catch (error) {
      setComposerError(actionErrorMessage(error));
    } finally {
      setComposerBusy(false);
    }
  }, [anchor, clearSelection, documentId, documentVersionId, reloadRail]);

  const focusRailTarget = useCallback((itemId: string, startOffset: number | null, endOffset: number | null) => {
    setActiveItemId(itemId);
    if (startOffset !== null && endOffset !== null && endOffset > startOffset) {
      setHighlightRange({ start: startOffset, end: endOffset });
    } else {
      setHighlightRange(null);
    }
    setRailDrawerOpen(false);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        highlightRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    }
  }, []);

  const focusComment = useCallback((comment: DocumentReviewRailComment) => {
    focusRailTarget(comment.id, comment.startOffset, comment.endOffset);
  }, [focusRailTarget]);

  const focusProposal = useCallback((proposal: DocumentReviewRailProposal) => {
    focusRailTarget(proposal.id, proposal.startOffset, proposal.endOffset);
  }, [focusRailTarget]);

  const loadReplies = useCallback((annotationId: string) => {
    if (!documentId || !documentVersionId) return;
    getDocumentAnnotationComments(documentId, documentVersionId, annotationId)
      .then((response) => {
        setRepliesByAnnotationId((prev) => ({ ...prev, [annotationId]: response.comments }));
      })
      .catch(() => {
        setRepliesByAnnotationId((prev) => ({ ...prev, [annotationId]: [] }));
      });
  }, [documentId, documentVersionId]);

  const submitReply = useCallback((annotationId: string, body: string) => {
    if (!documentId || !documentVersionId) return;
    setReplyBusyId(annotationId);
    createDocumentReviewCommentReply(documentId, documentVersionId, annotationId, body)
      .then(() => {
        loadReplies(annotationId);
        reloadRail();
      })
      .catch(() => undefined)
      .finally(() => setReplyBusyId(null));
  }, [documentId, documentVersionId, loadReplies, reloadRail]);

  const canDecide = canDecideProposal(currentUser?.role);

  const acceptProposal = useCallback((proposal: DocumentReviewRailProposal) => {
    if (!documentId || !documentVersionId) return;
    setDecisionBusyId(proposal.id);
    setDecisionError(null);
    acceptDocumentModificationProposal(documentId, documentVersionId, proposal.id)
      .then(() => { reloadRail(); })
      .catch((error) => { setDecisionError(actionErrorMessage(error)); })
      .finally(() => setDecisionBusyId(null));
  }, [documentId, documentVersionId, reloadRail]);

  const confirmReject = useCallback((reason: string) => {
    if (!documentId || !documentVersionId || !rejectTarget) return;
    setDecisionBusyId(rejectTarget.id);
    setDecisionError(null);
    rejectDocumentModificationProposal(documentId, documentVersionId, rejectTarget.id, reason)
      .then(() => { setRejectTarget(null); reloadRail(); })
      .catch((error) => { setDecisionError(actionErrorMessage(error)); })
      .finally(() => setDecisionBusyId(null));
  }, [documentId, documentVersionId, rejectTarget, reloadRail]);

  const withdrawProposal = useCallback((proposal: DocumentReviewRailProposal) => {
    if (!documentId || !documentVersionId) return;
    setDecisionBusyId(proposal.id);
    setDecisionError(null);
    withdrawDocumentModificationProposal(documentId, documentVersionId, proposal.id)
      .then(() => { reloadRail(); })
      .catch((error) => { setDecisionError(actionErrorMessage(error)); })
      .finally(() => setDecisionBusyId(null));
  }, [documentId, documentVersionId, reloadRail]);

  // ---- Reader text rendering (offsets preserved; wrappers are inline only) ----
  const searchTerm = searchQuery.trim();
  const searchOffsets = useMemo(() => findReaderMatchOffsets(exactText, searchTerm), [exactText, searchTerm]);
  const searchCount = searchOffsets.length;
  const activeSearch = searchCount > 0 ? Math.min(Math.max(searchIndex, 0), searchCount - 1) : 0;

  useEffect(() => { setSearchIndex(0); }, [searchTerm]);

  const segments = useMemo(() => {
    const text = exactText ?? '';
    if (!text) return [];
    const ranges: HighlightRange[] = [];
    if (highlightRange) {
      ranges.push({
        start: highlightRange.start,
        end: highlightRange.end,
        className: 'rounded-[2px] bg-[var(--adm-brand-terracotta-soft)]',
        key: 'active-anchor',
        testId: 'reader-active-anchor',
      });
    }
    if (searchTerm) {
      searchOffsets.forEach((offset, index) => {
        ranges.push({
          start: offset,
          end: offset + searchTerm.length,
          className: index === activeSearch ? 'bg-[var(--adm-semantic-warning-border)]' : 'bg-[var(--adm-semantic-warning-soft)]',
          key: `search-${index}`,
          testId: 'reader-search-match',
        });
      });
    }
    return splitTextByHighlights(text, ranges);
  }, [exactText, highlightRange, searchTerm, searchOffsets, activeSearch]);

  const railCount = rail
    ? rail.counts.commentCount + rail.counts.modificationProposalCount
    : 0;

  const hasDocument = Boolean(documentId);
  const hasVersion = Boolean(documentId && documentVersionId);

  const railNode = !hasVersion ? (
    <section data-testid="document-review-rail" className="flex h-full min-h-0 flex-col">
      <header className="border-b border-[var(--adm-border-canonical)] px-4 py-3">
        <h2 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">{readerCopy.railTitle}</h2>
      </header>
      <div className="px-4 py-3">
        <p data-testid="reader-rail-no-version" className="text-sm text-[var(--adm-text-secondary)]">
          Ehhez a dokumentumhoz nincs verzióalapú észrevétel.
        </p>
      </div>
    </section>
  ) : (
    <DocumentReviewRail
      rail={rail}
      loading={railLoading}
      error={railError}
      onRetry={reloadRail}
      filter={railFilter}
      onFilterChange={setRailFilter}
      activeItemId={activeItemId}
      onFocusComment={focusComment}
      onFocusProposal={focusProposal}
      canDecide={canDecide}
      currentUserId={currentUser?.id ?? null}
      decisionBusyId={decisionBusyId}
      onAccept={acceptProposal}
      onReject={(proposal) => { setDecisionError(null); setRejectTarget(proposal); }}
      onWithdraw={withdrawProposal}
      repliesByAnnotationId={repliesByAnnotationId}
      onLoadReplies={loadReplies}
      onSubmitReply={submitReply}
      replyBusyId={replyBusyId}
    />
  );

  return (
    <div data-testid="document-reader-workspace" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <input type="hidden" value={caseId} readOnly aria-hidden="true" />

      {/* Minimal document header */}
      <header
        data-testid="document-reader-header"
        className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-4 py-3"
      >
        <div className="min-w-0 flex-1">
          <button
            type="button"
            data-testid="document-reader-back"
            onClick={onBackToCase}
            className="text-xs font-semibold text-[var(--adm-brand-green)] hover:underline"
          >
            ← Ügy áttekintése
          </button>
          <h1 className="mt-1 truncate font-serif text-xl font-semibold text-[var(--adm-text-primary)]">
            {documentTitle}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--adm-text-secondary)]">
            <span>{caseLabel}</span>
            {clientLabel ? <span>· {clientLabel}</span> : null}
            {versionNumber !== null ? <span>· v{versionNumber}</span> : null}
            {isHistoricalVersion ? (
              <AdminBadge data-testid="document-reader-historical" tone="neutral">
                {readerCopy.historicalVersion} · v{versionNumber}
              </AdminBadge>
            ) : null}
            <AdminBadge tone="neutral">{fileTypeLabel}</AdminBadge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {wordHandoffUrl ? (
            <a
              data-testid="document-reader-word"
              href={wordHandoffUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-[8px] border border-[var(--adm-border-canonical)] px-3 py-1.5 text-sm font-semibold text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)]"
            >
              Megnyitás Wordben
            </a>
          ) : null}
          {onDownload ? (
            <button
              type="button"
              data-testid="document-reader-download"
              onClick={onDownload}
              className="rounded-[8px] border border-[var(--adm-border-canonical)] px-3 py-1.5 text-sm font-semibold text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)]"
            >
              Letöltés
            </button>
          ) : null}
          {onNewVersion ? (
            <button
              type="button"
              data-testid="document-reader-new-version"
              onClick={onNewVersion}
              className="rounded-[8px] border border-[var(--adm-border-canonical)] px-3 py-1.5 text-sm font-semibold text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)]"
            >
              Új verzió feltöltése
            </button>
          ) : null}
          <details data-testid="document-reader-more" className="relative">
            <summary className="cursor-pointer list-none rounded-[8px] border border-[var(--adm-border-canonical)] px-3 py-1.5 text-sm font-semibold text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)]">
              További műveletek
            </summary>
            <div className="absolute right-0 z-30 mt-1 w-56 rounded-[10px] border border-[var(--adm-border-canonical)] bg-white p-1 shadow-lg">
              <button
                type="button"
                data-testid="document-reader-advanced-changes"
                onClick={() => onOpenAdvanced('changes')}
                className="block w-full rounded-[6px] px-2 py-1.5 text-left text-sm hover:bg-[var(--adm-canvas-subtle)]"
              >
                Változások összehasonlítása
              </button>
              <button
                type="button"
                data-testid="document-reader-advanced-review"
                onClick={() => onOpenAdvanced('review')}
                className="block w-full rounded-[6px] px-2 py-1.5 text-left text-sm hover:bg-[var(--adm-canvas-subtle)]"
              >
                Formális felülvizsgálat
              </button>
              <button
                type="button"
                data-testid="document-reader-advanced-versions"
                onClick={() => onOpenAdvanced('versions')}
                className="block w-full rounded-[6px] px-2 py-1.5 text-left text-sm hover:bg-[var(--adm-canvas-subtle)]"
              >
                Verziótörténet
              </button>
            </div>
          </details>
          {hasVersion ? (
          <button
            type="button"
            ref={railToggleRef}
            data-testid="document-reader-rail-toggle"
            aria-expanded={railDrawerOpen}
            onClick={() => setRailDrawerOpen((value) => !value)}
            className="rounded-[8px] bg-[var(--adm-brand-green)] px-3 py-1.5 text-sm font-semibold text-white lg:hidden"
          >
            {readerCopy.railOpenLabel} ({railCount})
          </button>
          ) : null}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Dominant document reader */}
        <main
          data-testid="document-reader-text"
          className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--adm-canvas-white)]"
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--adm-border-canonical)] px-4 py-2">
            <label className="flex items-center gap-1 text-xs text-[var(--adm-text-secondary)]">
              <span className="sr-only">Keresés a dokumentumszövegben</span>
              <input
                type="search"
                data-testid="document-reader-search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Keresés a szövegben…"
                disabled={!exactText}
                className="w-52 rounded-[6px] border border-[var(--adm-border-canonical)] px-2 py-1 text-xs disabled:opacity-50"
              />
            </label>
            {searchTerm ? (
              <span data-testid="document-reader-search-status" className="text-[11px] text-[var(--adm-text-secondary)]" aria-live="polite">
                {searchCount > 0 ? `${activeSearch + 1} / ${searchCount}` : 'Nincs találat'}
              </span>
            ) : null}
            <button
              type="button"
              data-testid="document-reader-search-prev"
              disabled={searchCount === 0}
              onClick={() => setSearchIndex((index) => (index - 1 + searchCount) % Math.max(1, searchCount))}
              className="rounded-[6px] border border-[var(--adm-border-canonical)] px-2 py-0.5 text-[11px] disabled:opacity-50"
            >
              Előző
            </button>
            <button
              type="button"
              data-testid="document-reader-search-next"
              disabled={searchCount === 0}
              onClick={() => setSearchIndex((index) => (index + 1) % Math.max(1, searchCount))}
              className="rounded-[6px] border border-[var(--adm-border-canonical)] px-2 py-0.5 text-[11px] disabled:opacity-50"
            >
              Következő
            </button>
          </div>

          {!canAnchor && !isLoadingText && exactText ? (
            <p data-testid="document-reader-display-only" className="border-b border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] px-4 py-2 text-xs text-[var(--adm-text-secondary)]">
              {readerCopy.displayOnlyNotice}
            </p>
          ) : null}
          {anchorError ? (
            <p data-testid="document-reader-anchor-error" role="alert" className="border-b border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] px-4 py-2 text-xs text-[var(--adm-brand-terracotta)]">
              {anchorError}
            </p>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--adm-canvas-subtle)] p-4 sm:p-6">
            {!hasDocument ? (
              <div data-testid="document-reader-no-document" className="mx-auto flex max-w-[860px] flex-col items-center justify-center rounded-[4px] border border-dashed border-[var(--adm-border-canonical)] bg-white p-10 text-center">
                <h2 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">Nincs kiválasztott dokumentum</h2>
                <p className="mt-2 max-w-lg text-sm text-[var(--adm-text-secondary)]">Válassz dokumentumot az ügy iratai közül.</p>
              </div>
            ) : isLoadingText ? (
              <div data-testid="document-reader-loading" className="mx-auto h-64 max-w-[860px] animate-pulse rounded-[4px] bg-white" />
            ) : exactText ? (
              <div
                ref={readerRootRef}
                data-testid="document-reader-surface"
                onMouseUp={canAnchor ? captureSelection : undefined}
                onKeyUp={canAnchor ? captureSelection : undefined}
                className="mx-auto max-w-[860px] whitespace-pre-wrap rounded-[2px] border border-[var(--adm-border-canonical)] bg-white p-8 font-serif text-[15px] leading-7 text-[var(--adm-text-primary)] shadow-sm"
              >
                {segments.map((segment, index) =>
                  segment.range ? (
                    <mark
                      key={`${segment.range.key}-${index}`}
                      data-testid={segment.range.testId}
                      ref={segment.range.key === 'active-anchor' ? highlightRef : undefined}
                      className={segment.range.className}
                    >
                      {segment.text}
                    </mark>
                  ) : (
                    <span key={`plain-${index}`}>{segment.text}</span>
                  ),
                )}
              </div>
            ) : (
              <div data-testid="document-reader-unavailable" className="mx-auto flex max-w-[860px] flex-col items-center justify-center rounded-[4px] border border-dashed border-[var(--adm-border-canonical)] bg-white p-10 text-center">
                <h2 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">Az előnézet jelenleg nem érhető el</h2>
                <p className="mt-2 max-w-lg text-sm text-[var(--adm-text-secondary)]">
                  {textUnavailableReason || 'Ehhez a verzióhoz nem sikerült betölteni a tárolt tartalmat. A dokumentum és a verziók továbbra is elérhetők; próbáld letölteni a verziót.'}
                </p>
              </div>
            )}
          </div>
        </main>

        {/* Desktop right rail */}
        <aside
          data-testid="document-reader-rail-desktop"
          className="hidden min-h-0 min-w-0 overflow-hidden border-l border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] lg:flex lg:flex-col"
        >
          {railNode}
        </aside>
      </div>

      {/* Narrow-viewport rail drawer */}
      <DocumentReaderRailDrawer
        open={railDrawerOpen}
        onClose={() => setRailDrawerOpen(false)}
        returnFocusRef={railToggleRef}
      >
        {railNode}
      </DocumentReaderRailDrawer>

      {anchor && toolbarPos ? (
        <DocumentSelectionToolbar
          selectedText={anchor.selectedText}
          onAddComment={openCommentComposer}
          onAddProposal={openProposalComposer}
          style={{ position: 'fixed', top: toolbarPos.top, left: toolbarPos.left }}
        />
      ) : null}

      <ReviewCommentComposer
        open={commentComposerOpen}
        selectedText={anchor?.selectedText ?? ''}
        busy={composerBusy}
        error={composerError}
        targetKey={anchor ? `${anchor.startOffset}:${anchor.endOffset}` : undefined}
        onCancel={() => { setCommentComposerOpen(false); setComposerError(null); }}
        onSubmit={(body) => { void submitComment(body); }}
      />
      <ModificationProposalComposer
        open={proposalComposerOpen}
        selectedText={anchor?.selectedText ?? ''}
        busy={composerBusy}
        error={composerError}
        targetKey={anchor ? `${anchor.startOffset}:${anchor.endOffset}` : undefined}
        onCancel={() => { setProposalComposerOpen(false); setComposerError(null); }}
        onSubmit={(payload) => { void submitProposal(payload); }}
      />
      <ProposalDecisionDialog
        open={Boolean(rejectTarget)}
        busy={Boolean(rejectTarget && decisionBusyId === rejectTarget.id)}
        error={decisionError}
        originalText={rejectTarget?.selectedText ?? ''}
        proposedText={rejectTarget?.proposedText ?? ''}
        targetKey={rejectTarget?.id}
        onCancel={() => { setRejectTarget(null); setDecisionError(null); }}
        onConfirm={(reason) => { void confirmReject(reason); }}
      />
      {decisionError && !rejectTarget ? (
        <p data-testid="document-reader-decision-error" role="alert" className="fixed bottom-4 right-4 z-50 rounded-[8px] bg-[var(--adm-brand-terracotta)] px-3 py-2 text-xs font-semibold text-white">
          {decisionError}
        </p>
      ) : null}
    </div>
  );
}
