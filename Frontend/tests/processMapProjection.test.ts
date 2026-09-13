import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  projectProcessMap,
  sortStepsDeterministically,
  stepTypeLabel,
  type ProcessStepLike,
} from "../src/lib/processMapProjection";

const steps: ProcessStepLike[] = [
  { id: "s2", position: 2, name: "Jóváhagyás", stepType: "APPROVAL", isApproval: true, responsiblePersonId: "p1", responsiblePersonName: "Kiss E.", systemId: "sys1", systemName: "Jira", estimatedActiveMinutes: 10, estimatedWaitingMinutes: 120 },
  { id: "s1", position: 1, name: "Bekérés", stepType: "MANUAL", responsiblePersonId: null, estimatedActiveMinutes: 15, estimatedWaitingMinutes: 0 },
  { id: "s4", position: 4, name: "Rögzítés", stepType: "DATA_ENTRY", responsiblePersonId: "p2", responsiblePersonName: "Nagy P.", systemId: "sys2", systemName: "DMS", estimatedActiveMinutes: 20, estimatedWaitingMinutes: 30 },
  { id: "s3", position: 3, name: "Átadás", stepType: "HANDOFF", responsiblePersonId: "p1", responsiblePersonName: "Kiss E.", systemId: "sys1", systemName: "Jira", estimatedActiveMinutes: 5, estimatedWaitingMinutes: 0 },
];

describe("processMapProjection", () => {
  it("sorts steps by canonical order: position asc, id asc, never mutates input", () => {
    const ties: ProcessStepLike[] = [
      { id: "b", position: 1, name: "B", stepType: "MANUAL" },
      { id: "a", position: 1, name: "A", stepType: "MANUAL" },
      { id: "c", position: 0, name: "C", stepType: "MANUAL" },
    ];
    const sorted = sortStepsDeterministically(ties);
    assert.deepEqual(sorted.map((s) => s.id), ["c", "a", "b"]);
    assert.deepEqual(ties.map((s) => s.id), ["b", "a", "c"]);
  });

  it("projects a linear flow in deterministic order", () => {
    const map = projectProcessMap(steps);
    assert.deepEqual(map.steps.map((s) => s.id), ["s1", "s2", "s3", "s4"]);
    assert.deepEqual(map.steps.map((s) => s.orderIndex), [0, 1, 2, 3]);
  });

  it("flags unassigned, approval, waiting and system switches", () => {
    const map = projectProcessMap(steps);
    assert.equal(map.approvalCount, 1);
    assert.equal(map.unassignedCount, 1);
    assert.equal(map.systemSwitchCount, 1);
    const s1 = map.steps[0];
    const s2 = map.steps[1];
    const s4 = map.steps[3];
    assert.ok(s1.flags.includes("UNASSIGNED"));
    assert.ok(s2.flags.includes("APPROVAL"));
    assert.ok(s2.flags.includes("WAITING"));
    assert.ok(s4.flags.includes("SYSTEM_SWITCH"));
  });

  it("does not flag a switch on the first step or same-system continuation", () => {
    const map = projectProcessMap(steps);
    assert.ok(!map.steps[0].flags.includes("SYSTEM_SWITCH")); // s1 has no system
    assert.ok(!map.steps[2].flags.includes("SYSTEM_SWITCH")); // s3 same system as s2
  });

  it("totals estimated minutes without inventing values", () => {
    const map = projectProcessMap(steps);
    assert.equal(map.totalEstimatedActiveMinutes, 50);
    assert.equal(map.totalEstimatedWaitingMinutes, 150);
    const empty = projectProcessMap([]);
    assert.equal(empty.stepCount, 0);
    assert.equal(empty.totalEstimatedActiveMinutes, 0);
  });

  it("labels known step types in Hungarian", () => {
    assert.equal(stepTypeLabel("APPROVAL"), "Jóváhagyás");
    assert.equal(stepTypeLabel("MANUAL"), "Kézi lépés");
    assert.equal(stepTypeLabel("CUSTOM_X"), "CUSTOM_X");
  });
});
