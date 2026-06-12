import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartWrapperComponent } from './chart-wrapper.component';
import { METRIC_FORMATS } from './dashboard-design.constants';
import { AdminStatsReport } from '../../../core/services/admin-api.service';

@Component({
  selector: 'app-storage-charts',
  standalone: true,
  imports: [CommonModule, ChartWrapperComponent],
  template: `
    <div class="storage-charts-container">
      <!-- Chart 1: Top 10 Storage Consumers -->
      <div class="chart-item chart-full-width">
        <app-chart-wrapper 
          title="💿 Top 10 Tenants - Consommation Stockage"
          [loading]="loading"
        >
          <div class="chart-placeholder chart-bar">
            <p class="chart-note">Bar chart: Top 10 tenants by storage used (GB)</p>
            <div class="storage-list">
              <div *ngFor="let tenant of topStorageConsumers; let i = index" class="storage-item">
                <div class="storage-rank">{{ i + 1 }}</div>
                <div class="storage-info">
                  <p class="storage-name">{{ tenant.tenantName }}</p>
                  <p class="storage-detail">{{ formatBytes(tenant.storageUsedBytes) }}</p>
                </div>
                <div class="storage-bar-container">
                  <div 
                    class="storage-bar"
                    [style.width.%]="getStoragePercentage(tenant.storageUsedBytes)"
                    [style.background]="getStorageGradient(i)"
                  ></div>
                </div>
                <span class="storage-value">{{ formatBytes(tenant.storageUsedBytes) }}</span>
              </div>
            </div>
          </div>
        </app-chart-wrapper>
      </div>

      <!-- Chart 2: Storage Growth Timeline -->
      <div class="chart-item chart-full-width">
        <app-chart-wrapper 
          title="📈 Croissance Stockage - Derniers 30 Jours"
          [loading]="loading"
        >
          <div class="chart-placeholder chart-area">
            <p class="chart-note">Area chart: Total storage growth trend over time</p>
            <div class="growth-stats">
              <div class="growth-stat">
                <span class="growth-label">Stockage Actuel</span>
                <span class="growth-value">{{ formatBytes(currentStorage) }}</span>
              </div>
              <div class="growth-stat">
                <span class="growth-label">Limite Totale</span>
                <span class="growth-value">{{ formatBytes(totalLimit) }}</span>
              </div>
              <div class="growth-stat">
                <span class="growth-label">Utilisation</span>
                <span class="growth-value" [style.color]="getUsageColor()">{{ usagePercent }}%</span>
              </div>
              <div class="growth-stat">
                <span class="growth-label">Disponible</span>
                <span class="growth-value">{{ formatBytes(availableStorage) }}</span>
              </div>
            </div>
            <div class="capacity-bar">
              <div class="capacity-fill" [style.width.%]="usagePercent"></div>
            </div>
          </div>
        </app-chart-wrapper>
      </div>
    </div>
  `,
  styles: [`
    .storage-charts-container {
      display: grid;
      grid-template-columns: 1fr;
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

    .storage-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;
    }

    .storage-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: white;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
    }

    .storage-rank {
      min-width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.875rem;
    }

    .storage-info {
      flex: 0 0 160px;
    }

    .storage-name {
      margin: 0;
      font-weight: 600;
      color: #111827;
      font-size: 0.875rem;
    }

    .storage-detail {
      margin: 4px 0 0 0;
      font-size: 0.75rem;
      color: #6b7280;
    }

    .storage-bar-container {
      flex: 1;
      height: 24px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
    }

    .storage-bar {
      height: 100%;
      transition: width 0.3s ease;
      min-width: 2px;
    }

    .storage-value {
      min-width: 80px;
      text-align: right;
      font-weight: 600;
      color: #111827;
      font-size: 0.875rem;
    }

    .growth-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 24px;
      width: 100%;
    }

    .growth-stat {
      background: white;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .growth-label {
      font-size: 0.75rem;
      color: #6b7280;
      text-align: center;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.5px;
    }

    .growth-value {
      font-size: 1.125rem;
      font-weight: 700;
      color: #111827;
    }

    .capacity-bar {
      width: 100%;
      height: 32px;
      background: #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
      border: 2px solid #d1d5db;
    }

    .capacity-fill {
      height: 100%;
      background: linear-gradient(90deg, #10b981 0%, #0ea5e9 50%, #f59e0b 100%);
      transition: width 0.5s ease;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 8px;
      color: white;
      font-weight: 600;
      font-size: 0.75rem;
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
      .growth-stats {
        grid-template-columns: repeat(2, 1fr);
      }

      .storage-value {
        min-width: 60px;
      }
    }
  `]
})
export class StorageChartsComponent {
  @Input() stats: AdminStatsReport | null = null;
  @Input() loading = false;

  get topStorageConsumers(): any[] {
    if (!this.stats?.storage.topStorageConsumers) return [];
    return this.stats.storage.topStorageConsumers.slice(0, 10);
  }

  get currentStorage(): number {
    return this.stats?.global.totalStorageUsed || 0;
  }

  get totalLimit(): number {
    return this.stats?.global.totalStorageLimit || 0;
  }

  get availableStorage(): number {
    return Math.max(0, this.totalLimit - this.currentStorage);
  }

  get usagePercent(): number {
    if (this.totalLimit === 0) return 0;
    return Math.min(100, Math.round((this.currentStorage / this.totalLimit) * 100));
  }

  get maxStorageUsed(): number {
    if (this.topStorageConsumers.length === 0) return 1;
    return Math.max(...this.topStorageConsumers.map(t => t.storageUsedBytes || 0));
  }

  getStoragePercentage(bytes: number): number {
    if (this.maxStorageUsed === 0) return 0;
    return (bytes / this.maxStorageUsed) * 100;
  }

  getStorageGradient(index: number): string {
    const gradients = [
      'linear-gradient(90deg, #2c7be5 0%, #4ea1f3 100%)',
      'linear-gradient(90deg, #4ea1f3 0%, #69d2bf 100%)',
      'linear-gradient(90deg, #69d2bf 0%, #23b26d 100%)',
      'linear-gradient(90deg, #23b26d 0%, #efb84f 100%)',
      'linear-gradient(90deg, #efb84f 0%, #f68d52 100%)',
      'linear-gradient(90deg, #f68d52 0%, #d66de2 100%)',
      'linear-gradient(90deg, #d66de2 0%, #7e89f7 100%)',
      'linear-gradient(90deg, #7e89f7 0%, #a78bfa 100%)',
      'linear-gradient(90deg, #a78bfa 0%, #f87171 100%)',
      'linear-gradient(90deg, #f87171 0%, #2c7be5 100%)',
    ];
    return gradients[index % gradients.length];
  }

  getUsageColor(): string {
    if (this.usagePercent >= 90) return '#dc2626';
    if (this.usagePercent >= 75) return '#f59e0b';
    if (this.usagePercent >= 50) return '#3b82f6';
    return '#10b981';
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}
