/**
 * Client Portal routes — RC2F security patch
 *
 * The client portal is a future product track requiring a separate
 * authentication implementation (email-code, not Azure AD / local JWT).
 * Until ENABLE_CLIENT_PORTAL=true is set alongside that implementation,
 * every request to /api/v1/client-portal/* returns 501 FEATURE_NOT_AVAILABLE.
 *
 * The previous placeholder code used an x-user-id header with no JWT
 * verification, which created an unauthenticated data-access path. That
 * code has been removed. No Prisma queries run while the feature is disabled.
 */

import { Request, Response, Router } from 'express';
import { prisma } from '../prisma/prisma.service';
import { authenticateAndAuthorizeClient, requireAuthenticatedPortalUser } from '../modules/client-portal/portalAccessService';
import { authenticateClientPortal, requireActiveClientPortalSession, requireRegisteredClientPortalSession } from '../middleware/clientPortalAuth';
import documentsService from '../modules/documents/services';
import {
  authorizePortalDocumentDownload,
  ClientPublicationError,
  CLIENT_PUBLICATION_GATES,
  getPortalActionRequest,
  getPortalDocument,
  getPortalMatter,
  getPortalSafeUpdate,
  listPortalActionRequests,
  listPortalDocuments,
  listPortalMatters,
  listPortalSafeUpdates,
  portalHomeSnapshot,
} from '../modules/client-publication/publicationService';
import { resolveActiveCustomerGrant } from '../modules/client-interaction/base';
import { listCustomerRequests } from '../modules/client-interaction/requestService';
import { listCustomerSubmissions } from '../modules/client-interaction/submissionService';
import { listCustomerThreads } from '../modules/client-interaction/questionService';
import {
  getOnboardingContext,
  getPortalIdentityContext,
  resolvePortalWorkspace,
  ResolvedPortalWorkspace,
} from '../modules/client-workspace/workspaceService';
import { resolveMemberUnits } from '../modules/client-workspace/organizationUnitService';
import { getOrganizationalCaseDetail, listOrganizationalCases, OrganizationalCaseListParams } from '../modules/client-workspace/organizationalCaseService';
import { organizationSummary, unitSummary } from '../modules/client-workspace/leadershipSummaryService';
import { getOrganizationalHome } from '../modules/client-workspace/orgHomeService';
import { getOrganizationalContracts } from '../modules/client-workspace/orgContractsService';
import { getOrganizationalCompany } from '../modules/client-workspace/orgCompanyService';
import { answerCompanyProfileQuestion, assignCompanyProfileResponsibility, getCompanyProfileDiscovery } from '../modules/client-workspace/companyProfileAnswerService';
import { RelationshipToCase } from '../modules/client-workspace/organizationalAccessPolicy';
import { getClientSafeWorkSummary } from '../modules/client-workspace/workSummaryService';
import {
  createIntakeDraft,
  getOwnIntake,
  listOwnIntakes,
  respondToMoreInformation,
  submitIntake,
  updateIntakeDraft,
  withdrawIntake,
} from '../modules/client-workspace/intakeService';
import { addIntakeAttachment } from '../modules/client-workspace/intakeAttachmentService';

const router = Router();

/** Identity + selected workspace id after portalRead has resolved the workspace. */
function orgContext(req: Request): { identityId: string; workspaceId: string } {
  const base = actor(req);
  if (!base.workspaceId) throw Object.assign(new Error('Select an authorized workspace.'), { status: 409, code: 'CLIENT_WORKSPACE_SELECTION_REQUIRED' });
  return { identityId: base.clientPortalIdentityId, workspaceId: base.workspaceId };
}

function actor(req: Request) {
  const session = requireActiveClientPortalSession(req);
  const workspace = (req as Request & { clientPortalWorkspace?: ResolvedPortalWorkspace }).clientPortalWorkspace;
  return { userId: session.clientPortalIdentityId, role: 'CLIENT_PORTAL', clientPortalIdentityId: session.clientPortalIdentityId, workspaceId: workspace?.id };
}

