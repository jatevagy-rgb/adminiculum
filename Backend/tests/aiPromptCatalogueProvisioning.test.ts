jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    aiPromptTemplateVersion: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    aiPromptDraft: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    case: { findUnique: jest.fn() },
    task: { findUnique: jest.fn() },
    caseWorkPackageItem: { findUnique: jest.fn() },
    document: { findMany: jest.fn() },
    documentVersion: { findUnique: jest.fn() },
  },
  default: {},
}));

jest.mock('../src/modules/cases/authorization', () => ({
  userCanManageCase: jest.fn().mockResolvedValue(true),
  userCanReadCase: jest.fn().mockResolvedValue(true),
}));

import {
  CANONICAL_AI_PROMPT_TEMPLATE_SEEDS,
  CATEGORY_TO_LEGAL_WORK,
  SYSTEM_AI_PROMPT_PROVISIONING_ACTOR_ID,
  provisionCanonicalAiPromptTemplates,
} from '../src/modules/ai-prompts/provisioning';
import { LEGAL_WORK_CATEGORIES } from '../src/modules/ai-prompts/service';

type Row = Record<string, any>;

function createFakeDb(initial: Row[] = []) {
  const rows: Row[] = [...initial];
  const db = {
    rows,
    aiPromptTemplateVersion: {
      findFirst: jest.fn(async (args: any) => {
        const stableKey = args?.where?.stableKey;
        return rows.find((row) => row.stableKey === stableKey) ?? null;
      }),
      create: jest.fn(async (args: any) => {
        const row = { id: `template-${rows.length + 1}`, ...args.data };
        rows.push(row);
        return row;
      }),
    },
  };
  return db;
}

const SEED_COUNT = CANONICAL_AI_PROMPT_TEMPLATE_SEEDS.length;

describe('canonical AI prompt catalogue runtime provisioning', () => {
  it('maps the whole catalogue without semantic guessing or schema gaps', () => {
    expect(SEED_COUNT).toBeGreaterThan(0);

    const stableKeys = CANONICAL_AI_PROMPT_TEMPLATE_SEEDS.map((seed) => seed.stableKey);
    expect(new Set(stableKeys).size).toBe(stableKeys.length);

    // The seed shape must be a subset of the existing AiPromptTemplateVersion
    // fields this provisioning writes (SCHEMA_CHANGED=NO — no new field needed).
    const allowedSeedFields = new Set([
      'stableKey',
      'title',
      'description',
      'sourceCategory',
      'legalWorkCategory',
      'requiresDocumentText',
      'body',
    ]);

    for (const seed of CANONICAL_AI_PROMPT_TEMPLATE_SEEDS) {
      for (const field of Object.keys(seed)) {
        expect(allowedSeedFields.has(field)).toBe(true);
      }
      expect(seed.stableKey.trim().length).toBeGreaterThan(0);
      expect(seed.title.trim().length).toBeGreaterThan(0);
      expect(seed.body.trim().length).toBeGreaterThan(0);
      expect(LEGAL_WORK_CATEGORIES).toContain(seed.legalWorkCategory);
      expect(CATEGORY_TO_LEGAL_WORK[seed.sourceCategory]).toBe(seed.legalWorkCategory);
    }
  });

  it('provisions every safe catalogue template as an active runtime template', async () => {
    const db = createFakeDb();
    const result = await provisionCanonicalAiPromptTemplates(db as any);

    expect(result).toEqual({ total: SEED_COUNT, created: SEED_COUNT, skipped: 0 });
    expect(db.rows).toHaveLength(SEED_COUNT);

    for (const row of db.rows) {
      expect(row.isActive).toBe(true);
      expect(row.version).toBe(1);
      expect(row.createdById).toBe(SYSTEM_AI_PROMPT_PROVISIONING_ACTOR_ID);
      expect(Array.isArray(row.blocks)).toBe(true);
      expect(row.blocks[0]).toEqual(expect.objectContaining({
        key: 'task',
        label: 'Feladat',
        content: expect.any(String),
      }));
      expect(row.blocks[0].content.trim().length).toBeGreaterThan(0);
      expect(row.outputInstructions.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(row.verificationChecklist)).toBe(true);
      expect(row.verificationChecklist.length).toBeGreaterThan(0);
      expect(Array.isArray(row.requiredContext)).toBe(true);
    }
  });

  it('is idempotent: a rerun creates no duplicates', async () => {
    const db = createFakeDb();

    const first = await provisionCanonicalAiPromptTemplates(db as any);
    const second = await provisionCanonicalAiPromptTemplates(db as any);

    expect(first.created).toBe(SEED_COUNT);
    expect(second).toEqual({ total: SEED_COUNT, created: 0, skipped: SEED_COUNT });
    expect(db.rows).toHaveLength(SEED_COUNT);
    expect(new Set(db.rows.map((row) => row.stableKey)).size).toBe(SEED_COUNT);
  });

  it('preserves existing runtime-authored templates without overwriting them', async () => {
    const runtimeAuthored: Row = {
      id: 'runtime-authored',
      stableKey: 'fullLegalAnalysis',
      version: 3,
      title: 'Runtime szerkesztett cím',
      description: 'runtime authored',
      legalWorkCategory: 'CONTRACT_REVIEW',
      blocks: [{ key: 'task', label: 'Feladat', content: 'runtime body' }],
      outputInstructions: 'runtime output',
      verificationChecklist: ['runtime check'],
      isActive: true,
    };
    const db = createFakeDb([runtimeAuthored]);

    const result = await provisionCanonicalAiPromptTemplates(db as any);

    expect(result.created).toBe(SEED_COUNT - 1);
    expect(result.skipped).toBe(1);
    expect(db.rows.filter((row) => row.stableKey === 'fullLegalAnalysis')).toHaveLength(1);
    expect(db.rows.find((row) => row.id === 'runtime-authored')).toEqual(runtimeAuthored);
  });

  it('tolerates a concurrent provisioning race without failing the batch', async () => {
    const db = createFakeDb();
    const originalCreate = db.aiPromptTemplateVersion.create;
    let thrown = false;
    db.aiPromptTemplateVersion.create = jest.fn(async (args: any) => {
      if (!thrown) {
        thrown = true;
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }
      return originalCreate(args);
    });

    const result = await provisionCanonicalAiPromptTemplates(db as any);

    expect(result.total).toBe(SEED_COUNT);
    expect(result.created).toBe(SEED_COUNT - 1);
    expect(result.skipped).toBe(1);
    expect(db.rows).toHaveLength(SEED_COUNT - 1);
  });

  it('does not reactivate or duplicate a runtime-deactivated template', async () => {
    const runtimeInactive: Row = {
      id: 'runtime-inactive',
      stableKey: 'riskMatrix',
      version: 2,
      title: 'Runtime inaktív',
      isActive: false,
    };
    const db = createFakeDb([runtimeInactive]);

    await provisionCanonicalAiPromptTemplates(db as any);

    expect(db.rows.filter((row) => row.stableKey === 'riskMatrix')).toHaveLength(1);
    expect(db.rows.find((row) => row.id === 'runtime-inactive')!.isActive).toBe(false);
  });
});
