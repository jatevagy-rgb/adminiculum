/**
 * PHASE 5 TEST FOUNDATION — initial regression tests (GREEN against canonical).
 *
 * Proves the CURRENT canonical invariants that Phase 5 will build on:
 *  - active membership alone does NOT grant arbitrary Case access
 *  - a Case grant does NOT grant arbitrary document access
 *  - exact-version publication is required for customer document visibility
 *  - cross-client Case / document / thread IDs are rejected
 *  - internal Task data is never returned to a customer
 *  - internal assessment/finding data is never returned to a customer
 *  - Outlook/communication data is NOT automatically customer-visible
 *
 * All entities come from the reusable org-portal fixture; authorization is
 * exercised ONLY through the canonical resolvers. No intentionally failing
 * Phase-5 feature tests are included.
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import {
  createOrganizationalPortalFixture,
  OrgPortalFixtureIds,
} from './helpers/organizationalPortalFixture';
import {
  authorizedCustomerContext,
  authorizedParticipantAccess,
} from './helpers/organizationalPortalAuthContext';
import { resolveActiveCustomerGrant } from '../src/modules/client-interaction/base';
import { resolveParticipantAccess } from '../src/modules/client-workspace/organizationalAccessPolicy';
import {
  getPortalDocument,
  getPortalMatter,
  listPortalDocuments,
  listPortalMatters,
} from '../src/modules/client-publication/publicationService';
import { projectCompanyOverviewForCustomer } from '../src/modules/client-company/projector';
import { projectOrganizationForCustomer } from '../src/modules/client-organization/service';
import { projectContractLibraryForCustomer } from '../src/modules/client-contracts/projector';
import { setCanonicalDocument } from '../src/modules/client-contracts/service';
import { listCustomerThreads, getCustomerThread } from '../src/modules/client-interaction/questionService';
import { listCustomerSubmissions } from '../src/modules/client-interaction/submissionService';
import { getOrganizationalHome } from '../src/modules/client-workspace/orgHomeService';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

const ACTOR = (identityId: string, workspaceId: string) => ({ userId: identityId, role: 'CLIENT_PORTAL', workspaceId });

d('Phase 5 org-portal fixture foundation (PostgreSQL)', () => {
  let db: PrismaClient;
  let ids: OrgPortalFixtureIds;
  const seed = crypto.randomUUID();

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.CLIENT_PORTAL_READ_ENABLED = 'true';
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    ids = await createOrganizationalPortalFixture(db, seed);
  });

  afterAll(async () => { await db.$disconnect(); });

  it('active membership alone does not grant arbitrary Case access', async () => {
    // noGrant has an ACTIVE workspace membership but NO case grant.
    await expect(resolveActiveCustomerGrant(ids.noGrantIdentity, ids.caseOne, ids.orgWsA, db))
      .rejects.toMatchObject({ code: 'CLIENT_PORTAL_NO_ACTIVE_GRANT' });
    // authorized has an active grant on caseOne.
    const ctx = await resolveActiveCustomerGrant(ids.authorizedIdentity, ids.caseOne, ids.orgWsA, db);
    expect(ctx.caseId).toBe(ids.caseOne);
    expect(ctx.clientId).toBe(ids.clientA);
    expect(ctx.workspaceId).toBe(ids.orgWsA);
  });

  it('expired membership is denied even with a grant-shaped request', async () => {
    await expect(resolveActiveCustomerGrant(ids.expiredIdentity, ids.caseOne, ids.orgWsA, db))
      .rejects.toMatchObject({ code: 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED' });
  });

  it('inactive identity is denied', async () => {
    await expect(resolveActiveCustomerGrant(ids.inactiveIdentity, ids.caseOne, ids.orgWsA, db))
      .rejects.toMatchObject({ code: 'CLIENT_IDENTITY_NOT_ACTIVE' });
  });

  it('a Case grant does not grant arbitrary document access (permission-scoped)', async () => {
    // authorized has MATTER_READ + DOCUMENT_READ on caseOne, but only MATTER_READ on caseTwo.
    const one = await authorizedParticipantAccess(db, ids.authorizedIdentity, ids.caseOne, ids.orgWsA);
    expect(one.canViewDocuments).toBe(true);
    expect(one.canDownloadDocument).toBe(true);
    const two = await authorizedParticipantAccess(db, ids.authorizedIdentity, ids.caseTwo, ids.orgWsA);
    expect(two.canViewDocuments).toBe(false);
    expect(two.canDownloadDocument).toBe(false);
    // Membership alone (noGrant) has no document permission even with the case id.
    await expect(resolveParticipantAccess(ids.noGrantIdentity, ids.caseOne, ids.orgWsA, db))
      .rejects.toMatchObject({ code: 'CLIENT_PORTAL_NO_ACTIVE_GRANT' });
  });

  it('exact-version publication is required for customer document visibility', async () => {
    // V2 is newer/current for the same Document, but only V1 is published.
    // The customer-safe DTO exposes versionLabel, so this fails if the canonical
    // read path starts resolving a Document's latest version instead of p.documentVersionId.
    const actor = ACTOR(ids.authorizedIdentity, ids.orgWsA);
    const visible = await getPortalDocument(actor, ids.docPublication, db);
    expect(String(visible.id)).toBe(ids.docPublication);
    expect(visible.versionLabel).toBe('Közzétett változat 1');
    expect(visible.versionLabel).not.toBe('Közzétett változat 2');
    // The internal document has NO publication -> no customer-visible id to fetch.
    const publishedDocs = await listPortalDocuments(actor, undefined, db);
    const published = publishedDocs.items.find((item: any) => String(item.id) === ids.docPublication);
    expect(published).toMatchObject({ title: 'Keretszerződés (publikált)', versionLabel: 'Közzétett változat 1' });
    const idsReturned = publishedDocs.items.map((item: any) => String(item.id));
    expect(idsReturned).toContain(ids.docPublication);
    expect(idsReturned).not.toContain(ids.docInternal); // internal doc has no publication row
    // A guessed (non-existent / unpublished) publication id is rejected.
    await expect(getPortalDocument(actor, ids.docInternal, db))
      .rejects.toMatchObject({ code: 'PORTAL_RESOURCE_NOT_FOUND' });
  });

  it('wrong document publication recipient/scope is denied', async () => {
    const actor = ACTOR(ids.authorizedIdentity, ids.orgWsA);
    // The authorized customer is NOT a recipient of the SELECTED_PARTICIPANTS
    // publication (its recipient is a different membership) -> 404.
    await expect(getPortalDocument(actor, ids.docPublicationSelected, db))
      .rejects.toMatchObject({ code: 'PORTAL_RESOURCE_NOT_FOUND' });
    // The WORKSPACE-scoped publication IS visible.
    const visible = await getPortalDocument(actor, ids.docPublication, db);
    expect(String(visible.id)).toBe(ids.docPublication);
  });

  it('cross-client Case ID is rejected', async () => {
    await expect(resolveActiveCustomerGrant(ids.authorizedIdentity, ids.caseCrossClient, ids.orgWsA, db))
      .rejects.toMatchObject({ code: 'CLIENT_PORTAL_NO_ACTIVE_GRANT' });
  });

  it('cross-client document is never visible to the customer', async () => {
    const actor = ACTOR(ids.authorizedIdentity, ids.orgWsA);
    // There is no publication for the client-B document; even a guessed id fails.
    const publishedDocs = await listPortalDocuments(actor, undefined, db);
    const serialized = JSON.stringify(publishedDocs);
    expect(serialized).not.toContain('B dokumentum');
    expect(serialized).not.toContain(ids.docCrossClientVersion);
  });

  it('cross-client thread ID is rejected', async () => {
    const ctx = await authorizedCustomerContext(db, ids.authorizedIdentity, ids.caseOne, ids.orgWsA);
    // The cross-client thread belongs to a different Case/Client.
    await expect(getCustomerThread(ctx, ids.threadCrossClient, db))
      .rejects.toMatchObject({ code: 'THREAD_NOT_FOUND' });
    const threads = await listCustomerThreads(ctx, db);
    const serialized = JSON.stringify(threads);
    expect(serialized).not.toContain('B ügyfél szál');
    expect(serialized).not.toContain(ids.threadCrossClient);
  });

  it('internal Task data is never returned to the customer', async () => {
    const actor = ACTOR(ids.authorizedIdentity, ids.orgWsA);
    const matters = await listPortalMatters(actor, db);
    const serialized = JSON.stringify(matters);
    expect(serialized).not.toContain('Internal task one');
    expect(serialized).not.toContain('Internal task with note');
    expect(serialized).not.toContain('taskStatus');
    expect(serialized).not.toContain('taskNotes');
    const matter = await getPortalMatter(actor, ids.matterPub, db);
    expect(JSON.stringify(matter)).not.toContain('Internal task');
  });

  it('internal assessment/finding data is never returned to the customer', async () => {
    const company = await projectCompanyOverviewForCustomer(ids.clientA, db);
    const json = JSON.stringify(company);
    expect(json).not.toContain('Hiányzó irányítás'); // finding title
    expect(json).not.toContain('recommendation');
    expect(json).not.toContain('severity');
    expect(json).not.toContain('verificationStatus');
    expect(json).not.toContain('internalNote');
    const org = await projectOrganizationForCustomer(ids.clientA, db);
    const orgJson = JSON.stringify(org);
    expect(orgJson).not.toContain('Inaktív személy'); // inactive persons not projected
    expect(orgJson).not.toContain('employmentStatus');
    expect(orgJson).not.toContain('responsibilitiesSummary');
  });

  it('customer-safe contract projection requires published exact document version', async () => {
    // No published versions yet -> nothing.
    expect((await projectContractLibraryForCustomer(ids.clientA, new Set(), db)).items).toEqual([]);
    // Link the published contract to its canonical published version.
    await setCanonicalDocument({ userId: ids.adminId, role: 'ADMIN' }, ids.contractPublished, ids.docPublishedVersion, db);
    const view = await projectContractLibraryForCustomer(ids.clientA, new Set([ids.docPublishedVersion]), db);
    const items = view.items as any[];
    expect(items.length).toBeGreaterThanOrEqual(1);
    const published = items.find((item) => String(item.id) === ids.contractPublished);
    expect(published).toBeTruthy();
    // The internal-only and non-publication contracts never appear.
    expect(items.find((item) => String(item.id) === ids.contractInternalOnly)).toBeUndefined();
    expect(items.find((item) => String(item.id) === ids.contractNoPublication)).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain('internalNote');
    expect(JSON.stringify(view)).not.toContain('lawFirmOwnerUserId');
    expect(JSON.stringify(view)).not.toContain('securityClassification');
  });

  it('customer contract projection does not leak the internal contract or cross-client data', async () => {
    const view = await projectContractLibraryForCustomer(ids.clientA, new Set([ids.docPublishedVersion]), db);
    const json = JSON.stringify(view);
    expect(json).not.toContain('B ügyfél szerződés');
    expect(json).not.toContain(ids.contractCrossClient);
    expect(json).not.toContain('tárgyalási anyag'); // internal-only contract title
  });

  it('Outlook/communication data is not automatically customer-visible', async () => {
    // A workforce Communication record (e.g. imported Outlook mail) is NOT a
    // ClientQuestionThread and must never appear in the customer thread list.
    await db.communication.create({
      data: {
        id: crypto.randomUUID(),
        type: 'EMAIL',
        subject: 'Belső Outlook levél',
        caseId: ids.caseOne,
        clientId: ids.clientA,
        createdById: ids.lawyerId,
        senderEmail: 'lawyer@firm.invalid',
        content: 'Bizalmas belső levél',
      } as never,
    });
    const ctx = await authorizedCustomerContext(db, ids.authorizedIdentity, ids.caseOne, ids.orgWsA);
    const threads = await listCustomerThreads(ctx, db);
    const serialized = JSON.stringify(threads);
    expect(serialized).not.toContain('Belső Outlook levél');
    expect(serialized).not.toContain('Bizalmas belső levél');
  });

  it('HR-confidential / internal document is not customer-visible by membership, grant or co-publication', async () => {
    // The authorized customer has workspace membership + Case grant + a published
    // document in the same Case. None of these may surface the HR_CONFIDENTIAL
    // document, which has no ClientDocumentPublication.
    const actor = ACTOR(ids.authorizedIdentity, ids.orgWsA);
    const docs = await listPortalDocuments(actor, undefined, db);
    const json = JSON.stringify(docs);
    expect(json).not.toContain('HR dokumentum');
    expect(json).not.toContain('HR v1');
    expect(json).not.toContain(ids.docHrConfidential);
    expect(json).not.toContain(ids.docHrConfidentialVersion);
    // A guessed publication id pointing at the HR doc/version is not a resource.
    await expect(getPortalDocument(actor, ids.docHrConfidential, db))
      .rejects.toMatchObject({ code: 'PORTAL_RESOURCE_NOT_FOUND' });
  });

  it('non-CLEAN uploaded file never becomes a customer document or CLEAN by implication', async () => {
    const ctx = await authorizedCustomerContext(db, ids.authorizedIdentity, ids.caseOne, ids.orgWsA);
    const subs = await listCustomerSubmissions(ctx, undefined, db);
    const submission = subs.items.find((s: any) => String(s.id) === ids.submissionA);
    expect(submission).toBeTruthy();
    // The SCANNING file is reported as a client-safe PROCESSING state, never
    // RECEIVED/CLEAN, and never promoted to a Document/DocumentVersion.
    const file = (submission.files || []).find((f: any) => String(f.id) === ids.submissionFileNotClean);
    expect(file).toBeTruthy();
    expect(file.state).toBe('PROCESSING');
    expect(file.state).not.toBe('RECEIVED');
    // No DocumentVersion was created from the non-CLEAN file.
    const promoted = await db.documentVersion.findFirst({
      where: { originalFileName: 'scan_pending.pdf' },
    });
    expect(promoted).toBeNull();
    const doc = await db.document.findFirst({ where: { name: 'scan_pending.pdf' } });
    expect(doc).toBeNull();
  });

  it('org home authorization: membership without Case grant shows no matters and no journey', async () => {
    // noGrant holds an ACTIVE membership but no case grant -> home lists no matters.
    const home = await getOrganizationalHome(ids.noGrantIdentity, ids.orgWsA, db);
    expect(home.customer.name).toBeTruthy();
    expect(home.matters).toEqual([]);
    expect(home.currentMatter).toBeUndefined();
    expect(home.actions).toEqual([]);
    expect(home.recentDocuments).toEqual([]);
    expect(home.contactSummary.openCount).toBe(0);
  });

  it('org home authorization: inactive identity is denied at the workspace boundary', async () => {
    await expect(getOrganizationalHome(ids.inactiveIdentity, ids.orgWsA, db))
      .rejects.toMatchObject({ code: 'CLIENT_IDENTITY_NOT_ACTIVE' });
  });

  it('org home shows only granted matters, from immutable published revision', async () => {
    const home = await getOrganizationalHome(ids.authorizedIdentity, ids.orgWsA, db);
    // authorized has grants on caseOne (REQUESTER) and caseTwo (PARTICIPANT).
    const refs = home.matters.map((m) => m.publicReference);
    expect(refs.length).toBeGreaterThanOrEqual(1);
    // The current journey comes from the published matter revision.
    expect(home.currentMatter).toBeTruthy();
    if (home.currentMatter) {
      expect(home.currentMatter.title).toBeTruthy();
      expect(home.currentMatter.status).toBeTruthy();
      // Eddig -> published milestones (immutable snapshot).
      expect(Array.isArray(home.currentMatter.milestones)).toBe(true);
      // Most -> published current position.
      expect(home.currentMatter.currentPosition).toBeTruthy();
      // Következőként -> published next step / neutral text.
      expect(typeof home.currentMatter.nextStep).toBe('string');
    }
  });

  it('org home recent documents are exact-version published only, no internal doc', async () => {
    const home = await getOrganizationalHome(ids.authorizedIdentity, ids.orgWsA, db);
    const json = JSON.stringify(home.recentDocuments);
    // The published exact-version document is present; the internal doc is not.
    expect(json).toContain('Keretszerződés');
    expect(json).not.toContain('Belső vázlat');
    expect(json).not.toContain('HR dokumentum');
    expect(json).not.toContain('scan_pending');
  });

  it('org home contact summary reflects only participant-authorized threads', async () => {
    const home = await getOrganizationalHome(ids.authorizedIdentity, ids.orgWsA, db);
    // threadA belongs to caseOne (authorized, participant) and is OPEN.
    expect(home.contactSummary.openCount).toBeGreaterThanOrEqual(1);
    // The cross-client thread (caseCrossClient, client B) must never surface.
    const json = JSON.stringify(home.contactSummary);
    expect(json).not.toContain('B ügyfél szál');
  });

  it('org home never leaks internal Task / finding / storage data', async () => {
    const home = await getOrganizationalHome(ids.authorizedIdentity, ids.orgWsA, db);
    const json = JSON.stringify(home);
    for (const forbidden of ['workInstruction', 'taskNotes', 'Internal task', 'Hiányzó irányítás', 'spItemId', 'sharePoint', 'assessmentFinding', 'internalOwner', 'reviewer']) {
      expect(json.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('org home action summary is customer action objects, not internal Task', async () => {
    const home = await getOrganizationalHome(ids.authorizedIdentity, ids.orgWsA, db);
    expect(Array.isArray(home.actions)).toBe(true);
    // Actions carry customer-safe type labels only; internal task fields absent.
    const json = JSON.stringify(home.actions);
    expect(json).not.toContain('taskNotes');
    expect(json).not.toContain('workInstruction');
    expect(json).not.toContain('Internal task');
  });
});
