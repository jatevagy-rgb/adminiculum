"use client";

import { useEffect, useState } from "react";
import {
  anonymizeDocument,
  getAnonymizationSourceText,
  type AnonymizationMetadataInput,
  type CaseContractListItem,
} from "@/lib/api";

// Minimal structured counterparty input
interface CounterpartyInput {
  name: string;
  side: 'OPPONENT' | 'ADDITIONAL_PARTY';
  partyType?: 'PERSON' | 'COMPANY' | 'UNKNOWN';
}

interface AnonymizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract: CaseContractListItem;
  caseId?: string;
  /** Case client name, for known-party context in the anonymization surface */
  clientName?: string;
  /** Case client role (e.g. "Megbízó", "Ellenérdekű fél"), for known-party context */
  clientRole?: string;
  onSuccess?: (result: AnonymizeResult) => void;
}

export interface AnonymizeResult {
  anonymizedDocumentId: string;
  caseId: string;
  name: string;
  redactedText: string;
  redactedItems: Array<{
    type: string;
    original: string;
    replacement: string;
    position: number;
  }>;
  aiReadyPrompt: string;
}

type AITask = "REVIEW_RISKS" | "COMPARE_TEMPLATE" | "SUMMARIZE" | "CUSTOM";
type RedactionLevel = "FULL" | "CLIENT_ONLY";

const aiTaskOptions: { value: AITask; label: string; description: string }[] = [
  { value: "REVIEW_RISKS", label: "Review Risks", description: "Analyze for legal risks" },
  { value: "COMPARE_TEMPLATE", label: "Compare Template", description: "Compare with standard template" },
  { value: "SUMMARIZE", label: "Summarize", description: "Create document summary" },
  { value: "CUSTOM", label: "Custom", description: "Custom prompt" },
];

const redactionLevelOptions: { value: RedactionLevel; label: string }[] = [
  { value: "FULL", label: "Full Redaction" },
  { value: "CLIENT_ONLY", label: "Client Data Only" },
];

const SOURCE_TEXT_LIMITATION_MESSAGE = "A dokumentum teljes szöveges előnézete jelenleg nem érhető el. Az anonimizálás a feltöltött dokumentum backend feldolgozásán fut.";

