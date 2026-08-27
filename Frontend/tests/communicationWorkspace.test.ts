import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildCommunicationListRow,
  buildCommunicationDetailView,
  canOpenCase,
  communicationState,
  filterCommunications,
  HIDDEN_PROVIDER_KEYS,
  COMMUNICATION_STATE_LABEL,
  type CommunicationListFilter,
} from "../src/lib/communicationWorkspace";
import type { CommunicationItem, CommunicationDetail, CommunicationAttachment, TaskListItem, Client, CaseListItem } from "../src/lib/api";

function baseItem(overrides: Partial<CommunicationItem> = {}): CommunicationItem {
  return {
    id: "c1",
    type: "EMAIL",
    subject: "Tárgy",
    senderName: "Péterfi János",
    senderEmail: null,
    recipientName: null,
    recipientEmail: null,
    summary: null,
    contentPreview: "Előnézet",
    caseId: null,
    clientId: null,
    clientColorKey: null,
    documentId: null,
    createdById: "u1",
    createdAt: "2026-01-01T09:00:00Z",
    updatedAt: "2026-01-01T09:00:00Z",
    attachmentCount: 0,
    sourceTaskCount: 0,
    providerConversationId: "PROVIDER-THREAD-123",
    direction: "INBOUND",
    receivedAt: "2026-01-01T09:00:00Z",
    source: "OUTLOOK",
    syncStatus: "IMPORTED",
    triage: "NEEDS_ASSIGNMENT",
    ...overrides,
  };
}

function taskFixture(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: "t1",
    title: "Első felülvizsgálat",
    description: "Kötetlen leírás a felülvizsgálathoz",
    taskType: "REVIEW_CONTRACT",
    type: "OTHER",
    status: "IN_PROGRESS",
    priority: "HIGH",
    dueDate: null,
    assignedToId: null,
    createdAt: "2026-01-01T09:00:00Z",
    ...overrides,
  };
}

function attachmentFixture(overrides: Partial<CommunicationAttachment> = {}): CommunicationAttachment {
  return {
    id: "att-1",
    fileName: "minta.docx",
    fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    description: "Munkaszerződés",
    url: "https://sharepoint.example/internal/provider/drive/items/SP-LEAK-123",
    spItemId: "SP-LEAK-123",
    communicationId: "c1",
    documentId: null,
    uploadedById: "u1",
    createdAt: "2026-01-01T09:00:00Z",
    ...overrides,
  };
}

function clientFixture(): Client {
  return { id: "cl-1", name: "Demo Kft.", email: "demo@x.test" };
}

function caseRecordFixture(): CaseListItem {
  return {
    id: "case-1",
    caseNumber: "2026-005",
    title: "Bemutató ügy",
    clientName: "Demo Kft.",
    matterType: "OTHER",
    status: "OPEN",
    priority: "MEDIUM",
    deadline: null,
    createdAt: "2026-01-01T09:00:00Z",
    updatedAt: "2026-01-01T09:00:00Z",
  };
}

function detailFixture(overrides: Partial<CommunicationDetail> = {}): CommunicationDetail {
  return {
    ...baseItem({ caseId: "case-1", clientId: "cl-1" }),
    content: "Teljes tartalom",
    attachments: [attachmentFixture()],
    relatedTasks: [taskFixture()],
    timelineEvents: [],
    ...overrides,
  };
}

