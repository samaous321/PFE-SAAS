import { CommonModule } from '@angular/common';
import { Component, HostListener, Input, inject } from '@angular/core';
import { Params, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthStorageService } from '../../../core/services/auth-storage.service';
import { UserApiService } from '../../../core/services/user-api.service';
import { NotificationCenterComponent } from '../notification-center/notification-center.component';

type TopbarMode = 'user' | 'tenant-admin';

type TopbarProfileSection = 'profile' | 'security' | 'preferences';

interface TopbarNavItem {
  label: string;
  description: string;
  icon: string;
  route: string;
  queryParams?: Params;
}

interface TopbarNavGroup {
  id: string;
  label: string;
  description: string;
  icon: string;
  items: TopbarNavItem[];
}

interface TopbarProfileAction {
  label: string;
  description: string;
  icon: string;
  section?: TopbarProfileSection;
  route?: string;
  queryParams?: Params;
  variant?: 'default' | 'support' | 'danger';
}

interface TopbarShortcut {
  label: string;
  description: string;
  icon: string;
  route: string;
  queryParams?: Params;
}

interface TopbarNotificationItem {
  title: string;
  description: string;
  time: string;
  icon: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
  unread?: boolean;
}

@Component({
  standalone: true,
  selector: 'app-topbar',
  imports: [CommonModule, RouterLink, RouterLinkActive, NotificationCenterComponent],
  template: `
    <div class="topbar-root">
      <header class="topbar" [class.open]="mobileMenuOpen">
        <div class="topbar-inner">
          <div class="brand-zone">
            <button type="button" class="brand" (click)="goHome()" [attr.aria-label]="homeAriaLabel">
              <span class="brand-mark">P</span>
              <span class="brand-copy">
                <strong>PFE Secure</strong>
                <small>{{ getTenantName() }}</small>
              </span>
            </button>

            <span class="section-pill">{{ currentSectionLabel }}</span>
          </div>

          <button type="button" class="hamburger" (click)="toggleMobileMenu()" [attr.aria-expanded]="mobileMenuOpen" [attr.aria-label]="mobileMenuLabel">
            <span></span>
            <span></span>
            <span></span>
          </button>

          <nav class="main-nav" [class.open]="mobileMenuOpen" aria-label="Navigation principale" (click)="$event.stopPropagation()">
            <a
              *ngFor="let item of primaryNavItems"
              class="nav-link"
              [routerLink]="item.route"
              [queryParams]="item.queryParams"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: false }"
              (click)="closeMenus()"
            >
              <span class="link-icon">{{ item.icon }}</span>
              <span class="link-copy">
                <strong>{{ item.label }}</strong>
              </span>
            </a>
          </nav>

          <div class="topbar-actions">
            <div *ngIf="showTenantAdminActions" class="admin-actions-wrapper">
              <button type="button" class="quick-action admin-action-trigger" (click)="toggleTenantActions()" [attr.aria-expanded]="tenantActionsOpen" aria-haspopup="true" title="Action Administratif">
                <span class="quick-action-icon">⚙️</span>
                <span class="quick-action-copy">Action Administratif</span>
                <span class="section-caret">▾</span>
              </button>

              <div class="profile-menu admin-actions-menu" [class.open]="tenantActionsOpen">
                <div class="menu-panel-title">
                  <div>
                    <p>Action Administratif</p>
                    <span>Raccourcis de gestion tenant</span>
                  </div>
                  <span class="menu-badge">Tenant</span>
                </div>

                <button
                  type="button"
                  class="profile-link"
                  *ngFor="let action of tenantAdminActions"
                  (click)="navigate(action.route, action.queryParams)"
                >
                  <span class="profile-link-icon">{{ action.icon }}</span>
                  <span class="profile-link-copy">
                    <strong>{{ action.label }}</strong>
                    <small>{{ action.description }}</small>
                  </span>
                </button>
              </div>
            </div>

            <app-notification-center
              variant="topbar"
              [open]="notificationsOpen"
              (openChange)="onNotificationsOpenChange($event)"
            ></app-notification-center>

            <div class="profile-wrapper">
              <button type="button" class="profile-button" (click)="toggleProfileMenu()" [attr.aria-expanded]="profileMenuOpen" aria-haspopup="true">
                <span class="avatar">{{ getInitials() }}</span>
                <span class="profile-name">
                  <strong>{{ getUserFullName() }}</strong>
                  <small>{{ profileRoleLabel }}</small>
                </span>
                <span class="section-caret">▾</span>
              </button>

              <div class="profile-menu" [class.open]="profileMenuOpen">
                <div class="profile-card">
                  <span class="profile-avatar">{{ getInitials() }}</span>
                  <div>
                    <strong>{{ getUserFullName() }}</strong>
                    <p>{{ getTenantName() }}</p>
                  </div>
                </div>

                <button
                  type="button"
                  class="profile-link"
                  *ngFor="let action of profileActions"
                  [ngClass]="action.variant || 'default'"
                  (click)="handleProfileAction(action)"
                >
                  <span class="profile-link-icon">{{ action.icon }}</span>
                  <span class="profile-link-copy">
                    <strong>{{ action.label }}</strong>
                    <small>{{ action.description }}</small>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="mobile-drawer" [class.open]="mobileMenuOpen">
          <div class="drawer-header">
            <button type="button" class="brand brand-drawer" (click)="goHome()" [attr.aria-label]="homeAriaLabel">
              <span class="brand-mark">P</span>
              <span class="brand-copy">
                <strong>PFE Secure</strong>
                <small>{{ getTenantName() }}</small>
              </span>
            </button>

            <button type="button" class="drawer-close" (click)="closeMenus()" aria-label="Fermer le menu">✕</button>
          </div>

          <div class="drawer-section">
            <a *ngFor="let item of primaryNavItems" [routerLink]="item.route" [queryParams]="item.queryParams" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: false }" (click)="closeMenus()">
              <span class="link-icon">{{ item.icon }}</span>
              <span class="link-copy">
                <strong>{{ item.label }}</strong>
              </span>
            </a>
          </div>

          <div class="drawer-section" *ngIf="showTenantAdminActions">
            <button type="button" class="drawer-group-trigger" (click)="toggleTenantActions()">
              <span>
                <strong>Action Administratif</strong>
                <small>Gestion du tenant</small>
              </span>
              <span class="section-caret">▾</span>
            </button>

            <div class="drawer-links" *ngIf="tenantActionsOpen">
              <a *ngFor="let item of tenantAdminActions" [routerLink]="item.route" [queryParams]="item.queryParams" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: false }" (click)="closeMenus()">
                <span class="link-icon">{{ item.icon }}</span>
                <span class="link-copy">
                  <strong>{{ item.label }}</strong>
                  <small>{{ item.description }}</small>
                </span>
              </a>
            </div>
          </div>

          <div class="drawer-footer">
            <button type="button" class="drawer-footer-action primary" (click)="goHome()">{{ homeButtonLabel }}</button>
            <button *ngIf="mode === 'tenant-admin'" type="button" class="drawer-footer-action" (click)="navigate('/user/files', { tab: 'files' })">Retour espace utilisateur</button>
            <button type="button" class="drawer-footer-action danger" (click)="logout()">Déconnexion</button>
          </div>
        </div>

        <button type="button" class="overlay" *ngIf="mobileMenuOpen || profileMenuOpen || notificationsOpen" (click)="closeMenus()" aria-label="Fermer les menus"></button>
      </header>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .topbar-root {
      position: relative;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 80;
      width: 100%;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(246, 250, 255, 0.88)),
        radial-gradient(circle at top left, rgba(37, 99, 235, 0.12), transparent 30%),
        radial-gradient(circle at top right, rgba(14, 165, 233, 0.1), transparent 28%);
      backdrop-filter: blur(24px);
      border-bottom: 1px solid rgba(148, 163, 184, 0.18);
      box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
    }

    .topbar-inner {
      max-width: 1600px;
      margin: 0 auto;
      min-height: 80px;
      padding: 1rem 1.4rem;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 1rem;
    }

    .brand-zone {
      display: flex;
      align-items: center;
      gap: 0.9rem;
      min-width: max-content;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 0.8rem;
      border: 0;
      background: transparent;
      padding: 0;
      cursor: pointer;
      text-decoration: none;
      color: #0f172a;
    }

    .brand-mark {
      width: 2.8rem;
      height: 2.8rem;
      border-radius: 1rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      letter-spacing: -0.06em;
      color: #ffffff;
      background: linear-gradient(135deg, #2563eb 0%, #0f766e 100%);
      box-shadow: 0 16px 28px rgba(37, 99, 235, 0.22);
    }

    .brand-copy {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }

    .brand-copy strong {
      font-size: 1rem;
      letter-spacing: -0.03em;
      line-height: 1.1;
    }

    .brand-copy small {
      color: #64748b;
      font-size: 0.78rem;
    }

    .section-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.5rem 0.85rem;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.05);
      color: #334155;
      border: 1px solid rgba(148, 163, 184, 0.2);
      font-size: 0.8rem;
      font-weight: 600;
      white-space: nowrap;
    }

    .hamburger {
      display: none;
      border: 1px solid rgba(148, 163, 184, 0.22);
      background: rgba(255, 255, 255, 0.78);
      cursor: pointer;
      padding: 0.75rem;
      border-radius: 0.95rem;
      align-items: center;
      justify-content: center;
      gap: 4px;
      box-shadow: 0 10px 20px rgba(15, 23, 42, 0.05);
    }

    .hamburger span {
      display: block;
      width: 22px;
      height: 2px;
      background: #0f172a;
      border-radius: 999px;
    }

    .main-nav {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.7rem;
      min-height: 58px;
      flex-wrap: wrap;
    }

    .nav-link {
      display: inline-flex;
      display: flex;
      align-items: center;
      gap: 0.65rem;
      min-width: 146px;
      background: rgba(255, 255, 255, 0.8);
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 0.95rem;
      color: #0f172a;
      font-weight: 600;
      font-size: 0.88rem;
      padding: 0.72rem 0.88rem;
      cursor: pointer;
      transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease, background 0.22s ease;
      box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
      text-decoration: none;
    }

    .nav-link:hover,
    .nav-link.active,
    .nav-link:focus-visible {
      transform: translateY(-1px);
      border-color: rgba(37, 99, 235, 0.3);
      background: #ffffff;
      box-shadow: 0 14px 28px rgba(37, 99, 235, 0.08);
    }

    .section-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.8rem;
      height: 1.8rem;
      border-radius: 0.65rem;
      background: rgba(37, 99, 235, 0.1);
      color: #1d4ed8;
      font-size: 0.95rem;
      flex: 0 0 auto;
    }

    .drawer-links a,
    .profile-link,
    .notification-item {
      display: flex;
      align-items: center;
      gap: 0.8rem;
      border: 0;
      width: 100%;
      background: transparent;
      color: #0f172a;
      text-decoration: none;
      cursor: pointer;
      border-radius: 0.95rem;
      padding: 0.78rem 0.85rem;
      transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
      text-align: left;
    }

    .drawer-links a:hover,
    .drawer-links a.active,
    .profile-link:hover,
    .notification-item:hover {
      background: rgba(37, 99, 235, 0.08);
      box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.12);
      transform: translateX(1px);
    }

    .link-icon,
    .profile-link-icon,
    .notification-icon {
      width: 1.9rem;
      height: 1.9rem;
      border-radius: 0.7rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: rgba(15, 23, 42, 0.05);
      color: #334155;
      flex: 0 0 auto;
    }

    .link-copy,
    .profile-link-copy,
    .notification-copy,
    .profile-name {
      display: grid;
      gap: 0;
    }

    .link-copy strong,
    .profile-link-copy strong,
    .notification-copy strong,
    .profile-name strong {
      font-size: 0.88rem;
      line-height: 1.2;
    }

    .notification-item {
      position: relative;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 0.8rem;
      padding-right: 1rem;
    }

    .notification-icon.info { background: rgba(37, 99, 235, 0.1); color: #1d4ed8; }
    .notification-icon.success { background: rgba(16, 185, 129, 0.12); color: #047857; }
    .notification-icon.warning { background: rgba(245, 158, 11, 0.12); color: #b45309; }
    .notification-icon.danger { background: rgba(239, 68, 68, 0.12); color: #b91c1c; }

    .notification-time {
      color: #64748b;
      font-size: 0.72rem;
      white-space: nowrap;
    }

    .notification-dot {
      position: absolute;
      top: 50%;
      right: 0.25rem;
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 999px;
      background: #2563eb;
      transform: translateY(-50%);
      box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
    }

    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-width: max-content;
    }

    .admin-actions-wrapper {
      position: relative;
    }

    .admin-action-trigger {
      padding-right: 0.85rem;
    }

    .admin-actions-menu {
      right: auto;
      left: 0;
      width: min(390px, calc(100vw - 2rem));
    }

    .quick-action,
    .icon-button,
    .profile-button {
      display: inline-flex;
      align-items: center;
      gap: 0.65rem;
      border: 1px solid rgba(148, 163, 184, 0.22);
      background: rgba(255, 255, 255, 0.82);
      color: #0f172a;
      border-radius: 999px;
      cursor: pointer;
      transition: transform 0.22s ease, box-shadow 0.22s ease, background 0.22s ease, border-color 0.22s ease;
      box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
    }

    .quick-action {
      padding: 0.7rem 0.95rem;
      font-weight: 600;
      white-space: nowrap;
    }

    .quick-action:hover,
    .icon-button:hover,
    .profile-button:hover {
      transform: translateY(-1px);
      border-color: rgba(37, 99, 235, 0.28);
      background: #ffffff;
      box-shadow: 0 14px 28px rgba(37, 99, 235, 0.08);
    }

    .quick-action-icon,
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.6rem;
      height: 1.6rem;
      border-radius: 999px;
      background: rgba(37, 99, 235, 0.1);
      color: #1d4ed8;
      font-size: 0.78rem;
      font-weight: 700;
      flex: 0 0 auto;
    }

    .badge {
      position: absolute;
      top: -0.25rem;
      right: -0.25rem;
      width: 1.25rem;
      height: 1.25rem;
      background: linear-gradient(135deg, #0f766e 0%, #2563eb 100%);
      color: #ffffff;
      box-shadow: 0 10px 18px rgba(15, 118, 110, 0.24);
    }

    .icon-button {
      position: relative;
      width: 48px;
      height: 48px;
      justify-content: center;
      padding: 0;
      font-size: 1.05rem;
    }

    .profile-wrapper {
      position: relative;
    }

    .profile-button {
      padding: 0.5rem 0.7rem 0.5rem 0.5rem;
      min-height: 48px;
    }

    .avatar,
    .profile-avatar {
      width: 2.1rem;
      height: 2.1rem;
      border-radius: 0.8rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-weight: 700;
      background: linear-gradient(135deg, #1d4ed8 0%, #0f766e 100%);
      box-shadow: 0 14px 24px rgba(37, 99, 235, 0.2);
      flex: 0 0 auto;
    }

    .profile-name {
      text-align: left;
      min-width: 0;
    }

    .profile-menu,
    .notifications-menu {
      position: absolute;
      top: calc(100% + 0.8rem);
      right: 1.4rem;
      width: min(360px, calc(100vw - 2rem));
      background: rgba(255, 255, 255, 0.98);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 1.3rem;
      box-shadow: 0 24px 70px rgba(15, 23, 42, 0.16);
      padding: 0.85rem;
      opacity: 0;
      visibility: hidden;
      transform: translateY(10px) scale(0.98);
      transition: opacity 0.22s ease, transform 0.22s ease, visibility 0.22s ease;
      pointer-events: none;
      z-index: 35;
    }

    .profile-menu.open,
    .notifications-menu.open {
      opacity: 1;
      visibility: visible;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    .profile-card,
    .menu-panel-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.85rem;
      padding: 0.2rem 0.2rem 0.85rem;
      margin-bottom: 0.55rem;
      border-bottom: 1px solid rgba(148, 163, 184, 0.18);
    }

    .profile-card {
      justify-content: flex-start;
    }

    .profile-card div {
      display: grid;
      gap: 0.12rem;
    }

    .profile-card strong,
    .menu-panel-title p {
      margin: 0;
      font-size: 0.98rem;
      letter-spacing: -0.02em;
      color: #0f172a;
    }

    .profile-card p,
    .menu-panel-title span {
      margin: 0;
      color: #64748b;
      font-size: 0.82rem;
      line-height: 1.35;
    }

    .menu-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.38rem 0.65rem;
      border-radius: 999px;
      background: rgba(15, 118, 110, 0.1);
      color: #0f766e;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .profile-link.danger {
      color: #b91c1c;
    }

    .profile-link.danger .profile-link-icon {
      background: rgba(239, 68, 68, 0.1);
      color: #b91c1c;
    }

    .profile-link.support .profile-link-icon {
      background: rgba(14, 165, 233, 0.1);
      color: #0369a1;
    }

    .notifications-menu {
      right: 7.8rem;
      display: grid;
      gap: 0.4rem;
      max-height: 420px;
      overflow: auto;
    }

    .mobile-drawer {
      position: fixed;
      inset: 0 0 0 auto;
      width: min(92vw, 420px);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(246, 250, 255, 0.98));
      backdrop-filter: blur(24px);
      border-left: 1px solid rgba(148, 163, 184, 0.18);
      box-shadow: -24px 0 70px rgba(15, 23, 42, 0.18);
      transform: translateX(100%);
      transition: transform 0.24s ease;
      z-index: 40;
      padding: 1rem;
      display: none;
      overflow-y: auto;
    }

    .mobile-drawer.open {
      transform: translateX(0);
    }

    .drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid rgba(148, 163, 184, 0.16);
      margin-bottom: 1rem;
    }

    .brand-drawer {
      color: #0f172a;
    }

    .drawer-close {
      border: 1px solid rgba(148, 163, 184, 0.2);
      background: rgba(255, 255, 255, 0.8);
      border-radius: 0.85rem;
      width: 44px;
      height: 44px;
      cursor: pointer;
      font-size: 1rem;
      color: #0f172a;
    }

    .drawer-section {
      display: grid;
      gap: 0.65rem;
      margin-bottom: 0.9rem;
    }

    .drawer-group-trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.85rem;
      width: 100%;
      border: 1px solid rgba(148, 163, 184, 0.2);
      background: rgba(255, 255, 255, 0.86);
      border-radius: 1rem;
      padding: 0.9rem 1rem;
      cursor: pointer;
      color: #0f172a;
      box-shadow: 0 10px 22px rgba(15, 23, 42, 0.04);
    }

    .drawer-links {
      display: grid;
      gap: 0.45rem;
      padding-left: 0.2rem;
    }

    .drawer-links a {
      background: rgba(255, 255, 255, 0.8);
      border: 1px solid rgba(148, 163, 184, 0.16);
      padding: 0.7rem 0.8rem;
    }

    .drawer-footer {
      display: grid;
      gap: 0.7rem;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid rgba(148, 163, 184, 0.16);
    }

    .drawer-footer-action {
      width: 100%;
      border: 1px solid rgba(148, 163, 184, 0.2);
      background: rgba(255, 255, 255, 0.84);
      border-radius: 1rem;
      padding: 0.95rem 1rem;
      font-weight: 700;
      color: #0f172a;
      cursor: pointer;
      text-align: left;
    }

    .drawer-footer-action.primary {
      background: linear-gradient(135deg, #2563eb 0%, #0f766e 100%);
      border-color: transparent;
      color: #ffffff;
    }

    .drawer-footer-action.danger {
      color: #b91c1c;
    }

    .overlay {
      position: fixed;
      inset: 0;
      z-index: 30;
      border: 0;
      background: rgba(15, 23, 42, 0.25);
      backdrop-filter: blur(2px);
    }

    @media (max-width: 1280px) {
      .topbar-inner {
        grid-template-columns: auto auto 1fr auto;
      }

      .main-nav {
        display: none;
      }

      .hamburger {
        display: inline-flex;
      }

      .mobile-drawer {
        display: block;
      }
    }

    @media (max-width: 900px) {
      .topbar-inner {
        grid-template-columns: auto auto 1fr;
      }

      .section-pill {
        display: none;
      }

      .quick-action .quick-action-copy {
        display: none;
      }
    }

    @media (max-width: 680px) {
      .topbar-inner {
        padding: 0.9rem 1rem;
        gap: 0.75rem;
      }

      .brand-copy strong {
        font-size: 0.94rem;
      }

      .brand-copy small {
        display: none;
      }

      .profile-name {
        display: none;
      }

      .notifications-menu,
      .profile-menu {
        right: 0.8rem;
      }
    }
  `]
})
export class TopbarComponent {
  @Input() mode: TopbarMode = 'user';

