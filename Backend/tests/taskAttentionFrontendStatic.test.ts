import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('task attention frontend static contract', () => {
  const tasksPage = read('Frontend/src/app/tasks/page.tsx');
  const dashboard = read('Frontend/src/components/Dashboard.tsx');
  const api = read('Frontend/src/lib/api.ts');

  it('wires the task create/edit UI to exact attention fields', () => {
    expect(tasksPage).toContain('Figyelmi kategória');
    expect(tasksPage).toContain('Becsült idő');
    expect(tasksPage).toContain('Automatikus becslés használata');
    expect(tasksPage).toContain('updateTaskAttention(task.id');
    expect(api).toContain('attentionCategory?: AttentionCategory | null');
    expect(api).toContain('estimatedMinutes?: number | null');
  });

  it('adds category and unclassified filters without replacing existing filters', () => {
    expect(tasksPage).toContain('aria-label="Figyelmi kategória szűrő"');
    expect(tasksPage).toContain('"UNCLASSIFIED"');
    expect(tasksPage).toContain('quickFilters.map');
    expect(tasksPage).toContain('Prioritás szűrő');
    expect(tasksPage).toContain('Feladatállapot szűrő');
  });

  it('renders a server-authoritative dashboard workload block with all categories', () => {
    expect(dashboard).toContain('getDashboardOperationalOverview().catch(() => null)');
    expect(dashboard).toContain('Milyen munkák várnak rám?');
    expect(dashboard).toContain('workload.categories.map');
    expect(dashboard).toContain('tasks?attentionCategory=');
    expect(dashboard).toContain('A munkaterhelési adatok most nem érhetők el.');
    expect(dashboard).toContain('Nincs besorolt, Önre váró feladat.');
    expect(dashboard).toContain('KpiCard label="Nyitott ügyek"');
    expect(dashboard).toContain('KpiCard label="Mai teendők"');
    expect(dashboard).toContain('adm-action-row');
  });
});
