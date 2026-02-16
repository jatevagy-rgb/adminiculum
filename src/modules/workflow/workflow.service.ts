/**
 * Workflow Service - Case Workflow Engine v1
 * 
 * Központi workflow motor, amely kezeli:
 * - Státusz átmenetek validálása
 * - Timeline event létrehozás
 * - Dokumentumok mozgatása SharePoint-ban
 * - Adatbázis szinkronizálás
 * 
 * Transaction-safe implementáció:
 * - Prisma transaction a DB műveletekhez
 * - SharePoint move retry logikával (3 próbálkozás, exponential backoff)
 * - Hibák logolása a trace-elhetőség érdekében
 */

import { prisma } from '../../prisma/prisma.service';
import { driveService } from '../sharepoint';
import {
  WorkflowStatus,
  WORKFLOW_STATUSES,
  STATUS_TO_FOLDER,
  ALLOWED_TRANSITIONS,
  STATUS_LABELS,
  WorkflowGraph,
  WorkflowNode,
  WorkflowEdge,
  StatusChangeInput,
  StatusChangeResult,
  UserRole,
  ROLE_ALLOWED_TRANSITIONS
} from './workflow.types';

// ============================================================================
// Retry Helper (Exponential Backoff)
// ============================================================================

async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      if (attempt >= retries) {
        console.error(`[Workflow] Retry failed after ${attempt} attempts:`, error.message);
        throw error;
      }
      const wait = delayMs * 2 ** (attempt - 1); // exponential backoff
      console.warn(`[Workflow] Retry ${attempt}/${retries} after ${wait}ms due to:`, error.message);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

// ============================================================================
// Workflow Service Class
// ============================================================================

export class WorkflowService {
  
  // ==========================================================================
  // Status Validation
  // ==========================================================================

  /**
   * Ellenőrzi, hogy egy státusz átmenet megengedett-e
   */
  isValidTransition(fromStatus: WorkflowStatus, toStatus: WorkflowStatus): boolean {
    const allowed = ALLOWED_TRANSITIONS[fromStatus];
    return allowed.includes(toStatus);
  }

  /**
   * Validálja a státusz értéket
   */
  isValidStatus(status: string): status is WorkflowStatus {
    return WORKFLOW_STATUSES.includes(status as WorkflowStatus);
  }

  /**
   * Ellenőrzi, hogy a case átvihető-e adott státuszba
   */
  async canTransition(caseId: string, toStatus: WorkflowStatus): Promise<{
    allowed: boolean;
    currentStatus: WorkflowStatus;
    reason?: string;
  }> {
    const caseData = await prisma.case.findUnique({
      where: { id: caseId }
    });

    if (!caseData) {
      return { allowed: false, currentStatus: 'CLIENT_INPUT', reason: 'Case not found' };
    }

    const currentStatus = caseData.status as WorkflowStatus;

    if (currentStatus === toStatus) {
      return { allowed: false, currentStatus, reason: 'Same status' };
    }

    if (!this.isValidTransition(currentStatus, toStatus)) {
      return { 
        allowed: false, 
        currentStatus, 
        reason: `Cannot transition from ${currentStatus} to ${toStatus}` 
      };
    }

    return { allowed: true, currentStatus };
  }

  /**
   * Ellenőrzi, hogy a user role-ja engedélyezi-e a státuszváltást
   */
  canUserTransition(userRole: string, toStatus: WorkflowStatus): {
    allowed: boolean;
    reason?: string;
  } {
    const allowedStatuses = ROLE_ALLOWED_TRANSITIONS[userRole as UserRole];
    
    if (!allowedStatuses) {
      return { allowed: false, reason: `Unknown user role: ${userRole}` };
    }

    if (!allowedStatuses.includes(toStatus)) {
      return { 
        allowed: false, 
        reason: `User role '${userRole}' cannot transition to '${toStatus}'. Allowed: ${allowedStatuses.join(', ')}` 
      };
    }

    return { allowed: true };
  }

  // ==========================================================================
  // Status Change Handler (CORE FUNCTION)
  // ==========================================================================