  private readonly authStorage = inject(AuthStorageService);
  private readonly api = inject(UserApiService);
  private readonly router = inject(Router);

  readonly userGroups: TopbarNavGroup[] = [
    {
      id: 'workspace',
      label: 'Espace de travail',
      description: 'Accès direct aux modules du compte utilisateur',
      icon: '◉',
      items: [
        { label: 'Gestion Fichier', description: 'Documents, dossiers et partage', icon: '📁', route: '/user/files' },
        { label: 'Historique', description: 'Activité et téléchargements', icon: '🕘', route: '/user/share-history' },
        { label: 'Statistiques', description: 'Indicateurs et sécurité', icon: '📊', route: '/user/stats' },
        { label: 'Réclamation', description: 'Support et tickets', icon: '🧾', route: '/user/complaints' }
      ]
    }
  ];

  readonly userProfileActions: TopbarProfileAction[] = [
    { label: 'Profil', description: 'Informations du compte', icon: '👤', route: '/user/settings', queryParams: { section: 'profile' } },
    { label: 'Paramètres', description: 'Préférences générales', icon: '⚙️', route: '/user/settings', queryParams: { section: 'preferences' } },
    { label: 'Sécurité', description: 'Contrôles d’accès', icon: '🔒', route: '/user/settings', queryParams: { section: 'security' } },
    { label: 'Support', description: 'Aide et escalade', icon: '💬', route: '/user/complaints', variant: 'support' },
    { label: 'Déconnexion', description: 'Quitter la session', icon: '↩️', variant: 'danger' }
  ];

