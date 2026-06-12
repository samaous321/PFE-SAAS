import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
  Output,
  inject
} from '@angular/core';
import { Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { AuthStorageService } from '../../../core/services/auth-storage.service';
import { NotificationFeedService } from '../../../core/services/notification-feed.service';
import { AccountNotification } from '../../../core/models/notification.model';

interface NotificationGroup {
  key: string;
  label: string;
  items: AccountNotification[];
}

@Component({
  standalone: true,
  selector: 'app-notification-center',
  imports: [CommonModule],
  template: `
    <div class="notification-center" [class.admin]="variant === 'admin'" (click)="$event.stopPropagation()">
      <button
        type="button"
        class="notification-trigger"
        (click)="toggle()"
        [attr.aria-expanded]="open"
        [attr.aria-label]="open ? 'Fermer les notifications' : 'Ouvrir les notifications'"
      >
        <span class="trigger-icon">{{ variant === 'admin' ? '!' : '🔔' }}</span>
        <span class="trigger-badge" *ngIf="unreadCount$ | async as unreadCount">
          <span *ngIf="unreadCount > 0">{{ unreadCount }}</span>
        </span>
      </button>

      <div class="notification-panel" [class.open]="open">
        <div class="panel-header">
          <div>
            <p>Notifications</p>
            <span>{{ (connected$ | async) ? 'Temps reel actif' : 'Synchronisation en cours' }}</span>
          </div>
          <button type="button" class="mark-read-btn" (click)="markAllAsRead()">Tout lire</button>
        </div>

        <ng-container *ngIf="groups$ | async as groups">
          <div *ngIf="groups.length === 0" class="empty-state">
            <strong>Aucune notification recente</strong>
            <span>Les nouvelles activites apparaitront ici.</span>
          </div>

          <div class="group" *ngFor="let group of groups">
            <div class="group-label">{{ group.label }}</div>

            <button
              type="button"
              class="notification-item"
              *ngFor="let notification of group.items; trackBy: trackByNotificationId"
              [class.unread]="!notification.readAt"
              (click)="openNotification(notification)"
            >
              <span class="notification-icon" [ngClass]="notification.tone">{{ iconFor(notification.iconKey) }}</span>
              <span class="notification-copy">
                <strong>{{ notification.title }}</strong>
                <small>{{ notification.message }}</small>
                <em *ngIf="notification.action?.label">{{ notification.action?.label }}</em>
              </span>
              <span class="notification-meta">
                <span class="notification-time">{{ relativeTime(notification.createdAt) }}</span>
                <span class="notification-dot" *ngIf="!notification.readAt"></span>
              </span>
            </button>
          </div>
        </ng-container>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .notification-center {
      position: relative;
    }

    .notification-trigger {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.75rem;
      height: 2.75rem;
      border: 1px solid rgba(15, 23, 42, 0.08);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.92);
      color: #0f172a;
      cursor: pointer;
      box-shadow: 0 14px 28px rgba(15, 23, 42, 0.1);
      transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
    }

    .notification-trigger:hover {
      transform: translateY(-1px);
      border-color: rgba(37, 99, 235, 0.2);
      box-shadow: 0 18px 30px rgba(15, 23, 42, 0.12);
    }

    .notification-center.admin .notification-trigger {
      width: 3rem;
      height: 3rem;
      background: #ffffff;
      border-color: rgba(148, 163, 184, 0.24);
      box-shadow: 0 16px 28px rgba(15, 23, 42, 0.08);
    }

    .trigger-icon {
      font-size: 1rem;
      line-height: 1;
    }

    .trigger-badge {
      position: absolute;
      top: -0.2rem;
      right: -0.15rem;
      min-width: 1.2rem;
      height: 1.2rem;
      padding: 0 0.28rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: linear-gradient(135deg, #ef4444, #dc2626);
      color: #ffffff;
      font-size: 0.7rem;
      font-weight: 700;
      box-shadow: 0 8px 16px rgba(220, 38, 38, 0.35);
    }

    .notification-panel {
      position: absolute;
      top: calc(100% + 0.85rem);
      right: 0;
      width: min(28rem, calc(100vw - 1.5rem));
      max-height: min(32rem, 76vh);
      overflow: auto;
      padding: 0.85rem;
      border-radius: 1.2rem;
      border: 1px solid rgba(226, 232, 240, 0.9);
      background: rgba(255, 255, 255, 0.98);
      box-shadow: 0 28px 50px rgba(15, 23, 42, 0.18);
      backdrop-filter: blur(14px);
      opacity: 0;
      visibility: hidden;
      transform: translateY(-10px);
      transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s ease;
      z-index: 1200;
    }

    .notification-panel.open {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
    }

    .panel-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.2rem 0.2rem 0.8rem;
      border-bottom: 1px solid rgba(226, 232, 240, 0.9);
      margin-bottom: 0.75rem;
    }

    .panel-header p {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 700;
      color: #0f172a;
    }

    .panel-header span {
      display: block;
      margin-top: 0.18rem;
      color: #64748b;
      font-size: 0.78rem;
    }

    .mark-read-btn {
      border: 0;
      background: rgba(37, 99, 235, 0.09);
      color: #1d4ed8;
      font-weight: 600;
      border-radius: 999px;
      padding: 0.5rem 0.85rem;
      cursor: pointer;
    }

    .empty-state {
      display: grid;
      gap: 0.35rem;
      padding: 1.15rem;
      border-radius: 1rem;
      background: #f8fafc;
      color: #475569;
    }

    .group + .group {
      margin-top: 0.85rem;
    }

    .group-label {
      padding: 0 0.3rem 0.45rem;
      color: #64748b;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .notification-item {
      width: 100%;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 0.85rem;
      align-items: start;
      padding: 0.85rem;
      border: 0;
      border-radius: 1rem;
      background: transparent;
      text-align: left;
      cursor: pointer;
      transition: background 0.18s ease, transform 0.18s ease;
    }

    .notification-item:hover {
      background: rgba(248, 250, 252, 0.95);
      transform: translateY(-1px);
    }

    .notification-item.unread {
      background: rgba(239, 246, 255, 0.8);
    }

    .notification-icon {
      width: 2.35rem;
      height: 2.35rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 0.9rem;
      background: rgba(37, 99, 235, 0.1);
      color: #1d4ed8;
      font-size: 1rem;
      font-weight: 700;
      flex-shrink: 0;
    }

    .notification-icon.success { background: rgba(16, 185, 129, 0.12); color: #047857; }
    .notification-icon.warning { background: rgba(245, 158, 11, 0.12); color: #b45309; }
    .notification-icon.danger { background: rgba(239, 68, 68, 0.12); color: #b91c1c; }

    .notification-copy {
      display: grid;
      gap: 0.24rem;
      min-width: 0;
    }

    .notification-copy strong,
    .notification-copy small,
    .notification-copy em {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .notification-copy strong {
      color: #0f172a;
      font-size: 0.9rem;
      font-style: normal;
    }

    .notification-copy small {
      color: #475569;
      line-height: 1.45;
    }

    .notification-copy em {
      color: #1d4ed8;
      font-style: normal;
      font-weight: 600;
      font-size: 0.76rem;
    }

    .notification-meta {
      display: grid;
      justify-items: end;
      gap: 0.4rem;
    }

    .notification-time {
      color: #94a3b8;
      font-size: 0.74rem;
      white-space: nowrap;
    }

    .notification-dot {
      width: 0.55rem;
      height: 0.55rem;
      border-radius: 999px;
      background: #2563eb;
      box-shadow: 0 0 0 0.2rem rgba(37, 99, 235, 0.16);
    }

    @media (max-width: 640px) {
      .notification-panel {
        right: -0.35rem;
        width: min(24rem, calc(100vw - 1rem));
      }
    }
  `]
})
export class NotificationCenterComponent implements OnInit {
  @Input() open = false;
  @Input() variant: 'topbar' | 'admin' = 'topbar';
  @Output() readonly openChange = new EventEmitter<boolean>();

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly router = inject(Router);
  private readonly authStorage = inject(AuthStorageService);
  private readonly feed = inject(NotificationFeedService);

