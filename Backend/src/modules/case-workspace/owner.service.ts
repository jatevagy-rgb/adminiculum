import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../prisma/prisma.service';
import { WorkspaceError, workspaceScope } from './tiles.service';
import { isCaseClientOwnerEnabled } from './capabilities';
export function eligibleOwner(person: {
    employmentStatus: string;
    startDate: Date | null;
    endDate: Date | null;
}, now = new Date()) {
    return person.employmentStatus === 'ACTIVE' && (!person.startDate || person.startDate <= now) && (!person.endDate || person.endDate >= now);
}
export async function readOwner(req: Request, caseId: string, db = prisma) {
    return db.$transaction(async (tx) => {
        const c = await workspaceScope(tx, req, caseId);
        const assignment = await tx.caseClientOwner.findUnique({ where: { caseId }, include: { person: { include: { organizationGroup: { select: { name: true } } } } } });
        const people = await tx.organizationPerson.findMany({ where: { clientId: c.clientId, employmentStatus: 'ACTIVE' }, select: { id: true, name: true, startDate: true, endDate: true, employmentStatus: true }, orderBy: { name: 'asc' } });
        const valid = Boolean(assignment?.person && assignment.clientId === c.clientId && assignment.person.clientId === c.clientId && eligibleOwner(assignment.person));
        return { revision: assignment?.revision ?? 0, personId: valid ? assignment!.personId : null, owner: assignment?.person ? { name: assignment.person.name, organizationGroupName: assignment.person.organizationGroup?.name ?? null, valid } : null, candidates: people.filter(p => eligibleOwner(p)).map(p => ({ id: p.id, name: p.name })), canManage: c.canManage };
    });
}
export async function saveOwner(req: Request, caseId: string, input: any, db = prisma) {
    if (!input || Object.keys(input).some(k => !['revision', 'personId'].includes(k)) || !Number.isSafeInteger(input.revision) || input.revision < 0 || (input.personId !== null && (typeof input.personId !== 'string' || input.personId.length > 80)))
        throw new WorkspaceError(400, 'INVALID_OWNER_INPUT');
    const view = await readOwner(req, caseId, db);
    let selectedOwner: {
        name: string;
        organizationGroupName: string | null;
        valid: boolean;
    } | null = null;
    await db.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT id FROM cases WHERE id=${caseId} FOR UPDATE`;
        const c = await workspaceScope(tx, req, caseId);
        if (!c.canManage)
            throw new WorkspaceError(403, 'CASE_MANAGE_REQUIRED');
        const previous = await tx.caseClientOwner.findUnique({ where: { caseId } });
        if ((previous?.revision ?? 0) !== input.revision)
            throw new WorkspaceError(409, 'OWNER_REVISION_CONFLICT');
        if (input.personId) {
            await tx.$queryRaw `SELECT id FROM organization_persons WHERE id=${input.personId} FOR UPDATE`;
            const person = await tx.organizationPerson.findUnique({ where: { id: input.personId }, include: { organizationGroup: { select: { name: true } } } });
            if (!person || person.clientId !== c.clientId || !eligibleOwner(person))
                throw new WorkspaceError(422, 'OWNER_NOT_ELIGIBLE');
            selectedOwner = { name: person.name, organizationGroupName: person.organizationGroup?.name ?? null, valid: true };
        }
        const data = { clientId: c.clientId, personId: input.personId, revision: input.revision + 1, updatedById: req.user!.userId };
        await tx.caseClientOwner.upsert({ where: { caseId }, create: { caseId, ...data }, update: data });
        await tx.caseClientOwnerEvent.create({ data: { caseId, clientId: c.clientId, personId: input.personId, revision: data.revision, actorId: req.user!.userId, reason: 'EXPLICIT_ASSIGNMENT' } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { ...view, revision: input.revision + 1, personId: input.personId, owner: selectedOwner };
}
// Called by both report preview and PDF, only when the additive capability is enabled.
export async function savedOwnerPersonId(db: typeof prisma, caseId: string, clientId: string): Promise<string | null> {
    if (!isCaseClientOwnerEnabled())
        return null;
    const a = await db.caseClientOwner.findUnique({ where: { caseId }, include: { person: true, case: { select: { clientId: true } } } });
    return a?.person && a.clientId === clientId && a.case.clientId === clientId && a.person.clientId === clientId && eligibleOwner(a.person) ? a.person.id : null;
}
