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
  it("renders the link form with both audiences, a requirement picker and document search", () => {
    const markup = renderToStaticMarkup(
      createElement(ComplianceDocumentsSection, {
        clientId: "client-1",
        requirements: [{ key: "GDPR_GENERAL_SCOPE", title: "Általános adatvédelem" }],
      }),
    );
    assert.match(markup, /Megfelelőségi terület/);
    assert.match(markup, /Meglévő dokumentum keresése/);
    assert.match(markup, /Ügyfélnek szánt szabályzat/);
    assert.match(markup, /Belső megfelelőségi elemzés/);
    assert.match(markup, /Általános adatvédelem/);
    assert.match(markup, /Betöltés/);
  });

  it("reuses the canonical document search and compliance document API only", () => {
    const src = source();
    assert.match(src, /searchDocuments/);
    assert.match(src, /complianceDocumentApi\.list/);
    assert.match(src, /complianceDocumentApi\.link/);
    assert.match(src, /complianceDocumentApi\.unlink/);
    assert.doesNotMatch(src, /uploadCaseDocument|upload/);
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
