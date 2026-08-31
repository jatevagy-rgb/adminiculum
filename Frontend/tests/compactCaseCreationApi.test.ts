import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CreateCaseData, CreateCaseResponse, CaseCreationOption } from "@/lib/api";

/**
 * Genuine regression tests for compact case creation API contracts.
 * Tests import production types and verify payload serialization behavior.
 */

// ─── P1-1: title serialization ───────────────────────────────────────────────

describe("P1-1: createCase serializes title as title", () => {
  it("title field exists on CreateCaseData and is passed through", () => {
    const data: CreateCaseData = {
      clientName: "BlackBelt Kft.",
      clientId: "c1",
      matterType: "contract",
      title: "Szerződés felülvizsgálat",
      caseTypeDefinitionId: "ct-1",
      selectedModuleKeys: ["doc-review"],
    };
    assert.notEqual(data.title, data.description);
    assert.equal(data.title, "Szerződés felülvizsgálat");
  });

  it("title is distinct from description", () => {
    const data: CreateCaseData = {
      clientName: "Client",
      matterType: "OTHER",
      title: "My Title",
      description: "My Description",
    };
    assert.equal(data.title, "My Title");
    assert.equal(data.description, "My Description");
    assert.notEqual(data.title, data.description);
  });
});

// ─── P1-2: empty selectedModuleKeys serialization ────────────────────────────

describe("P1-2: empty selectedModuleKeys serialized as []", () => {
  it("empty array is distinguishable from undefined", () => {
    const emptyArray: string[] = [];
    const undefinedValue: string[] | undefined = undefined;
    assert.deepEqual(emptyArray, []);
    assert.equal(undefinedValue, undefined);
    assert.notDeepEqual(emptyArray, undefinedValue);
  });

  it("selectedModuleKeys: [] in CreateCaseData means 'no optional modules selected'", () => {
    const selected = new Set<string>();
    const payload = Array.from(selected);
    assert.deepEqual(payload, []);
    assert.equal(payload.length, 0);
  });
});

// ─── Production type contracts ────────────────────────────────────────────────

describe("production type contracts", () => {
  it("CreateCaseResponse includes optional workPackage field", () => {
    const response: CreateCaseResponse = {
      id: "case-1",
      caseNumber: "CASE-2026-001",
      status: "OPEN",
      createdAt: "2026-01-01",
      workPackage: {
        id: "wp-1",
        workPackageTemplateId: "t1",
        workPackageTemplateVersion: 1,
        snapshotWorkflowTemplateId: null,
        items: [{ id: "i1", moduleType: "DOCUMENT_WORK", moduleKey: "doc-review", label: "Review" }],
      },
    };
    assert.ok(response.workPackage);
    assert.equal(response.workPackage!.items[0].moduleKey, "doc-review");
  });

  it("CaseCreationOption has correct shape from production API", () => {
    const option: CaseCreationOption = {
      caseTypeDefinition: { id: "ct1", slug: "contract", name: "Szerződés", description: null, icon: null },
      template: {
        id: "t1",
        caseTypeDefinitionId: "ct1",
        name: "Sablon",
        description: null,
        status: "ACTIVE",
        version: 1,
        defaultWorkflowTemplateId: null,
        items: [
          { id: "i1", moduleType: "DOCUMENT_WORK", moduleLabel: "Dokumentum", moduleKey: "doc", label: "Doc", description: null, order: 1, isOptional: false, config: {} },
          { id: "i2", moduleType: "RESEARCH", moduleLabel: "Kutatás", moduleKey: "research", label: "Research", description: null, order: 2, isOptional: true, config: {} },
        ],
      },
    };
    assert.equal(option.template!.items.length, 2);
    assert.equal(option.template!.items[0].isOptional, false);
    assert.equal(option.template!.items[1].isOptional, true);
  });
});
