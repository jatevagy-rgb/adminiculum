import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Client Portal 3.0 — checkpoint D contract (Document Library V3 + Document
 * Detail V3). Pins the ORGANIZATION runtime cutover, the document-vs-request
 * boundary, the exact publication id identity, the download gating and legacy
 * preservation.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const exists = (relative: string) => existsSync(path.join(root, relative));

const shell = () => read("src/components/client-portal/ClientPortalShell.tsx");
const library = () => read("src/components/client-portal-v3/documents/PortalDocumentLibraryV3.tsx");
const detail = () => read("src/components/client-portal-v3/documents/PortalDocumentDetailV3.tsx");
const api = () => read("src/lib/clientPortalApi.ts");

const v3Sources = () => [library(), detail()].join("\n");

describe("Checkpoint D — document library runtime", () => {
  it("19. /portal/dokumentumok ORGANIZATION renders PortalDocumentLibraryV3", () => {
    assert.match(shell(), /view === 'documents' \? <PortalDocumentLibraryV3 \/> : null/);
  });

  it("20. the page contains Irodától + Saját beküldések segments", () => {
    const src = library();
    assert.match(src, /title="Irodától"/);
    assert.match(src, /title="Saját beküldések"/);
  });

  it("21. no open request rows can exist in the library", () => {
    const src = library();
    assert.doesNotMatch(src, /DOCUMENT_UPLOAD|CORRECTION_REQUEST(?!ED)|INFORMATION_REQUEST|DATA_FORM|QUESTION_RESPONSE/);
    assert.doesNotMatch(src, /getPortalOrganizationCases|getPortalActionCenter/);
  });

  it("22. published document href uses the publicationId", () => {
    assert.match(library(), /\/portal\/documents\/\$\{encodeURIComponent\(document\.publicationId\)\}/);
  });

  it("23. /portal/documents/:publicationId renders PortalDocumentDetailV3", () => {
    assert.match(shell(), /view === 'document' \? <PortalDocumentDetailV3 publicationId=\{resourceId\} \/> : null/);
  });

  it("24/25. legacy DocumentView is not the ORGANIZATION render target and never double-renders", () => {
    const src = shell();
    const orgBranch = src.slice(src.indexOf("CLIENT PORTAL 3.0 CUTOVER"), src.indexOf("// Customer context label"));
    assert.doesNotMatch(orgBranch, /<DocumentView/);
    // DocumentView stays for INDIVIDUAL/CASE_RELAY in the legacy main.
    assert.match(src, /DocumentView/);
    // The legacy documents composition remains for CASE_RELAY rollback.
    const orgViews = read("src/components/client-portal/OrganizationPortalViews.tsx");
    assert.match(orgViews, /<OrganizationDocuments/);
  });

  it("26. download CTA only when downloadAvailable", () => {
    const src = detail() + library();
    assert.match(src, /document\.downloadAvailable \? \(/);
    assert.doesNotMatch(src, /downloadAvailable=\{false\}/);
  });

  it("27. detail uses getPortalDocument(publicationId)", () => {
    const src = detail();
    assert.match(src, /getPortalDocument\(publicationId\)/);
    assert.match(src, /portalDownloadUrl\(document\.id\)/);
    assert.doesNotMatch(src, /getPortalDocumentByTitle|latestVersion|currentVersion/);
  });

  it("28. exact versionLabel is rendered", () => {
    assert.match(detail(), /data-testid="portal-document-version-label"/);
    assert.match(detail(), /\{document\.versionLabel\}/);
  });

  it("29/30. INDIVIDUAL and CASE_RELAY remain legacy", () => {
    const src = shell();
    assert.match(src, /'Ügyeim', '\/portal\/ugyeim'/);
    assert.match(src, /workspace\.mode === 'CASE_RELAY'/);
    assert.match(src, /OrganizationPortalViews/);
  });

  it("31. no raw hex / adm-blue / adm-ivory / cp-* in the new V3 document files", () => {
    const src = v3Sources();
    assert.doesNotMatch(src, /(?:bg|text|border|ring|fill|stroke)-\[#(?:[0-9a-fA-F]{3,8})\]/);
    assert.doesNotMatch(src, /--adm-blue/);
    assert.doesNotMatch(src, /--adm-ivory/);
    assert.doesNotMatch(src, /cp-(?:hero|card|row|pill|kicker|empty)/);
    assert.match(src, /--adm-canvas-subtle|--adm-canvas-white/);
    assert.match(src, /--adm-border-canonical/);
    assert.match(src, /--adm-brand-green/);
    assert.match(src, /--adm-brand-terracotta/);
    assert.match(src, /focus-visible:ring-2/);
    assert.match(src, /h-10/);
  });

  it("library consumes the typed backend endpoint", () => {
    const src = api();
    assert.match(src, /export async function getPortalOrganizationDocuments\(\)/);
    assert.match(src, /'\/client-portal\/org\/documents'/);
    assert.match(src, /OrgDocumentLibrarySubmissionStatus/);
    const route = read("../Backend/src/routes/clientPortal.ts");
    assert.match(route, /router\.get\('\/org\/documents'/);
    assert.match(route, /getOrganizationalDocumentLibrary/);
  });

  it("submission correction rows link the canonical request journey only", () => {
    const src = library();
    assert.match(src, /status === "CORRECTION_REQUESTED" && submission\.matterPublicationId && submission\.requestId/);
    assert.match(src, /\/portal\/matters\/\$\{encodeURIComponent\(submission\.matterPublicationId\)\}\/requests\/\$\{encodeURIComponent\(submission\.requestId\)\}/);
  });

  it("legacy document surfaces remain in the repository", () => {
    for (const relative of [
      "src/components/client-portal/OrganizationPortalViews.tsx",
      "src/components/client-portal/MatterWorkspace.tsx",
      "src/app/portal/dokumentumok/page.tsx",
      "src/app/portal/documents/[publicationId]/page.tsx",
    ]) {
      assert.equal(exists(relative), true, `${relative} must remain`);
    }
  });
});
