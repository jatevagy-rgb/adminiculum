import { prisma } from '../prisma/prisma.service';

class AuditService {
  async logAction(
    userId: string | null | undefined,
    action: string,
    entityType: string,
    entityId?: string | null,
    metadata?: Record<string, unknown> | null
  ) {
    return prisma.auditLog.create({
      data: {
        userId: userId ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        metadata: (metadata ?? null) as any,
      },
    });
  }
}

export default new AuditService();
