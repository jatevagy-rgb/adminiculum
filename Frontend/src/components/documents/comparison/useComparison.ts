"use client";

/**
 * Comparison hooks (STRUCTURED-DOC-COMPARISON-1). Data-fetch, controlled polling
 * (stops at any terminal status — never an infinite loop), segment listing with
 * typed filters, and segment mutation with optimistic-conflict surfacing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createComparison, getComparison, retryComparison, listSegments, updateSegment,
  linkSegmentTask, unlinkSegmentTask, ComparisonConflictError,
  type ComparisonDto, type SegmentDto, type SegmentFilters, type SegmentPatch,
} from "@/lib/documents/comparisonApi";
import { isPollingStatus } from "@/lib/documents/comparisonModel";

export function useDocumentComparison(documentId: string) {
  const [comparison, setComparison] = useState<ComparisonDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlight = useRef(false); // synchronous double-submit guard

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const beginPolling = useCallback((id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const next = await getComparison(id);
        setComparison(next);
        if (!isPollingStatus(next.status)) stopPolling();
      } catch { stopPolling(); }
    }, 2000);
  }, [stopPolling]);

  const create = useCallback(async (baseVersionId: string, targetVersionId: string) => {
    if (inFlight.current) return; // prevent duplicate create submissions
    inFlight.current = true;
    setCreating(true); setError(null);
    try {
      const row = await createComparison(documentId, baseVersionId, targetVersionId);
      setComparison(row);
      if (isPollingStatus(row.status)) beginPolling(row.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "A összehasonlítás nem indítható.");
    } finally {
      setCreating(false); inFlight.current = false;
    }
  }, [documentId, beginPolling]);

  const retry = useCallback(async () => {
    if (!comparison) return;
    setError(null);
    try {
      const row = await retryComparison(comparison.id);
      setComparison(row);
      if (isPollingStatus(row.status)) beginPolling(row.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Újrapróbálkozás sikertelen."); }
  }, [comparison, beginPolling]);

  const load = useCallback(async (id: string) => {
    setLoading(true); setError(null);
    try {
      const row = await getComparison(id);
      setComparison(row);
      if (isPollingStatus(row.status)) beginPolling(row.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Az összehasonlítás nem tölthető be."); }
    finally { setLoading(false); }
  }, [beginPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  return { comparison, loading, creating, error, create, retry, load, setComparison };
}

export function useComparisonSegments(comparisonId: string | null, filters: SegmentFilters) {
  const [segments, setSegments] = useState<SegmentDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(filters);

  const reload = useCallback(async () => {
    if (!comparisonId) { setSegments([]); setTotal(0); return; }
    setLoading(true); setError(null);
    try {
      const page = await listSegments(comparisonId, filters);
      setSegments(page.data); setTotal(page.total);
    } catch (e) { setError(e instanceof Error ? e.message : "A szegmensek nem tölthetők be."); }
    finally { setLoading(false); }
  }, [comparisonId, key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void reload(); }, [reload]);
  return { segments, total, loading, error, reload };
}

export function useComparisonSegmentMutation(comparisonId: string | null) {
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const save = useCallback(async (segmentId: string, patch: SegmentPatch): Promise<SegmentDto | null> => {
    if (!comparisonId || inFlight.current) return null;
    inFlight.current = true;
    setSaving(true); setConflict(false); setError(null);
    try {
      return await updateSegment(comparisonId, segmentId, patch);
    } catch (e) {
      if (e instanceof ComparisonConflictError) { setConflict(true); return null; }
      setError(e instanceof Error ? e.message : "A mentés nem sikerült.");
      return null;
    } finally { setSaving(false); inFlight.current = false; }
  }, [comparisonId]);

  const linkTask = useCallback(async (segmentId: string, taskId: string) => {
    if (!comparisonId) return null;
    return linkSegmentTask(comparisonId, segmentId, taskId);
  }, [comparisonId]);
  const unlinkTask = useCallback(async (segmentId: string) => {
    if (!comparisonId) return null;
    return unlinkSegmentTask(comparisonId, segmentId);
  }, [comparisonId]);

  return { save, linkTask, unlinkTask, saving, conflict, error, clearConflict: () => setConflict(false) };
}

export function useComparisonKeyboardNavigation(count: number, selected: number, setSelected: (i: number) => void) {
  const memo = useMemo(() => ({ count, selected }), [count, selected]);
  useEffect(() => {
    if (memo.count === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); setSelected(Math.min(memo.selected + 1, memo.count - 1)); }
      else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); setSelected(Math.max(memo.selected - 1, 0)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [memo, setSelected]);
}
