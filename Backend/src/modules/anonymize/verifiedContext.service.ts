import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../prisma/prisma.service';
import { workspaceScope, WorkspaceError } from '../case-workspace/tiles.service';
import { hrConfidentialReadAllowed } from '../documents/authorization';
import { readVersionContentText, versionStorageReference } from '../documents/versionContent.service';
import driveService from '../sharepoint/driveService';
import { getScanner } from '../upload-security/scannerAdapter';
import { anonymizeDocument } from './services';
const RULES = 'wf10-existing-redactor-2';
const digest = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
async function source(tx: Prisma.TransactionClient, req: Request, documentId: string, versionId: string, manage: boolean) {
    const v = await tx.documentVersion.findUnique({ where: { id: versionId }, include: { document: true } });
    if (!v || v.documentId !== documentId)
        throw new WorkspaceError(404, 'SOURCE_VERSION_UNAVAILABLE');
    const scope = await workspaceScope(tx, req, v.document.caseId);
    if (manage && !scope.canManage)
        throw new WorkspaceError(403, 'CASE_MANAGE_REQUIRED');
    if (v.document.clientId !== scope.clientId || (v.document.securityClassification === 'HR_CONFIDENTIAL' && !hrConfidentialReadAllowed(req.user?.role)))
        throw new WorkspaceError(403, 'SOURCE_SCOPE_FORBIDDEN');
    if (v.securityScanStatus !== 'CLEAN' || !versionStorageReference(v))
        throw new WorkspaceError(409, 'SOURCE_PROCESSING_UNAVAILABLE');
    const client = await tx.client.findUniqueOrThrow({ where: { id: scope.clientId }, include: { redactorProfile: true } });
    const caseFacts = await tx.case.findUniqueOrThrow({ where: { id: scope.id }, select: { clientName: true, clientRole: true } });
    return { v, scope, profileDigest: digest(JSON.stringify({ client, caseFacts })) };
}
async function bytes(v: Awaited<ReturnType<typeof source>>['v']) {
    const buffer = await driveService.downloadDocument(versionStorageReference(v)!);
    if (!buffer || buffer.length === 0 || buffer.length > 20 * 1024 * 1024)
        throw new WorkspaceError(409, 'SOURCE_CONTENT_UNAVAILABLE');
    const scanner = getScanner();
    const scan = await scanner.scan({ buffer, fileName: v.originalFileName || 'document', detectedMimeType: v.mimeType, sizeBytes: buffer.length });
    if (scan.outcome !== 'CLEAN' || scan.provider === 'NONE')
        throw new WorkspaceError(409, 'SOURCE_SCAN_UNVERIFIED');
    return { buffer, scanProvider: scan.provider, sourceDigest: digest(buffer) };
}
export async function createVerifiedArtifact(req: Request, documentId: string, versionId: string, input: any) {
    if (!input || Object.keys(input).some(k => k !== 'extraPhrases') || (input.extraPhrases !== undefined && (!Array.isArray(input.extraPhrases) || input.extraPhrases.length > 50 || input.extraPhrases.some((p: unknown) => typeof p !== 'string' || p.trim().length < 3 || p.length > 200))))
        throw new WorkspaceError(400, 'INVALID_VERIFIED_ARTIFACT_INPUT');
    const initial = await prisma.$transaction(tx => source(tx, req, documentId, versionId, true));
    const content = await bytes(initial.v);
    const extracted = await readVersionContentText(initial.v, async () => content.buffer);
    if (!extracted.available || !extracted.text)
        throw new WorkspaceError(409, 'SOURCE_EXTRACTION_UNAVAILABLE');
    const artifactId = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT id FROM cases WHERE id=${initial.scope.id} FOR UPDATE`;
        await tx.$queryRaw `SELECT id FROM document_versions WHERE id=${versionId} FOR UPDATE`;
        const current = await source(tx, req, documentId, versionId, true);
        if (current.scope.clientId !== initial.scope.clientId || current.scope.id !== initial.scope.id || current.profileDigest !== initial.profileDigest || versionStorageReference(current.v) !== versionStorageReference(initial.v))
            throw new WorkspaceError(409, 'SOURCE_CHANGED_DURING_PROCESSING');
        const result = await anonymizeDocument({ documentId, userId: req.user!.userId, redactionLevel: 'FULL', counterparties: (input.extraPhrases || []).map((name: string) => ({ name, side: 'ADDITIONAL_PARTY' as const })) }, tx,
            { documentId, versionId, storageReference: versionStorageReference(current.v)!, text: extracted.text! });
        if (!result.success || !result.anonymizedDocumentId || !result.redactedText)
            throw new WorkspaceError(409, 'ANONYMIZATION_FAILED');
        await tx.anonymizedSourceBinding.create({ data: { artifactId: result.anonymizedDocumentId, sourceDocumentId: documentId, sourceDocumentVersionId: versionId, caseId: current.scope.id, clientId: current.scope.clientId, sourceDigest: content.sourceDigest, profileDigest: current.profileDigest, artifactDigest: digest(result.redactedText), rulesRevision: RULES, scanProvider: content.scanProvider, createdById: req.user!.userId } });
        return result.anonymizedDocumentId;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    return verifiedContext(req, artifactId, { sourceDocumentId: documentId, sourceDocumentVersionId: versionId, artifactRevision: 1 });
}
export async function verifiedContext(req: Request, artifactId: string, input: any) {
    if (!input || Object.keys(input).some(k => !['sourceDocumentId', 'sourceDocumentVersionId', 'artifactRevision'].includes(k)) || typeof input.sourceDocumentId !== 'string' || typeof input.sourceDocumentVersionId !== 'string' || input.artifactRevision !== 1)
        throw new WorkspaceError(400, 'INVALID_CONTEXT_EXPECTATION');
    const b = await prisma.anonymizedSourceBinding.findUnique({ where: { artifactId }, include: { artifact: true } });
    if (!b)
        throw new WorkspaceError(409, 'LEGACY_ARTIFACT_UNBOUND');
    if (b.sourceDocumentId !== input.sourceDocumentId || b.sourceDocumentVersionId !== input.sourceDocumentVersionId || b.artifactRevision !== input.artifactRevision || b.rulesRevision !== RULES)
        throw new WorkspaceError(409, 'ARTIFACT_REVISION_MISMATCH');
    const initial = await prisma.$transaction(tx => source(tx, req, b.sourceDocumentId, b.sourceDocumentVersionId, false));
    const content = await bytes(initial.v);
    return prisma.$transaction(async (tx) => {
        const current = await source(tx, req, b.sourceDocumentId, b.sourceDocumentVersionId, false);
        const fresh = await tx.anonymizedSourceBinding.findUnique({ where: { artifactId }, include: { artifact: true } });
        if (!fresh || current.scope.id !== b.caseId || current.scope.clientId !== b.clientId || current.profileDigest !== b.profileDigest || content.sourceDigest !== b.sourceDigest || versionStorageReference(current.v) !== versionStorageReference(initial.v) || fresh.artifactRevision !== b.artifactRevision || fresh.artifact.sourceDocId !== b.sourceDocumentId || fresh.artifact.caseId !== b.caseId || digest(fresh.artifact.content) !== b.artifactDigest)
            throw new WorkspaceError(409, 'CONTEXT_REVERIFICATION_FAILED');
        return { kind: 'VERSION_BOUND_ANONYMIZED_CONTEXT' as const, sourceDocumentId: b.sourceDocumentId, sourceDocumentVersionId: b.sourceDocumentVersionId, anonymizedArtifactId: b.artifactId, artifactRevision: b.artifactRevision, caseId: b.caseId, clientId: b.clientId, sourceVersionNumber: current.v.version, isCurrentVersion: current.v.isCurrent, availability: 'AVAILABLE', binding: 'VERSION_BOUND', outboundEligible: true, sanitizedText: fresh.artifact.content, label: 'Anonimizált dokumentum', notice: 'A technikai ellenőrzés nem igazolja a teljes anonimitást vagy a jogi engedélyt. Ellenőrizze a kimenő szöveget.' };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
