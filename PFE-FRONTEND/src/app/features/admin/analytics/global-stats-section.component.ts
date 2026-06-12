import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardSectionComponent } from './dashboard-section.component';
import { KPICardComponent } from './kpi-card.component';
import { StatCardComponent } from './stat-card.component';
import { AdminStatsReport } from '../../../core/services/admin-api.service';
import { METRIC_FORMATS } from './dashboard-design.constants';

@Component({
  selector: 'app-global-stats-section',
  standalone: true,
  imports: [CommonModule, DashboardSectionComponent, KPICardComponent, StatCardComponent],
  template: `
    <div class="global-stats-container">
      <!-- Overview KPIs -->
      <app-dashboard-section title="📊 Vue d'ensemble" [isOpen]="true">
        <div class="kpi-grid">
          <app-kpi-card
            label="Tenants Actifs"
            [value]="summary?.totalTenants || 0"
            status="info"
            [trend]="{ direction: 'up', percent: 12 }"
          ></app-kpi-card>
          <app-kpi-card
            label="Utilisateurs Totaux"
            [value]="summary?.totalUsers || 0"
            status="success"
            [trend]="{ direction: 'up', percent: 8 }"
          ></app-kpi-card>
          <app-kpi-card
            label="Stockage Utilisé"
            [value]="formatBytes(summary?.totalStorage || 0)"
            status="warning"
            [trend]="{ direction: 'up', percent: 5 }"
          ></app-kpi-card>
          <app-kpi-card
            label="Score Sécurité"
            [value]="securityScore"
            unit="/100"
            status="danger"
            [trend]="{ direction: 'down', percent: 3 }"
          ></app-kpi-card>
        </div>
      </app-dashboard-section>

      <!-- Security Section -->
      <app-dashboard-section title="🔒 Sécurité" description="Alertes et incidents de sécurité">
        <div class="stats-grid">
          <app-stat-card
            icon="⚠️"
            label="Suspects"
            [value]="summary?.malwareDetected || 0"
            sublabel="Fichiers détectés"
            variant="warning"
          ></app-stat-card>
          <app-stat-card
            icon="🚫"
            label="Bloqués"
            [value]="blockedCount"
            sublabel="Fichiers bloqués"
            variant="danger"
          ></app-stat-card>
          <app-stat-card
            icon="🔐"
            label="Quarantinés"
            [value]="quarantinedCount"
            sublabel="En isolement"
            variant="info"
          ></app-stat-card>
          <app-stat-card
            icon="✓"
            label="Score Global"
            [value]="securityScore + '%'"
            sublabel="Système sécurisé"
            variant="success"
          ></app-stat-card>
        </div>
      </app-dashboard-section>

      <!-- Storage Section -->
      <app-dashboard-section title="💾 Stockage" description="Utilisation et capacité">
        <div class="stats-grid">
          <app-stat-card
            icon="💿"
            label="Utilisé"
            [value]="formatBytes(summary?.totalStorage || 0)"
            [sublabel]="storagePercentage + '% de ' + formatBytes(summary?.totalStorageLimit || 0)"
            variant="primary"
          ></app-stat-card>
          <app-stat-card
            icon="📦"
            label="Disponible"
            [value]="formatBytes((summary?.totalStorageLimit || 0) - (summary?.totalStorage || 0))"
            sublabel="Espace libre"
            variant="success"
          ></app-stat-card>
          <app-stat-card
            icon="📊"
            label="Nombre de Fichiers"
            [value]="METRIC_FORMATS.compact(summary?.totalFiles || 0)"
            sublabel="Tous les tenants"
            variant="info"
          ></app-stat-card>
          <app-stat-card
            icon="📈"
            label="Moyenne par Tenant"
            [value]="METRIC_FORMATS.compact(summary?.avgFilesPerTenant || 0)"
            sublabel="Fichiers"
            variant="warning"
          ></app-stat-card>
        </div>
      </app-dashboard-section>

      <!-- Activity Section -->
      <app-dashboard-section title="📁 Activité" description="Uploads, téléchargements et partages">
        <div class="stats-grid">
          <app-stat-card
            icon="⬆️"
            label="Uploads"
            [value]="METRIC_FORMATS.compact(summary?.totalUploads || 0)"
            sublabel="Fichiers transférés"
            variant="info"
          ></app-stat-card>
          <app-stat-card
            icon="⬇️"
            label="Téléchargements"
            [value]="METRIC_FORMATS.compact(summary?.totalDownloads || 0)"
            sublabel="Fichiers récupérés"
            variant="primary"
          ></app-stat-card>
          <app-stat-card
            icon="🔗"
            label="Partages"
            [value]="METRIC_FORMATS.compact(summary?.totalShares || 0)"
            sublabel="Éléments partagés"
            variant="success"
          ></app-stat-card>
          <app-stat-card
            icon="👥"
            label="Tenants Actifs"
            [value]="summary?.activeTenants || 0"
            sublabel="Ayant de l'activité"
            variant="warning"
          ></app-stat-card>
        </div>
      </app-dashboard-section>
    </div>
  `,
  styles: [`
    .global-stats-container {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }

    @media (max-width: 768px) {
      .kpi-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .stats-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 640px) {
      .kpi-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class GlobalStatsSectionComponent {
  @Input() summary: any = null;
  @Input() stats: AdminStatsReport | null = null;

  METRIC_FORMATS = METRIC_FORMATS;

  get securityScore(): number {
    if (!this.stats) return 100;
    const suspiciousCount = this.stats.security.totals.suspicious || 0;
    const blockedCount = this.stats.security.totals.blocked || 0;
    const quarantinedCount = this.stats.security.totals.quarantined || 0;
    const totalIncidents = suspiciousCount + blockedCount + quarantinedCount;
    
    const score = Math.max(0, 100 - (totalIncidents * 2));
    return Math.round(score);
  }

  get blockedCount(): number {
    return this.stats?.security.totals.blocked || 0;
  }

  get quarantinedCount(): number {
    return this.stats?.security.totals.quarantined || 0;
  }

  get storagePercentage(): number {
    if (!this.summary) return 0;
    const totalLimit = this.summary.totalStorageLimit || 0;
    return totalLimit > 0 ? Math.round((this.summary.totalStorage / totalLimit) * 100) : 0;
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}
