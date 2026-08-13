import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (rel) => readFileSync(path.resolve(process.cwd(), rel), "utf8");
const rx = (text) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

test("workforce milestone panel exposes draft editor, preview, and explicit publish surfaces", () => {
  const panel = read("src/components/documents/publication/MilestonePublicationPanel.tsx");
  for (const text of [
    "Ügyfélbiztos mérföldkövek",
    "Előrehaladás közzététele",
    "Ügyfélbiztos cím (kötelező)",
    "Súly (előrehaladáshoz)",
    "Jelölt munkafolyamat-lépések",
    "Ügyfél DTO előnézet",
    "Ügyfélnek publikált előrehaladás",
    "Mentés és előnézet",
    "Új ügyfélverzió közzététele",
  ]) assert.match(panel, rx(text));
  // Responsive-safe layout classes consistent with the rest of the publication UI.
  assert.match(panel, /min-w-0/);
  assert.match(panel, /xl:grid-cols/);
});

test("publish is gated behind an explicit immutable-revision confirmation", () => {
  const panel = read("src/components/documents/publication/MilestonePublicationPanel.tsx");
  assert.match(panel, /window\.confirm/);
  assert.match(panel, /új, változatlan ügyfélverziót hoz létre/);
  assert.match(panel, /belső munkafolyamat későbbi módosításai ezt nem változtatják meg/);
});

test("milestone weight validation flags non-positive weights and null-weight progress", () => {
  const panel = read("src/components/documents/publication/MilestonePublicationPanel.tsx");
  // A non-positive weight is surfaced as invalid.
  assert.match(panel, /item\.weight <= 0/);
  assert.match(panel, /A súly pozitív szám legyen/);
  // Preview honours a null (unweighted) progress instead of faking a percentage.
  assert.match(panel, /Nincs súlyozott előrehaladás/);
});

test("workforce panel is wired into the case publication panel", () => {
  const panel = read("src/components/documents/publication/ClientPublicationPanel.tsx");
  assert.match(panel, /MilestonePublicationPanel/);
  assert.match(panel, /<MilestonePublicationPanel caseId=\{caseId\}/);
});

test("customer portal renders progress from published milestones only, with humanized states", () => {
  const workspace = read("src/components/client-portal/MatterWorkspace.tsx");
  assert.match(workspace, /Az ügy előrehaladása/);
  assert.match(workspace, /MatterProgressSection/);
  // Humanized, customer-facing state labels — never raw enum values.
  for (const label of ["Kész", "Folyamatban", "Előttünk áll"]) assert.match(workspace, rx(label));
  // Progress bar only renders when a numeric percentage is available (no fake 0%).
  assert.match(workspace, /Number\.isFinite\(progressPercentage\)/);
  // Safe empty state rather than an empty void.
  assert.match(workspace, /Az iroda hamarosan közzéteszi az ügy mérföldköveit/);
});

test("customer milestone DTO carries no internal task, assignee, or dependency fields", () => {
  const api = read("src/lib/clientPortalApi.ts");
  // The customer-facing PortalMilestone type must never expose internal wiring.
  const portalMilestoneType = api.slice(api.indexOf("export type PortalMilestone"), api.indexOf("export async function getPortalDocument"));
  for (const forbidden of ["sourceTaskId", "taskId", "assignee", "dependsOn", "workflowStepKey", "workflowInstanceId", "internalTitle", "internalStatus"]) {
    assert.doesNotMatch(portalMilestoneType, new RegExp(forbidden, "i"));
  }
  // It only carries the safe projection fields.
  for (const field of ["reference", "title", "description", "state", "displayOrder", "weight", "completedAt"]) {
    assert.match(portalMilestoneType, new RegExp(`\\b${field}\\b`));
  }
});

test("publication API separates the internal draft item from the customer milestone", () => {
  const api = read("src/lib/clientPublicationApi.ts");
  const draftType = api.slice(api.indexOf("export interface MilestoneDraftItem"), api.indexOf("export interface CustomerMilestone"));
  // The workforce draft is allowed to reference the internal source task.
  assert.match(draftType, /sourceTaskId/);
  const customerType = api.slice(api.indexOf("export interface CustomerMilestone"), api.indexOf("export interface EligibleMilestoneStep"));
  // The customer projection must not.
  assert.doesNotMatch(customerType, /sourceTaskId/i);
  assert.doesNotMatch(customerType, /taskId/i);
});

test("admin invitation cleanup tooling is wired to revoke and cancel-notification", () => {
  const adminApi = read("src/lib/clientPortalAdminApi.ts");
  assert.match(adminApi, /revokeAdminInvitation/);
  assert.match(adminApi, /cancelAdminInvitationNotification/);
  assert.match(adminApi, /invitations\/\$\{encodeURIComponent\(invitationId\)\}\/revoke/);
  assert.match(adminApi, /invitations\/\$\{encodeURIComponent\(invitationId\)\}\/cancel-notification/);

  const adminPage = read("src/app/client-portal-admin/page.tsx");
  assert.match(adminPage, /Meghívás visszavonása/);
  assert.match(adminPage, /Értesítés leállítása/);
  // Revoking an invitation must not be framed as touching the membership.
  assert.match(adminPage, /a tagságot nem érinti/);
});
