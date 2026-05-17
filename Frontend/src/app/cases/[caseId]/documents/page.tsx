"use client";

import { useState, use, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import {
  getCaseContracts,
  getCases,
  getCaseTimeline,
  getCaseDocuments,
  downloadContract,
  downloadDocument,
  uploadCaseDocument,
  uploadGeneratedContractToSharePoint,
  createContractGenerationRevision,
  finalizeContractGeneration,
  downloadCaseBundle,
  getCommunications,
  createCommunication,
  createCaseHandoffPackage,
  getAnonymousDocumentsBySource,
  getCaseClientHouseStyle,
  listDocumentLegalAnalyses,
  type CaseContractListItem,
  type DocumentItem,
  type TimelineEventItem,
  type CommunicationItem,
  type ClientHouseStyleProfile,
} from "@/lib/api";
import { AnonymizeModal, type AnonymizeResult } from "@/components/documents/AnonymizeModal";
import { RehydrateModal } from "@/components/documents/RehydrateModal";
import { HandoffPackagePanel } from "@/components/handoff/HandoffPackagePanel";
import { ClientHouseStylePanel } from "@/components/clients/ClientHouseStylePanel";
import { AdminBadge, AdminButton, AdminDocumentRow, AdminPanel, AdminStatusPill } from "@/components/adminiculum/ui";
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

type SelectedLedgerItem =
  | { kind: 'uploaded'; item: DocumentItem }
  | { kind: 'generated'; item: CaseContractListItem };

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsDataURL(file);
  });

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
  const [uploadedDocuments, setUploadedDocuments] = useState<DocumentItem[]>([]);
  const [caseRecord, setCaseRecord] = useState<{
    id: string;
    clientId?: string;
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
  const [selectedLedgerItem, setSelectedLedgerItem] = useState<SelectedLedgerItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingToSP, setIsUploadingToSP] = useState<string | null>(null);
  const [isCreatingRevision, setIsCreatingRevision] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [anonymizeModalContract, setAnonymizeModalContract] = useState<CaseContractListItem | null>(null);
  const [rehydrateModalDoc, setRehydrateModalDoc] = useState<{ id: string; name: string } | null>(null);
  const [rehydrateModalOpen, setRehydrateModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Document notes state (reusing Communication model with type: NOTE)
  const [documentNotes, setDocumentNotes] = useState<CommunicationItem[]>([]);
  const [newNoteSubject, setNewNoteSubject] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);

  // Handoff package creation state
  const [isCreatingHandoffPackage, setIsCreatingHandoffPackage] = useState(false);
  const [handoffPackageMessage, setHandoffPackageMessage] = useState<string | null>(null);
  const [handoffPackageError, setHandoffPackageError] = useState<string | null>(null);
  const [handoffPanelRefreshKey, setHandoffPanelRefreshKey] = useState(0);
  const [clientHouseStyle, setClientHouseStyle] = useState<ClientHouseStyleProfile | null>(null);
  const [isLoadingHouseStyle, setIsLoadingHouseStyle] = useState(false);
  const [showHouseStylePanel, setShowHouseStylePanel] = useState(false);

  const searchParams = useSearchParams();
  const requestedDocumentId = searchParams?.get("documentId") ?? null;
  const requestedDocumentIdRef = useRef<string | null>(requestedDocumentId);
  if (requestedDocumentId) {
    requestedDocumentIdRef.current = requestedDocumentId;
  }

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
            clientId: record.clientId,
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
      const [contractsData, uploadedDocsData, timelineData] = await Promise.all([
        getCaseContracts(caseRecord.id).catch(() => []),
        getCaseDocuments(caseRecord.id).catch(() => []),
        getCaseTimeline(caseRecord.id).catch(() => []),
      ]);
      setContracts(contractsData);
      setUploadedDocuments(uploadedDocsData);
      setTimeline(timelineData);
      // Auto-select deep-linked document if requested, otherwise default first-available.
      const deepLinkedId = requestedDocumentIdRef.current;
      if (deepLinkedId) {
        const uploadedMatch = uploadedDocsData.find(doc => doc.id === deepLinkedId);
        if (uploadedMatch) {
          setSelectedLedgerItem({ kind: 'uploaded', item: uploadedMatch });
          setSelectedContract(null);
          requestedDocumentIdRef.current = null;
        } else {
          const contractMatch = contractsData.find(c => c.id === deepLinkedId);
          if (contractMatch) {
            setSelectedLedgerItem({ kind: 'generated', item: contractMatch });
            setSelectedContract(contractMatch);
            requestedDocumentIdRef.current = null;
          }
        }
      } else if (!selectedLedgerItem) {
        if (uploadedDocsData.length > 0) {
          setSelectedLedgerItem({ kind: 'uploaded', item: uploadedDocsData[0] });
          setSelectedContract(null);
        } else if (contractsData.length > 0) {
          setSelectedLedgerItem({ kind: 'generated', item: contractsData[0] });
          setSelectedContract(contractsData[0]);
        }
      }
      if (contractsData.length > 0 && !selectedContract && !selectedLedgerItem) {
        setSelectedContract(contractsData[0]);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [caseRecord?.id, selectedContract, selectedLedgerItem]);

  // Re-trigger loadData once caseRecord is resolved to CUID
  useEffect(() => {
    if (caseRecord?.id) {
      loadData();
    }
  }, [caseRecord?.id, loadData]);

  useEffect(() => {
    if (!caseRecord?.id) {
      setClientHouseStyle(null);
      return;
    }
    let cancelled = false;
    setIsLoadingHouseStyle(true);
    getCaseClientHouseStyle(caseRecord.id)
      .then((profile) => {
        if (!cancelled) setClientHouseStyle(profile);
      })
      .catch(() => {
        if (!cancelled) setClientHouseStyle(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHouseStyle(false);
      });
    return () => {
      cancelled = true;
    };
  }, [caseRecord?.id]);

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
      setActionResult({ type: 'success', message: 'Letöltés elindult' });
    } catch (err) {
      console.error('Download failed:', err);
      setActionResult({ type: 'error', message: 'Letöltés sikertelen' });
    } finally {
      setIsDownloading(null);
    }
  };

  const handleDownloadUploadedDocument = async (document: DocumentItem) => {
    setIsDownloading(document.id);
    try {
      const blob = await downloadDocument(document.id);
      const url = URL.createObjectURL(blob);
      const a = globalThis.document.createElement('a');
      a.href = url;
      a.download = document.fileName || 'document';
      globalThis.document.body.appendChild(a);
      a.click();
      globalThis.document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setActionResult({ type: 'success', message: 'Letöltés elindult' });
    } catch (err) {
      console.error('Document download failed:', err);
      setActionResult({ type: 'error', message: 'Letöltés sikertelen' });
    } finally {
      setIsDownloading(null);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !caseRecord?.id) return;

    setIsUploading(true);
    setActionResult(null);
    try {
      const base64 = await fileToBase64(file);
      const uploaded = await uploadCaseDocument({
        caseId: caseRecord.id,
        fileName: file.name,
        fileContentBase64: base64,
        mimeType: file.type || 'application/octet-stream',
        documentType: 'CLIENT_INPUT',
        folder: 'CLIENT_INPUT',
      });
      const docs = await getCaseDocuments(caseRecord.id).catch(() => [uploaded]);
      setUploadedDocuments(docs);
      setSelectedLedgerItem({ kind: 'uploaded', item: uploaded });
      setSelectedContract(null);
      setActionResult({ type: 'success', message: 'Dokumentum feltöltve' });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Upload failed:', err);
      setActionResult({ type: 'error', message: 'Dokumentum feltöltése sikertelen. Kérjük, próbáld újra később.' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSharePointUpload = async (contract: CaseContractListItem) => {
    setIsUploadingToSP(contract.id);
    try {
      const result = await uploadGeneratedContractToSharePoint(contract.id);
      if (result.success) {
        setActionResult({ type: 'success', message: 'SharePoint szinkronizálás elindult' });
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
        setActionResult({ type: 'success', message: `Új verzió létrejött: v${result.newContract.revisionNumber}` });
        loadData(); // Refresh data
      } else {
        setActionResult({ type: 'error', message: result.error || 'Nem sikerült új verziót létrehozni' });
      }
    } catch (err) {
      console.error('Create revision failed:', err);
      setActionResult({ type: 'error', message: 'Nem sikerült új verziót létrehozni' });
    } finally {
      setIsCreatingRevision(null);
    }
  };

  const handleFinalize = async (contractId: string) => {
    setIsFinalizing(contractId);
    try {
      const result = await finalizeContractGeneration(contractId);
      if (result.success) {
        setActionResult({ type: 'success', message: 'Dokumentum véglegesként jelölve' });
        loadData(); // Refresh data
      } else {
        setActionResult({ type: 'error', message: result.error || 'Nem sikerült véglegesíteni' });
      }
    } catch (err) {
      console.error('Finalize failed:', err);
      setActionResult({ type: 'error', message: 'Nem sikerült véglegesíteni a dokumentumot' });
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
      setActionResult({ type: 'success', message: 'Ügycsomag letöltése elindult' });
    } catch (err) {
      console.error('Bundle download failed:', err);
      setActionResult({ type: 'error', message: 'Ügycsomag letöltése sikertelen' });
    }
  };

  const handleReview = (contractId: string) => {
    router.push(`/cases/${canonicalCaseId}/review/${contractId}`);
  };

  const handleGenerate = () => {
    router.push(`/cases/${canonicalCaseId}/generate/assembly`);
  };

  const handleLegacyGenerate = () => {
    router.push(`/cases/${canonicalCaseId}/generate?family=sale_purchase`);
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

  const resolveHandoffPackageLinks = async (
    ledgerItem: SelectedLedgerItem,
    caseId: string,
  ): Promise<{ anonymizedDocumentId?: string; legalAnalysisId?: string }> => {
    try {
      if (ledgerItem.kind === 'uploaded') {
        const [anonDocs, analyses] = await Promise.all([
          getAnonymousDocumentsBySource(ledgerItem.item.id).catch(() => []),
          listDocumentLegalAnalyses(ledgerItem.item.id, {
            caseId,
            documentSourceType: 'DOCUMENT',
          }).catch(() => []),
        ]);
        return {
          anonymizedDocumentId: anonDocs[0]?.id,
          legalAnalysisId: analyses[0]?.id,
        };
      } else {
        const analyses = await listDocumentLegalAnalyses(ledgerItem.item.id, {
          caseId,
          documentSourceType: 'CONTRACT_GENERATION',
        }).catch(() => []);
        return {
          legalAnalysisId: analyses[0]?.id,
        };
      }
    } catch {
      return {};
    }
  };

  const handleCreateHandoffPackage = async () => {
    if (!caseRecord?.id || !selectedLedgerItem) return;
    setHandoffPackageMessage(null);
    setHandoffPackageError(null);
    setIsCreatingHandoffPackage(true);
    try {
      const resolved = await resolveHandoffPackageLinks(selectedLedgerItem, caseRecord.id);
      const payload = {
        packageType: 'STANDARD' as const,
        preparerSummary: '',
        ...(selectedLedgerItem.kind === 'uploaded'
          ? {
              sourceDocumentId: selectedLedgerItem.item.id,
              anonymizedDocumentId: resolved.anonymizedDocumentId,
              legalAnalysisId: resolved.legalAnalysisId,
            }
          : {
              generatedContractId: selectedLedgerItem.item.id,
              legalAnalysisId: resolved.legalAnalysisId,
            }),
      };
      await createCaseHandoffPackage(caseRecord.id, payload);
      setHandoffPackageMessage('Leadási csomag piszkozat létrehozva. A meglévő anonimizált szöveg és jogi elemzés automatikusan csatolva lett, ha elérhető volt.');
      setHandoffPanelRefreshKey((k) => k + 1);
    } catch {
      setHandoffPackageError('Nem sikerült létrehozni a leadási csomagot.');
    } finally {
      setIsCreatingHandoffPackage(false);
    }
  };

  const selectedUploadedDocument = selectedLedgerItem?.kind === 'uploaded' ? selectedLedgerItem.item : null;
  const selectedGeneratedContract = selectedLedgerItem?.kind === 'generated' ? selectedLedgerItem.item : selectedContract;

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
    if (!selectedGeneratedContract || !newNoteContent.trim()) return;
    setIsAddingNote(true);
    setNoteError(null);
    try {
      const newNote = await createCommunication({
        type: 'NOTE',
        subject: newNoteSubject.trim() || '(no subject)',
        content: newNoteContent.trim(),
        documentId: selectedGeneratedContract.id,
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

  // Load notes when a generated contract is selected.
  useEffect(() => {
    if (selectedGeneratedContract?.id && !selectedUploadedDocument) {
      loadDocumentNotes(selectedGeneratedContract.id);
    } else {
      setDocumentNotes([]);
    }
  }, [selectedGeneratedContract?.id, selectedUploadedDocument, loadDocumentNotes]);

  const displayCaseId = caseRecord?.caseNumber || resolvedParams.caseId;
  const displayMatterName = (caseRecord?.title && caseRecord.title !== 'null' && caseRecord.title !== 'null - null') ? caseRecord.title : 'Dokumentumtár';
  const displayClient = (caseRecord?.clientName && caseRecord.clientName !== 'null') ? caseRecord.clientName : '';
  const canonicalCaseId = caseRecord?.id || resolvedParams.caseId;

  // Package health calculations
  const totalContracts = contracts.length;
  const totalUploadedDocuments = uploadedDocuments.length;
  const totalLedgerDocuments = totalContracts + totalUploadedDocuments;
  // Family grouping for document lineage
  const { families, standalone } = groupIntoFamilies(contracts);

  const selectedFamily = useMemo(() => {
    if (!selectedGeneratedContract) return null;
    return families.find((family) => family.items.some((item) => item.id === selectedGeneratedContract.id)) || null;
  }, [families, selectedGeneratedContract]);

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
    const revisionLabel = contract.revisionNumber ? `v${contract.revisionNumber}` : null;
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
    if (!selectedFamily || !selectedGeneratedContract) return null;
    const index = selectedFamily.items.findIndex((item) => item.id === selectedGeneratedContract.id);
    if (index < 0) return null;
    return selectedFamily.items[index + 1] || null;
  }, [selectedFamily, selectedGeneratedContract]);

  // Get contract status badge
  const getStatusBadge = (contract: CaseContractListItem) => {
    if (contract.isFinalRevision) {
      return { label: 'Végleges', class: 'bg-primary text-white' };
    }
    switch (contract.status) {
      case 'APPROVED':
        return { label: 'Jóváhagyott', class: 'bg-[#d1e8d3] text-[#23472F]' };
      case 'IN_REVIEW':
      case 'SUBMITTED':
        return { label: 'Review alatt', class: 'bg-[#e4e2e1] text-[#656464]' };
      case 'REJECTED':
        return { label: 'Módosítás szükséges', class: 'bg-[#ffdad6] text-[#ba1a1a]' };
      case 'GENERATED':
        return { label: 'Piszkozat', class: 'bg-[#f5f3ee] text-[#434843]' };
      default:
        return { label: contract.status || 'Ismeretlen', class: 'bg-[#f5f3ee] text-[#434843]' };
    }
  };

  const formatShortDate = (value?: string | null) => {
    if (!value) return 'Nincs megadva';
    try {
      return new Date(value).toLocaleDateString('hu-HU');
    } catch {
      return value;
    }
  };

  const getFileType = (fileName?: string | null) => {
    const ext = (fileName?.split('.').pop() || '').toLowerCase();
    if (['doc', 'docx'].includes(ext)) return 'DOCX';
    if (ext === 'pdf') return 'PDF';
    if (ext === 'txt') return 'TXT';
    return 'FILE';
  };

  const getDocumentKindLabel = (fileName?: string | null) => {
    const type = getFileType(fileName);
    if (type === 'DOCX') return 'Word';
    if (type === 'PDF') return 'PDF';
    if (type === 'TXT') return 'Szöveg';
    return 'Fájl';
  };

  const getContractStatusLabel = (contract: CaseContractListItem) => {
    if (contract.isFinalRevision) return 'Végleges';
    switch (contract.status) {
      case 'APPROVED':
        return 'Jóváhagyott';
      case 'IN_REVIEW':
      case 'SUBMITTED':
        return 'Review-on';
      case 'REJECTED':
        return 'Visszaküldve';
      case 'GENERATED':
        return 'Generált';
      default:
        return 'Piszkozat';
    }
  };

  const humanizeTimelineType = (event: TimelineEventItem) => {
    const raw = String(event.type || event.typeLabel || '');
    const map: Record<string, string> = {
      CASE_CREATED: 'Ügy létrehozva',
      DOCUMENT_UPLOADED: 'Dokumentum feltöltve',
      DOCUMENT_ANONYMIZED_FOR_AI: 'Anonimizálás elkészült',
      CONTRACT_GENERATED: 'Szerződés generálva sablonból',
      REVIEW_REQUESTED: 'Review kérve',
      REVIEW_COMPLETED: 'Review lezárva',
      HANDOFF_PACKAGE_CREATED: 'Leadási csomag létrehozva',
      HANDOFF_PACKAGE_SUBMITTED: 'Leadási csomag beküldve',
      HANDOFF_PACKAGE_REVIEWED: 'Leadási csomag review lezárva',
    };
    return map[raw] || event.typeLabel || 'Ügyesemény';
  };

  const openWorkspace = (documentId: string) => {
    router.push(`/documents/compare?caseId=${encodeURIComponent(canonicalCaseId)}&documentId=${encodeURIComponent(documentId)}`);
  };

  const openActiveWorkspace = () => {
    const activeDocumentId = selectedUploadedDocument?.id || selectedGeneratedContract?.id;
    const query = activeDocumentId
      ? `?caseId=${encodeURIComponent(canonicalCaseId)}&documentId=${encodeURIComponent(activeDocumentId)}`
      : `?caseId=${encodeURIComponent(canonicalCaseId)}`;
    router.push(`/documents/compare${query}`);
  };

  const openUploadedAnonymize = (document: DocumentItem) => {
    const fakeContract: CaseContractListItem = {
      id: document.id,
      title: document.fileName || 'Feltöltött dokumentum',
      templateName: '',
      category: document.documentType || 'Feltöltött irat',
      status: document.folder || 'Feltöltve',
      fileName: document.fileName || 'document',
      fileSize: 0,
      generatedAt: document.createdAt || new Date().toISOString(),
      revisionNumber: Number(document.version) || 1,
      isCurrentRevision: true,
      isFinalRevision: false,
    };
    setAnonymizeModalContract(fakeContract);
  };

  const activeDocument = selectedUploadedDocument || selectedGeneratedContract;

  const generatedLedgerItems = [...families.flatMap((family) => family.items), ...standalone];
  const activeTitle = selectedUploadedDocument?.fileName || selectedGeneratedContract?.title || selectedGeneratedContract?.fileName || selectedGeneratedContract?.templateName || null;
  const metaCompareUrl = activeDocument ? `/documents/compare?caseId=${encodeURIComponent(canonicalCaseId)}&documentId=${encodeURIComponent(activeDocument.id)}` : `/documents/compare?caseId=${encodeURIComponent(canonicalCaseId)}`;

  return (
    <div className="flex min-h-0 flex-1 bg-[#EFE7CF] text-[#16201A] documents-surface">
      {/* LEFT SIDEBAR - Navigation - consistent with Generation/Communications */}
      <aside className="flex w-56 flex-col border-r border-[rgba(22,32,26,0.20)] bg-[#1F4A33] text-[#F4EFDB]">
        <div className={`p-4 border-b ${p.border}`}>
          <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[#B58A2A]">Ügy</p>
          <p className="text-[12px] font-semibold leading-tight text-[#F4EFDB]">{displayMatterName || 'Ügy megnevezése nem elérhető'}</p>
          <p className="mt-1 text-[10px] text-[#F4EFDB]/60">{displayCaseId}</p>
          <p className="mt-1 text-[10px] text-[#F4EFDB]/60">{displayClient}</p>
        </div>
        
        <nav className="flex-1 p-2 space-y-2">
          <button
            onClick={() => router.push(`/cases/${canonicalCaseId}`)}
            className={`w-full text-left px-3 py-2 text-xs font-semibold rounded transition-colors ${
              false ? "bg-[#B58A2A] text-[#173824]" : "text-[#F4EFDB]/85 hover:bg-[#173824] hover:text-[#F4EFDB]"
            }`}
          >
            Ügy áttekintő
          </button>
          <button
            className="w-full rounded bg-[#B58A2A] px-3 py-2 text-left text-xs font-semibold text-[#173824] transition-colors"
          >
            Dokumentumtár
          </button>
          <button
            onClick={openActiveWorkspace}
            className="w-full rounded px-3 py-2 text-left text-xs font-semibold text-[#F4EFDB]/85 transition-colors hover:bg-[#173824] hover:text-[#F4EFDB]"
          >
            Szerződés-workspace
          </button>
          <button
            onClick={() => router.push(`/cases/${canonicalCaseId}/communications`)}
            className="w-full rounded px-3 py-2 text-left text-xs font-semibold text-[#F4EFDB]/85 transition-colors hover:bg-[#173824] hover:text-[#F4EFDB]"
          >
            Kommunikáció
          </button>
          <button
            onClick={() => router.push(`/documents/compare?caseId=${encodeURIComponent(canonicalCaseId)}`)}
            className="w-full rounded px-3 py-2 text-left text-xs font-semibold text-[#F4EFDB]/85 transition-colors hover:bg-[#173824] hover:text-[#F4EFDB]"
          >
            Verzió-összevetés
          </button>
        </nav>

        <div className={`p-3 border-t ${p.border}`}>
          <button
            onClick={handleGenerate}
             className="w-full bg-[#B58A2A] py-2 text-xs font-bold uppercase tracking-widest text-[#173824] transition-colors hover:bg-[#D1A83A]"
          >
            Szerződés összeállítása
          </button>
          <button
            onClick={handleLegacyGenerate}
             className="mt-2 w-full border border-[#F4EFDB]/30 py-2 text-xs font-bold uppercase tracking-widest text-[#F4EFDB]/85 transition-colors hover:bg-[#173824] hover:text-[#F4EFDB]"
          >
            Régi adásvételi generátor
          </button>
           <p className="mt-1 text-[9px] text-[#F4EFDB]/65">
            Külön szerződés-összeállító felület; a dokumentum workspace az aktív iratból nyílik.
          </p>
          <button
            onClick={handleBundleDownload}
             className="mt-2 w-full border border-[#F4EFDB]/30 py-2 text-xs font-bold uppercase tracking-widest text-[#F4EFDB]/85 transition-colors hover:bg-[#173824] hover:text-[#F4EFDB]"
          >
            Csomag letöltése
          </button>
           <p className="mt-1 text-[9px] text-[#F4EFDB]/65">
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

          <section className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7A8479]">
                  Ügyeim <span className="mx-1 text-[#B58A2A]">›</span> {displayMatterName || displayClient || displayCaseId} <span className="mx-1 text-[#B58A2A]">›</span> Dokumentumtár
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h1 className="font-serif text-4xl font-semibold leading-tight text-[#16201A]">Dokumentumtár</h1>
                  <AdminBadge tone={activeDocument ? "green" : "neutral"} dot>
                    {totalLedgerDocuments} irat · {activeDocument ? "1 aktív" : "nincs aktív"}
                  </AdminBadge>
                </div>
                <p className="mt-2 max-w-2xl text-sm text-[#3D4842]">
                  {displayMatterName} {displayClient ? `· ${displayClient}` : ""} {displayCaseId ? `· ${displayCaseId}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <AdminButton variant="primary" onClick={() => fileInputRef.current?.click()} disabled={!caseRecord?.id || isUploading}>
                  {isUploading ? "Feltöltés..." : "Dokumentum feltöltése"}
                </AdminButton>
                <AdminButton variant="gold" onClick={handleGenerate}>Szerződés összeállítása klauzulákból</AdminButton>
                <AdminButton variant="muted" onClick={handleLegacyGenerate}>Régi adásvételi generátor</AdminButton>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleFileUpload} className="hidden" />
            {actionResult && (
              <div className={`rounded-[6px] border p-3 text-sm ${actionResult.type === "success" ? "border-[#D9E3CC] bg-[#EEF5E7] text-[#23472F]" : "border-[#F2DAD6] bg-[#FFF5F3] text-[#8B2A2A]"}`}>
                {actionResult.message}
              </div>
            )}
          </section>

          {isLoading ? (
            <AdminPanel className="p-10 text-center text-sm text-[#7A8479]">Dokumentumok betöltése...</AdminPanel>
          ) : (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)_300px]">
              <AdminPanel className="overflow-hidden">
                <div className="border-b border-[rgba(22,32,26,0.10)] p-4">
                  <h2 className="font-serif text-2xl font-medium text-[#16201A]">Iratok</h2>
                  <p className="mt-1 text-[12px] text-[#7A8479]">Több dokumentum is tárolható, de egyszerre mindig egy aktív munkadokumentumon dolgozol.</p>
                </div>
                <div className="space-y-5 p-4">
                  <section className="space-y-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A8479]">Feltöltött dokumentumok</h3>
                    {uploadedDocuments.length === 0 ? (
                      <p className="rounded border border-dashed border-[rgba(22,32,26,0.16)] p-3 text-[12px] text-[#7A8479]">Nincs feltöltött dokumentum.</p>
                    ) : uploadedDocuments.map((doc) => {
                      const isSelected = selectedLedgerItem?.kind === "uploaded" && selectedLedgerItem.item.id === doc.id;
                      return (
                        <AdminDocumentRow
                          key={doc.id}
                          title={doc.fileName || "Névtelen dokumentum"}
                          meta={`${formatShortDate(doc.createdAt)} · ${getDocumentKindLabel(doc.fileName)}`}
                          fileType={getFileType(doc.fileName)}
                          active={isSelected}
                          variant="upload"
                          onClick={() => { setSelectedLedgerItem({ kind: "uploaded", item: doc }); setSelectedContract(null); }}
                          status={<><AdminStatusPill tone="gold">Feltöltve</AdminStatusPill>{isSelected ? <AdminBadge tone="green">Aktív</AdminBadge> : null}</>}
                        />
                      );
                    })}
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A8479]">Generált / módosított</h3>
                    {generatedLedgerItems.length === 0 ? (
                      <p className="rounded border border-dashed border-[rgba(22,32,26,0.16)] p-3 text-[12px] text-[#7A8479]">Nincs generált vagy módosított dokumentum.</p>
                    ) : generatedLedgerItems.map((contract) => {
                      const isSelected = selectedLedgerItem?.kind === "generated" && selectedLedgerItem.item.id === contract.id;
                      return (
                        <AdminDocumentRow
                          key={contract.id}
                          title={contract.title || contract.fileName || contract.templateName || "Névtelen dokumentum"}
                          meta={`${formatShortDate(contract.generatedAt)}${contract.revisionNumber ? ` · v${contract.revisionNumber}` : ""}`}
                          fileType="DOCX"
                          active={isSelected}
                          variant="generated"
                          onClick={() => { setSelectedLedgerItem({ kind: "generated", item: contract }); setSelectedContract(contract); }}
                          status={<><AdminStatusPill tone={contract.isFinalRevision ? "green" : "neutral"}>{getContractStatusLabel(contract)}</AdminStatusPill>{isSelected ? <AdminBadge tone="green">Aktív</AdminBadge> : null}</>}
                        />
                      );
                    })}
                  </section>

                  {totalLedgerDocuments === 0 ? <p className="rounded bg-[#FBF6E7] p-3 text-[12px] font-medium text-[#3D4842]">Nincs még irat az ügyben.</p> : null}

                  <section className="space-y-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A8479]">Ügyvédi leadási csomagok</h3>
                    <p className="rounded border border-dashed border-[rgba(22,32,26,0.16)] p-3 text-[12px] text-[#7A8479]">A leadási csomagok a jobb oldali panelen kezelhetők.</p>
                  </section>
                </div>
              </AdminPanel>

              <AdminPanel className="min-w-0 overflow-hidden">
                <div className="border-b border-[rgba(22,32,26,0.10)] p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A8479]">Aktív dokumentum</p>
                  <h2 className="mt-1 font-serif text-3xl font-medium text-[#16201A]">{activeTitle || "Nincs még munkadokumentum"}</h2>
                </div>
                <div className="p-5">
                  {!activeDocument ? (
                    <div className="rounded-[10px] border border-dashed border-[rgba(22,32,26,0.18)] bg-[#FBF6E7] p-8 text-center">
                      <h3 className="font-serif text-2xl font-medium text-[#16201A]">Nincs még munkadokumentum</h3>
                      <p className="mx-auto mt-2 max-w-md text-sm text-[#3D4842]">Kezdéshez tölts fel egy dokumentumot, vagy hozz létre szerződést sablonból.</p>
                      <div className="mt-5 flex flex-wrap justify-center gap-2">
                        <AdminButton variant="primary" onClick={() => fileInputRef.current?.click()} disabled={!caseRecord?.id || isUploading}>Dokumentum feltöltése</AdminButton>
                        <AdminButton variant="gold" onClick={handleGenerate}>Szerződés összeállítása klauzulákból</AdminButton>
                        <AdminButton variant="muted" onClick={handleLegacyGenerate}>Régi adásvételi generátor</AdminButton>
                      </div>
                    </div>
                  ) : selectedUploadedDocument ? (
                    <div className="space-y-5">
                      <div className="flex flex-wrap gap-2"><AdminBadge tone="gold">Feltöltött</AdminBadge><AdminStatusPill tone="green">Feltöltve</AdminStatusPill><AdminBadge tone="green">Aktív</AdminBadge></div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded bg-[#FBF6E7] p-3"><p className="text-[10px] uppercase text-[#7A8479]">Típus</p><p className="text-sm font-semibold text-[#16201A]">{getDocumentKindLabel(selectedUploadedDocument.fileName)}</p></div>
                        <div className="rounded bg-[#FBF6E7] p-3"><p className="text-[10px] uppercase text-[#7A8479]">Feltöltve</p><p className="text-sm font-semibold text-[#16201A]">{formatShortDate(selectedUploadedDocument.createdAt)}</p></div>
                        {selectedUploadedDocument.version ? <div className="rounded bg-[#FBF6E7] p-3"><p className="text-[10px] uppercase text-[#7A8479]">Verzió</p><p className="text-sm font-semibold text-[#16201A]">v{selectedUploadedDocument.version}</p></div> : null}
                        {selectedUploadedDocument.folder ? <div className="rounded bg-[#FBF6E7] p-3"><p className="text-[10px] uppercase text-[#7A8479]">Forrás</p><p className="text-sm font-semibold text-[#16201A]">Feltöltött ügyirat</p></div> : null}
                      </div>
                      <div className="rounded-[8px] border border-[rgba(22,32,26,0.10)] bg-[#FBF6E7] p-5"><h3 className="font-serif text-xl font-medium text-[#16201A]">Előkészítő munkanézet</h3><p className="mt-2 text-sm text-[#3D4842]">A feltöltött dokumentum előnézete jelenleg metaadat-alapú. A workspace megnyitható, az AI és jogi elemzés anonimizált szöveggel lesz teljes.</p></div>
                      <div className="flex flex-wrap gap-2 text-[11px]"><AdminStatusPill tone="green">Feltöltve</AdminStatusPill><AdminStatusPill tone="gold">Anonimizálás</AdminStatusPill><AdminStatusPill tone="neutral">AI elemzés</AdminStatusPill><AdminStatusPill tone="neutral">Szerkesztés</AdminStatusPill><AdminStatusPill tone="neutral">Ügyvédi leadás</AdminStatusPill></div>
                      <div className="rounded-[8px] border border-[#B58A2A]/30 bg-[#FAEFCF] p-4"><h3 className="font-serif text-xl font-medium text-[#16201A]">Következő ajánlott lépés</h3><p className="mt-1 text-sm text-[#3D4842]">Az AI promptokhoz és a jogi elemzéshez indíts anonimizálást; a workspace addig is megnyitható előkészítő nézetként.</p><div className="mt-3 flex flex-wrap gap-2"><AdminButton variant="gold" onClick={() => openUploadedAnonymize(selectedUploadedDocument)}>Anonimizálás indítása</AdminButton><AdminButton variant="neutral" onClick={() => openWorkspace(selectedUploadedDocument.id)}>Szerződés-workspace</AdminButton><AdminButton variant="neutral" onClick={() => handleDownloadUploadedDocument(selectedUploadedDocument)} disabled={isDownloading === selectedUploadedDocument.id}>{isDownloading === selectedUploadedDocument.id ? "Letöltés..." : "Letöltés"}</AdminButton><AdminButton variant="neutral" onClick={handleCreateHandoffPackage} disabled={isCreatingHandoffPackage}>{isCreatingHandoffPackage ? "Csomag készül..." : "Csomag készítése"}</AdminButton></div><details className="mt-3"><summary className="cursor-pointer text-[11px] font-semibold text-[#7A8479]">Technikai műveletek</summary><AdminButton className="mt-2" size="sm" variant="muted" onClick={() => router.push(metaCompareUrl)}>Metaadat összevetés</AdminButton></details></div>
                    </div>
                  ) : selectedGeneratedContract ? (
                    <div className="space-y-5">
                      <div className="flex flex-wrap gap-2"><AdminBadge tone="green">Generált</AdminBadge><AdminStatusPill tone={selectedGeneratedContract.isFinalRevision ? "green" : "neutral"}>{getContractStatusLabel(selectedGeneratedContract)}</AdminStatusPill><AdminBadge tone="green">Aktív</AdminBadge></div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded bg-[#FBF6E7] p-3"><p className="text-[10px] uppercase text-[#7A8479]">Verzió</p><p className="text-sm font-semibold text-[#16201A]">{selectedGeneratedContract.revisionNumber ? `v${selectedGeneratedContract.revisionNumber}` : "v1"}</p></div>
                        <div className="rounded bg-[#FBF6E7] p-3"><p className="text-[10px] uppercase text-[#7A8479]">Létrehozva</p><p className="text-sm font-semibold text-[#16201A]">{formatShortDate(selectedGeneratedContract.generatedAt)}</p></div>
                        {selectedGeneratedContract.templateName ? <div className="rounded bg-[#FBF6E7] p-3 sm:col-span-2"><p className="text-[10px] uppercase text-[#7A8479]">Sablon</p><p className="text-sm font-semibold text-[#16201A]">{selectedGeneratedContract.templateName}</p></div> : null}
                      </div>
                      <div className="rounded-[8px] border border-[rgba(22,32,26,0.10)] bg-[#FBF6E7] p-5"><h3 className="font-serif text-xl font-medium text-[#16201A]">Előnézet</h3><p className="mt-2 text-sm text-[#3D4842]">A generált dokumentum tartalma letöltéssel vagy a Szerződés-workspace felületen ellenőrizhető.</p></div>
                      <div className="flex flex-wrap gap-2 text-[11px]"><AdminStatusPill tone="green">Generált</AdminStatusPill><AdminStatusPill tone="gold">Review</AdminStatusPill><AdminStatusPill tone="neutral">Módosítás</AdminStatusPill><AdminStatusPill tone="neutral">Ügyvédi leadás</AdminStatusPill></div>
                      <div className="rounded-[8px] border border-[#B58A2A]/30 bg-[#FAEFCF] p-4"><h3 className="font-serif text-xl font-medium text-[#16201A]">Következő ajánlott lépés</h3><div className="mt-3 flex flex-wrap gap-2"><AdminButton variant="gold" onClick={() => openWorkspace(selectedGeneratedContract.id)}>Szerződés-workspace</AdminButton><AdminButton variant="neutral" onClick={() => handleDownload(selectedGeneratedContract)} disabled={isDownloading === selectedGeneratedContract.id}>{isDownloading === selectedGeneratedContract.id ? "Letöltés..." : "Letöltés"}</AdminButton><AdminButton variant="neutral" onClick={() => handleReview(selectedGeneratedContract.id)}>Review megnyitása</AdminButton><AdminButton variant="neutral" onClick={() => handleSharePointUpload(selectedGeneratedContract)} disabled={isUploadingToSP === selectedGeneratedContract.id || Boolean(selectedGeneratedContract.spItemId)}>{selectedGeneratedContract.spItemId ? "SharePoint szinkronizálva" : isUploadingToSP === selectedGeneratedContract.id ? "Szinkronizálás..." : "SharePoint mentés"}</AdminButton><AdminButton variant="neutral" onClick={handleCreateHandoffPackage} disabled={isCreatingHandoffPackage}>{isCreatingHandoffPackage ? "Csomag készül..." : "Csomag készítése"}</AdminButton></div><details className="mt-3"><summary className="cursor-pointer text-[11px] font-semibold text-[#7A8479]">Technikai műveletek</summary><div className="mt-2 flex flex-wrap gap-2"><AdminButton size="sm" variant="muted" onClick={() => router.push(metaCompareUrl)}>Metaadat összevetés</AdminButton>{previousVersionForSelected ? <AdminButton size="sm" variant="muted" onClick={() => router.push(`/documents/compare?caseId=${encodeURIComponent(canonicalCaseId)}&documentId=${encodeURIComponent(selectedGeneratedContract.id)}&baselineId=${encodeURIComponent(previousVersionForSelected.id)}`)}>Verzió-összevetés</AdminButton> : null}</div></details></div>
                    </div>
) : null}
                </div>
              </AdminPanel>

              <div className="space-y-5">
                <AdminPanel className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7A8479]">Ügyfélprofil / house style</p>
                      <p className="mt-1 text-xs text-[#3D4842]">
                        {isLoadingHouseStyle
                          ? "Profil betöltése..."
                          : clientHouseStyle
                            ? "House style profil elérhető."
                            : "Ehhez az ügyfélhez még nincs house style profil."}
                      </p>
                    </div>
                    <AdminStatusPill tone={clientHouseStyle ? "green" : "neutral"}>{clientHouseStyle ? "Van" : "Nincs"}</AdminStatusPill>
                  </div>
                  {clientHouseStyle ? (
                    <p className="mt-3 rounded bg-[#FBF6E7] p-2 text-[11px] text-[#3D4842]">
                      {[clientHouseStyle.preferredLanguage, clientHouseStyle.documentLanguageMode, clientHouseStyle.fontFamily].filter(Boolean).join(" · ") || "A profil elérhető, de még kevés formázási adatot tartalmaz."}
                    </p>
                  ) : null}
                  <AdminButton className="mt-3" size="sm" variant="muted" onClick={() => setShowHouseStylePanel((value) => !value)} disabled={!caseRecord?.clientId}>
                    {showHouseStylePanel ? "Ügyfélprofil bezárása" : clientHouseStyle ? "Ügyfélprofil szerkesztése" : "Profil létrehozása"}
                  </AdminButton>
                  {!caseRecord?.clientId ? <p className="mt-2 text-[10px] text-[#8B2A2A]">Az ügyfél azonosítója nem érhető el.</p> : null}
                </AdminPanel>
                {showHouseStylePanel && caseRecord?.clientId ? (
                  <ClientHouseStylePanel
                    compact
                    clientId={caseRecord.clientId}
                    clientName={caseRecord.clientName}
                    onSaved={() => getCaseClientHouseStyle(caseRecord.id).then(setClientHouseStyle).catch(() => setClientHouseStyle(null))}
                  />
                ) : null}
                {caseRecord && <HandoffPackagePanel caseId={caseRecord.id} refreshKey={handoffPanelRefreshKey} />}
                {handoffPackageMessage && <p className="rounded bg-[#EEF5E7] p-2 text-[12px] font-semibold text-[#23472F]">{handoffPackageMessage}</p>}
                {handoffPackageError && <p className="rounded bg-[#FFF5F3] p-2 text-[12px] font-semibold text-[#8B2A2A]">{handoffPackageError}</p>}
              </div>
            </div>
          )}

          <AdminPanel className="p-5">
            <h2 className="font-serif text-2xl font-medium text-[#16201A]">Ügy története</h2>
            <div className="mt-4 space-y-3">
              {timeline.length > 0 ? timeline.slice(0, 8).map((event) => (
                <div key={event.id} className="border-l-2 border-[#1F4A33] pl-3">
                  <p className="text-sm font-semibold text-[#16201A]">{humanizeTimelineType(event)}</p>
                  <p className="text-[12px] text-[#7A8479]">{formatShortDate(event.createdAt)}</p>
                </div>
              )) : <p className="text-sm text-[#7A8479]">Még nincs rögzített ügyesemény.</p>}
            </div>
          </AdminPanel>        </main>

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
