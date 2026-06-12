import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartWrapperComponent } from './chart-wrapper.component';
import { METRIC_FORMATS } from './dashboard-design.constants';
import { AdminStatsReport } from '../../../core/services/admin-api.service';

@Component({
  selector: 'app-trends-charts',
  standalone: true,
  imports: [CommonModule, ChartWrapperComponent],
  template: `
    <div class="trends-charts-container">
      <!-- Chart 1: Tenant Growth (Area) -->
      <div class="chart-item">
        <app-chart-wrapper 
          title="📈 Croissance des Tenants"
          [loading]="loading"
        >
          <div class="chart-placeholder chart-area">
            <p class="chart-note">Area chart: Tenant growth trend</p>
            <div class="growth-info">
              <div class="growth-item">
                <span class="growth-label">Total Tenants</span>
                <span class="growth-value">{{ totalTenants }}</span>
              </div>
              <div class="growth-item">
                <span class="growth-label">Actifs</span>
                <span class="growth-value">{{ activeTenants }}</span>
              </div>
              <div class="growth-item">
                <span class="growth-label">Taux d'Activité</span>
                <span class="growth-value">{{ activityRate }}%</span>
              </div>
              <div class="growth-item">
                <span class="growth-label">Croissance</span>
                <span class="growth-value" style="color: #10b981;">+12%</span>
              </div>
            </div>
          </div>
        </app-chart-wrapper>
      </div>

      <!-- Chart 2: Activity Score Heatmap -->
      <div class="chart-item">
        <app-chart-wrapper 
          title="🔥 Score d'Activité par Tenant"
          [loading]="loading"
        >
          <div class="chart-placeholder chart-heatmap">
            <p class="chart-note">Heatmap: Activity intensity by tenant</p>
            <div class="activity-heatmap">
              <div *ngFor="let tenant of activityScores" class="heatmap-item">
                <div class="heatmap-label">{{ tenant.tenantName | slice:0:10 }}</div>
                <div class="heatmap-bar">
                  <div 
                    class="heatmap-fill"
                    [style.width.%]="tenant.activityScore"
                    [style.background-color]="getHeatmapColor(tenant.activityScore)"
                  ></div>
                </div>
                <div class="heatmap-value">{{ tenant.activityScore }}</div>
              </div>
            </div>
          </div>
        </app-chart-wrapper>
      </div>

      <!-- Table: Top 10 Tenants Summary -->
      <div class="chart-item chart-full-width">
        <app-chart-wrapper 
          title="📋 Top 10 Tenants - Résumé Global"
          [loading]="loading"
        >
          <div class="table-container">
            <table class="summary-table">
              <thead>
                <tr>
                  <th>Rang</th>
                  <th>Nom Tenant</th>
                  <th>Utilisateurs</th>
                  <th>Fichiers</th>
                  <th>Stockage</th>
                  <th>Menaces</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let tenant of topTenants; let i = index">
                  <td class="rank-cell">
                    <span class="rank-badge" [class.rank-1]="i === 0" [class.rank-2]="i === 1" [class.rank-3]="i === 2">
                      {{ i + 1 }}
                    </span>
                  </td>
                  <td class="name-cell">
                    <div class="tenant-info">
                      <p class="tenant-name">{{ tenant.tenantName }}</p>
                      <p class="tenant-id">{{ tenant.tenantId | slice:0:8 }}...</p>
                    </div>
                  </td>
                  <td class="number-cell">{{ tenant.usersCount | number }}</td>
                  <td class="number-cell">{{ METRIC_FORMATS.compact(tenant.filesCount) }}</td>
                  <td class="number-cell">{{ formatBytes(tenant.storageUsedBytes) }}</td>
                  <td class="threat-cell">
                    <span 
                      class="threat-badge" 
                      [class.threat-high]="tenant.suspicious + tenant.blocked + tenant.quarantined > 5"
                      [class.threat-low]="tenant.suspicious + tenant.blocked + tenant.quarantined <= 5"
                    >
                      {{ tenant.suspicious + tenant.blocked + tenant.quarantined }}
                    </span>
                  </td>
                  <td class="score-cell">
                    <div class="score-display">
                      <div class="score-bar">
                        <div 
                          class="score-fill"
                          [style.width.%]="getTenantScore(tenant)"
                          [style.background-color]="getScoreColor(getTenantScore(tenant))"
                        ></div>
                      </div>
                      <span class="score-number">{{ getTenantScore(tenant) }}%</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </app-chart-wrapper>
      </div>
    </div>
  `,
  styles: [`
    .trends-charts-container {
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

    .growth-info {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }

    .growth-item {
      background: white;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      text-align: center;
    }

    .growth-label {
      font-size: 0.75rem;
      color: #6b7280;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.5px;
    }

    .growth-value {
      font-size: 1.25rem;
      font-weight: 700;
      color: #111827;
    }

    .activity-heatmap {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .heatmap-item {
      display: grid;
      grid-template-columns: 100px 1fr 40px;
      gap: 12px;
      align-items: center;
    }

    .heatmap-label {
      font-size: 0.75rem;
      color: #6b7280;
      font-weight: 500;
      text-align: right;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .heatmap-bar {
      height: 20px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
    }

    .heatmap-fill {
      height: 100%;
      transition: width 0.3s ease;
      min-width: 2px;
    }

    .heatmap-value {
      font-size: 0.75rem;
      font-weight: 600;
      color: #111827;
      text-align: right;
    }

    .table-container {
      width: 100%;
      overflow-x: auto;
    }

    .summary-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }

    .summary-table thead {
      background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
      border-bottom: 2px solid #d1d5db;
    }

    .summary-table th {
      padding: 12px;
      text-align: left;
      font-weight: 600;
      color: #374151;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-size: 0.75rem;
    }

    .summary-table tbody tr {
      border-bottom: 1px solid #e5e7eb;
      transition: background-color 0.2s ease;
    }

    .summary-table tbody tr:hover {
      background-color: #f9fafb;
    }

    .summary-table td {
      padding: 12px;
      color: #111827;
    }

    .rank-cell {
      text-align: center;
    }

    .rank-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      font-weight: 700;
      color: white;
      font-size: 0.875rem;
      background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
    }

    .rank-badge.rank-1 {
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    }

    .rank-badge.rank-2 {
      background: linear-gradient(135deg, #d1d5db 0%, #9ca3af 100%);
    }

    .rank-badge.rank-3 {
      background: linear-gradient(135deg, #f87171 0%, #fb7185 100%);
    }

    .name-cell {
      max-width: 200px;
    }

    .tenant-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .tenant-name {
      margin: 0;
      font-weight: 600;
      color: #111827;
    }

    .tenant-id {
      margin: 0;
      font-size: 0.75rem;
      color: #9ca3af;
      font-family: 'Courier New', monospace;
    }

    .number-cell {
      text-align: right;
      font-weight: 500;
    }

    .threat-cell {
      text-align: center;
    }

    .threat-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.75rem;
    }

    .threat-badge.threat-high {
      background: #fee2e2;
      color: #991b1b;
    }

    .threat-badge.threat-low {
      background: #dcfce7;
      color: #047857;
    }

    .score-cell {
      text-align: right;
    }

    .score-display {
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: flex-end;
    }

    .score-bar {
      width: 60px;
      height: 16px;
      background: #e5e7eb;
      border-radius: 3px;
      overflow: hidden;
    }

    .score-fill {
      height: 100%;
      transition: width 0.3s ease;
    }

    .score-number {
      min-width: 40px;
      text-align: right;
      font-weight: 600;
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
      .trends-charts-container {
        grid-template-columns: 1fr;
      }

      .growth-info {
        grid-template-columns: repeat(2, 1fr);
      }

      .table-container {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }

      .summary-table {
        font-size: 0.75rem;
      }

      .summary-table th,
      .summary-table td {
        padding: 8px;
      }
    }
  `]
})
export class TrendsChartsComponent {
  @Input() stats: AdminStatsReport | null = null;
  @Input() loading = false;

