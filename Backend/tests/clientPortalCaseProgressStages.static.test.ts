/**
 * Static guards for the customer-safe handling stage mapping.
 *
 * The published milestone snapshot may be enriched with recognizable handling
 * stages (anonimizálva / első átnézés / ügyvéd visszaküldte / szerződéstárba)
 * through ONE explicit catalog that maps each stage to its canonical internal
 * signal and a customer-facing Hungarian label. Stages without a canonical
 * signal are dropped, never fabricated. The existing published milestone /
 * progressPercentage projection remains the single progress engine.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = (rel: string): string => readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('customer portal case progress stage mapping boundary', () => {
  const publication = () => src('src/modules/client-publication/publicationService.ts');

  const catalog = () => {
    const source = publication();
    const start = source.indexOf('const CASE_PROGRESS_STAGE_CATALOG');
    const end = source.indexOf('const CASE_PROGRESS_STAGE_KEYS');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  };

  it('maps exactly the supported handling stages with Hungarian customer labels', () => {
    const body = catalog();
    for (const [key, title] of [
      ['anonymized', 'Iratok anonimizálva'],
      ['first-review', 'Első átnézés megtörtént'],
      ['lawyer-returned', 'Ügyvéd visszaküldte átnézésre'],
      ['contract-in-library', 'Szerződés felvéve a szerződéstárba'],
    ] as const) {
      expect(body).toMatch(new RegExp(`stageKey: '${key}'`));
      expect(body).toMatch(new RegExp(`safeTitle: '${title}'`));
    }
    expect(body.match(/stageKey: '/g)?.length).toBe(4);
  });

  it('derives every stage from a real canonical internal table only', () => {
    const body = catalog();
    expect(body).toMatch(/anonymous_documents/);
    expect(body).toMatch(/document_review_rounds/);
    expect(body).toMatch(/review_decisions/);
    expect(body).toMatch(/contract_records/);
    expect(body).toMatch(/rd\.action::text = 'CHANGES_REQUESTED'/);
    expect(body).toMatch(/rr\."submittedAt" IS NOT NULL/);
    expect(body).toMatch(/contract_records WHERE "sourceCaseId" = \$1/);
  });

  it('drops a stage whose canonical signal is absent instead of fabricating it', () => {
    const source = publication();
    const normalize = source.match(/function normalizeMilestones[\s\S]*?\n}/)![0];
    expect(normalize).toMatch(/presentStageKeys: Set<string>/);
    expect(normalize).toMatch(/if \(!presentStageKeys\.has\(sourceStageKey\)\) return null/);
    expect(normalize).toMatch(/\.filter\(\(milestone\): milestone is StoredMilestone => milestone !== null\)/);
    const derive = source.match(/async function deriveCaseProgressStageCandidates[\s\S]*?\n}/)![0];
    expect(derive).toMatch(/if \(!row\) continue/);
  });

  it('forces stage-derived milestones to catalog label, description and COMPLETED state', () => {
    const normalize = publication().match(/function normalizeMilestones[\s\S]*?\n}/)![0];
    expect(normalize).toMatch(/safeTitle: stage\.safeTitle/);
    expect(normalize).toMatch(/safeDescription: stage\.safeDescription/);
    expect(normalize).toMatch(/completionState: 'COMPLETED'/);
    expect(normalize).toMatch(/displayOrder: Number\.isFinite\(Number\(raw\.displayOrder\)\) \? Number\(raw\.displayOrder\) : stage\.displayOrder/);
    expect(normalize).toMatch(/CASE_PROGRESS_STAGE_CATALOG\.find/);
  });

  it('never exposes stage internals on the customer milestone projection', () => {
    const milestones = publication().match(/export function toCustomerMilestones[\s\S]*?\n}/)![0];
    expect(milestones).not.toMatch(/sourceStageKey/);
    expect(milestones).not.toMatch(/sourceTaskId/);
    expect(milestones).not.toMatch(/stageKey/);
    expect(milestones).toMatch(/reference: String\(m\.publicKey\)/);
  });

  it('keeps the customer portal read paths free of stage derivation', () => {
    const organizational = src('src/modules/client-workspace/organizationalCaseService.ts');
    expect(organizational).not.toMatch(/CASE_PROGRESS_STAGE_CATALOG|resolvePresentStageKeys|deriveCaseProgressStageCandidates/);
    const publicationSource = publication();
    const portalMatter = publicationSource.match(/function toPortalMatter[\s\S]*?\n}/)![0];
    expect(portalMatter).not.toMatch(/resolvePresentStageKeys|deriveCaseProgressStageCandidates/);
  });

  it('keeps computeMilestoneProgress untouched — progressPercentage stays canonical', () => {
    const compute = publication().match(/export function computeMilestoneProgress[\s\S]*?\n}/)![0];
    expect(compute).not.toMatch(/stage|Stage/);
    expect(compute).toMatch(/weight/);
    expect(compute).toMatch(/COMPLETED/);
  });

  it('lists stage candidates only on the workforce internal eligibility view', () => {
    const eligible = publication().match(/export async function listEligibleMilestoneSteps[\s\S]*?\n}/)![0];
    expect(eligible).toMatch(/stageCandidates: await deriveCaseProgressStageCandidates\(db, caseId\)/);
    expect(eligible).toMatch(/requireInternal\(actor\)/);
  });

  it('validates stage keys and rejects mixed source bindings', () => {
    const normalize = publication().match(/function normalizeMilestones[\s\S]*?\n}/)![0];
    expect(normalize).toMatch(/MILESTONE_SOURCE_CONFLICT/);
    expect(normalize).toMatch(/MILESTONE_STAGE_INVALID/);
  });
});
