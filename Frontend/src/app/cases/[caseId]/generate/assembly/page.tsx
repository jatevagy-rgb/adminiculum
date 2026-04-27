"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCaseById,
  getClauseLibraryProfiles,
  getClauseLibraryClauses,
  recommendClauses,
  upsertClauseLibraryAssembly,
  getClauseLibraryAssembly,
  generateContract,
  getContractBundleOptions,
  downloadContract,
  getContractTemplates,
  type CaseListItem,
  type LawyerProfile,
  type ClauseLibraryItem,
  type ClauseRecommendation,
  type ClauseCategory,
  type ClauseContractType,
  type AssemblyClauseEntry,
  type ContractTemplateItem,
  type BundleOptionItem,
} from "@/lib/api";

type AssemblyPageProps = {
  params: Promise<{ caseId: string }>;
};

// B400 Intake Schema — structured facts about the adásvételi transaction
interface IntakeSchema {
  representedSide: "EITHER" | "ELOADO" | "VEVO";
  financingType: "CASH" | "OTP_BANK_LOAN" | "OTHER_BANK_LOAN" | "MIXED";
  bankPackRequired: boolean;
  bankPackTag: string | null;
  sellerCount: number;
  buyerCount: number;
  hasPreemptiveRights: boolean;
  insuranceRequired: boolean;
  condominiumProperty: boolean;
  foreignParty: boolean;
  farmlandProperty: boolean;
}

const DEFAULT_INTAKE: IntakeSchema = {
  representedSide: "EITHER",
  financingType: "CASH",
  bankPackRequired: false,
  bankPackTag: null,
  sellerCount: 1,
  buyerCount: 1,
  hasPreemptiveRights: false,
  insuranceRequired: false,
  condominiumProperty: false,
  foreignParty: false,
  farmlandProperty: false,
};

const CATEGORY_LABELS: Record<ClauseCategory, string> = {
  PARTY: "Felek",
  PROPERTY: "Ingatlan",
  OWNERSHIP_PROOF: "Tulajdonjog igazolása",
  TITLE: "Tulajdonjog, bejegyzés",
  WARRANTIES: "Szavatosság, nyilatkozatok",
  PRICE: "Vételár",
  FINANCING: "Finanszírozás",
  POSSESSION: "Birtokbaadás",
  CLOSING: "Záró rendelkezések",
  SPECIAL: "Különös feltételek",
};

const CATEGORY_ORDER: ClauseCategory[] = [
  "PARTY", "PROPERTY", "OWNERSHIP_PROOF", "TITLE",
  "WARRANTIES", "PRICE", "FINANCING", "POSSESSION", "CLOSING", "SPECIAL",
];

