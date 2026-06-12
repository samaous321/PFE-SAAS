import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardSectionComponent } from './dashboard-section.component';
import { KPICardComponent } from './kpi-card.component';
import { StatCardComponent } from './stat-card.component';
import { AdminStatsReport } from '../../../core/services/admin-api.service';
import { METRIC_FORMATS } from './dashboard-design.constants';

@Component({
  selector: 'app-tenant-stats-section',
  standalone: true,
  imports: [CommonModule, DashboardSectionComponent, KPICardComponent, StatCardComponent],
  template: `
    <div class="tenant-stats-container" *ngIf="tenantData">
      <!-- Tenant Overview KPIs -->
      <app-dashboard-section title="📊 Vue d'ensemble du Tenant" [isOpen]="true">
        <div class="kpi-grid">
          <app-kpi-card
            label="Utilisateurs"
            [value]="tenantData?.usersCount || 0"
            status="success"
            [trend]="{ direction: 'up', percent: 5 }"
          ></app-kpi-card>
          <app-kpi-card
            label="Fichiers"
            [value]="METRIC_FORMATS.compact(tenantData?.filesCount || 0)"
            status="info"
            [trend]="{ direction: 'up', percent: 12 }"
          ></app-kpi-card>
          <app-kpi-card
            label="Stockage"
            [value]="formatBytes(tenantData?.storageUsedBytes || 0)"
            status="warning"
          ></app-kpi-card>
          <app-kpi-card
            label="Menaces"
            [value]="tenantData?.malwareCount || 0"
            status="danger"
            [trend]="{ direction: 'down', percent: 2 }"
          ></app-kpi-card>
        </div>
      </app-dashboard-section>

      <!-- Tenant Security -->
      <app-dashboard-section title="🔒 Sécurité du Tenant" description="Incidents et alertes spécifiques">
        <div class="stats-grid">
          <app-stat-card
            icon="⚠️"
            label="Suspects"
            [value]="suspiciousCount"
            sublabel="Fichiers suspects"
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
            label="Score"
            [value]="tenantSecurityScore + '%'"
            sublabel="Santé de sécurité"
            variant="success"
          ></app-stat-card>
        </div>
      </app-dashboard-section>

      <!-- Tenant Storage Details -->
      <app-dashboard-section title="💾 Stockage du Tenant" description="Détails et limite de capacité">
        <div class="stats-grid">
          <app-stat-card
            icon="💿"
            label="Utilisé"
            [value]="formatBytes(tenantData?.storageUsedBytes || 0)"
            [sublabel]="storagePercentage + '% utilisé'"
            variant="primary"
          ></app-stat-card>
          <app-stat-card
            icon="📦"
            label="Disponible"
            [value]="formatBytes(remainingStorage)"
            sublabel="Espace restant"
            variant="success"
          ></app-stat-card>
          <app-stat-card
            icon="📊"
            label="Nombre de Fichiers"
            [value]="METRIC_FORMATS.compact(tenantData?.filesCount || 0)"
            sublabel="Au total"
            variant="info"
          ></app-stat-card>
          <app-stat-card
            icon="⏱️"
            label="Dernière Activité"
            [value]="formatLastActivity(tenantData?.lastActivity)"
            sublabel="Activité récente"
            variant="warning"
          ></app-stat-card>
        </div>
      </app-dashboard-section>
    </div>
  `,
  styles: [`
    .tenant-stats-container {
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
export class TenantStatsSectionComponent {
  @Input() tenantData: any = null;
  @Input() tenantInfo: any = null;
  @Input() stats: AdminStatsReport | null = null;

  METRIC_FORMATS = METRIC_FORMATS;

  get suspiciousCount(): number {
    return this.tenantData?.suspicious || 0;
  }

  get blockedCount(): number {
    return this.tenantData?.blocked || 0;
  }

  get quarantinedCount(): number {
    return this.tenantData?.quarantined || 0;
  }

  get tenantSecurityScore(): number {
    const totalIncidents = this.suspiciousCount + this.blockedCount + this.quarantinedCount;
    const score = Math.max(0, 100 - (totalIncidents * 2));
    return Math.round(score);
  }

  get storagePercentage(): number {
    if (!this.tenantInfo?.storageQuotaBytes) return 0;
    const used = this.tenantData?.storageUsedBytes || 0;
    const quota = this.tenantInfo.storageQuotaBytes;
    return quota > 0 ? Math.round((used / quota) * 100) : 0;
  }

  get remainingStorage(): number {
    const used = this.tenantData?.storageUsedBytes || 0;
    const quota = this.tenantInfo?.storageQuotaBytes || 0;
    return Math.max(0, quota - used);
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  formatLastActivity(dateStr: string): string {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'À l\'instant';
    if (minutes < 60) return `Il y a ${minutes}m`;
    if (hours < 24) return `Il y a ${hours}h`;
    if (days < 7) return `Il y a ${days}j`;
    return date.toLocaleDateString('fr-FR');
  }
}
