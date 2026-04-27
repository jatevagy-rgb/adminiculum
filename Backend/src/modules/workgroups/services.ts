/**
 * Workgroup Service
 * Client workload tracking business logic
 */

import prisma from '../../prisma/prisma.service';
import type { Prisma, ClientWorkgroup, WorkloadRecord } from '@prisma/client';
import type {
  CreateWorkgroupInput,
  UpdateWorkgroupInput,
  CreateWorkloadInput,
  WorkgroupResponse,
  WorkloadRecordResponse,
  WorkloadSummaryResponse
} from './types';

// ============================================================================
// Validation Helpers
// ============================================================================

export function isValidPeriodFormat(period: string): boolean {
  // YYYY-MM format validation
  const regex = /^\d{4}-(0[1-9]|1[0-2])$/;
  return regex.test(period);
}

export function formatPeriod(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// ============================================================================
// Workgroup CRUD Operations
// ============================================================================

export const workgroupService = {
  /**
   * Create a new workgroup for a client
   */
  async createWorkgroup(clientId: string, input: CreateWorkgroupInput): Promise<WorkgroupResponse> {
    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId }
    });

    if (!client) {
      throw new Error('Client not found');
    }

    const workgroup = await prisma.clientWorkgroup.create({
      data: {
        clientId,
        name: input.name,
        description: input.description || null
      }
    });

    return {
      id: workgroup.id,
      clientId: workgroup.clientId,
      name: workgroup.name,
      description: workgroup.description,
      isActive: workgroup.isActive,
      createdAt: workgroup.createdAt,
      updatedAt: workgroup.updatedAt
    };
  },

  /**
   * Get all workgroups for a client
   */
  async getWorkgroupsByClient(clientId: string): Promise<WorkgroupResponse[]> {
    const workgroups = await prisma.clientWorkgroup.findMany({
      where: {
        clientId,
        isActive: true
      },
      orderBy: { name: 'asc' }
    });

    return workgroups.map((wg: ClientWorkgroup) => ({
      id: wg.id,
      clientId: wg.clientId,
      name: wg.name,
      description: wg.description,
      isActive: wg.isActive,
      createdAt: wg.createdAt,
      updatedAt: wg.updatedAt
    }));
  },

  /**
   * Get a single workgroup by ID
   */
  async getWorkgroupById(workgroupId: string): Promise<WorkgroupResponse | null> {
    const workgroup = await prisma.clientWorkgroup.findUnique({
      where: { id: workgroupId }
    });

    if (!workgroup) {
      return null;
    }

    return {
      id: workgroup.id,
      clientId: workgroup.clientId,
      name: workgroup.name,
      description: workgroup.description,
      isActive: workgroup.isActive,
      createdAt: workgroup.createdAt,
      updatedAt: workgroup.updatedAt
    };
  },

  /**
   * Update a workgroup
   */
  async updateWorkgroup(workgroupId: string, input: UpdateWorkgroupInput): Promise<WorkgroupResponse> {
    const workgroup = await prisma.clientWorkgroup.update({
      where: { id: workgroupId },
      data: {
        name: input.name,
        description: input.description,
        isActive: input.isActive
      }
    });

    return {
      id: workgroup.id,
      clientId: workgroup.clientId,
      name: workgroup.name,
      description: workgroup.description,
      isActive: workgroup.isActive,
      createdAt: workgroup.createdAt,
      updatedAt: workgroup.updatedAt
    };
  },

  /**
   * Soft delete a workgroup (set isActive = false)
   */
  async deleteWorkgroup(workgroupId: string): Promise<void> {
    await prisma.clientWorkgroup.update({
      where: { id: workgroupId },
      data: { isActive: false }
    });
  }
};

// ============================================================================
// Workload Recording Operations
// ============================================================================

export const workloadService = {
  /**
   * Record workload for a workgroup (upsert - overwrite if exists)
   */
  async recordWorkload(workgroupId: string, input: CreateWorkloadInput): Promise<WorkloadRecordResponse> {
    // Validate period format
    if (!isValidPeriodFormat(input.period)) {
      throw new Error('Invalid period format. Expected YYYY-MM');
    }

    // Verify workgroup exists
    const workgroup = await prisma.clientWorkgroup.findUnique({
      where: { id: workgroupId }
    });

    if (!workgroup) {
      throw new Error('Workgroup not found');
    }

    const record = await prisma.workloadRecord.upsert({
      where: {
        workgroupId_period: {
          workgroupId,
          period: input.period
        }
      },
      update: {
        reportedHours: input.reportedHours,
        note: input.note || null
      },
      create: {
        workgroupId,
        period: input.period,
        reportedHours: input.reportedHours,
        note: input.note || null
      }
    });

    return {
      id: record.id,
      workgroupId: record.workgroupId,
      period: record.period,
      reportedHours: record.reportedHours,
      note: record.note,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  },

  /**
   * Get workload records for a workgroup
   */
  async getWorkloadByWorkgroup(workgroupId: string): Promise<WorkloadRecordResponse[]> {
    const records = await prisma.workloadRecord.findMany({
      where: { workgroupId },
      orderBy: { period: 'desc' }
    });

    return records.map((r: WorkloadRecord) => ({
      id: r.id,
      workgroupId: r.workgroupId,
      period: r.period,
      reportedHours: r.reportedHours,
      note: r.note,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));
  },

  /**
   * Get workload summary for a client and period
   */
  async getClientWorkloadSummary(clientId: string, period: string): Promise<WorkloadSummaryResponse> {
    // Validate period format
    if (!isValidPeriodFormat(period)) {
      throw new Error('Invalid period format. Expected YYYY-MM');
    }

    // Get all active workgroups for the client
    const workgroups = await prisma.clientWorkgroup.findMany({
      where: {
        clientId,
        isActive: true
      },
      select: {
        id: true,
        name: true
      }
    });

    // Get workload records for the period
    const workloadRecords = await prisma.workloadRecord.findMany({
      where: {
        workgroupId: { in: workgroups.map((w: { id: string }) => w.id) },
        period
      }
    });

    // Build aggregation map
    const aggregationMap = new Map<string, { name: string; hours: number }>();
    
    // Initialize all workgroups with 0 hours
    workgroups.forEach((wg: { id: string; name: string }) => {
      aggregationMap.set(wg.id, { name: wg.name, hours: 0 });
    });

    // Sum up hours for each workgroup
    workloadRecords.forEach((record: WorkloadRecord) => {
      const existing = aggregationMap.get(record.workgroupId);
      if (existing) {
        existing.hours += record.reportedHours;
      }
    });

    // Calculate total hours
    const aggregations: { workgroupId: string; workgroupName: string; totalHours: number }[] = 
      Array.from(aggregationMap.entries()).map(([id, data]) => ({
        workgroupId: id,
        workgroupName: data.name,
        totalHours: data.hours
      }));

    const totalHours = aggregations.reduce((sum, agg) => sum + agg.totalHours, 0);

    // Calculate percentages
    const workgroupsWithPercentage = aggregations.map(agg => ({
      id: agg.workgroupId,
      name: agg.workgroupName,
      hours: agg.totalHours,
      percentage: totalHours > 0 ? Math.round((agg.totalHours / totalHours) * 1000) / 10 : 0
    }));

    return {
      clientId,
      period,
      totalHours: Math.round(totalHours * 10) / 10,
      workgroups: workgroupsWithPercentage
    };
  }
};

export default {
  workgroupService,
  workloadService,
  isValidPeriodFormat,
  formatPeriod
};
