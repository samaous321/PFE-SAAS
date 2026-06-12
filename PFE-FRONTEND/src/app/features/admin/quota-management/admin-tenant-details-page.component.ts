import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, OnChanges, Input, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { NotificationService } from '../../../core/services/notification.service';
import {
  TenantApiService,
  TenantDetailsResponse,
  TenantDetailsRequestParams,
  TenantDetailsSortBy,
  TenantDetailsUsagePoint,
  TenantDetailsUser
} from '../../../core/services/tenant-api.service';

@Component({
  standalone: true,
  selector: 'app-admin-tenant-details-page',
  imports: [CommonModule, FormsModule, NgChartsModule],
  templateUrl: './admin-tenant-details-page.component.html',
  styleUrls: ['./admin-tenant-details-page.component.scss']
})
export class AdminTenantDetailsPageComponent implements OnInit, OnChanges {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly tenantApi = inject(TenantApiService);
  private readonly notification = inject(NotificationService);
  private readonly analytics = inject(AnalyticsService);

  @Input() tenantIdInput?: string;

  loading = false;
  details: TenantDetailsResponse | null = null;
  page = 1;
  limit = 8;
  totalUsers = 0;
  search = '';
  sortBy: TenantDetailsSortBy = 'storageUsedBytes';
  userDetailModalOpen = false;
  selectedUserDetails: TenantDetailsUser | null = null;
  userDetailDonutData: ChartConfiguration<'doughnut'>['data'] = {
    labels: ['Utilisé', 'Restant'],
    datasets: [
      {
        data: [0, 0],
        backgroundColor: ['#2563eb', '#e2e8f0'],
        borderColor: 'transparent',
        borderWidth: 0
      }
    ]
  };
  userDetailTrendData: ChartConfiguration<'line'>['data'] = {
    labels: ['J-3', 'J-2', 'J-1', 'Aujourd\'hui'],
    datasets: [
      {
        data: [],
        label: 'Tendance utilisation',
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.18)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#2563eb'
      }
    ]
  };
  userDetailDonutOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `${context.label}: ${this.formatBytes(Number(context.parsed))}`
        }
      }
    }
  };
  userDetailTrendOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 500,
      easing: 'easeOutQuart'
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label}: ${Number(context.parsed.y).toFixed(0)}%`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#475569' }
      },
      y: {
        grid: { color: 'rgba(15, 23, 42, 0.08)' },
        ticks: { color: '#475569', callback: (value: string | number) => `${value}%` }
      }
    }
  };
  sortDirection: 'asc' | 'desc' = 'desc';
  range: '7d' | '30d' | '90d' | '1y' = '1y';
  chartType: 'line' | 'bar' = 'line';
  tenantId = '';
  readonly rangeOptions: Array<{ key: '7d' | '30d' | '90d' | '1y'; label: string }> = [
    { key: '7d', label: '7 jours' },
    { key: '30d', label: '30 jours' },
    { key: '90d', label: '90 jours' },
    { key: '1y', label: '12 mois' }
  ];

  monthlyUsageChartData: ChartConfiguration<'line' | 'bar'>['data'] = {
    labels: [],
    datasets: []
  };

  monthlyUsageChartOptions: ChartConfiguration<'line' | 'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 600,
      easing: 'easeOutQuart'
    },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label}: ${this.formatBytes(Number(context.parsed.y))}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#475569' }
      },
      y: {
        grid: { color: 'rgba(15, 23, 42, 0.08)' },
        ticks: {
          color: '#475569',
          callback: (value: string | number) => this.formatBytes(Number(value))
        }
      }
    }
  };

  topUsersChartData: ChartConfiguration<'bar'>['data'] = {
    labels: [],
    datasets: []
  };

  topUsersChartOptions: ChartConfiguration<'bar'>['options'] = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 600,
      easing: 'easeOutQuart'
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label}: ${this.formatBytes(Number(context.parsed.x))}`
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(15, 23, 42, 0.08)' },
        ticks: {
          color: '#475569',
          callback: (value: string | number) => this.formatBytes(Number(value))
        }
      },
      y: {
        grid: { display: false },
        ticks: { color: '#475569' }
      }
    }
  };

  usageBreakdownChartData: ChartConfiguration<'doughnut'>['data'] = {
    labels: ['Utilisé', 'Restant'],
    datasets: [
      {
        data: [0, 0],
        backgroundColor: ['#2563eb', '#0ea5e9'],
        borderColor: 'transparent',
        hoverBackgroundColor: ['#1d4ed8', '#0ea5e9'],
        borderWidth: 0
      }
    ]
  };

  usageBreakdownChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 600,
      easing: 'easeOutQuart'
    },
    cutout: '68%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.label || '';
            return `${label}: ${this.formatBytes(Number(context.parsed))}`;
          }
        }
      }
    }
  };

  ngOnInit(): void {
    // prefer input tenant id when provided (inline embedding), otherwise use route param
    this.tenantId = this.tenantIdInput || this.route.snapshot.paramMap.get('tenantId') || '';
    const query = this.route.snapshot.queryParamMap;

    this.page = Number(query.get('page')) || 1;
    this.limit = Number(query.get('limit')) || 8;
    this.search = query.get('search') || '';
    this.sortBy = (query.get('sortBy') as TenantDetailsSortBy) || 'storageUsedBytes';
    this.sortDirection = (query.get('sortDirection') as 'asc' | 'desc') || 'desc';
    this.range = (query.get('range') as '7d' | '30d' | '90d' | '1y') || '1y';

    if (this.tenantId) {
      this.loadTenantDetails();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tenantIdInput'] && !changes['tenantIdInput'].isFirstChange()) {
      this.tenantId = this.tenantIdInput || '';
      if (this.tenantId) {
        this.loadTenantDetails();
      }
    }
  }

  private updateUrlQuery(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        page: this.page,
        limit: this.limit,
        sortBy: this.sortBy,
        sortDirection: this.sortDirection,
        search: this.search,
        range: this.range
      },
      queryParamsHandling: 'merge'
    });
  }

  loadTenantDetails(): void {
    if (!this.tenantId) {
      return;
    }

    this.loading = true;
    const params: TenantDetailsRequestParams = {
      page: this.page,
      limit: this.limit,
      sortBy: this.sortBy,
      sortDirection: this.sortDirection,
      search: this.search,
      range: this.range
    };

    this.tenantApi.getTenantDetails(this.tenantId, params).subscribe({
      next: (details) => {
        this.details = details;
        this.totalUsers = details.usersTotal || details.users.length || 0;
        this.updateChartData(details);
        this.loading = false;
      },
      error: (response) => {
        this.notification.error(response?.error?.error || 'Impossible de charger les détails du tenant');
        this.details = null;
        this.totalUsers = 0;
        this.updateChartData(null);
        this.loading = false;
      }
    });
  }

  private updateChartData(details: TenantDetailsResponse | null): void {
    if (details) {
      this.ensureSaturationForecast();
    }

    const usageSeries = details?.usageSeries || [];
    this.monthlyUsageChartData = {
      labels: usageSeries.map((item) => item.label),
      datasets: [
        {
          data: usageSeries.map((item) => item.storageUsedBytes),
          label: 'Stockage utilisé',
          backgroundColor: 'rgba(37, 99, 235, 0.18)',
          borderColor: '#2563eb',
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ]
    };

    const topUsers = (details?.users || []).slice(0, 5);
    this.topUsersChartData = {
      labels: topUsers.map((user) => user.name || user.email),
      datasets: [
        {
          data: topUsers.map((user) => user.storageUsedBytes),
          label: 'Storage used',
          backgroundColor: 'rgba(37, 99, 235, 0.84)',
          borderRadius: 12,
          barThickness: 18
        }
      ]
    };

    const quota = details?.quota;
    const used = quota?.storageUsed ?? 0;
    const remaining = quota?.remainingStorageBytes ?? 0;
    this.usageBreakdownChartData = {
      labels: ['Utilisé', 'Restant'],
      datasets: [
        {
          data: [used, Math.max(remaining, 0)],
          backgroundColor: ['#2563eb', '#0ea5e9'],
          borderColor: 'transparent',
          hoverBackgroundColor: ['#1d4ed8', '#0ea5e9'],
          borderWidth: 0
        }
      ]
    };
  }

  openUserDetail(user: TenantDetailsUser): void {
    this.selectedUserDetails = user;
    this.userDetailModalOpen = true;
    this.updateUserDetailCharts(user);
  }

  closeUserDetail(): void {
    this.userDetailModalOpen = false;
    this.selectedUserDetails = null;
  }

  private updateUserDetailCharts(user: TenantDetailsUser): void {
    const used = user.storageUsedBytes;
    const remaining = user.storageLimitBytes === null ? 0 : Math.max(0, user.storageLimitBytes - used);
    this.userDetailDonutData = {
      labels: ['Utilisé', 'Restant'],
      datasets: [
        {
          data: [used, remaining],
          backgroundColor: ['#2563eb', 'rgba(37, 99, 235, 0.18)'],
          borderColor: 'transparent',
          borderWidth: 0
        }
      ]
    };

    const percent = Number(user.storageUsedPercent ?? 0);
    this.userDetailTrendData = {
      labels: ['J-3', 'J-2', 'J-1', 'Aujourd\'hui'],
      datasets: [
        {
          data: [
            Math.max(0, percent - 12),
            Math.max(0, percent - 7),
            Math.max(0, percent - 2),
            percent
          ],
          label: 'Utilisation (%)',
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.18)',
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: '#2563eb'
        }
      ]
    };
  }

  getUserRoleClass(role: string | null | undefined): string {
    if (!role) {
      return 'role-user';
    }
    return role.toLowerCase().includes('admin') ? 'role-admin' : 'role-user';
  }

  getUserQuotaEstimate(user: TenantDetailsUser): string {
    if (user.storageLimitBytes === null) {
      return 'Quota illimité';
    }
    if (user.storageUsedPercent === null || user.storageUsedPercent <= 0) {
      return 'Données insuffisantes';
    }
    const remaining = Math.max(0, (user.storageLimitBytes - user.storageUsedBytes) / (user.storageUsedBytes / 30 || 1));
    return `${Math.max(1, Math.round(remaining))} jours estimés`;
  }

  onRangeChange(range: '7d' | '30d' | '90d' | '1y'): void {
    if (this.range === range) {
      return;
    }

    this.range = range;
    this.page = 1;
    this.updateUrlQuery();
    this.loadTenantDetails();
  }

  onChartTypeChange(type: 'line' | 'bar'): void {
    this.chartType = type;
  }

  goBack(): void {
    this.router.navigate(['/admin/quotas']);
  }

  onSearch(value: string): void {
    this.search = value.trim();
    this.page = 1;
    this.updateUrlQuery();
    this.loadTenantDetails();
  }

  onLimitChange(value: string): void {
    this.limit = Number(value) || 8;
    this.page = 1;
    this.updateUrlQuery();
    this.loadTenantDetails();
  }

  onPageChange(page: number): void {
    if (page === this.page) {
      return;
    }

    this.page = page;
    this.updateUrlQuery();
    this.loadTenantDetails();
  }

  toggleSort(column: TenantDetailsSortBy): void {
    const direction = this.sortBy === column ? (this.sortDirection === 'asc' ? 'desc' : 'asc') : 'desc';
    this.sortBy = column;
    this.sortDirection = direction;
    this.page = 1;
    this.updateUrlQuery();
    this.loadTenantDetails();
  }

  getSortIndicator(column: TenantDetailsSortBy): string {
    if (this.sortBy !== column) {
      return '';
    }
    return this.sortDirection === 'asc' ? '▲' : '▼';
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalUsers / this.limit));
  }

  formatBytes(bytes: number | null | undefined): string {
    return this.analytics.formatBytes(bytes || 0);
  }

  formatPercent(value: number | null | undefined, digits = 0): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '0%';
    }

    return `${Number(value).toFixed(digits).replace('.', ',')}%`;
  }

  formatDateLabel(value: string | null | undefined): string {
    if (!value) {
      return 'N/A';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'N/A';
    }
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  private ensureSaturationForecast(): void {
    if (!this.details) return;
    if (!this.details.saturationForecast) {
      this.details.saturationForecast = {
        averageMonthlyGrowthLabel: 'N/A',
        averageMonthlyGrowthBytes: 0,
        monthsRemaining: null,
        estimatedFullDate: null,
        trend: 'unknown',
        remainingStorageBytes: null
      };
    }
  }

  getUsageStatusText(percent: number | null | undefined): string {
    if (percent === null || percent === undefined) {
      return 'UNKNOWN';
    }
    if (percent >= 90) {
      return 'Critique';
    }
    if (percent >= 80) {
      return 'Alerte';
    }
    return 'Normal';
  }

  getUsageStatusIcon(percent: number | null | undefined): string {
    if (percent === null || percent === undefined) {
      return '🟢';
    }
    return percent >= 90 ? '🔴' : percent >= 80 ? '🟡' : '🟢';
  }

  getStatusClass(percent: number | null | undefined): string {
    if (!percent) {
      return 'status-normal';
    }
    if (percent >= 90) {
      return 'status-danger';
    }
    if (percent >= 80) {
      return 'status-warning';
    }
    return 'status-normal';
  }
}
