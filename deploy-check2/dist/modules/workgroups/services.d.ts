/**
 * Workgroup Service
 * Client workload tracking business logic
 */
import type { CreateWorkgroupInput, UpdateWorkgroupInput, CreateWorkloadInput, WorkgroupResponse, WorkloadRecordResponse, WorkloadSummaryResponse } from './types';
export declare function isValidPeriodFormat(period: string): boolean;
export declare function formatPeriod(date?: Date): string;
export declare const workgroupService: {
    /**
     * Create a new workgroup for a client
     */
    createWorkgroup(clientId: string, input: CreateWorkgroupInput): Promise<WorkgroupResponse>;
    /**
     * Get all workgroups for a client
     */
    getWorkgroupsByClient(clientId: string): Promise<WorkgroupResponse[]>;
    /**
     * Get a single workgroup by ID
     */
    getWorkgroupById(workgroupId: string): Promise<WorkgroupResponse | null>;
    /**
     * Update a workgroup
     */
    updateWorkgroup(workgroupId: string, input: UpdateWorkgroupInput): Promise<WorkgroupResponse>;
    /**
     * Soft delete a workgroup (set isActive = false)
     */
    deleteWorkgroup(workgroupId: string): Promise<void>;
};
export declare const workloadService: {
    /**
     * Record workload for a workgroup (upsert - overwrite if exists)
     */
    recordWorkload(workgroupId: string, input: CreateWorkloadInput): Promise<WorkloadRecordResponse>;
    /**
     * Get workload records for a workgroup
     */
    getWorkloadByWorkgroup(workgroupId: string): Promise<WorkloadRecordResponse[]>;
    /**
     * Get workload summary for a client and period
     */
    getClientWorkloadSummary(clientId: string, period: string): Promise<WorkloadSummaryResponse>;
};
declare const _default: {
    workgroupService: {
        /**
         * Create a new workgroup for a client
         */
        createWorkgroup(clientId: string, input: CreateWorkgroupInput): Promise<WorkgroupResponse>;
        /**
         * Get all workgroups for a client
         */
        getWorkgroupsByClient(clientId: string): Promise<WorkgroupResponse[]>;
        /**
         * Get a single workgroup by ID
         */
        getWorkgroupById(workgroupId: string): Promise<WorkgroupResponse | null>;
        /**
         * Update a workgroup
         */
        updateWorkgroup(workgroupId: string, input: UpdateWorkgroupInput): Promise<WorkgroupResponse>;
        /**
         * Soft delete a workgroup (set isActive = false)
         */
        deleteWorkgroup(workgroupId: string): Promise<void>;
    };
    workloadService: {
        /**
         * Record workload for a workgroup (upsert - overwrite if exists)
         */
        recordWorkload(workgroupId: string, input: CreateWorkloadInput): Promise<WorkloadRecordResponse>;
        /**
         * Get workload records for a workgroup
         */
        getWorkloadByWorkgroup(workgroupId: string): Promise<WorkloadRecordResponse[]>;
        /**
         * Get workload summary for a client and period
         */
        getClientWorkloadSummary(clientId: string, period: string): Promise<WorkloadSummaryResponse>;
    };
    isValidPeriodFormat: typeof isValidPeriodFormat;
    formatPeriod: typeof formatPeriod;
};
export default _default;
//# sourceMappingURL=services.d.ts.map