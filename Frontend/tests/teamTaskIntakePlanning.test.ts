import { describe, it, test } from "node:test";
import assert from "node:assert/strict";
import { componentHarness, flatten, textOf, tick } from "./helpers/componentHarness";
import {
  EMPTY_TEAM_TASK_PLAN,
  teamPlanHasErrors,
} from "../src/components/cases/intake/TeamTaskPlanningSection";
import { EMPTY_DUE_SELECTION } from "../src/components/cases/intake/DueDatePresetPicker";

const users = [
  { id: "lawyer-1", name: "dr. Hubay Gyula Máté" },
  { id: "user-a", name: "dr. Trugly Csanád" },
  { id: "user-b", name: "dr. Sommer Anna" },
];

function sectionHarness() {
  return componentHarness("src/components/cases/intake/TeamTaskPlanningSection.tsx", "TeamTaskPlanningSection", {
    "@/components/adminiculum/ui": { AdminButton: (props: any) => ({ type: "AdminButton", props }) },
    "./DueDatePresetPicker": { DueDatePresetPicker: (props: any) => ({ type: "DueDatePresetPicker", props }), EMPTY_DUE_SELECTION },
  });
}

describe("TeamTaskPlanningSection", () => {
  it("presents the responsible lawyer distinctly and never as a plain collaborator", () => {
    const changes: any[] = [];
    const h = sectionHarness();
    let tree = h.render({ users, responsibleLawyerId: "lawyer-1", value: EMPTY_TEAM_TASK_PLAN, onChange: (next: any) => changes.push(next) });
    assert.ok(!flatten(tree).some((n: any) => n.props?.["data-testid"] === "collaborator-lawyer-1"), "lawyer must not be a collaborator checkbox");
    const note = flatten(tree).find((n: any) => n.props?.["data-testid"] === "responsible-lawyer-note");
    assert.ok(note);
    assert.match(textOf(note), /dr\. Hubay Gyula Máté/);
    assert.ok(flatten(tree).some((n: any) => n.props?.["data-testid"] === "collaborator-user-a"));
    assert.ok(flatten(tree).some((n: any) => n.props?.["data-testid"] === "collaborator-user-b"));
  });

  it("adds collaborators and per-person task rows with assignee, priority, due preset and catalogue save", () => {
    const changes: any[] = [];
    let value: any = EMPTY_TEAM_TASK_PLAN;
    const h = sectionHarness();
    const render = () => h.render({ users, responsibleLawyerId: "lawyer-1", value, onChange: (next: any) => changes.push(next) });
    let tree = render();

    // Collaborator toggle.
    flatten(tree).find((n: any) => n.props?.["data-testid"] === "collaborator-user-a").props.onChange({ target: { checked: true } });
    value = changes[changes.length - 1];
    assert.deepEqual([...value.collaboratorUserIds], ["user-a"]);

    // Add a task row.
    tree = render();
    flatten(tree).find((n: any) => typeof n.type === "function" && n.props?.onClick && textOf(n).includes("+ Feladat")).props.onClick();
    value = changes[changes.length - 1];
    assert.equal(value.tasks.length, 1);
    const rowKey = value.tasks[0].key;
    tree = render();

    // Title, then the save-to-catalogue opt-in appears.
    assert.ok(!flatten(tree).some((n: any) => n.props?.["data-testid"] === "planned-task-save-catalogue"));
    flatten(tree).find((n: any) => n.props?.["data-testid"] === "planned-task-title").props.onChange({ target: { value: "Iratok bekérése" } });
    value = changes[changes.length - 1];
    tree = render();
    const saveBox = flatten(tree).find((n: any) => n.props?.["data-testid"] === "planned-task-save-catalogue");
    assert.ok(saveBox, "catalogue save appears once the task has a title");
    saveBox.props.onChange({ target: { checked: true } });
    value = changes[changes.length - 1];
    assert.equal(value.tasks[0].saveToCatalogue, true);

    // Assignee candidates include the responsible lawyer (worker can be the lawyer).
    const assignee = flatten(tree).find((n: any) => n.props?.["data-testid"] === "planned-task-assignee");
    assert.ok(flatten(assignee).some((n: any) => n.type === "option" && n.props.value === "lawyer-1"));
    assignee.props.onChange({ target: { value: "lawyer-1" } });
    value = changes[changes.length - 1];
    assert.equal(value.tasks[0].assignedToId, "lawyer-1");
    assert.equal(value.tasks[0].priority, "MEDIUM");

    // Due preset flows through the picker.
    const picker = flatten(tree).find((n: any) => typeof n.type === "function" && n.props?.idPrefix && n.props?.value);
    assert.ok(picker, "each row carries a due preset picker");
    assert.equal(picker.props.value.resolvedIso, null);
    picker.props.onChange({ presetKey: "2d", customDate: "", customTime: "", resolvedIso: "2030-01-03T10:00:00.000Z" });
    value = changes[changes.length - 1];
    assert.equal(value.tasks[0].due.presetKey, "2d");
    assert.equal(value.tasks[0].due.resolvedIso, "2030-01-03T10:00:00.000Z");

    // Remove the row.
    tree = render();
    flatten(tree).find((n: any) => n.props?.["data-testid"] === "planned-task-remove").props.onClick();
    value = changes[changes.length - 1];
    assert.equal(value.tasks.length, 0);
    assert.equal(value.tasks.find((t: any) => t.key === rowKey), undefined);
  });

  it("teamPlanHasErrors gates only untitled task rows", () => {
    assert.equal(teamPlanHasErrors(EMPTY_TEAM_TASK_PLAN), false);
    assert.equal(teamPlanHasErrors({ collaboratorUserIds: ["user-a"], tasks: [{ key: "t1", title: "  ", assignedToId: "", priority: "MEDIUM", due: { presetKey: null, customDate: "", customTime: "", resolvedIso: null }, saveToCatalogue: false }] }), true);
    assert.equal(teamPlanHasErrors({ collaboratorUserIds: [], tasks: [{ key: "t1", title: "Kutatás", assignedToId: "", priority: "MEDIUM", due: { presetKey: null, customDate: "", customTime: "", resolvedIso: null }, saveToCatalogue: false }] }), false);
  });
});

