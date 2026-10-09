// WF01 real-route QA. Baseline synthetic API fixtures reused from caseWorkspaceAiResultsQA.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.CASE_AI_BASE || "http://127.0.0.1:3099";
const CASE_ID = "44444444-4444-4444-8444-444444444444";
const AUTH_ME = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "QA Ügyvéd",
  email: "qa@example.test",
  role: "ADMIN",
  organizationId: "55555555-5555-4555-8555-555555555555",
};

const DRAFT_RESULT = {
  id: "draft-1",
  caseId: CASE_ID,
  promptTemplateId: "tpl-1",
  promptTemplateStableKey: "contract-review",
  promptTemplateVersion: 3,
  promptTemplateSnapshot: { title: "Szerződés átvilágítás", legalWorkCategory: "CONTRACT_REVIEW" },
  sourceDocumentIds: ["qa-doc-1"],
  sourceDocumentVersionIds: [],
  sourceTaskId: null,
  sourceWorkPackageItemId: null,
  selectedContext: {},
  anonymizedPreview: "ANONIMIZÁLT TITKOS SZÖVEG",
  externalPromptText: "Prompt: Szerződés átvilágítás\n\nAnonimizált kontextus előkészítve.",
  importedResponse: "AZ AI NYERS VÁLASZA TITKOS",
  rehydratedResponse: "Ez a rehidratált jogi eredmény szövege.",
  rehydrationWarnings: [],
  status: "AI_DRAFT",
  reviewerNotes: null,
  preparedById: "u-1",
  importedById: "u-1",
  verifiedById: null,
  approvedById: null,
  createdAt: "2026-09-26T09:15:00.000Z",
  updatedAt: "2026-09-26T10:00:00.000Z",
};

const DRAFT_PREPARED = {
  ...DRAFT_RESULT,
  id: "draft-2",
  status: "PREPARED",
  importedResponse: null,
  rehydratedResponse: null,
  createdAt: "2026-09-27T08:00:00.000Z",
};

const TEMPLATE = {
  id: "tpl-1",
  stableKey: "contract-review",
  version: 3,
  title: "Szerződés átvilágítás",
  description: "QA template",
  legalWorkCategory: "CONTRACT_REVIEW",
  caseTypeKeys: [],
  workPackageModuleKeys: [],
  taskTypes: [],
  isActive: true,
  createdAt: "2026-09-01T00:00:00.000Z",
};

function baseWorkspace() {
  return {
    case: {
      id: CASE_ID, caseNumber: "QA-1", title: "QA ügy", status: "ACTIVE", priority: "MEDIUM",
      matterType: null, clientRole: null, matterId: null, deadline: null,
      client: null, assignedLawyer: null, description: null, nextStep: null,
      startingContext: { originReason: null, currentSituation: null, clientExpectation: null, urgentAction: null, nextStep: null, legacyOnly: false, empty: true },
      createdAt: null, updatedAt: null,
    },
    metrics: { openTaskCount: 0, documentCount: 1, openDeadlineCount: 0, communicationCount: 0, reviewCount: null, loggedMinutes: null },
    tasks: [],
    documents: [
      { id: "qa-doc-1", fileName: "bérleti_szerzodes.docx", mimeType: null, type: null, category: null, version: null, uploadedAt: null, uploadedBy: null, summary: null, commentCount: null, reviewSummary: null },
    ],
    deadlines: [],
    time: { available: true, loggedMinutes: 0, billableMinutes: null },
    communications: [],
    activity: [],
    comments: [],
    cockpit: {
      urgency: "STEADY",
      nextStep: null,
      responsible: null,
      kpi: {
        openTasks: { count: 0, urgentCount: 0, secondary: "Nincs nyitott feladat" },
        deadlines: { count: 0, nextDueAt: null, secondary: "Nincs határidő" },
        communication: { count: 0, replyNeededCount: 0, secondary: "Nincs kommunikáció" },
        review: { count: 0, secondary: "Nincs review" },
        activeDocuments: { count: 0, secondary: "Nincs aktív dokumentum" },
      },
      taskGroups: { immediate: [], today: [], later: [] },
      deadlineGroups: { today: [], tomorrow: [], thisWeek: [], later: [] },
      replyNeeded: [],
      activeDocuments: [],
    },
    warnings: [],
  };
}

