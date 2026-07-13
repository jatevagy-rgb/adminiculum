import fs from 'fs';
import path from 'path';

/**
 * Static-safety guards for WORKFLOW-CORE-INTAKE-MATTER-OPENING-1.
 *
 * These scan the intake/matter-opening source files for forbidden patterns so
 * the intake surface cannot silently acquire an AI dependency, n8n coupling,
 * Client Portal coupling, raw-content exposure, automatic conflict decisions,
 * client merging, automatic activation, or unbounded queries.
 */

const SRC = path.join(__dirname, '..', 'src');
const FILES = [
  path.join('modules', 'cases', 'intakeReadiness.ts'),
  path.join('modules', 'cases', 'intakeService.ts'),
  path.join('modules', 'intake', 'routes.ts'),
  path.join('modules', 'clients', 'routes.ts'),
];

function read(file: string): string {
  return fs.readFileSync(path.join(SRC, file), 'utf8');
}

function readLower(file: string): string {
  return read(file).toLowerCase();
}

describe('intake/matter-opening static safety', () => {
  it('imports no AI SDK / provider and no external CRM/identity/screening service', () => {
    for (const file of FILES) {
      const lower = readLower(file);
      for (const needle of [
        'openai',
        '@anthropic',
        'anthropic-ai',
        'generativeai',
        '@google/genai',
        'langchain',
        'cohere',
        'mistral',
        'ollama',
        'salesforce',
        'hubspot',
        'sanctions',
        'pep-screening',
        'id-verification',
      ]) {
        expect(`${file}:${lower.includes(needle)}`).toBe(`${file}:false`);
      }
    }
  });

  it('introduces no n8n coupling', () => {
    for (const file of FILES) {
      expect(readLower(file).includes('n8n')).toBe(false);
    }
  });

  it('does not import or touch any Client Portal surface', () => {
    for (const file of FILES) {
      const lower = readLower(file);
      expect(lower.includes('client-portal')).toBe(false);
      expect(lower.includes('clientportal')).toBe(false);
    }
  });

  it('never selects or exposes raw document/communication text', () => {
    for (const file of FILES) {
      const lower = readLower(file);
      expect(lower.includes('workspacetext:')).toBe(false);
      expect(lower.includes('.workspacetext')).toBe(false);
      expect(lower.includes('extractedtext')).toBe(false);
    }
  });

  it('uses explicit select projections and no broad Prisma include in intake sources', () => {
    for (const file of [path.join('modules', 'cases', 'intakeService.ts'), path.join('modules', 'intake', 'routes.ts')]) {
      expect(read(file).includes('include:')).toBe(false);
    }
  });

  it('contains no automatic conflict clearance, client merge, or automatic activation logic', () => {
    for (const file of FILES) {
      const lower = readLower(file);
      for (const needle of ['autoclear', 'autoclearconflict', 'mergeclient', 'clientmerge', 'autoactivate', 'autoassignlawyer']) {
        expect(lower.includes(needle)).toBe(false);
      }
    }
    // Conflict review must be structurally unavailable — no persistence write path.
    const service = read(path.join('modules', 'cases', 'intakeService.ts'));
    expect(service.includes("status: 'UNAVAILABLE'")).toBe(true);
    expect(/conflictReview[\s\S]{0,200}create\(/.test(service)).toBe(false);
  });

  it('keeps the client lookup bounded with a minimum query length', () => {
    const clients = read(path.join('modules', 'clients', 'routes.ts'));
    expect(/LOOKUP_MIN_QUERY_LENGTH = \d+/.test(clients)).toBe(true);
    expect(/LOOKUP_MAX_RESULTS = \d+/.test(clients)).toBe(true);
    expect(/take: LOOKUP_MAX_RESULTS/.test(clients)).toBe(true);
  });

  it('keeps the intake queue bounded', () => {
    const service = read(path.join('modules', 'cases', 'intakeService.ts'));
    expect(/QUEUE_SCAN_LIMIT = \d+/.test(service)).toBe(true);
    expect(/take: QUEUE_SCAN_LIMIT/.test(service)).toBe(true);
  });

  it('does not extract deadlines from free text', () => {
    for (const file of FILES) {
      const lower = readLower(file);
      expect(lower.includes('extractdeadline')).toBe(false);
      expect(lower.includes('parsedeadlinefromtext')).toBe(false);
    }
  });

  it('opening tasks require explicit selection (no automatic creation marker)', () => {
    const service = read(path.join('modules', 'cases', 'intakeService.ts'));
    expect(service.includes('NO_TASKS_SELECTED')).toBe(true);
  });

  it('frontend intake surfaces do not persist intake state locally', () => {
    const frontendRoot = path.join(__dirname, '..', '..', 'Frontend', 'src');
    const intakeTargets = [
      path.join(frontendRoot, 'app', 'intake', 'page.tsx'),
      path.join(frontendRoot, 'components', 'intake', 'CaseIntakeReadinessPanel.tsx'),
    ];
    for (const target of intakeTargets) {
      if (!fs.existsSync(target)) continue;
      const source = fs.readFileSync(target, 'utf8').toLowerCase();
      expect(source.includes('localstorage')).toBe(false);
      expect(source.includes('sessionstorage')).toBe(false);
      expect(source.includes('indexeddb')).toBe(false);
    }
  });
});
