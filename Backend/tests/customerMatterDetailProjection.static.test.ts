/**
 * Static guards for the customer-facing published matter detail read projection.
 *
 * Salvaged from PR #274 and re-verified against current master. The customer
 * matter detail may only be composed from explicitly published, customer-safe
 * sources: the immutable current ClientMatterPublicationRevision, PUBLISHED
 * ClientDocumentPublication rows, PUBLISHED ClientActionRequest rows, PUBLISHED
 * ClientSafeUpdate rows, the published milestones/deadlines snapshots, and the
 * customer's own ClientRequest / CustomerSubmission data. Internal
 * Case/Task/deadline/communication data must never enter this path.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = (rel: string): string => readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('customer matter detail projection boundary', () => {
  const publication = () => src('src/modules/client-publication/publicationService.ts');

  it('serves the matter only from the published current revision', () => {
    const body = publication().match(/export async function getPortalMatter[\s\S]*?\r?\n\}\r?\n/);
    expect(body).toBeTruthy();
    expect(body![0]).toMatch(/r\.id=p\."currentRevisionId"/);
    expect(body![0]).toMatch(/p\.status='PUBLISHED'::"ClientPublicationStatus"/);
    expect(body![0]).toMatch(/context\.caseIds\.includes\(String\(row\.caseId\)\)/);
    expect(body![0]).toMatch(/audienceAllows\(row, context\.grants, 'MATTER_READ'\)/);
    expect(body![0]).toMatch(/clientSafeTitle|clientSafeStatus|clientSafeNextStep|clientSafeCurrentPosition|clientSafeWaitingOn/);
    expect(body![0]).toMatch(/milestonesSnapshot|publishedDeadlinesSnapshot/);
    expect(body![0]).toMatch(/assertNoForbiddenPortalFields\(dto\)/);
  });

  it('never reads internal work items and never writes in the customer read path', () => {
    const body = publication().match(/export async function getPortalMatter[\s\S]*?\r?\n\}\r?\n/)![0];
    expect(body).not.toMatch(/\btasks\b|Task\b/);
    expect(body).not.toMatch(/CaseIntakeDeadline|intakeDeadline|internalNotes|workInstruction|strategy/);
    expect(body).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\b/);
  });

  it('keeps published-only and audience filters on documents, actions and updates', () => {
    const source = publication();
    expect(source).toMatch(/WHERE p\.status='PUBLISHED'::"ClientPublicationStatus" AND p\."caseId"=ANY\(\$1::text\[\]\)/);
    expect(source).toMatch(/documentVisibleForContext\(row, context, 'DOCUMENT_READ'\)/);
    expect(source).toMatch(/WHERE status='PUBLISHED'::"ClientActionRequestStatus" AND "caseId"=ANY\(\$1::text\[\]\)/);
    expect(source).toMatch(/WHERE status='PUBLISHED'::"ClientSafeUpdateStatus" AND "caseId"=ANY\(\$1::text\[\]\)/);
  });

  it('keeps milestone progress internal and maps milestones to safe fields only', () => {
    const source = publication();
    const mapper = source.match(/function toPortalMatter[\s\S]*?assertNoForbiddenPortalFields\(dto\)/);
    expect(mapper).toBeTruthy();
    expect(mapper![0]).not.toMatch(/progressPercentage/);

    const milestones = source.match(/export function toCustomerMilestones[\s\S]*?\r?\n\}\r?\n/);
    expect(milestones).toBeTruthy();
    expect(milestones![0]).toMatch(/publicKey|safeTitle|safeDescription|completionState/);
    expect(milestones![0]).not.toMatch(/taskId|internal|workflowStepTitle/);
  });

  it('does not project responsible-lawyer contact or billing internals to the customer', () => {
    const mapper = publication().match(/function toPortalMatter[\s\S]*?assertNoForbiddenPortalFields\(dto\)/)![0];
    expect(mapper).toMatch(/responsibleLawyerDisplay/);
    expect(mapper).not.toMatch(/responsibleLawyerId|responsibleUserId|billingStatement|hourlyRate|timeEntry/);
  });

  it('keeps the customer request surface on the canonical customer interaction service', () => {
    // The matter request section must reuse the existing customer-facing request
    // API (field answers, upload, note, submit) — never a new model or path, and
    // never a workforce/internal interaction module.
    const card = src('src/modules/client-interaction/customerRoutes.ts');
    expect(card).toMatch(/\/requests/);
    const frontendCard = readFileSync(
      path.join(__dirname, '..', '..', 'Frontend', 'src', 'components', 'client-portal', 'CustomerInteractionCard.tsx'),
      'utf8',
    );
    expect(frontendCard).toMatch(/customerInteractionApi\.listRequests\(/);
    expect(frontendCard).toMatch(/customerInteractionApi\.uploadFile\(/);
    expect(frontendCard).toMatch(/customerInteractionApi\.submitSubmission\(/);
    expect(frontendCard).not.toMatch(/workforceInteractionApi|internalInteractionApi/);
  });
});
