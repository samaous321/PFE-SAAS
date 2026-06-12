import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, combineLatest } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { NgChartsModule } from 'ng2-charts';
import { Chart, ChartConfiguration, ChartOptions, registerables } from 'chart.js';
import { UserApiService, ComprehensiveUserStats, StatsFilters } from '../../../core/services/user-api.service';

Chart.register(...registerables);

interface CollapsibleSection {
  id: string;
  title: string;
  icon: string;
  isExpanded: boolean;
  hasData: boolean;
  subtitle?: string;
  isVisible?: boolean;
}

@Component({
  standalone: true,
  selector: 'app-user-stats',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgChartsModule, RouterLink],
  templateUrl: './user-stats.component.html',
  styleUrls: ['./user-stats.component.scss']
})
export class UserStatsComponent implements OnInit, OnDestroy {
  private readonly userApi = inject(UserApiService);
  private readonly fb = inject(FormBuilder);
  private readonly destroy$ = new Subject<void>();

  isLoading = false;
  statsData: ComprehensiveUserStats | null = null;
  filtersForm!: FormGroup;

  sections: Record<string, CollapsibleSection> = {
    overview: { id: 'overview', title: 'Overview', icon: '✨', isExpanded: true, hasData: true, isVisible: true, subtitle: 'Live KPIs' },
    fileManagement: { id: 'fileManagement', title: 'File Management', icon: '📁', isExpanded: true, hasData: true, isVisible: true, subtitle: 'Uploads and downloads' },
    fileTypes: { id: 'fileTypes', title: 'File Types', icon: '📊', isExpanded: false, hasData: true, isVisible: true, subtitle: 'Distribution by MIME type' },
    security: { id: 'security', title: 'Security', icon: '🔐', isExpanded: false, hasData: true, isVisible: true, subtitle: 'Scan and risk status' },
    analysis: { id: 'analysis', title: 'Analysis', icon: '🧠', isExpanded: false, hasData: true, isVisible: true, subtitle: 'Scan success and failures' },
    sharing: { id: 'sharing', title: 'Sharing', icon: '🔗', isExpanded: false, hasData: true, isVisible: true, subtitle: 'What you send and receive' },
    storage: { id: 'storage', title: 'Storage', icon: '💾', isExpanded: false, hasData: true, isVisible: true, subtitle: 'Largest files and usage' },
    tenantOverview: { id: 'tenantOverview', title: 'Tenant Overview', icon: '🏢', isExpanded: false, hasData: true, isVisible: true, subtitle: 'Same tenant context' },
    quota: { id: 'quota', title: 'Quota', icon: '📏', isExpanded: false, hasData: true, isVisible: true, subtitle: 'User and tenant limits' },
    activity: { id: 'activity', title: 'Activity', icon: '👤', isExpanded: false, hasData: true, isVisible: true, subtitle: 'Recent activity timeline' }
  };

  // Tabs
  tabs = [
    { id: 'fileManagement', label: 'File Management', icon: '📁' },
    { id: 'security', label: 'Security Supervision', icon: '🔐' },
    { id: 'quota', label: 'Quota', icon: '📏' },
    { id: 'activity', label: 'Activity', icon: '👤' }
  ];

  currentTab = 'fileManagement';

  // Group sections into 4 main categories for easier toggling
  categories = [
    { id: 'overview', title: 'Overview', sections: ['overview', 'tenantOverview', 'quota'] },
    { id: 'operations', title: 'File Operations', sections: ['fileManagement', 'activity', 'sharing'] },
    { id: 'storageTypes', title: 'Storage & Types', sections: ['storage', 'fileTypes'] },
    { id: 'securityAnalysis', title: 'Security & Analysis', sections: ['security', 'analysis'] }
  ];

  // Chart configurations
  fileManagementChartData: ChartConfiguration['data'] = { labels: [], datasets: [] };
  fileManagementChartOptions: ChartOptions = {};

  fileTypesChartData: ChartConfiguration['data'] = { labels: [], datasets: [] };
  fileTypesChartOptions: ChartOptions = {};

