'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { CompactNewCaseDialog } from '@/components/cases/CompactNewCaseDialog';
import { useRouter } from 'next/navigation';
import {
  getClientWorkgroups,
  getWorkgroupWorkload,
  createWorkgroup,
  updateWorkgroup,
  deleteWorkgroup,
  recordWorkload,
  getClientWorkloadSummary,
  createCase,
  type Client,
  type Workgroup,
  type WorkloadRecord,
  type WorkloadSummary,
  type CreateWorkgroupData,
  type UpdateWorkgroupData,
  type CreateWorkloadData,
  type CreateCaseData,
} from '@/lib/api';

interface PageContentProps {
  client: Client | null;
  workgroups: Workgroup[];
  initialSummary: WorkloadSummary | null;
  currentPeriod: string;
}

export default function WorkgroupsPageContent({
  client,
  workgroups: initialWorkgroups,
  initialSummary,
  currentPeriod,
}: PageContentProps) {
  const router = useRouter();
  const [workgroups, setWorkgroups] = useState<Workgroup[]>(initialWorkgroups);
  const [selectedWorkgroup, setSelectedWorkgroup] = useState<Workgroup | null>(null);
  const [workloadRecords, setWorkloadRecords] = useState<WorkloadRecord[]>([]);
  const [summary, setSummary] = useState<WorkloadSummary | null>(initialSummary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod);

  // Create/edit workgroup modal state
  const [showWorkgroupModal, setShowWorkgroupModal] = useState(false);
  const [editingWorkgroup, setEditingWorkgroup] = useState<Workgroup | null>(null);
  const [workgroupForm, setWorkgroupForm] = useState({ name: '', description: '' });
  const [workgroupSaving, setWorkgroupSaving] = useState(false);

  // Record workload modal state
  const [showWorkloadModal, setShowWorkloadModal] = useState(false);
  const [workloadForm, setWorkloadForm] = useState<CreateWorkloadData>({
    period: currentPeriod,
    reportedHours: 0,
    note: '',
  });
  const [workloadSaving, setWorkloadSaving] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Create case modal state
  const [showCreateCaseModal, setShowCreateCaseModal] = useState(false);
  const [caseForm, setCaseForm] = useState<CreateCaseData>({
    clientName: client?.name || '',
    clientId: client?.id,
    matterType: 'OTHER',
    priority: 'MEDIUM',
    description: '',
  });
  const [caseSaving, setCaseSaving] = useState(false);

  const loadWorkgroups = useCallback(async () => {
    if (!client) return;
    try {
      const data = await getClientWorkgroups(client.id);
      setWorkgroups(data);
    } catch {
      // silent fail
    }
  }, [client]);

  const loadWorkload = useCallback(async (workgroupId: string) => {
    try {
      const data = await getWorkgroupWorkload(workgroupId);
      setWorkloadRecords(data);
    } catch {
      setWorkloadRecords([]);
    }
  }, []);

  const loadSummary = useCallback(async (period: string) => {
    if (!client) return;
    try {
      const data = await getClientWorkloadSummary(client.id, period);
      setSummary(data);
    } catch {
      setSummary(null);
    }
  }, [client]);

  const handleSelectWorkgroup = useCallback(async (wg: Workgroup) => {
    setSelectedWorkgroup(wg);
    await loadWorkload(wg.id);
  }, [loadWorkload]);

  const handlePeriodChange = useCallback(async (period: string) => {
    setSelectedPeriod(period);
    await loadSummary(period);
  }, [loadSummary]);

  const openCreateModal = () => {
    setEditingWorkgroup(null);
    setWorkgroupForm({ name: '', description: '' });
    setShowWorkgroupModal(true);
  };

  const openEditModal = (wg: Workgroup) => {
    setEditingWorkgroup(wg);
    setWorkgroupForm({ name: wg.name, description: wg.description || '' });
    setShowWorkgroupModal(true);
  };

  const handleSaveWorkgroup = async () => {
    if (!client || !workgroupForm.name.trim()) return;
    setWorkgroupSaving(true);
    setError(null);
    try {
      if (editingWorkgroup) {
        const data: UpdateWorkgroupData = { name: workgroupForm.name, description: workgroupForm.description };
        await updateWorkgroup(editingWorkgroup.id, data);
      } else {
        const data: CreateWorkgroupData = { name: workgroupForm.name, description: workgroupForm.description };
        await createWorkgroup(client.id, data);
      }
      setShowWorkgroupModal(false);
      await loadWorkgroups();
      if (selectedWorkgroup) {
        const updated = await getClientWorkgroups(client.id);
        const still = updated.find(w => w.id === selectedWorkgroup.id);
        if (still) setSelectedWorkgroup(still);
      }
    } catch (e: any) {
      setError(e.message || 'Mentés sikertelen');
    } finally {
      setWorkgroupSaving(false);
    }
  };

  const handleDeleteWorkgroup = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await deleteWorkgroup(id);
      setDeletingId(null);
      await loadWorkgroups();
      if (selectedWorkgroup?.id === id) {
        setSelectedWorkgroup(null);
        setWorkloadRecords([]);
      }
    } catch (e: any) {
      setError(e.message || 'Törlés sikertelen');
    } finally {
      setLoading(false);
    }
  };

  const handleRecordWorkload = async () => {
    if (!selectedWorkgroup || workloadForm.reportedHours <= 0) return;
    setWorkloadSaving(true);
    setError(null);
    try {
      await recordWorkload(selectedWorkgroup.id, workloadForm);
      setShowWorkloadModal(false);
      setWorkloadForm({ period: currentPeriod, reportedHours: 0, note: '' });
      await loadWorkload(selectedWorkgroup.id);
      await loadSummary(selectedPeriod);
    } catch (e: any) {
      setError(e.message || 'Mentés sikertelen');
    } finally {
      setWorkloadSaving(false);
    }
  };

  const handleCreateCase = async () => {
    if (!caseForm.clientName || !caseForm.matterType) return;
    setCaseSaving(true);
    setError(null);
    try {
      const result = await createCase(caseForm);
      setShowCreateCaseModal(false);
      // Navigate to the newly created case
      router.push(`/cases/${result.id}`);
    } catch (e: any) {
      setError(e.message || 'Ügy创建 sikertelen');
    } finally {
      setCaseSaving(false);
    }
  };

  const openCreateCaseModal = () => {
    setCaseForm({
      clientName: client?.name || '',
      clientId: client?.id,
      matterType: 'OTHER',
      priority: 'MEDIUM',
      description: '',
    });
    setShowCreateCaseModal(true);
  };

  if (!client) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-yellow-800">
          Ügyfél nem található.
        </div>
        <div className="mt-4">
          <Link href="/clients" className="text-blue-600 hover:underline">← Vissza az ügyfelekhez</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 mb-2">
            <Link href="/clients" className="text-gray-500 hover:text-gray-700 text-sm">Ügyfelek</Link>
            <span className="text-gray-400">/</span>
            <Link href={`/clients?highlight=${client.id}`} className="text-gray-500 hover:text-gray-700 text-sm">{client.name}</Link>
            <span className="text-gray-400">/</span>
            <span className="text-gray-900 font-medium">Munkacsoportok</span>
          </div>
          <button
            onClick={openCreateCaseModal}
            className="px-4 py-2 bg-[#C9A227] text-white text-xs uppercase tracking-[0.2em] hover:bg-[#B8911F] transition-colors rounded flex items-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Új Ügy
          </button>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
        <p className="text-sm text-gray-500">Munkacsoportok és terhelés</p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Workgroup List */}
        <div className="lg:col-span-1">
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 text-sm">Munkacsoportok</h2>
              <button
                onClick={openCreateModal}
                className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
              >
                + Új
              </button>
            </div>

            {workgroups.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">
                Nincs munkacsoport ehhez az ügyfélhez.
              </div>
            ) : (
              <ul className="divide-y">
                {workgroups.map((wg) => (
                  <li key={wg.id}>
                    <button
                      onClick={() => handleSelectWorkgroup(wg)}
                      className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition ${
                        selectedWorkgroup?.id === wg.id ? 'bg-blue-50 border-l-2 border-blue-600' : ''
                      }`}
                    >
                      <div className="font-medium text-gray-900 text-sm">{wg.name}</div>
                      {wg.description && (
                        <div className="text-xs text-gray-500 mt-0.5 truncate">{wg.description}</div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Workgroup Detail + Workload */}
        <div className="lg:col-span-2 space-y-4">
          {selectedWorkgroup ? (
            <>
              {/* Workgroup detail card */}
              <div className="bg-white border rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{selectedWorkgroup.name}</h3>
                    {selectedWorkgroup.description && (
                      <p className="text-sm text-gray-500 mt-1">{selectedWorkgroup.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditModal(selectedWorkgroup)}
                      className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-1"
                    >
                      Szerkesztés
                    </button>
                    {deletingId === selectedWorkgroup.id ? (
                      <div className="flex gap-1 items-center">
                        <span className="text-xs text-red-600">Töröl?</span>
                        <button
                          onClick={() => handleDeleteWorkgroup(selectedWorkgroup.id)}
                          disabled={loading}
                          className="text-xs bg-red-600 text-white rounded px-2 py-1"
                        >
                          Igen
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="text-xs text-gray-600 border rounded px-2 py-1"
                        >
                          Mégse
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingId(selectedWorkgroup.id)}
                        className="text-xs text-red-600 hover:text-red-800 border border-red-200 rounded px-2 py-1"
                      >
                        Törlés
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-xs text-gray-400">
                  Létrehozva: {new Date(selectedWorkgroup.createdAt).toLocaleDateString('hu-HU')}
                </div>

                {/* Record workload button */}
                <div className="mt-4 pt-3 border-t">
                  <button
                    onClick={() => {
                      setWorkloadForm({ period: selectedPeriod, reportedHours: 0, note: '' });
                      setShowWorkloadModal(true);
                    }}
                    className="text-sm bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                  >
                    + Terhelés rögzítése
                  </button>
                </div>
              </div>

              {/* Workload Records */}
              <div className="bg-white border rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50">
                  <h4 className="font-semibold text-gray-800 text-sm">Felvitt terhelések</h4>
                </div>
                {workloadRecords.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 text-sm">
                    Nincs terhelési adat ehhez a munkacsoporthoz.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Időszak</th>
                        <th className="px-4 py-2 text-left">Órák</th>
                        <th className="px-4 py-2 text-left">Megjegyzés</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {workloadRecords.map((rec) => (
                        <tr key={rec.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-gray-900">{rec.period}</td>
                          <td className="px-4 py-2.5 font-medium text-gray-900">{rec.reportedHours} óra</td>
                          <td className="px-4 py-2.5 text-gray-500">{rec.note || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div className="bg-white border rounded-lg p-12 text-center text-gray-500">
              Válasszon munkacsoportot a bal oldali listából.
            </div>
          )}

          {/* Workload Summary */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <h4 className="font-semibold text-gray-800 text-sm">Összesített terhelés</h4>
              <input
                type="month"
                value={selectedPeriod}
                onChange={(e) => handlePeriodChange(e.target.value)}
                className="text-sm border rounded px-2 py-1"
              />
            </div>
            {summary ? (
              <div className="p-4">
                <div className="text-2xl font-bold text-gray-900 mb-1">
                  {summary.totalHours} óra
                </div>
                <p className="text-xs text-gray-500 mb-4">{selectedPeriod}</p>
                {summary.workgroups.length === 0 ? (
                  <p className="text-sm text-gray-500">Nincs adat ehhez az időszakhoz.</p>
                ) : (
                  <div className="space-y-2">
                    {summary.workgroups.map((wg) => (
                      <div key={wg.id} className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-gray-700">{wg.name}</span>
                            <span className="text-gray-500">{wg.hours} óra ({wg.percentage}%)</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div
                              className="bg-blue-500 h-1.5 rounded-full"
                              style={{ width: `${wg.percentage}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center text-gray-500 text-sm">
                Nem sikerült betölteni az összesítést.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create/Edit Workgroup Modal */}
      {showWorkgroupModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editingWorkgroup ? 'Munkacsoport szerkesztése' : 'Új munkacsoport'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Név *</label>
                <input
                  type="text"
                  value={workgroupForm.name}
                  onChange={(e) => setWorkgroupForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="pl. Ingatlan csapat"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Leírás</label>
                <textarea
                  value={workgroupForm.description}
                  onChange={(e) => setWorkgroupForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                  rows={2}
                  placeholder="Opcionális leírás..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowWorkgroupModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border rounded hover:bg-gray-50"
              >
                Mégse
              </button>
              <button
                onClick={handleSaveWorkgroup}
                disabled={workgroupSaving || !workgroupForm.name.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {workgroupSaving ? 'Mentés...' : 'Mentés'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Workload Modal */}
      {showWorkloadModal && selectedWorkgroup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Terhelés rögzítése — {selectedWorkgroup.name}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Időszak *</label>
                <input
                  type="month"
                  value={workloadForm.period}
                  onChange={(e) => setWorkloadForm(f => ({ ...f, period: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Órák *</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={workloadForm.reportedHours}
                  onChange={(e) => setWorkloadForm(f => ({ ...f, reportedHours: parseFloat(e.target.value) || 0 }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="pl. 8"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Megjegyzés</label>
                <textarea
                  value={workloadForm.note || ''}
                  onChange={(e) => setWorkloadForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                  rows={2}
                  placeholder="Opcionális megjegyzés..."
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Ha az időszakhoz már van adat, az felülíródik.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowWorkloadModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border rounded hover:bg-gray-50"
              >
                Mégse
              </button>
              <button
                onClick={handleRecordWorkload}
                disabled={workloadSaving || workloadForm.reportedHours <= 0 || !workloadForm.period}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {workloadSaving ? 'Mentés...' : 'Mentés'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Case Modal */}
      <CompactNewCaseDialog
        open={showCreateCaseModal}
        onClose={() => setShowCreateCaseModal(false)}
        initialClientId={client?.id}
      />
      {false && showCreateCaseModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Új ügy létrehozása
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ügyfél</label>
                <input
                  type="text"
                  value={caseForm.clientName}
                  onChange={(e) => setCaseForm(f => ({ ...f, clientName: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm bg-gray-100"
                  disabled
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ügytípus *</label>
                <select
                  value={caseForm.matterType}
                  onChange={(e) => setCaseForm(f => ({ ...f, matterType: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  <option value="REAL_ESTATE_SALE">Ingatlan adásvétel</option>
                  <option value="LEASE">Bérlet</option>
                  <option value="EMPLOYMENT">Munkaviszony</option>
                  <option value="CORPORATE">Cégjogi</option>
                  <option value="LITIGATION">Peres</option>
                  <option value="OTHER">Egyéb</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prioritás</label>
                <select
                  value={caseForm.priority}
                  onChange={(e) => setCaseForm(f => ({ ...f, priority: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  <option value="LOW">Alacsony</option>
                  <option value="MEDIUM">Közepes</option>
                  <option value="HIGH">Magas</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Leírás</label>
                <textarea
                  value={caseForm.description || ''}
                  onChange={(e) => setCaseForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                  rows={3}
                  placeholder="Opcionális leírás..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowCreateCaseModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border rounded hover:bg-gray-50"
              >
                Mégse
              </button>
              <button
                onClick={handleCreateCase}
                disabled={caseSaving || !caseForm.clientName || !caseForm.matterType}
                className="px-4 py-2 text-sm bg-[#C9A227] text-white rounded hover:bg-[#B8911F] disabled:opacity-50"
              >
                {caseSaving ? 'Létrehozás...' : 'Létrehozás'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
