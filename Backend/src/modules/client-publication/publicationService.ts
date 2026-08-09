import crypto from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';

type Db = PrismaClient | Prisma.TransactionClient;
type Actor = { userId: string; role?: string; workspaceId?: string };
type Row = Record<string, any>;

const INTERNAL_ROLES = new Set(['ADMIN', 'PARTNER', 'LAWYER', 'COLLAB_LAWYER']);
const APPROVER_ROLES = new Set(['ADMIN', 'PARTNER', 'LAWYER']);
const PUBLISHER_ROLES = new Set(['ADMIN', 'PARTNER', 'LAWYER']);
const GRANT_PERMISSIONS = new Set(['MATTER_READ', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD', 'ACTION_REQUEST_READ', 'ACTION_REQUEST_COMPLETE', 'UPDATE_READ']);
const FORBIDDEN_PATTERNS = [
  /workInstruction/i, /internal.*rationale/i, /reviewer/i, /internalOwner/i, /internalPriority/i,
  /taskNotes|taskStatus/i, /annotation(Content|Text|Note)?/i, /CLIENT_CANDIDATE/i,
  /comparison(Segment|Text|Rationale|Excerpt)?/i, /review(Point|Decision|Rationale)/i,
  /communicationBody|mailbox/i, /storage(Key|Reference)|sharePoint|spItemId|spWebUrl/i,
  /audit(Row|Event)|activityFeed/i, /ai(Prompt|Response)|token|secret/i,
];

export const CLIENT_PUBLICATION_GATES = {
  foundation: () => envFlag('CLIENT_PUBLICATION_FOUNDATION_ENABLED', true),
  portalRead: () => envFlag('CLIENT_PORTAL_READ_ENABLED', false),
  portalActions: () => envFlag('CLIENT_PORTAL_ACTIONS_ENABLED', false),
};

export class ClientPublicationError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'ClientPublicationError';
  }
}

