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
  getCommunications,
  createCommunication,
  createCaseHandoffPackage,
  ApiError,
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
import { CaseWorkspaceNav } from "@/components/cases/CaseWorkspaceNav";
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
    bg: isSignalTiles ? "bg-slate-900" : "bg-[var(--adm-surface)]",
    bgAlt: isSignalTiles ? "bg-slate-800" : "bg-[var(--adm-ivory-100)]",
    bgHover: isSignalTiles ? "hover:bg-slate-700" : "hover:bg-[var(--adm-ivory-200)]",
    bgCard: isSignalTiles ? "bg-slate-800" : "bg-white",
    bgSection: isSignalTiles ? "bg-slate-800" : "bg-[#f5f3ee]",
    text: isSignalTiles ? "text-slate-100" : "text-[var(--adm-text)]",
    textMuted: isSignalTiles ? "text-slate-400" : "text-[var(--adm-text-muted)]",
    textDark: isSignalTiles ? "text-slate-200" : "text-[var(--adm-text-muted)]",
    border: isSignalTiles ? "border-slate-600" : "border-[var(--adm-border)]",
    borderLight: isSignalTiles ? "border-slate-700" : "border-[var(--adm-border)]",
    badge: isSignalTiles ? "bg-slate-700 text-slate-200" : "bg-[#f5f3ee] text-[#434843]",
    accent: isSignalTiles ? "text-cyan-400" : "text-[var(--adm-ochre-500)]",
    accentBg: isSignalTiles ? "bg-cyan-900 text-cyan-200" : "bg-[var(--adm-ochre-500)] text-white",
    success: isSignalTiles ? "bg-emerald-900 text-emerald-200" : "bg-[var(--adm-sage-100)] text-[var(--adm-green-800)]",
    warning: isSignalTiles ? "bg-amber-900 text-amber-200" : "bg-[var(--adm-ivory-200)] text-[var(--adm-text-muted)]",
    danger: isSignalTiles ? "bg-red-900 text-red-200" : "bg-[var(--adm-terracotta-100)] text-[var(--adm-terracotta-700)]",
  };

  const [contracts, setContracts] = useState<CaseContractListItem[]>([]);
  const [uploadedDocuments, setUploadedDocuments] = useState<DocumentItem[]>([]);
  const [modifiedWorkingCopies, setModifiedWorkingCopies] = useState<DocumentItem[]>([]);
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
  const [uploadPhase, setUploadPhase] = useState<string | null>(null);
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

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasLoadedOnceRef = useRef(false);

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

  const loadData = useCallback(async (isFirstLoad: boolean) => {
    // Guard: never call API with unresolved caseId (caseNumber string instead of CUID)
    if (!caseRecord?.id) return;
    try {
      if (isFirstLoad) {
        setIsInitialLoading(true);
      } else {
        setIsRefreshing(true);
      }
      // Use caseRecord.id (CUID) — NOT resolvedParams.caseId which may be a caseNumber string
      const [contractsData, uploadedDocsData, timelineData] = await Promise.all([
        getCaseContracts(caseRecord.id).catch(() => []),
        getCaseDocuments(caseRecord.id).catch(() => []),
        getCaseTimeline(caseRecord.id).catch(() => []),
      ]);
      setContracts(contractsData);
      const modified = uploadedDocsData.filter(doc => doc.documentType === 'MODIFIED_WORKING_COPY');
      const uploaded = uploadedDocsData.filter(doc => doc.documentType !== 'MODIFIED_WORKING_COPY');
      setUploadedDocuments(uploaded);
      setModifiedWorkingCopies(modified);
      setTimeline(timelineData);
      // Auto-select deep-linked document if requested, otherwise default first-available.
      // Only run selection logic on first load to avoid flicker from re-selection on refresh
      if (!hasLoadedOnceRef.current) {
        hasLoadedOnceRef.current = true;
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
        }
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [caseRecord?.id]);

  // Re-trigger loadData once caseRecord is resolved to CUID — only on mount
  useEffect(() => {
    if (caseRecord?.id && !hasLoadedOnceRef.current) {
      loadData(true);
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
    setUploadPhase('Fájl előkészítése...');
    setActionResult(null);
    try {
      const base64 = await fileToBase64(file);
      setUploadPhase('Feltöltés SharePointba és ügyirathoz kapcsolás...');
      const uploaded = await uploadCaseDocument({
        caseId: caseRecord.id,
        fileName: file.name,
        fileContentBase64: base64,
        mimeType: file.type || 'application/octet-stream',
        documentType: 'CLIENT_INPUT',
        folder: 'CLIENT_INPUT',
      });
      const docs = await getCaseDocuments(caseRecord.id).catch(() => [uploaded]);
      const modified = docs.filter(doc => doc.documentType === 'MODIFIED_WORKING_COPY');
      const uploadedOnly = docs.filter(doc => doc.documentType !== 'MODIFIED_WORKING_COPY');
      const selectedUploaded = docs.find((doc) => doc.id === uploaded.id) || uploaded;
      setUploadedDocuments(uploadedOnly);
      setModifiedWorkingCopies(modified);
      setSelectedLedgerItem({ kind: 'uploaded', item: selectedUploaded });
      setSelectedContract(null);
      setActionResult({ type: 'success', message: 'Dokumentum feltöltve. Szöveg kinyerése a szerkesztő megnyitásakor történik, ha a fájlformátum támogatott.' });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Upload failed:', err);
      const fallback = 'Dokumentum feltöltése sikertelen. Kérjük, próbáld újra később.';
      if (err instanceof ApiError) {
        if (err.status === 502) {
          setActionResult({
            type: 'error',
            message:
              'Dokumentum feltöltése sikertelen: SharePoint kapcsolat/jogosultság hiba. Ellenőrizd a staging /api/v1/sharepoint/diagnostics végpontot és a site/drive beállításokat.',
          });
        } else if (err.status === 400 || err.status === 404 || err.status === 409) {
          setActionResult({ type: 'error', message: `Dokumentum feltöltése sikertelen: ${err.message}` });
        } else {
          setActionResult({ type: 'error', message: fallback });
        }
      } else {
        setActionResult({ type: 'error', message: fallback });
      }
    } finally {
      setIsUploading(false);
      setUploadPhase(null);
    }
  };

  const handleSharePointUpload = async (contract: CaseContractListItem) => {
    setIsUploadingToSP(contract.id);
    try {
      const result = await uploadGeneratedContractToSharePoint(contract.id);
      if (result.success) {
        setActionResult({ type: 'success', message: 'SharePoint szinkronizálás elindult' });
        loadData(false); // Refresh data
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
        loadData(false); // Refresh data
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
        loadData(false); // Refresh data
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

  const handleReview = (contractId: string) => {
    router.push(`/cases/${canonicalCaseId}/review/${contractId}`);
  };

  const handleGenerate = () => {
    router.push(`/documents/compare?caseId=${encodeURIComponent(canonicalCaseId)}`);
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
      setNoteError('A jegyzetek betöltése sikertelen.');
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
        subject: newNoteSubject.trim() || '(nincs tárgy)',
        content: newNoteContent.trim(),
        documentId: selectedGeneratedContract.id,
        caseId: canonicalCaseId,
      });
      setDocumentNotes((prev) => [newNote, ...prev]);
      setNewNoteSubject('');
      setNewNoteContent('');
      setIsAddingNote(false);
    } catch {
      setNoteError('A jegyzet mentése sikertelen.');
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
        return { label: 'Jóváhagyott', class: 'bg-[var(--adm-sage-100)] text-[var(--adm-green-800)]' };
      case 'IN_REVIEW':
      case 'SUBMITTED':
        return { label: 'Review alatt', class: 'bg-[#e4e2e1] text-[#656464]' };
      case 'REJECTED':
        return { label: 'Módosítás szükséges', class: 'bg-[var(--adm-terracotta-100)] text-[var(--adm-terracotta-700)]' };
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
        return 'Review alatt';
      case 'REJECTED':
        return 'Visszaküldve';
      case 'GENERATED':
        return 'Piszkozat';
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

  const openUploadedAnonymize = (document: DocumentItem) => {
    const uploadedDocumentAsContract: CaseContractListItem = {
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
    setAnonymizeModalContract(uploadedDocumentAsContract);
  };

  const activeDocument = selectedUploadedDocument || selectedGeneratedContract;
  const houseStyleHasContent = Boolean(clientHouseStyle && [
    clientHouseStyle.officialName,
    clientHouseStyle.shortName,
    clientHouseStyle.registeredSeat,
    clientHouseStyle.preferredLanguage,
    clientHouseStyle.documentLanguageMode,
    clientHouseStyle.fontFamily,
    clientHouseStyle.headingStyle,
    clientHouseStyle.headerAssetPath,
  ].some((value) => String(value || '').trim()));

  const generatedLedgerItems = [...families.flatMap((family) => family.items), ...standalone];
  const activeTitle = selectedUploadedDocument?.fileName || selectedGeneratedContract?.title || selectedGeneratedContract?.fileName || selectedGeneratedContract?.templateName || null;
  const metaCompareUrl = activeDocument ? `/documents/compare?caseId=${encodeURIComponent(canonicalCaseId)}&documentId=${encodeURIComponent(activeDocument.id)}` : `/documents/compare?caseId=${encodeURIComponent(canonicalCaseId)}`;
  const litigationWorkspaceUrl = activeDocument
    ? `/litigation-workspace?caseId=${encodeURIComponent(canonicalCaseId)}&documentId=${encodeURIComponent(activeDocument.id)}&step=intake`
    : null;
  const modifiedWorkingCopyCount = modifiedWorkingCopies.length;
  const generatedDocumentCount = generatedLedgerItems.length;
  const handoffPackageCountLabel = caseRecord ? 'panel' : '0';
  const selectedDocumentTypeLabel = selectedUploadedDocument
    ? selectedUploadedDocument.documentType === 'MODIFIED_WORKING_COPY'
      ? 'Módosított munkapéldány'
      : 'Feltöltött dokumentum'
    : selectedGeneratedContract
      ? selectedGeneratedContract.isFinalRevision
        ? 'Végleges dokumentum'
        : 'Generált / módosított'
      : 'Nincs kiválasztott dokumentum';
  const selectedStatusLabel = selectedUploadedDocument
    ? selectedUploadedDocument.documentType === 'MODIFIED_WORKING_COPY'
      ? 'Szöveges munkapéldány'
      : 'Eredeti feltöltött dokumentum'
    : selectedGeneratedContract
      ? getContractStatusLabel(selectedGeneratedContract)
      : 'Válassz dokumentumot';
  const selectedDocumentActionLabel = activeTitle || "nincs kiválasztva";
  const selectedMetaItems = [
    selectedUploadedDocument?.version ? `Verzió: ${selectedUploadedDocument.version}` : selectedGeneratedContract?.revisionNumber ? `Verzió: v${selectedGeneratedContract.revisionNumber}` : null,
    selectedUploadedDocument?.createdAt ? `Dátum: ${formatShortDate(selectedUploadedDocument.createdAt)}` : selectedGeneratedContract?.generatedAt ? `Dátum: ${formatShortDate(selectedGeneratedContract.generatedAt)}` : null,
    selectedUploadedDocument?.folder ? `Mappa: ${selectedUploadedDocument.folder}` : selectedGeneratedContract?.templateName ? `Sablon: ${selectedGeneratedContract.templateName}` : null,
    selectedUploadedDocument?.fileName ? `Típus: ${getDocumentKindLabel(selectedUploadedDocument.fileName)}` : selectedGeneratedContract?.fileName ? `Típus: ${getDocumentKindLabel(selectedGeneratedContract.fileName)}` : null,
  ].filter(Boolean);
  const canAnonymizeActiveDocument = Boolean(selectedUploadedDocument && selectedUploadedDocument.documentType !== 'MODIFIED_WORKING_COPY');

  return (
    <div className="flex min-h-0 flex-1 flex-col adm-shell-bg text-[var(--adm-text)] documents-surface">
      <CaseWorkspaceNav caseId={canonicalCaseId} caseNumber={displayCaseId} title={displayMatterName} clientName={displayClient} activeTab="documents" activeDocumentId={activeDocument?.id} helperText="Dokumentumtár, szerkesztő és leadási csomag egy ügy-munkaterületen." />

      <div className="flex min-h-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto adm-shell-bg p-4 lg:p-5">
          <section className="mx-auto flex max-w-[1500px] flex-col gap-4">
            {actionResult && (
              <div className={`rounded-[10px] border p-3 text-sm font-medium ${actionResult.type === "success" ? "border-[#D9E3CC] bg-[var(--adm-sage-100)] text-[var(--adm-green-800)]" : "border-[#F2DAD6] bg-[var(--adm-terracotta-100)] text-[var(--adm-terracotta-700)]"}`}>
                {actionResult.message}
              </div>
            )}

            <header className="overflow-hidden rounded-[18px] border border-[rgba(22,32,26,0.14)] bg-[var(--adm-surface)] shadow-[0_18px_45px_rgba(31,74,51,0.10)]">
              <div className="flex flex-col gap-5 border-b border-[rgba(22,32,26,0.12)] bg-white px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--adm-green-800)]">
                    Ügy munkaterület <span className="mx-2 text-[var(--adm-ochre-500)]">/</span> Dokumentumtár
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <h1 className="font-serif text-4xl font-semibold leading-tight text-[var(--adm-text)]">Dokumentumtár</h1>
                    <span className="rounded-full border border-[#D8C58E] bg-[var(--adm-sand-100)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#6D5418]">
                      {totalLedgerDocuments} irat · {activeDocument ? "kiválasztott munkadokumentum" : "nincs kiválasztva"}
                    </span>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm text-[#3D4842]">
                    {displayMatterName} {displayClient ? `· ${displayClient}` : ""} {displayCaseId ? `· ${displayCaseId}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <AdminButton variant="primary" onClick={() => fileInputRef.current?.click()} disabled={!caseRecord?.id || isUploading}>
                    {isUploading ? "Feltöltés..." : "Dokumentum feltöltése"}
                  </AdminButton>
                </div>
              </div>
              <div className="grid gap-3 bg-[var(--adm-sand-100)] px-5 py-3 text-[12px] text-[#3D4842] md:grid-cols-3">
                <p><span className="font-bold text-[var(--adm-green-800)]">Kiválasztott dokumentum:</span> {selectedDocumentActionLabel}</p>
                <p><span className="font-bold text-[var(--adm-green-800)]">Ügyfélprofil:</span> {clientHouseStyle ? (houseStyleHasContent ? "house style elérhető" : "profil részleges") : "nincs profil"}</p>
                <p><span className="font-bold text-[var(--adm-green-800)]">Leadási csomag:</span> jobb oldali panelen kezelhető</p>
              </div>
            </header>

            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleFileUpload} className="hidden" />
            {isUploading && uploadPhase ? <div className="rounded-[10px] border border-[#D8C58E] bg-[var(--adm-surface)] p-3 text-sm font-semibold text-[#6D5418]">{uploadPhase}</div> : null}
            {isRefreshing ? <div className="rounded-[10px] border border-[var(--adm-border)] bg-[var(--adm-surface)] px-4 py-2 text-xs text-[var(--adm-text-muted)]">Frissítés...</div> : null}

            {isInitialLoading ? (
              <AdminPanel className="p-10 text-center text-sm text-[var(--adm-text-muted)]">Dokumentumok betöltése...</AdminPanel>
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
                <aside className="overflow-hidden rounded-[18px] border border-[rgba(22,32,26,0.16)] bg-[var(--adm-sand-100)] shadow-[0_16px_38px_rgba(31,74,51,0.08)]">
                  <div className="border-b border-[rgba(22,32,26,0.14)] bg-[var(--adm-green-800)] p-5 text-white">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#D8C58E]">Dokumentum ledger</p>
                    <h2 className="mt-1 font-serif text-3xl font-semibold">Iratok</h2>
                    <p className="mt-2 text-[12px] leading-relaxed text-[#E9E2C7]">
                      Több dokumentum is tárolható, de egyszerre mindig egy kiválasztott munkadokumentumon dolgozol.
                    </p>
                  </div>
                  <div className="space-y-4 p-4">
                    <section className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--adm-green-800)]">Feltöltött dokumentumok</h3>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[var(--adm-green-800)]">{uploadedDocuments.length}</span>
                      </div>
                      {uploadedDocuments.length === 0 ? (
                        <p className="rounded-[10px] border border-dashed border-[rgba(22,32,26,0.18)] bg-[var(--adm-surface)] p-3 text-[12px] text-[var(--adm-text-muted)]">Nincs feltöltött dokumentum.</p>
                      ) : uploadedDocuments.map((doc) => {
                        const isSelected = selectedLedgerItem?.kind === "uploaded" && selectedLedgerItem.item.id === doc.id;
                        return (
                          <AdminDocumentRow
                            key={doc.id}
                            title={doc.fileName || "Névtelen dokumentum"}
                            meta={`${getDocumentKindLabel(doc.fileName)} · ${formatShortDate(doc.createdAt)}`}
                            fileType={getFileType(doc.fileName)}
                            active={isSelected}
                            variant="upload"
                            onClick={() => { setSelectedLedgerItem({ kind: "uploaded", item: doc }); setSelectedContract(null); }}
                            status={<AdminBadge tone={isSelected ? "gold" : "neutral"}>{isSelected ? "Aktív" : "Feltöltve"}</AdminBadge>}
                          />
                        );
                      })}
                    </section>

                    <section className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--adm-green-800)]">Módosított munkapéldányok</h3>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[var(--adm-green-800)]">{modifiedWorkingCopyCount}</span>
                      </div>
                      {modifiedWorkingCopies.length === 0 ? (
                        <p className="rounded-[10px] border border-dashed border-[rgba(22,32,26,0.18)] bg-[var(--adm-surface)] p-3 text-[12px] text-[var(--adm-text-muted)]">Nincs módosított munkapéldány.</p>
                      ) : modifiedWorkingCopies.map((doc) => {
                        const isSelected = selectedLedgerItem?.kind === "uploaded" && selectedLedgerItem.item.id === doc.id;
                        return (
                          <AdminDocumentRow
                            key={doc.id}
                            title={doc.fileName || "Névtelen dokumentum"}
                            meta="Szöveges munkapéldány, nem Word változáskövetés"
                            active={isSelected}
                            variant="generated"
                            onClick={() => { setSelectedLedgerItem({ kind: "uploaded", item: doc }); setSelectedContract(null); }}
                            status={<AdminBadge tone={isSelected ? "gold" : "green"}>{isSelected ? "Aktív" : "Munkapéldány"}</AdminBadge>}
                          />
                        );
                      })}
                    </section>

                    <section className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--adm-green-800)]">Generált / módosított</h3>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[var(--adm-green-800)]">{generatedDocumentCount}</span>
                      </div>
                      {generatedLedgerItems.length === 0 ? (
                        <p className="rounded-[10px] border border-dashed border-[rgba(22,32,26,0.18)] bg-[var(--adm-surface)] p-3 text-[12px] text-[var(--adm-text-muted)]">Nincs generált dokumentum.</p>
                      ) : generatedLedgerItems.map((contract) => {
                        const isSelected = selectedLedgerItem?.kind === "generated" && selectedLedgerItem.item.id === contract.id;
                        return (
                          <AdminDocumentRow
                            key={contract.id}
                            title={contract.title || contract.fileName || contract.templateName || "Névtelen dokumentum"}
                            meta={contract.revisionNumber ? `v${contract.revisionNumber}` : "v1"}
                            fileType="DOCX"
                            active={isSelected}
                            variant="generated"
                            onClick={() => { setSelectedLedgerItem({ kind: "generated", item: contract }); setSelectedContract(contract); }}
                            status={<AdminBadge tone={isSelected ? "gold" : "neutral"}>{isSelected ? "Aktív" : getContractStatusLabel(contract)}</AdminBadge>}
                          />
                        );
                      })}
                    </section>

                    <section className="space-y-2 border-t border-[rgba(22,32,26,0.12)] pt-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--adm-green-800)]">Ügyvédi leadási csomagok</h3>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[var(--adm-green-800)]">{handoffPackageCountLabel}</span>
                      </div>
                      <p className="rounded-[10px] border border-dashed border-[rgba(22,32,26,0.18)] bg-[var(--adm-surface)] p-3 text-[12px] text-[var(--adm-text-muted)]">
                        A leadási csomagok a jobb oldali ügyvédi csomag panelen kezelhetők.
                      </p>
                    </section>
                  </div>
                </aside>

                <section className="min-w-0 overflow-hidden rounded-[22px] border border-[rgba(22,32,26,0.16)] bg-white shadow-[0_20px_55px_rgba(31,74,51,0.10)]">
                  <div className="flex gap-4 border-b border-[rgba(22,32,26,0.12)] bg-[var(--adm-surface)] p-5">
                    <div className="mt-1 h-16 w-1.5 rounded-full bg-[var(--adm-ochre-500)]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--adm-green-800)]">Munkadokumentum</p>
                      <h2 className="mt-2 truncate font-serif text-4xl font-semibold leading-tight text-[var(--adm-text)]">{activeTitle || "Nincs még munkadokumentum"}</h2>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <AdminBadge tone={activeDocument ? "gold" : "neutral"}>{selectedDocumentTypeLabel}</AdminBadge>
                        <AdminBadge tone={activeDocument ? "green" : "neutral"}>{selectedStatusLabel}</AdminBadge>
                      </div>
                      {selectedMetaItems.length > 0 ? (
                        <div className="mt-4 grid gap-2 text-[12px] text-[#3D4842] sm:grid-cols-2">
                          {selectedMetaItems.map((item) => <span key={String(item)} className="rounded-full border border-[rgba(22,32,26,0.10)] bg-white px-3 py-1">{item}</span>)}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-5 p-5">
                    {!activeDocument ? (
                      <div className="rounded-[18px] border border-dashed border-[rgba(31,74,51,0.24)] bg-[var(--adm-surface)] p-8 text-center">
                        <h3 className="font-serif text-3xl font-semibold text-[var(--adm-text)]">Nincs még kiválasztott dokumentum</h3>
                        <p className="mx-auto mt-2 max-w-md text-sm text-[#3D4842]">Kezdéshez tölts fel egy dokumentumot, vagy válassz egy iratot a bal oldali listából.</p>
                        <div className="mt-5 flex flex-wrap justify-center gap-2">
                          <AdminButton variant="primary" onClick={() => fileInputRef.current?.click()} disabled={!caseRecord?.id || isUploading}>Dokumentum feltöltése</AdminButton>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="rounded-[16px] border border-[rgba(22,32,26,0.12)] bg-[var(--adm-surface)] p-4">
                          <h3 className="font-serif text-xl font-semibold text-[var(--adm-text)]">
                            {selectedUploadedDocument?.documentType === 'MODIFIED_WORKING_COPY' ? 'Munkapéldány' : selectedGeneratedContract ? 'Generált dokumentum' : 'Kiválasztott dokumentum'}
                          </h3>
                          <p className="mt-1 text-sm text-[#3D4842]">
                            {selectedUploadedDocument?.documentType === 'MODIFIED_WORKING_COPY'
                              ? 'Szöveges munkapéldány, nem Word változáskövetés. Az eredeti dokumentum változatlan.'
                              : selectedUploadedDocument
                                ? 'Eredeti feltöltött dokumentum.'
                                : 'Generált vagy módosított dokumentum.'}
                          </p>
                        </div>

                        <div className="rounded-[16px] border border-[rgba(22,32,26,0.12)] bg-white p-4">
                          <div className="flex flex-col gap-3">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Dokumentum összefoglaló</p>
                              <h3 className="font-serif text-2xl font-semibold text-[var(--adm-text)]">{activeTitle}</h3>
                              <p className="mt-2 text-sm text-[#3D4842]">
                                A kiválasztott irathoz tartozó műveletek a jobb oldali Dokumentum műveletek panelen érhetők el.
                              </p>
                            </div>
                          </div>

                        </div>
                      </>
                    )}
                  </div>
                </section>

                <aside className="space-y-4">
                  <AdminPanel className="overflow-hidden border-[rgba(22,32,26,0.14)] bg-[var(--adm-surface)]">
                    <div className="bg-[var(--adm-green-800)] p-4 text-white">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#D8C58E]">Akciók</p>
                      <h2 className="mt-1 font-serif text-2xl font-semibold">Dokumentum műveletek</h2>
                    </div>
                    <div className="space-y-2 p-4">
                      {!activeDocument ? (
                        <p className="rounded-[10px] border border-dashed border-[rgba(22,32,26,0.18)] bg-white p-3 text-[12px] text-[var(--adm-text-muted)]">
                          Válassz dokumentumot a műveletekhez.
                        </p>
                      ) : (
                        <>
                          <p className="rounded-[10px] border border-[#E7DECB] bg-white p-3 text-[12px] text-[#3D4842]">
                            Kiválasztott dokumentum: <span className="font-semibold text-[var(--adm-text)]">{activeTitle}</span>
                          </p>
                          <AdminButton className="w-full justify-start" variant="primary" onClick={() => openWorkspace(activeDocument.id)}>
                            Szerződés-workspace
                          </AdminButton>
                          <AdminButton className="w-full justify-start" variant="gold" onClick={() => litigationWorkspaceUrl && router.push(litigationWorkspaceUrl)} disabled={!litigationWorkspaceUrl}>
                            Peres stratégiai térkép indítása
                          </AdminButton>
                          {!litigationWorkspaceUrl ? (
                            <p className="rounded-[10px] border border-dashed border-[rgba(22,32,26,0.18)] bg-white p-3 text-[12px] text-[var(--adm-text-muted)]">
                              Válassz feltöltött dokumentumot a peres stratégiai térkép indításához.
                            </p>
                          ) : null}
                          <AdminButton className="w-full justify-start" variant="gold" onClick={() => router.push(`/cases/${encodeURIComponent(canonicalCaseId)}/handoff`)}>
                            Leadási csomag
                          </AdminButton>
                          <div className="grid gap-2 border-t border-[#E7DECB] pt-2">
                            {selectedUploadedDocument ? (
                              <AdminButton className="w-full justify-start" variant="neutral" onClick={() => handleDownloadUploadedDocument(selectedUploadedDocument)} disabled={isDownloading === selectedUploadedDocument.id}>
                                {isDownloading === selectedUploadedDocument.id ? "Letöltés..." : "Letöltés"}
                              </AdminButton>
                            ) : selectedGeneratedContract ? (
                              <AdminButton className="w-full justify-start" variant="neutral" onClick={() => handleDownload(selectedGeneratedContract)} disabled={isDownloading === selectedGeneratedContract.id}>
                                {isDownloading === selectedGeneratedContract.id ? "Letöltés..." : "Letöltés"}
                              </AdminButton>
                            ) : null}
                            {canAnonymizeActiveDocument && selectedUploadedDocument ? (
                              <AdminButton className="w-full justify-start" variant="neutral" onClick={() => openUploadedAnonymize(selectedUploadedDocument)}>
                                Anonimizálás
                              </AdminButton>
                            ) : null}
                            <AdminButton className="w-full justify-start" variant="neutral" onClick={() => router.push(`/cases/${encodeURIComponent(canonicalCaseId)}/communications`)}>
                              Kommunikáció
                            </AdminButton>
                          </div>
                        </>
                      )}
                      {activeDocument ? (
                      <details className="rounded-[12px] border border-[rgba(22,32,26,0.10)] bg-white p-3">
                        <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--adm-green-800)]">Haladó / technikai</summary>
                        <div className="mt-3 space-y-2">
                          <AdminButton className="w-full justify-start" size="sm" variant="muted" onClick={() => router.push(metaCompareUrl)}>Metaadat összevetés</AdminButton>
                          <AdminButton className="w-full justify-start" size="sm" variant="muted" onClick={() => router.push(`/reviews`)}>Review sor</AdminButton>
                        </div>
                      </details>
                      ) : null}
                    </div>
                  </AdminPanel>

                  <AdminPanel className="border-[rgba(22,32,26,0.14)] bg-[var(--adm-surface)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-green-800)]">Ügyfélprofil / house style</p>
                        <p className="mt-1 text-xs text-[#3D4842]">
                          {isLoadingHouseStyle
                            ? "Profil betöltése..."
                            : clientHouseStyle
                              ? houseStyleHasContent ? "House style profil elérhető." : "Profil létrehozva, de nincs kitöltve."
                              : "Ehhez az ügyfélhez még nincs house style profil."}
                        </p>
                        <p className="mt-1 text-xs text-[#3D4842]">{caseRecord?.clientName || "Ügyfél"}</p>
                      </div>
                      <AdminStatusPill tone={clientHouseStyle ? "green" : "neutral"}>Profil: {clientHouseStyle ? "Van" : "Nincs"}</AdminStatusPill>
                    </div>
                    {clientHouseStyle ? (
                      <div className="mt-3 space-y-2 rounded bg-white p-2 text-[11px] text-[#3D4842]">
                        <p>{[clientHouseStyle.preferredLanguage, clientHouseStyle.documentLanguageMode, clientHouseStyle.fontFamily].filter(Boolean).join(" · ") || "Profil létrehozva, de nincs kitöltve."}</p>
                        <p>Fejlécminta: <b>{clientHouseStyle.headerAssetPath ? "Van" : "Nincs"}</b></p>
                      </div>
                    ) : null}
                    <AdminButton className="mt-3" size="sm" variant="muted" onClick={() => setShowHouseStylePanel((value) => !value)} disabled={!caseRecord?.clientId}>
                      {showHouseStylePanel ? "Profil bezárása" : clientHouseStyle ? "Profil megnyitása" : "Profil létrehozása"}
                    </AdminButton>
                    {!caseRecord?.clientId ? <p className="mt-2 text-[10px] text-[var(--adm-terracotta-700)]">Az ügyfél azonosítója nem érhető el.</p> : null}
                  </AdminPanel>

                  {showHouseStylePanel && caseRecord?.clientId ? (
                    <div className="max-h-[520px] overflow-y-auto rounded-[12px] border border-[rgba(22,32,26,0.14)] bg-[var(--adm-surface)]">
                      <ClientHouseStylePanel
                        compact
                        clientId={caseRecord.clientId}
                        clientName={caseRecord.clientName}
                        onSaved={() => getCaseClientHouseStyle(caseRecord.id).then(setClientHouseStyle).catch(() => setClientHouseStyle(null))}
                      />
                    </div>
                  ) : null}
                  {caseRecord && (
                    <HandoffPackagePanel
                      caseId={caseRecord.id}
                      refreshKey={handoffPanelRefreshKey}
                      sourceDocumentId={selectedUploadedDocument?.id || null}
                      generatedContractId={!selectedUploadedDocument ? selectedGeneratedContract?.id || null : null}
                      contextLabel={activeTitle || undefined}
                    />
                  )}
                  {handoffPackageMessage && <p className="rounded bg-[var(--adm-sage-100)] p-2 text-[12px] font-semibold text-[var(--adm-green-800)]">{handoffPackageMessage}</p>}
                  {handoffPackageError && <p className="rounded bg-[var(--adm-terracotta-100)] p-2 text-[12px] font-semibold text-[var(--adm-terracotta-700)]">{handoffPackageError}</p>}
                </aside>
              </div>
            )}

            <AdminPanel className="border-[rgba(22,32,26,0.14)] bg-[var(--adm-surface)] p-5">
              <h2 className="font-serif text-2xl font-medium text-[var(--adm-text)]">Ügy története</h2>
              <div className="mt-4 space-y-3">
                {timeline.length > 0 ? timeline.slice(0, 8).map((event) => (
                  <div key={event.id} className="border-l-2 border-[var(--adm-ochre-500)] pl-3">
                    <p className="text-sm font-semibold text-[var(--adm-text)]">{humanizeTimelineType(event)}</p>
                    <p className="text-[12px] text-[var(--adm-text-muted)]">{formatShortDate(event.createdAt)}</p>
                  </div>
                )) : <p className="text-sm text-[var(--adm-text-muted)]">Még nincs rögzített ügyesemény.</p>}
              </div>
            </AdminPanel>
          </section>
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
