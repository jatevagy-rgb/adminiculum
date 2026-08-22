/**
 * Organizational map — pure graph/layout helpers.
 *
 * These are framework-agnostic functions that turn the OrgMap DTO into a set of
 * person nodes and manager/deputy edges, and compute a deterministic layout.
 * Keeping them pure lets the structure + filtering logic be unit tested without
 * mounting React Flow or a browser.
 *
 * LAYOUT POLICY:
 *   - ELK handles the real hierarchical auto-layout in the component (bounded,
 *     deterministic, no free-form permanent node positioning).
 *   - These helpers compute the (person) graph structure and a coarse ancestor
 *     retention set used by filtering so a matched deep person keeps enough
 *     ancestors to understand their position.
 */

import type { OrgMapDTO, OrgMapPersonDTO } from './orgMapApi';

export interface OrgGraphNode {
  id: string;
  person: OrgMapPersonDTO;
}

export interface OrgGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: 'manager' | 'deputy';
}

export interface OrgGraph {
  nodes: OrgGraphNode[];
  edges: OrgGraphEdge[];
  /** Person ids with no manager (roots). */
  roots: string[];
}

/**
 * Build the person graph from an org map. Manager edges are solid reporting
 * lines; deputy edges are dotted. A person with a manager that does not exist in
 * the set (dangling) is treated as a root so it is never lost. Edges are sorted
 * deterministically.
 */
export function buildOrgGraph(map: OrgMapDTO): OrgGraph {
  const personById = new Map(map.persons.map((p) => [p.id, p]));
  const nodes: OrgGraphNode[] = map.persons.map((p) => ({ id: p.id, person: p }));
  const edges: OrgGraphEdge[] = [];
  const hasManager = new Set<string>();

  for (const p of map.persons) {
    if (p.managerPersonId && personById.has(p.managerPersonId)) {
      edges.push({ id: `m:${p.managerPersonId}:${p.id}`, source: p.managerPersonId, target: p.id, kind: 'manager' });
      hasManager.add(p.id);
    }
    if (p.deputyPersonId && personById.has(p.deputyPersonId)) {
      // Deputy is drawn from the deputy BACK to the person they deputize for.
      edges.push({ id: `d:${p.id}:${p.deputyPersonId}`, source: p.id, target: p.deputyPersonId, kind: 'deputy' });
    }
  }

  const roots = map.persons.filter((p) => !hasManager.has(p.id)).map((p) => p.id);

  edges.sort((a, b) => a.id.localeCompare(b.id));
  return { nodes, edges, roots };
}

/** Depth (0 = root) of each person computed by walking manager chains. */
export function computeDepths(map: OrgMapDTO, graph: OrgGraph): Map<string, number> {
  const depth = new Map<string, number>();
  const personById = new Map(map.persons.map((p) => [p.id, p]));
  const visit = (id: string, seen: Set<string>): number => {
    if (seen.has(id)) return 0; // cycle guard — treat as root depth
    const existing = depth.get(id);
    if (existing !== undefined) return existing;
    const person = personById.get(id);
    const manager = person?.managerPersonId && personById.has(person.managerPersonId) ? person.managerPersonId : null;
    const d = manager ? visit(manager, new Set(seen).add(id)) + 1 : 0;
    depth.set(id, d);
    return d;
  };
  for (const p of map.persons) visit(p.id, new Set());
  return depth;
}

export interface OrgFilter {
  query: string;
  groupId: string | null;
  portalStatus: 'ACTIVE' | 'SUSPENDED' | 'NONE' | null;
  responsibilityType: string | null;
}

export function matchesFilter(person: OrgMapPersonDTO, filter: OrgFilter): boolean {
  const q = filter.query.trim().toLowerCase();
  if (q) {
    const haystack = `${person.name} ${person.jobTitle ?? ''} ${person.organizationGroupName ?? ''}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  if (filter.groupId && person.organizationGroupId !== filter.groupId) return false;
  if (filter.portalStatus && person.portalStatus !== filter.portalStatus) return false;
  if (filter.responsibilityType && !person.responsibilities.some((r) => r.type === filter.responsibilityType)) return false;
  return true;
}

/**
 * Build a focused-but-contextual filtered set. A matching person deep in the
 * tree keeps enough ancestors (their manager chain) so their position stays
 * readable. Persons matching the filter and their manager-chain ancestors are
 * "kept"; everyone else is dropped.
 */
export function computeFilteredPersonIds(map: OrgMapDTO, filter: OrgFilter): Set<string> {
  if (!filter.query.trim() && !filter.groupId && !filter.portalStatus && !filter.responsibilityType) {
    return new Set(map.persons.map((p) => p.id));
  }

  const personById = new Map(map.persons.map((p) => [p.id, p]));
  const kept = new Set<string>();

  for (const p of map.persons) {
    if (!matchesFilter(p, filter)) continue;
    // keep the person and their manager chain (ancestors) for context
    let cur: string | null = p.id;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      kept.add(cur);
      const person = personById.get(cur);
      cur = person?.managerPersonId && personById.has(person.managerPersonId) ? person.managerPersonId : null;
    }
  }
  return kept;
}