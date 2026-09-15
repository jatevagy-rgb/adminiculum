import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  WHY_MARKER,
  canRespondToRequest,
  notAvailableBody,
  notAvailableSubject,
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

  it('keeps state, deadline and declaration semantics truthful', () => {
    assert.equal(requestStateTone('PUBLISHED'), 'amber');
    assert.equal(requestStateTone('COMPLETED'), 'green');
    assert.equal(requestStateTone('EXPIRED'), 'red');
    assert.equal(canRespondToRequest('PUBLISHED'), true);
    for (const closed of ['COMPLETED', 'CANCELLED', 'EXPIRED']) assert.equal(canRespondToRequest(closed), false, closed);
    assert.equal(requestTypeLabel('DOCUMENT_UPLOAD'), 'Dokumentum bekérése');
  });

  it('declares non-availability as a persisted, client-safe message payload', () => {
    assert.match(notAvailableSubject('Aláírt adatfeldolgozói szerződés feltöltése'), /^Nem áll rendelkezésre: /);
    const body = notAvailableBody('Aláírt adatfeldolgozói szerződés feltöltése', '2026-01-10T00:00:00.000Z', 'A másik cégnél van.');
    assert.match(body, /nem áll rendelkezésemre/);
    assert.match(body, /határidő: 2026-01-10/);
    assert.match(body, /A másik cégnél van\./);
    assert.ok(notAvailableSubject('x'.repeat(400)).length <= 200);
    assert.ok(notAvailableBody('x'.repeat(400), null, 'y'.repeat(9000)).length <= 4000);
  });
});

describe('customer request detail surface (source contract)', () => {
  const detail = () => read('src/components/client-portal/CustomerRequestDetail.tsx');
  const shell = () => read('src/components/client-portal/ClientPortalShell.tsx');
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
    assert.doesNotMatch(src, /\/api\/v1\/documents|caseId=.*documents|documentVersionId/);
    assert.match(read('src/components/client-portal/MatterWorkspace.tsx'), /href=\{`\/portal\/documents\/\$\{encodeURIComponent\(document\.id\)\}`\}/);
  });

  it('declares non-availability truthfully through the canonical question thread', () => {
    const src = detail();
    assert.match(src, /customerInteractionApi\.createQuestion\(caseId/);
    assert.match(src, /Jelzem, hogy nem áll rendelkezésre/);
    assert.match(src, /A bekérés állapotát az iroda ellenőrzés után frissíti/);
    assert.match(src, /notAvailableSubject/);
    assert.doesNotMatch(src, /completeRequest|cancelRequest|status: 'COMPLETED'|status: 'NOT_AVAILABLE'/);
    assert.doesNotMatch(src, /questionService|Communication/);
    const backendRoutes = read('../Backend/src/modules/client-interaction/customerRoutes.ts');
    assert.doesNotMatch(backendRoutes, /complete|cancel/);
  });

  it('keeps help on the customer-safe thread surface and hides it when messaging is off', () => {
    const src = detail();
    assert.match(src, /scope="questions"/);
    assert.match(src, /allowAsk=\{canSendMessages\}/);
    assert.match(src, /portálon belüli üzenetküldés nincs engedélyezve/);
  });

  it('links every matter request card to its own detail surface', () => {
    const card = read('src/components/client-portal/CustomerInteractionCard.tsx');
    assert.match(card, /detailHref/);
    assert.match(card, /Bekérés részletei/);
    assert.match(card, /\/portal\/matters\/\$\{encodeURIComponent\(matterPublicationId\)\}\/requests\//);
    assert.match(shell(), /matterPublicationId=\{resourceId\}/);
  });

  it('leaks no internal review or storage fields to the customer surface', () => {
    const src = detail() + read('src/lib/customerRequestDetail.ts');
    assert.doesNotMatch(src, /storageProvider|quarantineStorageReference|scanProvider|scanCodeSafe|reviewedById|acceptedDocumentVersionId|assignedInternalUserId|audienceSnapshot/);
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

  it('records that a structured not-available state is still a documented gap', () => {
    const src = backendRead('src/modules/client-interaction/submissionService.ts');
    assert.doesNotMatch(src, /NOT_AVAILABLE|CUSTOMER_CANNOT_SUPPLY/);
    assert.match(src, /Never trusts the/);
  });
});
