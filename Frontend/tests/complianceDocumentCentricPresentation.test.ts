/**
 * Compliance linked-documents READ presentation — document-centric contract.
 *
 * The canonical many-to-many relation (one physical document -> N requirement
 * topics, per audience) must be preserved: every relation keeps its own link id
 * for unlink. Only the PRESENTATION collapses, so one document renders once per
 * audience/document context instead of once per requirement relation.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ComplianceDocumentList,
  groupComplianceDocuments,
} from "../src/components/clients/compliance/ComplianceDocumentsSection";
import type { ComplianceDocumentLink, ComplianceDocumentTopic } from "../src/lib/complianceDocumentApi";

const root = process.cwd();
const source = () => readFileSync(path.join(root, "src/components/clients/compliance/ComplianceDocumentsSection.tsx"), "utf8");

const PANEL_MARKER = /Jogi hivatkozások mátrixa/g;

function link(id: string, documentId: string, title: string, extra: Partial<ComplianceDocumentLink> = {}): ComplianceDocumentLink {
  return {
    id,
    documentId,
    title,
    latestVersion: { version: 3, createdAt: "2026-09-01T00:00:00.000Z" },
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    published: null,
    ...extra,
  };
}

function render(groups: ReturnType<typeof groupComplianceDocuments>, freshDocumentId: string | null = null) {
  return renderToStaticMarkup(
    createElement(ComplianceDocumentList, {
      groups,
      clientId: "client-1",
      freshDocumentId,
      removingId: null,
      onUnlink: () => {},
    }),
  );
}

function count(markup: string, pattern: RegExp): number {
  return (markup.match(pattern) ?? []).length;
}

const titles = new Map([
  ["WB", "Belső visszaélés-bejelentési rendszer"],
  ["GDPR", "GDPR fokozott kockázat"],
  ["NIS2", "NIS2 biztonsági követelmények"],
]);

// One physical internal document related to three requirement topics.
const ONE_DOC_THREE_REQUIREMENTS: ComplianceDocumentTopic[] = [
  { requirementKey: "WB", internalAnalysis: [link("rel-wb", "doc-1", "Visszaélés-bejelentési szabályzat")], clientPolicy: [] },
  { requirementKey: "GDPR", internalAnalysis: [link("rel-gdpr", "doc-1", "Visszaélés-bejelentési szabályzat")], clientPolicy: [] },
  { requirementKey: "NIS2", internalAnalysis: [link("rel-nis2", "doc-1", "Visszaélés-bejelentési szabályzat")], clientPolicy: [] },
];

describe("compliance linked documents — document-centric read presentation", () => {
  it("ONE_DOCUMENT_THREE_REQUIREMENTS_FULL_CARD_COUNT=1", () => {
    const groups = groupComplianceDocuments(ONE_DOC_THREE_REQUIREMENTS, titles);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].documentId, "doc-1");
    assert.equal(groups[0].audience, "INTERNAL_ANALYSIS");

    const markup = render(groups);
    assert.equal(count(markup, /data-compliance-document-card="true"/g), 1);
    // Document-level facts are rendered once, not once per relation.
    assert.equal(count(markup, /Legfrissebb verzió:/g), 1);
    assert.equal(count(markup, /Visszaélés-bejelentési szabályzat/g), 1);
  });

  it("ONE_DOCUMENT_THREE_REQUIREMENTS_RELATION_COUNT=3", () => {
    const groups = groupComplianceDocuments(ONE_DOC_THREE_REQUIREMENTS, titles);
    assert.equal(groups[0].relations.length, 3);
    assert.deepEqual(groups[0].relations.map((relation) => relation.id), ["rel-wb", "rel-gdpr", "rel-nis2"]);
    assert.deepEqual(groups[0].relations.map((relation) => relation.requirementTitle), [
      "Belső visszaélés-bejelentési rendszer",
      "GDPR fokozott kockázat",
      "NIS2 biztonsági követelmények",
    ]);

    const markup = render(groups);
    // Compact related-area rows, one per canonical relation.
    assert.equal(count(markup, /data-compliance-relation="true"/g), 3);
    for (const id of ["rel-wb", "rel-gdpr", "rel-nis2"]) {
      assert.match(markup, new RegExp(`data-compliance-link-id="${id}"`));
    }
    assert.match(markup, /Kapcsolódó területek/);
    assert.match(markup, /Belső visszaélés-bejelentési rendszer/);
    assert.match(markup, /GDPR fokozott kockázat/);
    assert.match(markup, /NIS2 biztonsági követelmények/);
    // One remove action per relation, never a bulk "remove all".
    assert.equal(count(markup, /Eltávolítás/g), 3);
    assert.doesNotMatch(markup, /removeAll|Összes eltávolítása|Összes kapcsolat/);
  });

  it("MATRIX_RENDER_COUNT_FOR_SAME_INTERNAL_DOCUMENT=1", () => {
    const groups = groupComplianceDocuments(ONE_DOC_THREE_REQUIREMENTS, titles);
    const markup = render(groups);
    assert.equal(count(markup, PANEL_MARKER), 1);
  });

  it("UNLINK_ONE_RELATION_PRESERVES_OTHER_RELATIONS=YES", () => {
    // Unlink is per canonical relation id; the other relations stay untouched.
    const afterUnlink = groupComplianceDocuments(
      ONE_DOC_THREE_REQUIREMENTS.map((topic) => ({
        ...topic,
        internalAnalysis: topic.internalAnalysis.filter((candidate) => candidate.id !== "rel-gdpr"),
      })),
      titles,
    );
    assert.equal(afterUnlink.length, 1);
    assert.deepEqual(afterUnlink[0].relations.map((relation) => relation.id), ["rel-wb", "rel-nis2"]);
    assert.equal(count(render(afterUnlink), /data-compliance-relation="true"/g), 2);

    // The component binds each action to exactly one relation id.
    const src = source();
    assert.match(src, /onClick=\{\(\) => onUnlink\(relation\.id\)\}/);
    assert.match(src, /complianceDocumentApi\.unlink\(clientId, id\)/);
    assert.doesNotMatch(src, /unlinkAll|removeAll|unlink\(clientId, ids/);
  });

  it("CLIENT_POLICY_INTERNAL_ANALYSIS_NOT_COLLAPSED=YES", () => {
    const mixed: ComplianceDocumentTopic[] = [{
      requirementKey: "WB",
      internalAnalysis: [link("rel-int", "doc-1", "Közös dokumentum")],
      clientPolicy: [link("rel-pol", "doc-1", "Közös dokumentum", {
        published: { publicationId: "pub-1", clientFacingTitle: "Közös dokumentum", publishedAt: "2026-09-02T00:00:00.000Z" },
      })],
    }];
    const groups = groupComplianceDocuments(mixed, titles);
    // Same physical document in two audiences stays two truthful contexts.
    assert.equal(groups.length, 2);
    const internal = groups.find((group) => group.audience === "INTERNAL_ANALYSIS");
    const policy = groups.find((group) => group.audience === "CLIENT_POLICY");
    assert.ok(internal);
    assert.ok(policy);
    assert.deepEqual(internal.relations.map((relation) => relation.id), ["rel-int"]);
    assert.deepEqual(policy.relations.map((relation) => relation.id), ["rel-pol"]);
    assert.equal(internal.published, null);
    assert.ok(policy.published);

    const markup = render(groups);
    assert.match(markup, /Csak az iroda számára/);
    assert.match(markup, /Ügyfélnek közzétéve: /);
    // Only the internal-analysis context renders a legal matrix.
    assert.equal(count(markup, PANEL_MARKER), 1);
  });

  it("DISTINCT_DOCUMENTS_SAME_FILENAME_PRESERVED=YES", () => {
    const sameName: ComplianceDocumentTopic[] = [
      { requirementKey: "WB", internalAnalysis: [link("rel-a", "doc-a", "Szabályzat.pdf")], clientPolicy: [] },
      { requirementKey: "GDPR", internalAnalysis: [link("rel-b", "doc-b", "Szabályzat.pdf")], clientPolicy: [] },
    ];
    const groups = groupComplianceDocuments(sameName, titles);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups.map((group) => group.documentId).sort(), ["doc-a", "doc-b"]);
    const markup = render(groups);
    assert.equal(count(markup, /data-compliance-document-card="true"/g), 2);
    assert.equal(count(markup, /data-compliance-relation="true"/g), 2);
  });

  it("AUDIENCE_BOUNDARY: identical document ids in different audiences never merge", () => {
    const groups = groupComplianceDocuments([
      { requirementKey: "WB", internalAnalysis: [link("rel-int", "doc-x", "X")], clientPolicy: [] },
      { requirementKey: "WB", internalAnalysis: [], clientPolicy: [link("rel-pol", "doc-x", "X")] },
    ], titles);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups.map((group) => group.key).sort(), ["CLIENT_POLICY::doc-x", "INTERNAL_ANALYSIS::doc-x"]);
  });
});
