import { prisma } from '../../prisma/prisma.service';

export interface NotificationListParams {
  userId: string;
  limit?: number;
  offset?: number;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
  clientColorKey: null;
}

type NotificationRow = {
  id: string;
  type: unknown;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: Date;
};

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  message: true,
  link: true,
  isRead: true,
  createdAt: true,
} as const;

function mapNotification(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    type: String(row.type),
    title: row.title,
    message: row.message,
    link: row.link,
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString(),
    clientColorKey: null,
  };
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
        select: notificationSelect,
      }),
      prisma.notification.count({
        where: { userId: params.userId },
      }),
    ]);

    return { items: (items as NotificationRow[]).map(mapNotification), total, limit: take, offset: skip };
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
      select: { id: true, isRead: true },
    });

    if (!existing) return null;

    const row = existing.isRead
      ? await prisma.notification.findUnique({
          where: { id: notificationId },
          select: notificationSelect,
        })
      : await prisma.notification.update({
          where: { id: notificationId },
          data: { isRead: true },
          select: notificationSelect,
        });

    return row ? mapNotification(row as NotificationRow) : null;
  }

  async markAllAsRead(userId: string) {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return { updatedCount: result.count };
  }

  buildDeadlineNotificationPreview(params: {
    userId: string;
    deadlineId: string;
    urgency: 'OVERDUE' | 'TODAY' | 'TOMORROW' | 'THIS_WEEK' | 'LATER';
    href: string;
  }) {
    return {
      userId: params.userId,
      dedupeKey: `deadline:${params.deadlineId}:${params.urgency}`,
      type: params.urgency === 'OVERDUE' ? 'TASK_OVERDUE' : 'TASK_DUE_SOON',
      title: params.urgency === 'OVERDUE' ? 'Lejárt határidős tétel' : 'Közelgő határidős tétel',
      message: 'Egy hozzád rendelt belső határidős tétel figyelmet igényel.',
      link: params.href,
    };
  }
}

export default new NotificationsService();
