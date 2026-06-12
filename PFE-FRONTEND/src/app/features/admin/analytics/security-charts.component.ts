import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartWrapperComponent } from './chart-wrapper.component';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { DASHBOARD_COLORS, CHART_COLORS } from './dashboard-design.constants';
import { AdminStatsReport } from '../../../core/services/admin-api.service';

@Component({
  selector: 'app-security-charts',
  standalone: true,
  imports: [CommonModule, NgChartsModule, ChartWrapperComponent],
  template: `
    <div class="security-charts-container">
      <!-- Chart 1: Security Incidents Timeline -->
      <div class="chart-item">
        <app-chart-wrapper
          title="📈 Incidents de Sécurité - Tendance"
          [loading]="loading"
        >
          <div class="chart-area">
            <canvas
              baseChart
              [data]="securityTrendData"
              [options]="securityTrendOptions"
              [type]="'line'"
            ></canvas>
          </div>
        </app-chart-wrapper>
      </div>

      <!-- Chart 2: Threat Distribution -->
      <div class="chart-item">
        <app-chart-wrapper
          title="🎯 Distribution des Menaces"
          [loading]="loading"
        >
          <div class="chart-area">
            <canvas
              baseChart
              [data]="threatDistributionData"
              [options]="threatDistributionOptions"
              [type]="'doughnut'"
            ></canvas>
          </div>
        </app-chart-wrapper>
      </div>

      <!-- Chart 3: Top 5 Risky Tenants -->
      <div class="chart-item chart-full-width">
        <app-chart-wrapper
          title="⚠️ Top 5 Tenants les Plus Risqués"
          [loading]="loading"
        >
          <div class="chart-list-wrapper">
            <div class="risk-list">
              <div *ngFor="let tenant of topRiskyTenants; let i = index" class="risk-item">
                <div class="risk-rank">{{ i + 1 }}</div>
                <div class="risk-info">
                  <p class="risk-name">{{ tenant.tenantName }}</p>
                  <p class="risk-detail">{{ tenant.suspicious + tenant.blocked + tenant.quarantined }} incidents</p>
                </div>
                <div class="risk-bar-container">
                  <div
                    class="risk-bar"
                    [style.width.%]="(tenant.suspicious + tenant.blocked + tenant.quarantined) / maxIncidents * 100"
                    [style.background-color]="getRiskColor(tenant.suspicious + tenant.blocked + tenant.quarantined)"
                  ></div>
                </div>
                <span class="risk-count">{{ tenant.suspicious + tenant.blocked + tenant.quarantined }}</span>
              </div>
            </div>
          </div>
        </app-chart-wrapper>
      </div>
    </div>
  `,
  styles: [`
    .security-charts-container {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
      gap: 24px;
    }

    .chart-item {
      animation: slideUp 0.3s ease-out;
    }

    .chart-item.chart-full-width {
      grid-column: 1 / -1;
    }

    .chart-area {
      min-height: 320px;
      width: 100%;
    }

    .chart-list-wrapper {
      width: 100%;
    }

    .risk-list {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .risk-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: white;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
    }

    .risk-rank {
      min-width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #3b82f6 0%, #1f6feb 100%);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.875rem;
    }

    .risk-info {
      flex: 0 0 150px;
    }

    .risk-name {
      margin: 0;
      font-weight: 600;
      color: #111827;
      font-size: 0.875rem;
    }

    .risk-detail {
      margin: 4px 0 0 0;
      font-size: 0.75rem;
      color: #6b7280;
    }

    .risk-bar-container {
      flex: 1;
      height: 24px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
    }

    .risk-bar {
      height: 100%;
      transition: width 0.3s ease;
    }

    .risk-count {
      min-width: 40px;
      text-align: right;
      font-weight: 600;
      color: #111827;
      font-size: 0.875rem;
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (max-width: 768px) {
      .security-charts-container {
        grid-template-columns: 1fr;
      }

      .chart-item.chart-full-width {
        grid-column: 1;
      }
    }
  `]
})
export class SecurityChartsComponent {
  @Input() stats: AdminStatsReport | null = null;
  @Input() loading = false;

  get securityTrendData(): ChartConfiguration['data'] {
    const points = this.stats?.activity.daily || [];
    return {
      labels: points.map((item) => item.period),
      datasets: [
        {
          label: 'Suspects',
          data: points.map((item) => item.uploads || 0),
          borderColor: CHART_COLORS.line1,
          backgroundColor: 'rgba(31, 111, 235, 0.18)',
          fill: true,
          tension: 0.35,
          borderWidth: 2
        },
        {
          label: 'Bloqués',
          data: points.map((item) => item.downloads || 0),
          borderColor: CHART_COLORS.line2,
          backgroundColor: 'rgba(14, 165, 168, 0.18)',
          fill: true,
          tension: 0.35,
          borderWidth: 2
        },
        {
          label: 'Quarantinés',
          data: points.map((item) => item.shares || 0),
          borderColor: CHART_COLORS.line3,
          backgroundColor: 'rgba(245, 158, 11, 0.18)',
          fill: true,
          tension: 0.35,
          borderWidth: 2
        }
      ]
    };
  }

  get securityTrendOptions(): ChartOptions {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: DASHBOARD_COLORS.gray700
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
          grid: { color: 'rgba(148, 163, 184, 0.2)' },
          ticks: { color: DASHBOARD_COLORS.gray700 }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(148, 163, 184, 0.2)' },
          ticks: { color: DASHBOARD_COLORS.gray700, precision: 0 }
        }
      }
    };
  }

  get threatDistributionData(): ChartConfiguration['data'] {
    return {
      labels: ['Suspects', 'Bloqués', 'Quarantinés'],
      datasets: [
        {
          data: [this.suspiciousCount, this.blockedCount, this.quarantinedCount],
          backgroundColor: ['#f5b643', '#e55353', '#9f7aea'],
          hoverOffset: 10
        }
      ]
    };
  }

  get threatDistributionOptions(): ChartOptions {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: DASHBOARD_COLORS.gray700
          }
        },
        tooltip: {
          backgroundColor: '#10223d',
          titleColor: '#ffffff',
          bodyColor: '#d8e7ff'
        }
      }
    };
  }

  get suspiciousCount(): number {
    return this.stats?.security.totals.suspicious || 0;
  }

  get blockedCount(): number {
    return this.stats?.security.totals.blocked || 0;
  }

  get quarantinedCount(): number {
    return this.stats?.security.totals.quarantined || 0;
  }

  get topRiskyTenants(): any[] {
    if (!this.stats?.insights.mostSuspiciousTenants) return [];
    return this.stats.insights.mostSuspiciousTenants.slice(0, 5);
  }

  get maxIncidents(): number {
    if (this.topRiskyTenants.length === 0) return 100;
    const max = Math.max(
      ...this.topRiskyTenants.map((t) => t.suspicious + t.blocked + t.quarantined)
    );
    return max || 100;
  }

  getRiskColor(count: number): string {
    const percentage = (count / this.maxIncidents) * 100;
    if (percentage >= 75) return '#dc2626';
    if (percentage >= 50) return '#f59e0b';
    if (percentage >= 25) return '#fbbf24';
    return '#10b981';
  }
}
