import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  CaseWorkPackageOperational,
  CaseWorkPackageOperationalItem,
  MutateCaseWorkPackageItemBody,
  CreateCaseWorkPackageTaskBody,
  CreateCaseWorkPackageTaskResponse,
} from "@/lib/api";

/**
 * Production contract tests for Work Package Operational API types and DTOs.
 */

describe("Work Package Operational API Contracts", () => {
  it("CaseWorkPackageOperational carries truthful progress and items", () => {
    const pkg: CaseWorkPackageOperational = {
      id: "pkg-1",
      revision: 3,
      source: { name: "Ingatlan adásvétel sablon", version: 1 },
      createdAt: "2026-08-30T10:00:00.000Z",
      progress: {
        total: 3,
        totalActive: 2,
        completed: 1,
        remaining: 1,
        required: 1,
        requiredCompleted: 1,
      },
      items: [
        {
          id: "item-1",
          moduleKey: "doc-review",
          title: "Szerződés felülvizsgálat",
          description: "A tervezet jogi ellenőrzése",
          required: true,
          status: "COMPLETED",
          responsible: { id: "user-1", name: "Dr. Kovács Ügyvéd", role: "LAWYER" },
          note: "Elfogadva és ellenőrizve",
          order: 1,
          tasks: [
            {
              id: "task-1",
              title: "Tervezet átnézése",
              status: "DONE",
              assignedToId: "user-1",
              dueDate: "2026-09-01T12:00:00.000Z",
            },
          ],
          provenanceState: "TEMPLATE_SNAPSHOT",
        },
        {
          id: "item-2",
          moduleKey: "client-research",
          title: "Háttérkutatás",
          description: "Cégkivonat és tulajdoni lap",
          required: false,
          status: "ACTIVE",
          responsible: null,
          note: null,
          order: 2,
          tasks: [],
          provenanceState: "TEMPLATE_SNAPSHOT",
        },
        {
          id: "item-3",
          moduleKey: "tax-consult",
          title: "Adótanácsadás",
          description: "Opcionális adóegyeztetés",
          required: false,
          status: "DISABLED",
          responsible: null,
          note: null,
          order: 3,
          tasks: [],
          provenanceState: "TEMPLATE_SNAPSHOT",
        },
      ],
    };

    assert.equal(pkg.id, "pkg-1");
    assert.equal(pkg.revision, 3);
    assert.equal(pkg.source?.name, "Ingatlan adásvétel sablon");
    assert.equal(pkg.source?.version, 1);
    assert.equal(pkg.progress.total, 3);
    assert.equal(pkg.progress.totalActive, 2);
    assert.equal(pkg.progress.completed, 1);
    assert.equal(pkg.progress.remaining, 1);
    assert.equal(pkg.items.length, 3);
    assert.equal(pkg.items[0].required, true);
    assert.equal(pkg.items[1].required, false);
    assert.equal(pkg.items[2].status, "DISABLED");
  });

  it("MutateCaseWorkPackageItemBody requires expectedRevision and optional fields", () => {
    const mutation: MutateCaseWorkPackageItemBody = {
      expectedRevision: 2,
      status: "COMPLETED",
      responsibleUserId: "user-2",
      note: "Elvégezve",
    };
    assert.equal(mutation.expectedRevision, 2);
    assert.equal(mutation.status, "COMPLETED");
    assert.equal(mutation.responsibleUserId, "user-2");
    assert.equal(mutation.note, "Elvégezve");
  });

  it("CreateCaseWorkPackageTaskResponse carries real created task and provenance", () => {
    const response: CreateCaseWorkPackageTaskResponse = {
      created: true,
      task: {
        id: "task-real-123",
        title: "Dokumentum ellenőrzése",
        caseId: "case-1",
        matterId: "matter-1",
        status: "TODO",
        assignedToId: "user-1",
        workPackageItemId: "item-1",
        dueDate: "2026-09-15T00:00:00.000Z",
      },
      source: {
        itemId: "item-1",
        moduleKey: "doc-review",
      },
    };
    assert.equal(response.created, true);
    assert.equal(response.task.id, "task-real-123");
    assert.equal(response.task.workPackageItemId, "item-1");
    assert.equal(response.source.itemId, "item-1");
  });
});
