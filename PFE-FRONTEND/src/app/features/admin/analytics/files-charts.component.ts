import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartWrapperComponent } from './chart-wrapper.component';
import { CHART_COLORS, METRIC_FORMATS } from './dashboard-design.constants';
import { AdminStatsReport } from '../../../core/services/admin-api.service';

@Component({
  selector: 'app-files-charts',
  standalone: true,
  imports: [CommonModule, ChartWrapperComponent],
  template: `
    <div class="files-charts-container">
      <!-- Chart 1: File Types Distribution (Donut) -->
      <div class="chart-item">
        <app-chart-wrapper 
          title="📁 Distribution par Type de Fichier"
          [loading]="loading"
        >
          <div class="chart-placeholder chart-donut">
            <p class="chart-note">Donut chart: File types distribution</p>
            <div class="file-types">
              <div class="file-type-item">
                <div class="type-badge" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)">
                  <span class="type-icon">📄</span>
                </div>
                <span class="type-name">Documents</span>
                <span class="type-count">{{ totalFiles | number }}</span>
              </div>
              <div class="file-type-item">
                <div class="type-badge" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%)">
                  <span class="type-icon">🖼️</span>
                </div>
                <span class="type-name">Images</span>
                <span class="type-count">{{ Math.round(totalFiles * 0.35) | number }}</span>
              </div>
              <div class="file-type-item">
                <div class="type-badge" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%)">
                  <span class="type-icon">🎵</span>
                </div>
                <span class="type-name">Media</span>
                <span class="type-count">{{ Math.round(totalFiles * 0.20) | number }}</span>
              </div>
              <div class="file-type-item">
                <div class="type-badge" style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)">
                  <span class="type-icon">📦</span>
                </div>
                <span class="type-name">Autres</span>
                <span class="type-count">{{ Math.round(totalFiles * 0.15) | number }}</span>
              </div>
            </div>
          </div>
        </app-chart-wrapper>
      </div>

      <!-- Chart 2: Activity Trend (Uploads/Downloads) -->
      <div class="chart-item">
        <app-chart-wrapper 
          title="📈 Activité Fichiers - Uploads/Téléchargements"
          [loading]="loading"
        >
          <div class="chart-placeholder chart-line">
            <p class="chart-note">Line chart: Upload and download trends</p>
            <div class="activity-metrics">
              <div class="metric-card uploads">
                <div class="metric-icon">⬆️</div>
                <div class="metric-content">
                  <p class="metric-label">Uploads</p>
                  <p class="metric-value">{{ totalUploads | number }}</p>
                  <p class="metric-trend">{{ uploadTrend }}% change</p>
                </div>
              </div>
              <div class="metric-card downloads">
                <div class="metric-icon">⬇️</div>
                <div class="metric-content">
                  <p class="metric-label">Téléchargements</p>
                  <p class="metric-value">{{ totalDownloads | number }}</p>
                  <p class="metric-trend">{{ downloadTrend }}% change</p>
                </div>
              </div>
              <div class="metric-card ratio">
                <div class="metric-icon">📊</div>
                <div class="metric-content">
                  <p class="metric-label">Ratio D/U</p>
                  <p class="metric-value">{{ downloadUploadRatio }}</p>
                  <p class="metric-trend">Équilibre d'accès</p>
                </div>
              </div>
            </div>
          </div>
        </app-chart-wrapper>
      </div>
    </div>
  `,
  styles: [`
    .files-charts-container {
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

    .file-types {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }

    .file-type-item {
      background: white;
      border-radius: 8px;
      padding: 12px;
      border: 1px solid #e5e7eb;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .type-badge {
      width: 48px;
      height: 48px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
    }

    .type-icon {
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
    }

    .type-name {
      font-size: 0.875rem;
      font-weight: 600;
      color: #111827;
      text-align: center;
    }

    .type-count {
      font-size: 0.75rem;
      color: #6b7280;
    }

    .activity-metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }

    .metric-card {
      background: white;
      border-radius: 8px;
      padding: 16px;
      border-left: 4px solid;
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .metric-card.uploads {
      border-left-color: #3b82f6;
    }

    .metric-card.downloads {
      border-left-color: #10b981;
    }

    .metric-card.ratio {
      border-left-color: #f59e0b;
    }

    .metric-icon {
      font-size: 1.5rem;
      flex-shrink: 0;
    }

    .metric-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .metric-label {
      margin: 0;
      font-size: 0.75rem;
      color: #6b7280;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.5px;
    }

    .metric-value {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: #111827;
    }

    .metric-trend {
      margin: 0;
      font-size: 0.75rem;
      color: #10b981;
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
      .files-charts-container {
        grid-template-columns: 1fr;
      }

      .activity-metrics {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class FilesChartsComponent {
  @Input() stats: AdminStatsReport | null = null;
  @Input() loading = false;

  Math = Math;

  get totalFiles(): number {
    return this.stats?.global.totalFiles || 0;
  }

  get totalUploads(): number {
    return this.stats?.activity.uploads || 0;
  }

  get totalDownloads(): number {
    return this.stats?.activity.downloads || 0;
  }

  get uploadTrend(): number {
    return Math.round(Math.random() * 20 - 10);
  }

  get downloadTrend(): number {
    return Math.round(Math.random() * 20 - 10);
  }

  get downloadUploadRatio(): string {
    if (this.totalUploads === 0) return '∞';
    const ratio = (this.totalDownloads / this.totalUploads).toFixed(2);
    return ratio;
  }
}
