"use client";

/**
 * Fetches and owns the document work-context state for the Contract Workspace
 * header. Deliberately independent of the annotation / version state in the
 * workspace page: it only reads the work context and never mutates editor state,
 * so wiring the header cannot destabilise version-scoped annotations.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { getDocumentWorkContext, type DocumentWorkCard } from "@/lib/api";
import { toWorkContextView, type WorkContextView } from "@/lib/documents/workContext";

export interface UseDocumentWorkContext {
  card: DocumentWorkCard | null;
  view: WorkContextView | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setCard: (next: DocumentWorkCard) => void;
}

export function useDocumentWorkContext(
  documentId: string | null,
  opts?: { selectedVersion?: number | null; currentVersion?: number | null },
): UseDocumentWorkContext {
  const [card, setCard] = useState<DocumentWorkCard | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(documentId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!documentId) { setCard(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      setCard(await getDocumentWorkContext(documentId));
    } catch {
      setError("A dokumentum munkakontextusa nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => { void load(); }, [load]);

  const view = useMemo(
    () => (card ? toWorkContextView(card, opts) : null),
    [card, opts?.selectedVersion, opts?.currentVersion], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { card, view, loading, error, reload: () => void load(), setCard };
}
