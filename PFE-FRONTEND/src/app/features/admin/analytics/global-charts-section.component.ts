import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardSectionComponent } from './dashboard-section.component';
import { SecurityChartsComponent } from './security-charts.component';
import { StorageChartsComponent } from './storage-charts.component';
import { UsersChartsComponent } from './users-charts.component';
import { FilesChartsComponent } from './files-charts.component';
import { TrendsChartsComponent } from './trends-charts.component';
import { AdminStatsReport } from '../../../core/services/admin-api.service';

@Component({
  selector: 'app-global-charts-section',
  standalone: true,
  imports: [
    CommonModule,
    DashboardSectionComponent,
    SecurityChartsComponent,
    StorageChartsComponent,
    UsersChartsComponent,
    FilesChartsComponent,
    TrendsChartsComponent
  ],
  template: `
    <div class="global-charts-container">
      <!-- Section 1: Security Charts -->
      <app-dashboard-section 
        title="🔒 Sécurité" 
        description="Alertes, incidents et risques détectés"
        [isOpen]="true"
      >
        <app-security-charts 
          [stats]="stats"
          [loading]="loading"
        ></app-security-charts>
      </app-dashboard-section>

      <!-- Section 2: Storage Charts -->
      <app-dashboard-section 
        title="💾 Stockage" 
        description="Utilisation et croissance du stockage"
        [isOpen]="true"
      >
        <app-storage-charts 
          [stats]="stats"
          [loading]="loading"
        ></app-storage-charts>
      </app-dashboard-section>

      <!-- Section 3: Users Charts -->
      <app-dashboard-section 
        title="👥 Utilisateurs" 
        description="Activité et distribution des utilisateurs"
        [isOpen]="true"
      >
        <app-users-charts 
          [stats]="stats"
          [loading]="loading"
        ></app-users-charts>
      </app-dashboard-section>

      <!-- Section 4: Files Charts -->
      <app-dashboard-section 
        title="📁 Fichiers" 
        description="Distribution et activité des fichiers"
        [isOpen]="true"
      >
        <app-files-charts 
          [stats]="stats"
          [loading]="loading"
        ></app-files-charts>
      </app-dashboard-section>

      <!-- Section 5: Trends Charts & Table -->
      <app-dashboard-section 
        title="📈 Tendances & Insights" 
        description="Croissance, scores et résumé global"
        [isOpen]="true"
      >
        <app-trends-charts 
          [stats]="stats"
          [loading]="loading"
        ></app-trends-charts>
      </app-dashboard-section>
    </div>
  `,
  styles: [`
    .global-charts-container {
      display: flex;
      flex-direction: column;
      gap: 24px;
      animation: fadeIn 0.3s ease-in;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
  `]
})
export class GlobalChartsSectionComponent {
  @Input() stats: AdminStatsReport | null = null;
  @Input() loading = false;
}