describe("communicationWorkspace", () => {
  const root = process.cwd();

  it("never leaks provider/storage/technical ids into a safe list row", () => {
    const row = buildCommunicationListRow(baseItem());
    for (const key of HIDDEN_PROVIDER_KEYS) {
      const leaked = Object.prototype.hasOwnProperty.call(row, key);
      assert.equal(leaked, false, `list row must not contain '${key}'`);
    }
    assert.equal(Object.prototype.hasOwnProperty.call(row, "syncStatus"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(row, "providerConversationId"), false);
  });

  it("renders human concepts only (sender/subject/client/case/state)", () => {
    const row = buildCommunicationListRow(baseItem({ caseId: "case-1", clientId: "cl-1" }), { clientName: "Demo Kft.", caseNumber: "2026-005" });
    assert.equal(row.sender, "Péterfi János");
    assert.equal(row.clientName, "Demo Kft.");
    assert.equal(row.caseNumber, "2026-005");
    assert.equal(row.state, "LINKED");
    assert.equal(COMMUNICATION_STATE_LABEL[row.state], "Ügyhöz kapcsolva");
  });

  it("classifies states honestly (no fake unread/thread state)", () => {
    assert.equal(communicationState(baseItem({ triage: "NEEDS_ASSIGNMENT" })), "REQUIRES_ATTENTION");
    assert.equal(communicationState(baseItem({ caseId: "case-1" })), "LINKED");
    assert.equal(communicationState(baseItem({ caseId: null, clientId: null })), "NO_CLIENT");
    assert.equal(communicationState(baseItem({ caseId: null, clientId: "cl-1", triage: "LINKED" })), "NO_CASE");
    assert.equal(communicationState(baseItem({ triage: "IGNORED" })), "PROCESSED");
    assert.equal(Object.prototype.hasOwnProperty.call(baseItem(), "unread"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(baseItem(), "isUnread"), false);
  });

  it("applies real field-based filters only", () => {
    const rows = [
      buildCommunicationListRow(baseItem({ id: "a", triage: "NEEDS_ASSIGNMENT", caseId: null, clientId: null })),
      buildCommunicationListRow(baseItem({ id: "b", caseId: "case-1" })),
      buildCommunicationListRow(baseItem({ id: "c", caseId: null, clientId: "cl-1", triage: "LINKED" })),
      buildCommunicationListRow(baseItem({ id: "d", triage: "IGNORED" })),
    ];
    const pick = (filter: CommunicationListFilter) => filterCommunications(rows, filter).map((r) => r.id).sort();
    assert.deepEqual(pick("requires-attention"), ["a"]);
    assert.deepEqual(pick("without-case"), ["a", "c", "d"]);
    assert.deepEqual(pick("without-client"), ["a", "c", "d"]);
    assert.deepEqual(pick("with-case"), ["b"]);
    assert.deepEqual(pick("processed"), ["d"]);
  });

  it("builds a detail view stripping provider ids and exposing relations", () => {
    const view = buildCommunicationDetailView(detailFixture(), { client: clientFixture(), caseRecord: caseRecordFixture() });
    assert.equal(view.canOpenCase, true);
    assert.equal(view.clientName, "Demo Kft.");
    assert.equal(view.caseNumber, "2026-005");
    assert.equal(view.relatedTaskTitle, "Első felülvizsgálat");
    assert.equal(view.attachments.length, 1);
    assert.equal(view.attachments[0].fileName, "minta.docx");
    assert.equal(view.attachments[0].fileType, attachmentFixture().fileType);
    assert.equal(view.attachments[0].description, "Munkaszerződés");
    assert.equal(Object.prototype.hasOwnProperty.call(view.attachments[0], "spItemId"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(view.attachments[0], "url"), false);
  });

  it("does NOT provide a fake open-case when no real relation exists", () => {
    const noCase = baseItem({ caseId: null, clientId: "cl-1" });
    assert.equal(canOpenCase({ caseId: noCase.caseId }), false);
    const withCase = baseItem({ caseId: "case-1" });
    assert.equal(canOpenCase({ caseId: withCase.caseId }), true);
  });

  it("communicates only real canonical facts (no fake unread/thread/counter)", () => {
    assert.equal(Object.prototype.hasOwnProperty.call(baseItem(), "isThread"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(baseItem(), "threadUnread"), false);
  });

  it("the workforce inbox consumes the composition module (no dead-code regression)", () => {
    const page = readFileSync(path.join(root, "src/app/notifications/page.tsx"), "utf8");
    assert.ok(page.includes('from "@/lib/communicationWorkspace"'), "inbox must import the composition module");
    for (const symbol of ["buildCommunicationListRow", "filterCommunications", "buildCommunicationDetailView", "canOpenCase", "COMMUNICATION_STATE_LABEL"]) {
      assert.ok(page.includes(symbol), `inbox must consume '${symbol}'`);
    }
  });
});
