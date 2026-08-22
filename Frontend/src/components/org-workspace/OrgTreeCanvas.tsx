"use client";

import { useEffect, useMemo, useState } from "react";
import { ReactFlow, Background, Controls, MarkerType, Position, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ELK from "elkjs/lib/elk.bundled";
import {
  buildOrgGraph,
  computeFilteredPersonIds,
  type OrgFilter,
} from "@/lib/orgMapGraph";
import type { OrgMapDTO } from "@/lib/orgMapApi";
import { OrgPersonCard } from "./OrgPersonCard";

type PersonNodeData = { personId: string };

const NODE_WIDTH = 200;
const NODE_HEIGHT = 108;

/**
 * Deterministic hierarchical auto-layout using ELK (layered). ELK is layout-only;
 * React Flow renders. This is a CLIENT-only component (never SSR'd with dynamic
 * layout) so there is no SSR breakage.
 */
export function OrgTreeCanvas({
  map,
  filter,
  selectedId,
  onSelectPerson,
  onNodeCount,
}: {
  map: OrgMapDTO;
  filter: OrgFilter;
  selectedId: string | null;
  onSelectPerson: (id: string) => void;
  onNodeCount: (count: number) => void;
}) {
  const graph = useMemo(() => buildOrgGraph(map), [map]);
  const filteredIds = useMemo(() => computeFilteredPersonIds(map, filter), [map, filter]);

  const visibleNodes = useMemo(
    () => graph.nodes.filter((n) => filteredIds.has(n.id)),
    [graph, filteredIds],
  );

  useEffect(() => {
    onNodeCount(visibleNodes.length);
  }, [visibleNodes.length, onNodeCount]);

  // ELK graph input (children = visible persons; edges = manager + deputy lines).
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [layoutKey, setLayoutKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const elk = new ELK();
    const children = visibleNodes.map((n) => ({
      id: n.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      labels: [{ text: n.id }],
    }));
    const edges = graph.edges
      .filter((e) => filteredIds.has(e.source) && filteredIds.has(e.target))
      .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] }));

    void elk
      .layout({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "DOWN",
          "elk.spacing.nodeNode": "48",
          "elk.layered.spacing.nodeNodeBetweenLayers": "56",
          "elk.layered.considerModelOrder.strategy": "PREFER_EDGES",
          "elk.edgeRouting": "ORTHOGONAL",
          "elk.padding": "[top=24,left=24,bottom=24,right=24]",
        },
        children,
        edges,
      })
      .then((root) => {
        if (cancelled) return;
        const next: Record<string, { x: number; y: number }> = {};
        for (const child of root.children ?? []) {
          next[child.id] = { x: child.x ?? 0, y: child.y ?? 0 };
        }
        setPositions(next);
      })
      .catch(() => {
        // Fall back to a deterministic stacked layout if ELK fails (e.g. no
        // people); never leave the canvas blank with nodes at origin.
        if (cancelled) return;
        const next: Record<string, { x: number; y: number }> = {};
        visibleNodes.forEach((n, i) => {
          next[n.id] = { x: 24, y: 24 + i * (NODE_HEIGHT + 16) };
        });
        setPositions(next);
      });
    return () => {
      cancelled = true;
    };
  }, [graph, visibleNodes, filteredIds, layoutKey]);

  const nodes: Node<PersonNodeData>[] = useMemo(
    () =>
      visibleNodes.map((n) => {
        const pos = positions[n.id] ?? { x: 0, y: 0 };
        return {
          id: n.id,
          type: "person",
          position: pos,
          data: { personId: n.id },
          draggable: false,
        } satisfies Node<PersonNodeData>;
      }),
    [visibleNodes, positions],
  );

  const edges: Edge[] = useMemo(
    () =>
      graph.edges
        .filter((e) => filteredIds.has(e.source) && filteredIds.has(e.target))
        .map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: "smoothstep",
          animated: false,
          style: {
            stroke: e.kind === "deputy" ? "var(--adm-green-700)" : "var(--adm-green-800)",
            strokeWidth: e.kind === "deputy" ? 1 : 2,
            strokeDasharray: e.kind === "deputy" ? "6 4" : undefined,
            opacity: 0.75,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: e.kind === "deputy" ? "var(--adm-green-700)" : "var(--adm-green-800)",
          },
          data: { kind: e.kind },
        })),
    [graph, filteredIds],
  );

  const nodeTypes = useMemo(
    () => ({
      person: ({ data }: { data: PersonNodeData }) => {
        const person = map.persons.find((p) => p.id === data.personId);
        if (!person) return null;
        return (
          <OrgPersonCard person={person} selected={selectedId === person.id} onSelect={onSelectPerson} />
        );
      },
    }),
    [map, selectedId, onSelectPerson],
  );

  return (
    <div className="h-full w-full" data-testid="org-tree-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.15}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        defaultEdgeOptions={{ selectable: false }}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => onSelectPerson(String(node.data.personId))}
      >
        <Background gap={16} size={1} />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>
    </div>
  );
}