  securityChartData: ChartConfiguration['data'] = { labels: [], datasets: [] };
  securityChartOptions: ChartOptions = {};

  storageChartData: ChartConfiguration['data'] = { labels: [], datasets: [] };
  storageChartOptions: ChartOptions = {};

  activityChartData: ChartConfiguration['data'] = { labels: [], datasets: [] };
  activityChartOptions: ChartOptions = {};

  // Additional compact charts
  sharedFilesChartData: ChartConfiguration['data'] = { labels: [], datasets: [] };
  sharedFilesChartOptions: ChartOptions = {};

  storageEvolutionChartData: ChartConfiguration['data'] = { labels: [], datasets: [] };
  storageEvolutionChartOptions: ChartOptions = {};

  quotaDonutData: ChartConfiguration['data'] = { labels: [], datasets: [] };
  quotaDonutOptions: ChartOptions = {};

  ngOnInit(): void {
    this.initializeForm();
    this.loadStats();

    // Auto-apply filters with debounce
    this.filtersForm.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(500),
        distinctUntilChanged()
      )
      .subscribe(() => {
        this.loadStats();
      });

    // react to timeRange changes and map to start/end dates
    this.filtersForm.get('timeRange')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((range: string) => {
      const now = new Date();
      let start: Date | null = null;
      if (range === 'week') start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      if (range === 'month') start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      if (range === 'year') start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      if (start) {
        this.filtersForm.patchValue({ startDate: start.toISOString().split('T')[0], endDate: now.toISOString().split('T')[0] }, { emitEvent: false });
        this.loadStats();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeForm(): void {
    this.filtersForm = this.fb.group({
      startDate: [''],
      endDate: [''],
      fileType: [''],
      status: [''],
      timeRange: ['month'],
      userId: ['']
    });
  }

  loadStats(): void {
    this.isLoading = true;
    const filters: StatsFilters = {};

    const formValue = this.filtersForm.value;
    if (formValue.startDate) filters.startDate = formValue.startDate;
    if (formValue.endDate) filters.endDate = formValue.endDate;
    if (formValue.fileType) filters.fileType = formValue.fileType;
    if (formValue.status) filters.status = formValue.status;
    // userId and timeRange are mapped into start/end already; userId can be used by backend if supported via query param
    if (formValue.userId) {
      // append as query param by manually building URL in service; for now we add as startDate param workaround unsupported by interface
    }

    this.userApi.getUserStats(filters)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.statsData = data;
          this.updateCharts();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading stats:', error);
          this.isLoading = false;
        }
      });
  }

  applyFilters(): void {
    this.loadStats();
  }

  resetFilters(): void {
    this.filtersForm.reset();
  }

  toggleSection(sectionId: string): void {
    const section = this.sections[sectionId];
    if (!section) {
      return;
    }

    section.isExpanded = !section.isExpanded;
  }

  toggleAllSections(expand: boolean): void {
    Object.values(this.sections).forEach((section) => {
      if (section.hasData) {
        section.isExpanded = expand;
      }
    });
  }

  toggleCategory(categoryId: string, expand?: boolean): void {
    const cat = this.categories.find(c => c.id === categoryId);
    if (!cat) return;
    const to = expand ?? true;
    cat.sections.forEach(sid => {
      if (this.sections[sid]) this.sections[sid].isExpanded = to;
    });
  }

  get isAllExpanded(): boolean {
    const sections = Object.values(this.sections).filter((section) => section.hasData);
    return sections.length > 0 && sections.every((section) => section.isExpanded);
  }

  private updateCharts(): void {
    if (!this.statsData) return;

    this.updateFileManagementChart();
    this.updateFileTypesChart();
    this.updateSecurityChart();
    this.updateStorageChart();
    this.updateActivityChart();
    this.updateSharedFilesChart();
    this.updateStorageEvolutionChart();
    this.updateQuotaDonut();
  }

