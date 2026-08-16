import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("publication panel is a dedicated internal mode, not review metadata", () => {
  const page = readFileSync(path.resolve(process.cwd(), "src/app/cases/[caseId]/documents/page.tsx"), "utf8");
  assert.match(page, /ClientPublicationPanel/);
  assert.match(page, /DocumentReviewWorkflowPanel/);
  assert.ok(page.indexOf("DocumentReviewWorkflowPanel") < page.indexOf("ClientPublicationPanel"));
});

test("publication UI exposes required workflow surfaces and responsive-safe classes", () => {
  const panel = readFileSync(path.resolve(process.cwd(), "src/components/documents/publication/ClientPublicationPanel.tsx"), "utf8");
  for (const text of [
    "Ügyfélkapcsolat",
    "ÜGYFÉLNEK LÁTHATÓ ÁLLAPOT",
    "Ezt látja az ügyfél",
    "Publikus céldátum",
    "Dokumentum megosztása",
    "Ki látja ezt az ügyet?",
    "Audit / közzétételi előzmények",
    "Olvasás nincs bekapcsolva",
    "Ügyfélműveletek várakoznak",
    "NO_ACTIVE_AUDIENCE_GRANT",
    "Frissítés szükséges",
  ]) assert.match(panel, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(panel, /clientSafeCurrentPosition: matterStatus/);
  assert.match(panel, /clientSafeWaitingOn: matterWaitingOn/);
  assert.match(panel, /publicTargetDate: matterTargetDate/);
  for (const oldLabel of ["Client Publication Foundation", "Matter client preview", "Document exact-version preview", "Action request publish", "Safe update publish"]) {
    assert.doesNotMatch(panel, new RegExp(oldLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(panel, /min-w-0/);
  assert.match(panel, /xl:grid-cols/);
  assert.match(panel, /overflow-auto/);
});

test("frontend publication DTOs do not contain internal live DTO fields", () => {
  const api = readFileSync(path.resolve(process.cwd(), "src/lib/clientPublicationApi.ts"), "utf8");
  for (const forbidden of [
    "workInstruction",
    "internalRationale",
    "reviewDecisions",
    "reviewPoints",
    "annotationContent",
    "comparisonSegment",
    "storageReference",
    "spItemId",
    "aiPrompt",
    "aiResponse",
  ]) assert.doesNotMatch(api, new RegExp(forbidden, "i"));
  assert.match(api, /CLIENT_PORTAL_READ_ENABLED|portalReadEnabled/);
  assert.match(api, /CLIENT_PORTAL_ACTIONS_ENABLED|portalActionsEnabled/);
  assert.match(api, /clientSafeCurrentPosition\?: string/);
  assert.match(api, /clientSafeWaitingOn\?: string/);
  assert.match(api, /publicTargetDate\?: string \| null/);
});
