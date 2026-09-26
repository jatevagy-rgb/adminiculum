import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

(global as any).React = React;
import { CaseWorkspaceNotesSection } from "../src/components/cases/CaseWorkspaceOverview";
import { fmtDateTime } from "../src/components/cases/CaseCockpitPanels";
import type { CaseWorkspace } from "../src/lib/api";

// Focused coverage for PR-3 (case workspace visible notes). The canonical case
// comments already return on the workspace projection; this proves they render
// on a primary Overview surface and that no reply/schema/backend capability was
// fabricated.

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
const overviewSrc = () => read("src/components/cases/CaseWorkspaceOverview.tsx");

type Note = CaseWorkspace["comments"][number];

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    author: { id: "user-1", name: "Kovács Anna" },
    content: "Az ügyfél visszahívása szükséges.",
    status: "OPEN",
    createdAt: "2026-09-20T09:30:00.000Z",
    ...overrides,
  };
}

describe("Case Workspace visible notes", () => {
  it("1. renders a note body, author and created time in a primary notes surface", () => {
    const createdAt = "2026-09-20T09:30:00.000Z";
    const markup = renderToStaticMarkup(
      createElement(CaseWorkspaceNotesSection, { comments: [note({ createdAt })] }),
    );
    assert.match(markup, /data-testid="case-notes-primary"/);
    assert.match(markup, /Az ügyfél visszahívása szükséges\./); // 2. body
    assert.match(markup, /Kovács Anna/); // 3. author
    assert.ok(markup.includes(fmtDateTime(createdAt)), "created time must be rendered"); // 4.
  });

  it("2. hosts the notes section on the primary overview, outside the collapsed secondary details", () => {
    const src = overviewSrc();
    const sectionIdx = src.indexOf("<CaseWorkspaceNotesSection");
    const detailsIdx = src.indexOf("<details ref={secondaryDetailsRef}");
    assert.ok(sectionIdx > -1, "the primary notes section must be rendered");
    assert.ok(detailsIdx > -1, "the secondary details area must remain");
    assert.ok(sectionIdx < detailsIdx, "notes must not live inside the collapsed details area");
    assert.match(src, /comments=\{ws\.comments\}/);
  });

  it("3. a newly created note becomes visible after the canonical refresh", () => {
    const src = overviewSrc();
    assert.match(
      src,
      /<CaseCommentModal caseId=\{caseId\} onClose=\{\(\) => setModal\(null\)\} onSaved=\{\(\) => void refresh\(\)\} \/>/,
    );
    assert.match(src, /onCreateNote=\{\(\) => setModal\(\{ type: "case-comment" \}\)\}/);
    assert.match(src, /comments=\{ws\.comments\}/);
  });

  it("4. empty state is truthful and offers the create action", () => {
    const markup = renderToStaticMarkup(createElement(CaseWorkspaceNotesSection, { comments: [] }));
    assert.match(markup, /Ehhez az ügyhöz még nincs megjegyzés\./);
    assert.match(markup, /Első megjegyzés írása/);
    assert.doesNotMatch(markup, /data-testid="case-notes-primary"/);
  });

  it("5. shows the existing resolve state restrained and fabricates no reply control", () => {
    const openMarkup = renderToStaticMarkup(createElement(CaseWorkspaceNotesSection, { comments: [note()] }));
    assert.doesNotMatch(openMarkup, /Megoldva/);
    const resolvedMarkup = renderToStaticMarkup(
      createElement(CaseWorkspaceNotesSection, { comments: [note({ status: "RESOLVED" })] }),
    );
    assert.match(resolvedMarkup, /data-testid="case-note-resolved"/);
    assert.match(resolvedMarkup, /Megoldva/);

    const src = overviewSrc();
    const start = src.indexOf("export function CaseWorkspaceNotesSection");
    const end = src.indexOf("export interface CaseWorkspaceDocumentsSectionProps");
    assert.ok(start > -1 && end > start);
    const section = src.slice(start, end);
    assert.doesNotMatch(section, /reply|replies|válasz|parentCommentId|thread/i);
    assert.doesNotMatch(section, /getCaseComments|createCaseComment|resolveCaseComment|reopenCaseComment/);
  });

  it("6. existing case-comment API semantics are unchanged", () => {
    const api = read("src/lib/api.ts");
    assert.match(api, /\/cases\/\$\{encodeURIComponent\(caseId\)\}\/comments/);
    assert.match(api, /export async function createCaseComment/);
    assert.match(api, /export async function resolveCaseComment/);
    assert.match(api, /export async function reopenCaseComment/);
    const routes = read("../Backend/src/modules/cases/routes.ts");
    assert.match(routes, /router\.get\('\/:caseId\/comments'/);
    assert.match(routes, /router\.post\('\/:caseId\/comments'/);
    assert.match(routes, /\/:caseId\/comments\/:commentId\/resolve/);
    assert.match(routes, /\/:caseId\/comments\/:commentId\/reopen/);
  });

  it("7. introduces no schema or backend change", () => {
    const schema = read("../Backend/prisma/schema.prisma");
    const modelStart = schema.indexOf("model Comment {");
    assert.ok(modelStart > -1, "the canonical Comment model must exist");
    const commentModel = schema.slice(modelStart, schema.indexOf("\n}", modelStart));
    assert.doesNotMatch(commentModel, /parentCommentId|parentId|threadId|replyTo/);
    assert.doesNotMatch(schema, /parentCommentId|replyToCommentId/);
    const workspace = read("../Backend/src/modules/cases/workspace.ts");
    assert.match(workspace, /where: \{ caseId, documentId: null \}/);
  });

  it("8. keeps document comments isolated from case notes", () => {
    const src = overviewSrc();
    assert.match(src, /comments=\{ws\.comments\}/);
    assert.doesNotMatch(src, /getDocumentComments|listDocumentComments/);
    const workspace = read("../Backend/src/modules/cases/workspace.ts");
    assert.match(workspace, /where: \{ caseId, documentId: null \}/);
  });

  it("9. secondary notes and activity rendering remain available", () => {
    const src = overviewSrc();
    assert.match(src, /title="Jegyzetek"/);
    assert.match(src, /title="Aktivitás"/);
    assert.match(src, /data-testid="activity-feed"/);
    assert.match(src, /<details ref=\{secondaryDetailsRef\}/);
  });

  it("10. corrects the misleading communication label without changing its operation", () => {
    const src = overviewSrc();
    assert.doesNotMatch(src, /Kommunikáció hozzáadása/);
    const labelIdx = src.indexOf("Megjegyzés hozzáadása");
    assert.ok(labelIdx > -1, "the truthful label must exist");
    assert.ok(
      src.slice(Math.max(0, labelIdx - 220), labelIdx).includes('type: "case-comment"'),
      "the relabelled action must still open the case-comment modal",
    );
  });
});
