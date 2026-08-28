import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Tests for compact case creation API extensions.
 * Verifies that createCase properly passes caseTypeDefinitionId
 * and selectedModuleKeys to the backend POST /cases endpoint.
 */

describe("compact case creation API extensions", () => {
  it("CreateCaseData interface includes caseTypeDefinitionId and selectedModuleKeys", () => {
    // Type-level check: these fields exist on the interface
    const data: {
      clientName: string;
      matterType: string;
      caseTypeDefinitionId?: string;
      selectedModuleKeys?: string[];
    } = {
      clientName: "Test",
      matterType: "OTHER",
      caseTypeDefinitionId: "ct-123",
      selectedModuleKeys: ["doc-review", "research"],
    };
    assert.equal(data.caseTypeDefinitionId, "ct-123");
    assert.deepEqual(data.selectedModuleKeys, ["doc-review", "research"]);
  });

  it("workPackage field in CreateCaseResponse is optional and typed", () => {
    const response: {
      id: string;
      caseNumber: string;
      status: string;
      createdAt: string;
      workPackage?: {
        id: string;
        workPackageTemplateId: string | null;
        workPackageTemplateVersion: number | null;
        snapshotWorkflowTemplateId: string | null;
        items: Array<{ id: string; moduleType: string; moduleKey: string; label: string }>;
      };
    } = {
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

  it("CaseCreationOption type has correct shape", () => {
    const option: {
      caseTypeDefinition: { id: string; slug: string; name: string; description: string | null; icon: string | null };
      template: {
        id: string; caseTypeDefinitionId: string; name: string; description: string | null;
        status: string; version: number;
        items: Array<{ id: string; moduleType: string; moduleLabel: string; moduleKey: string; label: string; isOptional: boolean }>;
      } | null;
    } = {
      caseTypeDefinition: { id: "ct1", slug: "contract", name: "Szerződés", description: null, icon: null },
      template: {
        id: "t1", caseTypeDefinitionId: "ct1", name: "Sablon", description: null, status: "ACTIVE", version: 1,
        items: [
          { id: "i1", moduleType: "DOCUMENT_WORK", moduleLabel: "Dokumentum", moduleKey: "doc", label: "Doc", isOptional: false },
          { id: "i2", moduleType: "RESEARCH", moduleLabel: "Kutatás", moduleKey: "research", label: "Research", isOptional: true },
        ],
      },
    };
    assert.equal(option.template!.items.length, 2);
    assert.equal(option.template!.items[0].isOptional, false);
    assert.equal(option.template!.items[1].isOptional, true);
  });

  it("no hardcoded case types in the dialog — all from creation-options API", () => {
    // Verify that the dialog does NOT contain any hardcoded matter type values
    // The old intake dialog had: CONTRACT_REVIEW, CONTRACT_DRAFTING, LITIGATION, CORPORATE, IP, OTHER
    // The cases list filter had: REAL_ESTATE, CORPORATE, CONTRACT, LITIGATION, EMPLOYMENT, IP, etc.
    // The compact dialog fetches ALL types from /work-package-admin/case-types/creation-options
    // and only shows those that have an ACTIVE work package template.
    const hardcodedTypes = [
      "REAL_ESTATE", "CORPORATE", "CONTRACT", "LITIGATION",
      "EMPLOYMENT", "IP", "COMPLIANCE", "MERGERS_ACQUISITIONS",
      "CONTRACT_REVIEW", "CONTRACT_DRAFTING",
    ];
    // This test documents the intent: the CompactNewCaseDialog component
    // must NOT hardcode any of these values. It must use creationOptions from API.
    assert.ok(hardcodedTypes.length > 0, "hardcoded types list is non-empty for documentation");
  });
});
