"use client";

import { useState, useEffect, useCallback } from "react";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import {
  getTimesheetReportPresets,
  createTimesheetReportPreset,
  updateTimesheetReportPreset,
  deactivateTimesheetReportPreset,
  getTimesheetReportTemplates,
  type TimesheetPreset,
  type TimesheetReportTemplate,
  type CreateTimesheetPresetInput,
  type UpdateTimesheetPresetInput,
} from "@/lib/api";

type PresetLayer = "TEMPLATE_DEFAULT" | "LAWYER_DEFAULT" | "CLIENT_DEFAULT" | "CLIENT_LAWYER_OVERRIDE";
type TemplateFamily = "HU_DETAILED_MONTHLY" | "CORPORATE_SUMMARY";

const LAYER_LABELS: Record<PresetLayer, string> = {
  TEMPLATE_DEFAULT: "Sablon alapértelmezett",
  LAWYER_DEFAULT: "Jogász alapértelmezett",
  CLIENT_DEFAULT: "Ügyfél alapértelmezett",
  CLIENT_LAWYER_OVERRIDE: "Ügyfél-jogász felülírás",
};

const LAYER_OPTIONS: PresetLayer[] = [
  "TEMPLATE_DEFAULT",
  "LAWYER_DEFAULT",
  "CLIENT_DEFAULT",
  "CLIENT_LAWYER_OVERRIDE",
];

const FAMILY_LABELS: Record<TemplateFamily, string> = {
  HU_DETAILED_MONTHLY: "HU — Részletes havi",
  CORPORATE_SUMMARY: "Corporate — Összefoglaló",
};

const FAMILY_OPTIONS: TemplateFamily[] = ["HU_DETAILED_MONTHLY", "CORPORATE_SUMMARY"];

interface PresetFormData {
  name: string;
  templateFamily: TemplateFamily;
  layer: PresetLayer;
  lawyerName: string;
  clientName: string;
  monthlyClosure: string;
  pendingOpenMattersNote: string;
  clientClosingText: string;
  defaultLawyerName: string;
}

const DEFAULT_FORM: PresetFormData = {
  name: "",
  templateFamily: "HU_DETAILED_MONTHLY",
  layer: "TEMPLATE_DEFAULT",
  lawyerName: "",
  clientName: "",
  monthlyClosure: "",
  pendingOpenMattersNote: "",
  clientClosingText: "",
  defaultLawyerName: "",
};

export default function TimesheetPresetsPage() {
  return (
    <AuthenticatedApp section="timesheet-presets">
      <TimesheetPresetsPageContent />
    </AuthenticatedApp>
  );
}

