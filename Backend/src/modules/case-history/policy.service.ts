import { createHash } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../prisma/prisma.service';
import { WorkspaceError, workspaceScope } from '../case-workspace/tiles.service';
import { getPortalMatterBase, isClientPublicationPublisherRole, ClientPublicationError } from '../client-publication/publicationService';
import { projectCustomerHistory, ApprovedHistorySource, CustomerHistoryLevel } from './projection';
type Actor = {
    userId: string;
    role?: string;
    workspaceId?: string;
};
type Overlay = {
    sourceKey: string;
    sourceRevision: string;
    excluded: boolean;
    customerText: string | null;
    includeTime: boolean;
};
type Snapshot = {
    level: CustomerHistoryLevel;
    audienceGrantId: string;
    publicationId: string;
    overlays: Overlay[];
};
type Source = ApprovedHistorySource & {
    sourceRevision: string;
};
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const iso = (v: unknown) => new Date(String(v)).toISOString();
async function audience(caseId: string, clientId: string, grantId: string, db: PrismaClient) {
    const grant = await db.clientPortalGrant.findUnique({ where: { id: grantId } });
    if (!grant || grant.caseId !== caseId || grant.clientId !== clientId || grant.status !== 'ACTIVE' || (!grant.clientPortalIdentityId && !grant.clientUserId) || (Boolean(grant.clientPortalIdentityId) && !grant.workspaceId) || !grant.permissions.includes('MATTER_READ') || grant.validFrom > new Date() || (grant.validUntil && grant.validUntil <= new Date()))
        throw new WorkspaceError(403, 'HISTORY_AUDIENCE_UNAVAILABLE');
    return grant.clientPortalIdentityId ? { userId: grant.clientPortalIdentityId, role: 'CLIENT_PORTAL', workspaceId: grant.workspaceId! } : { userId: grant.clientUserId!, role: 'CLIENT', workspaceId: undefined };
}
async function sources(actor: Actor, publicationId: string, db: PrismaClient): Promise<{
    caseId: string;
    clientId: string;
    sources: Source[];
}> {
    const matter = await getPortalMatterBase(actor, publicationId, db);
    const publication = await db.clientMatterPublication.findUniqueOrThrow({ where: { id: publicationId } });
    const caseRow = await db.case.findUniqueOrThrow({ where: { id: publication.caseId }, select: { clientId: true } });
    if (caseRow.clientId !== publication.clientId)
        throw new WorkspaceError(409, 'HISTORY_CLIENT_CHANGED');
    const result: Source[] = [];
    const add = (key: string, category: ApprovedHistorySource['category'], level: CustomerHistoryLevel, title: string, body: string | null, date: unknown, revision: unknown, minutes: number | null = null, published = true) => result.push({ sourceKey: key, caseId: publication.caseId, clientId: publication.clientId, category, minimumLevel: level, title, body, occurredAt: iso(date || publication.publishedAt || publication.createdAt), minutes, published, sourceRevision: hash(revision) });
    add(`status:${publication.id}`, 'STATUS', 1, 'Állapot', String(matter.currentSummary || matter.statusLabel), publication.publishedAt, publication.currentRevisionId);
    if (matter.nextStepDescription)
        add(`next:${publication.id}`, 'ACTION_REQUIRED', 1, 'Következő lépés', String(matter.nextStepDescription) + (matter.estimatedTiming ? ` · ${matter.estimatedTiming}` : ''), publication.publishedAt, publication.currentRevisionId);
    for (const m of matter.milestones || [])
        if (m.id || m.key || m.reference)
            add(`milestone:${publication.id}:${m.id || m.key || m.reference}`, 'MILESTONE', 2, String(m.title || m.label || 'Mérföldkő'), m.description || m.statusLabel || null, publication.publishedAt, { revision: publication.currentRevisionId, item: m });
    for (const u of matter.updates || [])
        add(`update:${u.id}`, 'SAFE_UPDATE', 2, String(u.title), String(u.body), u.publishedAt, u);
    for (const d of matter.documents || [])
        add(`document:${d.id}`, 'DOCUMENT', 2, String(d.title), d.explanation || d.versionLabel || null, d.publishedAt, d);
    const times = await db.timeEntry.findMany({ where: { OR: [{ caseId: publication.caseId }, { caseId: null, task: { caseId: publication.caseId } }] }, select: { id: true, workDate: true, minutes: true, updatedAt: true, description: true }, take: 201, orderBy: { id: 'asc' } });
    const events = await db.timelineEvent.findMany({ where: { caseId: publication.caseId, eventType: { not: 'TIME_LOGGED' } }, select: { id: true, createdAt: true, eventType: true, description: true, payload: true }, take: 201, orderBy: { id: 'asc' } });
    for (const t of times)
        add(`time:${t.id}`, 'REVIEWED_WORK', 3, 'Ellenőrzött munkavégzés', null, t.workDate, t, t.minutes, false);
    for (const e of events)
        add(`timeline:${e.id}`, 'REVIEWED_WORK', 3, 'Ellenőrzött esemény', null, e.createdAt, e, null, false);
    return { caseId: publication.caseId, clientId: publication.clientId, sources: result };
}
function validateSnapshot(input: any): Snapshot {
    if (!input || ![1, 2, 3].includes(input.level) || typeof input.audienceGrantId !== 'string' || typeof input.publicationId !== 'string' || !Array.isArray(input.overlays) || input.overlays.length > 200)
        throw new WorkspaceError(400, 'INVALID_HISTORY_POLICY');
    const keys = new Set();
    for (const o of input.overlays) {
        if (!o || typeof o.sourceKey !== 'string' || o.sourceKey.length > 200 || keys.has(o.sourceKey) || typeof o.sourceRevision !== 'string' || !/^[a-f0-9]{64}$/.test(o.sourceRevision) || typeof o.excluded !== 'boolean' || typeof o.includeTime !== 'boolean' || (o.customerText !== null && (typeof o.customerText !== 'string' || o.customerText.length > 3000 || /[<>\x00-\x08\x0b\x0c\x0e-\x1f]/.test(o.customerText))))
            throw new WorkspaceError(400, 'INVALID_HISTORY_OVERLAY');
        keys.add(o.sourceKey);
    }
    return { level: input.level, audienceGrantId: input.audienceGrantId, publicationId: input.publicationId, overlays: input.overlays.map((o: Overlay) => ({ sourceKey: o.sourceKey, sourceRevision: o.sourceRevision, excluded: o.excluded, customerText: o.customerText, includeTime: o.includeTime })) };
}
export async function readPolicy(req: Request, caseId: string, grantId?: string, publicationId?: string, skipSources = false) {
    const c = await prisma.$transaction(tx => workspaceScope(tx, req, caseId));
    const policy = await prisma.caseHistoryPolicy.findUnique({ where: { caseId }, include: { revisions: { orderBy: { number: 'desc' }, take: 1 } } });
    const draft = policy?.revisions[0] || null;
    const snapshot = draft?.snapshot as unknown as Snapshot | undefined;
    const grants = await prisma.clientPortalGrant.findMany({ where: { caseId, clientId: c.clientId, status: 'ACTIVE', validFrom: { lte: new Date() }, OR: [{validUntil:null},{validUntil:{gt:new Date()}}] }, select: { id: true, clientUserId: true, clientPortalIdentityId: true }, take: 100 });
    const publications = await prisma.clientMatterPublication.findMany({ where: { caseId, clientId: c.clientId, status: 'PUBLISHED' }, select: { id: true, currentRevisionId: true }, take: 100 });
    const [users, identities, publicationRevisions] = await Promise.all([
        prisma.user.findMany({where:{id:{in:grants.flatMap(g=>g.clientUserId?[g.clientUserId]:[])}},select:{id:true,name:true}}),
        prisma.clientPortalIdentity.findMany({where:{id:{in:grants.flatMap(g=>g.clientPortalIdentityId?[g.clientPortalIdentityId]:[])}},select:{id:true,displayName:true}}),
        prisma.clientMatterPublicationRevision.findMany({where:{id:{in:publications.flatMap(p=>p.currentRevisionId?[p.currentRevisionId]:[])}},select:{id:true,clientSafeTitle:true}}),
    ]);
    const grantLabels=grants.map(g=>({id:g.id,label:identities.find(i=>i.id===g.clientPortalIdentityId)?.displayName||users.find(u=>u.id===g.clientUserId)?.name||'Nem elérhető címzett'}));
    const publicationLabels=publications.map(p=>({id:p.id,label:publicationRevisions.find(r=>r.id===p.currentRevisionId)?.clientSafeTitle||'Közzétett ügy'}));
    const g = grantId || snapshot?.audienceGrantId;
    const p = publicationId || snapshot?.publicationId;
    let candidates: Source[] = [];
    if (g && p && !skipSources) {
        const a = await audience(caseId, c.clientId, g, prisma);
        const loaded = await sources(a, p, prisma);
        if (loaded.caseId !== caseId)
            throw new WorkspaceError(403, 'HISTORY_CASE_MISMATCH');
        candidates = loaded.sources;
    }
    return { revision: policy?.revision ?? 0, publishedNumber: policy?.publishedNumber ?? null, draftNumber: policy?.draftNumber ?? null, reviewed: Boolean(draft?.reviewedAt), snapshot: snapshot ?? null, grants: grantLabels, publications: publicationLabels, sources: candidates, canManage: c.canManage, canPublish: c.canManage && isClientPublicationPublisherRole(req.user?.role) };
}
async function checkedSources(req: Request, caseId: string, snapshot: Snapshot) {
    const c = await prisma.$transaction(tx => workspaceScope(tx, req, caseId));
    if (!c.canManage)
        throw new WorkspaceError(403, 'CASE_MANAGE_REQUIRED');
    const a = await audience(caseId, c.clientId, snapshot.audienceGrantId, prisma);
    const loaded = await sources(a, snapshot.publicationId, prisma);
    if (loaded.caseId !== caseId || loaded.clientId !== c.clientId)
        throw new WorkspaceError(403, 'HISTORY_SCOPE_MISMATCH');
    for (const o of snapshot.overlays) {
        const source = loaded.sources.find(s => s.sourceKey === o.sourceKey);
        if (!o.excluded && (!source || source.sourceRevision !== o.sourceRevision))
            throw new WorkspaceError(409, 'HISTORY_SOURCE_REVISION_CONFLICT');
    }
    return { c, loaded };
}
export async function savePolicy(req: Request, caseId: string, input: any) {
    if (!Number.isSafeInteger(input?.revision) || input.revision < 0)
        throw new WorkspaceError(400, 'INVALID_POLICY_REVISION');
    const snapshot = validateSnapshot(input.snapshot);
    const { c, loaded } = await checkedSources(req, caseId, snapshot);
    const view = await readPolicy(req, caseId, undefined, undefined, true);
    const prior = await prisma.caseHistoryPolicyRevision.findFirst({ where: { caseId }, orderBy: { number: 'desc' } });
    const priorKeys = new Set(((prior?.snapshot as unknown as Snapshot)?.overlays || []).map(o => o.sourceKey));
    for (const o of snapshot.overlays)
        if (!loaded.sources.some(s => s.sourceKey === o.sourceKey) && !(o.excluded && priorKeys.has(o.sourceKey)))
            throw new WorkspaceError(400, 'UNKNOWN_HISTORY_SOURCE');
    await prisma.$transaction(async (tx) => {
        const scope = await workspaceScope(tx, req, caseId);
        if (!scope.canManage || scope.clientId !== c.clientId)
            throw new WorkspaceError(409, 'HISTORY_SCOPE_CHANGED');
        const policy = await tx.caseHistoryPolicy.findUnique({ where: { caseId } });
        if (policy && policy.clientId !== c.clientId)
            throw new WorkspaceError(409, 'HISTORY_CLIENT_CHANGED');
        if ((policy?.revision ?? 0) !== input.revision)
            throw new WorkspaceError(409, 'HISTORY_REVISION_CONFLICT');
        const number = (policy?.draftNumber ?? 0) + 1;
        await tx.caseHistoryPolicy.upsert({ where: { caseId }, create: { caseId, clientId: c.clientId, revision: 1, draftNumber: number }, update: { revision: { increment: 1 }, draftNumber: number } });
        await tx.caseHistoryPolicyRevision.create({ data: { caseId, number, snapshot: snapshot as unknown as Prisma.InputJsonValue, createdById: req.user!.userId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { ...view, revision: input.revision + 1, draftNumber: (view.draftNumber ?? 0) + 1, snapshot, reviewed: false, sources: loaded.sources };
}
export async function transitionPolicy(req: Request, caseId: string, action: 'review' | 'publish' | 'withdraw', revision: number) {
    if (!Number.isSafeInteger(revision) || revision < 0)
        throw new WorkspaceError(400, 'INVALID_POLICY_REVISION');
    if (!isClientPublicationPublisherRole(req.user?.role))
        throw new WorkspaceError(403, 'HISTORY_PUBLISH_FORBIDDEN');
    const view = await readPolicy(req, caseId, undefined, undefined, true);
    const policy = await prisma.caseHistoryPolicy.findUniqueOrThrow({ where: { caseId } });
    const draft = await prisma.caseHistoryPolicyRevision.findUniqueOrThrow({ where: { caseId_number: { caseId, number: policy.draftNumber } } });
    const currentSources = action !== 'withdraw' ? (await checkedSources(req, caseId, draft.snapshot as unknown as Snapshot)).loaded.sources : [];
    await prisma.$transaction(async (tx) => {
        const c = await workspaceScope(tx, req, caseId);
        if (!c.canManage || c.clientId !== policy.clientId)
            throw new WorkspaceError(403, 'HISTORY_SCOPE_MISMATCH');
        const updated = await tx.caseHistoryPolicy.updateMany({ where: { caseId, revision, draftNumber: policy.draftNumber }, data: { revision: { increment: 1 }, ...(action === 'publish' ? { publishedNumber: policy.draftNumber } : action === 'withdraw' ? { publishedNumber: null } : {}) } });
        if (updated.count !== 1)
            throw new WorkspaceError(409, 'HISTORY_REVISION_CONFLICT');
        if (action === 'review')
            await tx.caseHistoryPolicyRevision.update({ where: { id: draft.id }, data: { reviewedById: req.user!.userId, reviewedAt: new Date() } });
        if (action === 'publish') {
            const fresh = await tx.caseHistoryPolicyRevision.findUniqueOrThrow({ where: { id: draft.id } });
            if (!fresh.reviewedAt)
                throw new WorkspaceError(409, 'HISTORY_REVIEW_REQUIRED');
            await tx.caseHistoryPolicyRevision.update({ where: { id: draft.id }, data: { publishedById: req.user!.userId, publishedAt: new Date() } });
        }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { ...view, sources: currentSources, revision: revision + 1, reviewed: action === 'review' ? true : view.reviewed, publishedNumber: action === 'publish' ? policy.draftNumber : action === 'withdraw' ? null : view.publishedNumber };
}
export async function projectPublishedHistory(actor: Actor, publicationId: string, period: {
    startDate?: string | null;
    endDate?: string | null;
} = {}, db: PrismaClient = prisma, draftSnapshot?: Snapshot) {
    const loaded = await sources(actor, publicationId, db);
    const policy = await db.caseHistoryPolicy.findUnique({ where: { caseId: loaded.caseId } });
    if (!policy || policy.clientId !== loaded.clientId)
        return { managed: false, policyRevision: null, items: [] };
    if (!policy.publishedNumber && !draftSnapshot) {
        const released = await db.caseHistoryPolicyRevision.count({ where: { caseId: loaded.caseId, publishedAt: { not: null } } });
        return { managed: released > 0, policyRevision: null, items: [] };
    }
    const revision = await db.caseHistoryPolicyRevision.findUnique({ where: { caseId_number: { caseId: loaded.caseId, number: policy.publishedNumber || policy.draftNumber } } });
    const snapshot = draftSnapshot || (revision?.snapshot as unknown as Snapshot);
    if (!snapshot || snapshot.publicationId !== publicationId)
        return { policyRevision: null, items: [] };
    const allowed = await audience(loaded.caseId, loaded.clientId, snapshot.audienceGrantId, db);
    if (allowed.userId !== actor.userId || allowed.workspaceId !== actor.workspaceId)
        return { policyRevision: null, items: [] };
    const overlays = new Map(snapshot.overlays.map(o => [o.sourceKey, o]));
    const text: Record<string, string> = {};
    const permitted = loaded.sources.map(s => {
        const o = overlays.get(s.sourceKey);
        if (o?.customerText !== null && o?.customerText !== undefined && o.sourceRevision === s.sourceRevision)
            text[s.sourceKey] = o.customerText;
        return { ...s, published: s.category === 'REVIEWED_WORK' ? Boolean(o?.customerText?.trim() && o.sourceRevision === s.sourceRevision && (draftSnapshot || revision?.reviewedAt)) : s.published, minutes: o?.includeTime ? s.minutes : null };
    }).filter(s => !overlays.has(s.sourceKey) || overlays.get(s.sourceKey)!.customerText === null || overlays.get(s.sourceKey)!.sourceRevision === s.sourceRevision);
    const items = projectCustomerHistory({ caseId: loaded.caseId, clientId: loaded.clientId, grantAuthorized: true, policy: { caseId: loaded.caseId, clientId: loaded.clientId, level: snapshot.level, excludedSourceKeys: snapshot.overlays.filter(o => o.excluded).map(o => o.sourceKey), customerText: text }, sources: permitted }).filter(i => (!period.startDate || i.occurredAt.slice(0, 10) >= period.startDate) && (!period.endDate || i.occurredAt.slice(0, 10) <= period.endDate)).map(i => ({ ...i, sourceKey: hash(i.sourceKey) }));
    return { managed: true, policyRevision: draftSnapshot ? 'DRAFT' : revision?.id ?? null, sourceSetDigest: hash(loaded.sources.map(s => [s.sourceKey, s.sourceRevision])), items };
}
export async function reportHistory(caseId: string, clientId: string, period: {
    startDate: string | null;
    endDate: string | null;
}, db: PrismaClient = prisma) {
    if (process.env.ENABLE_CUSTOMER_HISTORY_POLICY !== 'true')
        return null;
    const policy = await db.caseHistoryPolicy.findUnique({ where: { caseId } });
    if (!policy)
        return null;
    if (policy.clientId !== clientId)
        return { policyRevision: null, items: [] };
    if (!policy.publishedNumber) {
        const released = await db.caseHistoryPolicyRevision.count({ where: { caseId, publishedAt: { not: null } } });
        return released ? { policyRevision: null, items: [] } : null;
    }
    const revision = await db.caseHistoryPolicyRevision.findUniqueOrThrow({ where: { caseId_number: { caseId, number: policy.publishedNumber } } });
    const snapshot = revision.snapshot as unknown as Snapshot;
    try {
        const actor = await audience(caseId, clientId, snapshot.audienceGrantId, db);
        return await projectPublishedHistory(actor, snapshot.publicationId, period, db);
    } catch (error) {
        if ((error instanceof WorkspaceError || error instanceof ClientPublicationError) && [403, 404].includes(error.status)) return { policyRevision: revision.id, items: [] };
        throw error;
    }
}
export async function previewPolicy(req: Request, caseId: string) {
    const value = await readPolicy(req, caseId);
    if (!value.snapshot)
        return { policyRevision: null, items: [] };
    const { c } = await checkedSources(req, caseId, value.snapshot);
    const actor = await audience(caseId, c.clientId, value.snapshot.audienceGrantId, prisma);
    return projectPublishedHistory(actor, value.snapshot.publicationId, {}, prisma, value.snapshot);
}
