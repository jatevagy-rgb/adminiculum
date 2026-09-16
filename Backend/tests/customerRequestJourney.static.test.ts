/**
 * Static regression guards for the customer request/submission journey.
 * These assert source-level invariants that must survive UI convergence work:
 * customer submission never completes a request, completion stays internal,
 * customer reads stay grant-scoped, and related documents stay publication-only.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = (rel: string): string => readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('customer request lifecycle invariants', () => {
  it('never lets a customer submission complete or mutate the request', () => {
    const service = src('src/modules/client-interaction/submissionService.ts');
    const submit = service.match(/export async function submitSubmission[\s\S]*?\r?\n\}\r?\n/);
    expect(submit).toBeTruthy();
    expect(submit![0]).not.toMatch(/clientRequest\.(update|updateMany|create|delete|upsert)/);
    expect(submit![0]).toMatch(/status: 'SUBMITTED'/);
    expect(submit![0]).toMatch(/customerNote/);

    const requestWrites = service.match(/clientRequest\.update/g) || [];
    expect(requestWrites).toHaveLength(1);
    expect(service).toContain('submitIntakeInformationResponseInTransaction');
  });

  it('keeps completion and file acceptance internal-only', () => {
    const internal = src('src/modules/client-interaction/internalRoutes.ts');
    const customer = src('src/modules/client-interaction/customerRoutes.ts');
    expect(internal).toMatch(/requests\/:id\/complete/);
    expect(internal).toMatch(/requests\/:id\/publish/);
    expect(internal).toMatch(/submissions\/:id\/request-correction/);
    expect(internal).toMatch(/submissions\/:id\/files\/:fileId\/accept/);
    expect(customer).not.toMatch(/complete|cancel|accept|reject/);
    expect(customer).toMatch(/authenticateClientPortal/);
  });

  it('scopes customer request reads to the granted case and client', () => {
    const service = src('src/modules/client-interaction/requestService.ts');
    expect(service).toMatch(/where: \{ id: requestId, caseId: ctx\.caseId, clientId: ctx\.clientId, status: \{ in: CUSTOMER_VISIBLE/);
    const mapper = service.match(/function toClientSafeRequest[\s\S]*?assertClientSafe\(dto\)/);
    expect(mapper).toBeTruthy();
    expect(mapper![0]).not.toMatch(/createdById|assignedInternalUserId|audienceSnapshot/);
  });

  it('reuses the canonical customer-safe thread surface for help and declarations', () => {
    const questions = src('src/modules/client-interaction/questionService.ts');
    expect(questions).toMatch(/requirePortalCommunication/);
    expect(questions).toMatch(/canSendMessages/);
    expect(questions).toMatch(/PUBLIC_MESSAGE_VISIBILITY = 'SENT'/);
    expect(questions).not.toMatch(/communicationBody|mailbox/i);
  });

  it('lists related documents only from the published customer publication path', () => {
    const publication = src('src/modules/client-publication/publicationService.ts');
    expect(publication).toMatch(/WHERE p\.status='PUBLISHED'::"ClientPublicationStatus" AND p\."caseId"=ANY\(\$1::text\[\]\)/);
    expect(publication).toMatch(/documentVisibleForContext\(row, context, 'DOCUMENT_READ'\)/);
    expect(publication).toMatch(/context\.caseIds/);
  });
});

describe('documented semantic gap: structured not-available', () => {
  it('keeps no invented not-available request/submission status in the customer domain', () => {
    const service = src('src/modules/client-interaction/submissionService.ts');
    expect(service).not.toMatch(/NOT_AVAILABLE|CUSTOMER_CANNOT_SUPPLY/);
    const request = src('src/modules/client-interaction/requestService.ts');
    expect(request).not.toMatch(/NOT_AVAILABLE|CUSTOMER_CANNOT_SUPPLY|CANNOT_SUPPLY/);
  });

  it('declares the only unused partial state as unwritten', () => {
    const request = src('src/modules/client-interaction/requestService.ts');
    expect(request).toMatch(/PARTIALLY_SUBMITTED/);
    expect(request).not.toMatch(/status: 'PARTIALLY_SUBMITTED'/);
  });
});
