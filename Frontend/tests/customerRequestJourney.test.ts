import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  WHY_MARKER,
  boundedUnavailableReason,
  canRespondToRequest,
  requestDocumentSpecHints,
  requestStateTone,
  requestTypeLabel,
  splitRequestInstructions,
} from '../src/lib/customerRequestDetail';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('customer request detail read model', () => {
  it('splits the canonical composer output into steps and an explicit reason', () => {
    const canonical = 'Töltse fel az aláírt szerződést.\nCsatolja az aláíró személy igazolványát.\n\nMiért szükséges: az ügy irataihoz csatolni kell a szerződést.';
    const { steps, why } = splitRequestInstructions(canonical);
    assert.equal(steps.length, 2);
    assert.match(steps[0], /aláírt szerződést/);
    assert.match(why || '', /csatolni kell a szerződést/);
  });

  it('never invents a reason when the canonical marker is absent', () => {
    const { steps, why } = splitRequestInstructions('Kérjük, küldje be a dokumentumot.');
    assert.equal(why, null);
    assert.equal(steps.length, 1);
    assert.equal(splitRequestInstructions(null).why, null);
    assert.deepEqual(splitRequestInstructions(null).steps, []);
    assert.equal(WHY_MARKER, 'Miért szükséges:');
  });

  it('derives document hints only from the canonical documentSpec', () => {
    const hints = requestDocumentSpecHints({
      acceptedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
      maxFileCount: 2,
      maxFileSizeBytes: 10 * 1024 * 1024,
      frontBackRequired: true,
      mobilePhotoAccepted: true,
    });
    assert.ok(hints.some((hint) => hint.includes('PDF, JPG, PNG')));
    assert.ok(hints.some((hint) => hint.includes('Legfeljebb 2 fájl')));
    assert.ok(hints.some((hint) => hint.includes('10 MB')));
    assert.ok(hints.some((hint) => hint.includes('első és a hátsó oldal')));
    assert.ok(hints.some((hint) => hint.includes('Telefonnal készített fotó')));
    assert.deepEqual(requestDocumentSpecHints(null), []);
    assert.deepEqual(requestDocumentSpecHints('not-a-spec'), []);
  });

  it('keeps state and declaration semantics truthful', () => {
    assert.equal(requestStateTone('PUBLISHED'), 'amber');
    assert.equal(requestStateTone('COMPLETED'), 'green');
    assert.equal(requestStateTone('EXPIRED'), 'red');
    assert.equal(canRespondToRequest('PUBLISHED'), true);
    for (const closed of ['COMPLETED', 'CANCELLED', 'EXPIRED']) assert.equal(canRespondToRequest(closed), false, closed);
    assert.equal(requestTypeLabel('DOCUMENT_UPLOAD'), 'Dokumentum bekérése');
  });

  it('bounds the declaration reason to the client-safe 1000-character contract', () => {
    assert.equal(boundedUnavailableReason(''), undefined);
    assert.equal(boundedUnavailableReason('   '), undefined);
    assert.equal(boundedUnavailableReason('  A másik cégnél van.  '), 'A másik cégnél van.');
    assert.equal(boundedUnavailableReason('x'.repeat(5000))!.length, 1000);
  });
});

