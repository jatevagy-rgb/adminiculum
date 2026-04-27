"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import {
  createClauseLibraryClause,
  generateContractEditDraftRevision,
  getCases,
  getClauseLibraryProfiles,
  getContractEditDraft,
  getContractEditSuggestions,
  getClauseLibraryClauses,
  saveContractEditDraft,
  type ClauseCategory,
  type ClauseKind,
  type ContractEditSuggestionItem,
  type EditDraftBlock,
  type RepresentedSide,
} from "@/lib/api";

type EditPageProps = {
  params: Promise<{ caseId: string; documentId: string }>;
};

export default function WrappedContractEditPage({ params }: EditPageProps) {
  return (
    <AuthenticatedApp section="case-detail">
      <ContractEditPageContent params={params} />
    </AuthenticatedApp>
  );
}

function ContractEditPageContent({ params }: EditPageProps) {
  const resolvedParams = use(params);
  const router = useRouter();

  const [caseRecord, setCaseRecord] = useState<{
    id: string;
    caseNumber: string;
    title: string;
    clientName: string;
  } | null>(null);

  const [blocks, setBlocks] = useState<EditDraftBlock[]>([]);
  const [sourceMode, setSourceMode] = useState<'saved_draft' | 'assembly' | 'fallback_text' | 'empty'>('empty');
  const [draftMessage, setDraftMessage] = useState<string>('');
  const [suggestions, setSuggestions] = useState<ContractEditSuggestionItem[]>([]);
  const [suggestionLawyerProfile, setSuggestionLawyerProfile] = useState<{ id: string; lawyerName: string } | null>(null);
  const [truglyProfileId, setTruglyProfileId] = useState<string | null>(null);
  const [replaceSelectionByBlock, setReplaceSelectionByBlock] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingRevision, setIsGeneratingRevision] = useState(false);
  const [isSavingClause, setIsSavingClause] = useState(false);
  const [saveAsBlockId, setSaveAsBlockId] = useState<string | null>(null);
  const [saveAsForm, setSaveAsForm] = useState<{
    title: string;
    slug: string;
    summary: string;
    category: ClauseCategory;
    clauseKind: ClauseKind;
    representedSide: RepresentedSide;
    keywords: string;
  }>({
    title: '',
    slug: '',
    summary: '',
    category: 'SPECIAL',
    clauseKind: 'OPTIONAL',
    representedSide: 'EITHER',
    keywords: '',
  });
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | null; message: string }>({
    type: null,
    message: '',
  });

  const canonicalCaseId = caseRecord?.id || resolvedParams.caseId;

  const loadDraft = useCallback(async () => {
    setIsLoading(true);
    try {
      const draft = await getContractEditDraft(resolvedParams.documentId);
      setBlocks(draft.blocks || []);
      setSourceMode(draft.sourceMode);
      setDraftMessage(draft.draftMeta?.message || '');
      setBanner({ type: null, message: '' });
    } catch (error) {
      setBanner({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load edit draft.' });
    } finally {
      setIsLoading(false);
    }
  }, [resolvedParams.documentId]);

  const loadSuggestions = useCallback(async (q?: string) => {
    try {
      const result = await getContractEditSuggestions(resolvedParams.documentId, q);
      setSuggestions(result.suggestions || []);
      setSuggestionLawyerProfile(result.lawyerProfile ?? null);
    } catch {
      setSuggestions([]);
      setSuggestionLawyerProfile(null);
    }
  }, [resolvedParams.documentId]);

  const loadProfiles = useCallback(async () => {
    try {
      const profiles = await getClauseLibraryProfiles();
      const trugly = profiles.find((profile) => profile.lawyerName.toLowerCase().includes('trugly'));
      setTruglyProfileId(trugly?.id || null);
    } catch {
      setTruglyProfileId(null);
    }
  }, []);

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
            caseNumber: record.caseNumber,
            title: record.title,
            clientName: record.clientName,
          });
        }
      } catch {
        // Non-blocking
      }
    };
    fetchCaseRecord();
  }, [resolvedParams.caseId]);

  useEffect(() => {
    loadDraft();
    loadSuggestions();
    loadProfiles();
  }, [loadDraft, loadSuggestions, loadProfiles]);

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96);

  const [blockReviewStatuses, setBlockReviewStatuses] = useState<Record<string, 'OK' | 'REVIEW_NEEDED' | 'RISK_ISSUE'>>({});

  const updateBlockBody = (id: string, body: string) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, body } : b)));
  };

  const updateBlockTitle = (id: string, title: string) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, title } : b)));
  };

  const moveBlock = (id: string, direction: 'up' | 'down') => {
    setBlocks((prev) => {
      const currentIndex = prev.findIndex((b) => b.id === id);
      if (currentIndex < 0) return prev;
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;

      const next = [...prev];
      const [item] = next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, item);
      return next.map((b, idx) => ({ ...b, orderIndex: idx }));
    });
  };

  const removeBlock = (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id).map((b, idx) => ({ ...b, orderIndex: idx })));
  };

  const replaceBlockWithSuggestion = (blockId: string) => {
    const suggestionId = replaceSelectionByBlock[blockId];
    if (!suggestionId) return;
    const suggestion = suggestions.find((item) => item.id === suggestionId);
    if (!suggestion) return;

    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? {
              ...b,
              title: suggestion.title,
              body: suggestion.body,
              sourceClauseId: suggestion.id,
            }
          : b
      )
    );
    setBanner({ type: 'success', message: 'Block replaced from suggested clause.' });
  };

  const insertSuggestion = (suggestion: ContractEditSuggestionItem) => {
    setBlocks((prev) => [
      ...prev,
      {
        id: `suggestion-${suggestion.id}-${Date.now()}`,
        title: suggestion.title,
        body: suggestion.body,
        orderIndex: prev.length,
        sourceClauseId: suggestion.id,
      },
    ]);
  };

  const saveDraft = async () => {
    setIsSaving(true);
    try {
      const payload = blocks.map((block, index) => ({
        id: block.id,
        title: block.title,
        body: block.body,
        orderIndex: index,
        sourceClauseId: block.sourceClauseId ?? null,
      }));
      await saveContractEditDraft(resolvedParams.documentId, payload);
      await loadDraft();
      setBanner({ type: 'success', message: 'Edit draft saved.' });
    } catch (error) {
      setBanner({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save edit draft.' });
    } finally {
      setIsSaving(false);
    }
  };

  const generateRevision = async () => {
    setIsGeneratingRevision(true);
    try {
      const result = await generateContractEditDraftRevision(resolvedParams.documentId);
      if (!result.success || !result.contract?.id) {
        throw new Error(result.error || 'Failed to generate edited revision.');
      }
      setBanner({
        type: 'success',
        message: `Generated edited revision: ${result.contract.title}`,
      });
      router.push(`/cases/${canonicalCaseId}/review/${result.contract.id}`);
    } catch (error) {
      setBanner({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to generate edited revision.',
      });
    } finally {
      setIsGeneratingRevision(false);
    }
  };

  const openSaveAsClause = (block: EditDraftBlock) => {
    setSaveAsBlockId(block.id);
    setSaveAsForm({
      title: block.title,
      slug: slugify(block.title),
      summary: '',
      category: 'SPECIAL',
      clauseKind: 'OPTIONAL',
      representedSide: 'EITHER',
      keywords: '',
    });
  };

  const saveBlockAsClause = async () => {
    if (!saveAsBlockId) return;
    const target = blocks.find((block) => block.id === saveAsBlockId);
    if (!target) {
      setBanner({ type: 'error', message: 'Selected block no longer exists.' });
      return;
    }
    if (!saveAsForm.title.trim() || !saveAsForm.slug.trim()) {
      setBanner({ type: 'error', message: 'Title and slug are required for clause save.' });
      return;
    }

    setIsSavingClause(true);
    try {
      const existing = await getClauseLibraryClauses({
        contractType: 'ADASVETEL',
        search: saveAsForm.slug.trim(),
      });
      const slugExists = existing.some((item) => item.slug === saveAsForm.slug.trim());
      if (slugExists) {
        setBanner({ type: 'error', message: 'Slug already exists. Please choose another slug.' });
        return;
      }

      await createClauseLibraryClause({
        title: saveAsForm.title.trim(),
        slug: saveAsForm.slug.trim(),
        body: target.body,
        summary: saveAsForm.summary.trim() || undefined,
        contractType: 'ADASVETEL',
        clauseKind: saveAsForm.clauseKind,
        representedSide: saveAsForm.representedSide,
        category: saveAsForm.category,
        keywords: saveAsForm.keywords
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        lawyerProfileId: suggestionLawyerProfile?.id || truglyProfileId || undefined,
      });

      setSaveAsBlockId(null);
      setBanner({ type: 'success', message: 'Edited block saved as new Clause Library item.' });
    } catch (error) {
      setBanner({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save new clause.' });
    } finally {
      setIsSavingClause(false);
    }
  };

  const filteredSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter((s) =>
      [s.title, s.summary || '', s.category, s.clauseKind].join(' ').toLowerCase().includes(q)
    );
  }, [suggestions, search]);

  return (
    <div className="flex-1 bg-[#fbf9f4] min-h-0 flex flex-col">
      <main className="p-8 max-w-[1500px] mx-auto w-full flex-1 min-h-0 flex flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#7B776D]">Edit Mode · ADASVETEL</p>
            <h1 className="text-2xl font-['Newsreader'] text-[#1F2821]">{caseRecord?.title || 'Contract Edit Mode'}</h1>
            <p className="text-xs text-[#7B776D]">{caseRecord?.caseNumber || resolvedParams.caseId} · {caseRecord?.clientName || 'Client unavailable'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push(`/cases/${canonicalCaseId}/review/${resolvedParams.documentId}`)}
              className="px-4 py-2 border border-[#DDD7CA] text-xs font-bold uppercase tracking-wider text-[#514D45] hover:bg-[#ECE6DA]"
            >
              Back to Review
            </button>
            <button
              onClick={saveDraft}
              disabled={isSaving || isLoading}
              className="px-4 py-2 bg-[#06190d] text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              onClick={generateRevision}
              disabled={isGeneratingRevision || isLoading}
              className="px-4 py-2 bg-[#1F4A2C] text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
            >
              {isGeneratingRevision ? 'Generating...' : 'Generate Revision'}
            </button>
          </div>
        </header>

        <p className="text-xs text-[#7B776D]">
          The original contract remains unchanged. Generate Revision creates a new edited output linked to the same case.
        </p>

        {banner.type && (
          <div className={`p-3 border text-sm ${banner.type === 'success' ? 'bg-[#E2EDE5] border-[#A6C0AF] text-[#23472F]' : 'bg-[#FEF2F2] border-[#D4B8B8] text-[#8B3A3A]'}`}>
            {banner.message}
          </div>
        )}

        <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
          <aside className="col-span-12 lg:col-span-3 border border-[#DDD7CA] bg-[#F6F2E8] p-4 overflow-y-auto">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#434843] mb-3">Clause Suggestions</h2>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search suggestions..."
              className="w-full border border-[#DDD7CA] bg-white px-2 py-1.5 text-xs mb-3"
            />
            <div className="space-y-2">
              {filteredSuggestions.slice(0, 60).map((item) => (
                <div key={item.id} className="border border-[#DDD7CA] bg-white p-2">
                  <p className="text-xs font-semibold text-[#1F2821]">{item.title}</p>
                  <p className="text-[10px] text-[#7B776D]">{item.category} · {item.clauseKind}</p>
                  <button
                    onClick={() => insertSuggestion(item)}
                    className="mt-2 px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-[#ECE6DA] text-[#1F2821] hover:bg-[#DDD7CA]"
                  >
                    Insert
                  </button>
                </div>
              ))}
              {filteredSuggestions.length === 0 && (
                <p className="text-xs text-[#7B776D] italic">No suggestions available.</p>
              )}
            </div>
          </aside>

          <section className="col-span-12 lg:col-span-6 border border-[#DDD7CA] bg-white p-4 overflow-y-auto">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#434843] mb-3">Editable Blocks</h2>
            {isLoading ? (
              <p className="text-sm text-[#7B776D]">Loading edit draft...</p>
            ) : blocks.length === 0 ? (
              <p className="text-sm text-[#7B776D] italic">No editable blocks found for this contract.</p>
            ) : (
              <div className="space-y-3">
                {blocks.map((block, index) => (
                  <article key={block.id} className="border border-[#DDD7CA] bg-[#fbf9f4] p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-[#7B776D]">#{index + 1}</span>
                      <button
                        onClick={() => moveBlock(block.id, 'up')}
                        disabled={index === 0}
                        className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider border border-[#DDD7CA] disabled:opacity-40"
                      >
                        Move Up
                      </button>
                      <button
                        onClick={() => moveBlock(block.id, 'down')}
                        disabled={index === blocks.length - 1}
                        className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider border border-[#DDD7CA] disabled:opacity-40"
                      >
                        Move Down
                      </button>
                      <button
                        onClick={() => removeBlock(block.id)}
                        className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#8B3A3A] border border-[#D4B8B8]"
                      >
                        Remove
                      </button>
                      <button
                        onClick={() => openSaveAsClause(block)}
                        className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider border border-[#DDD7CA] text-[#1F2821]"
                      >
                        Save as Clause
                      </button>
                    </div>
                    <input
                      value={block.title}
                      onChange={(e) => updateBlockTitle(block.id, e.target.value)}
                      className="w-full border border-[#DDD7CA] bg-white px-2 py-1.5 text-sm text-[#1F2821] mb-2"
                      placeholder="Block title"
                    />
                    <textarea
                      value={block.body}
                      onChange={(e) => updateBlockBody(block.id, e.target.value)}
                      rows={6}
                      className="w-full border border-[#DDD7CA] bg-white px-2 py-2 text-sm text-[#1F2821] resize-y"
                    />
                    <div className="mt-2 flex items-center gap-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#7B776D]">Review:</span>
                      {(['OK', 'REVIEW_NEEDED', 'RISK_ISSUE'] as const).map((status) => (
                        <button
                          key={status}
                          onClick={() =>
                            setBlockReviewStatuses((prev) => ({
                              ...prev,
                              [block.id]: prev[block.id] === status ? ('OK' as const) : status,
                            }))
                          }
                          className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider border ${
                            blockReviewStatuses[block.id] === status
                              ? status === 'OK'
                                ? 'bg-[#E2EDE5] border-[#A6C0AF] text-[#23472F]'
                                : status === 'REVIEW_NEEDED'
                                ? 'bg-[#FEF9E7] border-[#D4B89A] text-[#8B5A2B]'
                                : 'bg-[#FEF2F2] border-[#D4B8B8] text-[#8B3A3A]'
                              : 'border-[#DDD7CA] text-[#7B776D] hover:bg-[#ECE6DA]'
                          }`}
                        >
                          {status === 'OK' ? 'OK' : status === 'REVIEW_NEEDED' ? 'Review Needed' : 'Risk Issue'}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        value={replaceSelectionByBlock[block.id] || ''}
                        onChange={(e) =>
                          setReplaceSelectionByBlock((prev) => ({
                            ...prev,
                            [block.id]: e.target.value,
                          }))
                        }
                        className="border border-[#DDD7CA] bg-white px-2 py-1.5 text-xs min-w-[240px]"
                      >
                        <option value="">Select suggestion to replace block...</option>
                        {filteredSuggestions.slice(0, 60).map((item) => (
                          <option key={`${block.id}-${item.id}`} value={item.id}>
                            {item.title}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => replaceBlockWithSuggestion(block.id)}
                        disabled={!replaceSelectionByBlock[block.id]}
                        className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-[#ECE6DA] text-[#1F2821] hover:bg-[#DDD7CA] disabled:opacity-40"
                      >
                        Replace from Suggestion
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <aside className="col-span-12 lg:col-span-3 border border-[#DDD7CA] bg-[#F6F2E8] p-4 overflow-y-auto">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#434843] mb-3">Draft Metadata</h2>
            <div className="space-y-2 text-xs text-[#514D45]">
              <p><span className="font-bold">Source:</span> {sourceMode}</p>
              <p><span className="font-bold">Blocks:</span> {blocks.length}</p>
              <p><span className="font-bold">Document:</span> {resolvedParams.documentId}</p>
            </div>
            {draftMessage && (
              <p className="mt-3 text-xs text-[#7B776D] italic">{draftMessage}</p>
            )}
            <button
              onClick={saveDraft}
              disabled={isSaving || isLoading}
              className="mt-4 w-full px-3 py-2 bg-[#06190d] text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              onClick={loadDraft}
              disabled={isLoading}
              className="mt-2 w-full px-3 py-2 border border-[#DDD7CA] text-xs font-bold uppercase tracking-wider text-[#514D45] hover:bg-[#ECE6DA]"
            >
              Reload Draft
            </button>
          </aside>
        </div>

        {saveAsBlockId && (
          <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
            <div className="w-full max-w-[680px] border border-[#DDD7CA] bg-white p-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#1F2821] mb-3">Save Block as New Clause</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-xs text-[#514D45]">
                  Title
                  <input
                    value={saveAsForm.title}
                    onChange={(e) =>
                      setSaveAsForm((prev) => ({
                        ...prev,
                        title: e.target.value,
                      }))
                    }
                    className="mt-1 w-full border border-[#DDD7CA] px-2 py-1.5"
                  />
                </label>
                <label className="text-xs text-[#514D45]">
                  Slug
                  <input
                    value={saveAsForm.slug}
                    onChange={(e) =>
                      setSaveAsForm((prev) => ({
                        ...prev,
                        slug: e.target.value,
                      }))
                    }
                    className="mt-1 w-full border border-[#DDD7CA] px-2 py-1.5"
                  />
                </label>
                <label className="text-xs text-[#514D45] md:col-span-2">
                  Summary (optional)
                  <input
                    value={saveAsForm.summary}
                    onChange={(e) =>
                      setSaveAsForm((prev) => ({
                        ...prev,
                        summary: e.target.value,
                      }))
                    }
                    className="mt-1 w-full border border-[#DDD7CA] px-2 py-1.5"
                  />
                </label>
                <label className="text-xs text-[#514D45]">
                  Category
                  <select
                    value={saveAsForm.category}
                    onChange={(e) =>
                      setSaveAsForm((prev) => ({
                        ...prev,
                        category: e.target.value as ClauseCategory,
                      }))
                    }
                    className="mt-1 w-full border border-[#DDD7CA] px-2 py-1.5 bg-white"
                  >
                    {['PARTY', 'PROPERTY', 'OWNERSHIP_PROOF', 'TITLE', 'WARRANTIES', 'PRICE', 'FINANCING', 'POSSESSION', 'CLOSING', 'SPECIAL'].map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-[#514D45]">
                  Clause Kind
                  <select
                    value={saveAsForm.clauseKind}
                    onChange={(e) =>
                      setSaveAsForm((prev) => ({
                        ...prev,
                        clauseKind: e.target.value as ClauseKind,
                      }))
                    }
                    className="mt-1 w-full border border-[#DDD7CA] px-2 py-1.5 bg-white"
                  >
                    {['REQUIRED', 'RECOMMENDED', 'OPTIONAL', 'SPECIAL'].map((kind) => (
                      <option key={kind} value={kind}>{kind}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-[#514D45]">
                  Represented Side
                  <select
                    value={saveAsForm.representedSide}
                    onChange={(e) =>
                      setSaveAsForm((prev) => ({
                        ...prev,
                        representedSide: e.target.value as RepresentedSide,
                      }))
                    }
                    className="mt-1 w-full border border-[#DDD7CA] px-2 py-1.5 bg-white"
                  >
                    {['EITHER', 'ELOADO', 'VEVO', 'NEUTRAL'].map((side) => (
                      <option key={side} value={side}>{side}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-[#514D45]">
                  Keywords (comma-separated)
                  <input
                    value={saveAsForm.keywords}
                    onChange={(e) =>
                      setSaveAsForm((prev) => ({
                        ...prev,
                        keywords: e.target.value,
                      }))
                    }
                    className="mt-1 w-full border border-[#DDD7CA] px-2 py-1.5"
                  />
                </label>
              </div>

              <p className="mt-3 text-[11px] text-[#7B776D]">
                Lawyer profile default: {suggestionLawyerProfile?.lawyerName || (truglyProfileId ? 'Dr. Trugly' : 'none')}
              </p>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setSaveAsBlockId(null)}
                  className="px-3 py-2 border border-[#DDD7CA] text-xs font-bold uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  onClick={saveBlockAsClause}
                  disabled={isSavingClause}
                  className="px-3 py-2 bg-[#06190d] text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                >
                  {isSavingClause ? 'Saving...' : 'Save as Clause'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

