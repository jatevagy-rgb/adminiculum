"use client";

import { useState, use, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import {
  getCaseContracts,
  getCases,
  getCaseTimeline,
  downloadContract,
  uploadGeneratedContractToSharePoint,
  createContractGenerationRevision,
  finalizeContractGeneration,
  downloadCaseBundle,
  getCommunications,
  createCommunication,
  type CaseContractListItem,
  type TimelineEventItem,
  type CommunicationItem,
} from "@/lib/api";
import { AnonymizeModal, type AnonymizeResult } from "@/components/documents/AnonymizeModal";
import { RehydrateModal } from "@/components/documents/RehydrateModal";
import { useUiPack } from "@/lib/uiPack";

// Document Family / Lineage Types
type DocumentFamily = {
  familyId: string;
  familyLabel: string;
  items: CaseContractListItem[];
  currentItemId?: string;
  latestItemId?: string;
  finalItemId?: string;
  lastUpdatedAt?: string;
  versionCount: number;
  groupingStrength: 'explicit' | 'fallback';
};

// Normalize title for fallback grouping (same logic as compare page)
const normalizeTitle = (value: string): string => {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/\s*\(rev(?:ision)?\s*\d+\)\s*/gi, '')
    .replace(/\brev\s*\d+\b/gi, '')
    .replace(/\bv\d+\b/gi, '')
    .replace(/[_\-]+rev[_\-]*\d+/gi, '')
    .replace(/\.docx$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
};

// Group contracts into families
const groupIntoFamilies = (contracts: CaseContractListItem[]): { families: DocumentFamily[]; standalone: CaseContractListItem[] } => {
  const familyMap = new Map<string, DocumentFamily>();
  const standalone: CaseContractListItem[] = [];

  for (const contract of contracts) {
    // Primary grouping: threadId (explicit backend relationship)
    if (contract.threadId) {
      const familyId = `thread-${contract.threadId}`;
      const existing = familyMap.get(familyId);
      if (existing) {
        existing.items.push(contract);
      } else {
        familyMap.set(familyId, {
          familyId,
          familyLabel: contract.threadTitle || contract.templateName || contract.title || 'Dokumentum',
          items: [contract],
          groupingStrength: 'explicit',
          versionCount: 0,
        });
      }
      continue;
    }

    // Secondary grouping: normalized title/template (fallback)
    const normalizedTitle = normalizeTitle(contract.title || contract.templateName || '');
    if (normalizedTitle) {
      const familyId = `title-${normalizedTitle}`;
      const existing = familyMap.get(familyId);
      if (existing) {
        existing.items.push(contract);
      } else {
        familyMap.set(familyId, {
          familyId,
          familyLabel: contract.title || contract.templateName || 'Dokumentum',
          items: [contract],
          groupingStrength: 'fallback',
          versionCount: 0,
        });
      }
      continue;
    }

    // No grouping possible - standalone
    standalone.push(contract);
  }

  // Calculate version counts and current/latest markers for each family
  const families: DocumentFamily[] = [];
  for (const family of familyMap.values()) {
    // Sort by revisionNumber (desc), then by generatedAt (desc)
    family.items.sort((a, b) => {
      const revA = a.revisionNumber ?? 0;
      const revB = b.revisionNumber ?? 0;
      if (revA !== revB) return revB - revA;
      const dateA = a.generatedAt ? new Date(a.generatedAt).getTime() : 0;
      const dateB = b.generatedAt ? new Date(b.generatedAt).getTime() : 0;
      return dateB - dateA;
    });

    family.versionCount = family.items.length;
    
    // Find current revision (isCurrentRevision = true)
    const currentItem = family.items.find(item => item.isCurrentRevision);
    family.currentItemId = currentItem?.id ?? family.items[0]?.id;
    
    // Find latest by generatedAt
    const latestItem = family.items.reduce((latest, item) => {
      if (!latest) return item;
      const latestDate = latest.generatedAt ? new Date(latest.generatedAt).getTime() : 0;
      const itemDate = item.generatedAt ? new Date(item.generatedAt).getTime() : 0;
      return itemDate > latestDate ? item : latest;
    }, family.items[0]);
    family.latestItemId = latestItem?.id;

    // Find final revision if present (grounded backend signal)
    const finalItem = family.items.find((item) => item.isFinalRevision);
    family.finalItemId = finalItem?.id;

    // Family latest activity timestamp
    const latestTs = family.items.reduce((best, item) => {
      const ts = item.generatedAt ? new Date(item.generatedAt).getTime() : 0;
      return ts > best ? ts : best;
    }, 0);
    family.lastUpdatedAt = latestTs > 0 ? new Date(latestTs).toISOString() : undefined;

    // Only add as family if multiple items, otherwise treat as standalone
    if (family.items.length > 1) {
      families.push(family);
    } else {
      standalone.push(...family.items);
    }
  }

  return { families, standalone };
};

type DocumentLedgerPageProps = {
  params: Promise<{ caseId: string }>;
};

export default function WrappedDocumentLedgerPage({ params }: DocumentLedgerPageProps) {
  return (
    <AuthenticatedApp section="case-detail">
      <DocumentLedgerContent params={params} />
    </AuthenticatedApp>
  );
}

function DocumentLedgerContent({ params }: DocumentLedgerPageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [uiPack] = useUiPack();

  const isSignalTiles = uiPack === "signal_tiles_console";

  // Pack-aware palette
  const p = {
    bg: isSignalTiles ? "bg-slate-900" : "bg-[#fbf9f4]",
    bgAlt: isSignalTiles ? "bg-slate-800" : "bg-[#F6F2E8]",
    bgHover: isSignalTiles ? "hover:bg-slate-700" : "hover:bg-[#ECE6DA]",
    bgCard: isSignalTiles ? "bg-slate-800" : "bg-white",
    bgSection: isSignalTiles ? "bg-slate-800" : "bg-[#f5f3ee]",
    text: isSignalTiles ? "text-slate-100" : "text-[#1F2821]",
    textMuted: isSignalTiles ? "text-slate-400" : "text-[#7B776D]",
    textDark: isSignalTiles ? "text-slate-200" : "text-[#514D45]",
    border: isSignalTiles ? "border-slate-600" : "border-[#DDD7CA]",
    borderLight: isSignalTiles ? "border-slate-700" : "border-[#EEE7D9]",
    badge: isSignalTiles ? "bg-slate-700 text-slate-200" : "bg-[#f5f3ee] text-[#434843]",
    accent: isSignalTiles ? "text-cyan-400" : "text-[#C9A227]",
    accentBg: isSignalTiles ? "bg-cyan-900 text-cyan-200" : "bg-[#C9A227] text-white",
    success: isSignalTiles ? "bg-emerald-900 text-emerald-200" : "bg-[#d1e8d3] text-[#23472F]",
    warning: isSignalTiles ? "bg-amber-900 text-amber-200" : "bg-[#EEE7D9] text-[#514D45]",
    danger: isSignalTiles ? "bg-red-900 text-red-200" : "bg-[#ffdad6] text-[#ba1a1a]",
  };

  const [contracts, setContracts] = useState<CaseContractListItem[]>([]);
  const [caseRecord, setCaseRecord] = useState<{
    id: string;
    caseNumber: string;
    title: string;
    clientName: string;
    clientRole?: string;
    matterType: string;
    status: string;
    sharePointFolderPath?: string;
  } | null>(null);
  const [timeline, setTimeline] = useState<TimelineEventItem[]>([]);
  const [selectedContract, setSelectedContract] = useState<CaseContractListItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [isUploadingToSP, setIsUploadingToSP] = useState<string | null>(null);
  const [isCreatingRevision, setIsCreatingRevision] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [anonymizeModalContract, setAnonymizeModalContract] = useState<CaseContractListItem | null>(null);
  const [rehydrateModalDoc, setRehydrateModalDoc] = useState<{ id: string; name: string } | null>(null);
  const [rehydrateModalOpen, setRehydrateModalOpen] = useState(false);

  // Document notes state (reusing Communication model with type: NOTE)
  const [documentNotes, setDocumentNotes] = useState<CommunicationItem[]>([]);
  const [newNoteSubject, setNewNoteSubject] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);

  // Fetch case record from case list to resolve caseNumber -> CUID.
  // caseRecord.id (CUID) is used for ALL API calls; resolvedParams.caseId may be a caseNumber string.
  useEffect(() => {
    const fetchCaseRecord = async () => {
      try {
        const response = await getCases(1, 200);
        const record = response.data.find(
          (item) => item.caseNumber === resolvedParams.caseId || item.id === resolvedParams.caseId
        );
        if (record) {
          setCaseRecord({
            id: record.id,
            caseNumber: record.caseNumber,
            title: record.title,
            clientName: record.clientName,
            clientRole: (record as any).clientRole ?? undefined,
            matterType: record.matterType,
            status: record.status,
          });
        }
      } catch {
        // Fall back to mock data
      }
    };
    fetchCaseRecord();
  }, [resolvedParams.caseId]);

  const loadData = useCallback(async () => {
    // Guard: never call API with unresolved caseId (caseNumber string instead of CUID)
    if (!caseRecord?.id) return;
    try {
      setIsLoading(true);
      // Use caseRecord.id (CUID) — NOT resolvedParams.caseId which may be a caseNumber string
      const [contractsData, timelineData] = await Promise.all([
        getCaseContracts(caseRecord.id).catch(() => []),
        getCaseTimeline(caseRecord.id).catch(() => []),
      ]);
      setContracts(contractsData);
      setTimeline(timelineData);
      // Auto-select first contract if available
      if (contractsData.length > 0 && !selectedContract) {
        setSelectedContract(contractsData[0]);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [caseRecord?.id, selectedContract]);

  // Re-trigger loadData once caseRecord is resolved to CUID
  useEffect(() => {
    if (caseRecord?.id) {
      loadData();
    }
  }, [caseRecord?.id, loadData]);

  const handleDownload = async (contract: CaseContractListItem) => {
    setIsDownloading(contract.id);
    try {
      const blob = await downloadContract(contract.id);
      const url = URL.createObjectURL(blob);
      const a = globalThis.document.createElement('a');
      a.href = url;
      a.download = contract.fileName || 'document.docx';
      globalThis.document.body.appendChild(a);
      a.click();
      globalThis.document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setActionResult({ type: 'success', message: 'Download started' });
    } catch (err) {
      console.error('Download failed:', err);
      setActionResult({ type: 'error', message: 'Letöltés sikertelen' });
    } finally {
      setIsDownloading(null);
    }
  };

  const handleSharePointUpload = async (contract: CaseContractListItem) => {
    setIsUploadingToSP(contract.id);
    try {
      const result = await uploadGeneratedContractToSharePoint(contract.id);
      if (result.success) {
        setActionResult({ type: 'success', message: 'Uploaded to SharePoint' });
        loadData(); // Refresh data
      } else {
        setActionResult({ type: 'error', message: 'SharePoint feltöltés sikertelen' });
      }
    } catch (err) {
      console.error('SharePoint upload failed:', err);
      setActionResult({ type: 'error', message: 'SharePoint feltöltés sikertelen' });
    } finally {
      setIsUploadingToSP(null);
    }
  };

  const handleCreateRevision = async (contractId: string) => {
    setIsCreatingRevision(contractId);
    try {
      const result = await createContractGenerationRevision(contractId);
      if (result.success && result.newContract) {
        setActionResult({ type: 'success', message: `Revision ${result.newContract.revisionNumber} created` });
        loadData(); // Refresh data
      } else {
        setActionResult({ type: 'error', message: result.error || 'Failed to create revision' });
      }
    } catch (err) {
      console.error('Create revision failed:', err);
      setActionResult({ type: 'error', message: 'Failed to create revision' });
    } finally {
      setIsCreatingRevision(null);
    }
  };

  const handleFinalize = async (contractId: string) => {
    setIsFinalizing(contractId);
    try {
      const result = await finalizeContractGeneration(contractId);
      if (result.success) {
        setActionResult({ type: 'success', message: 'Document marked as final' });
        loadData(); // Refresh data
      } else {
        setActionResult({ type: 'error', message: result.error || 'Failed to finalize' });
      }
    } catch (err) {
      console.error('Finalize failed:', err);
      setActionResult({ type: 'error', message: 'Failed to finalize document' });
    } finally {
      setIsFinalizing(null);
    }
  };

  const handleBundleDownload = async () => {
    const effectiveCaseId = caseRecord?.id || resolvedParams.caseId;
    try {
      const blob = await downloadCaseBundle(effectiveCaseId);
      const url = URL.createObjectURL(blob);
      const a = globalThis.document.createElement('a');
      a.href = url;
      a.download = `case-bundle-${effectiveCaseId}.zip`;
      globalThis.document.body.appendChild(a);
      a.click();
      globalThis.document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setActionResult({ type: 'success', message: 'Bundle download started' });
    } catch (err) {
      console.error('Bundle download failed:', err);
      setActionResult({ type: 'error', message: 'Bundle download failed' });
    }
  };

  const handleReview = (contractId: string) => {
    router.push(`/cases/${canonicalCaseId}/review/${contractId}`);
  };

  const handleGenerate = () => {
    router.push(`/cases/${canonicalCaseId}/generate`);
  };

  const handleAnonymize = (contract: CaseContractListItem) => {
    setAnonymizeModalContract(contract);
  };

  const handleAnonymizeSuccess = (result: AnonymizeResult) => {
    // Close AnonymizeModal and navigate to Case Detail where RehydrateModal is accessible
    setAnonymizeModalContract(null);
    router.push(`/cases/${canonicalCaseId}`);
  };

  const handleOpenRehydrate = (anonDoc: { id: string; name: string }) => {
    setRehydrateModalDoc({ id: anonDoc.id, name: anonDoc.name || 'Anonymous Document' });
    setRehydrateModalOpen(true);
  };

  const handleRehydrateSuccess = () => {
    setRehydrateModalOpen(false);
    setRehydrateModalDoc(null);
  };

  const handleRehydrateSaveSuccess = (_documentId: string, _fileName: string) => {
    setRehydrateModalOpen(false);
    setRehydrateModalDoc(null);
  };

  // Load document notes when a contract is selected
  const loadDocumentNotes = useCallback(async (docId: string) => {
    setIsLoadingNotes(true);
    setNoteError(null);
    try {
      const response = await getCommunications({ documentId: docId, type: 'NOTE' });
      setDocumentNotes(response.communications);
    } catch {
      setNoteError('Failed to load notes');
      setDocumentNotes([]);
    } finally {
      setIsLoadingNotes(false);
    }
  }, []);

  // Handle adding a new note
  const handleAddNote = async () => {
    if (!selectedContract || !newNoteContent.trim()) return;
    setIsAddingNote(true);
    setNoteError(null);
    try {
      const newNote = await createCommunication({
        type: 'NOTE',
        subject: newNoteSubject.trim() || '(no subject)',
        content: newNoteContent.trim(),
        documentId: selectedContract.id,
        caseId: canonicalCaseId,
      });
      setDocumentNotes((prev) => [newNote, ...prev]);
      setNewNoteSubject('');
      setNewNoteContent('');
      setIsAddingNote(false);
    } catch {
      setNoteError('Failed to add note');
      setIsAddingNote(false);
    }
  };

  // Load notes when selectedContract changes
  useEffect(() => {
    if (selectedContract?.id) {
      loadDocumentNotes(selectedContract.id);
    } else {
      setDocumentNotes([]);
    }
  }, [selectedContract?.id, loadDocumentNotes]);

  const displayCaseId = caseRecord?.caseNumber || resolvedParams.caseId;
  const displayMatterName = (caseRecord?.title && caseRecord.title !== 'null' && caseRecord.title !== 'null - null') ? caseRecord.title : 'Document Ledger';
  const displayClient = (caseRecord?.clientName && caseRecord.clientName !== 'null') ? caseRecord.clientName : '';
  const canonicalCaseId = caseRecord?.id || resolvedParams.caseId;

  // Package health calculations
  const totalContracts = contracts.length;
  const approvedContracts = contracts.filter(c => c.status === 'APPROVED' || c.status === 'FINAL').length;
  const finalContracts = contracts.filter(c => c.isFinalRevision).length;
  const pendingReview = contracts.filter(c => c.status === 'IN_REVIEW' || c.status === 'SUBMITTED').length;

  // Family grouping for document lineage
  const { families, standalone } = groupIntoFamilies(contracts);
  
  // Map contracts to checklist items based on actual document content
  const checklistItems = contracts.map(contract => ({
    id: contract.id,
    label: contract.title || contract.templateName || 'Document',
    found: true,
    contract: contract,
    status: contract.isFinalRevision ? 'FINAL' : contract.status,
  }));

  const completedChecklist = checklistItems.filter(i => i.status === 'FINAL' || i.status === 'APPROVED').length;

  const selectedFamily = useMemo(() => {
    if (!selectedContract) return null;
    return families.find((family) => family.items.some((item) => item.id === selectedContract.id)) || null;
  }, [families, selectedContract]);

  const sourceTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    contracts.forEach((contract) => {
      if (contract?.id) {
        map.set(contract.id, contract.title || contract.fileName || contract.templateName || contract.id);
      }
    });
    return map;
  }, [contracts]);

  const getRevisionMeta = (contract: CaseContractListItem) => {
    const titleText = `${contract.title || ''} ${contract.fileName || ''}`;
    const isEditedByTitle = /szerkesztett\s+verzi[oó]/i.test(titleText);
    const isDerived = Boolean(contract.parentRevisionId) || isEditedByTitle || ((contract.revisionNumber || 1) > 1);
    const revisionLabel = contract.revisionNumber ? `Revision ${contract.revisionNumber}` : null;
    const sourceTitle = contract.parentRevisionId
      ? sourceTitleMap.get(contract.parentRevisionId) || contract.parentRevisionId
      : null;
    return {
      isDerived,
      revisionLabel,
      sourceLabel: sourceTitle,
    };
  };

  const previousVersionForSelected = useMemo(() => {
    if (!selectedFamily || !selectedContract) return null;
    const index = selectedFamily.items.findIndex((item) => item.id === selectedContract.id);
    if (index < 0) return null;
    return selectedFamily.items[index + 1] || null;
  }, [selectedFamily, selectedContract]);

  // Get contract status badge
  const getStatusBadge = (contract: CaseContractListItem) => {
    if (contract.isFinalRevision) {
      return { label: 'Final', class: 'bg-primary text-white' };
    }
    switch (contract.status) {
      case 'APPROVED':
        return { label: 'Approved', class: 'bg-[#d1e8d3] text-[#23472F]' };
      case 'IN_REVIEW':
      case 'SUBMITTED':
        return { label: 'In Review', class: 'bg-[#e4e2e1] text-[#656464]' };
      case 'REJECTED':
        return { label: 'Needs Revision', class: 'bg-[#ffdad6] text-[#ba1a1a]' };
      case 'GENERATED':
        return { label: 'Draft', class: 'bg-[#f5f3ee] text-[#434843]' };
      default:
        return { label: contract.status || 'Unknown', class: 'bg-[#f5f3ee] text-[#434843]' };
    }
  };

  return (
    <div className={`flex-1 flex min-h-0 ${p.bg} documents-surface`}>
      {/* LEFT SIDEBAR - Navigation - consistent with Generation/Communications */}
      <aside className={`w-64 border-r ${p.border} ${p.bgAlt} flex flex-col`}>
        <div className={`p-4 border-b ${p.border}`}>
          <p className={`text-[10px] uppercase tracking-[0.2em] ${p.textMuted} mb-2`}>Case Context</p>
          <p className={`text-[11px] ${p.text} font-semibold leading-tight`}>{displayMatterName || 'Matter name unavailable'}</p>
          <p className={`text-[10px] ${p.textMuted} mt-1`}>{displayCaseId}</p>
          <p className={`text-[10px] ${p.textMuted} mt-1`}>{displayClient}</p>
        </div>
        
        <nav className="flex-1 p-2 space-y-2">
          <button
            onClick={() => router.push(`/cases/${canonicalCaseId}`)}
            className={`w-full text-left px-3 py-2 text-xs font-semibold rounded transition-colors ${
              false ? p.accentBg : `${p.textDark} ${p.bgHover}`
            }`}
          >
            Case Overview
          </button>
          <button
            className={`w-full text-left px-3 py-2 text-xs font-semibold rounded transition-colors ${p.accentBg}`}
          >
            Document Ledger
          </button>
          <button
            onClick={() => router.push(`/cases/${canonicalCaseId}/generate`)}
            className={`w-full text-left px-3 py-2 text-xs font-semibold rounded transition-colors ${p.textDark} ${p.bgHover}`}
          >
            Generate
          </button>
          <button
            onClick={() => router.push(`/cases/${canonicalCaseId}/communications`)}
            className={`w-full text-left px-3 py-2 text-xs font-semibold rounded transition-colors ${p.textDark} ${p.bgHover}`}
          >
            Communications
          </button>
          <button
            onClick={() => router.push(`/documents/compare?caseId=${encodeURIComponent(canonicalCaseId)}`)}
            className={`w-full text-left px-3 py-2 text-xs font-semibold rounded transition-colors ${p.textDark} ${p.bgHover}`}
          >
            Verzió-összevetés
          </button>
        </nav>

        <div className={`p-3 border-t ${p.border}`}>
          <button
            onClick={handleGenerate}
            className={`w-full ${p.accentBg} py-2 text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-colors`}
          >
            + Generate New
          </button>
          <button
            onClick={handleBundleDownload}
            className={`w-full mt-2 border ${p.border} ${p.textDark} py-2 text-xs font-bold uppercase tracking-widest ${p.bgHover} transition-colors`}
          >
            Csomag letöltése
          </button>
          <p className={`text-[9px] ${p.textMuted} mt-1`}>
            Letöltés: az ügy aktuális dokumentumkészlete egy csomagban.
          </p>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-y-auto p-8 flex flex-col gap-8">
          {/* Action Result */}
          {actionResult && (
            <div className={`p-4 border rounded ${
              actionResult.type === 'success'
                ? `${p.success} border`
                : `${p.danger} border`
            }`}>
              <p className="text-sm">{actionResult.message}</p>
            </div>
          )}

          {/* CASE CONTEXT HEADER */}
          <section className={`border-b ${p.borderLight} pb-8`}>
            <div className="flex flex-col md:flex-row justify-between items-start gap-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className={`text-xs font-bold uppercase tracking-widest ${isSignalTiles ? 'bg-cyan-900 text-cyan-200' : 'bg-[#06190d] text-white'} px-2 py-0.5`}>
                    Active Matter
                  </span>
                  <span className={`text-xs font-bold uppercase tracking-widest ${p.textDark}`}>
                    {caseRecord?.matterType || 'Matter type unavailable'}
                  </span>
                </div>
                <h1 className={`text-4xl font-['Newsreader'] font-semibold ${isSignalTiles ? 'text-slate-100' : 'text-[#06190d]'} mb-2`}>
                  {displayMatterName}
                </h1>
                <div className={`flex flex-wrap items-center gap-x-6 gap-y-2 text-sm ${p.textDark}`}>
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-lg">gavel</span>
                    {caseRecord?.matterType || 'Matter type unavailable'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-lg">person</span>
                    {displayClient}
                  </span>
                  <span className={`flex items-center gap-1.5 font-bold ${isSignalTiles ? 'text-cyan-400' : 'text-[#06190d]'}`}>
                    <span className="material-symbols-outlined text-lg">account_tree</span>
                    Document Ledger
                  </span>
                </div>
              </div>
            </div>

            {/* PACKAGE HEALTH INDICATOR */}
            <div className={`mt-8 flex items-center gap-8 ${p.bgSection} p-4 border ${isSignalTiles ? 'border-slate-700' : 'border-[#c3c8c1]/10'}`}>
              <div className="flex-1">
                <div className="flex justify-between items-end mb-2">
                  <span className={`text-[10px] uppercase font-bold tracking-widest ${isSignalTiles ? 'text-slate-400' : 'text-[#06190d]/60'}`}>
                    Document Set Status
                  </span>
                  <span className="text-sm font-['Newsreader'] italic">
                    {completedChecklist} of {contracts.length} approved or final
                  </span>
                </div>
                <div className={`h-1.5 w-full ${isSignalTiles ? 'bg-slate-700' : 'bg-[#eae8e3]'}`}>
                  <div
                    className={`h-full ${isSignalTiles ? 'bg-cyan-500' : 'bg-[#06190d]'}`}
                    style={{ width: contracts.length > 0 ? `${(completedChecklist / Math.max(contracts.length, 1)) * 100}%` : '0%' }}
                  ></div>
                </div>
              </div>
                <div className={`flex gap-4 border-l ${isSignalTiles ? 'border-slate-600' : 'border-[#c3c8c1]/20'} pl-8`}>
                <div className="text-center">
                  <p className={`text-xl font-['Newsreader'] leading-none ${isSignalTiles ? 'text-slate-100' : 'text-[#06190d]'}`}>{approvedContracts}</p>
                  <p className={`text-[9px] uppercase tracking-tighter ${p.textDark}`}>Approved</p>
                </div>
                <div className="text-center">
                  <p className={`text-xl font-['Newsreader'] leading-none ${isSignalTiles ? 'text-slate-100' : 'text-[#06190d]'}`}>{finalContracts}</p>
                  <p className={`text-[9px] uppercase tracking-tighter ${p.textDark}`}>Final</p>
                </div>
                <div className="text-center">
                  <p className={`text-xl font-['Newsreader'] leading-none ${isSignalTiles ? 'text-red-400' : 'text-[#ba1a1a]'}`}>
                    {Math.max(0, contracts.length - completedChecklist)}
                  </p>
                  <p className={`text-[9px] uppercase tracking-tighter ${isSignalTiles ? 'text-red-400' : 'text-[#ba1a1a]'}`}>Open</p>
                </div>
              </div>
            </div>
          </section>

          {/* MAIN GRID */}
          <div className="grid grid-cols-12 gap-8">
            {/* LEFT COLUMN: Checklist & Audit */}
            <div className="col-span-12 lg:col-span-3 space-y-8">
              {/* Compliance Checklist */}
              <section className={`${p.bgSection} p-6`}>
                <h3 className={`text-xs font-bold uppercase tracking-[0.2em] ${isSignalTiles ? 'text-slate-200' : 'text-[#06190d]'} mb-6 border-b ${isSignalTiles ? 'border-slate-600' : 'border-[#06190d]/10'} pb-2`}>
                  Document Status List
                </h3>
                <ul className="space-y-4">
                  {checklistItems.map((item) => (
                    <li key={item.id} className="flex items-start gap-3">
                      {item.status === 'FINAL' ? (
                        <span className={`material-symbols-outlined ${isSignalTiles ? 'text-cyan-400' : 'text-[#06190d]'} text-lg`} data-icon="check_circle" style={{ fontVariationSettings: "'FILL' 1" }}>
                          check_circle
                        </span>
                      ) : item.status === 'APPROVED' ? (
                        <span className={`material-symbols-outlined ${isSignalTiles ? 'text-emerald-400' : 'text-[#819684]'} text-lg`} data-icon="check_circle" style={{ fontVariationSettings: "'FILL' 1" }}>
                          check_circle
                        </span>
                      ) : (
                        <span className={`material-symbols-outlined ${isSignalTiles ? 'text-slate-600' : 'text-[#c3c8c1]'} text-lg`} data-icon="radio_button_unchecked">
                          radio_button_unchecked
                        </span>
                      )}
                      <div>
                        <p className={`text-xs font-bold ${isSignalTiles ? 'text-slate-200' : 'text-[#06190d]'}`}>{item.label}</p>
                        <p className={`text-[10px] uppercase ${
                          item.status === 'FINAL' ? `${isSignalTiles ? 'text-cyan-400 font-bold' : 'text-[#06190d] font-bold'}` :
                          item.status === 'APPROVED' ? p.textDark : p.textDark
                        }`}>
                          {item.status === 'FINAL' ? 'Final' : item.status}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                {contracts.length === 0 && (
                  <p className={`text-[10px] ${p.textDark} italic mt-4`}>No documents generated yet</p>
                )}
              </section>

              {/* Audit Trail */}
              <section className={`p-4 ${p.bg} border ${isSignalTiles ? 'border-slate-700' : 'border-[#c3c8c1]/10'}`}>
                <h3 className={`text-xs font-bold uppercase tracking-widest ${isSignalTiles ? 'text-slate-300' : 'text-[#06190d]'} mb-4`}>Audit Trail</h3>
                <div className="space-y-4 max-h-64 overflow-y-auto pr-2">
                  {timeline.length > 0 ? (
                    timeline.slice(0, 5).map((event) => (
                      <div key={event.id} className={`border-l-2 ${isSignalTiles ? 'border-cyan-700' : 'border-[#06190d]/20'} pl-4 py-1`}>
                        <p className={`text-[10px] font-bold ${isSignalTiles ? 'text-slate-200' : 'text-[#06190d]'}`}>{event.typeLabel || event.type}</p>
                        <p className={`text-[9px] ${p.textDark}`}>
                          {new Date(event.createdAt).toLocaleDateString('hu-HU', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className={`text-[10px] ${p.textDark} italic`}>No timeline events</p>
                  )}
                </div>
              </section>
            </div>

            {/* CENTER COLUMN: Document Ledger */}
            <div className="col-span-12 lg:col-span-6 space-y-6">
              <div className="flex justify-between items-center">
                <h2 className={`text-xl font-['Newsreader'] font-bold ${isSignalTiles ? 'text-slate-100' : 'text-[#06190d]'}`}>Document Ledger</h2>
                <div className="flex items-center gap-2">
                  <span className={`material-symbols-outlined ${p.textDark} text-sm`}>filter_list</span>
                  <span className={`text-[10px] font-bold uppercase tracking-tighter ${p.textDark}`}>
                    Filter by Status
                  </span>
                </div>
              </div>

              {isLoading ? (
                <div className="text-center py-12">
                  <p className={p.textDark}>Loading documents...</p>
                </div>
              ) : contracts.length === 0 ? (
                <div className={`text-center py-12 ${p.bgSection} border ${isSignalTiles ? 'border-slate-700' : 'border-[#c3c8c1]/10'}`}>
                  <span className={`material-symbols-outlined text-4xl ${isSignalTiles ? 'text-slate-600' : 'text-[#c3c8c1]'}`}>description</span>
                  <p className={`${p.textDark} mt-4`}>No case documents yet</p>
                  <p className={`${p.textMuted} text-xs mt-2 max-w-md mx-auto`}>
                    Documents appear here after generation or when linked to this case. Continue with generation to create the first draft.
                  </p>
                  <button
                    onClick={handleGenerate}
                    className={`mt-4 px-4 py-2 text-xs font-bold uppercase tracking-widest ${isSignalTiles ? 'bg-cyan-700 text-white hover:bg-cyan-600' : 'bg-[#06190d] text-white hover:bg-black'} transition-colors`}
                  >
                    Generate First Document
                  </button>
                </div>
              ) : families.length === 0 && standalone.length === 0 ? (
                <div className={`text-center py-12 ${p.bgSection} border ${isSignalTiles ? 'border-slate-700' : 'border-[#c3c8c1]/10'}`}>
                  <span className={`material-symbols-outlined text-4xl ${isSignalTiles ? 'text-slate-600' : 'text-[#c3c8c1]'}`}>description</span>
                  <p className={`${p.textDark} mt-4`}>No documents available</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Document Families */}
                  {families.map((family) => (
                    <div key={family.familyId} className={`border ${p.border} ${p.bgCard}`}>
                      {/* Family Header */}
                      <div className={`${p.bgSection} px-5 py-3 border-b ${p.border} flex items-center justify-between`}>
                        <div className="flex items-center gap-3">
                          <span className={`material-symbols-outlined ${isSignalTiles ? 'text-cyan-400' : 'text-[#06190d]'}`}>folder_open</span>
                          <div>
                            <h4 className={`text-sm font-bold ${isSignalTiles ? 'text-slate-200' : 'text-[#06190d]'}`}>{family.familyLabel}</h4>
                            <p className={`text-[10px] ${p.textDark}`}>
                              {family.versionCount} verzió
                              {family.groupingStrength === 'fallback' && ' • cím-alapú csoport (becslés)'}
                              {family.groupingStrength === 'explicit' && ' • verziócsalád'}
                              {family.lastUpdatedAt && (
                                <> • frissítve: {new Date(family.lastUpdatedAt).toLocaleDateString('hu-HU')}</>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          {family.latestItemId && family.latestItemId !== family.currentItemId && (
                            <span className={`text-[8px] px-1.5 py-0.5 ${p.badge} font-bold uppercase tracking-wide`}>
                              Legújabb
                            </span>
                          )}
                          {family.currentItemId && (
                            <span className="text-[8px] px-1.5 py-0.5 bg-cyan-700 text-cyan-100 font-bold uppercase tracking-wide">
                              MUNKAVERZIÓ
                            </span>
                          )}
                          {family.finalItemId && (
                            <span className={`text-[8px] px-1.5 py-0.5 ${isSignalTiles ? 'bg-emerald-800 text-emerald-200' : 'bg-[#06190d] text-white'} font-bold uppercase tracking-wide`}>
                              VÉGLEGES
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Family Items */}
                      <div className={`divide-y ${p.borderLight}`}>
                        {family.items.map((contract, idx) => {
                          const badge = getStatusBadge(contract);
                          const isCurrent = contract.id === family.currentItemId;
                          const isLatest = contract.id === family.latestItemId;
                          const previousInFamily = family.items[idx + 1] || null;
                          const revisionMeta = getRevisionMeta(contract);
                          return (
                            <div
                              key={contract.id}
                              onClick={() => setSelectedContract(contract)}
                              className={`p-4 transition-all cursor-pointer ${
                                selectedContract?.id === contract.id ? p.bgSection : isSignalTiles ? 'hover:bg-slate-700' : 'hover:bg-[#fafaf8]'
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex items-start gap-3">
                                  <span className={`text-[10px] font-mono ${p.textMuted} ${p.bgSection} px-1.5 py-0.5`}>
                                    v{contract.revisionNumber || idx + 1}
                                  </span>
                                  <div>
                                    <div className="flex items-center gap-2 mb-1">
                                      <h5 className={`text-xs font-bold ${isSignalTiles ? 'text-slate-200' : 'text-[#06190d]'}`}>
                                        {contract.title || contract.templateName || 'Untitled Document'}
                                      </h5>
                                      {revisionMeta.isDerived && (
                                        <span className="text-[8px] px-1 py-0.5 bg-purple-900 text-purple-200 font-bold uppercase tracking-wide">
                                          Szerkesztett verzió
                                        </span>
                                      )}
                                      {revisionMeta.revisionLabel && (
                                        <span className={`text-[8px] px-1 py-0.5 ${p.badge} font-bold uppercase tracking-wide`}>
                                          {revisionMeta.revisionLabel}
                                        </span>
                                      )}
                                      {isCurrent && (
                                        <span className="text-[8px] px-1 py-0.5 bg-cyan-700 text-cyan-100 font-bold">
                                          JELENLEGI
                                        </span>
                                      )}
                                      {isLatest && !isCurrent && (
                                        <span className={`text-[8px] px-1 py-0.5 ${p.badge} font-bold`}>
                                          LEGÚJABB
                                        </span>
                                      )}
                                      {contract.isFinalRevision && (
                                        <span className={`text-[8px] px-1 py-0.5 ${isSignalTiles ? 'bg-emerald-800 text-emerald-200' : 'bg-[#06190d] text-white'} font-bold`}>
                                          VÉGLEGES
                                        </span>
                                      )}
                                    </div>
                                    <p className={`text-[10px] ${p.textDark}`}>
                                      {contract.templateName || 'Unknown template'}
                                      {contract.generatedAt && (
                                        <> • {new Date(contract.generatedAt).toLocaleDateString('hu-HU')}</>
                                      )}
                                    </p>
                                    {revisionMeta.sourceLabel && (
                                      <p className={`text-[10px] ${p.textMuted} mt-0.5`}>
                                        Forrás: {revisionMeta.sourceLabel}
                                      </p>
                                    )}
                                    <div className="mt-2 flex items-center gap-3">
                                      {previousInFamily ? (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            router.push(
                                              `/documents/compare?caseId=${encodeURIComponent(canonicalCaseId)}&documentId=${encodeURIComponent(contract.id)}&baselineId=${encodeURIComponent(previousInFamily.id)}`
                                            );
                                          }}
                                          className={`text-[8px] font-bold uppercase tracking-wide ${p.textDark} hover:${isSignalTiles ? 'text-cyan-400' : 'text-[#06190d]'}`}
                                        >
                                          Előző verzió
                                        </button>
                                      ) : (
                                        <span className={`text-[9px] ${p.textMuted} uppercase tracking-widest`}>
                                          Nincs korábbi verzió
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <span className={`text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-widest ${badge.class}`}>
                                  {badge.label}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Standalone Documents (no family) */}
                  {standalone.map((contract) => {
                    const badge = getStatusBadge(contract);
                    const isSelected = selectedContract?.id === contract.id;
                    const revisionMeta = getRevisionMeta(contract);
                    return (
                      <div
                        key={contract.id}
                        onClick={() => setSelectedContract(contract)}
                        className={`${p.bgCard} border-l-4 p-5 transition-all cursor-pointer group shadow-sm ${
                          isSelected ? `${isSignalTiles ? 'border-cyan-500' : 'border-[#819684]'} ${p.bgSection}` : isSignalTiles ? 'border-slate-600 hover:bg-slate-800' : 'border-[#c3c8c1] hover:bg-white'
                        } ${badge.label === 'Needs Revision' ? 'border-l-4 !border-red-500' : ''}`}
                      >
                        <div className="flex justify-between items-start mb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h4 className={`text-sm font-bold font-['Inter'] ${isSignalTiles ? 'text-slate-200' : 'text-[#06190d]'}`}>
                                  {contract.title || contract.templateName || 'Untitled Document'}
                                  {contract.revisionNumber && (
                                  <span className={`text-[10px] font-medium ${p.textDark} ml-2`}>
                                    v{contract.revisionNumber}
                                    </span>
                                  )}
                                </h4>
                                {revisionMeta.isDerived && (
                                  <span className="text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-widest bg-purple-900 text-purple-200">
                                    Szerkesztett verzió
                                  </span>
                                )}
                                <span className={`text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-widest ${badge.class}`}>
                                  {badge.label}
                                </span>
                              </div>
                              <p className={`text-[10px] ${p.textDark}`}>
                                {contract.templateName || 'Unknown template'}
                                {contract.generatedAt && (
                                  <> • {new Date(contract.generatedAt).toLocaleDateString('hu-HU')}</>
                                )}
                              </p>
                              {revisionMeta.sourceLabel && (
                                <p className={`text-[10px] ${p.textMuted} mt-0.5`}>
                                  Forrás: {revisionMeta.sourceLabel}
                                </p>
                              )}
                            </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {contract.spWebUrl && (
                              <button
                                className={`p-1 ${isSignalTiles ? 'hover:bg-slate-700' : 'hover:bg-[#eae8e3]'} transition-colors`}
                                title="Open in SharePoint"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(contract.spWebUrl!, '_blank');
                                }}
                              >
                                <span className="material-symbols-outlined text-lg">smb_share</span>
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(contract);
                              }}
                              disabled={isDownloading === contract.id}
                              className={`p-1 ${isSignalTiles ? 'hover:bg-slate-700' : 'hover:bg-[#eae8e3]'} transition-colors disabled:opacity-50`}
                              title="Letöltés"
                            >
                              <span className="material-symbols-outlined text-lg">download</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAnonymize(contract);
                              }}
                              className={`p-1 ${isSignalTiles ? 'hover:bg-slate-700' : 'hover:bg-[#eae8e3]'} transition-colors`}
                              title="Anonymize for AI"
                            >
                              <span className="material-symbols-outlined text-lg">shield</span>
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-4 flex-wrap">
                          {contract.status !== 'FINAL' && contract.status !== 'APPROVED' && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReview(contract.id);
                                }}
                                className={`text-[9px] font-bold uppercase tracking-widest ${isSignalTiles ? 'text-cyan-400 border-b border-cyan-400/20 hover:border-cyan-400' : 'text-[#06190d] border-b border-[#06190d]/20 hover:border-[#06190d]'} transition-all`}
                                >
                                Reviewre küldés
                              </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/documents/compare?caseId=${encodeURIComponent(canonicalCaseId)}&documentId=${encodeURIComponent(contract.id)}`);
                              }}
                              className={`text-[9px] font-bold uppercase tracking-widest ${p.textDark} hover:${isSignalTiles ? 'text-cyan-400' : 'text-[#06190d]'} transition-all`}
                            >
                              Összevetés
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCreateRevision(contract.id);
                              }}
                              disabled={isCreatingRevision === contract.id}
                              className={`text-[9px] font-bold uppercase tracking-widest ${p.textDark} hover:${isSignalTiles ? 'text-cyan-400' : 'text-[#06190d]'} transition-all disabled:opacity-50`}
                            >
                              {isCreatingRevision === contract.id ? 'Létrehozás...' : 'Új revízió'}
                            </button>
                            </>
                          )}
                          {contract.status === 'APPROVED' && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleFinalize(contract.id);
                                }}
                                disabled={isFinalizing === contract.id}
                                className={`text-[9px] font-bold uppercase tracking-widest ${isSignalTiles ? 'text-cyan-400 border-b border-cyan-400/20 hover:border-cyan-400' : 'text-[#06190d] border-b border-[#06190d]/20 hover:border-[#06190d]'} transition-all disabled:opacity-50`}
                              >
                                {isFinalizing === contract.id ? 'Véglegesítés...' : 'Véglegesítés'}
                              </button>
                              {!contract.spItemId && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSharePointUpload(contract);
                                  }}
                                  disabled={isUploadingToSP === contract.id}
                                  className={`text-[9px] font-bold uppercase tracking-widest ${p.textDark} hover:${isSignalTiles ? 'text-cyan-400' : 'text-[#06190d]'} transition-all disabled:opacity-50`}
                                >
                                  {isUploadingToSP === contract.id ? 'Feltöltés...' : 'Sync SharePointra'}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: Detail Panel */}
            <div className="col-span-12 lg:col-span-3">
              <section className={`${isSignalTiles ? 'bg-slate-800' : 'bg-[#eae8e3]'} p-6 border-t-2 ${isSignalTiles ? 'border-cyan-600' : 'border-[#06190d]'} sticky top-24`}>
                {selectedContract ? (
                  <>
                    <div className="mb-6">
                      <h3 className={`text-xs font-bold uppercase tracking-widest ${p.textDark} mb-1`}>
                        Selection Focus
                      </h3>
                      <h2 className={`text-xl font-['Newsreader'] font-bold leading-tight ${isSignalTiles ? 'text-slate-100' : 'text-[#06190d]'}`}>
                        {selectedContract.title || selectedContract.templateName || 'Document'}
                        {selectedContract.revisionNumber && ` v${selectedContract.revisionNumber}`}
                      </h2>
                    </div>
                    <div className="space-y-6">
                      {(() => {
                        const selectedRevisionMeta = getRevisionMeta(selectedContract);
                        if (!selectedRevisionMeta.isDerived && !selectedRevisionMeta.revisionLabel) {
                          return null;
                        }
                        return (
                          <div className={`py-2 border-b ${isSignalTiles ? 'border-slate-700' : 'border-[#c3c8c1]/20'}`}>
                            <span className={`text-[10px] uppercase font-bold ${p.textDark} block mb-1`}>Revision</span>
                            <div className="flex flex-wrap gap-1.5 mb-1">
                              {selectedRevisionMeta.isDerived && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-purple-900 text-purple-200 font-bold uppercase tracking-wide">
                                  Szerkesztett verzió
                                </span>
                              )}
                              {selectedRevisionMeta.revisionLabel && (
                                <span className={`text-[9px] px-1.5 py-0.5 ${p.badge} font-bold uppercase tracking-wide`}>
                                  {selectedRevisionMeta.revisionLabel}
                                </span>
                              )}
                            </div>
                            {selectedRevisionMeta.sourceLabel && (
                              <p className={`text-xs ${p.textMuted}`}>Forrás: {selectedRevisionMeta.sourceLabel}</p>
                            )}
                          </div>
                        );
                      })()}

                      {/* Status */}
                      <div className={`flex items-center justify-between py-2 border-b ${isSignalTiles ? 'border-slate-700' : 'border-[#c3c8c1]/20'}`}>
                        <span className={`text-[10px] uppercase font-bold ${p.textDark}`}>Status</span>
                        <span className={`text-xs font-bold uppercase tracking-widest ${
                          selectedContract.isFinalRevision ? (isSignalTiles ? 'text-cyan-400' : 'text-[#06190d]') : (isSignalTiles ? 'text-emerald-400' : 'text-[#819684]')
                        }`}>
                          {selectedContract.isFinalRevision ? 'FINAL' : selectedContract.status}
                        </span>
                      </div>

                      {/* SharePoint Status */}
                      <div className={`flex items-center justify-between py-2 border-b ${isSignalTiles ? 'border-slate-700' : 'border-[#c3c8c1]/20'}`}>
                        <span className={`text-[10px] uppercase font-bold ${p.textDark}`}>SharePoint</span>
                        <span className={`text-xs font-bold ${
                          selectedContract.spItemId ? (isSignalTiles ? 'text-emerald-400' : 'text-[#059669]') : (isSignalTiles ? 'text-red-400' : 'text-[#ba1a1a]')
                        }`}>
                          {selectedContract.spItemId ? 'Synced' : 'Not Synced'}
                        </span>
                      </div>

                      {/* Version */}
                      <div className={`flex items-center justify-between py-2 border-b ${isSignalTiles ? 'border-slate-700' : 'border-[#c3c8c1]/20'}`}>
                        <span className={`text-[10px] uppercase font-bold ${p.textDark}`}>Version</span>
                        <span className="text-xs font-bold">
                          {selectedContract.revisionNumber ? `v${selectedContract.revisionNumber}` : 'v1'}
                        </span>
                      </div>

                      {/* Lineage Context */}
                      <div className={`py-2 border-b ${isSignalTiles ? 'border-slate-700' : 'border-[#c3c8c1]/20'}`}>
                        <span className={`text-[10px] uppercase font-bold ${p.textDark} block mb-1`}>Lineage</span>
                        {selectedFamily ? (
                          <>
                            <p className="text-xs">{selectedFamily.versionCount} version{selectedFamily.versionCount !== 1 ? 's' : ''} in family</p>
                            <p className={`text-xs ${p.textMuted}`}>{selectedFamily.groupingStrength === 'explicit' ? 'threadId-based (grounded)' : 'title-based (inferred)'}</p>
                            {selectedContract.isCurrentRevision && (
                              <p className={`text-xs font-bold mt-1 ${isSignalTiles ? 'text-emerald-400' : 'text-[#23472F]'}`}>← Current working version</p>
                            )}
                            {selectedContract.isFinalRevision && (
                              <p className={`text-xs font-bold mt-1 ${isSignalTiles ? 'text-cyan-400' : 'text-[#06190d]'}`}>← Final approved version</p>
                            )}
                            <p className="text-xs mt-1">
                              Previous: {previousVersionForSelected ? `v${previousVersionForSelected.revisionNumber || '—'}` : 'none'}
                            </p>
                          </>
                        ) : (
                          <p className={`text-xs ${p.textMuted}`}>Standalone document (no version family)</p>
                        )}
                      </div>

                      {/* Generated */}
                      <div className={`flex items-center justify-between py-2 border-b ${isSignalTiles ? 'border-slate-700' : 'border-[#c3c8c1]/20'}`}>
                        <span className={`text-[10px] uppercase font-bold ${p.textDark}`}>Generated</span>
                        <span className="text-xs">
                          {selectedContract.generatedAt
                            ? new Date(selectedContract.generatedAt).toLocaleDateString('hu-HU')
                            : 'Unknown'}
                        </span>
                      </div>

                      {/* Dokumentum műveletek */}
                      <div className="space-y-3 pt-4">
                        <span className={`text-[10px] uppercase font-bold ${isSignalTiles ? 'text-cyan-400' : 'text-[#06190d]'} block border-b ${isSignalTiles ? 'border-slate-700' : 'border-[#06190d]/10'} pb-1`}>
                          Műveletek
                        </span>
                        <p className={`text-[9px] ${p.textMuted}`}>
                          Válassz műveletet: letöltés, review, metaadat összevetés, vagy előző verzióval összevetés.
                        </p>
                        <button
                          onClick={() => handleDownload(selectedContract)}
                          disabled={isDownloading === selectedContract.id}
                          className={`w-full ${isSignalTiles ? 'bg-cyan-700 text-white hover:bg-cyan-600' : 'bg-[#06190d] text-white hover:opacity-90'} py-3 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 transition-colors`}
                        >
                          <span className="material-symbols-outlined text-sm">download</span>
                          {isDownloading === selectedContract.id ? 'Letöltés...' : 'Letöltés'}
                        </button>
                        {selectedContract.status !== 'FINAL' && (
                          <button
                            onClick={() => handleReview(selectedContract.id)}
                            className={`w-full border ${isSignalTiles ? 'border-cyan-700 text-cyan-300 hover:bg-cyan-900/30' : 'border-[#06190d]/20 text-[#06190d] hover:bg-[#06190d]/5'} py-3 text-xs font-bold uppercase tracking-widest transition-colors`}
                          >
                            Review megnyitása
                          </button>
                        )}
                        <button
                          onClick={() => router.push(`/documents/compare?caseId=${encodeURIComponent(canonicalCaseId)}&documentId=${encodeURIComponent(selectedContract.id)}`)}
                          className={`w-full border ${isSignalTiles ? 'border-cyan-700 text-cyan-300 hover:bg-cyan-900/30' : 'border-[#06190d]/20 text-[#06190d] hover:bg-[#06190d]/5'} py-3 text-xs font-bold uppercase tracking-widest transition-colors`}
                        >
                          Metaadat összevetés
                        </button>
                        {previousVersionForSelected && (
                          <button
                            onClick={() =>
                              router.push(
                                `/documents/compare?caseId=${encodeURIComponent(canonicalCaseId)}&documentId=${encodeURIComponent(selectedContract.id)}&baselineId=${encodeURIComponent(previousVersionForSelected.id)}`
                              )
                            }
                            className={`w-full border ${isSignalTiles ? 'border-cyan-700 text-cyan-300 hover:bg-cyan-900/30' : 'border-[#06190d]/20 text-[#06190d] hover:bg-[#06190d]/5'} py-3 text-xs font-bold uppercase tracking-widest transition-colors`}
                          >
                            Összevetés előző verzióval
                          </button>
                        )}
                        {!selectedContract.spItemId && selectedContract.status === 'APPROVED' && (
                          <button
                            onClick={() => handleSharePointUpload(selectedContract)}
                            disabled={isUploadingToSP === selectedContract.id}
                            className={`w-full border ${isSignalTiles ? 'border-cyan-700 text-cyan-300 hover:bg-cyan-900/30' : 'border-[#06190d]/20 text-[#06190d] hover:bg-[#06190d]/5'} py-3 text-xs font-bold uppercase tracking-widest disabled:opacity-50 transition-colors`}
                          >
                            {isUploadingToSP === selectedContract.id ? 'Uploading...' : 'Sync to SharePoint'}
                          </button>
                        )}
                      </div>

                      {/* NOTES SECTION - Document Internal Notes */}
                      <div className={`mt-6 pt-4 border-t ${isSignalTiles ? 'border-slate-700' : 'border-[#c3c8c1]/20'}`}>
                        <button
                          onClick={() => setShowNotes(!showNotes)}
                          className="w-full flex items-center justify-between text-left"
                        >
                          <span className={`text-[10px] uppercase font-bold ${isSignalTiles ? 'text-cyan-400' : 'text-[#06190d]'} border-b ${isSignalTiles ? 'border-slate-700' : 'border-[#06190d]/10'} pb-1`}>
                            Megjegyzések ({documentNotes.length})
                          </span>
                          <span className={`material-symbols-outlined text-sm ${p.textDark}`}>
                            {showNotes ? 'expand_less' : 'expand_more'}
                          </span>
                        </button>

                        {showNotes && (
                          <div className="mt-3 space-y-3">
                            {/* Add Note Form */}
                            <div className="space-y-2">
                              <input
                                type="text"
                                placeholder="Tárgy (opcionális)"
                                value={newNoteSubject}
                                onChange={(e) => setNewNoteSubject(e.target.value)}
                                className={`w-full px-2 py-1.5 text-[10px] border ${p.borderLight} ${p.bgCard} ${isSignalTiles ? 'text-slate-200' : 'text-[#06190d]'} ${isSignalTiles ? 'placeholder:text-slate-500' : 'placeholder:text-[#7B776D]'} focus:outline-none ${isSignalTiles ? 'focus:border-cyan-600' : 'focus:border-[#06190d]'}`}
                              />
                              <textarea
                                placeholder="Új megjegyzés..."
                                value={newNoteContent}
                                onChange={(e) => setNewNoteContent(e.target.value)}
                                rows={2}
                                className={`w-full px-2 py-1.5 text-[10px] border ${p.borderLight} ${p.bgCard} ${isSignalTiles ? 'text-slate-200' : 'text-[#06190d]'} ${isSignalTiles ? 'placeholder:text-slate-500' : 'placeholder:text-[#7B776D]'} focus:outline-none ${isSignalTiles ? 'focus:border-cyan-600' : 'focus:border-[#06190d]'} resize-none`}
                              />
                              <button
                                onClick={handleAddNote}
                                disabled={isAddingNote || !newNoteContent.trim()}
                                className={`w-full ${isSignalTiles ? 'bg-cyan-700 text-white hover:bg-cyan-600' : 'bg-[#06190d] text-white hover:opacity-90'} py-1.5 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
                              >
                                {isAddingNote ? 'Saving...' : 'Hozzáadás'}
                              </button>
                            </div>

                            {/* Notes List */}
                            {isLoadingNotes ? (
                              <p className={`text-[10px] ${p.textMuted} italic py-2`}>Loading...</p>
                            ) : noteError ? (
                              <p className={`text-[10px] ${isSignalTiles ? 'text-red-400' : 'text-[#ba1a1a]'} py-2`}>{noteError}</p>
                            ) : documentNotes.length === 0 ? (
                              <p className={`text-[10px] ${p.textMuted} italic py-2`}>No notes yet</p>
                            ) : (
                              <div className="space-y-2 max-h-48 overflow-y-auto">
                                {documentNotes.map((note) => (
                                  <div key={note.id} className={`${p.bgSection} p-2 border ${p.borderLight}`}>
                                    <div className="flex justify-between items-start mb-1">
                                      <p className={`text-[10px] font-bold ${isSignalTiles ? 'text-slate-200' : 'text-[#06190d]'} truncate flex-1`}>
                                        {note.subject || '(no subject)'}
                                      </p>
                                      <p className={`text-[9px] ${p.textMuted} ml-2 shrink-0`}>
                                        {note.createdAt ? new Date(note.createdAt).toLocaleDateString('hu-HU', { day: '2-digit', month: '2-digit' }) : ''}
                                      </p>
                                    </div>
                                    <p className={`text-[10px] ${p.textDark} whitespace-pre-wrap break-words`}>
                                      {note.content}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                  ) : (
                    <div className="text-center py-8">
                      <span className={`material-symbols-outlined text-4xl ${isSignalTiles ? 'text-slate-600' : 'text-[#c3c8c1]'}`}>touch_app</span>
                      <p className={`${p.textDark} text-sm mt-2`}>Select a document to view details</p>
                    </div>
                  )}
                </section>
            </div>
          </div>
        </main>

      </div>

      {/* Anonymize Modal */}
      {anonymizeModalContract && (
        <AnonymizeModal
          isOpen={!!anonymizeModalContract}
          onClose={() => setAnonymizeModalContract(null)}
          contract={anonymizeModalContract}
          caseId={canonicalCaseId}
          clientName={caseRecord?.clientName}
          clientRole={caseRecord?.clientRole}
          onSuccess={handleAnonymizeSuccess}
        />
      )}

      {/* Rehydrate Modal — access via Case Detail AI Processing section after anonymization */}
      {rehydrateModalDoc && (
        <RehydrateModal
          isOpen={rehydrateModalOpen}
          onClose={() => {
            setRehydrateModalOpen(false);
            setRehydrateModalDoc(null);
          }}
          anonymousDocId={rehydrateModalDoc.id}
          anonymousDocName={rehydrateModalDoc.name}
          caseId={canonicalCaseId}
          onSuccess={handleRehydrateSuccess}
          onSaveSuccess={handleRehydrateSaveSuccess}
        />
      )}
    </div>
  );
}
