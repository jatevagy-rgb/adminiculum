"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminButton } from "@/components/adminiculum/ui";
import {
  approveAiPromptDraft,
  getCaseDocuments,
  importAiPromptResponse,
  listAiPromptTemplates,
  prepareAiPrompt,
  returnAiPromptDraft,
  verifyAiPromptDraft,
  type AiPromptDraft,
  type AiPromptTemplate,
  type DocumentItem,
} from "@/lib/api";

type Props = {
  caseId: string;
  documentId?: string;
  documentVersionId?: string | null;
  onClose: () => void;
};

export function AIPromptPreparationModal({ caseId, documentId, documentVersionId, onClose }: Props) {
  const [templates, setTemplates] = useState<AiPromptTemplate[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>(documentId ? [documentId] : []);
  const [instruction, setInstruction] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [draft, setDraft] = useState<AiPromptDraft | null>(null);
  const [importedResponse, setImportedResponse] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([listAiPromptTemplates(), getCaseDocuments(caseId)])
      .then(([templateResult, caseDocuments]) => {
        setTemplates(templateResult.items);
        setDocuments(caseDocuments);
        setTemplateId(templateResult.items[0]?.id || "");
        if (!documentId && caseDocuments.length === 1) setSelectedDocumentIds([caseDocuments[0].id]);
      })
      .catch(() => setError("Az AI-előkészítő adatok nem tölthetők be."));
  }, [caseId, documentId]);

  const selectedDocuments = useMemo(
    () => documents.filter((document) => selectedDocumentIds.includes(document.id)),
    [documents, selectedDocumentIds],
  );

  async function run(action: () => Promise<AiPromptDraft>) {
    setBusy(true);
    setError(null);
    try {
      setDraft(await action());
    } catch (err) {
      setError(err instanceof Error ? err.message : "A művelet nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  async function prepare() {
    if (!templateId) {
      setError("Válassz egy jogi munkapromptot.");
      return;
    }
    await run(() => prepareAiPrompt(caseId, {
      promptTemplateId: templateId,
      sourceDocumentIds: selectedDocumentIds,
      sourceDocumentVersionIds: documentVersionId ? [documentVersionId] : [],
      lawyerInstruction: instruction || null,
      additionalContext: additionalContext || null,
    }));
  }

  async function importResult() {
    if (!draft || !importedResponse.trim()) return;
    await run(() => importAiPromptResponse(draft.id, importedResponse));
  }

  const toggleDocument = (id: string) => {
    setSelectedDocumentIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" role="presentation">
      <section className="w-full max-w-4xl rounded-xl border border-[var(--adm-border)] bg-[var(--adm-surface)] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="ai-prompt-title">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--adm-border)] px-5 py-4">
          <div>
            <h2 id="ai-prompt-title" className="font-serif text-xl font-semibold text-[var(--adm-text)]">AI előkészítés</h2>
            <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Adminiculum nem hív külső AI-t. Csak az általad kiválasztott, anonimizált szöveg hagyja el a rendszert.</p>
          </div>
          <AdminButton variant="neutral" size="xs" onClick={onClose} disabled={busy}>Bezárás</AdminButton>
        </header>

        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <div className="space-y-4">
            <label className="block text-xs font-semibold text-[var(--adm-text)]">
              Jogi munkaprompt
              <select value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--adm-border)] bg-white px-2.5 py-2 text-sm">
                <option value="">Válassz promptot</option>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.title} · v{template.version}</option>)}
              </select>
            </label>

            <fieldset>
              <legend className="text-xs font-semibold text-[var(--adm-text)]">Kiválasztott dokumentumok</legend>
              <div className="mt-1 space-y-1 rounded-md border border-[var(--adm-border)] bg-white p-2">
                {documents.length === 0 ? <p className="text-xs text-[var(--adm-text-muted)]">Nincs kiválasztható dokumentum.</p> : documents.map((document) => (
                  <label key={document.id} className="flex items-center gap-2 px-1 py-1 text-xs text-[var(--adm-text)]">
                    <input type="checkbox" checked={selectedDocumentIds.includes(document.id)} onChange={() => toggleDocument(document.id)} />
                    <span className="truncate">{document.fileName}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block text-xs font-semibold text-[var(--adm-text)]">
              Ügyvédi instrukció
              <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} rows={4} className="mt-1 w-full rounded-md border border-[var(--adm-border)] bg-white px-2.5 py-2 text-sm" placeholder="Mit kell az AI-nak előkészítenie?" />
            </label>

            <label className="block text-xs font-semibold text-[var(--adm-text)]">
              További kontextus
              <textarea value={additionalContext} onChange={(event) => setAdditionalContext(event.target.value)} rows={3} className="mt-1 w-full rounded-md border border-[var(--adm-border)] bg-white px-2.5 py-2 text-sm" />
            </label>

            {error ? <p role="alert" className="text-xs text-[var(--adm-terracotta-700)]">{error}</p> : null}
            <AdminButton variant="primary" size="sm" onClick={() => void prepare()} disabled={busy || !templateId}>
              {busy ? "Előkészítés…" : "Anonimizált csomag előkészítése"}
            </AdminButton>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-[var(--adm-border)] bg-white p-3">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Mit küldesz ki?</h3>
              <p className="mt-2 text-sm text-[var(--adm-text)]">Dokumentumok: {selectedDocuments.length}</p>
              <p className="text-sm text-[var(--adm-text)]">Eredeti dokumentum: nem módosul</p>
              <p className="text-sm text-[var(--adm-text)]">Külső AI-hívás: nincs</p>
            </div>

            {draft ? (
              <>
                <div className="rounded-lg border border-[var(--adm-border)] bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Anonimizált kimenet</h3>
                    <div className="flex gap-1">
                      <AdminButton variant="neutral" size="xs" onClick={() => void navigator.clipboard.writeText(draft.externalPromptText)}>COPY PROMPT</AdminButton>
                      <AdminButton variant="neutral" size="xs" onClick={() => {
                        const blob = new Blob([draft.externalPromptText], { type: "text/plain;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = `${draft.promptTemplateStableKey}-v${draft.promptTemplateVersion}.txt`;
                        link.click();
                        URL.revokeObjectURL(url);
                      }}>EXPORT PROMPT</AdminButton>
                    </div>
                  </div>
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-[var(--adm-ivory-100)] p-2 text-xs leading-5 text-[var(--adm-text)]">{draft.externalPromptText}</pre>
                </div>

                {draft.status === "PREPARED" || draft.status === "RETURNED_FOR_CORRECTION" ? (
                  <div className="rounded-lg border border-[var(--adm-border)] bg-white p-3">
                    <label className="block text-xs font-semibold text-[var(--adm-text)]">
                      AI válasz visszaillesztése
                      <textarea value={importedResponse} onChange={(event) => setImportedResponse(event.target.value)} rows={6} className="mt-1 w-full rounded-md border border-[var(--adm-border)] px-2.5 py-2 text-sm" placeholder="Illeszd be az AI válaszát." />
                    </label>
                    <AdminButton variant="primary" size="sm" onClick={() => void importResult()} disabled={busy || !importedResponse.trim()}>Importálás AI DRAFT-ként</AdminButton>
                  </div>
                ) : null}

                {draft.status === "AI_DRAFT" || draft.status === "JUNIOR_VERIFIED" ? (
                  <div className="rounded-lg border border-[var(--adm-border)] bg-white p-3">
                    <p className="text-xs font-semibold text-[var(--adm-text)]">Állapot: {draft.status}</p>
                    {draft.rehydratedResponse ? <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-[var(--adm-ivory-100)] p-2 text-xs leading-5">{draft.rehydratedResponse}</pre> : null}
                    <textarea value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} rows={2} className="mt-2 w-full rounded-md border border-[var(--adm-border)] px-2.5 py-2 text-sm" placeholder="Ellenőrzési megjegyzés" />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {draft.status === "AI_DRAFT" ? <AdminButton variant="neutral" size="xs" onClick={() => void run(() => verifyAiPromptDraft(draft.id, reviewNotes))}>Junior verified</AdminButton> : null}
                      {draft.status === "JUNIOR_VERIFIED" ? <AdminButton variant="primary" size="xs" onClick={() => void run(() => approveAiPromptDraft(draft.id, reviewNotes))}>Lawyer approves</AdminButton> : null}
                      <AdminButton variant="neutral" size="xs" onClick={() => void run(() => returnAiPromptDraft(draft.id, reviewNotes))}>Visszaküldés</AdminButton>
                    </div>
                  </div>
                ) : null}
              </>
            ) : <p className="text-sm text-[var(--adm-text-muted)]">Az előnézet az anonimizált csomag előkészítése után jelenik meg.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