  /**
   * Státuszváltás végrehajtása - TRANSACTION-SAFE
   * 
   * Role-based guard + retry logika
   */
  async changeStatus(input: StatusChangeInput): Promise<StatusChangeResult> {
    const { caseId, fromStatus, toStatus, userId, comment } = input;

    console.log(`[Workflow] Starting status change: ${caseId} ${fromStatus} -> ${toStatus}`);

    try {
      // 1. Get user and case data
      const [user, caseData] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId } }),
        prisma.case.findUnique({ where: { id: caseId } })
      ]);

      if (!user) {
        return {
          success: false,
          caseId,
          fromStatus,
          toStatus,
          documentsMoved: 0,
          error: 'User not found'
        };
      }

      if (!caseData) {
        return {
          success: false,
          caseId,
          fromStatus,
          toStatus,
          documentsMoved: 0,
          error: 'Case not found'
        };
      }

      // 2. Role-based guard
      const roleCheck = this.canUserTransition(user.role, toStatus);
      if (!roleCheck.allowed) {
        console.warn(`[Workflow] Role guard blocked: ${user.role} -> ${toStatus}`);
        return {
          success: false,
          caseId,
          fromStatus,
          toStatus,
          documentsMoved: 0,
          error: roleCheck.reason
        };
      }

      // 3. Workflow transition guard
      const validation = await this.canTransition(caseId, toStatus);
      if (!validation.allowed) {
        return {
          success: false,
          caseId,
          fromStatus,
          toStatus,
          documentsMoved: 0,
          error: validation.reason
        };
      }

      const targetFolder = STATUS_TO_FOLDER[toStatus];
      const caseNumber = caseData.caseNumber;
      const currentFolderPath = caseData.spFolderPath || `/Cases/${caseNumber}`;

      // 3. Get documents to move
      const documentsToMove = await prisma.document.findMany({
        where: { caseId, spItemId: { not: null } }
      });

      // 4. Run Prisma transaction for DB operations
      await prisma.$transaction(async (tx) => {
        // 4a. Update case status
        await tx.case.update({
          where: { id: caseId },
          data: { status: toStatus as any }
        });
        console.log(`[Workflow] DB: Case ${caseId} status updated to ${toStatus}`);

        // 4b. Create STATUS_CHANGED timeline event
        await tx.timelineEvent.create({
          data: {
            caseId,
            userId,
            eventType: 'CASE_STATUS_CHANGED',
            description: `Status changed from ${fromStatus} to ${toStatus}`,
            metadata: {
              fromStatus,
              toStatus,
              comment,
              folder: targetFolder
            }
          }
        });
        console.log(`[Workflow] DB: TimelineEvent created for status change`);
      });

      // 5. Move documents in SharePoint (outside transaction, with retry)
      let documentsMoved = 0;
      const spMoveErrors: string[] = [];

      for (const doc of documentsToMove) {
        try {
          await withRetry(async () => {
            if (doc.spItemId) {
              await driveService.moveFile(doc.spItemId, `${currentFolderPath}/${targetFolder}`);
              console.log(`[Workflow] SP: Moved document ${doc.id} to ${targetFolder}`);
            }
          }, 3, 500);

          // Update document metadata in DB
          await prisma.document.update({
            where: { id: doc.id },
            data: {
              spParentPath: `${currentFolderPath}/${targetFolder}`
            }
          });

          // Create DOCUMENT_MOVED timeline event
          await prisma.timelineEvent.create({
            data: {
              caseId,
              userId,
              documentId: doc.id,
              eventType: 'DOCUMENT_VERSION_CREATED',
              description: `Document moved to ${targetFolder}`,
              metadata: {
                documentId: doc.id,
                documentName: doc.name,
                fromFolder: STATUS_TO_FOLDER[fromStatus],
                toFolder: targetFolder
              }
            }
          });

          documentsMoved++;
        } catch (docError: any) {
          const errorMsg = `Failed to move document ${doc.id}: ${docError.message}`;
          console.error(`[Workflow] ERROR: ${errorMsg}`);
          spMoveErrors.push(errorMsg);
          // Continue with other documents - this document will be out of sync
        }
      }

      // 6. Handle SharePoint failures
      if (spMoveErrors.length > 0) {
        // Log failure as a timeline event for visibility
        await prisma.timelineEvent.create({
          data: {
            caseId,
            userId,
            eventType: 'CASE_STATUS_CHANGED',
            description: `Status changed but ${spMoveErrors.length} document(s) failed to move`,
            metadata: {
              fromStatus,
              toStatus,
              comment,
              folder: targetFolder,
              spMoveErrors
            }
          }
        });
      }

      console.log(`[Workflow] Completed: ${caseId} ${fromStatus} -> ${toStatus}, moved ${documentsMoved} documents`);

      return {
        success: spMoveErrors.length === 0,
        caseId,
        fromStatus,
        toStatus,
        documentsMoved,
        error: spMoveErrors.length > 0 ? `Partial failure: ${spMoveErrors.length} documents failed to move` : undefined
      };

    } catch (error: any) {
      console.error('[Workflow] CRITICAL ERROR in changeStatus:', error);
      
      // Create failure event
      try {
        await prisma.timelineEvent.create({
          data: {
            caseId,
            userId,
            eventType: 'CASE_STATUS_CHANGED',
            description: `Status change FAILED: ${error.message}`,
            metadata: {
              fromStatus,
              toStatus,
              error: error.message
            }
          }
        });
      } catch (eventError) {
        console.error('[Workflow] Failed to create failure event:', eventError);
      }

      return {
        success: false,
        caseId,
        fromStatus,
        toStatus,
        documentsMoved: 0,
        error: error.message
      };
    }
  }

  // ==========================================================================
  // Workflow Graph (for visualization)
  // ==========================================================================

  /**
   * Visszaadja a workflow graph-ot egy case-hez
   * Ezt használja a frontend a "térkép" megjelenítésére
   */
  async getWorkflowGraph(caseId: string): Promise<WorkflowGraph | null> {
    const caseData = await prisma.case.findUnique({
      where: { id: caseId }
    });

    if (!caseData) return null;

    const currentStatus = caseData.status as WorkflowStatus;

    // Build nodes
    const nodes: WorkflowNode[] = WORKFLOW_STATUSES.map((status) => {
      const statusIndex = WORKFLOW_STATUSES.indexOf(status);
      const currentIndex = WORKFLOW_STATUSES.indexOf(currentStatus);

      let nodeStatus: 'completed' | 'current' | 'pending' = 'pending';

      if (status === currentStatus) {
        nodeStatus = 'current';
      } else if (statusIndex < currentIndex) {
        nodeStatus = 'completed';
      }

      return {
        id: status,
        label: STATUS_LABELS[status],
        status: nodeStatus
      };
    });

    // Build edges (only show valid transitions from current status)
    const edges: WorkflowEdge[] = [];
    const currentIndex = WORKFLOW_STATUSES.indexOf(currentStatus);

    for (let i = 0; i < currentIndex; i++) {
      const from = WORKFLOW_STATUSES[i];
      const allowedNext = ALLOWED_TRANSITIONS[from];
      
      for (const to of allowedNext) {
        if (WORKFLOW_STATUSES.indexOf(to) <= currentIndex) {
          edges.push({ from, to });
        }
      }
    }

    // Add possible transitions from current status
    const possibleTransitions = ALLOWED_TRANSITIONS[currentStatus];

    return {
      nodes,
      edges,
      currentStatus,
      possibleTransitions
    };
  }

  // ==========================================================================
  // Workflow History
  // ==========================================================================

  /**
   * Visszaadja a case workflow történetét
   */
  async getWorkflowHistory(caseId: string): Promise<Array<{
    eventType: string;
    fromStatus?: string;
    toStatus?: string;
    comment?: string;
    userId?: string;
    createdAt: Date;
  }>> {
    const events = await prisma.timelineEvent.findMany({
      where: { 
        caseId,
        eventType: { in: ['CASE_CREATED', 'CASE_STATUS_CHANGED'] }
      },
      orderBy: { createdAt: 'asc' }
    });

    return events.map((e: any) => ({
      eventType: e.eventType,
      fromStatus: e.metadata?.fromStatus,
      toStatus: e.metadata?.toStatus,
      comment: e.metadata?.comment,
      userId: e.userId,
      createdAt: e.createdAt
    }));
  }

  // ==========================================================================
  // Workflow Statistics
  // ==========================================================================

  /**
   * Visszaadja a workflow statisztikákat
   */
  async getWorkflowStats(): Promise<{
    totalCases: number;
    byStatus: Record<string, number>;
  }> {
    const [totalCases, ...statusCounts] = await Promise.all([
      prisma.case.count(),
      ...WORKFLOW_STATUSES.map((status) => 
        prisma.case.count({ where: { status: status as any } })
      )
    ]);

    const byStatus: Record<string, number> = {};
    WORKFLOW_STATUSES.forEach((status, index) => {
      byStatus[status] = statusCounts[index];
    });

    return { totalCases, byStatus };
  }
}

// ============================================================================
// Export
// ============================================================================

export const workflowService = new WorkflowService();
export default workflowService;
