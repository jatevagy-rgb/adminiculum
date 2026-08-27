import {
  buildCommunicationListRow,
  buildCommunicationDetailView,
  canOpenCase,
  communicationState,
  filterCommunications,
  HIDDEN_PROVIDER_KEYS,
  COMMUNICATION_STATE_LABEL,
  type CommunicationListFilter,
} from "./communicationWorkspace";
import type { CommunicationItem, CommunicationDetail } from "./api";

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

describe("communicationWorkspace", () => {
  it("never leaks provider/storage/technical ids into a safe list row", () => {
    const row = buildCommunicationListRow(baseItem());
    for (const key of HIDDEN_PROVIDER_KEYS) {
      expect((row as unknown as Record<string, unknown>)[key]).toBeUndefined();
    }
    expect(row).not.toHaveProperty("syncStatus");
    expect(row).not.toHaveProperty("providerConversationId");
  });

  it("renders human concepts only (sender/subject/client/case/state)", () => {
    const row = buildCommunicationListRow(
      baseItem({ caseId: "case-1", clientId: "cl-1" }),
      { clientName: "Demo Kft.", caseNumber: "2026-005" },
    );
    expect(row.sender).toBe("Péterfi János");
    expect(row.clientName).toBe("Demo Kft.");
    expect(row.caseNumber).toBe("2026-005");
    expect(row.state).toBe("LINKED");
    expect(COMMUNICATION_STATE_LABEL[row.state]).toBe("Ügyhöz kapcsolva");
  });

  it("classifies states honestly (no fake unread/thread state)", () => {
    expect(communicationState(baseItem({ triage: "NEEDS_ASSIGNMENT" }))).toBe("REQUIRES_ATTENTION");
    expect(communicationState(baseItem({ caseId: "case-1" }))).toBe("LINKED");
    expect(communicationState(baseItem({ caseId: null, clientId: null }))).toBe("NO_CLIENT");
    expect(communicationState(baseItem({ caseId: null, clientId: "cl-1", triage: "LINKED" }))).toBe("NO_CASE");
    expect(communicationState(baseItem({ triage: "IGNORED" }))).toBe("PROCESSED");
    // No simulated unread exists at all (no unread field).
    expect(rowHasNoUnread(baseItem())).toBe(true);
  });

  it("applies real field-based filters only", () => {
    const rows = [
      buildCommunicationListRow(baseItem({ id: "a", triage: "NEEDS_ASSIGNMENT", caseId: null, clientId: null })),
      buildCommunicationListRow(baseItem({ id: "b", caseId: "case-1" })),
      buildCommunicationListRow(baseItem({ id: "c", caseId: null, clientId: "cl-1", triage: "LINKED" })),
      buildCommunicationListRow(baseItem({ id: "d", triage: "IGNORED" })),
    ];
    expect(filterCommunications(rows, "requires-attention").map((r) => r.id)).toEqual(["a"]);
    expect(filterCommunications(rows, "without-case").map((r) => r.id).sort()).toEqual(["a", "c", "d"]);
    expect(filterCommunications(rows, "with-case").map((r) => r.id)).toEqual(["b"]);
    expect(filterCommunications(rows, "processed").map((r) => r.id)).toEqual(["d"]);
  });

  it("builds a detail view stripping provider ids and exposing real relations only", () => {
    const detail: CommunicationDetail = {
      ...baseItem({ caseId: "case-1", clientId: "cl-1" }),
      content: "Teljes tartalom",
      attachments: [
        {
          id: "att-1",
          fileName: "minta.docx",
          fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          description: "Munkaszerződés",
          url: "https://sharepoint.example/internal/provider/url",
          spItemId: "SP-LEAK-123",
          communicationId: "c1",
          documentId: null,
          uploadedById: "u1",
          createdAt: "2026-01-01T09:00:00Z",
        },
      ],
      relatedTasks: [{ id: "t1", title: "Első felülvizsgálat", taskType: "REVIEW_CONTRACT", type: "OTHER", status: "IN_PROGRESS", priority: "HIGH", dueDate: null, assignedToId: null, createdAt: "2026-01-01T09:00:00Z" }],
      timelineEvents: [],
    };
    const view = buildCommunicationDetailView(detail, {
      client: { id: "cl-1", name: "Demo Kft.", email: "demo@x.test" },
      caseRecord: { id: "case-1", caseNumber: "2026-005", title: "Bemutató ügy" } as never,
    });
    expect(view.canOpenCase).toBe(true);
    expect(view.clientName).toBe("Demo Kft.");
    expect(view.caseNumber).toBe("2026-005");
    expect(view.relatedTaskTitle).toBe("Első felülvizsgálat");
    expect(view.attachments).toHaveLength(1);
    expect(view.attachments[0]).toEqual({ fileName: "minta.docx", fileType: expect.any(String), description: "Munkaszerződés" });
    expect((view.attachments[0] as Record<string, unknown>).spItemId).toBeUndefined();
    expect((view.attachments[0] as Record<string, unknown>).url).toBeUndefined();
  });

  it("does NOT provide a fake open-case when no real relation exists", () => {
    const noCase = baseItem({ caseId: null, clientId: "cl-1" });
    expect(canOpenCase(buildCommunicationListRow(noCase))).toBe(false);
    const withCase = baseItem({ caseId: "case-1" });
    expect(canOpenCase(buildCommunicationListRow(withCase))).toBe(true);
  });
});

function rowHasNoUnread(item: CommunicationItem): boolean {
  return !("unread" in item) && !("isUnread" in item);
}
