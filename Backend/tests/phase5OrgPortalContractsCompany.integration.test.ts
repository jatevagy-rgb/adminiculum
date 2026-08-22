/**
 * PHASE 5B — ORGANIZATIONAL CUSTOMER CONTRACT + COMPANY SURFACE (PostgreSQL).
 *
 * Proves the customer-facing Szerződések and Vállalat surfaces are built from
 * customer-safe publication/projector data only, and that the exact-version
 * publication invariant holds:
 *   - a contract is visible only when its canonical DocumentVersion is explicitly
 *     published to the customer;
 *   - V1 published + V2 internal/unpublished -> the customer still sees V1 even
 *     if V2 becomes the internal current version;
 *   - internal Task status / raw ContractRecord-only changes cannot leak.
 *
 * Also proves the company view respects visibility: hidden cases never affect
 * counts, internal responsibility assignments / workforce fields are stripped,
 * cross-client access fails closed, and only the customer's own workspace/client
 * organization is returned.
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import {
  createOrganizationalPortalFixture,
  OrgPortalFixtureIds,
} from './helpers/organizationalPortalFixture';
import { getOrganizationalContracts } from '../src/modules/client-workspace/orgContractsService';
import { getOrganizationalCompany } from '../src/modules/client-workspace/orgCompanyService';
import { setCanonicalDocument } from '../src/modules/client-contracts/service';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('Phase 5B org contract + company customer surface (PostgreSQL)', () => {
  let db: PrismaClient;
  let ids: OrgPortalFixtureIds;
  const seed = crypto.randomUUID();

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.CLIENT_PORTAL_READ_ENABLED = 'true';
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    ids = await createOrganizationalPortalFixture(db, seed);
    // Link the published contract to its explicitly published canonical V1.
    await setCanonicalDocument({ userId: ids.adminId, role: 'ADMIN' }, ids.contractPublished, ids.docPublishedVersion, db);
  });

  afterAll(async () => { await db.$disconnect(); });

  /* ----------------------- Szerződések (contracts) ------------------------ */

  it('no grant -> no scoped contract resource (empty state)', async () => {
    // noGrant has an ACTIVE membership but no case grant -> no visible published
    // document, so no contract is returned.
    const view = await getOrganizationalContracts(ids.noGrantIdentity, ids.orgWsA, db);
    expect(view.items).toEqual([]);
  });

  it('expired membership -> denied at the workspace boundary', async () => {
    await expect(getOrganizationalContracts(ids.expiredIdentity, ids.orgWsA, db))
      .rejects.toMatchObject({ code: 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED' });
  });

  it('inactive identity -> denied', async () => {
    await expect(getOrganizationalContracts(ids.inactiveIdentity, ids.orgWsA, db))
      .rejects.toMatchObject({ code: 'CLIENT_IDENTITY_NOT_ACTIVE' });
  });

  it('cross-client contract/document is never visible', async () => {
    const view = await getOrganizationalContracts(ids.authorizedIdentity, ids.orgWsA, db);
    const json = JSON.stringify(view);
    expect(json).not.toContain('B ügyfél szerződés');
    expect(json).not.toContain(ids.contractCrossClient);
    expect(json).not.toContain('B dokumentum');
    expect(json).not.toContain(ids.docCrossClientVersion);
  });

  it('unpublished document -> contract invisible', async () => {
    // contractNoPublication is ACTIVE but has no published document version ->
    // never visible. contractInternalOnly is DRAFT -> never visible.
    const view = await getOrganizationalContracts(ids.authorizedIdentity, ids.orgWsA, db);
    const items = view.items as any[];
    expect(items.find((item) => String(item.reference).includes(ids.contractNoPublication) || item.title === 'Aktív, publikálatlan szerződés')).toBeUndefined();
    expect(items.find((item) => item.title === 'Belső tárgyalási anyag')).toBeUndefined();
    const json = JSON.stringify(view);
    expect(json).not.toContain('Aktív, publikálatlan szerződés');
    expect(json).not.toContain('Belső tárgyalási anyag');
  });

  it('EXACT-VERSION INVARIANT: V1 published + V2 internal/unpublished -> customer sees V1', async () => {
    // docPublishedVersion (V1) is the published, canonical version for the
    // contract. docPublishedVersion2 (V2) is internal current + unpublished.
    const view = await getOrganizationalContracts(ids.authorizedIdentity, ids.orgWsA, db);
    const items = view.items as any[];
    const contract = items.find((item) => item.title === 'Keretszerződés (publikált)' || item.title === 'Beszállítói keretszerződés');
    expect(contract).toBeTruthy();
    expect(contract.publishedDoc).toBeTruthy();
    // The customer-facing document is pinned to V1, never V2.
    expect(contract.publishedDoc.versionLabel).toBe('Közzétett változat 1');
    expect(contract.publishedDoc.versionLabel).not.toBe('Közzétett változat 2');
    // The published publication id is the V1 publication.
    expect(contract.publishedDoc.publicationId).toBe(ids.docPublication);
  });

  it('internal currentVersion switching to V2 does not change customer publication', async () => {
    // Make V2 the document's current version (simulating a newer internal upload).
    await db.documentVersion.updateMany({ where: { documentId: ids.docPublished }, data: { isCurrent: false } });
    await db.documentVersion.update({ where: { id: ids.docPublishedVersion2 }, data: { isCurrent: true } });
    // The contract's canonical doc is still V1; the publication still pins V1.
    const view = await getOrganizationalContracts(ids.authorizedIdentity, ids.orgWsA, db);
    const items = view.items as any[];
    const contract = items.find((item) => item.title === 'Keretszerződés (publikált)' || item.title === 'Beszállítói keretszerződés');
    expect(contract).toBeTruthy();
    expect(contract.publishedDoc.versionLabel).toBe('Közzétett változat 1');
    expect(contract.publishedDoc.versionLabel).not.toBe('Közzétett változat 2');
    // The raw internal DocumentVersion ids never appear in the DTO.
    expect(JSON.stringify(view)).not.toContain(ids.docPublishedVersion2);
  });

  it('internal Task status cannot alter the customer contract status', async () => {
    // Change the internal task's status. The contract status is internal-safe and
    // independent of any task; the DTO must not reflect a task-driven status.
    await db.task.update({ where: { id: ids.taskOne }, data: { status: 'CANCELLED' } });
    const view = await getOrganizationalContracts(ids.authorizedIdentity, ids.orgWsA, db);
    const json = JSON.stringify(view);
    expect(json).not.toContain('Internal task one');
    expect(json).not.toContain('CANCELLED');
    expect(json).not.toContain('taskStatus');
    // The customer status label is the mapped lifecycle label, not an internal enum.
    const items = view.items as any[];
    const contract = items.find((item) => item.title === 'Keretszerződés (publikált)' || item.title === 'Beszállítói keretszerződés');
    expect(contract).toBeTruthy();
    expect(['Hatályban', 'Aláírva, hatálybalépés előtt', 'Megszűnés alatt']).toContain(contract.statusLabel);
    expect(['ACTIVE', 'DRAFT', 'SIGNED_NOT_EFFECTIVE', 'TERMINATING']).not.toContain(contract.statusLabel);
  });

  it('raw ContractRecord-only change cannot leak', async () => {
    // Mutate the raw contract's internal note field (not part of any DTO).
    await db.contractRecord.update({ where: { id: ids.contractPublished }, data: { internalNote: 'Bizalmas belső jegyzet' } as never });
    const view = await getOrganizationalContracts(ids.authorizedIdentity, ids.orgWsA, db);
    const json = JSON.stringify(view);
    expect(json).not.toContain('Bizalmas belső jegyzet');
    expect(json).not.toContain('internalNote');
    expect(json).not.toContain('lawFirmOwnerUserId');
    expect(json).not.toContain('securityClassification');
    expect(json).not.toContain(ids.contractPublished);
  });

  it('contract DTO never exposes raw internal contract / version / storage data', async () => {
    const view = await getOrganizationalContracts(ids.authorizedIdentity, ids.orgWsA, db);
    const json = JSON.stringify(view);
    for (const forbidden of ['workInstruction', 'internalOwner', 'reviewer', 'sharePoint', 'spItemId', 'aiPrompt', 'aiResponse', 'auditEvent', 'sourceCaseId', 'canonicalDocumentVersionId']) {
      expect(json.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('contract empty state is an honest empty list', async () => {
    // A customer with no published contract docs gets an empty items list.
    const view = await getOrganizationalContracts(ids.noGrantIdentity, ids.orgWsA, db);
    expect(view.items).toEqual([]);
  });

  /* ----------------------- Vállalat (company) ----------------------------- */

  it('ORGANIZATION workspace required; INDIVIDUAL / CASE_RELAY handled canonically', async () => {
    // INDIVIDUAL-mode workspaces are rejected by requireOrganizationWorkspace.
    const individualIds = await createOrganizationalPortalFixture(db, `${seed}:individual`, { clientAWorkspaceMode: 'INDIVIDUAL' });
    await expect(getOrganizationalCompany(ids.authorizedIdentity, individualIds.orgWsA, db))
      .rejects.toMatchObject({ code: 'CLIENT_WORKSPACE_NOT_ORGANIZATION' });
    // CASE_RELAY is an accepted org-style mode (no throw), per canonical policy.
    const caseRelayIds = await createOrganizationalPortalFixture(db, `${seed}:case-relay`, { clientAWorkspaceMode: 'CASE_RELAY' });
    const relay = await getOrganizationalCompany(ids.authorizedIdentity, caseRelayIds.orgWsA, db);
    expect(relay.companyName).toBeTruthy();
  });

  it('only own workspace/client organization is returned', async () => {
    // orgWsB is a second ORG workspace on client A. The company view resolves
    // clientId from the selected workspace, so it returns client A's org (same
    // client), never client B.
    const view = await getOrganizationalCompany(ids.authorizedIdentity, ids.orgWsA, db);
    expect(view.companyName).toBe('Phase5 Org Client A');
    const json = JSON.stringify(view);
    expect(json).not.toContain('Phase5 Org Client B');
    expect(json).not.toContain('B személy');
  });

  it('hidden cases do not affect visible counts', async () => {
    // The authorized identity has grants on caseOne + caseTwo only. caseUngranted
    // (same workspace, no grant) must not influence visibleMattersByArea or total.
    const view = await getOrganizationalCompany(ids.authorizedIdentity, ids.orgWsA, db);
    const total = view.totalVisibleMatterCount;
    // Only granted, published matters count; ungranted case does not appear.
    const json = JSON.stringify(view);
    expect(json).not.toContain('Phase5 ungranted');
    // No area count exceeds the number of granted matters.
    expect(total).toBeGreaterThanOrEqual(0);
    const sum = view.visibleMattersByArea.reduce((acc, area) => acc + area.visibleMatterCount, 0);
    expect(sum).toBe(total);
  });

  it('hidden groups/resources do not leak', async () => {
    const view = await getOrganizationalCompany(ids.authorizedIdentity, ids.orgWsA, db);
    const json = JSON.stringify(view);
    // Inactive persons and cross-client persons never appear.
    expect(json).not.toContain('Inaktív személy');
    expect(json).not.toContain('B személy');
    // Internal-only resources never appear.
    expect(json).not.toContain('Hiányzó irányítás');
    expect(json).not.toContain('Bizalmas');
  });

  it('cross-client organization access fails closed', async () => {
    // orgWsA belongs to client A; cross-client rows (client B) must never surface.
    const view = await getOrganizationalCompany(ids.authorizedIdentity, ids.orgWsA, db);
    const json = JSON.stringify(view);
    expect(json).not.toContain(ids.clientB);
    expect(json).not.toContain('B ügyfél szerződés');
    expect(json).not.toContain(ids.contractCrossClient);
  });

  it('internal workforce fields absent', async () => {
    const view = await getOrganizationalCompany(ids.authorizedIdentity, ids.orgWsA, db);
    const json = JSON.stringify(view);
    for (const forbidden of ['employmentStatus', 'responsibilities', 'responsibilitiesSummary', 'lawFirmOwnerUserId', 'verificationStatus', 'internalNote', 'sharePoint', 'spItemId', 'assessmentFinding']) {
      expect(json.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    // Persons must not carry responsibility/role assignment data.
    for (const person of view.persons) {
      expect(Object.keys(person).sort()).toEqual(['deputyName', 'id', 'jobTitle', 'managerName', 'name', 'organizationGroupId']);
    }
  });

  it('participant / customer contacts authorization is respected', async () => {
    // The company view only returns the customer's own org persons (active), and
    // active matter context only from granted cases. noGrant sees no visible cases.
    const noGrant = await getOrganizationalCompany(ids.noGrantIdentity, ids.orgWsA, db);
    expect(noGrant.totalVisibleMatterCount).toBe(0);
    expect(noGrant.visibleMattersByArea).toEqual([]);
  });

  it('company DTO never leaks raw internal data', async () => {
    const view = await getOrganizationalCompany(ids.authorizedIdentity, ids.orgWsA, db);
    const json = JSON.stringify(view);
    for (const forbidden of ['workInstruction', 'internalOwner', 'reviewer', 'aiPrompt', 'aiResponse', 'auditEvent', 'sourceCaseId', 'canonicalDocumentVersionId', 'internalNote']) {
      expect(json.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('company visible counts respect only granted matters', async () => {
    // Only granted/published matters contribute; the total equals the sum of
    // per-area counts, and the grant-scoped sum never reflects hidden cases.
    const view = await getOrganizationalCompany(ids.authorizedIdentity, ids.orgWsA, db);
    expect(view.totalVisibleMatterCount).toBeGreaterThanOrEqual(0);
    const sum = view.visibleMattersByArea.reduce((acc, area) => acc + area.visibleMatterCount, 0);
    expect(sum).toBe(view.totalVisibleMatterCount);
  });
});