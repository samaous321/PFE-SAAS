import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AccountNotification, NotificationFeedResponse, NotificationTone } from '../models/notification.model';
import { AuthStorageService } from './auth-storage.service';
import { NotificationService as ToastNotificationService } from './notification.service';

@Injectable({ providedIn: 'root' })
export class NotificationFeedService {
  private readonly http = inject(HttpClient);
  private readonly authStorage = inject(AuthStorageService);
  private readonly zone = inject(NgZone);
  private readonly toast = inject(ToastNotificationService);

  private readonly itemsSubject = new BehaviorSubject<AccountNotification[]>([]);
  private readonly unreadCountSubject = new BehaviorSubject<number>(0);
  private readonly connectedSubject = new BehaviorSubject<boolean>(false);

  private initialized = false;
  private stream: EventSource | null = null;
  private activeToken: string | null = null;

  readonly items$ = this.itemsSubject.asObservable();
  readonly unreadCount$ = this.unreadCountSubject.asObservable();
  readonly connected$ = this.connectedSubject.asObservable();

  ensureReady(): void {
    const token = this.authStorage.getToken();

    if (!token) {
      this.reset();
      return;
    }

    if (token !== this.activeToken) {
      this.reset();
      this.activeToken = token;
    }

    if (this.initialized) {
      if (!this.stream) {
        this.connect();
      }
      return;
    }

    this.initialized = true;
    this.refresh();
    this.connect();
  }

  refresh(limit: number = 24, weeks: number = 8): void {
    if (!this.authStorage.hasToken()) {
      return;
    }

    this.http
      .get<NotificationFeedResponse>(`${environment.apiBaseUrl}/api/notifications?limit=${limit}&weeks=${weeks}`)
      .subscribe({
        next: (response) => {
          this.itemsSubject.next(this.sortNotifications(response.items || []));
          this.unreadCountSubject.next(response.unreadCount || 0);
        },
        error: () => {
          this.connectedSubject.next(false);
        }
      });
  }

  markAllAsRead(): void {
    if (!this.authStorage.hasToken() || this.unreadCountSubject.value === 0) {
      return;
    }

    this.http.patch<{ success: boolean }>(`${environment.apiBaseUrl}/api/notifications/read-all`, {}).subscribe({
      next: () => {
        const now = new Date().toISOString();
        const items = this.itemsSubject.value.map((item) => ({
          ...item,
          readAt: item.readAt || now,
          unread: false
        }));
        this.itemsSubject.next(items);
        this.unreadCountSubject.next(0);
      }
    });
  }

  markAsRead(notificationId: string): void {
    if (!notificationId) {
      return;
    }

    this.http
      .patch<{ success: boolean; item: AccountNotification }>(
        `${environment.apiBaseUrl}/api/notifications/${notificationId}/read`,
        {}
      )
      .subscribe({
        next: () => {
          const items = this.itemsSubject.value.map((item) =>
            item._id === notificationId
              ? {
                  ...item,
                  readAt: item.readAt || new Date().toISOString(),
                  unread: false
                }
              : item
          );
          this.itemsSubject.next(items);
          this.unreadCountSubject.next(items.filter((item) => !item.readAt).length);
        }
      });
  }

  private connect(): void {
    const token = this.authStorage.getToken();
    if (!token || this.stream) {
      if (!token) {
        console.warn("[NotificationFeed] No access token found");
      }
      return;
    }

    const streamUrl = `${environment.apiBaseUrl}/api/notifications/stream?token=${encodeURIComponent(token)}`;
    console.log("[NotificationFeed] Connecting to EventSource:", streamUrl.split('?')[0] + '?token=***');
    
    this.stream = new EventSource(streamUrl);

    this.stream.addEventListener('connected', () => {
      console.log("[NotificationFeed] Connected to server");
      this.zone.run(() => {
        this.connectedSubject.next(true);
      });
    });

    this.stream.addEventListener('notification', (event) => {
      const messageEvent = event as MessageEvent<string>;

      this.zone.run(() => {
        try {
          const notification = JSON.parse(messageEvent.data) as AccountNotification;
          console.log("[NotificationFeed] Received notification:", {
            id: notification._id,
            type: notification.type,
            title: notification.title,
            tone: notification.tone
          });
          this.handleIncomingNotification(notification);
        } catch (error) {
          console.error("[NotificationFeed] Failed to parse notification:", error, messageEvent.data);
          this.connectedSubject.next(false);
        }
      });
    });

    this.stream.onerror = () => {
      console.warn("[NotificationFeed] EventSource error, disconnecting");
      this.zone.run(() => {
        this.connectedSubject.next(false);
      });
      this.stream?.close();
      this.stream = null;
      
      // Attempt to reconnect after delay
      setTimeout(() => {
        console.log("[NotificationFeed] Attempting to reconnect...");
        this.connect();
      }, 5000);
    };
  }

  private reset(): void {
    if (this.stream) {
      this.stream.close();
      this.stream = null;
    }

    this.initialized = false;
    this.activeToken = null;
    this.itemsSubject.next([]);
    this.unreadCountSubject.next(0);
    this.connectedSubject.next(false);
  }

  private handleIncomingNotification(notification: AccountNotification): void {
    if (!notification?._id) {
      console.warn("[NotificationFeed] Received notification without ID");
      return;
    }

    console.log("[NotificationFeed] Processing incoming notification:", notification._id);

    const current = this.itemsSubject.value.filter((item) => item._id !== notification._id);
    const next = this.sortNotifications([
      {
        ...notification,
        unread: !notification.readAt
      },
      ...current
    ]).slice(0, 50);

    this.itemsSubject.next(next);
    this.unreadCountSubject.next(next.filter((item) => !item.readAt).length);
    this.connectedSubject.next(true);
    console.log("[NotificationFeed] Updated notification list, showing toast");
    this.showToast(notification);
  }

  private sortNotifications(items: AccountNotification[]): AccountNotification[] {
    return [...items].sort(
      (left, right) =>
        new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
    );
  }

  private showToast(notification: AccountNotification): void {
    const title = notification.title || 'Notification';
    const message = notification.message || 'Nouvelle activite.';
    const tone = notification.tone || 'info';

    console.log("[NotificationFeed] Showing toast:", { title, message, tone });

    if (tone === 'success') {
      this.toast.success(message, title);
      return;
    }

    if (tone === 'warning') {
      this.toast.warning(message, title);
      return;
    }

    if (tone === 'danger') {
      this.toast.error(message, title);
      return;
    }

    this.toast.info(message, title);
  }
}
