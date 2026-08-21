-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PARTNER', 'LAWYER', 'TRAINEE', 'LEGAL_ASSISTANT', 'CLIENT', 'EXTERNAL_REVIEWER', 'COLLAB_LAWYER');

-- CreateEnum
CREATE TYPE "ClientColorKey" AS ENUM ('RED', 'ORANGE', 'AMBER', 'GREEN', 'TEAL', 'BLUE', 'INDIGO', 'PURPLE', 'ROSE', 'SLATE');

-- CreateEnum
CREATE TYPE "MatterType" AS ENUM ('REAL_ESTATE', 'EMPLOYMENT', 'CONTRACT', 'LITIGATION', 'COMPLIANCE', 'CORPORATE', 'IP', 'MERGERS_ACQUISITIONS', 'OTHER');

-- CreateEnum
CREATE TYPE "MatterStatus" AS ENUM ('OPEN', 'ON_HOLD', 'CLOSED');

-- CreateEnum
CREATE TYPE "TimesheetReportTemplateFamily" AS ENUM ('HU_DETAILED_MONTHLY', 'CORPORATE_SUMMARY');

-- CreateEnum
CREATE TYPE "TimesheetReportInstanceStatus" AS ENUM ('DRAFT', 'GENERATED');

-- CreateEnum
CREATE TYPE "TimesheetReportArtifactFormat" AS ENUM ('TEXT_V1', 'DOCX_V1');

-- CreateEnum
CREATE TYPE "TimesheetPresetLayer" AS ENUM ('TEMPLATE_DEFAULT', 'LAWYER_DEFAULT', 'CLIENT_DEFAULT', 'CLIENT_LAWYER_OVERRIDE');

-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('DRAFTING', 'REVIEW', 'CLIENT_CALL', 'LEGAL_RESEARCH', 'INTERNAL_MEETING', 'DOCUMENT_GENERATION', 'COURT_PREPARATION', 'TRANSLATION', 'ADMIN', 'OTHER');

-- CreateEnum
CREATE TYPE "AutomationActionPolicy" AS ENUM ('SAFE_AUTOPILOT_ALLOWED', 'USER_APPROVAL_REQUIRED', 'NEVER_AUTOPILOT');

-- CreateEnum
CREATE TYPE "AutomationCompensationReadiness" AS ENUM ('NONE', 'COMPENSATION_READY', 'MANUAL_COMPENSATION_REQUIRED');