function responsibility() {
  return {
    case: { id: CASE_ID, caseNumber: "QA-1", title: "QA ügy", status: "ACTIVE", deadline: null, matterId: null },
    responsibleLawyer: null,
    createdBy: null,
    collaborators: [],
    work: { openTaskCount: 0, overdueTaskCount: 0, dueSoonTaskCount: 0, reviewTaskCount: 0, blockedTaskCount: 0, assignedPeople: [] },
    time: { supported: true, matterId: null, totalMinutes: null, currentUserMinutes: 0, activeTimerSupported: false },
    capabilities: {
      canChangeResponsibleLawyer: false, canAddCollaborator: false, canRemoveCollaborator: false,
      canChangeCollaboratorRole: false, canAssignWork: false, canRecordTime: false,
      canViewCaseTime: false, canViewTeamWorkload: false,
    },
    availability: { tasks: true, deadlines: true, communications: true, reviews: true, collaborators: true, handoff: true },
  };
}

let draftsState = [DRAFT_RESULT, DRAFT_PREPARED];

function baseMock(url) {
  if (url.includes("/auth/me")) return { status: 200, body: AUTH_ME };
  if (url.endsWith(`/api/v1/cases/${CASE_ID}`)) {
    return {
      status: 200,
      body: {
        id: CASE_ID, caseNumber: "QA-1", title: "QA ügy", clientName: "", matterType: "", status: "ACTIVE",
        priority: "MEDIUM", deadline: null, clientRole: null, clientColorKey: null,
        createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", clientId: null, assignedLawyer: null,
      },
    };
  }
  if (url.includes(`/cases/${CASE_ID}/workspace`)) return { status: 200, body: workspace() };
  if (url.includes(`/cases/${CASE_ID}/responsibility`)) return { status: 200, body: responsibility() };
  if (url.includes(`/cases/${CASE_ID}/responsible-candidates`)) return { status: 200, body: { items: [] } };
  if (url.includes("/documents/qa-doc-1/work-context")) {
    return {
      status: 200,
      body: {
        id: "qa-doc-1", title: "Bérleti szerződés", fileName: "bérleti_szerzodes.docx", documentRole: null,
        workStatus: "TODO", workInstruction: null, workInstructionUpdatedAt: null, workInstructionUpdatedBy: null,
        responsible: null, reviewer: null, dueDate: null, workPriority: null, nextStep: null,
        category: null, documentType: null, currentVersion: null, updatedAt: null,
        linkedTasks: [], source: null,
      },
    };
  }
  if (url.includes("/legal-analyses")) return { status: 200, body: [] };
  if (url.includes(`/cases/${CASE_ID}/comments`)) return { status: 200, body: { comments: [
    { id: 'note-1', caseId: CASE_ID, parentId: null, author: { id: 'worker', displayName: 'Teszt Munkatárs' }, content: 'Belső ügyjegyzet', status: 'OPEN', createdAt: '2026-10-01T10:00:00Z', updatedAt: null, capabilities: { canResolve: false, canReopen: false, canDelete: false } },
    { id: 'reply-1', caseId: CASE_ID, parentId: 'note-1', author: { id: 'lawyer', displayName: 'QA Ügyvéd' }, content: 'Belső válasz', status: 'OPEN', createdAt: '2026-10-01T10:30:00Z', updatedAt: null, capabilities: { canResolve: false, canReopen: false, canDelete: false } },
  ] } };
  if (url.includes(`/cases/${CASE_ID}/work-package`)) return { status: 200, body: null };
  if (url.includes(`/cases/${CASE_ID}/documents`)) return { status: 200, body: [{ id: "qa-doc-1", fileName: "bérleti_szerzodes.docx" }] };
  if (url.includes(`/cases/${CASE_ID}/timeline`)) return { status: 200, body: [] };
  if (url.includes(`/cases/${CASE_ID}/work-items`)) {
    return {
      status: 200,
      body: {
        caseId: CASE_ID, generatedAt: "2026-09-01T00:00:00.000Z",
        summary: { open: 0, mine: 0, overdue: 0, dueSoon: 0, blocked: 0, reviewRequired: 0, handoffRequired: 0, waiting: 0 },
        items: [],
        availability: { taskTransitions: true, blockerState: true, waitingState: true, reviewWorkflow: true, handoffWorkflow: true },
      },
    };
  }
  if (url.includes(`/cases/${CASE_ID}/activity`)) {
    return {
      status: 200,
      body: {
        caseId: CASE_ID, generatedAt: "2026-09-01T00:00:00.000Z",
        pagination: { limit: 30, offset: 0, returned: 0 }, items: [],
      },
    };
  }
  if (url.includes(`/cases/${CASE_ID}/workflow-summary`)) {
    return {
      status: 200,
      body: {
        caseId: CASE_ID, generatedAt: "2026-09-01T00:00:00.000Z",
        case: { displayName: "QA ügy" },
        nextAction: null, waitingOn: null, nextDeadline: null,
        taskStats: { open: 0, overdue: 0, dueSoon: 0, blocked: 0, review: 0 },
        latestCommunication: null, activeReview: null,
        responsibility: { responsibleLawyer: null, collaborators: [] },
        handoff: null,
        availability: { tasks: true, deadlines: true, communications: true, reviews: true, collaborators: true, handoff: true },
      },
    };
  }
  if (url.includes(`/ai-prompts/cases/${CASE_ID}/drafts`)) return { status: 200, body: { items: draftsState } };
  if (url.includes("/ai-prompts/drafts/draft-1")) return { status: 200, body: DRAFT_RESULT };
  if (url.includes("/ai-prompts/templates")) return { status: 200, body: { items: [TEMPLATE] } };
  if (url.includes(`/billing-preparation/case/${CASE_ID}`)) {
    return {
      status: 200,
      body: {
        caseId: CASE_ID, billableMinutes: 0, nonBillableMinutes: 0, needsReviewMinutes: 0, attributedMinutes: 0,
        byLawyer: [], rateStatus: "RATE_NOT_CONFIGURED", feeEstimate: null, billingReadiness: "NO_BILLABLE_TIME",
      },
    };
  }
  if (url.includes("/tasks")) return { status: 200, body: [] };
  if (url.includes(`/cases/${CASE_ID}/collaborators`)) return { status: 200, body: [] };
  if (url.includes(`/cases/${CASE_ID}/workflow-graph`)) return { status: 200, body: { nodes: [], edges: [] } };
  if (url.includes(`/cases/${CASE_ID}/workflow-history`)) return { status: 200, body: [] };
  if (url.includes("/cases?page=")) {
    return {
      status: 200,
      body: {
        data: [{
          id: CASE_ID, caseNumber: "QA-1", title: "QA ügy", clientName: "", matterType: "", status: "ACTIVE",
          priority: "MEDIUM", deadline: null, clientRole: null, clientColorKey: null,
          createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", clientId: null, assignedLawyer: null,
        }],
        page: 1, limit: 200, total: 1, totalPages: 1,
      },
    };
  }
  if (url.includes(`/hourly-rates/clients/`)) return { status: 200, body: { asOf: null, canManage: false, effective: null, next: null, history: [] } };
  if (url.includes("/agenda")) {
    return {
      status: 200,
      body: {
        generatedAt: "2026-09-01T00:00:00.000Z", timezone: "Europe/Budapest",
        range: { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" }, scope: "CASE",
        summary: { overdue: 0, today: 0, tomorrow: 0, thisWeek: 0, later: 0, completedRecently: 0 },
        days: [],
        pagination: { limit: 20, offset: 0, hasMore: false },
        availability: { taskDueDates: true, caseDeadlines: true, hearings: true, reminders: true, teamScope: true, externalCalendar: false },
      },
    };
  }
  if (url.includes("/communications")) return { status: 200, body: { communications: [] } };
  if (url.includes("/contracts/editor-template-capabilities")) {
    return {
      status: 200,
      body: {
        availability: { catalog: false, templateDetail: false, variablePreview: false, generation: false, generatedDocxDownload: false, automaticLocalImport: false, clauseCatalog: false, customClauses: false },
        featureFlags: { templateGenerationEnabled: false, documentProcessingEnabled: false },
      },
    };
  }
  if (url.includes("/contracts")) return { status: 200, body: [] };
  if (url.includes("/users")) return { status: 200, body: { data: [] } };
  if (url.includes("/notifications/unread-count")) return { status: 200, body: { unreadCount: 0 } };
  if (url.includes("/anonymous-documents")) return { status: 200, body: [] };
  return { status: 200, body: { items: [] } };
}

const SHOTS = path.resolve(process.env.WF01_OUTPUT || 'test-results/wf01/browser');
fs.mkdirSync(SHOTS, { recursive: true });
const DOC_ID = 'qa-doc-1';
const VERSION_ID = 'qa-historical-version';
const CASE_TITLE = 'Hosszú ügycím – szerződés előkészítése és felülvizsgálata '.repeat(4);
const DUE = '2026-10-02T10:30:00.000Z';
let readOnly = false, missingContext = false, failAttach = false;
let historyErrorMode = false;
const historyRequests = [];
const writes = [];
const TASK = { id: 'chosen-task', title: 'Szerződés ellenőrzése', status: 'IN_PROGRESS', priority: 'MEDIUM', case: { id: CASE_ID, caseNumber: 'QA-1', title: CASE_TITLE, clientName: 'Teszt ügyfél', matterType: 'CONTRACT' }, dueDate: DUE, nextActionCode: 'CONTINUE_SUBMISSION' };
const DOC = { id: DOC_ID, caseId: CASE_ID, fileName: 'szerzodes.docx', documentType: 'UPLOADED', version: '2', currentVersion: 2, folder: 'Feltöltve', isLatest: true, createdAt: '2026-09-01T09:00:00Z', securityScanStatus: 'CLEAN', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
const VERSION = { id: VERSION_ID, documentId: DOC_ID, versionNumber: 1, isCurrent: false, uploadedBy: AUTH_ME, uploadedAt: '2026-09-01T09:00:00Z', originalFileName: DOC.fileName, mimeType: DOC.mimeType, securityScanStatus: 'CLEAN', publicationStatus: 'DRAFT', reviewStatus: 'NONE', uploadSource: 'UPLOAD', versionType: 'IMMUTABLE' };
let attached = [];
function workflow() {
 const draft = { id: 'draft-1', taskId: TASK.id, revisionNumber: 1, status: 'DRAFT', createdBy: { id: AUTH_ME.id, displayName: AUTH_ME.name, role: 'ADMIN' }, assignedReviewer: { id: 'reviewer', displayName: 'Teszt Reviewer', role: 'LAWYER' }, workSummary: 'Ellenőrzésre előkészítve', requestedAttention: 'DETAILED_REVIEW', attentionEstimate: { minMinutes: 15, maxMinutes: 30 }, documents: attached, timeEntries: [], documentCount: attached.length, linkedTimeMinutes: 0, externalActionRequired: false, zeroTimeConfirmed: true, createdAt: DUE, updatedAt: DUE };
 return { task: { ...TASK, caseId: CASE_ID, case: { ...TASK.case, client: { id: 'test-client', name: 'Teszt ügyfél' } } }, activeDraft: draft, submissions: [draft], latestSubmittedRevision: null, latestDecision: null, currentReviewer: draft.assignedReviewer, responsibleLawyerFlow: false, readiness: { ready: false, missingPrerequisites: ['REVIEWER_REQUIRED'], blockingErrors: [], warnings: ['VERSION_NOT_CURRENT'] }, permittedActions: { read: true, createDraft: !readOnly, editDraft: !readOnly, attachDocument: !readOnly, attachTimeEntry: !readOnly, assignReviewer: !readOnly, submit: false, reviewSubmitted: false, reviseReturned: false, recordExternalCompletion: false }, nextActionCode: 'CONTINUE_SUBMISSION' };
}
function workspace() {
 const w = baseWorkspace(); w.case.title = CASE_TITLE; w.case.deadline = DUE;
 if (!missingContext) w.case.startingContext = { ...w.case.startingContext, currentSituation: 'A szerződés ügyvédi ellenőrzése folyamatban.', originReason: 'Bérleti szerződés felülvizsgálata', clientExpectation: 'Egyértelmű és teljesíthető kötelezettségek', empty: false };
 w.tasks = [{ ...TASK, attentionCategory: 'DETAILED_REVIEW', estimatedMinutes: 30, assignee: { id: 'worker', name: 'Teszt Munkatárs' }, documentId: DOC_ID, requestedByOrganizationPerson: null, workflowStepKey: null, blockedPredecessors: null }];
 w.cockpit.taskGroups.later = [TASK.id];
 w.cockpit.kpi.openTasks = { count: 1, urgentCount: 0, secondary: '1 nyitott feladat' };
 w.cockpit.kpi.deadlines = { count: 1, nextDueAt: DUE, secondary: '1 rögzített határidő' };
 w.cockpit.kpi.communication = { count: 1, replyNeededCount: 0, secondary: '1 kapcsolt levél' };
 w.cockpit.deadlineGroups.tomorrow = [{ id: 'deadline-1', title: TASK.title, dueAt: DUE, source: 'TASK', deadlineType: 'TASK', assignee: { id: 'worker', name: 'Teszt Munkatárs' }, overdue: false }];
 w.communications = [{ id: 'mail-1', type: 'EMAIL', subject: 'Szerződéses feltételek egyeztetése', contentPreview: 'A felek a fizetési és teljesítési feltételek pontosítását kérték.', sender: 'teszt@example.test', timestamp: DUE, internal: false }];
 w.activity = [{ id: 'activity-1', actor: 'Teszt Munkatárs', actionLabel: 'feltöltötte', objectLabel: DOC.fileName, occurredAt: DUE, objectType: 'DOCUMENT', objectId: DOC_ID }];
 w.comments = [{ id: 'note-1', content: 'Belső ügyjegyzet', author: { name: 'Teszt Munkatárs' }, createdAt: '2026-10-01T10:00:00Z' }];
 return w;
}
function mock(url, method, body) {
 if (url.includes('/case-workspace/')) return { status: 503, body: { code: 'WORKSPACE_CAPABILITY_UNAVAILABLE' } };
 const ok = body => ({ status: 200, body });
 if (url.includes('/auth/me')) return ok(AUTH_ME);
 if (url.includes(`/case-history/cases/${CASE_ID}`)) {
  historyRequests.push(url);
  if (historyErrorMode) return { status: 503, body: { code: 'SYNTHETIC_HISTORY_ERROR' } };
  const cursor = new URL(url).searchParams.get('cursor');
  const item = cursor
   ? { sourceKey: 'time:entry-1', kind: 'TIME', occurredAt: '2026-10-01T11:00:00Z', title: 'Munkaidő rögzítve', detail: 'Szerződés ellenőrzése', authorName: 'Teszt Munkatárs', minutes: 45 }
   : { sourceKey: 'timeline:event-1', kind: 'AUDIT', occurredAt: '2026-10-01T10:00:00Z', title: 'Ügy létrehozva', detail: null, authorName: 'QA Ügyvéd', minutes: null };
  return ok({ items: [item], nextCursor: cursor ? null : 'timeline:event-1', totalMinutes: 45 });
 }
 if (url.includes('/client-publications/') && url.includes('/overview')) return ok({ documentPublications: [], matterPublications: [], grants: [], gates: {}, warnings: [], history: [], clientId: null });
 if (url.endsWith('/milestones/draft')) return ok({ publicationId: null, publicationStatus: null, draft: [], publishedMilestones: [], publishedProgress: null });
 if (url.endsWith('/review-projection')) return ok(null);
 if (url.endsWith(`/cases/${CASE_ID}`)) return ok({ ...baseMock(url).body, title: CASE_TITLE });
 if (url.includes(`/cases/${CASE_ID}/workspace`)) return ok(workspace());
 if (url.includes(`/cases/${CASE_ID}/documents`)) return ok([DOC]);
 if (url.includes('/submissions/draft-1/documents') && method === 'POST') {
  writes.push(body); if (failAttach) return { status: 403, body: { error: 'FORBIDDEN', message: 'A verzió csatolása nem engedélyezett.' } };
  attached = [{ id: 'link-1', ...body, document: { id: DOC_ID, name: DOC.fileName, category: 'CONTRACT', currentVersion: 2 }, linkedVersion: 1, isCurrentVersion: false, createdAt: DUE }]; return ok(workflow());
 }
 if (url.includes(`/tasks/${TASK.id}/submissions`) || url.includes(`/tasks/${TASK.id}/workflow`)) return ok(workflow());
 if (url.includes('/tasks/') && url.endsWith('/collaborators')) return ok({ items: [] });
 if (url.includes('/eligible-reviewers')) return ok([]);
 if (/\/tasks(?:\?|$)/.test(url)) return ok([TASK, { ...TASK, id: 'other-task', title: 'Másik feladat' }]);
 if (url.endsWith(`/documents/${DOC_ID}/versions`)) return ok({ documentId: DOC_ID, versions: [{ ...VERSION, id: 'qa-current-version', versionNumber: 2, isCurrent: true }, VERSION] });
 if (url.includes(`/documents/${DOC_ID}/versions/`) && url.endsWith('/text')) return ok({ documentId: DOC_ID, versionId: VERSION_ID, versionNumber: 1, text: 'A felek megállapodnak a szerződés feltételeiben.\n\n'.repeat(50), format: 'DOCX', source: 'UPLOADED' });
 if (url.endsWith('/review-rail')) return ok({ documentId: DOC_ID, documentVersionId: VERSION_ID, versionNumber: 1, counts: { commentCount: 0, modificationProposalCount: 0, pendingProposalCount: 0, acceptedProposalCount: 0, rejectedProposalCount: 0 }, readyForCorrection: false, comments: [], proposals: [] });
 if (url.endsWith('/review-summary')) return ok(null);
 if (url.endsWith('/annotations')) return ok({ items: [], pagination: { total: 0, limit: 50, offset: 0 } });
 if (url.endsWith('/client-house-style')) return ok(null);
 if (url.includes('/cases/') && url.endsWith('/lifecycle')) return ok({ caseId: CASE_ID, status: 'ACTIVE', lifecycleCategory: 'ACTIVE', blockers: [{ code: 'OPEN_TASKS', label: 'Nyitott feladat', count: 1 }], closureReadiness: { ready: false, reasons: ['A feladat még nem zárult le.'] }, capabilities: { canClose: !readOnly }, availability: {} });
 return baseMock(url);
}
const browser = await chromium.launch({ headless: true });
try {
 for (const width of (process.env.WF09_WIDTHS ? process.env.WF09_WIDTHS.split(',').map(Number) : [390, 768, 1440])) {
  attached = []; writes.length = 0; readOnly = false; missingContext = false; historyErrorMode = false;
  const historyCount = historyRequests.length;
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : width === 768 ? 1024 : 1000 }, locale: 'hu-HU' });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  const errors = []; page.on('pageerror', e => { errors.push(e.stack || e.message); console.error('PAGE_ERROR', e.stack || e.message); });
  const requests = [];
  page.on('request', req => { requests.push(req.url()); });
  await page.addInitScript(profile => { localStorage.setItem('auth_token', 'qa-workforce-token'); sessionStorage.setItem('adminiculum_auth_profile', JSON.stringify(profile)); }, AUTH_ME);
  await page.route('**/api/v1/**', route => { const req = route.request(); const r = mock(req.url(), req.method(), req.postDataJSON()); return route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body) }); });
  // All application API requests are intercepted above; use Chromium's ordinary MSAL initialization.
  page.on('requestfailed', req => console.error('REQUEST_FAILED', req.url(), req.failure()?.errorText));
  const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
  await page.goto(`${BASE}/cases/${CASE_ID}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  try { await page.locator('[data-testid="word-case-context"]').waitFor(); } catch(e) { console.error(JSON.stringify({url:page.url(), errors, resources: await page.evaluate(() => performance.getEntriesByType('resource').map(r=>({name:r.name,duration:r.duration,size:r.transferSize}))), ready:await page.evaluate(()=>document.readyState), body:await page.locator('body').innerText(), requests},null,2)); throw e; }
  await page.locator('section[aria-label="Ügytörténet"] > ol').getByText('Ügy létrehozva', { exact: true }).waitFor();
  assert.ok(historyRequests.length > historyCount, 'the case route must request the mounted history endpoint');
  await page.getByRole('button', { name: 'További események' }).click();
  await page.locator('section[aria-label="Ügytörténet"] > ol').getByText('Szerződés ellenőrzése', { exact: true }).waitFor();
  await page.locator('[data-testid="case-notes-primary"]').waitFor();
  await page.getByText('Belső válasz', { exact: true }).waitFor();
  assert.equal(await page.locator('#ck-activity section[aria-label="Ügytörténet"]').count(), 1, 'one canonical history');
  await page.getByText('Teszt Munkatárs', { exact: true }).first().waitFor();
  assert.equal(await page.locator('[data-testid="persisted-deadline"] time').first().getAttribute('datetime'), DUE);
  await noOverflow();
  const ids = await page.locator('[data-tile-id]').evaluateAll(els => els.map(e => e.dataset.tileId));
  await page.screenshot({ path: path.join(SHOTS, `overview-${width}.png`), fullPage: true });
  historyErrorMode = true;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Az ügytörténet jelenleg nem tölthető be.', { exact: false }).waitFor();
  historyErrorMode = false;
  await page.getByRole('button', { name: 'Újrapróbálás' }).click();
  await page.locator('section[aria-label="Ügytörténet"] > ol').getByText('Ügy létrehozva', { exact: true }).waitFor();
  const docUrl = `${BASE}/cases/${CASE_ID}/documents?documentId=${DOC_ID}&versionId=${VERSION_ID}`;
  await page.goto(docUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const header = page.locator('[data-testid="word-document-header"]');
  try {
    await header.waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="submission-version-context"]')?.getAttribute('title') === 'qa-historical-version');
  } catch (cause) {
    await page.screenshot({ path: path.join(SHOTS, `document-failure-${width}.png`), fullPage: true });
    console.error(JSON.stringify({ url: page.url(), errors, requests, body: await page.locator('body').innerText() }, null, 2));
    throw cause;
  }
  assert.equal(await page.locator('[data-testid="document-submission-task"]').inputValue(), '');
  assert.ok(await page.locator('[data-testid="document-top-submission"]').isDisabled());
  assert.equal(await page.locator('[data-testid="word-case-context"]').count(), 0, 'document view must not repeat the case context');
  await noOverflow();
  await page.screenshot({ path: path.join(SHOTS, `documents-${width}.png`), fullPage: true });
  await page.getByTestId('document-reader-more').locator('summary').click();
  await page.getByTestId('document-reader-advanced-versions').click();
  await page.waitForURL(/mode=versions/);
  await page.getByTestId('versions-ledger').getByRole('button', { name: 'Megnyitás', exact: true }).click();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has('versionId') && !new URL(location.href).searchParams.has('mode'));
  await page.getByTestId('document-reader-more').locator('summary').click();
  await page.getByTestId('document-reader-advanced-versions').click();
  await page.waitForURL(/mode=versions/);
  await page.getByTestId('versions-ledger').getByRole('button', { name: 'Megnyitás', exact: true }).click();
  await page.waitForFunction(versionId => new URL(location.href).searchParams.get('versionId') === versionId && !new URL(location.href).searchParams.has('mode'), VERSION_ID);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(versionId => document.querySelector('[data-testid="submission-version-context"]')?.getAttribute('title') === versionId, VERSION_ID);
  await page.locator('[data-testid="document-submission-task"]').selectOption(TASK.id);
  await page.waitForFunction(() => !document.querySelector('[data-testid="document-top-submission"]')?.disabled);
  await page.getByRole('button', { name: 'Leadás', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('link', { name: 'Beküldött verzió megnyitása' }).waitFor();
  assert.deepEqual(writes, [{ documentId: DOC_ID, role: 'PRIMARY_OUTPUT', documentVersionId: VERSION_ID }]);
  assert.ok((await page.getByRole('link', { name: 'Beküldött verzió megnyitása' }).getAttribute('href')).includes(`versionId=${VERSION_ID}`));
  await page.screenshot({ path: path.join(SHOTS, `submission-${width}.png`), fullPage: true });
  assert.ok(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null), 'drawer must contain keyboard focus');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'document-top-submission');
  await page.goto(docUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="document-submission-task"]').selectOption(TASK.id);
  await page.getByRole('button', { name: 'Meglévő leadás / review' }).click();
  await page.getByRole('link', { name: 'Beküldött verzió megnyitása' }).waitFor();
  assert.ok((await page.getByRole('link', { name: 'Beküldött verzió megnyitása' }).getAttribute('href')).includes(VERSION_ID));
  readOnly = true; missingContext = true;
  await page.goto(docUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="document-submission-task"]').selectOption('');
  await page.locator('[data-testid="document-submission-task"]').selectOption(TASK.id);
  try {
   await page.getByText('Ehhez a feladathoz most nem csatolható új leadási verzió.', { exact: false }).waitFor();
  } catch (cause) {
   await page.screenshot({ path: path.join(SHOTS, `readonly-failure-${width}.png`), fullPage: true });
   console.error(JSON.stringify({ width, documentTask: await page.locator('[data-testid="document-submission-task"]').inputValue(), body: (await page.locator('body').innerText()).slice(0, 14000), recentRequests: requests.slice(-15) }, null, 2));
   throw cause;
  }
  assert.ok(await page.locator('[data-testid="document-top-submission"]').isDisabled());
  assert.equal(await page.locator('[data-testid="word-case-context"]').count(), 0);
  await page.getByRole('button', { name: 'Lezárás ellenőrzése' }).click();
  await page.getByText('A feladat még nem zárult le.', { exact: true }).waitFor();
  assert.ok(await page.getByRole('button', { name: 'Ügy lezárása', exact: true }).isDisabled());
  assert.equal(writes.length, 1); await noOverflow();
  await page.screenshot({ path: path.join(SHOTS, `readonly-${width}.png`), fullPage: true });
  assert.deepEqual(errors, [], `page errors at ${width}`);
  console.log(`PASS ${width}: overview, context identity, historical submission, reload, read-only, missing context, blocked closure, no overflow`);
  await context.close();
 }
} finally { await browser.close(); }