export default function ContractAssemblyPage({ params }: AssemblyPageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const caseId = resolvedParams.caseId;

  // Core state
  const [caseData, setCaseData] = useState<CaseListItem | null>(null);
  const [profiles, setProfiles] = useState<LawyerProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<LawyerProfile | null>(null);
  const [intakeData, setIntakeData] = useState<IntakeSchema>(DEFAULT_INTAKE);
  const [recommendations, setRecommendations] = useState<ClauseRecommendation[]>([]);
  const [selectedClauseIds, setSelectedClauseIds] = useState<Set<string>>(new Set());
  const [editedBodies, setEditedBodies] = useState<Record<string, string>>({});
  const [allClauses, setAllClauses] = useState<ClauseLibraryItem[]>([]);
  const [templates, setTemplates] = useState<ContractTemplateItem[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ContractTemplateItem | null>(null);
  const [bundleOptions, setBundleOptions] = useState<BundleOptionItem[]>([]);
  const [selectedBundleItemIds, setSelectedBundleItemIds] = useState<Set<BundleOptionItem["id"]>>(new Set());

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isRecommending, setIsRecommending] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<ClauseCategory>("PARTY");
  const [assemblyId, setAssemblyId] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [caseRecord, profileList, templateList] = await Promise.all([
          getCaseById(caseId),
          getClauseLibraryProfiles(),
          getContractTemplates("ADASVETEL"),
        ]);
        if (cancelled) return;

        setCaseData(caseRecord);
        setProfiles(profileList);
        setTemplates(templateList);
        // Auto-select first ADASVETEL template if only one exists
        if (templateList.length === 1) {
          setSelectedTemplate(templateList[0]);
        }

        // Auto-select first profile
        if (profileList.length > 0) {
          setSelectedProfile(profileList[0]);
        }

        // Load existing assembly if any
        try {
          const existing = await getClauseLibraryAssembly(caseId);
          if (!cancelled && existing) {
            setAssemblyId(existing.id);
            setIntakeData(existing.intakeData as unknown as IntakeSchema || DEFAULT_INTAKE);
            setSelectedClauseIds(new Set(existing.selectedClauses.map(c => c.clauseId)));
            const bodies: Record<string, string> = {};
            for (const c of existing.selectedClauses) {
              if (c.editedBody) bodies[c.clauseId] = c.editedBody;
            }
            setEditedBodies(bodies);
          }
        } catch {
          // No existing assembly — that's fine
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to load data");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [caseId]);

  // Load all clauses for the selected profile
  useEffect(() => {
    if (!selectedProfile) return;
    let cancelled = false;

    const loadClauses = async () => {
      try {
        const clauses = await getClauseLibraryClauses({
          contractType: "ADASVETEL",
          lawyerProfileId: selectedProfile.id,
        });
        if (!cancelled) setAllClauses(clauses);
      } catch {
        // Ignore — profile might not have clauses yet
      }
    };

    loadClauses();
    return () => { cancelled = true; };
  }, [selectedProfile]);

  useEffect(() => {
    let cancelled = false;

    const loadBundleOptions = async () => {
      try {
        const response = await getContractBundleOptions({
          contractType: "ADASVETEL",
          intakeData: intakeData as unknown as Record<string, unknown>,
        });
        if (!cancelled) {
          setBundleOptions(response.options || []);
          setSelectedBundleItemIds(prev => {
            const eligibleIds = new Set((response.options || []).filter(o => o.eligible).map(o => o.id));
            const next = new Set<BundleOptionItem["id"]>();
            for (const id of prev) {
              if (eligibleIds.has(id)) next.add(id);
            }
            return next;
          });
        }
      } catch {
        if (!cancelled) setBundleOptions([]);
      }
    };

    loadBundleOptions();
    return () => { cancelled = true; };
  }, [intakeData]);

  const handleRecommend = useCallback(async () => {
    if (!selectedProfile) return;
    setIsRecommending(true);
    setError(null);
    try {
      const recs = await recommendClauses({
        contractType: "ADASVETEL",
        intakeData: intakeData as unknown as Record<string, unknown>,
        lawyerProfileId: selectedProfile.id,
      });
      setRecommendations(recs);
      // Auto-select all recommended clauses
      setSelectedClauseIds(new Set(recs.map(r => r.clauseId)));
    } catch (err: any) {
      setError(err.message || "Recommendation failed");
    } finally {
      setIsRecommending(false);
    }
  }, [selectedProfile, intakeData]);

  const handleToggleClause = useCallback((clauseId: string) => {
    setSelectedClauseIds(prev => {
      const next = new Set(prev);
      if (next.has(clauseId)) next.delete(clauseId);
      else next.add(clauseId);
      return next;
    });
  }, []);

  const handleBodyEdit = useCallback((clauseId: string, body: string) => {
    setEditedBodies(prev => ({ ...prev, [clauseId]: body }));
  }, []);

  const handleSaveDraft = useCallback(async () => {
    if (!selectedProfile) return;
    setIsSaving(true);
    setError(null);
    try {
      const selectedClauses: AssemblyClauseEntry[] = Array.from(selectedClauseIds).map((id, idx) => ({
        clauseId: id,
        sortOrder: idx,
        editedBody: editedBodies[id] || null,
        isManual: !recommendations.find(r => r.clauseId === id),
      }));

      const assembledText = selectedClauses
        .map(sc => {
          const clause = allClauses.find(c => c.id === sc.clauseId);
          return clause ? (editedBodies[sc.clauseId] || clause.body) : "";
        })
        .join("\n\n");

      const result = await upsertClauseLibraryAssembly({
        caseId,
        contractType: "ADASVETEL",
        intakeData: intakeData as unknown as Record<string, unknown>,
        selectedClauses,
        assembledText,
        status: "IN_PROGRESS",
        lawyerProfileId: selectedProfile.id,
      });
      setAssemblyId(result.id);
      setMessage("Tervezet elmentve!");
    } catch (err: any) {
      setError(err.message || "Save failed");
    } finally {
      setIsSaving(false);
    }
  }, [caseId, selectedProfile, selectedClauseIds, editedBodies, intakeData, recommendations, allClauses]);

  const handleGenerate = useCallback(async () => {
    if (!selectedTemplate) {
      setError("Válasszon sablont a generáláshoz!");
      return;
    }
    if (selectedClauseIds.size === 0) {
      setError("Válasszon ki legalább egy záradékot!");
      return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      // Build assembled_contract_body from selected clauses (sortOrder = Array index)
      const assembled_contract_body = Array.from(selectedClauseIds)
        .map((clauseId) => {
          const clause = allClauses.find(c => c.id === clauseId);
          return clause ? (editedBodies[clauseId] || clause.body) : "";
        })
        .filter(Boolean)
        .join("\n\n");

      // Merge assembled body into intake data; backend's processTemplateData handles formatting
      const data: Record<string, unknown> = {
        ...intakeData,
        assembled_contract_body,
      };

      const result = await generateContract({
        templateId: selectedTemplate.id,
        caseId,
        title: `Szerződésösszeállítás — ${caseData?.title || caseId} — ${new Date().toLocaleDateString("hu-HU")}`,
        data,
        selectedBundleItemIds: Array.from(selectedBundleItemIds),
      });

      if (result.success && result.document) {
        const generatedBundleCount = result.bundleDocuments?.length || 0;
        const skippedBundleCount = result.skippedBundleItems?.length || 0;
        setMessage(
          generatedBundleCount > 0 || skippedBundleCount > 0
            ? `Fődokumentum generálva: ${result.document.fileName} · Bundle: ${generatedBundleCount} generált, ${skippedBundleCount} kihagyott`
            : `Dokumentum generálva: ${result.document.fileName}`
        );
        // Auto-download
        const blob = await downloadContract(result.document.id);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.document.fileName || "szerzodes.docx";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        setError(result.error || "Generation failed");
      }
    } catch (err: any) {
      setError(err.message || "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }, [caseId, caseData, selectedClauseIds, editedBodies, intakeData, allClauses, selectedTemplate, selectedBundleItemIds]);

  const handleToggleBundleItem = useCallback((itemId: BundleOptionItem["id"]) => {
    setSelectedBundleItemIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const handleIntakeChange = <K extends keyof IntakeSchema>(key: K, value: IntakeSchema[K]) => {
    setIntakeData(prev => ({ ...prev, [key]: value }));
  };

  // Group recommendations by category
  const groupedRecommendations = CATEGORY_ORDER.reduce((acc, cat) => {
    acc[cat] = recommendations.filter(r => r.category === cat);
    return acc;
  }, {} as Record<ClauseCategory, ClauseRecommendation[]>);

  const selectedClausesList = allClauses.filter(c => selectedClauseIds.has(c.id));
  const generationReady = Boolean(selectedTemplate) && selectedClauseIds.size > 0;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-[#7B776D]">Betöltés...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0">
      {/* Left sidebar — Case context + intake form */}
      <aside className="w-72 border-r border-[#DDD7CA] bg-[#F6F2E8] flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-[#DDD7CA]">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-2">Ügy kontextus</p>
          <p className="text-[11px] text-[#1F2821] font-semibold leading-tight">{caseData?.title || "—"}</p>
          <p className="text-[10px] text-[#7B776D] mt-1">{caseData?.caseNumber || caseId}</p>
          {caseData?.clientName && <p className="text-[10px] text-[#7B776D] mt-0.5">Ügyfél: {caseData.clientName}</p>}
          {caseData?.clientRole && <p className="text-[10px] text-[#7B776D] mt-0.5">Szerep: {caseData.clientRole}</p>}
        </div>

        {/* Lawyer profile selector */}
        <div className="p-4 border-b border-[#DDD7CA]">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-2">Ügyvédi profil</p>
          {profiles.length === 0 ? (
            <p className="text-[10px] text-[#9C9890] italic">Nincs betöltve ügyvédi profil.</p>
          ) : (
            <select
              className="w-full border border-[#DDD7CA] bg-white px-2 py-1.5 text-xs text-[#1F2821] rounded"
              value={selectedProfile?.id || ""}
              onChange={e => {
                const p = profiles.find(p => p.id === e.target.value);
                setSelectedProfile(p || null);
              }}
            >
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.lawyerName}</option>
              ))}
            </select>
          )}
          {selectedProfile && (
            <div className="mt-2 p-2 bg-white border border-[#DDD7CA] rounded">
              {selectedProfile.preferredNumbering && (
                <p className="text-[9px] text-[#7B776D]">Számozás: <span className="text-[#1F2821]">{selectedProfile.preferredNumbering}</span></p>
              )}
              {selectedProfile.styleNotes && (
                <p className="text-[9px] text-[#7B776D] mt-1">Stílus: <span className="text-[#1F2821]">{selectedProfile.styleNotes}</span></p>
              )}
            </div>
          )}
        </div>

        {/* B400 Intake Form */}
        <div className="p-4 flex-1 space-y-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D]">B400 Tényállás</p>

          {/* Represented side */}
          <div>
            <label className="text-[9px] uppercase tracking-[0.15em] text-[#7B776D] block mb-1">Képviselt oldal</label>
            <select
              className="w-full border border-[#DDD7CA] bg-white px-2 py-1.5 text-xs text-[#1F2821] rounded"
              value={intakeData.representedSide}
              onChange={e => handleIntakeChange("representedSide", e.target.value as IntakeSchema["representedSide"])}
            >
              <option value="EITHER">Egyik sem / Mindkettő</option>
              <option value="ELOADO">Eladó</option>
              <option value="VEVO">Vevő</option>
            </select>
          </div>

          {/* Financing type */}
          <div>
            <label className="text-[9px] uppercase tracking-[0.15em] text-[#7B776D] block mb-1">Finanszírozás</label>
            <select
              className="w-full border border-[#DDD7CA] bg-white px-2 py-1.5 text-xs text-[#1F2821] rounded"
              value={intakeData.financingType}
              onChange={e => handleIntakeChange("financingType", e.target.value as IntakeSchema["financingType"])}
            >
              <option value="CASH">Készpénz (saját erő)</option>
              <option value="OTP_BANK_LOAN">OTP Bank (jelzáloghitel)</option>
              <option value="OTHER_BANK_LOAN">Más bank (jelzáloghitel)</option>
              <option value="MIXED">Vegyes finanszírozás</option>
            </select>
          </div>

          {/* Bank pack */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-3.5 h-3.5 accent-[#C9A227]"
                checked={intakeData.bankPackRequired}
                onChange={e => handleIntakeChange("bankPackRequired", e.target.checked)}
              />
              <span className="text-[10px] text-[#1F2821]">Banki csomag szükséges</span>
            </label>
          </div>

          {/* Party counts */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] uppercase tracking-[0.15em] text-[#7B776D] block mb-1">Eladók száma</label>
              <input
                type="number"
                min={1}
                max={5}
                className="w-full border border-[#DDD7CA] bg-white px-2 py-1.5 text-xs text-[#1F2821] rounded"
                value={intakeData.sellerCount}
                onChange={e => handleIntakeChange("sellerCount", parseInt(e.target.value) || 1)}
              />
            </div>
            <div>
              <label className="text-[9px] uppercase tracking-[0.15em] text-[#7B776D] block mb-1">Vevők száma</label>
              <input
                type="number"
                min={1}
                max={5}
                className="w-full border border-[#DDD7CA] bg-white px-2 py-1.5 text-xs text-[#1F2821] rounded"
                value={intakeData.buyerCount}
                onChange={e => handleIntakeChange("buyerCount", parseInt(e.target.value) || 1)}
              />
            </div>
          </div>

          {/* Additional flags */}
          <div className="space-y-1.5">
            {[
              { key: "hasPreemptiveRights" as const, label: "Elővásárlási jog fennáll" },
              { key: "insuranceRequired" as const, label: "Biztosítás átírása szükséges" },
              { key: "condominiumProperty" as const, label: "Társasházi ingatlan" },
              { key: "foreignParty" as const, label: "Külföldi fél" },
              { key: "farmlandProperty" as const, label: "Mezőgazdasági ingatlan" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 accent-[#C9A227]"
                  checked={intakeData[key]}
                  onChange={e => handleIntakeChange(key, e.target.checked)}
                />
                <span className="text-[10px] text-[#1F2821]">{label}</span>
              </label>
            ))}
          </div>

          {/* Recommend button */}
          <button
            onClick={handleRecommend}
            disabled={isRecommending}
            className="w-full py-2 text-[10px] uppercase tracking-[0.2em] border border-[#C9A227] text-[#C9A227] rounded hover:bg-[#F5F1EA] disabled:opacity-50"
          >
            {isRecommending ? "Számítás..." : "Záradékok ajánlása"}
          </button>
        </div>

        {/* Back link */}
        <div className="p-3 border-t border-[#DDD7CA]">
          <button
            onClick={() => router.push(`/cases/${caseId}/generate`)}
            className="w-full text-left px-3 py-2 text-[10px] text-[#514D45] hover:bg-[#ECE6DA] rounded flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Sablon-alapú generálás
          </button>
        </div>
      </aside>

      {/* Main content — Clause list */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8 space-y-6">
          {/* Header */}
          <div>
            <span className="text-[9px] uppercase tracking-[0.35em] text-[#7B776D] px-2 py-1 bg-[#ECE6DA] inline-block mb-2">
              Szerződésösszeállítás
            </span>
            <h1 className="text-2xl font-serif text-[#1F2821]">Adásvételi szerződés — Összeállítás</h1>
            <p className="text-xs text-[#7B776D] mt-1">
              Válassza ki a tényállásnak megfelelő záradékokat, szerkessze szükség szerint, majd generálja a szerződést.
            </p>
          </div>

          {/* Messages */}
          {message && (
            <div className="bg-[#ECFDF5] border border-[#10B981] rounded p-3">
              <p className="text-xs text-[#059669]">{message}</p>
            </div>
          )}
          {error && (
            <div className="bg-[#FEF2F2] border border-[#FECACA] rounded p-3">
              <p className="text-xs text-[#DC2626]">{error}</p>
            </div>
          )}

          {/* Status summary */}
          {recommendations.length > 0 && (
            <div className="bg-[#FEF9E7] border border-[#E6D39A] rounded p-3">
              <p className="text-[10px] text-[#7B776D] mb-1">
                {recommendations.length} záradék javasolva · {selectedClauseIds.size} kiválasztva
              </p>
              <div className="flex flex-wrap gap-1">
                {CATEGORY_ORDER.map(cat => {
                  const count = recommendations.filter(r => r.category === cat).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`text-[9px] px-2 py-1 rounded border ${
                        activeCategory === cat
                          ? "bg-[#C9A227] text-white border-[#C9A227]"
                          : "bg-white text-[#7B776D] border-[#DDD7CA] hover:border-[#C9A227]"
                      }`}
                    >
                      {CATEGORY_LABELS[cat]} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Clause list */}
          {recommendations.length > 0 ? (
            <div className="space-y-3">
              {groupedRecommendations[activeCategory]?.map(rec => {
                const isSelected = selectedClauseIds.has(rec.clauseId);
                const isEdited = !!editedBodies[rec.clauseId];
                const kindColors: Record<string, string> = {
                  REQUIRED: "bg-[#DC2626] text-white",
                  RECOMMENDED: "bg-[#C9A227] text-white",
                  OPTIONAL: "bg-[#E5E7EB] text-[#4B5563]",
                  SPECIAL: "bg-[#7C3AED] text-white",
                };
                return (
                  <div
                    key={rec.clauseId}
                    className={`border rounded p-4 transition-colors ${
                      isSelected ? "border-[#C9A227] bg-[#FEF9E7]" : "border-[#DDD7CA] bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 accent-[#C9A227] mt-0.5"
                            checked={isSelected}
                            onChange={() => handleToggleClause(rec.clauseId)}
                          />
                          <span className="text-xs font-semibold text-[#1F2821]">{rec.title}</span>
                          <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${kindColors[rec.kind] || ""}`}>
                            {rec.kind === "REQUIRED" ? "Kötelező" : rec.kind === "RECOMMENDED" ? "Javasolt" : rec.kind === "SPECIAL" ? "Különös" : "Opcionális"}
                          </span>
                          <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#E5E7EB] text-[#4B5563] uppercase">
                            {rec.representedSide === "ELOADO" ? "Eladói" : rec.representedSide === "VEVO" ? "Vevői" : "Semleges"}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#7B776D] mt-1">{rec.reason}</p>
                      </div>
                    </div>

                    {/* Clause body preview / editor */}
                    {isSelected && (
                      <div className="mt-3 pl-5">
                        <textarea
                          className="w-full border border-[#DDD7CA] bg-[#FAF8F2] px-3 py-2 text-[11px] text-[#1F2821] resize-none font-serif leading-relaxed rounded"
                          rows={6}
                          value={editedBodies[rec.clauseId] || ""}
                          placeholder={allClauses.find(c => c.id === rec.clauseId)?.body || ""}
                          onChange={e => handleBodyEdit(rec.clauseId, e.target.value)}
                        />
                        {isEdited && (
                          <p className="text-[9px] text-[#C9A227] mt-1">↑ Szerkesztett verzió</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 border border-dashed border-[#DDD7CA] rounded">
              <p className="text-sm text-[#7B776D] mb-2">Még nincs javaslat.</p>
              <p className="text-[10px] text-[#9C9890]">
                Töltse ki a B400 tényállást a bal oldalon, majd kattintson a &quot;Záradékok ajánlása&quot; gombra.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Right sidebar — Actions */}
      <aside className="w-72 border-l border-[#DDD7CA] bg-white overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Template picker */}
          <div>
            <h3 className="text-[10px] uppercase tracking-[0.28em] text-[#7B776D] mb-2">Sablon</h3>
            {templates.length === 0 ? (
              <p className="text-[10px] text-[#9C9890] italic">Nincs betöltött sablon.</p>
            ) : (
              <select
                className="w-full border border-[#DDD7CA] bg-white px-2 py-1.5 text-xs text-[#1F2821] rounded"
                value={selectedTemplate?.id || ""}
                onChange={e => {
                  const t = templates.find(t => t.id === e.target.value);
                  setSelectedTemplate(t || null);
                }}
              >
                <option value="">— Válasszon sablont —</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
            {!selectedTemplate && selectedClauseIds.size > 0 && (
              <p className="text-[9px] text-[#C9A227] mt-1">↑ Sablon kiválasztása szükséges</p>
            )}
          </div>

          {/* Generation readiness */}
          <div className="p-2 border border-[#DDD7CA] rounded bg-[#FAF8F2]">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">Generálási készültség</h3>
            <p className="text-[10px] text-[#1F2821]">Kiválasztott záradékok: <span className="font-medium">{selectedClauseIds.size}</span></p>
            <p className="text-[10px] text-[#1F2821]">Sablon: <span className="font-medium">{selectedTemplate?.name || "nincs kiválasztva"}</span></p>
            <p className={`text-[10px] mt-1 ${generationReady ? "text-[#059669]" : "text-[#B45309]"}`}>
              {generationReady
                ? "Készen áll a generálásra."
                : "A generáláshoz válasszon legalább egy záradékot és egy sablont."}
            </p>
            <p className="text-[9px] text-[#7B776D] mt-1">
              A kiválasztott záradékok számozott, címes blokkokként kerülnek beillesztésre a szerződés záró része elé.
            </p>
          </div>

          {/* Bundle options */}
          <div className="p-2 border border-[#DDD7CA] rounded bg-[#FAF8F2]">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">Kapcsolódó dokumentumok</h3>
            <p className="text-[9px] text-[#7B776D] mb-2">
              Opcionális első-passzos kimenetek ugyanabból a tényállásból. B400 itt csak előkészítő export, nem filing.
            </p>
            <div className="space-y-2">
              {bundleOptions.length === 0 ? (
                <p className="text-[9px] text-[#9C9890] italic">Nincs elérhető bundle opció ehhez a szerződéstípushoz.</p>
              ) : (
                bundleOptions.map((option) => (
                  <label key={option.id} className={`block p-2 border rounded ${option.eligible ? 'border-[#DDD7CA] bg-white' : 'border-[#E5E7EB] bg-[#F9FAFB] opacity-70'}`}>
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 accent-[#C9A227] mt-0.5"
                        checked={selectedBundleItemIds.has(option.id)}
                        onChange={() => handleToggleBundleItem(option.id)}
                        disabled={!option.eligible}
                      />
                      <div className="flex-1">
                        <p className="text-[10px] text-[#1F2821] font-medium">{option.label}</p>
                        <p className="text-[9px] text-[#7B776D]">{option.reason}</p>
                        {!option.eligible && (
                          <p className="text-[9px] text-[#B45309] mt-0.5">Jelenleg nem elérhető.</p>
                        )}
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          <div>
            <h3 className="text-[10px] uppercase tracking-[0.28em] text-[#7B776D] mb-3">Műveletek</h3>
            <div className="space-y-2">
              <button
                onClick={handleSaveDraft}
                disabled={isSaving || selectedClauseIds.size === 0}
                className="w-full py-2 text-[10px] uppercase tracking-[0.2em] border border-[#C9A227] text-[#C9A227] rounded hover:bg-[#F5F1EA] disabled:opacity-50"
              >
                {isSaving ? "Mentés..." : "Tervezet mentése"}
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating || selectedClauseIds.size === 0 || !selectedTemplate}
                className="w-full py-2 text-[10px] uppercase tracking-[0.2em] bg-[#059669] text-white rounded hover:bg-[#047857] disabled:opacity-50"
              >
                {isGenerating ? "Generálás..." : "Generálás"}
              </button>
            </div>
          </div>

          {/* Selected clauses summary */}
          {selectedClauseIds.size > 0 && (
            <div>
              <h3 className="text-[10px] uppercase tracking-[0.28em] text-[#7B776D] mb-2">
                Kiválasztott záradékok ({selectedClauseIds.size})
              </h3>
              <div className="space-y-1.5">
                {selectedClausesList.map(clause => (
                  <div key={clause.id} className="text-[10px] text-[#1F2821] flex items-center gap-1.5">
                    <span className="text-[#C9A227]">•</span>
                    <span className="flex-1">{clause.title}</span>
                    {editedBodies[clause.id] && (
                      <span className="text-[8px] text-[#C9A227]">szerk.</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Intake summary */}
          <div>
            <h3 className="text-[10px] uppercase tracking-[0.28em] text-[#7B776D] mb-2">Tényállás összefoglaló</h3>
            <div className="text-[10px] text-[#1F2821] space-y-1">
              <p>Finanszírozás: <span className="font-medium">
                {intakeData.financingType === "CASH" ? "Készpénz" :
                 intakeData.financingType === "OTP_BANK_LOAN" ? "OTP Bank" :
                 intakeData.financingType === "OTHER_BANK_LOAN" ? "Más bank" : "Vegyes"}
              </span></p>
              <p>Eladók: <span className="font-medium">{intakeData.sellerCount}</span></p>
              <p>Vevők: <span className="font-medium">{intakeData.buyerCount}</span></p>
              <p>Banki csomag: <span className="font-medium">{intakeData.bankPackRequired ? "Igen" : "Nem"}</span></p>
              <p>Társasház: <span className="font-medium">{intakeData.condominiumProperty ? "Igen" : "Nem"}</span></p>
              <p>Külföldi fél: <span className="font-medium">{intakeData.foreignParty ? "Igen" : "Nem"}</span></p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
