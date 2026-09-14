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

test("AIPromptPanel loads canonical templates and preserves the static catalog fallback", () => {
  const source = panel();
  assert.match(source, /listAiPromptTemplates/);
  assert.match(source, /Kanonikus jogi promptok/);
  assert.match(source, /LEGAL_PROMPT_CATALOG/);
  assert.match(source, /Egyedi prompt-sablonok/);
});

test("AIPromptPreparationModal wires reject, history, and Hungarian status labels", () => {
  const source = modal();
  assert.match(source, /rejectAiPromptDraft/);
  assert.match(source, /listAiPromptDraftsForCase/);
  assert.match(source, /STATUS_LABELS/);
  assert.match(source, /"Előkészítve"/);
  assert.match(source, /"Jóváhagyva"/);
  assert.match(source, /"Elutasítva"/);
  assert.match(source, /Elutasítás/);
  assert.match(source, /Korábbi prompt-tervezetek/);
});

test("AIPromptPanel remains provider-neutral with truthful copy failure feedback", () => {
  const source = panel();
  assert.match(source, /Nem sikerült a vágólapra másolni/);
  assert.doesNotMatch(source, /ChatGPT/);
  assert.doesNotMatch(source, /Claude/);
  assert.doesNotMatch(source, /Gemini/);
});
