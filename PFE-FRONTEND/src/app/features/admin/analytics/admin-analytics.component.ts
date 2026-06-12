import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgChartsModule } from 'ng2-charts';
import { Chart, ChartConfiguration, ChartOptions, registerables } from 'chart.js';
import { catchError, forkJoin, of, tap } from 'rxjs';
import {
  AdminAlert,
  AdminApiService,
  AdminStatsReport,
  TenantStatsReport
} from '../../../core/services/admin-api.service';
import { AuthStorageService } from '../../../core/services/auth-storage.service';
import { TenantApiService, TenantQuotaSummary } from '../../../core/services/tenant-api.service';
import { ShareHistoryApiService } from '../../../core/services/share-history-api.service';
import { ComplaintApiService } from '../../../core/services/complaint-api.service';
import { FileOwner, MalwareAlert, SecureFile } from '../../../core/models/file.model';
import { Tenant } from '../../../core/models/tenant.model';
import {
  Complaint,
  ComplaintListResponse,
  ComplaintStatsResponse
} from '../../../core/models/complaint.model';
import { ShareHistory, ShareHistoryResponse } from '../../../core/models/share-history.model';

Chart.register(...registerables);

interface AdminSummary {
  totalUsers: number;
  totalTenants: number;
  totalFiles: number;
  totalStorage: number;
  totalStorageLimit: number;
  storageUsagePercent: number;
  totalUploads: number;
  totalDownloads: number;
  totalShares: number;
  activeUsers: number;
  verifiedUsers: number;
  adminUsers: number;
  activeTenants: number;
  avgFilesPerTenant: number;
  malwareDetected: number;
}

interface TenantTableRow {
  tenantId: string;
  tenantName: string;
  userCount: number;
  fileCount: number;
  storageUsed: number;
  riskCount: number;
  quotaPercent: number;
  lastActivity: string;
}

interface MetricCard {
  label: string;
  value: string;
  detail: string;
  accent: 'primary' | 'cool' | 'warm' | 'neutral' | 'danger' | 'success';
}

interface BreakdownItem {
  key: string;
  label: string;
  count: number;
}

interface TenantShareSummary {
  totalShares: number;
  totalDownloads: number;
  totalViews: number;
  byStatus: BreakdownItem[];
  byType: BreakdownItem[];
}

interface TenantComplaintSummary {
  total: number;
  openOverdue: number;
  byStatus: BreakdownItem[];
  byPriority: BreakdownItem[];
}

type PeriodValue = '7' | '30' | '90' | '365';
type DashboardSectionKey =
  | 'globalOverview'
  | 'globalCharts'
  | 'globalSignals'
  | 'tenantOverview'
  | 'tenantSecurity'
  | 'tenantUsage'
  | 'tenantQuota'
  | 'tenantShares'
  | 'tenantComplaints';

@Component({
  standalone: true,
  selector: 'app-admin-analytics',
  imports: [CommonModule, FormsModule, NgChartsModule],
  templateUrl: './admin-analytics.component.html',
  styleUrls: ['./admin-analytics.component.scss']
})
export class AdminAnalyticsComponent implements OnInit {
  private readonly adminApi = inject(AdminApiService);
  private readonly authStorage = inject(AuthStorageService);
  private readonly tenantApi = inject(TenantApiService);
  private readonly shareHistoryApi = inject(ShareHistoryApiService);
  private readonly complaintApi = inject(ComplaintApiService);

  selectedPeriod: PeriodValue = '30';
  selectedTenant = '';

  isSuperAdmin = false;
  currentTenantName = '';
  lastUpdatedAt = '';

  loading = false;
  tenantLoading = false;
  error = '';
  tenantError = '';

  tenants: Tenant[] = [];
  globalStats: AdminStatsReport | null = null;
  tenantDetailStats: AdminStatsReport | null = null;
  summary: AdminSummary = this.getEmptySummary();

  sectionOpen: Record<DashboardSectionKey, boolean> = {
    globalOverview: false,
    globalCharts: false,
    globalSignals: false,
    tenantOverview: false,
    tenantSecurity: false,
    tenantUsage: false,
    tenantQuota: false,
    tenantShares: false,
    tenantComplaints: false
  };

  globalSnapshotCards: MetricCard[] = [];
  globalHighlightCards: MetricCard[] = [];
  tenantOverviewCards: MetricCard[] = [];
  tenantSecurityCards: MetricCard[] = [];
  tenantUsageCards: MetricCard[] = [];
  tenantQuotaCards: MetricCard[] = [];
  tenantShareCards: MetricCard[] = [];
  tenantComplaintCards: MetricCard[] = [];

  globalActionAlerts: AdminAlert[] = [];
  globalAlerts: MalwareAlert[] = [];
  selectedAlert: MalwareAlert | null = null;

  tenantTableRows: TenantTableRow[] = [];
  tenantFiles: SecureFile[] = [];
  tenantThreatFiles: MalwareAlert[] = [];
  tenantRecentAlerts: MalwareAlert[] = [];
  tenantQuota: TenantQuotaSummary | null = null;
  tenantShareSummary: TenantShareSummary | null = null;
  tenantComplaintSummary: TenantComplaintSummary | null = null;
  tenantRecentShares: ShareHistory[] = [];
  tenantRecentComplaints: Complaint[] = [];

  private allFilesCache: SecureFile[] = [];
  private allFilesLoaded = false;