describe('customer request detail surface (source contract)', () => {
  const detail = () => read('src/components/client-portal/CustomerRequestDetail.tsx');
  const shell = () => read('src/components/client-portal/ClientPortalShell.tsx');
  const orgViews = () => read('src/components/client-portal/OrganizationPortalViews.tsx');
  const interactionApi = () => read('src/lib/clientInteractionApi.ts');

  it('has a real customer route for a single published request inside its matter', () => {
    const page = read('src/app/portal/matters/[publicationId]/requests/[requestId]/page.tsx');
    assert.match(page, /view="matter"/);
    assert.match(page, /resourceId={publicationId}/);
    assert.match(page, /requestId={requestId}/);
    assert.match(shell(), /requestId\?: string/);
  });

  it('reads the request through the canonical customer endpoint, never a new one', () => {
    assert.match(interactionApi(), /getRequest: \(caseId: string, requestId: string\)/);
    assert.match(interactionApi(), /\/client-interaction\/cases\/\$\{encodeURIComponent\(caseId\)\}\/requests\/\$\{encodeURIComponent\(requestId\)\}/);
    assert.match(shell(), /customerInteractionApi\.getRequest\(matter\.caseId, requestId\)/);
    assert.match(shell(), /customerInteractionApi\.listSubmissions\(matter\.caseId, requestId\)/);
    assert.doesNotMatch(shell(), /workforceInteractionApi/);
  });

  it('renders the mock sections without inventing priority or a responsible lawyer', () => {
    const src = detail();
    for (const section of ['Miért kérjük ezt?', 'Amit meg kell tennie', 'Válasz beküldése', 'Kapcsolódó közzétett dokumentumok', 'Kapcsolat és segítség', 'Határidő', 'Kapcsolódó ügy']) {
      assert.ok(src.includes(section), `detail surface is missing: ${section}`);
    }
    assert.match(src, /splitRequestInstructions/);
    assert.match(src, /requestDocumentSpecHints/);
    assert.match(src, /requestStateTone/);
    assert.doesNotMatch(src, /[Pp]rioritás|PRIORITY/);
    assert.match(src, /matter\.responsibleLawyerDisplay \?/);
    assert.match(shell(), /requestUnavailable/);
  });

  it('offers upload and an optional note through the existing submission flow', () => {
    const src = detail();
    assert.match(src, /RequestResponseCard/);
    assert.match(src, /onNote={setNote}/);
    const card = read('src/components/client-portal/CustomerInteractionCard.tsx');
    assert.match(card, /export function RequestResponseCard/);
    assert.match(card, /Megjegyzés az irodának \(opcionális\)/);
    assert.match(card, /customerInteractionApi\.submitSubmission\(caseId, submissionId, note\)/);
  });

  it('shows only documents published through the customer publication path', () => {
    const src = detail();
    assert.match(src, /matter\.documents/);
    assert.match(src, /<DocumentCard key=\{document\.id\} document=\{document\} \/>/);
    assert.doesNotMatch(src, /\/api\/v1\/documents|documentVersionId/);
    assert.match(read('src/components/client-portal/MatterWorkspace.tsx'), /href=\{`\/portal\/documents\/\$\{encodeURIComponent\(document\.id\)\}`\}/);
  });

  it('declares non-availability as a request-domain ClientSubmission, not a message thread', () => {
    const panel = detail().match(/function UnavailableDeclarationPanel[\s\S]*?\r?\n\}\r?\n/);
    assert.ok(panel, 'declaration panel not found');
    assert.match(panel![0], /customerInteractionApi\.declareUnavailable\(caseId, request\.id, boundedUnavailableReason\(reason\)\)/);
    assert.match(panel![0], /Jelzem, hogy nem áll rendelkezésre/);
    assert.match(panel![0], /submission\?\.unavailableDeclaredAt/);
    assert.match(panel![0], /unavailable-declaration-state/);
    assert.doesNotMatch(panel![0], /createQuestion|ClientQuestion/);
    assert.doesNotMatch(detail(), /completeRequest|cancelRequest|status: 'NOT_AVAILABLE'/);
    assert.match(interactionApi(), /declareUnavailable: \(caseId: string, requestId: string, reasonSafe\?: string\)/);
    assert.match(interactionApi(), /\/requests\/\$\{encodeURIComponent\(requestId\)\}\/unavailable-declaration/);
  });

  it('keeps help on the customer-safe thread surface and hides it when messaging is off', () => {
    const src = detail();
    assert.match(src, /scope="questions"/);
    assert.match(src, /allowAsk=\{canSendMessages\}/);
    assert.match(orgViews(), /allowAsk=\{detail\.capabilities\.allowMessages\}/);
  });

  it('links every matter request card to its own detail surface', () => {
    const card = read('src/components/client-portal/CustomerInteractionCard.tsx');
    assert.match(card, /detailHref/);
    assert.match(card, /Bekérés részletei/);
    assert.match(card, /\/portal\/matters\/\$\{encodeURIComponent\(matterPublicationId\)\}\/requests\//);
    assert.match(shell(), /matterPublicationId=\{resourceId\}/);
    assert.match(orgViews(), /matterPublicationId=\{detail\.matterPublicationId\}/);
  });

  it('leaks no internal review or storage fields to the customer surface', () => {
    const src = detail() + read('src/lib/customerRequestDetail.ts');
    assert.doesNotMatch(src, /storageProvider|quarantineStorageReference|scanProvider|scanCodeSafe|reviewedById|acceptedDocumentVersionId|assignedInternalUserId|audienceSnapshot/);
  });
});

