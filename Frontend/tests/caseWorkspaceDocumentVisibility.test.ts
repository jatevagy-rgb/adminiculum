import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

(global as any).React = React;
import {
  CaseWorkspaceDocumentsSection,
} from "../src/components/cases/CaseWorkspaceOverview";
import type { CaseWorkspace } from "../src/lib/api";

type WorkspaceDoc = CaseWorkspace["documents"][number];
type ActiveDoc = CaseWorkspace["cockpit"]["activeDocuments"][number];

function createDoc(overrides: Partial<WorkspaceDoc> = {}): WorkspaceDoc {
  return {
    id: "doc-test-1",
    fileName: "ugyfel_szerzodes_tervezet.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    type: "CONTRACT",
    category: "szerzodes",
    version: "1.0",
    uploadedAt: "2026-09-01T12:00:00.000Z",
    uploadedBy: { id: "user-1", name: "Dr. Ügyvéd" },
    summary: null,
    commentCount: 2,
    ...overrides,
  };
}

describe("Case Workspace Document Visibility", () => {
  it("Test A: shows ordinary document in Dokumentumok section even if cp.activeDocuments is empty", () => {
    const doc = createDoc({ id: "doc-fresh-1", fileName: "friss_feltoltes.pdf" });
    const documents: WorkspaceDoc[] = [doc];
    const activeDocuments: ActiveDoc[] = [];

    const markup = renderToStaticMarkup(
      createElement(CaseWorkspaceDocumentsSection, {
        documents,
        activeDocuments,
        tasks: [],
        caseId: "case-999",
      })
    );

    // Document section displays count 1 and lists the document
    assert.match(markup, /Dokumentumok/);
    assert.match(markup, /data-testid="active-documents"/);
    assert.match(markup, />1<\/span>/); // count badge is 1
    // Does NOT say "Nincs aktív munkairat." or "Nincs dokumentum."
    assert.doesNotMatch(markup, /Nincs aktív munkairat\./);
    assert.doesNotMatch(markup, /Nincs dokumentum\./);
    // Kommentek button is rendered
    assert.match(markup, /Kommentek \(2\)/);

    // Ensure overview source keeps active-document KPI linked to cp.kpi.activeDocuments
    const overviewSrc = readFileSync(
      path.resolve(__dirname, "../src/components/cases/CaseWorkspaceOverview.tsx"),
      "utf8"
    );
    assert.match(
      overviewSrc,
      /label="Aktív dokumentumok"[\s\S]*?value=\{cp\.kpi\.activeDocuments\.count\}/
    );
  });

  it("Test B: preserves operational badges (Review-ra vár, Határidő lejárt, Munka alatt) when document is active", () => {
    const doc1 = createDoc({ id: "doc-rev", fileName: "rev.docx" });
    const doc2 = createDoc({ id: "doc-dl", fileName: "dl.docx" });
    const doc3 = createDoc({ id: "doc-prog", fileName: "prog.docx" });
    const doc4 = createDoc({ id: "doc-other", fileName: "other.docx" });

    const documents: WorkspaceDoc[] = [doc1, doc2, doc3, doc4];
    const activeDocuments: ActiveDoc[] = [
      { id: "doc-rev", fileName: "rev.docx", reason: "REVIEW_PENDING" },
      { id: "doc-dl", fileName: "dl.docx", reason: "DEADLINE_PASSED" },
      { id: "doc-prog", fileName: "prog.docx", reason: "IN_PROGRESS" },
    ];

    const markup = renderToStaticMarkup(
      createElement(CaseWorkspaceDocumentsSection, {
        documents,
        activeDocuments,
        tasks: [],
        caseId: "case-999",
      })
    );

    // Section count is 4
    assert.match(markup, />4<\/span>/);
    // Badges preserved
    assert.match(markup, /Review-ra vár/);
    assert.match(markup, /Határidő lejárt/);
    assert.match(markup, /Munka alatt/);
  });

  it("Test C: renders normal empty state 'Nincs dokumentum.' when ws.documents is empty", () => {
    const documents: WorkspaceDoc[] = [];
    const activeDocuments: ActiveDoc[] = [];

    const markup = renderToStaticMarkup(
      createElement(CaseWorkspaceDocumentsSection, {
        documents,
        activeDocuments,
        tasks: [],
        caseId: "case-999",
      })
    );

    // Section count is 0
    assert.match(markup, />0<\/span>/);
    assert.match(markup, /Nincs dokumentum\./);
    assert.doesNotMatch(markup, /Nincs aktív munkairat\./);
    assert.doesNotMatch(markup, /data-testid="active-documents"/);
  });
});
