"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import {
  ApiError,
  createClauseLibraryClause,
  getClauseLibraryClauses,
  getClauseLibraryProfiles,
  updateClauseLibraryClause,
  type ClauseCategory,
  type ClauseKind,
  type ClauseLibraryItem,
  type LawyerProfile,
  type RepresentedSide,
  type TriggerCondition,
} from "@/lib/api";

type ClauseFormState = {
  id: string | null;
  title: string;
  slug: string;
  body: string;
  summary: string;
  clauseKind: ClauseKind;
  representedSide: RepresentedSide;
  category: ClauseCategory;
  keywordsText: string;
  sortOrder: number;
  isActive: boolean;
  triggerConditionsText: string;
};

const CLAUSE_KIND_OPTIONS: ClauseKind[] = ["REQUIRED", "RECOMMENDED", "OPTIONAL", "SPECIAL"];
const REPRESENTED_SIDE_OPTIONS: RepresentedSide[] = ["EITHER", "ELOADO", "VEVO", "NEUTRAL"];
const CATEGORY_OPTIONS: ClauseCategory[] = [
  "PARTY",
  "PROPERTY",
  "OWNERSHIP_PROOF",
  "TITLE",
  "WARRANTIES",
  "PRICE",
  "FINANCING",
  "POSSESSION",
  "CLOSING",
  "SPECIAL",
];

function emptyForm(): ClauseFormState {
  return {
    id: null,
    title: "",
    slug: "",
    body: "",
    summary: "",
    clauseKind: "RECOMMENDED",
    representedSide: "EITHER",
    category: "SPECIAL",
    keywordsText: "",
    sortOrder: 0,
    isActive: true,
    triggerConditionsText: "[]",
  };
}

function mapClauseToForm(clause: ClauseLibraryItem): ClauseFormState {
  return {
    id: clause.id,
    title: clause.title,
    slug: clause.slug,
    body: clause.body,
    summary: clause.summary || "",
    clauseKind: clause.clauseKind,
    representedSide: clause.representedSide,
    category: clause.category,
    keywordsText: (clause.keywords || []).join(", "),
    sortOrder: clause.sortOrder,
    isActive: clause.isActive,
    triggerConditionsText: JSON.stringify(clause.triggerConditions || [], null, 2),
  };
}

function normalizeKeywords(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function parseTriggerConditions(raw: string): TriggerCondition[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) {
    throw new Error("triggerConditions must be a JSON array");
  }
  return parsed as TriggerCondition[];
}

function makeApiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.status}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

export default function ClauseLibraryPage() {
  return (
    <AuthenticatedApp section="clause-library">
      <ClauseLibraryPageContent />
    </AuthenticatedApp>
  );
}

