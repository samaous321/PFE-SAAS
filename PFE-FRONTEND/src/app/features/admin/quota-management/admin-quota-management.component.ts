import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Plan,
  TenantApiService,
  Tenant,
  TenantQuotaSummary
} from '../../../core/services/tenant-api.service';
import { UserApiService, UserQuotaSummary } from '../../../core/services/user-api.service';
import { User } from '../../../core/models/user.model';
import { PlanModalComponent } from './plan-modal.component';
import { AdminTenantDetailsPageComponent } from './admin-tenant-details-page.component';

@Component({
  standalone: true,
  selector: 'app-admin-quota-management',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, PlanModalComponent, AdminTenantDetailsPageComponent],
  templateUrl: './admin-quota-management.component.html',
  styleUrl: './admin-quota-management.component.scss'
})
export class AdminQuotaManagementComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly tenantApi = inject(TenantApiService);
  private readonly userApi = inject(UserApiService);
  private readonly analytics = inject(AnalyticsService);
  private readonly notification = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();

  loading = false;
  saving = false;
  loadingPlans = false;
  tenants: Tenant[] = [];
  users: User[] = [];
  plans: Plan[] = [];
  selectedTenantId = '';
  selectedUserId = '';
  selectedTenantQuota: TenantQuotaSummary | null = null;
  selectedUserQuota: UserQuotaSummary | null = null;
  selectedTenant: Tenant | null = null;
  planSearchFilter = '';
  tenantSearchFilter = '';
  statsSearchFilter = '';
  statsPlanFilter = '';
  statsSortDirection: 'asc' | 'desc' = 'desc';
  statsPage = 1;
  statsPageSize = 10;
  readonly statsPageSizes = [5, 10, 20, 50];

  // Modal properties
  planModalIsOpen = false;
  planModalEditPlan: Plan | null = null;
  // If a tenant id is provided via query param we open it after tenants load
  initialTenantToOpen: string | null = null;

  get selectedUser(): User | undefined {
    return this.users.find((user) => user._id === this.selectedUserId);
  }

  get filteredPlans(): Plan[] {
    const filter = this.planSearchFilter.trim().toLowerCase();
    const visiblePlans = this.plans;

    if (!filter) {
      return visiblePlans;
    }

    return visiblePlans.filter((plan) =>
      plan.name.toLowerCase().includes(filter) ||
      plan.slug.toLowerCase().includes(filter) ||
      (plan.description || '').toLowerCase().includes(filter)
    );
  }

  get filteredTenants(): Tenant[] {
    const filter = this.tenantSearchFilter.trim().toLowerCase();

    if (!filter) {
      return this.tenants;
    }

    return this.tenants.filter((tenant) =>
      (tenant.name || '').toLowerCase().includes(filter) ||
      (tenant.subscriptionPlan || 'small').toLowerCase().includes(filter)
    );
  }

  get statsFilteredTenants(): Tenant[] {
    const search = this.statsSearchFilter.trim().toLowerCase();
    const planFilter = this.statsPlanFilter.trim().toLowerCase();

    return this.tenants.filter((tenant) => {
      const name = (tenant.name || '').toLowerCase();
      const plan = (tenant.subscriptionPlan || 'small').toLowerCase();
      const matchesSearch = !search || name.includes(search) || plan.includes(search) || String(tenant.usersCount || 0).includes(search) || String(tenant.filesCount || 0).includes(search);
      const matchesPlan = !planFilter || plan === planFilter;
      return matchesSearch && matchesPlan;
    });
  }

  get statsSortedTenants(): Tenant[] {
    return [...this.statsFilteredTenants].sort((a, b) => {
      const aValue = a.storageUsed || 0;
      const bValue = b.storageUsed || 0;
      return this.statsSortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    });
  }

  get statsTotalPages(): number {
    return Math.max(1, Math.ceil(this.statsSortedTenants.length / this.statsPageSize));
  }

  get statsPaginatedTenants(): Tenant[] {
    const page = Math.min(Math.max(this.statsPage, 1), this.statsTotalPages);
    const start = (page - 1) * this.statsPageSize;
    return this.statsSortedTenants.slice(start, start + this.statsPageSize);
  }

  activeTab: 'plans' | 'config' | 'stats' = 'plans';
  readonly tabs: Array<{ id: 'plans' | 'config' | 'stats'; label: string; icon: string }> = [
    { id: 'plans', label: 'Gestion des Plans', icon: '📋' },
    { id: 'config', label: 'Configuration Quota', icon: '⚙️' },
    { id: 'stats', label: 'Statistiques', icon: '📈' }
  ];

  // When set, renders tenant details inline under the stats tab
  inlineTenantId: string | null = null;

  quotaForm = this.fb.nonNullable.group({
    subscriptionPlan: ['small' as Tenant['subscriptionPlan']],
    tenantStorageGb: [10],
    tenantMaxUsers: [25],
    tenantMaxFiles: [10000],
    tenantMaxFolders: [200],
    userStorageGb: [10],
    userMaxFiles: [2000],
    userDailyUploadGb: [2]
  });

  ngOnInit(): void {
    this.loadPlans();
    // capture query param early so we can open details after tenants load
    const qTenant = this.route.snapshot.queryParamMap.get('tenant');
    if (qTenant) this.initialTenantToOpen = qTenant;
    this.loadTenants();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  refresh(): void {
    this.loadPlans();
    this.loadTenants();
  }

  setActiveTab(tab: 'plans' | 'config' | 'stats'): void {
    this.activeTab = tab;
  }

  selectTenant(tenantId: string): void {
    this.selectedTenantId = tenantId;
    this.selectedUserId = '';
    this.selectedUserQuota = null;
    this.selectedTenant = this.tenants.find((tenant) => tenant._id === tenantId) || null;
    this.loadTenantQuota();
    this.loadTenantUsers();
  }

  openTenantDetails(tenant: Tenant): void {
    if (!tenant._id) {
      return;
    }

    // Open inline tenant details inside the stats tab instead of navigating away
    this.activeTab = 'stats';
    this.inlineTenantId = tenant._id;
    // Persist the opened tenant in the URL so refresh keeps the same view
    try {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { tenant: tenant._id },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    } catch (err) {
      // router may not be available in some test contexts; ignore failures
      console.warn('Unable to update query param for tenant', err);
    }
    // small delay to allow view to render then scroll to the inline details
    setTimeout(() => {
      const el = document.querySelector('.inline-tenant-details');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  closeInlineDetails(): void {
    this.inlineTenantId = null;
    // remove tenant query param so URL stays clean
    try {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { tenant: null },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    } catch (err) {
      console.warn('Unable to clear tenant query param', err);
    }
    // return focus/scroll to the comparison table
    setTimeout(() => {
      const el = document.querySelector('.comparison-table-wrap');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  selectUser(userId: string): void {
    this.selectedUserId = userId;
    if (!userId) {
      this.selectedUserQuota = null;
      return;
    }

    this.userApi.getUserQuotaById(userId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (quota) => {
        this.selectedUserQuota = quota;
      },
      error: (response) => {
        this.notification.error(response?.error?.error || 'Impossible de charger le quota utilisateur');
      }
    });
  }

  applyPlanPreset(plan: 'small' | 'standard' | 'large' | 'unlimited'): void {
    const presets = {
      small: { storage: 10, users: 25, files: 10000, folders: 200, userStorage: 10, userFiles: 2000, daily: 2 },
      standard: { storage: 20, users: 50, files: 50000, folders: 500, userStorage: 20, userFiles: 5000, daily: 5 },
      large: { storage: 30, users: null, files: null, folders: null, userStorage: 30, userFiles: null, daily: null },
      unlimited: { storage: null, users: null, files: null, folders: null, userStorage: null, userFiles: null, daily: null }
    } as const;

    const preset = presets[plan];
    this.quotaForm.patchValue({
      subscriptionPlan: plan,
      tenantStorageGb: preset.storage ?? 0,
      tenantMaxUsers: preset.users ?? 0,
      tenantMaxFiles: preset.files ?? 0,
      tenantMaxFolders: preset.folders ?? 0,
      userStorageGb: preset.userStorage ?? 0,
      userMaxFiles: preset.userFiles ?? 0,
      userDailyUploadGb: preset.daily ?? 0
    });
  }

  onPlanChange(): void {
    const planSlug = this.quotaForm.get('subscriptionPlan')?.value;
    if (!planSlug) return;

    // Try to find the plan from loaded plans
    const selectedPlan = this.plans.find(p => p.slug === planSlug);
    if (selectedPlan) {
      // Apply plan values from dynamic plan data
      const storageGb = selectedPlan.storageBytes ? selectedPlan.storageBytes / (1024 * 1024 * 1024) : null;
      const userStorageGb = selectedPlan.userStorageBytes ? selectedPlan.userStorageBytes / (1024 * 1024 * 1024) : null;
      const userDailyUploadGb = selectedPlan.userDailyUploadBytes ? selectedPlan.userDailyUploadBytes / (1024 * 1024 * 1024) : null;

      this.quotaForm.patchValue({
        tenantStorageGb: storageGb ?? 0,
        tenantMaxUsers: selectedPlan.maxUsers ?? 0,
        tenantMaxFiles: selectedPlan.maxFiles ?? 0,
        tenantMaxFolders: selectedPlan.maxFolders ?? 0,
        userStorageGb: userStorageGb ?? 0,
        userMaxFiles: selectedPlan.userMaxFiles ?? 0,
        userDailyUploadGb: userDailyUploadGb ?? 0
      });
    } else if (['small', 'standard', 'large', 'unlimited'].includes(planSlug)) {
      // Fallback to preset values for default plans
      this.applyPlanPreset(planSlug as 'small' | 'standard' | 'large' | 'unlimited');
    }
  }

  resetToCurrentPlan(): void {
    const plan = this.quotaForm.get('subscriptionPlan')?.value || this.selectedTenantQuota?.subscriptionPlan || 'small';
    this.applyPlanPreset(plan as 'small' | 'standard' | 'large' | 'unlimited');
  }

  saveTenantQuota(): void {
    if (!this.selectedTenantId) {
      this.notification.warning('Selectionne un tenant');
      return;
    }

    const value = this.quotaForm.getRawValue();
    const toBytes = (gb: number | null | undefined) => {
      if (gb === null || gb === undefined || gb <= 0) {
        return null;
      }
      return gb * 1024 * 1024 * 1024;
    };

    const quotaOverrides = {
      tenant: {
        storageBytes: value.subscriptionPlan === 'unlimited' ? null : toBytes(value.tenantStorageGb),
        maxUsers: value.subscriptionPlan === 'large' || value.subscriptionPlan === 'unlimited' ? null : value.tenantMaxUsers || null,
        maxFiles: value.subscriptionPlan === 'large' || value.subscriptionPlan === 'unlimited' ? null : value.tenantMaxFiles || null,
        maxFolders: value.subscriptionPlan === 'large' || value.subscriptionPlan === 'unlimited' ? null : value.tenantMaxFolders || null
      },
      user: {
        storageBytes: value.subscriptionPlan === 'unlimited' ? null : toBytes(value.userStorageGb),
        maxFiles: value.subscriptionPlan === 'large' || value.subscriptionPlan === 'unlimited' ? null : value.userMaxFiles || null,
        maxDailyUploadBytes: value.subscriptionPlan === 'large' || value.subscriptionPlan === 'unlimited' ? null : toBytes(value.userDailyUploadGb)
      }
    };

    this.saving = true;
    this.tenantApi.updateTenantQuota(this.selectedTenantId, {
      quotaOverrides,
      subscriptionPlan: value.subscriptionPlan || this.selectedTenantQuota?.subscriptionPlan || this.selectedTenant?.subscriptionPlan || 'small'
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.notification.success('Quotas mises a jour');
        this.saving = false;
        this.loadTenantQuota();
        this.loadTenants();
      },
      error: (response) => {
        this.notification.error(response?.error?.error || 'Impossible de mettre a jour les quotas');
        this.saving = false;
      }
    });
  }

  get tenantUsagePercent(): number {
    return this.selectedTenantQuota?.storageUsedPercent ?? 0;
  }

  getTenantUsagePercent(tenant: Tenant | null): number {
    if (!tenant || tenant.storageLimit === undefined || tenant.storageLimit === null || tenant.storageLimit <= 0) {
      return 0;
    }

    return Math.min(100, Math.round(((tenant.storageUsed || 0) / tenant.storageLimit) * 100));
  }

  private loadTenants(): void {
    this.loading = true;
    this.tenantApi.getAllTenants().pipe(takeUntil(this.destroy$)).subscribe({
      next: (tenants) => {
        this.tenants = (tenants || []).filter((tenant) => !tenant.isDeleted);
        if (this.initialTenantToOpen) {
          const found = this.tenants.find(t => t._id === this.initialTenantToOpen);
          if (found) {
            this.activeTab = 'stats';
            this.openTenantDetails(found);
            this.initialTenantToOpen = null;
            this.loading = false;
            return;
          }
        }

        if (!this.selectedTenantId && this.tenants.length > 0) {
          this.selectTenant(this.tenants[0]._id || '');
        } else {
          this.loadTenantQuota();
          this.loadTenantUsers();
        }
        this.loading = false;
      },
      error: (response) => {
        this.notification.error(response?.error?.error || 'Impossible de charger les tenants');
        this.loading = false;
      }
    });
  }

  private loadTenantQuota(): void {
    if (!this.selectedTenantId) {
      this.selectedTenantQuota = null;
      return;
    }

    this.tenantApi.getTenantQuota(this.selectedTenantId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (quota) => {
        this.selectedTenantQuota = quota;
        this.selectedTenant = this.tenants.find((tenant) => tenant._id === this.selectedTenantId) || null;
        const plan = quota.subscriptionPlan || this.selectedTenant?.subscriptionPlan || 'small';
        const tenantOverrides = this.selectedTenant?.quotaOverrides;

        if (tenantOverrides) {
          const toGb = (bytes?: number | null) => bytes ? Math.round(bytes / (1024 * 1024 * 1024)) : 0;
          this.quotaForm.patchValue({
            subscriptionPlan: plan,
            tenantStorageGb: toGb(tenantOverrides.tenant?.storageBytes),
            tenantMaxUsers: tenantOverrides.tenant?.maxUsers ?? 0,
            tenantMaxFiles: tenantOverrides.tenant?.maxFiles ?? 0,
            tenantMaxFolders: tenantOverrides.tenant?.maxFolders ?? 0,
            userStorageGb: toGb(tenantOverrides.user?.storageBytes),
            userMaxFiles: tenantOverrides.user?.maxFiles ?? 0,
            userDailyUploadGb: toGb(tenantOverrides.user?.maxDailyUploadBytes)
          });
        } else if (['small', 'standard', 'large', 'unlimited'].includes(plan)) {
          this.applyPlanPreset(plan as 'small' | 'standard' | 'large' | 'unlimited');
        } else {
          this.quotaForm.patchValue({
            subscriptionPlan: plan,
            tenantStorageGb: quota.storageLimit ? Math.round(quota.storageLimit / (1024 * 1024 * 1024)) : 0,
            tenantMaxUsers: quota.maxUsers ?? 0,
            tenantMaxFiles: quota.maxFiles ?? 0,
            tenantMaxFolders: quota.maxFolders ?? 0,
            userStorageGb: quota.userStorageLimit ? Math.round(quota.userStorageLimit / (1024 * 1024 * 1024)) : 0,
            userMaxFiles: quota.userMaxFiles ?? 0,
            userDailyUploadGb: quota.userDailyUploadLimit ? Math.round(quota.userDailyUploadLimit / (1024 * 1024 * 1024)) : 0
          });
        }
      },
      error: () => {
        this.selectedTenantQuota = null;
      }
    });
  }

  private loadTenantUsers(): void {
    if (!this.selectedTenantId) {
      this.users = [];
      return;
    }

    this.userApi.getUsersByTenant(this.selectedTenantId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (users) => {
        this.users = users || [];
      },
      error: () => {
        this.users = [];
      }
    });
  }

  formatBytes(bytes: number | null | undefined): string {
    return this.analytics.formatBytes(bytes || 0);
  }

  // Plan management methods
  private formatPlanLimit(value: number | null, unit: string = ''): string {
    if (value === null || value === undefined) {
      return 'Illimité';
    }

    return unit ? `${value} ${unit}` : String(value);
  }

  getPlanStorage(plan: Plan): string {
    if (plan.storageBytes === null || plan.storageBytes === undefined) {
      return 'Illimité';
    }

    return `${Math.round(plan.storageBytes / (1024 * 1024 * 1024))} GB`;
  }

  getPlanUsers(plan: Plan): string {
    return this.formatPlanLimit(plan.maxUsers, 'utilisateurs');
  }

  getPlanFiles(plan: Plan): string {
    return this.formatPlanLimit(plan.maxFiles, 'fichiers');
  }

  getTenantsByPlan(plan: string): number {
    return this.tenants.filter(tenant => (tenant.subscriptionPlan || 'small') === plan).length;
  }

  getTenantCountByPlan(plan: Plan): number {
    return this.tenants.filter(tenant => (tenant.subscriptionPlan || 'small') === plan.slug).length;
  }

  getPlanIcon(plan: Plan | string): string {
    const slug = typeof plan === 'string' ? plan : plan.slug;
    const icons: { [key: string]: string } = {
      small: '📦',
      standard: '📦📦',
      large: '📦📦📦',
      unlimited: '∞'
    };
    return icons[slug] || '📋';
  }

  getActivePlans(): Plan[] {
    return this.plans.filter((plan) => plan.isActive !== false);
  }

  getActivePlanCount(): number {
    return this.getActivePlans().length;
  }

  getPlanStatusLabel(plan: Plan): string {
    return plan.isActive === false ? 'Inactif' : 'Actif';
  }

  // Statistics methods
  getTotalStorageUsed(): string {
    const total = this.tenants.reduce((sum, tenant) => sum + (tenant.storageUsed || 0), 0);
    return this.formatBytes(total);
  }

  getTotalUsers(): number {
    return this.tenants.reduce((sum, tenant) => sum + (tenant.usersCount || 0), 0);
  }

  getTotalTenants(): number {
    return this.tenants.length;
  }

  getTotalFiles(): number {
    return this.tenants.reduce((sum, tenant) => sum + (tenant.filesCount || 0), 0);
  }

  getTotalStorageUsedRaw(): number {
    return this.tenants.reduce((sum, tenant) => sum + (tenant.storageUsed || 0), 0);
  }

  getTotalStorageUsedFormatted(): string {
    return this.formatBytes(this.getTotalStorageUsedRaw());
  }

  getGlobalStorageLimitRaw(): number {
    return this.tenants.reduce((sum, tenant) => sum + (tenant.storageLimit || 0), 0);
  }

  getGlobalStoragePercent(): number {
    const limit = this.getGlobalStorageLimitRaw();
    if (!limit) return 0;
    return Math.min(100, Math.round((this.getTotalStorageUsedRaw() / limit) * 100));
  }

  getGlobalStorageLimitFormatted(): string {
    const limit = this.getGlobalStorageLimitRaw();
    return limit ? this.formatBytes(limit) : 'Unlimited';
  }

  getRemainingStorageFormatted(): string {
    const limit = this.getGlobalStorageLimitRaw();
    const remaining = Math.max(limit - this.getTotalStorageUsedRaw(), 0);
    return limit ? this.formatBytes(remaining) : 'Unlimited';
  }

  getAverageUsageLabel(): string {
    return `${this.getAverageUsagePercent()}%`;
  }

  getWarningAlerts(): number {
    return this.tenants.filter(tenant => {
      const percent = this.getTenantUsagePercent(tenant);
      return percent >= 80 && percent < 90;
    }).length;
  }

  getHealthyTenantsCount(): number {
    return this.tenants.filter(tenant => this.getTenantUsagePercent(tenant) < 70).length;
  }

  getQuotaDistribution(): { label: string; count: number; percent: number; tone: 'success' | 'warning' | 'danger' }[] {
    const total = this.tenants.length || 1;
    const safe = this.getHealthyTenantsCount();
    const warning = this.getWarningAlerts();
    const danger = this.getCriticalAlerts();

    return [
      { label: 'Healthy', count: safe, percent: Math.round((safe / total) * 100), tone: 'success' },
      { label: 'Warning', count: warning, percent: Math.round((warning / total) * 100), tone: 'warning' },
      { label: 'Critical', count: danger, percent: Math.round((danger / total) * 100), tone: 'danger' }
    ];
  }

  getPlanUsageCount(slug: string): number {
    return this.tenants.filter(tenant => (tenant.subscriptionPlan || 'small') === slug).length;
  }

  getPlanDistribution(): { label: string; count: number; percent: number; tone: 'success' | 'warning' | 'danger' }[] {
    const total = this.getTotalTenants() || 1;
    return this.plans.map((plan) => {
      const count = this.getPlanUsageCount(plan.slug);
      const percent = Math.round((count / total) * 100);
      const tone: 'success' | 'warning' | 'danger' = plan.slug === 'unlimited' ? 'warning' : 'success';
      return { label: plan.name, count, percent, tone };
    }).sort((a, b) => b.count - a.count);
  }

  getQuotaUsageBuckets(): { label: string; count: number; percent: number }[] {
    const buckets = [0, 20, 40, 60, 80, 100];
    const total = this.getTotalTenants() || 1;
    return buckets.map((threshold, index) => {
      const min = index === 0 ? 0 : buckets[index - 1];
      const max = threshold;
      const count = this.tenants.filter((tenant) => {
        const usage = this.getTenantUsagePercent(tenant);
        return index === 0 ? usage < max : usage >= min && usage < max;
      }).length;
      const label = index === 0 ? `0–${max}%` : index === buckets.length - 1 ? `${min}%+` : `${min}–${max}%`;
      return { label, count, percent: Math.round((count / total) * 100) };
    });
  }

  getTopTenantUsageSeries(): { label: string; percent: number }[] {
    return [...this.tenants]
      .sort((a, b) => this.getTenantUsagePercent(b) - this.getTenantUsagePercent(a))
      .slice(0, 8)
      .map((tenant) => ({
        label: tenant.name || 'Tenant',
        percent: this.getTenantUsagePercent(tenant)
      }));
  }

  getTenantUsageTrendPoints(): string {
    const series = this.getTopTenantUsageSeries();
    if (series.length === 0) return '';
    const step = series.length > 1 ? 220 / (series.length - 1) : 0;
    return series
      .map((entry, index) => `${20 + index * step},${100 - entry.percent}`)
      .join(' ');
  }

  getHealthPieGradient(): string {
    const dist = this.getQuotaDistribution();
    const [healthy, warning, danger] = dist;
    const healthyEnd = healthy.percent;
    const warningEnd = healthy.percent + warning.percent;
    return `conic-gradient(#10b981 0% ${healthyEnd}%, #f59e0b ${healthyEnd}% ${warningEnd}%, #ef4444 ${warningEnd}% 100%)`;
  }

  getCriticalAlerts(): number {
    return this.tenants.filter(tenant => this.getTenantUsagePercent(tenant) >= 90).length;
  }

  getFullQuotaCount(): number {
    return this.tenants.filter(tenant => this.isQuotaFull(tenant)).length;
  }

  getAverageUsagePercent(): number {
    if (this.tenants.length === 0) return 0;
    const total = this.tenants.reduce((sum, tenant) => sum + this.getTenantUsagePercent(tenant), 0);
    return Math.round(total / this.tenants.length);
  }

  getUsageStatus(percent: number | null | undefined): string {
    if (!percent) return 'normal';
    if (percent >= 90) return 'danger';
    if (percent >= 80) return 'warning';
    return 'normal';
  }

  getUsageStatusText(percent: number | null | undefined): string {
    if (!percent) return 'Normal';
    if (percent >= 90) return 'Critique';
    if (percent >= 80) return 'Alerte';
    return 'Normal';
  }

  getTenantStatus(tenant: Tenant): string {
    const percent = this.getTenantUsagePercent(tenant);
    return this.getUsageStatus(percent);
  }

  getTenantStatusText(tenant: Tenant): string {
    const percent = this.getTenantUsagePercent(tenant);
    return this.getUsageStatusText(percent);
  }

  // Assign plan to tenant
  changeTenantPlan(tenantId: string): void {
    if (!tenantId) return;
    const tenant = this.tenants.find(t => t._id === tenantId);
    if (!tenant) return;

    const currentPlan = tenant.subscriptionPlan || 'small';
    const planIndex = this.plans.findIndex(p => p.slug === currentPlan);
    const nextIndex = (planIndex + 1) % this.plans.length;
    const newPlan = this.plans[nextIndex];

    if (!newPlan) return;

    this.saving = true;
    this.tenantApi.updateTenantQuota(tenantId, {
      subscriptionPlan: newPlan.slug,
      quotaOverrides: tenant.quotaOverrides || {
        tenant: {},
        user: {}
      }
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.notification.success(`Plan changé en ${newPlan.name}`);
        this.saving = false;
        this.loadTenants();
      },
      error: (response) => {
        this.notification.error(response?.error?.error || 'Impossible de changer le plan');
        this.saving = false;
      }
    });
  }

  // Get quota availability percentage
  getQuotaAvailablePercent(tenant: Tenant | null): number {
    if (!tenant) return 100;
    return 100 - this.getTenantUsagePercent(tenant);
  }

  // Check if quota is critical (>90%)
  isQuotaCritical(tenant: Tenant | null): boolean {
    const percent = this.getTenantUsagePercent(tenant);
    return percent >= 90;
  }

  // Check if quota is full
  isQuotaFull(tenant: Tenant | null): boolean {
    const percent = this.getTenantUsagePercent(tenant);
    return percent >= 100;
  }

  // Get storage used GB
  getStorageUsedGb(tenant: Tenant | null): string {
    if (!tenant || tenant.storageUsed === null || tenant.storageUsed === undefined) {
      return '0';
    }
    return (tenant.storageUsed / (1024 * 1024 * 1024)).toFixed(2);
  }

  // Get storage limit GB
  getStorageLimitGb(tenant: Tenant | null): string {
    if (!tenant || !tenant.storageLimit) {
      return '∞';
    }
    return (tenant.storageLimit / (1024 * 1024 * 1024)).toFixed(2);
  }

  formatPercent(value: number | null | undefined, digits: number = 0): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '0%';
    }
    return `${Number(value).toFixed(digits).replace('.', ',')}%`;
  }

  formatDateLabel(value: string | null | undefined): string {
    if (!value) {
      return 'N/A';
    }

    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(new Date(value));
  }

  private loadPlans(): void {
    this.loadingPlans = true;
    this.tenantApi.getPlans().pipe(takeUntil(this.destroy$)).subscribe({
      next: (plans) => {
        this.plans = plans || [];
        this.loadingPlans = false;
      },
      error: (response) => {
        this.notification.error(response?.error?.error || 'Impossible de charger les plans');
        this.loadingPlans = false;
      }
    });
  }

  private promptText(label: string, currentValue = ''): string | null {
    const value = window.prompt(label, currentValue);
    if (value === null) {
      return null;
    }

    return value.trim();
  }

  private promptGbValue(label: string, currentValue: number | null): number | null | undefined {
    const rawValue = window.prompt(label, currentValue === null ? '' : String(Math.round(currentValue / (1024 * 1024 * 1024))));
    if (rawValue === null) {
      return undefined;
    }

    const normalized = rawValue.trim().toLowerCase();
    if (!normalized || normalized === 'illimite' || normalized === 'illimité') {
      return null;
    }

    const value = Number(normalized);
    if (Number.isNaN(value) || value < 0) {
      this.notification.warning('Valeur invalide');
      return undefined;
    }

    return value * 1024 * 1024 * 1024;
  }

  private promptNumberValue(label: string, currentValue: number | null): number | null | undefined {
    const rawValue = window.prompt(label, currentValue === null ? '' : String(currentValue));
    if (rawValue === null) {
      return undefined;
    }

    const normalized = rawValue.trim().toLowerCase();
    if (!normalized || normalized === 'illimite' || normalized === 'illimité') {
      return null;
    }

    const value = Number(normalized);
    if (Number.isNaN(value) || value < 0) {
      this.notification.warning('Valeur invalide');
      return undefined;
    }

    return value;
  }

  // Plan CRUD persisted in backend
  openCreatePlan(): void {
    this.planModalEditPlan = null;
    this.planModalIsOpen = true;
  }

  editPlan(plan: Plan): void {
    this.planModalEditPlan = plan;
    this.planModalIsOpen = true;
  }

  togglePlanActivation(plan: Plan): void {
    if (plan.isDefault) {
      this.notification.warning('Impossible de désactiver un plan par défaut');
      return;
    }

    const newState = plan.isActive !== false ? false : true;
    const confirmationMessage = newState === false
      ? `Êtes-vous sûr de vouloir désactiver le plan "${plan.name}" ? Les tenants utilisant ce plan ne pourront plus uploader.`
      : `Êtes-vous sûr de vouloir réactiver le plan "${plan.name}" ?`;

    if (!confirm(confirmationMessage)) {
      return;
    }

    const payload = {
      slug: plan.slug,
      name: plan.name,
      description: plan.description ?? '',
      storageBytes: plan.storageBytes,
      maxUsers: plan.maxUsers,
      maxFiles: plan.maxFiles,
      maxFolders: plan.maxFolders,
      userStorageBytes: plan.userStorageBytes,
      userMaxFiles: plan.userMaxFiles,
      userDailyUploadBytes: plan.userDailyUploadBytes,
      sortOrder: plan.sortOrder || 1,
      isActive: newState
    };

    this.saving = true;
    this.tenantApi.updatePlan(plan.slug, payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.notification.success(`Plan "${plan.name}" ${newState ? 'réactivé' : 'désactivé'} avec succès`);
        this.saving = false;
        this.loadPlans();
        this.loadTenants();
      },
      error: (response) => {
        this.notification.error(response?.error?.error || 'Impossible de mettre à jour l’état du plan');
        this.saving = false;
      }
    });
  }

  deletePlan(plan: Plan): void {
    if (plan.isDefault) {
      this.notification.warning('Impossible de supprimer un plan par défaut');
      return;
    }

    if (!confirm(`Êtes-vous sûr de vouloir supprimer le plan "${plan.name}" ?`)) {
      return;
    }

    this.tenantApi.deletePlan(plan.slug).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.notification.success(`Plan "${plan.name}" supprimé avec succès`);
        this.loadPlans();
        this.loadTenants();
      },
      error: (response) => {
        this.notification.error(response?.error?.error || 'Impossible de supprimer le plan');
      }
    });
  }

  onPlanModalClose(): void {
    this.planModalIsOpen = false;
    this.planModalEditPlan = null;
  }

  onPlanModalSave(planData: Partial<Plan>): void {
    if (!planData.slug) {
      this.notification.warning('Le slug du plan est requis');
      return;
    }

    const isEditMode = !!this.planModalEditPlan;

    // Convert Partial<Plan> to proper payload, removing undefined values
    const payload = {
      slug: planData.slug,
      name: planData.name || '',
      description: planData.description ?? undefined,
      storageBytes: planData.storageBytes ?? null,
      maxUsers: planData.maxUsers ?? null,
      maxFiles: planData.maxFiles ?? null,
      maxFolders: planData.maxFolders ?? null,
      userStorageBytes: planData.userStorageBytes ?? null,
      userMaxFiles: planData.userMaxFiles ?? null,
      userDailyUploadBytes: planData.userDailyUploadBytes ?? null,
      sortOrder: planData.sortOrder || 1,
      isActive: planData.isActive !== false
    } as const;

    if (isEditMode && this.planModalEditPlan) {
      // Update existing plan
      this.tenantApi.updatePlan(this.planModalEditPlan.slug, payload as any).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.notification.success(`Plan "${payload.name}" modifié avec succès`);
          this.planModalIsOpen = false;
          this.planModalEditPlan = null;
          this.loadPlans();
          this.loadTenants();
        },
        error: (response) => {
          this.notification.error(response?.error?.error || 'Impossible de modifier le plan');
        }
      });
    } else {
      // Create new plan
      if (this.plans.some((plan) => plan.slug === payload.slug)) {
        this.notification.warning(`Un plan avec le slug "${payload.slug}" existe déjà`);
        return;
      }

      this.tenantApi.createPlan(payload as any).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.notification.success(`Plan "${payload.name}" créé avec succès`);
          this.planModalIsOpen = false;
          this.planModalEditPlan = null;
          this.loadPlans();
        },
        error: (response) => {
          this.notification.error(response?.error?.error || 'Impossible de créer le plan');
        }
      });
    }
  }
}
