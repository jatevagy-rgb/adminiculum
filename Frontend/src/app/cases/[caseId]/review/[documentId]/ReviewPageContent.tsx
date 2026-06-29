/* eslint-disable react/no-unescaped-entities */
"use client";

import { useState, use, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getCaseContracts, getCases, getCaseTimeline, approveDocument, rejectDocument,
  submitDocumentForReview, downloadContract, uploadGeneratedContractToSharePoint,
  finalizeContractGeneration, backToReview, rejectApproval, getContractTimeline,
  createTask, getCommunications, createCommunication, getCaseCollaborators, getUsers,
  getClauseLibraryReviewGuidance, getReviewNotes, saveReviewNotes,
  type CaseContractListItem, type TimelineEventItem, type CommunicationItem,
  type CaseCollaborator, type User, type ReviewGuidanceResult, type ReviewNotesResult,
} from "@/lib/api";
import { getPreference } from "@/lib/preferences";
import { useUiPack } from "@/lib/uiPack";
import { WorkspaceLayout, Panel, SectionBlock } from "@/components/ui/WorkspacePrimitives";

type ReviewDecision = "approved" | "needs_changes" | "send_back_to_generation" | "rejected";

type ReviewPageProps = { params: Promise<{ caseId: string; documentId: string }> };