  globalActivityTrendChartData: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  globalStorageByTenantChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  globalUsersByTenantChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  globalActiveTenantChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  globalRiskByTenantChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  globalQuotaPressureChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  globalActivityMixChartData: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };

  tenantSecurityByUserChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  tenantFileStatusChartData: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };
  tenantFileTypeChartData: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };
  tenantThreatMixChartData: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };
  tenantUsageTrendChartData: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  tenantQuotaCapacityChartData: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };
  tenantQuotaLimitsChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  tenantShareStatusChartData: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };
  tenantShareTypeChartData: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };
  tenantComplaintStatusChartData: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };
  tenantComplaintPriorityChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };

  readonly lineChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 520,
      easing: 'easeOutQuart'
    },
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          color: '#334155'
        }
      },
      tooltip: {
        backgroundColor: '#10223d',
        titleColor: '#ffffff',
        bodyColor: '#d8e7ff',
        borderColor: '#2d4f82',
        borderWidth: 1,
        padding: 10
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(148, 163, 184, 0.12)' },
        ticks: { color: '#64748b' }
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(148, 163, 184, 0.12)' },
        ticks: { precision: 0, color: '#64748b' }
      }
    }
  };

  readonly barChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 500,
      easing: 'easeOutQuart'
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#10223d',
        titleColor: '#ffffff',
        bodyColor: '#d8e7ff',
        borderColor: '#2d4f82',
        borderWidth: 1,
        padding: 10
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b' }
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(148, 163, 184, 0.12)' },
        ticks: { precision: 0, color: '#64748b' }
      }
    }
  };

  readonly horizontalBarChartOptions: ChartOptions<'bar'> = {
    ...this.barChartOptions,
    indexAxis: 'y',
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: 'rgba(148, 163, 184, 0.12)' },
        ticks: { precision: 0, color: '#64748b' }
      },
      y: {
        grid: { display: false },
        ticks: { color: '#475569' }
      }
    }
  };

  readonly percentBarChartOptions: ChartOptions<'bar'> = {
    ...this.barChartOptions,
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b' }
      },
      y: {
        beginAtZero: true,
        max: 100,
        grid: { color: 'rgba(148, 163, 184, 0.12)' },
        ticks: {
          color: '#64748b',
          callback: (value) => `${value}%`
        }
      }
    }
  };

  readonly doughnutChartOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 560,
      easing: 'easeOutQuart'
    },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          color: '#475569'
        }
      },
      tooltip: {
        backgroundColor: '#10223d',
        titleColor: '#ffffff',
        bodyColor: '#d8e7ff',
        borderColor: '#2d4f82',
        borderWidth: 1,
        padding: 10
      }
    },
    cutout: '66%'
  };

  ngOnInit(): void {
    this.isSuperAdmin = this.authStorage.isSuperAdmin();
    const session = this.authStorage.getSession();
    this.currentTenantName = session?.tenantName || '';

    if (!this.isSuperAdmin && session?.tenantId) {
      this.selectedTenant = session.tenantId;
    }

    this.loadTenantOptions();
    this.reload();
  }

  get selectedPeriodLabel(): string {
    if (this.selectedPeriod === '7') return '7 jours';
    if (this.selectedPeriod === '30') return '30 jours';
    if (this.selectedPeriod === '90') return '90 jours';
    return '12 mois';
  }

  get selectedTenantName(): string {
    if (!this.selectedTenant) {
      return this.isSuperAdmin ? 'Aucun tenant selectionne' : (this.currentTenantName || 'Mon tenant');
    }

    const tenant = this.tenants.find((item) => item._id === this.selectedTenant);
    return tenant?.name || this.currentTenantName || 'Tenant selectionne';
  }

  get selectedTenantPlan(): string {
    if (this.tenantQuota?.subscriptionPlan) {
      return this.tenantQuota.subscriptionPlan;
    }

    const tenant = this.tenants.find((item) => item._id === this.selectedTenant);
    return tenant?.subscriptionPlan || 'n/a';
  }

  get hasTenantSelection(): boolean {
    return !!this.selectedTenant;
  }

  reload(): void {
    this.loading = true;
    this.error = '';

    const { startDate, endDate } = this.buildDateRange();

    forkJoin({
      stats: this.adminApi.getAdminStats({ startDate, endDate }).pipe(
        catchError((response) => {
          console.error('Admin global stats error:', response);
          return of(null);
        })
      ),
      alerts: this.adminApi.getMalwareAlerts({ limit: 8 }).pipe(
        catchError((response) => {
          console.error('Global alert loading error:', response);
          return of(this.getEmptyAlertResponse());
        })
      )
    }).subscribe({
      next: ({ stats, alerts }) => {
        if (!this.isValidStats(stats)) {
          this.resetGlobalState();
          this.error = 'Impossible de charger les statistiques administrateur';
          this.loading = false;
          this.clearTenantDetailState();
          return;
        }

        this.globalStats = stats;
        this.applyGlobalStats(stats);
        this.globalActionAlerts = Array.isArray(stats.alerts) ? stats.alerts : [];
        this.globalAlerts = alerts.data || [];
        this.selectedAlert = this.globalAlerts[0] || null;
        this.lastUpdatedAt = new Date().toISOString();
        this.loading = false;

        this.initializeSections();
        this.loadTenantDetail();
      },
      error: (response) => {
        this.resetGlobalState();
        this.error = response?.error?.error ?? 'Impossible de charger les statistiques administrateur';
        this.loading = false;
        this.clearTenantDetailState();
      }
    });
  }

  onPeriodChange(): void {
    this.reload();
  }

  onTenantChange(): void {
    this.initializeSections();
    this.loadTenantDetail();
  }

  toggleSection(section: DashboardSectionKey): void {
    this.sectionOpen[section] = !this.sectionOpen[section];
  }

  private initializeSections(): void {
    // Fermer toutes les sections
    (Object.keys(this.sectionOpen) as DashboardSectionKey[]).forEach((section) => {
      this.sectionOpen[section] = false;
    });

    // Ouvrir les sections appropriées basées sur la sélection du tenant
    if (this.hasTenantSelection) {
      // Tenant sélectionné : ouvrir les sections tenant
      this.sectionOpen.tenantOverview = true;
      this.sectionOpen.tenantSecurity = true;
      this.sectionOpen.tenantUsage = true;
      this.sectionOpen.tenantQuota = true;
      this.sectionOpen.tenantShares = true;
      this.sectionOpen.tenantComplaints = true;
    } else {
      // Vue globale : ouvrir les sections globales
      this.sectionOpen.globalOverview = true;
      this.sectionOpen.globalSignals = true;
    }
  }

  setAllSections(open: boolean): void {
    (Object.keys(this.sectionOpen) as DashboardSectionKey[]).forEach((section) => {
      this.sectionOpen[section] = open;
    });
  }

  selectAlert(alert: MalwareAlert): void {
    this.selectedAlert = alert;
  }

  hasChartData(data: { datasets?: Array<{ data?: unknown[] }> } | null | undefined): boolean {
    return !!data?.datasets?.some((dataset) =>
      Array.isArray(dataset.data) && dataset.data.some((value) => Number(value) > 0)
    );
  }

  formatBytes(bytes: number): string {
    const safeBytes = Number(bytes || 0);
    if (!safeBytes) return '0 B';

    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.floor(Math.log(safeBytes) / Math.log(1024));
    const value = safeBytes / Math.pow(1024, index);
    return `${Math.round(value * 100) / 100} ${sizes[index]}`;
  }

  formatDateTime(value: string | null | undefined): string {
    if (!value) return '-';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }

  formatRelativeTime(value: string | null | undefined): string {
    if (!value) return 'Aucune activite recente';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Aucune activite recente';

    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'A l instant';
    if (minutes < 60) return `Il y a ${minutes} min`;
    if (hours < 24) return `Il y a ${hours} h`;
    if (days < 7) return `Il y a ${days} j`;
    return this.formatDateTime(value);
  }

  formatMetric(value: number): string {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return String(value);
  }

  getOwnerDisplayName(file: SecureFile | MalwareAlert): string {
    const owner = file.ownerId;
    if (!owner) return 'Owner unknown';
    if (typeof owner === 'string') return owner;

    const ownerRecord = owner as FileOwner;
    const fullName = `${ownerRecord.firstName || ''} ${ownerRecord.lastName || ''}`.trim();
    return fullName || ownerRecord.email || ownerRecord._id || 'Owner unknown';
  }

  getAlertBadge(alert: MalwareAlert): string {
    const threatState = this.getThreatState(alert);
    if (threatState === 'blocked') return 'Blocked';
    if (threatState === 'quarantined') return 'Quarantined';

    if (alert?.scanMetadata?.virustotalResult?.isInfected) {
      return 'VirusTotal';
    }

    if (alert?.scanMetadata?.clamavResult?.isInfected) {
      return 'ClamAV';
    }

    return 'Suspicious';
  }

  getSeverityTone(severity?: string): 'danger' | 'warm' | 'success' {
    if (severity === 'high') return 'danger';
    if (severity === 'medium') return 'warm';
    return 'success';
  }

  getShareTone(status?: string): 'primary' | 'danger' | 'neutral' {
    if (status === 'active') return 'primary';
    if (status === 'revoked') return 'danger';
    return 'neutral';
  }

  getComplaintTone(status?: string): 'primary' | 'warm' | 'success' | 'danger' | 'neutral' {
    if (status === 'open' || status === 'pending_user') return 'warm';
    if (status === 'in_progress') return 'primary';
    if (status === 'resolved') return 'success';
    if (status === 'rejected') return 'danger';
    return 'neutral';
  }

  getPriorityTone(priority?: string): 'success' | 'primary' | 'warm' | 'danger' {
    if (priority === 'urgent') return 'danger';
    if (priority === 'high') return 'warm';
    if (priority === 'medium') return 'primary';
    return 'success';
  }

  getOperationalState(file: SecureFile | MalwareAlert): string {
    const threatState = this.getThreatState(file);
    if (threatState === 'blocked') return 'Blocked';
    if (threatState === 'quarantined') return 'Quarantined';
    if (threatState === 'suspicious') return 'Suspicious';

    const status = String(file.status || '').toLowerCase();
    if (!status) return 'Unknown';
    return this.formatKeyLabel(status);
  }

  getShareRecipient(share: ShareHistory): string {
    return share.sharedWith?.email || 'Recipient unknown';
  }

  private loadTenantOptions(): void {
    if (!this.isSuperAdmin) {
      return;
    }

    this.adminApi.getTenantsList().subscribe({
      next: (tenants) => {
        this.tenants = Array.isArray(tenants) ? tenants : [];

        if (this.selectedTenant && !this.tenants.some((item) => item._id === this.selectedTenant)) {
          this.selectedTenant = '';
          this.clearTenantDetailState();
        }
      },
      error: () => {
        this.tenants = [];
      }
    });
  }

  private loadTenantDetail(): void {
    if (!this.selectedTenant) {
      this.clearTenantDetailState();
      return;
    }

    this.tenantLoading = true;
    this.tenantError = '';

    const { startDate, endDate } = this.buildDateRange();

    forkJoin({
      stats: this.adminApi.getAdminStats({
        startDate,
        endDate,
        tenantId: this.selectedTenant
      }).pipe(
        catchError((response) => {
          console.error('Tenant detail stats error:', response);
          return of(null);
        })
      ),
      quota: this.tenantApi.getTenantQuota(this.selectedTenant).pipe(
        catchError((response) => {
          console.error('Tenant quota error:', response);
          return of(null);
        })
      ),
      shareStats: this.shareHistoryApi.getTenantShareStats(this.selectedTenant).pipe(
        catchError((response) => {
          console.error('Tenant share stats error:', response);
          return of(null);
        })
      ),
      recentShares: this.shareHistoryApi.getAdminShareHistory({
        tenantId: this.selectedTenant,
        limit: 6,
        startDate,
        endDate,
        sortBy: '-createdAt'
      }).pipe(
        catchError((response) => {
          console.error('Tenant share history error:', response);
          return of(this.getEmptyShareHistoryResponse());
        })
      ),
      complaintStats: this.complaintApi.getComplaintStats({
        tenantId: this.selectedTenant,
        startDate,
        endDate
      }).pipe(
        catchError((response) => {
          console.error('Tenant complaint stats error:', response);
          return of(null);
        })
      ),
      recentComplaints: this.complaintApi.getAdminComplaints({
        tenantId: this.selectedTenant,
        limit: 6,
        startDate,
        endDate,
        sortBy: '-updatedAt'
      }).pipe(
        catchError((response) => {
          console.error('Tenant complaint list error:', response);
          return of(this.getEmptyComplaintListResponse());
        })
      ),
      files: this.getAllFilesCache$(),
      alerts: this.adminApi.getMalwareAlerts({
        tenantId: this.selectedTenant,
        limit: 6
      }).pipe(
        catchError((response) => {
          console.error('Tenant alert list error:', response);
          return of(this.getEmptyAlertResponse());
        })
      )
    }).subscribe({
      next: ({
        stats,
        quota,
        shareStats,
        recentShares,
        complaintStats,
        recentComplaints,
        files,
        alerts
      }) => {
        if (!this.isValidStats(stats)) {
          this.clearTenantDetailState();
          this.tenantError = 'Impossible de charger la vue detaillee du tenant';
          this.tenantLoading = false;
          return;
        }

        this.tenantDetailStats = stats;
        this.tenantQuota = quota;
        this.tenantShareSummary = this.normalizeShareSummary(shareStats);
        this.tenantComplaintSummary = this.normalizeComplaintSummary(complaintStats);
        this.tenantRecentShares = recentShares.data || [];
        this.tenantRecentComplaints = recentComplaints.data || [];
        this.tenantFiles = (files || []).filter(
          (file) => String(file.tenantId || '') === this.selectedTenant
        );
        this.tenantThreatFiles = this.tenantFiles
          .filter((file) => this.isThreatFile(file as MalwareAlert))
          .map((file) => file as MalwareAlert);
        this.tenantRecentAlerts = alerts.data || [];

        this.buildTenantCards();
        this.buildTenantCharts();

        this.initializeSections();
        this.tenantLoading = false;
      },
      error: (response) => {
        this.clearTenantDetailState();
        this.tenantError = response?.error?.error ?? 'Impossible de charger la vue detaillee du tenant';
        this.tenantLoading = false;
      }
    });
  }

  private applyGlobalStats(stats: AdminStatsReport): void {
    const global = stats.global;
    const meta = stats.meta;
    const totalLimit = Number(global.totalStorageLimit || 0);
    const totalStorage = Number(global.totalStorageUsed || 0);
    const usagePercent = totalLimit > 0 ? this.clampPercentage((totalStorage / totalLimit) * 100) : 0;

    this.summary = {
      totalUsers: Number(global.totalUsers || 0),
      totalTenants: Number(global.totalTenants || 0),
      totalFiles: Number(global.totalFiles || 0),
      totalStorage,
      totalStorageLimit: totalLimit,
      storageUsagePercent: usagePercent,
      totalUploads: Number(stats.activity.uploads || 0),
      totalDownloads: Number(stats.activity.downloads || 0),
      totalShares: Number(stats.activity.shares || 0),
      activeUsers: Number(meta?.activeUsers ?? global.totalUsers ?? 0),
      verifiedUsers: Number(meta?.verifiedUsers || 0),
      adminUsers: Number(meta?.adminUsers || 0),
      activeTenants: stats.tenants.filter((tenant) => tenant.usersCount > 0 || tenant.filesCount > 0).length,
      avgFilesPerTenant: global.totalTenants ? Number(global.totalFiles || 0) / Number(global.totalTenants || 1) : 0,
      malwareDetected: stats.security.totals.suspicious + stats.security.totals.blocked + stats.security.totals.quarantined
    };

    this.tenantTableRows = [...stats.tenants]
      .map((tenant) => ({
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        userCount: tenant.usersCount,
        fileCount: tenant.filesCount,
        storageUsed: tenant.storageUsedBytes,
        riskCount: this.getTenantThreatCount(tenant),
        quotaPercent: Number(tenant.storageUsagePercent || 0),
        lastActivity: tenant.lastActivity || ''
      }))
      .sort((left, right) => right.storageUsed - left.storageUsed);

    this.globalSnapshotCards = [
      {
        label: 'Tenants',
        value: this.formatMetric(this.summary.totalTenants),
        detail: `${this.summary.activeTenants} actifs sur la periode`,
        accent: 'primary'
      },
      {
        label: 'Utilisateurs',
        value: this.formatMetric(this.summary.totalUsers),
        detail: `${this.summary.activeUsers} actifs / ${this.summary.verifiedUsers} verifies`,
        accent: 'cool'
      },
      {
        label: 'Fichiers',
        value: this.formatMetric(this.summary.totalFiles),
        detail: `${this.summary.avgFilesPerTenant.toFixed(1)} fichiers par tenant`,
        accent: 'neutral'
      },
      {
        label: 'Stockage',
        value: this.formatBytes(this.summary.totalStorage),
        detail: totalLimit > 0 ? `${usagePercent.toFixed(0)}% du quota agrege` : 'Sans limite globale',
        accent: 'warm'
      },
      {
        label: 'Partages',
        value: this.formatMetric(this.summary.totalShares),
        detail: `${this.summary.totalDownloads} downloads traces`,
        accent: 'success'
      },
      {
        label: 'Menaces',
        value: this.formatMetric(this.summary.malwareDetected),
        detail: `${stats.security.totals.blocked} bloques, ${stats.security.totals.quarantined} quarantaines`,
        accent: this.summary.malwareDetected > 0 ? 'danger' : 'success'
      }
    ];

    const topActive = stats.insights.mostActiveTenants[0];
    const topRisk = stats.insights.mostSuspiciousTenants[0];
    const topStorage = stats.insights.highestStorageTenants[0];
    const nearQuota = stats.storage.tenantsNearQuota[0];

    this.globalHighlightCards = [
      {
        label: 'Tenant le plus actif',
        value: topActive?.tenantName || '-',
        detail: topActive ? `Score ${topActive.activityScore} sur ${this.selectedPeriodLabel}` : 'Aucune activite remontee',
        accent: 'primary'
      },
      {
        label: 'Tenant le plus sensible',
        value: topRisk?.tenantName || '-',
        detail: topRisk ? `${this.getTenantThreatCount(topRisk)} incidents classes` : 'Pas de menace prioritaire',
        accent: this.summary.malwareDetected > 0 ? 'danger' : 'success'
      },
      {
        label: 'Tenant le plus stockant',
        value: topStorage?.tenantName || '-',
        detail: topStorage ? this.formatBytes(topStorage.storageUsedBytes) : 'Aucune consommation notable',
        accent: 'cool'
      },
      {
        label: 'Pression quota',
        value: nearQuota?.tenantName || 'RAS',
        detail: nearQuota ? `${Math.round(nearQuota.storageUsagePercent || 0)}% de quota utilise` : 'Aucun tenant sous tension',
        accent: nearQuota ? 'warm' : 'success'
      }
    ];

    this.buildGlobalCharts(stats);
  }

  private buildGlobalCharts(stats: AdminStatsReport): void {
    const trendPoints = this.getTrendPoints(stats);

    this.globalActivityTrendChartData = this.buildActivityTrendChart(trendPoints);
    this.globalStorageByTenantChartData = this.buildSingleBarChart(
      stats.storage.topStorageConsumers.slice(0, 8).map((tenant) => tenant.tenantName),
      stats.storage.topStorageConsumers.slice(0, 8).map((tenant) => this.toGigabytes(tenant.storageUsedBytes)),
      ['#2563eb', '#3b82f6', '#38bdf8', '#0ea5a8', '#14b8a6', '#22c55e', '#f59e0b', '#f97316']
    );

    this.globalUsersByTenantChartData = this.buildSingleBarChart(
      [...stats.tenants]
        .sort((left, right) => right.usersCount - left.usersCount)
        .slice(0, 8)
        .map((tenant) => tenant.tenantName),
      [...stats.tenants]
        .sort((left, right) => right.usersCount - left.usersCount)
        .slice(0, 8)
        .map((tenant) => tenant.usersCount),
      ['#0f766e', '#14b8a6', '#2dd4bf', '#5eead4', '#0891b2', '#38bdf8', '#6366f1', '#8b5cf6']
    );

    this.globalActiveTenantChartData = this.buildSingleBarChart(
      stats.insights.mostActiveTenants.slice(0, 8).map((tenant) => tenant.tenantName),
      stats.insights.mostActiveTenants.slice(0, 8).map((tenant) => tenant.activityScore),
      ['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#22c55e', '#16a34a', '#0ea5a8', '#0891b2']
    );

    this.globalRiskByTenantChartData = this.buildSingleBarChart(
      stats.insights.mostSuspiciousTenants.slice(0, 8).map((tenant) => tenant.tenantName),
      stats.insights.mostSuspiciousTenants.slice(0, 8).map((tenant) => this.getTenantThreatCount(tenant)),
      ['#dc2626', '#ef4444', '#f97316', '#f59e0b', '#b91c1c', '#ea580c', '#c2410c', '#fb7185']
    );

    this.globalQuotaPressureChartData = this.buildSingleBarChart(
      stats.storage.usagePerTenant
        .filter((tenant) => Number.isFinite(tenant.storageUsagePercent))
        .slice(0, 8)
        .map((tenant) => tenant.tenantName),
      stats.storage.usagePerTenant
        .filter((tenant) => Number.isFinite(tenant.storageUsagePercent))
        .slice(0, 8)
        .map((tenant) => Math.round(tenant.storageUsagePercent || 0)),
      ['#f59e0b', '#f97316', '#fb7185', '#8b5cf6', '#6366f1', '#38bdf8', '#0ea5a8', '#10b981']
    );

    this.globalActivityMixChartData = this.buildDoughnutChart(
      ['Uploads', 'Shares', 'Downloads'],
      [stats.activity.uploads, stats.activity.shares, stats.activity.downloads],
      ['#2563eb', '#14b8a6', '#f59e0b']
    );
  }

  private buildTenantCards(): void {
    const tenantReport = this.getSelectedTenantReport();
    if (!tenantReport) {
      this.tenantOverviewCards = [];
      this.tenantSecurityCards = [];
      this.tenantUsageCards = [];
      this.tenantQuotaCards = [];
      this.tenantShareCards = [];
      this.tenantComplaintCards = [];
      return;
    }

    const threatCount = this.tenantThreatFiles.length || this.getTenantThreatCount(tenantReport);
    const threatByOwner = this.groupValues(
      this.tenantThreatFiles.map((file) => this.getOwnerDisplayName(file))
    );
    const topOwner = threatByOwner[0];
    const usagePoints = this.getTrendPoints(this.tenantDetailStats);
    const peakPoint = this.getPeakTrendPoint(usagePoints);
    const quota = this.tenantQuota;
    const shareSummary = this.tenantShareSummary;
    const complaintSummary = this.tenantComplaintSummary;

    const filesAtRiskPercent = tenantReport.filesCount > 0
      ? this.clampPercentage((threatCount / tenantReport.filesCount) * 100)
      : 0;

    const securityScore = Math.max(0, 100 - Math.round(filesAtRiskPercent));
    const averageDailyActions = Math.round(
      (this.toNumber(this.tenantDetailStats?.activity.uploads)
        + this.toNumber(this.tenantDetailStats?.activity.shares)
        + this.toNumber(this.tenantDetailStats?.activity.downloads))
      / Math.max(1, Number(this.selectedPeriod))
    );

    this.tenantOverviewCards = [
      {
        label: 'Users',
        value: this.formatMetric(tenantReport.usersCount),
        detail: quota?.maxUsers ? `${tenantReport.usersCount}/${quota.maxUsers} slots` : 'Capacite non limitee',
        accent: 'primary'
      },
      {
        label: 'Files',
        value: this.formatMetric(tenantReport.filesCount),
        detail: quota?.maxFiles ? `${tenantReport.filesCount}/${quota.maxFiles} files` : 'Volume libre',
        accent: 'cool'
      },
      {
        label: 'Storage',
        value: this.formatBytes(tenantReport.storageUsedBytes),
        detail: tenantReport.storageUsagePercent !== null
          ? `${Math.round(tenantReport.storageUsagePercent || 0)}% du quota tenant`
          : 'Quota stockage non defini',
        accent: 'warm'
      },
      {
        label: 'Activity score',
        value: this.formatMetric(tenantReport.activityScore),
        detail: peakPoint ? `Pic ${this.formatChartLabel(peakPoint.period)} avec ${peakPoint.uploads + peakPoint.shares + peakPoint.downloads} actions` : 'Aucun pic detecte',
        accent: 'success'
      },
      {
        label: 'Plan',
        value: this.selectedTenantPlan,
        detail: quota?.generatedAt ? `Mis a jour ${this.formatRelativeTime(quota.generatedAt)}` : 'Politique actuelle',
        accent: 'neutral'
      },
      {
        label: 'Last activity',
        value: this.formatRelativeTime(tenantReport.lastActivity),
        detail: tenantReport.lastActivity ? this.formatDateTime(tenantReport.lastActivity) : 'Aucune activite recente',
        accent: 'cool'
      }
    ];

    this.tenantSecurityCards = [
      {
        label: 'Threats',
        value: this.formatMetric(threatCount),
        detail: `${filesAtRiskPercent.toFixed(0)}% du parc fichiers concerne`,
        accent: threatCount > 0 ? 'danger' : 'success'
      },
      {
        label: 'Suspicious',
        value: this.formatMetric(tenantReport.suspicious),
        detail: 'Detection comportementale ou scan suspect',
        accent: tenantReport.suspicious > 0 ? 'warm' : 'success'
      },
      {
        label: 'Blocked',
        value: this.formatMetric(tenantReport.blocked),
        detail: 'Blocages applicatifs ou scan',
        accent: tenantReport.blocked > 0 ? 'danger' : 'success'
      },
      {
        label: 'Quarantined',
        value: this.formatMetric(tenantReport.quarantined),
        detail: 'Fichiers isoles',
        accent: tenantReport.quarantined > 0 ? 'warm' : 'success'
      },
      {
        label: 'Users impacted',
        value: this.formatMetric(threatByOwner.length),
        detail: topOwner ? `${topOwner.label} concentre ${topOwner.count} alertes` : 'Aucun user expose',
        accent: 'primary'
      },
      {
        label: 'Security score',
        value: `${securityScore}%`,
        detail: securityScore >= 90 ? 'Posture saine' : 'Une revue est recommandee',
        accent: securityScore >= 90 ? 'success' : 'warm'
      }
    ];

    this.tenantUsageCards = [
      {
        label: 'Uploads',
        value: this.formatMetric(this.toNumber(this.tenantDetailStats?.activity.uploads)),
        detail: `Periode ${this.selectedPeriodLabel}`,
        accent: 'primary'
      },
      {
        label: 'Downloads',
        value: this.formatMetric(this.toNumber(this.tenantDetailStats?.activity.downloads)),
        detail: 'Telechargements traces',
        accent: 'cool'
      },
      {
        label: 'Shares',
        value: this.formatMetric(this.toNumber(this.tenantDetailStats?.activity.shares)),
        detail: 'Partages crees sur la periode',
        accent: 'success'
      },
      {
        label: 'Actions / day',
        value: this.formatMetric(averageDailyActions),
        detail: 'Moyenne calculee sur la plage choisie',
        accent: 'neutral'
      },
      {
        label: 'Peak day',
        value: peakPoint ? this.formatChartLabel(peakPoint.period) : '-',
        detail: peakPoint ? `${peakPoint.uploads + peakPoint.shares + peakPoint.downloads} actions ce jour-la` : 'Aucun pic observe',
        accent: 'warm'
      },
      {
        label: 'Active rhythm',
        value: `${tenantReport.activityScore}`,
        detail: 'Score synthetique uploads/shares/downloads',
        accent: 'primary'
      }
    ];

    const userUsagePercent = this.calculatePercentage(quota?.usersCount || tenantReport.usersCount, quota?.maxUsers);
    const fileUsagePercent = this.calculatePercentage(quota?.filesCount || tenantReport.filesCount, quota?.maxFiles);
    const folderUsagePercent = this.calculatePercentage(quota?.foldersCount || 0, quota?.maxFolders);

    this.tenantQuotaCards = [
      {
        label: 'Storage quota',
        value: tenantReport.storageUsagePercent !== null
          ? `${Math.round(tenantReport.storageUsagePercent || 0)}%`
          : 'n/a',
        detail: quota?.storageLimit ? `${this.formatBytes(quota.storageUsed)} / ${this.formatBytes(quota.storageLimit)}` : 'Limite stockage non definie',
        accent: (tenantReport.storageUsagePercent || 0) >= 80 ? 'warm' : 'success'
      },
      {
        label: 'Users capacity',
        value: quota?.maxUsers ? `${Math.round(userUsagePercent)}%` : 'Open',
        detail: quota?.maxUsers ? `${quota.usersCount}/${quota.maxUsers} users` : 'Aucune borne users',
        accent: userUsagePercent >= 80 ? 'warm' : 'cool'
      },
      {
        label: 'Files capacity',
        value: quota?.maxFiles ? `${Math.round(fileUsagePercent)}%` : 'Open',
        detail: quota?.maxFiles ? `${quota.filesCount}/${quota.maxFiles} files` : 'Aucune borne files',
        accent: fileUsagePercent >= 80 ? 'warm' : 'primary'
      },
      {
        label: 'Folders capacity',
        value: quota?.maxFolders ? `${Math.round(folderUsagePercent)}%` : 'Open',
        detail: quota?.maxFolders ? `${quota.foldersCount}/${quota.maxFolders} folders` : 'Aucune borne folders',
        accent: folderUsagePercent >= 80 ? 'warm' : 'neutral'
      },
      {
        label: 'User storage limit',
        value: this.formatNullableBytes(quota?.userStorageLimit),
        detail: 'Quota individuel maximal',
        accent: 'cool'
      },
      {
        label: 'Daily upload cap',
        value: this.formatNullableBytes(quota?.userDailyUploadLimit),
        detail: 'Plafond journalier par user',
        accent: 'neutral'
      }
    ];

    const activeShares = this.getBreakdownCount(shareSummary?.byStatus, 'active');
    const dominantShareType = this.getDominantLabel(shareSummary?.byType);

    this.tenantShareCards = [
      {
        label: 'Total shares',
        value: this.formatMetric(shareSummary?.totalShares || 0),
        detail: `Sur ${this.selectedPeriodLabel.toLowerCase()}`,
        accent: 'primary'
      },
      {
        label: 'Active shares',
        value: this.formatMetric(activeShares),
        detail: `${this.getBreakdownCount(shareSummary?.byStatus, 'revoked')} revokes, ${this.getBreakdownCount(shareSummary?.byStatus, 'expired')} expires`,
        accent: activeShares > 0 ? 'success' : 'neutral'
      },
      {
        label: 'Downloads',
        value: this.formatMetric(shareSummary?.totalDownloads || 0),
        detail: 'Consommation des liens partages',
        accent: 'cool'
      },
      {
        label: 'Views',
        value: this.formatMetric(shareSummary?.totalViews || 0),
        detail: 'Consultations tracees',
        accent: 'neutral'
      },
      {
        label: 'Top share type',
        value: dominantShareType,
        detail: 'Canal de partage dominant',
        accent: 'warm'
      },
      {
        label: 'Recent shares',
        value: this.formatMetric(this.tenantRecentShares.length),
        detail: 'Derniers partages remontee dans la liste',
        accent: 'success'
      }
    ];

    const dominantComplaintStatus = this.getDominantLabel(complaintSummary?.byStatus);
    const dominantComplaintPriority = this.getDominantLabel(complaintSummary?.byPriority);
    const openBacklog = this.getBreakdownCount(complaintSummary?.byStatus, 'open')
      + this.getBreakdownCount(complaintSummary?.byStatus, 'in_progress')
      + this.getBreakdownCount(complaintSummary?.byStatus, 'pending_user');

    this.tenantComplaintCards = [
      {
        label: 'Tickets',
        value: this.formatMetric(complaintSummary?.total || 0),
        detail: `Flux de reclamations du tenant`,
        accent: 'primary'
      },
      {
        label: 'Open overdue',
        value: this.formatMetric(complaintSummary?.openOverdue || 0),
        detail: 'Tickets hors SLA encore ouverts',
        accent: (complaintSummary?.openOverdue || 0) > 0 ? 'danger' : 'success'
      },
      {
        label: 'Dominant status',
        value: dominantComplaintStatus,
        detail: `Backlog actif: ${openBacklog}`,
        accent: openBacklog > 0 ? 'warm' : 'success'
      },
      {
        label: 'Dominant priority',
        value: dominantComplaintPriority,
        detail: 'Priorite la plus frequente',
        accent: dominantComplaintPriority === 'Urgent' ? 'danger' : 'neutral'
      },
      {
        label: 'Recent tickets',
        value: this.formatMetric(this.tenantRecentComplaints.length),
        detail: 'Tickets listes dans le volet detail',
        accent: 'cool'
      },
      {
        label: 'Response pressure',
        value: `${Math.max(0, 100 - ((complaintSummary?.openOverdue || 0) * 10))}%`,
        detail: 'Indice simple base sur les tickets en retard',
        accent: (complaintSummary?.openOverdue || 0) > 0 ? 'warm' : 'success'
      }
    ];
  }

  private buildTenantCharts(): void {
    const tenantReport = this.getSelectedTenantReport();
    if (!tenantReport || !this.tenantDetailStats) {
      this.resetTenantCharts();
      return;
    }

    const threatFiles = this.tenantThreatFiles.length ? this.tenantThreatFiles : this.tenantRecentAlerts;
    const alertsByUser = this.groupValues(threatFiles.map((file) => this.getOwnerDisplayName(file)));
    const fileStates = this.groupValues(this.tenantFiles.map((file) => this.getOperationalState(file)));
    const fileTypes = this.groupValues(this.tenantFiles.map((file) => this.getMimeFamily(file.mimeType)));
    const threatMix = [
      { label: 'Suspicious', count: tenantReport.suspicious },
      { label: 'Blocked', count: tenantReport.blocked },
      { label: 'Quarantined', count: tenantReport.quarantined }
    ].filter((item) => item.count > 0);

    const quotaUsed = this.tenantQuota?.storageUsed || tenantReport.storageUsedBytes;
    const quotaLimit = this.tenantQuota?.storageLimit ?? tenantReport.storageLimitBytes ?? null;
    const quotaRemaining = quotaLimit && quotaLimit > 0 ? Math.max(0, quotaLimit - quotaUsed) : 0;

    const userUsagePercent = this.calculatePercentage(this.tenantQuota?.usersCount, this.tenantQuota?.maxUsers);
    const fileUsagePercent = this.calculatePercentage(this.tenantQuota?.filesCount, this.tenantQuota?.maxFiles);
    const folderUsagePercent = this.calculatePercentage(this.tenantQuota?.foldersCount, this.tenantQuota?.maxFolders);

    this.tenantSecurityByUserChartData = this.buildSingleBarChart(
      alertsByUser.slice(0, 8).map((item) => item.label),
      alertsByUser.slice(0, 8).map((item) => item.count),
      ['#dc2626', '#ef4444', '#f97316', '#f59e0b', '#d97706', '#fb7185', '#be123c', '#7f1d1d']
    );

    this.tenantFileStatusChartData = this.buildDoughnutChart(
      fileStates.slice(0, 6).map((item) => item.label),
      fileStates.slice(0, 6).map((item) => item.count),
      ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#94a3b8']
    );

    this.tenantFileTypeChartData = this.buildDoughnutChart(
      fileTypes.slice(0, 6).map((item) => item.label),
      fileTypes.slice(0, 6).map((item) => item.count),
      ['#0ea5a8', '#38bdf8', '#3b82f6', '#6366f1', '#8b5cf6', '#f97316']
    );

    this.tenantThreatMixChartData = this.buildDoughnutChart(
      threatMix.map((item) => item.label),
      threatMix.map((item) => item.count),
      ['#f59e0b', '#ef4444', '#8b5cf6']
    );

    this.tenantUsageTrendChartData = this.buildActivityTrendChart(this.getTrendPoints(this.tenantDetailStats));

    this.tenantQuotaCapacityChartData = this.buildDoughnutChart(
      quotaLimit && quotaLimit > 0 ? ['Used', 'Available'] : ['Used'],
      quotaLimit && quotaLimit > 0 ? [quotaUsed, quotaRemaining] : [quotaUsed],
      quotaLimit && quotaLimit > 0 ? ['#2563eb', '#dbeafe'] : ['#2563eb']
    );

    this.tenantQuotaLimitsChartData = this.buildSingleBarChart(
      ['Users', 'Files', 'Folders'],
      [Math.round(userUsagePercent), Math.round(fileUsagePercent), Math.round(folderUsagePercent)],
      ['#2563eb', '#14b8a6', '#f59e0b']
    );

    this.tenantShareStatusChartData = this.buildDoughnutChart(
      (this.tenantShareSummary?.byStatus || []).map((item) => item.label),
      (this.tenantShareSummary?.byStatus || []).map((item) => item.count),
      ['#2563eb', '#ef4444', '#94a3b8', '#14b8a6', '#f59e0b']
    );

    this.tenantShareTypeChartData = this.buildDoughnutChart(
      (this.tenantShareSummary?.byType || []).map((item) => item.label),
      (this.tenantShareSummary?.byType || []).map((item) => item.count),
      ['#14b8a6', '#2563eb', '#f59e0b', '#8b5cf6', '#ef4444']
    );

    this.tenantComplaintStatusChartData = this.buildDoughnutChart(
      (this.tenantComplaintSummary?.byStatus || []).map((item) => item.label),
      (this.tenantComplaintSummary?.byStatus || []).map((item) => item.count),
      ['#f59e0b', '#2563eb', '#14b8a6', '#10b981', '#94a3b8', '#ef4444']
    );

    this.tenantComplaintPriorityChartData = this.buildSingleBarChart(
      (this.tenantComplaintSummary?.byPriority || []).map((item) => item.label),
      (this.tenantComplaintSummary?.byPriority || []).map((item) => item.count),
      ['#16a34a', '#2563eb', '#f59e0b', '#ef4444']
    );
  }

  private buildActivityTrendChart(
    trendPoints: Array<{ period: string; uploads: number; shares: number; downloads: number }>
  ): ChartConfiguration<'line'>['data'] {
    return {
      labels: trendPoints.map((item) => this.formatChartLabel(item.period)),
      datasets: [
        {
          label: 'Uploads',
          data: trendPoints.map((item) => item.uploads),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.16)',
          fill: true,
          tension: 0.35,
          borderWidth: 2
        },
        {
          label: 'Shares',
          data: trendPoints.map((item) => item.shares),
          borderColor: '#14b8a6',
          backgroundColor: 'rgba(20, 184, 166, 0.16)',
          fill: true,
          tension: 0.35,
          borderWidth: 2
        },
        {
          label: 'Downloads',
          data: trendPoints.map((item) => item.downloads),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.16)',
          fill: true,
          tension: 0.35,
          borderWidth: 2
        }
      ]
    };
  }

  private buildSingleBarChart(
    labels: string[],
    values: number[],
    colors: string[]
  ): ChartConfiguration<'bar'>['data'] {
    return {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors.slice(0, values.length),
          borderRadius: 10,
          maxBarThickness: 28
        }
      ]
    };
  }

  private buildDoughnutChart(
    labels: string[],
    values: number[],
    colors: string[]
  ): ChartConfiguration<'doughnut'>['data'] {
    return {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors.slice(0, values.length),
          hoverOffset: 6
        }
      ]
    };
  }

  private getTrendPoints(stats: AdminStatsReport | null): Array<{ period: string; uploads: number; shares: number; downloads: number }> {
    if (!stats) return [];
    return Number(this.selectedPeriod) <= 30 ? stats.activity.daily : stats.activity.weekly;
  }

  private getPeakTrendPoint(points: Array<{ period: string; uploads: number; shares: number; downloads: number }>): {
    period: string;
    uploads: number;
    shares: number;
    downloads: number;
  } | null {
    if (!points.length) return null;

    return [...points].sort((left, right) => {
      const rightTotal = right.uploads + right.shares + right.downloads;
      const leftTotal = left.uploads + left.shares + left.downloads;
      return rightTotal - leftTotal;
    })[0] || null;
  }

  private normalizeShareSummary(response: { success?: boolean; data?: any } | null): TenantShareSummary | null {
    const data = response?.data;
    if (!data) return null;

    return {
      totalShares: this.readFacetTotal(data.totalShares),
      totalDownloads: this.readFacetTotal(data.totalDownloads),
      totalViews: this.readFacetTotal(data.totalViews),
      byStatus: this.normalizeBreakdown(data.byStatus),
      byType: this.normalizeBreakdown(data.byType)
    };
  }

  private normalizeComplaintSummary(response: ComplaintStatsResponse | null): TenantComplaintSummary | null {
    if (!response?.data) return null;

    return {
      total: Number(response.data.total || 0),
      openOverdue: Number(response.data.openOverdue || 0),
      byStatus: this.normalizeBreakdown(response.data.byStatus),
      byPriority: this.normalizeBreakdown(response.data.byPriority)
    };
  }

  private normalizeBreakdown(items: Array<{ _id?: string; count?: number }> | undefined): BreakdownItem[] {
    if (!Array.isArray(items)) return [];

    return items
      .map((item) => ({
        key: String(item._id || 'unknown'),
        label: this.formatKeyLabel(String(item._id || 'unknown')),
        count: Number(item.count || 0)
      }))
      .sort((left, right) => right.count - left.count);
  }

  private groupValues(values: string[]): BreakdownItem[] {
    const counter = new Map<string, number>();

    for (const rawValue of values) {
      const value = String(rawValue || 'Unknown').trim() || 'Unknown';
      counter.set(value, (counter.get(value) || 0) + 1);
    }

    return [...counter.entries()]
      .map(([label, count]) => ({
        key: label.toLowerCase(),
        label,
        count
      }))
      .sort((left, right) => right.count - left.count);
  }

  private getDominantLabel(items: BreakdownItem[] | undefined | null): string {
    if (!items?.length) return 'No data';
    return items[0].label;
  }

  private getBreakdownCount(items: BreakdownItem[] | undefined | null, key: string): number {
    const match = items?.find((item) => item.key.toLowerCase() === key.toLowerCase());
    return Number(match?.count || 0);
  }

  private getSelectedTenantReport(): TenantStatsReport | null {
    if (this.tenantDetailStats?.tenants?.length) {
      return this.tenantDetailStats.tenants[0];
    }

    return this.globalStats?.tenants.find((tenant) => tenant.tenantId === this.selectedTenant) || null;
  }

  private getTenantThreatCount(tenant: TenantStatsReport): number {
    return Number(tenant.suspicious || 0) + Number(tenant.blocked || 0) + Number(tenant.quarantined || 0);
  }

  private getThreatState(file: Partial<MalwareAlert>): 'blocked' | 'quarantined' | 'suspicious' | null {
    const status = String(file?.status || '').toLowerCase();
    const quarantine = String(file?.scanMetadata?.quarantineStatus || '').toLowerCase();
    const infected = Boolean(file?.scanMetadata?.clamavResult?.isInfected)
      || Boolean(file?.scanMetadata?.virustotalResult?.isInfected);
    const suspiciousStatus = String(file?.scanStatus || '').toLowerCase();

    if (status === 'blocked') {
      return 'blocked';
    }

    if (status === 'quarantined' || quarantine === 'quarantined') {
      return 'quarantined';
    }

    if (infected || (suspiciousStatus && !['clean', 'pending'].includes(suspiciousStatus))) {
      return 'suspicious';
    }

    return null;
  }

  private isThreatFile(file: Partial<MalwareAlert>): boolean {
    return this.getThreatState(file) !== null;
  }

  private getMimeFamily(mimeType?: string): string {
    const mime = String(mimeType || '').toLowerCase();
    if (!mime) return 'Unknown';

    if (mime.startsWith('image/')) return 'Images';
    if (mime.startsWith('video/')) return 'Videos';
    if (mime.startsWith('audio/')) return 'Audio';
    if (mime.startsWith('text/')) return 'Text';

    if (
      mime.includes('pdf')
      || mime.includes('word')
      || mime.includes('sheet')
      || mime.includes('spreadsheet')
      || mime.includes('presentation')
      || mime.includes('document')
    ) {
      return 'Documents';
    }

    if (
      mime.includes('zip')
      || mime.includes('rar')
      || mime.includes('tar')
      || mime.includes('7z')
    ) {
      return 'Archives';
    }

    if (mime.startsWith('application/')) return 'Applications';
    return 'Other';
  }

  private getAllFilesCache$() {
    if (this.allFilesLoaded) {
      return of(this.allFilesCache);
    }

    return this.adminApi.getFilesList().pipe(
      tap((files) => {
        this.allFilesCache = Array.isArray(files) ? files : [];
        this.allFilesLoaded = true;
      }),
      catchError((response) => {
        console.error('Admin files cache loading error:', response);
        return of([] as SecureFile[]);
      })
    );
  }

  private buildDateRange(): { startDate: string; endDate: string } {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - Number(this.selectedPeriod));

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString()
    };
  }

  private formatChartLabel(period: string): string {
    const date = new Date(period);
    if (Number.isNaN(date.getTime())) return period;

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  }

  private formatKeyLabel(value: string): string {
    const normalized = value.replace(/[_-]+/g, ' ').trim();
    if (!normalized) return 'Unknown';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  private formatNullableBytes(value: number | null | undefined): string {
    if (!value || value <= 0) return 'Unlimited';
    return this.formatBytes(value);
  }

  private calculatePercentage(current: number | null | undefined, max: number | null | undefined): number {
    if (!max || max <= 0) return 0;
    return this.clampPercentage((Number(current || 0) / max) * 100);
  }

  private clampPercentage(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value));
  }

  private toGigabytes(bytes: number): number {
    return Math.round(((Number(bytes || 0) / (1024 * 1024 * 1024)) || 0) * 100) / 100;
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private readFacetTotal(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (Array.isArray(value) && value.length > 0) {
      const first = value[0] as { total?: number; count?: number };
      if (typeof first?.total === 'number') return first.total;
      if (typeof first?.count === 'number') return first.count;
    }

    if (typeof value === 'object' && value !== null) {
      const record = value as { total?: number; count?: number };
      if (typeof record.total === 'number') return record.total;
      if (typeof record.count === 'number') return record.count;
    }

    return 0;
  }

  private isValidStats(stats: AdminStatsReport | null): stats is AdminStatsReport {
    return !!stats
      && !!stats.global
      && !!stats.activity
      && !!stats.security
      && Array.isArray(stats.tenants);
  }

  private resetGlobalState(): void {
    this.globalStats = null;
    this.summary = this.getEmptySummary();
    this.globalSnapshotCards = [];
    this.globalHighlightCards = [];
    this.globalActionAlerts = [];
    this.globalAlerts = [];
    this.selectedAlert = null;
    this.tenantTableRows = [];
    this.resetGlobalCharts();
  }

  private clearTenantDetailState(): void {
    this.tenantDetailStats = null;
    this.tenantError = '';
    this.tenantLoading = false;
    this.tenantFiles = [];
    this.tenantThreatFiles = [];
    this.tenantRecentAlerts = [];
    this.tenantQuota = null;
    this.tenantShareSummary = null;
    this.tenantComplaintSummary = null;
    this.tenantRecentShares = [];
    this.tenantRecentComplaints = [];
    this.tenantOverviewCards = [];
    this.tenantSecurityCards = [];
    this.tenantUsageCards = [];
    this.tenantQuotaCards = [];
    this.tenantShareCards = [];
    this.tenantComplaintCards = [];
    this.resetTenantCharts();
  }

  private resetGlobalCharts(): void {
    this.globalActivityTrendChartData = { labels: [], datasets: [] };
    this.globalStorageByTenantChartData = { labels: [], datasets: [] };
    this.globalUsersByTenantChartData = { labels: [], datasets: [] };
    this.globalActiveTenantChartData = { labels: [], datasets: [] };
    this.globalRiskByTenantChartData = { labels: [], datasets: [] };
    this.globalQuotaPressureChartData = { labels: [], datasets: [] };
    this.globalActivityMixChartData = { labels: [], datasets: [] };
  }

  private resetTenantCharts(): void {
    this.tenantSecurityByUserChartData = { labels: [], datasets: [] };
    this.tenantFileStatusChartData = { labels: [], datasets: [] };
    this.tenantFileTypeChartData = { labels: [], datasets: [] };
    this.tenantThreatMixChartData = { labels: [], datasets: [] };
    this.tenantUsageTrendChartData = { labels: [], datasets: [] };
    this.tenantQuotaCapacityChartData = { labels: [], datasets: [] };
    this.tenantQuotaLimitsChartData = { labels: [], datasets: [] };
    this.tenantShareStatusChartData = { labels: [], datasets: [] };
    this.tenantShareTypeChartData = { labels: [], datasets: [] };
    this.tenantComplaintStatusChartData = { labels: [], datasets: [] };
    this.tenantComplaintPriorityChartData = { labels: [], datasets: [] };
  }

  private getEmptySummary(): AdminSummary {
    return {
      totalUsers: 0,
      totalTenants: 0,
      totalFiles: 0,
      totalStorage: 0,
      totalStorageLimit: 0,
      storageUsagePercent: 0,
      totalUploads: 0,
      totalDownloads: 0,
      totalShares: 0,
      activeUsers: 0,
      verifiedUsers: 0,
      adminUsers: 0,
      activeTenants: 0,
      avgFilesPerTenant: 0,
      malwareDetected: 0
    };
  }

  private getEmptyAlertResponse(): { total: number; page: number; limit: number; data: MalwareAlert[] } {
    return {
      total: 0,
      page: 1,
      limit: 8,
      data: []
    };
  }

  private getEmptyComplaintListResponse(): ComplaintListResponse {
    return {
      success: true,
      data: [],
      pagination: {
        total: 0,
        page: 1,
        limit: 6,
        pages: 0,
        hasNext: false,
        hasPrev: false
      }
    };
  }

  private getEmptyShareHistoryResponse(): ShareHistoryResponse {
    return {
      success: true,
      data: [],
      pagination: {
        total: 0,
        page: 1,
        limit: 6,
        pages: 0,
        hasNext: false,
        hasPrev: false
      }
    };
  }
}
