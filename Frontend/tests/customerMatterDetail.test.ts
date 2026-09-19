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
