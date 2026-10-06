"use client";
import React from "react";
import { useState } from 'react';
import { AdminButton } from '@/components/adminiculum/ui';
import { DocumentWorkContextEditor } from '@/components/documents/DocumentWorkCard';
import { DocumentWorkInstruction } from './DocumentWorkInstruction';
import { useDocumentWorkContext } from './useDocumentWorkContext';
/** One instruction card uses the existing work-context read/PATCH contract. */
export function DocumentInstructionCard({ documentId }: { documentId: string }) {
  const { card, view, loading, error, reload, setCard } = useDocumentWorkContext(documentId);
  const [editing, setEditing] = useState(false);
  return <details data-testid="document-instruction-card" className="rounded-lg border border-[var(--adm-border)] bg-white p-2">
    <summary className="min-h-10 cursor-pointer text-sm font-semibold text-[var(--adm-green-800)]">Munkautasítás és felelős</summary>
    {loading ? <p role="status">Betöltés…</p> : error ? <p role="alert">{error} <AdminButton variant="neutral" onClick={reload}>Újratöltés</AdminButton></p> : card && view ? <>
      {editing ? <DocumentWorkContextEditor card={card} onClose={() => setEditing(false)} onSaved={(next) => { setCard(next); setEditing(false); }} /> : <>
        <DocumentWorkInstruction view={view} canEdit onEdit={() => setEditing(true)} />
        <p className="mt-2 text-sm">Felelős: {view.owner?.name || 'Nincs kijelölve'} · Határidő: {view.dueDateLabel || 'Nincs megadva'}</p>
        <AdminButton className="mt-2" variant="neutral" onClick={() => setEditing(true)}>Munkautasítás szerkesztése</AdminButton>
      </>}
    </> : null}
  </details>;
}
