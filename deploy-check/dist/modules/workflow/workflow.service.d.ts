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
import { WorkflowStatus, WorkflowGraph, StatusChangeInput, StatusChangeResult } from './workflow.types';
export declare class WorkflowService {
    /**
     * Ellenőrzi, hogy egy státusz átmenet megengedett-e
     */
    isValidTransition(fromStatus: WorkflowStatus, toStatus: WorkflowStatus): boolean;
    /**
     * Validálja a státusz értéket
     */
    isValidStatus(status: string): status is WorkflowStatus;
    /**
     * Ellenőrzi, hogy a case átvihető-e adott státuszba
     */
    canTransition(caseId: string, toStatus: WorkflowStatus): Promise<{
        allowed: boolean;
        currentStatus: WorkflowStatus;
        reason?: string;
    }>;
    /**
     * Ellenőrzi, hogy a user role-ja engedélyezi-e a státuszváltást
     */
    canUserTransition(userRole: string, toStatus: WorkflowStatus): {
        allowed: boolean;
        reason?: string;
    };
    /**
     * Státuszváltás végrehajtása - TRANSACTION-SAFE
     *
     * Role-based guard + retry logika
     */
    changeStatus(input: StatusChangeInput): Promise<StatusChangeResult>;
    /**
     * Visszaadja a workflow graph-ot egy case-hez
     * Ezt használja a frontend a "térkép" megjelenítésére
     */
    getWorkflowGraph(caseId: string): Promise<WorkflowGraph | null>;
    /**
     * Visszaadja a case workflow történetét
     */
    getWorkflowHistory(caseId: string): Promise<Array<{
        eventType: string;
        fromStatus?: string;
        toStatus?: string;
        comment?: string;
        userId?: string;
        createdAt: Date;
    }>>;
    /**
     * Visszaadja a workflow statisztikákat
     */
    getWorkflowStats(): Promise<{
        totalCases: number;
        byStatus: Record<string, number>;
    }>;
}
export declare const workflowService: WorkflowService;
export default workflowService;
//# sourceMappingURL=workflow.service.d.ts.map