import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration, ChartType } from 'chart.js';
import { Tenant, TenantQuotaSummary, TenantDetailsResponse, TenantDetailsSortBy, TenantDetailsUsagePoint } from '../../../core/services/tenant-api.service';

@Component({
  standalone: true,
  selector: 'app-tenant-details-modal',
  imports: [CommonModule, NgChartsModule],
  templateUrl: './tenant-details-modal.component.html',
  styleUrls: ['./tenant-details-modal.component.scss']
})
export class TenantDetailsModalComponent {
  @Input() details: TenantDetailsResponse | null = null;
  @Input() selectedTenant: Tenant | null = null;
  @Input() loading = false;
  @Input() page = 1;
  @Input() limit = 8;
  @Input() totalUsers = 0;
  @Input() search = '';
  @Input() sortBy: TenantDetailsSortBy = 'storageUsedBytes';
  @Input() sortDirection: 'asc' | 'desc' = 'desc';

  @Output() close = new EventEmitter<void>();
  @Output() pageChange = new EventEmitter<number>();
  @Output() limitChange = new EventEmitter<number>();
  @Output() sortChange = new EventEmitter<{ sortBy: TenantDetailsSortBy; sortDirection: 'asc' | 'desc' }>();
  @Output() searchChange = new EventEmitter<string>();

  readonly userPageSizes = [5, 8, 10, 15];

  get monthlyUsageChartData(): ChartConfiguration<'line'>['data'] {
    const usage: TenantDetailsUsagePoint[] = this.details?.usageSeries || [];
    return {
      labels: usage.map((month) => month.label),
      datasets: [
        {
          data: usage.map((month) => month.storageUsedBytes),
          label: 'Storage used',
          backgroundColor: 'rgba(37, 99, 235, 0.18)',
          borderColor: '#2563eb',
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ]
    };
  }

  get monthlyUsageChartOptions(): ChartConfiguration<'line'>['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
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
  }

  get topUsersChartData(): ChartConfiguration<'bar'>['data'] {
    const users = (this.details?.users || []).slice(0, 5);
    return {
      labels: users.map((user) => user.name || user.email),
      datasets: [
        {
          data: users.map((user) => user.storageUsedBytes),
          label: 'Storage used',
          backgroundColor: 'rgba(37, 99, 235, 0.84)',
          borderRadius: 12,
          barThickness: 18
        }
      ]
    };
  }

  get topUsersChartOptions(): ChartConfiguration<'bar'>['options'] {
    return {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
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
  }

  get usageBreakdownChartData(): ChartConfiguration<'doughnut'>['data'] {
    const quota = this.details?.quota;
    const used = quota?.storageUsed ?? 0;
    const remaining = quota?.remainingStorageBytes ?? 0;

    return {
      labels: ['Used', 'Remaining'],
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

  get usageBreakdownChartOptions(): ChartConfiguration<'doughnut'>['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
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
  }

  get hasUsageData(): boolean {
    return (this.details?.usageSeries || []).some((month) => Number(month.storageUsedBytes || 0) > 0);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalUsers / this.limit));
  }

  get currentPageLabel(): string {
    return `${this.page} / ${this.totalPages}`;
  }

  toggleSort(column: TenantDetailsSortBy): void {
    const direction = this.sortBy === column ? (this.sortDirection === 'asc' ? 'desc' : 'asc') : 'desc';
    this.sortChange.emit({ sortBy: column, sortDirection: direction });
  }

  onSearch(value: string): void {
    this.searchChange.emit(value.trim());
  }

  onLimitChange(value: string): void {
    const limit = Number(value) || 8;
    this.limitChange.emit(limit);
  }

  onPageChange(page: number): void {
    this.pageChange.emit(page);
  }

  getSortIndicator(column: TenantDetailsSortBy): string {
    if (this.sortBy !== column) {
      return '';
    }
    return this.sortDirection === 'asc' ? '▲' : '▼';
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

  formatBytes(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined) {
      return '0 B';
    }

    const byteValues = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = Number(bytes);
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < byteValues.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    return `${value.toFixed(1)} ${byteValues[unitIndex]}`;
  }
}
