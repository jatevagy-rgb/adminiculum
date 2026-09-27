import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

(global as any).React = React;
import { AIResultsList, hasAiOutput, toAiResultRow, type AiResultRow } from "../src/components/ai-prompts/AIResultsTile";
import type { AiPromptDraft } from "../src/lib/api";
import { fmtDateTime } from "../src/components/cases/CaseCockpitPanels";

// Focused coverage for the Case Workspace AI output tile. The tile is a
// read-only projection of the canonical AiPromptDraft persistence: no new
// storage, no external AI call, no prompt-internal leak, honest empty state,
// case-scoped list, and the canonical open action reusing the existing
// AIPromptPreparationModal result view.

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");

function draft(overrides: Partial<AiPromptDraft> = {}): AiPromptDraft {
  return {
    id: "draft-1",
    caseId: "case-1",
    promptTemplateId: "tpl-1",
    promptTemplateStableKey: "contract-review",
    promptTemplateVersion: 3,
    sourceDocumentIds: ["doc-1", "doc-2"],
    sourceDocumentVersionIds: [],
    sourceTaskId: null,
    sourceWorkPackageItemId: null,
    selectedContext: {},
    anonymizedPreview: "ANONIMIZÁLT ELŐNÉZET TITKOS",
    externalPromptText: "BELSŐ RENDSZERPROMPT TITKOS",
    importedResponse: "az AI nyers válasza TITKOS",
    rehydratedResponse: "A rehidratált jogi eredmény",
    rehydrationWarnings: [],
    status: "AI_DRAFT",
    reviewerNotes: null,
    preparedById: "user-1",
    importedById: "user-1",
    verifiedById: null,
    approvedById: null,
    createdAt: "2026-09-27T10:00:00.000Z",
    updatedAt: "2026-09-27T11:00:00.000Z",
    promptTemplateSnapshot: { title: "Szerződés átvilágítás", legalWorkCategory: "CONTRACT_REVIEW" },
    ...overrides,
  };
}

const docs = [
  { id: "doc-1", fileName: "bérleti_szerzodes.docx" },
  { id: "doc-2", fileName: "melleklet_A.pdf" },
  { id: "doc-3", fileName: "mas_ugy.docx" },
];

function renderRows(items: AiResultRow[]): string {
  return renderToStaticMarkup(createElement(AIResultsList, { items, onOpen: () => {} }));
}