  METRIC_FORMATS = METRIC_FORMATS;

  get totalTenants(): number {
    return this.stats?.global.totalTenants || 0;
  }

  get activeTenants(): number {
    return this.stats?.tenants.length || 0;
  }

  get activityRate(): number {
    if (this.totalTenants === 0) return 0;
    return Math.round((this.activeTenants / this.totalTenants) * 100);
  }

  get activityScores(): any[] {
    if (!this.stats?.insights.mostActiveTenants) return [];
    return this.stats.insights.mostActiveTenants
      .slice(0, 10)
      .map(t => ({
        tenantName: t.tenantName,
        activityScore: Math.round(t.activityScore)
      }));
  }

  get topTenants(): any[] {
    if (!this.stats?.tenants) return [];
    return this.stats.tenants.slice(0, 10);
  }

  getHeatmapColor(score: number): string {
    if (score >= 75) return '#047857';
    if (score >= 50) return '#10b981';
    if (score >= 25) return '#86efac';
    return '#dcfce7';
  }

  getTenantScore(tenant: any): number {
    const fileScore = Math.min((tenant.filesCount / 1000) * 100, 100);
    const userScore = Math.min((tenant.usersCount / 100) * 100, 100);
    const threatScore = Math.max(0, 100 - ((tenant.suspicious + tenant.blocked + tenant.quarantined) * 5));
    return Math.round((fileScore + userScore + threatScore) / 3);
  }

  getScoreColor(score: number): string {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#0ea5e9';
    if (score >= 40) return '#f59e0b';
    return '#ef4444';
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}
