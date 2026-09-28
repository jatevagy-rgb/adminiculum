"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { measureAnchorYPositions } from "@/lib/documents/readerAnchorMeasure";
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

    const desiredYById = measureAnchorYPositions(
      container,
      document,
      currentItems.map((item) => ({ id: item.id, startOffset: item.startOffset })),
    );
    const heightById: Record<string, number> = {};
    for (const item of currentItems) {
      heightById[item.id] = cardElementsRef.current.get(item.id)?.offsetHeight ?? 0;
    }

    const next = computeAnchoredLayout({ items: currentItems, desiredYById, heightById, gap, minY });
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

  useLayoutEffect(() => {
    scheduleRecompute();
  }, [scheduleRecompute, itemsKey]);

  useEffect(() => {
    if (!enabled) return;
    const handle = () => scheduleRecompute();
    window.addEventListener("resize", handle);

    const observers: ResizeObserver[] = [];
    if (typeof ResizeObserver !== "undefined") {
      for (const element of [containerRef.current, documentRef.current]) {
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
  }, [containerRef, documentRef, enabled, itemsKey, scheduleRecompute]);

  return { ...state, registerCard };
}