  readonly tenantAdminActions: TopbarNavItem[] = [
    { label: 'Utilisateurs', description: 'Gérer les comptes du tenant', icon: '👥', route: '/tenant-admin/users' },
    { label: 'Partages actifs', description: 'Surveiller les liens et accès', icon: '🔗', route: '/tenant-admin/current-shares' },
    { label: 'Statistiques', description: 'Indicateurs d’usage', icon: '📈', route: '/user/stats' },
    { label: 'Invitations', description: 'Inviter de nouveaux membres', icon: '✉️', route: '/tenant-admin/invitations' },
    { label: 'Paramètres Tenant', description: 'Préférences et sécurité', icon: '⚙️', route: '/tenant-admin/settings' }
  ];

  readonly notifications: TopbarNotificationItem[] = [
    { title: 'Fichier partagé avec succès', description: 'Le document “Budget_Q2.pdf” a été envoyé à 2 destinataires.', time: '2 min', icon: '📤', tone: 'success', unread: true },
    { title: 'Réclamation mise à jour', description: 'Votre ticket a reçu une nouvelle réponse du support.', time: '18 min', icon: '🧾', tone: 'info', unread: true },
    { title: 'Activité de sécurité', description: 'Une connexion a été enregistrée depuis un nouvel appareil.', time: '1 h', icon: '🔒', tone: 'warning' },
    { title: 'Synchronisation terminée', description: 'Les derniers fichiers sont disponibles dans votre espace.', time: '3 h', icon: '📁', tone: 'success' }
  ];

