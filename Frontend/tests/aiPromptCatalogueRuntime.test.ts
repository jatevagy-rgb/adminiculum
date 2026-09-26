import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { componentHarness, flatten, textOf, tick } from "./helpers/componentHarness";

const flush = async () => {
  await tick();
  await tick();
};

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");

const TEMPLATE = {
  id: "tpl-1",
  stableKey: "contract-review",
  version: 2,
  title: "Szerződés átvilágítás",
  description: "Kockázati átvilágítás ügyvédi review-hoz.",
  legalWorkCategory: "CONTRACT_REVIEW",
  caseTypeKeys: [],
  workPackageModuleKeys: [],
  taskTypes: [],
  blocks: [{ key: "task", label: "Feladat", content: "Vizsgáld meg a szerződést, és jelöld a kockázatokat." }],
  requiredContext: ["selectedDocuments"],
  optionalContext: [],
  outputInstructions: "Adj tagolt, ügyvédi review-ra szánt munkairatot.",
  verificationChecklist: ["Források ellenőrizve", "Nevek visszaállítva"],
  isActive: true,
};

const DOCS = [
  { id: "doc-1", fileName: "elso.docx" },
  { id: "doc-2", fileName: "masodik.docx" },
];

const DRAFT = {
  id: "draft-1",
  promptTemplateId: "tpl-1",
  promptTemplateStableKey: "contract-review",
  promptTemplateVersion: 2,
  externalPromptText: "SERVER_CANONICAL_HANDOFF",
  status: "PREPARED",
  importedResponse: null,
  rehydratedResponse: null,
  rehydrationWarnings: [],
};

function baseApi(overrides: Record<string, any> = {}) {
  return {
    listAiPromptTemplates: async () => ({ items: [TEMPLATE] }),
    getCaseDocuments: async () => DOCS,
    listAiPromptDraftsForCase: async () => ({ items: [] }),
    getPromptDraft: async () => { throw new Error("unused"); },
    prepareAiPrompt: async () => DRAFT,
    importAiPromptResponse: async () => { throw new Error("unused"); },
    approveAiPromptDraft: async () => { throw new Error("unused"); },
    verifyAiPromptDraft: async () => { throw new Error("unused"); },
    returnAiPromptDraft: async () => { throw new Error("unused"); },
    rejectAiPromptDraft: async () => { throw new Error("unused"); },
    ...overrides,
  };
}

function harness(api: Record<string, any>) {
  return componentHarness("src/components/ai-prompts/AIPromptPreparationModal.tsx", "AIPromptPreparationModal", {
    "@/lib/api": api,
    "@/components/adminiculum/ui": { AdminButton: "button" },
  });
}

const nodeById = (tree: any, testId: string) =>
  flatten(tree).find((node: any) => node?.props?.["data-testid"] === testId);

test("prompt selector distinguishes loading from a populated catalogue", async () => {
  const h = harness(baseApi());
  const props = { caseId: "case-1", documentId: "doc-1", onClose() {} };

  const loadingTree = h.render(props);
  const loading = nodeById(loadingTree, "ai-template-loading");
  assert.ok(loading, "loading state must render before templates resolve");
  assert.match(textOf(loading), /Jogi munkapromptok betöltése/);

  h.effects();
  await flush();
  const tree = h.render(props);

  assert.equal(nodeById(tree, "ai-template-loading"), undefined, "loading state must clear");
  const select = flatten(tree).find((node: any) => node.type === "select");
  assert.ok(select, "populated catalogue must render the selector");
  const options = flatten(select).filter((node: any) => node.type === "option");
  assert.ok(options.some((option: any) => textOf(option).includes("Szerződés átvilágítás")), "template must render as an option");
});

test("zero runtime templates render an honest empty state, not an error", async () => {
  const h = harness(baseApi({ listAiPromptTemplates: async () => ({ items: [] }) }));
  const props = { caseId: "case-1", onClose() {} };

  h.render(props);
  h.effects();
  await flush();
  const tree = h.render(props);

  const empty = nodeById(tree, "ai-template-empty");
  assert.ok(empty, "empty catalogue must render an honest empty state");
  assert.match(textOf(empty), /Nincs elérhető jogi munkaprompt/);
  assert.equal(flatten(tree).some((node: any) => node.type === "select"), false, "no selector for an empty catalogue");
  assert.equal(nodeById(tree, "ai-template-error"), undefined, "empty catalogue is not an error");
});

test("template API failure renders an error state, not an empty catalogue", async () => {
  const h = harness(baseApi({ listAiPromptTemplates: async () => { throw new Error("network"); } }));
  const props = { caseId: "case-1", onClose() {} };

  h.render(props);
  h.effects();
  await flush();
  const tree = h.render(props);

  const errorState = nodeById(tree, "ai-template-error");
  assert.ok(errorState, "API failure must render an error state");
  assert.match(textOf(errorState), /nem sikerült/i);
  assert.equal(nodeById(tree, "ai-template-empty"), undefined, "API failure must not be reported as an empty catalogue");
});

