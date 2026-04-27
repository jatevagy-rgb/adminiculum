"use client";

import { downloadContract } from "@/lib/api";

type TimelineEvent = {
  id: string;
  type: 'document_upload' | 'document_edit' | 'instruction' | 'task_created' | 'client_added' | 'review_needed' | 'ai_detection' | 'signature' | 'status_change' | 'submission';
  title: string;
  description: string;
  timestamp: string;
  author: string;
  avatarInitials: string;
  documentName?: string;
  documentId?: string;
  statusLabel?: string;
};

type TimelineBoardProps = {
  events: TimelineEvent[];
};

export function TimelineBoard({ events }: TimelineBoardProps) {
  const handleDownloadContract = async (event: TimelineEvent) => {
    if (!event.documentId) return;
    try {
      const blob = await downloadContract(event.documentId);
      const link = document.createElement('a');
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = event.documentName || 'contract.docx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error('Contract download failed:', err);
      window.alert('Szerződés letöltése sikertelen.');
    }
  };
  const getEventIcon = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'document_upload':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        );
      case 'document_edit':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        );
      case 'instruction':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case 'task_created':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        );
      case 'client_added':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        );
      case 'review_needed':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case 'ai_detection':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        );
      case 'signature':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        );
      case 'status_change':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        );
      case 'submission':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getEventColor = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'document_upload':
      case 'document_edit':
        return 'bg-[#5B7C99]';
      case 'instruction':
        return 'bg-[#C9A227]';
      case 'task_created':
        return 'bg-[#4A7C59]';
      case 'client_added':
        return 'bg-[#7C5B99]';
      case 'review_needed':
        return 'bg-[#D4A017]';
      case 'ai_detection':
        return 'bg-[#99A55B]';
      case 'signature':
        return 'bg-[#4A7C99]';
      case 'status_change':
        return 'bg-[#6B655B]';
      case 'submission':
        return 'bg-[#4A7C59]';
      default:
        return 'bg-[#6B655B]';
    }
  };

  const getStatusLabelClass = (status?: string) => {
    if (!status) return '';
    switch (status) {
      case 'Review szükséges':
        return 'bg-[#D4A017]/10 text-[#D4A017]';
      case 'Kockázat':
        return 'bg-[#A63D40]/10 text-[#A63D40]';
      case 'Folyamatban':
        return 'bg-[#5B7C99]/10 text-[#5B7C99]';
      default:
        return 'bg-[#6B655B]/10 text-[#6B655B]';
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-lg font-semibold text-[#2D2A26] mb-6">Ügy előzményei</h2>
        
        {events.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#E8E4DE] p-8 text-center">
            <svg className="w-12 h-12 mx-auto text-[#E8E4DE] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[#6B655B]">Még nincs esemény az ügyben</p>
            <p className="text-sm text-[#9C9890] mt-1">Az események itt jelennek meg, ahogy halad az ügy</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-6 top-0 bottom-0 w-px bg-[#E8E4DE]" />

            {/* Events */}
            <div className="space-y-6">
              {events.map((event) => (
                <div key={event.id} className="relative flex gap-4">
                  {/* Event icon */}
                  <div className={`
                    relative z-10 w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0
                    ${getEventColor(event.type)} text-white
                  `}>
                    {getEventIcon(event.type)}
                  </div>

                  {/* Event card */}
                  <div className="flex-1 bg-white rounded-xl border border-[#E8E4DE] p-4 shadow-sm hover:shadow-md transition-shadow">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#FAF8F5] flex items-center justify-center text-xs font-medium text-[#6B655B]">
                          {event.avatarInitials}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#2D2A26]">{event.author}</p>
                          <p className="text-xs text-[#9C9890]">{event.timestamp}</p>
                        </div>
                      </div>
                      {event.statusLabel && (
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusLabelClass(event.statusLabel)}`}>
                          {event.statusLabel}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="text-base font-semibold text-[#2D2A26] mb-1">
                      {event.title}
                    </h3>

                    {/* Description */}
                    <p className="text-sm text-[#6B655B] mb-3">
                      {event.description}
                    </p>

                    {/* Document chip */}
                    {event.documentName && (
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#FAF8F5] rounded-lg border border-[#E8E4DE]">
                        <svg className="w-4 h-4 text-[#5B7C99]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-sm text-[#2D2A26]">{event.documentName}</span>
                      </div>
                    )}
                    {event.documentId && (
                      <button
                        type="button"
                        onClick={() => handleDownloadContract(event)}
                        className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-[#5B7C99] border border-transparent rounded-lg hover:bg-[#4A6079]"
                      >
                        Letöltés
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
