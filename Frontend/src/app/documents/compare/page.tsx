"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import {
  downloadReviewSummary,
  downloadContract,
  downloadDocument,
  getContractComparison,
  getCaseContracts,
  getCaseDocuments,
  getCaseSummary,
  getCaseTasks,
  getCases,
  getContractTimeline,
  getCurrentUser,
  getReviewNotes,
  saveReviewNotes,
  type BlockReviewStatus,
  type CaseContractListItem,
  type CaseListItem,
  type CaseSummaryResponse,
  type ContractCompareBlock,
  type ContractComparisonResponse,
  type DocumentItem,
  type ReviewNotesResult,
  type TaskItem,
  type TimelineEvent,
} from "@/lib/api";

type CompareDocument = {
  id: string;
  kind: "contract" | "document";
  source: "GENERATED" | "UPLOADED";
  title: string;
  fileName: string;
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  caseClientName: string;
  status: string;
  revisionNumber?: number;
  isCurrentRevision?: boolean;
  isFinalRevision?: boolean;
  generatedAt?: string;
  createdAt: string;
  updatedAt: string;
  templateName?: string;
  threadId?: string;
  spWebUrl?: string | null;
  spItemId?: string | null;
};

type BlockNoteDraft = {
  status: BlockReviewStatus;
  title: string;
  note: string;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("hu-HU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return value;
  }
};

const toDaysDiff = (newer?: string, older?: string) => {
  if (!newer || !older) return null;
  const ms = new Date(newer).getTime() - new Date(older).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
};

const stripRevisionMarkers = (value: string) =>
  value
    .replace(/\(revision\s*\d+\)/gi, "")
    .replace(/\brev(?:ision)?\s*\d+\b/gi, "")
    .replace(/\bv\d+\b/gi, "")
    .replace(/[_\-]+rev[_\-]*\d+/gi, "")
    .replace(/\.docx$/gi, "")
    .replace(/\s+/g, " ")
    .trim();

const lineageKey = (doc: CompareDocument) => {
  const byTitle = stripRevisionMarkers((doc.title || "").toLowerCase());
  const byTemplate = stripRevisionMarkers((doc.templateName || "").toLowerCase());
  const byFileName = stripRevisionMarkers((doc.fileName || "").toLowerCase());
  return byTitle || byTemplate || byFileName || "unknown";
};

const lineageGroupKey = (doc: CompareDocument) => {
  // Grounded explicit lineage for generated contracts
  if (doc.kind === "contract" && doc.threadId) {
    return `thread:${doc.caseId}:${doc.threadId}`;
  }
  // Honest fallback: same case + same kind + same source + normalized key
  return `fallback:${doc.caseId}:${doc.kind}:${doc.source}:${lineageKey(doc)}`;
};

const isReviewLikeStatus = (status?: string) => {
  const normalized = String(status || "").toUpperCase();
  return normalized.includes("REVIEW") || normalized === "SUBMITTED" || normalized === "IN_REVIEW";
};

const toDocumentSource = (doc: DocumentItem): "GENERATED" | "UPLOADED" => {
  const fromType = String(doc.documentType || "").toUpperCase();
  if (fromType.includes("CONTRACT") || fromType.includes("GENERATED")) return "GENERATED";
  return "UPLOADED";
};

const normalizeBlockTitle = (value?: string | null) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const buildBlockNoteKey = (block: ContractCompareBlock) => {
  const clauseId = block.targetBlock?.sourceClauseId || block.sourceBlock?.sourceClauseId;
  if (clauseId) {
    return `clause:${clauseId}`;
  }

  const orderIndex = block.targetBlock?.orderIndex ?? block.sourceBlock?.orderIndex ?? -1;
  const title = normalizeBlockTitle(block.targetBlock?.title || block.sourceBlock?.title || "untitled");
  return `order:${orderIndex}:title:${title || 'untitled'}`;
};

export default function DocumentsComparePage() {
  return (
    <AuthenticatedApp section="documents-compare">
      <DocumentsComparePageContent />
    </AuthenticatedApp>
  );
}