describe("Case Workspace AI eredmények tile", () => {
  it("1. an AI result exists only when an AI response was imported (canonical importedResponse)", () => {
    assert.equal(hasAiOutput(draft()), true);
    assert.equal(hasAiOutput(draft({ importedResponse: null, status: "PREPARED" })), false);
    assert.equal(hasAiOutput(draft({ importedResponse: "" })), true, "an imported row is a result even when empty");
  });

  it("2. rows are built from canonical AiPromptDraft fields only", () => {
    const row = toAiResultRow(draft(), docs);
    assert.equal(row.title, "Szerződés átvilágítás");
    assert.equal(row.typeLabel, "Szerződés-elemzés");
    assert.equal(row.status, "AI_DRAFT");
    assert.equal(row.createdAt, "2026-09-27T10:00:00.000Z");
    assert.deepEqual(row.documentNames, ["bérleti_szerzodes.docx", "melleklet_A.pdf"]);
  });

  it("3. falls back to the canonical stable key when the snapshot title is missing", () => {
    const row = toAiResultRow(draft({ promptTemplateSnapshot: null }), docs);
    assert.equal(row.title, "contract-review · v3");
    const unknownCategory = toAiResultRow(draft({ promptTemplateSnapshot: { legalWorkCategory: "CUSTOM_THING" } }), docs);
    assert.equal(unknownCategory.typeLabel, "CUSTOM_THING");
  });

  it("4. renders title, type, status, createdAt, linked documents and a Megnyitás action", () => {
    const markup = renderRows([toAiResultRow(draft(), docs)]);
    assert.match(markup, /data-testid="ai-results-list"/);
    assert.match(markup, /data-testid="ai-result-item"/);
    assert.match(markup, /Szerződés átvilágítás/);
    assert.match(markup, /Szerződés-elemzés/);
    assert.match(markup, /AI-válasz importálva/);
    assert.ok(markup.includes(fmtDateTime("2026-09-27T10:00:00.000Z")), "createdAt must be rendered");
    assert.match(markup, /bérleti_szerzodes\.docx, melleklet_A\.pdf/);
    assert.match(markup, /data-testid="ai-result-open"/);
    assert.match(markup, />Megnyitás</);
  });

  it("5. never renders prompt internals, anonymization previews or raw AI responses", () => {
    const markup = renderRows([toAiResultRow(draft(), docs)]);
    assert.doesNotMatch(markup, /BELSŐ RENDSZERPROMPT/);
    assert.doesNotMatch(markup, /ANONIMIZÁLT ELŐNÉZET/);
    assert.doesNotMatch(markup, /az AI nyers válasza/);
    assert.doesNotMatch(markup, /rehidratált jogi eredmény/);
    const src = read("src/components/ai-prompts/AIResultsTile.tsx");
    assert.doesNotMatch(src, /externalPromptText/);
    assert.doesNotMatch(src, /anonymizedPreview/);
    assert.doesNotMatch(src, /anonymizationSnapshot/);
    assert.doesNotMatch(src, /rehydrationMap/);
    assert.doesNotMatch(src, /importedResponse\s*[>{]/);
    assert.doesNotMatch(src, /rehydratedResponse/);
  });

  it("6. shows a truthful empty state that does not claim an AI has run", () => {
    const src = read("src/components/ai-prompts/AIResultsTile.tsx");
    assert.match(src, /Még nincs AI-eredmény ezen az ügyön\./);
    assert.doesNotMatch(src, /AI (le)?futott|AI futás|AI-t futtat/);
    assert.equal(renderRows([]), "", "an empty list renders nothing inside the section");
  });

  it("7. reuses the canonical case-scoped drafts endpoint and adds no new persistence", () => {
    const src = read("src/components/ai-prompts/AIResultsTile.tsx");
    assert.match(src, /listAiPromptDraftsForCase\(caseId\)/);
    assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/);
    assert.doesNotMatch(src, /prepareAiPrompt|importAiPromptResponse/);
    assert.doesNotMatch(src, /fetch\(/);
    const api = read("src/lib/api.ts");
    const list = api.slice(api.indexOf("export async function listAiPromptDraftsForCase"));
    assert.match(list, /`\/ai-prompts\/cases\/\$\{encodeURIComponent\(caseId\)\}\/drafts`/);
  });

  it("8. backend list is case-scoped: cross-case drafts cannot appear", () => {
    const service = read("../Backend/src/modules/ai-prompts/service.ts");
    const listFn = service.slice(service.indexOf("export async function listPromptDraftsForCase"));
    assert.match(listFn, /where: \{ caseId \}/);
    assert.match(listFn, /requireCaseAccess\(req, caseId, 'read'\)/);
  });

  it("9. Megnyitás opens the existing canonical result view, not a new reader", () => {
    const overview = read("src/components/cases/CaseWorkspaceOverview.tsx");
    assert.match(overview, /onOpen=\{\(draftId\) => \{ setAiPromptInitialDraftId\(draftId\); setAiPromptOpen\(true\); \}\}/);
    assert.match(overview, /<AIPromptPreparationModal caseId=\{caseId\} initialDraftId=\{aiPromptInitialDraftId\}/);
    const modal = read("src/components/ai-prompts/AIPromptPreparationModal.tsx");
    assert.match(modal, /getPromptDraft\(initialDraftId\)/);
  });

  it("10. opening the Case Workspace never triggers an external AI call", () => {
    const src = read("src/components/ai-prompts/AIResultsTile.tsx");
    assert.doesNotMatch(src, /https?:\/\//);
    assert.doesNotMatch(src, /openai|anthropic|claude|gemini/i);
    const modal = read("src/components/ai-prompts/AIPromptPreparationModal.tsx");
    assert.match(modal, /Adminiculum nem hív külső AI-t/);
  });

  it("11. #400 notes replies and #387 Leadás surfaces remain untouched", () => {
    const overview = read("src/components/cases/CaseWorkspaceOverview.tsx");
    assert.equal(overview.split('aria-label="Műveletek"').length - 1, 1);
    assert.match(overview, /id="ck-notes-primary"/);
    assert.match(overview, /data-testid="task-submission-leadas"/);
    assert.match(overview, /setAiPromptOpen\(true\)\}>\s*AI előkészítés<\/AdminButton>/);
    assert.match(overview, /id="ck-comms"/);
    assert.match(overview, /id="ck-documents"/);
  });
});
