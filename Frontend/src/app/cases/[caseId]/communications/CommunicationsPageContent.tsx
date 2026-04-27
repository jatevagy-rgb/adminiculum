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

type CommunicationsPageProps = {
  params: Promise<{ caseId: string }>;
};

const communicationTypeLabels: Record<string, string> = {
  'EMAIL': 'Email',
  'PHONE': 'Phone',
  'MEETING': 'Meeting',
  'LETTER': 'Letter',
  'NOTE': 'Note',
};

const communicationTypeColors: Record<string, string> = {
  'EMAIL': 'bg-[#3B82F6] text-white',
  'PHONE': 'bg-[#8B5CF6] text-white',
  'MEETING': 'bg-[#10B981] text-white',
  'LETTER': 'bg-[#F59E0B] text-white',
  'NOTE': 'bg-[#6B7280] text-white',
};

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
      setError('Communications service unavailable. Please try again later.');
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
      setError('Communication detail unavailable. Please try again later.');
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
        setActionResult({ type: 'error', message: 'Failed to link to case' });
      }
    } catch (err) {
      setActionResult({ type: 'error', message: 'Failed to link to case' });
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
        setActionResult({ type: 'success', message: `Task created: ${result.task.title}` });
        setTaskTitle('');
        setTaskDescription('');
        setTaskDueDate('');
        setTaskPriority('MEDIUM');
        loadCommunicationDetail(selectedComm.id);
      } else {
        setActionResult({ type: 'error', message: 'Failed to create task' });
      }
    } catch (err) {
      setActionResult({ type: 'error', message: 'Failed to create task' });
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
        setActionResult({ type: 'success', message: `Deadline set: ${new Date(deadlineDate).toLocaleDateString('hu-HU')}` });
        setDeadlineDate('');
        setDeadlineDescription('');
        loadCommunicationDetail(selectedComm.id);
      } else {
        setActionResult({ type: 'error', message: 'Failed to extract deadline' });
      }
    } catch (err) {
      setActionResult({ type: 'error', message: 'Failed to extract deadline' });
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
        setActionResult({ type: 'success', message: `Attachment linked: ${selectedDoc.fileName}` });
        setSelectedDocId('');
        setShowAddAttachmentForm(false);
        loadCommunicationDetail(selectedComm.id);
        loadCaseDocuments();
      } else {
        setActionResult({ type: 'error', message: 'Failed to link attachment' });
      }
    } catch (err) {
      setActionResult({ type: 'error', message: 'Failed to link attachment' });
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
          <p className="text-lg text-[#6B655B]">Case unavailable. Please try again later.</p>
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
    <div className="flex-1 flex min-h-0">
      {/* LEFT PANE - Thread List */}
      <aside className="w-80 border-r border-[#DDD7CA] bg-[#F6F2E8] flex flex-col">
        <div className="p-4 border-b border-[#DDD7CA]">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-2">Case Context</p>
          <p className="text-[11px] text-[#1F2821] font-semibold leading-tight">{caseRecord?.title || 'Matter name unavailable'}</p>
          <p className="text-[10px] text-[#7B776D] mt-1">{caseRecord?.caseNumber || resolvedParams.caseId}</p>
          <p className="text-[10px] text-[#7B776D] mt-1">{caseRecord?.clientName || 'Client unavailable'}</p>
        </div>
        
        {/* Case Participants Block */}
        <div className="px-4 py-3 border-b border-[#DDD7CA]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[9px] uppercase tracking-[0.28em] text-[#8B5CF6]">Résztvevők</h3>
            {isLoadingCollaborators && (
              <span className="text-[9px] text-[#9C9890]">...</span>
            )}
          </div>
          {collaborators.length > 0 ? (
            <div className="space-y-1.5">
              {collaborators.slice(0, 5).map((collab) => (
                <div key={collab.id} className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-[#8B5CF6] text-white flex items-center justify-center text-[8px] font-medium flex-shrink-0">
                    {collab.user?.name?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-[#1F2821] truncate">{collab.user?.name || 'Ismeretlen'}</p>
                  </div>
                  <span className="text-[8px] px-1 py-0.5 rounded bg-[#8B5CF6]/10 text-[#8B5CF6] border border-[#8B5CF6]/20 flex-shrink-0">
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
          <h3 className="text-[10px] uppercase tracking-[0.28em] text-[#7B776D]">Belső ügy napló</h3>
          <p className="text-[9px] text-[#9C9890] mt-0.5">Belső workspace a résztvevők számára</p>
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
              placeholder="Workspace frissítés címe..."
              className="w-full px-2 py-1.5 text-[11px] border border-[#DDD7CA] bg-white text-[#1F2821] placeholder-[#9C9890]"
            />
            <textarea
              value={quickNoteContent}
              onChange={(e) => setQuickNoteContent(e.target.value)}
              placeholder="Belső workspace frissítés a résztvevőknek..."
              rows={2}
              className="w-full px-2 py-1.5 text-[11px] border border-[#DDD7CA] bg-white text-[#1F2821] resize-none placeholder-[#9C9890]"
            />
            <button
              onClick={handleCreateQuickNote}
              disabled={!quickNoteSubject.trim() || !quickNoteContent.trim() || isCreatingNote}
              className="w-full py-1.5 text-[10px] uppercase tracking-[0.1em] bg-[#8B5CF6] text-white hover:bg-[#7C3AED] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isCreatingNote ? 'Mentés...' : 'Workspace frissítés'}
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
            <div className="p-4 text-center text-[#7B776D] text-xs">Loading...</div>
          ) : communications.length === 0 ? (
            <div className="p-4 text-center text-[#7B776D] text-xs">
              Még nincs workspace bejegyzés. A résztvevők által rögzített frissítések itt jelennek meg.
            </div>
          ) : (
            <div className="divide-y divide-[#DDD7CA]">
              {communications.map((comm) => (
                <button
                  key={comm.id}
                  onClick={() => handleSelectCommunication(comm)}
                  className={`w-full text-left p-3 hover:bg-[#ECE6DA] transition-colors ${
                    selectedComm?.id === comm.id ? 'bg-[#ECE6DA]' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-medium ${communicationTypeColors[comm.type] || 'bg-[#6B7280] text-white'}`}>
                      {getInitials(comm.senderName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-[#1F2821] truncate">
                        {comm.senderName || 'Unknown Sender'}
                      </p>
                      <p className="text-[10px] text-[#7B776D] mt-0.5 line-clamp-2">
                        {comm.subject}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded ${communicationTypeColors[comm.type]}`}>
                          {communicationTypeLabels[comm.type]}
                        </span>
                        {comm.caseId && (
                          <span className="text-[9px] text-[#10B981]">Linked</span>
                        )}
                        {comm._count?.relatedTasks ? (
                          <span className="text-[9px] text-[#F59E0B]">
                            {comm._count.relatedTasks} task{comm._count.relatedTasks > 1 ? 's' : ''}
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
        
        <div className="p-3 border-t border-[#DDD7CA]">
          <button 
            onClick={() => router.push(`/cases/${caseContextId}`)}
            className="w-full text-left px-3 py-2 text-xs text-[#514D45] hover:bg-[#ECE6DA] rounded flex items-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to Case
          </button>
        </div>
      </aside>

      {/* CENTER PANE - Message Reader */}
      <main className="flex-1 flex flex-col min-h-0 bg-white">
        {!selectedComm ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              {error && (
                <div className="mb-4 p-3 bg-[#FEF2F2] border border-[#FECACA] rounded max-w-md">
                  <p className="text-xs text-[#DC2626]">{error}</p>
                </div>
              )}
              {!error && (
                <>
                  <svg className="w-16 h-16 mx-auto text-[#DDD7CA]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5H4.5A2.25 2.25 0 002.25 6.5m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                  <p className="text-[#7B776D] mt-4 text-sm">Select a case-linked communication record to view details and follow-up actions.</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Message Header */}
            <div className="p-6 border-b border-[#DDD7CA]">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded ${communicationTypeColors[selectedComm.type]}`}>
                      {communicationTypeLabels[selectedComm.type]}
                    </span>
                    {selectedComm.caseId ? (
                      <span className="text-[9px] text-[#10B981] bg-[#F0FDF4] px-2 py-1 rounded">Linked to Case</span>
                    ) : (
                      <button
                        onClick={handleLinkToCase}
                        disabled={isLinkingCase}
                        className="text-[9px] text-[#3B82F6] bg-[#EFF6FF] px-2 py-1 rounded hover:bg-[#DBEAFE] disabled:opacity-50"
                      >
                        {isLinkingCase ? 'Linking...' : '+ Link to Case'}
                      </button>
                    )}
                  </div>
                  <h1 className="text-xl font-serif text-[#1F2821] leading-tight">
                    {selectedComm.subject}
                  </h1>
                </div>
              </div>
              
              <div className="flex items-center gap-6 mt-4 text-xs text-[#7B776D]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#C9A227] text-white flex items-center justify-center text-[9px] font-medium">
                    {getInitials(selectedComm.senderName)}
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2821]">{selectedComm.senderName || 'Unknown'}</p>
                    {selectedComm.senderEmail && (
                      <p className="text-[10px] text-[#9C9890]">{selectedComm.senderEmail}</p>
                    )}
                  </div>
                </div>
                {selectedComm.recipientName && (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="font-medium text-[#1F2821]">{selectedComm.recipientName}</p>
                        {selectedComm.recipientEmail && (
                          <p className="text-[10px] text-[#9C9890]">{selectedComm.recipientEmail}</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
                <span className="ml-auto text-[#9C9890]">{formatDate(selectedComm.createdAt)}</span>
              </div>
            </div>
            
            {/* Action Results */}
            {actionResult && (
              <div className={`mx-6 mt-4 p-3 border rounded ${
                actionResult.type === 'success' 
                  ? 'bg-[#F0FDF4] border-[#10B981]' 
                  : 'bg-[#FEF2F2] border-[#DC2626]'
              }`}>
                <p className={`text-xs ${actionResult.type === 'success' ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                  {actionResult.message}
                </p>
              </div>
            )}
            
            {/* Message Content / Tabs */}
            <div className="flex-1 overflow-y-auto">
              <div className="border-b border-[#DDD7CA]">
                <div className="flex px-6">
                  <button
                    onClick={() => setActivePane('messages')}
                    className={`px-4 py-3 text-xs uppercase tracking-[0.2em] border-b-2 -mb-px ${
                      activePane === 'messages'
                        ? 'border-[#C9A227] text-[#C9A227]'
                        : 'border-transparent text-[#7B776D] hover:text-[#1F2821]'
                    }`}
                  >
                    Message
                  </button>
                  <button
                    onClick={() => setActivePane('attachments')}
                    className={`px-4 py-3 text-xs uppercase tracking-[0.2em] border-b-2 -mb-px ${
                      activePane === 'attachments'
                        ? 'border-[#C9A227] text-[#C9A227]'
                        : 'border-transparent text-[#7B776D] hover:text-[#1F2821]'
                    }`}
                  >
                    Attachments ({selectedComm.attachments?.length || 0})
                  </button>
                  <button
                    onClick={() => setActivePane('tasks')}
                    className={`px-4 py-3 text-xs uppercase tracking-[0.2em] border-b-2 -mb-px ${
                      activePane === 'tasks'
                        ? 'border-[#C9A227] text-[#C9A227]'
                        : 'border-transparent text-[#7B776D] hover:text-[#1F2821]'
                    }`}
                  >
                    Tasks ({selectedComm.relatedTasks?.length || 0})
                  </button>
                </div>
              </div>
              
              <div className="p-6">
                {activePane === 'messages' && (
                  <div>
                    {selectedComm.content ? (
                      <div className="prose prose-sm max-w-none text-[#1F2821] whitespace-pre-wrap">
                        {selectedComm.content}
                      </div>
                    ) : (
                      <p className="text-[#9C9890] text-sm italic">
                        {selectedComm.summary || 'No content available'}
                      </p>
                    )}
                    {selectedComm.summary && selectedComm.content && (
                      <div className="mt-6 p-4 bg-[#F6F2E8] border border-[#DDD7CA]">
                        <h4 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-2">Summary</h4>
                        <p className="text-sm text-[#1F2821]">{selectedComm.summary}</p>
                      </div>
                    )}
                  </div>
                )}
                
                {activePane === 'attachments' && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D]">Attachments</h4>
                      {selectedComm && caseDocuments.length > 0 && (
                        <button
                          onClick={() => setShowAddAttachmentForm(!showAddAttachmentForm)}
                          className="text-[9px] text-[#3B82F6] hover:text-[#2563EB]"
                        >
                          {showAddAttachmentForm ? 'Cancel' : '+ Add from Case'}
                        </button>
                      )}
                    </div>
                    
                    {/* Add Attachment Form */}
                    {showAddAttachmentForm && (
                      <div className="mb-4 p-3 border border-[#DDD7CA] bg-[#FAF8F2]">
                        <p className="text-[10px] text-[#7B776D] mb-2">Select a document to link:</p>
                        <select
                          value={selectedDocId}
                          onChange={(e) => setSelectedDocId(e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-[#DDD7CA] bg-white text-[#1F2821] mb-2"
                        >
                          <option value="">-- Select document --</option>
                          {caseDocuments.map((doc) => (
                            <option key={doc.id} value={doc.id}>{doc.fileName}</option>
                          ))}
                        </select>
                        <button
                          onClick={handleAddAttachment}
                          disabled={!selectedDocId || isLinkingAttachment}
                          className="w-full py-2 text-xs uppercase tracking-[0.2em] bg-[#3B82F6] text-white hover:bg-[#2563EB] disabled:opacity-50"
                        >
                          {isLinkingAttachment ? 'Linking...' : 'Link Document'}
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
                                Linked to SharePoint
                              </span>
                            ) : (
                              <span className="text-[9px] text-[#9C9890] italic">
                                Not available
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[#9C9890] text-sm">No attachments</p>
                    )}
                  </div>
                )}
                
                {activePane === 'tasks' && (
                  <div>
                    <h4 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-4">Related Tasks</h4>
                    {selectedComm.relatedTasks && selectedComm.relatedTasks.length > 0 ? (
                      <div className="space-y-2">
                        {selectedComm.relatedTasks.map((task) => (
                          <div key={task.id} className="p-3 border border-[#DDD7CA] bg-[#FAF8F2]">
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-[#1F2821] font-medium">{task.title}</p>
                              <span className={`text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded ${
                                task.status === 'DONE' || task.status === 'COMPLETED' 
                                  ? 'bg-[#10B981] text-white' 
                                  : task.status === 'IN_PROGRESS'
                                  ? 'bg-[#F59E0B] text-white'
                                  : 'bg-[#6B7280] text-white'
                              }`}>
                                {task.status}
                              </span>
                            </div>
                            {task.description && (
                              <p className="text-[10px] text-[#7B776D] mt-1">{task.description.substring(0, 100)}...</p>
                            )}
                            {task.dueDate && (
                              <p className="text-[10px] text-[#DC2626] mt-2">
                                Due: {new Date(task.dueDate).toLocaleDateString('hu-HU')}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[#9C9890] text-sm">No tasks created from this communication</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* RIGHT PANE - Communication Follow-up */}
      <aside className="w-80 border-l border-[#DDD7CA] bg-[#F6F2E8] flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-[#DDD7CA]">
          <h3 className="text-[10px] uppercase tracking-[0.28em] text-[#7B776D]">Communication follow-up</h3>
        </div>
        
        <div className="p-4 space-y-6">
          {/* Case Context */}
          <div>
            <h4 className="text-[9px] uppercase tracking-[0.2em] text-[#7B776D] mb-2">Case Context</h4>
            <div className="p-3 bg-white border border-[#DDD7CA]">
              <p className="text-sm text-[#1F2821] font-medium">{caseRecord?.title || 'Matter name unavailable'}</p>
              <p className="text-[10px] text-[#7B776D] mt-1">{caseRecord?.caseNumber || resolvedParams.caseId}</p>
              <div className="mt-3 pt-3 border-t border-[#DDD7CA]">
                <div className="flex justify-between text-[10px]">
                  <span className="text-[#7B776D]">Client</span>
                  <span className="text-[#1F2821]">{caseRecord?.clientName || 'Unavailable'}</span>
                </div>
                <div className="flex justify-between text-[10px] mt-1">
                  <span className="text-[#7B776D]">Matter Type</span>
                  <span className="text-[#1F2821]">{caseRecord?.matterType || 'Unavailable'}</span>
                </div>
                <div className="flex justify-between text-[10px] mt-1">
                  <span className="text-[#7B776D]">Status</span>
                  <span className="text-[#1F2821]">{caseRecord?.status || 'Unknown'}</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Actions - only show when communication is selected */}
          {selectedComm && (
            <>
              {/* Extract Task */}
              <div>
                <h4 className="text-[9px] uppercase tracking-[0.2em] text-[#F59E0B] mb-2">Create linked task</h4>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="Task title"
                    className="w-full px-3 py-2 text-xs border border-[#DDD7CA] bg-white text-[#1F2821]"
                  />
                  <textarea
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    placeholder="Description (optional)"
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
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  </div>
                  <button
                    onClick={handleExtractTask}
                    disabled={!taskTitle.trim() || isCreatingTask}
                    className="w-full py-2 text-xs uppercase tracking-[0.2em] bg-[#F59E0B] text-white hover:bg-[#D97706] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreatingTask ? 'Creating...' : 'Create Task'}
                  </button>
                </div>
              </div>
              
              {/* Extract Deadline */}
              <div>
                <h4 className="text-[9px] uppercase tracking-[0.2em] text-[#DC2626] mb-2">Set linked deadline</h4>
                <div className="space-y-2">
                  <input
                    type="date"
                    value={deadlineDate}
                    onChange={(e) => setDeadlineDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#DDD7CA] bg-white text-[#1F2821]"
                  />
                  <textarea
                    value={deadlineDescription}
                    onChange={(e) => setDeadlineDescription(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full px-3 py-2 text-xs border border-[#DDD7CA] bg-white text-[#1F2821] resize-none h-16"
                  />
                  <button
                    onClick={handleExtractDeadline}
                    disabled={!deadlineDate || isExtractingDeadline}
                    className="w-full py-2 text-xs uppercase tracking-[0.2em] bg-[#DC2626] text-white hover:bg-[#B91C1C] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isExtractingDeadline ? 'Setting...' : 'Set Deadline'}
                  </button>
                </div>
              </div>
              
              {/* Communication Summary */}
              <div>
                <h4 className="text-[9px] uppercase tracking-[0.2em] text-[#7B776D] mb-2">Communication Summary</h4>
                <div className="p-3 bg-white border border-[#DDD7CA]">
                  <div className="space-y-2 text-[10px]">
                    <div className="flex items-start gap-2">
                      <span className="text-[#7B776D] w-16">From:</span>
                      <span className="text-[#1F2821]">{selectedComm.senderName || 'Unknown'}</span>
                    </div>
                    {selectedComm.recipientName && (
                      <div className="flex items-start gap-2">
                        <span className="text-[#7B776D] w-16">To:</span>
                        <span className="text-[#1F2821]">{selectedComm.recipientName}</span>
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <span className="text-[#7B776D] w-16">Type:</span>
                      <span className={`text-[#1F2821] ${communicationTypeColors[selectedComm.type]}`}>
                        {communicationTypeLabels[selectedComm.type]}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-[#7B776D] w-16">Date:</span>
                      <span className="text-[#1F2821]">{formatDate(selectedComm.createdAt)}</span>
                    </div>
                    {selectedComm.caseId ? (
                      <div className="flex items-start gap-2">
                        <span className="text-[#7B776D] w-16">Status:</span>
                        <span className="text-[#10B981]">Linked to case</span>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <span className="text-[#7B776D] w-16">Status:</span>
                        <span className="text-[#F59E0B]">Not linked</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
          
          {!selectedComm && (
            <div className="text-center text-[#9C9890] text-xs py-8">
              Select a communication record to view linked follow-up actions, tasks, and deadlines.
            </div>
          )}
          
          {/* Navigation */}
          <div className="pt-4 border-t border-[#DDD7CA]">
            <button
              onClick={() => router.push(`/cases/${caseContextId}`)}
              className="w-full py-2 text-xs uppercase tracking-[0.2em] border border-[#DDD7CA] text-[#7B776D] hover:bg-[#ECE6DA]"
            >
              Back to Case
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
