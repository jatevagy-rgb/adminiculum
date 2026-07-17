"use client";

import { useState, use, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getCommunications,
  getCommunicationById,
  linkCommunicationToCase,
  extractTaskFromCommunication,
  extractDeadlineFromCommunication,
  getCaseDocuments,
  addCommunicationAttachment,
  createCommunication,
  getCases,
  getCaseCollaborators,
  type CommunicationItem,
  type CommunicationDetail,
  type TaskListItem,
  type DocumentItem,
  type CaseCollaborator,
} from "@/lib/api";
import { CaseWorkspaceNav } from "@/components/cases/CaseWorkspaceNav";

type CommunicationsPageProps = {
  params: Promise<{ caseId: string }>;
};

const communicationTypeLabels: Record<string, string> = {
  'EMAIL': 'Ügyfélkommunikáció',
  'PHONE': 'Telefon',
  'MEETING': 'Meeting',
  'LETTER': 'Levél',
  'NOTE': 'Belső jegyzet',
};

const communicationTypeColors: Record<string, string> = {
  'EMAIL': 'bg-[#1F4A33] text-[#F7F0D9]',
  'PHONE': 'bg-[#B58A2A] text-white',
  'MEETING': 'bg-[#2F5E49] text-[#F7F0D9]',
  'LETTER': 'bg-[#8A6A2A] text-[#FBF6E7]',
  'NOTE': 'bg-[#5E6D63] text-[#FBF6E7]',
};

const taskStatusLabels: Record<string, string> = {
  'TODO': 'Teendő',
  'IN_PROGRESS': 'Folyamatban',
  'DONE': 'Kész',
  'COMPLETED': 'Kész',
  'SUBMITTED': 'Beküldve',
  'BLOCKED': 'Blokkolva',
  'CANCELLED': 'Törölve',
};

const taskStatusColors: Record<string, string> = {
  'TODO': 'bg-[#6B7280] text-white',
  'IN_PROGRESS': 'bg-[#F59E0B] text-white',
  'DONE': 'bg-[#10B981] text-white',
  'COMPLETED': 'bg-[#10B981] text-white',
  'SUBMITTED': 'bg-[#3B82F6] text-white',
  'BLOCKED': 'bg-[#DC2626] text-white',
  'CANCELLED': 'bg-[#9CA3AF] text-white',
};

const caseStatusLabels: Record<string, string> = {
  'DRAFT': 'Piszkozat',
  'ACTIVE': 'Aktív',
  'IN_REVIEW': 'Review alatt',
  'SUBMITTED': 'Beküldve',
  'APPROVED': 'Jóváhagyva',
  'ARCHIVED': 'Archivált',
};

const getCaseStatusLabel = (status?: string | null) => {
  const key = String(status || '').toUpperCase();
  return caseStatusLabels[key] || 'Ismeretlen állapot';
};

const getTaskStatusLabel = (status?: string | null) => {
  const key = String(status || '').toUpperCase();
  return taskStatusLabels[key] || 'Ismeretlen állapot';
};
const COMMUNICATION_LOAD_ERROR = 'A kommunikáció betöltése sikertelen.';
const COMMUNICATION_LOADING_LABEL = 'Kommunikáció betöltése…';
const COMMUNICATION_EMPTY_LABEL = 'Még nincs ügykommunikáció. Írj belső jegyzetet vagy rögzíts egyeztetést.';
const COMMUNICATION_UNSELECTED_LABEL = 'Válassz kommunikációt a részletek és utánkövetési lépések megtekintéséhez.';