  readonly unreadCount$ = this.feed.unreadCount$;
  readonly connected$ = this.feed.connected$;
  readonly groups$ = this.feed.items$.pipe(map((items) => this.groupNotifications(items)));

  ngOnInit(): void {
    this.feed.ensureReady();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.open) {
      return;
    }

    if (this.elementRef.nativeElement.contains(event.target as Node)) {
      return;
    }

    this.openChange.emit(false);
  }

  toggle(): void {
    const next = !this.open;
    this.openChange.emit(next);

    if (next) {
      this.feed.ensureReady();
      this.feed.markAllAsRead();
    }
  }

  markAllAsRead(): void {
    this.feed.markAllAsRead();
  }

  openNotification(notification: AccountNotification): void {
    if (!notification.readAt) {
      this.feed.markAsRead(notification._id);
    }

    const target = this.resolveTarget(notification);
    this.openChange.emit(false);

    if (!target) {
      return;
    }

    if (target.queryParams && Object.keys(target.queryParams).length > 0) {
      this.router.navigate([target.route], { queryParams: target.queryParams });
      return;
    }

    this.router.navigateByUrl(target.route);
  }

  iconFor(iconKey?: string): string {
    switch (iconKey) {
      case 'share':
        return '📥';
      case 'complaint':
        return '🧾';
      case 'approval':
        return '✅';
      case 'alert':
        return '⚠';
      case 'quota':
        return '📊';
      default:
        return '🔔';
    }
  }

  relativeTime(value: string): string {
    const date = new Date(value);
    const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
    const formatter = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

    const minutes = Math.round(deltaSeconds / 60);
    const hours = Math.round(deltaSeconds / 3600);
    const days = Math.round(deltaSeconds / 86400);

    if (Math.abs(deltaSeconds) < 60) return formatter.format(deltaSeconds, 'second');
    if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
    if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
    return formatter.format(days, 'day');
  }

  trackByNotificationId(_: number, notification: AccountNotification): string {
    return notification._id;
  }

  private resolveTarget(notification: AccountNotification): { route: string; queryParams?: Record<string, string | number | boolean> } | null {
    const action = notification.action || {};
    const role = this.authStorage.getRole();

    switch (action.kind) {
      case 'received_shares':
        return { route: '/user/share-history' };
      case 'file_workspace':
        return { route: '/user/files' };
      case 'complaint_detail':
        if (!action.entityId) {
          return null;
        }

        if (role === 'tenant_admin') {
          return { route: `/tenant-admin/complaints/${action.entityId}` };
        }

        if (role === 'superadmin') {
          return { route: `/admin/complaints/${action.entityId}` };
        }

        return { route: `/user/complaints/${action.entityId}` };
      case 'security_alert_detail': {
        const route = role === 'tenant_admin' ? '/tenant-admin/alerts' : '/admin/alerts';
        const fileId = action.entityId || String(action.queryParams?.['fileId'] || '');
        return {
          route,
          queryParams: fileId ? { fileId } : undefined
        };
      }
      case 'tenant_quota_detail': {
        const tenantId = action.entityId || String(action.queryParams?.['tenantId'] || '');
        if (role === 'superadmin') {
          return {
            route: '/admin/quotas',
            queryParams: tenantId ? { tenant: tenantId } : undefined
          };
        }
        if (role === 'tenant_admin') {
          return { route: '/admin/quotas' };
        }
        return null;
      }
      default:
        return null;
    }
  }

  private groupNotifications(items: AccountNotification[]): NotificationGroup[] {
    const groups = new Map<string, NotificationGroup>();

    for (const item of items) {
      const date = new Date(item.createdAt);
      const weekStart = this.startOfWeek(date);
      const key = weekStart.toISOString();

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: this.weekLabel(weekStart),
          items: []
        });
      }

      groups.get(key)?.items.push(item);
    }

    return [...groups.values()].sort((left, right) => right.key.localeCompare(left.key));
  }

  private startOfWeek(date: Date): Date {
    const copy = new Date(date);
    const day = (copy.getDay() + 6) % 7;
    copy.setDate(copy.getDate() - day);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  private weekLabel(weekStart: Date): string {
    const currentWeek = this.startOfWeek(new Date());
    const previousWeek = new Date(currentWeek);
    previousWeek.setDate(previousWeek.getDate() - 7);

    if (weekStart.getTime() === currentWeek.getTime()) {
      return 'Cette semaine';
    }

    if (weekStart.getTime() === previousWeek.getTime()) {
      return 'Semaine derniere';
    }

    return `Semaine du ${new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(weekStart)}`;
  }
}
