"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDocumentReviewRail, type DocumentReviewRailDto } from "@/lib/api";

/**
 * Version-scoped review-rail loader with request-generation safety.
 *
 * A slow response for a previous document/version may never commit state for the
 * newly selected identity, so every load is tagged with a generation and only the
 * latest generation is allowed to write.
 */
export function useDocumentReviewRail(
  documentId: string | null,
  versionId: string | null,
) {
  const [rail, setRail] = useState<DocumentReviewRailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestRef = useRef(0);

  const reload = useCallback(() => setRefreshKey((value) => value + 1), []);

  useEffect(() => {
    if (!documentId || !versionId) {
      requestRef.current += 1;
      setRail(null);
      setLoading(false);
      setError(false);
      return;
    }

    const generation = requestRef.current + 1;
    requestRef.current = generation;
    // Clear immediately: a prior version's rail must never render under the new one.
    setRail(null);
    setError(false);
    setLoading(true);

    let cancelled = false;
    getDocumentReviewRail(documentId, versionId)
      .then((next) => {
        if (cancelled || requestRef.current !== generation) return;
        setRail(next);
      })
      .catch(() => {
        if (cancelled || requestRef.current !== generation) return;
        setRail(null);
        setError(true);
      })
      .finally(() => {
        if (cancelled || requestRef.current !== generation) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [documentId, versionId, refreshKey]);

  return { rail, loading, error, reload };
}
