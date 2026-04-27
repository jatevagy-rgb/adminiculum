/**
 * Adminiculum Backend - API Documentation
 * 
 * This file documents the implemented API endpoints.
 * 
 * Base URL: /api/v1
 */

// ============================================================================
// AUTHENTICATION (/auth)
// ============================================================================

/**
 * POST /auth/login
 * - Request: { email, password }
 * - Response: { accessToken, refreshToken, user: { id, name, role } }
 */

/**
 * POST /auth/logout
 * - Requires: Authentication token
 * - Response: { message: "Logged out successfully" }
 */

/**
 * GET /auth/me
 * - Requires: Authentication token
 * - Response: { id, email, name, role }
 */

/**
 * POST /auth/refresh
 * - Request: { refreshToken }
 * - Response: { accessToken }
 */

// ============================================================================
// CASES (/cases)
// ============================================================================

/**
 * GET /cases
 * - Query: ?status, ?assignedTo, ?matterType, ?page, ?limit
 * - Response: { data: CaseListItem[], pagination: { page, limit, total } }
 */

/**
 * GET /cases/:caseId
 * - Response: CaseDetailDTO with timeline and documents
 */

/**
 * POST /cases
 * - Body: { title, clientName, matterType, description? }
 * - Response: { id, caseNumber, status, createdAt }
 */

/**
 * PATCH /cases/:caseId/status
 * - Body: { newStatus, comment? }
 * - Valid statuses: CLIENT_INPUT → DRAFT → IN_REVIEW → APPROVED → SENT_TO_CLIENT → CLIENT_FEEDBACK → FINAL → CLOSED
 * - Response: { id, previousStatus, newStatus, updatedAt }
 */

/**
 * POST /cases/:caseId/assign
 * - Body: { userId, role, message? }
 * - Roles: OWNER_LAWYER, COLLABORATING_LAWYER, TRAINEE, ASSISTANT
 */

/**
 * GET /cases/:caseId/timeline
 * - Response: { data: TimelineEvent[] }
 */

/**
 * GET /cases/:caseId/documents
 * - Response: { data: CaseDocument[] }
 */

// ============================================================================
// DASHBOARD (/dashboard)
// ============================================================================

/**
 * GET /dashboard
 * - Response: { stats, recentActivity }
 */

// ============================================================================
// USERS (/users)
// ============================================================================

/**
 * GET /users
 * - Query: ?role, ?status
 * - Response: { data: UserListItem[] }
 */

/**
 * GET /users/:userId
 * - Response: UserDetailDTO with assignments and skillProfile
 */

/**
 * POST /users
 * - Body: { name, email, role, title?, phone?, hourlyRate? }
 */

/**
 * GET /users/:userId/skills
 * - Response: { userId, skills: { legalAnalysis, drafting, ... } }
 */

/**
 * PATCH /users/:userId/skills
 * - Body: { skills: { legalAnalysis?, drafting?, ... } }
 */

// ============================================================================
// DOCUMENTS (/documents)
// ============================================================================

/**
 * POST /documents (multipart/form-data)
 * - Fields: file, caseId, folder, documentType?
 * - Folders: CLIENT_INPUT, DRAFTS, REVIEW, APPROVED, SENT_TO_CLIENT, CLIENT_FEEDBACK, FINAL, INTERNAL_NOTES
 */

/**
 * POST /documents/:docId/move
 * - Body: { targetFolder, comment? }
 */

/**
 * GET /documents/:docId
 * - Response: CaseDocument with metadata
 */

/**
 * GET /documents/:docId/versions
 * - Response: DocumentVersion[]
 */

// ============================================================================
// CLIENTS (/clients)
// ============================================================================

/**
 * GET /clients
 * - Query: ?search, ?status
 * - Response: { data: ClientListItem[] }
 */

/**
 * GET /clients/:clientId
 * - Response: ClientDetailDTO with cases
 */

// ============================================================================
// MESSAGES (/messages)
// ============================================================================

/**
 * GET /messages
 * - Query: ?caseId, ?type, ?unread
 * - Types: SYSTEM_EVENT, USER_MESSAGE, REVIEW_NOTE
 */

/**
 * POST /messages
 * - Body: { caseId?, type, content }
 */

// ============================================================================
// SETTINGS (/settings)
// ============================================================================

/**
 * GET /settings/ui
 * - Response: UiSettings (theme, language, etc.)
 */

/**
 * PATCH /settings/ui
 * - Body: { theme?, language? }
 */

// ============================================================================
// STATUS CODES
// ============================================================================

/**
 * 200 - OK
 * 201 - Created
 * 400 - Validation Error
 * 401 - Unauthorized
 * 403 - Forbidden
 * 404 - Not Found
 * 500 - Internal Server Error
 */

// ============================================================================
// ERROR RESPONSE FORMAT
// ============================================================================

/**
 * {
 *   status: number,
 *   code: string,
 *   message: string,
 *   details?: any
 * }
 */
