import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ComplianceDocumentsSection } from "../src/components/clients/compliance/ComplianceDocumentsSection";

const root = process.cwd();
const source = () => readFileSync(path.join(root, "src/components/clients/compliance/ComplianceDocumentsSection.tsx"), "utf8");

describe("internal Compliance Documents management section", () => {
  it("renders the upload form, the linked-documents area and the secondary manual section", () => {
    const markup = renderToStaticMarkup(
      createElement(ComplianceDocumentsSection, {
        clientId: "client-1",
        requirements: [{ key: "GDPR_GENERAL_SCOPE", title: "Általános adatvédelem" }],
      }),
    );
    assert.match(markup, /Megfelelőségi terület/);
    assert.match(markup, /Feltöltés ügyfélnek/);
    assert.match(markup, /Feltöltés jogi mátrixszal/);
    assert.match(markup, /Összekapcsolt dokumentumok/);
    assert.match(markup, /Általános adatvédelem/);
    assert.match(markup, /Betöltés/);
    // The secondary manual section is collapsed by default; its labels and both
    // audiences remain available in the source.
    assert.match(markup, /Meglévő dokumentum kapcsolása/);
    const src = source();
    assert.match(src, /Meglévő dokumentum keresése/);
    assert.match(src, /Ügyfélnek szánt szabályzat/);
    assert.match(src, /Belső megfelelőségi elemzés/);
  });

  it("reuses the canonical document search and compliance document API only", () => {
    const src = source();
    assert.match(src, /searchDocuments/);
    assert.match(src, /complianceDocumentApi\.list/);
    assert.match(src, /complianceDocumentApi\.link/);
    assert.match(src, /complianceDocumentApi\.unlink/);
    // Only the canonical compliance upload orchestration is called; there is no
    // raw case-document upload helper and no direct DocumentVersion access.
    assert.match(src, /complianceDocumentApi\.upload/);
    assert.doesNotMatch(src, /uploadCaseDocument/);
    assert.doesNotMatch(src, /DocumentVersion|documentVersion/);
  });

  it("never auto-publishes: publication stays a separate canonical step", () => {
    const src = source();
    // No publication mutation of any kind happens from this internal section.
    assert.doesNotMatch(src, /publishDocument|createPublication|submitPublication|clientDocumentPublication/i);
    assert.doesNotMatch(src, /method:\s*["']POST["'][\s\S]*publication/i);
    // It only reads/creates/removes the compliance-document link.
    assert.match(src, /audience:\s*ComplianceDocumentAudience/);
  });

  it("labels INTERNAL_ANALYSIS as office-only and CLIENT_POLICY by publication state", () => {
    const src = source();
    assert.match(src, /Csak az iroda számára/);
    assert.match(src, /Ügyfélnek még nincs közzétéve/);
    assert.match(src, /Ügyfélnek közzétéve/);
  });
});
