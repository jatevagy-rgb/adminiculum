import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  DOCUMENT_DELETE_DEPENDENCY_MESSAGE,
  DOCUMENT_DELETE_FORBIDDEN_MESSAGE,
  DOCUMENT_DELETE_STORAGE_MESSAGE,
  documentDeleteErrorMessage,
} from "../src/lib/documents/documentPreparation";

// Targeted repair for the Case Workspace document-card surface.
// The card must expose the canonical delete route (no new endpoint), require
// confirmation, refresh the host list on success and turn 403/409 into readable
// states. The two misleading labels are pinned to the operation they perform.

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
const card = () => read("src/components/documents/DocumentWorkCard.tsx");
const api = () => read("src/lib/api.ts");
const overview = () => read("src/components/cases/CaseWorkspaceOverview.tsx");
const prep = () => read("src/components/documents/DocumentPreparationDashboard.tsx");

describe("Case Workspace document card — delete affordance", () => {
  it("1. exposes a restrained delete action on the card", () => {
    const source = card();
    assert.match(source, /data-testid="doc-card-delete"/);
    assert.match(source, />\s*Törlés\s*</);
    // Quiet destructive text action, not a competing primary button.
    assert.match(source, /text-\[var\(--adm-terracotta-700\)\] hover:underline/);
  });

  it("2. delete requires the canonical confirmation dialog", () => {
    const source = card();
    assert.match(source, /import \{ ConfirmationDialog \} from "@\/components\/ui"/);
    assert.match(source, /<ConfirmationDialog/);
    assert.match(source, /variant="danger"/);
    assert.match(source, /confirmLabel="Végleges törlés"/);
    assert.match(source, /busyLabel="Törlés…"/);
    // The delete path must not fall back to a browser-native confirm.
    const deleteBlock = source.slice(source.indexOf("const confirmDelete"), source.indexOf("}, [card, deleting, onChanged]"));
    assert.doesNotMatch(deleteBlock, /window\.confirm/);
  });

  it("3. the confirmation names the document and cancel never deletes", () => {
    const source = card();
    assert.match(source, /\{card\.title \|\| card\.fileName \|\| "Névtelen dokumentum"\}/);
    const cancelBlock = source.slice(source.indexOf("onCancel={"), source.indexOf("</ConfirmationDialog>"));
    assert.match(cancelBlock, /setDeleteOpen\(false\)/);
    assert.match(cancelBlock, /setDeleteError\(null\)/);
    assert.doesNotMatch(cancelBlock, /deleteDocument/);
  });

  it("4. confirm calls the canonical deleteDocument with the card's exact id", () => {
    const source = card();
    assert.match(source, /await deleteDocument\(card\.id\)/);
    assert.match(source, /deleteDocument[^}]*\} from "@\/lib\/api"/);
  });

  it("5. a successful delete refreshes the host Case Workspace list", () => {
    const source = card();
    const confirmBlock = source.slice(
      source.indexOf("const confirmDelete"),
      source.indexOf("}, [card, deleting, onChanged]"),
    );
    assert.match(confirmBlock, /onChanged\?\.\(\)/);
    // The Case Workspace hosts the card and wires onChanged to its refresh.
    const host = overview();
    const cardIndex = host.indexOf("<DocumentWorkCard");
    assert.ok(cardIndex > -1, "Case Workspace must render DocumentWorkCard");
    const section = host.slice(cardIndex, cardIndex + 400);
    assert.match(section, /onChanged=\{onRefresh\}/);
  });

  it("6. dependency and permission failures become controlled, provider-free messages", () => {
    assert.equal(documentDeleteErrorMessage(409), DOCUMENT_DELETE_DEPENDENCY_MESSAGE);
    assert.equal(documentDeleteErrorMessage(403), DOCUMENT_DELETE_FORBIDDEN_MESSAGE);
    assert.equal(documentDeleteErrorMessage(502), DOCUMENT_DELETE_STORAGE_MESSAGE);
    assert.match(documentDeleteErrorMessage(404), /nem található/);
    assert.match(documentDeleteErrorMessage(undefined), /nem sikerült/);

    const source = card();
    assert.match(source, /documentDeleteErrorMessage\(error instanceof ApiError \? error\.status : undefined\)/);
    assert.match(source, /data-testid="doc-card-delete-error"/);
    assert.match(source, /role="alert"/);
    // Raw backend/provider codes must never be rendered to the user.
    assert.doesNotMatch(source, /DOCUMENT_DELETE_FAILED/);
    assert.doesNotMatch(source, /STORAGE_DELETE_FAILED/);
  });
});