  activeGroup: string | null = null;
  mobileMenuOpen = false;
  profileMenuOpen = false;
  notificationsOpen = false;
  tenantActionsOpen = false;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.topbar-root')) {
      return;
    }

    this.closeMenus();
  }

  get primaryNavItems(): TopbarNavItem[] {
    return this.userGroups[0].items;
  }

  get profileActions(): TopbarProfileAction[] {
    return this.userProfileActions;
  }

  get showTenantAdminActions(): boolean {
    return this.mode === 'tenant-admin' || this.authStorage.isTenantAdmin();
  }

  get homeRoute(): string {
    return '/user/dashboard';
  }

  get homeButtonLabel(): string {
    return 'Tableau de bord';
  }

  get homeAriaLabel(): string {
    return this.homeButtonLabel;
  }

  get mobileMenuLabel(): string {
    return this.mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu';
  }

  get profileRoleLabel(): string {
    return this.authStorage.isTenantAdmin() ? 'Tenant admin' : 'Utilisateur';
  }

  get currentSectionLabel(): string {
    const currentUrl = this.router.url;

    if (currentUrl.startsWith('/user/dashboard')) return 'Accueil';
    if (currentUrl.startsWith('/user/files')) return 'Gestion Fichier';
    if (currentUrl.startsWith('/user/share-history')) return 'Historique';
    if (currentUrl.startsWith('/user/stats')) return 'Statistiques';
    if (currentUrl.startsWith('/user/complaints')) return 'Réclamation';
    if (currentUrl.startsWith('/user/settings')) return 'Paramètres';

    if (currentUrl.startsWith('/tenant-admin/users')) return 'Utilisateurs';
    if (currentUrl.startsWith('/tenant-admin/current-shares')) return 'Partages actifs';
    if (currentUrl.startsWith('/tenant-admin/alerts')) return 'Alertes';
    if (currentUrl.startsWith('/tenant-admin/complaints')) return 'Réclamations';
    if (currentUrl.startsWith('/tenant-admin/profile')) return 'Profil';
    if (currentUrl.startsWith('/tenant-admin/settings')) return 'Paramètres';
    if (currentUrl.startsWith('/tenant-admin/invitations')) return 'Invitations';

    if (currentUrl.startsWith('/admin')) return 'Administration';
    return this.mode === 'tenant-admin' ? 'Administration tenant' : 'Espace utilisateur';
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    this.profileMenuOpen = false;
    this.notificationsOpen = false;
    this.tenantActionsOpen = false;
  }

  toggleTenantActions(): void {
    this.tenantActionsOpen = !this.tenantActionsOpen;
    this.profileMenuOpen = false;
    this.notificationsOpen = false;
    if (this.tenantActionsOpen) {
      this.mobileMenuOpen = false;
    }
  }

  toggleProfileMenu(): void {
    this.profileMenuOpen = !this.profileMenuOpen;
    this.notificationsOpen = false;
    this.tenantActionsOpen = false;
    if (this.profileMenuOpen) {
      this.mobileMenuOpen = false;
    }
  }

  onNotificationsOpenChange(isOpen: boolean): void {
    this.notificationsOpen = isOpen;
    this.profileMenuOpen = false;
    this.tenantActionsOpen = false;
    if (isOpen) {
      this.mobileMenuOpen = false;
    }
  }

  closeMenus(): void {
    this.mobileMenuOpen = false;
    this.profileMenuOpen = false;
    this.notificationsOpen = false;
    this.tenantActionsOpen = false;
  }

  goHome(): void {
    this.navigate(this.homeRoute);
  }

  navigate(route: string, queryParams?: Params): void {
    this.closeMenus();
    const cleanQueryParams = Object.entries(queryParams || {}).reduce<Params>((accumulator, [key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        accumulator[key] = value;
      }
      return accumulator;
    }, {});

    if (Object.keys(cleanQueryParams).length > 0) {
      this.router.navigate([route], { queryParams: cleanQueryParams });
      return;
    }

    this.router.navigate([route]);
  }

  handleProfileAction(action: TopbarProfileAction): void {
    if (action.variant === 'danger') {
      this.logout();
      return;
    }

    if (action.route) {
      this.navigate(action.route, action.queryParams);
    }
  }

  getInitials(): string {
    const session = this.authStorage.getSession();
    if (session?.firstName && session?.lastName) {
      return (session.firstName[0] + session.lastName[0]).toUpperCase();
    }
    return session?.email?.[0]?.toUpperCase() || 'U';
  }

  getTenantName(): string {
    const session = this.authStorage.getSession();
    return session?.tenantName || 'Mon espace';
  }

  getUserFullName(): string {
    const session = this.authStorage.getSession();
    if (session?.firstName && session?.lastName) {
      return `${session.firstName} ${session.lastName}`;
    }

    if (session?.email) {
      return session.email.split('@')[0];
    }

    return this.mode === 'tenant-admin' ? 'Tenant admin' : 'Utilisateur';
  }

  logout(): void {
    this.closeMenus();
    this.api.logout().subscribe({
      next: () => {
        this.authStorage.clear();
        this.router.navigate(['/login']);
      },
      error: () => {
        this.authStorage.clear();
        this.router.navigate(['/login']);
      }
    });
  }
}