describe("CompactNewCaseDialog team/task multi-write", () => {
  type Harness = { h: any; cases: any[]; collabCalls: string[][]; taskCalls: any[]; pushes: string[]; failOnce: Set<string>; alwaysFail: Set<string> };

  function dialogHarness(): Harness {
    const pushes: string[] = [];
    const cases: any[] = [];
    const collabCalls: string[][] = [];
    const taskCalls: any[] = [];
    const failOnce = new Set<string>();
    const alwaysFail = new Set<string>();
    const api = {
      getClientList: async () => [{ id: "client-1", name: "Demo Kft." }],
      getCaseCreationOptions: async () => ({
        items: [{
          caseTypeDefinition: { id: "type-1", name: "Munkajog", slug: "type-1" },
          template: { id: "tpl", name: "Sablon", version: 1, items: [{ moduleKey: "required", label: "Kötelező", isOptional: false, order: 0 }] },
        }],
      }),
      getUsers: async () => [],
      getCurrentUser: async () => ({ role: "LAWYER" }),
      listWorkPackageCaseTypes: async () => ({ items: [] }),
      createUsableCaseType: async () => { throw new Error("must not be called"); },
      createCase: async (data: any) => { cases.push(data); return { id: "case-new" }; },
      addCaseCollaborator: async (caseId: string, userId: string) => { collabCalls.push([caseId, userId]); },
      createTask: async (data: any) => {
        if (alwaysFail.has(data.title)) throw new Error("denied");
        if (failOnce.has(data.title)) { failOnce.delete(data.title); throw new Error("denied"); }
        taskCalls.push(data);
        return { id: `task-${taskCalls.length}` };
      },
    };
    const h = componentHarness("src/components/cases/CompactNewCaseDialog.tsx", "CompactNewCaseDialog", {
      "next/navigation": { useRouter: () => ({ push: (path: string) => pushes.push(path) }) },
      "next/link": { default: "a" },
      "./intake/intakeStyles": { intake: {}, ACCENT_BG: {}, ACCENT_TEXT: {} },
      "./intake/TeamTaskPlanningSection": {
        TeamTaskPlanningSection: (props: any) => ({ type: "TeamTaskPlanningSection", props }),
        EMPTY_TEAM_TASK_PLAN,
        teamPlanHasErrors,
      },
      "@/lib/api": api,
      "@/lib/clientOrganizationApi": { clientOrganizationApi: { listPersons: async () => ({ items: [] }) } },
    });
    return { h, cases, collabCalls, taskCalls, pushes, failOnce, alwaysFail };
  }

  const plan = (overrides: any = {}) => ({
    collaboratorUserIds: ["user-a"],
    tasks: [
      { key: "t1", title: "Iratok bekérése", assignedToId: "user-a", priority: "HIGH", due: { presetKey: "2d", customDate: "", customTime: "", resolvedIso: "2030-01-03T10:00:00.000Z" }, saveToCatalogue: true },
      { key: "t2", title: "Kutatás", assignedToId: "", priority: "MEDIUM", due: { presetKey: "5d", customDate: "", customTime: "", resolvedIso: "2030-01-06T10:00:00.000Z" }, saveToCatalogue: false },
    ],
    ...overrides,
  });

  async function settle(h: any, props: any) {
    let tree = h.render(props); h.effects(); await tick();
    tree = h.render(props); h.effects(); tree = h.render(props);
    return tree;
  }

  test("creates the case once, writes collaborators and tasks, and a failed second task retries ONLY itself", async () => {
    const d = dialogHarness();
    const props = { open: true, onClose: () => {}, initialClientId: "client-1", initialTitle: "Ügy" };
    let tree = await settle(d.h, props);
    flatten(tree).find((n: any) => n.props?.id === "new-case-type").props.onChange({ target: { value: "type-1" } });
    tree = d.h.render(props); d.h.effects(); tree = d.h.render(props);
    d.failOnce.add("Kutatás");
    const section = flatten(tree).find((n: any) => typeof n.type === "function" && n.props && Array.isArray(n.props.value?.tasks));
    assert.ok(section, "team/task section is mounted");
    section.props.onChange(plan());
    tree = d.h.render(props); d.h.effects();
    await flatten(tree).find((n: any) => n.type === "form").props.onSubmit({ preventDefault() {} });
    tree = d.h.render(props);

    // Case created exactly once; first task + collaborator succeeded.
    assert.equal(d.cases.length, 1);
    assert.deepEqual(d.collabCalls, [["case-new", "user-a"]]);
    assert.equal(d.taskCalls.length, 1);
    assert.equal(d.taskCalls[0].title, "Iratok bekérése");
    assert.equal(d.taskCalls[0].type, "OTHER");
    assert.equal(d.taskCalls[0].saveToCatalogue, true);
    assert.equal(d.taskCalls[0].taskDefinitionClientId, "client-1");
    assert.equal(d.taskCalls[0].taskTypeLabel, "Iratok bekérése");
    assert.equal(d.taskCalls[0].dueDate, "2030-01-03T10:00:00.000Z");
    assert.equal(d.taskCalls[0].assignedTo, "user-a");
    // Partial failure keeps the dialog open with an honest panel.
    assert.match(textOf(tree), /hozzáadása nem sikerült/);
    assert.deepEqual(d.pushes, []);

    // Retry sends ONLY the failed task — no duplicate case, collaborator or first task.
    await flatten(tree).find((n: any) => n.props?.["data-testid"] === "intake-partial-retry").props.onClick();
    await tick(); await tick();
    assert.equal(d.cases.length, 1);
    assert.equal(d.collabCalls.length, 1);
    assert.equal(d.taskCalls.length, 2);
    assert.equal(d.taskCalls[1].title, "Kutatás");
    assert.deepEqual(d.pushes, ["/cases/case-new"]);
  });

  test("a still-failing retry preserves the plan and never claims nothing was saved", async () => {
    const d = dialogHarness();
    const props = { open: true, onClose: () => {}, initialClientId: "client-1", initialTitle: "Ügy" };
    let tree = await settle(d.h, props);
    flatten(tree).find((n: any) => n.props?.id === "new-case-type").props.onChange({ target: { value: "type-1" } });
    tree = d.h.render(props); d.h.effects(); tree = d.h.render(props);
    d.alwaysFail.add("Kutatás");
    flatten(tree).find((n: any) => typeof n.type === "function" && n.props && Array.isArray(n.props.value?.tasks)).props.onChange(plan());
    tree = d.h.render(props); d.h.effects();
    await flatten(tree).find((n: any) => n.type === "form").props.onSubmit({ preventDefault() {} });
    tree = d.h.render(props);
    assert.equal(d.cases.length, 1, "the successful case is real and kept");
    assert.match(textOf(tree), /hozzáadása nem sikerült/);
    await flatten(tree).find((n: any) => n.props?.["data-testid"] === "intake-partial-retry").props.onClick();
    await tick(); await tick();
    tree = d.h.render(props);
    assert.equal(d.cases.length, 1, "retry never re-creates the case");
    assert.match(textOf(tree), /hozzáadása nem sikerült/);
    assert.deepEqual(d.pushes, []);
    // Input preserved: the section still holds the exact same plan.
    const section = flatten(tree).find((n: any) => typeof n.type === "function" && n.props && Array.isArray(n.props.value?.tasks));
    assert.equal(section.props.value.tasks[1].title, "Kutatás");
  });

  test("an untitled task row blocks creation before any write and surfaces the error", async () => {
    const d = dialogHarness();
    const props = { open: true, onClose: () => {}, initialClientId: "client-1", initialTitle: "Ügy" };
    let tree = await settle(d.h, props);
    flatten(tree).find((n: any) => n.props?.id === "new-case-type").props.onChange({ target: { value: "type-1" } });
    tree = d.h.render(props); d.h.effects(); tree = d.h.render(props);
    flatten(tree).find((n: any) => typeof n.type === "function" && n.props && Array.isArray(n.props.value?.tasks)).props.onChange(plan({
      tasks: [{ key: "t1", title: "", assignedToId: "", priority: "MEDIUM", due: { presetKey: null, customDate: "", customTime: "", resolvedIso: null }, saveToCatalogue: false }],
    }));
    tree = d.h.render(props); d.h.effects();
    await flatten(tree).find((n: any) => n.type === "form").props.onSubmit({ preventDefault() {} });
    tree = d.h.render(props);
    assert.equal(d.cases.length, 0, "no write happens while the plan is invalid");
    const section = flatten(tree).find((n: any) => typeof n.type === "function" && n.props && Array.isArray(n.props.value?.tasks));
    assert.equal(section.props.showErrors, true, "validation errors are surfaced to the section");
  });
});
