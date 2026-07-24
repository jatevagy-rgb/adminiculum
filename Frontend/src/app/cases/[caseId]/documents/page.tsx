"use client";

import { useState, use, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { resolveAnnotationCapabilities } from "@/lib/annotations/annotationCapabilities";
import { AnnotationCapabilityToolbar } from "@/components/documents/annotations/AnnotationCapabilityToolbar";
import { NotPublishedBadge, isClientExplanationDraft } from "@/components/documents/annotations/NotPublishedBadge";
import {
  getCaseContracts,
  getCases,
  getCaseTimeline,
  getCaseDocuments,
  downloadContract,
  downloadDocument,
  downloadDocumentVersion,
  createDocumentAnnotation,
  createDocumentAnnotationComment,
  deleteDocumentAnnotation,
  deleteDocument,
  getDocumentAnnotationComments,
  getDocumentAnnotations,
  getDocumentVersions,
  reopenDocumentAnnotation,
  resolveDocumentAnnotation,
  uploadCaseDocument,
  uploadImmutableDocumentVersion,
  uploadGeneratedContractToSharePoint,
  promoteDocumentVersion,
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
  type DocumentVersionItem,
  type TimelineEventItem,
  type CommunicationItem,
  type ClientHouseStyleProfile,
  type CreateDocumentAnnotationPayload,
  type DocumentAnnotationAnchorType,
  type DocumentAnnotationComment,
  type DocumentAnnotationItem,
  type DocumentAnnotationType,
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

const ANNOTATION_TYPE_LABELS: Record<DocumentAnnotationType, string> = {
  INTERNAL_NOTE: 'Belső megjegyzés',
  REVIEW_COMMENT: 'Review komment',
  MODIFICATION_REASON: 'Módosítás oka',
  CLIENT_EXPLANATION_DRAFT: 'Ügyfélmagyarázat-tervezet',
  QUESTION: 'Kérdés',
  DECISION: 'Döntés',
  TASK_NOTE: 'Feladat',
};

const TEXT_ANNOTATION_TYPES: DocumentAnnotationType[] = [
  'INTERNAL_NOTE',
  'REVIEW_COMMENT',
  'MODIFICATION_REASON',
  'CLIENT_EXPLANATION_DRAFT',
  'QUESTION',
  'DECISION',
  'TASK_NOTE',
];

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
  const [isUploadingVersion, setIsUploadingVersion] = useState(false);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [versions, setVersions] = useState<DocumentVersionItem[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [isPromotingVersion, setIsPromotingVersion] = useState<string | null>(null);
  const [uploadPhase, setUploadPhase] = useState<string | null>(null);
  const [isUploadingToSP, setIsUploadingToSP] = useState<string | null>(null);
  const [isCreatingRevision, setIsCreatingRevision] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<DocumentItem | null>(null);
  const [isDeletingDocument, setIsDeletingDocument] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
  const versionFileInputRef = useRef<HTMLInputElement | null>(null);
  const annotationSurfaceRef = useRef<HTMLDivElement | null>(null);
  const visualAnchorStartRef = useRef<{ x: number; y: number } | null>(null);
  const [annotations, setAnnotations] = useState<DocumentAnnotationItem[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [annotationComments, setAnnotationComments] = useState<DocumentAnnotationComment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [isLoadingAnnotations, setIsLoadingAnnotations] = useState(false);
  const [isCreatingAnnotation, setIsCreatingAnnotation] = useState(false);
  const [annotationError, setAnnotationError] = useState<string | null>(null);
  const [versionText, setVersionText] = useState<string | null>(null);
  const [isLoadingVersionText, setIsLoadingVersionText] = useState(false);
  const [pendingTextAnchor, setPendingTextAnchor] = useState<{
    selectedText: string;
    startOffset: number | null;
    endOffset: number | null;
    textPrefix: string;
    textSuffix: string;
  } | null>(null);
  const [pendingVisualAnchor, setPendingVisualAnchor] = useState<{
    anchorType: Extract<DocumentAnnotationAnchorType, 'PAGE_RECTANGLE' | 'PAGE_ELLIPSE' | 'PAGE_POINT'>;
    rect?: { x: number; y: number; width: number; height: number };
    point?: { x: number; y: number };
    pageIndex: number;
  } | null>(null);
  const [visualMode, setVisualMode] = useState<Extract<DocumentAnnotationAnchorType, 'PAGE_RECTANGLE' | 'PAGE_ELLIPSE' | 'PAGE_POINT'> | null>(null);
  const [annotationDraft, setAnnotationDraft] = useState({
    annotationType: 'INTERNAL_NOTE' as DocumentAnnotationType,
    headline: '',
    internalNote: '',
    reviewComment: '',
    clientExplanationDraft: '',
  });

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
        } else if (uploaded[0]) {
          setSelectedLedgerItem({ kind: 'uploaded', item: uploaded[0] });
          setSelectedContract(null);
        } else if (contractsData[0]) {
          setSelectedLedgerItem({ kind: 'generated', item: contractsData[0] });
          setSelectedContract(contractsData[0]);
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

  const selectedUploadedDocument = selectedLedgerItem?.kind === 'uploaded' ? selectedLedgerItem.item : null;
  const selectedGeneratedContract = selectedLedgerItem?.kind === 'generated' ? selectedLedgerItem.item : selectedContract;

  const refreshSelectedDocumentVersions = useCallback(async (documentId: string) => {
    setIsLoadingVersions(true);
    try {
      const response = await getDocumentVersions(documentId);
      setVersions(response.versions);
      const current = response.versions.find((version) => version.isCurrent) || response.versions[0] || null;
      setSelectedVersionId((existing) => response.versions.some((version) => version.id === existing) ? existing : current?.id || null);
    } catch (err) {
      console.error('Document versions load failed:', err);
      setVersions([]);
      setSelectedVersionId(null);
    } finally {
      setIsLoadingVersions(false);
    }
  }, []);

  useEffect(() => {
    if (selectedUploadedDocument?.id && selectedUploadedDocument.documentType !== 'MODIFIED_WORKING_COPY') {
      void refreshSelectedDocumentVersions(selectedUploadedDocument.id);
    } else {
      setVersions([]);
      setSelectedVersionId(null);
    }
  }, [selectedUploadedDocument?.id, selectedUploadedDocument?.documentType, refreshSelectedDocumentVersions]);

  const handleVersionFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedUploadedDocument?.id || !caseRecord?.id) return;

    setIsUploadingVersion(true);
    setActionResult(null);
    try {
      const base64 = await fileToBase64(file);
      const response = await uploadImmutableDocumentVersion({
        documentId: selectedUploadedDocument.id,
        fileName: file.name,
        fileContentBase64: base64,
        mimeType: file.type || 'application/octet-stream',
      });
      setVersions(response.versions);
      setSelectedVersionId(response.currentVersion?.id || response.versions.find((version) => version.isCurrent)?.id || null);
      await loadData(false);
      setActionResult({ type: 'success', message: 'Új, változtathatatlan dokumentumverzió feltöltve.' });
      if (versionFileInputRef.current) {
        versionFileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Version upload failed:', err);
      setActionResult({ type: 'error', message: 'Új verzió feltöltése sikertelen.' });
    } finally {
      setIsUploadingVersion(false);
    }
  };

  const handleDownloadVersion = async (version: DocumentVersionItem) => {
    setIsDownloading(version.id);
    try {
      const blob = await downloadDocumentVersion(version.documentId, version.id);
      const url = URL.createObjectURL(blob);
      const a = globalThis.document.createElement('a');
      a.href = url;
      a.download = version.originalFileName || `document-v${version.versionNumber}`;
      globalThis.document.body.appendChild(a);
      a.click();
      globalThis.document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setActionResult({ type: 'success', message: 'Verzió letöltése elindult.' });
    } catch (err) {
      console.error('Version download failed:', err);
      setActionResult({ type: 'error', message: 'Verzió letöltése sikertelen.' });
    } finally {
      setIsDownloading(null);
    }
  };

  const handlePromoteVersion = async (version: DocumentVersionItem) => {
    setIsPromotingVersion(version.id);
    setActionResult(null);
    try {
      const promoted = await promoteDocumentVersion(version.documentId, version.id);
      setVersions((items) => items.map((item) => ({ ...item, isCurrent: item.id === promoted.id })));
      setSelectedVersionId(promoted.id);
      await loadData(false);
      setActionResult({ type: 'success', message: `v${promoted.versionNumber} lett az aktuális verzió.` });
    } catch (err) {
      console.error('Promote version failed:', err);
      setActionResult({ type: 'error', message: 'Aktuális verzió kijelölése sikertelen.' });
    } finally {
      setIsPromotingVersion(null);
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
            message: 'A dokumentumtár jelenleg nem érhető el. Próbáld újra később.',
          });
        } else if (err.status === 400 || err.status === 404 || err.status === 409) {
          setActionResult({ type: 'error', message: 'A dokumentum a megadott adatokkal nem tölthető fel.' });
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
      setHandoffPackageMessage('Leadási piszkozat létrehozva. A meglévő anonimizált szöveg és jogi elemzés automatikusan csatolva lett, ha elérhető volt.');
      setHandoffPanelRefreshKey((k) => k + 1);
    } catch {
      setHandoffPackageError('Nem sikerült létrehozni a leadási csomagot.');
    } finally {
      setIsCreatingHandoffPackage(false);
    }
  };

  const openDeleteDocumentDialog = (document: DocumentItem) => {
    setDeleteCandidate(document);
    setDeleteError(null);
    setActionResult(null);
  };

  const closeDeleteDocumentDialog = () => {
    if (isDeletingDocument) return;
    setDeleteCandidate(null);
    setDeleteError(null);
  };

  const handleConfirmDeleteDocument = async () => {
    if (!deleteCandidate || !caseRecord?.id) return;
    setIsDeletingDocument(true);
    setDeleteError(null);
    setActionResult(null);
    try {
      await deleteDocument(deleteCandidate.id);
      setSelectedLedgerItem(null);
      setSelectedContract(null);
      await loadData(false);
      setActionResult({ type: 'success', message: 'A dokumentum törölve lett.' });
      setDeleteCandidate(null);
    } catch (err) {
      console.error('Document delete failed:', err);
      if (err instanceof ApiError && err.status === 409) {
        setDeleteError('A dokumentum kapcsolódó munkafolyamat miatt nem törölhető.');
      } else if (err instanceof ApiError && err.status === 403) {
        setDeleteError('Nincs jogosultságod a dokumentum törléséhez.');
      } else if (err instanceof ApiError && err.status === 404) {
        setDeleteError('A dokumentum nem található vagy már törölték.');
        await loadData(false);
      } else if (err instanceof ApiError && err.status === 502) {
        setDeleteError('A SharePoint-törlés nem sikerült, ezért az adatbázis nem módosult.');
      } else {
        setDeleteError('A dokumentum törlése nem sikerült. Próbáld újra később.');
      }
    } finally {
      setIsDeletingDocument(false);
    }
  };

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

  const formatDateTime = (value?: string | null) => {
    if (!value) return 'Nincs megadva';
    try {
      return new Date(value).toLocaleString('hu-HU');
    } catch {
      return value;
    }
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes || bytes < 0) return 'Ismeretlen méret';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
      HANDOFF_PACKAGE_CREATED: 'Leadás létrehozva',
      HANDOFF_PACKAGE_SUBMITTED: 'Leadás beküldve',
      HANDOFF_PACKAGE_REVIEWED: 'Leadás review lezárva',
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
  const houseStyleValueLabels: Record<string, string> = {
    HU: "Magyar",
    EN: "Angol",
    BILINGUAL: "Kétnyelvű",
    HU_ONLY: "Csak magyar",
    EN_ONLY: "Csak angol",
    BILINGUAL_TWO_COLUMN: "Kétnyelvű két hasábban",
  };
  const houseStyleSummary = clientHouseStyle
    ? [
        clientHouseStyle.preferredLanguage ? houseStyleValueLabels[clientHouseStyle.preferredLanguage] || clientHouseStyle.preferredLanguage : null,
        clientHouseStyle.documentLanguageMode ? houseStyleValueLabels[clientHouseStyle.documentLanguageMode] || clientHouseStyle.documentLanguageMode : null,
        clientHouseStyle.fontFamily || null,
      ].filter(Boolean).join(" · ")
    : "";
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
  const canDeleteSelectedDocument = Boolean(selectedUploadedDocument && caseRecord?.status !== 'ARCHIVED');
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) || versions.find((version) => version.isCurrent) || versions[0] || null;
  const selectedVersionStableId = selectedVersion?.id || null;
  const selectedVersionDocumentId = selectedVersion?.documentId || null;
  const selectedAnnotation = annotations.find((annotation) => annotation.id === selectedAnnotationId) || null;
  const selectedVersionFileType = getFileType(selectedVersion?.originalFileName || selectedUploadedDocument?.fileName);
  const canRenderTextVersion = selectedVersionFileType === 'TXT';
  // Single source of truth for which annotation tools may be offered. Support is
  // derived from the renderer that will actually display this version — never from
  // the file extension alone — so no tool is offered over a placeholder surface.
  const annotationCapabilities = resolveAnnotationCapabilities({
    mimeType: selectedVersion?.mimeType,
    fileName: selectedVersion?.originalFileName || selectedUploadedDocument?.fileName,
    textRendered: canRenderTextVersion,
  });
  const canCreateGeometry =
    annotationCapabilities.canCreatePageRectangle ||
    annotationCapabilities.canCreatePageEllipse ||
    annotationCapabilities.canCreatePagePoint;
  // A real, positionable page surface exists only where the renderer draws one.
  const canRenderPageSurface = annotationCapabilities.canNavigateToPageAnchor;
  const openAnnotationCount = annotations.filter((annotation) => annotation.status !== 'RESOLVED').length;

  const refreshAnnotations = useCallback(async (documentId: string, versionId: string) => {
    setIsLoadingAnnotations(true);
    setAnnotationError(null);
    try {
      const response = await getDocumentAnnotations(documentId, versionId, { limit: 50 });
      setAnnotations(response.items);
      setSelectedAnnotationId((existing) => response.items.some((item) => item.id === existing) ? existing : response.items[0]?.id || null);
    } catch (err) {
      console.error('Annotations load failed:', err);
      setAnnotations([]);
      setSelectedAnnotationId(null);
      setAnnotationError('Annotációk betöltése sikertelen.');
    } finally {
      setIsLoadingAnnotations(false);
    }
  }, []);

  useEffect(() => {
    if (selectedUploadedDocument?.id && selectedVersion?.id) {
      void refreshAnnotations(selectedUploadedDocument.id, selectedVersion.id);
    } else {
      setAnnotations([]);
      setSelectedAnnotationId(null);
      setAnnotationComments([]);
    }
  }, [selectedUploadedDocument?.id, selectedVersion?.id, refreshAnnotations]);

  useEffect(() => {
    let cancelled = false;
    setVersionText(null);
    setPendingTextAnchor(null);
    setPendingVisualAnchor(null);
    setVisualMode(null);
    if (!selectedVersionStableId || !selectedVersionDocumentId || !canRenderTextVersion) return;
    setIsLoadingVersionText(true);
    downloadDocumentVersion(selectedVersionDocumentId, selectedVersionStableId)
      .then((blob) => blob.text())
      .then((text) => {
        if (!cancelled) setVersionText(text);
      })
      .catch((err) => {
        console.error('TXT version preview failed:', err);
        if (!cancelled) setAnnotationError('A szöveges előnézet betöltése sikertelen.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingVersionText(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedVersionDocumentId, selectedVersionStableId, canRenderTextVersion]);

  useEffect(() => {
    if (!selectedUploadedDocument?.id || !selectedVersion?.id || !selectedAnnotationId) {
      setAnnotationComments([]);
      return;
    }
    let cancelled = false;
    getDocumentAnnotationComments(selectedUploadedDocument.id, selectedVersion.id, selectedAnnotationId)
      .then((response) => {
        if (!cancelled) setAnnotationComments(response.comments);
      })
      .catch(() => {
        if (!cancelled) setAnnotationComments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedUploadedDocument?.id, selectedVersion?.id, selectedAnnotationId]);

  const handleTextSelectionAnchor = () => {
    if (!versionText || !annotationSurfaceRef.current) return;
    const selection = globalThis.getSelection?.();
    const selectedText = selection?.toString().trim() || '';
    if (!selectedText || !annotationSurfaceRef.current.contains(selection?.anchorNode || null)) return;
    const startOffset = versionText.indexOf(selectedText);
    const endOffset = startOffset >= 0 ? startOffset + selectedText.length : null;
    setPendingTextAnchor({
      selectedText,
      startOffset: startOffset >= 0 ? startOffset : null,
      endOffset,
      textPrefix: startOffset >= 0 ? versionText.slice(Math.max(0, startOffset - 120), startOffset) : '',
      textSuffix: endOffset !== null ? versionText.slice(endOffset, Math.min(versionText.length, endOffset + 120)) : '',
    });
    setPendingVisualAnchor(null);
    setAnnotationDraft((draft) => ({ ...draft, headline: selectedText.slice(0, 120) }));
  };

  const getSurfacePoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    };
  };

  const handleVisualPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!visualMode) return;
    visualAnchorStartRef.current = getSurfacePoint(event);
  };

  const handleVisualPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!visualMode) return;
    const start = visualAnchorStartRef.current || getSurfacePoint(event);
    const end = getSurfacePoint(event);
    visualAnchorStartRef.current = null;
    if (visualMode === 'PAGE_POINT') {
      setPendingVisualAnchor({ anchorType: visualMode, point: end, pageIndex: 0 });
    } else {
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const width = Math.abs(end.x - start.x);
      const height = Math.abs(end.y - start.y);
      if (width < 0.01 || height < 0.01) {
        setAnnotationError('Rajzolj nagyobb kijelölést az annotációhoz.');
        return;
      }
      setPendingVisualAnchor({ anchorType: visualMode, rect: { x, y, width, height }, pageIndex: 0 });
    }
    setPendingTextAnchor(null);
    setAnnotationDraft((draft) => ({ ...draft, headline: ANNOTATION_TYPE_LABELS[draft.annotationType] }));
  };

  const resetAnnotationDraft = () => {
    setPendingTextAnchor(null);
    setPendingVisualAnchor(null);
    setVisualMode(null);
    setAnnotationDraft({
      annotationType: 'INTERNAL_NOTE',
      headline: '',
      internalNote: '',
      reviewComment: '',
      clientExplanationDraft: '',
    });
  };

  const handleCreateAnnotation = async () => {
    if (!selectedUploadedDocument?.id || !selectedVersion?.id) return;
    const anchorPayload = pendingTextAnchor
      ? {
          anchorType: 'TEXT_RANGE' as const,
          selectedText: pendingTextAnchor.selectedText,
          startOffset: pendingTextAnchor.startOffset ?? undefined,
          endOffset: pendingTextAnchor.endOffset ?? undefined,
          textPrefix: pendingTextAnchor.textPrefix,
          textSuffix: pendingTextAnchor.textSuffix,
          contentFingerprint: versionText ? `txt:${versionText.length}:${versionText.slice(0, 24)}` : undefined,
        }
      : pendingVisualAnchor;
    if (!anchorPayload) {
      setAnnotationError('Előbb jelölj ki szöveget, vagy rajzolj vizuális horgonyt.');
      return;
    }
    setIsCreatingAnnotation(true);
    setAnnotationError(null);
    try {
      const payload: CreateDocumentAnnotationPayload = {
        ...anchorPayload,
        annotationType: annotationDraft.annotationType,
        visibility: annotationDraft.annotationType === 'CLIENT_EXPLANATION_DRAFT' ? 'CLIENT_CANDIDATE' : 'INTERNAL',
        headline: annotationDraft.headline || undefined,
        internalNote: annotationDraft.internalNote || undefined,
        reviewComment: annotationDraft.reviewComment || undefined,
        clientExplanationDraft: annotationDraft.clientExplanationDraft || undefined,
        rendererVersion: canRenderTextVersion ? 'txt-readonly-v1' : 'visual-placeholder-v1',
        idempotencyKey: `${selectedVersion.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      };
      const created = await createDocumentAnnotation(selectedUploadedDocument.id, selectedVersion.id, payload);
      setAnnotations((items) => [created, ...items.filter((item) => item.id !== created.id)]);
      setSelectedAnnotationId(created.id);
      resetAnnotationDraft();
      setActionResult({ type: 'success', message: 'Annotáció rögzítve a kiválasztott verzióhoz.' });
    } catch (err) {
      console.error('Create annotation failed:', err);
      setAnnotationError('Annotáció létrehozása sikertelen.');
    } finally {
      setIsCreatingAnnotation(false);
    }
  };

  const handleResolveAnnotation = async (annotation: DocumentAnnotationItem) => {
    if (!selectedUploadedDocument?.id || !selectedVersion?.id) return;
    const updated = await resolveDocumentAnnotation(selectedUploadedDocument.id, selectedVersion.id, annotation.id);
    setAnnotations((items) => items.map((item) => item.id === updated.id ? updated : item));
    setSelectedAnnotationId(updated.id);
  };

  const handleReopenAnnotation = async (annotation: DocumentAnnotationItem) => {
    if (!selectedUploadedDocument?.id || !selectedVersion?.id) return;
    const updated = await reopenDocumentAnnotation(selectedUploadedDocument.id, selectedVersion.id, annotation.id);
    setAnnotations((items) => items.map((item) => item.id === updated.id ? updated : item));
    setSelectedAnnotationId(updated.id);
  };

  const handleDeleteAnnotation = async (annotation: DocumentAnnotationItem) => {
    if (!selectedUploadedDocument?.id || !selectedVersion?.id) return;
    await deleteDocumentAnnotation(selectedUploadedDocument.id, selectedVersion.id, annotation.id);
    setAnnotations((items) => items.filter((item) => item.id !== annotation.id));
    setSelectedAnnotationId((existing) => existing === annotation.id ? null : existing);
  };

  const handleAddAnnotationComment = async () => {
    if (!selectedUploadedDocument?.id || !selectedVersion?.id || !selectedAnnotation || !commentDraft.trim()) return;
    const created = await createDocumentAnnotationComment(selectedUploadedDocument.id, selectedVersion.id, selectedAnnotation.id, commentDraft);
    setAnnotationComments((items) => [...items, created]);
    setCommentDraft('');
  };

  const renderAnnotatedText = () => {
    if (!versionText) return null;
    const ranges = annotations
      .filter((annotation) => annotation.anchorType === 'TEXT_RANGE' && annotation.startOffset !== null && annotation.endOffset !== null)
      .sort((left, right) => (left.startOffset || 0) - (right.startOffset || 0));
    const nodes = [];
    let cursor = 0;
    for (const annotation of ranges) {
      const start = Math.max(0, annotation.startOffset || 0);
      const end = Math.min(versionText.length, annotation.endOffset || start);
      if (start < cursor || end <= start) continue;
      if (start > cursor) nodes.push(<span key={`text-${cursor}`}>{versionText.slice(cursor, start)}</span>);
      nodes.push(
        <mark
          key={annotation.id}
          className={`cursor-pointer rounded px-0.5 ${selectedAnnotationId === annotation.id ? 'bg-[#D8C58E]' : 'bg-[#FEF3C7]'}`}
          onClick={() => setSelectedAnnotationId(annotation.id)}
        >
          {versionText.slice(start, end)}
        </mark>
      );
      cursor = end;
    }
    if (cursor < versionText.length) nodes.push(<span key={`text-${cursor}`}>{versionText.slice(cursor)}</span>);
    return nodes;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col adm-shell-bg text-[var(--adm-text)] documents-surface">
      <CaseWorkspaceNav
        caseId={canonicalCaseId}
        caseNumber={displayCaseId}
        title={displayMatterName}
        clientName={displayClient}
        activeTab="documents"
        status={caseRecord?.status}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto adm-board-page p-4 lg:p-5">
          <section className="mx-auto flex max-w-[1540px] flex-col gap-4">
            {actionResult && (
              <div className={`rounded-[10px] border p-3 text-sm font-medium ${actionResult.type === "success" ? "border-[#D9E3CC] bg-[var(--adm-sage-100)] text-[var(--adm-green-800)]" : "border-[#F2DAD6] bg-[var(--adm-terracotta-100)] text-[var(--adm-terracotta-700)]"}`}>
                {actionResult.message}
              </div>
            )}

            <header className="adm-board-panel overflow-hidden">
              <div className="flex flex-col gap-3 bg-white px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="font-serif text-[28px] font-semibold leading-tight text-[var(--adm-text)]">Contract Workspace</h1>
                    <span className="rounded-full border border-[#D8C58E] bg-[var(--adm-sand-100)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#6D5418]">
                      {totalLedgerDocuments} irat
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <AdminButton variant="primary" onClick={() => fileInputRef.current?.click()} disabled={!caseRecord?.id || isUploading}>
                    {isUploading ? "Feltöltés..." : "Dokumentum feltöltése"}
                  </AdminButton>
                </div>
              </div>
              <div className="border-t border-[var(--adm-border)] bg-[var(--adm-sand-100)] px-4 py-2 text-[11px] text-[#3D4842]">
                <span className="font-bold text-[var(--adm-green-800)]">Workspace fókusz:</span> {selectedDocumentActionLabel}
              </div>
            </header>

            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleFileUpload} className="hidden" />
            <input ref={versionFileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleVersionFileUpload} className="hidden" />
            {isUploading && uploadPhase ? <div className="rounded-[10px] border border-[#D8C58E] bg-[var(--adm-surface)] p-3 text-sm font-semibold text-[#6D5418]">{uploadPhase}</div> : null}
            {isRefreshing ? <div className="rounded-[10px] border border-[var(--adm-border)] bg-[var(--adm-surface)] px-4 py-2 text-xs text-[var(--adm-text-muted)]">Frissítés...</div> : null}

            {isInitialLoading ? (
              <AdminPanel className="p-10 text-center text-sm text-[var(--adm-text-muted)]">Dokumentumok betöltése...</AdminPanel>
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="overflow-hidden rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white">
                  <div className="border-b border-[var(--adm-border)] bg-[var(--adm-sand-100)] p-4">
                    <h2 className="font-serif text-xl font-semibold text-[var(--adm-text)]">Workspace elemek</h2>
                  </div>
                  <div className="max-h-[680px] space-y-4 overflow-y-auto p-3">
                    <section className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--adm-green-800)]">Feltöltött dokumentumok</h3>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[var(--adm-green-800)]">{uploadedDocuments.length}</span>
                      </div>
                      {uploadedDocuments.length === 0 ? (
                        <p className="adm-board-empty p-3 text-[12px] text-[var(--adm-text-muted)]">Nincs feltöltött dokumentum.</p>
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

                    <section className={modifiedWorkingCopies.length === 0 ? "hidden" : "space-y-2"}>
                      <div className="flex items-center justify-between">
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--adm-green-800)]">Módosított munkapéldányok</h3>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[var(--adm-green-800)]">{modifiedWorkingCopyCount}</span>
                      </div>
                      {modifiedWorkingCopies.map((doc) => {
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

                    <section className={generatedLedgerItems.length === 0 ? "hidden" : "space-y-2"}>
                      <div className="flex items-center justify-between">
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--adm-green-800)]">Generált / módosított</h3>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[var(--adm-green-800)]">{generatedDocumentCount}</span>
                      </div>
                      {generatedLedgerItems.map((contract) => {
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

                    <section className="hidden space-y-2 border-t border-[rgba(22,32,26,0.12)] pt-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--adm-green-800)]">Ügyvédi leadási csomagok</h3>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[var(--adm-green-800)]">{handoffPackageCountLabel}</span>
                      </div>
                      <p className="adm-board-empty p-3 text-[12px] text-[var(--adm-text-muted)]">
                        A leadási csomagok a jobb oldali ügyvédi csomag panelen kezelhetők.
                      </p>
                    </section>
                  </div>
                </aside>

                <section className="adm-board-panel min-w-0 overflow-hidden">
                  <div className="flex gap-4 border-b border-[rgba(22,32,26,0.12)] bg-white/70 p-5">
                    <div className="mt-1 h-16 w-1.5 rounded-full bg-[var(--adm-ochre-500)]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--adm-green-800)]">Contract Workspace</p>
                      <h2 className="mt-1 truncate font-serif text-[28px] font-semibold leading-tight text-[var(--adm-text)]">{activeTitle || "Nincs még workspace dokumentum"}</h2>
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

                  <div className="space-y-4 p-5">
                    {!activeDocument ? (
                      <div className="adm-board-empty p-8 text-center">
                        <h3 className="font-serif text-2xl font-semibold text-[var(--adm-text)]">Nincs kiválasztott dokumentum</h3>
                        <p className="mx-auto mt-2 max-w-md text-sm text-[#3D4842]">Tölts fel egy dokumentumot, vagy válassz az iratlistából.</p>
                        <div className="mt-5 flex flex-wrap justify-center gap-2">
                          <AdminButton variant="primary" onClick={() => fileInputRef.current?.click()} disabled={!caseRecord?.id || isUploading}>Dokumentum feltöltése</AdminButton>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="rounded-[var(--adm-radius-md)] border border-[rgba(22,32,26,0.12)] bg-[var(--adm-surface)] p-4">
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

                        <div className="rounded-[var(--adm-radius-md)] border border-[rgba(22,32,26,0.12)] bg-white p-4">
                          <div className="flex flex-col gap-3">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Dokumentum összefoglaló</p>
                              <h3 className="font-serif text-2xl font-semibold text-[var(--adm-text)]">{activeTitle}</h3>
                            </div>
                          </div>

                        </div>

                        {selectedUploadedDocument && selectedUploadedDocument.documentType !== 'MODIFIED_WORKING_COPY' ? (
                          <div className="rounded-[var(--adm-radius-md)] border border-[rgba(22,32,26,0.12)] bg-white p-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Contract Workspace · verziók</p>
                                <h3 className="font-serif text-2xl font-semibold text-[var(--adm-text)]">Változtathatatlan verziótörténet</h3>
                                <p className="mt-1 max-w-2xl text-sm text-[#3D4842]">
                                  Minden feltöltés új tartalmi verziót hoz létre. A korábbi verziók letölthetők, de nem szerkeszthetők és nem íródnak felül.
                                </p>
                              </div>
                              <AdminButton variant="primary" onClick={() => versionFileInputRef.current?.click()} disabled={isUploadingVersion || isLoadingVersions}>
                                {isUploadingVersion ? 'Verzió feltöltése...' : 'Új verzió feltöltése'}
                              </AdminButton>
                            </div>

                            {isLoadingVersions ? (
                              <p className="mt-4 rounded-[10px] border border-dashed border-[rgba(22,32,26,0.18)] bg-[var(--adm-surface)] p-3 text-sm text-[var(--adm-text-muted)]">Verziótörténet betöltése...</p>
                            ) : versions.length === 0 ? (
                              <p className="mt-4 rounded-[10px] border border-dashed border-[rgba(22,32,26,0.18)] bg-[var(--adm-surface)] p-3 text-sm text-[var(--adm-text-muted)]">Ehhez a dokumentumhoz még nincs verziórekord.</p>
                            ) : (
                              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                                <div className="space-y-2">
                                  {versions.map((version) => (
                                    <button
                                      key={version.id}
                                      type="button"
                                      onClick={() => setSelectedVersionId(version.id)}
                                      className={`w-full rounded-[12px] border p-3 text-left transition ${selectedVersion?.id === version.id ? 'border-[#D8C58E] bg-[var(--adm-sand-100)]' : 'border-[rgba(22,32,26,0.12)] bg-white hover:bg-[var(--adm-surface)]'}`}
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="font-serif text-lg font-semibold text-[var(--adm-text)]">v{version.versionNumber}</span>
                                        <span className="flex flex-wrap gap-2">
                                          {version.isCurrent ? <AdminBadge tone="gold">Aktuális</AdminBadge> : null}
                                          <AdminBadge tone="neutral">{version.versionType}</AdminBadge>
                                        </span>
                                      </div>
                                      <p className="mt-1 truncate text-sm font-semibold text-[#3D4842]">{version.originalFileName}</p>
                                      <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">
                                        {version.uploadedBy.name} · {formatDateTime(version.uploadedAt)} · {formatFileSize(version.size)}
                                      </p>
                                    </button>
                                  ))}
                                </div>

                                <aside className="rounded-[12px] border border-[rgba(22,32,26,0.12)] bg-[var(--adm-surface)] p-4">
                                  {selectedVersion ? (
                                    <div className="space-y-3">
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Kiválasztott verzió</p>
                                        <h4 className="font-serif text-2xl font-semibold text-[var(--adm-text)]">v{selectedVersion.versionNumber}</h4>
                                      </div>
                                      <div className="space-y-1 text-xs text-[#3D4842]">
                                        <p><b>Fájlnév:</b> {selectedVersion.originalFileName}</p>
                                        <p><b>Feltöltő:</b> {selectedVersion.uploadedBy.name}</p>
                                        <p><b>Feltöltve:</b> {formatDateTime(selectedVersion.uploadedAt)}</p>
                                        <p><b>Méret:</b> {formatFileSize(selectedVersion.size)}</p>
                                        <p><b>MIME:</b> {selectedVersion.mimeType || 'application/octet-stream'}</p>
                                        <p><b>Típus:</b> {selectedVersion.versionType}</p>
                                        <p><b>Review:</b> {selectedVersion.reviewStatus}</p>
                                        <p><b>Publikáció:</b> {selectedVersion.publicationStatus}</p>
                                        <p><b>Forrás:</b> {selectedVersion.uploadSource}</p>
                                        <p><b>Előző verzió:</b> {selectedVersion.previousVersionId ? 'Kapcsolva' : 'Nincs'}</p>
                                      </div>
                                      <div className="space-y-2 border-t border-[rgba(22,32,26,0.12)] pt-3">
                                        <AdminButton className="w-full justify-start" variant="neutral" onClick={() => handleDownloadVersion(selectedVersion)} disabled={isDownloading === selectedVersion.id}>
                                          {isDownloading === selectedVersion.id ? 'Letöltés...' : 'Verzió letöltése'}
                                        </AdminButton>
                                        <AdminButton className="w-full justify-start" variant="gold" onClick={() => handlePromoteVersion(selectedVersion)} disabled={selectedVersion.isCurrent || isPromotingVersion === selectedVersion.id}>
                                          {selectedVersion.isCurrent ? 'Már aktuális' : isPromotingVersion === selectedVersion.id ? 'Kijelölés...' : 'Legyen aktuális'}
                                        </AdminButton>
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-sm text-[var(--adm-text-muted)]">Válassz verziót.</p>
                                  )}
                                </aside>
                              </div>
                            )}

                            {selectedVersion ? (
                              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                                <div className="rounded-[12px] border border-[rgba(22,32,26,0.12)] bg-[var(--adm-surface)] p-4">
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Anchored annotations · v{selectedVersion.versionNumber}</p>
                                      <h4 className="font-serif text-xl font-semibold text-[var(--adm-text)]">Read-only review surface</h4>
                                      <p className="mt-1 text-xs text-[#3D4842]">
                                        Az annotációk ehhez az immutable verzióhoz kötődnek. Nincs szerkesztés, nincs automatikus migráció verziók között.
                                      </p>
                                    </div>
                                    <AnnotationCapabilityToolbar
                                      capabilities={annotationCapabilities}
                                      visualMode={visualMode}
                                      onVisualModeChange={setVisualMode}
                                    />
                                  </div>

                                  {annotationError ? (
                                    <p className="mt-3 rounded-[10px] border border-[#F2DAD6] bg-[var(--adm-terracotta-100)] p-3 text-xs font-semibold text-[var(--adm-terracotta-700)]">{annotationError}</p>
                                  ) : null}

                                  <div
                                    ref={annotationSurfaceRef}
                                    onMouseUp={annotationCapabilities.canCreateTextRange ? handleTextSelectionAnchor : undefined}
                                    onPointerDown={canCreateGeometry ? handleVisualPointerDown : undefined}
                                    onPointerUp={canCreateGeometry ? handleVisualPointerUp : undefined}
                                    className={`relative mt-4 min-h-[420px] overflow-hidden rounded-[12px] border border-[rgba(22,32,26,0.12)] bg-white ${visualMode ? 'cursor-crosshair' : ''}`}
                                  >
                                    {canRenderTextVersion ? (
                                      <div className="max-h-[620px] overflow-auto whitespace-pre-wrap p-5 font-mono text-[12px] leading-6 text-[#1f2a24]">
                                        {isLoadingVersionText ? 'Szöveges verzió betöltése...' : renderAnnotatedText()}
                                      </div>
                                    ) : (
                                      <div className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
                                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--adm-green-800)]">{selectedVersionFileType} előnézet</p>
                                        <h5 className="mt-2 font-serif text-2xl font-semibold text-[var(--adm-text)]">Stabil szövegkijelölés még nincs ehhez a formátumhoz</h5>
                                        <p className="mt-2 max-w-lg text-sm text-[#3D4842]">
                                          PDF/DOCX annotációhoz most normalizált vizuális horgonyt lehet rögzíteni ezen a read-only felületen. A letöltött fájl változatlan marad.
                                        </p>
                                      </div>
                                    )}

                                    {/* Geometry overlays are only positioned over a genuinely rendered page
                                        surface. Over a placeholder they would imply a spatial anchor that does
                                        not exist, so they stay in the sidebar list instead. */}
                                    {canRenderPageSurface ? annotations.filter((annotation) => annotation.anchorType === 'PAGE_RECTANGLE' || annotation.anchorType === 'PAGE_ELLIPSE').map((annotation) => annotation.rect ? (
                                      <button
                                        key={annotation.id}
                                        type="button"
                                        aria-label={annotation.headline || ANNOTATION_TYPE_LABELS[annotation.annotationType]}
                                        onClick={() => setSelectedAnnotationId(annotation.id)}
                                        className={`absolute border-2 bg-[#D8C58E]/20 ${annotation.anchorType === 'PAGE_ELLIPSE' ? 'rounded-full' : 'rounded'} ${selectedAnnotationId === annotation.id ? 'border-[#8A6A20]' : 'border-[#D8C58E]'}`}
                                        style={{
                                          left: `${(annotation.rect.x || 0) * 100}%`,
                                          top: `${(annotation.rect.y || 0) * 100}%`,
                                          width: `${(annotation.rect.width || 0) * 100}%`,
                                          height: `${(annotation.rect.height || 0) * 100}%`,
                                        }}
                                      />
                                    ) : null) : null}
                                    {canRenderPageSurface ? annotations.filter((annotation) => annotation.anchorType === 'PAGE_POINT').map((annotation) => annotation.point ? (
                                      <button
                                        key={annotation.id}
                                        type="button"
                                        aria-label={annotation.headline || ANNOTATION_TYPE_LABELS[annotation.annotationType]}
                                        onClick={() => setSelectedAnnotationId(annotation.id)}
                                        className={`absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${selectedAnnotationId === annotation.id ? 'border-[#8A6A20] bg-[#D8C58E]' : 'border-[#D8C58E] bg-white'}`}
                                        style={{
                                          left: `${(annotation.point.x || 0) * 100}%`,
                                          top: `${(annotation.point.y || 0) * 100}%`,
                                        }}
                                      />
                                    ) : null) : null}
                                    {pendingVisualAnchor?.rect ? (
                                      <div
                                        className={`pointer-events-none absolute border-2 border-dashed border-[#8A6A20] bg-[#D8C58E]/10 ${pendingVisualAnchor.anchorType === 'PAGE_ELLIPSE' ? 'rounded-full' : 'rounded'}`}
                                        style={{
                                          left: `${pendingVisualAnchor.rect.x * 100}%`,
                                          top: `${pendingVisualAnchor.rect.y * 100}%`,
                                          width: `${pendingVisualAnchor.rect.width * 100}%`,
                                          height: `${pendingVisualAnchor.rect.height * 100}%`,
                                        }}
                                      />
                                    ) : null}
                                    {pendingVisualAnchor?.point ? (
                                      <div
                                        className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-[#8A6A20] bg-[#D8C58E]"
                                        style={{ left: `${pendingVisualAnchor.point.x * 100}%`, top: `${pendingVisualAnchor.point.y * 100}%` }}
                                      />
                                    ) : null}
                                  </div>
                                </div>

                                <aside className="rounded-[12px] border border-[rgba(22,32,26,0.12)] bg-white p-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Annotációk</p>
                                      <h4 className="font-serif text-xl font-semibold text-[var(--adm-text)]">{openAnnotationCount} nyitott</h4>
                                    </div>
                                    <AdminBadge tone={annotations.length ? 'gold' : 'neutral'}>{annotations.length} összes</AdminBadge>
                                  </div>

                                  <div className="mt-4 rounded-[10px] border border-[#E7DECB] bg-[var(--adm-surface)] p-3">
                                    <p className="text-xs font-bold text-[var(--adm-green-800)]">
                                      {pendingTextAnchor ? 'Szövegkijelölés aktív' : pendingVisualAnchor ? 'Vizuális horgony aktív' : 'Válassz horgonyt'}
                                    </p>
                                    {pendingTextAnchor ? <p className="mt-1 line-clamp-3 text-xs text-[#3D4842]">“{pendingTextAnchor.selectedText}”</p> : null}
                                    <div className="mt-3 grid gap-2">
                                      <select
                                        value={annotationDraft.annotationType}
                                        onChange={(event) => setAnnotationDraft((draft) => ({ ...draft, annotationType: event.target.value as DocumentAnnotationType }))}
                                        className="rounded border border-[rgba(22,32,26,0.16)] bg-white px-3 py-2 text-sm"
                                      >
                                        {TEXT_ANNOTATION_TYPES.map((type) => <option key={type} value={type}>{ANNOTATION_TYPE_LABELS[type]}</option>)}
                                      </select>
                                      <input
                                        value={annotationDraft.headline}
                                        onChange={(event) => setAnnotationDraft((draft) => ({ ...draft, headline: event.target.value }))}
                                        placeholder="Rövid cím"
                                        className="rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm"
                                      />
                                      <textarea
                                        value={annotationDraft.internalNote}
                                        onChange={(event) => setAnnotationDraft((draft) => ({ ...draft, internalNote: event.target.value }))}
                                        placeholder="Belső megjegyzés"
                                        rows={3}
                                        className="rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm"
                                      />
                                      <textarea
                                        value={annotationDraft.reviewComment}
                                        onChange={(event) => setAnnotationDraft((draft) => ({ ...draft, reviewComment: event.target.value }))}
                                        placeholder="Review komment"
                                        rows={2}
                                        className="rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm"
                                      />
                                      <div className="flex flex-col gap-1">
                                        <span className="flex items-center justify-between gap-2">
                                          <label htmlFor="cw-ann-client-draft" className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Ügyfélmagyarázat-tervezet</label>
                                          <NotPublishedBadge />
                                        </span>
                                        <textarea
                                          id="cw-ann-client-draft"
                                          value={annotationDraft.clientExplanationDraft}
                                          onChange={(event) => setAnnotationDraft((draft) => ({ ...draft, clientExplanationDraft: event.target.value }))}
                                          placeholder="Ügyfélmagyarázat-tervezet"
                                          rows={2}
                                          className="rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm"
                                        />
                                      </div>
                                      <AdminButton variant="primary" onClick={handleCreateAnnotation} disabled={isCreatingAnnotation || (!pendingTextAnchor && !pendingVisualAnchor)}>
                                        {isCreatingAnnotation ? 'Mentés...' : 'Annotáció létrehozása'}
                                      </AdminButton>
                                    </div>
                                  </div>

                                  <div className="mt-4 max-h-[280px] space-y-2 overflow-y-auto">
                                    {isLoadingAnnotations ? (
                                      <p className="text-xs text-[var(--adm-text-muted)]">Annotációk betöltése...</p>
                                    ) : annotations.length === 0 ? (
                                      <p className="rounded-[10px] border border-dashed border-[rgba(22,32,26,0.18)] p-3 text-xs text-[var(--adm-text-muted)]">Még nincs annotáció ezen a verzión.</p>
                                    ) : annotations.map((annotation) => (
                                      <button
                                        key={annotation.id}
                                        type="button"
                                        onClick={() => setSelectedAnnotationId(annotation.id)}
                                        className={`w-full rounded-[10px] border p-3 text-left ${selectedAnnotationId === annotation.id ? 'border-[#D8C58E] bg-[var(--adm-sand-100)]' : 'border-[rgba(22,32,26,0.12)] bg-white'}`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="flex flex-wrap items-center gap-1.5">
                                            <span className="text-xs font-bold text-[var(--adm-green-800)]">{ANNOTATION_TYPE_LABELS[annotation.annotationType]}</span>
                                            {isClientExplanationDraft(annotation.annotationType) ? <NotPublishedBadge /> : null}
                                          </span>
                                          <AdminBadge tone={annotation.status === 'RESOLVED' ? 'green' : 'gold'}>{annotation.status}</AdminBadge>
                                        </div>
                                        <p className="mt-1 line-clamp-2 text-sm font-semibold text-[var(--adm-text)]">{annotation.headline || annotation.selectedText || 'Annotáció'}</p>
                                        <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{annotation.createdBy?.name || 'Ismeretlen'} · {formatDateTime(annotation.createdAt)}</p>
                                      </button>
                                    ))}
                                  </div>

                                  {selectedAnnotation ? (
                                    <div className="mt-4 space-y-3 border-t border-[rgba(22,32,26,0.12)] pt-4">
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Kontextus panel</p>
                                        <h5 className="font-serif text-lg font-semibold text-[var(--adm-text)]">{selectedAnnotation.headline || ANNOTATION_TYPE_LABELS[selectedAnnotation.annotationType]}</h5>
                                        {isClientExplanationDraft(selectedAnnotation.annotationType) ? <NotPublishedBadge className="mt-1" /> : null}
                                      </div>
                                      {selectedAnnotation.selectedText ? <p className="rounded bg-[var(--adm-surface)] p-2 text-xs text-[#3D4842]">“{selectedAnnotation.selectedText}”</p> : null}
                                      {selectedAnnotation.internalNote ? <p className="text-xs"><b>Belső:</b> {selectedAnnotation.internalNote}</p> : null}
                                      {selectedAnnotation.reviewComment ? <p className="text-xs"><b>Review:</b> {selectedAnnotation.reviewComment}</p> : null}
                                      {selectedAnnotation.clientExplanationDraft ? (
                                        <div className="rounded border border-[#E7DECB] bg-[var(--adm-sand-100)] p-2">
                                          <div className="flex items-center justify-between gap-2">
                                            <b className="text-xs">Ügyfélmagyarázat-tervezet</b>
                                            <NotPublishedBadge />
                                          </div>
                                          <p className="mt-1 text-xs">{selectedAnnotation.clientExplanationDraft}</p>
                                        </div>
                                      ) : null}
                                      <div className="flex flex-wrap gap-2">
                                        {selectedAnnotation.status === 'RESOLVED' ? (
                                          <AdminButton size="sm" variant="gold" onClick={() => handleReopenAnnotation(selectedAnnotation)}>Újranyitás</AdminButton>
                                        ) : (
                                          <AdminButton size="sm" variant="gold" onClick={() => handleResolveAnnotation(selectedAnnotation)}>Megoldva</AdminButton>
                                        )}
                                        <AdminButton size="sm" variant="muted" onClick={() => handleDeleteAnnotation(selectedAnnotation)}>Törlés</AdminButton>
                                      </div>
                                      <div className="space-y-2">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Kommentek</p>
                                        {annotationComments.map((comment) => (
                                          <p key={comment.id} className="rounded bg-[var(--adm-surface)] p-2 text-xs text-[#3D4842]">{comment.body}</p>
                                        ))}
                                        <textarea
                                          value={commentDraft}
                                          onChange={(event) => setCommentDraft(event.target.value)}
                                          placeholder="Új belső komment"
                                          rows={2}
                                          className="w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm"
                                        />
                                        <AdminButton size="sm" variant="neutral" onClick={handleAddAnnotationComment} disabled={!commentDraft.trim()}>Komment hozzáadása</AdminButton>
                                      </div>
                                    </div>
                                  ) : null}
                                </aside>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </section>

                <aside className="grid gap-3 md:grid-cols-2 xl:col-start-2">
                  <AdminPanel className="overflow-hidden border-[rgba(22,32,26,0.14)] bg-[var(--adm-surface)]">
                    <div className="bg-[var(--adm-green-800)] p-4 text-white">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#D8C58E]">Akciók</p>
                      <h2 className="mt-1 font-serif text-2xl font-semibold">Dokumentum műveletek</h2>
                    </div>
                    <div className="space-y-2 p-4">
                      {!activeDocument ? (
                        <p className="rounded-[10px] border border-dashed border-[rgba(22,32,26,0.18)] bg-white p-3 text-[12px] text-[var(--adm-text-muted)]">
                          Válassz workspace dokumentumot a műveletekhez.
                        </p>
                      ) : (
                        <>
                          <p className="rounded-[10px] border border-[#E7DECB] bg-white p-3 text-[12px] text-[#3D4842]">
                            Kiválasztott dokumentum: <span className="font-semibold text-[var(--adm-text)]">{activeTitle}</span>
                          </p>
                          <AdminButton className="w-full justify-start" variant="primary" onClick={() => openWorkspace(activeDocument.id)}>
                            Contract Workspace megnyitása
                          </AdminButton>
                          <AdminButton className="w-full justify-start" variant="gold" onClick={() => litigationWorkspaceUrl && router.push(litigationWorkspaceUrl)} disabled={!litigationWorkspaceUrl}>
                            Peres munkatér
                          </AdminButton>
                          {!litigationWorkspaceUrl ? (
                            <p className="rounded-[10px] border border-dashed border-[rgba(22,32,26,0.18)] bg-white p-3 text-[12px] text-[var(--adm-text-muted)]">
                              A peres munkatér feltöltött dokumentumból indítható.
                            </p>
                          ) : null}
                          <AdminButton className="w-full justify-start" variant="gold" onClick={() => router.push(`/cases/${encodeURIComponent(canonicalCaseId)}/handoff`)}>
                            Leadás
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
                            {canDeleteSelectedDocument && selectedUploadedDocument ? (
                              <AdminButton
                                className="w-full justify-start border-[#d4b8b8] bg-white text-[#8b3a3a] hover:bg-[#fef2f2]"
                                variant="neutral"
                                onClick={() => openDeleteDocumentDialog(selectedUploadedDocument)}
                                disabled={isDeletingDocument}
                              >
                                Dokumentum törlése
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
                        <p>{houseStyleSummary || "Profil létrehozva, de nincs kitöltve."}</p>
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

            <details className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
              <summary className="cursor-pointer font-serif text-lg font-medium text-[var(--adm-text)]">Legutóbbi ügyesemények</summary>
              <div className="mt-3 space-y-3">
                {timeline.length > 0 ? timeline.slice(0, 5).map((event) => (
                  <div key={event.id} className="border-l-2 border-[var(--adm-ochre-500)] pl-3">
                    <p className="text-sm font-semibold text-[var(--adm-text)]">{humanizeTimelineType(event)}</p>
                    <p className="text-[12px] text-[var(--adm-text-muted)]">{formatShortDate(event.createdAt)}</p>
                  </div>
                )) : <p className="text-sm text-[var(--adm-text-muted)]">Még nincs rögzített ügyesemény.</p>}
              </div>
            </details>
          </section>
        </main>

      </div>

      {deleteCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="ledger-delete-document-title">
          <div className="w-full max-w-md rounded-[10px] border border-[var(--adm-border)] bg-white shadow-2xl">
            <div className="rounded-t-[10px] border-b border-[var(--adm-border)] bg-[#8B2A2A] px-6 py-4">
              <h2 id="ledger-delete-document-title" className="font-serif text-xl font-semibold text-white">Dokumentum törlése</h2>
              <p className="mt-1 text-xs text-white/75">Ez a művelet nem vonható vissza.</p>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <p className="truncate text-sm font-semibold text-[var(--adm-text)]">{deleteCandidate.fileName || 'Névtelen dokumentum'}</p>
                <p className="mt-1 text-xs text-[var(--adm-text-muted)]">{deleteCandidate.documentType || 'Dokumentum'} {deleteCandidate.version ? `· ${deleteCandidate.version}` : ''}</p>
              </div>
              <div className="rounded-[10px] border border-[#FCD34D] bg-[#FEF3C7] p-3">
                <p className="text-xs leading-relaxed text-[#92400E]">
                  Biztosan törölni szeretnéd ezt a dokumentumot? A rendszer előbb ellenőrzi, hogy nincs-e kapcsolódó feladat,
                  anonimizált változat, jogi elemzés vagy nyitott review-javaslat.
                </p>
              </div>
              {deleteError ? (
                <div className="rounded-[10px] border border-[#d4b8b8] bg-[#fef2f2] p-3 text-xs text-[#8b3a3a]">{deleteError}</div>
              ) : null}
              <div className="flex justify-end gap-3">
                <AdminButton variant="neutral" onClick={closeDeleteDocumentDialog} disabled={isDeletingDocument}>
                  Mégse
                </AdminButton>
                <AdminButton
                  variant="neutral"
                  className="border-[#8B2A2A] bg-[#8B2A2A] text-white hover:bg-[#6f2020]"
                  onClick={handleConfirmDeleteDocument}
                  disabled={isDeletingDocument}
                >
                  {isDeletingDocument ? 'Törlés...' : 'Végleges törlés'}
                </AdminButton>
              </div>
            </div>
          </div>
        </div>
      )}

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
