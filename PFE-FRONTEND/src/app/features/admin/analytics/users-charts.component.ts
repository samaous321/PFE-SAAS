import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartWrapperComponent } from './chart-wrapper.component';
import { CHART_COLORS, METRIC_FORMATS } from './dashboard-design.constants';
import { AdminStatsReport } from '../../../core/services/admin-api.service';

@Component({
  selector: 'app-users-charts',
  standalone: true,
  imports: [CommonModule, ChartWrapperComponent],
  template: `
    <div class="users-charts-container">
      <!-- Chart 1: User Distribution by Tenant (Pie) -->
      <div class="chart-item">
        <app-chart-wrapper 
          title="👥 Distribution Utilisateurs par Tenant"
          [loading]="loading"
        >
          <div class="chart-placeholder chart-pie">
            <p class="chart-note">Pie chart: User distribution across tenants</p>
            <div class="user-distribution">
              <div class="pie-legend">
                <div *ngFor="let tenant of topUserTenants; let i = index" class="legend-item">
                  <div class="legend-color" [style.background-color]="getChartColor(i)"></div>
                  <span class="legend-label">{{ tenant.tenantName }}</span>
                  <span class="legend-value">{{ tenant.usersCount }} ({{ getUserPercent(tenant.usersCount) }}%)</span>
                </div>
              </div>
            </div>
          </div>
        </app-chart-wrapper>
      </div>

      <!-- Chart 2: Top 5 Active Tenants -->
      <div class="chart-item">
        <app-chart-wrapper 
          title="🎯 Top 5 Tenants les Plus Actifs"
          [loading]="loading"
        >
          <div class="chart-placeholder chart-bar">
            <p class="chart-note">Bar chart: Top 5 tenants by activity score</p>
            <div class="activity-list">
              <div *ngFor="let tenant of topActiveTenants; let i = index" class="activity-item">
                <div class="activity-rank">{{ i + 1 }}</div>
                <div class="activity-info">
                  <p class="activity-name">{{ tenant.tenantName }}</p>
                  <p class="activity-users">{{ tenant.usersCount }} utilisateurs</p>
                </div>
                <div class="activity-bar-container">
                  <div 
                    class="activity-bar"
                    [style.width.%]="getActivityPercentage(tenant.activityScore)"
                    [style.background-color]="getActivityColor(tenant.activityScore)"
                  ></div>
                </div>
                <span class="activity-score">{{ Math.round(tenant.activityScore) }}</span>
              </div>
            </div>
          </div>
        </app-chart-wrapper>
      </div>
    </div>
  `,
  styles: [`
    .users-charts-container {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
      gap: 24px;
    }

    .chart-item {
      animation: slideUp 0.3s ease-out;
    }

    .chart-placeholder {
      min-height: 320px;
      background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
      border-radius: 8px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      border: 2px dashed #e5e7eb;
    }

    .chart-note {
      font-size: 0.875rem;
      font-style: italic;
      margin: 0 0 16px 0;
      text-align: center;
      color: #9ca3af;
    }

    .user-distribution {
      width: 100%;
    }

    .pie-legend {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px;
      background: white;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
    }

    .legend-color {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      flex-shrink: 0;
    }

    .legend-label {
      flex: 1;
      font-size: 0.875rem;
      font-weight: 500;
      color: #111827;
    }

    .legend-value {
      font-size: 0.875rem;
      font-weight: 600;
      color: #6b7280;
      text-align: right;
      min-width: 100px;
    }

    .activity-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .activity-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: white;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
    }

    .activity-rank {
      min-width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.875rem;
    }

    .activity-info {
      flex: 0 0 150px;
    }

    .activity-name {
      margin: 0;
      font-weight: 600;
      color: #111827;
      font-size: 0.875rem;
    }

    .activity-users {
      margin: 4px 0 0 0;
      font-size: 0.75rem;
      color: #6b7280;
    }

    .activity-bar-container {
      flex: 1;
      height: 24px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
    }

    .activity-bar {
      height: 100%;
      transition: width 0.3s ease;
      min-width: 2px;
    }

    .activity-score {
      min-width: 50px;
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
      .users-charts-container {
        grid-template-columns: 1fr;
      }

      .activity-score {
        min-width: 40px;
      }
    }
  `]
})
export class UsersChartsComponent {
  @Input() stats: AdminStatsReport | null = null;
  @Input() loading = false;

  Math = Math;

  get topUserTenants(): any[] {
    if (!this.stats?.tenants) return [];
    return [...this.stats.tenants]
      .sort((a, b) => b.usersCount - a.usersCount)
      .slice(0, 5);
  }

  get topActiveTenants(): any[] {
    if (!this.stats?.insights.mostActiveTenants) return [];
    return this.stats.insights.mostActiveTenants.slice(0, 5);
  }

  get totalUsers(): number {
    return this.stats?.global.totalUsers || 0;
  }

  get maxActivityScore(): number {
    if (this.topActiveTenants.length === 0) return 100;
    return Math.max(...this.topActiveTenants.map(t => t.activityScore || 0));
  }

  getUserPercent(userCount: number): number {
    if (this.totalUsers === 0) return 0;
    return Math.round((userCount / this.totalUsers) * 100);
  }

  getActivityPercentage(score: number): number {
    if (this.maxActivityScore === 0) return 0;
    return (score / this.maxActivityScore) * 100;
  }

  getActivityColor(score: number): string {
    const percentage = (score / this.maxActivityScore) * 100;
    if (percentage >= 80) return '#10b981';
    if (percentage >= 60) return '#0ea5e9';
    if (percentage >= 40) return '#f59e0b';
    return '#ef4444';
  }

  getChartColor(index: number): string {
    const colors = CHART_COLORS.pie;
    return colors[index % colors.length];
  }
}