-- CreateEnum
CREATE TYPE "AutomationEntityType" AS ENUM ('TASK', 'CASE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "AutomationEventSource" AS ENUM ('HUMAN', 'AUTOMATION');

-- CreateEnum
CREATE TYPE "AutomationExecutionMode" AS ENUM ('LEVEL1', 'LEVEL2', 'LEVEL3');

-- CreateEnum
CREATE TYPE "AutomationExecutionStatus" AS ENUM ('SUCCESS', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AutomationStepRetryability" AS ENUM ('RETRYABLE', 'MANUAL_RETRY_ONLY', 'NON_RETRYABLE');

-- CreateEnum
CREATE TYPE "AutomationSuggestionState" AS ENUM ('OFFERED', 'ACCEPTED', 'DISMISSED', 'EXPIRED', 'PROCESSING');

-- CreateEnum
CREATE TYPE "AutomationSuggestionType" AS ENUM ('NEXT_STEP', 'ACTION_BUNDLE');

-- CreateEnum
CREATE TYPE "AutomationSuppressionType" AS ENUM ('ACTION_KEY', 'TEMPLATE_ID');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('CONTRACT_REVIEW', 'CONTRACT_DRAFTING', 'LITIGATION', 'CORPORATE', 'IP', 'EMPLOYMENT', 'REAL_ESTATE', 'MERGERS_ACQUISITIONS', 'OTHER');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('CLIENT_INPUT', 'DRAFT', 'IN_REVIEW', 'APPROVED', 'SENT_TO_CLIENT', 'CLIENT_FEEDBACK', 'FINAL', 'ON_HOLD', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "DocumentWorkStatus" AS ENUM ('RECEIVED', 'WAITING_FOR_PROCESSING', 'IN_PROGRESS', 'INTERNAL_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'READY_FOR_CLIENT', 'SENT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('CONTRACT', 'CORRESPONDENCE', 'EVIDENCE', 'COURT_FILING', 'INTERNAL_MEMO', 'RESEARCH', 'TEMPLATE', 'CLIENT_INPUT', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentVersionReviewStatus" AS ENUM ('NOT_IN_REVIEW', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "DocumentVersionPublicationStatus" AS ENUM ('INTERNAL_ONLY', 'CLIENT_READY', 'PUBLISHED', 'WITHDRAWN', 'SIGNED');

-- CreateEnum
CREATE TYPE "DocumentVersionUploadSource" AS ENUM ('CLIENT_UPLOAD', 'LAWYER_UPLOAD', 'EMAIL_IMPORT', 'SHAREPOINT', 'CLIENT_PORTAL', 'GENERATED', 'EXTERNAL', 'WORKSPACE_SAVE', 'IMPORT');

-- CreateEnum
CREATE TYPE "DocumentVersionType" AS ENUM ('ORIGINAL', 'WORKING_COPY', 'REVIEW_DRAFT', 'CLIENT_DRAFT', 'FINAL', 'SIGNED');

-- CreateEnum
CREATE TYPE "DocumentAnnotationType" AS ENUM ('INTERNAL_NOTE', 'REVIEW_COMMENT', 'MODIFICATION_REASON', 'CLIENT_EXPLANATION_DRAFT', 'QUESTION', 'DECISION', 'TASK_NOTE');

-- CreateEnum
CREATE TYPE "DocumentAnnotationAnchorType" AS ENUM ('TEXT_RANGE', 'PAGE_RECTANGLE', 'PAGE_ELLIPSE', 'PAGE_POINT');

-- CreateEnum
CREATE TYPE "DocumentAnnotationStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REOPENED');

-- CreateEnum
CREATE TYPE "DocumentAnnotationVisibility" AS ENUM ('INTERNAL', 'CLIENT_CANDIDATE');

-- CreateEnum
CREATE TYPE "DocumentAnnotationEventType" AS ENUM ('CREATED', 'CONTENT_UPDATED', 'ASSIGNED', 'STATUS_CHANGED', 'RESOLVED', 'REOPENED', 'COMMENT_ADDED', 'SOFT_DELETED');

-- CreateEnum
CREATE TYPE "DocumentReviewStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'READY_FOR_CLIENT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DocumentReviewWorkspaceSource" AS ENUM ('CONTRACT_WORKSPACE', 'LITIGATION_WORKSPACE');

-- CreateEnum
CREATE TYPE "DocumentReviewSuggestionType" AS ENUM ('COMMENT', 'REPLACEMENT', 'DELETION');

-- CreateEnum
CREATE TYPE "DocumentReviewSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('REVIEW_CONTRACT', 'DRAFT_CONTRACT', 'CLIENT_MEETING', 'RESEARCH', 'COURT_FILING', 'DEADLINE', 'APPROVAL', 'REVIEW_ANONYMIZED', 'QUALITY_CHECK', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'COMPLETED', 'CANCELLED', 'BLOCKED', 'TODO', 'IN_REVIEW', 'DONE');

-- CreateEnum
CREATE TYPE "TaskSubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewAttentionLevel" AS ENUM ('QUICK_SCAN', 'APPROVAL', 'SIGNATURE', 'EDITING', 'DETAILED_REVIEW');

-- CreateEnum
CREATE TYPE "TaskReviewDecisionType" AS ENUM ('APPROVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "TaskSubmissionDocumentRole" AS ENUM ('PRIMARY_OUTPUT', 'SUPPORTING_DOCUMENT', 'REVIEW_REFERENCE', 'FINAL_OUTPUT');

-- CreateEnum
CREATE TYPE "ExternalActionType" AS ENUM ('CLIENT_SEND', 'SIGNATURE', 'COURT_FILING', 'AUTHORITY_SUBMISSION', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskMaturityStage" AS ENUM ('DRAFTING', 'REVIEW', 'CLIENT_REVIEW', 'REVISION', 'FINALIZING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TaskStuckReason" AS ENUM ('INFORMATION_MISSING', 'CLIENT_WAITING', 'LEGAL_RESEARCH', 'TECHNICAL_BLOCK', 'DEPENDENCY', 'INTERNAL_REVIEW', 'EXTERNAL_APPROVAL');

-- CreateEnum
CREATE TYPE "TimelineEventType" AS ENUM ('CASE_CREATED', 'CASE_ASSIGNED', 'CASE_STATUS_CHANGED', 'DOCUMENT_UPLOADED', 'DOCUMENT_VERSION_CREATED', 'DOCUMENT_APPROVED', 'DOCUMENT_REJECTED', 'DOCUMENT_SENT_TO_CLIENT', 'DOCUMENT_RECEIVED_FROM_CLIENT', 'TASK_CREATED', 'TASK_ASSIGNED', 'TASK_STARTED', 'TASK_COMPLETED', 'TASK_BLOCKED', 'COMMENT_ADDED', 'CONTRACT_GENERATED', 'REVIEW_REQUESTED', 'REVIEW_COMPLETED', 'ANONYMIZATION_STARTED', 'ANONYMIZATION_COMPLETED', 'CLIENT_CONTACT', 'MEETING_SCHEDULED', 'DEADLINE_SET', 'DEADLINE_WARNING', 'DEADLINE_MISSED', 'TIME_LOGGED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_ASSIGNED', 'TASK_DUE_SOON', 'TASK_OVERDUE', 'CASE_ASSIGNED', 'CASE_STATUS_CHANGED', 'DOCUMENT_UPLOADED', 'DOCUMENT_APPROVED', 'COMMENT_ADDED', 'REVIEW_REQUESTED', 'REVIEW_COMPLETED', 'TIME_LOGGED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('ADASVETEL', 'BERLET', 'MEGBIZAS', 'MUNKASZERZODES', 'VALLALKOZAS', 'EGYEB');

-- CreateEnum
CREATE TYPE "LegalAnalysisStatus" AS ENUM ('DRAFT', 'CANDIDATE_REVIEW', 'LAWYER_REVIEW', 'READY_FOR_APPROVAL', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LegalAnalysisSourceType" AS ENUM ('PASTED_AI_OUTPUT', 'MANUAL');

-- CreateEnum
CREATE TYPE "LegalAnalysisSourceDocumentType" AS ENUM ('DOCUMENT', 'CONTRACT_GENERATION', 'ANONYMOUS_DOCUMENT');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('PENDING', 'PREVIEW', 'GENERATED', 'UPLOADED', 'APPROVED', 'REJECTED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CommunicationType" AS ENUM ('EMAIL', 'PHONE', 'MEETING', 'LETTER', 'NOTE');

-- CreateEnum
CREATE TYPE "CommunicationDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "CommunicationSource" AS ENUM ('MANUAL', 'OUTLOOK');

-- CreateEnum
CREATE TYPE "CommunicationSyncStatus" AS ENUM ('IMPORTED', 'PENDING', 'FAILED');

-- CreateEnum
CREATE TYPE "ReviewOverallStatus" AS ENUM ('NEEDS_REVISION', 'APPROVED_FOR_NEXT_STEP', 'FLAGGED');

-- CreateEnum
CREATE TYPE "BlockReviewStatus" AS ENUM ('OK', 'REVIEW_NEEDED', 'RISK_ISSUE');

-- CreateEnum
CREATE TYPE "ClauseContractType" AS ENUM ('ADASVETEL', 'BERLET', 'MEGBIZAS', 'MUNKASZERZODES', 'VALLALKOZAS', 'EGYEB');

-- CreateEnum
CREATE TYPE "ClauseKind" AS ENUM ('REQUIRED', 'RECOMMENDED', 'OPTIONAL', 'SPECIAL');

-- CreateEnum
CREATE TYPE "RepresentedSide" AS ENUM ('EITHER', 'ELOADO', 'VEVO', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "ClauseCategory" AS ENUM ('PARTY', 'PROPERTY', 'OWNERSHIP_PROOF', 'TITLE', 'WARRANTIES', 'PRICE', 'FINANCING', 'POSSESSION', 'CLOSING', 'SPECIAL');

-- CreateEnum
CREATE TYPE "AssemblyStatus" AS ENUM ('IN_PROGRESS', 'READY', 'GENERATED');

-- CreateEnum
CREATE TYPE "LawyerHandoffPackageType" AS ENUM ('STANDARD', 'FINAL_APPROVAL');

-- CreateEnum
CREATE TYPE "LawyerHandoffStatus" AS ENUM ('DRAFT', 'PREPARED', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LawyerHandoffDecision" AS ENUM ('APPROVED', 'REJECTED_NEEDS_REVISION', 'REJECTED_BLOCKING');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'LEGAL_ASSISTANT',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "department" TEXT,
    "skills" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "taxNumber" TEXT,
    "companyRegistrationNumber" TEXT,
    "authorizedRepresentative" TEXT,
    "company" TEXT,
    "vatNumber" TEXT,
    "contactPerson" TEXT,
    "notes" TEXT,
    "color" VARCHAR(16),
    "colorKey" "ClientColorKey",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_house_style_profiles" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "officialName" TEXT,
    "shortName" TEXT,
    "registeredSeat" TEXT,
    "taxNumber" TEXT,
    "registrationNumber" TEXT,
    "contactPerson" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "preferredLanguage" TEXT,
    "documentLanguageMode" TEXT,
    "fontFamily" TEXT,
    "fontSize" TEXT,
    "headingStyle" TEXT,
    "numberingStyle" TEXT,
    "headerRequirements" TEXT,
    "footerRequirements" TEXT,
    "signatureBlock" TEXT,
    "headerAssetPath" TEXT,
    "headerDescription" TEXT,
    "brandingNotes" TEXT,
    "bilingualNotes" TEXT,
    "translationNotes" TEXT,
    "preferredTone" TEXT,
    "prohibitedWording" TEXT,
    "reusablePromptInstructions" TEXT,
    "wordFormattingInstructions" TEXT,
    "externalAiInstructions" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_house_style_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_workgroups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,

    CONSTRAINT "client_workgroups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workload_records" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "reportedHours" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workgroupId" TEXT NOT NULL,

    CONSTRAINT "workload_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matters" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "matterType" "MatterType" NOT NULL,
    "status" "MatterStatus" NOT NULL DEFAULT 'OPEN',
    "budgetHours" DOUBLE PRECISION,
    "totalMinutes" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "departmentId" TEXT,

    CONSTRAINT "matters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "workType" "WorkType" NOT NULL,
    "description" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "workDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "matterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT,
    "taskId" TEXT,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_report_instances" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateFamily" "TimesheetReportTemplateFamily" NOT NULL,
    "reportPeriod" TEXT NOT NULL,
    "clientId" TEXT,
    "clientName" TEXT,
    "matterId" TEXT,
    "matterName" TEXT,
    "caseId" TEXT,
    "caseReference" TEXT,
    "presetId" TEXT,
    "monthlyClosure" TEXT,
    "pendingOpenMattersNote" TEXT,
    "clientClosingText" TEXT,
    "defaultLawyerName" TEXT,
    "carriedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aboveThresholdHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rows" JSONB NOT NULL,
    "totalsSnapshot" JSONB NOT NULL,
    "status" "TimesheetReportInstanceStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timesheet_report_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_report_artifacts" (
    "id" TEXT NOT NULL,
    "reportInstanceId" TEXT NOT NULL,
    "format" "TimesheetReportArtifactFormat" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentText" TEXT,
    "contentBase64" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timesheet_report_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_presets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateFamily" "TimesheetReportTemplateFamily" NOT NULL,
    "layer" "TimesheetPresetLayer" NOT NULL,
    "lawyerId" TEXT,
    "lawyerName" TEXT,
    "clientId" TEXT,
    "clientName" TEXT,
    "monthlyClosure" TEXT,
    "pendingOpenMattersNote" TEXT,
    "clientClosingText" TEXT,
    "defaultLawyerName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timesheet_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_automation_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "suggestionsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "level1Enabled" BOOLEAN NOT NULL DEFAULT true,
    "level2Enabled" BOOLEAN NOT NULL DEFAULT true,
    "level3Enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_automation_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_automation_suppressions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "suppressionType" "AutomationSuppressionType" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_automation_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_trigger_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" "AutomationEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "screen" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "actionKey" TEXT NOT NULL,
    "payloadClass" TEXT,
    "contextKey" TEXT NOT NULL,
    "source" "AutomationEventSource" NOT NULL DEFAULT 'HUMAN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_trigger_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_suggestions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" "AutomationEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "suggestionType" "AutomationSuggestionType" NOT NULL,
    "suggestedActionKey" TEXT NOT NULL,
    "suggestedPayloadClass" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "contextKey" TEXT NOT NULL,
    "state" "AutomationSuggestionState" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStartedAt" TIMESTAMP(3),
    "bundlePreview" JSONB,

    CONSTRAINT "automation_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_execution_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" "AutomationEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "suggestionId" TEXT,
    "executionMode" "AutomationExecutionMode" NOT NULL,
    "status" "AutomationExecutionStatus" NOT NULL,
    "resultSummary" TEXT,
    "rollbackData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operationToken" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureDetails" JSONB,

    CONSTRAINT "automation_execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_execution_step_logs" (
    "id" TEXT NOT NULL,
    "executionLogId" TEXT NOT NULL,
    "suggestionId" TEXT,
    "userId" TEXT NOT NULL,
    "entityType" "AutomationEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "executionMode" "AutomationExecutionMode" NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "actionKey" TEXT NOT NULL,
    "payloadClass" TEXT,
    "status" "AutomationExecutionStatus" NOT NULL,
    "actionPolicy" "AutomationActionPolicy" NOT NULL,
    "retryability" "AutomationStepRetryability" NOT NULL,
    "compensationReadiness" "AutomationCompensationReadiness" NOT NULL,
    "compensationHint" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "resultSummary" TEXT,
    "failureCode" TEXT,
    "failureDetails" JSONB,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_execution_step_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "caseType" "CaseType" NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'CLIENT_INPUT',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "clientName" TEXT,
    "matterType" TEXT,
    "sharepointRoot" TEXT,
    "clientRole" TEXT,
    "sharepointSite" TEXT,
    "caseAssignment" JSONB,
    "spSiteId" TEXT,
    "spDriveId" TEXT,
    "spFolderPath" TEXT,
    "spMainFolderId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "matterId" TEXT,
    "createdById" TEXT NOT NULL,
    "assignedLawyerId" TEXT,
    "intakeOriginReason" TEXT,
    "intakeCurrentSituation" TEXT,
    "intakeClientExpectation" TEXT,
    "intakeUrgentAction" TEXT,
    "intakeNextStep" TEXT,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_external_participants" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "side" TEXT NOT NULL DEFAULT 'OTHER',
    "organization" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_external_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_intake_deadlines" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "deadlineType" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "inputMode" TEXT NOT NULL DEFAULT 'ABSOLUTE',
    "relativeValue" INTEGER,
    "relativeUnit" TEXT,
    "reminderMinutesBefore" INTEGER,
    "responsibleId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_intake_deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_collaborators" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'COLLABORATOR',
    "addedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "category" "DocumentCategory" NOT NULL,
    "fileName" TEXT,
    "documentType" TEXT,
    "spPath" TEXT,
    "spDriveId" TEXT,
    "version" TEXT,
    "folder" TEXT,
    "spItemId" TEXT,
    "spWebUrl" TEXT,
    "spParentPath" TEXT,
    "spVersionId" TEXT,
    "spCheckOutUser" TEXT,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "currentVersionInt" INTEGER NOT NULL DEFAULT 1,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "size" INTEGER,
    "checksum" TEXT,
    "workspaceText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "caseId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT,
    "documentRole" TEXT,
    "workStatus" "DocumentWorkStatus" NOT NULL DEFAULT 'RECEIVED',
    "workInstruction" TEXT,
    "workInstructionUpdatedAt" TIMESTAMP(3),
    "workInstructionUpdatedById" TEXT,
    "responsibleId" TEXT,
    "reviewerId" TEXT,
    "dueDate" TIMESTAMP(3),
    "workPriority" "Priority",
    "nextStep" TEXT,
    "sourceCommunicationId" TEXT,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_task_links" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_task_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "originalFileName" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "storageReference" TEXT,
    "currentVersion" BOOLEAN NOT NULL DEFAULT false,
    "reviewStatus" "DocumentVersionReviewStatus" NOT NULL DEFAULT 'NOT_IN_REVIEW',
    "publicationStatus" "DocumentVersionPublicationStatus" NOT NULL DEFAULT 'INTERNAL_ONLY',
    "uploadSource" "DocumentVersionUploadSource" NOT NULL DEFAULT 'LAWYER_UPLOAD',
    "versionType" "DocumentVersionType" NOT NULL DEFAULT 'WORKING_COPY',
    "spVersionLabel" TEXT,
    "spVersionId" TEXT,
    "spAuthorId" TEXT,
    "spItemId" TEXT,
    "spWebUrl" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentId" TEXT NOT NULL,
    "previousVersionId" TEXT,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_annotations" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "annotationType" "DocumentAnnotationType" NOT NULL,
    "anchorType" "DocumentAnnotationAnchorType" NOT NULL,
    "status" "DocumentAnnotationStatus" NOT NULL DEFAULT 'OPEN',
    "visibility" "DocumentAnnotationVisibility" NOT NULL DEFAULT 'INTERNAL',
    "headline" TEXT,
    "internalNote" TEXT,
    "reviewComment" TEXT,
    "modificationReason" TEXT,
    "clientExplanationDraft" TEXT,
    "legalRisk" TEXT,
    "openQuestion" TEXT,
    "decisionText" TEXT,
    "resolutionNote" TEXT,
    "selectedText" TEXT,
    "normalizedSelectedText" TEXT,
    "textPrefix" TEXT,
    "textSuffix" TEXT,
    "startOffset" INTEGER,
    "endOffset" INTEGER,
    "pageNumber" INTEGER,
    "pageIndex" INTEGER,
    "rectX" DECIMAL(8,6),
    "rectY" DECIMAL(8,6),
    "rectWidth" DECIMAL(8,6),
    "rectHeight" DECIMAL(8,6),
    "pointX" DECIMAL(8,6),
    "pointY" DECIMAL(8,6),
    "pageRotation" INTEGER,
    "structuralPath" TEXT,
    "rendererVersion" TEXT,
    "contentFingerprint" TEXT,
    "idempotencyKey" TEXT,
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "resolvedById" TEXT,
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "document_annotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_annotation_comments" (
    "id" TEXT NOT NULL,
    "annotationId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "document_annotation_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_annotation_events" (
    "id" TEXT NOT NULL,
    "annotationId" TEXT NOT NULL,
    "eventType" "DocumentAnnotationEventType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "fromStatus" "DocumentAnnotationStatus",
    "toStatus" "DocumentAnnotationStatus",
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_annotation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_reviews" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "status" "DocumentReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "assignedReviewerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "document_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_snapshots" (
    "id" TEXT NOT NULL,
    "documentReviewId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_review_suggestions" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT,
    "workspaceSource" "DocumentReviewWorkspaceSource" NOT NULL,
    "type" "DocumentReviewSuggestionType" NOT NULL,
    "status" "DocumentReviewSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "selectedTextPreview" TEXT NOT NULL,
    "rangeFrom" INTEGER,
    "rangeTo" INTEGER,
    "replacementText" TEXT,
    "documentTextHash" TEXT,
    "anchorMetadata" JSONB,
    "helperText" TEXT,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "document_review_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "taskType" "TaskType" NOT NULL,
    "type" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "assignedToId" TEXT,
    "assignedById" TEXT,
    "skillMatch" DOUBLE PRECISION,
    "skillProfile" JSONB,
    "requiredSkills" TEXT[],
    "documentId" TEXT,
    "caseId" TEXT NOT NULL,
    "workflowEvent" TEXT,
    "matterId" TEXT,
    "stuckReason" "TaskStuckReason",
    "maturityStage" "TaskMaturityStage",
    "complexityScore" INTEGER NOT NULL DEFAULT 3,
    "riskScore" INTEGER NOT NULL DEFAULT 3,
    "lastProgressAt" TIMESTAMP(3),
    "stuckSince" TIMESTAMP(3),
    "attentionCategory" "ReviewAttentionLevel",
    "estimatedMinutes" INTEGER,
    "dueDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sourceCommunicationId" TEXT,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_submissions" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "status" "TaskSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "submittedById" TEXT,
    "assignedReviewerId" TEXT NOT NULL,
    "workSummary" TEXT,
    "remainingIssues" TEXT,
    "reviewerNote" TEXT,
    "requestedAttention" "ReviewAttentionLevel",
    "externalActionRequired" BOOLEAN NOT NULL DEFAULT false,
    "externalActionType" "ExternalActionType",
    "zeroTimeConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "zeroTimeConfirmedById" TEXT,
    "zeroTimeConfirmedAt" TIMESTAMP(3),
    "externalCompletedById" TEXT,
    "idempotencyKey" TEXT,
    "supersedesSubmissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "externalCompletedAt" TIMESTAMP(3),

    CONSTRAINT "task_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_submission_documents" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT,
    "role" "TaskSubmissionDocumentRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "task_submission_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_review_decisions" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "TaskReviewDecisionType" NOT NULL,
    "note" TEXT,
    "requestedCorrections" TEXT,
    "requiresFullReview" BOOLEAN NOT NULL DEFAULT false,
    "correctionDeadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_review_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_submission_time_entries" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "timeEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_submission_time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignment_history" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT NOT NULL,
    "reason" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_assignment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_redaction_profiles" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fullName" TEXT,
    "aliases" JSONB,
    "addresses" JSONB,
    "taxId" TEXT,
    "patterns" JSONB NOT NULL,
    "personas" JSONB NOT NULL,
    "useLLM" BOOLEAN NOT NULL DEFAULT false,
    "llmPrompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_redaction_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anonymous_documents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "addresses" JSONB,
    "sourceDocId" TEXT NOT NULL,
    "redactedItems" JSONB NOT NULL,
    "aiTask" TEXT,
    "customPrompt" TEXT,
    "originalDocId" TEXT,
    "caseId" TEXT,
    "redactedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patternCount" INTEGER NOT NULL,
    "aiResponseText" TEXT,
    "rehydratedContent" TEXT,
    "rehydrationStatus" TEXT,
    "rehydrationWarnings" JSONB,
    "rehydratedAt" TIMESTAMP(3),
    "spItemId" TEXT,
    "spWebUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anonymous_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_events" (
    "id" TEXT NOT NULL,
    "eventType" "TimelineEventType" NOT NULL,
    "type" TEXT,
    "payload" JSONB,
    "description" TEXT,
    "metadata" JSONB,
    "caseId" TEXT NOT NULL,
    "userId" TEXT,
    "documentId" TEXT,
    "taskId" TEXT,
    "communicationId" TEXT,
    "timeEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "documentId" TEXT,
    "caseId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "TemplateCategory" NOT NULL,
    "templatePath" TEXT NOT NULL,
    "originalFileName" TEXT,
    "variables" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_generations" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "caseId" TEXT,
    "templateData" JSONB NOT NULL,
    "comparisonSnapshot" JSONB,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "status" "GenerationStatus" NOT NULL DEFAULT 'PENDING',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "spItemId" TEXT,
    "spWebUrl" TEXT,
    "isFinalRevision" BOOLEAN NOT NULL DEFAULT false,
    "finalizedAt" TIMESTAMP(3),
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "parentRevisionId" TEXT,
    "isCurrentRevision" BOOLEAN NOT NULL DEFAULT true,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "contract_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_analyses" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "documentId" TEXT,
    "documentSourceType" "LegalAnalysisSourceDocumentType" NOT NULL DEFAULT 'DOCUMENT',
    "title" TEXT NOT NULL,
    "analysisText" TEXT NOT NULL,
    "status" "LegalAnalysisStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceType" "LegalAnalysisSourceType" NOT NULL DEFAULT 'PASTED_AI_OUTPUT',
    "aiToolName" TEXT,
    "anonymizedInputSnapshot" TEXT,
    "riskMatrixDetected" BOOLEAN NOT NULL DEFAULT false,
    "missingDataDetected" BOOLEAN NOT NULL DEFAULT false,
    "suggestedChangesDetected" BOOLEAN NOT NULL DEFAULT false,
    "lawyerDecisionPointsDetected" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communications" (
    "id" TEXT NOT NULL,
    "type" "CommunicationType" NOT NULL,
    "subject" TEXT NOT NULL,
    "senderName" TEXT,
    "senderEmail" TEXT,
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "content" TEXT,
    "summary" TEXT,
    "caseId" TEXT,
    "isPrimaryForCase" BOOLEAN NOT NULL DEFAULT false,
    "clientId" TEXT,
    "documentId" TEXT,
    "externalMessageId" TEXT,
    "providerConversationId" TEXT,
    "mailboxAddress" TEXT,
    "direction" "CommunicationDirection",
    "receivedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "source" "CommunicationSource" DEFAULT 'MANUAL',
    "syncStatus" "CommunicationSyncStatus",
    "importedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "recipients" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_attachments" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT,
    "description" TEXT,
    "url" TEXT,
    "spItemId" TEXT,
    "providerAttachmentId" TEXT,
    "sizeBytes" INTEGER,
    "communicationId" TEXT NOT NULL,
    "documentId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_drafts" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "templateId" TEXT,
    "templateName" TEXT,
    "documentFamily" TEXT,
    "draftData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "lastEditedById" TEXT,

    CONSTRAINT "generation_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_review_records" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "overallStatus" "ReviewOverallStatus" NOT NULL DEFAULT 'NEEDS_REVISION',
    "overallTitle" TEXT,
    "overallNote" TEXT,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_review_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "block_review_notes" (
    "id" TEXT NOT NULL,
    "reviewRecordId" TEXT NOT NULL,
    "blockKey" TEXT NOT NULL,
    "blockOrderIndex" INTEGER,
    "sourceClauseId" TEXT,
    "status" "BlockReviewStatus" NOT NULL DEFAULT 'OK',
    "title" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "block_review_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clause_library_items" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "summary" TEXT,
    "contractType" "ClauseContractType" NOT NULL,
    "clauseKind" "ClauseKind" NOT NULL,
    "representedSide" "RepresentedSide" NOT NULL,
    "category" "ClauseCategory" NOT NULL,
    "keywords" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourceType" TEXT,
    "bankPackTag" TEXT,
    "lawyerProfileId" TEXT,
    "triggerConditions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clause_library_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lawyer_profiles" (
    "id" TEXT NOT NULL,
    "lawyerName" TEXT NOT NULL,
    "lawyerEmail" TEXT,
    "preferredNumbering" TEXT,
    "defaultClosingText" TEXT,
    "styleNotes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lawyer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lawyer_preferred_clauses" (
    "id" TEXT NOT NULL,
    "lawyerProfileId" TEXT NOT NULL,
    "clauseId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "alwaysInclude" BOOLEAN NOT NULL DEFAULT false,
    "alwaysExclude" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lawyer_preferred_clauses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_assembly_drafts" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "contractType" "ClauseContractType" NOT NULL DEFAULT 'ADASVETEL',
    "intakeData" JSONB NOT NULL,
    "selectedClauses" JSONB NOT NULL,
    "assembledText" TEXT,
    "status" "AssemblyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "lawyerProfileId" TEXT,
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "contract_assembly_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_assembly_clauses" (
    "id" TEXT NOT NULL,
    "assemblyDraftId" TEXT NOT NULL,
    "clauseId" TEXT NOT NULL,
    "editedBody" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_assembly_clauses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lawyer_handoff_packages" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "status" "LawyerHandoffStatus" NOT NULL DEFAULT 'DRAFT',
    "packageType" "LawyerHandoffPackageType" NOT NULL DEFAULT 'STANDARD',
    "sourceDocumentId" TEXT,
    "anonymizedDocumentId" TEXT,
    "generatedContractId" TEXT,
    "legalAnalysisId" TEXT,
    "reviewNotesId" TEXT,
    "preparerSummary" TEXT,
    "preparedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewDecision" "LawyerHandoffDecision",
    "reviewComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lawyer_handoff_packages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "client_house_style_profiles_clientId_key" ON "client_house_style_profiles"("clientId");

-- CreateIndex
CREATE INDEX "client_workgroups_clientId_idx" ON "client_workgroups"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "client_workgroups_clientId_name_key" ON "client_workgroups"("clientId", "name");

-- CreateIndex
CREATE INDEX "workload_records_workgroupId_idx" ON "workload_records"("workgroupId");

-- CreateIndex
CREATE UNIQUE INDEX "workload_records_workgroupId_period_key" ON "workload_records"("workgroupId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "departments_clientId_name_key" ON "departments"("clientId", "name");

-- CreateIndex
CREATE INDEX "time_entries_matterId_workDate_idx" ON "time_entries"("matterId", "workDate");

-- CreateIndex
CREATE INDEX "time_entries_taskId_idx" ON "time_entries"("taskId");

-- CreateIndex
CREATE INDEX "timesheet_report_instances_updatedAt_idx" ON "timesheet_report_instances"("updatedAt");

-- CreateIndex
CREATE INDEX "timesheet_report_instances_reportPeriod_idx" ON "timesheet_report_instances"("reportPeriod");

-- CreateIndex
CREATE INDEX "timesheet_report_artifacts_reportInstanceId_createdAt_idx" ON "timesheet_report_artifacts"("reportInstanceId", "createdAt");

-- CreateIndex
CREATE INDEX "timesheet_presets_templateFamily_isActive_idx" ON "timesheet_presets"("templateFamily", "isActive");

-- CreateIndex
CREATE INDEX "timesheet_presets_layer_isActive_idx" ON "timesheet_presets"("layer", "isActive");

-- CreateIndex
CREATE INDEX "timesheet_presets_templateFamily_lawyerId_clientId_isActive_idx" ON "timesheet_presets"("templateFamily", "lawyerId", "clientId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "user_automation_preferences_userId_key" ON "user_automation_preferences"("userId");

-- CreateIndex
CREATE INDEX "user_automation_suppressions_userId_suppressionType_value_idx" ON "user_automation_suppressions"("userId", "suppressionType", "value");

-- CreateIndex
CREATE INDEX "automation_trigger_events_createdAt_idx" ON "automation_trigger_events"("createdAt");

-- CreateIndex
CREATE INDEX "automation_trigger_events_userId_contextKey_idx" ON "automation_trigger_events"("userId", "contextKey");

-- CreateIndex
CREATE INDEX "automation_trigger_events_userId_entityType_entityId_idx" ON "automation_trigger_events"("userId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "automation_suggestions_userId_entityType_entityId_state_idx" ON "automation_suggestions"("userId", "entityType", "entityId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "automation_execution_logs_operationToken_key" ON "automation_execution_logs"("operationToken");

-- CreateIndex
CREATE INDEX "automation_execution_logs_createdAt_idx" ON "automation_execution_logs"("createdAt");

-- CreateIndex
CREATE INDEX "automation_execution_logs_userId_entityType_entityId_idx" ON "automation_execution_logs"("userId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "automation_execution_step_logs_actionKey_createdAt_idx" ON "automation_execution_step_logs"("actionKey", "createdAt");

-- CreateIndex
CREATE INDEX "automation_execution_step_logs_status_createdAt_idx" ON "automation_execution_step_logs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "automation_execution_step_logs_suggestionId_idx" ON "automation_execution_step_logs"("suggestionId");

-- CreateIndex
CREATE INDEX "automation_execution_step_logs_userId_createdAt_idx" ON "automation_execution_step_logs"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "automation_execution_step_logs_executionLogId_stepOrder_key" ON "automation_execution_step_logs"("executionLogId", "stepOrder");

-- CreateIndex
CREATE UNIQUE INDEX "cases_caseNumber_key" ON "cases"("caseNumber");

-- CreateIndex
CREATE INDEX "case_external_participants_caseId_idx" ON "case_external_participants"("caseId");

-- CreateIndex
CREATE INDEX "case_intake_deadlines_caseId_dueAt_idx" ON "case_intake_deadlines"("caseId", "dueAt");

-- CreateIndex
CREATE INDEX "case_intake_deadlines_responsibleId_dueAt_idx" ON "case_intake_deadlines"("responsibleId", "dueAt");

-- CreateIndex
CREATE INDEX "case_collaborators_caseid_index" ON "case_collaborators"("caseId");

-- CreateIndex
CREATE INDEX "case_collaborators_userid_index" ON "case_collaborators"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "case_collaborators_caseid_userid_key" ON "case_collaborators"("caseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "documents_spItemId_key" ON "documents"("spItemId");

-- CreateIndex
CREATE INDEX "documents_caseId_workStatus_idx" ON "documents"("caseId", "workStatus");

-- CreateIndex
CREATE INDEX "documents_responsibleId_workStatus_idx" ON "documents"("responsibleId", "workStatus");

-- CreateIndex
CREATE INDEX "documents_reviewerId_workStatus_idx" ON "documents"("reviewerId", "workStatus");

-- CreateIndex
CREATE INDEX "documents_dueDate_idx" ON "documents"("dueDate");

-- CreateIndex
CREATE INDEX "document_task_links_taskId_idx" ON "document_task_links"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "document_task_links_documentId_taskId_key" ON "document_task_links"("documentId", "taskId");

-- CreateIndex
CREATE INDEX "document_versions_documentId_currentVersion_idx" ON "document_versions"("documentId", "currentVersion");

-- CreateIndex
CREATE INDEX "document_versions_previousVersionId_idx" ON "document_versions"("previousVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_documentId_version_key" ON "document_versions"("documentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_documentId_id_key" ON "document_versions"("documentId", "id");

-- Additive DB-level integrity enforced by migration
-- 20260723143000_contract_workspace_version_foundation (predates the baseline
-- cut; not representable in schema.prisma, so it must live in the baseline).
-- At most one current version per document.
CREATE UNIQUE INDEX "document_versions_one_current_per_document_key"
    ON "document_versions"("documentId")
    WHERE "currentVersion" = true;

-- CreateIndex
CREATE INDEX "document_annotations_documentId_documentVersionId_status_idx" ON "document_annotations"("documentId", "documentVersionId", "status");

-- CreateIndex
CREATE INDEX "document_annotations_documentVersionId_annotationType_idx" ON "document_annotations"("documentVersionId", "annotationType");

-- CreateIndex
CREATE INDEX "document_annotations_documentVersionId_anchorType_idx" ON "document_annotations"("documentVersionId", "anchorType");

-- CreateIndex
CREATE INDEX "document_annotations_assignedToId_status_idx" ON "document_annotations"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "document_annotations_createdById_status_idx" ON "document_annotations"("createdById", "status");

-- CreateIndex
CREATE INDEX "document_annotations_deletedAt_idx" ON "document_annotations"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "document_annotations_documentVersionId_idempotencyKey_key" ON "document_annotations"("documentVersionId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "document_annotation_comments_annotationId_createdAt_idx" ON "document_annotation_comments"("annotationId", "createdAt");

-- CreateIndex
CREATE INDEX "document_annotation_comments_createdById_idx" ON "document_annotation_comments"("createdById");

-- CreateIndex
CREATE INDEX "document_annotation_events_annotationId_createdAt_idx" ON "document_annotation_events"("annotationId", "createdAt");

-- CreateIndex
CREATE INDEX "document_annotation_events_actorId_createdAt_idx" ON "document_annotation_events"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "document_reviews_documentId_status_idx" ON "document_reviews"("documentId", "status");

-- CreateIndex
CREATE INDEX "document_reviews_documentVersionId_status_idx" ON "document_reviews"("documentVersionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "document_reviews_id_documentVersionId_key" ON "document_reviews"("id", "documentVersionId");

-- CreateIndex
CREATE INDEX "review_snapshots_documentReviewId_createdAt_idx" ON "review_snapshots"("documentReviewId", "createdAt");

-- CreateIndex
CREATE INDEX "review_snapshots_documentVersionId_createdAt_idx" ON "review_snapshots"("documentVersionId", "createdAt");

-- CreateIndex
CREATE INDEX "document_review_suggestions_documentId_status_idx" ON "document_review_suggestions"("documentId", "status");

-- CreateIndex
CREATE INDEX "document_review_suggestions_caseId_createdAt_idx" ON "document_review_suggestions"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "document_review_suggestions_documentId_workspaceSource_idx" ON "document_review_suggestions"("documentId", "workspaceSource");

-- CreateIndex
CREATE INDEX "document_review_suggestions_documentVersionId_idx" ON "document_review_suggestions"("documentVersionId");

-- CreateIndex
CREATE INDEX "document_review_suggestions_authorId_idx" ON "document_review_suggestions"("authorId");

-- CreateIndex
CREATE INDEX "tasks_complexityScore_idx" ON "tasks"("complexityScore");

-- CreateIndex
CREATE INDEX "tasks_maturityStage_idx" ON "tasks"("maturityStage");

-- CreateIndex
CREATE INDEX "tasks_riskScore_idx" ON "tasks"("riskScore");

-- CreateIndex
CREATE INDEX "tasks_stuckReason_idx" ON "tasks"("stuckReason");

-- CreateIndex
CREATE UNIQUE INDEX "task_submissions_idempotencyKey_key" ON "task_submissions"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "task_submissions_supersedesSubmissionId_key" ON "task_submissions"("supersedesSubmissionId");

-- CreateIndex
CREATE INDEX "task_submissions_taskId_status_idx" ON "task_submissions"("taskId", "status");

-- CreateIndex
CREATE INDEX "task_submissions_assignedReviewerId_status_submittedAt_idx" ON "task_submissions"("assignedReviewerId", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "task_submissions_submittedById_status_submittedAt_idx" ON "task_submissions"("submittedById", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "task_submissions_taskId_createdAt_idx" ON "task_submissions"("taskId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "task_submissions_taskId_revisionNumber_key" ON "task_submissions"("taskId", "revisionNumber");

-- Additive DB-level integrity enforced by migration
-- 20260718120000_add_task_submission_workflow (predates the baseline cut; not
-- representable in schema.prisma, so it must live in the baseline).
-- At most one active draft per task.
CREATE UNIQUE INDEX "task_submissions_one_active_draft_per_task_key"
    ON "task_submissions"("taskId")
    WHERE "status" = 'DRAFT';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_submissions_not_self_reviewing_check') THEN
    ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_not_self_reviewing_check"
      CHECK ("submittedById" IS NULL OR "submittedById" <> "assignedReviewerId");
  END IF;
END $$;

-- CreateIndex
CREATE INDEX "task_submission_documents_documentId_idx" ON "task_submission_documents"("documentId");

-- CreateIndex
CREATE INDEX "task_submission_documents_documentVersionId_idx" ON "task_submission_documents"("documentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "task_submission_documents_submissionId_documentId_role_key" ON "task_submission_documents"("submissionId", "documentId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "task_review_decisions_submissionId_key" ON "task_review_decisions"("submissionId");

-- CreateIndex
CREATE INDEX "task_review_decisions_reviewerId_createdAt_idx" ON "task_review_decisions"("reviewerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "task_submission_time_entries_timeEntryId_key" ON "task_submission_time_entries"("timeEntryId");

-- CreateIndex
CREATE INDEX "task_submission_time_entries_submissionId_idx" ON "task_submission_time_entries"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "task_submission_time_entries_submissionId_timeEntryId_key" ON "task_submission_time_entries"("submissionId", "timeEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "client_redaction_profiles_clientId_key" ON "client_redaction_profiles"("clientId");

-- CreateIndex
CREATE INDEX "timeline_events_caseId_createdAt_idx" ON "timeline_events"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE INDEX "legal_analyses_caseId_updatedAt_idx" ON "legal_analyses"("caseId", "updatedAt");

-- CreateIndex
CREATE INDEX "legal_analyses_documentId_updatedAt_idx" ON "legal_analyses"("documentId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "communications_externalMessageId_key" ON "communications"("externalMessageId");

-- CreateIndex
CREATE INDEX "communications_caseId_createdAt_idx" ON "communications"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "communications_clientId_createdAt_idx" ON "communications"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "communications_providerConversationId_idx" ON "communications"("providerConversationId");

-- CreateIndex
CREATE UNIQUE INDEX "communication_attachments_provider_unique_idx" ON "communication_attachments"("communicationId", "providerAttachmentId");

-- CreateIndex
CREATE INDEX "generation_drafts_caseId_idx" ON "generation_drafts"("caseId");

-- CreateIndex
CREATE INDEX "generation_drafts_templateId_idx" ON "generation_drafts"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "generation_drafts_caseId_templateId_key" ON "generation_drafts"("caseId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_review_records_generationId_key" ON "contract_review_records"("generationId");

-- CreateIndex
CREATE INDEX "block_review_notes_reviewRecordId_idx" ON "block_review_notes"("reviewRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "block_review_notes_reviewRecordId_blockKey_key" ON "block_review_notes"("reviewRecordId", "blockKey");

-- CreateIndex
CREATE INDEX "clause_library_items_contractType_clauseKind_idx" ON "clause_library_items"("contractType", "clauseKind");

-- CreateIndex
CREATE INDEX "clause_library_items_representedSide_idx" ON "clause_library_items"("representedSide");

-- CreateIndex
CREATE UNIQUE INDEX "clause_library_items_slug_lawyerProfileId_key" ON "clause_library_items"("slug", "lawyerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "lawyer_profiles_lawyerEmail_key" ON "lawyer_profiles"("lawyerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "lawyer_preferred_clauses_lawyerProfileId_clauseId_key" ON "lawyer_preferred_clauses"("lawyerProfileId", "clauseId");

-- CreateIndex
CREATE INDEX "contract_assembly_drafts_caseId_idx" ON "contract_assembly_drafts"("caseId");

-- CreateIndex
CREATE INDEX "contract_assembly_drafts_lawyerProfileId_idx" ON "contract_assembly_drafts"("lawyerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_assembly_drafts_caseId_contractType_key" ON "contract_assembly_drafts"("caseId", "contractType");

-- CreateIndex
CREATE INDEX "contract_assembly_clauses_assemblyDraftId_idx" ON "contract_assembly_clauses"("assemblyDraftId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_assembly_clauses_assemblyDraftId_clauseId_key" ON "contract_assembly_clauses"("assemblyDraftId", "clauseId");

-- CreateIndex
CREATE INDEX "lawyer_handoff_packages_caseId_status_idx" ON "lawyer_handoff_packages"("caseId", "status");

-- CreateIndex
CREATE INDEX "lawyer_handoff_packages_sourceDocumentId_idx" ON "lawyer_handoff_packages"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "lawyer_handoff_packages_legalAnalysisId_idx" ON "lawyer_handoff_packages"("legalAnalysisId");

-- AddForeignKey
ALTER TABLE "client_house_style_profiles" ADD CONSTRAINT "client_house_style_profiles_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_workgroups" ADD CONSTRAINT "client_workgroups_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workload_records" ADD CONSTRAINT "workload_records_workgroupId_fkey" FOREIGN KEY ("workgroupId") REFERENCES "client_workgroups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matters" ADD CONSTRAINT "matters_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matters" ADD CONSTRAINT "matters_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "matters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_report_artifacts" ADD CONSTRAINT "timesheet_report_artifacts_reportInstanceId_fkey" FOREIGN KEY ("reportInstanceId") REFERENCES "timesheet_report_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_automation_preferences" ADD CONSTRAINT "user_automation_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_automation_suppressions" ADD CONSTRAINT "user_automation_suppressions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_trigger_events" ADD CONSTRAINT "automation_trigger_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_suggestions" ADD CONSTRAINT "automation_suggestions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_execution_logs" ADD CONSTRAINT "automation_execution_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_execution_logs" ADD CONSTRAINT "automation_execution_logs_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "automation_suggestions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_execution_step_logs" ADD CONSTRAINT "automation_execution_step_logs_executionLogId_fkey" FOREIGN KEY ("executionLogId") REFERENCES "automation_execution_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_execution_step_logs" ADD CONSTRAINT "automation_execution_step_logs_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "automation_suggestions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_execution_step_logs" ADD CONSTRAINT "automation_execution_step_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "matters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_assignedLawyerId_fkey" FOREIGN KEY ("assignedLawyerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_external_participants" ADD CONSTRAINT "case_external_participants_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_external_participants" ADD CONSTRAINT "case_external_participants_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_intake_deadlines" ADD CONSTRAINT "case_intake_deadlines_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_intake_deadlines" ADD CONSTRAINT "case_intake_deadlines_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_intake_deadlines" ADD CONSTRAINT "case_intake_deadlines_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_collaborators" ADD CONSTRAINT "case_collaborators_caseid_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_collaborators" ADD CONSTRAINT "case_collaborators_userid_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_workInstructionUpdatedById_fkey" FOREIGN KEY ("workInstructionUpdatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_sourceCommunicationId_fkey" FOREIGN KEY ("sourceCommunicationId") REFERENCES "communications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_task_links" ADD CONSTRAINT "document_task_links_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_task_links" ADD CONSTRAINT "document_task_links_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_task_links" ADD CONSTRAINT "document_task_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_annotations" ADD CONSTRAINT "document_annotations_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_annotations" ADD CONSTRAINT "document_annotations_documentId_documentVersionId_fkey" FOREIGN KEY ("documentId", "documentVersionId") REFERENCES "document_versions"("documentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_annotations" ADD CONSTRAINT "document_annotations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_annotations" ADD CONSTRAINT "document_annotations_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_annotations" ADD CONSTRAINT "document_annotations_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_annotations" ADD CONSTRAINT "document_annotations_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_annotation_comments" ADD CONSTRAINT "document_annotation_comments_annotationId_fkey" FOREIGN KEY ("annotationId") REFERENCES "document_annotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_annotation_comments" ADD CONSTRAINT "document_annotation_comments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_annotation_comments" ADD CONSTRAINT "document_annotation_comments_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_annotation_events" ADD CONSTRAINT "document_annotation_events_annotationId_fkey" FOREIGN KEY ("annotationId") REFERENCES "document_annotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_annotation_events" ADD CONSTRAINT "document_annotation_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_annotation_events" ADD CONSTRAINT "document_annotation_events_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_assignedReviewerId_fkey" FOREIGN KEY ("assignedReviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_snapshots" ADD CONSTRAINT "review_snapshots_documentReviewId_fkey" FOREIGN KEY ("documentReviewId") REFERENCES "document_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_snapshots" ADD CONSTRAINT "review_snapshots_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_snapshots" ADD CONSTRAINT "review_snapshots_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_review_suggestions" ADD CONSTRAINT "document_review_suggestions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_review_suggestions" ADD CONSTRAINT "document_review_suggestions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_review_suggestions" ADD CONSTRAINT "document_review_suggestions_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_review_suggestions" ADD CONSTRAINT "document_review_suggestions_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "matters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sourceCommunicationId_fkey" FOREIGN KEY ("sourceCommunicationId") REFERENCES "communications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_assignedReviewerId_fkey" FOREIGN KEY ("assignedReviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_zeroTimeConfirmedById_fkey" FOREIGN KEY ("zeroTimeConfirmedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_externalCompletedById_fkey" FOREIGN KEY ("externalCompletedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_supersedesSubmissionId_fkey" FOREIGN KEY ("supersedesSubmissionId") REFERENCES "task_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submission_documents" ADD CONSTRAINT "task_submission_documents_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "task_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submission_documents" ADD CONSTRAINT "task_submission_documents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submission_documents" ADD CONSTRAINT "task_submission_documents_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submission_documents" ADD CONSTRAINT "task_submission_documents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_review_decisions" ADD CONSTRAINT "task_review_decisions_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "task_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_review_decisions" ADD CONSTRAINT "task_review_decisions_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submission_time_entries" ADD CONSTRAINT "task_submission_time_entries_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "task_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submission_time_entries" ADD CONSTRAINT "task_submission_time_entries_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignment_history" ADD CONSTRAINT "task_assignment_history_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignment_history" ADD CONSTRAINT "task_assignment_history_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_redaction_profiles" ADD CONSTRAINT "client_redaction_profiles_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anonymous_documents" ADD CONSTRAINT "anonymous_documents_sourceDocId_fkey" FOREIGN KEY ("sourceDocId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_generations" ADD CONSTRAINT "contract_generations_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "contract_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_analyses" ADD CONSTRAINT "legal_analyses_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_attachments" ADD CONSTRAINT "communication_attachments_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "communications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_review_notes" ADD CONSTRAINT "block_review_notes_reviewRecordId_fkey" FOREIGN KEY ("reviewRecordId") REFERENCES "contract_review_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clause_library_items" ADD CONSTRAINT "clause_library_items_lawyerProfileId_fkey" FOREIGN KEY ("lawyerProfileId") REFERENCES "lawyer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lawyer_preferred_clauses" ADD CONSTRAINT "lawyer_preferred_clauses_lawyerProfileId_fkey" FOREIGN KEY ("lawyerProfileId") REFERENCES "lawyer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_assembly_drafts" ADD CONSTRAINT "contract_assembly_drafts_lawyerProfileId_fkey" FOREIGN KEY ("lawyerProfileId") REFERENCES "lawyer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_assembly_clauses" ADD CONSTRAINT "contract_assembly_clauses_assemblyDraftId_fkey" FOREIGN KEY ("assemblyDraftId") REFERENCES "contract_assembly_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_assembly_clauses" ADD CONSTRAINT "contract_assembly_clauses_clauseId_fkey" FOREIGN KEY ("clauseId") REFERENCES "clause_library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lawyer_handoff_packages" ADD CONSTRAINT "lawyer_handoff_packages_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
