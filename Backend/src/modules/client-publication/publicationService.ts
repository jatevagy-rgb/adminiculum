import crypto from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';

type Db = PrismaClient | Prisma.TransactionClient;
type Actor = { userId: string; role?: string };
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
  return pick(row, ['id', 'clientUserId', 'clientId', 'caseId', 'role', 'status', 'permissions', 'validFrom', 'validUntil', 'activatedAt', 'suspendedAt', 'revokedAt', 'revocationReasonSafe', 'revision']);
}

export function toClientMatterPublicationDTO(row: Row, revision?: Row | null): Row {
  const dto = {
    ...pick(row, ['id', 'caseId', 'clientId', 'status', 'currentRevisionId', 'preparedById', 'approvedById', 'publishedById', 'approvedAt', 'publishedAt', 'revokedAt', 'supersededAt', 'revision']),
    snapshot: revision ? pick(revision, ['id', 'revisionNumber', 'clientSafeTitle', 'clientSafeStatus', 'clientSafeNextStep', 'responsibleLawyerDisplay', 'publishedDeadlinesSnapshot', 'safeUpdatesSnapshot', 'actionRequestsSnapshot', 'sourceFingerprint', 'audienceSnapshot', 'createdAt']) : null,
  };
  assertNoForbiddenPortalFields(dto);
  return dto;
}

export function toClientDocumentPublicationDTO(row: Row): Row {
  const dto = pick(row, ['id', 'caseId', 'clientId', 'documentId', 'documentVersionId', 'status', 'clientFacingTitle', 'clientFacingExplanation', 'approvedById', 'publishedById', 'approvedAt', 'publishedAt', 'revokedAt', 'revocationReasonSafe', 'supersededById', 'supersedesId', 'audienceSnapshot', 'sourceFingerprint', 'approvalReviewId', 'revision']);
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

export async function createMatterPublication(actor: Actor, input: Row, db: PrismaClient = defaultPrisma): Promise<Row> {
  requireFoundation(); requireInternal(actor);
  return db.$transaction(async (tx) => {
    const caseRow = await getCase(tx, String(input.caseId)); await assertCaseAccess(tx, actor, caseRow.id);
    const pub = await one(tx, 'INSERT INTO client_matter_publications (id,"caseId","clientId",status,"preparedById") VALUES ($1,$2,$3,$4::"ClientPublicationStatus",$5) RETURNING *, status::text', newId(), caseRow.id, caseRow.clientId, 'DRAFT', actor.userId);
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

async function documentSource(db: Db, documentId: string, versionId: string): Promise<Row> {
  const row = await one(db, 'SELECT d.id AS "documentId", d."caseId", d."clientId", coalesce(d.title,d.name,d."fileName") AS "documentTitle", v.id AS "versionId", v.version, v.name AS "versionName", v."originalFileName", v."mimeType", v.size, v."storageReference", v."spItemId", v."createdAt" FROM documents d JOIN document_versions v ON v."documentId"=d.id WHERE d.id=$1 AND v.id=$2', documentId, versionId);
  if (!row) throw new ClientPublicationError(404, 'DOCUMENT_VERSION_NOT_FOUND', 'Document version not found for document.');
  return row;
}

export async function createDocumentPublication(actor: Actor, input: Row, db: PrismaClient = defaultPrisma): Promise<Row> {
  requireFoundation(); requireInternal(actor);
  return db.$transaction(async (tx) => {
    const source = await documentSource(tx, String(input.documentId), String(input.documentVersionId));
    await assertCaseAccess(tx, actor, source.caseId);
    const audience = input.audienceSnapshot ? json(input.audienceSnapshot, 'audienceSnapshot') : await activeAudience(tx, source.caseId, source.clientId);
    const sourceFingerprint = hash(pick(source, ['documentId', 'versionId', 'version', 'size', 'storageReference', 'spItemId', 'createdAt']));
    const review = await one(tx, 'SELECT id FROM document_reviews WHERE "documentId"=$1 AND "approvedVersionId"=$2 AND status IN ($3::"DocumentReviewStatus",$4::"DocumentReviewStatus") ORDER BY "completedAt" DESC NULLS LAST LIMIT 1', source.documentId, source.versionId, 'APPROVED', 'CLOSED');
    const row = await one(tx, 'INSERT INTO client_document_publications (id,"caseId","clientId","documentId","documentVersionId",status,"clientFacingTitle","clientFacingExplanation","preparedById","audienceSnapshot","sourceFingerprint","approvalReviewId") VALUES ($1,$2,$3,$4,$5,$6::"ClientPublicationStatus",$7,$8,$9,$10::jsonb,$11,$12) RETURNING *, status::text', newId(), source.caseId, source.clientId, source.documentId, source.versionId, 'DRAFT', text(input.clientFacingTitle || source.documentTitle, 'clientFacingTitle', 240, true), text(input.clientFacingExplanation, 'clientFacingExplanation', 2000), actor.userId, JSON.stringify(audience), sourceFingerprint, review?.id ?? null);
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
    const row = await one(tx, 'UPDATE client_document_publications SET "clientFacingTitle"=$2, "clientFacingExplanation"=$3, "audienceSnapshot"=$4::jsonb, "updatedAt"=now(), revision=revision+1 WHERE id=$1 RETURNING *, status::text', publicationId, text(input.clientFacingTitle || pub.clientFacingTitle, 'clientFacingTitle', 240, true), text(input.clientFacingExplanation, 'clientFacingExplanation', 2000), JSON.stringify(input.audienceSnapshot ? json(input.audienceSnapshot, 'audienceSnapshot') : pub.audienceSnapshot));
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
    if (action === 'publish' && pub.status === 'APPROVED') { if (!PUBLISHER_ROLES.has(String(actor.role || ''))) throw new ClientPublicationError(403, 'PUBLISHER_NOT_AUTHORIZED', 'Actor cannot publish publication.'); await activeAudience(tx, pub.caseId, pub.clientId); if (table.includes('document')) await assertDocumentEligibility(tx, pub, input); next = 'PUBLISHED'; }
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
  if (!CLIENT_PUBLICATION_GATES.portalRead()) throw new ClientPublicationError(503, 'CLIENT_PORTAL_READ_DISABLED', 'Client portal reads are disabled.');
  if (String(actor.role || '') !== 'CLIENT') throw new ClientPublicationError(403, 'PORTAL_ACTOR_REQUIRED', 'Portal reads require a client actor.');
  const grants = await many(db, 'SELECT *, role::text, status::text, permissions::text[] FROM client_portal_grants WHERE "clientUserId"=$1 AND status=$2::"ClientPortalGrantStatus" AND ("validUntil" IS NULL OR "validUntil" > now())', actor.userId, 'ACTIVE');
  const caseIds = grants.map((grant) => grant.caseId);
  const matters = caseIds.length ? await many(db, 'SELECT *, status::text FROM client_matter_publications WHERE status=$1::"ClientPublicationStatus" AND "caseId"=ANY($2::text[])', 'PUBLISHED', caseIds) : [];
  const documents = caseIds.length ? await many(db, 'SELECT *, status::text FROM client_document_publications WHERE status=$1::"ClientPublicationStatus" AND "caseId"=ANY($2::text[])', 'PUBLISHED', caseIds) : [];
  const dto = { grants: grants.map(toClientPortalGrantSummaryDTO), matters: matters.map((row) => toClientMatterPublicationDTO(row, null)), documents: documents.map(toClientDocumentPublicationDTO), portalActionsEnabled: CLIENT_PUBLICATION_GATES.portalActions() };
  assertNoForbiddenPortalFields(dto);
  return dto;
}
