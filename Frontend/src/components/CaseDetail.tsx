"use client";

import { useState, use, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getCaseContracts, getCaseDocuments, getCases, getCaseTimeline, downloadContract, downloadDocument, deleteDocument, uploadCaseDocument, getCaseAnonymousDocuments, getCaseTasks, startTask, submitTask, completeTask, blockTask, unblockTask, getWorkflowGraph, getCaseWorkflowHistory, getUsers, assignCase, updateCaseStatus, updateCase, getCommunications, createCommunication, getCaseCollaborators, addCaseCollaborator, removeCaseCollaborator, getCaseWorkflowSummary, getCaseWorkItems, getCaseActivity, getWorkflowAgenda, getCaseResponsibility, createDocumentSourceTask, createCommunicationSourceTask, ApiError, type DocumentItem, type CaseWorkflowSummary, type CaseWorkItemsResponse, type CaseWorkItem, type CaseActivityResponse, type CaseActivityItem, type CommunicationItem, type TimelineEventItem, type AnonymousDocumentListItem, type ImportAIResponseResult, type TaskItem, type WorkflowGraph, type WorkflowNode, type CaseWorkflowHistoryItem, type User, type CaseCollaborator, type WorkflowAgendaResponse, type WorkflowDeadlineItem, type CaseResponsibilityResponse } from "@/lib/api";
import { AnonymizeModal, type AnonymizeResult } from "@/components/documents/AnonymizeModal";
import { RehydrateModal } from "@/components/documents/RehydrateModal";
import { CaseWorkspaceNav } from "@/components/cases/CaseWorkspaceNav";
import { CaseWorkspaceOverview } from "@/components/cases/CaseWorkspaceOverview";
import { CaseMatterDossierPanel } from "@/components/litigation/CaseMatterDossierPanel";
import { CaseIntakeReadinessPanel } from "@/components/intake/CaseIntakeReadinessPanel";

type CaseDocument = {
  id: string;
  name: string;
  type: string;
  date: string;
  createdAt?: string;
  updatedAt?: string;
  status: string;
  version?: string;
  linkedTimelineId?: string;
};

type CaseStoryEventType = 'timeline' | 'document' | 'generation' | 'task' | 'deadline' | 'communication';

type CaseStoryEvent = {
  id: string;
  dedupeKey: string;
  type: CaseStoryEventType;
  title: string;
  timestamp: string;
  description?: string;
  sourceLabel: string;
  link?: string;
  linkLabel?: string;
  sourcePriority: number;
  isNote?: boolean;
};

type CaseDetailProps = {
  params: Promise<{ caseId: string }>;
};

const documentTypeLabel: Record<string, string> = {
  CLIENT_INPUT: "Ügyféltől érkezett",
  DRAFT: "Munkapéldány",
  MODIFIED_WORKING_COPY: "Módosított munkapéldány",
  FINAL: "Végleges irat",
  EVIDENCE: "Bizonyíték",
};

const mapDocumentItemToCaseDocument = (doc: DocumentItem): CaseDocument => ({
  id: doc.id,
  name: doc.fileName,
  type: documentTypeLabel[String(doc.documentType || "").toUpperCase()] || doc.documentType,
  date: new Date(doc.createdAt).toLocaleDateString('hu-HU'),
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
  status: doc.spWebUrl ? 'Ready' : 'Review Needed',
  version: doc.version || undefined,
});

const statusChip: Record<string, string> = {
  "Client Input": "bg-[var(--adm-surface)] text-[var(--adm-text-muted)] border-[var(--adm-border)]",
  Draft: "bg-[#EAF0E7] text-[var(--adm-green-800)] border-[#BFD1C3]",
  "In Review": "bg-[var(--adm-surface)] text-[var(--adm-ochre-500)] border-[var(--adm-border)]",
  Approved: "bg-[#E2EDE5] text-[var(--adm-green-800)] border-[#A6C0AF]",
  ARCHIVED: "bg-[var(--adm-surface)] text-[var(--adm-text-muted)] border-[var(--adm-border)]",
};

const docStatusBadge: Record<string, string> = {
  'Ready': 'bg-[#E2EDE5] text-[var(--adm-green-800)] border-[#A6C0AF]',
  'Review Needed': 'bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]',
  'Archived': 'bg-[var(--adm-surface)] text-[var(--adm-text-muted)] border-[var(--adm-border)]',
};

const TASK_STATUS_LABELS: Record<string, string> = {
  TODO: "Teendő",
  ASSIGNED: "Teendő",
  PENDING: "Teendő",
  IN_PROGRESS: "Folyamatban",
  SUBMITTED: "Beküldve",
  COMPLETED: "Kész",
  APPROVED: "Kész",
  REJECTED: "Elutasítva",
  DECLINED: "Elutasítva",
  BLOCKED: "Blokkolva",
  CANCELLED: "Törölve",
};

const TASK_PRIORITY_LABELS: Record<string, string> = {
  HIGH: "Magas",
  MEDIUM: "Közepes",
  LOW: "Alacsony",
};

const CASE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Piszkozat",
  ACTIVE: "Aktív",
  IN_REVIEW: "Review alatt",
  SUBMITTED: "Beküldve",
  APPROVED: "Jóváhagyva",
  ARCHIVED: "Archivált",
};

const WORKFLOW_STATUS_LABELS: Record<string, string> = {
  TODO: "Teendő",
  ASSIGNED: "Teendő",
  PENDING: "Teendő",
  IN_PROGRESS: "Folyamatban",
  SUBMITTED: "Beküldve",
  REVIEW_NEEDED: "Review alatt",
  COMPLETED: "Kész",
  APPROVED: "Jóváhagyva",
  FINALIZED: "Véglegesítve",
  REJECTED: "Visszaküldve",
  BLOCKED: "Blokkolva",
  CANCELLED: "Törölve",
  ACTIVE: "Aktív",
  ARCHIVED: "Archivált",
  DRAFT: "Piszkozat",
};

const getTaskStatusLabel = (status?: string | null): string => {
  const key = String(status || "").toUpperCase();
  return TASK_STATUS_LABELS[key] || status || "Ismeretlen";
};

const getTaskPriorityLabel = (priority?: string | null): string => {
  const key = String(priority || "").toUpperCase();
  return TASK_PRIORITY_LABELS[key] || priority || "Nincs";
};

const getCaseStatusLabel = (status?: string | null): string => {
  const key = String(status || "").toUpperCase();
  return CASE_STATUS_LABELS[key] || "Ismeretlen állapot";
};

const getWorkflowStatusLabel = (status?: string | null): string => {
  const key = String(status || "").toUpperCase();
  return WORKFLOW_STATUS_LABELS[key] || "Ismeretlen állapot";
};

const getTaskDueDateTone = (dueDate?: string | null): string => {
  if (!dueDate) return "bg-[var(--adm-surface)] text-[var(--adm-text-muted)] border-[var(--adm-border)]";
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return "bg-[var(--adm-surface)] text-[var(--adm-text-muted)] border-[var(--adm-border)]";
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;
  const dueTs = due.getTime();
  if (dueTs < todayStart) return "bg-[#FEF2F2] text-[#8b3a3a] border-[#d4b8b8]";
  if (dueTs < tomorrowStart) return "bg-[var(--adm-surface)] text-[var(--adm-ochre-500)] border-[#f9c74f]";
  return "bg-[#E2EDE5] text-[var(--adm-green-800)] border-[#A6C0AF]";
};

const WORKFLOW_ACTION_LABELS: Record<string, string> = {
  OVERDUE_TASK: "Lejárt feladat",
  HANDOFF_REVIEW: "Átadás ellenőrzése",
  DOCUMENT_REVIEW: "Dokumentum-review",
  DUE_SOON_TASK: "Közeli feladat",
  UPCOMING_DEADLINE: "Közelgő határidő",
  BLOCKED_ITEM: "Blokkolt tétel",
  OPEN_TASK: "Nyitott feladat",
};

const DEADLINE_URGENCY_LABELS: Record<string, string> = {
  OVERDUE: "Lejárt",
  TODAY: "Ma esedékes",
  TOMORROW: "Holnap",
  THIS_WEEK: "Ezen a héten",
  SOON: "Hamarosan",
  LATER: "Későbbi",
};

const WORK_ITEM_CATEGORY_LABELS: Record<string, string> = {
  OPEN: "Nyitott",
  IN_PROGRESS: "Folyamatban",
  BLOCKED: "Blokkolva",
  WAITING: "Várakozik",
  REVIEW: "Review",
  HANDOFF: "Átadás",
  COMPLETED: "Kész",
};

const WORK_ITEM_TYPE_LABELS: Record<string, string> = {
  TASK: "Feladat",
  REVIEW: "Review",
  HANDOFF: "Átadás",
  DOCUMENT: "Dokumentum",
  COMMUNICATION: "Kommunikáció",
};

const CASE_ACTIVITY_KIND_LABELS: Record<string, string> = {
  TASK: "Feladat",
  DOCUMENT: "Dokumentum",
  COMMUNICATION: "Kommunikáció",
  TIMELINE: "Ügyesemény",
};

const WORK_ITEM_URGENCY_LABELS: Record<string, string> = {
  OVERDUE: "Lejárt",
  TODAY: "Ma",
  SOON: "Közelgő",
  LATER: "Későbbi",
  NONE: "Nincs határidő",
};

const formatWorkflowDate = (value?: string | null): string => {
  if (!value) return "Nincs határidő";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nincs határidő";
  return date.toLocaleString("hu-HU", { dateStyle: "medium", timeStyle: "short" });
};