function fail(res: Response, error: unknown): void {
  if (error instanceof ClientPublicationError) {
    res.status(error.status).json({ status: error.status, code: error.code, message: error.message });
    return;
  }
  const shaped = error as { status?: number; code?: string; message?: string };
  if (shaped?.status && shaped?.code) {
    res.status(shaped.status).json({ status: shaped.status, code: shaped.code, message: shaped.message || 'Client portal request failed.' });
    return;
  }
  res.status(500).json({ status: 500, code: 'CLIENT_PORTAL_INTERNAL_ERROR', message: 'Client portal request failed.' });
}

async function portalRead(req: Request, res: Response): Promise<boolean> {
  if (!CLIENT_PUBLICATION_GATES.portalRead()) {
    res.status(503).json({ status: 503, code: 'CLIENT_PORTAL_READ_DISABLED', message: 'Client portal reads are disabled.' });
    return false;
  }
  await new Promise<void>((resolve, reject) => authenticateClientPortal(req, res, (error?: unknown) => error ? reject(error) : resolve()));
  if (res.headersSent) return false;
  const session = requireActiveClientPortalSession(req);
  (req as Request & { clientPortalWorkspace?: ResolvedPortalWorkspace }).clientPortalWorkspace = await resolvePortalWorkspace(session, req.header('x-client-portal-workspace'));
  return !res.headersSent;
}

async function portalIntake(req: Request, res: Response): Promise<boolean> {
  await new Promise<void>((resolve, reject) => authenticateClientPortal(req, res, (error?: unknown) => error ? reject(error) : resolve()));
  if (res.headersSent) return false;
  const session = requireActiveClientPortalSession(req);
  (req as Request & { clientPortalWorkspace?: ResolvedPortalWorkspace }).clientPortalWorkspace = await resolvePortalWorkspace(session, req.header('x-client-portal-workspace'));
  return true;
}

const COMPLETED_REQUEST_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'EXPIRED']);
const DOCUMENT_REQUEST_TYPES = new Set(['DOCUMENT_UPLOAD', 'MISSING_DOCUMENT_REQUEST', 'CORRECTION_REQUEST']);

function customerRequestStatus(status: string): string {
  const labels: Record<string, string> = {
    PUBLISHED: 'Teendő',
    PARTIALLY_SUBMITTED: 'Folyamatban',
    SUBMITTED: 'Beküldve',
    UNDER_INTERNAL_REVIEW: 'Feldolgozás alatt',
    CORRECTION_REQUESTED: 'Javítás szükséges',
    COMPLETED: 'Lezárva',
  };
  return labels[status] || 'Folyamatban';
}

function actionBucket(status: string, dueAt: string | null): 'now' | 'upcoming' | 'completed' {
  if (COMPLETED_REQUEST_STATUSES.has(status)) return 'completed';
  if (dueAt && new Date(dueAt).getTime() > Date.now() + 7 * 24 * 60 * 60 * 1000) return 'upcoming';
  return 'now';
}

/**
 * A customer-safe cross-matter projection. It reuses the canonical
 * publication and interaction services; no client, case or grant id is ever
 * accepted from the browser.
 */