  private updateSharedFilesChart(): void {
    if (!this.statsData?.sharing?.mostSharedFiles) return;
    const items = this.statsData.sharing.mostSharedFiles.slice(0, 8);
    this.sharedFilesChartData = {
      labels: items.map(i => i.filename),
      datasets: [{ data: items.map(i => i.shareCount), backgroundColor: items.map((_, idx) => ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'][idx % 4]), label: 'Shares' }]
    };
    this.sharedFilesChartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };
  }

  private updateStorageEvolutionChart(): void {
    const daily = (this.statsData?.fileManagement?.trends?.daily ?? []).slice(-30);
    if (!daily || daily.length === 0) return;
    const labels = daily.map(d => new Date((d as any)._id).toLocaleDateString());
    const sizes = daily.map(d => (d as any).totalSize ?? 0);
    this.storageEvolutionChartData = { labels, datasets: [{ label: 'Storage', data: sizes, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.08)', fill: true }] };
    this.storageEvolutionChartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };
  }

  private updateQuotaDonut(): void {
    const userUsed = this.statsData?.quota?.user.storageUsedBytes ?? 0;
    const userLimit = this.statsData?.quota?.user.storageLimitBytes ?? null;
    const tenantUsed = this.statsData?.quota?.tenant.storageUsedBytes ?? 0;
    const tenantLimit = this.statsData?.quota?.tenant.storageLimitBytes ?? null;
    const userRem = userLimit ? Math.max((userLimit - userUsed), 0) : 0;
    const tenantRem = tenantLimit ? Math.max((tenantLimit - tenantUsed), 0) : 0;

    this.quotaDonutData = {
      labels: ['Used (user)', 'Remaining (user)'],
      datasets: [{ data: [userUsed, userRem], backgroundColor: ['#ec4899', '#10b981'] }]
    };
    this.quotaDonutOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } };
  }

  private updateFileManagementChart(): void {
    if (!this.statsData?.fileManagement?.trends?.daily) return;

    const dailyData = this.statsData.fileManagement.trends.daily.slice(-30); // Last 30 days
    const labels = dailyData.map(item => {
      const date = new Date(item._id);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    // Support multiple series if available: uploads, downloads, deletes, activeFiles
    const uploadsSeries = dailyData.map(item => (item as any).uploads ?? (item as any).count ?? 0);
    const downloadsSeries = dailyData.map(item => (item as any).downloads ?? 0);
    const deletesSeries = dailyData.map(item => (item as any).deletes ?? (item as any).deletedCount ?? 0);
    const activeFilesSeries = dailyData.map(item => (item as any).activeFiles ?? 0);

    const datasets = [] as any[];
    datasets.push({ label: 'Uploads', data: uploadsSeries, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', tension: 0.3, fill: true });
    if (downloadsSeries.some(v => v > 0)) datasets.push({ label: 'Downloads', data: downloadsSeries, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.06)', tension: 0.3, fill: true });
    if (deletesSeries.some(v => v > 0)) datasets.push({ label: 'Deletes', data: deletesSeries, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.06)', tension: 0.3, fill: true });
    if (activeFilesSeries.some(v => v > 0)) datasets.push({ label: 'Active files', data: activeFilesSeries, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.06)', tension: 0.3, fill: true });

    this.fileManagementChartData = { labels, datasets };

    this.fileManagementChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      aspectRatio: 1.6,
      elements: { point: { radius: 0 } },
      plugins: { legend: { display: true, position: 'top' } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    };
  }

  private updateFileTypesChart(): void {
    if (!this.statsData?.fileTypes.distribution) return;

    const topTypes = this.statsData.fileTypes.distribution.slice(0, 8);

    this.fileTypesChartData = {
      labels: topTypes.map(type => type.type.split('/')[1]?.toUpperCase() || type.type.toUpperCase()),
      datasets: [
        {
          data: topTypes.map(type => type.count),
          backgroundColor: [
            '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
            '#06b6d4', '#6366f1', '#f97316'
          ],
          borderColor: '#ffffff',
          borderWidth: 2
        }
      ]
    };

    this.fileTypesChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'right' }
      }
    };
  }

  private updateSecurityChart(): void {
    if (!this.statsData?.security) return;

    this.securityChartData = {
      labels: ['Clean', 'Quarantined', 'Blocked', 'Suspicious'],
      datasets: [
        {
          label: 'Files',
          data: [
            this.statsData.security.clean,
            this.statsData.security.quarantined,
            this.statsData.security.blocked,
            this.statsData.security.suspicious
          ],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#f97316'],
          borderColor: '#ffffff',
          borderWidth: 2
        }
      ]
    };

    this.securityChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom' }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 }
        }
      }
    };
  }

  private updateStorageChart(): void {
    if (!this.statsData?.storage.storageByType) return;

    const topTypes = this.statsData.storage.storageByType.slice(0, 6);

    this.storageChartData = {
      labels: topTypes.map((type) => type.type.split('/')[1]?.toUpperCase() || type.type.toUpperCase()),
      datasets: [{
        data: topTypes.map((type) => type.totalSize),
        backgroundColor: ['#2563eb', '#14b8a6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'],
        borderColor: '#ffffff',
        borderWidth: 2
      }]
    };

    this.storageChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom' }
      }
    };
  }

