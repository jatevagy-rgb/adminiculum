import fs from 'node:fs';
import path from 'node:path';

const routes = fs.readFileSync(path.join(__dirname, '../src/modules/communications/routes.ts'), 'utf8');

describe('communication operational convergence', () => {
  it('routes legacy task extraction through the canonical source-linked task service', () => {
    const start = routes.indexOf("router.post('/:id/extract-task'");
    const end = routes.indexOf("router.post('/:id/extract-deadline'", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const block = routes.slice(start, end);
    expect(block).toContain('createTaskFromCommunicationSource');
    expect(block).not.toContain('prisma.task.create');
    expect(block).not.toContain('caseId: targetCaseId');
  });

  it('keeps deadline extraction on the communication-owned case', () => {
    const start = routes.indexOf("router.post('/:id/extract-deadline'");
    const end = routes.indexOf("router.post('/:id/add-attachment'", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const block = routes.slice(start, end);
    expect(block).toContain('COMMUNICATION_CASE_MISMATCH');
    expect(block).toContain('canonicalUserCanManageCase');
    expect(block).toContain('const targetCaseId = communication.caseId');
  });
});