describe('organization / case-relay request detail (source contract)', () => {
  const shell = () => read('src/components/client-portal/ClientPortalShell.tsx');
  const orgViews = () => read('src/components/client-portal/OrganizationPortalViews.tsx');

  it('passes the request id into the existing organization portal architecture', () => {
    const src = shell();
    const orgBlock = src.match(/<OrganizationPortalViews[\s\S]*?\/>/);
    assert.ok(orgBlock, 'OrganizationPortalViews render not found');
    assert.match(orgBlock![0], /requestId=\{requestId\}/);
    assert.match(orgBlock![0], /view=\{view as OrganizationPortalView\}/);
  });

  it('renders the SAME canonical request detail component for organizations', () => {
    const src = orgViews();
    assert.match(src, /import \{ CustomerRequestDetail \} from "\.\/CustomerRequestDetail"/);
    assert.match(src, /requestId\?: string/);
    assert.match(src, /requestId \? \(/);
    assert.match(src, /<CustomerRequestDetail/);
    assert.match(src, /caseId=\{state\.matter\.caseId\}/);
    assert.match(src, /customerInteractionApi\.getRequest\(matter\.caseId, requestId\)/);
    assert.match(src, /customerInteractionApi\.listSubmissions\(matter\.caseId, requestId\)/);
    // one shared component, no second request-detail implementation
    assert.equal((read('src/components/client-portal/CustomerRequestDetail.tsx').match(/export function CustomerRequestDetail/g) || []).length, 1);
  });

  it('uses the already-loaded canonical PortalMatter and keeps the mode-agnostic path', () => {
    const src = orgViews();
    assert.match(src, /getPortalMatter\(detail\.matterPublicationId\)/);
    assert.match(src, /canSendMessages=\{Boolean\(state\.detail\?\.capabilities\.allowMessages\)\}/);
    // The request detail branch must not be limited to a single workspace mode.
    const branch = src.match(/view === "matter" \? \([\s\S]*?OrganizationMatterDetail/);
    assert.ok(branch, 'matter branch not found');
    assert.doesNotMatch(branch![0], /mode === "INDIVIDUAL"|mode === "ORGANIZATION"|mode === "CASE_RELAY"/);
  });

  it('keeps unauthorized or unavailable request ids honestly unavailable', () => {
    const src = orgViews();
    assert.match(src, /state\.requestUnavailable/);
    assert.match(src, /A bekérés jelenleg nem érhető el ezen az ügyfélfelületen/);
    assert.match(src, /onChanged=\{async \(\) => \{ await load\(\); \}\}/);
    // failures are contained: the org case/matter load failure path is preserved
    assert.match(src, /matterError: clientSafeError\(error\), matterLoading: false/);
  });

  it('exposes the declaration to the existing internal submission review queue', () => {
    const src = read('src/components/client-portal/ClientInteractionInternalActions.tsx');
    assert.match(src, /internal-unavailable-declaration/);
    assert.match(src, /customerUnavailableDeclaredAt/);
    assert.match(src, /customerUnavailableReasonSafe/);
    assert.match(read('src/lib/clientInteractionApi.ts'), /customerUnavailableDeclaredAt\?: string \| null/);
  });
});

describe('request lifecycle invariants (backend source contract)', () => {
  const backendRead = (rel: string) => readFileSync(path.join(root, '..', 'Backend', rel), 'utf8');

  it('never lets a customer submission complete or mutate the request', () => {
    const src = backendRead('src/modules/client-interaction/submissionService.ts');
    const submit = src.match(/export async function submitSubmission[\s\S]*?\r?\n\}\r?\n/);
    assert.ok(submit, 'submitSubmission not found');
    assert.doesNotMatch(submit![0], /clientRequest\.(update|updateMany|create|delete|upsert)/);
    assert.match(submit![0], /status: 'SUBMITTED'/);
    assert.match(submit![0], /customerNote/);
    const requestWrites = src.match(/clientRequest\.update/g) || [];
    assert.equal(requestWrites.length, 1, 'only the intake path may write the request status');
    assert.match(src, /submitIntakeInformationResponseInTransaction/);
  });

  it('keeps the declaration inside the canonical submission workflow', () => {
    const src = backendRead('src/modules/client-interaction/submissionService.ts');
    const declare = src.match(/export async function declareUnavailable[\s\S]*?\r?\n\}\r?\n/);
    assert.ok(declare, 'declareUnavailable not found');
    assert.doesNotMatch(declare![0], /clientRequest\.(update|updateMany|create|delete|upsert)/);
    assert.doesNotMatch(declare![0], /clientQuestion|ClientQuestion|question/i);
    assert.match(declare![0], /status: 'SUBMITTED'/);
    assert.match(declare![0], /customerUnavailableDeclaredAt: new Date\(\)/);
    assert.match(declare![0], /customerUnavailableReasonSafe: reason/);
    assert.match(declare![0], /SUBMISSION_ALREADY_SUBMITTED/);
    assert.match(declare![0], /loadPublishedRequest/);
    assert.match(src, /customerUnavailableReasonSafe: null, customerUnavailableDeclaredAt: null/);
  });

  it('guards a partially completed draft and an active upload lifecycle', () => {
    const src = backendRead('src/modules/client-interaction/submissionService.ts');
    const declare = src.match(/export async function declareUnavailable[\s\S]*?\r?\n\}\r?\n/);
    assert.ok(declare, 'declareUnavailable not found');
    // active upload/scanning/ingest lifecycle is never converted
    assert.match(declare![0], /\['UPLOADING', 'SCANNING', 'RECEIVED'\]\.includes\(existing\.status\)/);
    assert.match(declare![0], /SUBMISSION_IN_PROGRESS/);
    // a draft that already carries customer content is preserved, not converted
    assert.match(declare![0], /existing\.status === 'DRAFT' && hasCustomerProvidedContent\(existing\)/);
    assert.match(declare![0], /SUBMISSION_HAS_CUSTOMER_CONTENT/);
    assert.match(src, /function hasCustomerProvidedContent/);
    // the guard never deletes customer data
    assert.doesNotMatch(declare![0], /delete|deleteMany|remove/i);
    // CORRECTION_REQUESTED is never part of a rejection list in this function
    assert.doesNotMatch(declare![0], /CORRECTION_REQUESTED/);
  });

  it('exposes the declaration route to customers without a completion/cancel route', () => {
    const customer = backendRead('src/modules/client-interaction/customerRoutes.ts');
    assert.match(customer, /requests\/:requestId\/unavailable-declaration/);
    assert.match(customer, /submissions\.declareUnavailable/);
    assert.doesNotMatch(customer, /complete|cancel|accept|reject/);
  });

  it('keeps completion an explicit internal-only decision', () => {
    const internal = backendRead('src/modules/client-interaction/internalRoutes.ts');
    const customer = backendRead('src/modules/client-interaction/customerRoutes.ts');
    assert.match(internal, /requests\/:id\/complete/);
    assert.match(internal, /requests\/:id\/publish/);
    assert.match(internal, /submissions\/:id\/request-correction/);
    assert.match(internal, /submissions\/:id\/files\/:fileId\/accept/);
    assert.doesNotMatch(customer, /complete|cancel|accept|reject/);
  });

  it('scopes a customer request read to the granted case and client', () => {
    const src = backendRead('src/modules/client-interaction/requestService.ts');
    assert.match(src, /where: \{ id: requestId, caseId: ctx\.caseId, clientId: ctx\.clientId, status: \{ in: CUSTOMER_VISIBLE/);
    assert.match(src, /function toClientSafeRequest[\s\S]*?assertClientSafe\(dto\)/);
    assert.doesNotMatch(src.match(/function toClientSafeRequest[\s\S]*?assertClientSafe\(dto\)/)![0], /createdById|assignedInternalUserId|audienceSnapshot/);
  });

  it('lists related documents only from the published customer publication path', () => {
    const src = backendRead('src/modules/client-publication/publicationService.ts');
    assert.match(src, /WHERE p\.status='PUBLISHED'::"ClientPublicationStatus" AND p\."caseId"=ANY\(\$1::text\[\]\)/);
    assert.match(src, /rows\.filter\(\(row\) => documentVisibleForContext\(row, context, 'DOCUMENT_READ'\)\)/);
    assert.match(src, /context\.caseIds/);
  });

  it('adds only the approved nullable declaration fields with a migration', () => {
    const schema = backendRead('prisma/schema.prisma');
    assert.match(schema, /customerUnavailableReasonSafe String\?/);
    assert.match(schema, /customerUnavailableDeclaredAt DateTime\?/);
    assert.equal(existsSync(path.join(root, '..', 'Backend', 'prisma', 'migrations', '20260915090000_client_submission_unavailable_declaration', 'migration.sql')), true);
    const migration = backendRead('prisma/migrations/20260915090000_client_submission_unavailable_declaration/migration.sql');
    assert.match(migration, /ADD COLUMN "customerUnavailableReasonSafe" TEXT/);
    assert.match(migration, /ADD COLUMN "customerUnavailableDeclaredAt" TIMESTAMP\(3\)/);
    assert.doesNotMatch(migration, /DROP|DELETE|UPDATE /);
  });
});
