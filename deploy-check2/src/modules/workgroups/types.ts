/**
 * Workgroup Module Types
 * Client workload tracking module
 */

// ============================================================================
// Request/Response Types
// ============================================================================

export interface CreateWorkgroupInput {
  name: string;
  description?: string;
}

export interface UpdateWorkgroupInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface CreateWorkloadInput {
  period: string;        // YYYY-MM format
  reportedHours: number; // Decimal/Float
  note?: string;
}

export interface WorkgroupResponse {
  id: string;
  clientId: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkloadRecordResponse {
  id: string;
  workgroupId: string;
  period: string;
  reportedHours: number;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkloadSummaryItem {
  id: string;
  name: string;
  hours: number;
  percentage: number;
}

export interface WorkloadSummaryResponse {
  clientId: string;
  period: string;
  totalHours: number;
  workgroups: WorkloadSummaryItem[];
}

// ============================================================================
// Service Types
// ============================================================================

export interface WorkgroupWithRecords extends WorkgroupResponse {
  workloadRecords?: WorkloadRecordResponse[];
}

export interface WorkloadAggregation {
  workgroupId: string;
  workgroupName: string;
  totalHours: number;
}
