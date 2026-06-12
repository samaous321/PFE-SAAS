import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NgApexchartsModule, ApexAxisChartSeries, ApexNonAxisChartSeries, ApexChart, ApexDataLabels, ApexFill, ApexGrid, ApexStroke, ApexTooltip, ApexXAxis, ApexYAxis } from 'ng-apexcharts';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DropdownModule } from 'primeng/dropdown';
import { ProgressBarModule } from 'primeng/progressbar';
import { BadgeModule } from 'primeng/badge';
import { AdminApiService, AdminStats, AdminStatsReport } from '../../../core/services/admin-api.service';
import { ComplaintApiService } from '../../../core/services/complaint-api.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { FileApiService } from '../../../core/services/file-api.service';
import { NotificationService } from '../../../core/services/notification.service';
import { MalwareAlert } from '../../../core/models/file.model';
import { Complaint } from '../../../core/models/complaint.model';
import { Tenant } from '../../../core/models/tenant.model';
import { User } from '../../../core/models/user.model';
import { KpiCardComponent } from '../../../shared/admin-ui/kpi-card.component';
import { ActivityTimelineComponent, DashboardTimelineEvent } from './activity-timeline.component';

type ChartOptions = {
  series: ApexAxisChartSeries | ApexNonAxisChartSeries;
  chart: ApexChart;
  xaxis?: ApexXAxis;
  stroke?: ApexStroke;
  tooltip?: ApexTooltip;
  markers?: any;
  fill?: ApexFill;
  grid?: ApexGrid;
  yaxis?: ApexYAxis;
  colors?: string[];
  labels?: string[];
  legend?: any;
  plotOptions?: any;
  dataLabels?: any;
};

