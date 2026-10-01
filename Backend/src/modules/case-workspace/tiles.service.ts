import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../prisma/prisma.service';
import { buildCaseReadScope } from '../cases/authorization';
export class WorkspaceError extends Error {
    constructor(public status: number, public code: string) { super(code); }
}
const builtins = ['current-state', 'subject', 'goal'];
const tones = ['info', 'teal', 'green'];
const fail = (code = 'INVALID_WORKSPACE_INPUT'): never => { throw new WorkspaceError(400, code); };
export const defaultPlacements = () => ({ overview: [...builtins], document: [...builtins] });
export type TileEdit = {
    id: string;
    revision: number;
    title: string;
    text: string;
    tone: string;
    archived: boolean;
};
export type TileSave = {
    layoutRevision: number;
    placements: {
        overview: string[];
        document: string[];
    };
    tiles: TileEdit[];
};
export function validateTileSave(value: any): TileSave {
    if (!value || Object.keys(value).some(k => !['layoutRevision', 'placements', 'tiles'].includes(k)))
        fail();
    if (!Number.isSafeInteger(value.layoutRevision) || value.layoutRevision < 0 || !Array.isArray(value.tiles) || value.tiles.length > 32)
        fail();
    if (!value.placements || Object.keys(value.placements).sort().join(',') !== 'document,overview')
        fail();
    for (const surface of ['overview', 'document']) {
        const refs = value.placements[surface];
        if (!Array.isArray(refs) || refs.length > 32 || new Set(refs).size !== refs.length || refs.some((r: unknown) => typeof r !== 'string' || r.length > 80))
            fail();
    }
    const ids = new Set<string>();
    for (const tile of value.tiles) {
        if (!tile || Object.keys(tile).some(k => !['id', 'revision', 'title', 'text', 'tone', 'archived'].includes(k)) ||
            typeof tile.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(tile.id) || ids.has(tile.id) ||
            !Number.isSafeInteger(tile.revision) || tile.revision < 0 ||
            typeof tile.title !== 'string' || !tile.title.trim() || tile.title.length > 120 ||
            typeof tile.text !== 'string' || tile.text.length > 6000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(tile.title + tile.text) ||
            !tones.includes(tile.tone) || typeof tile.archived !== 'boolean')
            fail();
        ids.add(tile.id);
    }
    return value;
}
// Repeat object authorization within the write transaction. Serializable conflicts
// are surfaced, never retried as an implicit last-write-wins operation.
export async function workspaceScope(tx: Prisma.TransactionClient, req: Request, caseId: string) {
    const scope = buildCaseReadScope(req.user?.userId, req.user?.role);
    const c = await tx.case.findFirst({ where: { id: caseId, ...(scope || {}) }, select: { id: true, clientId: true, createdById: true, assignedLawyerId: true } });
    if (!c)
        throw new WorkspaceError(403, 'CASE_ACCESS_FORBIDDEN');
    const canManage = ['ADMIN', 'PARTNER'].includes(req.user!.role) || c.createdById === req.user!.userId || c.assignedLawyerId === req.user!.userId;
    return { ...c, canManage };
}
export async function readTiles(req: Request, caseId: string, db = prisma) {
    return db.$transaction(async (tx) => {
        const scope = await workspaceScope(tx, req, caseId);
        const [tiles, layout] = await Promise.all([
            tx.caseWorkspaceTile.findMany({ where: { caseId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
            tx.caseWorkspaceLayout.findUnique({ where: { caseId_userId: { caseId, userId: req.user!.userId } } }),
        ]);
        return { tiles, layoutRevision: layout?.revision ?? 0, placements: layout?.placements ?? defaultPlacements(), canManage: scope.canManage };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
export async function saveTiles(req: Request, caseId: string, raw: unknown, db = prisma) {
    const input = validateTileSave(raw);
    return db.$transaction(async (tx) => {
        const scope = await workspaceScope(tx, req, caseId);
        if (input.tiles.length && !scope.canManage)
            throw new WorkspaceError(403, 'CASE_MANAGE_REQUIRED');
        const userId = req.user!.userId;
        const layout = await tx.caseWorkspaceLayout.findUnique({ where: { caseId_userId: { caseId, userId } } });
        if ((layout?.revision ?? 0) !== input.layoutRevision)
            throw new WorkspaceError(409, 'LAYOUT_REVISION_CONFLICT');
        for (const tile of input.tiles) {
            const existing = await tx.caseWorkspaceTile.findUnique({ where: { id: tile.id } });
            if (existing && existing.caseId !== caseId)
                throw new WorkspaceError(403, 'TILE_SCOPE_MISMATCH');
            if ((existing?.revision ?? 0) !== tile.revision)
                throw new WorkspaceError(409, 'TILE_REVISION_CONFLICT');
            const data = { title: tile.title.trim(), text: tile.text, tone: tile.tone, archived: tile.archived, updatedById: userId };
            if (!existing)
                await tx.caseWorkspaceTile.create({ data: { ...data, id: tile.id, caseId, createdById: userId } });
            else {
                const changed = await tx.caseWorkspaceTile.updateMany({ where: { id: tile.id, caseId, revision: tile.revision }, data: { ...data, revision: { increment: 1 } } });
                if (changed.count !== 1)
                    throw new WorkspaceError(409, 'TILE_REVISION_CONFLICT');
            }
        }
        const refs = [...new Set([...input.placements.overview, ...input.placements.document])].filter(r => !builtins.includes(r));
        const valid = await tx.caseWorkspaceTile.findMany({ where: { id: { in: refs }, caseId }, select: { id: true } });
        if (valid.length !== refs.length)
            throw new WorkspaceError(400, 'TILE_REFERENCE_UNAVAILABLE');
        if (!layout)
            await tx.caseWorkspaceLayout.create({ data: { caseId, userId, placements: input.placements } });
        else {
            const changed = await tx.caseWorkspaceLayout.updateMany({ where: { id: layout.id, revision: input.layoutRevision }, data: { placements: input.placements, revision: { increment: 1 } } });
            if (changed.count !== 1)
                throw new WorkspaceError(409, 'LAYOUT_REVISION_CONFLICT');
        }
        const tiles = await tx.caseWorkspaceTile.findMany({ where: { caseId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
        return { tiles, layoutRevision: input.layoutRevision + 1, placements: input.placements, canManage: scope.canManage };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
