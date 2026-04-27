"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { getClients, createClient, updateClient, deleteClient, type Client, type CreateClientData, type UpdateClientData } from "@/lib/api";

export default function ClientsPage() {
  return (
    <AuthenticatedApp section="clients">
      <ClientsPageContent />
    </AuthenticatedApp>
  );
}

function ClientsPageContent() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState<CreateClientData>({
    name: "",
    email: "",
    phone: "",
    address: "",
    taxNumber: "",
    companyRegistrationNumber: "",
    authorizedRepresentative: "",
    contactPerson: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getClients();
      setClients(response.data || []);
    } catch (err) {
      console.error('Failed to load clients:', err);
      setError('Failed to load clients');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const handleCreate = () => {
    setEditingClient(null);
    setFormData({
      name: "",
      email: "",
      phone: "",
      address: "",
      taxNumber: "",
      companyRegistrationNumber: "",
      authorizedRepresentative: "",
      contactPerson: "",
    });
    setShowModal(true);
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      name: client.name || "",
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      taxNumber: client.taxNumber || "",
      companyRegistrationNumber: client.companyRegistrationNumber || "",
      authorizedRepresentative: client.authorizedRepresentative || "",
      contactPerson: client.contactPerson || "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name?.trim()) {
      alert("Client name is required");
      return;
    }

    setIsSaving(true);
    try {
      if (editingClient) {
        const updateData: UpdateClientData = {
          name: formData.name,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          address: formData.address || undefined,
          taxNumber: formData.taxNumber || undefined,
          companyRegistrationNumber: formData.companyRegistrationNumber || undefined,
          authorizedRepresentative: formData.authorizedRepresentative || undefined,
          contactPerson: formData.contactPerson || undefined,
        };
        await updateClient(editingClient.id, updateData);
      } else {
        await createClient(formData);
      }
      setShowModal(false);
      await loadClients();
    } catch (err: unknown) {
      console.error('Failed to save client:', err);
      const message = err instanceof Error && err.message
        ? err.message
        : 'Failed to save client';
      alert(`Client save failed: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (clientId: string) => {
    try {
      await deleteClient(clientId);
      setDeleteConfirm(null);
      await loadClients();
    } catch (err: unknown) {
      console.error('Failed to delete client:', err);
      const message = err instanceof Error && err.message
        ? err.message
        : 'Failed to delete client';
      alert(`Delete failed: ${message}`);
    }
  };

  return (
    <div className="flex-1 flex min-h-0">
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-serif text-[#1F2821]">Ügyfélkapcsolatok és intake</h1>
              <p className="text-xs text-[#7B776D] mt-1">{clients.length} ügyfélrekord · ügyfélből közvetlenül nyitható ügydosszié és ügyindítás</p>
            </div>
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-[#C9A227] text-white text-xs uppercase tracking-[0.2em] hover:bg-[#B8911F] transition-colors rounded flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Client
            </button>
          </div>

          <div className="mb-6 p-3 border border-[#DDD7CA] bg-white">
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D] mb-2">Kapcsolt munkafolyamatok</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <Link href="/cases" className="px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Ügylista</Link>
              <Link href="/tasks" className="px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Feladatok</Link>
              <Link href="/notifications" className="px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Értesítések</Link>
              <Link href="/time-entries" className="px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Munkaórák</Link>
            </div>
            <p className="text-[11px] text-[#9C9890] mt-2">Tipikus útvonal: ügyfél felvétele → ügyfél dosszié megnyitása → új ügy indítása.</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-[#fef2f2] border border-[#d4b8b8] text-[#8b3a3a] text-xs rounded">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C9A227] mx-auto mb-4"></div>
              <p className="text-xs text-[#9C9890]">Loading clients...</p>
            </div>
          ) : clients.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-[#DDD7CA]">
              <svg className="w-12 h-12 mx-auto text-[#9C9890] mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
              <p className="text-xs text-[#9C9890] mb-2">Még nincs ügyfél rögzítve.</p>
              <p className="text-[11px] text-[#7B776D] mb-4">Az ügyfélfelület akkor válik hasznossá, ha itt felveszed az ügyfelet, majd az ügyfél dossziéból ügyet indítasz.</p>
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-[#C9A227] text-white text-xs uppercase tracking-[0.2em] hover:bg-[#B8911F] transition-colors rounded"
              >
                Első ügyfél felvétele
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {clients.map((client) => (
                <div
                  key={client.id}
                  className="p-4 border border-[#DDD7CA] bg-white hover:bg-[#FBF9F3] transition-colors rounded"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/clients/${client.id}`}
                        className="w-10 h-10 rounded-full bg-[#F6F2E8] flex items-center justify-center text-sm font-medium text-[#6B655B] hover:bg-[#C9A227] hover:text-white transition-colors"
                      >
                        {client.name?.charAt(0)?.toUpperCase() || "?"}
                      </Link>
                        <div className="min-w-0">
                          <Link
                            href={`/clients/${client.id}`}
                            className="text-sm font-semibold text-[#1F2821] hover:text-[#C9A227] transition-colors"
                          >
                            {client.name}
                          </Link>
                          <div className="flex flex-wrap items-center gap-4 mt-1">
                            {client.email && (
                              <span className="text-xs text-[#7B776D]">{client.email}</span>
                            )}
                          {client.phone && (
                            <span className="text-xs text-[#7B776D]">{client.phone}</span>
                          )}
                        </div>
                          {client.address && (
                            <p className="text-xs text-[#9C9890] mt-1">{client.address}</p>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 mt-2">
                            {client.taxNumber && (
                              <p className="text-[11px] text-[#514D45]">
                                <span className="text-[#7B776D]">Tax number:</span> {client.taxNumber}
                              </p>
                            )}
                            {client.companyRegistrationNumber && (
                              <p className="text-[11px] text-[#514D45]">
                                <span className="text-[#7B776D]">Company reg. no.:</span> {client.companyRegistrationNumber}
                              </p>
                            )}
                            {client.authorizedRepresentative && (
                              <p className="text-[11px] text-[#514D45]">
                                <span className="text-[#7B776D]">Authorized representative:</span> {client.authorizedRepresentative}
                              </p>
                            )}
                            {client.contactPerson && (
                              <p className="text-[11px] text-[#514D45]">
                                <span className="text-[#7B776D]">Contact person:</span> {client.contactPerson}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/clients/${client.id}`}
                        className="px-3 py-2 text-[10px] uppercase tracking-[0.18em] border border-[#DDD7CA] text-[#514D45] hover:bg-[#FBF9F3] rounded"
                      >
                        Dosszié
                      </Link>
                      <button
                        onClick={() => handleEdit(client)}
                        className="p-2 text-[#7B776D] hover:text-[#C9A227] hover:bg-[#FBF9F3] rounded"
                        title="Edit client"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </button>
                      {deleteConfirm === client.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(client.id)}
                            className="p-2 text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded"
                            title="Confirm delete"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="p-2 text-[#7B776D] hover:text-[#514D45] hover:bg-[#ECE6DA] rounded"
                            title="Cancel"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(client.id)}
                          className="p-2 text-[#7B776D] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded"
                          title="Delete client"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-6 border-b border-[#DDD7CA]">
              <h2 className="text-lg font-serif text-[#1F2821]">
                {editingClient ? 'Edit Client' : 'New Client'}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-[0.2em] text-[#7B776D] mb-2">
                  Name <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm focus:outline-none focus:border-[#C9A227]"
                  placeholder="Client name"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-[0.2em] text-[#7B776D] mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm focus:outline-none focus:border-[#C9A227]"
                  placeholder="client@example.com"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-[0.2em] text-[#7B776D] mb-2">
                  Phone
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm focus:outline-none focus:border-[#C9A227]"
                  placeholder="+36 XX XXX XXXX"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-[0.2em] text-[#7B776D] mb-2">
                  Tax Number
                </label>
                <input
                  type="text"
                  value={formData.taxNumber}
                  onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm focus:outline-none focus:border-[#C9A227]"
                  placeholder="Adószám / Tax number"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-[0.2em] text-[#7B776D] mb-2">
                  Company Registration Number
                </label>
                <input
                  type="text"
                  value={formData.companyRegistrationNumber}
                  onChange={(e) => setFormData({ ...formData, companyRegistrationNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm focus:outline-none focus:border-[#C9A227]"
                  placeholder="Cégjegyzékszám"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-[0.2em] text-[#7B776D] mb-2">
                  Authorized Representative
                </label>
                <input
                  type="text"
                  value={formData.authorizedRepresentative}
                  onChange={(e) => setFormData({ ...formData, authorizedRepresentative: e.target.value })}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm focus:outline-none focus:border-[#C9A227]"
                  placeholder="Cégjegyzésre jogosult"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-[0.2em] text-[#7B776D] mb-2">
                  Contact Person
                </label>
                <input
                  type="text"
                  value={formData.contactPerson}
                  onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm focus:outline-none focus:border-[#C9A227]"
                  placeholder="Kapcsolattartó"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-[0.2em] text-[#7B776D] mb-2">
                  Address
                </label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-[#DDD7CA] rounded text-sm focus:outline-none focus:border-[#C9A227]"
                  rows={3}
                  placeholder="Client address"
                />
              </div>
            </div>
            <div className="p-6 border-t border-[#DDD7CA] flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#514D45] border border-[#DDD7CA] hover:bg-[#ECE6DA] transition-colors rounded"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !formData.name?.trim()}
                className="px-4 py-2 text-xs uppercase tracking-[0.2em] bg-[#C9A227] text-white hover:bg-[#B8911F] transition-colors rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
