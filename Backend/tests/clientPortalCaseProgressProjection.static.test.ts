/**
 * Static guards for the canonical published progress source of the customer
 * portal case progress strip.
 *
 * The strip's percentage must come from the organization case detail DTO, which
 * reads the immutable published matter revision (`progressPercentage`, computed
 * from published milestone weights at publish time) — never from live workflow
 * state and never recomputed in a customer read path. The individual matter DTO
 * deliberately keeps percentage out; its milestones come from the same published
 * snapshot.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = (rel: string): string => readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('customer portal case progress projection boundary', () => {
  const organizational = () => src('src/modules/client-workspace/organizationalCaseService.ts');
  const orgHome = () => src('src/modules/client-workspace/orgHomeService.ts');
  const publication = () => src('src/modules/client-publication/publicationService.ts');

  it('org case detail serves progressPercentage from the published revision only', () => {
    const body = organizational().match(/export async function getOrganizationalCaseDetail[\s\S]*?\r?\n\}\r?\n/);
    expect(body).toBeTruthy();
    expect(body![0]).toMatch(/progressPercentage: revision\.progressPercentage \?\? null/);
    expect(body![0]).toMatch(/safeMilestones: toCustomerMilestones\(revision\.milestonesSnapshot\)/);
    expect(body![0]).toMatch(/assertClientSafe\(detail\)/);
    expect(body![0]).not.toMatch(/computeMilestoneProgress/);
  });

  it('org home current matter progress is the same canonical published value', () => {
    const source = orgHome();
    expect(source).toMatch(/progressPercentage: detail\.progressPercentage \?\? null/);
  });

  it('individual matter DTO never fabricates a percentage in its customer read path', () => {
    const body = publication().match(/export async function getPortalMatter[\s\S]*?\r?\n\}\r?\n/)![0];
    expect(body).toMatch(/r\."milestonesSnapshot"/);
    expect(body).toMatch(/const dto = \{ \.\.\.matter, messageCapabilities/);
    expect(body).toMatch(/milestones \};/);
    expect(body).not.toMatch(/computeMilestoneProgress/);
    const dtoLine = body.match(/const dto = \{[^\n]*milestones \};/);
    expect(dtoLine).toBeTruthy();
    expect(dtoLine![0]).not.toMatch(/progressPercentage/);
  });

  it('published progress is computed from milestone weights only, at publish time', () => {
    const source = publication();
    const compute = source.match(/export function computeMilestoneProgress[\s\S]*?\r?\n\}\r?\n/);
    expect(compute).toBeTruthy();
    expect(compute![0]).toMatch(/weight/);
    expect(compute![0]).toMatch(/COMPLETED/);
    expect(compute![0]).not.toMatch(/tasks|Task\b/);
  });

  it('customer milestones projection strips every internal milestone field', () => {
    const source = publication();
    const milestones = source.match(/export function toCustomerMilestones[\s\S]*?\r?\n\}\r?\n/);
    expect(milestones).toBeTruthy();
    expect(milestones![0]).toMatch(/reference: String\(m\.publicKey\)/);
    expect(milestones![0]).toMatch(/state: String\(m\.completionState\)/);
    expect(milestones![0]).not.toMatch(/sourceTaskId/);
  });
});
