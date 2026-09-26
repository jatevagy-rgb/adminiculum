import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

// Focused coverage for Case Workspace — Kontextus V1.
//
// The surface is built ONLY from the existing canonical case workspace DTO
// (startingContext, description, linked communications). It must not add a new
// context model, free-text persistence, custom anonymization, fake email-thread
// grouping, or any backend/schema/migration change.

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
const exists = (file: string) => existsSync(path.resolve(process.cwd(), file));

const nav = () => read("src/components/cases/CaseWorkspaceNav.tsx");
const contextView = () => read("src/components/cases/CaseContextView.tsx");
const contextPage = () => read("src/app/cases/[caseId]/context/page.tsx");
const overview = () => read("src/components/cases/CaseWorkspaceOverview.tsx");
const caseDetail = () => read("src/components/CaseDetail.tsx");

describe("Case Workspace — Kontextus V1", () => {
  it("1. Kontextus navigation opens the actual V1 context surface", () => {
    assert.match(nav(), /label: "Kontextus"/);
    assert.match(nav(), /href: `\/cases\/\$\{caseId\}\/context`/);
    assert.ok(exists("src/app/cases/[caseId]/context/page.tsx"), "the /context route exists");
    assert.match(contextPage(), /<CaseContextView caseId=\{canonicalCaseId\}/);
    assert.match(contextPage(), /activeTab="context"/);
    assert.match(contextView(), /data-testid="case-context-view"/);
  });

  it("2. originReason renders when present", () => {
    assert.match(contextView(), /key: "originReason", label: "Az ügy indoka"/);
  });

  it("3. currentSituation renders when present", () => {
    assert.match(contextView(), /key: "currentSituation", label: "Jelenlegi helyzet"/);
  });

  it("4. clientExpectation renders when present", () => {
    assert.match(contextView(), /key: "clientExpectation", label: "Ügyfél elvárása"/);
  });

  it("5. urgentAction renders when present", () => {
    assert.match(contextView(), /key: "urgentAction", label: "Sürgős teendő"/);
  });

  it("6. nextStep renders when present", () => {
    assert.match(contextView(), /key: "nextStep", label: "Következő lépés"/);
  });

  it("7. description renders truthfully when present", () => {
    assert.match(contextView(), /workspace\.case\.description/);
    assert.match(contextView(), /data-testid="case-context-description"/);
    assert.match(contextView(), /<AdminSectionHeader title="Ügyleírás"/);
  });

  it("8. empty context produces a truthful empty state (no empty cards)", () => {
    assert.match(contextView(), /contextEntries\.length > 0 \?/);
    assert.match(contextView(), /data-testid="case-context-empty"/);
    assert.match(contextView(), /még nincs rögzített induló helyzet vagy ügyvédi instrukció/);
  });

  it("9. linked communication metadata renders only from existing DTO data", () => {
    const src = contextView();
    assert.match(src, /workspace\.communications \?\? \[\]/);
    assert.match(src, /communication\.subject/);
    assert.match(src, /communication\.sender/);
    assert.match(src, /communication\.timestamp/);
    assert.match(src, /communication\.contentPreview/);
    assert.match(src, /data-testid="case-context-communications"/);
    // No new communication fetch/endpoint is invented; the workspace DTO is reused.
    assert.match(src, /getCaseWorkspace\(caseId\)/);
    assert.doesNotMatch(src, /getCommunications|createCommunication|fetch\(/);
  });

  it("10. the communication link leads to the canonical Communications Workspace", () => {
    const src = contextView();
    assert.match(src, /href=\{`\/cases\/\$\{encodeURIComponent\(caseId\)\}\/communications`\}/);
    assert.match(src, /data-testid="case-context-communications-link"/);
    assert.ok(exists("src/app/cases/[caseId]/communications/page.tsx"));
  });

  it("11. no subject-based fake thread grouping exists", () => {
    const src = contextView();
    for (const forbidden of [
      "groupBy",
      "providerConversationId",
      "threadId",
      "normalizeSubject",
      "conversationId",
      "reduce\\(",
    ]) {
      assert.doesNotMatch(src, new RegExp(forbidden), `no fake thread grouping via ${forbidden}`);
    }
    // Communications stay a discrete list — one row per canonical communication.
    assert.match(src, /communications\.map\(\(communication\) =>/);
  });

  it("12. no free-text context persistence was added", () => {
    const src = contextView() + contextPage();
    for (const forbidden of [
      "<textarea",
      "localStorage",
      "sessionStorage",
      "createCommunication",
      "updateCase\\(",
      "contextJson",
      "PATCH",
    ]) {
      assert.doesNotMatch(src, new RegExp(forbidden), `no free-text context persistence via ${forbidden}`);
    }
  });

  it("13. no context anonymizer was added", () => {
    const src = contextView() + contextPage();
    for (const forbidden of ["knownEntities", "customTerms", "replacementMap", "anonymizeContext", "AnonymizeModal", "rehydrat"]) {
      assert.doesNotMatch(src, new RegExp(forbidden), `no context anonymizer via ${forbidden}`);
    }
  });

  it("14. no backend/schema/migration change and no new context model", () => {
    const src = contextView() + contextPage() + nav();
    assert.doesNotMatch(src, /Backend\//);
    assert.doesNotMatch(src, /prisma|migration/i);
    assert.doesNotMatch(src, /fetch\(|XMLHttpRequest/);
    const schema = read("../Backend/prisma/schema.prisma");
    for (const forbidden of ["model CaseContext", "model ContextEntry", "model CaseContextItem"]) {
      assert.doesNotMatch(schema, new RegExp(forbidden));
    }
  });

  it("15. the #384 primary notes surface remains", () => {
    assert.match(overview(), /<CaseWorkspaceNotesSection/);
    assert.match(overview(), /id="ck-notes-primary"/);
  });

  it("16. the #387 green Leadás entry remains", () => {
    const src = overview();
    assert.match(src, /data-testid="task-submission-leadas"/);
    assert.match(src, /<TaskSubmissionWorkspace item=\{selectedLifecycleTask\}/);
  });

  it("17. the #388 Műveletek/nav behavior remains", () => {
    assert.equal(overview().split('aria-label="Műveletek"').length - 1, 1, "exactly one Műveletek surface");
    const navSrc = nav();
    const tabsBlock = navSrc.slice(navSrc.indexOf("const tabs = ["), navSrc.indexOf("const secondaryLinks"));
    assert.match(tabsBlock, /label: "Áttekintés"/);
    assert.match(tabsBlock, /label: "Kontextus"/);
    assert.match(tabsBlock, /label: "Ügyfélportál"/);
    assert.doesNotMatch(tabsBlock, /label: "Kommunikáció"/);
    assert.match(navSrc, /data-testid="case-workspace-secondary-nav"/);
    assert.match(navSrc, /label: "Kommunikáció"/);
    assert.match(navSrc, /\/cases\/\$\{caseId\}\/client-portal/);
    // The Overview remains the default case surface; Kontextus is additive.
    assert.match(caseDetail(), /<CaseWorkspaceOverview caseId=\{canonicalCaseId\} \/>/);
  });
});
