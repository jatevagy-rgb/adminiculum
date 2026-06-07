"use client";

import { useState, use, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getCaseContracts, getCaseDocuments, getCases, getCaseTimeline, downloadContract, downloadDocument, uploadCaseDocument, getCaseAnonymousDocuments, getCaseTasks, startTask, submitTask, completeTask, getWorkflowGraph, getCaseWorkflowHistory, getUsers, assignCase, updateCaseStatus, updateCase, getCommunications, createCommunication, getCaseCollaborators, addCaseCollaborator, removeCaseCollaborator, type CommunicationItem, type TimelineEventItem, type AnonymousDocumentListItem, type ImportAIResponseResult, type TaskItem, type WorkflowGraph, type WorkflowNode, type CaseWorkflowHistoryItem, type User, type CaseCollaborator } from "@/lib/api";
import { AnonymizeModal, type AnonymizeResult } from "@/components/documents/AnonymizeModal";
import { RehydrateModal } from "@/components/documents/RehydrateModal";
import { CaseWorkspaceNav } from "@/components/cases/CaseWorkspaceNav";

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

const statusChip: Record<string, string> = {
  "Client Input": "bg-[#EFE9DC] text-[#6B675D] border-[#D7D0C3]",
  Draft: "bg-[#EAF0E7] text-[#2C4A35] border-[#BFD1C3]",
  "In Review": "bg-[#F6F1E3] text-[#67572A] border-[#DCCEA0]",
  Approved: "bg-[#E2EDE5] text-[#23472F] border-[#A6C0AF]",
  ARCHIVED: "bg-[#F3F4F6] text-[#64748B] border-[#E5E7EB]",
};

