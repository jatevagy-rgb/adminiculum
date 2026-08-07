import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (rel) => readFileSync(path.resolve(process.cwd(), rel), "utf8");
const rx = (text) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

// Fix A: customer-safe Case progress is a Case concept, not a Document concept.
// The milestone/matter publication surface must be reachable and usable at the
// Case level even with zero documents.

test("ClientPublicationPanel treats the document section as optional", () => {
  const panel = read("src/components/documents/publication/ClientPublicationPanel.tsx");
  // documentId is optional (not a required string prop).
  assert.match(panel, /documentId\?:\s*string/);
  assert.match(panel, /versions\?:\s*VersionOption\[\]/);
  // The exact-version document preview is gated behind documentId.
  assert.match(panel, /\{documentId \? \(/);
  // clientId is derived from the overview when no prop is supplied (Case-level).
  assert.match(panel, /effectiveClientId\s*=\s*clientId\s*\?\?\s*overview\?\.clientId/);
  assert.match(panel, /createClientPortalGrant\(\{ caseId, clientId: effectiveClientId!/);
});

test("a Case-level client-portal route renders the publication panel without a document", () => {
  const page = read("src/app/cases/[caseId]/client-portal/page.tsx");
  assert.match(page, /ClientPublicationPanel/);
  // Rendered with caseId + clientId only — no documentId / versions.
  assert.match(page, /<ClientPublicationPanel/);
  assert.doesNotMatch(page, /documentId=/);
  assert.match(page, rx("Ügyfélportál"));
  assert.match(page, rx("Ügyfélnek publikált ügyállapot és előrehaladás"));
  // Makes the zero-document intent explicit to the workforce user.
  assert.match(page, rx("ide nem szükséges dokumentum a progressz publikálásához"));
});

test("the Case workspace nav exposes an Ügyfélportál tab", () => {
  const nav = read("src/components/cases/CaseWorkspaceNav.tsx");
  assert.match(nav, /"clientPortal"/);
  assert.match(nav, rx("Ügyfélportál"));
  assert.match(nav, /\/cases\/\$\{caseId\}\/client-portal/);
});

test("the milestone panel itself only depends on caseId (Case-level component)", () => {
  const milestone = read("src/components/documents/publication/MilestonePublicationPanel.tsx");
  assert.match(milestone, /export function MilestonePublicationPanel\(\{ caseId \}: \{ caseId: string \}\)/);
});