async function portalWorkspace(req: Request) {
  const portalActor = actor(req);
  const [home, documents] = await Promise.all([
    portalHomeSnapshot(portalActor),
    listPortalDocuments(portalActor),
  ]);
  const matters = home.matters as Array<{ id: string; caseId: string; title: string }>;
  const byCase = new Map(matters.map((matter) => [matter.caseId, matter]));
  const identityId = portalActor.clientPortalIdentityId;
  // A customer-safe matter-read grant need not include message / document /
  // request permissions, and the corresponding capability gates may be off.
  // When a per-matter interaction lookup is denied (403 — permission missing or
  // capability disabled), that section must simply be empty for the matter
  // instead of failing the whole workspace response. Any non-403 error still
  // propagates so genuine faults are not masked.
  const emptyOnDenied = async <T>(load: () => Promise<{ items: T[] }>): Promise<T[]> => {
    try {
      return (await load()).items;
    } catch (error) {
      if ((error as { status?: number } | null)?.status === 403) return [];
      throw error;
    }
  };
  const interactionRows = await Promise.all(matters.map(async (matter) => {
    const context = await resolveActiveCustomerGrant(identityId, matter.caseId, portalActor.workspaceId || '');
    const [requests, submissions, questions] = await Promise.all([
      emptyOnDenied(() => listCustomerRequests(context)),
      emptyOnDenied(() => listCustomerSubmissions(context, undefined)),
      emptyOnDenied(() => listCustomerThreads(context)),
    ]);
    return { matter, requests, submissions, questions };
  }));

  const requests = interactionRows.flatMap(({ matter, requests: items }) => items.map((item: any) => ({
    id: item.id,
    matterId: matter.id,
    matterTitle: matter.title,
    type: item.type,
    title: item.title,
    description: item.instructions || null,
    dueAt: item.dueAt,
    status: customerRequestStatus(item.status),
    rawStatus: item.status,
    publishedAt: item.publishedAt,
    actionUrl: `/portal/matters/${encodeURIComponent(matter.id)}`,
  })));
  const submissions = interactionRows.flatMap(({ matter, submissions: items }) => items.map((item: any) => ({
    id: item.id,
    requestId: item.requestId,
    matterId: matter.id,
    matterTitle: matter.title,
    status: customerRequestStatus(item.status),
    submittedAt: item.submittedAt,
    correctionNeeded: item.status === 'CORRECTION_REQUESTED',
    actionUrl: `/portal/matters/${encodeURIComponent(matter.id)}`,
  })));
  const messages = interactionRows.flatMap(({ matter, questions }) => questions.map((item: any) => ({
    id: item.id,
    matterId: matter.id,
    matterTitle: matter.title,
    subject: item.subject,
    status: item.status === 'ANSWERED' ? 'Megválaszolva' : item.status === 'CLOSED' ? 'Lezárva' : 'Válaszra vár',
    updatedAt: item.updatedAt || null,
    actionUrl: `/portal/matters/${encodeURIComponent(matter.id)}`,
  })));
  // HOME and Teendőim intentionally share the published ClientActionRequest
  // projection. Interaction requests remain available as document/data
  // requests, but are not a second customer task list.
  const actions = (home.attention as Array<Record<string, any>>).map((action) => ({
    id: action.id,
    matterId: action.matterId,
    matterTitle: action.matterTitle,
    type: action.type || 'ACTION_REQUEST',
    title: action.title,
    description: action.instructions || null,
    dueAt: action.dueAt || null,
    status: 'PUBLISHED',
    bucket: actionBucket('PUBLISHED', action.dueAt),
    actionUrl: `/portal/matters/${encodeURIComponent(String(action.matterId || ''))}`,
  }));
  const documentItems = [
    ...(documents.items as Array<Record<string, unknown>>).map((item) => ({ ...item, kind: 'SHARED_DOCUMENT', actionUrl: `/portal/documents/${encodeURIComponent(String(item.id))}` })),
    ...requests.filter((request) => DOCUMENT_REQUEST_TYPES.has(request.type)).map(({ rawStatus, ...request }) => ({
      id: request.id,
      matterId: request.matterId,
      matterTitle: request.matterTitle,
      title: request.title,
      description: request.description,
      status: request.status,
      publishedAt: request.publishedAt,
      kind: request.type === 'CORRECTION_REQUEST' ? 'CORRECTION_REQUEST' : 'DOCUMENT_REQUEST',
      actionUrl: request.actionUrl,
    })),
    ...submissions.map((submission) => ({
      id: submission.id,
      matterId: submission.matterId,
      matterTitle: submission.matterTitle,
      title: submission.correctionNeeded ? 'Javítandó beküldés' : 'Beküldött dokumentum vagy adat',
      description: null,
      status: submission.status,
      publishedAt: submission.submittedAt,
      kind: submission.correctionNeeded ? 'CORRECTION_SUBMISSION' : 'SUBMISSION',
      actionUrl: submission.actionUrl,
    })),
  ];

  return {
    actions,
    documents: documentItems,
    messages,
    upcomingDeadlines: actions.filter((item) => item.bucket !== 'completed' && item.dueAt).sort((left, right) => String(left.dueAt).localeCompare(String(right.dueAt))).slice(0, 6),
    matterCount: byCase.size,
  };
}

