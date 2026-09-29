"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { measureAnchorYPositions, resolveRailItemOffset } from "@/lib/documents/readerAnchorMeasure";
import { computeAnchoredLayout, type RailLayoutItem } from "./railAnchorLayout";

export interface ReaderRailLayoutState {
  /** Absolute top (px) per item, relative to the positioning container. */
  positions: Record<string, number>;
  /** Minimum height the positioning container needs so no card is clipped. */
  contentHeight: number;
}

export interface UseReaderRailLayoutParams {
  /** The positioning container (position: relative) whose top is Y = 0. */
  containerRef: RefObject<HTMLElement | null>;
  /** The rendered document root that owns the canonical version text. */
  documentRef: RefObject<HTMLElement | null>;
  items: ReadonlyArray<RailLayoutItem>;
  gap?: number;
  /** Minimum top offset (e.g. a sticky rail header height). */
  minY?: number;
  /** Layout is meaningful only while the anchored margin is actually shown. */
  enabled: boolean;
}

function sameLayout(a: ReaderRailLayoutState, b: ReaderRailLayoutState): boolean {
  if (a.contentHeight !== b.contentHeight) return false;
  const aKeys = Object.keys(a.positions);
  const bKeys = Object.keys(b.positions);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a.positions[key] !== b.positions[key]) return false;
  }
  return true;
}

/**
 * Measures live anchor positions and lays the review cards out deterministically.
 *
 * Recomputes on mount, whenever the rendered item set changes, on container /
 * document / card resize and on viewport resize. It never persists absolute
 * coordinates, so text/search/highlight re-renders and reflows stay aligned.
 */
export function useReaderRailLayout(params: UseReaderRailLayoutParams): ReaderRailLayoutState & {
  registerCard: (id: string) => (element: HTMLElement | null) => void;
} {
  const { containerRef, documentRef, items, gap = 12, minY = 0, enabled } = params;
  const [state, setState] = useState<ReaderRailLayoutState>({ positions: {}, contentHeight: 0 });
  const [observedNodes, setObservedNodes] = useState<{ container: HTMLElement | null; document: HTMLElement | null }>({
    container: null,
    document: null,
  });

  const cardElementsRef = useRef(new Map<string, HTMLElement>());
  const refCallbacksRef = useRef(new Map<string, (element: HTMLElement | null) => void>());
  const frameRef = useRef<number | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Identity of the rendered items that actually affects layout (id + anchor).
  const itemsKey = useMemo(
    () => items.map((item) => `${item.id}:${item.startOffset ?? "n"}`).join("|"),
    [items],
  );

  const registerCard = useCallback((id: string) => {
    const cache = refCallbacksRef.current;
    let callback = cache.get(id);
    if (!callback) {
      callback = (element: HTMLElement | null) => {
        if (element) cardElementsRef.current.set(id, element);
        else cardElementsRef.current.delete(id);
      };
      cache.set(id, callback);
    }
    return callback;
  }, []);

  const recompute = useCallback(() => {
    if (!enabled) {
      setState((prev) => (sameLayout(prev, { positions: {}, contentHeight: 0 }) ? prev : { positions: {}, contentHeight: 0 }));
      return;
    }
    const container = containerRef.current;
    const document = documentRef.current;
    const currentItems = itemsRef.current;
    if (!container || !document || currentItems.length === 0) {
      setState((prev) => (sameLayout(prev, { positions: {}, contentHeight: 0 }) ? prev : { positions: {}, contentHeight: 0 }));
      return;
    }

    // Comment-only anchor recovery: a comment whose stored offset is missing or
    // no longer fits the rendered text resolves its own anchor from its quoted
    // text, so it is ordered and measured by its own document position instead
    // of stacking after the previous card as an unplaced item. A comment with a
    // usable offset and every proposal/draft keep the exact legacy path.
    const rootText = document.textContent ?? "";
    const layoutItems = currentItems.map((item) => {
      if (item.kind !== "comment") return item;
      const resolved = resolveRailItemOffset(rootText, item);
      return resolved === item.startOffset ? item : { ...item, startOffset: resolved };
    });

    const desiredYById = measureAnchorYPositions(
      container,
      document,
      layoutItems.map((item) => ({ id: item.id, startOffset: item.startOffset })),
    );
    const heightById: Record<string, number> = {};
    for (const item of layoutItems) {
      heightById[item.id] = cardElementsRef.current.get(item.id)?.offsetHeight ?? 0;
    }

    const next = computeAnchoredLayout({ items: layoutItems, desiredYById, heightById, gap, minY });
    setState((prev) => (sameLayout(prev, next) ? prev : next));
  }, [containerRef, documentRef, enabled, gap, minY]);

  const scheduleRecompute = useCallback(() => {
    if (typeof window === "undefined") return;
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      recompute();
    });
  }, [recompute]);

  // The rendered item set (rail items, active filter, opened draft composer)
  // drives the layout. Recompute SYNCHRONOUSLY here so a newly opened draft
  // composer or a newly created review card is painted at its measured anchor Y
  // in the very same commit — never first at the fallback top (0). Deferring
  // this to a rAF let the browser paint (and focus-scroll to) the temporary
  // top:0 position, which jumped the shared scroll container to the document
  // top in live acceptance. Resize-driven recomputes stay on the rAF path.
  useLayoutEffect(() => {
    recompute();
  }, [recompute, itemsKey]);

  // The rail items and the rendered document arrive in any order in live use
  // (the rail API often resolves before the version text). Refs populate after
  // commit without changing the hook's dependencies, so this commit-time check
  // tracks node identity and forces a re-measure the moment the positioning
  // container or the document element actually mounts — otherwise every card
  // keeps the empty-layout fallback and stacks at the top of the margin.
  useLayoutEffect(() => {
    const container = containerRef.current ?? null;
    const document = documentRef.current ?? null;
    if (container !== observedNodes.container || document !== observedNodes.document) {
      setObservedNodes({ container, document });
      scheduleRecompute();
    }
  });

  useEffect(() => {
    if (!enabled) return;
    const handle = () => scheduleRecompute();
    window.addEventListener("resize", handle);

    const observers: ResizeObserver[] = [];
    if (typeof ResizeObserver !== "undefined") {
      for (const element of [observedNodes.container, observedNodes.document]) {
        if (!element) continue;
        const observer = new ResizeObserver(handle);
        observer.observe(element);
        observers.push(observer);
      }
      for (const element of cardElementsRef.current.values()) {
        const observer = new ResizeObserver(handle);
        observer.observe(element);
        observers.push(observer);
      }
    }

    return () => {
      window.removeEventListener("resize", handle);
      observers.forEach((observer) => observer.disconnect());
    };
  }, [observedNodes.container, observedNodes.document, enabled, itemsKey, scheduleRecompute]);

  return { ...state, registerCard };
}