function TimesheetPresetsPageContent() {
  const [presets, setPresets] = useState<TimesheetPreset[]>([]);
  const [templates, setTemplates] = useState<TimesheetReportTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingPreset, setEditingPreset] = useState<TimesheetPreset | null>(null);
  const [formData, setFormData] = useState<PresetFormData>(DEFAULT_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  const loadPresets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [presetsData, templatesData] = await Promise.all([
        getTimesheetReportPresets(),
        getTimesheetReportTemplates(),
      ]);
      setPresets(presetsData);
      setTemplates(templatesData);
    } catch (err) {
      console.error("Failed to load presets:", err);
      setError("Nem sikerült betölteni a preseteket.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  const filteredPresets = presets.filter((p) => {
    if (activeFilter === "active") return p.isActive !== false;
    if (activeFilter === "inactive") return p.isActive === false;
    return true;
  });

  const resetForm = () => {
    setFormData(DEFAULT_FORM);
    setEditingPreset(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (preset: TimesheetPreset) => {
    setEditingPreset(preset);
    setFormData({
      name: preset.name,
      templateFamily: preset.templateFamily ?? "HU_DETAILED_MONTHLY",
      layer: preset.layer ?? "TEMPLATE_DEFAULT",
      lawyerName: preset.lawyerName ?? "",
      clientName: preset.clientName ?? "",
      monthlyClosure: preset.defaults?.monthlyClosure ?? "",
      pendingOpenMattersNote: preset.defaults?.pendingOpenMattersNote ?? "",
      clientClosingText: preset.defaults?.clientClosingText ?? "",
      defaultLawyerName: preset.defaults?.lawyerName ?? "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert("Név kötelező");
      return;
    }

    setIsSaving(true);
    try {
      const payload: CreateTimesheetPresetInput | UpdateTimesheetPresetInput = {
        name: formData.name.trim(),
        templateFamily: formData.templateFamily,
        layer: formData.layer,
        lawyerName: formData.lawyerName.trim() || undefined,
        clientName: formData.clientName.trim() || undefined,
        monthlyClosure: formData.monthlyClosure.trim() || undefined,
        pendingOpenMattersNote: formData.pendingOpenMattersNote.trim() || undefined,
        clientClosingText: formData.clientClosingText.trim() || undefined,
        defaultLawyerName: formData.defaultLawyerName.trim() || undefined,
        isActive: true,
      };

      if (editingPreset) {
        await updateTimesheetReportPreset(editingPreset.id, payload as UpdateTimesheetPresetInput);
      } else {
        await createTimesheetReportPreset(payload as CreateTimesheetPresetInput);
      }

      setShowModal(false);
      resetForm();
      await loadPresets();
    } catch (err) {
      console.error("Failed to save preset:", err);
      alert("Nem sikerült menteni a presetet");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await deactivateTimesheetReportPreset(id);
      setDeleteConfirmId(null);
      await loadPresets();
    } catch (err) {
      console.error("Failed to deactivate preset:", err);
      alert("Nem sikerült deaktiválni a presetet");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-serif text-[#1F2821]">Munkaóra-presetek</h1>
            <p className="text-xs text-[#7B776D] mt-1">
              Sablon-alapú riportbeállítások munkaóra-kimutatáshoz
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as "all" | "active" | "inactive")}
              className="px-3 py-2 border border-[#DDD7CA] rounded text-xs"
            >
              <option value="all">Mind</option>
              <option value="active">Aktív</option>
              <option value="inactive">Inaktív</option>
            </select>
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-[#C9A227] text-white text-xs uppercase tracking-[0.2em] hover:bg-[#B8911F] transition-colors rounded"
            >
              + Új preset
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-[#fef2f2] border border-[#d4b8b8] text-[#8b3a3a] text-xs rounded">
            {error}
          </div>
        )}

        {/* Presets Table */}
        {isLoading ? (
          <div className="text-center py-12 text-[#7B776D] text-sm">Betöltés...</div>
        ) : filteredPresets.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-[#7B776D]">Nincs preset.</p>
            <button onClick={openCreateModal} className="mt-3 text-xs text-[#C9A227] hover:underline">
              + Új preset létrehozása
            </button>
          </div>
        ) : (
          <div className="bg-white border border-[#DDD7CA] rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#F6F2E8] border-b border-[#DDD7CA]">
                  <th className="text-left px-4 py-3 text-[#7B776D] font-medium uppercase tracking-wider">Név</th>
                  <th className="text-left px-4 py-3 text-[#7B776D] font-medium uppercase tracking-wider">Sablon</th>
                  <th className="text-left px-4 py-3 text-[#7B776D] font-medium uppercase tracking-wider">Réteg</th>
                  <th className="text-left px-4 py-3 text-[#7B776D] font-medium uppercase tracking-wider">Jogász / Ügyfél</th>
                  <th className="text-left px-4 py-3 text-[#7B776D] font-medium uppercase tracking-wider">Havi záradék</th>
                  <th className="text-left px-4 py-3 text-[#7B776D] font-medium uppercase tracking-wider">Státusz</th>
                  <th className="text-right px-4 py-3 text-[#7B776D] font-medium uppercase tracking-wider">Műveletek</th>
                </tr>
              </thead>
              <tbody>
                {filteredPresets.map((preset) => (
                  <tr key={preset.id} className="border-b border-[#F3EFE5] last:border-b-0 hover:bg-[#FBF9F3]">
                    <td className="px-4 py-3 font-medium text-[#1F2821]">{preset.name}</td>
                    <td className="px-4 py-3 text-[#514D45]">
                      {FAMILY_LABELS[preset.templateFamily as TemplateFamily] ?? preset.templateFamily}
                    </td>
                    <td className="px-4 py-3 text-[#514D45]">
                      {LAYER_LABELS[preset.layer as PresetLayer] ?? preset.layer}
                    </td>
                    <td className="px-4 py-3 text-[#514D45]">
                      <span className="text-[#7B776D]">J:</span> {preset.lawyerName ?? "—"}
                      {" "}
                      <span className="text-[#7B776D]">Ü:</span> {preset.clientName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[#514D45] max-w-[200px] truncate">
                      {preset.defaults?.monthlyClosure ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                        preset.isActive !== false
                          ? "bg-[#ECFDF5] text-[#059669]"
                          : "bg-[#FEF2F2] text-[#8b3a3a]"
                      }`}>
                        {preset.isActive !== false ? "Aktív" : "Inaktív"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(preset)}
                          className="px-2 py-1 text-[10px] border border-[#DDD7CA] rounded hover:bg-[#F6F2E8]"
                        >
                          Szerkesztés
                        </button>
                        {deleteConfirmId === preset.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDeactivate(preset.id)}
                              className="px-2 py-1 text-[10px] bg-[#8b3a3a] text-white rounded"
                            >
                              Mégis
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="px-2 py-1 text-[10px] border border-[#DDD7CA] rounded"
                            >
                              Mégse
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(preset.id)}
                            className="px-2 py-1 text-[10px] border border-[#DDD7CA] rounded hover:bg-[#FEF2F2] hover:text-[#8b3a3a]"
                          >
                            Deaktivál
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#DDD7CA]">
              <h2 className="text-lg font-serif text-[#1F2821]">
                {editingPreset ? "Preset szerkesztése" : "Új preset"}
              </h2>
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="text-[#7B776D] hover:text-[#1F2821] text-xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">
                  Név <span className="text-[#C9A227]">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                  placeholder="Pl. Alpha Zrt. havi riport"
                />
              </div>

              {/* Template Family + Layer row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">
                    Sablon család
                  </label>
                  <select
                    value={formData.templateFamily}
                    onChange={(e) => setFormData((f) => ({ ...f, templateFamily: e.target.value as TemplateFamily }))}
                    className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                  >
                    {FAMILY_OPTIONS.map((f) => (
                      <option key={f} value={f}>{FAMILY_LABELS[f]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">
                    Réteg
                  </label>
                  <select
                    value={formData.layer}
                    onChange={(e) => setFormData((f) => ({ ...f, layer: e.target.value as PresetLayer }))}
                    className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                  >
                    {LAYER_OPTIONS.map((l) => (
                      <option key={l} value={l}>{LAYER_LABELS[l]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Lawyer name + Client name row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">
                    Jogász név (opcionális)
                  </label>
                  <input
                    type="text"
                    value={formData.lawyerName}
                    onChange={(e) => setFormData((f) => ({ ...f, lawyerName: e.target.value }))}
                    className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                    placeholder="Pl. Dr. Hubay"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">
                    Ügyfél név (opcionális)
                  </label>
                  <input
                    type="text"
                    value={formData.clientName}
                    onChange={(e) => setFormData((f) => ({ ...f, clientName: e.target.value }))}
                    className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                    placeholder="Pl. Alpha Zrt."
                  />
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-[#EEE7D9] pt-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-3">Alapértelmezett értékek</p>

                {/* Default Lawyer Name */}
                <div className="mb-3">
                  <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">
                    Default jogász név
                  </label>
                  <input
                    type="text"
                    value={formData.defaultLawyerName}
                    onChange={(e) => setFormData((f) => ({ ...f, defaultLawyerName: e.target.value }))}
                    className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                    placeholder="Pl. Dr. Hubay"
                  />
                </div>

                {/* Monthly Closure */}
                <div className="mb-3">
                  <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">
                    Havi záradék
                  </label>
                  <textarea
                    value={formData.monthlyClosure}
                    onChange={(e) => setFormData((f) => ({ ...f, monthlyClosure: e.target.value }))}
                    className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                    rows={2}
                    placeholder="Havi záradék szövege"
                  />
                </div>

                {/* Pending Open Matters Note */}
                <div className="mb-3">
                  <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">
                    Pending/open megjegyzés
                  </label>
                  <textarea
                    value={formData.pendingOpenMattersNote}
                    onChange={(e) => setFormData((f) => ({ ...f, pendingOpenMattersNote: e.target.value }))}
                    className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                    rows={2}
                    placeholder="Nyitott ügyek megjegyzése"
                  />
                </div>

                {/* Client Closing Text */}
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-1">
                    Client-facing záró szöveg
                  </label>
                  <input
                    type="text"
                    value={formData.clientClosingText}
                    onChange={(e) => setFormData((f) => ({ ...f, clientClosingText: e.target.value }))}
                    className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm"
                    placeholder="Rövid lezáró üzenet"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#DDD7CA] bg-[#FBF9F3]">
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="px-4 py-2 border border-[#DDD7CA] rounded text-xs hover:bg-white"
              >
                Mégse
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 bg-[#1F2821] text-white text-xs rounded disabled:opacity-50 hover:bg-[#2D3A2E]"
              >
                {isSaving ? "Mentés..." : editingPreset ? "Frissítés" : "Létrehozás"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}