@Component({
  standalone: true,
  selector: 'app-admin-dashboard',
  imports: [CommonModule, FormsModule, RouterModule, ButtonModule, CardModule, DropdownModule, ProgressBarModule, BadgeModule, NgApexchartsModule, KpiCardComponent, ActivityTimelineComponent],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.scss']
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  private readonly adminApi = inject(AdminApiService);
  private readonly complaintApi = inject(ComplaintApiService);
  private readonly analytics = inject(AnalyticsService);
  private readonly fileApi = inject(FileApiService);
  private readonly router = inject(Router);
  private readonly notification = inject(NotificationService);
  private readonly destroy$ = new Subject<void>();

  loading = true;
  stats: AdminStats | null = null;
  statsReport: AdminStatsReport | null = null;
  complaintStats: { total: number; openOverdue: number; byStatus: Array<{ _id: string; count: number }> } | null = null;
  complaints: Complaint[] = [];
  malwareAlerts: MalwareAlert[] = [];
  alertsLoading = false;
  isDarkMode = false;

  trendSeries: ApexAxisChartSeries = [];
  trendChartOptions: Partial<ChartOptions> = {};
  storageSeries: ApexAxisChartSeries = [];
  storageChartOptions: Partial<ChartOptions> = {};
  storageDistributionSeries: ApexNonAxisChartSeries = [];
  storageDistributionOptions: Partial<ChartOptions> = {};
  activitySeries: ApexAxisChartSeries = [];
  activityChartOptions: Partial<ChartOptions> = {};
  tenantChartSeries: ApexAxisChartSeries = [];
  tenantChartOptions: Partial<ChartOptions> = {};
  tenantComparisonRows: Array<{
    tenantId: string;
    tenantName: string;
    storage: number;
    files: number;
    activity: number;
    complaints: number;
    usagePercent: number;
  }> = [];

  selectedTenantId = 'all';
  selectedMetric: 'storage' | 'files' | 'activity' | 'complaints' = 'storage';
  selectedRange: '7d' | '30d' | '90d' = '30d';
  tenantFilters: Array<{ label: string; value: string }> = [{ label: 'Tous les tenants', value: 'all' }];
  metricOptions = [
    { label: 'Stockage utilisé', value: 'storage' },
    { label: 'Fichiers', value: 'files' },
    { label: 'Activité', value: 'activity' },
    { label: 'Réclamations', value: 'complaints' }
  ];
  rangeOptions: Array<{ label: string; value: '7d' | '30d' | '90d' }> = [
    { label: '7 jours', value: '7d' },
    { label: '30 jours', value: '30d' },
    { label: '90 jours', value: '90d' }
  ];

  shortcutLinks = [
    { keys: 'Ctrl + Alt + U', label: 'Utilisateurs', description: 'Accéder à la gestion des utilisateurs', route: '/admin/users' },
    { keys: 'Ctrl + Alt + T', label: 'Tenants', description: 'Voir la liste des tenants', route: '/admin/tenants' },
    { keys: 'Ctrl + Alt + A', label: 'Analytics', description: 'Ouvrir les rapports analytiques', route: '/admin/analytics' },
    { keys: 'Ctrl + Alt + Q', label: 'Quotas', description: 'Voir l’utilisation des quotas', route: '/admin/quotas' }
  ];

  quickActions = [
    { label: 'Gérer les quotas', icon: 'pi pi-wallet', route: '/admin/quotas' },
    { label: 'Voir les tickets', icon: 'pi pi-envelope', route: '/admin/complaints' },
    { label: 'Alertes sécurité', icon: 'pi pi-bell', route: '/admin/alerts' },
    { label: 'Rapports', icon: 'pi pi-chart-line', route: '/admin/analytics' }
  ];

  ngOnInit(): void {
    this.loadStats();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:keydown', ['$event'])
  handleShortcut(event: KeyboardEvent): void {
    if (!event.ctrlKey || !event.altKey) {
      return;
    }

    const key = event.key.toLowerCase();
    switch (key) {
      case 'u':
        this.router.navigate(['/admin/users']);
        event.preventDefault();
        break;
      case 't':
        this.router.navigate(['/admin/tenants']);
        event.preventDefault();
        break;
      case 'a':
        this.router.navigate(['/admin/analytics']);
        event.preventDefault();
        break;
      case 'q':
        if (this.stats?.storageByTenant?.length) {
          this.router.navigate(['/admin/quotas', this.stats.storageByTenant[0]?.tenantId || '']);
          event.preventDefault();
        }
        break;
    }
  }

  loadStats(): void {
    this.loading = true;
    this.loadMalwareAlerts();
    forkJoin({
      legacy: this.adminApi.getStats(),
      report: this.adminApi.getAdminStats(),
      complaints: this.complaintApi.getAdminComplaints({ limit: 200 })
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ legacy, report, complaints }) => {
          this.stats = legacy;
          this.statsReport = report;
          this.complaints = complaints.data || [];
          this.buildTenantComparison();
          this.initCharts();
          this.loading = false;
        },
        error: () => {
          this.notification.error('Impossible de charger les statistiques du tableau de bord');
          this.loading = false;
        }
      });
  }

  loadMalwareAlerts(): void {
    this.alertsLoading = true;
    this.adminApi.getMalwareAlerts({ limit: 3 })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.malwareAlerts = response?.data || [];
          this.alertsLoading = false;
        },
        error: () => {
          this.malwareAlerts = [];
          this.alertsLoading = false;
        }
      });
  }

  buildTenantComparison(): void {
    if (!this.statsReport) {
      this.tenantComparisonRows = [];
      return;
    }

    const complaintCounts = this.complaints.reduce<Record<string, number>>((acc, complaint) => {
      const tenantId = complaint?.requester?.tenantId || 'unknown';
      acc[tenantId] = (acc[tenantId] || 0) + 1;
      return acc;
    }, {});

    this.tenantComparisonRows = (this.statsReport.tenants || [])
      .map((tenant) => ({
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName || 'Tenant',
        storage: tenant.storageUsedBytes || 0,
        files: tenant.filesCount || 0,
        activity: tenant.activityScore || 0,
        complaints: complaintCounts[tenant.tenantId] || 0,
        usagePercent: tenant.storageUsagePercent ?? 0
      }))
      .sort((a, b) => b.storage - a.storage);

    this.tenantFilters = [
      { label: 'Tous les tenants', value: 'all' },
      ...this.tenantComparisonRows.map((tenant) => ({ label: tenant.tenantName, value: tenant.tenantId }))
    ];

    this.updateTenantChart();
  }

  updateTenantChart(): void {
    const rows = this.filteredTenantRows.slice(0, 12);
    const categories = rows.map((tenant) => tenant.tenantName);
    const metricLabel = this.selectedMetric === 'storage'
      ? 'Stockage (Go)'
      : this.selectedMetric === 'files'
      ? 'Fichiers'
      : this.selectedMetric === 'activity'
      ? 'Score d’activité'
      : 'Réclamations';

    const data = rows.map((tenant) => {
      switch (this.selectedMetric) {
        case 'files': return tenant.files;
        case 'activity': return tenant.activity;
        case 'complaints': return tenant.complaints;
        default: return parseFloat((tenant.storage / 1024 / 1024 / 1024).toFixed(2));
      }
    });

    this.tenantChartSeries = [{ name: metricLabel, data }];
    this.tenantChartOptions = {
      chart: { type: 'bar', height: 360, toolbar: { show: false }, animations: { enabled: true, speed: 600 } },
      plotOptions: { bar: { borderRadius: 10, columnWidth: '55%' } },
      dataLabels: { enabled: false },
      xaxis: { categories, labels: { rotate: -30, style: { colors: ['var(--text-secondary)'], fontSize: '11px' } } },
      yaxis: { title: { text: metricLabel }, labels: { style: { colors: ['var(--text-secondary)'] } } },
      tooltip: {
        theme: this.isDarkMode ? 'dark' : 'light',
        y: { formatter: (value: number) => this.selectedMetric === 'storage' ? `${value} GB` : `${value}` }
      },
      grid: { strokeDashArray: 4, borderColor: 'rgba(148, 163, 184, 0.18)' },
      colors: ['#0f6dff']
    };
  }

  get filteredTenantRows() {
    if (!this.statsReport) {
      return [];
    }
    if (this.selectedTenantId === 'all') {
      return [...this.tenantComparisonRows].sort((a, b) => b[this.selectedMetric] - a[this.selectedMetric]);
    }
    return this.tenantComparisonRows.filter((tenant) => tenant.tenantId === this.selectedTenantId);
  }

  get globalStats() {
    return this.statsReport?.global;
  }

  get selectedTenantLabel(): string {
    if (this.selectedTenantId === 'all') {
      return 'Tous les tenants';
    }
    const tenant = this.tenantFilters.find((entry) => entry.value === this.selectedTenantId);
    return tenant?.label || 'Tenant inconnu';
  }

  get rangeLabel(): string {
    return this.selectedRange === '7d'
      ? '7 derniers jours'
      : this.selectedRange === '90d'
      ? '90 derniers jours'
      : '30 derniers jours';
  }

  get storageRemainingPercent(): number {
    return Math.max(0, 100 - this.storageUsagePercent);
  }

  get storageRemainingBytes(): string {
    const remaining = Math.max((this.stats?.totalStorageLimit || 0) - (this.stats?.totalStorageUsed || 0), 0);
    return this.formatBytes(remaining);
  }

  get complaintSummary() {
    return this.complaintStats || { total: 0, openOverdue: 0, byStatus: [] };
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
  }

  initCharts(): void {
    const report = this.statsReport;
    if (!report) {
      return;
    }

    const daily = [...(report.activity?.daily || [])].sort((a, b) => a.period.localeCompare(b.period));
    const categories = daily.map((item) => item.period);
    const uploadSeries = daily.map((item) => item.uploads);
    const downloadSeries = daily.map((item) => item.downloads);
    const shareSeries = daily.map((item) => item.shares);

    this.trendSeries = [
      { name: 'Uploads', data: uploadSeries },
      { name: 'Downloads', data: downloadSeries },
      { name: 'Partages', data: shareSeries }
    ];
    this.trendChartOptions = {
      chart: { type: 'line', height: 340, toolbar: { show: false }, animations: { enabled: true, speed: 600 } },
      stroke: { curve: 'smooth', width: 3 },
      xaxis: { categories, labels: { style: { colors: ['var(--text-secondary)'], fontSize: '12px' } } },
      tooltip: { theme: this.isDarkMode ? 'dark' : 'light' },
      markers: { size: 4 },
      fill: { type: 'gradient', gradient: { shade: 'light', gradientToColors: ['#38bdf8'], opacityFrom: 0.7, opacityTo: 0.2 } },
      grid: { strokeDashArray: 4, borderColor: 'rgba(148, 163, 184, 0.18)' },
      colors: ['#0f6dff', '#14b8a6', '#f59e0b']
    };

    const storage = this.tenantComparisonRows.slice(0, 6);
    this.storageSeries = [{ name: 'Stockage utilisé', data: storage.map((item) => item.storage) }];
    this.storageChartOptions = {
      chart: { type: 'bar', height: 320, toolbar: { show: false } },
      xaxis: { categories: storage.map((item) => item.tenantName), labels: { rotate: -30, style: { colors: ['var(--text-secondary)'], fontSize: '11px' } } },
      yaxis: { labels: { formatter: (value: number) => this.formatBytes(Number(value)) } },
      tooltip: { theme: this.isDarkMode ? 'dark' : 'light', y: { formatter: (value: number) => `${this.formatBytes(Number(value))}` } },
      fill: { opacity: 0.95 },
      grid: { strokeDashArray: 4, borderColor: 'rgba(148, 163, 184, 0.18)' },
      colors: ['#14b8a6']
    };

    const distribution = this.tenantComparisonRows.slice(0, 5);
    this.storageDistributionSeries = distribution.map((item) => item.storage);
    this.storageDistributionOptions = {
      chart: { type: 'donut', height: 320, toolbar: { show: false } },
      labels: distribution.map((item) => item.tenantName),
      legend: { position: 'bottom' },
      tooltip: { theme: this.isDarkMode ? 'dark' : 'light', y: { formatter: (value: number) => this.formatBytes(Number(value)) } },
      colors: ['#0f6dff', '#14b8a6', '#f59e0b', '#ef4444', '#6366f1']
    };

    const activityCounts = [
      { label: 'Actifs', value: report.global?.totalUsers || 0 },
      { label: 'Uploads', value: report.global?.totalUploads || 0 },
      { label: 'Ouv. tickets', value: this.complaintSummary.total || 0 }
    ];
    this.activitySeries = [{ name: 'Valeurs', data: activityCounts.map((item) => item.value) }];
    this.activityChartOptions = {
      chart: { type: 'area', height: 280, toolbar: { show: false }, animations: { enabled: true, speed: 550 } },
      xaxis: { categories: activityCounts.map((item) => item.label), labels: { style: { colors: ['var(--text-secondary)'], fontSize: '12px' } } },
      yaxis: { show: false },
      tooltip: { theme: this.isDarkMode ? 'dark' : 'light' },
      fill: { type: 'gradient', gradient: { shadeIntensity: 0.4, opacityFrom: 0.75, opacityTo: 0.15, stops: [0, 95, 100] } },
      grid: { show: false },
      colors: ['#0f6dff']
    };

    this.updateTenantChart();
  }

  get timelineEvents(): DashboardTimelineEvent[] {
    if (!this.stats) {
      return [];
    }

    const events: DashboardTimelineEvent[] = [];

    (this.stats.recentUsers || []).slice(0, 3).forEach((user) => {
      events.push({
        title: `${user?.firstName || 'Utilisateur'} ${user?.lastName || ''}`.trim(),
        description: `Compte créé · ${user?.email || 'email inconnu'}`,
        datetime: this.formatDate(user?.createdAt),
        tone: 'success',
        icon: 'user'
      });
    });

    (this.stats.recentTenants || []).slice(0, 3).forEach((tenant) => {
      events.push({
        title: tenant?.name || 'Tenant',
        description: `Nouveau tenant ajouté`,
        datetime: this.formatDate(tenant?.createdAt),
        tone: 'info',
        icon: 'tenant'
      });
    });

    (this.malwareAlerts || []).slice(0, 3).forEach((alert) => {
      events.push({
        title: alert.originalName || 'Fichier suspect',
        description: this.getAlertDetail(alert),
        datetime: this.formatDate(alert.scannedAt || alert.createdAt),
        tone: 'danger',
        icon: 'alert'
      });
    });

    return events
      .filter((event) => !!event.datetime)
      .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())
      .slice(0, 7);
  }

  get storageUsagePercent(): number {
    if (!this.stats) {
      return 0;
    }
    return this.calculatePercentage(this.stats.totalStorageUsed, this.stats.totalStorageLimit);
  }

  get totalUploads(): number {
    if (!this.stats?.uploadsByDay?.length) {
      return 0;
    }
    return this.stats.uploadsByDay.reduce((sum, item) => sum + (item.count || 0), 0);
  }

  get topStorageTenants(): Array<{ name: string; used: number; limit: number; percent: number; tenantId: string }> {
    if (!this.stats?.storageByTenant?.length) {
      return [];
    }

    return [...this.stats.storageByTenant]
      .map((tenant) => {
        const used = Number(tenant.used || 0);
        const limit = Number(tenant.limit || 0);
        return {
          name: tenant.name,
          used,
          limit,
          percent: limit > 0 ? Math.min(Math.round((used / limit) * 100), 100) : 0,
          tenantId: tenant.tenantId || ''
        };
      })
      .sort((a, b) => b.percent - a.percent)
      .slice(0, 5);
  }

  getTenantStatus(tenant: { usagePercent: number; complaints: number }): 'danger' | 'warning' | 'success' {
    if (tenant.usagePercent >= 90 || tenant.complaints > 10) {
      return 'danger';
    }
    if (tenant.usagePercent >= 70 || tenant.complaints > 5) {
      return 'warning';
    }
    return 'success';
  }

  get topTenantRows() {
    return this.tenantComparisonRows
      .slice(0, 6)
      .sort((a, b) => b.storage - a.storage)
      .map((tenant) => ({ ...tenant, storageGB: parseFloat((tenant.storage / 1024 / 1024 / 1024).toFixed(2)) }));
  }

  get alerts(): { title: string; detail: string; tone: 'danger' | 'warning' | 'info' | 'success' }[] {
    if (!this.stats) {
      return [];
    }

    const alerts = [] as Array<{ title: string; detail: string; tone: 'danger' | 'warning' | 'info' | 'success' }>;
    const usage = this.storageUsagePercent;

    if (this.stats.malwareDetected > 0) {
      alerts.push({ title: 'Fichiers suspects détectés', detail: `${this.stats.malwareDetected} élément(s) en quarantaine`, tone: 'danger' });
    }

    if (usage >= 85) {
      alerts.push({ title: 'Stockage critique', detail: `Le stockage de la plateforme est à ${usage}%`, tone: 'warning' });
    }

    if (this.stats.activeUsers === 0) {
      alerts.push({ title: 'Aucun utilisateur actif', detail: 'Vérifiez la configuration des comptes', tone: 'info' });
    }

    if (!alerts.length) {
      alerts.push({ title: 'Système stable', detail: 'Aucune alerte prioritaire détectée.', tone: 'success' });
    }

    return alerts;
  }

  openAlertDetails(alert: MalwareAlert): void {
    if (!alert?._id) {
      return;
    }

    this.router.navigate(['/admin/alerts'], { queryParams: { fileId: alert._id } });
  }

  getAlertDetail(alert: MalwareAlert): string {
    const status = alert.status ? `Statut: ${alert.status}` : 'Analyse disponible';
    const file = alert.originalName ? `Fichier: ${alert.originalName}` : 'Nom de fichier inconnu';
    return `${file} · ${status}`;
  }

  navigateTo(route: string): void {
    this.router.navigate([route]);
  }

  downloadAlert(alert: MalwareAlert): void {
    if (!alert?._id) {
      return;
    }

    this.fileApi.download(alert._id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = alert.originalName || 'fichier';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      },
      error: () => this.notification.error('Impossible de télécharger le fichier malveillant.')
    });
  }

  formatDate(value?: string): string {
    if (!value) {
      return 'date inconnue';
    }
    return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatShortDate(value: string): string {
    return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }

  formatBytes(bytes: number): string {
    return this.analytics.formatBytes(bytes);
  }

  calculatePercentage(used: number, total: number): number {
    return this.analytics.calculatePercentage(used, total);
  }
}
