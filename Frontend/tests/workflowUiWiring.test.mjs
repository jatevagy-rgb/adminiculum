import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (rel) => readFileSync(path.resolve(process.cwd(), rel), "utf8");
const rx = (t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

test("intake form threads workflow template + assignees into the payload", () => {
  const hook = read("src/components/cases/intake/useCaseIntakeForm.ts");
  assert.match(hook, /workflowTemplateKey: string/);
  assert.match(hook, /workflowAssignees: Record<string, string>/);
  assert.match(hook, /setWorkflowTemplate/);
  assert.match(hook, /setWorkflowAssignee/);
  assert.match(hook, /payload\.workflowTemplateKey = state\.workflowTemplateKey/);
  // A post-create hook enables staged initial-document upload without dup-creating.
  assert.match(hook, /onAfterCreate\?/);
  assert.match(hook, /const complete = onAfterCreate \? await onAfterCreate\(result\) : true/);
});

test("New Case dialog renders a Munkafolyamat selector with per-step assignees + predecessor explanation", () => {
  const sections = read("src/components/cases/intake/CaseIntakeSections.tsx");
  assert.match(sections, /export function CaseWorkflowSection/);
  assert.match(sections, rx("Sablon kiválasztása"));
  assert.match(sections, rx("Nincs sablon / egyszerű ügy"));
  assert.match(sections, rx("Ez a lépés akkor induljon, ha elkészült:"));
  assert.match(sections, rx("Ügyfél-mérföldkő jelölt"));
  const dialog = read("src/components/cases/intake/CaseIntakeDialog.tsx");
  assert.match(dialog, /<CaseWorkflowSection/);
  assert.match(dialog, /getWorkflowTemplates\(\)/);
  assert.match(dialog, rx("Munkafolyamat"));
});

test("New Case dialog stages initial documents and uploads them after the case exists", () => {
  const sections = read("src/components/cases/intake/CaseIntakeSections.tsx");
  assert.match(sections, /export function CaseInitialDocumentsSection/);
  assert.match(sections, rx("Fájlok kiválasztása"));
  const dialog = read("src/components/cases/intake/CaseIntakeDialog.tsx");
  assert.match(dialog, /<CaseInitialDocumentsSection/);
  assert.match(dialog, rx("Induló dokumentumok"));
  // Uploads go through the canonical document service, after the case is created.
  assert.match(dialog, /uploadCaseDocument\(\{ caseId/);
  assert.match(dialog, /onAfterCreate/);
  // Partial failure keeps the dialog open with retry (no false success).
  assert.match(dialog, rx("nem sikerült"));
  assert.match(dialog, /retryFailedUploads/);
});

test("case overview renders BLOCKED workflow tasks as Várakozik with predecessor progress", () => {
  const overview = read("src/components/cases/CaseWorkspaceOverview.tsx");
  assert.match(overview, rx("Várakozik"));
  assert.match(overview, /blockedPredecessors/);
  assert.match(overview, rx("előfeltételből"));
  // The workspace task type carries the blocked-predecessor summary.
  const api = read("src/lib/api.ts");
  assert.match(api, /blockedPredecessors: \{ total: number; done: number \} \| null/);
});

test("Beállítások → Munkafolyamatok admin page + link exist with CRUD/version/activate", () => {
  const settings = read("src/app/settings/page.tsx");
  assert.match(settings, /\/settings\/workflows/);
  assert.match(settings, rx("Munkafolyamatok"));
  const page = read("src/app/settings/workflows/page.tsx");
  for (const fn of ["listWorkflowTemplatesAdmin", "createWorkflowTemplate", "createWorkflowTemplateVersion", "activateWorkflowTemplate", "archiveWorkflowTemplate", "duplicateWorkflowTemplate"]) {
    assert.match(page, new RegExp(fn));
  }
  assert.match(page, rx("Akkor induljon, ha elkészült:"));
  assert.match(page, rx("Új verzió"));
});

test("api client exposes workflow template selection + admin endpoints", () => {
  const api = read("src/lib/api.ts");
  assert.match(api, /export async function getWorkflowTemplates/);
  assert.match(api, /\/cases\/workflow-templates/);
  assert.match(api, /\/cases\/workflow-templates\/admin/);
});
