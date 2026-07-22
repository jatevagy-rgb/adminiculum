import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  __dirname,
  '..',
  'prisma',
  'migrations',
  '20260722135148_add_task_attention_category',
  'migration.sql',
);

describe('task attention production migration', () => {
  it('adds only nullable task attention columns and no index', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    const normalized = sql.replace(/\s+/g, ' ').trim();

    expect(normalized).toBe(
      'ALTER TABLE "tasks" ADD COLUMN "attentionCategory" "ReviewAttentionLevel", ADD COLUMN "estimatedMinutes" INTEGER;',
    );
    expect(sql).not.toMatch(/CREATE\s+INDEX/i);
    expect(sql).not.toMatch(/IF\s+NOT\s+EXISTS/i);
    expect(sql).not.toMatch(/DEFAULT/i);
    expect(sql).not.toMatch(/NOT\s+NULL/i);
    expect(sql).not.toMatch(/CHECK/i);
    expect(sql).not.toMatch(/UPDATE/i);
    expect(sql).not.toMatch(/CREATE\s+TYPE/i);
  });
});