export function AnonymizeModal({ isOpen, onClose, contract, caseId, clientName, clientRole, onSuccess }: AnonymizeModalProps) {
  const [aiTask, setAiTask] = useState<AITask>("REVIEW_RISKS");
  const [redactionLevel, setRedactionLevel] = useState<RedactionLevel>("FULL");
  const [customPrompt, setCustomPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AnonymizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedState, setCopiedState] = useState<"redacted" | "prompt" | "both" | null>(null);
  const [sourceTextLoading, setSourceTextLoading] = useState(false);
  const [sourceTextAvailable, setSourceTextAvailable] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [workspaceText, setWorkspaceText] = useState("");
  const [sourceLimitationMessage, setSourceLimitationMessage] = useState(SOURCE_TEXT_LIMITATION_MESSAGE);

  const [metadataClientName, setMetadataClientName] = useState(clientName || "");
  const [metadataClientRole, setMetadataClientRole] = useState(clientRole || "");
  const [metadataCounterparty, setMetadataCounterparty] = useState("");
  const [metadataNotes, setMetadataNotes] = useState("");

  // Structured counterparty (extra-party) input
  const [counterparties, setCounterparties] = useState<CounterpartyInput[]>([]);
  const [newCounterpartyName, setNewCounterpartyName] = useState('');
  const [newCounterpartySide, setNewCounterpartySide] = useState<'OPPONENT' | 'ADDITIONAL_PARTY'>('OPPONENT');

  useEffect(() => {
    setMetadataClientName(clientName || "");
    setMetadataClientRole(clientRole || "");
  }, [clientName, clientRole]);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    const loadSourceText = async () => {
      setSourceTextLoading(true);
      try {
        const response = await getAnonymizationSourceText(contract.id);
        if (!active) return;

        const text = (response.sourceText || "").trim();
        if (response.success && response.textAvailable && text.length > 0) {
          setSourceTextAvailable(true);
          setSourceText(text);
          setWorkspaceText(text);
          setSourceLimitationMessage(SOURCE_TEXT_LIMITATION_MESSAGE);
        } else {
          setSourceTextAvailable(false);
          setSourceText("");
          setWorkspaceText("");
          setSourceLimitationMessage(response.limitationMessage || SOURCE_TEXT_LIMITATION_MESSAGE);
        }
      } catch {
        if (!active) return;
        setSourceTextAvailable(false);
        setSourceText("");
        setWorkspaceText("");
        setSourceLimitationMessage(SOURCE_TEXT_LIMITATION_MESSAGE);
      } finally {
        if (active) {
          setSourceTextLoading(false);
        }
      }
    };

    loadSourceText();
    return () => {
      active = false;
    };
  }, [isOpen, contract.id]);

  const handleAddCounterparty = () => {
    if (!newCounterpartyName.trim()) return;
    setCounterparties(prev => [
      ...prev,
      { name: newCounterpartyName.trim(), side: newCounterpartySide }
    ]);
    setNewCounterpartyName('');
  };

  const handleRemoveCounterparty = (index: number) => {
    setCounterparties(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnonymize = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await anonymizeDocument(contract.id, {
        aiTask,
        customPrompt: aiTask === "CUSTOM" ? customPrompt : undefined,
        redactionLevel,
        counterparties: counterparties.length > 0 ? counterparties : undefined,
        sourceText: sourceTextAvailable && workspaceText.trim().length > 0 ? workspaceText : undefined,
        metadata: {
          clientName: metadataClientName.trim() || undefined,
          clientRole: metadataClientRole.trim() || undefined,
          counterparty: metadataCounterparty.trim() || undefined,
          notes: metadataNotes.trim() || undefined,
        } as AnonymizationMetadataInput,
      }) as unknown as {
        success: boolean;
        anonymizedDocumentId?: string;
        redactedText?: string;
        redactedItems?: Array<{
          type: string;
          original: string;
          replacement: string;
          position: number;
        }>;
        aiReadyPrompt?: string;
        error?: string;
      };

      if (response.success && response.anonymizedDocumentId) {
        const resultData: AnonymizeResult = {
          anonymizedDocumentId: response.anonymizedDocumentId,
          caseId: caseId || '',
          name: contract.title || contract.templateName || 'Anonymous Document',
          redactedText: response.redactedText || "",
          redactedItems: response.redactedItems || [],
          aiReadyPrompt: response.aiReadyPrompt || "",
        };
        setResult(resultData);
        onSuccess?.(resultData);
      } else {
        setError(response.error || "Anonymization failed");
      }
    } catch (err) {
      setError("Failed to anonymize document");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyRedactedText = () => {
    if (result?.redactedText) {
      navigator.clipboard.writeText(result.redactedText);
      setCopiedState("redacted");
      setTimeout(() => setCopiedState(null), 2000);
    }
  };

  const handleCopyAIPrompt = () => {
    if (result?.aiReadyPrompt) {
      navigator.clipboard.writeText(result.aiReadyPrompt);
      setCopiedState("prompt");
      setTimeout(() => setCopiedState(null), 2000);
    }
  };

  const handleCopyPromptAndText = () => {
    if (result?.aiReadyPrompt && result?.redactedText) {
      navigator.clipboard.writeText(`${result.aiReadyPrompt}\n\n---\n\nANONYMIZED TEXT:\n${result.redactedText}`);
      setCopiedState("both");
      setTimeout(() => setCopiedState(null), 2000);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setCustomPrompt("");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl border border-[#e4e2dd]">
        {/* Header */}
        <div className="bg-[#06190d] px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-['Newsreader'] font-bold text-white">
              Anonymize for AI Processing
            </h2>
            <p className="text-xs text-white/60 mt-1">
              {contract.title || contract.templateName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {!result ? (
            <>
              {/* Source Document Info */}
              <div className="mb-6 p-4 bg-[#f5f3ee] border border-[#c3c8c1]/10">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#434843]">description</span>
                  <div>
                    <p className="text-sm font-bold text-[#06190d]">{contract.title || contract.templateName}</p>
                    <p className="text-xs text-[#434843]">
                      v{contract.revisionNumber || 1} • {contract.status}
                    </p>
                  </div>
                </div>
              </div>

              {/* Source Text Workspace */}
              <div className="mb-6 p-4 border border-[#c3c8c1]/20">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-[#434843] text-base">article</span>
                  <p className="text-xs font-bold text-[#06190d]">Szöveges munkafelület (MVP)</p>
                </div>
                {sourceTextLoading ? (
                  <p className="text-xs text-[#434843]">Forrásszöveg betöltése...</p>
                ) : sourceTextAvailable ? (
                  <>
                    <p className="text-[10px] text-[#434843]/70 mb-2">
                      Az anonimizálás az itt látható / szerkesztett szövegen fut.
                    </p>
                    <textarea
                      value={workspaceText}
                      onChange={(e) => setWorkspaceText(e.target.value)}
                      rows={10}
                      className="w-full p-3 border border-[#c3c8c1]/20 text-xs text-[#06190d] focus:outline-none focus:border-[#06190d] font-mono"
                    />
                    <p className="mt-2 text-[10px] text-[#434843]/60">
                      Eredeti betöltött karakterek: {sourceText.length} • aktuális munkaszöveg: {workspaceText.length}
                    </p>
                  </>
                ) : (
                  <div className="p-3 bg-[#fff8e1] border border-[#f9c74f] text-[#8a6a00] text-xs">
                    {sourceLimitationMessage}
                  </div>
                )}
              </div>

              {/* Metadata Inputs */}
              <div className="mb-6 p-4 border border-[#c3c8c1]/20">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-[#434843] text-base">badge</span>
                  <p className="text-xs font-bold text-[#06190d]">Anonimizálási metaadatok</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={metadataClientName}
                    onChange={(e) => setMetadataClientName(e.target.value)}
                    placeholder="Ügyfél neve"
                    className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]"
                  />
                  <input
                    type="text"
                    value={metadataClientRole}
                    onChange={(e) => setMetadataClientRole(e.target.value)}
                    placeholder="Ügyfél szerepe"
                    className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]"
                  />
                  <input
                    type="text"
                    value={metadataCounterparty}
                    onChange={(e) => setMetadataCounterparty(e.target.value)}
                    placeholder="Ellenérdekű fél"
                    className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]"
                  />
                  <input
                    type="text"
                    value={metadataNotes}
                    onChange={(e) => setMetadataNotes(e.target.value)}
                    placeholder="Megjegyzés (opcionális)"
                    className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]"
                  />
                </div>
              </div>

              {/* Known Party Context — case client is already known, user only needs counterparty info */}
              {clientName && (
                <div className="mb-4 p-3 bg-[#e2ede5] border border-[#a6c0af]">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[#23472F]">person</span>
                    <div>
                      <p className="text-xs font-bold text-[#23472F]">Ismert fél</p>
                      <p className="text-[10px] text-[#23472F]/70">
                        {clientName}{clientRole ? ` — ${clientRole}` : ""} — csak az ellenérdekelt feleket adja meg
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Structured Counterparty Input */}
              <div className="mb-6 p-4 border border-[#c3c8c1]/20">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-[#434843] text-base">group</span>
                  <p className="text-xs font-bold text-[#06190d]">További felek</p>
                </div>
                <p className="text-[10px] text-[#434843]/60 mb-3">
                  Opcionális — adja meg az ellenérdekelt feleket a pontosabb anonimizáláshoz
                </p>

                {/* Add counterparty form */}
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newCounterpartyName}
                    onChange={(e) => setNewCounterpartyName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCounterparty()}
                    placeholder="Ellenérdekelt fél neve..."
                    className="flex-1 px-2 py-1.5 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]"
                  />
                  <select
                    value={newCounterpartySide}
                    onChange={(e) => setNewCounterpartySide(e.target.value as 'OPPONENT' | 'ADDITIONAL_PARTY')}
                    className="px-2 py-1.5 text-xs border border-[#c3c8c1]/20 text-[#06190d] focus:outline-none focus:border-[#06190d] bg-white"
                  >
                    <option value="OPPONENT">Ellenérdekű</option>
                    <option value="ADDITIONAL_PARTY">További fél</option>
                  </select>
                  <button
                    onClick={handleAddCounterparty}
                    disabled={!newCounterpartyName.trim()}
                    className="px-3 py-1.5 text-xs font-bold bg-[#06190d] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    +
                  </button>
                </div>

                {/* Counterparty list */}
                {counterparties.length > 0 && (
                  <div className="space-y-1.5">
                    {counterparties.map((cp, i) => (
                      <div key={i} className="flex items-center justify-between px-2 py-1.5 bg-[#f5f3ee] border border-[#c3c8c1]/10">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[#434843]/50">
                            {cp.side === 'OPPONENT' ? '🔴' : '🟡'}
                          </span>
                          <span className="text-xs text-[#06190d]">{cp.name}</span>
                        </div>
                        <button
                          onClick={() => handleRemoveCounterparty(i)}
                          className="text-[#8b3a3a] hover:text-[#6b2020] text-xs font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Task Selection */}
              <div className="mb-6">
                <label className="block text-xs font-bold uppercase tracking-widest text-[#434843] mb-3">
                  AI Analysis Task
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {aiTaskOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setAiTask(option.value)}
                      className={`p-3 text-left border transition-all ${
                        aiTask === option.value
                          ? "border-[#06190d] bg-[#06190d]/5"
                          : "border-[#c3c8c1]/20 hover:border-[#c3c8c1]/40"
                      }`}
                    >
                      <p className="text-xs font-bold text-[#06190d]">{option.label}</p>
                      <p className="text-[10px] text-[#434843] mt-1">{option.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Prompt (if CUSTOM selected) */}
              {aiTask === "CUSTOM" && (
                <div className="mb-6">
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#434843] mb-3">
                    Custom Prompt
                  </label>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Enter your custom analysis instructions..."
                    className="w-full p-3 border border-[#c3c8c1]/20 text-sm text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]"
                    rows={3}
                  />
                </div>
              )}

              {/* Redaction Level */}
              <div className="mb-6">
                <label className="block text-xs font-bold uppercase tracking-widest text-[#434843] mb-3">
                  Redaction Level
                </label>
                <div className="flex gap-3">
                  {redactionLevelOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setRedactionLevel(option.value)}
                      className={`flex-1 p-3 text-center border transition-all ${
                        redactionLevel === option.value
                          ? "border-[#06190d] bg-[#06190d]/5"
                          : "border-[#c3c8c1]/20 hover:border-[#c3c8c1]/40"
                      }`}
                    >
                      <p className="text-xs font-bold text-[#06190d]">{option.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-[#fef2f2] border border-[#d4b8b8] text-[#8b3a3a] text-sm">
                  {error}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Success Result */}
              <div className="mb-6 p-4 bg-[#e2ede5] border border-[#a6c0af]">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#23472F]">check_circle</span>
                  <div>
                    <p className="text-sm font-bold text-[#23472F]">Anonymization Complete</p>
                    <p className="text-xs text-[#23472F]/70">
                      {result.redactedItems.length} items redacted
                    </p>
                  </div>
                </div>
              </div>

              {/* Redacted Preview */}
              <div className="mb-6">
                <label className="block text-xs font-bold uppercase tracking-widest text-[#434843] mb-3">
                  Redacted Content Preview
                </label>
                <div className="p-4 bg-[#f5f3ee] border border-[#c3c8c1]/10 text-xs text-[#434843] max-h-48 overflow-y-auto font-mono whitespace-pre-wrap">
                  {result.redactedText || "No preview available"}
                </div>
              </div>

              {/* AI Ready Prompt */}
              {result.aiReadyPrompt && (
                <div className="mb-6">
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#434843] mb-3">
                    AI-Ready Prompt
                  </label>
                  <div className="p-4 bg-[#f5f3ee] border border-[#c3c8c1]/10 text-xs text-[#434843] max-h-48 overflow-y-auto font-mono whitespace-pre-wrap">
                    {result.aiReadyPrompt}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={handleCopyRedactedText}
                  className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest border transition-all ${
                    copiedState === "redacted"
                      ? "border-[#23472F] bg-[#e2ede5] text-[#23472F]"
                      : "border-[#06190d]/20 text-[#06190d] hover:bg-[#06190d]/5"
                  }`}
                >
                  {copiedState === "redacted" ? "✓ Copied" : "Copy Anonymized Text"}
                </button>
                <button
                  onClick={handleCopyAIPrompt}
                  className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest border transition-all ${
                    copiedState === "prompt"
                      ? "border-[#23472F] bg-[#e2ede5] text-[#23472F]"
                      : "border-[#06190d]/20 text-[#06190d] hover:bg-[#06190d]/5"
                  }`}
                >
                  {copiedState === "prompt" ? "✓ Copied" : "Copy AI Prompt"}
                </button>
                <button
                  onClick={handleCopyPromptAndText}
                  className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-all ${
                    copiedState === "both"
                      ? "bg-[#23472F] text-white"
                      : "bg-[#06190d] text-white hover:opacity-90"
                  }`}
                >
                  {copiedState === "both" ? "✓ Copied" : "Copy Prompt + Text"}
                </button>
              </div>
              <div className="mt-2">
                <button
                  onClick={handleReset}
                  className="w-full py-2 text-xs font-bold uppercase tracking-widest border border-[#c3c8c1]/20 text-[#434843] hover:bg-[#f5f3ee]"
                >
                  Anonymize Another
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="px-6 py-4 border-t border-[#e4e2dd] flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold uppercase tracking-widest border border-[#c3c8c1]/20 text-[#434843] hover:bg-[#f5f3ee]"
            >
              Cancel
            </button>
            <button
              onClick={handleAnonymize}
              disabled={isLoading || (aiTask === "CUSTOM" && !customPrompt)}
              className="px-6 py-2 text-xs font-bold uppercase tracking-widest bg-[#06190d] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Processing..." : "Create Anonymized Copy"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
