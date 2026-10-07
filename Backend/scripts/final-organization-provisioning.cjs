// Explicitly authorized three-client repair. Dry-run unless --apply is passed.
// No environment/flag changes, memberships, grants, enrollment, or company facts.
const crypto = require('node:crypto');
const path = require('node:path');
const TARGETS = [
  { id: '6dd4042f-789d-46fc-87ce-a644565b0110', name: 'Saubermacher-Magyarország Kft.' },
  { id: '3a20271d-92bc-4f38-b371-ea33ceea1a88', name: 'BlackBelt Technology Kft.' },
  { id: 'dad3980b-3336-4e94-83a6-8a7cd700ac9e', name: 'Bálintfy és Társai Ügyvédi Iroda' },
];
const digest = rows => crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const ordered = rows => rows.sort((a, b) => a.id.localeCompare(b.id));

async function inspect(tx, target) {
  // Raw reads support the deployed generated client predating Client.archivedAt.
  const clients = await tx.$queryRawUnsafe('SELECT * FROM clients WHERE id=$1', target.id);
  const client = clients[0];
  if (!client || client.name !== target.name || client.archivedAt) throw new Error('CLIENT_IDENTITY_OR_ACTIVE_STATE_MISMATCH');
  const workspaces = await tx.clientPortalWorkspace.findMany({ where: { clientId: target.id }, orderBy: { id: 'asc' } });
  if (workspaces.some(w => w.status === 'ARCHIVED' || w.archivedAt)) throw new Error('ARCHIVED_WORKSPACE_REQUIRES_SEPARATE_REVIEW');
  if (workspaces.length > 1 || workspaces.some(w => w.mode !== 'ORGANIZATION' || w.status !== 'ACTIVE')) throw new Error('WORKSPACE_COLLISION');
  const profile = await tx.clientOperatingProfile.findUnique({ where: { clientId: target.id } });
  const cases = await tx.case.findMany({ where: { clientId: target.id }, select: { id: true, clientId: true } });
  const caseIds = cases.map(c => c.id);
  const documents = await tx.document.findMany({ where: { OR: [{ clientId: target.id }, { caseId: { in: caseIds } }] }, select: { id: true, clientId: true, caseId: true } });
  const documentIds = documents.map(d => d.id);
  const business = {
    client: digest(client), cases: ordered(cases), documents: ordered(documents),
    versions: ordered(await tx.documentVersion.findMany({ where: { documentId: { in: documentIds } }, select: { id: true, documentId: true } })),
    tasks: ordered(await tx.task.findMany({ where: { caseId: { in: caseIds } }, select: { id: true, caseId: true } })),
    communications: ordered(await tx.communication.findMany({ where: { OR: [{ clientId: target.id }, { caseId: { in: caseIds } }] }, select: { id: true, clientId: true, caseId: true } })),
    timeEntries: ordered(await tx.timeEntry.findMany({ where: { caseId: { in: caseIds } }, select: { id: true, caseId: true } })),
    comments: ordered(await tx.comment.findMany({ where: { caseId: { in: caseIds } }, select: { id: true, caseId: true } })),
    timeline: ordered(await tx.timelineEvent.findMany({ where: { caseId: { in: caseIds } }, select: { id: true, caseId: true } })),
    requests: ordered(await tx.clientRequest.findMany({ where: { clientId: target.id }, select: { id: true, clientId: true } })),
    grants: ordered(await tx.clientPortalGrant.findMany({ where: { clientId: target.id } })),
    memberships: ordered(await tx.clientPortalWorkspaceMembership.findMany({ where: { workspaceId: { in: workspaces.map(w => w.id) } } })),
    scopes: ordered(await tx.clientPortalSummaryScope.findMany({ where: { workspaceId: { in: workspaces.map(w => w.id) } } })),
  };
  const countRow = await tx.client.findUnique({ where: { id: target.id }, select: { _count: true } });
  const counts = { ...countRow._count };
  delete counts.operatingProfile;
  // Include newer Grow/Compliance tables absent from an older generated client.
  const references = await tx.$queryRawUnsafe(`SELECT DISTINCT tc.table_name,kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.constraint_schema=kcu.constraint_schema
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.constraint_schema=tc.constraint_schema
    WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public' AND ccu.table_name='clients' AND ccu.column_name='id' ORDER BY tc.table_name,kcu.column_name`);
  for (const ref of references) {
    if (ref.table_name === 'client_operating_profiles') continue;
    const quote = value => '"' + value.replaceAll('"', '""') + '"';
    const rows = await tx.$queryRawUnsafe(`SELECT count(*)::int AS count FROM ${quote(ref.table_name)} WHERE ${quote(ref.column_name)}=$1`, target.id);
    counts[`${ref.table_name}.${ref.column_name}`] = rows[0].count;
  }
  business.relatedCounts = counts;
  return { clientId: target.id, workspaces, profile, businessDigest: digest(business), counts: { ...counts, cases: cases.length, documents: documents.length, versions: business.versions.length, tasks: business.tasks.length, communications: business.communications.length, timeEntries: business.timeEntries.length, comments: business.comments.length, timeline: business.timeline.length, grants: business.grants.length, memberships: business.memberships.length, scopes: business.scopes.length } };
}

