import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import type { CaseWorkspace } from "../src/lib/api";
import { CASE_INSIGHT_TILE_REGISTRY, deriveCaseInsightTiles } from "../src/components/cases/CaseInsightTiles";

const source = readFileSync(path.resolve(process.cwd(), "src/components/cases/CaseInsightTiles.tsx"), "utf8");

const workspace = (overrides: Record<string, unknown> = {}): CaseWorkspace => ({
  case: {
    id: "case-1", caseNumber: "UGY-1", title: "Szerződéses ügy", status: "IN_REVIEW", priority: "HIGH",
    matterType: "CONTRACT", clientRole: "CLIENT", matterId: null, deadline: "2026-09-25T12:00:00.000Z",
    client: { id: "client-1", name: "Ügyfél", colorKey: null }, assignedLawyer: { id: "lawyer-1", name: "Felelős" },
    description: "Legacy leírás", nextStep: "Ellenőrzés", startingContext: {
      originReason: "Strukturált ok", currentSituation: "Jelenlegi helyzet", clientExpectation: "Ügyfélelvárás",
      urgentAction: null, nextStep: "Ellenőrzés", legacyOnly: false, empty: false,
    }, createdAt: null, updatedAt: null,
  },
  metrics: { openTaskCount: 1, documentCount: 1, openDeadlineCount: 1, communicationCount: 0, reviewCount: 1, loggedMinutes: null },
  tasks: [{ id: "task-1", title: "Dokumentum ellenőrzése", status: "IN_REVIEW", priority: "HIGH", attentionCategory: null, estimatedMinutes: null, dueDate: "2026-09-25T12:00:00.000Z", assignee: null, documentId: "doc-1", requestedByOrganizationPerson: null, workflowStepKey: null, blockedPredecessors: null }],
  documents: [{ id: "doc-1", fileName: "Szerződés.docx", mimeType: null, type: "ORIGINAL", category: null, version: "v2", uploadedAt: null, uploadedBy: null, summary: null, commentCount: 0, workStatus: "INTERNAL_REVIEW", workInstruction: null, responsible: null, reviewer: { id: "reviewer-1", name: "Reviewer" }, dueDate: "2026-09-25T12:00:00.000Z", nextStep: "Jóváhagyás" }],
  deadlines: [], time: { available: false, reason: "CASE_TIME_NOT_ATTRIBUTABLE" }, communications: [], activity: [{ id: "activity-1", actor: "Felelős", actionLabel: "dokumentumot frissített", objectLabel: "Szerződés.docx", occurredAt: "2026-09-20T10:00:00.000Z", objectType: "DOCUMENT", objectId: "doc-1" }], comments: [],
  cockpit: {
    urgency: "ATTENTION", nextStep: { label: "Dokumentum ellenőrzése", source: "TASK", dueAt: "2026-09-25T12:00:00.000Z", objectId: "task-1" }, responsible: { id: "lawyer-1", name: "Felelős" },
    kpi: { openTasks: { count: 1, urgentCount: 0, secondary: "" }, deadlines: { count: 1, nextDueAt: "2026-09-25T12:00:00.000Z", secondary: "" }, communication: { count: 0, replyNeededCount: 0, secondary: "" }, review: { count: 1, secondary: "" }, activeDocuments: { count: 1, secondary: "" } },
    taskGroups: { immediate: [], today: ["task-1"], later: [] }, deadlineGroups: { today: [], tomorrow: [], thisWeek: [], later: [] }, replyNeeded: [], activeDocuments: [{ id: "doc-1", fileName: "Szerződés.docx", reason: "REVIEW_PENDING" }],
  },
  warnings: [],
  ...overrides,
} as CaseWorkspace);

test("Case insight tiles are composed from a bounded registry", () => {
  assert.deepEqual(CASE_INSIGHT_TILE_REGISTRY.map((definition) => definition.key), [
    "current-state", "case-context", "document-review", "recent-activity", "review-handoff",
  ]);
  assert.match(source, /CASE_INSIGHT_TILE_REGISTRY/);
  assert.match(source, /definition\.derive\(workspace, caseId\)/);
});

test("Insight tiles use structured context and link the active document canonically", () => {
  const tiles = deriveCaseInsightTiles(workspace(), "case-1");
  assert.equal(tiles.find((tile) => tile.key === "case-context")?.body, "Strukturált ok");
  assert.equal(tiles.find((tile) => tile.key === "document-review")?.action?.href, "/cases/case-1/documents?documentId=doc-1");
  assert.equal(tiles.find((tile) => tile.key === "document-review")?.status, "Belső felülvizsgálat");
});

test("Insight tiles fall back to description and omit unsupported empty tiles", () => {
  const fallback = workspace();
  fallback.case.startingContext = { originReason: null, currentSituation: null, clientExpectation: null, urgentAction: null, nextStep: null, legacyOnly: true, empty: false };
  const fallbackTiles = deriveCaseInsightTiles(fallback, "case-1");
  assert.equal(fallbackTiles.find((tile) => tile.key === "case-context")?.body, "Legacy leírás");

  const empty = workspace();
  empty.case.description = null;
  empty.case.startingContext = { originReason: null, currentSituation: null, clientExpectation: null, urgentAction: null, nextStep: null, legacyOnly: false, empty: true };
  empty.documents = [];
  empty.tasks = [];
  empty.activity = [];
  empty.cockpit.activeDocuments = [];
  const emptyTiles = deriveCaseInsightTiles(empty, "case-1");
  assert.deepEqual(emptyTiles.map((tile) => tile.key), ["current-state"]);
});

test("Insight presentation maps document enums instead of rendering raw backend values", () => {
  assert.match(source, /humanEnumLabel\(activeReason === "REVIEW_PENDING"/);
  assert.doesNotMatch(source, /\{document\.workStatus\}/);
  assert.doesNotMatch(source, /\{document\.type\}/);
});
