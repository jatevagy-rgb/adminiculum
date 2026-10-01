"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  listDocumentLegalAnalyses,
  createDocumentLegalAnalysis,
  updateLegalAnalysis,
  getCaseDocuments,
  getLegalAnalysis,
  type DocumentItem,
  type LegalAnalysisRecord,
} from "@/lib/api";
import { AdminButton, AdminBadge } from "@/components/adminiculum/ui";
import {
  copyDirectPromptToClipboard,
  ClipboardFallbackModal,
} from "./clipboard";
import {
  buildDirectRiskMatrixPrompt,
  resolveSafePromptContext,
  type SanitizedContextSource,
} from "./safeContextAdapter";
import {
  parseRiskMatrixInput,
  serializeToMarkdownTable,
  SEVERITY_OPTIONS,
  PROBABILITY_OPTIONS,
  type RiskMatrixRow,
} from "./riskMatrixParser";

export interface WordRiskMatrixPanelProps {
  caseId: string;
  clientId: string | null;
  documentId?: string | null;
  readOnly?: boolean;
  onChanged?: () => void;
  sanitizedContext?: SanitizedContextSource;
}

export function isMatrixOnlyAnalysis(text: string): boolean {
  if (!text.trim()) return true;
  const parsed = parseRiskMatrixInput(text);
  return parsed.rows.length > 0 && parsed.malformedLines.length === 0 &&
    parsed.recognizedFormat === "markdown" &&
    text.trim().replace(/\r\n/g, "\n") === serializeToMarkdownTable(parsed.rows);
}

export function isExplicitCaseDocument(
  caseId: string,
  documentId: string | null | undefined,
  documents: readonly Pick<DocumentItem, "id" | "caseId">[],
): boolean {
  return Boolean(caseId && documentId && documents.some((doc) => doc.id === documentId && doc.caseId === caseId));
}