describe("Case Workspace document card — single canonical delete path", () => {
  it("7. reuses the one frontend delete client and adds no local route", () => {
    const apiSource = api();
    const declarations = apiSource.match(/export async function deleteDocument\(/g) || [];
    assert.equal(declarations.length, 1, "exactly one deleteDocument client must exist");
    assert.match(apiSource, /fetchApi<void>\(`\/documents\/\$\{encodeURIComponent\(documentId\)\}`, \{\s*method: 'DELETE'/);

    const cardSource = card();
    assert.doesNotMatch(cardSource, /fetchApi/);
    assert.doesNotMatch(cardSource, /\/documents\/.*delete/i);
  });
});

describe("Case Workspace document card — truthful action labels", () => {
  it("8/9. task-link action is labelled Feladathoz kapcsolás and still links", () => {
    const source = card();
    assert.match(source, />Feladathoz kapcsolás<\/AdminButton>/);
    assert.match(source, /onClick=\{\(\) => setLinking\(\(v\) => !v\)\}/);
    assert.match(source, /linkDocumentToTask\(documentId, t\.id\)/);
    assert.match(source, /unlinkDocumentFromTask\(documentId, t\.taskId\)/);
    assert.match(source, /data-testid="doc-card-link-picker"/);
    // The old misleading short label is gone.
    assert.doesNotMatch(source, />Feladat<\/AdminButton>/);
  });

  it("10/11. work-context action is labelled Munkautasítás and still saves the canonical workInstruction", () => {
    const source = card();
    assert.match(source, />Munkautasítás<\/AdminButton>/);
    assert.match(source, /onClick=\{\(\) => setEditing\(true\)\}/);
    assert.match(source, /<DocumentWorkContextEditor/);
    assert.match(source, /updateDocumentWorkContext\(card\.id/);
    assert.match(source, /workInstruction: instruction\.trim\(\) \|\| null/);
    assert.match(source, /id="dwc-instruction"/);
    // The misleading label is gone.
    assert.doesNotMatch(source, />Munkakontextus<\/AdminButton>/);
  });
});

describe("Case Workspace document card — preserved behavior", () => {
  it("keeps open, review, new version, unlink and technical details reachable", () => {
    const source = card();
    assert.match(source, />Megnyitás<\/AdminButton>/);
    assert.match(source, />Review<\/AdminButton>/);
    assert.match(source, />Új verzió<\/AdminButton>/);
    assert.match(source, />\s*Leválasztás\s*<\/button>/);
    assert.match(source, /data-testid="doc-card-technical-toggle"/);
    // Work-context signals preserved (not deleted by the label repair).
    assert.match(source, /testid="doc-card-owner"/);
    assert.match(source, /testid="doc-card-reviewer"/);
    assert.match(source, /testid="doc-card-due"/);
    assert.match(source, /testid="doc-card-next-step"/);
  });
});

describe("Document preparation dashboard — delete behavior unchanged", () => {
  it("7. keeps its existing canonical delete flow intact", () => {
    const source = prep();
    assert.match(source, /import \{[^}]*deleteDocument[^}]*\} from "@\/lib\/api"/);
    assert.match(source, /import \{ ConfirmationDialog \} from "@\/components\/ui"/);
    assert.match(source, /await deleteDocument\(deletedId\)/);
    assert.match(source, /documentDeleteErrorMessage\(error instanceof ApiError \? error\.status : undefined\)/);
    assert.match(source, /data-testid="preparation-delete-error"/);
    // The dashboard flow is untouched by the Case Workspace repair.
    const block = source.slice(source.indexOf("const confirmDelete"), source.indexOf("if (documents.length === 0)"));
    assert.match(block, /resolveDefaultPreparationDocumentId\(remaining, activeDocuments\)/);
    assert.match(block, /onRefresh\?\.\(\)/);
    assert.doesNotMatch(block, /window\.confirm/);
  });
});
