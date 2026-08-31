"use client";

/**
 * Contract Workspace document header (CONTRACT-WS-WORK-CONTEXT-HEADER-1).
 *
 * Answers, at a glance and without hunting technical panels: what is this
 * document, why is it in the matter, what must be done, who owns it, who
 * reviews it, when it is due, which task is linked, what the next step is, and
 * which immutable version is selected. It composes the shared work-context
 * blocks and derives every value from the one canonical view model, so the
 * cockpit card, the editor and this header stay consistent.
 *
 * It is read-only with respect to editor/annotation state: it fetches the work
 * context through its own hook and never touches version or annotation state.
 */
import { DocumentWorkContextEditor } from "@/components/documents/DocumentWorkCard";
import { AdminButton } from "@/components/adminiculum/ui";
import { useDocumentWorkContext } from "./useDocumentWorkContext";
import { DocumentIdentityBlock } from "./DocumentIdentityBlock";
import { DocumentWorkInstruction } from "./DocumentWorkInstruction";
import { DocumentResponsibilitySummary } from "./DocumentResponsibilitySummary";
import { DocumentLinkedWorkSummary } from "./DocumentLinkedWorkSummary";
import { DocumentVersionIdentity } from "./DocumentVersionIdentity";
import { DocumentTechnicalDetails } from "./DocumentTechnicalDetails";
import { useState } from "react";
import { AIPromptPreparationModal } from "@/components/ai-prompts/AIPromptPreparationModal";

export function DocumentWorkspaceHeader({
  caseId, documentId, selectedVersion, selectedVersionId, currentVersion, canEdit = true,
  onDownload, onNewVersion, onReview,
}: {
  caseId: string;
  documentId: string;
  selectedVersion?: number | null;
  selectedVersionId?: string | null;
  currentVersion?: number | null;
  canEdit?: boolean;
  onDownload?: () => void;
  onNewVersion?: () => void;
  onReview?: () => void;
}) {
  const { card, view, loading, error, reload, setCard } = useDocumentWorkContext(documentId, { selectedVersion, currentVersion });
  const [editing, setEditing] = useState(false);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);

  const shell = "min-w-0 max-w-full rounded-lg border border-[rgba(22,32,26,0.12)] bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(22,32,26,0.06)]";

  if (loading) {
    return (
      <div data-testid="dwh-loading" className={`${shell} animate-pulse`} aria-busy="true">
        <div className="h-4 w-1/3 rounded bg-[var(--adm-ivory-100)]" />
        <div className="mt-2 h-3 w-1/2 rounded bg-[var(--adm-ivory-100)]" />
        <div className="mt-3 h-8 w-full rounded bg-[var(--adm-ivory-100)]" />
      </div>
    );
  }

  if (error || !card || !view) {
    return (
      <div role="alert" data-testid="dwh-error" className={`${shell} flex items-center justify-between gap-2`}>
        <span className="text-[12px] text-[var(--adm-terracotta-700)]">{error || "A munkakontextus nem érhető el."}</span>
        <AdminButton variant="neutral" size="xs" onClick={reload}>Újratöltés</AdminButton>
      </div>
    );
  }

  return (
    <section data-testid="document-workspace-header" className={shell}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <DocumentIdentityBlock view={view} />
        <div data-testid="dwh-actions" className="flex max-w-full flex-wrap items-center gap-1.5">
          {onDownload ? <AdminButton variant="primary" size="xs" onClick={onDownload}>Letöltés</AdminButton> : null}
          {onNewVersion ? <AdminButton variant="neutral" size="xs" onClick={onNewVersion}>Új verzió</AdminButton> : null}
          {onReview ? <AdminButton variant="neutral" size="xs" onClick={onReview}>Review</AdminButton> : null}
          {canEdit ? <AdminButton variant="neutral" size="xs" onClick={() => setAiPromptOpen(true)}>AI elemzés előkészítése</AdminButton> : null}
          {canEdit ? <AdminButton variant="neutral" size="xs" onClick={() => setEditing(true)}>Munkakontextus</AdminButton> : null}
        </div>
      </div>

      {view.hasWorkContext ? (
        <div className="mt-2 space-y-2">
          <DocumentWorkInstruction view={view} canEdit={canEdit} onEdit={() => setEditing(true)} />
          <DocumentResponsibilitySummary view={view} />
          <DocumentLinkedWorkSummary view={view} />
          <DocumentVersionIdentity view={view} />
        </div>
      ) : (
        <div data-testid="dwh-no-context" className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md bg-[var(--adm-ivory-100)] px-2.5 py-2">
          <p className="min-w-0 text-[12px] text-[var(--adm-text-muted)]">Még nincs munkautasítás vagy felelős beállítva.</p>
          {canEdit ? (
            <AdminButton variant="primary" size="xs" onClick={() => setEditing(true)} data-testid="dwh-set-context">
              Munkakontextus beállítása
            </AdminButton>
          ) : null}
          <div className="w-full"><DocumentVersionIdentity view={view} /></div>
        </div>
      )}

      <div className="mt-2">
        <DocumentTechnicalDetails view={view} />
      </div>

      {editing && canEdit ? (
        <DocumentWorkContextEditor
          card={card}
          onClose={() => setEditing(false)}
          onSaved={(next) => { setCard(next); setEditing(false); }}
        />
      ) : null}
      {aiPromptOpen ? (
        <AIPromptPreparationModal
          caseId={caseId}
          documentId={documentId}
          documentVersionId={selectedVersionId}
          onClose={() => setAiPromptOpen(false)}
        />
      ) : null}
    </section>
  );
}