const formatMinutes = (minutes?: number | null): string => {
  if (!minutes) return "0 óra";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} óra ${rest} perc` : `${hours} óra`;
};

export function CaseDetail({ params }: CaseDetailProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [documents, setDocuments] = useState<CaseDocument[]>([]);
  const [showAllDocs, setShowAllDocs] = useState(false);
  const [highlightedTimelineId, setHighlightedTimelineId] = useState<string | null>(null);
  const [generatedContracts, setGeneratedContracts] = useState<{
    id: string;
    title: string;
    fileName: string;
    generatedAt: string;
    revisionNumber?: number;
    parentRevisionId?: string | null;
  }[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEventItem[]>([]);
  const [communications, setCommunications] = useState<CommunicationItem[]>([]);
  const [workflowSummary, setWorkflowSummary] = useState<CaseWorkflowSummary | null>(null);
  const [workItems, setWorkItems] = useState<CaseWorkItemsResponse | null>(null);
  const [caseActivity, setCaseActivity] = useState<CaseActivityResponse | null>(null);
  const [caseAgenda, setCaseAgenda] = useState<WorkflowAgendaResponse | null>(null);
  const [caseResponsibility, setCaseResponsibility] = useState<CaseResponsibilityResponse | null>(null);
  const [isLoadingWorkflowSummary, setIsLoadingWorkflowSummary] = useState(false);
  const [workflowSummaryError, setWorkflowSummaryError] = useState<string | null>(null);
  const [workItemsError, setWorkItemsError] = useState<string | null>(null);
  const [workItemFilter, setWorkItemFilter] = useState<'all' | 'mine' | 'overdue' | 'soon' | 'review' | 'handoff' | 'blocked'>('all');
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [caseRecord, setCaseRecord] = useState<{
    id: string;
    caseNumber: string;
    title: string | null;
    clientName: string | null;
    matterType: string | null;
    status: string;
    clientRole: string | null;
    deadline: string | null;
  } | null>(null);

  // Deadline editing state
  const [isEditingDeadline, setIsEditingDeadline] = useState(false);
  const [deadlineInput, setDeadlineInput] = useState('');
  const [isSavingDeadline, setIsSavingDeadline] = useState(false);
  const [isEditingClientRole, setIsEditingClientRole] = useState(false);
  const [clientRoleInput, setClientRoleInput] = useState('');

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Document deletion state
  const [deleteCandidate, setDeleteCandidate] = useState<CaseDocument | null>(null);
  const [isDeletingDocument, setIsDeletingDocument] = useState(false);
  const [deleteDocumentError, setDeleteDocumentError] = useState<string | null>(null);
  const [deleteDocumentSuccess, setDeleteDocumentSuccess] = useState<string | null>(null);

  // Anonymization state
  const [anonymizeDoc, setAnonymizeDoc] = useState<{ id: string; title: string; templateName?: string; revisionNumber?: number; status: string } | null>(null);
  const [anonymizeModalOpen, setAnonymizeModalOpen] = useState(false);
  const [lastAnonymizeResult, setLastAnonymizeResult] = useState<AnonymizeResult | null>(null);
  const [anonymousDocuments, setAnonymousDocuments] = useState<AnonymousDocumentListItem[]>([]);

  // Rehydration state
  const [rehydrateDoc, setRehydrateDoc] = useState<{ id: string; name: string } | null>(null);
  const [rehydrateModalOpen, setRehydrateModalOpen] = useState(false);

  // Tasks state
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [actionTaskId, setActionTaskId] = useState<string | null>(null);

  // Assignment: load assigned lawyer and available users
  const loadAssignment = useCallback(async () => {
    if (!caseRecord) return;
    try {
      const caseData = await getCases(1, 200);
      const currentCase = caseData.data.find(c => c.id === caseRecord.id);
      if (currentCase?.assignedLawyer) {
        setAssignedLawyer(currentCase.assignedLawyer);
      }
    } catch (err) {
      console.error('Failed to load assignment:', err);
    }
  }, [caseRecord]);

  useEffect(() => {
    if (caseRecord?.id) {
      loadAssignment();
    }
  }, [caseRecord?.id, loadAssignment]);

  // Load available users for assignment dropdown
  const loadAvailableUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const users = await getUsers();
      setAvailableUsers(users);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  const handleAssignLawyer = async (userId: string) => {
    if (!caseRecord?.id) return;
    setIsAssigning(true);
    try {
      await assignCase(caseRecord.id, { userId, role: 'LAWYER' });
      const selectedUser = availableUsers.find(u => u.id === userId);
      if (selectedUser) {
        setAssignedLawyer({ id: selectedUser.id, name: selectedUser.name, email: selectedUser.email, role: selectedUser.role });
      }
      setShowAssignDropdown(false);
    } catch (err) {
      console.error('Failed to assign lawyer:', err);
    } finally {
      setIsAssigning(false);
    }
  };

  // Load collaborators for this case
  const loadCollaborators = useCallback(async () => {
    if (!caseRecord) return;
    setIsLoadingCollaborators(true);
    try {
      const data = await getCaseCollaborators(caseRecord.id);
      setCollaborators(data);
    } catch (err) {
      console.error('Failed to load collaborators:', err);
    } finally {
      setIsLoadingCollaborators(false);
    }
  }, [caseRecord]);

  useEffect(() => {
    if (caseRecord?.id) {
      loadCollaborators();
    }
  }, [caseRecord?.id, loadCollaborators]);

  const handleAddCollaborator = async (userId: string) => {
    if (!caseRecord?.id) return;
    setIsAddingCollaborator(true);
    try {
      const newCollaborator = await addCaseCollaborator(caseRecord.id, userId, collaboratorRole);
      setCollaborators(prev => [...prev, newCollaborator]);
      setShowCollaboratorDropdown(false);
      setCollaboratorRole('COLLABORATOR');
    } catch (err) {
      console.error('Failed to add collaborator:', err);
    } finally {
      setIsAddingCollaborator(false);
    }
  };

  const handleRemoveCollaborator = async (collaboratorId: string) => {
    if (!caseRecord?.id) return;
    try {
      await removeCaseCollaborator(caseRecord.id, collaboratorId);
      setCollaborators(prev => prev.filter(c => c.id !== collaboratorId));
    } catch (err) {
      console.error('Failed to remove collaborator:', err);
    }
  };

  // Deadline editing
  const startEditingDeadline = () => {
    if (!caseRecord) return;
    // Format for HTML date input: YYYY-MM-DD
    const deadlineValue = caseRecord.deadline
      ? new Date(caseRecord.deadline).toISOString().split('T')[0]
      : '';
    setDeadlineInput(deadlineValue);
    setIsEditingDeadline(true);
  };

  const handleSaveDeadline = async () => {
    if (!caseRecord?.id) return;
    setIsSavingDeadline(true);
    try {
      const newDeadline = deadlineInput ? new Date(deadlineInput).toISOString() : null;
      await updateCase(caseRecord.id, { deadline: newDeadline });
      setCaseRecord(prev => prev ? { ...prev, deadline: newDeadline } : null);
      setIsEditingDeadline(false);
    } catch (err) {
      console.error('Failed to update deadline:', err);
    } finally {
      setIsSavingDeadline(false);
    }
  };

  const handleCancelDeadline = () => {
    setIsEditingDeadline(false);
    setDeadlineInput('');
  };

  const handleEditClientRole = () => {
    setClientRoleInput(caseRecord?.clientRole || '');
    setIsEditingClientRole(true);
  };

  const handleSaveClientRole = async () => {
    if (!caseRecord?.id) return;
    try {
      const newRole = clientRoleInput || null;
      await updateCase(caseRecord.id, { clientRole: newRole });
      setCaseRecord(prev => prev ? { ...prev, clientRole: newRole } : null);
      setIsEditingClientRole(false);
    } catch (err) {
      console.error('Failed to update clientRole:', err);
    }
  };

  const handleCancelClientRole = () => {
    setIsEditingClientRole(false);
    setClientRoleInput('');
  };

  // Handle case completion/archive
  const handleCompleteCase = async () => {
    if (!caseRecord?.id) return;
    setIsCompleting(true);
    try {
      await updateCaseStatus(caseRecord.id, 'ARCHIVED', 'Case completed and archived');
      setCaseRecord(prev => prev ? { ...prev, status: 'ARCHIVED' } : null);
      setShowCompleteConfirm(false);
    } catch (err) {
      console.error('Failed to complete case:', err);
    } finally {
      setIsCompleting(false);
    }
  };

  const isArchived = caseRecord?.status === 'ARCHIVED';

  // Workflow state
  const [workflowGraph, setWorkflowGraph] = useState<WorkflowGraph | null>(null);
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [workflowHistory, setWorkflowHistory] = useState<CaseWorkflowHistoryItem[]>([]);
  const [isLoadingWorkflowHistory, setIsLoadingWorkflowHistory] = useState(false);
  const [users, setUsers] = useState<User[]>([]);

  // Case note state
  const [caseNotes, setCaseNotes] = useState<CommunicationItem[]>([]);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Handle workflow status transition
  const handleWorkflowTransition = async (newStatus: string) => {
    if (!caseRecord?.id || isTransitioning) return;
    setIsTransitioning(true);
    try {
      await updateCaseStatus(caseRecord.id, newStatus, `Transitioned to ${newStatus}`);
      // Update local case record status
      setCaseRecord(prev => prev ? { ...prev, status: newStatus } : null);
      // Reload workflow graph to reflect new state
      await loadWorkflow();
    } catch (err) {
      console.error('Failed to transition workflow:', err);
      // Error is logged but not surfaced to user - this is a minor gap
      // The workflow will be re-fetched on next load, showing actual backend state
    } finally {
      setIsTransitioning(false);
    }
  };

  // Assignment state
  const [assignedLawyer, setAssignedLawyer] = useState<{ id: string; name: string; email: string; role: string } | null>(null);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  // Collaborators state
  const [collaborators, setCollaborators] = useState<CaseCollaborator[]>([]);
  const [isLoadingCollaborators, setIsLoadingCollaborators] = useState(false);
  const [showCollaboratorDropdown, setShowCollaboratorDropdown] = useState(false);
  const [isAddingCollaborator, setIsAddingCollaborator] = useState(false);
  const [collaboratorRole, setCollaboratorRole] = useState('COLLABORATOR');

  // Case completion state
  const [isCompleting, setIsCompleting] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const canonicalCaseId = caseRecord?.id || resolvedParams.caseId;
  const workplanTasks = tasks.filter((task) => String(task.description || '').includes('Munkaterv / review-útvonal'));

  const loadBackendData = useCallback(async () => {
    try {
      // Use caseRecord.id (CUID) for fetching related data if available.
      // effectiveCaseId is the resolved CUID - use it for ALL API calls to avoid
      // caseId='1' (caseNumber) being passed to endpoints expecting CUIDs.
      const effectiveCaseId = caseRecord?.id || resolvedParams.caseId;

      // Skip data-fetching API calls until we have a resolved CUID.
      // If caseRecord is null and resolvedParams.caseId is a caseNumber (not a CUID),
      // those calls would 404. The caseList lookup below populates caseRecord, and
      // the useEffect will re-trigger once caseRecord changes.
      if (!caseRecord) {
        // Still fetch the case list to resolve the CUID
        const [caseList] = await Promise.all([
          getCases(1, 200).catch(() => ({ data: [] })),
        ]);
        const record = caseList.data.find(
          (item) => item.caseNumber === resolvedParams.caseId || item.id === resolvedParams.caseId
        ) || null;
        if (record) {
          setCaseRecord({
            id: record.id,
            caseNumber: record.caseNumber,
            title: record.title ?? null,
            clientName: record.clientName ?? null,
            matterType: record.matterType ?? null,
            status: record.status,
            clientRole: (record as any).clientRole ?? null,
            deadline: record.deadline ?? null,
          });
        }
        return;
      }

      setIsLoadingWorkflowSummary(true);
      setWorkflowSummaryError(null);
      setWorkItemsError(null);
      const [contracts, timeline, caseList, backendDocuments, communicationsResponse, workflowSummaryResponse, workItemsResponse, caseActivityResponse, caseAgendaResponse, caseResponsibilityResponse] = await Promise.all([
        getCaseContracts(effectiveCaseId).catch(() => []),
        getCaseTimeline(effectiveCaseId).catch(() => []),
        getCases(1, 200).catch(() => ({ data: [] })),
        getCaseDocuments(effectiveCaseId).catch(() => []),
        getCommunications({ caseId: effectiveCaseId, limit: 50 }).catch(() => ({ communications: [], pagination: { total: 0, limit: 50, offset: 0 } })),
        getCaseWorkflowSummary(effectiveCaseId).catch((error) => {
          console.error('Failed to load workflow summary:', error);
          setWorkflowSummaryError('A workflow összefoglaló most nem érhető el.');
          return null;
        }),
        getCaseWorkItems(effectiveCaseId).catch((error) => {
          console.error('Failed to load case work items:', error);
          setWorkItemsError('Az ügy munkalistája most nem érhető el.');
          return null;
        }),
        getCaseActivity(effectiveCaseId).catch(() => null),
        getWorkflowAgenda({ scope: 'CASE', caseId: effectiveCaseId, status: 'OPEN', limit: 20 }).catch(() => null),
        getCaseResponsibility(effectiveCaseId).catch(() => null),
      ]);
      setGeneratedContracts(contracts);
      setTimelineEvents(timeline);
      setCommunications(communicationsResponse.communications || []);
      setWorkflowSummary(workflowSummaryResponse);
      setWorkItems(workItemsResponse);
      setCaseActivity(caseActivityResponse);
      setCaseAgenda(caseAgendaResponse);
      setCaseResponsibility(caseResponsibilityResponse);
      const record = caseList.data.find((item) => item.caseNumber === resolvedParams.caseId || item.id === resolvedParams.caseId) || null;
      if (!caseRecord && record) {
        setCaseRecord({
          id: record.id,
          caseNumber: record.caseNumber,
          title: record.title ?? null,
          clientName: record.clientName ?? null,
          matterType: record.matterType ?? null,
          status: record.status,
          clientRole: (record as any).clientRole ?? null,
          deadline: record.deadline ?? null,
        });
      }
      setDocuments(backendDocuments.map(mapDocumentItemToCaseDocument));
    } catch (err) {
      console.error('Failed to load backend data:', err);
      setWorkflowSummaryError('Az ügyadatok betöltése közben hiba történt.');
    } finally {
      setIsLoadingWorkflowSummary(false);
    }
  }, [resolvedParams.caseId, caseRecord]);

  const refreshCaseDocuments = useCallback(async () => {
    if (!caseRecord?.id) return;
    const docs = await getCaseDocuments(caseRecord.id);
    setDocuments(docs.map(mapDocumentItemToCaseDocument));
  }, [caseRecord?.id]);

  const toEpoch = (value?: string | null): number => {
    if (!value) return 0;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const mapTimelineToStoryEvents = (events: TimelineEventItem[]): CaseStoryEvent[] => {
    const humanizeTimelineEvent = (event: TimelineEventItem) => {
      const raw = String(event.typeLabel || event.type || '').trim();
      const normalized = raw.toUpperCase();
      const labels: Record<string, string> = {
        CASE_CREATED: 'Ügy létrehozva',
        DOCUMENT_UPLOADED: 'Dokumentum feltöltve',
        DOCUMENT_ANONYMIZED_FOR_AI: 'Anonimizálás elkészült',
        DOCUMENT_ANONYMIZED: 'Anonimizálás elkészült',
        CONTRACT_GENERATED: 'Szerződés generálva',
      };
      if (event.description?.trim() && !event.description.toLowerCase().startsWith('workflow event:')) {
        return event.description.trim();
      }
      return labels[normalized] || 'Esemény rögzítve';
    };

    return events
      .filter((event) => !!event.createdAt)
      .map((event) => {
        const title = humanizeTimelineEvent(event);
        return {
          id: `timeline:${event.id}`,
          dedupeKey: `timeline|${event.id}`,
          type: 'timeline' as const,
          title,
          timestamp: event.createdAt,
          description: event.user?.name ? `Rögzítette: ${event.user.name}` : undefined,
          sourceLabel: 'Ügytörténet',
          link: `/cases/${canonicalCaseId}`,
          linkLabel: 'Ügy megnyitása',
          sourcePriority: 1,
        };
      });
  };

  const mapDocumentsToStoryEvents = (items: CaseDocument[]): CaseStoryEvent[] => {
    const events: CaseStoryEvent[] = [];
    items.forEach((doc) => {
      const createdTs = doc.createdAt || doc.updatedAt || doc.date;
      events.push({
        id: `document:${doc.id}:added`,
        dedupeKey: `document-added|${doc.id}|${createdTs}`,
        type: 'document',
        title: `Dokumentum hozzáadva: ${doc.name}`,
        timestamp: createdTs,
        description: doc.type ? `Típus: ${doc.type}` : undefined,
        sourceLabel: 'Dokumentumok',
        link: `/cases/${canonicalCaseId}/documents`,
        linkLabel: 'Dokumentumok megnyitása',
        sourcePriority: 3,
      });

      if (doc.updatedAt && doc.createdAt && toEpoch(doc.updatedAt) - toEpoch(doc.createdAt) > 60_000) {
        events.push({
          id: `document:${doc.id}:updated`,
          dedupeKey: `document-updated|${doc.id}|${doc.updatedAt}`,
          type: 'document',
          title: `Dokumentum frissítve: ${doc.name}`,
          timestamp: doc.updatedAt,
          description: doc.type ? `Típus: ${doc.type}` : undefined,
          sourceLabel: 'Dokumentumok',
          link: `/cases/${canonicalCaseId}/documents`,
          linkLabel: 'Dokumentumok megnyitása',
          sourcePriority: 3,
        });
      }
    });
    return events;
  };

  const mapContractsToStoryEvents = (items: {
    id: string;
    title: string;
    fileName: string;
    generatedAt: string;
    revisionNumber?: number;
    parentRevisionId?: string | null;
  }[]): CaseStoryEvent[] => {
    return items
      .filter((item) => !!item.generatedAt)
      .map((item) => ({
        id: `generation:${item.id}`,
        dedupeKey: `generation|${item.id}|${item.generatedAt}`,
        type: 'generation' as const,
        title: `Szerződés generálva: ${item.title || item.fileName}${item.parentRevisionId ? ' (Szerkesztett verzió)' : ''}`,
        timestamp: item.generatedAt,
        sourceLabel: 'Generálás',
        link: `/cases/${canonicalCaseId}/review/${item.id}`,
        linkLabel: 'Review megnyitása',
        sourcePriority: 2,
      }));
  };

  const mapTasksToStoryEvents = (items: TaskItem[]): CaseStoryEvent[] => {
    return items
      .filter((task) => !!task.dueDate)
      .map((task) => ({
        id: `deadline:${task.id}`,
        dedupeKey: `deadline|${task.id}|${task.dueDate}`,
        type: 'deadline' as const,
        title: `Feladat határidő: ${task.title}`,
        timestamp: task.dueDate as string,
        description: `Státusz: ${task.status}`,
        sourceLabel: 'Feladatok',
        link: `/cases/${canonicalCaseId}`,
        linkLabel: 'Ügy megnyitása',
        sourcePriority: 4,
      }));
  };

  const documentTitleMap = new Map<string, string>();
  documents.forEach((doc) => { documentTitleMap.set(doc.id, doc.name); });
  generatedContracts.forEach((contract) => {
    documentTitleMap.set(contract.id, contract.title || contract.fileName);
  });

  const mapCommunicationsToStoryEvents = (
    items: CommunicationItem[],
    titleMap: Map<string, string>,
  ): CaseStoryEvent[] => {
    return items
      .filter((item) => !!item.createdAt)
      .map((item) => {
        const isNote = item.type === 'NOTE';
        const notePreview = isNote && item.contentPreview
          ? item.contentPreview.length > 80 ? item.contentPreview.slice(0, 80) + '…' : item.contentPreview
          : null;
        // Enrich NOTE events with author name when available; non-NOTE keep existing logic
        const noteDescription = notePreview
          ? (item.createdBy?.name ? `${item.createdBy.name}: ${notePreview}` : notePreview)
          : (item.senderName ? `${item.type} from ${item.senderName}` : item.type);
        // Resolve document title for document-linked notes
        const docTitle = isNote && item.documentId ? titleMap.get(item.documentId) : undefined;
        const sourceLabel = isNote
          ? item.documentId
            ? docTitle
              ? `Megjegyzés: ${docTitle.length > 40 ? docTitle.slice(0, 40) + '…' : docTitle}`
              : 'Dokumentum megjegyzés'
            : 'Belső megjegyzés'
          : 'Communications';

        return {
          id: `communication:${item.id}`,
          dedupeKey: `communication|${item.id}|${item.createdAt}`,
          type: 'communication' as const,
          title: isNote ? `Belső megjegyzés: ${item.subject || 'Megjegyzés'}` : `Communication logged: ${item.subject || item.type}`,
          timestamp: item.createdAt,
          description: isNote ? noteDescription : (item.senderName ? `${item.type} from ${item.senderName}` : item.type),
          sourceLabel,
          link: isNote && item.documentId
            ? `/cases/${canonicalCaseId}/review/${item.documentId}`
            : `/cases/${canonicalCaseId}/communications`,
          linkLabel: isNote && item.documentId ? 'Megnyitás' : 'Open communications',
          sourcePriority: isNote ? 3 : 5, // notes rank higher (more visible) than generic comms
          isNote: isNote, // pass through for conditional styling
        };
      });
  };

  const dedupeAndSortStoryEvents = (events: CaseStoryEvent[]): CaseStoryEvent[] => {
    const byKey = new Map<string, CaseStoryEvent>();
    for (const event of events) {
      const existing = byKey.get(event.dedupeKey);
      if (!existing || event.sourcePriority < existing.sourcePriority) {
        byKey.set(event.dedupeKey, event);
      }
    }

    return Array.from(byKey.values()).sort((a, b) => toEpoch(b.timestamp) - toEpoch(a.timestamp));
  };

  const caseStoryEvents = dedupeAndSortStoryEvents([
    ...mapTimelineToStoryEvents(timelineEvents),
  ]);

  const eventTypeChip: Record<CaseStoryEventType, string> = {
    timeline: 'bg-[#EDE9FE] text-[#5B21B6] border-[#C4B5FD]',
    document: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]',
    generation: 'bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]',
    task: 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]',
    deadline: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]',
    communication: 'bg-[var(--adm-surface)] text-[var(--adm-text)] border-[var(--adm-border)]',
  };

  // Type-specific icon background colors (matches chip colors for visual coherence)
  const eventTypeIconBg: Record<CaseStoryEventType, string> = {
    timeline: 'bg-[#5B21B6]',
    document: 'bg-[#1D4ED8]',
    generation: 'bg-[#92400E]',
    task: 'bg-[#047857]',
    deadline: 'bg-[#B91C1C]',
    communication: 'bg-[var(--adm-text)]',
  };

  // Type-specific icons per event category
  const getEventIcon = (type: CaseStoryEventType) => {
    switch (type) {
      case 'timeline':
        return (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621-.504-1.125-1.125-1.125h-.75c-.621 0-1.125.504-1.125 1.125V21" />
          </svg>
        );
      case 'document':
        return (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        );
      case 'generation':
        return (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
          </svg>
        );
      case 'task':
        return (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'deadline':
        return (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'communication':
        return (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        );
    }
  };

  // Key: depend on caseRecord?.id so we re-trigger AFTER caseRecord is resolved.
  // This ensures we never call /cases/{caseNumber}/contracts etc. with a caseNumber string.
  useEffect(() => {
    loadBackendData();
  }, [loadBackendData]);

  const handleDocumentClick = async (doc: CaseDocument) => {
    // Download client document
    setIsDownloading(doc.id);
    try {
      const blob = await downloadDocument(doc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name || 'document';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setIsDownloading(null);
    }
  };

  const openDeleteDocumentDialog = (doc: CaseDocument) => {
    setDeleteCandidate(doc);
    setDeleteDocumentError(null);
    setDeleteDocumentSuccess(null);
  };

  const closeDeleteDocumentDialog = () => {
    if (isDeletingDocument) return;
    setDeleteCandidate(null);
    setDeleteDocumentError(null);
  };

  const handleConfirmDeleteDocument = async () => {
    if (!deleteCandidate) return;
    setIsDeletingDocument(true);
    setDeleteDocumentError(null);
    setDeleteDocumentSuccess(null);
    try {
      await deleteDocument(deleteCandidate.id);
      await refreshCaseDocuments();
      setDeleteDocumentSuccess('A dokumentum törölve lett.');
      setDeleteCandidate(null);
    } catch (err) {
      console.error('Document delete failed:', err);
      if (err instanceof ApiError && err.status === 409) {
        setDeleteDocumentError('A dokumentum kapcsolódó munkafolyamat miatt nem törölhető.');
      } else if (err instanceof ApiError && err.status === 403) {
        setDeleteDocumentError('Nincs jogosultságod a dokumentum törléséhez.');
      } else if (err instanceof ApiError && err.status === 502) {
        setDeleteDocumentError('A SharePoint-törlés nem sikerült, ezért az adatbázis nem módosult.');
      } else {
        setDeleteDocumentError('A dokumentum törlése nem sikerült.');
      }
    } finally {
      setIsDeletingDocument(false);
    }
  };

  const handleDownloadContract = async (contractId: string, fileName: string) => {
    setIsDownloading(contractId);
    try {
      const blob = await downloadContract(contractId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'contract.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setIsDownloading(null);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !caseRecord?.id) return;
    
    setIsUploading(true);
    setUploadError(null);
    
    try {
      const base64 = await fileToBase64(file);
      const result = await uploadCaseDocument({
        caseId: caseRecord.id,
        fileName: file.name,
        fileContentBase64: base64,
        mimeType: file.type || 'application/octet-stream',
        documentType: 'CLIENT_INPUT',
        folder: 'CLIENT_INPUT',
      });
      
      // Refresh documents list - use caseRecord.id (CUID) not resolvedParams.caseId (could be caseNumber)
      await refreshCaseDocuments();
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError('A dokumentum feltöltése sikertelen.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAnonymizeDocument = (doc: CaseDocument) => {
    setAnonymizeDoc({
      id: doc.id,
      title: doc.name,
      templateName: doc.type,
      revisionNumber: doc.version ? parseInt(doc.version) : undefined,
      status: doc.status,
    });
    setAnonymizeModalOpen(true);
  };

  const handleAnonymizeSuccess = async (result: AnonymizeResult) => {
    setLastAnonymizeResult(result);
    // Refresh anonymous documents list
    if (caseRecord?.id) {
      try {
        const anonDocs = await getCaseAnonymousDocuments(caseRecord.id);
        setAnonymousDocuments(anonDocs);
        // Automatically open RehydrateModal for the newly created anonymized document
        if (result.anonymizedDocumentId) {
          setRehydrateDoc({ id: result.anonymizedDocumentId, name: result.name || 'Anonymous Document' });
          setRehydrateModalOpen(true);
        }
      } catch (err) {
        console.error('Failed to refresh anonymous documents:', err);
      }
    }
  };

  const handleOpenRehydrate = (anonDoc: AnonymousDocumentListItem) => {
    setRehydrateDoc({ id: anonDoc.id, name: anonDoc.name || 'Anonymous Document' });
    setRehydrateModalOpen(true);
  };

  const handleRehydrateSuccess = async (result: ImportAIResponseResult) => {
    // Refresh anonymous documents list to show updated status
    if (caseRecord?.id) {
      try {
        const anonDocs = await getCaseAnonymousDocuments(caseRecord.id);
        setAnonymousDocuments(anonDocs);
      } catch (err) {
        console.error('Failed to refresh anonymous documents:', err);
      }
    }
  };

  const handleRehydrateSaveSuccess = async (documentId: string, fileName: string) => {
    // Refresh both anonymous documents AND regular documents after saving a rehydrated draft
    if (caseRecord?.id) {
      try {
        // Refresh anonymous documents
        const anonDocs = await getCaseAnonymousDocuments(caseRecord.id);
        setAnonymousDocuments(anonDocs);
        
        // Refresh regular documents to show the new saved draft
        await refreshCaseDocuments();
        
        console.log(`Rehydrated draft saved: ${fileName} (${documentId})`);
      } catch (err) {
        console.error('Failed to refresh after save:', err);
      }
    }
  };

  // Tasks: load tasks for this case
  const loadTasks = useCallback(async () => {
    // Wait for caseRecord to be resolved before making API calls with CUID
    if (!caseRecord) return;
    setIsLoadingTasks(true);
    try {
      const fetchedTasks = await getCaseTasks(caseRecord.id);
      setTasks(fetchedTasks);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setIsLoadingTasks(false);
    }
  }, [caseRecord]);

  useEffect(() => {
    if (caseRecord?.id) {
      loadTasks();
    }
  }, [caseRecord?.id, loadTasks]);

  // Workflow: load workflow graph for this case
  const loadWorkflow = useCallback(async () => {
    // Wait for caseRecord to be resolved before making API calls with CUID
    if (!caseRecord) return;
    setIsLoadingWorkflow(true);
    try {
      const graph = await getWorkflowGraph(caseRecord.id);
      setWorkflowGraph(graph);
    } catch (err) {
      console.error('Failed to load workflow graph:', err);
    } finally {
      setIsLoadingWorkflow(false);
    }
  }, [caseRecord]);

  useEffect(() => {
    if (caseRecord?.id) {
      loadWorkflow();
    }
  }, [caseRecord?.id, loadWorkflow]);

  // Workflow history: includes transition comments/reasons
  const loadWorkflowHistory = useCallback(async () => {
    if (!caseRecord) return;
    setIsLoadingWorkflowHistory(true);
    try {
      const history = await getCaseWorkflowHistory(caseRecord.id);
      setWorkflowHistory(history);
    } catch (err) {
      console.error('Failed to load workflow history:', err);
    } finally {
      setIsLoadingWorkflowHistory(false);
    }
  }, [caseRecord]);

  useEffect(() => {
    if (caseRecord?.id) {
      loadWorkflowHistory();
    }
  }, [caseRecord?.id, loadWorkflowHistory]);

  // Load users for resolving workflow history actor names
  useEffect(() => {
    getUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  // Case note: add a lightweight internal case update
  const handleAddCaseNote = async () => {
    const content = newNoteContent.trim();
    if (!content || !caseRecord?.id) return;
    setIsSavingNote(true);
    try {
      const note = await createCommunication({
        type: 'NOTE',
        subject: 'Case update',
        content,
        caseId: caseRecord.id,
      });
      setCaseNotes(prev => [note, ...prev]);
      setNewNoteContent('');
      setIsAddingNote(false);
    } catch (err) {
      console.error('Failed to add case note:', err);
    } finally {
      setIsSavingNote(false);
    }
  };

  // Task action handlers
  const refreshWorkSurfaces = async () => {
    await Promise.all([
      loadTasks(),
      loadBackendData(),
    ]);
  };

  const runWorkbenchTaskAction = async (
    taskId: string,
    action: 'start' | 'submit' | 'approve' | 'return' | 'block' | 'unblock'
  ) => {
    setActionTaskId(`${taskId}:${action}`);
    try {
      if (action === 'start') await startTask(taskId);
      if (action === 'submit') await submitTask(taskId);
      if (action === 'approve') await completeTask(taskId, true);
      if (action === 'return') await completeTask(taskId, false);
      if (action === 'block') await blockTask(taskId, 'DEPENDENCY');
      if (action === 'unblock') await unblockTask(taskId);
      await refreshWorkSurfaces();
    } catch (err) {
      console.error('Task workflow action failed:', err);
      await refreshWorkSurfaces();
    } finally {
      setActionTaskId(null);
    }
  };

  const createSourceTask = async (item: CaseWorkItem | CaseActivityItem, kind: 'REVIEW' | 'FOLLOW_UP' | 'REVIEW_ATTACHMENT') => {
    const isActivityItem = 'kind' in item;
    const sourceType = isActivityItem ? item.kind : item.source?.type || null;
    const sourceId = isActivityItem
      ? (item.documentId || item.communicationId || null)
      : (item.source?.id || null);
    if (!sourceId) return;
    setActionTaskId(`source:${sourceId}:${kind}`);
    try {
      if (sourceType === 'DOCUMENT' && kind !== 'REVIEW_ATTACHMENT') {
        await createDocumentSourceTask(sourceId, { kind: kind === 'REVIEW' ? 'REVIEW' : 'FOLLOW_UP' });
      } else if (sourceType === 'COMMUNICATION' && kind !== 'REVIEW') {
        await createCommunicationSourceTask(sourceId, { kind });
      }
      await refreshWorkSurfaces();
    } catch (err) {
      console.error('Source-linked task creation failed:', err);
      await refreshWorkSurfaces();
    } finally {
      setActionTaskId(null);
    }
  };

  const handleStartTask = async (taskId: string) => {
    await runWorkbenchTaskAction(taskId, 'start');
  };

  const handleSubmitTask = async (taskId: string) => {
    await runWorkbenchTaskAction(taskId, 'submit');
  };

  const handleCompleteTask = async (taskId: string, approved: boolean) => {
    await runWorkbenchTaskAction(taskId, approved ? 'approve' : 'return');
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1] || result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };


  const displayedDocs = showAllDocs ? documents : documents.slice(0, 3);
  const hasMoreDocs = documents.length > 3;

  const displayCaseNumber = caseRecord?.caseNumber || resolvedParams.caseId;
  const displayTitle = (caseRecord?.title && caseRecord.title !== 'null - null' && caseRecord.title !== 'null' && caseRecord.title !== 'undefined - undefined') ? caseRecord.title : 'Nincs megadott ügycím';
  const displayClient = caseRecord?.clientName && caseRecord.clientName !== 'null' && caseRecord.clientName !== 'undefined' ? caseRecord.clientName : 'Nincs megadott ügyfél';
  const displayMatterType = caseRecord?.matterType || 'Nincs megadott ügytípus';
  const displayRiskLevel = 'Nem elérhető';

  // Workflow context (truthful derivation from existing task/history data)
  const activeWorkflowTasks = tasks.filter(
    (task) => !['COMPLETED', 'APPROVED', 'REJECTED', 'DECLINED'].includes(task.status)
  );
  const prioritizedActiveTasks = [...activeWorkflowTasks].sort((a, b) => {
    if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.title.localeCompare(b.title);
  });
  const primaryWorkflowTask = prioritizedActiveTasks[0] || null;
  const currentWorkflowNode = workflowGraph?.nodes.find((node) => node.status === 'current') || null;
  const latestWorkflowComment = workflowHistory.find(
    (item) => typeof item.comment === 'string' && item.comment.trim().length > 0
  ) || null;

  // Derived: day-grouped case story events
  type EventGroup = { date: string; label: string; events: CaseStoryEvent[] };
  const dayGroupedEvents: EventGroup[] = (() => {
    const groups: EventGroup[] = [];
    let currentDate = '';
    let currentGroup: EventGroup | null = null;
    const sorted = [...caseStoryEvents].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    for (const event of sorted) {
      const d = new Date(event.timestamp);
      const dateStr = d.toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const isToday = dateStr === today.toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const isYesterday = dateStr === yesterday.toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const label = isToday ? 'Ma' : isYesterday ? 'Tegnap' : dateStr;
      if (dateStr !== currentDate) {
        currentDate = dateStr;
        currentGroup = { date: dateStr, label, events: [] };
        groups.push(currentGroup);
      }
      currentGroup!.events.push(event);
    }
    return groups;
  })();

  const activeDocument = documents[0] || null;
  const canRequestDocumentDelete = !isArchived && Boolean(assignedLawyer);
  const documentWorkspaceHref = `/documents/compare?caseId=${canonicalCaseId}`;
  const litigationWorkspaceHref = activeDocument
    ? `/litigation-workspace?caseId=${canonicalCaseId}&documentId=${activeDocument.id}`
    : `/cases/${canonicalCaseId}/documents`;
  const latestCommunication = communications[0] || null;
  const latestStoryEvents = [...caseStoryEvents]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 8);
  const openTasks = tasks.filter(
    (task) => !['COMPLETED', 'APPROVED', 'REJECTED', 'DECLINED', 'CANCELLED', 'ARCHIVED'].includes(String(task.status || '').toUpperCase())
  );
  const activityItems = caseActivity?.items || [];
  const workbenchItems = workItems?.items || [];
  const filteredWorkbenchItems = workbenchItems.filter((item) => {
    if (workItemFilter === 'mine') return item.isMine;
    if (workItemFilter === 'overdue') return item.urgency === 'OVERDUE';
    if (workItemFilter === 'soon') return item.urgency === 'TODAY' || item.urgency === 'SOON';
    if (workItemFilter === 'review') return item.workflowCategory === 'REVIEW';
    if (workItemFilter === 'handoff') return item.workflowCategory === 'HANDOFF';
    if (workItemFilter === 'blocked') return item.workflowCategory === 'BLOCKED' || item.workflowCategory === 'WAITING';
    return true;
  });
  const workbenchFilters = [
    { key: 'all' as const, label: 'Összes', count: workItems?.summary.open ?? workbenchItems.length },
    { key: 'mine' as const, label: 'Saját munkám', count: workItems?.summary.mine ?? 0 },
    { key: 'overdue' as const, label: 'Lejárt', count: workItems?.summary.overdue ?? 0 },
    { key: 'soon' as const, label: 'Közelgő', count: workItems?.summary.dueSoon ?? 0 },
    { key: 'review' as const, label: 'Review', count: workItems?.summary.reviewRequired ?? 0 },
    { key: 'handoff' as const, label: 'Átadás', count: workItems?.summary.handoffRequired ?? 0 },
    ...(workItems?.availability.blockerState ? [{ key: 'blocked' as const, label: 'Blokkolt / várakozó', count: (workItems?.summary.blocked ?? 0) + (workItems?.summary.waiting ?? 0) }] : []),
  ];
  const caseAgendaItems = (caseAgenda?.days || []).flatMap((day) => day.items);
  const overdueCaseAgendaItems = caseAgendaItems.filter((item) => item.status === 'OPEN' && item.urgency === 'OVERDUE');
  const nextCaseAgendaItem = caseAgendaItems.find((item) => item.status === 'OPEN') || null;
  const agendaToneClass = (item: WorkflowDeadlineItem) => {
    if (item.urgency === 'OVERDUE') return 'border-[#d4b8b8] bg-[#FEF2F2] text-[#8b3a3a]';
    if (item.urgency === 'TODAY' || item.urgency === 'TOMORROW' || item.urgency === 'THIS_WEEK') return 'border-[#f9c74f] bg-[var(--adm-sand-100)] text-[#6B4B14]';
    return 'border-[var(--adm-border)] bg-white text-[var(--adm-text-muted)]';
  };
  const quickActions = [
    {
      title: 'Dokumentum-review',
      helper: 'Ügyhöz szűrt dokumentumok, munkapéldányok és szerkesztési műveletek.',
      action: () => router.push(documentWorkspaceHref),
      tone: 'primary',
    },
    {
      title: 'Dokumentumtár',
      helper: `${documents.length} rögzített dokumentum. Feltöltés és aktív iratkezelés.`,
      action: () => router.push(`/cases/${canonicalCaseId}/documents`),
      tone: 'gold',
    },
    {
      title: 'Dokumentum feltöltése',
      helper: isArchived ? 'Archivált ügy - csak megtekintés.' : 'Ügyféltől érkezett irat csatolása.',
      action: () => !isArchived && fileInputRef.current?.click(),
      tone: 'paper',
      disabled: isArchived,
    },
    {
      title: 'Kommunikáció',
      helper: 'Belső jegyzetek és ügykommunikációs napló.',
      action: () => router.push(`/cases/${canonicalCaseId}/communications`),
      tone: 'paper',
    },
    {
      title: activeDocument ? 'Peres munkatér' : 'Peres előkészítés',
      helper: activeDocument ? 'A kiválasztott irattal indított peres elemzési munkafolyamat.' : 'Peres munkához előbb ügyhöz tartozó irat szükséges.',
      action: () => router.push(litigationWorkspaceHref),
      tone: 'paper',
    },
    {
      title: 'Munkaórák',
      helper: 'Case-aware időrögzítés és munkacsomag kapcsolás.',
      action: () => router.push(`/time-entries?caseId=${canonicalCaseId}`),
      tone: 'paper',
    },
    {
      title: 'Leadás',
      helper: 'Ügyvédi review-ra előkészített belső munkacsomag.',
      action: () => router.push(`/cases/${canonicalCaseId}/handoff`),
      tone: 'paper',
    },
  ];
  const nextStep = isArchived
    ? {
        title: 'Archivált ügy',
        helper: 'Az ügy lezárt, aktív workflow-lépés nincs.',
        label: 'Dokumentumtár megtekintése',
        action: () => router.push(`/cases/${canonicalCaseId}/documents`),
      }
    : primaryWorkflowTask
      ? {
          title: primaryWorkflowTask.title,
          helper: `${getTaskStatusLabel(primaryWorkflowTask.status)} · ${primaryWorkflowTask.assignedTo?.name || 'Nincs kijelölt felelős'} · ${primaryWorkflowTask.dueDate ? `Határidő: ${new Date(primaryWorkflowTask.dueDate).toLocaleDateString('hu-HU')}` : 'Nincs határidő'}`,
          label: 'Feladat megnyitása',
          action: () => router.push(`/tasks?taskId=${primaryWorkflowTask.id}`),
        }
      : generatedContracts.length > 0
      ? {
          title: 'Dokumentum-review folytatása',
          helper: 'A módosított dokumentumok és klauzulák kezelése a szerkesztőben folytatható.',
          label: 'Dokumentum-review megnyitása',
          action: () => router.push(documentWorkspaceHref),
        }
      : documents.length > 0
        ? {
            title: 'Dokumentumtár megnyitása',
            helper: 'Feltöltött iratból anonimizálás, munkapéldány és leadási csomag indítható.',
            label: 'Ügy dokumentumai',
            action: () => router.push(`/cases/${canonicalCaseId}/documents`),
          }
        : {
            title: 'Dokumentum feltöltése',
            helper: 'Az ügykezelés első lépése egy munkadokumentum feltöltése.',
            label: 'Irat feltöltése',
            action: () => fileInputRef.current?.click(),
          };
  const workflowNextAction = workflowSummary?.nextAction || null;
  const workflowScopeLabel = workflowNextAction?.scope === 'MY_WORK' ? 'Saját feladatom' : 'Ügyszintű következő lépés';
  const workflowActionLabel = workflowNextAction ? (WORKFLOW_ACTION_LABELS[workflowNextAction.kind] || 'Következő lépés') : null;
  const workflowDeadlineTone = workflowSummary?.nextDeadline?.urgency === 'OVERDUE'
    ? 'border-[#d4b8b8] bg-[#FEF2F2] text-[#8b3a3a]'
    : workflowSummary?.nextDeadline?.urgency === 'TODAY'
      ? 'border-[#f9c74f] bg-[var(--adm-sand-100)] text-[var(--adm-ochre-500)]'
      : 'border-[var(--adm-border)] bg-[var(--adm-surface)] text-[var(--adm-text-muted)]';

  if (!caseRecord && timelineEvents.length === 0 && generatedContracts.length === 0 && documents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-[var(--adm-text-muted)]">Az ügy nem található</p>
          <button 
            onClick={() => router.push('/cases')}
            className="mt-4 px-4 py-2 bg-[var(--adm-ochre-500)] text-white rounded hover:bg-[var(--adm-ochre-500)]"
          >
            Vissza az ügylistához
          </button>
        </div>
      </div>
    );
  }

  const renderLegacyWorkspace = false;

  return (
    <div className="flex-1 min-h-0 bg-[var(--adm-ivory-50)]">
      {renderLegacyWorkspace && caseRecord ? (
      <div className="mx-auto flex h-full max-w-[1480px] flex-col overflow-hidden border-x border-[rgba(22,32,26,0.12)] bg-[var(--adm-surface)] shadow-[0_24px_60px_rgba(22,32,26,0.16)]">
        <CaseWorkspaceNav
          caseId={canonicalCaseId}
          caseNumber={displayCaseNumber}
          title={displayTitle}
          clientName={displayClient}
          activeTab="overview"
          status={caseRecord?.status}
          responsibleName={assignedLawyer?.name}
          deadline={caseRecord?.deadline}
        />
        <div className="min-h-0 flex flex-1 overflow-hidden">
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="space-y-4 p-5">
            <section className="border border-[rgba(22,32,26,0.10)] bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-ochre-500)]">ÜGY MUNKATERÜLET</p>
                  <h1 className="mt-1 font-serif text-[32px] leading-tight text-[var(--adm-text)]">{displayTitle}</h1>
                  <p className="mt-2 text-[12px] text-[var(--adm-text-muted)]">
                    {displayCaseNumber} · {displayMatterType}
                  </p>
                </div>
                <span className={`shrink-0 rounded-[3px] border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${statusChip[caseRecord?.status || 'Draft'] || 'border-[var(--adm-border)] bg-[var(--adm-surface)] text-[var(--adm-text)]'}`}>
                  {getCaseStatusLabel(caseRecord?.status)}
                </span>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Ügyfél</p>
                  <p className="mt-1 text-[13px] font-semibold text-[var(--adm-text)]">{displayClient}</p>
                </div>
                <div className="relative border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Felelős ügyvéd</p>
                  {assignedLawyer ? (
                    <>
                      <p className="mt-1 text-[13px] font-semibold text-[var(--adm-text)]">{assignedLawyer.name}</p>
                      <p className="text-[10px] text-[var(--adm-text-muted)]">{assignedLawyer.email}</p>
                    </>
                  ) : caseResponsibility?.capabilities.canChangeResponsibleLawyer ? (
                    <button onClick={() => { setShowAssignDropdown(!showAssignDropdown); loadAvailableUsers(); }} className="mt-1 text-[11px] font-semibold text-[var(--adm-ochre-500)]">
                      + Felelős ügyvéd hozzárendelése
                    </button>
                  ) : (
                    <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Nincs kijelölve</p>
                  )}
                  {showAssignDropdown && (
                    <div className="absolute left-3 top-full z-50 mt-1 max-h-48 w-64 overflow-y-auto border border-[var(--adm-border)] bg-white shadow-lg">
                      {isLoadingUsers ? (
                        <p className="p-2 text-xs text-[var(--adm-text-muted)]">Felhasználók betöltése...</p>
                      ) : availableUsers.length > 0 ? (
                        availableUsers.map((user) => (
                          <button key={user.id} onClick={() => handleAssignLawyer(user.id)} disabled={isAssigning} className="w-full border-b border-[var(--adm-border)] p-2 text-left text-xs hover:bg-[var(--adm-surface)] disabled:opacity-50">
                            <p className="font-medium text-[var(--adm-text)]">{user.name}</p>
                            <p className="text-[10px] text-[var(--adm-text-muted)]">{user.email}</p>
                          </button>
                        ))
                      ) : (
                        <p className="p-2 text-xs text-[var(--adm-text-muted)]">Nincs elérhető felhasználó</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Résztvevők</p>
                  <p className="mt-1 text-[13px] font-semibold text-[var(--adm-text)]">{collaborators.length || 0} résztvevő</p>
                  {!isArchived && caseResponsibility?.capabilities.canAddCollaborator && (
                    <div className="relative">
                      <button onClick={() => { setShowCollaboratorDropdown(!showCollaboratorDropdown); loadAvailableUsers(); }} className="mt-1 text-[10px] font-semibold text-[var(--adm-ochre-500)]">+ Résztvevő hozzáadása</button>
                      {showCollaboratorDropdown && (
                        <div className="absolute left-0 top-full z-50 mt-1 w-72 border border-[var(--adm-border)] bg-white shadow-lg">
                          <div className="border-b border-[var(--adm-border)] p-2">
                            <select value={collaboratorRole} onChange={(e) => setCollaboratorRole(e.target.value)} className="w-full border border-[var(--adm-border)] bg-white px-2 py-1 text-[10px]">
                              <option value="COLLABORATOR">Résztvevő</option>
                              <option value="REVIEWER">Ellenőrző</option>
                              <option value="ASSISTANT">Asszisztens</option>
                            </select>
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {availableUsers
                              .filter(u => u.id !== assignedLawyer?.id && !collaborators.some(c => c.userId === u.id))
                              .map((user) => (
                                <button key={user.id} onClick={() => handleAddCollaborator(user.id)} disabled={isAddingCollaborator} className="w-full border-b border-[var(--adm-border)] p-2 text-left text-[10px] hover:bg-[var(--adm-surface)] disabled:opacity-50">
                                  <p className="font-medium text-[var(--adm-text)]">{user.name}</p>
                                  <p className="text-[9px] text-[var(--adm-text-muted)]">{user.email}</p>
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Határidő</p>
                  {isEditingDeadline ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input type="date" value={deadlineInput} onChange={(e) => setDeadlineInput(e.target.value)} className="border border-[var(--adm-border)] bg-white px-2 py-1 text-xs" />
                      <button onClick={handleSaveDeadline} disabled={isSavingDeadline} className="bg-[var(--adm-green-800)] px-2 py-1 text-[10px] text-white disabled:opacity-50">{isSavingDeadline ? '...' : 'Mentés'}</button>
                      <button onClick={handleCancelDeadline} className="border border-[var(--adm-border)] px-2 py-1 text-[10px] text-[var(--adm-text)]">Mégse</button>
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-[var(--adm-text)]">{caseRecord?.deadline ? new Date(caseRecord.deadline).toLocaleDateString('hu-HU', { dateStyle: 'medium' }) : 'Nincs megadva'}</p>
                      {!isArchived && <button onClick={startEditingDeadline} className="text-[10px] font-semibold text-[var(--adm-ochre-500)]">{caseRecord?.deadline ? 'Módosítás' : '+ Hozzáadás'}</button>}
                    </div>
                  )}
                </div>
                <div className="border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Ügyfél szerepe</p>
                  {isEditingClientRole ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <select value={clientRoleInput} onChange={(e) => setClientRoleInput(e.target.value)} className="border border-[var(--adm-border)] bg-white px-2 py-1 text-xs">
                        <option value="">Nincs megadva</option>
                        <option value="MEGBIZÓ">Megbízó</option>
                        <option value="ELLENÉRTDEKŰ FÉL">Ellenérdekű fél</option>
                        <option value="PARTNER">Partner</option>
                        <option value="EGYÉB">Egyéb</option>
                      </select>
                      <button onClick={handleSaveClientRole} className="bg-[var(--adm-green-800)] px-2 py-1 text-[10px] text-white">Mentés</button>
                      <button onClick={handleCancelClientRole} className="border border-[var(--adm-border)] px-2 py-1 text-[10px] text-[var(--adm-text)]">Mégse</button>
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-[var(--adm-text)]">{caseRecord?.clientRole || 'Nincs megadva'}</p>
                      {!isArchived && <button onClick={handleEditClientRole} className="text-[10px] font-semibold text-[var(--adm-ochre-500)]">{caseRecord?.clientRole ? 'Módosítás' : '+ Hozzáadás'}</button>}
                    </div>
                  )}
                </div>
                <div className="border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Szakterület</p>
                  <p className="mt-1 text-[13px] font-semibold text-[var(--adm-text)]">{displayMatterType}</p>
                </div>
              </div>
            </section>

            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleFileUpload} className="hidden" disabled={isArchived} />

            <section aria-labelledby="case-center-heading" className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="border border-[var(--adm-green-900)] bg-[var(--adm-green-800)] p-5 text-[var(--adm-ivory-50)] shadow-[0_10px_24px_rgba(31,74,51,0.18)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[rgba(255,255,255,0.72)]">Itt folytasd</p>
                    <h2 id="case-center-heading" className="mt-1 font-serif text-[24px] leading-tight">
                      {isLoadingWorkflowSummary
                        ? 'Workflow összefoglaló betöltése'
                        : workflowNextAction?.title || 'Nincs sürgős következő lépés'}
                    </h2>
                  </div>
                  {workflowActionLabel && (
                    <span className="border border-[rgba(255,255,255,0.35)] bg-[rgba(255,255,255,0.12)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em]">
                      {workflowActionLabel}
                    </span>
                  )}
                </div>

                {workflowSummaryError ? (
                  <p className="mt-4 border border-[rgba(255,255,255,0.28)] bg-[rgba(255,255,255,0.10)] p-3 text-[12px] leading-relaxed">
                    {workflowSummaryError} A meglévő ügytörténet és feladatlista továbbra is használható.
                  </p>
                ) : workflowNextAction ? (
                  <>
                    <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-[rgba(255,255,255,0.84)]">{workflowNextAction.explanation}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="border border-[rgba(255,255,255,0.25)] px-2 py-1">{workflowScopeLabel}</span>
                      <span className="border border-[rgba(255,255,255,0.25)] px-2 py-1">{formatWorkflowDate(workflowNextAction.dueAt)}</span>
                    </div>
                    {workflowNextAction.href && (
                      <button
                        type="button"
                        onClick={() => router.push(workflowNextAction.href as string)}
                        className="mt-5 bg-[var(--adm-ochre-500)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[var(--adm-green-800)]"
                      >
                        Munkalépés megnyitása
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-[rgba(255,255,255,0.84)]">
                      Nincs lejárt vagy közeli határidejű feladat a biztonságos workflow összefoglalóban. Érdemes átnézni az ügytörténetet vagy a feladatlistát.
                    </p>
                    <button
                      type="button"
                      onClick={() => router.push(`/tasks?caseId=${canonicalCaseId}`)}
                      className="mt-5 bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--adm-green-800)] focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[var(--adm-green-800)]"
                    >
                      Feladatlista megnyitása
                    </button>
                  </>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <div className="border border-[rgba(22,32,26,0.10)] bg-white p-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Aktuális állapot</h3>
                  <div className="mt-3 grid gap-2 text-[11px] text-[var(--adm-text)]">
                    <div className="flex items-center justify-between gap-3">
                      <span>Ügystátusz</span>
                      <b>{getCaseStatusLabel(workflowSummary?.case.status || caseRecord?.status)}</b>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Várakozás</span>
                      <b>{workflowSummary?.waitingOn?.label || 'Nincs strukturált várakozási adat'}</b>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Következő határidő</span>
                      <span className={`border px-2 py-0.5 text-[10px] ${workflowDeadlineTone}`}>
                        {workflowSummary?.nextDeadline
                          ? `${DEADLINE_URGENCY_LABELS[workflowSummary.nextDeadline.urgency]} · ${formatWorkflowDate(workflowSummary.nextDeadline.dueAt)}`
                          : 'Nincs rögzített határidő'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Felelős</span>
                      <b>{workflowSummary?.responsibility.responsibleLawyer?.displayName || assignedLawyer?.name || 'Nincs kijelölve'}</b>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Résztvevők</span>
                      <b>{workflowSummary?.responsibility.collaborators.length ?? collaborators.length} fő</b>
                    </div>
                  </div>
                  <div className="border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Munka és idő</p>
                    <p className="mt-1 text-[13px] font-semibold text-[var(--adm-text)]">
                      {caseResponsibility?.work.openTaskCount ?? workflowSummary?.taskStats.open ?? openTasks.length} nyitott · {caseResponsibility?.work.overdueTaskCount ?? workflowSummary?.taskStats.overdue ?? 0} lejárt
                    </p>
                    <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">
                      {caseResponsibility?.time.supported
                        ? `Rögzített idő: ${formatMinutes(caseResponsibility.time.totalMinutes ?? caseResponsibility.time.currentUserMinutes)}`
                        : 'Időrögzítés csak matter-kapcsolattal támogatott'}
                    </p>
                    <button
                      type="button"
                      onClick={() => router.push(caseResponsibility?.time.matterId ? `/time-entries?caseId=${canonicalCaseId}&matterId=${caseResponsibility.time.matterId}` : `/workload?caseId=${canonicalCaseId}`)}
                      className="mt-2 text-[10px] font-semibold text-[var(--adm-ochre-500)]"
                    >
                      Munkateher / idő megnyitása
                    </button>
                  </div>
                </div>

                <div className="border border-[rgba(22,32,26,0.10)] bg-white p-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Munka mozgásban</h3>
                  <div className="mt-3 grid grid-cols-5 gap-1.5 text-center">
                    {[
                      ['Nyitott', workflowSummary?.taskStats.open ?? openTasks.length],
                      ['Lejárt', workflowSummary?.taskStats.overdue ?? 0],
                      ['48 óra', workflowSummary?.taskStats.dueSoon ?? 0],
                      ['Blokk', workflowSummary?.taskStats.blocked ?? 0],
                      ['Review', workflowSummary?.taskStats.review ?? 0],
                    ].map(([label, value]) => (
                      <div key={label} className="border border-[var(--adm-border)] bg-[var(--adm-surface)] p-2">
                        <p className="text-[14px] font-bold text-[var(--adm-text)]">{value}</p>
                        <p className="text-[9px] text-[var(--adm-text-muted)]">{label}</p>
                      </div>
                    ))}
                  </div>
                  {workflowSummary?.activeReview ? (
                    <button
                      type="button"
                      onClick={() => workflowSummary.activeReview?.href && router.push(workflowSummary.activeReview.href)}
                      className="mt-3 w-full border border-[var(--adm-border)] bg-[var(--adm-surface)] p-2 text-left focus:outline-none focus:ring-2 focus:ring-[var(--adm-ochre-500)]"
                    >
                      <p className="truncate text-[12px] font-semibold text-[var(--adm-text)]">{workflowSummary.activeReview.displayName}</p>
                      <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">Aktív dokumentum-review · {workflowSummary.activeReview.status || 'Nincs státuszadat'}</p>
                    </button>
                  ) : (
                    <p className="mt-3 border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-2 text-[10px] text-[var(--adm-text-muted)]">Nincs biztonságosan azonosított aktív review.</p>
                  )}
                  {workflowSummary?.handoff ? (
                    <p className="mt-2 text-[10px] text-[var(--adm-text-muted)]">Átadás: {workflowSummary.handoff.status}</p>
                  ) : (
                    <p className="mt-2 text-[10px] text-[var(--adm-text-muted)]">Nincs aktív leadási csomag.</p>
                  )}
                </div>
              </div>
            </section>

            <CaseIntakeReadinessPanel caseId={canonicalCaseId} />

            <CaseMatterDossierPanel caseId={canonicalCaseId} compact />

            {workflowSummary?.latestCommunication && (
              <section className="border border-[rgba(22,32,26,0.10)] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Legutóbbi kommunikáció</p>
                    <h2 className="mt-1 text-[15px] font-semibold text-[var(--adm-text)]">{workflowSummary.latestCommunication.subject || 'Nincs tárgy'}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(workflowSummary.latestCommunication?.href || `/cases/${canonicalCaseId}/communications`)}
                    className="border border-[var(--adm-border)] bg-white px-3 py-1.5 text-[10px] font-semibold text-[var(--adm-text)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-ochre-500)]"
                  >
                    Kommunikációs napló
                  </button>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-[var(--adm-text-muted)]">
                  {workflowSummary.latestCommunication.contentPreview || 'Ehhez a kommunikációhoz csak metaadat érhető el az összefoglalóban.'}
                </p>
                <p className="mt-2 text-[10px] text-[var(--adm-text-muted)]">
                  {formatWorkflowDate(workflowSummary.latestCommunication.occurredAt)} · Mellékletek: {workflowSummary.latestCommunication.attachmentCount || 0} · Forrásfeladatok: {workflowSummary.latestCommunication.sourceTaskCount || 0}
                </p>
              </section>
            )}

            <section aria-labelledby="case-agenda-heading" className="border border-[rgba(22,32,26,0.10)] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Határidő agenda</p>
                  <h2 id="case-agenda-heading" className="mt-1 font-serif text-[22px] text-[var(--adm-text)]">Ügyhatáridők és feladat leadások</h2>
                  <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-[var(--adm-text-muted)]">
                    Rögzített ügyhatáridők és feladat-leadási dátumok.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/deadlines?scope=CASE&caseId=${encodeURIComponent(canonicalCaseId)}`)}
                  className="border border-[var(--adm-border)] bg-white px-3 py-2 text-[10px] font-semibold text-[var(--adm-text)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-ochre-500)]"
                >
                  Agenda megnyitása
                </button>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Következő</p>
                  <p className="mt-1 truncate text-[13px] font-semibold text-[var(--adm-text)]">{nextCaseAgendaItem?.title || 'Nincs nyitott határidő'}</p>
                  <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{nextCaseAgendaItem ? formatWorkflowDate(nextCaseAgendaItem.dueAt) : 'Csak rögzített dátumok jelennek meg.'}</p>
                </div>
                <div className="border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Lejárt</p>
                  <p className="mt-1 text-[18px] font-bold text-[#8b3a3a]">{overdueCaseAgendaItems.length}</p>
                  <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">Nyitott, lejárt agendaelem.</p>
                </div>
                <div className="border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Források</p>
                  <p className="mt-1 text-[13px] font-semibold text-[var(--adm-text)]">{caseAgenda?.availability.caseDeadlines ? 'Ügy + feladat' : 'Feladat leadások'}</p>
                  <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">A rögzített ügy- és feladatdátumokból.</p>
                </div>
              </div>

              {caseAgendaItems.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {caseAgendaItems.slice(0, 6).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => router.push(item.href || item.source.href || `/cases/${canonicalCaseId}`)}
                      className="w-full border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 text-left focus:outline-none focus:ring-2 focus:ring-[var(--adm-ochre-500)]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="truncate text-[13px] font-semibold text-[var(--adm-text)]">{item.title}</p>
                        <span className={`border px-2 py-0.5 text-[9px] font-semibold ${agendaToneClass(item)}`}>
                          {DEADLINE_URGENCY_LABELS[item.urgency] || item.urgency}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">
                        {item.source.displayName || item.sourceType} · {formatWorkflowDate(item.dueAt)} · {item.responsibility.assignee?.displayName || item.responsibility.responsibleLawyer?.displayName || 'Nincs kijelölt felelős'}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-4 border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 text-[11px] text-[var(--adm-text-muted)]">
                  Nincs nyitott ügyhatáridő vagy feladat-leadási dátum.
                </p>
              )}
            </section>

            <section aria-labelledby="case-workbench-heading" className="border border-[rgba(22,32,26,0.10)] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Munkasor</p>
                  <h2 id="case-workbench-heading" className="mt-1 font-serif text-[22px] text-[var(--adm-text)]">Ügyhöz tartozó munkasor</h2>
                  <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-[var(--adm-text-muted)]">
                    Aktív feladatok és leadási tételek.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/tasks?caseId=${encodeURIComponent(canonicalCaseId)}`)}
                  className="border border-[var(--adm-border)] bg-white px-3 py-2 text-[10px] font-semibold text-[var(--adm-text)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-ochre-500)]"
                >
                  Minden feladat
                </button>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-5">
                {[
                  ['Nyitott', workItems?.summary.open ?? 0],
                  ['Saját', workItems?.summary.mine ?? 0],
                  ['Lejárt', workItems?.summary.overdue ?? 0],
                  ['Review', workItems?.summary.reviewRequired ?? 0],
                  ['Átadás', workItems?.summary.handoffRequired ?? 0],
                ].map(([label, value]) => (
                  <div key={label} className="border border-[var(--adm-border)] bg-[var(--adm-surface)] p-2 text-center">
                    <p className="text-[16px] font-bold text-[var(--adm-text)]">{value}</p>
                    <p className="text-[9px] uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">{label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {workbenchFilters.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setWorkItemFilter(filter.key)}
                    className={`border px-3 py-1.5 text-[10px] font-semibold ${
                      workItemFilter === filter.key
                        ? 'border-[var(--adm-green-800)] bg-[var(--adm-green-800)] text-white'
                        : 'border-[var(--adm-border)] bg-white text-[var(--adm-text)] hover:bg-[var(--adm-surface)]'
                    }`}
                  >
                    {filter.label} · {filter.count}
                  </button>
                ))}
              </div>

              {workItemsError ? (
                <p className="mt-4 border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 text-[11px] text-[var(--adm-text-muted)]">
                  {workItemsError} A régi feladatlista továbbra is elérhető a jobb oldali panelben.
                </p>
              ) : filteredWorkbenchItems.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {filteredWorkbenchItems.slice(0, 10).map((item: CaseWorkItem) => (
                    <article key={item.id} className="border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="border border-[var(--adm-border)] bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--adm-text-muted)]">
                              {WORK_ITEM_TYPE_LABELS[item.type] || item.type}
                            </span>
                            <span className="border border-[var(--adm-border)] bg-white px-2 py-0.5 text-[9px] font-semibold text-[var(--adm-text)]">
                              {WORK_ITEM_CATEGORY_LABELS[item.workflowCategory] || item.workflowCategory}
                            </span>
                            <span className={`border px-2 py-0.5 text-[9px] font-semibold ${
                              item.urgency === 'OVERDUE'
                                ? 'border-[#d4b8b8] bg-[#FEF2F2] text-[#8b3a3a]'
                                : item.urgency === 'TODAY' || item.urgency === 'SOON'
                                  ? 'border-[#f9c74f] bg-[var(--adm-sand-100)] text-[#6B4B14]'
                                  : 'border-[var(--adm-border)] bg-white text-[var(--adm-text-muted)]'
                            }`}>
                              {WORK_ITEM_URGENCY_LABELS[item.urgency] || item.urgency}
                            </span>
                          </div>
                          <h3 className="mt-2 truncate text-[14px] font-semibold text-[var(--adm-text)]">{item.title}</h3>
                          <p className="mt-1 text-[11px] leading-relaxed text-[var(--adm-text-muted)]">
                            {item.safeDescription || 'Nincs biztonságos rövid leírás ehhez a munkatételhez.'}
                          </p>
                          <p className="mt-2 text-[10px] text-[var(--adm-text-muted)]">
                            Felelős: {item.assignee?.displayName || 'Nincs kijelölve'} · Határidő: {item.dueAt ? new Date(item.dueAt).toLocaleDateString('hu-HU') : 'Nincs'} · Státusz: {getTaskStatusLabel(item.status)}
                          </p>
                          {item.blocker && (
                            <p className="mt-1 text-[10px] font-semibold text-[#8b3a3a]">
                              Elakadás: {item.blocker.safeLabel || 'Strukturált ok'} {item.blocker.since ? `· ${new Date(item.blocker.since).toLocaleDateString('hu-HU')}` : ''}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                          {item.href && (
                            <button type="button" onClick={() => router.push(item.href as string)} className="border border-[var(--adm-border)] bg-white px-2 py-1 text-[9px] font-semibold text-[var(--adm-text)]">
                              Megnyitás
                            </button>
                          )}
                          {item.source?.href && item.capabilities.canOpenSource && (
                            <button type="button" onClick={() => router.push(item.source?.href as string)} className="border border-[var(--adm-border)] bg-white px-2 py-1 text-[9px] font-semibold text-[var(--adm-text)]">
                              Forrás
                            </button>
                          )}
                          {item.type === 'DOCUMENT' && item.source?.id && (
                            <button type="button" onClick={() => createSourceTask(item, 'REVIEW')} disabled={Boolean(actionTaskId)} className="border border-[var(--adm-ochre-500)] bg-white px-2 py-1 text-[9px] font-semibold text-[var(--adm-ochre-500)] disabled:opacity-50">
                              Review feladat
                            </button>
                          )}
                          {item.type === 'COMMUNICATION' && item.source?.id && (
                            <button type="button" onClick={() => createSourceTask(item, 'FOLLOW_UP')} disabled={Boolean(actionTaskId)} className="border border-[var(--adm-ochre-500)] bg-white px-2 py-1 text-[9px] font-semibold text-[var(--adm-ochre-500)] disabled:opacity-50">
                              Utánkövetés
                            </button>
                          )}
                          {item.type === 'TASK' && item.capabilities.canStart && (
                            <button type="button" onClick={() => runWorkbenchTaskAction(item.id, 'start')} disabled={Boolean(actionTaskId)} className="bg-[var(--adm-green-800)] px-2 py-1 text-[9px] font-semibold text-white disabled:opacity-50">Elkezdem</button>
                          )}
                          {item.type === 'TASK' && item.capabilities.canSubmitForReview && (
                            <button type="button" onClick={() => runWorkbenchTaskAction(item.id, 'submit')} disabled={Boolean(actionTaskId)} className="bg-[var(--adm-ochre-500)] px-2 py-1 text-[9px] font-semibold text-white disabled:opacity-50">Review-ra küldöm</button>
                          )}
                          {item.type === 'TASK' && item.capabilities.canApprove && (
                            <button type="button" onClick={() => runWorkbenchTaskAction(item.id, 'approve')} disabled={Boolean(actionTaskId)} className="bg-[var(--adm-green-800)] px-2 py-1 text-[9px] font-semibold text-white disabled:opacity-50">Jóváhagyom</button>
                          )}
                          {item.type === 'TASK' && item.capabilities.canReturnForCorrection && (
                            <button type="button" onClick={() => runWorkbenchTaskAction(item.id, 'return')} disabled={Boolean(actionTaskId)} className="border border-[#8B2A2A] bg-white px-2 py-1 text-[9px] font-semibold text-[#8B2A2A] disabled:opacity-50">Visszaküldöm</button>
                          )}
                          {item.type === 'TASK' && item.capabilities.canBlock && (
                            <button type="button" onClick={() => runWorkbenchTaskAction(item.id, 'block')} disabled={Boolean(actionTaskId)} className="border border-[#8B2A2A] bg-white px-2 py-1 text-[9px] font-semibold text-[#8B2A2A] disabled:opacity-50">Elakadtként jelölés</button>
                          )}
                          {item.type === 'TASK' && item.capabilities.canUnblock && (
                            <button type="button" onClick={() => runWorkbenchTaskAction(item.id, 'unblock')} disabled={Boolean(actionTaskId)} className="bg-[var(--adm-green-800)] px-2 py-1 text-[9px] font-semibold text-white disabled:opacity-50">Elakadás feloldása</button>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-4 border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-4 text-[11px] text-[var(--adm-text-muted)]">
                  Nincs megjeleníthető munkatétel ebben a szűrőben. A nem támogatott várakozási/review/átadási állapotok nem kerülnek szimulálásra.
                </p>
              )}

              <p className="mt-3 text-[10px] text-[var(--adm-text-soft)]">
                Elérhetőség: feladatműveletek {workItems?.availability.taskTransitions ? 'aktív' : 'nem elérhető'} · blokkolás {workItems?.availability.blockerState ? 'strukturált' : 'nem támogatott'} · várakozás {workItems?.availability.waitingState ? 'strukturált' : 'nem támogatott'} · leadás {workItems?.availability.handoffWorkflow ? 'aktív' : 'nem elérhető'}.
              </p>
            </section>

            <section aria-labelledby="case-activity-heading" className="border border-[rgba(22,32,26,0.10)] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Ügyaktivitás</p>
                  <h2 id="case-activity-heading" className="mt-1 font-serif text-[22px] text-[var(--adm-text)]">Dokumentumok és kommunikációk mozgása</h2>
                  <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-[var(--adm-text-muted)]">
                    Egységes, olvasási lista feladatokból, dokumentum-metaadatokból, kommunikációs metaadatokból és timeline eseményekből. Nyers iratszöveg, teljes üzenettörzs és mellékletfájl nem jelenik meg.
                  </p>
                </div>
                <span className="border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-1.5 text-[10px] font-semibold text-[var(--adm-text-muted)]">
                  {caseActivity?.pagination.returned ?? 0} tétel
                </span>
              </div>

              {activityItems.length > 0 ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {activityItems.slice(0, 8).map((item) => (
                    <article key={item.id} className="border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="border border-[var(--adm-border)] bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--adm-text-muted)]">
                          {CASE_ACTIVITY_KIND_LABELS[item.kind] || item.kind}
                        </span>
                        {item.meta.status && (
                          <span className="border border-[var(--adm-border)] bg-white px-2 py-0.5 text-[9px] font-semibold text-[var(--adm-text)]">
                            {getTaskStatusLabel(item.meta.status)}
                          </span>
                        )}
                      </div>
                      <h3 className="mt-2 truncate text-[14px] font-semibold text-[var(--adm-text)]">{item.title}</h3>
                      <p className="mt-1 text-[11px] leading-relaxed text-[var(--adm-text-muted)]">
                        {item.safeDescription || 'Csak biztonságos metaadat érhető el ehhez az eseményhez.'}
                      </p>
                      <p className="mt-2 text-[10px] text-[var(--adm-text-muted)]">
                        {formatWorkflowDate(item.occurredAt)}
                        {typeof item.meta.attachmentCount === 'number' ? ` · Melléklet-metaadat: ${item.meta.attachmentCount}` : ''}
                        {typeof item.meta.sourceTaskCount === 'number' ? ` · Forrásfeladat: ${item.meta.sourceTaskCount}` : ''}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {item.href && (
                          <button type="button" onClick={() => router.push(item.href as string)} className="border border-[var(--adm-border)] bg-white px-2 py-1 text-[9px] font-semibold text-[var(--adm-text)]">
                            Megnyitás
                          </button>
                        )}
                        {item.kind === 'DOCUMENT' && item.documentId && (
                          <button type="button" onClick={() => createSourceTask(item, 'REVIEW')} disabled={Boolean(actionTaskId)} className="border border-[var(--adm-ochre-500)] bg-white px-2 py-1 text-[9px] font-semibold text-[var(--adm-ochre-500)] disabled:opacity-50">
                            Review feladat
                          </button>
                        )}
                        {item.kind === 'COMMUNICATION' && item.communicationId && (
                          <button type="button" onClick={() => createSourceTask(item, 'FOLLOW_UP')} disabled={Boolean(actionTaskId)} className="border border-[var(--adm-ochre-500)] bg-white px-2 py-1 text-[9px] font-semibold text-[var(--adm-ochre-500)] disabled:opacity-50">
                            Utánkövetés
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-4 border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-4 text-[11px] text-[var(--adm-text-muted)]">
                  Nincs biztonságosan megjeleníthető ügyaktivitás. A rendszer nem szimulál dokumentum- vagy kommunikációs eseményeket.
                </p>
              )}

              <p className="mt-3 text-[10px] text-[var(--adm-text-soft)]">
                Privacy guard: iratszöveg {caseActivity?.privacy.rawDocumentTextIncluded ? 'megjelenik' : 'nem jelenik meg'} · üzenettörzs {caseActivity?.privacy.rawCommunicationBodyIncluded ? 'megjelenik' : 'nem jelenik meg'} · mellékletfájl {caseActivity?.privacy.attachmentBytesIncluded ? 'megjelenik' : 'nem jelenik meg'}.
              </p>
            </section>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {quickActions.map((action) => (
                <button
                  key={action.title}
                  type="button"
                  onClick={action.action}
                  disabled={action.disabled}
                  className={`border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    action.tone === 'primary'
                      ? 'border-[var(--adm-green-900)] bg-[var(--adm-green-800)] text-[var(--adm-ivory-50)] hover:bg-[var(--adm-green-900)]'
                      : action.tone === 'gold'
                        ? 'border-[var(--adm-ochre-500)] bg-[var(--adm-ochre-500)] text-white hover:bg-[var(--adm-ochre-500)]'
                        : 'border-[var(--adm-border)] bg-white text-[var(--adm-text)] hover:bg-[var(--adm-surface)]'
                  }`}
                >
                  <p className="text-[12px] font-semibold">{action.title}</p>
                  <p className={`mt-2 text-[11px] leading-relaxed ${action.tone === 'paper' ? 'text-[var(--adm-text-muted)]' : 'text-current opacity-80'}`}>{action.helper}</p>
                </button>
              ))}
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
              <div className="border border-[rgba(22,32,26,0.10)] bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-serif text-[18px] text-[var(--adm-text)]">ÜGY TÖRTÉNETE</h2>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-[var(--adm-text-muted)]">{caseStoryEvents.length} esemény</span>
                    {!isArchived && <button onClick={() => setIsAddingNote(true)} className="text-[10px] font-semibold text-[var(--adm-ochre-500)]">+ Belső megjegyzés</button>}
                  </div>
                </div>
                {isAddingNote && (
                  <div className="mb-4 border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                    <p className="mb-2 text-[10px] text-[var(--adm-text-muted)]">Új belső megjegyzés</p>
                    <textarea value={newNoteContent} onChange={(e) => setNewNoteContent(e.target.value)} placeholder="Írja be a megjegyzést..." rows={3} className="w-full resize-none border border-[var(--adm-border)] bg-white px-3 py-2 text-xs focus:border-[var(--adm-ochre-500)] focus:outline-none" />
                    <div className="mt-2 flex gap-2">
                      <button onClick={handleAddCaseNote} disabled={!newNoteContent.trim() || isSavingNote} className="bg-[var(--adm-ochre-500)] px-3 py-1.5 text-[10px] text-white disabled:opacity-40">{isSavingNote ? 'Mentés...' : 'Mentés'}</button>
                      <button onClick={() => { setIsAddingNote(false); setNewNoteContent(''); }} className="border border-[var(--adm-border)] px-3 py-1.5 text-[10px] text-[var(--adm-text-muted)]">Mégse</button>
                    </div>
                  </div>
                )}
                <p className="mb-4 text-[11px] text-[var(--adm-text-muted)]">Csak megtörtént, rögzített ügyesemények. Jövőbeli lépések a jobb oldali Következő lépés panelben jelennek meg.</p>
                {latestStoryEvents.length > 0 ? (
                  <div className="space-y-3 border-l border-[#D9E3CC] pl-4">
                    {latestStoryEvents.map((event) => (
                      <div key={event.id} className="relative">
                        <span className="absolute left-[-21px] top-1 h-3 w-3 rounded-full border border-[var(--adm-ochre-500)] bg-[var(--adm-surface)]" />
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[13px] font-semibold text-[var(--adm-text)]">{event.title}</p>
                          <span className="border border-[var(--adm-border)] bg-[var(--adm-surface)] px-1.5 py-0.5 text-[9px] text-[var(--adm-text)]">{event.sourceLabel}</span>
                        </div>
                        {event.description && <p className="mt-1 text-[11px] leading-relaxed text-[var(--adm-text)]">{event.description}</p>}
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[10px] text-[var(--adm-text-muted)]">{new Date(event.timestamp).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' })}</span>
                          {event.link && <button onClick={() => router.push(event.link as string)} className="text-[10px] font-semibold text-[var(--adm-ochre-500)]">{event.linkLabel || 'Kapcsolódó nézet megnyitása'}</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-4 text-xs text-[var(--adm-text-muted)]">Még nincs rögzített ügyesemény. A dokumentum-feltöltés, az anonimizálás, a feladat- és review-lépések, valamint a belső megjegyzések automatikusan ügyeseményként jelennek meg itt.</div>
                )}
              </div>

              <div className="border border-[rgba(22,32,26,0.10)] bg-white p-4">
                <h3 className="font-serif text-[17px] text-[var(--adm-text)]">Kiválasztott dokumentum</h3>
                {activeDocument ? (
                  <div className="mt-3 border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                    <p className="truncate text-[13px] font-semibold text-[var(--adm-text)]">{activeDocument.name}</p>
                    <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{activeDocument.type} {activeDocument.version ? `· ${activeDocument.version}` : ''} · {activeDocument.date}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={() => router.push(documentWorkspaceHref)} className="bg-[var(--adm-green-800)] px-3 py-1.5 text-[10px] font-semibold text-[var(--adm-ivory-50)]">Dokumentum-review</button>
                      <button onClick={() => router.push(litigationWorkspaceHref)} className="border border-[var(--adm-border)] bg-white px-3 py-1.5 text-[10px] font-semibold text-[var(--adm-text)]">{activeDocument ? 'Peres munkatér' : 'Dokumentumtár'}</button>
                      <button onClick={() => handleDocumentClick(activeDocument)} disabled={isDownloading === activeDocument.id} className="border border-[var(--adm-border)] bg-white px-3 py-1.5 text-[10px] font-semibold text-[var(--adm-text)]">{isDownloading === activeDocument.id ? '...' : 'Letöltés'}</button>
                      <button onClick={() => handleAnonymizeDocument(activeDocument)} className="border border-[var(--adm-border)] bg-white px-3 py-1.5 text-[10px] font-semibold text-[var(--adm-text)]">Anonimizálás</button>
                      {canRequestDocumentDelete && (
                        <button onClick={() => openDeleteDocumentDialog(activeDocument)} className="border border-[#d4b8b8] bg-white px-3 py-1.5 text-[10px] font-semibold text-[#8b3a3a]">Törlés</button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-4 text-[11px] text-[var(--adm-text-muted)]">Még nincs kiválasztott dokumentum. Válassz egy iratot az ÜGYFÉL DOKUMENTUMAI listából a dokumentum-review és a peres munkatér megnyitásához.</div>
                )}
              </div>
            </section>

            {!isArchived && assignedLawyer && (
              <section className="border border-[#F2E4BD] bg-[var(--adm-sand-100)] p-4">
                <p className="text-[12px] font-semibold text-[var(--adm-text)]">Ügy lezárása</p>
                <p className="mt-1 text-[11px] text-[var(--adm-text)]">Az ügy lezárható. Az archiválás befejezettként jelöli az ügyet.</p>
                <button onClick={() => setShowCompleteConfirm(true)} className="mt-3 bg-[var(--adm-green-800)] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-ivory-50)]">Lezárás és archiválás</button>
              </section>
            )}

            {isArchived && (
              <section className="border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
                <p className="text-[12px] font-semibold text-[var(--adm-text)]">Archivált ügy</p>
                <p className="mt-1 text-[11px] text-[var(--adm-text)]">Ez az ügy befejezett és archivált. Az aktív műveletek le vannak tiltva.</p>
              </section>
            )}
          </div>
        </main>

        <aside className="w-[352px] shrink-0 overflow-y-auto border-l border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
          <div className="space-y-4">
            <section className="rounded-[8px] border border-[var(--adm-green-900)] bg-[var(--adm-green-800)] p-4 text-[var(--adm-ivory-50)] shadow-[0_6px_16px_rgba(31,74,51,0.20)]">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-ochre-500)]">KÖVETKEZŐ LÉPÉS</p>
              <h3 className="mt-2 font-serif text-[20px] leading-tight">{nextStep.title}</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-[var(--adm-ivory-50)]/78">{nextStep.helper}</p>
              <button onClick={nextStep.action} className="mt-3 w-full rounded-[5px] border border-[var(--adm-ochre-500)] bg-[var(--adm-ochre-500)] px-3 py-2 text-[11px] font-semibold text-white hover:bg-[var(--adm-ochre-500)]">{nextStep.label}</button>
            </section>

            <section className="border border-[var(--adm-border)] bg-white p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">ÜGY MUNKATERV</h3>
                <span className="text-[10px] text-[var(--adm-text-muted)]">{workplanTasks.length}</span>
              </div>
              {workplanTasks.length > 0 ? (
                <div className="space-y-2">
                  {workplanTasks.slice(0, 4).map((task) => (
                    <div key={task.id} className="border border-[var(--adm-border)] bg-[var(--adm-surface)] p-2">
                      <p className="text-[12px] font-semibold text-[var(--adm-text)]">{task.title}</p>
                      <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">Felelős: {task.assignedTo?.name || 'Nincs kijelölve'}</p>
                      <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">Státusz: {getTaskStatusLabel(task.status)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 text-[11px] text-[var(--adm-text-muted)]">Még nincs munkaterv rögzítve.</p>
              )}
            </section>

            <section className="border border-[var(--adm-border)] bg-white p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">ÜGYFÉL DOKUMENTUMAI</h3>
                <span className="text-[10px] text-[var(--adm-text-muted)]">{documents.length} fájl</span>
              </div>
              {uploadError && <div className="mb-2 border border-[#d4b8b8] bg-[#fef2f2] p-2 text-[10px] text-[#8b3a3a]">{uploadError}</div>}
              {deleteDocumentSuccess && <div className="mb-2 border border-[#BFD1C3] bg-[#E2EDE5] p-2 text-[10px] text-[var(--adm-green-800)]">{deleteDocumentSuccess}</div>}
              {isUploading && <div className="mb-2 border border-[var(--adm-border)] bg-[var(--adm-surface)] p-2 text-[10px] text-[var(--adm-text)]">Dokumentum feltöltése...</div>}
              {displayedDocs.length > 0 ? (
                <div className="space-y-2">
                  {displayedDocs.map((doc) => (
                    <div key={doc.id} className={`border p-2 ${highlightedTimelineId && doc.linkedTimelineId === highlightedTimelineId ? 'border-[var(--adm-ochre-500)] bg-[var(--adm-sand-100)]' : 'border-[var(--adm-border)] bg-[var(--adm-surface)]'}`}>
                      <p className="truncate text-[12px] font-semibold text-[var(--adm-text)]">{doc.name}</p>
                      <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{doc.type} {doc.version ? `· ${doc.version}` : ''}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button onClick={() => handleDocumentClick(doc)} disabled={isDownloading === doc.id} className="border border-[var(--adm-border)] bg-white px-2 py-1 text-[10px] font-semibold text-[var(--adm-text)]">{isDownloading === doc.id ? '...' : 'Letöltés'}</button>
                        {canRequestDocumentDelete && (
                          <button onClick={() => openDeleteDocumentDialog(doc)} className="border border-[#d4b8b8] bg-white px-2 py-1 text-[10px] font-semibold text-[#8b3a3a]">Törlés</button>
                        )}
                      </div>
                    </div>
                  ))}
                  {hasMoreDocs && <button onClick={() => setShowAllDocs(!showAllDocs)} className="w-full border border-[var(--adm-border)] py-2 text-[10px] font-semibold text-[var(--adm-ochre-500)]">{showAllDocs ? 'Kevesebb megjelenítése' : `Összes dokumentum (${documents.length})`}</button>}
                </div>
              ) : (
                <p className="border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 text-[11px] text-[var(--adm-text-muted)]">Még nincs ügyféldokumentum.</p>
              )}
            </section>

            <section className="border border-[var(--adm-border)] bg-white p-3">
              <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">DOKUMENTUM-REVIEW MEGNYITÁSA</h3>
              <button onClick={() => router.push(documentWorkspaceHref)} className="w-full bg-[var(--adm-green-800)] px-3 py-2 text-[11px] font-semibold text-[var(--adm-ivory-50)]">Ügy dokumentumainak review-ja</button>
              <p className="mt-2 text-[10px] text-[var(--adm-text-muted)]">Ügyhöz szűrt dokumentumok, klauzulák és módosított munkapéldányok kezelése.</p>
            </section>

            <details className="border border-[var(--adm-border)] bg-white p-3">
              <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Külső AI promptok</summary>
              {anonymousDocuments.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {anonymousDocuments.map((anonDoc) => (
                    <div key={anonDoc.id} className="border border-[var(--adm-border)] bg-[var(--adm-surface)] p-2">
                      <p className="truncate text-[11px] font-semibold text-[var(--adm-text)]">{anonDoc.name || 'Anonimizált dokumentum'}</p>
                      <button onClick={() => handleOpenRehydrate(anonDoc)} className="mt-2 border border-[var(--adm-border)] bg-white px-2 py-1 text-[10px] text-[var(--adm-text)]">AI válasz beillesztése</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-[10px] leading-relaxed text-[var(--adm-text-muted)]">Adminiculum nem hív külső AI-t. A promptok másolható munkafolyamatként kezelhetők.</p>
              )}
            </details>

            <section className="border border-[var(--adm-border)] bg-white p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">FELADATOK</h3>
                <span className="text-[10px] text-[var(--adm-text-muted)]">{openTasks.length}</span>
              </div>
              {isLoadingTasks ? (
                <p className="py-3 text-center text-[10px] text-[var(--adm-text-muted)]">Feladatok betöltése...</p>
              ) : openTasks.length > 0 ? (
                <div className="space-y-2">
                  {openTasks.slice(0, 4).map((task) => (
                    <div key={task.id} className="border border-[var(--adm-border)] bg-[var(--adm-surface)] p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-semibold text-[var(--adm-text)]">{task.title}</p>
                          <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{task.assignedTo?.name || 'Nincs kijelölve'} · {getTaskStatusLabel(task.status)}</p>
                        </div>
                        <span className={`shrink-0 border px-1.5 py-0.5 text-[9px] ${getTaskDueDateTone(task.dueDate)}`}>{task.dueDate ? new Date(task.dueDate).toLocaleDateString('hu-HU') : 'Nincs határidő'}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button onClick={() => router.push(`/tasks?taskId=${task.id}`)} className="border border-[var(--adm-border)] bg-white px-2 py-1 text-[9px] font-semibold text-[var(--adm-text)]">Feladatlap</button>
                        {(task.status === 'TODO' || task.status === 'ASSIGNED' || task.status === 'PENDING') && <button onClick={() => handleStartTask(task.id)} disabled={actionTaskId === task.id} className="bg-[var(--adm-green-800)] px-2 py-1 text-[9px] text-white disabled:opacity-50">{actionTaskId === task.id ? '...' : 'Indítás'}</button>}
                        {task.status === 'IN_PROGRESS' && <button onClick={() => handleSubmitTask(task.id)} disabled={actionTaskId === task.id} className="bg-[var(--adm-ochre-500)] px-2 py-1 text-[9px] text-white disabled:opacity-50">{actionTaskId === task.id ? '...' : 'Beküldés'}</button>}
                        {task.status === 'SUBMITTED' && (
                          <>
                            <button onClick={() => handleCompleteTask(task.id, true)} disabled={actionTaskId === task.id} className="bg-[var(--adm-green-800)] px-2 py-1 text-[9px] text-white disabled:opacity-50">{actionTaskId === task.id ? '...' : 'Jóváhagyás'}</button>
                            <button onClick={() => handleCompleteTask(task.id, false)} disabled={actionTaskId === task.id} className="border border-[#8B2A2A] bg-white px-2 py-1 text-[9px] text-[#8B2A2A] disabled:opacity-50">Elutasítás</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 text-[11px] text-[var(--adm-text-muted)]">Még nincs nyitott feladat ehhez az ügyhöz.</p>
              )}
            </section>

            <section className="border border-[var(--adm-border)] bg-white p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">BELSŐ JEGYZETEK / KOMMUNIKÁCIÓ</h3>
                <span className="text-[10px] text-[var(--adm-text-muted)]">{communications.length}</span>
              </div>
              {latestCommunication ? (
                <div className="border border-[var(--adm-border)] bg-[var(--adm-surface)] p-2">
                  <p className="truncate text-[12px] font-semibold text-[var(--adm-text)]">{latestCommunication.subject || 'Nincs tárgy'}</p>
                  <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{latestCommunication.senderName || 'Ismeretlen feladó'} · {latestCommunication.createdAt ? new Date(latestCommunication.createdAt).toLocaleDateString('hu-HU') : ''}</p>
                </div>
              ) : (
                <p className="border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 text-[11px] text-[var(--adm-text-muted)]">Még nincs rögzített kommunikáció.</p>
              )}
              <button onClick={() => router.push(`/cases/${canonicalCaseId}/communications`)} className="mt-3 w-full border border-[var(--adm-border)] bg-white px-3 py-2 text-[10px] font-semibold text-[var(--adm-text)]">Kommunikációs napló</button>
              <p className="mt-2 text-[9px] text-[var(--adm-text-muted)]">Rögzített kommunikációk összefoglalója, nem élő postafiók.</p>
            </section>

            <details className="border border-[var(--adm-border)] bg-white p-3">
              <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Munkafolyamat kontextus</summary>
              <div className="mt-3 space-y-2 text-[10px] text-[var(--adm-text)]">
                <p>Aktuális lépés: <b>{currentWorkflowNode?.label || getWorkflowStatusLabel(workflowGraph?.currentStatus) || 'Nem elérhető'}</b></p>
                <p>Felelős: <b>{primaryWorkflowTask?.assignedTo?.name || 'Még nincs felelős'}</b></p>
                <p>Határidő: <b>{primaryWorkflowTask?.dueDate ? new Date(primaryWorkflowTask.dueDate).toLocaleDateString('hu-HU') : 'Nincs határidő'}</b></p>
                {workflowGraph?.possibleTransitions?.length ? (
                  <div className="flex flex-wrap gap-1 pt-2">
                    {workflowGraph.possibleTransitions.map((status) => (
                      <button key={status} onClick={() => handleWorkflowTransition(status)} disabled={isTransitioning || isArchived} className="bg-[var(--adm-green-800)] px-2 py-1 text-[9px] text-white disabled:opacity-50">
                        {isTransitioning ? '...' : getWorkflowStatusLabel(status)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </details>
          </div>
        </aside>
        </div>
      </div>
      ) : (
        <div className="mx-auto max-w-[1480px] space-y-6 px-0 py-0 lg:px-0">
        <CaseWorkspaceNav
          caseId={canonicalCaseId}
          caseNumber={displayCaseNumber}
          title={displayTitle}
          clientName={displayClient}
          activeTab="overview"
          status={caseRecord?.status}
          responsibleName={assignedLawyer?.name}
          deadline={caseRecord?.deadline}
        />
        <div className="space-y-6 px-4 py-5 lg:px-6">
        <CaseWorkspaceOverview caseId={canonicalCaseId} />
        {/* Case management panel — the legacy CaseCenterOverview (which duplicated the
            task/document/communication/activity lists and rendered a generic
            "Esemény rögzítve" timeline + made the anonymous-documents call) is
            retired. The workspace overview above is the single case overview; this
            panel keeps only genuine case-management controls. */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          onChange={handleFileUpload}
          className="hidden"
        />
        <section aria-label="Ügykezelés" className="overflow-hidden rounded-xl border border-[var(--adm-border)] bg-white shadow-[0_10px_28px_rgba(0,42,35,0.035)]">
          <div className="border-b border-[var(--adm-border)] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-green-800)]">Ügykezelés</p>
          </div>
          <div className="px-4 py-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--adm-text-muted)]">Felelős ügyvéd</p>
                  <p className="mt-1 text-[13px] font-semibold text-[var(--adm-text)]">{assignedLawyer?.name || "Nincs kijelölve"}</p>
                  {!isArchived && caseResponsibility?.capabilities.canChangeResponsibleLawyer ? (
                    <button type="button" onClick={() => { setShowAssignDropdown(!showAssignDropdown); void loadAvailableUsers(); }} className="mt-1 text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">
                      Felelős módosítása
                    </button>
                  ) : null}
                  {showAssignDropdown ? (
                    <div className="mt-2 max-h-44 overflow-y-auto border border-[var(--adm-border)] bg-white">
                      {isLoadingUsers ? <p className="p-2 text-[11px] text-[var(--adm-text-muted)]">Felhasználók betöltése…</p> : availableUsers.map((user) => (
                        <button key={user.id} type="button" onClick={() => void handleAssignLawyer(user.id)} disabled={isAssigning} className="block w-full border-b border-[var(--adm-border)] px-3 py-2 text-left text-[11px] hover:bg-[var(--adm-surface)]">
                          <span className="font-semibold text-[var(--adm-text)]">{user.name}</span>
                          <span className="ml-2 text-[var(--adm-text-muted)]">{user.email}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--adm-text-muted)]">Határidő</p>
                  {isEditingDeadline ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input type="date" value={deadlineInput} onChange={(event) => setDeadlineInput(event.target.value)} className="adm-board-field px-3 py-2 text-[11px]" />
                      <button type="button" onClick={() => void handleSaveDeadline()} disabled={isSavingDeadline} className="bg-[var(--adm-green-800)] px-3 py-2 text-[11px] font-semibold text-white">Mentés</button>
                      <button type="button" onClick={handleCancelDeadline} className="border border-[var(--adm-border)] px-3 py-2 text-[11px]">Mégse</button>
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-[var(--adm-text)]">{caseRecord?.deadline ? new Date(caseRecord.deadline).toLocaleDateString("hu-HU") : "Nincs megadva"}</span>
                      {!isArchived ? <button type="button" onClick={startEditingDeadline} className="text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">Módosítás</button> : null}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--adm-text-muted)]">Ügyfél szerepe</p>
                  {isEditingClientRole ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <select value={clientRoleInput} onChange={(event) => setClientRoleInput(event.target.value)} className="adm-board-field px-3 py-2 text-[11px]">
                        <option value="">Nincs megadva</option>
                        <option value="MEGBIZÓ">Megbízó</option>
                        <option value="ELLENÉRTDEKŰ FÉL">Ellenérdekű fél</option>
                        <option value="PARTNER">Partner</option>
                        <option value="EGYÉB">Egyéb</option>
                      </select>
                      <button type="button" onClick={() => void handleSaveClientRole()} className="bg-[var(--adm-green-800)] px-3 py-2 text-[11px] font-semibold text-white">Mentés</button>
                      <button type="button" onClick={handleCancelClientRole} className="border border-[var(--adm-border)] px-3 py-2 text-[11px]">Mégse</button>
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-[var(--adm-text)]">{caseRecord?.clientRole || "Nincs megadva"}</span>
                      {!isArchived ? <button type="button" onClick={handleEditClientRole} className="text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">Módosítás</button> : null}
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--adm-text-muted)]">Résztvevők</p>
                    {!isArchived && caseResponsibility?.capabilities.canAddCollaborator ? (
                      <button type="button" onClick={() => { setShowCollaboratorDropdown(!showCollaboratorDropdown); void loadAvailableUsers(); }} className="text-[11px] font-semibold text-[var(--adm-green-800)] hover:underline">Hozzáadás</button>
                    ) : null}
                  </div>
                  {collaborators.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {collaborators.slice(0, 6).map((collaborator) => (
                        <div key={collaborator.id} className="flex items-center justify-between gap-2 border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-2 text-[11px]">
                          <span className="font-semibold text-[var(--adm-text)]">{collaborator.user.name}</span>
                          {caseResponsibility?.capabilities.canRemoveCollaborator ? <button type="button" onClick={() => void handleRemoveCollaborator(collaborator.id)} className="text-[10px] text-[var(--adm-terracotta-700)] hover:underline">Eltávolítás</button> : null}
                        </div>
                      ))}
                    </div>
                  ) : <p className="mt-2 text-[11px] text-[var(--adm-text-muted)]">Nincs további résztvevő.</p>}
                  {showCollaboratorDropdown ? (
                    <div className="mt-2 border border-[var(--adm-border)] bg-white p-2">
                      <select value={collaboratorRole} onChange={(event) => setCollaboratorRole(event.target.value)} className="adm-board-field mb-2 w-full px-3 py-2 text-[11px]">
                        <option value="COLLABORATOR">Résztvevő</option>
                        <option value="REVIEWER">Ellenőrző</option>
                        <option value="ASSISTANT">Asszisztens</option>
                      </select>
                      <div className="max-h-40 overflow-y-auto">
                        {availableUsers.filter((user) => user.id !== assignedLawyer?.id && !collaborators.some((collaborator) => collaborator.userId === user.id)).map((user) => (
                          <button key={user.id} type="button" onClick={() => void handleAddCollaborator(user.id)} className="block w-full border-b border-[var(--adm-border)] px-3 py-2 text-left text-[11px] hover:bg-[var(--adm-surface)]">{user.name}</button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                {workflowGraph?.possibleTransitions?.length ? (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--adm-text-muted)]">Ügyállapot</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {workflowGraph.possibleTransitions.map((status) => (
                        <button key={status} type="button" onClick={() => void handleWorkflowTransition(status)} disabled={isTransitioning || isArchived} className="border border-[var(--adm-border)] bg-white px-3 py-2 text-[10px] font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]">
                          {getWorkflowStatusLabel(status)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {!isArchived && assignedLawyer ? (
                  <button type="button" onClick={() => setShowCompleteConfirm(true)} className="text-[11px] font-semibold text-[var(--adm-terracotta-700)] hover:underline">Ügy lezárása és archiválása</button>
                ) : null}
              </section>
            </div>
          </div>
        </section>
        </div>
        </div>
      )}

      {/* Anonymize Modal for Client Documents */}
      {anonymizeDoc && (
        <AnonymizeModal
          isOpen={anonymizeModalOpen}
          onClose={() => {
            setAnonymizeModalOpen(false);
            setAnonymizeDoc(null);
          }}
          contract={{
            id: anonymizeDoc.id,
            title: anonymizeDoc.title,
            templateName: anonymizeDoc.templateName,
            revisionNumber: anonymizeDoc.revisionNumber,
            status: anonymizeDoc.status,
          } as any}
          caseId={caseRecord?.id}
          clientName={caseRecord?.clientName ?? undefined}
          clientRole={caseRecord?.clientRole ?? undefined}
          onSuccess={handleAnonymizeSuccess}
        />
      )}

      {/* Rehydrate Modal for AI Response Import */}
      {rehydrateDoc && (
        <RehydrateModal
          isOpen={rehydrateModalOpen}
          onClose={() => {
            setRehydrateModalOpen(false);
            setRehydrateDoc(null);
          }}
          anonymousDocId={rehydrateDoc.id}
          anonymousDocName={rehydrateDoc.name}
          caseId={caseRecord?.id}
          onSuccess={handleRehydrateSuccess}
          onSaveSuccess={handleRehydrateSaveSuccess}
        />
      )}

      {deleteCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-document-title">
          <div className="w-full max-w-md border border-[var(--adm-border)] bg-white shadow-2xl">
            <div className="border-b border-[var(--adm-border)] bg-[#8B2A2A] px-6 py-4">
              <h2 id="delete-document-title" className="font-serif text-lg font-bold text-white">Dokumentum törlése</h2>
              <p className="mt-1 text-xs text-white/75">Csak akkor folytasd, ha biztosan rossz irat került feltöltésre.</p>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <p className="text-sm font-semibold text-[var(--adm-text)]">{deleteCandidate.name}</p>
                <p className="mt-1 text-xs text-[var(--adm-text-muted)]">{deleteCandidate.type} {deleteCandidate.version ? `· ${deleteCandidate.version}` : ''}</p>
              </div>
              <div className="border border-[#FCD34D] bg-[#FEF3C7] p-3">
                <p className="text-xs leading-relaxed text-[#92400E]">
                  A törlés a SharePoint-fájlt és az Adminiculum dokumentumrekordot is eltávolítja. Ha feladat, anonimizált változat,
                  jogi elemzés vagy nyitott review-javaslat kapcsolódik hozzá, a rendszer blokkolja a műveletet.
                </p>
              </div>
              {deleteDocumentError && (
                <div className="border border-[#d4b8b8] bg-[#fef2f2] p-3 text-xs text-[#8b3a3a]">{deleteDocumentError}</div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  onClick={closeDeleteDocumentDialog}
                  disabled={isDeletingDocument}
                  className="border border-[var(--adm-border)] px-4 py-2 text-xs font-bold uppercase tracking-widest text-[var(--adm-text)] hover:bg-[var(--adm-surface)] disabled:opacity-50"
                >
                  Mégse
                </button>
                <button
                  onClick={handleConfirmDeleteDocument}
                  disabled={isDeletingDocument}
                  className="bg-[#8B2A2A] px-5 py-2 text-xs font-bold uppercase tracking-widest text-white hover:opacity-90 disabled:opacity-50"
                >
                  {isDeletingDocument ? 'Törlés...' : 'Végleges törlés'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Complete Case Confirmation Modal */}
      {showCompleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md shadow-2xl border border-[var(--adm-border)]">
            <div className="bg-[#059669] px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-['Newsreader'] font-bold text-white">Ügy lezárása és archiválása</h2>
                <p className="text-xs text-white/60 mt-1">Ez a művelet nem vonható vissza</p>
              </div>
              <button
                onClick={() => setShowCompleteConfirm(false)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-[var(--adm-text)] mb-4">
                Biztosan archiválni szeretné ezt az ügyet? Az ügy adatai megmaradnak, de befejezettként lesznek jelölve.
              </p>
              <div className="bg-[#FEF3C7] border border-[#FCD34D] p-3 mb-4">
                <p className="text-xs text-[#92400E]">
                  <strong>Megjegyzés:</strong> Ez az ügy státuszát ARCHIVÁLT-ra állítja. A dokumentumok és az ügy adatai továbbra is elérhetők.
                </p>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCompleteConfirm(false)}
                  className="px-4 py-2 text-xs font-bold uppercase tracking-widest border border-[var(--adm-border)]/20 text-[var(--adm-text)] hover:bg-[var(--adm-surface)]"
                >
                  Mégse
                </button>
                <button
                  onClick={handleCompleteCase}
                  disabled={isCompleting}
                  className="px-6 py-2 text-xs font-bold uppercase tracking-widest bg-[#059669] text-white hover:opacity-90 disabled:opacity-50"
                >
                  {isCompleting ? 'Archiválás...' : 'Ügy archiválása'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
