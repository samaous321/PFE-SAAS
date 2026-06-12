export type NotificationTone = 'info' | 'success' | 'warning' | 'danger';

export interface NotificationAction {
  label?: string;
  kind?: string;
  entityId?: string;
  queryParams?: Record<string, string | number | boolean>;
}

export interface AccountNotification {
  _id: string;
  recipientUserId: string;
  tenantId?: string | null;
  type: string;
  title: string;
  message: string;
  tone: NotificationTone;
  iconKey?: string;
  action?: NotificationAction;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
  readAt?: string | null;
  unread?: boolean;
}

export interface NotificationFeedResponse {
  items: AccountNotification[];
  unreadCount: number;
}