const docStatusBadge: Record<string, string> = {
  'Ready': 'bg-[#E2EDE5] text-[#23472F] border-[#A6C0AF]',
  'Review Needed': 'bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]',
  'Archived': 'bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]',
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
  if (!dueDate) return "bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]";
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return "bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]";
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;
  const dueTs = due.getTime();
  if (dueTs < todayStart) return "bg-[#FEF2F2] text-[#8b3a3a] border-[#d4b8b8]";
  if (dueTs < tomorrowStart) return "bg-[#fff8e1] text-[#8a6a00] border-[#f9c74f]";
  return "bg-[#E2EDE5] text-[#23472F] border-[#A6C0AF]";
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

      const [contracts, timeline, caseList, backendDocuments, anonDocs, communicationsResponse] = await Promise.all([
        getCaseContracts(effectiveCaseId).catch(() => []),
        getCaseTimeline(effectiveCaseId).catch(() => []),
        getCases(1, 200).catch(() => ({ data: [] })),
        getCaseDocuments(effectiveCaseId).catch(() => []),
        getCaseAnonymousDocuments(effectiveCaseId).catch(() => []),
        getCommunications({ caseId: effectiveCaseId, limit: 50 }).catch(() => ({ communications: [], pagination: { total: 0, limit: 50, offset: 0 } })),
      ]);
      setGeneratedContracts(contracts);
      setTimelineEvents(timeline);
      setAnonymousDocuments(anonDocs);
      setCommunications(communicationsResponse.communications || []);
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
      setDocuments(backendDocuments.map((doc) => ({
        id: doc.id,
        name: doc.fileName,
        type: doc.documentType,
        date: new Date(doc.createdAt).toLocaleDateString('hu-HU'),
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        status: doc.spWebUrl ? 'Ready' : 'Review Needed',
        version: doc.version || undefined,
      })));
    } catch (err) {
      console.error('Failed to load backend data:', err);
    }
  }, [resolvedParams.caseId, caseRecord]);

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
        const notePreview = isNote && item.content
          ? item.content.length > 80 ? item.content.slice(0, 80) + '…' : item.content
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
    communication: 'bg-[#F3F4F6] text-[#4B5563] border-[#E5E7EB]',
  };

  // Type-specific icon background colors (matches chip colors for visual coherence)
  const eventTypeIconBg: Record<CaseStoryEventType, string> = {
    timeline: 'bg-[#5B21B6]',
    document: 'bg-[#1D4ED8]',
    generation: 'bg-[#92400E]',
    task: 'bg-[#047857]',
    deadline: 'bg-[#B91C1C]',
    communication: 'bg-[#4B5563]',
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
      const docs = await getCaseDocuments(caseRecord.id);
      setDocuments(docs.map((doc) => ({
        id: doc.id,
        name: doc.fileName,
        type: doc.documentType,
        date: new Date(doc.createdAt).toLocaleDateString('hu-HU'),
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        status: doc.spWebUrl ? 'Ready' : 'Review Needed',
        version: doc.version || undefined,
      })));
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
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
        const docs = await getCaseDocuments(caseRecord.id);
        setDocuments(docs.map((doc) => ({
          id: doc.id,
          name: doc.fileName,
          type: doc.documentType,
          date: new Date(doc.createdAt).toLocaleDateString('hu-HU'),
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
          status: doc.spWebUrl ? 'Ready' : 'Review Needed',
          version: doc.version || undefined,
        })));
        
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
  const handleStartTask = async (taskId: string) => {
    setActionTaskId(taskId);
    try {
      await startTask(taskId);
      await loadTasks();
    } catch (err) {
      console.error('Failed to start task:', err);
    } finally {
      setActionTaskId(null);
    }
  };

  const handleSubmitTask = async (taskId: string) => {
    setActionTaskId(taskId);
    try {
      await submitTask(taskId);
      await loadTasks();
    } catch (err) {
      console.error('Failed to submit task:', err);
    } finally {
      setActionTaskId(null);
    }
  };

  const handleCompleteTask = async (taskId: string, approved: boolean) => {
    setActionTaskId(taskId);
    try {
      await completeTask(taskId, approved);
      await loadTasks();
    } catch (err) {
      console.error('Failed to complete task:', err);
    } finally {
      setActionTaskId(null);
    }
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
  const latestCommunication = communications[0] || null;
  const latestStoryEvents = [...caseStoryEvents]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 8);
  const openTasks = tasks.filter(
    (task) => !['COMPLETED', 'APPROVED', 'REJECTED', 'DECLINED', 'CANCELLED', 'ARCHIVED'].includes(String(task.status || '').toUpperCase())
  );
  const quickActions = [
    {
      title: 'Szerződés-workspace',
      helper: 'Munkapéldányok, klauzulák és szerkesztési műveletek.',
      action: () => router.push(`/documents/compare?caseId=${canonicalCaseId}`),
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
      title: 'Munkaórák',
      helper: 'Case-aware időrögzítés és munkacsomag kapcsolás.',
      action: () => router.push(`/time-entries?caseId=${canonicalCaseId}`),
      tone: 'paper',
    },
    {
      title: 'Leadási csomag',
      helper: 'Ügyvédi review-ra előkészített belső munkacsomag.',
      action: () => router.push(`/cases/${canonicalCaseId}/handoff`),
      tone: 'paper',
    },
  ];
  const nextStep = isArchived
    ? {
        title: 'Archivált ügy',
        helper: 'Az ügy lezárt, aktív workflow-lépés nincs.',
        label: 'Megtekintés',
        action: () => router.push(`/cases/${canonicalCaseId}/documents`),
      }
    : generatedContracts.length > 0
      ? {
          title: 'Szerződés-workspace megnyitása',
          helper: 'A módosított dokumentumok és klauzulák kezelése a szerkesztőben folytatható.',
          label: 'Workspace',
          action: () => router.push(`/documents/compare?caseId=${canonicalCaseId}`),
        }
      : documents.length > 0
        ? {
            title: 'Dokumentumtár megnyitása',
            helper: 'Feltöltött iratból anonimizálás, munkapéldány és leadási csomag indítható.',
            label: 'Dokumentumtár',
            action: () => router.push(`/cases/${canonicalCaseId}/documents`),
          }
        : {
            title: 'Dokumentum feltöltése',
            helper: 'Az ügykezelés első lépése egy munkadokumentum feltöltése.',
            label: 'Feltöltés',
            action: () => fileInputRef.current?.click(),
          };

  if (!caseRecord && timelineEvents.length === 0 && generatedContracts.length === 0 && documents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-[#6B655B]">Az ügy nem található</p>
          <button 
            onClick={() => router.push('/cases')}
            className="mt-4 px-4 py-2 bg-[#C9A227] text-white rounded hover:bg-[#B8911F]"
          >
            Vissza az ügylistához
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-hidden bg-[#D5CBA8]">
      <div className="mx-auto flex h-full max-w-[1480px] flex-col overflow-hidden border-x border-[rgba(22,32,26,0.12)] bg-[#EFE7CF] shadow-[0_24px_60px_rgba(22,32,26,0.16)]">
        <CaseWorkspaceNav
          caseId={canonicalCaseId}
          caseNumber={displayCaseNumber}
          title={displayTitle}
          clientName={displayClient}
          activeTab="overview"
          activeDocumentId={activeDocument?.id}
          helperText="Ügyáttekintés, dokumentumok és munkafolyamatok egy helyen."
        />
        <div className="min-h-0 flex flex-1 overflow-hidden">
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="space-y-4 p-5">
            <section className="border border-[rgba(22,32,26,0.10)] bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8E6A1B]">ÜGY MUNKATERÜLET</p>
                  <h1 className="mt-1 font-serif text-[32px] leading-tight text-[#16201A]">{displayTitle}</h1>
                  <p className="mt-2 text-[12px] text-[#7A8479]">
                    {displayCaseNumber} · {displayMatterType}
                  </p>
                </div>
                <span className={`shrink-0 rounded-[3px] border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${statusChip[caseRecord?.status || 'Draft'] || 'border-[#D8CDB6] bg-[#FBF6E7] text-[#3D4842]'}`}>
                  {getCaseStatusLabel(caseRecord?.status)}
                </span>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="border border-[#E5DCBE] bg-[#FBF6E7] p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#7A8479]">Ügyfél</p>
                  <p className="mt-1 text-[13px] font-semibold text-[#16201A]">{displayClient}</p>
                </div>
                <div className="relative border border-[#E5DCBE] bg-[#FBF6E7] p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#7A8479]">Felelős ügyvéd</p>
                  {assignedLawyer ? (
                    <>
                      <p className="mt-1 text-[13px] font-semibold text-[#16201A]">{assignedLawyer.name}</p>
                      <p className="text-[10px] text-[#7A8479]">{assignedLawyer.email}</p>
                    </>
                  ) : (
                    <button onClick={() => { setShowAssignDropdown(!showAssignDropdown); loadAvailableUsers(); }} className="mt-1 text-[11px] font-semibold text-[#8E6A1B]">
                      + Felelős ügyvéd hozzárendelése
                    </button>
                  )}
                  {showAssignDropdown && (
                    <div className="absolute left-3 top-full z-50 mt-1 max-h-48 w-64 overflow-y-auto border border-[#DDD7CA] bg-white shadow-lg">
                      {isLoadingUsers ? (
                        <p className="p-2 text-xs text-[#7B776D]">Felhasználók betöltése...</p>
                      ) : availableUsers.length > 0 ? (
                        availableUsers.map((user) => (
                          <button key={user.id} onClick={() => handleAssignLawyer(user.id)} disabled={isAssigning} className="w-full border-b border-[#ECE6DA] p-2 text-left text-xs hover:bg-[#FBF9F3] disabled:opacity-50">
                            <p className="font-medium text-[#1F2821]">{user.name}</p>
                            <p className="text-[10px] text-[#7B776D]">{user.email}</p>
                          </button>
                        ))
                      ) : (
                        <p className="p-2 text-xs text-[#7B776D]">Nincs elérhető felhasználó</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="border border-[#E5DCBE] bg-[#FBF6E7] p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#7A8479]">Résztvevők</p>
                  <p className="mt-1 text-[13px] font-semibold text-[#16201A]">{collaborators.length || 0} résztvevő</p>
                  {!isArchived && (
                    <div className="relative">
                      <button onClick={() => { setShowCollaboratorDropdown(!showCollaboratorDropdown); loadAvailableUsers(); }} className="mt-1 text-[10px] font-semibold text-[#8E6A1B]">+ Résztvevő hozzáadása</button>
                      {showCollaboratorDropdown && (
                        <div className="absolute left-0 top-full z-50 mt-1 w-72 border border-[#DDD7CA] bg-white shadow-lg">
                          <div className="border-b border-[#ECE6DA] p-2">
                            <select value={collaboratorRole} onChange={(e) => setCollaboratorRole(e.target.value)} className="w-full border border-[#DDD7CA] bg-white px-2 py-1 text-[10px]">
                              <option value="COLLABORATOR">Résztvevő</option>
                              <option value="REVIEWER">Ellenőrző</option>
                              <option value="ASSISTANT">Asszisztens</option>
                            </select>
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {availableUsers
                              .filter(u => u.id !== assignedLawyer?.id && !collaborators.some(c => c.userId === u.id))
                              .map((user) => (
                                <button key={user.id} onClick={() => handleAddCollaborator(user.id)} disabled={isAddingCollaborator} className="w-full border-b border-[#ECE6DA] p-2 text-left text-[10px] hover:bg-[#FBF9F3] disabled:opacity-50">
                                  <p className="font-medium text-[#1F2821]">{user.name}</p>
                                  <p className="text-[9px] text-[#7B776D]">{user.email}</p>
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="border border-[#E5DCBE] bg-[#FBF6E7] p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#7A8479]">Határidő</p>
                  {isEditingDeadline ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input type="date" value={deadlineInput} onChange={(e) => setDeadlineInput(e.target.value)} className="border border-[#DDD7CA] bg-white px-2 py-1 text-xs" />
                      <button onClick={handleSaveDeadline} disabled={isSavingDeadline} className="bg-[#1F4A33] px-2 py-1 text-[10px] text-white disabled:opacity-50">{isSavingDeadline ? '...' : 'Mentés'}</button>
                      <button onClick={handleCancelDeadline} className="border border-[#DDD7CA] px-2 py-1 text-[10px] text-[#514D45]">Mégse</button>
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-[#16201A]">{caseRecord?.deadline ? new Date(caseRecord.deadline).toLocaleDateString('hu-HU', { dateStyle: 'medium' }) : 'Nincs megadva'}</p>
                      {!isArchived && <button onClick={startEditingDeadline} className="text-[10px] font-semibold text-[#8E6A1B]">{caseRecord?.deadline ? 'Módosítás' : '+ Hozzáadás'}</button>}
                    </div>
                  )}
                </div>
                <div className="border border-[#E5DCBE] bg-[#FBF6E7] p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#7A8479]">Ügyfél szerepe</p>
                  {isEditingClientRole ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <select value={clientRoleInput} onChange={(e) => setClientRoleInput(e.target.value)} className="border border-[#DDD7CA] bg-white px-2 py-1 text-xs">
                        <option value="">Nincs megadva</option>
                        <option value="MEGBIZÓ">Megbízó</option>
                        <option value="ELLENÉRTDEKŰ FÉL">Ellenérdekű fél</option>
                        <option value="PARTNER">Partner</option>
                        <option value="EGYÉB">Egyéb</option>
                      </select>
                      <button onClick={handleSaveClientRole} className="bg-[#1F4A33] px-2 py-1 text-[10px] text-white">Mentés</button>
                      <button onClick={handleCancelClientRole} className="border border-[#DDD7CA] px-2 py-1 text-[10px] text-[#514D45]">Mégse</button>
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-[#16201A]">{caseRecord?.clientRole || 'Nincs megadva'}</p>
                      {!isArchived && <button onClick={handleEditClientRole} className="text-[10px] font-semibold text-[#8E6A1B]">{caseRecord?.clientRole ? 'Módosítás' : '+ Hozzáadás'}</button>}
                    </div>
                  )}
                </div>
                <div className="border border-[#E5DCBE] bg-[#FBF6E7] p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#7A8479]">Szakterület</p>
                  <p className="mt-1 text-[13px] font-semibold text-[#16201A]">{displayMatterType}</p>
                </div>
              </div>
            </section>

            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleFileUpload} className="hidden" disabled={isArchived} />

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {quickActions.map((action) => (
                <button
                  key={action.title}
                  type="button"
                  onClick={action.action}
                  disabled={action.disabled}
                  className={`border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    action.tone === 'primary'
                      ? 'border-[#173824] bg-[#1F4A33] text-[#F4EFDB] hover:bg-[#173824]'
                      : action.tone === 'gold'
                        ? 'border-[#8E6A1B] bg-[#B58A2A] text-white hover:bg-[#8E6A1B]'
                        : 'border-[#E5DCBE] bg-white text-[#16201A] hover:bg-[#FBF6E7]'
                  }`}
                >
                  <p className="text-[12px] font-semibold">{action.title}</p>
                  <p className={`mt-2 text-[11px] leading-relaxed ${action.tone === 'paper' ? 'text-[#7A8479]' : 'text-current opacity-80'}`}>{action.helper}</p>
                </button>
              ))}
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
              <div className="border border-[rgba(22,32,26,0.10)] bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-serif text-[18px] text-[#16201A]">ÜGY TÖRTÉNETE</h2>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-[#7A8479]">{caseStoryEvents.length} esemény</span>
                    {!isArchived && <button onClick={() => setIsAddingNote(true)} className="text-[10px] font-semibold text-[#8E6A1B]">+ Belső megjegyzés</button>}
                  </div>
                </div>
                {isAddingNote && (
                  <div className="mb-4 border border-[#E5DCBE] bg-[#FBF6E7] p-3">
                    <p className="mb-2 text-[10px] text-[#7B776D]">Új belső megjegyzés</p>
                    <textarea value={newNoteContent} onChange={(e) => setNewNoteContent(e.target.value)} placeholder="Írja be a megjegyzést..." rows={3} className="w-full resize-none border border-[#DDD7CA] bg-white px-3 py-2 text-xs focus:border-[#B58A2A] focus:outline-none" />
                    <div className="mt-2 flex gap-2">
                      <button onClick={handleAddCaseNote} disabled={!newNoteContent.trim() || isSavingNote} className="bg-[#B58A2A] px-3 py-1.5 text-[10px] text-white disabled:opacity-40">{isSavingNote ? 'Mentés...' : 'Mentés'}</button>
                      <button onClick={() => { setIsAddingNote(false); setNewNoteContent(''); }} className="border border-[#DDD7CA] px-3 py-1.5 text-[10px] text-[#7B776D]">Mégse</button>
                    </div>
                  </div>
                )}
                <p className="mb-4 text-[11px] text-[#7A8479]">Csak megtörtént, rögzített ügyesemények. Jövőbeli lépések a jobb oldali Következő lépés panelben jelennek meg.</p>
                {latestStoryEvents.length > 0 ? (
                  <div className="space-y-3 border-l border-[#D9E3CC] pl-4">
                    {latestStoryEvents.map((event) => (
                      <div key={event.id} className="relative">
                        <span className="absolute left-[-21px] top-1 h-3 w-3 rounded-full border border-[#B58A2A] bg-[#FBF6E7]" />
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[13px] font-semibold text-[#16201A]">{event.title}</p>
                          <span className="border border-[#E5DCBE] bg-[#FBF6E7] px-1.5 py-0.5 text-[9px] text-[#3D4842]">{event.sourceLabel}</span>
                        </div>
                        {event.description && <p className="mt-1 text-[11px] leading-relaxed text-[#3D4842]">{event.description}</p>}
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[10px] text-[#7A8479]">{new Date(event.timestamp).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' })}</span>
                          {event.link && <button onClick={() => router.push(event.link as string)} className="text-[10px] font-semibold text-[#8E6A1B]">{event.linkLabel || 'Megnyitás'}</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-dashed border-[#E5DCBE] bg-[#FBF6E7] p-4 text-xs text-[#7A8479]">Még nincs rögzített ügyesemény.</div>
                )}
              </div>

              <div className="border border-[rgba(22,32,26,0.10)] bg-white p-4">
                <h3 className="font-serif text-[17px] text-[#16201A]">Kiválasztott dokumentum</h3>
                {activeDocument ? (
                  <div className="mt-3 border border-[#E5DCBE] bg-[#FBF6E7] p-3">
                    <p className="truncate text-[13px] font-semibold text-[#16201A]">{activeDocument.name}</p>
                    <p className="mt-1 text-[10px] text-[#7A8479]">{activeDocument.type} {activeDocument.version ? `· ${activeDocument.version}` : ''} · {activeDocument.date}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={() => router.push(`/documents/compare?caseId=${canonicalCaseId}`)} className="bg-[#1F4A33] px-3 py-1.5 text-[10px] font-semibold text-[#F4EFDB]">Workspace</button>
                      <button onClick={() => handleDocumentClick(activeDocument)} disabled={isDownloading === activeDocument.id} className="border border-[#D8CDB6] bg-white px-3 py-1.5 text-[10px] font-semibold text-[#3D4842]">{isDownloading === activeDocument.id ? '...' : 'Letöltés'}</button>
                      <button onClick={() => handleAnonymizeDocument(activeDocument)} className="border border-[#D8CDB6] bg-white px-3 py-1.5 text-[10px] font-semibold text-[#3D4842]">Anonimizálás</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 border border-dashed border-[#E5DCBE] bg-[#FBF6E7] p-4 text-[11px] text-[#7A8479]">Még nincs kiválasztott dokumentum.</div>
                )}
              </div>
            </section>

            {!isArchived && assignedLawyer && (
              <section className="border border-[#F2E4BD] bg-[#FAEFCF] p-4">
                <p className="text-[12px] font-semibold text-[#16201A]">Ügy lezárása</p>
                <p className="mt-1 text-[11px] text-[#3D4842]">Az ügy lezárható. Az archiválás befejezettként jelöli az ügyet.</p>
                <button onClick={() => setShowCompleteConfirm(true)} className="mt-3 bg-[#1F4A33] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#F4EFDB]">Lezárás és archiválás</button>
              </section>
            )}

            {isArchived && (
              <section className="border border-[#E5DCBE] bg-[#FBF6E7] p-4">
                <p className="text-[12px] font-semibold text-[#16201A]">Archivált ügy</p>
                <p className="mt-1 text-[11px] text-[#3D4842]">Ez az ügy befejezett és archivált. Az aktív műveletek le vannak tiltva.</p>
              </section>
            )}
          </div>
        </main>

        <aside className="w-[352px] shrink-0 overflow-y-auto border-l border-[#D5CBA8] bg-[#F7F0D9] p-4">
          <div className="space-y-4">
            <section className="rounded-[8px] border border-[#173824] bg-[#1F4A33] p-4 text-[#F4EFDB] shadow-[0_6px_16px_rgba(31,74,51,0.20)]">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#B58A2A]">KÖVETKEZŐ LÉPÉS</p>
              <h3 className="mt-2 font-serif text-[20px] leading-tight">{nextStep.title}</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-[#F4EFDB]/78">{nextStep.helper}</p>
              <button onClick={nextStep.action} className="mt-3 w-full rounded-[5px] border border-[#8E6A1B] bg-[#B58A2A] px-3 py-2 text-[11px] font-semibold text-white hover:bg-[#8E6A1B]">{nextStep.label}</button>
            </section>

            <section className="border border-[#E5DCBE] bg-white p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A8479]">ÜGY MUNKATERV</h3>
                <span className="text-[10px] text-[#7A8479]">{workplanTasks.length}</span>
              </div>
              {workplanTasks.length > 0 ? (
                <div className="space-y-2">
                  {workplanTasks.slice(0, 4).map((task) => (
                    <div key={task.id} className="border border-[#E5DCBE] bg-[#FBF6E7] p-2">
                      <p className="text-[12px] font-semibold text-[#16201A]">{task.title}</p>
                      <p className="mt-1 text-[10px] text-[#7A8479]">Felelős: {task.assignedTo?.name || 'Nincs kijelölve'}</p>
                      <p className="mt-1 text-[10px] text-[#7A8479]">Státusz: {getTaskStatusLabel(task.status)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="border border-dashed border-[#E5DCBE] bg-[#FBF6E7] p-3 text-[11px] text-[#7A8479]">Még nincs munkaterv rögzítve.</p>
              )}
            </section>

            <section className="border border-[#E5DCBE] bg-white p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A8479]">ÜGYFÉL DOKUMENTUMAI</h3>
                <span className="text-[10px] text-[#7A8479]">{documents.length} fájl</span>
              </div>
              {uploadError && <div className="mb-2 border border-[#d4b8b8] bg-[#fef2f2] p-2 text-[10px] text-[#8b3a3a]">{uploadError}</div>}
              {isUploading && <div className="mb-2 border border-[#E5DCBE] bg-[#FBF6E7] p-2 text-[10px] text-[#3D4842]">Dokumentum feltöltése...</div>}
              {displayedDocs.length > 0 ? (
                <div className="space-y-2">
                  {displayedDocs.map((doc) => (
                    <div key={doc.id} className={`border p-2 ${highlightedTimelineId && doc.linkedTimelineId === highlightedTimelineId ? 'border-[#B58A2A] bg-[#FAEFCF]' : 'border-[#E5DCBE] bg-[#FBF6E7]'}`}>
                      <p className="truncate text-[12px] font-semibold text-[#16201A]">{doc.name}</p>
                      <p className="mt-1 text-[10px] text-[#7A8479]">{doc.type} {doc.version ? `· ${doc.version}` : ''}</p>
                    </div>
                  ))}
                  {hasMoreDocs && <button onClick={() => setShowAllDocs(!showAllDocs)} className="w-full border border-[#E5DCBE] py-2 text-[10px] font-semibold text-[#8E6A1B]">{showAllDocs ? 'Kevesebb megjelenítése' : `Összes dokumentum (${documents.length})`}</button>}
                </div>
              ) : (
                <p className="border border-dashed border-[#E5DCBE] bg-[#FBF6E7] p-3 text-[11px] text-[#7A8479]">Még nincs ügyféldokumentum.</p>
              )}
            </section>

            <section className="border border-[#E5DCBE] bg-white p-3">
              <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A8479]">SZERZŐDÉS-WORKSPACE MEGNYITÁSA</h3>
              <button onClick={() => router.push(`/documents/compare?caseId=${canonicalCaseId}`)} className="w-full bg-[#1F4A33] px-3 py-2 text-[11px] font-semibold text-[#F4EFDB]">Szerződés-workspace</button>
              <p className="mt-2 text-[10px] text-[#7A8479]">Klauzulák, prompt-copy és módosított munkapéldányok kezelése.</p>
            </section>

            <details className="border border-[#E5DCBE] bg-white p-3">
              <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A8479]">Külső AI promptok</summary>
              {anonymousDocuments.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {anonymousDocuments.map((anonDoc) => (
                    <div key={anonDoc.id} className="border border-[#E5DCBE] bg-[#FBF6E7] p-2">
                      <p className="truncate text-[11px] font-semibold text-[#16201A]">{anonDoc.name || 'Anonimizált dokumentum'}</p>
                      <button onClick={() => handleOpenRehydrate(anonDoc)} className="mt-2 border border-[#D8CDB6] bg-white px-2 py-1 text-[10px] text-[#3D4842]">AI válasz beillesztése</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-[10px] leading-relaxed text-[#7A8479]">Adminiculum nem hív külső AI-t. A promptok másolható munkafolyamatként kezelhetők.</p>
              )}
            </details>

            <section className="border border-[#E5DCBE] bg-white p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A8479]">FELADATOK</h3>
                <span className="text-[10px] text-[#7A8479]">{openTasks.length}</span>
              </div>
              {isLoadingTasks ? (
                <p className="py-3 text-center text-[10px] text-[#7A8479]">Feladatok betöltése...</p>
              ) : openTasks.length > 0 ? (
                <div className="space-y-2">
                  {openTasks.slice(0, 4).map((task) => (
                    <div key={task.id} className="border border-[#E5DCBE] bg-[#FBF6E7] p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-semibold text-[#16201A]">{task.title}</p>
                          <p className="mt-1 text-[10px] text-[#7A8479]">{task.assignedTo?.name || 'Nincs kijelölve'} · {getTaskStatusLabel(task.status)}</p>
                        </div>
                        <span className={`shrink-0 border px-1.5 py-0.5 text-[9px] ${getTaskDueDateTone(task.dueDate)}`}>{task.dueDate ? new Date(task.dueDate).toLocaleDateString('hu-HU') : 'Nincs határidő'}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(task.status === 'TODO' || task.status === 'ASSIGNED' || task.status === 'PENDING') && <button onClick={() => handleStartTask(task.id)} disabled={actionTaskId === task.id} className="bg-[#1F4A33] px-2 py-1 text-[9px] text-white disabled:opacity-50">{actionTaskId === task.id ? '...' : 'Indítás'}</button>}
                        {task.status === 'IN_PROGRESS' && <button onClick={() => handleSubmitTask(task.id)} disabled={actionTaskId === task.id} className="bg-[#B58A2A] px-2 py-1 text-[9px] text-white disabled:opacity-50">{actionTaskId === task.id ? '...' : 'Beküldés'}</button>}
                        {task.status === 'SUBMITTED' && (
                          <>
                            <button onClick={() => handleCompleteTask(task.id, true)} disabled={actionTaskId === task.id} className="bg-[#1F4A33] px-2 py-1 text-[9px] text-white disabled:opacity-50">{actionTaskId === task.id ? '...' : 'Jóváhagyás'}</button>
                            <button onClick={() => handleCompleteTask(task.id, false)} disabled={actionTaskId === task.id} className="border border-[#8B2A2A] bg-white px-2 py-1 text-[9px] text-[#8B2A2A] disabled:opacity-50">Elutasítás</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="border border-dashed border-[#E5DCBE] bg-[#FBF6E7] p-3 text-[11px] text-[#7A8479]">Még nincs nyitott feladat ehhez az ügyhöz.</p>
              )}
            </section>

            <section className="border border-[#E5DCBE] bg-white p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A8479]">BELSŐ JEGYZETEK / KOMMUNIKÁCIÓ</h3>
                <span className="text-[10px] text-[#7A8479]">{communications.length}</span>
              </div>
              {latestCommunication ? (
                <div className="border border-[#E5DCBE] bg-[#FBF6E7] p-2">
                  <p className="truncate text-[12px] font-semibold text-[#16201A]">{latestCommunication.subject || 'Nincs tárgy'}</p>
                  <p className="mt-1 text-[10px] text-[#7A8479]">{latestCommunication.senderName || 'Ismeretlen feladó'} · {latestCommunication.createdAt ? new Date(latestCommunication.createdAt).toLocaleDateString('hu-HU') : ''}</p>
                </div>
              ) : (
                <p className="border border-dashed border-[#E5DCBE] bg-[#FBF6E7] p-3 text-[11px] text-[#7A8479]">Még nincs rögzített kommunikáció.</p>
              )}
              <button onClick={() => router.push(`/cases/${canonicalCaseId}/communications`)} className="mt-3 w-full border border-[#D8CDB6] bg-white px-3 py-2 text-[10px] font-semibold text-[#3D4842]">Kommunikációs napló</button>
              <p className="mt-2 text-[9px] text-[#7A8479]">Rögzített kommunikációk összefoglalója, nem élő postafiók.</p>
            </section>

            <details className="border border-[#E5DCBE] bg-white p-3">
              <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A8479]">Munkafolyamat kontextus</summary>
              <div className="mt-3 space-y-2 text-[10px] text-[#3D4842]">
                <p>Aktuális lépés: <b>{currentWorkflowNode?.label || getWorkflowStatusLabel(workflowGraph?.currentStatus) || 'Nem elérhető'}</b></p>
                <p>Felelős: <b>{primaryWorkflowTask?.assignedTo?.name || 'Még nincs felelős'}</b></p>
                <p>Határidő: <b>{primaryWorkflowTask?.dueDate ? new Date(primaryWorkflowTask.dueDate).toLocaleDateString('hu-HU') : 'Nincs határidő'}</b></p>
                {workflowGraph?.possibleTransitions?.length ? (
                  <div className="flex flex-wrap gap-1 pt-2">
                    {workflowGraph.possibleTransitions.map((status) => (
                      <button key={status} onClick={() => handleWorkflowTransition(status)} disabled={isTransitioning || isArchived} className="bg-[#1F4A33] px-2 py-1 text-[9px] text-white disabled:opacity-50">
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

      {/* Complete Case Confirmation Modal */}
      {showCompleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md shadow-2xl border border-[#e4e2dd]">
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
              <p className="text-sm text-[#1F2821] mb-4">
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
                  className="px-4 py-2 text-xs font-bold uppercase tracking-widest border border-[#c3c8c1]/20 text-[#434843] hover:bg-[#f5f3ee]"
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