function DocumentsComparePageContent() {
  const searchParams = useSearchParams();
  const requestedCaseId = searchParams?.get("caseId") || "";
  const requestedDocumentId = searchParams?.get("documentId") || "";
  const requestedBaselineId = searchParams?.get("baselineId") || "";

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [documents, setDocuments] = useState<CompareDocument[]>([]);
  const [caseSummaries, setCaseSummaries] = useState<Record<string, CaseSummaryResponse>>({});
  const [caseTasks, setCaseTasks] = useState<Record<string, TaskItem[]>>({});

  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedBaselineId, setSelectedBaselineId] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<Array<{ id: string; description: string; createdAt: string }>>([]);
  const [comparisonData, setComparisonData] = useState<ContractComparisonResponse | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [reviewNotesData, setReviewNotesData] = useState<ReviewNotesResult | null>(null);
  const [reviewNotesLoading, setReviewNotesLoading] = useState(false);
  const [blockNoteDrafts, setBlockNoteDrafts] = useState<Record<string, BlockNoteDraft>>({});
  const [blockNotesSaveState, setBlockNotesSaveState] = useState<{ type: "success" | "error" | null; message: string }>({
    type: null,
    message: "",
  });
  const [blockNotesSaving, setBlockNotesSaving] = useState(false);
  const [reviewSummaryDownloading, setReviewSummaryDownloading] = useState(false);

  const [search, setSearch] = useState("");
  const [caseFilter, setCaseFilter] = useState<string>(requestedCaseId || "all");
  const [reviewFilter, setReviewFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [hasPreviousOnly, setHasPreviousOnly] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);

  type ScopedCase = {
    id: string;
    caseNumber: string;
    title: string;
    clientName: string;
  };

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const me = await getCurrentUser();
        const preloadedSummaries: Record<string, CaseSummaryResponse> = {};

        let scopedCases: ScopedCase[] = [];
        if (requestedCaseId) {
          try {
            const requestedSummary = await getCaseSummary(requestedCaseId);
            preloadedSummaries[requestedCaseId] = requestedSummary;
            scopedCases = [
              {
                id: requestedCaseId,
                caseNumber: requestedSummary.case.caseNumber,
                title: requestedSummary.case.title,
                clientName: requestedSummary.case.clientName,
              },
            ];
          } catch {
            const fallbackCasesResponse = await getCases(1, 120, me.id);
            scopedCases = fallbackCasesResponse.data
              .filter((item) => item.id === requestedCaseId || item.caseNumber === requestedCaseId)
              .map((item) => ({
                id: item.id,
                caseNumber: item.caseNumber,
                title: item.title,
                clientName: item.clientName,
              }));
          }
        } else {
          const casesResponse = await getCases(1, 120, me.id);
          scopedCases = casesResponse.data.map((item) => ({
            id: item.id,
            caseNumber: item.caseNumber,
            title: item.title,
            clientName: item.clientName,
          }));
        }

        const rows = await Promise.all(
          scopedCases.map(async (caseItem: ScopedCase) => {
            const [contracts, plainDocuments, summary, tasks] = await Promise.all([
              getCaseContracts(caseItem.id).catch(() => [] as CaseContractListItem[]),
              getCaseDocuments(caseItem.id).catch(() => [] as DocumentItem[]),
              preloadedSummaries[caseItem.id]
                ? Promise.resolve(preloadedSummaries[caseItem.id])
                : getCaseSummary(caseItem.id).catch(() => null),
              getCaseTasks(caseItem.id).catch(() => [] as TaskItem[]),
            ]);

            const unifiedContracts: CompareDocument[] = contracts.map((doc) => ({
              id: doc.id,
              kind: "contract",
              source: "GENERATED",
              title: doc.title || doc.fileName,
              fileName: doc.fileName || doc.title,
              caseId: caseItem.id,
              caseNumber: caseItem.caseNumber,
              caseTitle: caseItem.title,
              caseClientName: caseItem.clientName,
              status: doc.status || "UNKNOWN",
              revisionNumber: doc.revisionNumber || 1,
              isCurrentRevision: doc.isCurrentRevision,
              isFinalRevision: doc.isFinalRevision,
              generatedAt: doc.generatedAt,
              createdAt: doc.generatedAt,
              updatedAt: doc.generatedAt,
              templateName: doc.templateName,
              threadId: doc.threadId,
              spWebUrl: doc.spWebUrl,
              spItemId: doc.spItemId,
            }));

            const unifiedDocuments: CompareDocument[] = plainDocuments.map((doc) => ({
              id: doc.id,
              kind: "document",
              source: toDocumentSource(doc),
              title: doc.fileName,
              fileName: doc.fileName,
              caseId: caseItem.id,
              caseNumber: caseItem.caseNumber,
              caseTitle: caseItem.title,
              caseClientName: caseItem.clientName,
              status: String(doc.documentType || doc.folder || "UPLOADED").toUpperCase(),
              revisionNumber: Number.parseInt(String(doc.version || "1"), 10) || 1,
              createdAt: doc.createdAt,
              updatedAt: doc.updatedAt,
              spWebUrl: doc.spWebUrl,
              spItemId: doc.spItemId,
            }));

            return {
              caseId: caseItem.id,
              docs: [...unifiedContracts, ...unifiedDocuments],
              summary,
              tasks,
            };
          })
        );

        const merged = rows
          .flatMap((row) => row.docs)
          .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

        const summaryMap: Record<string, CaseSummaryResponse> = {};
        const taskMap: Record<string, TaskItem[]> = {};
        rows.forEach((row) => {
          if (row.summary) summaryMap[row.caseId] = row.summary;
          taskMap[row.caseId] = row.tasks;
        });

        setDocuments(merged);
        setCaseSummaries(summaryMap);
        setCaseTasks(taskMap);

        const requested = merged.find((doc) => doc.id === requestedDocumentId) || null;
        const first = merged[0] || null;
        setSelectedDocumentId((requested || first)?.id || null);
      } catch (err) {
        console.error("Compare board load failed:", err);
        setError("A dokumentum összevető felület betöltése sikertelen.");
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [requestedCaseId, requestedDocumentId]);

  const familiesByDocId = useMemo(() => {
    const map: Record<string, CompareDocument[]> = {};
    for (const doc of documents) {
      const groupKey = lineageGroupKey(doc);
      const family = documents.filter((peer) => lineageGroupKey(peer) === groupKey);
      map[doc.id] = family.sort(
        (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
      );
    }
    return map;
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    const text = search.trim().toLowerCase();
    return documents.filter((doc) => {
      const caseMatch = caseFilter === "all" || doc.caseId === caseFilter || doc.caseNumber === caseFilter;
      const reviewMatch =
        reviewFilter === "all" ||
        (reviewFilter === "needs-review" && isReviewLikeStatus(doc.status)) ||
        (reviewFilter === "approved" && String(doc.status || "").toUpperCase() === "APPROVED") ||
        (reviewFilter === "generated" && String(doc.status || "").toUpperCase() === "GENERATED");
      const sourceMatch = sourceFilter === "all" || doc.source === sourceFilter;
      const hasPreviousMatch = !hasPreviousOnly || (familiesByDocId[doc.id]?.length || 0) > 1;
      const recentMatch =
        !recentOnly ||
        (Date.now() - new Date(doc.updatedAt || doc.createdAt).getTime()) / (1000 * 60 * 60 * 24) <= 14;
      const searchMatch =
        !text ||
        doc.fileName.toLowerCase().includes(text) ||
        doc.title.toLowerCase().includes(text) ||
        doc.caseNumber.toLowerCase().includes(text) ||
        doc.caseTitle.toLowerCase().includes(text);
      return caseMatch && reviewMatch && sourceMatch && hasPreviousMatch && recentMatch && searchMatch;
    });
  }, [documents, search, caseFilter, reviewFilter, sourceFilter, hasPreviousOnly, recentOnly, familiesByDocId]);

  const selectedDocument = useMemo(
    () => filteredDocuments.find((doc) => doc.id === selectedDocumentId) || filteredDocuments[0] || null,
    [filteredDocuments, selectedDocumentId]
  );

  const lineage = useMemo(() => {
    if (!selectedDocument) return [] as CompareDocument[];
    return familiesByDocId[selectedDocument.id] || [];
  }, [selectedDocument, familiesByDocId]);

  const baselineCandidates = useMemo(() => {
    if (!selectedDocument) return [] as CompareDocument[];
    return lineage.filter((doc) => doc.id !== selectedDocument.id);
  }, [lineage, selectedDocument]);

  const requestedBaselineDocument = useMemo(() => {
    if (!requestedBaselineId) return null;
    return documents.find((doc) => doc.id === requestedBaselineId) || null;
  }, [documents, requestedBaselineId]);

  useEffect(() => {
    if (!selectedDocument) {
      setSelectedBaselineId(null);
      return;
    }

    if (requestedBaselineId && requestedBaselineId !== selectedDocument.id) {
      setSelectedBaselineId(requestedBaselineId);
      return;
    }

    const requested = requestedBaselineId
      ? baselineCandidates.find((candidate) => candidate.id === requestedBaselineId)
      : null;
    if (requested) {
      setSelectedBaselineId(requested.id);
      return;
    }

    const older = baselineCandidates.find(
      (candidate) =>
        new Date(candidate.updatedAt || candidate.createdAt).getTime() <
        new Date(selectedDocument.updatedAt || selectedDocument.createdAt).getTime()
    );
    setSelectedBaselineId((older || baselineCandidates[0])?.id || null);
  }, [selectedDocument, baselineCandidates, requestedBaselineId]);

  const selectedBaseline = useMemo(
    () =>
      baselineCandidates.find((doc) => doc.id === selectedBaselineId) ||
      documents.find((doc) => doc.id === selectedBaselineId) ||
      null,
    [baselineCandidates, documents, selectedBaselineId]
  );

  const effectiveBaseline = selectedBaseline || requestedBaselineDocument;

  const previousVersion = useMemo(() => {
    if (!selectedDocument) return null;
    return baselineCandidates.find(
      (candidate) =>
        new Date(candidate.updatedAt || candidate.createdAt).getTime() <
        new Date(selectedDocument.updatedAt || selectedDocument.createdAt).getTime()
    ) || null;
  }, [baselineCandidates, selectedDocument]);

  useEffect(() => {
    const loadComparison = async () => {
      if (!selectedDocument || selectedDocument.kind !== "contract") {
        setComparisonData(null);
        setComparisonError(null);
        return;
      }

      setComparisonLoading(true);
      setComparisonError(null);
      try {
        const comparison = await getContractComparison(selectedDocument.id, effectiveBaseline?.id || undefined);
        setComparisonData(comparison);
      } catch (err) {
        console.error("Contract comparison load failed:", err);
        setComparisonData(null);
        setComparisonError("A blokk-szintű összehasonlítás nem érhető el ehhez a párhoz.");
      } finally {
        setComparisonLoading(false);
      }
    };

    loadComparison();
  }, [selectedDocument, effectiveBaseline?.id]);

  useEffect(() => {
    const loadReviewNotesForSelected = async () => {
      if (!selectedDocument || selectedDocument.kind !== "contract") {
        setReviewNotesData(null);
        setBlockNoteDrafts({});
        setBlockNotesSaveState({ type: null, message: "" });
        return;
      }

      setReviewNotesLoading(true);
      try {
        const notes = await getReviewNotes(selectedDocument.id);
        setReviewNotesData(notes);
      } catch {
        setReviewNotesData(null);
      } finally {
        setReviewNotesLoading(false);
      }
    };

    loadReviewNotesForSelected();
  }, [selectedDocument]);

  useEffect(() => {
    if (!comparisonData || !selectedDocument || selectedDocument.kind !== "contract") {
      setBlockNoteDrafts({});
      return;
    }

    const persisted = new Map(
      (reviewNotesData?.blockNotes || []).map((note) => [note.blockKey, note])
    );

    const seeded: Record<string, BlockNoteDraft> = {};
    comparisonData.blocks.forEach((block) => {
      const key = buildBlockNoteKey(block);
      const persistedNote = persisted.get(key);
      seeded[key] = {
        status: persistedNote?.status || "OK",
        title: persistedNote?.title || "",
        note: persistedNote?.note || "",
      };
    });

    setBlockNoteDrafts(seeded);
  }, [comparisonData, reviewNotesData, selectedDocument]);

  useEffect(() => {
    const loadTimeline = async () => {
      if (!selectedDocument?.id) {
        setTimelineEvents([]);
        return;
      }
      if (selectedDocument.kind === "contract") {
        const response = await getContractTimeline(selectedDocument.id).catch(() => null);
        const events = response?.events || [];
        setTimelineEvents(
          events.slice(0, 6).map((event) => ({
            id: event.id,
            description: event.description || event.typeLabel || event.type,
            createdAt: String(event.createdAt),
          }))
        );
        return;
      }
      const fallback = caseSummaries[selectedDocument.caseId]?.last5TimelineEvents || [];
      setTimelineEvents(
        fallback.slice(0, 6).map((event: TimelineEvent) => ({
          id: event.id,
          description: String(event.type || "Esemény"),
          createdAt: String(event.createdAt),
        }))
      );
    };
    loadTimeline();
  }, [selectedDocument, caseSummaries]);

  const reviewTaskCount = useMemo(() => {
    if (!selectedDocument) return 0;
    return (caseTasks[selectedDocument.caseId] || []).filter((task) => isReviewLikeStatus(task.status)).length;
  }, [selectedDocument, caseTasks]);

  const comparisonSummary = useMemo(() => {
    if (!selectedDocument) return [] as string[];
    if (!effectiveBaseline) {
      return [
        "Nincs elérhető korábbi baseline ugyanabban az ügyben és dokumentumcsaládban.",
        `Lineage elemszám: ${lineage.length}`,
      ];
    }

    const lines: string[] = [];
    lines.push(`Azonos ügy: ${selectedDocument.caseNumber}`);
    lines.push(`Azonos lineage: ${lineageKey(selectedDocument) === lineageKey(effectiveBaseline) ? "igen" : "nem"}`);
    const dayDiff = toDaysDiff(selectedDocument.updatedAt || selectedDocument.createdAt, effectiveBaseline.updatedAt || effectiveBaseline.createdAt);
    if (dayDiff !== null) lines.push(`Frissebb ${Math.max(0, dayDiff)} nappal`);
    if (selectedDocument.status !== effectiveBaseline.status) {
      lines.push(`Státusz változás: ${effectiveBaseline.status} → ${selectedDocument.status}`);
    }
    if (selectedDocument.source !== effectiveBaseline.source) {
      lines.push(`Forrás változás: ${effectiveBaseline.source} → ${selectedDocument.source}`);
    }
    lines.push(`Lineage elemszám: ${lineage.length}`);
    lines.push(`Review feladatok (ügy): ${reviewTaskCount}`);
    return lines;
  }, [selectedDocument, effectiveBaseline, lineage, reviewTaskCount]);

  const caseOptions = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    documents.forEach((doc) => map.set(doc.caseId, { id: doc.caseId, label: `${doc.caseNumber} · ${doc.caseTitle}` }));
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "hu-HU"));
  }, [documents]);

  const handleDownload = async (doc: CompareDocument) => {
    const blob = doc.kind === "contract" ? await downloadContract(doc.id) : await downloadDocument(doc.id);
    const url = URL.createObjectURL(blob);
    const anchor = globalThis.document.createElement("a");
    anchor.href = url;
    anchor.download = doc.fileName || "document";
    globalThis.document.body.appendChild(anchor);
    anchor.click();
    globalThis.document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const updateBlockDraft = (blockKey: string, patch: Partial<BlockNoteDraft>) => {
    setBlockNoteDrafts((prev) => ({
      ...prev,
      [blockKey]: {
        status: prev[blockKey]?.status || "OK",
        title: prev[blockKey]?.title || "",
        note: prev[blockKey]?.note || "",
        ...patch,
      },
    }));
  };

  const saveBlockNotes = async () => {
    if (!selectedDocument || selectedDocument.kind !== "contract" || !comparisonData) {
      return;
    }

    setBlockNotesSaving(true);
    setBlockNotesSaveState({ type: null, message: "" });

    try {
      const blockNotesPayload = comparisonData.blocks.map((block) => {
        const blockKey = buildBlockNoteKey(block);
        const draft = blockNoteDrafts[blockKey] || { status: "OK" as BlockReviewStatus, title: "", note: "" };
        return {
          blockKey,
          blockOrderIndex: block.targetBlock?.orderIndex ?? block.sourceBlock?.orderIndex ?? undefined,
          sourceClauseId: block.targetBlock?.sourceClauseId || block.sourceBlock?.sourceClauseId || undefined,
          status: draft.status,
          title: draft.title.trim() || undefined,
          note: draft.note.trim() || undefined,
        };
      });

      const saved = await saveReviewNotes({
        generationId: selectedDocument.id,
        overallStatus: reviewNotesData?.overallStatus || "NEEDS_REVISION",
        overallTitle: reviewNotesData?.overallTitle,
        overallNote: reviewNotesData?.overallNote,
        blockNotes: blockNotesPayload,
      });

      setReviewNotesData(saved);
      setBlockNotesSaveState({ type: "success", message: "Block review notes saved." });
    } catch {
      setBlockNotesSaveState({ type: "error", message: "Failed to save block review notes." });
    } finally {
      setBlockNotesSaving(false);
    }
  };

  const handleDownloadReviewSummary = async () => {
    if (!selectedDocument || selectedDocument.kind !== "contract") {
      return;
    }

    setReviewSummaryDownloading(true);
    try {
      const blob = await downloadReviewSummary(selectedDocument.id);
      const url = URL.createObjectURL(blob);
      const anchor = globalThis.document.createElement("a");
      anchor.href = url;
      anchor.download = `review-summary-${selectedDocument.id}.txt`;
      globalThis.document.body.appendChild(anchor);
      anchor.click();
      globalThis.document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setBlockNotesSaveState({ type: "success", message: "Review summary exported." });
    } catch {
      setBlockNotesSaveState({ type: "error", message: "Failed to export review summary." });
    } finally {
      setReviewSummaryDownloading(false);
    }
  };

  const renderInlineSegments = (
    segments: Array<{ type: 'equal' | 'delete' | 'insert'; text: string }> | undefined,
    mode: 'source' | 'target'
  ) => {
    if (!segments || segments.length === 0) {
      return null;
    }

    return segments.map((segment, index) => {
      if (segment.type === 'equal') {
        return <span key={`${segment.type}-${index}`}>{segment.text}</span>;
      }

      if (segment.type === 'delete' && mode === 'source') {
        return (
          <span key={`${segment.type}-${index}`} className="bg-[#ffe0de] text-[#7a1e1e] line-through">
            {segment.text}
          </span>
        );
      }

      if (segment.type === 'insert' && mode === 'target') {
        return (
          <span key={`${segment.type}-${index}`} className="bg-[#d9ecff] text-[#143d66] underline">
            {segment.text}
          </span>
        );
      }

      return null;
    });
  };

  return (
    <div className="flex-1 flex min-h-0 bg-[#fbf9f4]">
      <aside className="w-72 border-r border-[#DDD7CA] bg-[#F6F2E8] overflow-y-auto">
        <div className="p-4 space-y-3">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D]">Szűrők és kontextus</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Fájlnév / cím keresése"
            className="w-full px-2 py-2 border border-[#DDD7CA] text-xs bg-white"
          />
          <select value={caseFilter} onChange={(e) => setCaseFilter(e.target.value)} className="w-full px-2 py-2 border border-[#DDD7CA] text-xs bg-white">
            <option value="all">Minden ügy</option>
            {caseOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <select value={reviewFilter} onChange={(e) => setReviewFilter(e.target.value)} className="w-full px-2 py-2 border border-[#DDD7CA] text-xs bg-white">
            <option value="all">Minden review állapot</option>
            <option value="needs-review">Needs review</option>
            <option value="approved">Approved</option>
            <option value="generated">Generated</option>
          </select>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="w-full px-2 py-2 border border-[#DDD7CA] text-xs bg-white">
            <option value="all">Minden forrás</option>
            <option value="GENERATED">Generated</option>
            <option value="UPLOADED">Uploaded</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-[#514D45]">
            <input type="checkbox" checked={hasPreviousOnly} onChange={(e) => setHasPreviousOnly(e.target.checked)} />
            Csak előzményes dokumentumok
          </label>
          <label className="flex items-center gap-2 text-xs text-[#514D45]">
            <input type="checkbox" checked={recentOnly} onChange={(e) => setRecentOnly(e.target.checked)} />
            Csak friss változások (14 nap)
          </label>

          <div className="pt-2 border-t border-[#DDD7CA] space-y-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D]">Összevethető dokumentumok</p>
            <div className="space-y-2 max-h-[56vh] overflow-y-auto">
              {filteredDocuments.map((doc) => {
                const active = selectedDocument?.id === doc.id;
                const hasLineage = (familiesByDocId[doc.id]?.length || 0) > 1;
                return (
                  <button
                    key={`${doc.kind}-${doc.id}`}
                    onClick={() => setSelectedDocumentId(doc.id)}
                    className={`w-full text-left p-2 border ${active ? "border-[#C9A227] bg-[#FBF9F3]" : "border-[#DDD7CA] bg-white hover:bg-[#FBF9F3]"}`}
                  >
                    <p className="text-xs font-semibold text-[#1F2821] truncate">{doc.fileName}</p>
                    <p className="text-[10px] text-[#7B776D]">{doc.caseNumber} · {doc.source}</p>
                    <p className="text-[10px] text-[#7B776D]">{doc.status} · {hasLineage ? "van előzmény" : "nincs előzmény"}</p>
                  </button>
                );
              })}
              {!isLoading && filteredDocuments.length === 0 && (
                <p className="text-xs text-[#9C9890] border border-dashed border-[#DDD7CA] p-3">Nincs találat a jelenlegi szűrők mellett.</p>
              )}
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto border-r border-[#DDD7CA]">
        <div className="p-6 space-y-4">
          <header className="border border-[#DDD7CA] bg-white p-4">
            <h1 className="text-2xl font-serif text-[#1F2821]">Dokumentum-összevetés (segédeszköz)</h1>
            <p className="text-xs text-[#7B776D] mt-1">Verzió- és review-kontextus ellenőrzése valós dokumentum adatokból</p>
            <p className="text-[11px] text-[#514D45] mt-2">Ez a felület metaadat, lineage és workflow-kapcsolat összevetést ad. Módosított blokkoknál inline szövegkülönbség is megjelenik.</p>
          </header>

          {error && <div className="p-3 text-xs bg-[#fef2f2] border border-[#d4b8b8] text-[#8b3a3a]">{error}</div>}

          {isLoading ? (
            <div className="py-12 text-center text-xs text-[#7B776D]">Összevető board betöltése...</div>
          ) : !selectedDocument ? (
            <div className="py-12 text-center text-xs text-[#7B776D] border border-dashed border-[#DDD7CA]">Válassz dokumentumot az összevetéshez.</div>
          ) : (
            <>
              <section className="border border-[#DDD7CA] bg-white p-4">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <h2 className="text-sm font-semibold text-[#1F2821]">Összevetési munkafelület</h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedBaselineId(previousVersion?.id || null)}
                      disabled={!previousVersion}
                      className="px-2 py-1 border border-[#DDD7CA] text-xs hover:bg-[#FBF9F3] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Közvetlen előző
                    </button>
                    <select
                      value={selectedBaseline?.id || ""}
                      onChange={(e) => setSelectedBaselineId(e.target.value || null)}
                      className="px-2 py-1 border border-[#DDD7CA] text-xs"
                    >
                      <option value="">Nincs baseline</option>
                      {baselineCandidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.fileName} · {candidate.status} · {formatDateTime(candidate.updatedAt || candidate.createdAt)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mb-3 p-3 border border-[#EEE7D9] bg-[#FBF9F3] space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="text-xs font-semibold text-[#1F2821]">Review folyamat</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      {selectedDocument.kind === "contract" && (
                        <Link
                          href={`/cases/${selectedDocument.caseId}/review/${selectedDocument.id}`}
                          className="px-2 py-1 text-[10px] border border-[#DDD7CA] hover:bg-white"
                        >
                          Review megnyitása
                        </Link>
                      )}
                      <Link
                        href={`/cases/${selectedDocument.caseId}/documents`}
                        className="px-2 py-1 text-[10px] border border-[#DDD7CA] hover:bg-white"
                      >
                        Ügy dokumentumai
                      </Link>
                      <button
                        onClick={() => handleDownload(selectedDocument)}
                        className="px-2 py-1 text-[10px] border border-[#DDD7CA] hover:bg-white"
                      >
                        Aktuális dokumentum letöltése
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-[10px] text-[#514D45]">
                    <span className="px-2 py-0.5 border border-[#DDD7CA] bg-white">Dokumentum státusz: {selectedDocument.status}</span>
                    <span className="px-2 py-0.5 border border-[#DDD7CA] bg-white">Forrás: {selectedDocument.source}</span>
                    <span className="px-2 py-0.5 border border-[#DDD7CA] bg-white">Baseline: {selectedBaseline ? "kiválasztva" : "nincs"}</span>
                    <span className="px-2 py-0.5 border border-[#DDD7CA] bg-white">
                      Blokk compare: {selectedDocument.kind === "contract" && !!comparisonData ? "elérhető" : "nem elérhető"}
                    </span>
                    <span className="px-2 py-0.5 border border-[#DDD7CA] bg-white">Review feladatok: {reviewTaskCount}</span>
                  </div>

                  {!selectedBaseline ? (
                    <p className="text-[11px] text-[#7B776D]">Válassz baseline dokumentumot a pontosabb összevetéshez.</p>
                  ) : selectedDocument.kind !== "contract" ? (
                    <p className="text-[11px] text-[#7B776D]">Ehhez a dokumentumtípushoz jelenleg metaadat alapú összevetés érhető el.</p>
                  ) : comparisonData ? (
                    <p className="text-[11px] text-[#7B776D]">A blokk-szintű összevetés betöltve; folytatható a review.</p>
                  ) : (
                    <p className="text-[11px] text-[#7B776D]">A blokk-szintű összevetés betöltése folyamatban vagy nem érhető el.</p>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div className="p-3 border border-[#EEE7D9] bg-[#FBF9F3]">
                    <p className="text-[10px] uppercase text-[#7B776D]">Aktuális dokumentum</p>
                    <p className="text-sm font-semibold text-[#1F2821] mt-1 break-all">{selectedDocument.fileName}</p>
                    <ul className="mt-2 text-[11px] text-[#514D45] space-y-1">
                      <li>Ügy: {selectedDocument.caseNumber} · {selectedDocument.caseTitle}</li>
                      <li>Ügyfél: {selectedDocument.caseClientName || "—"}</li>
                      <li>Forrás: {selectedDocument.source}</li>
                      <li>Státusz: {selectedDocument.status}</li>
                      <li className="flex items-center gap-2">
                        Verzió: v{selectedDocument.revisionNumber || 1}
                        {selectedDocument.isCurrentRevision && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-[#d1e8d3] text-[#23472F] font-bold uppercase tracking-wide">Current</span>
                          )}
                          {selectedDocument.isFinalRevision && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-[#06190d] text-white font-bold uppercase tracking-wide">Final</span>
                          )}
                      </li>
                      <li>Frissítve: {formatDateTime(selectedDocument.updatedAt || selectedDocument.createdAt)}</li>
                    </ul>
                  </div>

                  <div className="p-3 border border-[#EEE7D9] bg-white">
                    <p className="text-[10px] uppercase text-[#7B776D]">Összevetési alapdokumentum</p>
                    {!selectedBaseline ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-[#9C9890]">Nincs kiválasztott baseline dokumentum.</p>
                        <p className="text-[11px] text-[#7B776D]">
                          Szöveg-diff megjelenítéshez válassz egy előző verziót (baseline), majd a blokk-szintű panelen jelennek meg a módosítások.
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-[#1F2821] mt-1 break-all">{selectedBaseline.fileName}</p>
                        <ul className="mt-2 text-[11px] text-[#514D45] space-y-1">
                          <li>Ügy: {selectedBaseline.caseNumber} · {selectedBaseline.caseTitle}</li>
                          <li>Forrás: {selectedBaseline.source}</li>
                          <li>Státusz: {selectedBaseline.status}</li>
                          <li className="flex items-center gap-2">
                            <span>Verzió: v{selectedBaseline.revisionNumber || 1}</span>
                            {selectedBaseline.isCurrentRevision && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-[#d1e8d3] text-[#23472F] font-bold uppercase tracking-wide">Current</span>
                            )}
                            {selectedBaseline.isFinalRevision && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-[#06190d] text-white font-bold uppercase tracking-wide">Final</span>
                            )}
                          </li>
                          <li>Frissítve: {formatDateTime(selectedBaseline.updatedAt || selectedBaseline.createdAt)}</li>
                          <li>{previousVersion?.id === selectedBaseline.id ? "Közvetlen előző verzió" : "Történeti verzió"}</li>
                        </ul>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-3 p-3 border border-[#EEE7D9] bg-[#F6F2E8] text-xs text-[#514D45] space-y-1">
                  {comparisonSummary.map((line, index) => (
                    <p key={`${line}-${index}`}>{line}</p>
                  ))}
                </div>

                <div className="mt-3 p-3 border border-[#EEE7D9] bg-white text-xs text-[#514D45] space-y-1">
                  <p className="font-semibold text-[#1F2821]">Szöveg-diff állapot</p>
                  {!selectedBaseline ? (
                    <p className="text-[#7B776D]">
                      Jelenleg csak metaadat összehasonlítás látszik. Szöveg-diffhez válassz baseline dokumentumot.
                    </p>
                  ) : selectedDocument.kind !== "contract" ? (
                    <p className="text-[#7B776D]">
                      A felület metaadat összehasonlítást mutat; blokk-szintű szöveg-diff jelenleg csak támogatott szerződés revíziók esetén érhető el.
                    </p>
                  ) : comparisonData ? (
                    <p>
                      Szöveg-diff betöltve. Módosított blokkok:{" "}
                      <span className="font-semibold">{comparisonData.summary.modified}</span>.
                    </p>
                  ) : (
                    <p className="text-[#7B776D]">
                      A rendszer összehasonlítási adatot tölt. Ha nem érhető el blokk-adat, a nézet metaadat összevetésre korlátozódik.
                    </p>
                  )}
                </div>
              </section>

              <section className="border border-[#DDD7CA] bg-white p-4">
                <h3 className="text-sm font-semibold text-[#1F2821] mb-2">Verzió- és lineage panel</h3>
                {lineage.length === 0 ? (
                  <p className="text-xs text-[#9C9890]">Nincs elérhető lineage adat.</p>
                ) : (
                  <div className="space-y-2">
                    {lineage.map((doc) => (
                      <div key={`${doc.kind}-${doc.id}`} className="p-2 border border-[#EEE7D9] flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-[#1F2821]">{doc.fileName}</p>
                          <p className="text-[10px] text-[#7B776D]">v{doc.revisionNumber || 1} · {doc.status} · {doc.source} · {formatDateTime(doc.updatedAt || doc.createdAt)}</p>
                          <p className="text-[10px] text-[#9C9890]">
                            {doc.kind === "contract" && doc.threadId ? `threadId: ${doc.threadId}` : "fallback lineage kulcs"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {doc.isCurrentRevision && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-[#d1e8d3] text-[#23472F]">Aktuális</span>
                          )}
                          {doc.isFinalRevision && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-[#06190d] text-white">Végleges</span>
                          )}
                          {doc.id !== selectedDocument.id && (
                            <button onClick={() => setSelectedBaselineId(doc.id)} className="px-2 py-1 text-[10px] border border-[#DDD7CA] hover:bg-[#FBF9F3]">
                              Alapdokumentum
                            </button>
                          )}
                          <Link href={`/cases/${doc.caseId}/documents`} className="px-2 py-1 text-[10px] border border-[#DDD7CA] hover:bg-[#FBF9F3]">Dokumentumok</Link>
                          {doc.kind === "contract" && (
                            <Link href={`/cases/${doc.caseId}/review/${doc.id}`} className="px-2 py-1 text-[10px] border border-[#DDD7CA] hover:bg-[#FBF9F3]">Review</Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="border border-[#DDD7CA] bg-white p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="text-sm font-semibold text-[#1F2821]">Blokk-szintű összehasonlítás</h3>
                  <div className="flex items-center gap-2">
                    {selectedDocument?.kind === "contract" && (
                      <button
                        onClick={handleDownloadReviewSummary}
                        disabled={reviewSummaryDownloading}
                        className="px-3 py-1.5 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3] disabled:opacity-50"
                      >
                        {reviewSummaryDownloading ? "Exportálás..." : "Review összefoglaló exportálása"}
                      </button>
                    )}
                    {selectedDocument?.kind === "contract" && (
                      <button
                        onClick={saveBlockNotes}
                        disabled={blockNotesSaving || comparisonLoading || reviewNotesLoading || !comparisonData}
                        className="px-3 py-1.5 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3] disabled:opacity-50"
                      >
                        {blockNotesSaving ? "Mentés..." : "Blokk megjegyzések mentése"}
                      </button>
                    )}
                    {selectedDocument?.kind === "contract" && (
                      <Link
                        href={`/cases/${selectedDocument.caseId}/review/${selectedDocument.id}`}
                        className="px-3 py-1.5 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]"
                      >
                        Review megnyitása
                      </Link>
                    )}
                  </div>
                </div>

                {blockNotesSaveState.type && (
                  <div
                    className={`mb-3 p-2 text-xs border ${
                      blockNotesSaveState.type === "success"
                        ? "bg-[#E2EDE5] border-[#A6C0AF] text-[#23472F]"
                        : "bg-[#FEF2F2] border-[#D4B8B8] text-[#8B3A3A]"
                    }`}
                  >
                    {blockNotesSaveState.message}
                  </div>
                )}

                {selectedDocument?.kind !== "contract" ? (
                  <p className="text-xs text-[#9C9890]">Blokk-szintű compare jelenleg csak ADASVETEL szerződés revíziókra támogatott.</p>
                ) : comparisonLoading ? (
                  <p className="text-xs text-[#7B776D]">Összehasonlítás betöltése...</p>
                ) : comparisonError ? (
                  <p className="text-xs text-[#8b3a3a]">{comparisonError}</p>
                ) : !comparisonData ? (
                  <p className="text-xs text-[#9C9890]">Nincs összehasonlítási adat.</p>
                ) : (
                  <>
                    <div className="mb-3 p-3 border border-[#EEE7D9] bg-[#FBF9F3] text-xs text-[#514D45]">
                      <p>
                        Forráskijelölés: <span className="font-semibold">{comparisonData.sourceSelection}</span> ·
                        Biztonság: <span className="font-semibold">{comparisonData.confidence}</span>
                      </p>
                      <p className="text-[11px] text-[#7B776D] mt-1">{comparisonData.confidenceReason}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="px-2 py-0.5 border border-[#DDD7CA]">Unchanged: {comparisonData.summary.unchanged}</span>
                        <span className="px-2 py-0.5 border border-[#DDD7CA]">Modified: {comparisonData.summary.modified}</span>
                        <span className="px-2 py-0.5 border border-[#DDD7CA]">Added: {comparisonData.summary.added}</span>
                        <span className="px-2 py-0.5 border border-[#DDD7CA]">Removed: {comparisonData.summary.removed}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {comparisonData.blocks.map((block) => {
                        const blockKey = buildBlockNoteKey(block);
                        const draft = blockNoteDrafts[blockKey] || { status: "OK" as BlockReviewStatus, title: "", note: "" };
                        const statusClass =
                          block.status === "unchanged"
                            ? "bg-[#e4f4e6] text-[#23472F]"
                            : block.status === "modified"
                              ? "bg-[#fff1c2] text-[#6a4b00]"
                              : block.status === "added"
                                ? "bg-[#d9ecff] text-[#143d66]"
                                : "bg-[#ffe0de] text-[#7a1e1e]";

                        return (
                          <div key={block.id} className="border border-[#EEE7D9]">
                            <div className="px-3 py-2 border-b border-[#EEE7D9] flex items-center justify-between">
                              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 ${statusClass}`}>{block.status}</span>
                              <span className="text-[10px] text-[#7B776D]">Match: {block.matchStrategy}</span>
                            </div>
                            <div className="grid md:grid-cols-2">
                              <div className="p-3 border-r border-[#EEE7D9] bg-[#FBF9F3]">
                                <p className="text-[10px] uppercase text-[#7B776D] mb-1">Forrás</p>
                                {block.sourceBlock ? (
                                  <>
                                    <p className="text-xs font-semibold text-[#1F2821]">{block.sourceBlock.title || "—"}</p>
                                    <p className="text-[11px] text-[#514D45] whitespace-pre-wrap mt-1">{block.sourceBlock.body || "—"}</p>
                                    {block.status === 'modified' && block.inlineDiff && (
                                      <p className="text-[11px] text-[#514D45] whitespace-pre-wrap mt-2 border-t border-[#EEE7D9] pt-2">
                                        {renderInlineSegments(block.inlineDiff.sourceSegments, 'source')}
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-xs text-[#9C9890]">Nincs forrásblokk</p>
                                )}
                              </div>
                              <div className="p-3 bg-white">
                                <p className="text-[10px] uppercase text-[#7B776D] mb-1">Revízió</p>
                                {block.targetBlock ? (
                                  <>
                                    <p className="text-xs font-semibold text-[#1F2821]">{block.targetBlock.title || "—"}</p>
                                    <p className="text-[11px] text-[#514D45] whitespace-pre-wrap mt-1">{block.targetBlock.body || "—"}</p>
                                    {block.status === 'modified' && block.inlineDiff && (
                                      <p className="text-[11px] text-[#514D45] whitespace-pre-wrap mt-2 border-t border-[#EEE7D9] pt-2">
                                        {renderInlineSegments(block.inlineDiff.targetSegments, 'target')}
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-xs text-[#9C9890]">Nincs revíziós blokk</p>
                                )}
                              </div>
                            </div>
                            <div className="px-3 py-3 border-t border-[#EEE7D9] bg-[#FDFBF6] space-y-2">
                              <div className="grid md:grid-cols-[180px_1fr] gap-2 items-center">
                                <label className="text-[10px] uppercase text-[#7B776D]">Review státusz</label>
                                <select
                                  value={draft.status}
                                  onChange={(e) => updateBlockDraft(blockKey, { status: e.target.value as BlockReviewStatus })}
                                  className="w-full border border-[#DDD7CA] bg-white px-2 py-1 text-xs"
                                >
                                  <option value="OK">OK</option>
                                  <option value="REVIEW_NEEDED">REVIEW_NEEDED</option>
                                  <option value="RISK_ISSUE">RISK_ISSUE</option>
                                </select>
                              </div>
                              <div className="grid md:grid-cols-[180px_1fr] gap-2 items-center">
                                <label className="text-[10px] uppercase text-[#7B776D]">Rövid cím</label>
                                <input
                                  value={draft.title}
                                  onChange={(e) => updateBlockDraft(blockKey, { title: e.target.value })}
                                  placeholder="Opcionális rövid cím"
                                  className="w-full border border-[#DDD7CA] bg-white px-2 py-1 text-xs"
                                />
                              </div>
                              <div className="grid md:grid-cols-[180px_1fr] gap-2">
                                <label className="text-[10px] uppercase text-[#7B776D] pt-1">Megjegyzés</label>
                                <textarea
                                  value={draft.note}
                                  onChange={(e) => updateBlockDraft(blockKey, { note: e.target.value })}
                                  rows={3}
                                  placeholder="Opcionális megjegyzés"
                                  className="w-full border border-[#DDD7CA] bg-white px-2 py-1 text-xs resize-y"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </main>

      <aside className="w-80 bg-white overflow-y-auto">
        <div className="p-4 space-y-4">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D]">Jobb oldali kontextus</h2>

          {!selectedDocument ? (
            <p className="text-xs text-[#9C9890]">Nincs kiválasztott dokumentum.</p>
          ) : (
            <>
              <div className="border border-[#DDD7CA] p-3 space-y-1">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D]">Linked case</p>
                <p className="text-sm font-semibold text-[#1F2821]">{selectedDocument.caseNumber}</p>
                <p className="text-xs text-[#514D45]">{selectedDocument.caseTitle}</p>
                <p className="text-[11px] text-[#7B776D]">Ügyfél: {selectedDocument.caseClientName || "—"}</p>
                <p className="text-[11px] text-[#7B776D]">Case státusz: {caseSummaries[selectedDocument.caseId]?.case.status || "—"}</p>
                <p className="text-[11px] text-[#7B776D]">Ügyfél: {caseSummaries[selectedDocument.caseId]?.case.clientName || "—"}</p>
                <Link href={`/cases/${selectedDocument.caseId}`} className="block mt-2 px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Ügy megnyitása</Link>
              </div>

              <div className="border border-[#DDD7CA] p-3 space-y-1">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D]">Review context</p>
                <p className="text-xs text-[#514D45]">Dokumentum státusz: {selectedDocument.status}</p>
                <p className="text-xs text-[#514D45]">Review-jellegű feladatok az ügyön: {reviewTaskCount}</p>
                {selectedDocument.kind === "contract" ? (
                  <Link href={`/cases/${selectedDocument.caseId}/review/${selectedDocument.id}`} className="block mt-2 px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">
                    Review megnyitása
                  </Link>
                ) : (
                  <p className="text-[11px] text-[#9C9890] mt-1">Ehhez a rekordhoz közvetlen review route nem áll rendelkezésre.</p>
                )}
              </div>

              <div className="border border-[#DDD7CA] p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D]">Kapcsolódó műveletek</p>
                <button
                  onClick={() => handleDownload(selectedDocument)}
                  className="w-full px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]"
                >
                  Aktuális dokumentum letöltése
                </button>
                {selectedBaseline && (
                  <button
                    onClick={() => handleDownload(selectedBaseline)}
                    className="w-full px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]"
                  >
                    Alapdokumentum letöltése
                  </button>
                )}
                <Link href={`/cases/${selectedDocument.caseId}/documents`} className="block px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">
                  Dokumentumok megnyitása
                </Link>
              </div>

              <div className="border border-[#DDD7CA] p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D]">Recent activity</p>
                {timelineEvents.length === 0 ? (
                  <p className="text-xs text-[#9C9890]">Nincs kapcsolt aktivitás.</p>
                ) : (
                  timelineEvents.map((event) => (
                    <div key={event.id} className="border border-[#EEE7D9] p-2">
                      <p className="text-xs font-semibold text-[#1F2821]">{event.description}</p>
                      <p className="text-[10px] text-[#7B776D]">{formatDateTime(event.createdAt)}</p>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

