"use client";

import { useState, use, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getCaseContracts, getCaseDocuments, getCases, getCaseTimeline, downloadContract, downloadDocument, uploadCaseDocument, getCaseAnonymousDocuments, getCaseTasks, startTask, submitTask, completeTask, getWorkflowGraph, getCaseWorkflowHistory, getUsers, assignCase, updateCaseStatus, updateCase, getCommunications, createCommunication, getCaseCollaborators, addCaseCollaborator, removeCaseCollaborator, type CommunicationItem, type TimelineEventItem, type AnonymousDocumentListItem, type ImportAIResponseResult, type TaskItem, type WorkflowGraph, type WorkflowNode, type CaseWorkflowHistoryItem, type User, type CaseCollaborator } from "@/lib/api";
import { AnonymizeModal, type AnonymizeResult } from "@/components/documents/AnonymizeModal";
import { RehydrateModal } from "@/components/documents/RehydrateModal";

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
    return events
      .filter((event) => !!event.createdAt)
      .map((event) => {
        const title = event.description?.trim()
          ? event.description
          : `Workflow event: ${event.typeLabel || event.type}`;
        return {
          id: `timeline:${event.id}`,
          dedupeKey: `timeline|${event.id}`,
          type: 'timeline' as const,
          title,
          timestamp: event.createdAt,
          description: event.user?.name ? `Recorded by ${event.user.name}` : undefined,
          sourceLabel: 'Case timeline',
          link: `/cases/${canonicalCaseId}`,
          linkLabel: 'Open case workspace',
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
        title: `Document added: ${doc.name}`,
        timestamp: createdTs,
        description: doc.type ? `Type: ${doc.type}` : undefined,
        sourceLabel: 'Documents',
        link: `/cases/${canonicalCaseId}/documents`,
        linkLabel: 'Open documents',
        sourcePriority: 3,
      });

      if (doc.updatedAt && doc.createdAt && toEpoch(doc.updatedAt) - toEpoch(doc.createdAt) > 60_000) {
        events.push({
          id: `document:${doc.id}:updated`,
          dedupeKey: `document-updated|${doc.id}|${doc.updatedAt}`,
          type: 'document',
          title: `Document updated: ${doc.name}`,
          timestamp: doc.updatedAt,
          description: doc.type ? `Type: ${doc.type}` : undefined,
          sourceLabel: 'Documents',
          link: `/cases/${canonicalCaseId}/documents`,
          linkLabel: 'Open documents',
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
        title: `Generated document: ${item.title || item.fileName}${item.parentRevisionId ? ' (Szerkesztett verzió)' : ''}`,
        timestamp: item.generatedAt,
        sourceLabel: 'Generation',
        link: `/cases/${canonicalCaseId}/review/${item.id}`,
        linkLabel: 'Open review',
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
        title: `Task deadline: ${task.title}`,
        timestamp: task.dueDate as string,
        description: `Current status: ${task.status}`,
        sourceLabel: 'Tasks',
        link: `/cases/${canonicalCaseId}`,
        linkLabel: 'Open case tasks',
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
    ...mapDocumentsToStoryEvents(documents),
    ...mapContractsToStoryEvents(generatedContracts),
    ...mapTasksToStoryEvents(tasks),
    ...mapCommunicationsToStoryEvents(communications, documentTitleMap),
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
  const displayTitle = (caseRecord?.title && caseRecord.title !== 'null - null' && caseRecord.title !== 'null' && caseRecord.title !== 'undefined - undefined') ? caseRecord.title : 'Case title unavailable';
  const displayClient = caseRecord?.clientName && caseRecord.clientName !== 'null' && caseRecord.clientName !== 'undefined' ? caseRecord.clientName : 'Client unavailable';
  const displayMatterType = caseRecord?.matterType || 'Matter type unavailable';
  const displayRiskLevel = 'Unavailable';

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

  if (!caseRecord && timelineEvents.length === 0 && generatedContracts.length === 0 && documents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-[#6B655B]">Case not found</p>
          <button 
            onClick={() => router.push('/cases')}
            className="mt-4 px-4 py-2 bg-[#C9A227] text-white rounded hover:bg-[#B8911F]"
          >
            Back to Cases
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0 case-detail-surface">
      <aside className="w-56 border-r border-[#DDD7CA] bg-[#F6F2E8] flex flex-col">
        <div className="p-4 border-b border-[#DDD7CA]">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-2">Case Context</p>
          <p className="text-[11px] text-[#1F2821] font-semibold leading-tight">{displayTitle}</p>
          <p className="text-[10px] text-[#7B776D] mt-1">{displayCaseNumber}</p>
          <button
            onClick={() => router.push(`/cases/${canonicalCaseId}/documents`)}
            className="mt-3 w-full py-2 text-[10px] uppercase tracking-[0.2em] bg-[#1A2E21] text-white hover:bg-[#0F1F14] flex items-center justify-center gap-2"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Dokumentumok megnyitása
          </button>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          <div className="px-3 py-2 text-xs font-semibold rounded bg-[#C9A227] text-white">
            Ügy áttekintés
          </div>
          <button
            onClick={() => router.push(`/cases/${canonicalCaseId}/documents`)}
            className="w-full text-left px-3 py-2 text-xs text-[#514D45] hover:bg-[#ECE6DA] rounded"
          >
            Dokumentumok
          </button>
          <button
            onClick={() => router.push(`/cases/${canonicalCaseId}/generate`)}
            className="w-full text-left px-3 py-2 text-xs text-[#514D45] hover:bg-[#ECE6DA] rounded"
          >
            Generálás
          </button>
          <button
            onClick={() => router.push(`/cases/${canonicalCaseId}/communications`)}
            className="w-full text-left px-3 py-2 text-xs text-[#514D45] hover:bg-[#ECE6DA] rounded"
          >
            Kommunikációk
          </button>
          <button
            onClick={() => router.push('/time-entries')}
            className="w-full text-left px-3 py-2 text-xs text-[#514D45] hover:bg-[#ECE6DA] rounded"
          >
            Munkaórák
          </button>
        </nav>
        <div className="p-3 border-t border-[#DDD7CA]">
          <button 
            onClick={() => router.push('/cases')}
            className="w-full text-left px-3 py-2 text-xs text-[#514D45] hover:bg-[#ECE6DA] rounded flex items-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Vissza az ügylistához
          </button>
        </div>
      </aside>

      <div className="flex-1 flex min-h-0">
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-8">
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[9px] uppercase tracking-[0.35em] text-[#7B776D] px-2 py-1 bg-[#ECE6DA]">Ügy munkaterület</span>
                <span className={`text-[9px] uppercase tracking-[0.35em] px-2 py-1 border ${statusChip[caseRecord?.status || 'Draft'] || 'bg-[#EFE9DC] text-[#6B675D] border-[#D7D0C3]'}`}>
                  {caseRecord?.status || 'Unavailable'}
                </span>
              </div>
              <h1 className="text-3xl font-serif text-[#1F2821] leading-tight">{displayTitle}</h1>
              <div className="flex items-center gap-6 mt-4 text-xs text-[#7B776D]">
                <div>
                  <span className="uppercase tracking-[0.2em] text-[9px]">Client</span>
                  <p className="text-[#1F2821] mt-0.5 font-medium">{displayClient}</p>
                </div>
                <div>
                  <span className="uppercase tracking-[0.2em] text-[9px]">Felelős ügyvéd</span>
                  {assignedLawyer ? (
                    <div className="mt-1">
                      <p className="text-[#1F2821] mt-0.5 font-medium">{assignedLawyer.name}</p>
                      <p className="text-[10px] text-[#7B776D]">{assignedLawyer.email}</p>
                    </div>
                  ) : (
                    <div className="relative mt-1">
                      <button
                        onClick={() => { setShowAssignDropdown(!showAssignDropdown); loadAvailableUsers(); }}
                        className="text-[#C9A227] text-xs underline hover:text-[#B8911F]"
                      >
                        + Assign lawyer
                      </button>
                      {showAssignDropdown && (
                        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-[#DDD7CA] shadow-lg z-50 max-h-48 overflow-y-auto">
                          {isLoadingUsers ? (
                            <p className="p-2 text-xs text-[#7B776D]">Loading users...</p>
                          ) : availableUsers.length > 0 ? (
                            availableUsers.map((user) => (
                              <button
                                key={user.id}
                                onClick={() => handleAssignLawyer(user.id)}
                                disabled={isAssigning}
                                className="w-full p-2 text-left text-xs hover:bg-[#FBF9F3] border-b border-[#ECE6DA] last:border-b-0 disabled:opacity-50"
                              >
                                <p className="font-medium text-[#1F2821]">{user.name}</p>
                                <p className="text-[10px] text-[#7B776D]">{user.email}</p>
                              </button>
                            ))
                          ) : (
                            <p className="p-2 text-xs text-[#7B776D]">No users available</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {/* Collaborators Section */}
                <div>
                  <span className="uppercase tracking-[0.2em] text-[9px]">Résztvevők</span>
                  {isLoadingCollaborators ? (
                    <p className="text-[10px] text-[#9C9890] mt-1">Betöltés...</p>
                  ) : (
                    <div className="mt-1">
                      {collaborators.length > 0 ? (
                        <div className="space-y-1">
                          {collaborators.map((collab) => (
                            <div key={collab.id} className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-[#8B5CF6] text-white flex items-center justify-center text-[9px] font-medium flex-shrink-0">
                                {collab.user?.name?.charAt(0).toUpperCase() || '?'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[#1F2821] text-xs truncate">{collab.user?.name || 'Ismeretlen'}</p>
                                <p className="text-[9px] text-[#7B776D] truncate">{collab.user?.email || ''}</p>
                              </div>
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#8B5CF6]/10 text-[#8B5CF6] border border-[#8B5CF6]/20 flex-shrink-0">
                                {collab.role}
                              </span>
                              {!isArchived && (
                                <button
                                  onClick={() => handleRemoveCollaborator(collab.id)}
                                  className="text-[#9C9890] hover:text-[#DC2626] flex-shrink-0"
                                  title="Résztvevő eltávolítása"
                                >
                                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-[#9C9890]">Nincs résztvevő</p>
                      )}
                      {!isArchived && (
                        <div className="relative mt-2">
                          <button
                            onClick={() => { setShowCollaboratorDropdown(!showCollaboratorDropdown); loadAvailableUsers(); }}
                            className="text-[#8B5CF6] text-[10px] underline hover:text-[#7C3AED]"
                          >
                            + Résztvevő hozzáadása
                          </button>
                          {showCollaboratorDropdown && (
                            <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-[#DDD7CA] shadow-lg z-50">
                              <div className="p-2 border-b border-[#ECE6DA]">
                                <select
                                  value={collaboratorRole}
                                  onChange={(e) => setCollaboratorRole(e.target.value)}
                                  className="w-full text-[10px] border border-[#DDD7CA] rounded px-2 py-1 bg-white"
                                >
                                  <option value="COLLABORATOR">Résztvevő</option>
                                  <option value="REVIEWER">Ellenőrző</option>
                                  <option value="ASSISTANT">Asszisztens</option>
                                </select>
                              </div>
                              <div className="max-h-48 overflow-y-auto">
                                {isLoadingUsers ? (
                                  <p className="p-2 text-[10px] text-[#7B776D]">Betöltés...</p>
                                ) : availableUsers.filter(u => u.id !== assignedLawyer?.id && !collaborators.some(c => c.userId === u.id)).length > 0 ? (
                                  availableUsers
                                    .filter(u => u.id !== assignedLawyer?.id && !collaborators.some(c => c.userId === u.id))
                                    .map((user) => (
                                      <button
                                        key={user.id}
                                        onClick={() => handleAddCollaborator(user.id)}
                                        disabled={isAddingCollaborator}
                                        className="w-full p-2 text-left text-[10px] hover:bg-[#FBF9F3] border-b border-[#ECE6DA] last:border-b-0 disabled:opacity-50"
                                      >
                                        <p className="font-medium text-[#1F2821]">{user.name}</p>
                                        <p className="text-[9px] text-[#7B776D]">{user.email}</p>
                                      </button>
                                    ))
                                ) : (
                                  <p className="p-2 text-[10px] text-[#7B776D]">Nincs elérhető felhasználó</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <span className="uppercase tracking-[0.2em] text-[9px]">Szakterület</span>
                  <p className="text-[#1F2821] mt-0.5">{displayMatterType}</p>
                </div>
                <div>
                  <span className="uppercase tracking-[0.2em] text-[9px]">Határidő</span>
                  {isEditingDeadline ? (
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="date"
                        value={deadlineInput}
                        onChange={(e) => setDeadlineInput(e.target.value)}
                        className="text-xs border border-[#DDD7CA] rounded px-2 py-1 bg-white"
                      />
                      <button
                        onClick={handleSaveDeadline}
                        disabled={isSavingDeadline}
                        className="text-[9px] px-2 py-1 bg-[#059669] text-white rounded hover:bg-[#047857] disabled:opacity-50"
                      >
                        {isSavingDeadline ? '...' : 'Mentés'}
                      </button>
                      <button
                        onClick={handleCancelDeadline}
                        className="text-[9px] px-2 py-1 border border-[#DDD7CA] text-[#514D45] rounded hover:bg-[#FBF9F3]"
                      >
                        Mégse
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <p className={`text-[#1F2821] mt-0.5 font-medium ${caseRecord?.deadline ? 'text-[#DC2626]' : 'text-[#9C9890]'}`}>
                        {caseRecord?.deadline
                          ? new Date(caseRecord.deadline).toLocaleDateString('hu-HU')
                          : 'Nincs megadva'}
                      </p>
                      {!isArchived && (
                        <button
                          onClick={startEditingDeadline}
                          className="text-[9px] text-[#C9A227] hover:underline"
                        >
                          {caseRecord?.deadline ? 'Módosítás' : '+ Hozzáadás'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <span className="uppercase tracking-[0.2em] text-[9px]">Ügyfél szerepe</span>
                  {isEditingClientRole ? (
                    <div className="mt-1 flex items-center gap-2">
                      <select
                        value={clientRoleInput}
                        onChange={(e) => setClientRoleInput(e.target.value)}
                        className="text-xs border border-[#DDD7CA] rounded px-2 py-1 bg-white"
                      >
                        <option value="">Nincs megadva</option>
                        <option value="MEGBIZÓ">Megbízó</option>
                        <option value="ELLENÉRTDEKŰ FÉL">Ellenérdekű fél</option>
                        <option value="PARTNER">Partner</option>
                        <option value="EGYÉB">Egyéb</option>
                      </select>
                      <button
                        onClick={handleSaveClientRole}
                        className="text-[9px] px-2 py-1 bg-[#059669] text-white rounded hover:bg-[#047857]"
                      >
                        Mentés
                      </button>
                      <button
                        onClick={handleCancelClientRole}
                        className="text-[9px] px-2 py-1 border border-[#DDD7CA] text-[#514D45] rounded hover:bg-[#FBF9F3]"
                      >
                        Mégse
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-[#1F2821] mt-0.5">
                        {caseRecord?.clientRole || 'Nincs megadva'}
                      </p>
                      {!isArchived && (
                        <button
                          onClick={handleEditClientRole}
                          className="text-[9px] text-[#C9A227] hover:underline"
                        >
                          {caseRecord?.clientRole ? 'Módosítás' : '+ Hozzáadás'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mb-8">
              <div className="grid grid-cols-3 gap-3">
                <button 
                  onClick={() => router.push(`/cases/${canonicalCaseId}/generate`)}
                  disabled={isArchived}
                  className={`p-4 border bg-white text-left transition-colors ${isArchived ? 'border-[#E5E7EB] opacity-50 cursor-not-allowed' : 'border-[#DDD7CA] hover:bg-[#FBF9F3]'}`}
                >
                  <div className={`w-8 h-8 rounded flex items-center justify-center mb-3 ${isArchived ? 'bg-[#9CA3AF]' : 'bg-[#C9A227]'}`}>
                    <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 2h7l5 5v13a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v6M9 14h6" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-[#1F2821]">Generálás indítása</p>
                  <p className="text-[10px] text-[#7B776D] mt-1">{isArchived ? 'Archivált ügy - csak megtekintés' : 'Sablon alapú dokumentumkészítés'}</p>
                </button>
                <button 
                  onClick={() => !isArchived && fileInputRef.current?.click()}
                  disabled={isArchived}
                  className={`p-4 border bg-white text-left transition-colors ${isArchived ? 'border-[#E5E7EB] opacity-50 cursor-not-allowed' : 'border-[#DDD7CA] hover:bg-[#FBF9F3]'}`}
                >
                  <div className={`w-8 h-8 rounded flex items-center justify-center mb-3 ${isArchived ? 'bg-[#9CA3AF]' : 'bg-[#3B82F6]'}`}>
                    <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-[#1F2821]">Dokumentum feltöltése</p>
                  <p className="text-[10px] text-[#7B776D] mt-1">{isArchived ? 'Archivált ügy - csak megtekintés' : 'Ügyféltől érkezett fájl feltöltése'}</p>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isArchived}
                />
                <button 
                  onClick={() => router.push(`/cases/${canonicalCaseId}/communications`)}
                  className={`p-4 border bg-white text-left transition-colors ${isArchived ? 'border-[#E5E7EB] opacity-50' : 'border-[#DDD7CA] hover:bg-[#FBF9F3]'}`}
                >
                  <div className={`w-8 h-8 rounded flex items-center justify-center mb-3 ${isArchived ? 'bg-[#9CA3AF]' : 'bg-[#059669]'}`}>
                    <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5H4.5A2.25 2.25 0 002.25 6.5m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-[#1F2821]">Kommunikációk megnyitása</p>
                  <p className="text-[10px] text-[#7B776D] mt-1">{isArchived ? 'Archivált ügy - csak megtekintés' : 'Belső és ügyfélkommunikációk kezelése'}</p>
                </button>
                <button
                  onClick={() => router.push('/time-entries')}
                  className={`p-4 border bg-white text-left transition-colors ${isArchived ? 'border-[#E5E7EB] opacity-50' : 'border-[#DDD7CA] hover:bg-[#FBF9F3]'}`}
                >
                  <div className={`w-8 h-8 rounded flex items-center justify-center mb-3 ${isArchived ? 'bg-[#9CA3AF]' : 'bg-[#8B5CF6]/50'}`}>
                    <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-[#1F2821]">Munkaórák</p>
                  <p className="text-[10px] text-[#7B776D] mt-1">{isArchived ? 'Archivált ügy - csak megtekintés' : 'Rögzített munkaórák megnyitása'}</p>
                </button>
              </div>
            </div>

            <div className="border-t border-[#DDD7CA] pt-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs uppercase tracking-[0.28em] text-[#7B776D]">Case Story</h2>
                <div className="flex items-center gap-3">
                  <p className="text-[10px] text-[#9C9890]">{caseStoryEvents.length} events</p>
                  {!isArchived && (
                    <button
                      onClick={() => setIsAddingNote(true)}
                      className="text-[10px] text-[#C9A227] hover:underline"
                    >
                      + Belső megjegyzés
                    </button>
                  )}
                </div>
              </div>
              {isAddingNote && (
                <div className="mb-4 p-3 bg-[#F6F2E8] border border-[#DDD7CA]">
                  <p className="text-[10px] text-[#7B776D] mb-2">Új belső megjegyzés</p>
                  <textarea
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    placeholder="Írja be a megjegyzést..."
                    rows={3}
                    className="w-full text-xs border border-[#DDD7CA] bg-white px-3 py-2 resize-none focus:outline-none focus:border-[#C9A227]"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={handleAddCaseNote}
                      disabled={!newNoteContent.trim() || isSavingNote}
                      className="px-3 py-1.5 text-[10px] bg-[#C9A227] text-white disabled:opacity-40 hover:bg-[#B8911F]"
                    >
                      {isSavingNote ? 'Mentés...' : 'Mentés'}
                    </button>
                    <button
                      onClick={() => { setIsAddingNote(false); setNewNoteContent(''); }}
                      className="px-3 py-1.5 text-[10px] text-[#7B776D] border border-[#DDD7CA] hover:bg-[#EDE9DC]"
                    >
                      Mégse
                    </button>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-[#7B776D] mb-4">
                This timeline shows recorded activity currently available for this case across workflow, documents, generation, tasks, and communications.
              </p>
              <div className="relative">
                <div className="absolute left-[18px] top-0 bottom-0 w-px bg-[#DDD7CA]" />
                <div className="space-y-8">
                  {caseStoryEvents.length > 0 ? (
                    dayGroupedEvents.map((group) => (
                      <div key={group.date}>
                        <div className="flex items-center gap-3 mb-3 mt-6 first:mt-0">
                          <span className="text-[10px] font-semibold text-[#7B776D] uppercase tracking-wider">{group.label}</span>
                          <div className="flex-1 h-px bg-[#DDD7CA]" />
                          <span className="text-[10px] text-[#9C9890]">{group.events.length}</span>
                        </div>
                        <div className="space-y-6">
                          {group.events.map((event) => (
                            <div key={event.id} className="flex gap-4 relative transition-all duration-300">
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${event.isNote ? 'bg-[#92400E]' : eventTypeIconBg[event.type]} text-white`}>
                                {event.isNote ? (
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                                  </svg>
                                ) : getEventIcon(event.type)}
                              </div>
                              <div className="flex-1 pt-1">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <p className="text-sm font-semibold text-[#1F2821]">{event.title}</p>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${event.isNote ? 'bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]' : eventTypeChip[event.type]}`}>
                                    {event.sourceLabel}
                                  </span>
                                </div>
                                {event.description && (
                                  <p className="text-xs text-[#6B655B] leading-relaxed">{event.description}</p>
                                )}
                                <div className="flex items-center gap-2 mt-3 flex-wrap">
                                  <span className="text-[11px] text-[#9C9890]">
                                    {new Date(event.timestamp).toLocaleString('hu-HU', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  {event.link && (
                                    <button
                                      onClick={() => router.push(event.link as string)}
                                      className="text-[10px] text-[#C9A227] hover:underline"
                                    >
                                      {event.linkLabel || 'Open'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-[#9C9890] italic space-y-1">
                      <p>No recorded case activity yet.</p>
                      <p>Generate or upload documents, update tasks, and log communications to populate the case story.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-12 p-6 bg-[#F6F2E8] border border-[#DDD7CA]">
              <h3 className="text-[10px] uppercase tracking-[0.28em] text-[#7B776D] mb-4">Ügyállapot</h3>
              <p className="text-xs text-[#6B655B] leading-relaxed">
                {caseRecord ? `Aktuális ügyállapot: ${caseRecord.status}.` : 'Az ügyállapot jelenleg nem érhető el.'}
              </p>
            </div>

            {/* Case Completion Actions - only for non-archived cases with assigned lawyer */}
            {!isArchived && assignedLawyer && (
              <div className="mt-6 p-6 bg-[#FEF3C7] border border-[#FCD34D]">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-[#059669] text-white rounded flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-[#1F2821]">Case Completion</p>
                    <p className="text-xs text-[#6B655B] mt-1 leading-relaxed">
                      Ready to finalize this case? Archive the case to mark it as completed.
                    </p>
                    <button
                      onClick={() => setShowCompleteConfirm(true)}
                      className="mt-3 px-4 py-2 bg-[#059669] text-white text-xs font-bold uppercase tracking-widest hover:bg-[#047857] transition-colors"
                    >
                      Complete & Archive
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Archived case indicator */}
            {isArchived && (
              <div className="mt-6 p-6 bg-[#F3F4F6] border border-[#E5E7EB]">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-[#64748b] text-white rounded flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#1F2821]">Archived Case</p>
                    <p className="text-xs text-[#6B655B] mt-1 leading-relaxed">
                      This case has been completed and archived. All case data and documents are preserved and accessible in read-only mode. Active work actions are disabled.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 p-6 bg-[#FFFBEB] border border-[#FDE68A]">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-[#F59E0B] text-white rounded flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#1F2821]">Adatforrások</p>
                  <p className="text-xs text-[#6B655B] mt-1 leading-relaxed">
                    Ez a nézet a mentett ügy-, dokumentum-, feladat- és idővonal-adatokat jeleníti meg, hogy a következő workflow lépések egy helyről indíthatók legyenek.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>

        <aside className="w-80 border-l border-[#DDD7CA] bg-white overflow-y-auto">
          <div className="p-4 space-y-6">
            <div>
              <h3 className="text-[10px] uppercase tracking-[0.28em] text-[#7B776D] mb-3">Case workspace</h3>
              <p className="text-xs text-[#9C9890] italic">Operational panels only. No synthetic analytics shown.</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] uppercase tracking-[0.28em] text-[#7B776D]">Client Documents</h3>
                <span className="text-[10px] text-[#9C9890]">{documents.length} files</span>
              </div>
              {uploadError && (
                <div className="mb-3 p-2 bg-[#fef2f2] border border-[#d4b8b8] text-[#8b3a3a] text-[10px]">
                  {uploadError}
                </div>
              )}
              {isUploading && (
                <div className="mb-3 p-2 bg-[#f0f9ff] border border-[#b8d4f0] text-[#3a6b8b] text-[10px]">
                  Uploading document...
                </div>
              )}
              {displayedDocs.length > 0 ? (
                <div className="space-y-2">
                      {displayedDocs.map((doc) => (
                        <div 
                          key={doc.id}
                          className={`p-3 border rounded transition-all ${
                            highlightedTimelineId && doc.linkedTimelineId === highlightedTimelineId 
                              ? 'border-[#C9A227] bg-[#FFFBEB]' 
                              : 'border-[#ECE6DA]'
                          }`}
                        >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <svg className="w-4 h-4 text-[#7B776D] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 2h7l5 5v13a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" />
                          </svg>
                          <div className="min-w-0">
                            <p className="text-xs text-[#1F2821] truncate font-medium">{doc.name}</p>
                            <p className="text-[10px] text-[#9C9890]">{doc.type} {doc.version && `• ${doc.version}`} • {doc.date}</p>
                          </div>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded flex-shrink-0 border ${docStatusBadge[doc.status]}`}>
                          {doc.status}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => handleDocumentClick(doc)}
                          disabled={isDownloading === doc.id}
                          className="text-[9px] px-2 py-1 border border-[#DDD7CA] text-[#514D45] rounded hover:bg-[#FBF9F3] disabled:opacity-50 flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                          </svg>
                          {isDownloading === doc.id ? '...' : 'Download'}
                        </button>
                        <button
                          onClick={() => handleAnonymizeDocument(doc)}
                          className="text-[9px] px-2 py-1 border border-[#8B5CF6] text-[#8B5CF6] rounded hover:bg-[#f5f3ff] flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                          </svg>
                          Anonymize
                        </button>
                      </div>
                    </div>
                  ))}
                  {hasMoreDocs && (
                    <button 
                      onClick={() => setShowAllDocs(!showAllDocs)}
                      className="w-full py-2 text-[10px] uppercase tracking-[0.2em] text-[#C9A227] hover:underline"
                    >
                      {showAllDocs ? 'Show Less' : `View All ${documents.length} Documents`}
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 border border-dashed border-[#DDD7CA]">
                  <svg className="w-8 h-8 mx-auto text-[#9C9890] mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 2h7l5 5v13a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v6M9 14h6" />
                  </svg>
                  <p className="text-xs text-[#9C9890]">No client documents yet</p>
                  <p className="text-[10px] text-[#B0A898] mt-1">Upload a client document to get started</p>
                </div>
              )}
            </div>

            {generatedContracts.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] uppercase tracking-[0.28em] text-[#C9A227]">Generated Contracts</h3>
                  <button
                    onClick={() => router.push(`/cases/${canonicalCaseId}/generate`)}
                    className="text-[10px] text-[#C9A227] hover:underline"
                  >
                    + New
                  </button>
                </div>
                <div className="space-y-2">
                  {generatedContracts.map((contract) => (
                    <div 
                      key={contract.id}
                      className="p-3 border border-[#C9A227] bg-[#FFFBEB] rounded"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <svg className="w-4 h-4 text-[#C9A227] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.801 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.87.688 2.006 1.649L19 6v-.75a2.25 2.25 0 00-2.25-2.25h-1.5" />
                          </svg>
                          <div className="min-w-0">
                            <p className="text-xs text-[#1F2821] truncate font-medium">{contract.title}</p>
                            <p className="text-[10px] text-[#9C9890]">{contract.fileName}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {contract.parentRevisionId && (
                                <span className="text-[8px] px-1 py-0.5 bg-[#EDE9FE] text-[#5B21B6] border border-[#C4B5FD] font-bold uppercase tracking-wide">
                                  Szerkesztett verzió
                                </span>
                              )}
                              {contract.revisionNumber && (
                                <span className="text-[8px] px-1 py-0.5 bg-[#EEE7D9] text-[#514D45] border border-[#DDD7CA] font-bold uppercase tracking-wide">
                                  Revision {contract.revisionNumber}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-[#7B776D] mt-1">
                        Generated: {new Date(contract.generatedAt).toLocaleString('hu-HU')}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleDownloadContract(contract.id, contract.fileName)}
                          disabled={isDownloading === contract.id}
                          className="text-[9px] px-2 py-1 border border-[#DDD7CA] text-[#514D45] rounded hover:bg-[#FBF9F3] disabled:opacity-50"
                        >
                          {isDownloading === contract.id ? '...' : 'Download'}
                        </button>
                        <button
                          onClick={() => router.push(`/cases/${canonicalCaseId}/review/${contract.id}`)}
                          className="text-[9px] px-2 py-1 bg-[#F59E0B] text-white rounded hover:bg-[#D97706]"
                        >
                          Review
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <button
                onClick={() => !isArchived && router.push(`/cases/${canonicalCaseId}/generate`)}
                disabled={isArchived}
                className={`w-full py-3 text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-colors ${isArchived ? 'bg-[#9CA3AF] text-white cursor-not-allowed' : 'bg-[#C9A227] text-white hover:bg-[#B8911F]'}`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.801 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.87.688 2.006 1.649L19 6v-.75a2.25 2.25 0 00-2.25-2.25h-1.5" />
                </svg>
                {isArchived ? 'Generate Document (Archived)' : 'Generate Document'}
              </button>
            </div>

            {/* Secure Bridge: AI Response Import */}
            {anonymousDocuments.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] uppercase tracking-[0.28em] text-[#8B5CF6]">AI Processing</h3>
                  <span className="text-[10px] text-[#9C9890]">{anonymousDocuments.length}</span>
                </div>
                <div className="space-y-2">
                  {anonymousDocuments.map((anonDoc) => (
                    <div 
                      key={anonDoc.id}
                      className="p-3 border border-[#8B5CF6]/30 bg-[#f5f3ff] rounded"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <svg className="w-4 h-4 text-[#8B5CF6] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                          </svg>
                          <div className="min-w-0">
                            <p className="text-xs text-[#1F2821] truncate font-medium">
                              {anonDoc.name || 'Anonymous Document'}
                            </p>
                            <p className="text-[10px] text-[#9C9890]">
                              {anonDoc.aiTask || 'Custom'} • {new Date(anonDoc.createdAt).toLocaleDateString('hu-HU')}
                            </p>
                          </div>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded flex-shrink-0 border ${
                          anonDoc.rehydrationStatus === 'COMPLETE' ? 'bg-[#E2EDE5] text-[#23472F] border-[#A6C0AF]' :
                          anonDoc.rehydrationStatus === 'PARTIAL' ? 'bg-[#fff8e1] text-[#8a6a00] border-[#f9c74f]' :
                          anonDoc.rehydrationStatus === 'FAILED' ? 'bg-[#fef2f2] text-[#8b3a3a] border-[#d4b8b8]' :
                          'bg-[#f5f3ff] text-[#8B5CF6] border-[#8B5CF6]/30'
                        }`}>
                          {anonDoc.rehydrationStatus || 'AWAITING_AI'}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => handleOpenRehydrate(anonDoc)}
                          className="text-[9px] px-2 py-1 bg-[#8B5CF6] text-white rounded hover:bg-[#7C3AED] flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                          </svg>
                          Import AI Response
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 border border-[#DDD7CA] bg-[#F9FAFB]">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-[#8B5CF6] text-white rounded flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#1F2821]">AI Secure Bridge</p>
                    <p className="text-[10px] text-[#6B655B] mt-1 leading-relaxed">
                      No anonymized documents yet. Anonymize a client document to start external AI processing.
                    </p>
                  </div>
                </div>
              </div>
            )}

              <div>
                <h3 className="text-[10px] uppercase tracking-[0.28em] text-[#7B776D] mb-3">Internal notes</h3>
                <button
                  onClick={() => router.push(`/cases/${canonicalCaseId}/communications`)}
                  className="w-full py-2 text-[10px] uppercase tracking-[0.2em] border border-[#DDD7CA] text-[#514D45] hover:bg-[#FBF9F3]"
                >
                  Open notes & communication log
                </button>
              </div>

              {/* Tasks Panel */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] uppercase tracking-[0.28em] text-[#059669]">Tasks</h3>
                  <span className="text-[10px] text-[#9C9890]">{tasks.length}</span>
                </div>
                {isLoadingTasks ? (
                  <div className="py-4 text-center text-[10px] text-[#9C9890]">Loading tasks...</div>
                ) : tasks.length > 0 ? (
                  <div className="space-y-2">
                    {tasks.slice(0, 5).map((task) => (
                      <div
                        key={task.id}
                        className="p-3 border border-[#059669]/30 bg-[#f0fdf4] rounded"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <svg className="w-4 h-4 text-[#059669] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                            </svg>
                            <div className="min-w-0">
                              <p className="text-xs text-[#1F2821] truncate font-medium">{task.title}</p>
                              <p className="text-[10px] text-[#9C9890]">
                                {task.priority && (
                                  <span className={`inline-block mr-2 ${
                                    task.priority === 'HIGH' ? 'text-[#DC2626]' :
                                    task.priority === 'MEDIUM' ? 'text-[#D97706]' : 'text-[#059669]'
                                  }`}>
                                    {task.priority}
                                  </span>
                                )}
                                {task.dueDate && (
                                  <span>Due: {new Date(task.dueDate).toLocaleDateString('hu-HU')}</span>
                                )}
                              </p>
                              {task.assignedTo && (
                                <p className="text-[10px] text-[#7B776D] mt-0.5">
                                  Assignee: {task.assignedTo.name}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded flex-shrink-0 border ${
                            task.status === 'COMPLETED' || task.status === 'APPROVED' ? 'bg-[#E2EDE5] text-[#23472F] border-[#A6C0AF]' :
                            task.status === 'REJECTED' || task.status === 'DECLINED' ? 'bg-[#fef2f2] text-[#8b3a3a] border-[#d4b8b8]' :
                            task.status === 'IN_PROGRESS' ? 'bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]' :
                            task.status === 'SUBMITTED' ? 'bg-[#EDE9FE] text-[#5B21B6] border-[#C4B5FD]' :
                            'bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]'
                          }`}>
                            {task.status}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          {/* Action buttons based on status */}
                          {(task.status === 'TODO' || task.status === 'ASSIGNED' || task.status === 'PENDING') && (
                            <button
                              onClick={() => handleStartTask(task.id)}
                              disabled={actionTaskId === task.id}
                              className="text-[9px] px-2 py-1 bg-[#059669] text-white rounded hover:bg-[#047857] disabled:opacity-50"
                            >
                              {actionTaskId === task.id ? '...' : 'Start'}
                            </button>
                          )}
                          {task.status === 'IN_PROGRESS' && (
                            <button
                              onClick={() => handleSubmitTask(task.id)}
                              disabled={actionTaskId === task.id}
                              className="text-[9px] px-2 py-1 bg-[#D97706] text-white rounded hover:bg-[#B45309] disabled:opacity-50"
                            >
                              {actionTaskId === task.id ? '...' : 'Submit'}
                            </button>
                          )}
                          {task.status === 'SUBMITTED' && (
                            <>
                              <button
                                onClick={() => handleCompleteTask(task.id, true)}
                                disabled={actionTaskId === task.id}
                                className="text-[9px] px-2 py-1 bg-[#059669] text-white rounded hover:bg-[#047857] disabled:opacity-50"
                              >
                                {actionTaskId === task.id ? '...' : '✓ Approve'}
                              </button>
                              <button
                                onClick={() => handleCompleteTask(task.id, false)}
                                disabled={actionTaskId === task.id}
                                className="text-[9px] px-2 py-1 bg-[#DC2626] text-white rounded hover:bg-[#B91C1C] disabled:opacity-50"
                              >
                                ✗ Reject
                              </button>
                            </>
                          )}
                          {(task.status === 'TODO' || task.status === 'ASSIGNED' || task.status === 'IN_PROGRESS') && (
                            <span className="text-[9px] px-2 py-1 border border-[#DDD7CA] text-[#9C9890] rounded">
                              Reassign from task board
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {tasks.length > 5 && (
                      <p className="text-[10px] text-[#9C9890] text-center py-2">
                        + {tasks.length - 5} more tasks
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 border border-dashed border-[#DDD7CA]">
                    <svg className="w-8 h-8 mx-auto text-[#9C9890] mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    <p className="text-xs text-[#9C9890]">No tasks for this case</p>
                  </div>
                )}
              </div>

              {/* Communication Summary Panel */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] uppercase tracking-[0.28em] text-[#3B82F6]">Communication Summary</h3>
                  <span className="text-[10px] text-[#9C9890]">{communications.length}</span>
                </div>
                {communications.length > 0 ? (
                  <div className="space-y-2">
                    {/* Latest Communication */}
                    {(() => {
                      const latest = communications[0];
                      const commTypeLabels: Record<string, string> = {
                        'EMAIL': 'Email',
                        'PHONE': 'Phone',
                        'MEETING': 'Meeting',
                        'LETTER': 'Letter',
                        'NOTE': 'Note',
                      };
                      const commTypeColors: Record<string, string> = {
                        'EMAIL': 'bg-[#3B82F6] text-white',
                        'PHONE': 'bg-[#8B5CF6] text-white',
                        'MEETING': 'bg-[#10B981] text-white',
                        'LETTER': 'bg-[#F59E0B] text-white',
                        'NOTE': 'bg-[#6B7280] text-white',
                      };
                      return (
                        <div className="p-3 border border-[#3B82F6]/30 bg-[#EFF6FF] rounded">
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${commTypeColors[latest.type] || 'bg-[#6B7280] text-white'}`}>
                              {commTypeLabels[latest.type] || latest.type}
                            </span>
                            <span className="text-[9px] text-[#9C9890]">
                              {latest.createdAt ? new Date(latest.createdAt).toLocaleDateString('hu-HU') : ''}
                            </span>
                          </div>
                          <p className="text-xs text-[#1F2821] font-medium truncate">{latest.subject || 'No subject'}</p>
                          <p className="text-[10px] text-[#7B776D] mt-1">
                            {latest.senderName || 'Unknown sender'}
                          </p>
                        </div>
                      );
                    })()}
                    
                    {/* Follow-up indicator */}
                    {(() => {
                      // Count communications with related tasks (follow-ups)
                      const followUpCount = communications.filter(c => c._count?.relatedTasks && c._count.relatedTasks > 0).length;
                      return (
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-[#7B776D]">Follow-up tasks:</span>
                          <span className={followUpCount > 0 ? 'text-[#F59E0B] font-medium' : 'text-[#9C9890]'}>
                            {followUpCount > 0 ? `${followUpCount} kapcsolt feladat` : 'nincs rögzített follow-up'}
                          </span>
                        </div>
                      );
                    })()}
                    
                    {/* Link to full communications */}
                    <button
                      onClick={() => router.push(`/cases/${canonicalCaseId}/communications`)}
                      className="w-full py-2 text-[10px] uppercase tracking-[0.2em] bg-[#3B82F6] text-white hover:bg-[#2563EB] flex items-center justify-center gap-2"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5H4.5A2.25 2.25 0 002.25 6.5m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                      </svg>
                      Open Communications
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-4 border border-dashed border-[#DDD7CA]">
                    <svg className="w-8 h-8 mx-auto text-[#9C9890] mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5H4.5A2.25 2.25 0 002.25 6.5m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                    <p className="text-[10px] text-[#9C9890] mb-2">No communications logged</p>
                    <p className="text-[9px] text-[#B0A898]">
                      This panel summarizes recorded case communications. Communications appear here once logged via the communications workflow.
                    </p>
                    <button
                      onClick={() => router.push(`/cases/${canonicalCaseId}/communications`)}
                      className="mt-3 w-full py-2 text-[10px] uppercase tracking-[0.2em] border border-[#DDD7CA] text-[#514D45] hover:bg-[#FBF9F3]"
                    >
                      Go to Communications
                    </button>
                  </div>
                )}
                
                {/* Scope note */}
                <p className="text-[9px] text-[#9C9890] mt-2 italic">
                  Summary of logged communications - not a live inbox.
                </p>
              </div>

              {/* Workflow Stage Tracker */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] uppercase tracking-[0.28em] text-[#6366F1]">Workflow</h3>
                  {workflowGraph && (
                    <span className="text-[10px] text-[#9C9890]">{workflowGraph.currentStatus}</span>
                  )}
                </div>
                {isLoadingWorkflow ? (
                  <div className="py-4 text-center text-[10px] text-[#9C9890]">Loading workflow...</div>
                ) : workflowGraph && workflowGraph.nodes.length > 0 ? (
                  <div className="space-y-1">
                    {workflowGraph.nodes.map((node: WorkflowNode, index: number) => (
                      <div key={node.id} className="flex items-center gap-2">
                        {/* Stage indicator */}
                        <div className="flex flex-col items-center">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium ${
                            node.status === 'completed' ? 'bg-[#059669] text-white' :
                            node.status === 'current' ? 'bg-[#6366F1] text-white ring-2 ring-[#6366F1]/30' :
                            'bg-[#F3F4F6] text-[#9C9890]'
                          }`}>
                            {node.status === 'completed' ? (
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <span>{index + 1}</span>
                            )}
                          </div>
                          {index < workflowGraph.nodes.length - 1 && (
                            <div className={`w-0.5 h-4 ${
                              node.status === 'completed' ? 'bg-[#059669]' : 'bg-[#E5E7EB]'
                            }`} />
                          )}
                        </div>
                        {/* Stage label */}
                        <div className="flex-1 py-1">
                          <p className={`text-[11px] ${
                            node.status === 'current' ? 'font-semibold text-[#1F2821]' :
                            node.status === 'completed' ? 'text-[#059669]' :
                            'text-[#9C9890]'
                          }`}>
                            {node.label}
                          </p>
                        </div>
                      </div>
                    ))}
                    {workflowGraph.possibleTransitions.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-[#E5E7EB]">
                        <p className="text-[10px] text-[#9C9890] mb-2">Available actions:</p>
                        <div className="flex flex-wrap gap-1">
                          {workflowGraph.possibleTransitions.map((status) => (
                            <button
                              key={status}
                              onClick={() => handleWorkflowTransition(status)}
                              disabled={isTransitioning || isArchived}
                              className="text-[9px] px-2 py-1 bg-[#6366F1] text-white rounded hover:bg-[#4F46E5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {isTransitioning ? '...' : status}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 border border-dashed border-[#DDD7CA]">
                    <svg className="w-8 h-8 mx-auto text-[#9C9890] mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.801 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.87.688 2.006 1.649L19 6v-.75a2.25 2.25 0 00-2.25-2.25h-1.5" />
                    </svg>
                    <p className="text-xs text-[#9C9890]">No workflow data available</p>
                  </div>
                )}
              </div>

              {/* Workflow-level context (derived from active case tasks + workflow history comments) */}
              <div className="mt-4 pt-4 border-t border-[#E5E7EB]">
                <h3 className="text-[10px] uppercase tracking-[0.28em] text-[#6366F1] mb-3">Workflow Context</h3>
                <div className="space-y-2 p-3 border border-[#E0E7FF] bg-[#F8FAFF] rounded">
                  <div className="flex items-start justify-between gap-3 text-[10px]">
                    <span className="text-[#7B776D]">Current step</span>
                    <span className="text-right text-[#1F2821] font-medium">
                      {currentWorkflowNode?.label || workflowGraph?.currentStatus || 'Unavailable'}
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-3 text-[10px]">
                    <span className="text-[#7B776D]">Assigned to</span>
                    <span className="text-right text-[#1F2821]">
                      {primaryWorkflowTask?.assignedTo?.name || 'No assignee yet'}
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-3 text-[10px]">
                    <span className="text-[#7B776D]">Due date</span>
                    <span className="text-right text-[#1F2821]">
                      {primaryWorkflowTask?.dueDate ? new Date(primaryWorkflowTask.dueDate).toLocaleDateString('hu-HU') : 'No due date'}
                    </span>
                  </div>

                  <div className="text-[10px]">
                    <p className="text-[#7B776D] mb-1">Related active task(s)</p>
                    {prioritizedActiveTasks.length > 0 ? (
                      <div className="space-y-1">
                        {prioritizedActiveTasks.slice(0, 3).map((task) => (
                          <p key={task.id} className="text-[#1F2821] truncate">• {task.title}</p>
                        ))}
                        {prioritizedActiveTasks.length > 3 && (
                          <p className="text-[#9C9890]">+ {prioritizedActiveTasks.length - 3} more</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-[#9C9890]">None linked</p>
                    )}
                  </div>

                  <div className="text-[10px]">
                    <p className="text-[#7B776D] mb-1">Latest workflow reason/comment</p>
                    {isLoadingWorkflowHistory ? (
                      <p className="text-[#9C9890]">Loading...</p>
                    ) : latestWorkflowComment?.comment ? (
                      <div>
                        <p className="text-[#1F2821] leading-relaxed">{latestWorkflowComment.comment}</p>
                        {latestWorkflowComment.userId && (() => {
                          const actorName = users.find(u => u.id === latestWorkflowComment.userId)?.name;
                          return actorName ? (
                            <p className="text-[#9C9890] mt-1">— {actorName}, {new Date(latestWorkflowComment.createdAt).toLocaleString('hu-HU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                          ) : null;
                        })()}
                      </div>
                    ) : (
                      <p className="text-[#9C9890]">No reason/comment recorded</p>
                    )}
                  </div>
                </div>
                <p className="text-[9px] text-[#9C9890] mt-2 italic">
                  Owner and due date are derived from active case tasks; reason/comment is sourced from workflow history.
                </p>
              </div>
          </div>
        </aside>
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
                <h2 className="text-lg font-['Newsreader'] font-bold text-white">Complete & Archive Case</h2>
                <p className="text-xs text-white/60 mt-1">This action cannot be undone</p>
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
                Are you sure you want to archive this case? The case data will be preserved but marked as completed.
              </p>
              <div className="bg-[#FEF3C7] border border-[#FCD34D] p-3 mb-4">
                <p className="text-xs text-[#92400E]">
                  <strong>Note:</strong> This will set the case status to ARCHIVED. You can still access all documents and case data.
                </p>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCompleteConfirm(false)}
                  className="px-4 py-2 text-xs font-bold uppercase tracking-widest border border-[#c3c8c1]/20 text-[#434843] hover:bg-[#f5f3ee]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCompleteCase}
                  disabled={isCompleting}
                  className="px-6 py-2 text-xs font-bold uppercase tracking-widest bg-[#059669] text-white hover:opacity-90 disabled:opacity-50"
                >
                  {isCompleting ? 'Archiving...' : 'Archive Case'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