async function runProvisioning({ db, services, actorEmail, apply = false, targets = TARGETS }) {
  return db.$transaction(async tx => {
    if (!apply) await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    // The canonical creation service does not lock a client or enforce uniqueness
    // by client/mode. Serialize workspace insertions for the brief repair transaction.
    if (apply) await tx.$executeRawUnsafe('LOCK TABLE client_portal_workspaces IN SHARE ROW EXCLUSIVE MODE');
    const actors = await tx.user.findMany({ where: { email: { equals: actorEmail, mode: 'insensitive' }, status: 'ACTIVE', isActive: true, role: { in: ['ADMIN', 'PARTNER'] } }, select: { id: true, role: true } });
    if (actors.length !== 1) throw new Error('EXACT_ACTIVE_ADMIN_ACTOR_REQUIRED');
    const actor = { userId: actors[0].id, role: actors[0].role };
    const before = [];
    for (const target of targets) {
      if (apply) await tx.$queryRawUnsafe('SELECT id FROM clients WHERE id=$1 FOR UPDATE', target.id);
      before.push(await inspect(tx, target));
    }
    if (!apply) return { applied: false, before };
    const created = [];
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i], state = before[i];
      const workspace = state.workspaces[0] || await services.createWorkspace(actor, { clientId: target.id, name: `${target.name} – Szervezeti munkatér`, mode: 'ORGANIZATION', communicationMode: 'PORTAL_PRIMARY', connectedSystemState: 'NOT_CONFIGURED' }, tx);
      const profile = state.profile || await services.upsertOperatingProfile(actor, target.id, {}, tx);
      created.push({ clientId: target.id, workspaceId: workspace.id, profileId: profile.id, workspaceCreated: !state.workspaces.length, profileCreated: !state.profile });
    }
    const after = [];
    for (let i = 0; i < targets.length; i++) {
      const state = await inspect(tx, targets[i]);
      if (state.businessDigest !== before[i].businessDigest) throw new Error('BUSINESS_OR_AUTHORIZATION_STATE_CHANGED');
      if (state.workspaces.length !== 1 || !state.profile) throw new Error('PROVISIONING_READBACK_FAILED');
      after.push(state);
    }
    return { applied: true, actorId: actor.userId, before, created, after };
  }, { isolationLevel: 'Serializable', timeout: 45000, maxWait: 10000 });
}

module.exports = { TARGETS, runProvisioning };

async function main() {
  const root = process.env.ADMINICULUM_SERVICE_ROOT || path.resolve(__dirname, '..');
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ log: [] });
  try {
    if (!process.env.PROVISIONING_ACTOR_EMAIL) throw new Error('VERIFIED_ACTOR_EMAIL_REQUIRED');
    const workspaceService = require(path.join(root, 'dist/modules/client-workspace/workspaceService.js'));
    const companyService = require(path.join(root, 'dist/modules/client-company/service.js'));
    const report = await runProvisioning({ db, actorEmail: process.env.PROVISIONING_ACTOR_EMAIL, apply: process.argv.includes('--apply'), services: { createWorkspace: workspaceService.createWorkspace, upsertOperatingProfile: companyService.upsertOperatingProfile } });
    console.log(JSON.stringify({ at: new Date().toISOString(), ...report }));
  } catch (error) {
    console.error(JSON.stringify({ result: 'BLOCKED', code: error.code || error.name, reason: /^[A-Z_]+$/.test(error.message) ? error.message : 'SERVICE_OR_SCHEMA_UNAVAILABLE' }));
    process.exitCode = 1;
  } finally { await db.$disconnect(); }
}
if (require.main === module) void main();
