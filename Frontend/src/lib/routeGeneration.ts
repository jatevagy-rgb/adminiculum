import { useEffect, useLayoutEffect, useRef } from "react";

export type RouteGeneration = {
  /** The generation of the currently committed route identity. */
  readonly generation: number;
  /** True when the given generation still belongs to the committed route identity. */
  isActive: (generation: number) => boolean;
};

// React-safe layout effect: on the server `useLayoutEffect` never runs and React
// warns, so we degrade to `useEffect` (also a no-op) there. On the client the
// layout effect runs, which is what the guard needs.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Route-scoped async commit guard.
//
// A response may commit state only if it still belongs to the currently
// COMMITTED route identity. The generation advances exactly when a route key
// change is COMMITTED — never during a speculative render.
//
// Why commit-gated (and not render-phase): React may render a route speculatively
// and then DISCARD that render (an interrupted transition, or a Suspense retry
// that keeps the previous UI). A ref written during render is not rolled back, so
// a render-phase advance would bump the generation even though the new route was
// never committed — invalidating the still-committed route's in-flight request and
// leaving it stuck. Advancing in a layout effect ties the advance to commit, so an
// abandoned render cannot invalidate the active route.
//
// Usage:
//   const route = useRouteGeneration(resolvedParams.clientId);
//   const load = useCallback(async () => {
//     const generation = route.generation;
//     const data = await getData(id);
//     if (!route.isActive(generation)) return; // discard stale response
//     setData(data);
//   }, [id, route]);
export function useRouteGeneration(routeKey: string | null | undefined): RouteGeneration {
  const key = routeKey ?? "";
  const committedKeyRef = useRef(key);
  const generationRef = useRef(0);

  // Advance only on COMMIT of a new route key. Layout effects run before passive
  // effects, so consumers that read `route.generation` inside a useEffect observe
  // the advanced generation for the newly committed route.
  useIsomorphicLayoutEffect(() => {
    if (committedKeyRef.current !== key) {
      committedKeyRef.current = key;
      generationRef.current += 1;
    }
  }, [key]);

  const guard = useRef<RouteGeneration | null>(null);
  if (!guard.current) {
    guard.current = {
      get generation() {
        return generationRef.current;
      },
      isActive(generation: number) {
        return generationRef.current === generation;
      },
    };
  }
  return guard.current;
}