export default function ReviewPageContent({ params }: ReviewPageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [uiPack] = useUiPack();
  const isSignal = uiPack === "signal_tiles_console";

  // ── State ──────────────────────────────────────────────────────────────────
  const [reviewDocument, setReviewDocument] = useState<CaseContractListItem | null>(null);
  const [contracts, setContracts] = useState<CaseContractListItem[]>([]);
  const [caseRecord, setCaseRecord] = useState<{ id: string; caseNumber: string; title: string; clientName: string; matterType: string; status: string; sharePointFolderPath?: string } | null>(null);
  const [timeline, setTimeline] = useState<TimelineEventItem[]>([]);
  const [reviewNotesData, setReviewNotesData] = useState<ReviewNotesResult | null>(null);
  const [reviewNotesLoading, setReviewNotesLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDecision, setSelectedDecision] = useState<ReviewDecision | null>(null);
  const [decisionRationale, setDecisionRationale] = useState("");
  const [isDeciding, setIsDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ type: "success" | "error" | null; message: string }>({ type: null, message: "" });
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUploadingToSP, setIsUploadingToSP] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isBackToReview, setIsBackToReview] = useState(false);
  const [isRejectingApproval, setIsRejectingApproval] = useState(false);
  const [showRejectPanel, setShowRejectPanel] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showTaskSuggestion, setShowTaskSuggestion] = useState(false);
  const [suggestedTask, setSuggestedTask] = useState<{ decision: ReviewDecision; title: string; description: string; type: string; priority: string } | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [taskCreated, setTaskCreated] = useState(false);
  const [collaboratorCandidates, setCollaboratorCandidates] = useState<CaseCollaborator[]>([]);
  const [userCandidates, setUserCandidates] = useState<User[]>([]);
  const [selectedTaskAssignee, setSelectedTaskAssignee] = useState("");
  const [taskAssigneeLoading, setTaskAssigneeLoading] = useState(false);
  const [documentNotes, setDocumentNotes] = useState<CommunicationItem[]>([]);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteSubject, setNewNoteSubject] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [clauseGuidance, setClauseGuidance] = useState<ReviewGuidanceResult | null>(null);
  const [clauseGuidanceLoading, setClauseGuidanceLoading] = useState(false);

  // ── Derived ───────────────────────────────────────────────────────────────
  const displayCaseId = caseRecord?.caseNumber || resolvedParams.caseId;
  const displayMatterName = (caseRecord?.title && caseRecord.title !== "null" && caseRecord.title !== "null - null") ? caseRecord.title : "Ügynév nem érhető el";
  const displayClient = (caseRecord?.clientName && caseRecord.clientName !== "null") ? caseRecord.clientName : "";
  const canonicalCaseId = caseRecord?.id || resolvedParams.caseId;
  const sourceTitleMap = new Map<string, string>();
  contracts.forEach((c) => { if (c?.id) sourceTitleMap.set(c.id, c.title || c.fileName || c.templateName || c.id); });
  const revisionSourceTitle = reviewDocument?.parentRevisionId ? sourceTitleMap.get(reviewDocument.parentRevisionId) || reviewDocument.parentRevisionId : null;
  const isEditedRevision = Boolean(reviewDocument?.parentRevisionId);
  const checklistItems = contracts.map((c) => ({ id: c.id, label: c.title || c.templateName || "Document", status: c.isFinalRevision ? "FINAL" : c.status }));
  const completedChecklist = checklistItems.filter((i) => i.status === "FINAL" || i.status === "APPROVED").length;
  const getReviewOutcome = () => {
    if (!reviewDocument) return { status: "UNKNOWN", label: "Unknown", variant: "default" as const };
    if (reviewDocument.status === "APPROVED" || reviewDocument.isFinalRevision) return { status: "APPROVED", label: "APPROVED — READY FOR FINALIZATION", variant: "success" as const };
    if (reviewDocument.status === "REJECTED") return { status: "REJECTED", label: "REJECTED — CHANGES REQUIRED", variant: "error" as const };
    if (reviewDocument.status === "IN_REVIEW" || reviewDocument.status === "SUBMITTED") return { status: "IN_REVIEW", label: "IN REVIEW — PENDING DECISION", variant: "warning" as const };
    return { status: reviewDocument.status, label: `${reviewDocument.status} — REVIEW REQUIRED`, variant: "default" as const };
  };
  const outcome = getReviewOutcome();
  const isPendingDecision = reviewDocument?.status === "GENERATED" || reviewDocument?.status === "IN_REVIEW";
  const isApproved = reviewDocument?.status === "APPROVED";

  // ── Load functions ───────────────────────────────────────────────────────
  const loadDocumentNotes = useCallback(async () => {
    if (!resolvedParams.documentId) return;
    try { const r = await getCommunications({ documentId: resolvedParams.documentId, type: "NOTE", limit: 50 }); setDocumentNotes(r.communications || []); } catch { /* silent */ }
  }, [resolvedParams.documentId]);

  const handleAddNote = async () => {
    if (!newNoteContent.trim()) return;
    setIsAddingNote(true); setNoteError(null);
    try { await createCommunication({ type: "NOTE", subject: newNoteSubject.trim() || "Belső megjegyzés", content: newNoteContent.trim(), documentId: resolvedParams.documentId, caseId: canonicalCaseId }); setNewNoteContent(""); setNewNoteSubject(""); await loadDocumentNotes(); }
    catch { setNoteError("Megjegyzés mentése sikertelen."); }
    finally { setIsAddingNote(false); }
  };

  const loadReviewNotesData = useCallback(async () => {
    if (!resolvedParams.documentId) return;
    setReviewNotesLoading(true);
    try { const r = await getReviewNotes(resolvedParams.documentId); setReviewNotesData(r); } catch { setReviewNotesData(null); }
    finally { setReviewNotesLoading(false); }
  }, [resolvedParams.documentId]);

  const loadDocument = useCallback(async () => {
    if (!caseRecord?.id) return;
    try {
      setIsLoading(true);
      const [contractsData, timelineData] = await Promise.all([
        getCaseContracts(caseRecord.id).catch(() => []),
        getContractTimeline(resolvedParams.documentId).then((r) => r.events ?? []).catch(async () => getCaseTimeline(caseRecord.id).catch(() => [])),
      ]);
      const doc = contractsData.find((item) => item.id === resolvedParams.documentId) || null;
      setReviewDocument(doc); setContracts(contractsData); setTimeline(timelineData as TimelineEventItem[]);
      if (doc?.revisionNote) setDecisionRationale(doc.revisionNote);
    } catch { setReviewDocument(null); }
    finally { setIsLoading(false); }
  }, [caseRecord?.id, resolvedParams.documentId]);

  useEffect(() => { if (resolvedParams.documentId) loadReviewNotesData(); }, [resolvedParams.documentId, loadReviewNotesData]);
  useEffect(() => { if (resolvedParams.documentId) loadDocumentNotes(); }, [resolvedParams.documentId, loadDocumentNotes]);
  useEffect(() => { if (caseRecord?.id) loadDocument(); }, [caseRecord?.id, loadDocument]);

  useEffect(() => {
    const fetchCaseRecord = async () => {
      try {
        const r = await getCases(1, 200);
        const record = r.data.find((item) => item.caseNumber === resolvedParams.caseId || item.id === resolvedParams.caseId);
        if (record) setCaseRecord({ id: record.id, caseNumber: record.caseNumber, title: record.title, clientName: record.clientName, matterType: record.matterType, status: record.status });
      } catch { /* fall back */ }
    };
    fetchCaseRecord();
  }, [resolvedParams.caseId]);

  useEffect(() => {
    const loadClauseGuidance = async () => {
      if (!resolvedParams.documentId) return;
      setClauseGuidanceLoading(true);
      try { const g = await getClauseLibraryReviewGuidance({ documentId: resolvedParams.documentId, contractType: "ADASVETEL" }); setClauseGuidance(g); }
      catch { setClauseGuidance(null); }
      finally { setClauseGuidanceLoading(false); }
    };
    loadClauseGuidance();
  }, [resolvedParams.documentId]);

  useEffect(() => {
    if (!showTaskSuggestion || !caseRecord?.id) return;
    const loadAssignees = async () => {
      setTaskAssigneeLoading(true);
      try {
        const [collabs, users] = await Promise.all([getCaseCollaborators(caseRecord.id).catch(() => []), getUsers().catch(() => [])]);
        const collabUserIds = new Set(collabs.map((c: CaseCollaborator) => c.userId));
        const nonCollaborators = users.filter((u: User) => !collabUserIds.has(u.id));
        setCollaboratorCandidates(collabs);
        setUserCandidates(nonCollaborators);
      } catch { setCollaboratorCandidates([]); setUserCandidates([]); }
      finally { setTaskAssigneeLoading(false); }
    };
    loadAssignees();
  }, [showTaskSuggestion, caseRecord?.id]);

  const prepareTaskSuggestion = (decision: ReviewDecision) => {
    const docTitle = reviewDocument?.title || reviewDocument?.templateName || "dokumentum";
    switch (decision) {
      case "needs_changes": return { decision, title: `Dokumentum javítása: ${docTitle}`, description: "A dokumentum áttekintése során módosítások kerültek javasolásra.", type: "CONTRACT_DRAFTING", priority: "HIGH" };
      case "send_back_to_generation": return { decision, title: `Generálás folytatása: ${docTitle}`, description: "A dokumentum visszaküldésre került a generálási munkafolyamatba.", type: "CONTRACT_DRAFTING", priority: "MEDIUM" };
      case "rejected": return { decision, title: `Elutasított dokumentum átdolgozása: ${docTitle}`, description: "A dokumentum elutasításra került. Teljes átdolgozás szükséges.", type: "CONTRACT_DRAFTING", priority: "URGENT" };
      default: return null;
    }
  };

  // ── Decision handler ──────────────────────────────────────────────────────
  const executeDecision = async () => {
    if (!selectedDecision) { setDecisionError("Kérlek válassz döntést!"); return; }
    if (selectedDecision === "rejected" && !decisionRationale.trim()) { setDecisionError("Elutasításhoz meg kell adni az indoklást!"); return; }
    if (selectedDecision === "needs_changes" && !decisionRationale.trim()) { /* advisory */ }
    setIsDeciding(true); setDecisionError(null);
    try {
      let result: { success: boolean; message?: string; error?: string } = { success: false };
      switch (selectedDecision) {
        case "approved":
          result = await approveDocument(resolvedParams.documentId, decisionRationale);
          if (result.success) {
            await saveReviewNotes({ generationId: resolvedParams.documentId, overallStatus: "APPROVED_FOR_NEXT_STEP", overallNote: decisionRationale } as Parameters<typeof saveReviewNotes>[0]).catch(() => {});
            setActionResult({ type: "success", message: "Review decision: Approved" });
            setTimeout(() => router.push(`/cases/${canonicalCaseId}`), 1500);
          }
          break;
        case "needs_changes":
        case "send_back_to_generation":
          result = await submitDocumentForReview(resolvedParams.documentId);
          if (result.success) {
            setActionResult({ type: "success", message: selectedDecision === "send_back_to_generation" ? "Document sent back to generation workflow" : "Document returned for revision" });
            if (getPreference("reviewTaskSuggestions")) { const s = prepareTaskSuggestion(selectedDecision); if (s) { setSuggestedTask(s); setShowTaskSuggestion(true); } }
          }
          break;
        case "rejected":
          result = await rejectDocument(resolvedParams.documentId, decisionRationale);
          if (result.success) {
            await saveReviewNotes({ generationId: resolvedParams.documentId, overallStatus: "FLAGGED", overallNote: decisionRationale } as Parameters<typeof saveReviewNotes>[0]).catch(() => {});
            setActionResult({ type: "success", message: "Rejection recorded with reason" });
            if (getPreference("reviewTaskSuggestions")) { const s = prepareTaskSuggestion(selectedDecision); if (s) { setSuggestedTask(s); setShowTaskSuggestion(true); } }
          }
          break;
      }
      if (!result.success) { setDecisionError(result.message || result.error || "Decision failed"); setActionResult({ type: "error", message: result.message || result.error || "Decision failed" }); }
    } catch { setDecisionError("Decision execution failed"); setActionResult({ type: "error", message: "Decision execution failed" }); }
    finally { setIsDeciding(false); }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try { const blob = await downloadContract(resolvedParams.documentId); const url = URL.createObjectURL(blob); const a = globalThis.document.createElement("a"); a.href = url; a.download = reviewDocument?.fileName || "document.docx"; globalThis.document.body.appendChild(a); a.click(); globalThis.document.body.removeChild(a); URL.revokeObjectURL(url); } catch { /* silent */ }
    finally { setIsDownloading(false); }
  };

  const handleSharePointUpload = async () => {
    if (!reviewDocument) return;
    setIsUploadingToSP(true);
    try { const r = await uploadGeneratedContractToSharePoint(reviewDocument.id); if (r.success) { setActionResult({ type: "success", message: "Uploaded to SharePoint" }); loadDocument(); } else setActionResult({ type: "error", message: "SharePoint upload failed" }); }
    catch { setActionResult({ type: "error", message: "SharePoint upload failed" }); }
    finally { setIsUploadingToSP(false); }
  };

  const handleFinalize = async () => {
    if (!reviewDocument) return;
    setIsFinalizing(true);
    try { const r = await finalizeContractGeneration(reviewDocument.id); if (r.success) { setActionResult({ type: "success", message: "Document marked as final" }); loadDocument(); } else setActionResult({ type: "error", message: r.error || "Failed to finalize" }); }
    catch { setActionResult({ type: "error", message: "Failed to finalize document" }); }
    finally { setIsFinalizing(false); }
  };

  const handleBackToReview = async () => {
    if (!reviewDocument) return;
    setIsBackToReview(true); setActionResult({ type: null, message: "" });
    try { const r = await backToReview(reviewDocument.id); if (r.success) { setActionResult({ type: "success", message: "Document sent back to review" }); loadDocument(); } else setActionResult({ type: "error", message: r.error || "Failed to send back to review" }); }
    catch { setActionResult({ type: "error", message: "Failed to send back to review" }); }
    finally { setIsBackToReview(false); }
  };

  const handleRejectApproval = async () => {
    if (!reviewDocument || !rejectReason.trim()) { setActionResult({ type: "error", message: "Please provide a reason for rejecting approval" }); return; }
    setIsRejectingApproval(true); setActionResult({ type: null, message: "" });
    try { const r = await rejectApproval(reviewDocument.id, rejectReason); if (r.success) { setActionResult({ type: "success", message: "Approval rejected - document returned to generated state" }); setRejectReason(""); loadDocument(); } else setActionResult({ type: "error", message: r.error || "Failed to reject approval" }); }
    catch { setActionResult({ type: "error", message: "Failed to reject approval" }); }
    finally { setIsRejectingApproval(false); }
  };

  const handleCreateSuggestedTask = async () => {
    if (!suggestedTask || !caseRecord?.id) return;
    setIsCreatingTask(true);
    try { 
      await createTask({ caseId: caseRecord.id, title: suggestedTask.title, description: suggestedTask.description, type: suggestedTask.type, priority: suggestedTask.priority, ...(selectedTaskAssignee && { assignedTo: selectedTaskAssignee }) }); 
      setTaskCreated(true); 
      setShowTaskSuggestion(false); 
    } catch (err) { 
      console.error('[ReviewPageContent] Task creation failed:', err);
      /* silent - UI already dismissed the suggestion panel */
    }
    finally { setIsCreatingTask(false); }
  };

  const dismissTaskSuggestion = () => { setShowTaskSuggestion(false); setSuggestedTask(null); setTaskCreated(false); setSelectedTaskAssignee(""); };
  const resetDecisionPanel = () => { setSelectedDecision(null); setDecisionRationale(""); setDecisionError(null); };

  // ── Palette ──────────────────────────────────────────────────────────────
  const pal = isSignal ? {
    bg: "bg-[#0B1220]", bgAlt: "bg-[#0F172A]", bgHover: "hover:bg-[#1E293B]",
    bgSection: "bg-[#111C2E]", text: "text-[#D6E2F2]", textMuted: "text-[#94A3B8]", textDark: "text-[#CBD5E1]",
    border: "border-[#1E293B]", borderLight: "border-[#1E293B]/60",
    accent: "text-cyan-400", accentBg: "bg-cyan-900/40 text-cyan-200",
    success: "bg-emerald-900/40 text-emerald-300", warning: "bg-amber-900/40 text-amber-300",
    danger: "bg-red-900/40 text-red-300",
    label: "text-slate-400", card: "bg-[#111C2E] border-[#1E293B]",
  } : {
    bg: "bg-[#F5F7FB]", bgAlt: "bg-white", bgHover: "hover:bg-[#F0F4FF]",
    bgSection: "bg-white", text: "text-[#1E293B]", textMuted: "text-[#64748B]", textDark: "text-[#334155]",
    border: "border-[#E2E8F0]", borderLight: "border-[#F1F5F9]",
    accent: "text-[#6366F1]", accentBg: "bg-indigo-50 text-indigo-700",
    success: "bg-emerald-50 text-emerald-800", warning: "bg-amber-50 text-amber-800",
    danger: "bg-red-50 text-red-700",
    label: "text-slate-500", card: "bg-white border-[#E2E8F0]",
  };

  // ── Left rail ─────────────────────────────────────────────────────────────
  const leftRail = (
    <div className={`flex flex-col h-full ${isSignal ? "bg-[#0F172A]" : "bg-white"}`}>
      <div className={`p-4 border-b ${pal.border}`}>
        <p className={`text-[10px] uppercase tracking-[0.2em] ${pal.label} mb-2`}>Ügykörnyezet</p>
        <p className={`text-[11px] font-semibold leading-tight ${pal.text}`}>{displayMatterName || "Ügynév nem érhető el"}</p>
        <p className={`text-[10px] ${pal.label} mt-1`}>{displayCaseId}</p>
        {displayClient && <p className={`text-[10px] ${pal.label} mt-1`}>{displayClient}</p>}
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {[
          { label: "Ügy áttekintése", href: `/cases/${canonicalCaseId}` },
          { label: "Dokumentumtár", href: `/cases/${canonicalCaseId}/documents` },
          { label: "Dokumentum-workspace", href: `/documents/compare?caseId=${canonicalCaseId}` },
          { label: "Verzió-összevetés", href: `/documents/compare?caseId=${encodeURIComponent(canonicalCaseId)}&documentId=${encodeURIComponent(resolvedParams.documentId)}` },
          { label: "Peres munkatér", href: `/litigation-workspace?caseId=${encodeURIComponent(canonicalCaseId)}&documentId=${encodeURIComponent(resolvedParams.documentId)}` },
        ].map((item) => (
          <button key={item.href} onClick={() => router.push(item.href)} className={`w-full text-left px-3 py-2 text-[11px] font-medium rounded transition-colors ${pal.textDark} ${pal.bgHover}`}>{item.label}</button>
        ))}
      </nav>
      <div className={`p-3 border-t ${pal.border}`}>
        <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${pal.label} mb-1`}>Aktív dokumentum</p>
        <p className={`text-[11px] font-semibold truncate ${pal.text}`}>{isLoading ? "..." : reviewDocument?.fileName || "Dokumentum review"}</p>
      </div>
    </div>
  );

  // ── Right rail ────────────────────────────────────────────────────────────
  const rightRail = (
    <div className={`flex flex-col h-full overflow-y-auto ${isSignal ? "bg-[#0F172A]" : "bg-white"}`}>
      <div className="p-5 space-y-5">
        <SectionBlock title="Dokumentum" subtitle={reviewDocument?.templateName || "Template"} uiPack={uiPack}>
          <div className={`space-y-3 text-[11px] ${pal.text}`}>
            <div className="flex justify-between"><span className={pal.label}>Fájl</span><span className="font-medium truncate max-w-[160px]">{reviewDocument?.fileName || "—"}</span></div>
            <div className="flex justify-between"><span className={pal.label}>Verzió</span><span className="font-medium">{reviewDocument?.revisionNumber ? `v${reviewDocument.revisionNumber}` : "v1"}{reviewDocument?.isCurrentRevision ? " (Current)" : ""}</span></div>
            <div className="flex justify-between"><span className={pal.label}>Generálva</span><span className="font-medium">{reviewDocument?.generatedAt ? new Date(reviewDocument.generatedAt).toLocaleDateString("hu-HU") : "—"}</span></div>
            <div className="flex justify-between"><span className={pal.label}>Státusz</span><span className="font-bold">{reviewDocument?.status || "—"}</span></div>
            {isEditedRevision && <p className="text-[10px] text-indigo-400">Szerkesztett verzió</p>}
            {revisionSourceTitle && <p className={`text-[10px] ${pal.label}`}>Forrás: {revisionSourceTitle}</p>}
            <div className="flex items-center gap-1.5 mt-1">
              {reviewDocument?.spItemId ? (<><span className="material-symbols-outlined text-sm text-emerald-400">cloud_done</span><span className="text-emerald-400 text-[10px] font-bold">SharePoint szinkronizálva</span></>) : (<><span className="material-symbols-outlined text-sm text-red-400">cloud_off</span><span className="text-red-400 text-[10px] font-bold">Nincs szinkronizálva</span></>)}
            </div>
          </div>
        </SectionBlock>
        <SectionBlock title="Munkafolyamat" uiPack={uiPack}>
          <div className="space-y-2">
            <button onClick={() => router.push(`/documents/compare?caseId=${encodeURIComponent(canonicalCaseId)}&documentId=${encodeURIComponent(resolvedParams.documentId)}`)} className={`w-full px-3 py-2 text-[11px] font-bold border transition-colors ${isSignal ? "border-[#1E293B] text-[#94A3B8] hover:bg-[#1E293B]" : "border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]"}`}>Verzió-összevetés</button>
            <button onClick={() => router.push(`/cases/${canonicalCaseId}/review/${resolvedParams.documentId}/edit`)} className={`w-full px-3 py-2 text-[11px] font-bold border transition-colors ${isSignal ? "border-[#1E293B] text-[#94A3B8] hover:bg-[#1E293B]" : "border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]"}`}>Szerkesztés</button>
          </div>
        </SectionBlock>
        <SectionBlock title="Előzmények" uiPack={uiPack}>
          <div className="relative space-y-4 pl-4">
            <div className={`absolute left-[3px] top-1 bottom-2 w-[1px] ${isSignal ? "bg-[#1E293B]" : "bg-[#E2E8F0]"}`} />
            {(timeline.length > 0 ? timeline.slice(0, 5) : [{ id: "gen", description: "Dokumentum generálva", createdAt: reviewDocument?.generatedAt } as TimelineEventItem]).map((event, idx) => {
              const isPrimary = idx === 0;
              return (
                <div key={event.id ?? idx} className={`relative ${isPrimary ? "" : "opacity-60"}`}>
                  <span className={`absolute -left-[21px] top-1 w-1.5 h-1.5 rounded-full ${isSignal ? "bg-cyan-400" : "bg-indigo-400"}`} />
                  <p className={`text-[10px] font-semibold leading-tight ${pal.text}`}>{event.description || (event as { typeLabel?: string }).typeLabel || event.type || "Esemény"}</p>
                  <p className={`text-[9px] ${pal.label}`}>{event.createdAt ? new Date(event.createdAt).toLocaleString("hu-HU") : ""}</p>
                </div>
              );
            })}
          </div>
        </SectionBlock>
      </div>
    </div>
  );

  // ── Center canvas ─────────────────────────────────────────────────────────
  const centerCanvas = (
    <div className={`flex-1 overflow-y-auto p-${isSignal ? "6" : "8"} space-y-${isSignal ? "5" : "6"}`}>
      {actionResult.type && (
        <div className={`p-4 border rounded-lg ${actionResult.type === "success" ? (isSignal ? "bg-emerald-900/40 border-emerald-700 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-800") : (isSignal ? "bg-red-900/40 border-red-700 text-red-300" : "bg-red-50 border-red-200 text-red-700")}`}>
          <p className="text-sm font-medium">{actionResult.message}</p>
        </div>
      )}

      {/* Outcome banner */}
      <div className={`rounded-xl border px-${isSignal ? "5" : "8"} py-${isSignal ? "4" : "5"} ${outcome.variant === "success" ? (isSignal ? "bg-emerald-900/30 border-emerald-700" : "bg-emerald-50 border-emerald-200") : outcome.variant === "error" ? (isSignal ? "bg-red-900/30 border-red-700" : "bg-red-50 border-red-200") : outcome.variant === "warning" ? (isSignal ? "bg-amber-900/30 border-amber-700" : "bg-amber-50 border-amber-200") : (isSignal ? "bg-[#111C2E] border-[#1E293B]" : "bg-white border-[#E2E8F0]")}`}>
        <div className="flex items-center gap-4">
          <span className={`material-symbols-outlined text-2xl ${isSignal ? "text-cyan-400" : "text-indigo-500"}`} style={{ fontVariationSettings: "'FILL' 1" }}>
            {outcome.variant === "success" ? "verified" : outcome.variant === "error" ? "cancel" : "pending"}
          </span>
          <div className="flex-1 min-w-0">
            <h1 className={`text-lg font-semibold ${isSignal ? "text-[#F1F5F9]" : "text-[#1E293B]"}`}>{outcome.label}</h1>
            <p className={`text-[10px] ${pal.label}`}>Review workflow status{reviewDocument?.generatedAt && ` · ${new Date(reviewDocument.generatedAt).toLocaleDateString("hu-HU")}`}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={handleDownload} disabled={isDownloading} className={`px-3 py-1.5 text-[11px] font-bold border transition-colors ${isSignal ? "border-[#1E293B] text-[#94A3B8] hover:bg-[#1E293B]" : "border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]"} disabled:opacity-40`}>{isDownloading ? "..." : "DOCX"}</button>
            {reviewDocument?.spWebUrl ? (<button onClick={() => window.open(reviewDocument.spWebUrl!, "_blank")} className={`px-3 py-1.5 text-[11px] font-bold border transition-colors ${isSignal ? "border-[#1E293B] text-[#94A3B8] hover:bg-[#1E293B]" : "border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]"}`}>SP</button>) : (<button onClick={handleSharePointUpload} disabled={isUploadingToSP} className={`px-3 py-1.5 text-[11px] font-bold border transition-colors ${isSignal ? "border-[#1E293B] text-[#94A3B8] hover:bg-[#1E293B]" : "border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]"} disabled:opacity-40`}>{isUploadingToSP ? "..." : "Sync"}</button>)}
          </div>
        </div>
        {(isEditedRevision || reviewDocument?.revisionNumber) && (
          <div className="flex gap-2 mt-3">
            {isEditedRevision && <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${isSignal ? "bg-indigo-900/40 text-indigo-300" : "bg-indigo-50 text-indigo-700 border border-indigo-200"}`}>Szerkesztett verzió</span>}
            {reviewDocument?.revisionNumber && <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${isSignal ? "bg-[#1E293B] text-[#94A3B8]" : "bg-slate-100 text-slate-600"}`}>Revision {reviewDocument.revisionNumber}</span>}
            {revisionSourceTitle && <span className={`text-[10px] px-2 py-0.5 rounded ${isSignal ? "text-slate-500" : "text-slate-400"}`}>Forrás: {revisionSourceTitle}</span>}
          </div>
        )}
      </div>

      {/* Finalization strip */}
      {isApproved && (
        <Panel uiPack={uiPack} className={`p-${isSignal ? "4" : "5"}`}>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div><p className={`text-sm font-semibold ${pal.text}`}>Dokumentum jóváhagyva</p><p className={`text-[11px] ${pal.label}`}>Készen áll a véglegesítésre</p></div>
            <div className="flex gap-2 flex-wrap">
              {!reviewDocument?.isFinalRevision && <button onClick={handleFinalize} disabled={isFinalizing} className={`px-4 py-2 text-[11px] font-bold transition-colors ${isSignal ? "bg-emerald-700 text-emerald-200 hover:bg-emerald-600 disabled:opacity-40" : "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"}`}>{isFinalizing ? "..." : reviewDocument?.isFinalRevision ? "Véglegesítve" : "Véglegesítés"}</button>}
              <button onClick={handleBackToReview} disabled={isBackToReview} className={`px-4 py-2 text-[11px] font-bold border transition-colors ${isSignal ? "border-[#1E293B] text-[#94A3B8] hover:bg-[#1E293B]" : "border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]"} disabled:opacity-40`}>{isBackToReview ? "..." : "Vissza review-ra"}</button>
              {showRejectPanel ? (<><button onClick={() => { setShowRejectPanel(false); setRejectReason(""); }} className={`px-3 py-2 text-[11px] font-bold border transition-colors ${isSignal ? "border-red-800 text-red-400 hover:bg-red-900/40" : "border-red-200 text-red-600 hover:bg-red-50"}`}>Mégse</button><button onClick={handleRejectApproval} disabled={isRejectingApproval || !rejectReason.trim()} className={`px-3 py-2 text-[11px] font-bold transition-colors ${isSignal ? "bg-red-800 text-red-200 hover:bg-red-700 disabled:opacity-40" : "bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"}`}>{isRejectingApproval ? "..." : "Elutasítás megerősítése"}</button></>) : (<button onClick={() => setShowRejectPanel(true)} className={`px-4 py-2 text-[11px] font-bold border transition-colors ${isSignal ? "border-red-800 text-red-400 hover:bg-red-900/40" : "border-red-200 text-red-600 hover:bg-red-50"}`}>Jóváhagyás elutasítása</button>)}
            </div>
          </div>
          {showRejectPanel && (
            <div className={`mt-4 p-4 rounded-lg ${isSignal ? "bg-red-900/30 border border-red-800" : "bg-red-50 border border-red-200"}`}>
              <p className={`text-[11px] font-bold mb-2 ${isSignal ? "text-red-300" : "text-red-700"}`}>Elutasítás indoka (kötelező)</p>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Indok..." className={`w-full h-16 border rounded-lg px-3 py-2 text-sm resize-none ${isSignal ? "bg-[#0B1220] border-red-800 text-[#D6E2F2]" : "bg-white border-red-200 text-[#1E293B]"}`} />
            </div>
          )}
        </Panel>
      )}

      {/* Review rationale */}
      <Panel uiPack={uiPack} className={`${isSignal ? "p-5" : "p-6"}`}>
        <SectionBlock title="Review értékelés" subtitle={reviewDocument?.status || "Státusz betöltése..."} uiPack={uiPack}>
          {(reviewNotesData?.overallNote || reviewDocument?.revisionNote || decisionRationale) ? (
            <blockquote className={`text-sm leading-relaxed border-l-2 ${isSignal ? "border-cyan-700 text-[#D6E2F2] pl-4" : "border-indigo-300 text-[#334155] pl-4"}`}>
              "{reviewNotesData?.overallNote || reviewDocument?.revisionNote || decisionRationale}"
            </blockquote>
          ) : (
            <p className={`text-sm italic ${pal.label}`}>Nincs rögzített review megjegyzés.</p>
          )}
        </SectionBlock>
      </Panel>

      {/* Clause guidance */}
      {clauseGuidance && (
        <Panel uiPack={uiPack} className={`${isSignal ? "p-5" : "p-6"}`}>
          <SectionBlock title="Záradék elemzés" uiPack={uiPack}>
            <div className="grid gap-3 text-[11px] grid-cols-3">
              {(["detected", "missing", "suggested"] as const).map((cat) => (
                <div key={cat} className={`rounded-lg p-3 ${isSignal ? "bg-[#0B1220] border border-[#1E293B]" : "bg-slate-50 border border-[#E2E8F0]"}`}>
                  <p className={`text-[10px] uppercase tracking-widest font-bold mb-2 ${isSignal ? "text-slate-500" : "text-slate-400"}`}>{cat}</p>
                  {clauseGuidance[cat]?.length ? (<ul className="space-y-1">{clauseGuidance[cat].slice(0, 4).map((item) => (<li key={item.clauseId} className={`${cat === "missing" ? (isSignal ? "text-red-400" : "text-red-600") : pal.text} truncate`}>• {item.title}</li>))}</ul>) : <p className={`italic ${pal.label}`}>—</p>}
                </div>
              ))}
            </div>
          </SectionBlock>
        </Panel>
      )}

      {/* Package checklist */}
      <Panel uiPack={uiPack} className={`${isSignal ? "p-5" : "p-6"}`}>
        <SectionBlock title="Dokumentumcsomag" subtitle={`${completedChecklist} / ${contracts.length} kész`} uiPack={uiPack}>
          {checklistItems.length > 0 ? (
            <ul className="space-y-2">{checklistItems.map((item) => (<li key={item.id} className={`flex items-center justify-between text-[11px] py-1.5 border-b ${isSignal ? "border-[#1E293B]/60" : "border-[#F1F5F9]"}`}><span className={pal.textDark}>{item.label}</span><span className={`font-bold text-[10px] ${item.status === "FINAL" ? (isSignal ? "text-emerald-400" : "text-emerald-600") : pal.label}`}>{item.status === "FINAL" ? "✓ KÉSZ" : item.status}</span></li>))}</ul>
          ) : <p className={`text-[11px] italic ${pal.label}`}>Nincs dokumentum a csomagban.</p>}
        </SectionBlock>
      </Panel>

      {/* Decision Panel */}
      {isPendingDecision && (
        <Panel uiPack={uiPack} className={`${isSignal ? "p-5" : "p-6"}`}>
          <SectionBlock title="Review döntés" subtitle="Válaszd ki a megfelelő döntést és rögzítsd" uiPack={uiPack}>
            <div className={`grid gap-2 mb-4 ${isSignal ? "grid-cols-2" : "grid-cols-4"}`}>
              {([
                { key: "approved", label: "Jóváhagyva", icon: "check_circle", color: "emerald" },
                { key: "needs_changes", label: "Módosítás szükséges", icon: "edit", color: "amber" },
                { key: "send_back_to_generation", label: "Vissza generáláshoz", icon: "replay", color: "slate" },
                { key: "rejected", label: "Elutasítva", icon: "cancel", color: "red" },
              ] as const).map(({ key, label, icon, color }) => (
                <button key={key} onClick={() => { setSelectedDecision(key); setDecisionError(null); }} disabled={isDeciding}
                  className={`p-3 border rounded-lg text-left transition-all ${selectedDecision === key ? (color === "emerald" ? (isSignal ? "border-emerald-500 bg-emerald-900/50 text-emerald-300" : "border-emerald-500 bg-emerald-50 text-emerald-800") : color === "amber" ? (isSignal ? "border-amber-500 bg-amber-900/50 text-amber-300" : "border-amber-500 bg-amber-50 text-amber-800") : color === "red" ? (isSignal ? "border-red-500 bg-red-900/50 text-red-300" : "border-red-500 bg-red-50 text-red-800") : (isSignal ? "border-slate-500 bg-[#1E293B] text-[#CBD5E1]" : "border-slate-400 bg-slate-50 text-slate-700")) : (isSignal ? "border-[#1E293B] bg-[#0B1220] text-[#94A3B8] hover:bg-[#1E293B]" : "border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F8FAFC]")} disabled:opacity-50`}>
                  <span className={`material-symbols-outlined text-lg block mb-1 ${isSignal ? "text-cyan-400" : "text-indigo-500"}`}>{icon}</span>
                  <span className="text-[11px] font-bold">{label}</span>
                </button>
              ))}
            </div>
            <div className="mb-4">
              <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${pal.label}`}>Indoklás {selectedDecision === "rejected" ? "* (kötelező)" : selectedDecision === "needs_changes" ? " (javasolt)" : ""}</label>
              <textarea value={decisionRationale} onChange={(e) => setDecisionRationale(e.target.value)} placeholder="Írd be az indoklást..."
                className={`w-full h-20 border rounded-lg px-3 py-2 text-sm resize-none ${isSignal ? "bg-[#0B1220] border-[#1E293B] text-[#D6E2F2] focus:border-cyan-700" : "bg-white border-[#E2E8F0] text-[#1E293B] focus:border-indigo-400"} focus:outline-none`} />
            </div>
            {decisionError && (<div className={`mb-4 p-3 rounded-lg text-[11px] ${isSignal ? "bg-red-900/40 border border-red-800 text-red-300" : "bg-red-50 border border-red-200 text-red-700"}`}>{decisionError}</div>)}
            <div className="flex gap-2">
              <button onClick={executeDecision} disabled={!selectedDecision || isDeciding} className={`px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${isSignal ? "bg-cyan-700 text-cyan-200 hover:bg-cyan-600 disabled:opacity-40" : "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"} disabled:cursor-not-allowed`}>{isDeciding ? "Feldolgozás..." : "Döntés rögzítése"}</button>
              {selectedDecision && <button onClick={resetDecisionPanel} disabled={isDeciding} className={`px-4 py-2.5 text-[11px] font-bold border uppercase tracking-wider transition-colors ${isSignal ? "border-[#1E293B] text-[#94A3B8] hover:bg-[#1E293B]" : "border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]"} disabled:opacity-40`}>Mégse</button>}
            </div>
          </SectionBlock>
        </Panel>
      )}

      {/* Task suggestion */}
      {showTaskSuggestion && suggestedTask && (
        <Panel uiPack={uiPack} className={`p-${isSignal ? "5" : "6"} ${isSignal ? "border-emerald-700" : "border-emerald-200"}`}>
          <div className="flex items-start gap-4">
            <span className={`material-symbols-outlined text-2xl ${isSignal ? "text-emerald-400" : "text-emerald-600"}`} style={{ fontVariationSettings: "'FILL' 1" }}>task_alt</span>
            <div className="flex-1 min-w-0">
              <h3 className={`text-sm font-semibold mb-1 ${pal.text}`}>Következő lépés: Feladat létrehozása</h3>
              <p className={`text-[11px] mb-3 ${pal.label}`}>Az így létrehozott feladat az aktuális ügyhöz kapcsolódik.</p>
              <div className={`rounded-lg p-3 mb-3 ${isSignal ? "bg-[#0B1220] border border-[#1E293B]" : "bg-slate-50 border border-[#E2E8F0]"}`}>
                <p className={`text-[11px] font-bold mb-1 ${suggestedTask.priority === "URGENT" ? "text-red-400" : suggestedTask.priority === "HIGH" ? "text-amber-400" : pal.label}`}>{suggestedTask.priority} · {suggestedTask.type}</p>
                <p className={`text-sm font-semibold ${pal.text}`}>{suggestedTask.title}</p>
                <p className={`text-[11px] mt-1 ${pal.label}`}>{suggestedTask.description}</p>
              </div>
              <div className="mb-3">
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${pal.label}`}>Felelős</label>
                <select value={selectedTaskAssignee} onChange={(e) => setSelectedTaskAssignee(e.target.value)} className={`w-full border rounded-lg px-3 py-2 text-[11px] ${isSignal ? "bg-[#0B1220] border-[#1E293B] text-[#D6E2F2]" : "bg-white border-[#E2E8F0] text-[#1E293B]"}`}>
                  <option value="">— Nincs kiválasztva —</option>
                  {collaboratorCandidates.length > 0 && (<optgroup label="Résztvevők">{collaboratorCandidates.map((c) => <option key={c.id} value={c.id}>{(c as CaseCollaborator & { name?: string }).name || c.id}</option>)}</optgroup>)}
                  {userCandidates.length > 0 && (<optgroup label="Munkatársak">{userCandidates.map((u) => <option key={u.id} value={u.id}>{u.name || u.email || u.id}</option>)}</optgroup>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreateSuggestedTask} disabled={isCreatingTask || taskCreated} className={`px-4 py-2 text-[11px] font-bold transition-colors ${isSignal ? "bg-emerald-800 text-emerald-200 hover:bg-emerald-700 disabled:opacity-40" : "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"}`}>{isCreatingTask ? "..." : taskCreated ? "✓ Létrehozva" : "Feladat létrehozása"}</button>
                <button onClick={dismissTaskSuggestion} disabled={isCreatingTask} className={`px-4 py-2 text-[11px] font-bold border transition-colors ${isSignal ? "border-[#1E293B] text-[#94A3B8] hover:bg-[#1E293B]" : "border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]"}`}>Mégse</button>
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* Notes */}
      <Panel uiPack={uiPack} className={`${isSignal ? "p-5" : "p-6"}`}>
        <SectionBlock title="Belső megjegyzések" subtitle={`${documentNotes.length} megjegyzés`} uiPack={uiPack}
          actions={<button onClick={() => setShowNotes(!showNotes)} className={`text-[10px] font-bold uppercase tracking-wider ${pal.label} hover:${pal.text} transition-colors`}>{showNotes ? "Elrejtés ▲" : "Megnyitás ▼"}</button>}
          className={isSignal ? "text-[#94A3B8]" : "text-[#64748B]"}>
          {showNotes && (
            <>
              <div className={`rounded-lg p-4 mb-3 ${isSignal ? "bg-[#0B1220] border border-[#1E293B]" : "bg-slate-50 border border-[#E2E8F0]"}`}>
                <input type="text" value={newNoteSubject} onChange={(e) => setNewNoteSubject(e.target.value)} placeholder="Tárgy (opcionális)" className={`w-full border rounded px-3 py-1.5 text-[11px] mb-2 ${isSignal ? "bg-[#0B1220] border-[#1E293B] text-[#D6E2F2]" : "bg-white border-[#E2E8F0] text-[#1E293B]"}`} />
                <textarea value={newNoteContent} onChange={(e) => setNewNoteContent(e.target.value)} placeholder="Belső megjegyzés..." rows={3} className={`w-full border rounded px-3 py-2 text-[11px] resize-none ${isSignal ? "bg-[#0B1220] border-[#1E293B] text-[#D6E2F2]" : "bg-white border-[#E2E8F0] text-[#1E293B]"}`} />
                {noteError && <p className={`text-[10px] mt-1 ${isSignal ? "text-red-400" : "text-red-600"}`}>{noteError}</p>}
                <div className="flex justify-end mt-2"><button onClick={handleAddNote} disabled={isAddingNote || !newNoteContent.trim()} className={`px-3 py-1.5 text-[11px] font-bold transition-colors ${isSignal ? "bg-cyan-800 text-cyan-200 hover:bg-cyan-700 disabled:opacity-40" : "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"}`}>{isAddingNote ? "..." : "Hozzáadás"}</button></div>
              </div>
              {documentNotes.length === 0 ? (<p className={`text-[11px] italic text-center py-3 ${pal.label}`}>Még nincs megjegyzés.</p>) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">{documentNotes.map((note) => (
                  <div key={note.id} className={`rounded-lg p-3 border-l-2 ${isSignal ? "bg-[#0B1220] border-cyan-800" : "bg-white border-indigo-200"}`}>
                    <div className="flex justify-between items-start mb-1"><p className={`text-[11px] font-semibold ${pal.text}`}>{note.subject || "Belső megjegyzés"}</p><p className={`text-[10px] ${pal.label}`}>{note.createdAt ? new Date(note.createdAt).toLocaleDateString("hu-HU") : ""}</p></div>
                    <p className={`text-[11px] ${pal.label}`}>{note.contentPreview}</p>
                    {note.createdBy && <p className={`text-[10px] mt-1 ${pal.label}`}>— {note.createdBy.name}</p>}
                  </div>
                ))}</div>
              )}
            </>
          )}
        </SectionBlock>
      </Panel>

      {/* Navigation footer */}
      <div className={`flex justify-between items-center pt-4 border-t ${pal.border}`}>
        <button onClick={() => router.push(`/cases/${canonicalCaseId}`)} className={`flex items-center gap-2 text-[12px] font-bold ${pal.label} hover:${pal.text} transition-colors`}><span className="material-symbols-outlined text-base">arrow_back</span> Case áttekintés</button>
        <button onClick={() => router.push(`/cases/${canonicalCaseId}/documents`)} className={`flex items-center gap-2 text-[12px] font-bold ${pal.label} hover:${pal.text} transition-colors`}>Dokumentum lista <span className="material-symbols-outlined text-base">description</span></button>
      </div>
    </div>
  );

  // ── Final render ──────────────────────────────────────────────────────────
  return (
    <div className={`flex-1 flex min-h-0 ${pal.bg} review-surface`}>
      <aside className={`w-56 shrink-0 border-r ${pal.border} ${pal.bgAlt} flex flex-col overflow-hidden`}>
        {leftRail}
      </aside>
      <main className="min-w-0 flex-1 flex flex-col overflow-hidden">
        {centerCanvas}
      </main>
      <aside className={`w-72 shrink-0 border-l ${pal.border} ${pal.bgAlt} flex flex-col overflow-hidden`}>
        {rightRail}
      </aside>
    </div>
  );
}
