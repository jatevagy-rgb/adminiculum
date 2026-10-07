import { prisma as defaultPrisma } from '../../../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import { assertClientReadAccess, type InternalActor } from '../../client-interaction/base';
import { GROW_ASSESSMENT_KIND, GROW_ASSESSMENT_SCHEMA, GROW_ASSESSMENT_V2_SCHEMA, getAssessmentPackVersion } from './registry';
import { buildResultDto } from './service';

/** Read-only declared-evidence summary; the existing workforce/client guard is authoritative. */
export async function listGrowAssessmentSummaries(actor: InternalActor, clientId: string, db = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, db);
  // A repeatedly completed pack must not displace every other branch/process.
  const rows = await db.$queryRaw<Array<{ id: string; observedAt: Date; rawPayload: Prisma.JsonValue }>>`
    SELECT * FROM (
      SELECT DISTINCT ON ("rawPayload"->>'packKey', "rawPayload"->>'packVersion',
        COALESCE("rawPayload"->>'processId', ''), COALESCE("rawPayload"->'provenance'->>'workspaceId', ''))
        "id", "observedAt", "rawPayload"
      FROM "observations" WHERE "clientId" = ${clientId}
        AND "observationType"::text = 'DECLARED_SURVEY'
        AND "rawPayload"->>'kind' = ${GROW_ASSESSMENT_KIND}
        AND "rawPayload"->>'schema' IN (${GROW_ASSESSMENT_SCHEMA}, ${GROW_ASSESSMENT_V2_SCHEMA})
      ORDER BY "rawPayload"->>'packKey', "rawPayload"->>'packVersion',
        COALESCE("rawPayload"->>'processId', ''), COALESCE("rawPayload"->'provenance'->>'workspaceId', ''),
        "observedAt" DESC, "id" DESC
    ) AS latest ORDER BY "observedAt" DESC, "id" DESC LIMIT 50
  `;
  const processes = await db.businessProcess.findMany({ where: { clientId }, select: { id: true, name: true } });
  const workspaces = await db.clientPortalWorkspace.findMany({ where: { clientId }, select: { id: true, name: true } });
  const identityIds = [...new Set(rows.flatMap(row => {
    const p = row.rawPayload as any;
    return typeof p?.provenance?.identityId === 'string' ? [p.provenance.identityId as string] : [];
  }))];
  const identities = identityIds.length ? await db.clientPortalIdentity.findMany({ where: { id: { in: identityIds } }, select: { id: true, displayName: true } }) : [];
  return { items: rows.map(row => {
    const p = row.rawPayload as any;
    const pack = getAssessmentPackVersion(p.packKey, p.packVersion);
    let result = null;
    try { result = buildResultDto(p.packKey, p.packVersion, p.answers, row.observedAt.toISOString()); } catch { /* Recorded unsupported versions stay explicitly unavailable. */ }
    return {
      id: row.id, completedAt: row.observedAt.toISOString(), packKey: p.packKey, packVersion: p.packVersion,
      titleHu: pack?.titleHu || 'Korábbi felmérés', sourceKind: 'DECLARED_SURVEY' as const,
      submittedBy: identities.find(i => i.id === p.provenance?.identityId)?.displayName || 'Ügyfél által megadott információ',
      workspaceName: workspaces.find(w => w.id === p.provenance?.workspaceId)?.name || null,
      processName: processes.find(process => process.id === p.processId)?.name || null,
      result,
      answers: result && pack ? p.answers.map((a: { questionKey: string; answer: string }) => {
        const question = pack.questions.find(q => q.questionKey === a.questionKey)!;
        return { questionHu: question.promptHu, answerHu: question.options.find(o => o.value === a.answer)?.labelHu || a.answer };
      }) : [],
      nextDecisionHu: 'A jelzések és a folyamat megfigyeléseinek összevetése után döntsön a szakmai vizsgálat következő lépéséről. A felmérés önmagában nem hoz létre fejlesztési lehetőséget vagy kezdeményezést.',
    };
  }) };
}
