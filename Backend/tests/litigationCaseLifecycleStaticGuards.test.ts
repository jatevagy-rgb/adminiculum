import fs from 'fs';
import path from 'path';

/**
 * Static-safety guards for WORKFLOW-CORE-LITIGATION-CASE-LIFECYCLE-1.
 *
 * These scan the new source files for forbidden patterns so that the litigation
 * / case-lifecycle surface cannot silently acquire an AI dependency, an n8n
 * dependency, a Client Portal coupling, raw-content exposure, a non-persistable
 * status write, an automatic legal conclusion, or an unbounded query.
 */

const SRC = path.join(__dirname, '..', 'src', 'modules', 'cases');
const FILES = ['lifecycle.ts', 'lifecycleService.ts', 'litigationDossier.ts'];

function read(file: string): string {
  return fs.readFileSync(path.join(SRC, file), 'utf8');
}

function readLower(file: string): string {
  return read(file).toLowerCase();
}

describe('litigation/case-lifecycle static safety', () => {
  it('imports no AI SDK / provider', () => {
    for (const file of FILES) {
      const lower = readLower(file);
      for (const needle of ['openai', '@anthropic', 'anthropic-ai', 'generativeai', '@google/genai', 'gemini', 'cohere', 'mistral', 'langchain', 'ollama']) {
        expect(lower.includes(needle)).toBe(false);
      }
    }
  });

  it('introduces no n8n coupling or direct workflow-automation DB access', () => {
    for (const file of FILES) {
      expect(readLower(file).includes('n8n')).toBe(false);
    }
  });

  it('does not import or mutate any Client Portal surface', () => {
    for (const file of FILES) {
      const lower = readLower(file);
      expect(lower.includes('client-portal')).toBe(false);
      expect(lower.includes('clientportal')).toBe(false);
      expect(lower.includes('/portal')).toBe(false);
    }
  });

  it('never selects or exposes raw document/communication text', () => {
    for (const file of FILES) {
      const lower = readLower(file);
      // workspaceText may appear only inside an explanatory comment, never as a field access.
      expect(lower.includes('workspacetext:')).toBe(false);
      expect(lower.includes('.workspacetext')).toBe(false);
      expect(lower.includes('extractedtext')).toBe(false);
      expect(lower.includes('ocroutput')).toBe(false);
      // Communication body/content is never read here.
      expect(lower.includes('communication.content')).toBe(false);
    }
  });

  it('uses explicit select projections and never a broad Prisma include', () => {
    for (const file of FILES) {
      expect(read(file).includes('include:')).toBe(false);
    }
  });

  it('never writes a non-persistable CLOSED status or a non-persistable timeline event', () => {
    for (const file of FILES) {
      const source = read(file);
      // Guard against writing the aspirational-but-unpersistable enum values.
      expect(/status:\s*['"]CLOSED['"]/.test(source)).toBe(false);
      expect(source.includes('CASE_REOPENED')).toBe(false);
      expect(source.includes('CASE_COMPLETED')).toBe(false);
    }
  });

  it('encodes no legal-merits or outcome scoring', () => {
    for (const file of FILES) {
      const lower = readLower(file);
      for (const needle of ['meritscore', 'outcomeprediction', 'outcomescore', 'winprobability', 'successlikelihood', 'legalconclusion']) {
        expect(lower.includes(needle)).toBe(false);
      }
    }
  });

  it('bounds the dossier document query', () => {
    const source = read('litigationDossier.ts');
    expect(/take:\s*MAX_DOCS/.test(source)).toBe(true);
    expect(/const MAX_DOCS = \d+/.test(source)).toBe(true);
  });

  it('does not auto-classify evidence from document text (relation is always UNCLASSIFIED)', () => {
    const source = read('litigationDossier.ts');
    expect(source.includes("relation: 'UNCLASSIFIED'")).toBe(true);
    // No text-based classification helper.
    expect(readLower('litigationDossier.ts').includes('classifyfromtext')).toBe(false);
  });
});
