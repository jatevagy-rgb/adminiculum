import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (file: string) => {
  const fromCwd = path.resolve(process.cwd(), file);
  if (existsSync(fromCwd)) return readFileSync(fromCwd, "utf8");
  const fromFrontend = path.resolve(process.cwd(), "Frontend", file);
  if (existsSync(fromFrontend)) return readFileSync(fromFrontend, "utf8");
  return readFileSync(path.resolve(__dirname, "..", file), "utf8");
};

const api = () => read("src/lib/api.ts");
const panel = () => read("src/components/documents/AIPromptPanel.tsx");
const modal = () => read("src/components/ai-prompts/AIPromptPreparationModal.tsx");

test("canonical Prompt 2.0 API wrappers include reject, list-drafts, and get-draft", () => {
  const source = api();
  assert.match(source, /export async function rejectAiPromptDraft/);
  assert.match(source, /export async function listAiPromptDraftsForCase/);
  assert.match(source, /export async function getPromptDraft/);
});

test("AIPromptPanel does not build a canonical prompt locally", () => {
  const source = panel();
  assert.doesNotMatch(source, /buildCanonicalPrompt/, "frontend-built canonical prompt must be removed");
  assert.doesNotMatch(source, /buildCanonicalPrompt\(/, "no local canonical prompt builder call");
});

test("AIPromptPanel routes canonical templates into the canonical preparation flow", () => {
  const source = panel();
  assert.match(source, /listAiPromptTemplates/);
  assert.match(source, /AIPromptPreparationModal/);
  assert.match(source, /initialTemplateId/);
  assert.match(source, /openPreparation/);
  assert.match(source, /setPreparationOpen\(true\)/);
  assert.match(source, /Kanonikus jogi promptok/);
});

test("canonical handoff originates from backend draft.externalPromptText, not a frontend string", () => {
  const source = modal();
  assert.match(source, /prepareAiPrompt/);
  assert.match(source, /navigator\.clipboard\.writeText\(draft\.externalPromptText\)/);
  assert.match(source, /draft\.externalPromptText/);
});

test("static legal prompt catalog is preserved and labelled as fallback/advanced", () => {
  const source = panel();
  assert.match(source, /LEGAL_PROMPT_CATALOG/);
  assert.match(source, /Egyedi prompt-sablonok/);
  assert.match(source, /buildLegalPrompt/);
});

test("AIPromptPanel remains provider-neutral with truthful copy failure feedback", () => {
  const source = panel();
  assert.match(source, /Nem sikerült a vágólapra másolni/);
  assert.doesNotMatch(source, /ChatGPT/);
  assert.doesNotMatch(source, /Claude/);
  assert.doesNotMatch(source, /Gemini/);
});
