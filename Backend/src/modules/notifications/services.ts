import { prisma } from '../../prisma/prisma.service';

export interface NotificationListParams {
  userId: string;
  limit?: number;
  offset?: number;
}

class NotificationsService {
  async listNotifications(params: NotificationListParams) {
    const take = Math.max(1, Math.min(params.limit ?? 50, 100));
    const skip = Math.max(0, params.offset ?? 0);

    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: params.userId },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.notification.count({
        where: { userId: params.userId },
      }),
    ]);

    return { items, total, limit: take, offset: skip };
  }

  async getUnreadCount(userId: string) {
    const unreadCount = await prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { unreadCount };
  }

  async markAsRead(userId: string, notificationId: string) {
    const existing = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (!existing) return null;

    return prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return { updatedCount: result.count };
  }
}

export default new NotificationsService();

