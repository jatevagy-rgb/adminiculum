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
// WF10 actual Next routes with synthetic, stateful API fixtures. This is mock-API
// browser evidence; real persistence/authorization is in the PG router suites.
let tileState,ownerState,policyState,conflict=false;
const sourceItems=[{sourceKey:'status:pub',sourceRevision:'a'.repeat(64),title:'Közzétett állapot',body:'Ügyfélbiztos állapot',minimumLevel:1,category:'STATUS',occurredAt:'2026-10-01T00:00:00Z',minutes:null}];
function reset(){tileState={tiles:[],layoutRevision:0,placements:{overview:['current-state','subject','goal'],document:['current-state','subject','goal']},canManage:true};ownerState={revision:0,personId:null,owner:null,candidates:[{id:'person-1',name:'Ügyfél Oldali Ilona'}],canManage:true};policyState={revision:0,publishedNumber:null,draftNumber:null,reviewed:false,snapshot:null,grants:[{id:'grant-1'}],publications:[{id:'pub-1'}],sources:sourceItems,canManage:true,canPublish:true};}
function reportFixture(override){
 const person=override||ownerState.personId;const owner=person?{personId:person,name:person==='override'?'Jelentés Külön Elek':'Ügyfél Oldali Ilona',jobTitle:null,organizationGroupName:'Ügyfél szervezeti egység'}:null;
 const summary={caseId:CASE_ID,caseNumber:'QA-WF10',caseTitle:'Szintetikus jelentés ügy',caseStatus:'IN_PROGRESS',caseStatusLabel:'Folyamatban',isClosed:false,completedAt:null,matter:null,responsibleLawyerName:'Teszt Ügyvéd',recordedMinutes:0,recordedEntryCount:0,ambiguousMinutes:0,ambiguousEntryCount:0,excludedMinutes:0,excludedEntryCount:0,zeroTime:true,requesterNames:[],organizationGroupNames:[],departmentNames:[],workerNames:[]};
 const safeUpdates=policyState.publishedNumber&&!policyState.snapshot?.overlays.some(o=>o.excluded)?[{title:'Közzétett állapot',body:'Ügyfélbiztos állapot',category:'HISTORY',categoryLabel:'Megosztott ügytörténet',publishedAt:'2026-10-01'}]:[];
 const dto={kind:'CLIENT_WORK_REPORT_V1',client:{id:'test-client',name:'Szintetikus ügyfél'},period:{startDate:'2026-10-01',endDate:'2026-10-31'},case:summary,rows:[],ambiguousRows:[],excludedRows:[],safeUpdates,owner,issuer:{legalName:'Szintetikus ügyvédi iroda',address:'Teszt utca 1.',taxNumber:'TEST'},issuerMissing:[],generatedAt:'2026-10-01T10:00:00Z'};return {...dto,exportPreview:{...dto}};
}
function wf10mock(url,method,body){
 const ok=body=>({status:200,body});
 if(/\/clients(?:\?|$)/.test(url)&&!url.includes('/work-reports/'))return ok({data:[{id:'test-client',name:'Szintetikus ügyfél'}]});
 if(url.includes('/work-reports/clients/'))return ok({people:[{personId:'override',name:'Jelentés Külön Elek',jobTitle:null,organizationGroupName:'Ügyfél szervezeti egység'}]});
 if(url.includes('/work-reports/cases?'))return ok({cases:[reportFixture(null).case]});
 if(url.includes('/work-reports/cases/'))return ok(reportFixture(new URL(url).searchParams.get('ownerPersonId')));
 if(url.includes('/case-workspace/')&&url.endsWith('/tiles')){if(method==='PUT'){if(conflict){conflict=false;return {status:409,body:{code:'LAYOUT_REVISION_CONFLICT'}}}for(const t of body.tiles){const i=tileState.tiles.findIndex(x=>x.id===t.id);const next={...t,revision:t.revision+1};if(i<0)tileState.tiles.push(next);else tileState.tiles[i]=next;}tileState={...tileState,layoutRevision:tileState.layoutRevision+1,placements:body.placements};}return ok(tileState);}
 if(url.includes('/case-workspace/')&&url.endsWith('/owner')){if(method==='PUT')ownerState={...ownerState,revision:ownerState.revision+1,personId:body.personId,owner:body.personId?{name:'Ügyfél Oldali Ilona',organizationGroupName:'Ügyfél szervezeti egység',valid:true}:null};return ok(ownerState);}
 if(url.includes('/policy')){if(url.endsWith('/preview'))return ok({items:[{title:'Közzétett állapot',body:'Ügyfélbiztos állapot',minutes:null}]});if(method==='PUT')policyState={...policyState,revision:policyState.revision+1,draftNumber:(policyState.draftNumber||0)+1,snapshot:body.snapshot,reviewed:false};if(method==='POST'){policyState.revision++;if(url.endsWith('/review'))policyState.reviewed=true;if(url.endsWith('/publish'))policyState.publishedNumber=policyState.draftNumber;if(url.endsWith('/withdraw'))policyState.publishedNumber=null;}return ok(policyState);}
 if(url.endsWith('/anonymize-verified')||url.endsWith('/verified-context'))return ok({kind:'VERSION_BOUND_ANONYMIZED_CONTEXT',sourceDocumentId:DOC_ID,sourceDocumentVersionId:VERSION_ID,anonymizedArtifactId:'artifact-1',artifactRevision:1,caseId:CASE_ID,clientId:null,sourceVersionNumber:1,isCurrentVersion:false,outboundEligible:true,sanitizedText:'[ÜGYFÉL] ellenőrzött teszt szöveg',notice:'Technikai ellenőrzés; ügyvédi felülvizsgálat szükséges.'});
 return mock(url,method,body);
}
const browser=await chromium.launch({headless:true,channel:'chrome'});
const results=[];let lastPage=null;
try{for(const width of [390,768,1440]){
 reset();const context=await browser.newContext({viewport:{width,height:1000},locale:'hu-HU'});const page=await context.newPage();lastPage=page;page.setDefaultTimeout(45000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.addInitScript(profile=>{localStorage.setItem('auth_token','qa-workforce-token');sessionStorage.setItem('adminiculum_auth_profile',JSON.stringify(profile));Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text;if(window.__denyCopy)throw Error('denied')}},configurable:true})},AUTH_ME);
 await page.route('**/api/v1/**',route=>{const req=route.request();const r=wf10mock(req.url(),req.method(),req.postDataJSON());return route.fulfill({status:r.status,contentType:'application/json',body:JSON.stringify(r.body)})});await page.route('https://**',route=>route.abort());
 await page.goto(`${BASE}/cases/${CASE_ID}`,{waitUntil:'domcontentloaded',timeout:120000});const tiles=page.getByTestId('word-case-context');await tiles.getByRole('button',{name:'Csempék szerkesztése'}).click();await tiles.getByRole('button',{name:'Új közös szöveges csempe'}).click();await tiles.getByLabel('Közös csempe neve').fill('Hosszú magyar csempecím az ügyfelet érintő következő ellenőrzési lépésekről');await tiles.getByLabel('Közös tartalom').fill('Közös, tartós csempetartalom');await tiles.getByLabel('Szín').selectOption('teal');await tiles.locator('article').last().getByLabel('Saját dokumentumfejléc').check();await tiles.locator('article').last().getByRole('button',{name:/fel$/i}).focus();await page.keyboard.press('Enter');await tiles.getByRole('button',{name:'Mentés',exact:true}).click();await tiles.getByText('A csempék és a saját elrendezés mentve.').waitFor();for(const box of await tiles.locator('button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {w:r.width,h:r.height}})))assert.ok(box.w>=40&&box.h>=40,'new tile button target at least 40px');await page.reload();await tiles.getByText('Közös, tartós csempetartalom',{exact:true}).waitFor();
 await tiles.getByRole('button',{name:'Csempék szerkesztése'}).click();await tiles.getByLabel('Közös tartalom').fill('Konfliktusban megtartandó piszkozat');conflict=true;await tiles.getByRole('button',{name:'Mentés',exact:true}).click();await tiles.getByRole('alert').waitFor();assert.equal(await tiles.getByLabel('Közös tartalom').inputValue(),'Konfliktusban megtartandó piszkozat');await tiles.getByRole('button',{name:'Mégse',exact:true}).click();await tiles.getByText('Közös, tartós csempetartalom',{exact:true}).waitFor();
 const owner=page.getByRole('region',{name:'Ügygazda az ügyfélnél'}).first();await owner.getByLabel('Állandó ügygazda').selectOption('person-1');await owner.getByRole('button',{name:'Ügygazda mentése'}).click();await owner.getByText(/Ügyfél Oldali Ilona ·/).waitFor();
 const policy=page.getByRole('region',{name:'Ügyféltörténet megosztása'});await policy.getByLabel('Célközönség').selectOption('grant-1');await policy.getByLabel('Közzétett ügy').selectOption('pub-1');await policy.getByRole('button',{name:'Forráslista betöltése'}).click();await policy.getByLabel('Megosztási szint').selectOption('3');await policy.getByRole('button',{name:'Piszkozat mentése'}).click();await policy.getByRole('button',{name:'Szöveg és forrás ellenőrzésének jóváhagyása'}).click();await policy.getByRole('button',{name:'Közzététel a portálon és jelentésben'}).click();await policy.getByText(/Közzétett változat: 1/).waitFor();await policy.getByRole('button',{name:'Ügyfélnézet előnézete'}).click();await policy.getByRole('region',{name:'Ügyfélnézet előnézete'}).getByText('Ügyfélbiztos állapot',{exact:true}).waitFor();
 const ai=page.getByRole('region',{name:'Verzióhoz kötött külső AI-kontextus'});await ai.getByLabel('Forrásdokumentum').selectOption(DOC_ID);await ai.getByLabel('Pontos forrásverzió').selectOption(VERSION_ID);await ai.getByRole('button',{name:'Kiválasztott verzió anonimizálása'}).click();await ai.getByLabel('Kimenő anonimizált tartalom ellenőrzése').waitFor();await ai.getByRole('button',{name:'Ellenőrzött kockázati prompt másolása'}).click();await ai.getByText('A prompt a vágólapra került.').waitFor();assert.match(await page.evaluate(()=>window.__copied),/\[ÜGYFÉL\]/);await page.evaluate(()=>{window.__denyCopy=true});await ai.getByRole('button',{name:'Ellenőrzött kockázati prompt másolása'}).click();await ai.getByLabel(/A vágólap nem érhető el/).waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overview overflow ${width}`);await tiles.screenshot({path:path.join(SHOTS,`wf10-tiles-${width}.png`)});await policy.screenshot({path:path.join(SHOTS,`wf10-policy-${width}.png`)});await ai.screenshot({path:path.join(SHOTS,`wf10-ai-${width}.png`)});
 await page.goto(`${BASE}/cases/${CASE_ID}/documents?documentId=${DOC_ID}&versionId=${VERSION_ID}`,{waitUntil:'domcontentloaded',timeout:120000});await page.getByTestId('word-document-header').waitFor();await page.getByTestId('word-case-context').getByText('Közös, tartós csempetartalom',{exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`document overflow ${width}`);await page.getByTestId('word-document-header').screenshot({path:path.join(SHOTS,`wf10-document-${width}.png`)});
 await page.goto(BASE+'/work-report',{waitUntil:'domcontentloaded',timeout:120000});await page.getByRole('combobox').first().selectOption('test-client');await page.getByRole('button',{name:'Részletek',exact:true}).click();const exportView=page.getByRole('region',{name:'Ügyfél-export előnézete'});await page.getByText('Ügyfél Oldali Ilona',{exact:true}).waitFor();await page.locator('select').nth(1).selectOption('override');await page.getByText('Jelentés Külön Elek',{exact:true}).waitFor();assert.equal(ownerState.personId,'person-1');await page.locator('select').nth(1).selectOption('');await page.getByText('Ügyfél Oldali Ilona',{exact:true}).waitFor();await page.getByRole('region',{name:'Ügyféltörténet megosztása'}).getByText(/Közzétett változat: 1/).waitFor();await page.getByRole('region',{name:'Ügyfélnek közzétett tájékoztatások'}).getByText('Ügyfélbiztos állapot',{exact:true}).waitFor();await page.getByRole('heading',{name:'Ügyösszefoglaló',exact:true}).locator('..').screenshot({path:path.join(SHOTS,'wf10-report-owner-'+width+'.png')});await exportView.screenshot({path:path.join(SHOTS,'wf10-report-'+width+'.png')});
 const reportPolicy=page.getByRole('region',{name:'Ügyféltörténet megosztása'});await reportPolicy.getByLabel(/Elrejtés/).check();await reportPolicy.getByRole('button',{name:'Piszkozat mentése'}).click();await reportPolicy.getByRole('button',{name:'Szöveg és forrás ellenőrzésének jóváhagyása'}).click();await reportPolicy.getByRole('button',{name:'Közzététel a portálon és jelentésben'}).click();await reportPolicy.getByText(/Közzétett változat: 2/).waitFor();await page.locator('select').nth(1).selectOption('override');await page.getByText('Jelentés Külön Elek',{exact:true}).waitFor();assert.equal(await page.getByRole('region',{name:'Ügyfélnek közzétett tájékoztatások'}).count(),0);
 const fresh=await browser.newContext({viewport:{width,height:1000},storageState:await context.storageState()});await fresh.addInitScript(profile=>sessionStorage.setItem('adminiculum_auth_profile',JSON.stringify(profile)),AUTH_ME);const freshPage=await fresh.newPage();await freshPage.route('**/api/v1/**',route=>{const req=route.request();const r=wf10mock(req.url(),req.method(),req.postDataJSON());return route.fulfill({status:r.status,contentType:'application/json',body:JSON.stringify(r.body)})});await freshPage.route('https://**',route=>route.abort());await freshPage.goto(BASE+'/cases/'+CASE_ID+'/documents?documentId='+DOC_ID+'&versionId='+VERSION_ID,{waitUntil:'domcontentloaded',timeout:120000});await freshPage.getByTestId('word-case-context').getByText('Közös, tartós csempetartalom',{exact:true}).waitFor({timeout:45000});await freshPage.getByRole('region',{name:'Ügygazda az ügyfélnél'}).getByText(/Ügyfél Oldali Ilona ·/).waitFor();await fresh.close();
assert.deepEqual(errors,[]);results.push({width,passed:true,api:'STATEFUL_MOCK',checks:['tiles create/save/reload/reuse','keyboard move','conflict/cancel','saved owner and report default/override','draft/review/publish/preview','version selection','copy success/fallback','no horizontal overflow','per-item exclusion reflected on report reread','fresh browser context reuse','new tile buttons at least 40px']});await context.close();console.log('PASS',width);
}}catch(error){if(lastPage&&!lastPage.isClosed()){await lastPage.screenshot({path:path.join(SHOTS,'failure.png'),fullPage:true});fs.writeFileSync(path.join(SHOTS,'failure-text.txt'),await lastPage.locator('body').innerText())}throw error;}finally{fs.writeFileSync(path.join(SHOTS,'browser-results.json'),JSON.stringify(results,null,2));await browser.close()}