export default function CommunicationsPageContent({ params }: CommunicationsPageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  // Real backend case data
  const [caseRecord, setCaseRecord] = useState<{
    id: string;
    caseNumber: string;
    title: string;
    clientName: string;
    matterType: string;
    status: string;
  } | null>(null);
  const [caseLoadError, setCaseLoadError] = useState(false);
  
  const [communications, setCommunications] = useState<CommunicationItem[]>([]);
  const [selectedComm, setSelectedComm] = useState<CommunicationDetail | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePane, setActivePane] = useState<'messages' | 'attachments' | 'tasks'>('messages');
  
  // Action states
  const [isLinkingCase, setIsLinkingCase] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [isExtractingDeadline, setIsExtractingDeadline] = useState(false);
  const [actionResult, setActionResult] = useState<{type: 'success' | 'error'; message: string} | null>(null);
  
  // Task creation form
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskPriority, setTaskPriority] = useState('MEDIUM');
  
  // Deadline extraction form
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineDescription, setDeadlineDescription] = useState('');

  // Attachment management state
  const [caseDocuments, setCaseDocuments] = useState<DocumentItem[]>([]);
  const [showAddAttachmentForm, setShowAddAttachmentForm] = useState(false);
  const [isLinkingAttachment, setIsLinkingAttachment] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState('');

  // Quick note (internal chat) state
  const [quickNoteSubject, setQuickNoteSubject] = useState('');
  const [quickNoteContent, setQuickNoteContent] = useState('');
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [noteResult, setNoteResult] = useState<{type: 'success' | 'error'; message: string} | null>(null);

  // Collaborators state for participant visibility
  const [collaborators, setCollaborators] = useState<CaseCollaborator[]>([]);
  const [isLoadingCollaborators, setIsLoadingCollaborators] = useState(false);

  const caseContextId = caseRecord?.id || resolvedParams.caseId;

  // Load communications list
  const loadCommunications = useCallback(async () => {
    try {
      setIsLoadingList(true);
      const data = await getCommunications({
        caseId: caseContextId,
        type: 'NOTE',
        limit: 50
      });
      setCommunications(data.communications);
    } catch (err) {
      console.error('Failed to load communications:', err);
      setCommunications([]);
      setError(COMMUNICATION_LOAD_ERROR);
    } finally {
      setIsLoadingList(false);
    }
  }, [caseContextId]);

  // Load communication detail
  const loadCommunicationDetail = useCallback(async (commId: string) => {
    try {
      setIsLoadingDetail(true);
      const detail = await getCommunicationById(commId);
      setSelectedComm(detail);
    } catch (err) {
      console.error('Failed to load communication detail:', err);
      setError(COMMUNICATION_LOAD_ERROR);
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    loadCommunications();
  }, [loadCommunications]);

  // Load case from backend
  useEffect(() => {
    const loadCase = async () => {
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
            matterType: record.matterType,
            status: record.status,
          });
          setCaseLoadError(false);
          return;
        }
        setCaseLoadError(true);
        setCaseRecord(null);
      } catch {
        setCaseLoadError(true);
        setCaseRecord(null);
      }
    };
    loadCase();
  }, [resolvedParams.caseId]);

  const handleSelectCommunication = (comm: CommunicationItem) => {
    setSelectedComm(null);
    loadCommunicationDetail(comm.id);
  };

  const handleLinkToCase = async () => {
    if (!selectedComm) return;
    
    try {
      setIsLinkingCase(true);
      setActionResult(null);
      
      const result = await linkCommunicationToCase(selectedComm.id, caseContextId);
      
      if (result.success) {
        setActionResult({ type: 'success', message: result.message });
        loadCommunications();
        loadCommunicationDetail(selectedComm.id);
      } else {
        setActionResult({ type: 'error', message: 'Nem sikerült ügyhöz kapcsolni.' });
      }
    } catch (err) {
      setActionResult({ type: 'error', message: 'Nem sikerült ügyhöz kapcsolni.' });
    } finally {
      setIsLinkingCase(false);
    }
  };

  const handleExtractTask = async () => {
    if (!selectedComm || !taskTitle.trim()) return;
    
    try {
      setIsCreatingTask(true);
      setActionResult(null);
      
      const result = await extractTaskFromCommunication(selectedComm.id, {
        title: taskTitle,
        description: taskDescription || selectedComm.summary || undefined,
        dueDate: taskDueDate || undefined,
        priority: taskPriority,
        caseId: caseContextId
      });
      
      if (result.success) {
        setActionResult({ type: 'success', message: `Feladat létrehozva: ${result.task.title}` });
        setTaskTitle('');
        setTaskDescription('');
        setTaskDueDate('');
        setTaskPriority('MEDIUM');
        loadCommunicationDetail(selectedComm.id);
      } else {
        setActionResult({ type: 'error', message: 'Nem sikerült feladatot létrehozni.' });
      }
    } catch (err) {
      setActionResult({ type: 'error', message: 'Nem sikerült feladatot létrehozni.' });
    } finally {
      setIsCreatingTask(false);
    }
  };

  const handleExtractDeadline = async () => {
    if (!selectedComm || !deadlineDate) return;
    
    try {
      setIsExtractingDeadline(true);
      setActionResult(null);
      
      const result = await extractDeadlineFromCommunication(selectedComm.id, {
        deadline: deadlineDate,
        description: deadlineDescription || undefined,
        caseId: caseContextId
      });
      
      if (result.success) {
        setActionResult({ type: 'success', message: `Határidő beállítva: ${new Date(deadlineDate).toLocaleDateString('hu-HU')}` });
        setDeadlineDate('');
        setDeadlineDescription('');
        loadCommunicationDetail(selectedComm.id);
      } else {
        setActionResult({ type: 'error', message: 'Nem sikerült határidőt rögzíteni.' });
      }
    } catch (err) {
      setActionResult({ type: 'error', message: 'Nem sikerült határidőt rögzíteni.' });
    } finally {
      setIsExtractingDeadline(false);
    }
  };

  // Load case documents for attachment linking
  const loadCaseDocuments = useCallback(async () => {
    try {
      const docs = await getCaseDocuments(caseContextId);
      setCaseDocuments(docs);
    } catch (err) {
      console.error('Failed to load case documents:', err);
      setCaseDocuments([]);
    }
  }, [caseContextId]);

  const handleAddAttachment = async () => {
    if (!selectedComm || !selectedDocId) return;
    
    const selectedDoc = caseDocuments.find(d => d.id === selectedDocId);
    if (!selectedDoc) return;
    
    try {
      setIsLinkingAttachment(true);
      setActionResult(null);
      
      const result = await addCommunicationAttachment(selectedComm.id, {
        documentId: selectedDocId,
        fileName: selectedDoc.fileName,
        fileType: selectedDoc.documentType || undefined,
      });
      
      if (result.success) {
        setActionResult({ type: 'success', message: `Melléklet hozzáadva: ${selectedDoc.fileName}` });
        setSelectedDocId('');
        setShowAddAttachmentForm(false);
        loadCommunicationDetail(selectedComm.id);
        loadCaseDocuments();
      } else {
        setActionResult({ type: 'error', message: 'Melléklet csatolása sikertelen.' });
      }
    } catch (err) {
      setActionResult({ type: 'error', message: 'Melléklet csatolása sikertelen.' });
    } finally {
      setIsLinkingAttachment(false);
    }
  };

  const handleCreateQuickNote = async () => {
    if (!quickNoteSubject.trim() || !quickNoteContent.trim()) return;
    
    try {
      setIsCreatingNote(true);
      setNoteResult(null);
      
      await createCommunication({
        type: 'NOTE',
        subject: quickNoteSubject.trim(),
        content: quickNoteContent.trim(),
        caseId: caseContextId,
        clientId: caseRecord?.clientName ? undefined : undefined,
      });
      
      setNoteResult({ type: 'success', message: 'Jegyzet elmentve.' });
      setQuickNoteSubject('');
      setQuickNoteContent('');
      loadCommunications();
    } catch (err) {
      setNoteResult({ type: 'error', message: 'Jegyzet mentése sikertelen.' });
    } finally {
      setIsCreatingNote(false);
    }
  };

  // Load collaborators for participant visibility
  const loadCollaborators = useCallback(async () => {
    if (!caseRecord?.id) return;
    setIsLoadingCollaborators(true);
    try {
      const data = await getCaseCollaborators(caseRecord.id);
      setCollaborators(data);
    } catch (err) {
      console.error('Failed to load collaborators:', err);
      setCollaborators([]);
    } finally {
      setIsLoadingCollaborators(false);
    }
  }, [caseRecord]);

  // Load collaborators when caseRecord is available
  useEffect(() => {
    if (caseRecord?.id) {
      loadCollaborators();
    }
  }, [caseRecord?.id, loadCollaborators]);

  // Load case documents when communication is selected
  useEffect(() => {
    if (selectedComm) {
      loadCaseDocuments();
    }
  }, [selectedComm, loadCaseDocuments]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('hu-HU', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  if (!caseRecord || caseLoadError) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-[#6B655B]">Az ügy nem érhető el. Próbáld újra később.</p>
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
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--adm-ivory-50)]">
      <CaseWorkspaceNav
        caseId={caseContextId}
        caseNumber={caseRecord.caseNumber}
        title={caseRecord.title}
        clientName={caseRecord.clientName}
        activeTab="communications"
        status={caseRecord.status}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)]">
      {/* LEFT PANE - Communication ledger */}
      <aside className="flex min-h-[360px] flex-col border-r border-[#DDD7CA] bg-[#F6F2E8] xl:min-h-0">
        {/* Case Participants Block */}
        <div className="hidden px-4 py-3 border-b border-[#DDD7CA]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[9px] uppercase tracking-[0.28em] text-[#1F4A33]">Résztvevők</h3>
            {isLoadingCollaborators && (
              <span className="text-[9px] text-[#9C9890]">...</span>
            )}
          </div>
          {collaborators.length > 0 ? (
            <div className="space-y-1.5">
              {collaborators.slice(0, 5).map((collab) => (
                <div key={collab.id} className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-[#1F4A33] text-[#FBF6E7] flex items-center justify-center text-[8px] font-medium flex-shrink-0">
                    {collab.user?.name?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-[#1F2821] truncate">{collab.user?.name || 'Ismeretlen'}</p>
                  </div>
                  <span className="text-[8px] px-1 py-0.5 rounded bg-[#1F4A33]/10 text-[#1F4A33] border border-[#1F4A33]/20 flex-shrink-0">
                    {collab.role === 'LAWYER' ? 'Ügyvéd' : collab.role === 'COLLABORATOR' ? 'Résztvevő' : collab.role === 'REVIEWER' ? 'Ellenőrző' : collab.role === 'ASSISTANT' ? 'Asszisztens' : collab.role}
                  </span>
                </div>
              ))}
              {collaborators.length > 5 && (
                <p className="text-[9px] text-[#9C9890] text-center">+ {collaborators.length - 5} további résztvevő</p>
              )}
            </div>
          ) : (
            <p className="text-[9px] text-[#9C9890]">Nincs résztvevő hozzáadva</p>
          )}
        </div>
        
        <div className="p-3 border-b border-[#DDD7CA]">
          <h2 className="font-serif text-lg font-semibold text-[#1F2821]">Kommunikáció</h2>
          <p className="mt-0.5 text-[10px] text-[#7B776D]">{communications.length} bejegyzés</p>
        </div>
        
        {/* Quick note input - chat-like internal note creation */}
        <div className="px-3 pt-3 pb-2 border-b border-[#DDD7CA]">
          {noteResult && (
            <div className={`mb-2 p-2 text-[10px] rounded ${
              noteResult.type === 'success' ? 'bg-[#F0FDF4] text-[#059669]' : 'bg-[#FEF2F2] text-[#DC2626]'
            }`}>
              {noteResult.message}
            </div>
          )}
          <div className="space-y-1.5">
            <input
              type="text"
              value={quickNoteSubject}
              onChange={(e) => setQuickNoteSubject(e.target.value)}
              placeholder="Belső jegyzet címe..."
              className="w-full px-2 py-1.5 text-[11px] border border-[#DDD7CA] bg-white text-[#1F2821] placeholder-[#9C9890]"
            />
            <textarea
              value={quickNoteContent}
              onChange={(e) => setQuickNoteContent(e.target.value)}
              placeholder="Belső ügykommunikációs jegyzet..."
              rows={2}
              className="w-full px-2 py-1.5 text-[11px] border border-[#DDD7CA] bg-white text-[#1F2821] resize-none placeholder-[#9C9890]"
            />
            <button
              onClick={handleCreateQuickNote}
              disabled={!quickNoteSubject.trim() || !quickNoteContent.trim() || isCreatingNote}
              className="w-full py-1.5 text-[10px] uppercase tracking-[0.1em] bg-[#1F4A33] text-[#FBF6E7] hover:bg-[#173824] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isCreatingNote ? 'Mentés...' : 'Jegyzet mentése'}
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="mx-4 mt-4 p-3 bg-[#FEF2F2] border border-[#FECACA] rounded">
              <p className="text-xs text-[#DC2626]">{error}</p>
            </div>
          )}
          {isLoadingList ? (
            <div className="p-4 text-center text-[#7B776D] text-xs">{COMMUNICATION_LOADING_LABEL}</div>
          ) : communications.length === 0 ? (
            <div className="p-4 text-center text-[#7B776D] text-xs">
              {COMMUNICATION_EMPTY_LABEL}
            </div>
          ) : (
            <div className="divide-y divide-[#DDD7CA]">
              {communications.map((comm) => (
                <button
                  key={comm.id}
                  onClick={() => handleSelectCommunication(comm)}
                  className={`w-full text-left p-3 hover:bg-[#ECE6DA] transition-colors border-l-2 ${
                    selectedComm?.id === comm.id ? 'bg-[#F3E7C6] border-l-[#B58A2A]' : 'border-l-transparent'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-medium ${communicationTypeColors[comm.type] || 'bg-[#6B7280] text-white'}`}>
                      {getInitials(comm.senderName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-[#1F2821] truncate">
                        {comm.senderName || 'Ismeretlen feladó'}
                      </p>
                      <p className="text-[10px] text-[#7B776D] mt-0.5 line-clamp-2">
                        {comm.subject}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded ${communicationTypeColors[comm.type]}`}>
                          {communicationTypeLabels[comm.type]}
                        </span>
                        {comm.caseId && (
                            <span className="text-[9px] text-[#10B981]">Ügyhöz kapcsolva</span>
                        )}
                        {comm.sourceTaskCount ? (
                          <span className="text-[9px] text-[#F59E0B]">
                            {comm.sourceTaskCount} feladat
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span className="text-[9px] text-[#9C9890] whitespace-nowrap">
                      {formatDate(comm.createdAt)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        
        <div className="hidden p-3 border-t border-[#DDD7CA]">
          <button 
            onClick={() => router.push(`/cases/${caseContextId}`)}
            className="w-full text-left px-3 py-2 text-xs text-[#514D45] hover:bg-[#ECE6DA] rounded flex items-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Vissza az ügyhöz
          </button>
        </div>
      </aside>

      {/* CENTER PANE - Selected communication */}
      <main className="flex min-h-[420px] min-w-0 flex-col bg-[#FBF6E7] xl:min-h-0">
        {!selectedComm ? (
            <div className="flex flex-1 items-center justify-center px-6">
            <div className="max-w-sm rounded-lg border border-[#DDD7CA] bg-white p-4 text-center">
              {error && (
                <div className="mb-4 p-3 bg-[#FEF2F2] border border-[#FECACA] rounded">
                  <p className="text-xs text-[#DC2626]">{error}</p>
                </div>
              )}
              {!error && (
                <>
                  {communications.length === 0 ? (
                    <>
                      <p className="text-sm font-medium text-[#1F2821]">Még nincs ügykommunikáció</p>
                      <p className="text-xs text-[#7B776D] mt-1">{COMMUNICATION_EMPTY_LABEL}</p>
                    </>
                  ) : (
                    <p className="text-xs text-[#7B776D]">{COMMUNICATION_UNSELECTED_LABEL}</p>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Compact Header */}
            <div className="px-6 py-4 border-b border-[#DDD7CA] bg-[#FAF8F2]">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0 ${communicationTypeColors[selectedComm.type] || 'bg-[#6B7280] text-white'}`}>
                  {getInitials(selectedComm.senderName)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#1F2821] truncate">
                    {selectedComm.senderName || 'Ismeretlen'}
                  </p>
                  <p className="text-[10px] text-[#9C9890]">{formatDate(selectedComm.createdAt)}</p>
                </div>
                <span className={`text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded flex-shrink-0 ${communicationTypeColors[selectedComm.type]}`}>
                  {communicationTypeLabels[selectedComm.type]}
                </span>
              </div>
              <h2 className="text-sm font-serif text-[#1F2821] leading-tight line-clamp-2">
                {selectedComm.subject}
              </h2>
            </div>

            {/* Action Results */}
            {actionResult && (
              <div className={`mx-6 mt-3 p-2 text-[10px] rounded ${
                actionResult.type === 'success'
                  ? 'bg-[#F0FDF4] text-[#059669]'
                  : 'bg-[#FEF2F2] text-[#DC2626]'
              }`}>
                {actionResult.message}
              </div>
            )}

            {/* Message Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="max-w-[75ch]">
                {selectedComm.content ? (
                  <div className="bg-[#F6F2E8] border border-[#DDD7CA] rounded-xl rounded-tl-sm p-4">
                    <div className="prose prose-sm max-w-none text-[#1F2821] whitespace-pre-wrap text-sm leading-relaxed">
                      {selectedComm.content}
                    </div>
                  </div>
                ) : (
                  <p className="text-[#9C9890] text-sm italic">
                    {selectedComm.summary || 'Nincs elérhető tartalom'}
                  </p>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="border-t border-[#DDD7CA]">
              <div className="flex px-6">
                <button
                  onClick={() => setActivePane('messages')}
                  className={`px-4 py-3 text-[10px] uppercase tracking-[0.2em] border-b-2 -mb-px ${
                    activePane === 'messages'
                      ? 'border-[#C9A227] text-[#C9A227]'
                      : 'border-transparent text-[#7B776D] hover:text-[#1F2821]'
                  }`}
                >
                  Üzenet
                </button>
                <button
                  onClick={() => setActivePane('attachments')}
                  className={`px-4 py-3 text-[10px] uppercase tracking-[0.2em] border-b-2 -mb-px ${
                    activePane === 'attachments'
                      ? 'border-[#C9A227] text-[#C9A227]'
                      : 'border-transparent text-[#7B776D] hover:text-[#1F2821]'
                  }`}
                >
                  Kapcsolódó dokumentumok ({selectedComm.attachments?.length || 0})
                </button>
                <button
                  onClick={() => setActivePane('tasks')}
                  className={`px-4 py-3 text-[10px] uppercase tracking-[0.2em] border-b-2 -mb-px ${
                    activePane === 'tasks'
                      ? 'border-[#C9A227] text-[#C9A227]'
                      : 'border-transparent text-[#7B776D] hover:text-[#1F2821]'
                  }`}
                >
                  Feladatok ({selectedComm.relatedTasks?.length || 0})
                </button>
              </div>

              <div className="p-6">
                {activePane === 'messages' && (
                  <div>
                    {selectedComm.summary && selectedComm.content && (
                      <div className="mt-4 p-3 bg-[#F6F2E8] border border-[#DDD7CA]">
                        <h4 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-2">Összefoglaló</h4>
                        <p className="text-xs text-[#1F2821]">{selectedComm.summary}</p>
                      </div>
                    )}
                  </div>
                )}

                {activePane === 'attachments' && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D]">Kapcsolódó dokumentumok</h4>
                      {selectedComm && caseDocuments.length > 0 && (
                        <button
                          onClick={() => setShowAddAttachmentForm(!showAddAttachmentForm)}
                          className="text-[9px] text-[#3B82F6] hover:text-[#2563EB]"
                        >
                          {showAddAttachmentForm ? 'Mégse' : '+ Hozzáadás az ügyből'}
                        </button>
                      )}
                    </div>

                    {showAddAttachmentForm && (
                      <div className="mb-4 p-3 border border-[#DDD7CA] bg-[#FAF8F2]">
                        <p className="text-[10px] text-[#7B776D] mb-2">Válassz kapcsolandó dokumentumot:</p>
                        <select
                          value={selectedDocId}
                          onChange={(e) => setSelectedDocId(e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-[#DDD7CA] bg-white text-[#1F2821] mb-2"
                        >
                          <option value="">-- Dokumentum kiválasztása --</option>
                          {caseDocuments.map((doc) => (
                            <option key={doc.id} value={doc.id}>{doc.fileName}</option>
                          ))}
                        </select>
                        <button
                          onClick={handleAddAttachment}
                          disabled={!selectedDocId || isLinkingAttachment}
                          className="w-full py-2 text-xs uppercase tracking-[0.2em] bg-[#3B82F6] text-white hover:bg-[#2563EB] disabled:opacity-50"
                        >
                          {isLinkingAttachment ? 'Kapcsolás...' : 'Dokumentum kapcsolása'}
                        </button>
                      </div>
                    )}

                    {selectedComm.attachments && selectedComm.attachments.length > 0 ? (
                      <div className="space-y-2">
                        {selectedComm.attachments.map((att) => (
                          <div key={att.id} className="p-3 border border-[#DDD7CA] bg-[#FAF8F2] flex items-center gap-3">
                            <svg className="w-5 h-5 text-[#7B776D]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            <div className="flex-1">
                              <p className="text-sm text-[#1F2821]">{att.fileName}</p>
                              {att.description && (
                                <p className="text-[10px] text-[#7B776D]">{att.description}</p>
                              )}
                            </div>
                            {att.spItemId ? (
                              <span className="text-[9px] text-[#10B981] bg-[#F0FDF4] px-2 py-1 rounded">
                                SharePointhoz kapcsolva
                              </span>
                            ) : (
                              <span className="text-[9px] text-[#9C9890] italic">
                                Nem elérhető
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[#9C9890] text-xs">Nincs melléklet</p>
                    )}
                  </div>
                )}

                {activePane === 'tasks' && (
                  <div>
                    <h4 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-4">Kapcsolódó feladatok</h4>
                    {selectedComm.relatedTasks && selectedComm.relatedTasks.length > 0 ? (
                      <div className="space-y-2">
                        {selectedComm.relatedTasks.map((task) => (
                          <div key={task.id} className="p-3 border border-[#DDD7CA] bg-[#FAF8F2]">
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-[#1F2821] font-medium">{task.title}</p>
                              <span className={`text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded ${
                                taskStatusColors[task.status] || 'bg-[#6B7280] text-white'
                              }`}>
                                {getTaskStatusLabel(task.status)}
                              </span>
                            </div>
                            {task.description && (
                              <p className="text-[10px] text-[#7B776D] mt-1">{task.description.substring(0, 100)}...</p>
                            )}
                            {task.dueDate && (
                              <p className="text-[10px] text-[#DC2626] mt-2">
                                Határidő: {new Date(task.dueDate).toLocaleDateString('hu-HU')}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[#9C9890] text-xs">Ehhez a kommunikációhoz nincs létrehozott feladat</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* Selected communication follow-up */}
      {selectedComm ? (
      <aside className="border-t border-[#DDD7CA] bg-[#F6F2E8] xl:col-start-2">
        <div className="p-4 border-b border-[#DDD7CA]">
          <h3 className="font-serif text-base font-semibold text-[#1F2821]">Utánkövetés</h3>
        </div>
        
        <div className="grid gap-3 p-4 lg:grid-cols-2">
          {/* Ügy kontextus */}
          <details className="hidden border border-[#DDD7CA] rounded">
            <summary className="px-3 py-2 bg-[#F6F2E8] cursor-pointer text-[10px] uppercase tracking-[0.2em] text-[#7B776D] hover:bg-[#ECE6DA]">
              Ügy kontextus
            </summary>
            <div className="p-3 bg-white">
              <p className="text-sm text-[#1F2821] font-medium">{caseRecord?.title || 'Ügy megnevezése nem elérhető'}</p>
              <p className="text-[10px] text-[#7B776D] mt-1">{caseRecord?.caseNumber || resolvedParams.caseId}</p>
              <div className="mt-3 pt-3 border-t border-[#DDD7CA]">
                <div className="flex justify-between text-[10px]">
                  <span className="text-[#7B776D]">Ügyfél</span>
                  <span className="text-[#1F2821]">{caseRecord?.clientName || 'Nem elérhető'}</span>
                </div>
                <div className="flex justify-between text-[10px] mt-1">
                  <span className="text-[#7B776D]">Ügytípus</span>
                  <span className="text-[#1F2821]">{caseRecord?.matterType || 'Nem elérhető'}</span>
                </div>
                <div className="flex justify-between text-[10px] mt-1">
                  <span className="text-[#7B776D]">Státusz</span>
                  <span className="text-[#1F2821]">{getCaseStatusLabel(caseRecord?.status)}</span>
                </div>
              </div>
            </div>
          </details>

          {/* Actions - only show when communication is selected */}
          {selectedComm && (
            <>
              {/* Extract Task */}
              <details className="border border-[#DDD7CA] rounded">
                <summary className="px-3 py-2 bg-[#F6F2E8] cursor-pointer text-[10px] uppercase tracking-[0.2em] text-[#B58A2A] hover:bg-[#ECE6DA]">
                  Kapcsolt feladat
                </summary>
                <div className="p-3 space-y-2">
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="Feladat címe"
                    className="w-full px-3 py-2 text-xs border border-[#DDD7CA] bg-white text-[#1F2821]"
                  />
                  <textarea
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    placeholder="Leírás (opcionális)"
                    className="w-full px-3 py-2 text-xs border border-[#DDD7CA] bg-white text-[#1F2821] resize-none h-16"
                  />
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={taskDueDate}
                      onChange={(e) => setTaskDueDate(e.target.value)}
                      className="flex-1 px-3 py-2 text-xs border border-[#DDD7CA] bg-white text-[#1F2821]"
                    />
                    <select
                      value={taskPriority}
                      onChange={(e) => setTaskPriority(e.target.value)}
                      className="px-3 py-2 text-xs border border-[#DDD7CA] bg-white text-[#1F2821]"
                    >
                      <option value="LOW">Alacsony</option>
                      <option value="MEDIUM">Közepes</option>
                      <option value="HIGH">Magas</option>
                      <option value="URGENT">Sürgős</option>
                    </select>
                  </div>
                  <button
                    onClick={handleExtractTask}
                    disabled={!taskTitle.trim() || isCreatingTask}
                    className="w-full py-2 text-xs uppercase tracking-[0.2em] bg-[#B58A2A] text-white hover:bg-[#9C7723] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreatingTask ? 'Létrehozás...' : 'Feladat kinyerése'}
                  </button>
                </div>
              </details>

              {/* Extract Deadline */}
              <details className="border border-[#DDD7CA] rounded">
                <summary className="px-3 py-2 bg-[#F6F2E8] cursor-pointer text-[10px] uppercase tracking-[0.2em] text-[#7D2F2F] hover:bg-[#ECE6DA]">
                  Kapcsolt határidő
                </summary>
                <div className="p-3 space-y-2">
                  <input
                    type="date"
                    value={deadlineDate}
                    onChange={(e) => setDeadlineDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#DDD7CA] bg-white text-[#1F2821]"
                  />
                  <textarea
                    value={deadlineDescription}
                    onChange={(e) => setDeadlineDescription(e.target.value)}
                    placeholder="Leírás (opcionális)"
                    className="w-full px-3 py-2 text-xs border border-[#DDD7CA] bg-white text-[#1F2821] resize-none h-16"
                  />
                  <button
                    onClick={handleExtractDeadline}
                    disabled={!deadlineDate || isExtractingDeadline}
                    className="w-full py-2 text-xs uppercase tracking-[0.2em] bg-[#DC2626] text-white hover:bg-[#B91C1C] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isExtractingDeadline ? 'Beállítás...' : 'Határidő beállítása'}
                  </button>
                </div>
              </details>

              {/* Communication Summary */}
              <details className="border border-[#DDD7CA] rounded">
                <summary className="px-3 py-2 bg-[#F6F2E8] cursor-pointer text-[10px] uppercase tracking-[0.2em] text-[#7B776D] hover:bg-[#ECE6DA]">
                  Kommunikációs összefoglaló
                </summary>
                <div className="p-3 bg-white">
                  <div className="space-y-2 text-[10px]">
                    <div className="flex items-start gap-2">
                      <span className="text-[#7B776D] w-16">Feladó:</span>
                      <span className="text-[#1F2821]">{selectedComm.senderName || 'Ismeretlen'}</span>
                    </div>
                    {selectedComm.recipientName && (
                      <div className="flex items-start gap-2">
                        <span className="text-[#7B776D] w-16">Címzett:</span>
                        <span className="text-[#1F2821]">{selectedComm.recipientName}</span>
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <span className="text-[#7B776D] w-16">Típus:</span>
                      <span className={`text-[#1F2821] ${communicationTypeColors[selectedComm.type]}`}>
                        {communicationTypeLabels[selectedComm.type]}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-[#7B776D] w-16">Dátum:</span>
                      <span className="text-[#1F2821]">{formatDate(selectedComm.createdAt)}</span>
                    </div>
                    {selectedComm.caseId ? (
                      <div className="flex items-start gap-2">
                        <span className="text-[#7B776D] w-16">Státusz:</span>
                        <span className="text-[#10B981]">Ügyhöz kapcsolva</span>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <span className="text-[#7B776D] w-16">Státusz:</span>
                        <span className="text-[#F59E0B]">Nincs ügyhöz kapcsolva</span>
                      </div>
                    )}
                  </div>
                  {!selectedComm.caseId ? (
                    <button
                      onClick={handleLinkToCase}
                      disabled={isLinkingCase}
                      className="mt-3 w-full py-2 text-xs uppercase tracking-[0.2em] border border-[#DDD7CA] text-[#1F2821] hover:bg-[#F6F2E8] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLinkingCase ? 'Kapcsolás...' : 'Kapcsolás az ügyhöz'}
                    </button>
                  ) : null}
                </div>
              </details>
            </>
          )}
          
          {/* Navigation */}
          <div className="hidden pt-4 border-t border-[#DDD7CA]">
            <div className="space-y-2 mb-2">
              <button
                onClick={() => router.push(`/cases/${caseContextId}/documents`)}
                className="w-full py-2 text-xs uppercase tracking-[0.2em] bg-[#1F4A33] text-[#FBF6E7] border border-[#1F4A33] hover:bg-[#173824]"
              >
                Dokumentumtár
              </button>
              <button
                onClick={() => router.push(`/documents/compare?caseId=${caseContextId}`)}
                className="w-full py-2 text-xs uppercase tracking-[0.2em] bg-[#B58A2A] text-white border border-[#B58A2A] hover:bg-[#9C7723]"
              >
                Szerződés-workspace
              </button>
              <button
                onClick={() => router.push(`/cases/${caseContextId}/handoff`)}
                className="w-full py-2 text-xs uppercase tracking-[0.2em] border border-[#DDD7CA] text-[#1F2821] bg-white hover:bg-[#ECE6DA]"
              >
                Leadás
              </button>
            </div>
            <button
              onClick={() => router.push(`/cases/${caseContextId}`)}
              className="w-full py-2 text-xs uppercase tracking-[0.2em] border border-[#DDD7CA] text-[#1F2821] bg-white hover:bg-[#ECE6DA]"
            >
              Vissza az ügyhöz
            </button>
          </div>
        </div>
      </aside>
      ) : null}
      </div>
    </div>
  );
}