test("selected prompt renders a truthful preview from canonical DTO fields", async () => {
  const h = harness(baseApi());
  const props = { caseId: "case-1", documentId: "doc-1", initialTemplateId: "tpl-1", onClose() {} };

  h.render(props);
  h.effects();
  await flush();
  const tree = h.render(props);

  const preview = nodeById(tree, "ai-template-preview");
  assert.ok(preview, "preview must render for the selected template");
  const text = textOf(preview);

  assert.match(text, /Szerződés átvilágítás/);
  assert.match(text, /Kockázati átvilágítás ügyvédi review-hoz\./);
  assert.match(text, /Mire használjuk/);
  assert.match(text, /Vizsgáld meg a szerződést/);
  assert.match(text, /Várt eredmény/);
  assert.match(text, /Adj tagolt, ügyvédi review-ra szánt munkairatot\./);
  assert.match(text, /Ellenőrzési szempontok/);
  assert.match(text, /Források ellenőrizve/);
});

test("preview does not fabricate example output", async () => {
  const h = harness(baseApi());
  const props = { caseId: "case-1", documentId: "doc-1", initialTemplateId: "tpl-1", onClose() {} };

  h.render(props);
  h.effects();
  await flush();
  const tree = h.render(props);
  const text = textOf(nodeById(tree, "ai-template-preview"));

  assert.doesNotMatch(text, /példa\s+kimenet/i);
  assert.doesNotMatch(text, /minta\s+válasz/i);
  assert.doesNotMatch(text, /example/i);
});

test("lawyer instruction and multi-document selection stay wired through prepare", async () => {
  const prepareCalls: Array<{ caseId: string; body: any }> = [];
  const api = baseApi({
    prepareAiPrompt: async (caseId: string, body: any) => {
      prepareCalls.push({ caseId, body });
      return DRAFT;
    },
  });
  const h = harness(api);
  const props = { caseId: "case-1", onClose() {} };

  h.render(props);
  h.effects();
  await flush();
  let tree = h.render(props);

  const checkboxes = flatten(tree).filter((node: any) => node.type === "input" && node.props?.type === "checkbox");
  assert.equal(checkboxes.length, 2, "both case documents must be selectable");
  checkboxes[0].props.onChange();
  checkboxes[1].props.onChange();
  tree = h.render(props);

  const instruction = flatten(tree).find(
    (node: any) => node.type === "textarea" && String(node.props?.placeholder || "").includes("Mit kell az AI-nak"),
  );
  assert.ok(instruction, "lawyer instruction textarea must render");
  assert.match(textOf(flatten(tree).find((node: any) => node.type === "label" && textOf(node).includes("Ügyvédi instrukció")) ?? []), /Ügyvédi instrukció az AI-nak/);
  instruction.props.onChange({ target: { value: "Ellenőrizd a felelősségi pontot." } });
  tree = h.render(props);

  const prepareBtn = flatten(tree).find(
    (node: any) => node.type === "button" && textOf(node).includes("Anonimizált csomag előkészítése"),
  );
  assert.ok(prepareBtn, "prepare button must render");
  assert.equal(prepareBtn.props.disabled, false, "prepare must be enabled for a populated catalogue");
  prepareBtn.props.onClick();
  await flush();

  assert.equal(prepareCalls.length, 1);
  assert.deepEqual([...prepareCalls[0].body.sourceDocumentIds].sort(), ["doc-1", "doc-2"]);
  assert.equal(prepareCalls[0].body.lawyerInstruction, "Ellenőrizd a felelősségi pontot.");
});

test("no static catalogue fallback is added to the selector", () => {
  const source = read("src/components/ai-prompts/AIPromptPreparationModal.tsx");
  assert.doesNotMatch(source, /legalPromptCatalog/);
  assert.doesNotMatch(source, /LEGAL_PROMPT_CATALOG/);
  assert.doesNotMatch(source, /buildLegalPrompt/);
  assert.match(source, /listAiPromptTemplates/);
});

test("every static catalogue template is covered by deterministic backend provisioning", () => {
  const catalogSource = read("src/components/documents/legalPromptCatalog.ts");
  const provisioningSource = readFileSync(
    path.resolve(process.cwd(), "..", "Backend", "src", "modules", "ai-prompts", "provisioning.ts"),
    "utf8",
  );

  const catalogIds = [...catalogSource.matchAll(/^\s{4}id: "([^"]+)",/gm)].map((match) => match[1]);
  const seedKeys = [...provisioningSource.matchAll(/^\s{4}stableKey: "([^"]+)",/gm)].map((match) => match[1]);

  assert.ok(catalogIds.length > 0, "static catalogue must contain templates");
  assert.equal(seedKeys.length, catalogIds.length, "static template count must equal provisioned seed count");
  assert.deepEqual([...seedKeys].sort(), [...catalogIds].sort(), "provisioning must cover every safe static template exactly once");
});
