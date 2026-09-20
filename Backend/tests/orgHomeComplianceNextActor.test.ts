import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  classifyComplianceNextActor,
  hasPortalAnswerableMissingInformation,
  homeComplianceNextAction,
} from '../src/modules/client-workspace/orgHomeService';

const answerable = (questionKey: string | null = 'company_data_processing_purpose') => ({
  label: 'Adatfeldolgozás céljának megadása',
  portalAnswerable: true,
  questionKey,
});
const officeOnly = () => ({ label: 'Ügyvédi pontosítás', portalAnswerable: false, questionKey: null });

const topic = (state: string, missingInformation: unknown[] = [], nextAction: string | null = 'Kanonikus következő lépés.') => ({
  state,
  missingInformation: missingInformation as any[],
  nextAction,
});

describe('Organization home compliance next-actor contract', () => {
  it('treats only portal-answerable items with a resolvable questionKey as customer input', () => {
    expect(hasPortalAnswerableMissingInformation(topic('RESOLVED', [answerable()]))).toBe(true);
    expect(hasPortalAnswerableMissingInformation(topic('RESOLVED', [answerable(null)]))).toBe(false);
    expect(hasPortalAnswerableMissingInformation(topic('RESOLVED', [{ ...answerable(), portalAnswerable: false }]))).toBe(false);
    expect(hasPortalAnswerableMissingInformation(topic('RESOLVED', []))).toBe(false);
  });

  it('makes the customer the next actor when portal-answerable data is outstanding', () => {
    // The exact drift the review found: lawyer review must NOT hide the customer's
    // executable portal input.
    expect(classifyComplianceNextActor(topic('LAWYER_REVIEW_REQUIRED', [answerable()]))).toBe('CUSTOMER_ACTION');
    expect(classifyComplianceNextActor(topic('ACTION_IN_PROGRESS', [answerable()]))).toBe('CUSTOMER_ACTION');
    expect(classifyComplianceNextActor(topic('RESOLVED', [answerable()]))).toBe('CUSTOMER_ACTION');
  });

  it('falls back to the office when no customer input is outstanding', () => {
    expect(classifyComplianceNextActor(topic('LAWYER_REVIEW_REQUIRED', []))).toBe('OFFICE');
    expect(classifyComplianceNextActor(topic('ACTION_IN_PROGRESS', []))).toBe('OFFICE');
    expect(classifyComplianceNextActor(topic('LAWYER_REVIEW_REQUIRED', [officeOnly()]))).toBe('OFFICE');
  });

  it('keeps MORE_INFORMATION_NEEDED and REVIEW_RECOMMENDED as customer actions', () => {
    expect(classifyComplianceNextActor(topic('MORE_INFORMATION_NEEDED', []))).toBe('CUSTOMER_ACTION');
    expect(classifyComplianceNextActor(topic('MORE_INFORMATION_NEEDED', [officeOnly()]))).toBe('CUSTOMER_ACTION');
    expect(classifyComplianceNextActor(topic('REVIEW_RECOMMENDED', []))).toBe('CUSTOMER_ACTION');
  });

  it('maps a resolved topic with no missing information to no action', () => {
    expect(classifyComplianceNextActor(topic('RESOLVED', []))).toBe('NO_ACTION');
  });

  it('never double-counts: every topic lands in exactly one bucket', () => {
    const topics = [
      topic('LAWYER_REVIEW_REQUIRED', [answerable()]),
      topic('ACTION_IN_PROGRESS', [answerable()]),
      topic('LAWYER_REVIEW_REQUIRED', []),
      topic('ACTION_IN_PROGRESS', []),
      topic('MORE_INFORMATION_NEEDED', [officeOnly()]),
      topic('REVIEW_RECOMMENDED', []),
      topic('RESOLVED', []),
      topic('RESOLVED', [officeOnly()]),
    ];
    const buckets = topics.map(classifyComplianceNextActor);
    const counts = { CUSTOMER_ACTION: 0, OFFICE: 0, NO_ACTION: 0 };
    for (const bucket of buckets) counts[bucket] += 1;

    expect(counts.CUSTOMER_ACTION + counts.OFFICE + counts.NO_ACTION).toBe(topics.length);
    // The lawyer-review topic with answerable data is counted as customer action only.
    expect(buckets[0]).toBe('CUSTOMER_ACTION');
    expect(counts.OFFICE).toBe(2);
    expect(counts.CUSTOMER_ACTION).toBe(5);
    expect(counts.NO_ACTION).toBe(1);
  });

  it('does not present lawyer-oriented text as the customer next step', () => {
    expect(homeComplianceNextAction(topic('LAWYER_REVIEW_REQUIRED', [answerable()], 'Ügyvédi áttekintés javasolt.'))).toBe(
      'Kérjük, adja meg az alábbi hiányzó adatokat a portálon.',
    );
    // Every other case keeps the canonical client-safe text untouched.
    const canonical = 'Ügyvédi áttekintés javasolt.';
    expect(homeComplianceNextAction(topic('LAWYER_REVIEW_REQUIRED', [], canonical))).toBe(canonical);
    expect(homeComplianceNextAction(topic('MORE_INFORMATION_NEEDED', [answerable()], canonical))).toBe(canonical);
    expect(homeComplianceNextAction(topic('RESOLVED', [], null))).toBe(null);
  });

  it('derives its decision only from customer-safe fields', () => {
    const src = readFileSync(path.join(process.cwd(), 'src/modules/client-workspace/orgHomeService.ts'), 'utf8');
    const start = src.indexOf('export function hasPortalAnswerableMissingInformation');
    const end = src.indexOf('export async function getOrganizationalHome');
    const projection = src.slice(start, end);
    for (const forbidden of [
      'requirementKey',
      'requirementVersion',
      'assessmentFinding',
      'severity',
      'ruleAst',
      'astJson',
      'proposal',
      'internalOwner',
      'reviewer',
      'aiPrompt',
      'aiResponse',
    ]) {
      expect(projection).not.toContain(forbidden);
    }
    // The projection reads only the client-safe topic shape.
    expect(projection).toContain("topic.state");
    expect(projection).toContain('missingInformation');
    expect(projection).toContain('portalAnswerable');
    expect(projection).toContain('questionKey');
  });
});
