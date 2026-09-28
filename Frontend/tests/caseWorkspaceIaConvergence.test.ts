import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

// Focused coverage for the Case Workspace information-architecture convergence:
// one "Műveletek" action surface, one converged top nav
// (Áttekintés / Kontextus / Ügyfélportál) with Communication demoted to a
// restrained secondary route, and the standalone "+ Határidő" trigger removed
// without touching task due dates, deadline grouping or any backend semantics.

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
const exists = (file: string) => existsSync(path.resolve(process.cwd(), file));

const overview = () => read("src/components/cases/CaseWorkspaceOverview.tsx");
const nav = () => read("src/components/cases/CaseWorkspaceNav.tsx");
const actions = () => read("src/components/cases/CaseWorkspaceActions.tsx");

describe("Case Workspace IA convergence", () => {
  it("1. exposes exactly one primary 'Műveletek' action surface", () => {
    const source = overview();
    assert.equal(source.split('aria-label="Műveletek"').length - 1, 1, "exactly one Műveletek surface");
    assert.match(source, /data-testid="case-workspace-quick-actions"/);

    const heroSlice = source.slice(
      source.indexOf('data-testid="matter-hero"'),
      source.indexOf('data-testid="kpi-row"'),
    );
    assert.doesNotMatch(heroSlice, /setModal\(\{ type: "task-create" \}\)/, "the hero must not carry a competing create action");
    assert.doesNotMatch(heroSlice, /Megjegyzés hozzáadása/, "the hero must not carry a competing note action");

    const actionSlice = source.slice(
      source.indexOf('data-testid="case-workspace-quick-actions"'),
      source.indexOf("Ügy munkatér szakaszai"),
    );
    for (const label of ["Új feladat", "Dokumentum feltöltése", "Megjegyzés hozzáadása", "AI előkészítés", "Munkaidő rögzítése"]) {
      assert.ok(actionSlice.includes(label), `${label} must live on the Műveletek surface`);
    }
  });

  it("2. the redundant 'Gyors műveletek' presentation is gone", () => {
    assert.doesNotMatch(overview(), /Gyors műveletek/);
  });

  it("3. the standalone '+ Határidő' primary trigger is absent", () => {
    const source = overview();
    assert.doesNotMatch(source, /\+ Határidő/);
    assert.doesNotMatch(
      source,
      /action=\{<AdminButton[\s\S]{0,180}deadline-create/,
      "no always-visible section-header deadline trigger",
    );
  });

  it("4. normal task creation remains", () => {
    const source = overview();
    assert.match(source, /setModal\(\{ type: "task-create" \}\)/);
    assert.match(source, /<TaskFormModal caseId=\{caseId\} clientId=\{c\.client\?\.id \?\? null\} mode="create" /);
    assert.match(actions(), /export function TaskFormModal/);
    assert.match(actions(), /await createTask\(/);
  });

  it("5. task due date remains supported and deadline mode is not deleted", () => {
    const src = actions();
    assert.match(src, /const \[dueDate, setDueDate\]/);
    assert.match(src, /htmlFor="cw-task-due"/);
    assert.match(src, /value=\{dueDate\}/);
    assert.match(src, /dueDate: dueDate \|\| undefined/);
    assert.match(src, /deadlineMode\?: boolean/, "the deadlineMode capability stays present");
    assert.match(overview(), /<TaskFormModal[\s\S]{0,160}deadlineMode/, "deadline mode keeps its contextual wiring");
  });

  it("6. the deadline section and grouping remain", () => {
    const source = overview();
    assert.match(source, /title="Határidők"/);
    assert.match(source, /data-testid="deadline-timeline"/);
    assert.match(source, /cp\.deadlineGroups\.today/);
    assert.match(source, /<DeadlineRow/);
    assert.match(source, /Határidő hozzáadása/, "the truthful contextual empty-state action stays");
  });

  it("7. the Communication route remains reachable", () => {
    assert.match(nav(), /\/cases\/\$\{caseId\}\/communications/);
    assert.match(overview(), /\/cases\/\$\{caseId\}\/communications/);
    assert.ok(exists("src/app/cases/[caseId]/communications/page.tsx"));
  });

  it("8. Communication is no longer a co-equal top tab", () => {
    const source = nav();
    const tabsBlock = source.slice(source.indexOf("const tabs = ["), source.indexOf("const secondaryLinks"));
    assert.match(tabsBlock, /label: "Áttekintés"/);
    assert.match(tabsBlock, /label: "Kontextus"/);
    assert.match(tabsBlock, /label: "Ügyfélportál"/);
    assert.doesNotMatch(tabsBlock, /label: "Kommunikáció"/, "Communication must not stay a co-equal top tab");

    const secondaryBlock = source.slice(source.indexOf("const secondaryLinks"), source.indexOf("const visibleDeadline"));
    assert.match(secondaryBlock, /label: "Kommunikáció"/, "Communication is preserved as a secondary destination");
    assert.match(secondaryBlock, /\/cases\/\$\{caseId\}\/communications/);
  });

  it("9. Client Portal remains available", () => {
    assert.match(nav(), /\/cases\/\$\{caseId\}\/client-portal/);
    assert.ok(exists("src/app/cases/[caseId]/client-portal/page.tsx"));
  });

  it("10. the #384 primary notes surface remains visible", () => {
    const source = overview();
    assert.match(source, /<CaseWorkspaceNotesSection/);
    assert.match(source, /id="ck-notes-primary"/);
    assert.ok(
      source.indexOf("<CaseWorkspaceNotesSection") < source.indexOf("<details ref={secondaryDetailsRef}"),
      "primary notes must not be pushed back into the collapsed details area",
    );
    assert.doesNotMatch(source, /Kommunikáció hozzáadása/);
  });

  it("11. the #387 green 'Leadás' entry remains", () => {
    const source = overview();
    assert.match(source, /variant="primary"[\s\S]{0,320}data-testid="task-submission-leadas"[\s\S]{0,40}>\s*Leadás\s*</);
    assert.doesNotMatch(source, /Leadás megnyitása/);
    assert.match(source, /<TaskSubmissionWorkspace item=\{selectedLifecycleTask\}/);
  });

  it("12. direct communication/document routes and deep links are preserved", () => {
    assert.ok(exists("src/app/cases/[caseId]/communications/page.tsx"));
    assert.ok(exists("src/app/cases/[caseId]/documents/page.tsx"));
    assert.match(overview(), /router\.push\(`\/cases\/\$\{caseId\}\/documents\?documentId=\$\{encodeURIComponent\(docId\)\}`\)/);
    for (const anchor of ["ck-starting-context", "ck-work-package", "ck-notes", "ck-activity", "ck-time"]) {
      assert.match(overview(), new RegExp(`'${anchor}'`), `${anchor} deep link must remain`);
    }
  });

  it("13. introduces no backend, schema or migration change", () => {
    for (const source of [overview(), nav()]) {
      assert.doesNotMatch(source, /Backend\/|prisma|migration/i);
      assert.doesNotMatch(source, /fetch\(|XMLHttpRequest/);
    }
  });
});
