"use client";

/**
 * Canonical professional editor route — /documents/:documentId/edit
 * (DOCUMENT-EDITOR-PRO-CONTRACT-WORKBENCH-1).
 *
 * `documentId === "new"` opens a standalone working draft without document
 * context. Persistence mode C (export-only working session): content is never
 * saved to the server from this surface, and the UI states this honestly.
 */

import { Suspense, use } from "react";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { DocumentEditorWorkbench } from "@/components/editor/DocumentEditorWorkbench";

type EditorPageProps = {
  params: Promise<{ documentId: string }>;
};

export default function DocumentEditPage({ params }: EditorPageProps) {
  const resolved = use(params);
  const documentId = resolved.documentId === "new" ? null : resolved.documentId;

  return (
    <AuthenticatedApp section="case-detail">
      <Suspense fallback={<div className="p-4 text-[12px] text-[#7A8479]">Szerkesztő betöltése…</div>}>
        <DocumentEditorWorkbench documentId={documentId} />
      </Suspense>
    </AuthenticatedApp>
  );
}