export function WordRiskMatrixPanel({
  caseId,
  clientId,
  documentId: propDocumentId,
  readOnly = false,
  onChanged,
  sanitizedContext,
}: WordRiskMatrixPanelProps) {
  const [rows, setRows] = useState<RiskMatrixRow[]>([]);
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  const [resolvedDocId, setResolvedDocId] = useState<string | null>(null);
  const [targetScope, setTargetScope] = useState<string | null>(null);
  const scope = `${caseId}\u0000${clientId ?? ""}\u0000${propDocumentId ?? ""}`;
  const promptInputScope = `${scope}\u0000${sanitizedContext?.sourceId ?? ""}\u0000${sanitizedContext?.documentVersionId ?? ""}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const currentPromptScope = useRef(promptInputScope);
  currentPromptScope.current = promptInputScope;
  const drafts = useRef(new Map<string, RiskMatrixRow[]>());
  const previousScope = useRef(scope);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Paste dialog state
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [malformedWarning, setMalformedWarning] = useState<string | null>(null);

  // Direct prompt copy state
  const [promptCopied, setPromptCopied] = useState(false);
  const [fallbackPromptText, setFallbackPromptText] = useState<string | null>(null);
  const [promptScope, setPromptScope] = useState<string | null>(null);
  const promptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing risk matrix analysis
  const loadExistingMatrix = useCallback(async () => {
    const requestScope = scope;
    setLoading(true);
    setSaveError(null);
    setActiveAnalysisId(null);
    setResolvedDocId(null);
    setTargetScope(null);
    try {
      if (!propDocumentId) {
        setSaveError("A mentéshez válasszon ki egy konkrét dokumentumot az ügyben.");
        return;
      }
      const docs = await getCaseDocuments(caseId);
      if (currentScope.current !== requestScope) return;
      if (!isExplicitCaseDocument(caseId, propDocumentId, docs)) {
        throw new Error("A kiválasztott dokumentum nem tartozik ehhez az ügyhöz.");
      }
      const analyses = await listDocumentLegalAnalyses(propDocumentId, { caseId });
      if (currentScope.current !== requestScope) return;
      const candidates = analyses.filter((a) => a.caseId === caseId && a.documentId === propDocumentId &&
        (a.title === "Kockázati mátrix (Word-workflow)" || a.title === "Kockázati mátrix (Word-workflow; önálló)") && a.sourceType === "MANUAL");
      const details = await Promise.all(candidates.map((candidate) => getLegalAnalysis(candidate.id)));
      if (currentScope.current !== requestScope) return;
      const compatible = details.filter((full) => full.caseId === caseId && full.documentId === propDocumentId &&
        candidates.some((candidate) => candidate.id === full.id) && isMatrixOnlyAnalysis(full.analysisText));
      if (compatible.length > 1) throw new Error("Több külön mátrix rekord található; válasszon egyet a dokumentum nézetben.");
      if (compatible.length === 1) {
        setActiveAnalysisId(compatible[0].id);
        if (!drafts.current.has(requestScope)) setRows(parseRiskMatrixInput(compatible[0].analysisText).rows);
      }
      setResolvedDocId(propDocumentId);
      setTargetScope(requestScope);
    } catch (err) {
      if (currentScope.current === requestScope) setSaveError(err instanceof Error ? err.message : "A mátrix betöltése sikertelen. A helyi módosítások megmaradtak.");
    } finally {
      if (currentScope.current === requestScope) setLoading(false);
    }
  }, [caseId, propDocumentId, scope]);

  useEffect(() => {
    if (previousScope.current !== scope) {
      drafts.current.set(previousScope.current, rowsRef.current);
      previousScope.current = scope;
      setRows(drafts.current.get(scope) ?? []);
      setFallbackPromptText(null);
      setPromptCopied(false);
      setSaveSuccess(false);
      setSaving(false);
    }
    void loadExistingMatrix();
    return () => {
      if (promptTimer.current) clearTimeout(promptTimer.current);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [loadExistingMatrix, scope]);

  useEffect(() => {
    setPromptCopied(false);
    setFallbackPromptText(null);
    return () => { if (promptTimer.current) clearTimeout(promptTimer.current); };
  }, [promptInputScope]);

  // Handle direct prompt copy
  const handleCopyRiskPrompt = async () => {
    const requestScope = promptInputScope;
    try {
      if (currentPromptScope.current !== requestScope) return;
      const safeContext = await resolveSafePromptContext(sanitizedContext, { caseId, clientId, documentId: propDocumentId });
      if (currentPromptScope.current !== requestScope) return;
      const promptText = buildDirectRiskMatrixPrompt({
        caseId,
        clientId,
        documentId: propDocumentId,
        sanitizedContext: safeContext,
      });

      const res = await copyDirectPromptToClipboard(promptText);
      if (currentPromptScope.current !== requestScope) return;
      if (res.success) {
        setPromptCopied(true);
        setPromptScope(requestScope);
        if (promptTimer.current) clearTimeout(promptTimer.current);
        promptTimer.current = setTimeout(() => setPromptCopied(false), 2500);
      } else {
        setFallbackPromptText(promptText);
        setPromptScope(requestScope);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "A prompt generálása sikertelen.");
    }
  };

  // Handle pasting TSV / Markdown
  const handleApplyPaste = () => {
    if (!pasteText.trim()) {
      setPasteDialogOpen(false);
      return;
    }

    const result = parseRiskMatrixInput(pasteText);
    if (result.rows.length > 0) {
      setRows((prev) => [...prev, ...result.rows]);
      if (result.malformedLines.length > 0) {
        setMalformedWarning(
          `Néhány sor formátuma nem volt felismerhető, ezért nem került beillesztésre:\n${result.malformedLines.join("\n")}`
        );
      } else {
        setMalformedWarning(null);
      }
      setPasteText("");
      setPasteDialogOpen(false);
    } else {
      setMalformedWarning(
        "Nem sikerült táblázatot felismerni a beillesztett szövegben. Ellenőrizze, hogy TSV (tabulátorral tagolt) vagy Markdown (|) táblázatot másolt-e be."
      );
    }
  };

  // Add empty row
  const handleAddRow = () => {
    const newRow: RiskMatrixRow = {
      id: "risk-" + Math.random().toString(36).substring(2, 9),
      risk: "",
      severity: "Közepes",
      probability: "Közepes",
      clause: "",
      mitigation: "",
    };
    setRows((prev) => [...prev, newRow]);
  };

  // Update cell
  const handleCellChange = (id: string, field: keyof RiskMatrixRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  // Delete row
  const handleDeleteRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  // Save changes to backend
  const handleSave = async () => {
    const requestScope = scope;
    if (!resolvedDocId || targetScope !== requestScope || loading || saving) {
      setSaveError("A mentéshez előbb egy ellenőrzött dokumentumot kell kiválasztani.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const markdown = serializeToMarkdownTable(rows);

      if (activeAnalysisId) {
        const current = await getLegalAnalysis(activeAnalysisId);
        if (currentScope.current !== requestScope || current.caseId !== caseId || current.documentId !== resolvedDocId || !isMatrixOnlyAnalysis(current.analysisText)) throw new Error("A mentési cél megváltozott; a helyi módosítások megmaradtak.");
        await updateLegalAnalysis(activeAnalysisId, {
          analysisText: markdown,
        });
      } else if (resolvedDocId) {
        const created = await createDocumentLegalAnalysis(resolvedDocId, {
          caseId,
          title: "Kockázati mátrix (Word-workflow; önálló)",
          analysisText: markdown,
          sourceType: "MANUAL",
          status: "DRAFT",
        });
        if (currentScope.current !== requestScope) return;
        if (created.caseId !== caseId || created.documentId !== resolvedDocId) throw new Error("A létrehozott mátrix rekord azonosítója nem egyezik a kiválasztott dokumentummal.");
        setActiveAnalysisId(created.id);
      } else {
        // No document attached to case yet
        throw new Error(
          "A mentéshez legalább egy csatolt dokumentum szükséges az ügyben. Az adatok nem vesztek el, a felület megőrizte a módosításokat."
        );
      }

      if (currentScope.current !== requestScope) return;
      setSaveSuccess(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveSuccess(false), 2500);
      onChanged?.();
    } catch (err) {
      // Preserve rows in UI! Do not discard!
      if (currentScope.current === requestScope) setSaveError(
        err instanceof Error
          ? err.message
          : "A mentés sikertelen volt. A beírt módosítások a felületen megmaradtak."
      );
    } finally {
      if (currentScope.current === requestScope) setSaving(false);
    }
  };

  const getSeverityBadgeTone = (sev: string): "green" | "amber" | "burgundy" | "neutral" => {
    const s = sev.toLowerCase();
    if (s.includes("alacsony")) return "green";
    if (s.includes("közepes") || s.includes("kozepes")) return "amber";
    if (s.includes("magas") || s.includes("kritikus")) return "burgundy";
    return "neutral";
  };

  return (
    <div
      className="space-y-4 rounded-lg border border-[var(--adm-border)] bg-white p-4 shadow-sm"
      data-testid="word-risk-matrix-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--adm-border)] pb-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">
            Kockázatelemzés és mátrix
          </span>
          <h3 className="text-[16px] font-bold text-[var(--adm-text)]">
            Kockázati mátrix táblázat
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Direct Risk Matrix Prompt Button */}
          <AdminButton
            variant="ai"
            size="sm"
            onClick={() => void handleCopyRiskPrompt()}
            className="min-h-[40px] px-3 font-medium"
            data-testid="copy-risk-matrix-prompt-btn"
          >
            📋 Kockázati mátrix prompt másolása
          </AdminButton>

          {!readOnly ? (
            <>
              <AdminButton
                variant="neutral"
                size="sm"
                onClick={() => setPasteDialogOpen(true)}
                className="min-h-[40px] px-3"
                data-testid="open-risk-paste-dialog-btn"
              >
                📋 Beillesztés (TSV / Markdown)
              </AdminButton>
              <AdminButton
                variant="primary"
                size="sm"
                onClick={() => void handleSave()}
                disabled={saving || loading || targetScope !== scope || !resolvedDocId}
                className="min-h-[40px] px-4"
                data-testid="save-risk-matrix-btn"
              >
                {saving ? "Mentés folyamatban…" : "Mentés"}
              </AdminButton>
            </>
          ) : null}
        </div>
      </div>

      {promptCopied && promptScope === promptInputScope ? (
        <div
          role="status"
          className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-800"
          data-testid="risk-prompt-copied-toast"
        >
          ✓ Kockázati mátrix prompt másolva a vágólapra!
        </div>
      ) : null}

      {saveSuccess ? (
        <div
          role="status"
          className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-800"
          data-testid="risk-save-success-toast"
        >
          ✓ Kockázati mátrix sikeresen mentve.
        </div>
      ) : null}

      {saveError ? (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-800"
          data-testid="risk-save-error-banner"
        >
          ⚠️ {saveError}
        </div>
      ) : null}

      {malformedWarning ? (
        <div
          role="alert"
          className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900"
          data-testid="risk-malformed-warning"
        >
          <p className="font-semibold">Figyelmeztetés a beillesztett adatokkal kapcsolatban:</p>
          <pre className="mt-1 whitespace-pre-wrap font-mono text-[10.5px]">
            {malformedWarning}
          </pre>
        </div>
      ) : null}

      {/* Suggestion disclaimer (not authoritative findings) */}
      <div className="rounded bg-[var(--adm-surface)] px-3 py-2 text-[11px] leading-relaxed text-[var(--adm-text-muted)]">
        ℹ️ <strong>Munkairat tájékoztató:</strong> A táblázatban rögzített kockázatok és javaslatok ügyvédi munkairatként kezelendők; nem minősülnek végleges jogi tanácsnak vagy hatósági megállapításnak.
      </div>

      {/* Editable Table */}
      {loading ? (
        <p className="py-6 text-center text-[12px] text-[var(--adm-text-muted)]">
          Kockázati mátrix betöltése…
        </p>
      ) : rows.length === 0 ? (
        <div
          className="rounded border border-dashed border-[var(--adm-border)] py-8 text-center"
          data-testid="risk-matrix-empty"
        >
          <p className="text-[12.5px] text-[var(--adm-text-muted)]">
            Még nincs rögzített kockázati tétel ebben az ügyben.
          </p>
          {!readOnly ? (
            <div className="mt-3 flex justify-center gap-2">
              <AdminButton
                variant="neutral"
                size="sm"
                onClick={handleAddRow}
                className="min-h-[40px]"
                data-testid="empty-add-risk-btn"
              >
                + Első kockázat hozzáadása
              </AdminButton>
              <AdminButton
                variant="ai"
                size="sm"
                onClick={() => setPasteDialogOpen(true)}
                className="min-h-[40px]"
              >
                Táblázat beillesztése chatből
              </AdminButton>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table
            className="w-full min-w-[700px] border-collapse text-left text-[12px]"
            data-testid="risk-matrix-table"
          >
            <thead>
              <tr className="border-b border-[var(--adm-border)] bg-[var(--adm-surface)] text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--adm-text-muted)]">
                <th className="p-2.5">Kockázat</th>
                <th className="w-28 p-2.5">Súlyosság</th>
                <th className="w-28 p-2.5">Valószínűség</th>
                <th className="w-36 p-2.5">Érintett pont</th>
                <th className="p-2.5">Javasolt kezelés</th>
                {!readOnly ? <th className="w-12 p-2.5 text-center">Törlés</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--adm-border)]">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/50">
                  <td className="p-2">
                    {readOnly ? (
                      <span className="font-medium text-[var(--adm-text)]">{row.risk}</span>
                    ) : (
                      <textarea
                        value={row.risk}
                        onChange={(e) => handleCellChange(row.id, "risk", e.target.value)}
                        placeholder="Kockázat leírása..."
                        rows={2}
                        className="w-full rounded border border-[var(--adm-border)] p-1.5 text-[11.5px] text-[var(--adm-text)] focus:border-[var(--adm-green-800)] focus:outline-none"
                        aria-label="Kockázat leírása"
                      />
                    )}
                  </td>
                  <td className="p-2">
                    {readOnly ? (
                      <AdminBadge tone={getSeverityBadgeTone(row.severity)}>
                        {row.severity}
                      </AdminBadge>
                    ) : (
                      <select
                        value={row.severity}
                        onChange={(e) => handleCellChange(row.id, "severity", e.target.value)}
                        className="w-full rounded border border-[var(--adm-border)] p-1.5 text-[11px] font-medium text-[var(--adm-text)] focus:border-[var(--adm-green-800)] focus:outline-none"
                        aria-label="Súlyosság"
                      >
                        {SEVERITY_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="p-2">
                    {readOnly ? (
                      <AdminBadge tone="neutral">{row.probability}</AdminBadge>
                    ) : (
                      <select
                        value={row.probability}
                        onChange={(e) => handleCellChange(row.id, "probability", e.target.value)}
                        className="w-full rounded border border-[var(--adm-border)] p-1.5 text-[11px] font-medium text-[var(--adm-text)] focus:border-[var(--adm-green-800)] focus:outline-none"
                        aria-label="Valószínűség"
                      >
                        {PROBABILITY_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="p-2">
                    {readOnly ? (
                      <span className="text-[var(--adm-text-secondary)]">{row.clause}</span>
                    ) : (
                      <input
                        type="text"
                        value={row.clause}
                        onChange={(e) => handleCellChange(row.id, "clause", e.target.value)}
                        placeholder="pl. 7.2. pont"
                        className="w-full rounded border border-[var(--adm-border)] p-1.5 text-[11px] text-[var(--adm-text)] focus:border-[var(--adm-green-800)] focus:outline-none"
                        aria-label="Érintett szerződéses pont"
                      />
                    )}
                  </td>
                  <td className="p-2">
                    {readOnly ? (
                      <span className="text-[var(--adm-text)]">{row.mitigation}</span>
                    ) : (
                      <textarea
                        value={row.mitigation}
                        onChange={(e) => handleCellChange(row.id, "mitigation", e.target.value)}
                        placeholder="Javasolt ügyvédi teendő vagy módosítás..."
                        rows={2}
                        className="w-full rounded border border-[var(--adm-border)] p-1.5 text-[11.5px] text-[var(--adm-text)] focus:border-[var(--adm-green-800)] focus:outline-none"
                        aria-label="Javasolt kezelés"
                      />
                    )}
                  </td>
                  {!readOnly ? (
                    <td className="p-2 text-center align-middle">
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(row.id)}
                        title="Sor törlése"
                        aria-label={`Sor törlése: ${row.risk || "kockázat"}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded text-[16px] text-red-600 hover:bg-red-50 hover:text-red-800"
                      >
                        ✕
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>

          {!readOnly ? (
            <div className="mt-3 flex items-center justify-between">
              <AdminButton
                variant="neutral"
                size="sm"
                onClick={handleAddRow}
                className="min-h-[40px] px-3"
                data-testid="add-risk-row-btn"
              >
                + Új kockázat hozzáadása
              </AdminButton>
              <span className="text-[11px] text-[var(--adm-text-muted)]">
                Összesen: {rows.length} kockázati sor
              </span>
            </div>
          ) : null}
        </div>
      )}

      {/* Paste Modal */}
      {pasteDialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="paste-dialog-title"
        >
          <div className="w-full max-w-2xl rounded-lg border border-[var(--adm-border)] bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--adm-border)] pb-3">
              <h2 id="paste-dialog-title" className="text-[15px] font-bold text-[var(--adm-text)]">
                Kockázati táblázat beillesztése (TSV / Markdown)
              </h2>
              <button
                type="button"
                onClick={() => setPasteDialogOpen(false)}
                aria-label="Bezárás"
                className="flex h-10 w-10 items-center justify-center rounded text-[18px] text-[var(--adm-text-muted)] hover:bg-[var(--adm-surface)]"
              >
                ×
              </button>
            </div>

            <p className="mt-3 text-[12px] leading-relaxed text-[var(--adm-text-muted)]">
              Másolja be az AI chatből vagy Excelből a kockázati táblázatot. A rendszer automatikusan felismeri a Markdown (|) és a tabulátorral (TSV) tagolt formátumokat.
            </p>

            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={8}
              placeholder={`| Kockázat | Súlyosság | Valószínűség | Érintett pont | Javasolt kezelés |\n|---|---|---|---|---|\n| Fizetési késedelem kötbére | Magas | Közepes | 4.2. pont | Módosítás napi 0.1%-ra |`}
              className="mt-3 w-full rounded border border-[var(--adm-border)] p-3 font-mono text-[11.5px] leading-5 text-[var(--adm-text)] focus:border-[var(--adm-green-800)] focus:outline-none"
              aria-label="Beillesztendő táblázat szövege"
            />

            <div className="mt-4 flex justify-end gap-2">
              <AdminButton
                variant="neutral"
                size="md"
                onClick={() => setPasteDialogOpen(false)}
                className="min-h-[40px]"
              >
                Mégse
              </AdminButton>
              <AdminButton
                variant="primary"
                size="md"
                onClick={handleApplyPaste}
                disabled={!pasteText.trim()}
                className="min-h-[40px] px-5"
                data-testid="apply-pasted-table-btn"
              >
                Táblázat beillesztése és feldolgozása
              </AdminButton>
            </div>
          </div>
        </div>
      ) : null}

      {/* Fallback modal for prompt copy failure */}
      <ClipboardFallbackModal
        open={Boolean(fallbackPromptText && promptScope === promptInputScope)}
        text={promptScope === promptInputScope ? fallbackPromptText || "" : ""}
        onClose={() => setFallbackPromptText(null)}
      />
    </div>
  );
}
