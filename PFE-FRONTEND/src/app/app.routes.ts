import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { tenantAdminGuard } from './core/guards/tenant-admin.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/welcome/welcome.component').then((m) => m.WelcomeComponent)
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent)
  },
  {
    path: 'verify',
    loadComponent: () =>
      import('./features/auth/verify/verify.component').then((m) => m.VerifyComponent)
  },

  // ==================== USER ROUTES ====================
  {
    path: 'user',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/user/user-layout/user-layout.component').then(
        (m) => m.UserLayoutComponent
      ),
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/user/dashboard/user-dashboard.component').then(
            (m) => m.UserDashboardComponent
          )
      },
      {
        path: 'files',
        loadComponent: () =>
          import('./features/files/file-workspace/file-workspace.component').then(
            (m) => m.FileWorkspaceComponent
          )
      },
      {
        path: 'stats',
        loadComponent: () =>
          import('./features/user/stats/user-stats.component').then(
            (m) => m.UserStatsComponent
          )
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/user/security-settings/security-settings.component').then(
            (m) => m.SecuritySettingsComponent
          )
      },
      {
        path: 'share-history',
        loadComponent: () =>
          import('./features/share-history/user/user-share-history.component').then(
            (m) => m.UserShareHistoryComponent
          )
      },
      {
        path: 'complaints',
        loadComponent: () =>
          import('./features/complaints/user/user-complaints.component').then(
            (m) => m.UserComplaintsComponent
          )
      },
      {
        path: 'complaints/:ticketId',
        loadComponent: () =>
          import('./features/complaints/user/user-complaint-detail.component').then(
            (m) => m.UserComplaintDetailComponent
          )
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' }
    ]
  },

  // ==================== ADMIN ROUTES ====================
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./features/admin/admin-layout/admin-layout.component').then(
        (m) => m.AdminLayoutComponent
      ),
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/admin/dashboard/admin-dashboard.component').then(
            (m: any) => m.AdminDashboardComponent
          )
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./features/admin/users-management/admin-users.component').then(
            (m) => m.AdminUsersManagementComponent
          )
      },
      {
        path: 'tenants',
        loadComponent: () =>
          import('./features/admin/tenants-management/admin-tenants.component').then(
            (m) => m.AdminTenantsManagementComponent
          )
      },
      {
        path: 'analytics',
        loadComponent: () =>
          import('./features/admin/analytics/admin-analytics.component').then(
            (m) => m.AdminAnalyticsComponent
          )
      },
      {
        path: 'quotas/:tenantId',
        loadComponent: () =>
          import('./features/admin/quota-management/admin-tenant-details-page.component').then(
            (m) => m.AdminTenantDetailsPageComponent
          )
      },
      {
        path: 'quotas',
        loadComponent: () =>
          import('./features/admin/quota-management/admin-quota-management.component').then(
            (m) => m.AdminQuotaManagementComponent
          )
      },
      {
        path: 'alerts',
        loadComponent: () =>
          import('./features/admin/alerts/admin-alerts.component').then(
            (m) => m.AdminAlertsPageComponent
          )
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/admin/profile/admin-profile.component').then(
            (m) => m.AdminProfileComponent
          )
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/admin/settings/admin-settings.component').then(
            (m) => m.AdminSettingsComponent
          )
      },
      {
        path: 'share-history',
        loadComponent: () =>
          import('./features/share-history/admin/admin-share-history.component').then(
            (m) => m.AdminShareHistoryComponent
          )
      },
      {
        path: 'audit-logs',
        loadComponent: () =>
          import('./features/admin/audit-logs/admin-audit-logs.component').then(
            (m) => m.AdminAuditLogsComponent
          )
      },
      {
        path: 'ai-monitoring',
        loadComponent: () =>
          import('./features/admin/ai-monitoring/admin-ai-monitoring.component').then(
            (m: any) => m.AdminAiMonitoringComponent
          )
      },
      {
        path: 'complaints',
        loadComponent: () =>
          import('./features/complaints/admin/admin-complaints.component').then(
            (m) => m.AdminComplaintsComponent
          )
      },
      {
        path: 'complaints/:ticketId',
        loadComponent: () =>
          import('./features/complaints/admin/admin-complaint-detail.component').then(
            (m) => m.AdminComplaintDetailComponent
          )
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' }
    ]
  },

  // ==================== TENANT ADMIN ROUTES ====================
  {
    path: 'tenant-admin',
    canActivate: [authGuard, tenantAdminGuard],
    loadComponent: () =>
      import('./features/user/user-layout/user-layout.component').then(
        (m) => m.UserLayoutComponent
      ),
    children: [
      { path: 'dashboard', redirectTo: '/user/dashboard', pathMatch: 'full' },
      {
        path: 'users',
        loadComponent: () =>
          import('./features/admin/users-management/admin-users.component').then(
            (m) => m.AdminUsersManagementComponent
          )
      },
      {
        path: 'current-shares',
        loadComponent: () =>
          import('./features/tenant-admin/current-shares/tenant-admin-current-shares.component').then(
            (m) => m.TenantAdminCurrentSharesComponent
          )
      },
      {
        path: 'complaints',
        loadComponent: () =>
          import('./features/complaints/admin/admin-complaints.component').then(
            (m) => m.AdminComplaintsComponent
          )
      },
      {
        path: 'complaints/:ticketId',
        loadComponent: () =>
          import('./features/complaints/admin/admin-complaint-detail.component').then(
            (m) => m.AdminComplaintDetailComponent
          )
      },
      {
        path: 'alerts',
        loadComponent: () =>
          import('./features/admin/alerts/admin-alerts.component').then(
            (m) => m.AdminAlertsPageComponent
          )
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/user/security-settings/security-settings.component').then(
            (m) => m.SecuritySettingsComponent
          ),
        data: { section: 'profile' }
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/user/security-settings/security-settings.component').then(
            (m) => m.SecuritySettingsComponent
          ),
        data: { section: 'preferences' }
      },
      {
        path: 'invitations',
        loadComponent: () =>
          import('./features/tenant-admin/invitations/tenant-admin-invitations.component').then(
            (m) => m.TenantAdminInvitationsComponent
          )
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' }
    ]
  },

  // ==================== FALLBACK ====================
  { path: '**', redirectTo: '' }
];