  private updateActivityChart(): void {
    if (!this.statsData?.activity.activityTrends) return;

    const trends = this.statsData.activity.activityTrends.slice(-14); // Last 14 days
    const labels = trends.map(item => {
      const date = new Date(item._id);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    this.activityChartData = {
      labels,
      datasets: [
        {
          label: 'Uploads',
          data: trends.map(item => item.uploads),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.4,
          fill: true
        },
        {
          label: 'Downloads',
          data: trends.map(item => item.downloads),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          tension: 0.4,
          fill: true
        }
      ]
    };

    this.activityChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top' }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 }
        }
      }
    };
  }

  getSuccessRate(): number {
    if (!this.statsData?.analysis) return 0;
    const total = this.statsData.analysis.scanSuccess + this.statsData.analysis.scanFailed;
    return total > 0 ? (this.statsData.analysis.scanSuccess / total) * 100 : 0;
  }

  getFailureRate(): number {
    if (!this.statsData?.analysis) return 0;
    const total = this.statsData.analysis.scanSuccess + this.statsData.analysis.scanFailed;
    return total > 0 ? (this.statsData.analysis.scanFailed / total) * 100 : 0;
  }

  get quotaPercent(): number {
    const percent = this.statsData?.quota?.user.storageUsedPercent ?? 0;
    if (!Number.isFinite(percent)) {
      return 0;
    }

    return Math.min(Math.max(percent, 0), 100);
  }

  get tenantQuotaPercent(): number {
    const percent = this.statsData?.quota?.tenant.storageUsedPercent ?? this.statsData?.tenantOverview?.storageUsedPercent ?? 0;
    if (!Number.isFinite(percent)) {
      return 0;
    }

    return Math.min(Math.max(percent, 0), 100);
  }

  get overviewCards() {
    return [
      { label: 'Files', value: this.statsData?.fileManagement.uploads ?? 0, tone: 'blue' },
      { label: 'Shared', value: this.statsData?.sharing.filesShared ?? 0, tone: 'green' },
      { label: 'Received', value: this.statsData?.sharing.filesReceived ?? 0, tone: 'teal' },
      { label: 'Tenant users', value: this.statsData?.tenantOverview?.usersCount ?? 0, tone: 'amber' },
      { label: 'Storage used', value: this.statsData?.storage.totalUsed ?? 0, tone: 'violet', format: 'bytes' },
      { label: 'Quota usage', value: this.quotaPercent, tone: 'rose', format: 'percent' }
    ];
  }

  get tenantCards() {
    const tenant = this.statsData?.tenantOverview;
    return [
      { label: 'Users', value: tenant?.usersCount ?? 0 },
      { label: 'Active users', value: tenant?.activeUsersCount ?? 0 },
      { label: 'Files', value: tenant?.filesCount ?? 0 },
      { label: 'Shares', value: tenant?.sharedLinksCount ?? 0 },
      { label: 'Avg files/user', value: tenant ? this.formatDecimal(tenant.averageFilesPerUser) : '0' },
      { label: 'Avg storage/user', value: tenant ? this.formatBytes(tenant.averageStoragePerUser) : '0 B' }
    ];
  }

  get quotaCards() {
    return [
      { label: 'Plan', value: this.statsData?.quota?.plan ?? this.statsData?.tenantOverview?.plan ?? 'small' },
      { label: 'Scope', value: this.statsData?.quota?.scope ?? 'tenant' },
      { label: 'User usage', value: this.formatBytes(this.statsData?.quota?.user.storageUsedBytes ?? 0) },
      { label: 'Tenant usage', value: this.formatBytes(this.statsData?.quota?.tenant.storageUsedBytes ?? 0) }
    ];
  }

  formatDecimal(value: number): string {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value);
  }

  formatPercent(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return '0%';
    }

    return `${this.formatDecimal(value)}%`;
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  exportSection(sectionId: string, event: Event): void {
    event.stopPropagation();
    // Implement section-specific export
    this.exportToCSV(sectionId);
  }

  exportToCSV(sectionId?: string): void {
    if (!this.statsData) return;

    let csvContent = '';
    let filename = 'user-stats';

    switch (sectionId) {
      case 'fileManagement':
        csvContent = this.generateFileManagementCSV();
        filename = 'file-management-stats';
        break;
      case 'fileTypes':
        csvContent = this.generateFileTypesCSV();
        filename = 'file-types-stats';
        break;
      case 'security':
        csvContent = this.generateSecurityCSV();
        filename = 'security-stats';
        break;
      case 'sharing':
        csvContent = this.generateSharingCSV();
        filename = 'sharing-stats';
        break;
      case 'storage':
        csvContent = this.generateStorageCSV();
        filename = 'storage-stats';
        break;
      default:
        csvContent = this.generateFullCSV();
        filename = 'comprehensive-stats';
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private generateFileManagementCSV(): string {
    const data = this.statsData!.fileManagement;
    return `Category,Value\nUploads,${data.uploads}\nDownloads,${data.downloads}\nTotal Size,${data.totalSize}\n`;
  }

  private generateFileTypesCSV(): string {
    const data = this.statsData!.fileTypes.distribution;
    let csv = 'Type,Count,Total Size,Avg Size\n';
    data.forEach(type => {
      csv += `${type.type},${type.count},${type.totalSize},${type.avgSize}\n`;
    });
    return csv;
  }

  private generateSecurityCSV(): string {
    const data = this.statsData!.security;
    return `Status,Count\nClean,${data.clean}\nQuarantined,${data.quarantined}\nBlocked,${data.blocked}\nSuspicious,${data.suspicious}\n`;
  }

  private generateSharingCSV(): string {
    const data = this.statsData!.sharing;
    let csv = `Metric,Value\nFiles Shared,${data.filesShared}\nFiles Received,${data.filesReceived}\n\nMost Shared Files\nFilename,Share Count,Last Shared\n`;
    data.mostSharedFiles.forEach(file => {
      csv += `${file.filename},${file.shareCount},${file.lastShared}\n`;
    });
    return csv;
  }

  private generateStorageCSV(): string {
    const data = this.statsData!.storage;
    let csv = `Metric,Value\nTotal Used,${data.totalUsed}\nFile Count,${data.fileCount}\n\nLargest Files\nFilename,Size\n`;
    data.largestFiles.forEach(file => {
      csv += `${file.originalName},${file.size}\n`;
    });
    return csv;
  }

  private generateFullCSV(): string {
    let csv = 'Section,Metric,Value\n';

    // File Management
    const fm = this.statsData!.fileManagement;
    csv += `File Management,Uploads,${fm.uploads}\n`;
    csv += `File Management,Downloads,${fm.downloads}\n`;
    csv += `File Management,Total Size,${fm.totalSize}\n`;

    // Security
    const sec = this.statsData!.security;
    csv += `Security,Clean,${sec.clean}\n`;
    csv += `Security,Quarantined,${sec.quarantined}\n`;
    csv += `Security,Blocked,${sec.blocked}\n`;
    csv += `Security,Suspicious,${sec.suspicious}\n`;

    // Sharing
    const share = this.statsData!.sharing;
    csv += `Sharing,Files Shared,${share.filesShared}\n`;
    csv += `Sharing,Files Received,${share.filesReceived}\n`;

    return csv;
  }
}
