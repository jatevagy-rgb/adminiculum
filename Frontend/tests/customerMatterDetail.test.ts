import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Customer matter detail composition (source contract).
 *
 * Salvaged from PR #274 and adapted to current master: customer document/data
 * requests are a FIRST-CLASS matter section, independent of the message
 * capability, while portal questions/messages stay in the explicit question
 * surface. No internal Task / deadline / Communication data may appear here.
 */

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('customer matter detail composition (source contract)', () => {
  const matter = () => read('src/components/client-portal/MatterWorkspace.tsx');
  const shell = () => read('src/components/client-portal/ClientPortalShell.tsx');
  const orgViews = () => read('src/components/client-portal/OrganizationPortalViews.tsx');
  const interaction = () => read('src/components/client-portal/CustomerInteractionCard.tsx');

  it('presents the canonical customer-safe matter sections', () => {
    const src = matter();
    for (const section of ['Ügy áttekintése', 'Most itt tartunk', 'Mire várunk?', 'Kapcsolattartó', 'Az ügy előrehaladása', 'Dokumentumok', 'Teendők', 'Frissítések']) {
      assert.ok(src.includes(section), `matter detail is missing: ${section}`);
    }
    assert.match(src, /matter\.publicDeadlines/);
    assert.match(src, /matter\.estimatedTiming/);
    assert.match(src, /matter\.responsibleLawyerDisplay/);
    assert.match(src, /matter\.milestones/);
    assert.match(src, /matter\.documents/);
    assert.match(src, /matter\.actionRequests/);
    assert.match(src, /matter\.updates/);
  });

  it('surfaces customer-visible ClientRequests as a first-class matter section', () => {
    const src = matter();
    assert.match(src, /requestsSection\?: React\.ReactNode/);
    assert.match(src, /\{requestsSection\}/);
    // rendered as its own section, not inside the message/communication slot
    assert.match(src, /\{requestsSection\}\s*\n\s*\{showMessages && communicationSection \? communicationSection : null\}/);
    const shellSrc = shell();
    assert.match(shellSrc, /requestsSection=\{<CustomerInteractionCard caseId=\{state\.matter\.caseId\} matterPublicationId=\{resourceId\} scope="requests" \/>\}/);
    assert.match(shellSrc, /communicationSection=\{<CustomerInteractionCard caseId=\{state\.matter\.caseId\} allowAsk=\{Boolean\(state\.matter\.messageCapabilities\?\.canSend\)\} matterPublicationId=\{resourceId\} scope="questions" \/>\}/);
  });

  it('keeps the request response capability (upload, note, submit, detail link) intact', () => {
    const src = interaction();
    assert.match(src, /scope\?: 'all' \| 'requests' \| 'questions'/);
    assert.match(src, /heading \|\| 'Amit Öntől kérünk'/);
    assert.match(src, /const requestsPanel = \(/);
    assert.match(src, /<RequestResponseCard/);
    assert.match(src, /detailHref=\{matterPublicationId \? `\/portal\/matters\/\$\{encodeURIComponent\(matterPublicationId\)\}\/requests\//);
    assert.match(src, /Ügyvédi bekérések/);
    assert.match(src, /Nincs aktív dokumentum- vagy adatbekérés\./);
    // Upload + note + submit stay wired through the same canonical API.
    assert.match(src, /customerInteractionApi\.uploadFile\(/);
    assert.match(src, /customerInteractionApi\.submitSubmission\(/);
    assert.match(src, /onAnswer=\{/);
    assert.match(src, /onNote=\{/);
    assert.match(src, /onReload=\{load\}/);
    assert.match(src, /submission=\{submissions\.find\(\(submission\) => submission\.requestId === request\.id\)\}/);
  });

  it('renders the same composition for ORGANIZATION and CASE_RELAY matters', () => {
    const src = orgViews();
    assert.match(src, /requestsSection=\{\s*<CustomerInteractionCard caseId=\{matter\.caseId\} matterPublicationId=\{detail\.matterPublicationId\} scope="requests" \/>/);
    assert.match(src, /communicationSection=\{\s*<CustomerInteractionCard caseId=\{matter\.caseId\} allowAsk=\{detail\.capabilities\.allowMessages\} matterPublicationId=\{detail\.matterPublicationId\} scope="questions" \/>/);
    assert.match(src, /showDocuments=\{detail\.capabilities\.showDocuments\}/);
    assert.match(src, /showMessages=\{detail\.capabilities\.showMessages\}/);
    // Both ORGANIZATION and CASE_RELAY are routed through OrganizationPortalViews.
    assert.match(shell(), /mode === 'ORGANIZATION' \|\| state\.context\.selectedWorkspace\?\.mode === 'CASE_RELAY'/);
  });

  it('does not tie published requests to the message capability', () => {
    const src = matter();
    assert.doesNotMatch(src, /\{showMessages \? requestsSection|requestsSection.*showMessages/);
    // only the contact/communication slot stays behind the message capability
    assert.match(src, /\{showMessages && communicationSection \? communicationSection : null\}/);
  });

  it('keeps requests visible when the messaging capability is off', () => {
    // showMessages=false must hide the question/message surface only; the
    // requests node is rendered from its own prop, outside that gate.
    const src = matter();
    const requestsIndex = src.indexOf('{requestsSection}');
    const gateIndex = src.indexOf('{showMessages && communicationSection ? communicationSection : null}');
    assert.ok(requestsIndex > -1 && gateIndex > -1, 'both slots must exist');
    assert.ok(requestsIndex < gateIndex, 'requests render before the message gate');
    assert.doesNotMatch(src.slice(requestsIndex, gateIndex), /showMessages/);
  });

  it('exposes no internal case, task or communication data on the matter detail', () => {
    const src = matter() + interaction();
    assert.doesNotMatch(src, /workforceInteractionApi|workInstruction|internalNotes|internalStrategy|taskNotes|communicationBody|annotation/i);
    assert.doesNotMatch(src, /CaseIntakeDeadline|case\.deadline|caseDeadline|dueDate/);
    assert.doesNotMatch(src, /\/api\/v1\/cases|@\/lib\/cases/);
    // documents/actions/updates/milestones come only from the published matter projection
    assert.doesNotMatch(src, /listPortalDocuments\(|clientDocumentPublications|documentVersionId/);
  });

  it('preserves current organization portal routes, Grow, Compliance and company behavior', () => {
    const src = orgViews();
    for (const view of ['"home"', '"matters"', '"matter"', '"documents"', '"messages"', '"tasks"', '"contracts"', '"company"', '"grow"', '"compliance"', '"intakes"', '"new-intake"', '"leadership"']) {
      assert.ok(src.includes(`view === ${view}`), `organization view lost: ${view}`);
    }
    // Grow minimal header (newer master behavior) must stay intact.
    assert.match(src, /data-testid="org-context-minimal"/);
    assert.match(src, /view !== "grow" \?/);
    assert.match(src, /<OrgGrowView \/>/);
    assert.match(src, /<OrgComplianceView \/>/);
    assert.match(src, /<OrganizationCompany /);
    assert.match(src, /data-testid="organization-client-portal"/);
  });
});

describe('customer matter projection boundary (backend source contract)', () => {
  const publication = () => readFileSync(path.join(root, '..', 'Backend', 'src', 'modules', 'client-publication', 'publicationService.ts'), 'utf8');

  it('reads the matter from the immutable published revision only', () => {
    const src = publication();
    const body = src.match(/export async function getPortalMatter[\s\S]*?\r?\n\}\r?\n/);
    assert.ok(body, 'getPortalMatter not found');
    assert.match(body![0], /r\.id=p\."currentRevisionId"/);
    assert.match(body![0], /p\.status='PUBLISHED'::"ClientPublicationStatus"/);
    assert.match(body![0], /context\.caseIds\.includes\(String\(row\.caseId\)\)/);
    assert.match(body![0], /audienceAllows\(row, context\.grants, 'MATTER_READ'\)/);
    assert.match(body![0], /clientSafeTitle|clientSafeStatus|clientSafeNextStep|clientSafeCurrentPosition|clientSafeWaitingOn/);
    assert.match(body![0], /milestonesSnapshot|publishedDeadlinesSnapshot/);
    assert.match(body![0], /assertNoForbiddenPortalFields\(dto\)/);
  });

  it('never reads internal work items in the customer matter read path', () => {
    const src = publication();
    const body = src.match(/export async function getPortalMatter[\s\S]*?\r?\n\}\r?\n/)![0];
    assert.doesNotMatch(body, /\btasks\b|Task\b|deadline\b(?!sSnapshot)|internalNotes|workInstruction/);
    assert.doesNotMatch(body, /INSERT|UPDATE |DELETE/);
  });

  it('keeps the published-only and audience filters on documents, actions and updates', () => {
    const src = publication();
    assert.match(src, /WHERE p\.status='PUBLISHED'::"ClientPublicationStatus" AND p\."caseId"=ANY\(\$1::text\[\]\)/);
    assert.match(src, /documentVisibleForContext\(row, context, 'DOCUMENT_READ'\)/);
    assert.match(src, /WHERE status='PUBLISHED'::"ClientActionRequestStatus" AND "caseId"=ANY\(\$1::text\[\]\)/);
    assert.match(src, /WHERE status='PUBLISHED'::"ClientSafeUpdateStatus" AND "caseId"=ANY\(\$1::text\[\]\)/);
  });

  it('keeps milestone progress internal (published milestones only reach the customer)', () => {
    const src = publication();
    const mapper = src.match(/function toPortalMatter[\s\S]*?assertNoForbiddenPortalFields\(dto\)/);
    assert.ok(mapper, 'toPortalMatter not found');
    assert.doesNotMatch(mapper![0], /progressPercentage/);
    const milestones = src.match(/export function toCustomerMilestones[\s\S]*?\r?\n\}\r?\n/);
    assert.ok(milestones, 'toCustomerMilestones not found');
    assert.match(milestones![0], /publicKey|safeTitle|safeDescription|completionState/);
    assert.doesNotMatch(milestones![0], /taskId|task\b|weight\s*=\s*row|internal/);
  });
});

/**
 * #287 semantic slice — capability gates and journey proof on current master.
 *
 * Audit result: the runtime composition introduced by #287 (requestsSection on
 * MatterView, scope="requests" / scope="questions" on CustomerInteractionCard,
 * the canonical request detail link and the request response journey) is already
 * present on current master (landed with 69e30723 and extended by newer portal
 * work). These contracts lock the exact gates the slice must keep, so the slice
 * can be verified without copying stale files. The names map 1:1 to the
 * acceptance gates.
 */
describe('#287 request / question separation gates (current master)', () => {
  const matter = () => read('src/components/client-portal/MatterWorkspace.tsx');
  const shell = () => read('src/components/client-portal/ClientPortalShell.tsx');
  const orgViews = () => read('src/components/client-portal/OrganizationPortalViews.tsx');
  const interaction = () => read('src/components/client-portal/CustomerInteractionCard.tsx');
  const requestDetail = () => read('src/components/client-portal/CustomerRequestDetail.tsx');

  it('INDIVIDUAL_REQUESTS_FIRST_CLASS / ORGANIZATION_REQUESTS_FIRST_CLASS / CASE_RELAY_REQUESTS_FIRST_CLASS', () => {
    // INDIVIDUAL: the non-collaboration matter route renders MatterView with both slots.
    const shellSrc = shell();
    assert.match(shellSrc, /\{state\.status === 'ready' && state\.context\.selectedWorkspace\?\.mode !== 'ORGANIZATION' && state\.context\.selectedWorkspace\?\.mode !== 'CASE_RELAY' && view === 'matter' && !state\.requestDetail && !state\.requestUnavailable && state\.matter \? \(\s*\n\s*<MatterView/);
    assert.match(shellSrc, /<MatterView[\s\S]{0,600}requestsSection=\{<CustomerInteractionCard caseId=\{state\.matter\.caseId\} matterPublicationId=\{resourceId\} scope="requests" \/>\}/);
    assert.match(shellSrc, /communicationSection=\{<CustomerInteractionCard caseId=\{state\.matter\.caseId\} allowAsk=\{Boolean\(state\.matter\.messageCapabilities\?\.canSend\)\} matterPublicationId=\{resourceId\} scope="questions" \/>\}/);
    // ORGANIZATION + CASE_RELAY are routed to the same collaboration views.
    assert.match(shellSrc, /mode === 'ORGANIZATION' \|\| state\.context\.selectedWorkspace\?\.mode === 'CASE_RELAY'[\s\S]{0,600}<OrganizationPortalViews/);
    const orgSrc = orgViews();
    assert.match(orgSrc, /requestsSection=\{\s*\n?\s*<CustomerInteractionCard caseId=\{matter\.caseId\} matterPublicationId=\{detail\.matterPublicationId\} scope="requests" \/>/);
    assert.match(orgSrc, /communicationSection=\{\s*\n?\s*<CustomerInteractionCard caseId=\{matter\.caseId\} allowAsk=\{detail\.capabilities\.allowMessages\} matterPublicationId=\{detail\.matterPublicationId\} scope="questions" \/>/);
  });

  it('MESSAGING_DISABLED_QUESTIONS_HIDDEN / MESSAGING_DISABLED_REQUESTS_STILL_VISIBLE', () => {
    const src = matter();
    // Only the communication slot sits behind the message gate.
    assert.match(src, /\{showMessages && communicationSection \? communicationSection : null\}/);
    assert.doesNotMatch(src, /showMessages &&[^}]*requestsSection/);
    assert.doesNotMatch(src, /\{showMessages \? requestsSection/);
    // The requests node renders from its own prop, before the message gate.
    const requestsIndex = src.indexOf('{requestsSection}');
    const gateIndex = src.indexOf('{showMessages && communicationSection ? communicationSection : null}');
    assert.ok(requestsIndex > -1 && gateIndex > -1, 'both slots must exist');
    assert.ok(requestsIndex < gateIndex, 'requests render independently of the message gate');
    // Organization/case-relay composition never wraps the requests node in a capability condition.
    const orgSrc = orgViews();
    assert.match(orgSrc, /showMessages=\{detail\.capabilities\.showMessages\}\s*\n\s*requestsSection=\{/);
    assert.doesNotMatch(orgSrc, /\(\s*showMessages[\s\S]{0,80}requestsSection=/);
  });

  it('SHOW_DOCUMENTS_GATE_HIDES_ONLY_PUBLICATIONS / REQUEST_UPLOAD_FOLLOWS_REQUEST_SEMANTICS', () => {
    const src = matter();
    const gated = src.match(/\{showDocuments \? \([\s\S]*?\n\s*\) : null\}/);
    assert.ok(gated, 'showDocuments gate not found');
    assert.match(gated![0], /Dokumentumok/);
    assert.doesNotMatch(gated![0], /requestsSection/);
    // The generic matter-document flag never reaches the request response surface.
    const card = interaction();
    assert.doesNotMatch(card, /showDocuments/);
    assert.match(card, /const allowsDocumentUpload = requestAllowsDocumentUpload\(request\.type\)/);
    assert.match(card, /export function requestAllowsDocumentUpload\(type: CustomerRequestDTO\['type'\]\): boolean \{/);
    for (const type of ['DOCUMENT_UPLOAD', 'MISSING_DOCUMENT_REQUEST', 'CORRECTION_REQUEST']) {
      assert.ok(card.includes(`type === '${type}'`), `canonical upload request type lost: ${type}`);
    }
  });

  it('REQUEST_DETAIL_LINK / REQUEST_DETAIL_JOURNEY_FOR_ALL_MODES', () => {
    // Canonical link shape from the request card and the organization helper.
    assert.match(interaction(), /detailHref=\{matterPublicationId \? `\/portal\/matters\/\$\{encodeURIComponent\(matterPublicationId\)\}\/requests\/\$\{encodeURIComponent\(request\.id\)\}` : undefined\}/);
    assert.match(orgViews(), /return `\/portal\/matters\/\$\{encodeURIComponent\(matterId\)\}\/requests\/\$\{encodeURIComponent\(requestId\)\}`/);
    // INDIVIDUAL journey.
    const shellSrc = shell();
    assert.match(shellSrc, /customerInteractionApi\.getRequest\(matter\.caseId, requestId\)/);
    assert.match(shellSrc, /<CustomerRequestDetail[\s\S]{0,600}publicationId=\{resourceId \|\| ''\}[\s\S]{0,400}request=\{state\.requestDetail\.request\}/);
    // ORGANIZATION / CASE_RELAY journey.
    const orgSrc = orgViews();
    assert.match(orgSrc, /view === "matter" && requestId/);
    assert.match(orgSrc, /customerInteractionApi\.getRequest\(matter\.caseId, requestId\)/);
    assert.match(orgSrc, /<CustomerRequestDetail[\s\S]{0,600}request=\{state\.requestDetail\.request\}/);
  });

  it('REQUEST_FIELD_ANSWER / REQUEST_NOTE / REQUEST_SUBMIT / REQUEST_RESUBMIT', () => {
    const card = interaction();
    assert.match(card, /customerInteractionApi\.submitAnswers\(caseId, submissionId, filled\)/);
    assert.match(card, /onAnswer=\{\(fieldId, value\) =>/);
    assert.match(card, /onNote=\{\(value\) =>/);
    assert.match(card, /customerInteractionApi\.uploadFile\(caseId, submissionId, \{/);
    assert.match(card, /customerInteractionApi\.submitSubmission\(caseId, submissionId, note\)/);
    assert.match(card, /items\.some\(\(i\) => i\.status === 'error'\) \? 'Sikertelen fájlok újraküldése' : 'Válasz beküldése'/);
    assert.match(card, /onReload=\{load\}/);
    assert.match(card, /await onReload\(\)/);
  });

  it('NO_INTERNAL_DATA_LEAK on the request detail surfaces', () => {
    const src = requestDetail() + orgViews();
    assert.doesNotMatch(src, /workforceInteractionApi|workInstruction|internalNotes|internalStrategy|taskNotes/i);
    assert.doesNotMatch(src, /CaseIntakeDeadline|case\.deadline|caseDeadline|progressPercentage/);
    assert.doesNotMatch(src, /mailboxBody|communicationBody|rawBody|annotation/i);
    assert.doesNotMatch(src, /documentVersionId|storageReference|scanProvider/);
  });

  it('REQUESTS_INDEPENDENT_OF_MESSAGE_GATE at the canonical API boundary', () => {
    const backendRoot = path.join(root, '..', 'Backend', 'src', 'modules', 'client-interaction');
    const requestService = readFileSync(path.join(backendRoot, 'requestService.ts'), 'utf8');
    const submissionService = readFileSync(path.join(backendRoot, 'submissionService.ts'), 'utf8');
    const base = readFileSync(path.join(backendRoot, 'base.ts'), 'utf8');
    const customerRoutes = readFileSync(path.join(backendRoot, 'customerRoutes.ts'), 'utf8');
    // Customer request reads resolve the portal workspace + active case grant only.
    assert.match(customerRoutes, /const workspace = await resolvePortalWorkspace\(req\.clientPortalSession, req\.header\('x-client-portal-workspace'\)\)/);
    assert.match(customerRoutes, /return resolveActiveCustomerGrant\(identityId, caseId, workspace\.id\)/);
    // Published requests are a request-status/audience concern, never a message capability.
    assert.match(requestService, /const CUSTOMER_VISIBLE = \['PUBLISHED', 'PARTIALLY_SUBMITTED', 'SUBMITTED', 'UNDER_INTERNAL_REVIEW', 'CORRECTION_REQUESTED', 'COMPLETED'\]/);
    assert.match(requestService, /export async function listCustomerRequests\(ctx: CustomerContext/);
    for (const source of [requestService, submissionService, base]) {
      assert.doesNotMatch(source, /canViewMessages|canSendMessages|requirePermission/);
    }
    // The message capability gates only the question surface.
    const questionService = readFileSync(path.join(backendRoot, 'questionService.ts'), 'utf8');
    assert.match(questionService, /requirePermission\(access, 'canViewMessages', 'CLIENT_MESSAGES_READ_DENIED'\)/);
    assert.match(questionService, /requirePermission\(access, 'canSendMessages', 'CLIENT_MESSAGES_SEND_DENIED'\)/);
  });
});