function envFlag(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function newId(): string { return crypto.randomUUID(); }
function hash(value: unknown): string { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function forbidden(value: unknown): boolean { return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(JSON.stringify(value))); }

function text(value: unknown, field: string, limit: number, required = false): string | null {
  const output = value == null ? '' : String(value).trim();
  if (!output) {
    if (required) throw new ClientPublicationError(400, 'FIELD_REQUIRED', `${field} is required.`);
    return null;
  }
  if (output.length > limit) throw new ClientPublicationError(400, 'TEXT_TOO_LONG', `${field} is too long.`);
  if (forbidden(output)) throw new ClientPublicationError(400, 'FORBIDDEN_CLIENT_FIELD', `${field} contains internal-only data.`);
  return output;
}

function json(value: unknown, field: string): unknown {
  const output = value ?? {};
  const serialized = JSON.stringify(output);
  if (serialized.length > 8000) throw new ClientPublicationError(400, 'JSON_TOO_LARGE', `${field} is too large.`);
  if (forbidden(output)) throw new ClientPublicationError(400, 'FORBIDDEN_CLIENT_FIELD', `${field} contains internal-only data.`);
  return output;
}

async function many<T = Row>(db: Db, sql: string, ...params: unknown[]): Promise<T[]> {
  return (db as any).$queryRawUnsafe(sql, ...params);
}

async function one<T = Row>(db: Db, sql: string, ...params: unknown[]): Promise<T | null> {
  return (await many<T>(db, sql, ...params))[0] ?? null;
}

async function exec(db: Db, sql: string, ...params: unknown[]): Promise<number> {
  return (db as any).$executeRawUnsafe(sql, ...params);
}

function requireFoundation(): void {
  if (!CLIENT_PUBLICATION_GATES.foundation()) throw new ClientPublicationError(503, 'CLIENT_PUBLICATION_FOUNDATION_DISABLED', 'Client publication foundation is disabled.');
}

function requireInternal(actor: Actor): void {
  if (!actor.userId || !INTERNAL_ROLES.has(String(actor.role || ''))) throw new ClientPublicationError(403, 'PUBLICATION_NOT_AUTHORIZED', 'Actor is not authorized for publication administration.');
}

function requireExpected(row: Row, expected: unknown): void {
  if (expected != null && Number(expected) !== Number(row.revision)) throw new ClientPublicationError(409, 'REVISION_CONFLICT', 'The record was modified by someone else. Reload and retry.');
}

async function getCase(db: Db, caseId: string): Promise<Row> {
  const row = await one(db, 'SELECT id, "clientId", title, status::text, "assignedLawyerId", "createdById", "updatedAt" FROM cases WHERE id=$1', caseId);
  if (!row) throw new ClientPublicationError(404, 'CASE_NOT_FOUND', 'Case not found.');
  return row;
}

async function assertCaseAccess(db: Db, actor: Actor, caseId: string): Promise<void> {
  const user = await one(db, 'SELECT id, role::text, status::text, "isActive" FROM users WHERE id=$1', actor.userId);
  if (!user || user.isActive === false || user.status !== 'ACTIVE') throw new ClientPublicationError(403, 'CASE_ACCESS_FORBIDDEN', 'Actor cannot access this case.');
  if (['ADMIN', 'PARTNER'].includes(user.role)) return;
  const row = await getCase(db, caseId);
  if (row.createdById === actor.userId || row.assignedLawyerId === actor.userId) return;
  if (await one(db, 'SELECT id FROM case_collaborators WHERE "caseId"=$1 AND "userId"=$2', caseId, actor.userId)) return;
  throw new ClientPublicationError(403, 'CASE_ACCESS_FORBIDDEN', 'Actor cannot access this case.');
}

async function audit(db: Db, data: Row): Promise<void> {
  await exec(
    db,
    'INSERT INTO client_publication_events (id, action, "actorId", "caseId", "clientId", "grantId", "matterPublicationId", "documentPublicationId", "actionRequestId", "safeUpdateId", "documentVersionId", "fromStatus", "toStatus", "metadataSafe") VALUES ($1,$2::"ClientPublicationEventAction",$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)',
    newId(), data.action, data.actorId, data.caseId ?? null, data.clientId ?? null, data.grantId ?? null, data.matterPublicationId ?? null, data.documentPublicationId ?? null, data.actionRequestId ?? null, data.safeUpdateId ?? null, data.documentVersionId ?? null, data.fromStatus ?? null, data.toStatus ?? null, JSON.stringify(json(data.metadataSafe ?? {}, 'metadataSafe')),
  );
}

async function notifyOnce(db: Db, userId: string, caseId: string, title: string): Promise<void> {
  const link = `/cases/${encodeURIComponent(caseId)}/documents?mode=publication`;
  const existing = await one(db, 'SELECT id FROM notifications WHERE "userId"=$1 AND type=$2::"NotificationType" AND title=$3 AND link=$4 AND "createdAt" >= now() - interval \'5 minutes\'', userId, 'SYSTEM', title, link);
  if (!existing) await exec(db, 'INSERT INTO notifications (id,type,title,message,link,"userId") VALUES ($1,$2::"NotificationType",$3,$4,$5,$6)', newId(), 'SYSTEM', title, 'Belső client publication művelet figyelmet igényel.', link, userId);
}

export function assertNoForbiddenPortalFields(dto: unknown): void {
  if (forbidden(dto)) throw new ClientPublicationError(500, 'PORTAL_DTO_FORBIDDEN_FIELD', 'Portal DTO contains forbidden internal data.');
}

export function toClientPortalGrantSummaryDTO(row: Row): Row {
  return pick(row, ['id', 'clientUserId', 'clientPortalIdentityId', 'clientId', 'caseId', 'role', 'status', 'permissions', 'validFrom', 'validUntil', 'activatedAt', 'suspendedAt', 'revokedAt', 'revocationReasonSafe', 'createdAt', 'updatedAt', 'revision']);
}

export function toClientMatterPublicationDTO(row: Row, revision?: Row | null): Row {
  const dto = {
    ...pick(row, ['id', 'caseId', 'clientId', 'workspaceId', 'status', 'currentRevisionId', 'preparedById', 'approvedById', 'publishedById', 'approvedAt', 'publishedAt', 'revokedAt', 'supersededAt', 'revision']),
    snapshot: revision ? pick(revision, ['id', 'revisionNumber', 'clientSafeTitle', 'clientSafeStatus', 'clientSafeNextStep', 'clientSafeCurrentPosition', 'clientSafeWaitingOn', 'publicTargetDate', 'responsibleLawyerDisplay', 'publishedDeadlinesSnapshot', 'safeUpdatesSnapshot', 'actionRequestsSnapshot', 'sourceFingerprint', 'audienceSnapshot', 'createdAt']) : null,
  };
  assertNoForbiddenPortalFields(dto);
  return dto;
}

export function toClientDocumentPublicationDTO(row: Row): Row {
  const dto = pick(row, ['id', 'caseId', 'clientId', 'workspaceId', 'visibility', 'documentId', 'documentVersionId', 'status', 'clientFacingTitle', 'clientFacingExplanation', 'approvedById', 'publishedById', 'approvedAt', 'publishedAt', 'revokedAt', 'revocationReasonSafe', 'supersededById', 'supersedesId', 'audienceSnapshot', 'sourceFingerprint', 'approvalReviewId', 'revision']);
  assertNoForbiddenPortalFields(dto);
  return dto;
}

export function toClientActionRequestDTO(row: Row): Row {
  const dto = pick(row, ['id', 'caseId', 'clientId', 'type', 'clientSafeTitle', 'clientSafeInstructions', 'dueAt', 'status', 'audienceSnapshot', 'completedAt', 'completionSummarySafe', 'revision']);
  assertNoForbiddenPortalFields(dto);
  return dto;
}

export function toClientSafeUpdateDTO(row: Row): Row {
  const dto = pick(row, ['id', 'caseId', 'clientId', 'title', 'body', 'category', 'status', 'audienceSnapshot', 'publishedAt', 'revokedAt', 'revision']);
  assertNoForbiddenPortalFields(dto);
  return dto;
}

function pick(row: Row, keys: string[]): Row {
  return Object.fromEntries(keys.map((key) => [key, row[key]]));
}

async function activeAudience(db: Db, caseId: string, clientId: string): Promise<Row> {
  const grants = await many(db, 'SELECT id, "clientUserId", role::text, permissions::text[], "validUntil" FROM client_portal_grants WHERE "caseId"=$1 AND "clientId"=$2 AND status=$3::"ClientPortalGrantStatus" AND ("validUntil" IS NULL OR "validUntil" > now())', caseId, clientId, 'ACTIVE');
  if (grants.length === 0) throw new ClientPublicationError(409, 'NO_ACTIVE_AUDIENCE_GRANT', 'At least one active audience grant is required.');
  return { grants: grants.map((grant) => pick(grant, ['id', 'clientUserId', 'role', 'permissions', 'validUntil'])) };
}

export async function createGrant(actor: Actor, input: Row, db: PrismaClient = defaultPrisma): Promise<Row> {
  requireFoundation(); requireInternal(actor);
  return db.$transaction(async (tx) => {
    const caseRow = await getCase(tx, String(input.caseId));
    await assertCaseAccess(tx, actor, caseRow.id);
    if (String(input.clientId) !== caseRow.clientId) throw new ClientPublicationError(400, 'CASE_CLIENT_MISMATCH', 'Grant client must match case client.');
    const user = await one(tx, 'SELECT id, role::text FROM users WHERE id=$1', String(input.clientUserId));
    if (!user || user.role !== 'CLIENT') throw new ClientPublicationError(400, 'CLIENT_USER_REQUIRED', 'Grant user must have CLIENT role.');
    const permissions = Array.isArray(input.permissions) && input.permissions.length ? input.permissions : ['MATTER_READ', 'DOCUMENT_READ', 'ACTION_REQUEST_READ', 'UPDATE_READ'];
    if (permissions.some((permission: string) => !GRANT_PERMISSIONS.has(permission))) throw new ClientPublicationError(400, 'INVALID_PERMISSION', 'Grant permissions must be allowlisted.');
    const grantId = newId();
    const row = await one(tx, 'INSERT INTO client_portal_grants (id,"clientUserId","clientId","caseId",role,status,permissions,"validFrom","validUntil","invitedById") VALUES ($1,$2,$3,$4,$5::"ClientPortalGrantRole",$6::"ClientPortalGrantStatus",$7::"ClientPortalPermission"[],$8,$9,$10) RETURNING *, role::text, status::text, permissions::text[]', grantId, user.id, caseRow.clientId, caseRow.id, input.role || 'VIEWER', 'INVITED', permissions, input.validFrom ? new Date(input.validFrom) : new Date(), input.validUntil ? new Date(input.validUntil) : null, actor.userId);
    await audit(tx, { action: 'GRANT_INVITED', actorId: actor.userId, caseId: caseRow.id, clientId: caseRow.clientId, grantId });
    return toClientPortalGrantSummaryDTO(row!);
  });
}

export async function transitionGrant(actor: Actor, grantId: string, action: 'activate' | 'suspend' | 'revoke' | 'expire', input: Row = {}, db: PrismaClient = defaultPrisma): Promise<Row> {
  requireFoundation(); requireInternal(actor);
  return db.$transaction(async (tx) => {
    const grant = await one(tx, 'SELECT *, role::text, status::text, permissions::text[] FROM client_portal_grants WHERE id=$1 FOR UPDATE', grantId);
    if (!grant) throw new ClientPublicationError(404, 'GRANT_NOT_FOUND', 'Grant not found.');
    await assertCaseAccess(tx, actor, grant.caseId); requireExpected(grant, input.expectedRevision);
    const next = action === 'activate' ? 'ACTIVE' : action === 'suspend' ? 'SUSPENDED' : action === 'expire' ? 'EXPIRED' : 'REVOKED';
    if (grant.status === next) return toClientPortalGrantSummaryDTO(grant);
    const reason = next === 'REVOKED' ? text(input.revocationReasonSafe, 'revocationReasonSafe', 500) : null;
    const row = await one(tx, `UPDATE client_portal_grants SET status=$2::"ClientPortalGrantStatus", "updatedAt"=now(), revision=revision+1,
      "activatedAt"=CASE WHEN $2='ACTIVE' THEN now() ELSE "activatedAt" END,
      "suspendedAt"=CASE WHEN $2='SUSPENDED' THEN now() ELSE "suspendedAt" END,
      "suspendedById"=CASE WHEN $2='SUSPENDED' THEN $3 ELSE "suspendedById" END,
      "revokedAt"=CASE WHEN $2='REVOKED' THEN now() ELSE "revokedAt" END,
      "revokedById"=CASE WHEN $2='REVOKED' THEN $3 ELSE "revokedById" END,
      "revocationReasonSafe"=CASE WHEN $2='REVOKED' THEN $4 ELSE "revocationReasonSafe" END
      WHERE id=$1 RETURNING *, role::text, status::text, permissions::text[]`, grantId, next, actor.userId, reason);
    const eventAction = next === 'ACTIVE' ? 'GRANT_ACTIVATED' : next === 'SUSPENDED' ? 'GRANT_SUSPENDED' : next === 'EXPIRED' ? 'GRANT_EXPIRED' : 'GRANT_REVOKED';
    await audit(tx, { action: eventAction, actorId: actor.userId, caseId: grant.caseId, clientId: grant.clientId, grantId, fromStatus: grant.status, toStatus: next });
    return toClientPortalGrantSummaryDTO(row!);
  });
}

export async function listGrants(actor: Actor, caseId: string, db: PrismaClient = defaultPrisma): Promise<Row[]> {
  requireFoundation(); requireInternal(actor); await assertCaseAccess(db, actor, caseId);
  return (await many(db, 'SELECT *, role::text, status::text, permissions::text[] FROM client_portal_grants WHERE "caseId"=$1 ORDER BY "createdAt" DESC', caseId)).map(toClientPortalGrantSummaryDTO);
}

async function latestMatterRevision(db: Db, publicationId: string): Promise<Row | null> {
  return one(db, 'SELECT * FROM client_matter_publication_revisions WHERE "publicationId"=$1 ORDER BY "revisionNumber" DESC LIMIT 1', publicationId);
}

async function createMatterRevision(tx: Db, publication: Row, actor: Actor, input: Row): Promise<Row> {
  const latest = await latestMatterRevision(tx, publication.id);
  const caseRow = await getCase(tx, publication.caseId);
  const audience = input.audienceSnapshot ? json(input.audienceSnapshot, 'audienceSnapshot') : await activeAudience(tx, publication.caseId, publication.clientId);
  const revision = await one(tx, 'INSERT INTO client_matter_publication_revisions (id,"publicationId","revisionNumber","clientSafeTitle","clientSafeStatus","clientSafeNextStep","responsibleLawyerDisplay","publishedDeadlinesSnapshot","safeUpdatesSnapshot","actionRequestsSnapshot","sourceCaseRevision","sourceFingerprint","audienceSnapshot","createdById") VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13::jsonb,$14) RETURNING *', newId(), publication.id, latest ? Number(latest.revisionNumber) + 1 : 1, text(input.clientSafeTitle, 'clientSafeTitle', 240, true), text(input.clientSafeStatus, 'clientSafeStatus', 240, true), text(input.clientSafeNextStep, 'clientSafeNextStep', 1000), text(input.responsibleLawyerDisplay, 'responsibleLawyerDisplay', 160), JSON.stringify(json(input.publishedDeadlinesSnapshot || [], 'publishedDeadlinesSnapshot')), JSON.stringify(json(input.safeUpdatesSnapshot || [], 'safeUpdatesSnapshot')), JSON.stringify(json(input.actionRequestsSnapshot || [], 'actionRequestsSnapshot')), Number(caseRow.revision || 0), hash({ id: caseRow.id, title: caseRow.title, status: caseRow.status, updatedAt: caseRow.updatedAt }), JSON.stringify(audience), actor.userId);
  await exec(tx, 'UPDATE client_matter_publications SET "currentRevisionId"=$2, "updatedAt"=now(), revision=revision+1 WHERE id=$1', publication.id, revision!.id);
  return revision!;
}

export async function createAndPublishInitialMatterPublicationInTransaction(
  actor: Actor,
  input: Row,
  tx: Prisma.TransactionClient,
): Promise<Row> {
  requireFoundation(); requireInternal(actor);
  const workspaceId = String(input.workspaceId || '');
  const caseId = String(input.caseId || '');
  const grantId = String(input.grantId || '');
  const caseRow = await getCase(tx, caseId);
  const workspace = await one(tx, 'SELECT id, "clientId", mode::text, status::text FROM client_portal_workspaces WHERE id=$1', workspaceId);
  if (!workspace || workspace.status !== 'ACTIVE' || workspace.mode !== 'ORGANIZATION') throw new ClientPublicationError(409, 'WORKSPACE_NOT_ACTIVE', 'An active organizational workspace is required.');
  if (workspace.clientId !== caseRow.clientId) throw new ClientPublicationError(400, 'CASE_CLIENT_MISMATCH', 'Case is outside the workspace Client.');
  const grant = await one(tx, 'SELECT id, "clientPortalIdentityId", "workspaceId", "caseId", "clientId", "participantRole"::text, status::text, permissions::text[] FROM client_portal_grants WHERE id=$1', grantId);
  if (!grant || grant.status !== 'ACTIVE' || grant.workspaceId !== workspaceId || grant.caseId !== caseId || grant.clientId !== caseRow.clientId || grant.participantRole !== 'REQUESTER') {
    throw new ClientPublicationError(409, 'ACTIVE_REQUESTER_GRANT_REQUIRED', 'An active requester grant is required before publication.');
  }
  const existing = await one(tx, 'SELECT *, status::text FROM client_matter_publications WHERE "caseId"=$1 AND "workspaceId"=$2 AND status=$3::"ClientPublicationStatus" FOR UPDATE', caseId, workspaceId, 'PUBLISHED');
  if (existing) return toClientMatterPublicationDTO(existing, await latestMatterRevision(tx, existing.id));
  const now = new Date();
  const publication = await one(tx, 'INSERT INTO client_matter_publications (id,"caseId","clientId","workspaceId",status,"preparedById","approvedById","publishedById","approvedAt","publishedAt") VALUES ($1,$2,$3,$4,$5::"ClientPublicationStatus",$6,$6,$6,$7,$7) RETURNING *, status::text', newId(), caseId, caseRow.clientId, workspaceId, 'PUBLISHED', actor.userId, now);
  const audience = { grants: [{ id: grant.id, clientPortalIdentityId: grant.clientPortalIdentityId, participantRole: grant.participantRole, permissions: grant.permissions }] };
  const publicTargetDate = input.publicTargetDate ? new Date(String(input.publicTargetDate)) : null;
  if (publicTargetDate && Number.isNaN(publicTargetDate.getTime())) throw new ClientPublicationError(400, 'INVALID_PUBLIC_TARGET_DATE', 'publicTargetDate is invalid.');
  const revision = await one(tx, 'INSERT INTO client_matter_publication_revisions (id,"publicationId","revisionNumber","clientSafeTitle","clientSafeStatus","clientSafeNextStep","clientSafeCurrentPosition","clientSafeWaitingOn","publicTargetDate","responsibleLawyerDisplay","publishedDeadlinesSnapshot","safeUpdatesSnapshot","actionRequestsSnapshot","sourceCaseRevision","sourceFingerprint","audienceSnapshot","createdById") VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15::jsonb,$16) RETURNING *',
    newId(), publication!.id,
    text(input.publicTitle, 'publicTitle', 240, true),
    text(input.publicStatus, 'publicStatus', 240, true),
    text(input.nextStep, 'nextStep', 1000),
    text(input.currentPosition, 'currentPosition', 1500),
    text(input.waitingOn, 'waitingOn', 1000),
    publicTargetDate,
    text(input.responsibleLawyerDisplay, 'responsibleLawyerDisplay', 160),
    JSON.stringify(json(input.safeMilestones || [], 'safeMilestones')),
    JSON.stringify(json(input.safeUpdate ? [input.safeUpdate] : [], 'safeUpdatesSnapshot')),
    JSON.stringify([]),
    Number(caseRow.revision || 0),
    hash({ caseId, workspaceId, grantId, input }),
    JSON.stringify(audience),
    actor.userId,
  );
  await exec(tx, 'UPDATE client_matter_publications SET "currentRevisionId"=$2, revision=revision+1, "updatedAt"=now() WHERE id=$1', publication!.id, revision!.id);
  await audit(tx, { action: 'DRAFT_CREATED', actorId: actor.userId, caseId, clientId: caseRow.clientId, matterPublicationId: publication!.id, metadataSafe: { source: 'portal-intake' } });
  await audit(tx, { action: 'PUBLISHED', actorId: actor.userId, caseId, clientId: caseRow.clientId, matterPublicationId: publication!.id, fromStatus: 'DRAFT', toStatus: 'PUBLISHED', metadataSafe: { source: 'portal-intake' } });
  const updated = await one(tx, 'SELECT *, status::text FROM client_matter_publications WHERE id=$1', publication!.id);
  return toClientMatterPublicationDTO(updated!, revision);
}

export async function createMatterPublication(actor: Actor, input: Row, db: PrismaClient = defaultPrisma): Promise<Row> {
  requireFoundation(); requireInternal(actor);
  return db.$transaction(async (tx) => {
    const caseRow = await getCase(tx, String(input.caseId)); await assertCaseAccess(tx, actor, caseRow.id);
    const workspaceId = input.workspaceId ? String(input.workspaceId) : null;
    if (workspaceId) {
      const workspace = await one(tx, 'SELECT id, "clientId" FROM client_portal_workspaces WHERE id=$1 AND status=$2::"ClientPortalWorkspaceStatus"', workspaceId, 'ACTIVE');
      if (!workspace || workspace.clientId !== caseRow.clientId) throw new ClientPublicationError(400, 'WORKSPACE_CLIENT_MISMATCH', 'Workspace must be active and match the Case Client.');
    }
    const pub = await one(tx, 'INSERT INTO client_matter_publications (id,"caseId","clientId","workspaceId",status,"preparedById") VALUES ($1,$2,$3,$4,$5::"ClientPublicationStatus",$6) RETURNING *, status::text', newId(), caseRow.id, caseRow.clientId, workspaceId, 'DRAFT', actor.userId);
    const revision = await createMatterRevision(tx, pub!, actor, input);
    const updated = await one(tx, 'SELECT *, status::text FROM client_matter_publications WHERE id=$1', pub!.id);
    await audit(tx, { action: 'DRAFT_CREATED', actorId: actor.userId, caseId: caseRow.id, clientId: caseRow.clientId, matterPublicationId: pub!.id });
    return toClientMatterPublicationDTO(updated!, revision);
  });
}

export async function updateMatterPublication(actor: Actor, publicationId: string, input: Row, db: PrismaClient = defaultPrisma): Promise<Row> {
  requireFoundation(); requireInternal(actor);
  return db.$transaction(async (tx) => {
    const pub = await one(tx, 'SELECT *, status::text FROM client_matter_publications WHERE id=$1 FOR UPDATE', publicationId);
    if (!pub) throw new ClientPublicationError(404, 'MATTER_PUBLICATION_NOT_FOUND', 'Matter publication not found.');
    await assertCaseAccess(tx, actor, pub.caseId); requireExpected(pub, input.expectedRevision);
    if (pub.status !== 'DRAFT') throw new ClientPublicationError(409, 'PUBLICATION_NOT_EDITABLE', 'Only draft publication can be edited.');
    const revision = await createMatterRevision(tx, pub, actor, input);
    const updated = await one(tx, 'SELECT *, status::text FROM client_matter_publications WHERE id=$1', publicationId);
    await audit(tx, { action: 'DRAFT_UPDATED', actorId: actor.userId, caseId: pub.caseId, clientId: pub.clientId, matterPublicationId: publicationId });
    return toClientMatterPublicationDTO(updated!, revision);
  });
}

// ---------------------------------------------------------------------------
// Customer-safe milestone publication
//
// A workforce draft (mutable, on the publication) is snapshotted into an
// immutable publication revision on publish. Customer progress is derived only
// from published milestone weights; internal task completion after publish never
// mutates a published revision. The customer never sees the source task id,
// assignee, dependencies or internal task title.
// ---------------------------------------------------------------------------

const MILESTONE_STATES = new Set(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']);

type StoredMilestone = { publicKey: string; sourceTaskId: string | null; safeTitle: string; safeDescription: string | null; displayOrder: number; weight: number | null; completionState: string; completedAt: string | null };

function normalizeMilestones(input: unknown, caseTaskIds: Set<string>): StoredMilestone[] {
  const list = Array.isArray(input) ? input : [];
  const keys = new Set<string>();
  const out = list.map((raw: Row, index: number): StoredMilestone => {
    const publicKey = text(raw.publicKey ?? raw.reference, 'publicKey', 80, true)!;
    if (keys.has(publicKey)) throw new ClientPublicationError(400, 'MILESTONE_KEY_DUPLICATE', 'Duplicate milestone key.');
    keys.add(publicKey);
    const safeTitle = text(raw.safeTitle ?? raw.title, 'safeTitle', 200, true)!;
    const safeDescription = text(raw.safeDescription ?? raw.description, 'safeDescription', 1000, false);
    const completionState = String(raw.completionState ?? raw.state ?? 'NOT_STARTED').toUpperCase();
    if (!MILESTONE_STATES.has(completionState)) throw new ClientPublicationError(400, 'MILESTONE_STATE_INVALID', 'Invalid milestone state.');
    let weight: number | null = null;
    if (raw.weight != null && String(raw.weight).trim() !== '') {
      weight = Number(raw.weight);
      if (!Number.isFinite(weight) || weight <= 0) throw new ClientPublicationError(400, 'MILESTONE_WEIGHT_INVALID', 'Milestone weight must be greater than zero.');
    }
    const displayOrder = Number.isFinite(Number(raw.displayOrder)) ? Number(raw.displayOrder) : index;
    const sourceTaskId = raw.sourceTaskId ? String(raw.sourceTaskId) : null;
    if (sourceTaskId && !caseTaskIds.has(sourceTaskId)) throw new ClientPublicationError(400, 'MILESTONE_SOURCE_STEP_INVALID', 'Milestone source step is not a candidate task on this Case.');
    const completedAt = completionState === 'COMPLETED' && raw.completedAt ? new Date(String(raw.completedAt)).toISOString() : null;
    return { publicKey, sourceTaskId, safeTitle, safeDescription, displayOrder, weight, completionState, completedAt };
  });
  out.sort((a, b) => a.displayOrder - b.displayOrder || a.publicKey.localeCompare(b.publicKey));
  return out;
}

/** Progress from published weights only. Null when no weights are supplied
 *  (never silently counts milestones equally). Clamped and deterministically
 *  rounded to 0..100. */
export function computeMilestoneProgress(milestones: Array<{ weight?: number | null; completionState?: string }>): number | null {
  const weighted = milestones.filter((m) => m.weight != null && Number(m.weight) > 0);
  if (!weighted.length) return null;
  const total = weighted.reduce((sum, m) => sum + Number(m.weight), 0);
  if (total <= 0) return null;
  const done = weighted.filter((m) => String(m.completionState) === 'COMPLETED').reduce((sum, m) => sum + Number(m.weight), 0);
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

/** Customer-safe projection — strips sourceTaskId and every internal field.
 *  Shared by the workforce preview and the customer portal read. */
export function toCustomerMilestones(snapshot: unknown): Row[] {
  const list = Array.isArray(snapshot) ? snapshot : [];
  return list
    .map((m: Row) => ({
      reference: String(m.publicKey),
      title: String(m.safeTitle),
      description: m.safeDescription ?? null,
      state: String(m.completionState),
      displayOrder: Number(m.displayOrder ?? 0),
      weight: m.weight != null ? Number(m.weight) : null,
      completedAt: m.completedAt ?? null,
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

async function caseCandidateTaskIds(db: Db, caseId: string): Promise<Set<string>> {
  const rows = await many(db, 'SELECT id FROM tasks WHERE "caseId"=$1 AND "workflowPublicMilestoneCandidate"=true', caseId);
  return new Set(rows.map((row) => String(row.id)));
}

async function latestCasePublication(db: Db, caseId: string, forUpdate = false): Promise<Row | null> {
  return one(db, `SELECT *, status::text FROM client_matter_publications WHERE "caseId"=$1 ORDER BY "createdAt" DESC LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`, caseId);
}

/** Workforce: list the internal workflow steps eligible to become milestones.
 *  Internal-only view (task title/status) — never returned to the customer. */
export async function listEligibleMilestoneSteps(actor: Actor, caseId: string, db: PrismaClient = defaultPrisma): Promise<Row> {
  requireFoundation(); requireInternal(actor);
  await assertCaseAccess(db, actor, caseId);
  const rows = await many(db, 'SELECT id, title, status::text AS status, "workflowStepKey", "workflowActivatedAt" FROM tasks WHERE "caseId"=$1 AND "workflowPublicMilestoneCandidate"=true ORDER BY "createdAt" ASC', caseId);
  return { items: rows.map((row) => ({ taskId: row.id, stepKey: row.workflowStepKey ?? null, internalTitle: row.title, internalStatus: row.status, suggestedState: row.status === 'DONE' || row.status === 'COMPLETED' ? 'COMPLETED' : row.workflowActivatedAt ? 'IN_PROGRESS' : 'NOT_STARTED' })) };
}

/** Workforce: read the mutable milestone draft (never customer-visible). */
export async function getMilestoneDraft(actor: Actor, caseId: string, db: PrismaClient = defaultPrisma): Promise<Row> {
  requireFoundation(); requireInternal(actor);
  await assertCaseAccess(db, actor, caseId);
  const pub = await latestCasePublication(db, caseId);
  const current = pub?.currentRevisionId ? await one(db, 'SELECT "milestonesSnapshot", "progressPercentage" FROM client_matter_publication_revisions WHERE id=$1', pub.currentRevisionId) : null;
  return {
    publicationId: pub?.id ?? null,
    publicationStatus: pub?.status ?? null,
    draft: pub?.milestoneDraftSnapshot ?? (current?.milestonesSnapshot ?? []),
    publishedMilestones: current?.milestonesSnapshot ? toCustomerMilestones(current.milestonesSnapshot) : [],
    publishedProgress: current?.progressPercentage ?? null,
  };
}

/** Workforce: save the milestone draft. Never affects the customer portal. */
export async function saveMilestoneDraft(actor: Actor, caseId: string, milestones: unknown, db: PrismaClient = defaultPrisma): Promise<Row> {
  requireFoundation(); requireInternal(actor);
  return db.$transaction(async (tx) => {
    await assertCaseAccess(tx, actor, caseId);
    const caseRow = await getCase(tx, caseId);
    const pub = await latestCasePublication(tx, caseId, true);
    if (!pub) throw new ClientPublicationError(409, 'MATTER_PUBLICATION_REQUIRED', 'Publish the matter first, then add customer milestones.');
    const normalized = normalizeMilestones(milestones, await caseCandidateTaskIds(tx, caseId));
    const stored = JSON.stringify(normalized);
    if (forbidden(normalized)) throw new ClientPublicationError(400, 'FORBIDDEN_CLIENT_FIELD', 'Milestone draft contains internal-only data.');
    await exec(tx, 'UPDATE client_matter_publications SET "milestoneDraftSnapshot"=$1::jsonb, "updatedAt"=now() WHERE id=$2', stored, pub.id);
    await audit(tx, { action: 'DRAFT_UPDATED', actorId: actor.userId, caseId, clientId: caseRow.clientId, matterPublicationId: pub.id, metadataSafe: { milestoneDraft: true, count: normalized.length } });
    return { publicationId: pub.id, draft: normalized, preview: { milestones: toCustomerMilestones(normalized), progressPercentage: computeMilestoneProgress(normalized) } };
  });
}

/** Workforce preview — uses the SAME customer-safe projection as the portal
 *  read, so preview and the customer DTO are identical for the same content. */
export async function previewMilestonePublication(actor: Actor, caseId: string, db: PrismaClient = defaultPrisma): Promise<Row> {
  requireFoundation(); requireInternal(actor);
  await assertCaseAccess(db, actor, caseId);
  const pub = await latestCasePublication(db, caseId);
  const draft = pub?.milestoneDraftSnapshot ?? [];
  const normalized = normalizeMilestones(draft, await caseCandidateTaskIds(db, caseId));
  const dto = { milestones: toCustomerMilestones(normalized), progressPercentage: computeMilestoneProgress(normalized) };
  assertNoForbiddenPortalFields(dto);
  return dto;
}

/** Workforce: publish the draft into a new immutable revision. Copies the
 *  current revision's client-safe matter content and adds the milestone
 *  snapshot + derived progress; supersedes the prior active revision. Internal
 *  task completion afterwards never mutates this published revision. */
export async function publishMilestoneRevision(actor: Actor, caseId: string, db: PrismaClient = defaultPrisma): Promise<Row> {
  requireFoundation();
  if (!actor.userId || !PUBLISHER_ROLES.has(String(actor.role || ''))) throw new ClientPublicationError(403, 'PUBLICATION_NOT_AUTHORIZED', 'Actor is not authorized to publish.');
  return db.$transaction(async (tx) => {
    await assertCaseAccess(tx, actor, caseId);
    const caseRow = await getCase(tx, caseId);
    const pub = await latestCasePublication(tx, caseId, true);
    if (!pub || !pub.currentRevisionId) throw new ClientPublicationError(409, 'MATTER_PUBLICATION_REQUIRED', 'Publish the matter first, then publish customer milestones.');
    const current = await one(tx, 'SELECT * FROM client_matter_publication_revisions WHERE id=$1', pub.currentRevisionId);
    if (!current) throw new ClientPublicationError(409, 'MATTER_REVISION_MISSING', 'Current matter revision is missing.');
    const normalized = normalizeMilestones(pub.milestoneDraftSnapshot ?? [], await caseCandidateTaskIds(tx, caseId));
    const progress = computeMilestoneProgress(normalized);
    const nextNumber = Number(current.revisionNumber) + 1;
    const revisionId = newId();
    await exec(tx,
      `INSERT INTO client_matter_publication_revisions (id,"publicationId","revisionNumber","clientSafeTitle","clientSafeStatus","clientSafeNextStep","clientSafeCurrentPosition","clientSafeWaitingOn","publicTargetDate","responsibleLawyerDisplay","publishedDeadlinesSnapshot","safeUpdatesSnapshot","actionRequestsSnapshot","sourceCaseRevision","sourceFingerprint","audienceSnapshot","milestonesSnapshot","progressPercentage","createdById")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15,$16::jsonb,$17::jsonb,$18,$19)`,
      revisionId, pub.id, nextNumber, current.clientSafeTitle, current.clientSafeStatus, current.clientSafeNextStep ?? null, current.clientSafeCurrentPosition ?? null, current.clientSafeWaitingOn ?? null, current.publicTargetDate ?? null, current.responsibleLawyerDisplay ?? null,
      JSON.stringify(current.publishedDeadlinesSnapshot ?? []), JSON.stringify(current.safeUpdatesSnapshot ?? []), JSON.stringify(current.actionRequestsSnapshot ?? []), current.sourceCaseRevision ?? null,
      hash({ base: current.sourceFingerprint, milestones: normalized }), JSON.stringify(current.audienceSnapshot ?? {}), JSON.stringify(normalized), progress, actor.userId,
    );
    await exec(tx, 'UPDATE client_matter_publications SET "currentRevisionId"=$1, status=$2::"ClientPublicationStatus", "publishedAt"=now(), "publishedById"=$3, "supersededAt"=CASE WHEN status=$2::"ClientPublicationStatus" THEN "supersededAt" ELSE NULL END, revision=revision+1, "updatedAt"=now() WHERE id=$4', revisionId, 'PUBLISHED', actor.userId, pub.id);
    await audit(tx, { action: 'PUBLISHED', actorId: actor.userId, caseId, clientId: caseRow.clientId, matterPublicationId: pub.id, fromStatus: pub.status, toStatus: 'PUBLISHED', metadataSafe: { milestoneRevision: nextNumber, milestoneCount: normalized.length, progressPercentage: progress } });
    return { publicationId: pub.id, revisionId, revisionNumber: nextNumber, milestones: toCustomerMilestones(normalized), progressPercentage: progress };
  });
}

async function documentSource(db: Db, documentId: string, versionId: string): Promise<Row> {
  const row = await one(db, 'SELECT d.id AS "documentId", d."caseId", d."clientId", coalesce(d.title,d.name,d."fileName") AS "documentTitle", v.id AS "versionId", v.version, v.name AS "versionName", v."originalFileName", v."mimeType", v.size, v."storageReference", v."spItemId", v."createdAt" FROM documents d JOIN document_versions v ON v."documentId"=d.id WHERE d.id=$1 AND v.id=$2', documentId, versionId);
  if (!row) throw new ClientPublicationError(404, 'DOCUMENT_VERSION_NOT_FOUND', 'Document version not found for document.');
  return row;
}

function normalizeDocumentVisibility(value: unknown): 'WORKSPACE' | 'SELECTED_PARTICIPANTS' {
  const output = String(value || 'WORKSPACE').trim().toUpperCase();
  if (output !== 'WORKSPACE' && output !== 'SELECTED_PARTICIPANTS') throw new ClientPublicationError(400, 'DOCUMENT_VISIBILITY_INVALID', 'Document visibility is not supported.');
  return output as 'WORKSPACE' | 'SELECTED_PARTICIPANTS';
}

function normalizedIds(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.map((item) => String(item).trim()).filter(Boolean))] : [];
}

async function validateDocumentWorkspace(db: Db, clientId: string, workspaceId: string | null): Promise<string | null> {
  if (!workspaceId) return null;
  const workspace = await one(db, 'SELECT id FROM client_portal_workspaces WHERE id=$1 AND "clientId"=$2 AND status=$3::"ClientPortalWorkspaceStatus"', workspaceId, clientId, 'ACTIVE');
  if (!workspace) throw new ClientPublicationError(409, 'DOCUMENT_WORKSPACE_NOT_ACTIVE', 'Document publication workspace is not active for this client.');
  return workspace.id;
}

async function validateDocumentRecipients(db: Db, caseId: string, workspaceId: string, membershipIds: string[]): Promise<void> {
  if (!membershipIds.length) throw new ClientPublicationError(400, 'DOCUMENT_RECIPIENT_REQUIRED', 'Select at least one document recipient.');
  const rows = await many(db, `SELECT m.id
    FROM client_portal_workspace_memberships m
    JOIN client_portal_grants g ON g."clientPortalIdentityId"=m."clientPortalIdentityId"
      AND g."workspaceId"=m."workspaceId"
      AND g."caseId"=$2
      AND g.status='ACTIVE'::"ClientPortalGrantStatus"
      AND (g."validFrom" IS NULL OR g."validFrom" <= now())
      AND (g."validUntil" IS NULL OR g."validUntil" > now())
      AND g.permissions::text[] @> ARRAY['DOCUMENT_READ']::text[]
    WHERE m.id=ANY($1::text[])
      AND m."workspaceId"=$3
      AND m.status='ACTIVE'::"ClientPortalWorkspaceMembershipStatus"
      AND (m."expiresAt" IS NULL OR m."expiresAt" > now())`, membershipIds, caseId, workspaceId);
  if (rows.length !== membershipIds.length) throw new ClientPublicationError(400, 'DOCUMENT_RECIPIENT_INVALID', 'Each selected recipient must be an active workspace participant with exact Case document access.');
}

async function replaceDocumentRecipients(db: Db, publicationId: string, membershipIds: string[]): Promise<void> {
  await exec(db, 'DELETE FROM client_document_publication_recipients WHERE "documentPublicationId"=$1', publicationId);
  for (const membershipId of membershipIds) {
    await exec(db, 'INSERT INTO client_document_publication_recipients (id,"documentPublicationId","workspaceMembershipId") VALUES ($1,$2,$3) ON CONFLICT ("documentPublicationId","workspaceMembershipId") DO NOTHING', newId(), publicationId, membershipId);
  }
}

export async function createDocumentPublication(actor: Actor, input: Row, db: PrismaClient = defaultPrisma): Promise<Row> {
  requireFoundation(); requireInternal(actor);
  return db.$transaction(async (tx) => {
    const source = await documentSource(tx, String(input.documentId), String(input.documentVersionId));
    await assertCaseAccess(tx, actor, source.caseId);
    const visibility = normalizeDocumentVisibility(input.visibility);
    const workspaceId = await validateDocumentWorkspace(tx, source.clientId, input.workspaceId ? String(input.workspaceId) : null);
    const recipientMembershipIds = normalizedIds(input.recipientMembershipIds);
    if (visibility === 'SELECTED_PARTICIPANTS') {
      if (!workspaceId) throw new ClientPublicationError(400, 'DOCUMENT_WORKSPACE_REQUIRED', 'Selected participant publications require a workspace.');
      await validateDocumentRecipients(tx, source.caseId, workspaceId, recipientMembershipIds);
    }
    const audience = input.audienceSnapshot ? json(input.audienceSnapshot, 'audienceSnapshot') : await activeAudience(tx, source.caseId, source.clientId);
    const sourceFingerprint = hash(pick(source, ['documentId', 'versionId', 'version', 'size', 'storageReference', 'spItemId', 'createdAt']));
    const review = await one(tx, 'SELECT id FROM document_reviews WHERE "documentId"=$1 AND "approvedVersionId"=$2 AND status IN ($3::"DocumentReviewStatus",$4::"DocumentReviewStatus") ORDER BY "completedAt" DESC NULLS LAST LIMIT 1', source.documentId, source.versionId, 'APPROVED', 'CLOSED');
    const row = await one(tx, 'INSERT INTO client_document_publications (id,"caseId","clientId","workspaceId",visibility,"documentId","documentVersionId",status,"clientFacingTitle","clientFacingExplanation","preparedById","audienceSnapshot","sourceFingerprint","approvalReviewId") VALUES ($1,$2,$3,$4,$5::"ClientDocumentPublicationVisibility",$6,$7,$8::"ClientPublicationStatus",$9,$10,$11,$12::jsonb,$13,$14) RETURNING *, status::text, visibility::text', newId(), source.caseId, source.clientId, workspaceId, visibility, source.documentId, source.versionId, 'DRAFT', text(input.clientFacingTitle || source.documentTitle, 'clientFacingTitle', 240, true), text(input.clientFacingExplanation, 'clientFacingExplanation', 2000), actor.userId, JSON.stringify(audience), sourceFingerprint, review?.id ?? null);
    if (visibility === 'SELECTED_PARTICIPANTS') await replaceDocumentRecipients(tx, row!.id, recipientMembershipIds);
    await audit(tx, { action: 'DRAFT_CREATED', actorId: actor.userId, caseId: source.caseId, clientId: source.clientId, documentPublicationId: row!.id, documentVersionId: source.versionId });
    return toClientDocumentPublicationDTO(row!);
  });
}

export async function updateDocumentPublication(actor: Actor, publicationId: string, input: Row, db: PrismaClient = defaultPrisma): Promise<Row> {
  requireFoundation(); requireInternal(actor);
  return db.$transaction(async (tx) => {
    const pub = await one(tx, 'SELECT *, status::text FROM client_document_publications WHERE id=$1 FOR UPDATE', publicationId);
    if (!pub) throw new ClientPublicationError(404, 'DOCUMENT_PUBLICATION_NOT_FOUND', 'Document publication not found.');
    await assertCaseAccess(tx, actor, pub.caseId); requireExpected(pub, input.expectedRevision);
    if (pub.status !== 'DRAFT') throw new ClientPublicationError(409, 'PUBLICATION_NOT_EDITABLE', 'Only draft publication can be edited.');
    const visibility = input.visibility == null ? String(pub.visibility || 'WORKSPACE') as 'WORKSPACE' | 'SELECTED_PARTICIPANTS' : normalizeDocumentVisibility(input.visibility);
    const workspaceId = input.workspaceId === undefined ? pub.workspaceId : await validateDocumentWorkspace(tx, pub.clientId, input.workspaceId ? String(input.workspaceId) : null);
    const recipientMembershipIds = input.recipientMembershipIds === undefined ? null : normalizedIds(input.recipientMembershipIds);
    if (visibility === 'SELECTED_PARTICIPANTS') {
      if (!workspaceId) throw new ClientPublicationError(400, 'DOCUMENT_WORKSPACE_REQUIRED', 'Selected participant publications require a workspace.');
      await validateDocumentRecipients(tx, pub.caseId, workspaceId, recipientMembershipIds ?? (await many(tx, 'SELECT "workspaceMembershipId" AS id FROM client_document_publication_recipients WHERE "documentPublicationId"=$1', publicationId)).map((row) => row.id));
    }
    const row = await one(tx, 'UPDATE client_document_publications SET "workspaceId"=$2, visibility=$3::"ClientDocumentPublicationVisibility", "clientFacingTitle"=$4, "clientFacingExplanation"=$5, "audienceSnapshot"=$6::jsonb, "updatedAt"=now(), revision=revision+1 WHERE id=$1 RETURNING *, status::text, visibility::text', publicationId, workspaceId, visibility, text(input.clientFacingTitle || pub.clientFacingTitle, 'clientFacingTitle', 240, true), text(input.clientFacingExplanation, 'clientFacingExplanation', 2000), JSON.stringify(input.audienceSnapshot ? json(input.audienceSnapshot, 'audienceSnapshot') : pub.audienceSnapshot));
    if (recipientMembershipIds) await replaceDocumentRecipients(tx, publicationId, visibility === 'SELECTED_PARTICIPANTS' ? recipientMembershipIds : []);
    await audit(tx, { action: 'DRAFT_UPDATED', actorId: actor.userId, caseId: pub.caseId, clientId: pub.clientId, documentPublicationId: publicationId, documentVersionId: pub.documentVersionId });
    return toClientDocumentPublicationDTO(row!);
  });
}

async function transitionPublication(actor: Actor, table: string, idValue: string, action: string, input: Row, db: PrismaClient): Promise<Row> {
  requireFoundation(); requireInternal(actor);
  return db.$transaction(async (tx) => {
    const pub = await one(tx, `SELECT *, status::text FROM ${table} WHERE id=$1 FOR UPDATE`, idValue);
    if (!pub) throw new ClientPublicationError(404, 'PUBLICATION_NOT_FOUND', 'Publication not found.');
    await assertCaseAccess(tx, actor, pub.caseId); requireExpected(pub, input.expectedRevision);
    const isMatter = table.includes('matter');
    if (action === 'publish' && pub.status === 'PUBLISHED') {
      return isMatter ? toClientMatterPublicationDTO(pub, await latestMatterRevision(tx, idValue)) : toClientDocumentPublicationDTO(pub);
    }
    if (action === 'revoke' && pub.status === 'REVOKED') {
      return isMatter ? toClientMatterPublicationDTO(pub, await latestMatterRevision(tx, idValue)) : toClientDocumentPublicationDTO(pub);
    }
    if (action === 'supersede' && pub.status === 'SUPERSEDED') {
      return isMatter ? toClientMatterPublicationDTO(pub, await latestMatterRevision(tx, idValue)) : toClientDocumentPublicationDTO(pub);
    }
    let next: string | null = null;
    if (action === 'submit' && pub.status === 'DRAFT') next = 'READY_FOR_APPROVAL';
    if (action === 'approve' && pub.status === 'READY_FOR_APPROVAL') { if (!APPROVER_ROLES.has(String(actor.role || ''))) throw new ClientPublicationError(403, 'APPROVER_NOT_AUTHORIZED', 'Actor cannot approve publication.'); next = 'APPROVED'; }
    if (action === 'publish' && pub.status === 'APPROVED') {
      if (!PUBLISHER_ROLES.has(String(actor.role || ''))) throw new ClientPublicationError(403, 'PUBLISHER_NOT_AUTHORIZED', 'Actor cannot publish publication.');
      await activeAudience(tx, pub.caseId, pub.clientId);
      if (table.includes('document')) {
        await assertDocumentEligibility(tx, pub, input);
        if (String(pub.visibility || 'WORKSPACE') === 'SELECTED_PARTICIPANTS') {
          const recipients = await many(tx, 'SELECT id FROM client_document_publication_recipients WHERE "documentPublicationId"=$1 LIMIT 1', idValue);
          if (!recipients.length) throw new ClientPublicationError(409, 'DOCUMENT_RECIPIENT_REQUIRED', 'Selected participant publications require at least one recipient.');
        }
      }
      next = 'PUBLISHED';
    }
    if (action === 'revoke' && pub.status === 'PUBLISHED') next = 'REVOKED';
    if (action === 'supersede' && ['PUBLISHED', 'REVOKED'].includes(pub.status)) next = 'SUPERSEDED';
    if (!next) throw new ClientPublicationError(409, 'INVALID_PUBLICATION_TRANSITION', `Cannot ${action} publication in ${pub.status}.`);
    const row = await one(tx, `UPDATE ${table} SET status=$2::"ClientPublicationStatus", "approvedById"=CASE WHEN $2='APPROVED' THEN $3 ELSE "approvedById" END, "approvedAt"=CASE WHEN $2='APPROVED' THEN now() ELSE "approvedAt" END, "publishedById"=CASE WHEN $2='PUBLISHED' THEN $3 ELSE "publishedById" END, "publishedAt"=CASE WHEN $2='PUBLISHED' THEN now() ELSE "publishedAt" END, "revokedById"=CASE WHEN $2='REVOKED' THEN $3 ELSE "revokedById" END, "revokedAt"=CASE WHEN $2='REVOKED' THEN now() ELSE "revokedAt" END, "supersededById"=CASE WHEN $2='SUPERSEDED' THEN $3 ELSE "supersededById" END, "supersededAt"=CASE WHEN $2='SUPERSEDED' THEN now() ELSE "supersededAt" END, "updatedAt"=now(), revision=revision+1 WHERE id=$1 RETURNING *, status::text`, idValue, next, actor.userId);
    await audit(tx, { action: next === 'READY_FOR_APPROVAL' ? 'SUBMITTED_FOR_APPROVAL' : next, actorId: actor.userId, caseId: pub.caseId, clientId: pub.clientId, matterPublicationId: isMatter ? idValue : null, documentPublicationId: isMatter ? null : idValue, documentVersionId: pub.documentVersionId, fromStatus: pub.status, toStatus: next, metadataSafe: input.acknowledgement ? { acknowledgement: String(input.acknowledgement).slice(0, 200) } : {} });
    if (next === 'READY_FOR_APPROVAL') await notifyOnce(tx, pub.preparedById, pub.caseId, 'Client publication awaiting approval');
    return isMatter ? toClientMatterPublicationDTO(row!, await latestMatterRevision(tx, idValue)) : toClientDocumentPublicationDTO(row!);
  });
}

async function assertDocumentEligibility(db: Db, pub: Row, input: Row): Promise<void> {
  const source = await documentSource(db, pub.documentId, pub.documentVersionId);
  if (!source.storageReference && !source.spItemId) throw new ClientPublicationError(409, 'FILE_NOT_AVAILABLE', 'Published document version must have a controlled file reference.');
  const currentHash = hash(pick(source, ['documentId', 'versionId', 'version', 'size', 'storageReference', 'spItemId', 'createdAt']));
  if (currentHash !== pub.sourceFingerprint) throw new ClientPublicationError(409, 'SOURCE_FINGERPRINT_CHANGED', 'Source content changed since preparation.');
  const approved = await one(db, 'SELECT id FROM document_reviews WHERE "documentId"=$1 AND "approvedVersionId"=$2 AND status IN ($3::"DocumentReviewStatus",$4::"DocumentReviewStatus") LIMIT 1', pub.documentId, pub.documentVersionId, 'APPROVED', 'CLOSED');
  if (!approved) throw new ClientPublicationError(409, 'APPROVED_REVIEW_REQUIRED', 'Document publication requires approved review evidence.');
  const blocking = await one(db, 'SELECT count(*)::int AS count FROM review_points p JOIN document_reviews r ON r.id=p."reviewId" WHERE r."approvedVersionId"=$1 AND p.severity=$2::"ReviewPointSeverity" AND p.status IN ($3::"ReviewPointStatus",$4::"ReviewPointStatus")', pub.documentVersionId, 'BLOCKING', 'OPEN', 'ANSWERED');
  if (Number(blocking?.count || 0) > 0 && !input.acknowledgeBlockingReview) throw new ClientPublicationError(409, 'BLOCKING_REVIEW_WARNING_ACK_REQUIRED', 'Blocking review warning requires acknowledgement.');
}

export const submitMatterPublication = (actor: Actor, id: string, input: Row, db = defaultPrisma) => transitionPublication(actor, 'client_matter_publications', id, 'submit', input, db);
export const approveMatterPublication = (actor: Actor, id: string, input: Row, db = defaultPrisma) => transitionPublication(actor, 'client_matter_publications', id, 'approve', input, db);
export const publishMatterPublication = (actor: Actor, id: string, input: Row, db = defaultPrisma) => transitionPublication(actor, 'client_matter_publications', id, 'publish', input, db);
export const revokeMatterPublication = (actor: Actor, id: string, input: Row, db = defaultPrisma) => transitionPublication(actor, 'client_matter_publications', id, 'revoke', input, db);
export const supersedeMatterPublication = (actor: Actor, id: string, input: Row, db = defaultPrisma) => transitionPublication(actor, 'client_matter_publications', id, 'supersede', input, db);
export const submitDocumentPublication = (actor: Actor, id: string, input: Row, db = defaultPrisma) => transitionPublication(actor, 'client_document_publications', id, 'submit', input, db);
export const approveDocumentPublication = (actor: Actor, id: string, input: Row, db = defaultPrisma) => transitionPublication(actor, 'client_document_publications', id, 'approve', input, db);
export const publishDocumentPublication = (actor: Actor, id: string, input: Row, db = defaultPrisma) => transitionPublication(actor, 'client_document_publications', id, 'publish', input, db);
export const revokeDocumentPublication = (actor: Actor, id: string, input: Row, db = defaultPrisma) => transitionPublication(actor, 'client_document_publications', id, 'revoke', input, db);
export const supersedeDocumentPublication = (actor: Actor, id: string, input: Row, db = defaultPrisma) => transitionPublication(actor, 'client_document_publications', id, 'supersede', input, db);

export async function listMatterPublications(actor: Actor, caseId: string, db: PrismaClient = defaultPrisma): Promise<Row[]> {
  requireFoundation(); requireInternal(actor); await assertCaseAccess(db, actor, caseId);
  const rows = await many(db, 'SELECT *, status::text FROM client_matter_publications WHERE "caseId"=$1 ORDER BY "updatedAt" DESC', caseId);
  return Promise.all(rows.map(async (row) => toClientMatterPublicationDTO(row, await latestMatterRevision(db, row.id))));
}

export async function listDocumentPublications(actor: Actor, caseId: string, documentId?: string | null, db: PrismaClient = defaultPrisma): Promise<Row[]> {
  requireFoundation(); requireInternal(actor); await assertCaseAccess(db, actor, caseId);
  const rows = await many(db, `SELECT *, status::text FROM client_document_publications WHERE "caseId"=$1 ${documentId ? 'AND "documentId"=$2' : ''} ORDER BY "updatedAt" DESC`, ...(documentId ? [caseId, documentId] : [caseId]));
  return rows.map(toClientDocumentPublicationDTO);
}

export async function getPublicationHistory(actor: Actor, caseId: string, db: PrismaClient = defaultPrisma): Promise<Row[]> {
  requireFoundation(); requireInternal(actor); await assertCaseAccess(db, actor, caseId);
  return many(db, 'SELECT id, action::text, "caseId", "clientId", "grantId", "matterPublicationId", "documentPublicationId", "actionRequestId", "safeUpdateId", "documentVersionId", "fromStatus", "toStatus", "createdAt" FROM client_publication_events WHERE "caseId"=$1 ORDER BY "createdAt" ASC', caseId);
}

export async function createActionRequest(actor: Actor, input: Row, db: PrismaClient = defaultPrisma): Promise<Row> {
  requireFoundation(); requireInternal(actor);
  const caseRow = await getCase(db, String(input.caseId)); await assertCaseAccess(db, actor, caseRow.id);
  const audience = input.audienceSnapshot ? json(input.audienceSnapshot, 'audienceSnapshot') : await activeAudience(db, caseRow.id, caseRow.clientId);
  const row = await one(db, 'INSERT INTO client_action_requests (id,"caseId","clientId",type,"clientSafeTitle","clientSafeInstructions","dueAt","linkedInternalTaskId","audienceSnapshot","preparedById") VALUES ($1,$2,$3,$4::"ClientActionRequestType",$5,$6,$7,$8,$9::jsonb,$10) RETURNING *, type::text, status::text', newId(), caseRow.id, caseRow.clientId, input.type || 'QUESTION', text(input.clientSafeTitle, 'clientSafeTitle', 240, true), text(input.clientSafeInstructions, 'clientSafeInstructions', 2000), input.dueAt ? new Date(input.dueAt) : null, input.linkedInternalTaskId || null, JSON.stringify(audience), actor.userId);
  await audit(db, { action: 'DRAFT_CREATED', actorId: actor.userId, caseId: caseRow.id, clientId: caseRow.clientId, actionRequestId: row!.id });
  return toClientActionRequestDTO(row!);
}

export async function transitionActionRequest(actor: Actor, requestId: string, action: 'approve' | 'publish' | 'cancel', input: Row = {}, db: PrismaClient = defaultPrisma): Promise<Row> {
  requireFoundation(); requireInternal(actor);
  return db.$transaction(async (tx) => {
    const row = await one(tx, 'SELECT *, type::text, status::text FROM client_action_requests WHERE id=$1 FOR UPDATE', requestId);
    if (!row) throw new ClientPublicationError(404, 'ACTION_REQUEST_NOT_FOUND', 'Action request not found.');
    await assertCaseAccess(tx, actor, row.caseId); requireExpected(row, input.expectedRevision);
    if (action === 'publish' && row.status === 'PUBLISHED') return toClientActionRequestDTO(row);
    if (action === 'cancel' && row.status === 'CANCELLED') return toClientActionRequestDTO(row);
    const next = action === 'approve' && row.status === 'DRAFT'
      ? 'APPROVED'
      : action === 'publish' && row.status === 'APPROVED'
        ? 'PUBLISHED'
        : action === 'cancel' && ['DRAFT', 'APPROVED', 'PUBLISHED'].includes(row.status)
          ? 'CANCELLED'
          : null;
    if (!next) throw new ClientPublicationError(409, 'INVALID_ACTION_REQUEST_TRANSITION', 'Action request transition is not allowed.');
    const updated = await one(tx, 'UPDATE client_action_requests SET status=$2::"ClientActionRequestStatus", "approvedById"=CASE WHEN $2 IN ($4,$5) THEN COALESCE("approvedById",$3) ELSE "approvedById" END, "publishedById"=CASE WHEN $2=$5 THEN $3 ELSE "publishedById" END, "updatedAt"=now(), revision=revision+1 WHERE id=$1 RETURNING *, type::text, status::text', requestId, next, actor.userId, 'APPROVED', 'PUBLISHED');
    const eventAction = next === 'APPROVED' ? 'ACTION_REQUEST_APPROVED' : next === 'CANCELLED' ? 'ACTION_REQUEST_CANCELLED' : 'ACTION_REQUEST_PUBLISHED';
    await audit(tx, { action: eventAction, actorId: actor.userId, caseId: row.caseId, clientId: row.clientId, actionRequestId: requestId, fromStatus: row.status, toStatus: next });
    return toClientActionRequestDTO(updated!);
  });
}

export async function createSafeUpdate(actor: Actor, input: Row, db: PrismaClient = defaultPrisma): Promise<Row> {
  requireFoundation(); requireInternal(actor);
  const caseRow = await getCase(db, String(input.caseId)); await assertCaseAccess(db, actor, caseRow.id);
  const audience = input.audienceSnapshot ? json(input.audienceSnapshot, 'audienceSnapshot') : await activeAudience(db, caseRow.id, caseRow.clientId);
  const row = await one(db, 'INSERT INTO client_safe_updates (id,"caseId","clientId",title,body,category,status,"sourceInternalEventType","sourceInternalEventId","audienceSnapshot","preparedById") VALUES ($1,$2,$3,$4,$5,$6::"ClientSafeUpdateCategory",$7::"ClientSafeUpdateStatus",$8,$9,$10::jsonb,$11) RETURNING *, category::text, status::text', newId(), caseRow.id, caseRow.clientId, text(input.title, 'title', 240, true), text(input.body, 'body', 3000, true), input.category || 'GENERAL', 'DRAFT', input.sourceInternalEventType || null, input.sourceInternalEventId || null, JSON.stringify(audience), actor.userId);
  await audit(db, { action: 'DRAFT_CREATED', actorId: actor.userId, caseId: caseRow.id, clientId: caseRow.clientId, safeUpdateId: row!.id });
  return toClientSafeUpdateDTO(row!);
}

export async function transitionSafeUpdate(actor: Actor, updateId: string, action: 'approve' | 'publish' | 'revoke', input: Row = {}, db: PrismaClient = defaultPrisma): Promise<Row> {
  requireFoundation(); requireInternal(actor);
  return db.$transaction(async (tx) => {
    const row = await one(tx, 'SELECT *, category::text, status::text FROM client_safe_updates WHERE id=$1 FOR UPDATE', updateId);
    if (!row) throw new ClientPublicationError(404, 'SAFE_UPDATE_NOT_FOUND', 'Safe update not found.');
    await assertCaseAccess(tx, actor, row.caseId); requireExpected(row, input.expectedRevision);
    if (action === 'publish' && row.status === 'PUBLISHED') return toClientSafeUpdateDTO(row);
    if (action === 'revoke' && row.status === 'REVOKED') return toClientSafeUpdateDTO(row);
    const next = action === 'approve' && row.status === 'DRAFT' ? 'APPROVED' : action === 'publish' && row.status === 'APPROVED' ? 'PUBLISHED' : action === 'revoke' && row.status === 'PUBLISHED' ? 'REVOKED' : null;
    if (!next) throw new ClientPublicationError(409, 'INVALID_SAFE_UPDATE_TRANSITION', 'Safe update transition is not allowed.');
    const updated = await one(tx, 'UPDATE client_safe_updates SET status=$2::"ClientSafeUpdateStatus", "approvedById"=CASE WHEN $2=$4 THEN $3 ELSE "approvedById" END, "publishedById"=CASE WHEN $2=$5 THEN $3 ELSE "publishedById" END, "publishedAt"=CASE WHEN $2=$5 THEN now() ELSE "publishedAt" END, "revokedAt"=CASE WHEN $2=$6 THEN now() ELSE "revokedAt" END, "updatedAt"=now(), revision=revision+1 WHERE id=$1 RETURNING *, category::text, status::text', updateId, next, actor.userId, 'APPROVED', 'PUBLISHED', 'REVOKED');
    await audit(tx, { action: next, actorId: actor.userId, caseId: row.caseId, clientId: row.clientId, safeUpdateId: updateId, fromStatus: row.status, toStatus: next });
    return toClientSafeUpdateDTO(updated!);
  });
}

export async function getPublicationOverview(actor: Actor, caseId: string, documentId?: string | null, db: PrismaClient = defaultPrisma): Promise<Row> {
  requireFoundation(); requireInternal(actor); await assertCaseAccess(db, actor, caseId);
  const caseRow = await getCase(db, caseId);
  const grants = await listGrants(actor, caseId, db);
  const documents = await listDocumentPublications(actor, caseId, documentId, db);
  const actions = (await many(db, 'SELECT *, type::text, status::text FROM client_action_requests WHERE "caseId"=$1 ORDER BY "updatedAt" DESC', caseId)).map(toClientActionRequestDTO);
  const updates = (await many(db, 'SELECT *, category::text, status::text FROM client_safe_updates WHERE "caseId"=$1 ORDER BY "updatedAt" DESC', caseId)).map(toClientSafeUpdateDTO);
  return {
    caseId,
    clientId: caseRow.clientId,
    gates: { foundationEnabled: CLIENT_PUBLICATION_GATES.foundation(), portalReadEnabled: CLIENT_PUBLICATION_GATES.portalRead(), portalActionsEnabled: CLIENT_PUBLICATION_GATES.portalActions() },
    warnings: buildWarnings(grants, documents, actions),
    grants,
    matterPublications: await listMatterPublications(actor, caseId, db),
    documentPublications: documents,
    actionRequests: actions,
    safeUpdates: updates,
    history: await getPublicationHistory(actor, caseId, db),
  };
}

function buildWarnings(grants: Row[], documents: Row[], actions: Row[]): Row[] {
  const warnings: Row[] = [];
  if (!grants.some((grant) => grant.status === 'ACTIVE')) warnings.push({ level: 'BLOCKING', code: 'NO_ACTIVE_AUDIENCE_GRANT', message: 'No active audience grant exists.' });
  grants.filter((grant) => grant.status === 'ACTIVE' && grant.validUntil && new Date(grant.validUntil).getTime() - Date.now() < 7 * 86400000).forEach(() => warnings.push({ level: 'INFO', code: 'GRANT_EXPIRES_SOON', message: 'An active grant expires soon.' }));
  documents.filter((doc) => !doc.clientFacingExplanation).forEach(() => warnings.push({ level: 'ACK_REQUIRED', code: 'NO_CLIENT_EXPLANATION', message: 'Document publication has no client-facing explanation.' }));
  actions.filter((action) => action.dueAt && new Date(action.dueAt).getTime() < Date.now() && !['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(action.status)).forEach(() => warnings.push({ level: 'ACK_REQUIRED', code: 'ACTION_REQUEST_DEADLINE_EXPIRED', message: 'Action request deadline has already expired.' }));
  return warnings;
}

export async function portalHomeSnapshot(actor: Actor, db: PrismaClient = defaultPrisma): Promise<Row> {
  const context = await resolvePortalContext(actor, db);
  const [matters, actionRequests, updates, relationship] = await Promise.all([
    listPortalMatters(actor, db),
    listPortalActionRequests(actor, null, db),
    listPortalSafeUpdates(actor, null, db),
    one(db, 'SELECT "relationshipMode"::text AS "relationshipMode" FROM clients WHERE id=ANY($1::text[]) ORDER BY id ASC LIMIT 1', context.clientIds),
  ]);
  const dto = {
    portalActionsEnabled: CLIENT_PUBLICATION_GATES.portalActions(),
    identity: { displayName: context.displayName, email: context.email },
    access: { state: 'ACTIVE', grantCount: context.grants.length },
    relationshipMode: relationship?.relationshipMode || 'PORTAL_CENTRIC',
    attention: actionRequests.items,
    matters: matters.items,
    updates: updates.items.slice(0, 8),
  };
  assertNoForbiddenPortalFields(dto);
  return dto;
}

type PortalContext = {
  userId: string;
  displayName: string | null;
  email: string | null;
  grants: Row[];
  caseIds: string[];
  clientIds: string[];
  workspaceMembershipIds: string[];
};

const PORTAL_ACTION_LABELS: Record<string, string> = {
  DOCUMENT_UPLOAD: 'Dokumentum bekérése',
  INFORMATION_REQUEST: 'Információkérés',
  APPROVAL_REQUEST: 'Belső használatra fenntartott korábbi típus',
  CONFIRMATION_REQUEST: 'Belső használatra fenntartott korábbi típus',
  QUESTION: 'Kérdés',
  DATA_FORM: 'Adatbekérés',
  QUESTION_RESPONSE: 'Kérdés megválaszolása',
  CORRECTION_REQUEST: 'Javítási kérés',
  MISSING_DOCUMENT_REQUEST: 'Hiányzó dokumentum bekérése',
};

const PORTAL_UPDATE_LABELS: Record<string, string> = {
  STATUS: 'Állapotfrissítés',
  DEADLINE: 'Határidő',
  DOCUMENT: 'Dokumentum',
  ACTION_REQUIRED: 'Teendő',
  GENERAL: 'Frissítés',
};

function requirePortalReadGate(): void {
  if (!CLIENT_PUBLICATION_GATES.portalRead()) throw new ClientPublicationError(503, 'CLIENT_PORTAL_READ_DISABLED', 'Client portal reads are disabled.');
}

function requirePortalActor(actor: Actor): void {
  if (!actor.userId || !['CLIENT_PORTAL', 'CLIENT'].includes(String(actor.role || ''))) throw new ClientPublicationError(403, 'PORTAL_ACTOR_REQUIRED', 'Portal reads require a customer portal actor.');
}

function asArray(value: unknown): Row[] {
  if (Array.isArray(value)) return value as Row[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function audienceGrants(row: Row): Row[] {
  const snapshot = row.audienceSnapshot ?? row.audiencesnapshot ?? {};
  if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
    return asArray((snapshot as Row).grants);
  }
  if (typeof snapshot === 'string') {
    try {
      const parsed = JSON.parse(snapshot);
      return asArray(parsed?.grants);
    } catch {
      return [];
    }
  }
  return [];
}

function audienceAllows(row: Row, grants: Row[], permission: string): boolean {
  const allowedGrantIds = new Set(audienceGrants(row).map((grant) => String(grant.id || '')).filter(Boolean));
  return grants.some((grant) => {
    const permissions = Array.isArray(grant.permissions) ? grant.permissions.map(String) : [];
    if (!permissions.includes(permission)) return false;
    return allowedGrantIds.size === 0 || allowedGrantIds.has(String(grant.id));
  });
}

function firstAuthorizedGrant(row: Row, grants: Row[], permission: string): Row | null {
  const allowedGrantIds = new Set(audienceGrants(row).map((grant) => String(grant.id || '')).filter(Boolean));
  return grants.find((grant) => {
    const permissions = Array.isArray(grant.permissions) ? grant.permissions.map(String) : [];
    if (!permissions.includes(permission)) return false;
    return allowedGrantIds.size === 0 || allowedGrantIds.has(String(grant.id));
  }) || null;
}

function publicationRecipientIds(row: Row): string[] {
  const value = row.recipientMembershipIds ?? row.recipientmembershipids;
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) return value.slice(1, -1).split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function documentGrantAllows(row: Row, grant: Row, permission: string): boolean {
  const permissions = Array.isArray(grant.permissions) ? grant.permissions.map(String) : [];
  if (!permissions.includes(permission)) return false;
  if (row.workspaceId && String(grant.workspaceId || '') !== String(row.workspaceId)) return false;
  const allowedGrantIds = new Set(audienceGrants(row).map((audienceGrant) => String(audienceGrant.id || '')).filter(Boolean));
  return allowedGrantIds.size === 0 || allowedGrantIds.has(String(grant.id));
}

function documentVisibleForContext(row: Row, context: PortalContext, permission = 'DOCUMENT_READ'): boolean {
  const grantAllows = context.grants.some((grant) => documentGrantAllows(row, grant, permission));
  if (!grantAllows) return false;
  if (String(row.visibility || 'WORKSPACE') !== 'SELECTED_PARTICIPANTS') return true;
  const recipientIds = new Set(publicationRecipientIds(row));
  return context.workspaceMembershipIds.some((membershipId) => recipientIds.has(String(membershipId)));
}

function firstDocumentGrant(row: Row, context: PortalContext, permission: string): Row | null {
  if (String(row.visibility || 'WORKSPACE') === 'SELECTED_PARTICIPANTS') {
    const recipientIds = new Set(publicationRecipientIds(row));
    if (!context.workspaceMembershipIds.some((membershipId) => recipientIds.has(String(membershipId)))) return null;
  }
  return context.grants.find((grant) => documentGrantAllows(row, grant, permission)) || null;
}

function portalDate(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : null;
}

function toPortalMatter(row: Row, revision: Row | null, counts: Row = {}): Row {
  const statusText = revision?.clientSafeCurrentPosition || revision?.clientSafeStatus || 'Az ügyvédi iroda által közzétett ügyfélbiztos státusz.';
  const nextStepText = revision?.clientSafeNextStep || null;
  const latestVisibleAt = portalDate(counts.latestUpdateAt) || portalDate(row.publishedAt) || portalDate(row.updatedAt);
  const dto = {
    id: row.id,
    caseId: row.caseId,
    title: revision?.clientSafeTitle || 'Közzétett ügy',
    statusLabel: 'Folyamatban',
    currentSummary: statusText,
    waitingOnLabel: revision?.clientSafeWaitingOn || (counts.attentionCount ? 'Ügyfél válasza szükséges' : 'Irodai feldolgozás'),
    waitingDescription: counts.attentionCount ? 'Közzétett teendő vár teljesítésre az ügyfélportálon.' : 'Jelenleg nincs közzétett ügyféloldali teendő.',
    nextStepLabel: nextStepText,
    nextStepTitle: nextStepText ? 'Következő lépés' : null,
    nextStepDescription: nextStepText,
    estimatedTiming: portalDate(revision?.publicTargetDate),
    responsibleLawyerDisplay: revision?.responsibleLawyerDisplay || null,
    responsibleLawyerContactSafe: null,
    publicDeadlines: revision?.publishedDeadlinesSnapshot || [],
    publishedAt: portalDate(row.publishedAt),
    updatedAt: portalDate(row.updatedAt),
    attentionCount: Number(counts.attentionCount || 0),
    documentCount: Number(counts.documentCount || 0),
    latestUpdateAt: latestVisibleAt,
    lastClientVisibleUpdateAt: latestVisibleAt,
  };
  assertNoForbiddenPortalFields(dto);
  return dto;
}

function toPortalDocument(row: Row, matter?: Row | null): Row {
  const versionLabel = row.versionNumber ? `Közzétett változat ${row.versionNumber}` : 'Közzétett változat';
  const dto = {
    id: row.id,
    matterId: row.matterPublicationId || matter?.id || null,
    matterTitle: matter?.title || null,
    title: row.clientFacingTitle,
    explanation: row.clientFacingExplanation || null,
    versionLabel,
    publishedAt: portalDate(row.publishedAt),
    stateLabel: row.status === 'PUBLISHED' ? 'Dokumentum elérhető' : row.status === 'SUPERSEDED' ? 'Már nem aktuális' : 'Visszavont',
    downloadAvailable: row.status === 'PUBLISHED',
    mimeType: row.mimeType || 'application/octet-stream',
    size: row.size || null,
  };
  assertNoForbiddenPortalFields(dto);
  return dto;
}

function toPortalAction(row: Row, matter?: Row | null): Row {
  const dto = {
    id: row.id,
    matterId: matter?.id || null,
    matterTitle: matter?.title || null,
    title: row.clientSafeTitle,
    instructions: row.clientSafeInstructions || null,
    typeLabel: PORTAL_ACTION_LABELS[row.type] || 'Teendő',
    dueAt: portalDate(row.dueAt),
    statusLabel: 'Teendője van',
    readOnlyNote: 'Az online teljesítés később lesz elérhető. Ez a portál most csak olvasható.',
  };
  assertNoForbiddenPortalFields(dto);
  return dto;
}

function toPortalUpdate(row: Row, matter?: Row | null): Row {
  const dto = {
    id: row.id,
    matterId: matter?.id || null,
    matterTitle: matter?.title || null,
    title: row.title,
    body: row.body,
    categoryLabel: PORTAL_UPDATE_LABELS[row.category] || 'Frissítés érkezett',
    publishedAt: portalDate(row.publishedAt),
  };
  assertNoForbiddenPortalFields(dto);
  return dto;
}

async function resolvePortalContext(actor: Actor, db: Db = defaultPrisma): Promise<PortalContext> {
  requirePortalReadGate();
  requirePortalActor(actor);
  const isCustomerIdentity = String(actor.role || '') === 'CLIENT_PORTAL';
  const user = isCustomerIdentity
    ? await one(db, 'SELECT id, "normalizedEmail" AS email, "displayName" AS name, status::text, "emailVerifiedAt" FROM client_portal_identities WHERE id=$1', actor.userId)
    : await one(db, 'SELECT id, email, name, role::text, status::text, "isActive" FROM users WHERE id=$1', actor.userId);
  if (!user) throw new ClientPublicationError(403, 'PORTAL_ACCESS_DENIED', 'Portal access is not active.');
  let activeMemberships: Row[] = [];
  if (isCustomerIdentity) {
    if (user.status !== 'ACTIVE' || !user.emailVerifiedAt) throw new ClientPublicationError(403, user.emailVerifiedAt ? 'CLIENT_IDENTITY_NOT_ACTIVE' : 'CLIENT_EMAIL_NOT_VERIFIED', 'Portal access is not active.');
    if (!actor.workspaceId) throw new ClientPublicationError(409, 'CLIENT_WORKSPACE_SELECTION_REQUIRED', 'Select an authorized workspace.');
    activeMemberships = await many(db, `SELECT m.id, m."workspaceId", m.status::text
      FROM client_portal_workspace_memberships m
      JOIN client_portal_workspaces w ON w.id=m."workspaceId"
      WHERE m."clientPortalIdentityId"=$1 AND m."workspaceId"=$2
        AND m.status='ACTIVE'::"ClientPortalWorkspaceMembershipStatus"
        AND (m."expiresAt" IS NULL OR m."expiresAt" > now())
        AND w.status='ACTIVE'::"ClientPortalWorkspaceStatus"`, actor.userId, actor.workspaceId);
    if (activeMemberships.length === 0) throw new ClientPublicationError(403, 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED', 'Active workspace membership is required.');
  } else if (user.role !== 'CLIENT' || user.status !== 'ACTIVE' || user.isActive === false) {
    throw new ClientPublicationError(403, 'PORTAL_ACCESS_DENIED', 'Portal access is not active.');
  }
  const grants = isCustomerIdentity
    ? await many(db, 'SELECT *, role::text, status::text, permissions::text[] FROM client_portal_grants WHERE "clientPortalIdentityId"=$1 AND "workspaceId"=$2 ORDER BY "updatedAt" DESC', actor.userId, actor.workspaceId)
    : await many(db, 'SELECT *, role::text, status::text, permissions::text[] FROM client_portal_grants WHERE "clientUserId"=$1 ORDER BY "updatedAt" DESC', actor.userId);
  const active = grants.filter((grant) => grant.status === 'ACTIVE' && (!grant.validUntil || new Date(grant.validUntil).getTime() > Date.now()) && (!grant.validFrom || new Date(grant.validFrom).getTime() <= Date.now()));
  if (active.length === 0) {
    const latest = grants[0];
    const code = latest?.status === 'SUSPENDED' ? 'CLIENT_PORTAL_GRANT_SUSPENDED' : latest?.status === 'REVOKED' ? 'CLIENT_PORTAL_GRANT_REVOKED' : latest?.status === 'EXPIRED' || latest?.validUntil ? 'CLIENT_PORTAL_GRANT_EXPIRED' : 'CLIENT_PORTAL_NO_ACTIVE_GRANT';
    throw new ClientPublicationError(403, code, 'No active portal access is available.');
  }
  return {
    userId: actor.userId,
    displayName: user.name || null,
    email: user.email || null,
    grants: active,
    caseIds: Array.from(new Set(active.map((grant) => String(grant.caseId)))),
    clientIds: Array.from(new Set(active.map((grant) => String(grant.clientId)))),
    workspaceMembershipIds: activeMemberships.map((membership) => String(membership.id)),
  };
}

async function matterRowsForContext(db: Db, context: PortalContext): Promise<Row[]> {
  if (!context.caseIds.length) return [];
  const rows = await many(db, `SELECT p.*, p.status::text, r.id AS "revisionId", r."clientSafeTitle", r."clientSafeStatus", r."clientSafeNextStep", r."clientSafeCurrentPosition", r."clientSafeWaitingOn", r."publicTargetDate", r."responsibleLawyerDisplay", r."publishedDeadlinesSnapshot"
    FROM client_matter_publications p
    JOIN client_matter_publication_revisions r ON r.id=p."currentRevisionId"
    WHERE p.status=$1::"ClientPublicationStatus" AND p."caseId"=ANY($2::text[])
    ORDER BY p."publishedAt" DESC, p.id ASC`, 'PUBLISHED', context.caseIds);
  return rows.filter((row) => audienceAllows(row, context.grants, 'MATTER_READ'));
}

async function portalMatterMap(db: Db, context: PortalContext): Promise<Map<string, Row>> {
  const rows = await matterRowsForContext(db, context);
  return new Map(rows.map((row) => [String(row.caseId), toPortalMatter(row, row)]));
}

export async function listPortalMatters(actor: Actor, db: PrismaClient = defaultPrisma): Promise<Row> {
  const context = await resolvePortalContext(actor, db);
  const rows = await matterRowsForContext(db, context);
  const counts = rows.length ? await many(db, `SELECT p."caseId",
      (SELECT count(*)::int FROM client_action_requests a WHERE a."caseId"=p."caseId" AND a.status='PUBLISHED'::"ClientActionRequestStatus") AS "attentionCount",
      (SELECT count(*)::int FROM client_document_publications d WHERE d."caseId"=p."caseId" AND d.status='PUBLISHED'::"ClientPublicationStatus") AS "documentCount",
      (SELECT max(u."publishedAt") FROM client_safe_updates u WHERE u."caseId"=p."caseId" AND u.status='PUBLISHED'::"ClientSafeUpdateStatus") AS "latestUpdateAt"
    FROM client_matter_publications p WHERE p.id=ANY($1::text[])`, rows.map((row) => row.id)) : [];
  const countByCase = new Map(counts.map((row) => [String(row.caseId), row]));
  const dto = { items: rows.map((row) => toPortalMatter(row, row, countByCase.get(String(row.caseId)))) };
  assertNoForbiddenPortalFields(dto);
  return dto;
}

export async function getPortalMatter(actor: Actor, publicationId: string, db: PrismaClient = defaultPrisma): Promise<Row> {
  const context = await resolvePortalContext(actor, db);
  const row = await one(db, `SELECT p.*, p.status::text, r.id AS "revisionId", r."clientSafeTitle", r."clientSafeStatus", r."clientSafeNextStep", r."responsibleLawyerDisplay", r."publishedDeadlinesSnapshot", r."milestonesSnapshot", r."progressPercentage"
    FROM client_matter_publications p JOIN client_matter_publication_revisions r ON r.id=p."currentRevisionId"
    WHERE p.id=$1 AND p.status='PUBLISHED'::"ClientPublicationStatus"`, publicationId);
  if (!row || !context.caseIds.includes(String(row.caseId)) || !audienceAllows(row, context.grants, 'MATTER_READ')) throw new ClientPublicationError(404, 'PORTAL_RESOURCE_NOT_FOUND', 'Portal content is not available.');
  const matter = toPortalMatter(row, row);
  const [documents, actions, updates] = await Promise.all([
    listPortalDocuments(actor, row.id, db),
    listPortalActionRequests(actor, row.id, db),
    listPortalSafeUpdates(actor, row.id, db),
  ]);
  // Published milestones + derived progress come only from the immutable current
  // revision; the customer-safe projection strips every internal field.
  const milestones = toCustomerMilestones(row.milestonesSnapshot);
  const dto = { ...matter, documents: documents.items, actionRequests: actions.items, updates: updates.items, milestones, progressPercentage: row.progressPercentage != null ? Number(row.progressPercentage) : null };
  assertNoForbiddenPortalFields(dto);
  return dto;
}

export async function listPortalDocuments(actor: Actor, matterPublicationId?: string | null, db: PrismaClient = defaultPrisma): Promise<Row> {
  const context = await resolvePortalContext(actor, db);
  const matterMap = await portalMatterMap(db, context);
  const caseIds = matterPublicationId
    ? Array.from(matterMap.entries()).filter(([, matter]) => matter.id === matterPublicationId).map(([caseId]) => caseId)
    : context.caseIds;
  if (!caseIds.length) return { items: [] };
  const rows = await many(db, `SELECT p.*, p.status::text, p.visibility::text, v.version AS "versionNumber", v."mimeType", v.size,
      coalesce(array_agg(r."workspaceMembershipId") FILTER (WHERE r."workspaceMembershipId" IS NOT NULL), ARRAY[]::text[]) AS "recipientMembershipIds"
    FROM client_document_publications p
    JOIN document_versions v ON v.id=p."documentVersionId"
    LEFT JOIN client_document_publication_recipients r ON r."documentPublicationId"=p.id
    WHERE p.status='PUBLISHED'::"ClientPublicationStatus" AND p."caseId"=ANY($1::text[])
    GROUP BY p.id, v.id
    ORDER BY p."publishedAt" DESC, p.id ASC`, caseIds);
  const dto = { items: rows.filter((row) => documentVisibleForContext(row, context, 'DOCUMENT_READ')).map((row) => toPortalDocument(row, matterMap.get(String(row.caseId)))) };
  assertNoForbiddenPortalFields(dto);
  return dto;
}

export async function getPortalDocument(actor: Actor, publicationId: string, db: PrismaClient = defaultPrisma): Promise<Row> {
  const context = await resolvePortalContext(actor, db);
  const matterMap = await portalMatterMap(db, context);
  const row = await one(db, `SELECT p.*, p.status::text, p.visibility::text, v.version AS "versionNumber", v."mimeType", v.size,
      coalesce(array_agg(r."workspaceMembershipId") FILTER (WHERE r."workspaceMembershipId" IS NOT NULL), ARRAY[]::text[]) AS "recipientMembershipIds"
    FROM client_document_publications p
    JOIN document_versions v ON v.id=p."documentVersionId"
    LEFT JOIN client_document_publication_recipients r ON r."documentPublicationId"=p.id
    WHERE p.id=$1 AND p.status='PUBLISHED'::"ClientPublicationStatus"
    GROUP BY p.id, v.id`, publicationId);
  if (!row || !context.caseIds.includes(String(row.caseId)) || !documentVisibleForContext(row, context, 'DOCUMENT_READ')) throw new ClientPublicationError(404, 'PORTAL_RESOURCE_NOT_FOUND', 'Portal content is not available.');
  return toPortalDocument(row, matterMap.get(String(row.caseId)));
}

export async function authorizePortalDocumentDownload(actor: Actor, publicationId: string, db: PrismaClient = defaultPrisma): Promise<Row> {
  const context = await resolvePortalContext(actor, db);
  const row = await one(db, `SELECT p.*, p.status::text, p.visibility::text, v.version AS "versionNumber", v."originalFileName", v."mimeType", v.size,
      coalesce(array_agg(r."workspaceMembershipId") FILTER (WHERE r."workspaceMembershipId" IS NOT NULL), ARRAY[]::text[]) AS "recipientMembershipIds"
    FROM client_document_publications p
    JOIN document_versions v ON v.id=p."documentVersionId"
    LEFT JOIN client_document_publication_recipients r ON r."documentPublicationId"=p.id
    WHERE p.id=$1 AND p.status='PUBLISHED'::"ClientPublicationStatus"
    GROUP BY p.id, v.id`, publicationId);
  if (!row || !context.caseIds.includes(String(row.caseId)) || !documentVisibleForContext(row, context, 'DOCUMENT_READ')) throw new ClientPublicationError(404, 'PORTAL_RESOURCE_NOT_FOUND', 'Portal content is not available.');
  const grant = firstDocumentGrant(row, context, 'DOCUMENT_DOWNLOAD');
  if (!grant) throw new ClientPublicationError(403, 'PORTAL_DOWNLOAD_FORBIDDEN', 'Document download is not available for this grant.');
  return {
    grantId: grant.id,
    publicationId: row.id,
    documentId: row.documentId,
    documentVersionId: row.documentVersionId,
    fileName: row.clientFacingTitle ? `${String(row.clientFacingTitle).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120)}.txt` : 'document',
    mimeType: row.mimeType || 'application/octet-stream',
  };
}

export async function listPortalActionRequests(actor: Actor, matterPublicationId?: string | null, db: PrismaClient = defaultPrisma): Promise<Row> {
  const context = await resolvePortalContext(actor, db);
  const matterMap = await portalMatterMap(db, context);
  const caseIds = matterPublicationId
    ? Array.from(matterMap.entries()).filter(([, matter]) => matter.id === matterPublicationId).map(([caseId]) => caseId)
    : context.caseIds;
  if (!caseIds.length) return { items: [] };
  const rows = await many(db, `SELECT *, type::text, status::text FROM client_action_requests
    WHERE status='PUBLISHED'::"ClientActionRequestStatus" AND "caseId"=ANY($1::text[])
    ORDER BY "dueAt" ASC NULLS LAST, "createdAt" DESC, id ASC`, caseIds);
  const dto = { items: rows.filter((row) => audienceAllows(row, context.grants, 'ACTION_REQUEST_READ')).map((row) => toPortalAction(row, matterMap.get(String(row.caseId)))) };
  assertNoForbiddenPortalFields(dto);
  return dto;
}

export async function getPortalActionRequest(actor: Actor, requestId: string, db: PrismaClient = defaultPrisma): Promise<Row> {
  const context = await resolvePortalContext(actor, db);
  const matterMap = await portalMatterMap(db, context);
  const row = await one(db, 'SELECT *, type::text, status::text FROM client_action_requests WHERE id=$1 AND status=$2::"ClientActionRequestStatus"', requestId, 'PUBLISHED');
  if (!row || !context.caseIds.includes(String(row.caseId)) || !audienceAllows(row, context.grants, 'ACTION_REQUEST_READ')) throw new ClientPublicationError(404, 'PORTAL_RESOURCE_NOT_FOUND', 'Portal content is not available.');
  return toPortalAction(row, matterMap.get(String(row.caseId)));
}

export async function listPortalSafeUpdates(actor: Actor, matterPublicationId?: string | null, db: PrismaClient = defaultPrisma): Promise<Row> {
  const context = await resolvePortalContext(actor, db);
  const matterMap = await portalMatterMap(db, context);
  const caseIds = matterPublicationId
    ? Array.from(matterMap.entries()).filter(([, matter]) => matter.id === matterPublicationId).map(([caseId]) => caseId)
    : context.caseIds;
  if (!caseIds.length) return { items: [] };
  const rows = await many(db, `SELECT *, category::text, status::text FROM client_safe_updates
    WHERE status='PUBLISHED'::"ClientSafeUpdateStatus" AND "caseId"=ANY($1::text[])
    ORDER BY "publishedAt" DESC NULLS LAST, id ASC`, caseIds);
  const dto = { items: rows.filter((row) => audienceAllows(row, context.grants, 'UPDATE_READ')).map((row) => toPortalUpdate(row, matterMap.get(String(row.caseId)))) };
  assertNoForbiddenPortalFields(dto);
  return dto;
}

export async function getPortalSafeUpdate(actor: Actor, updateId: string, db: PrismaClient = defaultPrisma): Promise<Row> {
  const context = await resolvePortalContext(actor, db);
  const matterMap = await portalMatterMap(db, context);
  const row = await one(db, 'SELECT *, category::text, status::text FROM client_safe_updates WHERE id=$1 AND status=$2::"ClientSafeUpdateStatus"', updateId, 'PUBLISHED');
  if (!row || !context.caseIds.includes(String(row.caseId)) || !audienceAllows(row, context.grants, 'UPDATE_READ')) throw new ClientPublicationError(404, 'PORTAL_RESOURCE_NOT_FOUND', 'Portal content is not available.');
  return toPortalUpdate(row, matterMap.get(String(row.caseId)));
}
