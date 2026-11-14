/**
 * In-App Notifications API
 * In-app notifications inbox integrated with backend PostgreSQL notifications.
 */
import { request } from './client';
import { getCachedData, setCachedData } from '../storage/cache';

export interface CustomerNotificationItem {
  id: string;
  organizationId: string;
  customerId: string;
  title: string;
  message: string;
  type: string;
  metadata: Record<string, any>;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  customerId: string;
  unreadCount: number;
  notifications: CustomerNotificationItem[];
}

export const notificationsApi = {
  async getNotifications(
    customerId: string
  ): Promise<{ data: NotificationsResponse; fromCache: boolean; syncedAt: string }> {
    const cacheKey = `notifs_${customerId}`;

    try {
      const raw = await request<any>(`/customers/${customerId}/notifications`, {
        method: 'GET',
      });
      const notifications: CustomerNotificationItem[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.notifications)
        ? raw.notifications
        : [];
      const unreadCount = Array.isArray(raw)
        ? notifications.filter(n => !n.isRead).length
        : typeof raw?.unreadCount === 'number'
        ? raw.unreadCount
        : 0;

      const data: NotificationsResponse = {
        customerId,
        unreadCount,
        notifications,
      };
      await setCachedData(cacheKey, data);
      return {
        data,
        fromCache: false,
        syncedAt: new Date().toISOString(),
      };
    } catch (err) {
      const cached = await getCachedData<NotificationsResponse>(cacheKey);
      if (cached) {
        return {
          data: cached.data,
          fromCache: true,
          syncedAt: cached.syncedAt,
        };
      }
      throw err;
    }
  },

  async markAsRead(customerId: string, notificationId: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(
      `/customers/${customerId}/notifications/${notificationId}/read`,
      {
        method: 'PATCH',
      }
    );
  },

  async markAllAsRead(customerId: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/customers/${customerId}/notifications/read-all`, {
      method: 'POST',
    });
  },
};
