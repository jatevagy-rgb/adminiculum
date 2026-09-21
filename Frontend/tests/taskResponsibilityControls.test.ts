/**
 * Post-create task responsibility controls (assignee / planned reviewer /
 * collaborators).
 *
 * Two layers:
 *  1. Behavioural unit coverage of the pure capability/candidate helpers that
 *     decide what the UI is allowed to offer.
 *  2. Source contract coverage that the panel performs mutations through the
 *     existing canonical wrappers and renders nothing when the canonical
 *     capability forbids the action.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  TASK_ROLE_MANAGER_ROLES,
  canManageTaskRoles,
  canReassignTask,
  candidateLabel,
  collaboratorCandidates,
  plannedReviewerCandidates,
  reassignCandidates,
  splitCandidateGroups,
} from "../src/lib/taskResponsibility";

const read = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

const PANEL = "src/components/tasks/TaskResponsibilityPanel.tsx";
const DRAWER = "src/components/tasks/TaskSubmissionWorkspace.tsx";
const LIFECYCLE_API = "src/lib/taskLifecycleApi.ts";
const PRESENTATION = "src/lib/taskWorkflowPresentation.ts";

describe("task responsibility capability gate", () => {
  it("allows exactly the internal roles the task-role endpoints accept", () => {
    assert.deepEqual([...TASK_ROLE_MANAGER_ROLES], ["ADMIN", "PARTNER", "LAWYER", "COLLAB_LAWYER"]);
    for (const role of ["ADMIN", "PARTNER", "LAWYER", "COLLAB_LAWYER", "admin", "collab_lawyer"]) {
      assert.equal(canManageTaskRoles(role), true, `${role} should manage task roles`);
    }
    for (const role of ["TRAINEE", "LEGAL_ASSISTANT", "CLIENT", "", null, undefined]) {
      assert.equal(canManageTaskRoles(role as string | null | undefined), false, `${String(role)} must not manage task roles`);
    }
  });

  it("offers reassignment only when the canonical case projection grants canAssignWork", () => {
    assert.equal(canReassignTask({ canAssignWork: true }), true);
    assert.equal(canReassignTask({ canAssignWork: false }), false);
    assert.equal(canReassignTask({}), false);
    assert.equal(canReassignTask(null), false);
    assert.equal(canReassignTask(undefined), false);
  });
});

describe("task responsibility candidate filtering", () => {
  const candidates = [
    { id: "u1", name: "Anna", role: "LAWYER" },
    { id: "u2", name: "Béla", role: "TRAINEE" },
    { id: "u3", name: "Anna", role: "ADMIN", email: "anna.admin@firm.hu" },
    { id: "u4", name: "Cili", role: "PARTNER" },
  ];

  it("never offers the current assignee as a reassignment target", () => {
    assert.deepEqual(reassignCandidates(candidates, "u2").map((c) => c.id), ["u1", "u3", "u4"]);
    assert.deepEqual(reassignCandidates(candidates, null).map((c) => c.id), ["u1", "u2", "u3", "u4"]);
  });

  it("never offers the task worker as planned reviewer", () => {
    assert.deepEqual(plannedReviewerCandidates(candidates, "u4").map((c) => c.id), ["u1", "u2", "u3"]);
  });

  it("never offers the worker, the planned reviewer or an existing collaborator", () => {
    const options = collaboratorCandidates(candidates, {
      assigneeId: "u2",
      plannedReviewerId: "u4",
      existingUserIds: ["u1"],
    });
    assert.deepEqual(options.map((c) => c.id), ["u3"]);
  });

  it("keeps privileged firm roles as an explicit secondary group", () => {
    const groups = splitCandidateGroups(candidates);
    assert.deepEqual(groups.primary.map((c) => c.id), ["u1", "u2"]);
    assert.deepEqual(groups.privileged.map((c) => c.id), ["u3", "u4"]);
  });

  it("disambiguates duplicate display names with the email address", () => {
    assert.equal(candidateLabel(candidates[0], candidates), "Anna");
    assert.equal(candidateLabel(candidates[2], candidates), "Anna · anna.admin@firm.hu");
  });
});

describe("task responsibility panel rendering contract", () => {
  it("renders nothing unless a canonical capability allows an action", () => {
    const panel = read(PANEL);
    assert.match(panel, /const manageRoles = canManageTaskRoles\(role\);/);
    assert.match(panel, /if \(isLoading\) return null;/);
    assert.match(panel, /if \(!manageRoles && !reassignAllowed\) return null;/);
    assert.match(panel, /data-testid="task-responsibility-panel"/);
    assert.match(panel, /data-manage-roles=\{manageRoles \? "true" : "false"\}/);
    assert.match(panel, /data-reassign-allowed=\{reassignAllowed \? "true" : "false"\}/);
  });

  it("never calls the role-management endpoints when the role gate forbids it", () => {
    const panel = read(PANEL);
    assert.match(
      panel,
      /canManageTaskRoles\(meRole\)\s*\?\s*taskPlanningApi\.listCollaborators\(taskId\)\s*:\s*Promise\.resolve\(\{ items: \[\] as TaskCollaboratorDTO\[\] \}\)/,
    );
    assert.match(panel, /\{manageRoles \? \(/);
  });

  it("uses the authoritative case-scoped candidate projection and no ad-hoc user lookup", () => {
    const panel = read(PANEL);
    assert.match(panel, /getCaseResponsibleCandidates\(caseId\)/);
    assert.doesNotMatch(panel, /getUsers\(\)/);
  });

  it("disables the reassignment action without a chosen target and without the capability", () => {
    const panel = read(PANEL);
    assert.match(panel, /const reassignAllowed = canReassignTask\(capabilities\);/);
    assert.match(panel, /disabled=\{!reassignTo \|\| busyAction !== null\}/);
    assert.match(panel, /A feladat átadásához nincs jogosultsága ennél az ügynél\./);
  });

  it("clears the planned reviewer when the empty option is saved", () => {
    const panel = read(PANEL);
    assert.match(panel, /const next = reviewerSelection \|\| null;/);
    assert.match(panel, /taskPlanningApi\.setPlannedReviewer\(taskId, next\)/);
    assert.match(panel, /Nincs tervezett reviewer/);
  });

  it("disables the collaborator add action without a chosen coworker", () => {
    const panel = read(PANEL);
    assert.match(panel, /disabled=\{!collaboratorPick \|\| busyAction !== null\}/);
    assert.match(panel, /Nincs közreműködő\./);
  });
});

describe("task responsibility mutations use canonical wrappers only", () => {
  it("reassigns through POST /tasks/:id/reassign", () => {
    const panel = read(PANEL);
    assert.match(panel, /reassignTask\(taskId, target\)/);
  });

  it("reads, adds and removes collaborators through the canonical task-role API", () => {
    const panel = read(PANEL);
    assert.match(panel, /taskPlanningApi\.listCollaborators\(taskId\)/);
    assert.match(panel, /taskPlanningApi\.addCollaborator\(taskId, target\)/);
    assert.match(panel, /taskPlanningApi\.removeCollaborator\(taskId, userId\)/);
    assert.match(panel, /taskPlanningApi\.setPlannedReviewer\(taskId, next\)/);
  });

  it("does not touch lifecycle start/submit/complete/review", () => {
    const panel = read(PANEL);
    assert.doesNotMatch(panel, /startTask|submitTask|completeTask|blockTask|unblockTask/);
    assert.doesNotMatch(panel, /submissions/);
  });

  it("surfaces failures through the shared workflow error mapper", () => {
    const panel = read(PANEL);
    assert.match(panel, /taskWorkflowErrorMessage\(mutationError\)/);
    assert.match(panel, /role="alert"/);
  });
});

describe("workforce task detail integration", () => {
  it("the task detail drawer renders the responsibility panel additively", () => {
    const drawer = read(DRAWER);
    assert.match(drawer, /import \{ TaskResponsibilityPanel \} from "@\/components\/tasks\/TaskResponsibilityPanel";/);
    assert.match(drawer, /<TaskResponsibilityPanel/);
    assert.match(drawer, /taskId=\{item\.id\}/);
    assert.match(drawer, /caseId=\{item\.case\.id\}/);
    assert.match(drawer, /plannedReviewerId=\{item\.plannedReviewerId \?\? null\}/);
    assert.match(drawer, /onChanged=\{onWorkflowChanged\}/);
    // The existing submission lifecycle contract must remain intact.
    assert.match(drawer, /submitTaskSubmissionForReview\(item\.id, draft\.id/);
    assert.match(drawer, /reviseTaskSubmission\(item\.id, returned\.id/);
  });

  it("the lifecycle list type exposes the additive planned reviewer projection", () => {
    const api = read(LIFECYCLE_API);
    assert.match(api, /plannedReviewerId\?: string \| null;/);
    assert.match(api, /plannedReviewer\?: TaskPlanningUser \| null;/);
  });

  it("maps assignment/role backend codes to specific Hungarian messages", () => {
    const src = read(PRESENTATION);
    for (const code of [
      "TASK_ASSIGNMENT_FORBIDDEN",
      "ASSIGNEE_NOT_CASE_MEMBER",
      "ASSIGNEE_NOT_AVAILABLE",
      "TASK_ROLE_CASE_ACCESS_REQUIRED",
      "COLLABORATOR_IS_REVIEWER",
    ]) {
      assert.match(src, new RegExp(code));
    }
  });
});
