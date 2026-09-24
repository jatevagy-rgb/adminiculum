import { useRef } from "react";

export type RouteGeneration = {
  /** The generation of the currently active route identity. */
  readonly generation: number;
  /** True when the given generation still belongs to the active route identity. */
  isActive: (generation: number) => boolean;
};

// Route-scoped async commit guard.
//
// A response may commit state only if it still belongs to the currently active
// route identity. The generation advances during render whenever the route key
// changes, so a late response captured under a previous route is stale
// immediately and can never overwrite the active route.
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
  const state = useRef({ key, generation: 0 });
  if (state.current.key !== key) {
    state.current = { key, generation: state.current.generation + 1 };
  }

  const guard = useRef<RouteGeneration | null>(null);
  if (!guard.current) {
    guard.current = {
      get generation() {
        return state.current.generation;
      },
      isActive(generation: number) {
        return state.current.generation === generation;
      },
    };
  }
  return guard.current;
}
