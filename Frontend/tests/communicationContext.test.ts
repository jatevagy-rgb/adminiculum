import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildCommunicationContextDetail,
  buildCommunicationContextRow,
  canOpenCase,
  communicationContextState,
  COMMUNICATION_CONTEXT_STATE_LABEL,
} from "../src/lib/communicationContext";
import type { CommunicationItem, CommunicationDetail, TaskListItem, CommunicationAttachment, Client, CaseListItem } from "../src/lib/api";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

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
    clientId: "cl-1",
    clientColorKey: null,
    documentId: null,
    createdById: "u1",
    createdAt: "2026-01-02T09:00:00Z",
    updatedAt: "2026-01-02T09:00:00Z",
    attachmentCount: 2,
    sourceTaskCount: 1,
    providerConversationId: "PROVIDER-THREAD-999",
    direction: "INBOUND",
    receivedAt: "2026-01-02T09:00:00Z",
    source: "OUTLOOK",
    syncStatus: "IMPORTED",
    triage: "LINKED",
    ...overrides,
  };
}

function taskFixture(): TaskListItem {
  return {
    id: "t1",
    title: "A szerződés ellenőrzése",
    description: "Áttekintés és javítás",
    taskType: "REVIEW_CONTRACT",
    type: "OTHER",
    status: "IN_PROGRESS",
    priority: "HIGH",
    dueDate: null,
    assignedToId: null,
    createdAt: "2026-01-02T09:00:00Z",
  };
}

function attachmentFixture(): CommunicationAttachment {
  return {
    id: "att-9",
    fileName: "alairas.docx",
    fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    description: "Aláírandó példány",
    url: "https://sharepoint.example/internal/drive/items/SP-999",
    spItemId: "SP-999",
    communicationId: "c1",
    documentId: null,
    uploadedById: "u1",
    createdAt: "2026-01-02T09:00:00Z",
  };
}

function clientFixture(): Client {
  return { id: "cl-1", name: "Példa Kft." };
}

function caseRecordFixture(): CaseListItem {
  return {
    id: "case-1",
    caseNumber: "2026-042",
    title: "Átvilágítás",
    clientName: "Példa Kft.",
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
    content: "Teljes törzslevél",
    attachments: [attachmentFixture()],
    relatedTasks: [taskFixture()],
    timelineEvents: [],
    ...overrides,
  };
}

describe("communicationContext rows use real relations only", () => {
  it("drives canOpenCase from a real caseId (no fallback case)", () => {
    const noCase = baseItem({ caseId: null });
    const withCase = baseItem({ caseId: "case-1" });
    assert.equal(canOpenCase(noCase), false);
    assert.equal(canOpenCase(withCase), true);
    assert.equal(buildCommunicationContextRow(noCase).canOpenCase, false);
    assert.equal(buildCommunicationContextRow(withCase).canOpenCase, true);
  });

  it("keeps a communication with no case as an attention/triage item, not a case", () => {
    const row = buildCommunicationContextRow(baseItem({ caseId: null, triage: "NEEDS_ASSIGNMENT" }));
    assert.equal(row.state, "REQUIRES_ATTENTION");
    assert.equal(row.caseId, null);
    assert.equal(row.canOpenCase, false);
    assert.equal(COMMUNICATION_CONTEXT_STATE_LABEL[row.state], "Feldolgozásra vár");
  });

  it("labels honest states (linked / no-case / processed), never unread", () => {
    assert.equal(communicationContextState(baseItem({ caseId: "case-1" })), "LINKED");
    assert.equal(communicationContextState(baseItem({ caseId: null, clientId: "cl-1", triage: "LINKED" })), "NO_CASE");
    assert.equal(communicationContextState(baseItem({ triage: "IGNORED" })), "PROCESSED");
    const item = baseItem();
    assert.equal(Object.prototype.hasOwnProperty.call(item, "unread"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(item, "isUnread"), false);
  });

  it("never leaks provider/storage/technical ids into a row", () => {
    const row = buildCommunicationContextRow(baseItem());
    assert.equal(Object.prototype.hasOwnProperty.call(row, "providerConversationId"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(row, "syncStatus"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(row, "source"), false);
  });
});

describe("communicationContext detail", () => {
  it("strips attachment provider url and storage id, keeps metadata only", () => {
    const view = buildCommunicationContextDetail(detailFixture(), { client: clientFixture(), caseRecord: caseRecordFixture() });
    assert.equal(view.attachments.length, 1);
    const attachment = view.attachments[0];
    assert.equal(attachment.fileName, "alairas.docx");
    assert.equal(attachment.description, "Aláírandó példány");
    assert.equal(Object.prototype.hasOwnProperty.call(attachment, "url"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(attachment, "spItemId"), false);
  });

  it("resolves client/case/task from real relations only", () => {
    const view = buildCommunicationContextDetail(detailFixture(), { client: clientFixture(), caseRecord: caseRecordFixture() });
    assert.equal(view.clientName, "Példa Kft.");
    assert.equal(view.caseNumber, "2026-042");
    assert.equal(view.relatedTaskTitle, "A szerződés ellenőrzése");
    assert.equal(view.canOpenCase, true);
  });

  it("does not show a case relation when none exists", () => {
    const view = buildCommunicationContextDetail(detailFixture({ caseId: null, clientId: "cl-1" }), { client: clientFixture() });
    assert.equal(view.canOpenCase, false);
    assert.equal(view.caseNumber, null);
  });
});

describe("client context guardrails (source contract)", () => {
  it("does NOT add a primary communication tab to the Client Workspace IA", () => {
    const tabs = read("src/components/clients/ClientWorkspaceTabs.tsx");
    assert.doesNotMatch(tabs, /\["communications"/);
    assert.match(tabs, /\["overview", "Áttekintés"/);
    assert.match(tabs, /\["cases", "Ügyek"/);
    assert.doesNotMatch(tabs, /\[\s*"communications"/);
  });

  it("keeps the primary navigation registry intact (no new nav item)", () => {
    const nav = read("src/lib/navigation.ts");
    assert.match(nav, /dashboard/);
    assert.match(nav, /clients/);
    assert.match(nav, /notifications/);
    assert.match(nav, /communications/);
    const sidebar = read("src/components/Sidebar.tsx");
    assert.doesNotMatch(sidebar, /case-first/i);
  });

  it("routes client communications against a real clientId, never a hard-coded one", () => {
    const page = read("src/app/clients/[clientId]/communications/page.tsx");
    assert.match(page, /getCommunications\(\{\s*clientId,/);
    assert.doesNotMatch(page, /Demo Kft\./i);
    assert.doesNotMatch(page, /fallbackClient|mockClient/i);
  });

  it("enforces case-first linkage: case comms route to real case context", () => {
    const page = read("src/app/clients/[clientId]/communications/page.tsx");
    assert.match(page, /\/cases\/\$\{encodeURIComponent\(selected\.caseId!\)\}\/communications/);
    assert.doesNotMatch(page, /\/cases\/fixed-case|\/cases\/demo/i);
  });
});
