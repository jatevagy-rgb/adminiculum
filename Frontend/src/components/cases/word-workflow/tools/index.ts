"use client";

/**
 * Word Workflow 04: Direct Prompts, Risk Table, and Wide Communication Tiles.
 *
 * Owned leaf tools export barrel for mounting by WF01 (Astra) or the integrator.
 * Every presentation component accepts the standard internal component interface:
 * { caseId: string, clientId: string | null, readOnly?: boolean, onChanged?: () => void }
 */

export * from "./clipboard";
export * from "./safeContextAdapter";
export * from "./riskMatrixParser";
export * from "./WordCurrentStateTile";
export * from "./WordRiskMatrixPanel";
export * from "./WordCompactPromptCollection";
export * from "./WordWideCommunicationLeaf";
