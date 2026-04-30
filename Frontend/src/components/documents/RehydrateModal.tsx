"use client";

import { useState } from "react";
import { 
  importAIResponse, 
  saveRehydratedResultAsDocument,
  type ImportAIResponseResult 
} from "@/lib/api";

interface RehydrateModalProps {
  isOpen: boolean;
  onClose: () => void;
  anonymousDocId: string;
  anonymousDocName?: string;
  caseId?: string;
  onSuccess?: (result: ImportAIResponseResult) => void;
  onSaveSuccess?: (documentId: string, fileName: string) => void;
}

export function RehydrateModal({
  isOpen,
  onClose,
  anonymousDocId,
  anonymousDocName,
  caseId,
  onSuccess,
  onSaveSuccess,
}: RehydrateModalProps) {
  const [aiResponseText, setAiResponseText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<ImportAIResponseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<{documentId: string; fileName: string} | null>(null);
  const [copiedState, setCopiedState] = useState(false);

  const handleRehydrate = async () => {
    if (!aiResponseText.trim()) {
      setError("Please paste the AI response text first");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await importAIResponse(anonymousDocId, aiResponseText);
      
      if (response.success) {
        setResult(response);
        onSuccess?.(response);
      } else {
        setError(response.error || "Rehydration failed");
      }
    } catch (err) {
      setError("Failed to import AI response");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyRehydrated = async () => {
    if (result?.rehydratedContent) {
      try {
        await navigator.clipboard.writeText(result.rehydratedContent);
        setCopiedState(true);
        setTimeout(() => setCopiedState(false), 2000);
      } catch {
        setError("Failed to copy text to clipboard");
      }
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setAiResponseText("");
    setSaveSuccess(null);
  };

  const handleSaveAsDraft = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await saveRehydratedResultAsDocument(anonymousDocId);
      
      if (response.success && response.documentId && response.fileName) {
        setSaveSuccess({ documentId: response.documentId, fileName: response.fileName });
        onSaveSuccess?.(response.documentId, response.fileName);
      } else {
        setError(response.error || "Failed to save document");
      }
    } catch (err) {
      setError("Failed to save as document");
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETE":
        return "bg-[#e2ede5] border-[#a6c0af] text-[#23472F]";
      case "PARTIAL":
        return "bg-[#fff8e1] border-[#f9c74f] text-[#8a6a00]";
      case "FAILED":
        return "bg-[#fef2f2] border-[#d4b8b8] text-[#8b3a3a]";
      default:
        return "bg-[#f5f3ee] border-[#c3c8c1]/10 text-[#434843]";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "COMPLETE":
        return "check_circle";
      case "PARTIAL":
        return "warning";
      case "FAILED":
        return "error";
      default:
        return "help";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl border border-[#e4e2dd]">
        {/* Header */}
        <div className="bg-[#06190d] px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-['Newsreader'] font-bold text-white">
              Import AI Response & Rehydrate
            </h2>
            <p className="text-xs text-white/60 mt-1">
              {anonymousDocName || `Document ID: ${anonymousDocId.slice(0, 8)}...`}
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
              {/* Instructions */}
              <div className="mb-6 p-4 bg-[#f5f3ee] border border-[#c3c8c1]/10">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[#434843]">info</span>
                  <div className="text-sm text-[#434843]">
                    <p className="font-bold mb-1">How this works:</p>
                    <ol className="list-decimal list-inside space-y-1 text-xs">
                      <li>Copy the anonymized content and send it to an external AI</li>
                      <li>Bring the AI response back here</li>
                      <li>Paste the AI response below and click Rehydrate</li>
                      <li>The system will restore the original client names/data</li>
                    </ol>
                  </div>
                </div>
              </div>

              {/* AI Response Input */}
              <div className="mb-6">
                <label className="block text-xs font-bold uppercase tracking-widest text-[#434843] mb-3">
                  AI Response Text
                </label>
                <textarea
                  value={aiResponseText}
                  onChange={(e) => setAiResponseText(e.target.value)}
                  placeholder="Paste the AI response here..."
                  className="w-full p-4 border border-[#c3c8c1]/20 text-sm text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d] font-mono"
                  rows={12}
                />
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
              {/* Status Banner */}
              <div className={`mb-6 p-4 border ${getStatusColor(result.rehydrationStatus)}`}>
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined">{getStatusIcon(result.rehydrationStatus)}</span>
                  <div>
                    <p className="text-sm font-bold">
                      Rehydration {result.rehydrationStatus}
                    </p>
                    <p className="text-xs opacity-70 mt-1">
                      {result.resolvedTokens} of {result.totalTokens} tokens resolved
                      {result.unresolvedTokens > 0 && (
                        <span className="text-[#8b3a3a]">
                          {" "}• {result.unresolvedTokens} unresolved
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Warnings */}
              {result.warnings && result.warnings.length > 0 && (
                <div className="mb-6">
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#434843] mb-3">
                    Warnings ({result.warnings.length})
                  </label>
                  <div className="p-4 bg-[#fff8e1] border border-[#f9c74f] text-xs max-h-32 overflow-y-auto">
                    {result.warnings.map((warning, idx) => (
                      <div key={idx} className="mb-2 last:mb-0">
                        <span className="font-mono bg-[#fff]/50 px-1">{warning.token}</span>
                        <span className="text-[#8a6a00]"> — {warning.reason}</span>
                        {warning.original && (
                          <span className="text-[#8a6a00]">
                            {" "}(expected: {warning.original})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rehydrated Content */}
              {result.rehydratedContent && (
                <div className="mb-6">
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#434843] mb-3">
                    Rehydrated Content
                  </label>
                  <div className="p-4 bg-[#f5f3ee] border border-[#c3c8c1]/10 text-xs text-[#434843] max-h-64 overflow-y-auto font-mono whitespace-pre-wrap">
                    {result.rehydratedContent}
                  </div>
                </div>
              )}

              {/* Save Success Message */}
              {saveSuccess && (
                <div className="mb-6 p-4 bg-[#e2ede5] border border-[#a6c0af] text-[#23472F]">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined">check_circle</span>
                    <div>
                      <p className="text-sm font-bold">Document Saved Successfully</p>
                      <p className="text-xs opacity-70 mt-1">
                        {saveSuccess.fileName} has been added to the case documents.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-[#fef2f2] border border-[#d4b8b8] text-[#8b3a3a] text-sm">
                  {error}
                </div>
              )}

              {/* Actions */}
              {!saveSuccess ? (
                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={handleCopyRehydrated}
                    disabled={!result.rehydratedContent}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest border transition-all min-w-[140px] ${
                      copiedState
                        ? "border-[#23472F] bg-[#e2ede5] text-[#23472F]"
                        : "border-[#06190d]/20 text-[#06190d] hover:bg-[#06190d]/5 disabled:opacity-50 disabled:cursor-not-allowed"
                    }`}
                  >
                    {copiedState ? "✓ Copied" : "Copy Text"}
                  </button>
                  
                  {/* Save as Draft - only for COMPLETE or PARTIAL */}
                  {(result.rehydrationStatus === 'COMPLETE' || result.rehydrationStatus === 'PARTIAL') && (
                    <button
                      onClick={handleSaveAsDraft}
                      disabled={isSaving}
                      className="flex-1 py-3 text-xs font-bold uppercase tracking-widest bg-[#23472F] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px]"
                    >
                      {isSaving ? "Saving..." : "Save as Draft"}
                    </button>
                  )}
                  
                  <button
                    onClick={handleReset}
                    className="flex-1 py-3 text-xs font-bold uppercase tracking-widest border border-[#c3c8c1]/20 text-[#434843] hover:bg-[#f5f3ee] min-w-[140px]"
                  >
                    New Import
                  </button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={handleReset}
                    className="flex-1 py-3 text-xs font-bold uppercase tracking-widest bg-[#06190d] text-white hover:opacity-90"
                  >
                    Import Another Response
                  </button>
                  <button
                    onClick={onClose}
                    className="flex-1 py-3 text-xs font-bold uppercase tracking-widest border border-[#c3c8c1]/20 text-[#434843] hover:bg-[#f5f3ee]"
                  >
                    Close
                  </button>
                </div>
              )}
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
              onClick={handleRehydrate}
              disabled={isLoading || !aiResponseText.trim()}
              className="px-6 py-2 text-xs font-bold uppercase tracking-widest bg-[#06190d] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Rehydrating..." : "Rehydrate"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
