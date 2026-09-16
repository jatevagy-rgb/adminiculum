import { test } from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, flatten, textOf, tick } from './helpers/componentHarness';

const flush = async () => {
  await tick();
  await tick();
};

const TEMPLATE = {
  id: 'tpl-1',
  stableKey: 'contract-review',
  version: 1,
  title: 'Szerződés átvilágítás',
  description: 'Kockázati átvilágítás',
  legalWorkCategory: 'CONTRACT_REVIEW',
  caseTypeKeys: [],
  workPackageModuleKeys: [],
  taskTypes: [],
  blocks: [],
  requiredContext: [],
  optionalContext: [],
  outputInstructions: '',
  verificationChecklist: [],
  isActive: true,
};

const DRAFT = {
  id: 'draft-1',
  promptTemplateId: 'tpl-1',
  promptTemplateStableKey: 'contract-review',
  promptTemplateVersion: 1,
  externalPromptText: 'SERVER_CANONICAL_HANDOFF',
  status: 'PREPARED',
  importedResponse: null,
  rehydratedResponse: null,
  rehydrationWarnings: [],
};

test('canonical preparation calls prepareAiPrompt and displays server draft.externalPromptText', async () => {
  const prepareCalls: any[] = [];
  const api = {
    listAiPromptTemplates: async () => ({ items: [TEMPLATE] }),
    getCaseDocuments: async () => [],
    listAiPromptDraftsForCase: async () => ({ items: [] }),
    getPromptDraft: async () => { throw new Error('unused'); },
    prepareAiPrompt: async (caseId: string, body: any) => {
      prepareCalls.push({ caseId, body });
      return DRAFT;
    },
    importAiPromptResponse: async () => { throw new Error('unused'); },
    approveAiPromptDraft: async () => { throw new Error('unused'); },
    verifyAiPromptDraft: async () => { throw new Error('unused'); },
    returnAiPromptDraft: async () => { throw new Error('unused'); },
    rejectAiPromptDraft: async () => { throw new Error('unused'); },
  };
  const h = componentHarness('src/components/ai-prompts/AIPromptPreparationModal.tsx', 'AIPromptPreparationModal', {
    '@/lib/api': api,
    '@/components/adminiculum/ui': { AdminButton: 'button' },
  });
  const props = { caseId: 'case-1', documentId: 'doc-1', initialTemplateId: 'tpl-1', onClose() {} };

  h.render(props);
  h.effects();
  await flush();
  let tree = h.render(props);

  const select = flatten(tree).find((node: any) => node.type === 'select');
  assert.ok(select, 'template select must render');
  assert.equal(select.props.value, 'tpl-1', 'initialTemplateId must be preselected');

  const prepareBtn = flatten(tree).find(
    (node: any) => node.type === 'button' && textOf(node).includes('Anonimizált csomag előkészítése'),
  );
  assert.ok(prepareBtn, 'prepare button must render');
  prepareBtn.props.onClick();
  await flush();
  tree = h.render(props);

  assert.equal(prepareCalls.length, 1);
  assert.equal(prepareCalls[0].caseId, 'case-1');
  assert.equal(prepareCalls[0].body.promptTemplateId, 'tpl-1');

  const pre = flatten(tree).find((node: any) => node.type === 'pre');
  assert.ok(pre, 'canonical handoff preview must render');
  assert.equal(textOf(pre), 'SERVER_CANONICAL_HANDOFF');
});

test('AIPromptPanel canonical card opens the preparation flow without building a prompt locally', async () => {
  const apiCalls: string[] = [];
  const stubModal = () => null;
  const api = {
    listAiPromptTemplates: async () => {
      apiCalls.push('listTemplates');
      return { items: [TEMPLATE] };
    },
  };
  const h = componentHarness('src/components/documents/AIPromptPanel.tsx', 'AIPromptPanel', {
    '@/lib/api': api,
    '@/components/ai-prompts/AIPromptPreparationModal': { AIPromptPreparationModal: stubModal },
    './legalPromptCatalog': { LEGAL_PROMPT_CATALOG: [] },
  });
  const props = { caseId: 'case-1', documentId: 'doc-1' };

  h.render(props);
  h.effects();
  await flush();
  let tree = h.render(props);

  const card = flatten(tree).find(
    (node: any) => node.type === 'button' && textOf(node).includes('Szerződés átvilágítás'),
  );
  assert.ok(card, 'canonical template card must render');
  assert.equal(card.props.disabled, false);

  card.props.onClick();
  tree = h.render(props);

  const modal = flatten(tree).find((node: any) => node.type === stubModal);
  assert.ok(modal, 'preparation modal must open');
  assert.equal(modal.props.caseId, 'case-1');
  assert.equal(modal.props.documentId, 'doc-1');
  assert.equal(modal.props.initialTemplateId, 'tpl-1');

  assert.deepEqual(apiCalls, ['listTemplates']);
});

test('AIPromptPanel canonical card requires case context (disabled without caseId)', async () => {
  const stubModal = () => null;
  const h = componentHarness('src/components/documents/AIPromptPanel.tsx', 'AIPromptPanel', {
    '@/lib/api': { listAiPromptTemplates: async () => ({ items: [TEMPLATE] }) },
    '@/components/ai-prompts/AIPromptPreparationModal': { AIPromptPreparationModal: stubModal },
    './legalPromptCatalog': { LEGAL_PROMPT_CATALOG: [] },
  });
  const props = { documentId: 'doc-1' };

  h.render(props);
  h.effects();
  await flush();
  let tree = h.render(props);

  const card = flatten(tree).find(
    (node: any) => node.type === 'button' && textOf(node).includes('Szerződés átvilágítás'),
  );
  assert.ok(card, 'canonical template card must render');
  assert.equal(card.props.disabled, true, 'canonical card must be disabled without caseId');

  card.props.onClick();
  tree = h.render(props);

  assert.equal(flatten(tree).some((node: any) => node.type === stubModal), false);
});