// Post-login resolver. Guarded by the *registered* session (verified e-mail,
// not suspended/revoked) rather than the *active* session, because a user who
// still needs onboarding is REGISTERED, not ACTIVE — gating this on ACTIVE is
// what produced the "Nincs aktív ügyfélfelülete" dead-end. getOnboardingContext
// returns active-workspace routing when applicable, otherwise the onboarding
// state + a customer-safe onboarding payload.
router.get('/me', async (req, res) => {
  try {
    await new Promise<void>((resolve, reject) => authenticateClientPortal(req, res, (error?: unknown) => error ? reject(error) : resolve()));
    if (res.headersSent) return;
    const session = requireRegisteredClientPortalSession(req);
    res.json(await getOnboardingContext(session, req.header('x-client-portal-workspace')));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/workspaces', async (req, res) => {
  try {
    await new Promise<void>((resolve, reject) => authenticateClientPortal(req, res, (error?: unknown) => error ? reject(error) : resolve()));
    if (res.headersSent) return;
    const session = requireActiveClientPortalSession(req);
    const context = await getPortalIdentityContext(session, req.header('x-client-portal-workspace'));
    res.json({ state: context.state, items: context.workspaces, selectedWorkspace: context.selectedWorkspace });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/home', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    res.json(await portalHomeSnapshot(actor(req)));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/workspace', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    res.json(await portalWorkspace(req));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/matters', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    res.json(await listPortalMatters(actor(req)));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/matters/:publicationId', async (req: Request, res: Response) => {
  const identifier = String(req.params.publicationId);

  // 1. Direct matter lookup if client portal feature is enabled
  if (isClientPortalEnabled()) {
    try {
      if (!(await requireAuthenticatedPortalUser(req, res))) return;

      const matter = await prisma.matter.findUnique({
        where: { id: identifier },
        include: {
          client: {
            select: { id: true, name: true },
          },
          department: {
            select: { id: true, name: true },
          },
          timeEntries: {
            include: {
              user: {
                select: { name: true },
              },
              department: {
                select: { name: true },
              },
            },
            orderBy: { workDate: 'desc' },
          },
        },
      });

      if (matter) {
        const access = await authenticateAndAuthorizeClient(req, res, matter.clientId);
        if (!access) return;

        const byType: Record<string, { type: string; minutes: number; count: number }> = {};
        matter.timeEntries.forEach((entry) => {
          if (!byType[entry.workType]) {
            byType[entry.workType] = { type: entry.workType, minutes: 0, count: 0 };
          }
          byType[entry.workType].minutes += entry.minutes;
          byType[entry.workType].count++;
        });

        const recentEntries = matter.timeEntries.slice(0, 10).map((e) => ({
          workType: e.workType,
          description: e.description,
          minutes: e.minutes,
          hours: (e.minutes / 60).toFixed(2),
          workDate: e.workDate,
          userName: e.user?.name,
          departmentName: e.department?.name,
        }));

        const totalMinutes =
          matter.timeEntries.reduce((sum, e) => sum + e.minutes, 0) || matter.totalMinutes;

        res.json({
          id: matter.id,
          title: matter.title,
          description: matter.description,
          type: matter.matterType,
          status: matter.status,
          openedAt: matter.openedAt,
          closedAt: matter.closedAt,
          department: matter.department,
          client: matter.client,
          totalHours: (totalMinutes / 60).toFixed(2),
          totalMinutes,
          timeByType: Object.values(byType).map((t) => ({
            workType: t.type,
            hours: (t.minutes / 60).toFixed(2),
            entries: t.count,
          })),
          recentEntries,
        });
        return;
      }

      // If no direct matter, try publication snapshot if publication reads are enabled
      if (CLIENT_PUBLICATION_GATES.portalRead()) {
        res.json(await getPortalMatter(actor(req), identifier));
        return;
      }

      res.status(404).json({ error: 'Matter not found' });
      return;
    } catch (error) {
      fail(res, error);
      return;
    }
  }

  // 2. Publication snapshot lookup via portalRead
  try {
    if (!(await portalRead(req, res))) return;
    res.json(await getPortalMatter(actor(req), identifier));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/matters/:publicationId/documents', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    res.json(await listPortalDocuments(actor(req), String(req.params.publicationId)));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/documents/:publicationId', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    res.json(await getPortalDocument(actor(req), String(req.params.publicationId)));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/documents/:publicationId/download', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    const authorized = await authorizePortalDocumentDownload(actor(req), String(req.params.publicationId));
    const result = await documentsService.downloadDocumentVersion(authorized.documentId, authorized.documentVersionId);
    if (!result) {
      res.status(404).json({ status: 404, code: 'PORTAL_RESOURCE_NOT_FOUND', message: 'Portal content is not available.' });
      return;
    }
    if ('error' in result) {
      res.status(result.status).json({ status: result.status, code: result.code, message: 'The published file is not available.' });
      return;
    }
    const fileName = String(authorized.fileName || result.version.originalFileName || 'document').replace(/"/g, "'");
    const encodedFileName = encodeURIComponent(fileName);
    res.setHeader('Content-Type', result.version.mimeType || authorized.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodedFileName}`);
    res.setHeader('Content-Length', result.content.length);
    res.send(result.content);
  } catch (error) {
    fail(res, error);
  }
});

router.get('/action-requests', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    res.json(await listPortalActionRequests(actor(req)));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/action-requests/:requestId', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    res.json(await getPortalActionRequest(actor(req), String(req.params.requestId)));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/updates', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    res.json(await listPortalSafeUpdates(actor(req)));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/updates/:updateId', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    res.json(await getPortalSafeUpdate(actor(req), String(req.params.updateId)));
  } catch (error) {
    fail(res, error);
  }
});

// --- CP1 organizational customer surfaces (workspace + participant scoped) ---

router.post('/org/intakes', async (req, res) => {
  try { if (!(await portalIntake(req, res))) return; const context = orgContext(req); res.status(201).json(await createIntakeDraft(context.identityId, context.workspaceId, req.body || {})); }
  catch (error) { fail(res, error); }
});

router.get('/org/intakes', async (req, res) => {
  try { if (!(await portalIntake(req, res))) return; const context = orgContext(req); res.json(await listOwnIntakes(context.identityId, context.workspaceId, { limit: Number(req.query.limit) || undefined, offset: Number(req.query.offset) || undefined })); }
  catch (error) { fail(res, error); }
});

router.get('/org/intakes/:intakeId', async (req, res) => {
  try { if (!(await portalIntake(req, res))) return; const context = orgContext(req); res.json(await getOwnIntake(context.identityId, context.workspaceId, String(req.params.intakeId))); }
  catch (error) { fail(res, error); }
});

router.patch('/org/intakes/:intakeId', async (req, res) => {
  try { if (!(await portalIntake(req, res))) return; const context = orgContext(req); res.json(await updateIntakeDraft(context.identityId, context.workspaceId, String(req.params.intakeId), req.body || {})); }
  catch (error) { fail(res, error); }
});

router.post('/org/intakes/:intakeId/submit', async (req, res) => {
  try { if (!(await portalIntake(req, res))) return; const context = orgContext(req); res.json(await submitIntake(context.identityId, context.workspaceId, String(req.params.intakeId), req.body?.expectedRevision)); }
  catch (error) { fail(res, error); }
});

router.post('/org/intakes/:intakeId/withdraw', async (req, res) => {
  try { if (!(await portalIntake(req, res))) return; const context = orgContext(req); res.json(await withdrawIntake(context.identityId, context.workspaceId, String(req.params.intakeId), req.body?.expectedRevision)); }
  catch (error) { fail(res, error); }
});

router.post('/org/intakes/:intakeId/responses', async (req, res) => {
  try { if (!(await portalIntake(req, res))) return; const context = orgContext(req); res.status(201).json(await respondToMoreInformation(context.identityId, context.workspaceId, String(req.params.intakeId), req.body || {})); }
  catch (error) { fail(res, error); }
});

router.post('/org/intakes/:intakeId/attachments', async (req, res) => {
  try { if (!(await portalIntake(req, res))) return; const context = orgContext(req); res.status(201).json(await addIntakeAttachment(context.identityId, context.workspaceId, String(req.params.intakeId), req.body || {})); }
  catch (error) { fail(res, error); }
});

router.get('/org/home', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    const { identityId, workspaceId } = orgContext(req);
    res.json(await getOrganizationalHome(identityId, workspaceId));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/org/units', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    const { identityId, workspaceId } = orgContext(req);
    res.json({ items: await resolveMemberUnits(identityId, workspaceId) });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/org/cases', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    const { identityId, workspaceId } = orgContext(req);
    const relationshipRaw = String(req.query.relationship || '').toUpperCase();
    const params: OrganizationalCaseListParams = {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      relationship: relationshipRaw === 'OWN' || relationshipRaw === 'SHARED' ? relationshipRaw as RelationshipToCase : null,
      unitId: req.query.unitId ? String(req.query.unitId) : null,
    };
    res.json(await listOrganizationalCases(identityId, workspaceId, params));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/org/cases/:caseReference', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    const { identityId, workspaceId } = orgContext(req);
    res.json(await getOrganizationalCaseDetail(identityId, workspaceId, String(req.params.caseReference)));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/org/summary/unit/:groupId', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    const { identityId, workspaceId } = orgContext(req);
    res.json(await unitSummary(identityId, workspaceId, String(req.params.groupId)));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/org/summary/organization', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    const { identityId, workspaceId } = orgContext(req);
    res.json(await organizationSummary(identityId, workspaceId));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/org/contracts', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    const { identityId, workspaceId } = orgContext(req);
    res.json(await getOrganizationalContracts(identityId, workspaceId));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/org/company', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    const { identityId, workspaceId } = orgContext(req);
    res.json(await getOrganizationalCompany(identityId, workspaceId));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/org/work-summary', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    const { identityId, workspaceId } = orgContext(req);
    const workspace = (req as Request & { clientPortalWorkspace?: ResolvedPortalWorkspace }).clientPortalWorkspace;
    if (!workspace || workspace.id !== workspaceId) throw new Error('Resolved client workspace is missing.');
    const parseBoundary = (value: unknown): Date | undefined => {
      if (value == null || value === '') return undefined;
      const parsed = new Date(String(value));
      if (Number.isNaN(parsed.getTime())) throw Object.assign(new Error('Invalid UTC period boundary.'), { status: 400, code: 'WORK_SUMMARY_PERIOD_INVALID' });
      return parsed;
    };
    res.json(await getClientSafeWorkSummary(identityId, workspace, { from: parseBoundary(req.query.from), to: parseBoundary(req.query.to) }));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/org/company-profile', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    const { identityId, workspaceId } = orgContext(req);
    res.json(await getCompanyProfileDiscovery(identityId, workspaceId));
  } catch (error) {
    fail(res, error);
  }
});

router.put('/org/company-profile/questions/:questionKey', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    const { identityId, workspaceId } = orgContext(req);
    res.json(await answerCompanyProfileQuestion(identityId, workspaceId, String(req.params.questionKey), req.body || {}));
  } catch (error) {
    fail(res, error);
  }
});

router.put('/org/company-profile/responsibilities', async (req, res) => {
  try {
    if (!(await portalRead(req, res))) return;
    const { identityId, workspaceId } = orgContext(req);
    res.json(await assignCompanyProfileResponsibility(identityId, workspaceId, req.body || {}));
  } catch (error) {
    fail(res, error);
  }
});

router.all('/action-requests/:requestId/complete', async (req, res) => {
  try {
    if (!CLIENT_PUBLICATION_GATES.portalActions()) {
      res.status(503).json({
        status: 503,
        code: 'CLIENT_PORTAL_ACTIONS_DISABLED',
        message: 'Client portal actions are disabled.',
      });
      return;
    }
    res.status(501).json({
      status: 501,
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'CLIENT_PORTAL_ACTIONS',
      reason: 'CLIENT_PORTAL_ACTION_UI_NOT_IMPLEMENTED',
      message: 'Client portal action completion is not implemented.',
    });
  } catch (error) {
    fail(res, error);
  }
});

function isClientPortalEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.ENABLE_CLIENT_PORTAL || '').toLowerCase());
}

// ============================================================================
// GET /api/v1/client-portal/summary/:clientId
// ============================================================================
router.get('/summary/:clientId', async (req: Request, res: Response) => {
  if (!isClientPortalEnabled()) {
    res.status(501).json({
      status: 501,
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'CLIENT_PORTAL',
      reason: 'CLIENT_PORTAL_NOT_ENABLED',
      message: 'The client portal is not available in this environment.',
    });
    return;
  }

  try {
    const clientId = String(req.params.clientId);
    const access = await authenticateAndAuthorizeClient(req, res, clientId);
    if (!access) return;

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        departments: {
          include: {
            matters: {
              include: { timeEntries: true },
            },
          },
        },
        matters: {
          include: { timeEntries: true },
        },
        cases: true,
      },
    });

    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const totalMinutes = client.matters.reduce(
      (sum, m) => sum + m.timeEntries.reduce((s, e) => s + e.minutes, 0),
      0
    );

    res.json({
      client: {
        id: client.id,
        name: client.name,
      },
      totalMinutes,
      totalHours: (totalMinutes / 60).toFixed(2),
      activeMatters: client.matters.filter((m) => m.status === 'OPEN').length,
      totalMatters: client.matters.length,
      casesCount: client.cases.length,
      departmentsCount: client.departments.length,
    });
  } catch (error) {
    fail(res, error);
  }
});

// ============================================================================
// GET /api/v1/client-portal/departments/:clientId
// ============================================================================
router.get('/departments/:clientId', async (req: Request, res: Response) => {
  if (!isClientPortalEnabled()) {
    res.status(501).json({
      status: 501,
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'CLIENT_PORTAL',
      reason: 'CLIENT_PORTAL_NOT_ENABLED',
      message: 'The client portal is not available in this environment.',
    });
    return;
  }

  try {
    const clientId = String(req.params.clientId);
    const access = await authenticateAndAuthorizeClient(req, res, clientId);
    if (!access) return;

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const departments = await prisma.department.findMany({
      where: { clientId },
      include: {
        matters: {
          include: { timeEntries: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const result = departments.map((dept) => {
      const deptMinutes = dept.matters.reduce(
        (sum, m) => sum + m.timeEntries.reduce((s, e) => s + e.minutes, 0),
        0
      );
      return {
        id: dept.id,
        name: dept.name,
        description: dept.description,
        totalMatters: dept.matters.length,
        activeMatters: dept.matters.filter((m) => m.status === 'OPEN').length,
        totalMinutes: deptMinutes,
        totalHours: (deptMinutes / 60).toFixed(2),
      };
    });

    res.json(result);
  } catch (error) {
    fail(res, error);
  }
});

// ============================================================================
// GET /api/v1/client-portal/departments/:departmentId/matters
// ============================================================================
router.get('/departments/:departmentId/matters', async (req: Request, res: Response) => {
  if (!isClientPortalEnabled()) {
    res.status(501).json({
      status: 501,
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'CLIENT_PORTAL',
      reason: 'CLIENT_PORTAL_NOT_ENABLED',
      message: 'The client portal is not available in this environment.',
    });
    return;
  }

  try {
    if (!(await requireAuthenticatedPortalUser(req, res))) return;

    const departmentId = String(req.params.departmentId);
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        matters: {
          include: {
            _count: { select: { cases: true } },
            timeEntries: true,
          },
        },
      },
    });

    if (!department) {
      res.status(404).json({ error: 'Department not found' });
      return;
    }

    const access = await authenticateAndAuthorizeClient(req, res, department.clientId);
    if (!access) return;

    const result = department.matters.map((matter) => {
      const matterMinutes =
        matter.timeEntries.reduce((sum, e) => sum + e.minutes, 0) || matter.totalMinutes;
      return {
        id: matter.id,
        title: matter.title,
        description: matter.description,
        type: matter.matterType,
        status: matter.status,
        openedAt: matter.openedAt,
        closedAt: matter.closedAt,
        totalMinutes: matterMinutes,
        totalHours: (matterMinutes / 60).toFixed(2),
        casesCount: matter._count.cases,
      };
    });

    res.json(result);
  } catch (error) {
    fail(res, error);
  }
});

// ============================================================================
// GET /api/v1/client-portal/matters/:matterId/time-log
// ============================================================================
router.get('/matters/:matterId/time-log', async (req: Request, res: Response) => {
  if (!isClientPortalEnabled()) {
    res.status(501).json({
      status: 501,
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'CLIENT_PORTAL',
      reason: 'CLIENT_PORTAL_NOT_ENABLED',
      message: 'The client portal is not available in this environment.',
    });
    return;
  }

  try {
    if (!(await requireAuthenticatedPortalUser(req, res))) return;

    const matterId = String(req.params.matterId);
    const matter = await prisma.matter.findUnique({
      where: { id: matterId },
      select: { id: true, clientId: true },
    });

    if (!matter) {
      res.status(404).json({ error: 'Matter not found' });
      return;
    }

    const access = await authenticateAndAuthorizeClient(req, res, matter.clientId);
    if (!access) return;

    const limit = parseInt(String(req.query.limit || '50'), 10) || 50;
    const offset = parseInt(String(req.query.offset || '0'), 10) || 0;

    const [entries, total] = await Promise.all([
      prisma.timeEntry.findMany({
        where: { matterId },
        include: {
          user: {
            select: { name: true },
          },
          department: {
            select: { name: true },
          },
        },
        orderBy: { workDate: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.timeEntry.count({ where: { matterId } }),
    ]);

    const result = entries.map((e) => ({
      id: e.id,
      workType: e.workType,
      description: e.description,
      minutes: e.minutes,
      hours: (e.minutes / 60).toFixed(2),
      workDate: e.workDate,
      userName: e.user?.name,
      departmentName: e.department?.name,
    }));

    res.json({
      entries: result,
      total,
      hasMore: offset + entries.length < total,
    });
  } catch (error) {
    fail(res, error);
  }
});

// ============================================================================
// GET /api/v1/client-portal/export/:clientId
// ============================================================================
router.get('/export/:clientId', async (req: Request, res: Response) => {
  if (!isClientPortalEnabled()) {
    res.status(501).json({
      status: 501,
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'CLIENT_PORTAL',
      reason: 'CLIENT_PORTAL_NOT_ENABLED',
      message: 'The client portal is not available in this environment.',
    });
    return;
  }

  try {
    const clientId = String(req.params.clientId);
    const access = await authenticateAndAuthorizeClient(req, res, clientId);
    if (!access) return;

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const format = String(req.query.format || 'json').toLowerCase();

    const departments = await prisma.department.findMany({
      where: { clientId },
      include: {
        matters: {
          include: {
            timeEntries: {
              include: {
                user: { select: { name: true } },
                department: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    const exportData = {
      client: {
        name: client.name,
        exportedAt: new Date().toISOString(),
      },
      summary: {
        totalHours: '0',
        totalMinutes: 0,
        activeMatters: 0,
      },
      departments: departments.map((dept) => {
        const deptMinutes = dept.matters.reduce(
          (sum, m) => sum + m.timeEntries.reduce((s, e) => s + e.minutes, 0),
          0
        );
        const activeMatters = dept.matters.filter((m) => m.status === 'OPEN').length;

        return {
          name: dept.name,
          matters: dept.matters.map((m) => ({
            title: m.title,
            type: m.matterType,
            status: m.status,
            openedAt: m.openedAt,
            closedAt: m.closedAt,
            totalMinutes: m.totalMinutes,
            timeEntries: m.timeEntries.map((e) => ({
              workType: e.workType,
              description: e.description,
              minutes: e.minutes,
              workDate: e.workDate,
              userName: e.user?.name,
              departmentName: e.department?.name,
            })),
          })),
          totalMinutes: deptMinutes,
          activeMatters,
        };
      }),
    };

    exportData.summary.totalMinutes = exportData.departments.reduce(
      (sum, d) => sum + d.totalMinutes,
      0
    );
    exportData.summary.totalHours = (exportData.summary.totalMinutes / 60).toFixed(2);
    exportData.summary.activeMatters = exportData.departments.reduce(
      (sum, d) => sum + d.activeMatters,
      0
    );

    if (format === 'csv') {
      let csv = 'Department,Matter,Work Type,Description,Minutes,Date,User\n';
      exportData.departments.forEach((dept) => {
        dept.matters.forEach((matter) => {
          matter.timeEntries.forEach((entry) => {
            csv += `"${dept.name}","${matter.title}","${entry.workType}","${entry.description}",${entry.minutes},${entry.workDate},"${entry.userName}"\n`;
          });
        });
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=export-${clientId}.csv`);
      return res.send(csv);
    }

    res.json(exportData);
  } catch (error) {
    fail(res, error);
  }
});

router.all('*', async (_req, res) => {
  res.status(501).json({
    status: 501,
    code: 'FEATURE_NOT_AVAILABLE',
    feature: 'CLIENT_PORTAL',
    reason: 'CLIENT_PORTAL_NOT_ENABLED',
    message: 'The client portal is not available in this environment.',
    nextStep: 'Client portal reads and actions remain disabled until a separate portal authentication boundary is enabled.',
  });
});

export default router;