function ClauseLibraryPageContent() {
  const [profiles, setProfiles] = useState<LawyerProfile[]>([]);
  const [truglyProfileId, setTruglyProfileId] = useState<string | undefined>(undefined);
  const [profileWarning, setProfileWarning] = useState<string | null>(null);

  const [clauses, setClauses] = useState<ClauseLibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterClauseKind, setFilterClauseKind] = useState<"ALL" | ClauseKind>("ALL");
  const [filterRepresentedSide, setFilterRepresentedSide] = useState<"ALL" | RepresentedSide>("ALL");
  const [filterCategory, setFilterCategory] = useState<"ALL" | ClauseCategory>("ALL");
  const [includeInactive, setIncludeInactive] = useState(true);

  const [selectedClauseId, setSelectedClauseId] = useState<string | null>(null);
  const [form, setForm] = useState<ClauseFormState>(emptyForm());

  useEffect(() => {
    const loadProfiles = async () => {
      try {
        const loadedProfiles = await getClauseLibraryProfiles();
        setProfiles(loadedProfiles);

        const trugly = loadedProfiles.find((p) => {
          const name = (p.lawyerName || "").toLowerCase();
          const email = (p.lawyerEmail || "").toLowerCase();
          return name.includes("trugly") || email.includes("trugly");
        });

        if (trugly) {
          setTruglyProfileId(trugly.id);
          setProfileWarning(null);
        } else {
          setTruglyProfileId(undefined);
          setProfileWarning("Dr. Trugly profile was not found. Falling back to broad clause listing.");
        }
      } catch (err) {
        setProfileWarning(`Profile lookup failed: ${makeApiErrorMessage(err)}`);
      }
    };

    void loadProfiles();
  }, []);

  const loadClauses = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await getClauseLibraryClauses({
        contractType: "ADASVETEL",
        lawyerProfileId: truglyProfileId,
        clauseKind: filterClauseKind === "ALL" ? undefined : filterClauseKind,
        representedSide: filterRepresentedSide === "ALL" ? undefined : filterRepresentedSide,
        category: filterCategory === "ALL" ? undefined : filterCategory,
        includeInactive,
        search: search.trim() || undefined,
      });
      setClauses(list);

      if (list.length === 0) {
        setSelectedClauseId(null);
        setForm(emptyForm());
      } else if (selectedClauseId) {
        const existing = list.find((item) => item.id === selectedClauseId);
        if (!existing) {
          setSelectedClauseId(list[0].id);
          setForm(mapClauseToForm(list[0]));
        }
      }
    } catch (err) {
      setError(`Clause loading failed: ${makeApiErrorMessage(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, [truglyProfileId, filterClauseKind, filterRepresentedSide, filterCategory, includeInactive, search, selectedClauseId]);

  useEffect(() => {
    void loadClauses();
  }, [loadClauses]);

  const selectedClause = useMemo(
    () => clauses.find((item) => item.id === selectedClauseId) || null,
    [clauses, selectedClauseId]
  );

  const truglyProfileName = useMemo(() => {
    if (!truglyProfileId) return "Not pinned";
    const p = profiles.find((profile) => profile.id === truglyProfileId);
    return p?.lawyerName || "Dr. Trugly";
  }, [profiles, truglyProfileId]);

  const selectClause = (clause: ClauseLibraryItem) => {
    setSelectedClauseId(clause.id);
    setForm(mapClauseToForm(clause));
    setSuccess(null);
    setError(null);
  };

  const startCreate = () => {
    setSelectedClauseId(null);
    setForm(emptyForm());
    setSuccess(null);
    setError(null);
  };

  const onSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const triggerConditions = parseTriggerConditions(form.triggerConditionsText);
      const keywords = normalizeKeywords(form.keywordsText);

      if (!form.title.trim() || !form.slug.trim() || !form.body.trim()) {
        throw new Error("title, slug, and body are required");
      }

      if (form.id) {
        const updated = await updateClauseLibraryClause(form.id, {
          title: form.title.trim(),
          slug: form.slug.trim(),
          body: form.body,
          summary: form.summary.trim() || "",
          clauseKind: form.clauseKind,
          representedSide: form.representedSide,
          category: form.category,
          sortOrder: Number(form.sortOrder) || 0,
          keywords,
          triggerConditions,
          isActive: form.isActive,
        });
        setSuccess("Clause updated.");
        await loadClauses();
        setSelectedClauseId(updated.id);
        setForm(mapClauseToForm(updated));
      } else {
        const created = await createClauseLibraryClause({
          title: form.title.trim(),
          slug: form.slug.trim(),
          body: form.body,
          summary: form.summary.trim() || undefined,
          contractType: "ADASVETEL",
          clauseKind: form.clauseKind,
          representedSide: form.representedSide,
          category: form.category,
          sortOrder: Number(form.sortOrder) || 0,
          keywords,
          triggerConditions,
          lawyerProfileId: truglyProfileId,
        });
        setSuccess("Clause created.");
        await loadClauses();
        setSelectedClauseId(created.id);
        setForm(mapClauseToForm(created));
      }
    } catch (err) {
      setError(`Save failed: ${makeApiErrorMessage(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async () => {
    if (!form.id) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateClauseLibraryClause(form.id, { isActive: !form.isActive });
      setSuccess(updated.isActive ? "Clause activated." : "Clause deactivated.");
      await loadClauses();
      setSelectedClauseId(updated.id);
      setForm(mapClauseToForm(updated));
    } catch (err) {
      setError(`Activation toggle failed: ${makeApiErrorMessage(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex">
      <aside className="w-[34rem] border-r border-[#DDD7CA] bg-white min-h-0 flex flex-col">
        <div className="p-4 border-b border-[#EEE7D9] space-y-3">
          <div>
            <h1 className="text-xl font-serif text-[#1F2821]">Clause Library Admin</h1>
            <p className="text-xs text-[#7B776D]">Scope: ADASVETEL + {truglyProfileName}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title / summary / keyword"
              className="col-span-2 px-2 py-2 border border-[#DDD7CA] bg-white text-xs"
            />
            <select
              value={filterClauseKind}
              onChange={(e) => setFilterClauseKind(e.target.value as "ALL" | ClauseKind)}
              className="px-2 py-2 border border-[#DDD7CA] bg-white text-xs"
            >
              <option value="ALL">All kinds</option>
              {CLAUSE_KIND_OPTIONS.map((kind) => (
                <option key={kind} value={kind}>{kind}</option>
              ))}
            </select>
            <select
              value={filterRepresentedSide}
              onChange={(e) => setFilterRepresentedSide(e.target.value as "ALL" | RepresentedSide)}
              className="px-2 py-2 border border-[#DDD7CA] bg-white text-xs"
            >
              <option value="ALL">All sides</option>
              {REPRESENTED_SIDE_OPTIONS.map((side) => (
                <option key={side} value={side}>{side}</option>
              ))}
            </select>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as "ALL" | ClauseCategory)}
              className="px-2 py-2 border border-[#DDD7CA] bg-white text-xs"
            >
              <option value="ALL">All categories</option>
              {CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <label className="px-2 py-2 border border-[#DDD7CA] bg-[#F6F2E8] text-xs text-[#514D45] flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              Include inactive
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void loadClauses()}
              className="px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={startCreate}
              className="px-3 py-2 text-xs border border-[#C9A227] text-[#8B6B3A] bg-[#FBF9F3] hover:bg-[#f5ecd8]"
            >
              New clause
            </button>
          </div>
        </div>

        {profileWarning && (
          <div className="mx-4 mt-3 p-2 border border-[#f5d89a] bg-[#fef3e2] text-[#8B6B3A] text-[11px]">
            {profileWarning}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <p className="text-xs text-[#7B776D]">Loading clauses...</p>
          ) : clauses.length === 0 ? (
            <p className="text-xs text-[#7B776D]">No clauses found for current filters.</p>
          ) : (
            clauses.map((clause) => (
              <button
                key={clause.id}
                type="button"
                onClick={() => selectClause(clause)}
                className={`w-full text-left border p-3 transition-colors ${
                  selectedClauseId === clause.id
                    ? "border-[#C9A227] bg-[#FBF9F3]"
                    : "border-[#DDD7CA] bg-white hover:bg-[#FBF9F3]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#1F2821] truncate">{clause.title}</p>
                  <span
                    className={`text-[10px] px-2 py-0.5 border ${
                      clause.isActive
                        ? "bg-[#ECFDF5] text-[#059669] border-[#a7f3d0]"
                        : "bg-[#FEF2F2] text-[#DC2626] border-[#fca5a5]"
                    }`}
                  >
                    {clause.isActive ? "ACTIVE" : "INACTIVE"}
                  </span>
                </div>
                <p className="text-[11px] text-[#7B776D] mt-1">{clause.slug}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <span className="text-[10px] px-1.5 py-0.5 bg-[#ECE6DA] text-[#514D45]">{clause.clauseKind}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-[#ECE6DA] text-[#514D45]">{clause.representedSide}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-[#ECE6DA] text-[#514D45]">{clause.category}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="max-w-5xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#1F2821]">
              {form.id ? "Edit Clause" : "Create Clause"}
            </h2>
            {selectedClause && (
              <p className="text-xs text-[#7B776D]">Updated: {new Date(selectedClause.updatedAt).toLocaleString("hu-HU")}</p>
            )}
          </div>

          {error && (
            <div className="p-3 border border-[#fca5a5] bg-[#FEF2F2] text-[#8B3A3A] text-xs">{error}</div>
          )}
          {success && (
            <div className="p-3 border border-[#a7f3d0] bg-[#ECFDF5] text-[#059669] text-xs">{success}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-[#514D45] space-y-1 col-span-2">
              <span>Title *</span>
              <input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full px-2 py-2 border border-[#DDD7CA] bg-white"
              />
            </label>

            <label className="text-xs text-[#514D45] space-y-1 col-span-2">
              <span>Slug *</span>
              <input
                value={form.slug}
                onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
                className="w-full px-2 py-2 border border-[#DDD7CA] bg-white"
              />
            </label>

            <label className="text-xs text-[#514D45] space-y-1 col-span-2">
              <span>Summary</span>
              <input
                value={form.summary}
                onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))}
                className="w-full px-2 py-2 border border-[#DDD7CA] bg-white"
              />
            </label>

            <label className="text-xs text-[#514D45] space-y-1">
              <span>Clause kind</span>
              <select
                value={form.clauseKind}
                onChange={(e) => setForm((prev) => ({ ...prev, clauseKind: e.target.value as ClauseKind }))}
                className="w-full px-2 py-2 border border-[#DDD7CA] bg-white"
              >
                {CLAUSE_KIND_OPTIONS.map((kind) => (
                  <option key={kind} value={kind}>{kind}</option>
                ))}
              </select>
            </label>

            <label className="text-xs text-[#514D45] space-y-1">
              <span>Represented side</span>
              <select
                value={form.representedSide}
                onChange={(e) => setForm((prev) => ({ ...prev, representedSide: e.target.value as RepresentedSide }))}
                className="w-full px-2 py-2 border border-[#DDD7CA] bg-white"
              >
                {REPRESENTED_SIDE_OPTIONS.map((side) => (
                  <option key={side} value={side}>{side}</option>
                ))}
              </select>
            </label>

            <label className="text-xs text-[#514D45] space-y-1">
              <span>Category</span>
              <select
                value={form.category}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as ClauseCategory }))}
                className="w-full px-2 py-2 border border-[#DDD7CA] bg-white"
              >
                {CATEGORY_OPTIONS.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>

            <label className="text-xs text-[#514D45] space-y-1">
              <span>Sort order</span>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: Number(e.target.value) || 0 }))}
                className="w-full px-2 py-2 border border-[#DDD7CA] bg-white"
              />
            </label>

            <label className="text-xs text-[#514D45] space-y-1 col-span-2">
              <span>Keywords (comma-separated)</span>
              <input
                value={form.keywordsText}
                onChange={(e) => setForm((prev) => ({ ...prev, keywordsText: e.target.value }))}
                className="w-full px-2 py-2 border border-[#DDD7CA] bg-white"
              />
            </label>

            <label className="text-xs text-[#514D45] space-y-1 col-span-2">
              <span>Body *</span>
              <textarea
                value={form.body}
                onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
                rows={12}
                className="w-full px-2 py-2 border border-[#DDD7CA] bg-white"
              />
            </label>

            <label className="text-xs text-[#514D45] space-y-1 col-span-2">
              <span>Trigger conditions (JSON array)</span>
              <textarea
                value={form.triggerConditionsText}
                onChange={(e) => setForm((prev) => ({ ...prev, triggerConditionsText: e.target.value }))}
                rows={10}
                className="w-full px-2 py-2 border border-[#DDD7CA] bg-white font-mono text-[11px]"
              />
              <p className="text-[11px] text-[#7B776D]">
                Example: [{`{"field":"financing_mode","operator":"eq","value":"loan"}`}] 
              </p>
            </label>

            <label className="col-span-2 inline-flex items-center gap-2 text-xs text-[#514D45]">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              />
              Clause active
            </label>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="px-4 py-2 text-xs bg-[#C9A227] text-white hover:bg-[#B8911F] disabled:opacity-60"
            >
              {isSaving ? "Saving..." : form.id ? "Save changes" : "Create clause"}
            </button>

            {form.id && (
              <button
                type="button"
                onClick={toggleActive}
                disabled={isSaving}
                className="px-4 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3] disabled:opacity-60"
              >
                {form.isActive ? "Deactivate" : "Activate"}
              </button>
            )}

            <button
              type="button"
              onClick={startCreate}
              className="px-4 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]"
            >
              Reset / New
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

