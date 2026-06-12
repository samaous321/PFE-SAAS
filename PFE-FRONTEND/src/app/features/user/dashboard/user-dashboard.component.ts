import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FileApiService } from '../../../core/services/file-api.service';
import { AuthStorageService } from '../../../core/services/auth-storage.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { ComprehensiveUserStats, UserApiService, UserQuotaSummary, UserStats } from '../../../core/services/user-api.service';
import { FileAnalyticsResponse } from '../../../core/models/file.model';
import { NgChartsModule } from 'ng2-charts';
import { Chart, ChartConfiguration, ChartOptions, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  standalone: true,
  selector: 'app-user-dashboard',
  imports: [CommonModule, RouterLink, NgChartsModule],
  template: `
    <div class="user-dashboard">
      <!-- Welcome Header -->
      <div class="dashboard-header">
        <div class="welcome-section">
          <div class="welcome-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <div class="welcome-content">
            <h1>Bonjour, {{ userName }} !</h1>
            <p>Bienvenue dans votre espace de stockage sécurisé</p>
            <div class="last-activity" *ngIf="stats.lastActivity">
              Dernière activité: {{ stats.lastActivity }}
            </div>
          </div>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="stats-grid" *ngIf="!loading">
        <div class="stat-card primary">
          <div class="stat-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
              <polyline points="14,2 14,8 20,8"></polyline>
            </svg>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.totalFiles }}</div>
            <div class="stat-label">Fichiers stockés</div>
            <div class="stat-trend" *ngIf="stats.recentUploads > 0">
              +{{ stats.recentUploads }} cette semaine
            </div>
          </div>
        </div>

        <div class="stat-card secondary">
          <div class="stat-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7,10 12,15 17,10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ formatBytes(stats.totalSize) }}</div>
            <div class="stat-label">Espace utilisé</div>
            <div class="stat-progress">
              <div class="progress-bar" [style.width.%]="stats.storageUsedPercent"></div>
            </div>
          </div>
        </div>

        <div class="stat-card success">
          <div class="stat-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.sharedFiles }}</div>
            <div class="stat-label">Fichiers partagés</div>
            <div class="stat-trend" *ngIf="stats.sharedFiles > 0">
              Partagés avec d'autres utilisateurs
            </div>
          </div>
        </div>

        <div class="stat-card info">
          <div class="stat-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 15v4c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-4"></path>
              <polyline points="17,8 12,3 7,8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.receivedFiles }}</div>
            <div class="stat-label">Fichiers reçus</div>
            <div class="stat-trend" *ngIf="stats.receivedFiles > 0">
              Partagés avec vous
            </div>
          </div>
        </div>

        <div class="stat-card quota-card">
          <div class="stat-icon quota-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v20"></path>
              <path d="M4 6h16"></path>
              <path d="M4 18h16"></path>
            </svg>
          </div>
          <div class="stat-content">
            <div class="quota-topline">
              <div class="stat-label">Quota {{ quota?.plan || stats.quotaPlan || 'free' }}</div>
              <div class="quota-pill">{{ quota?.scope || stats.quotaScope || 'tenant' }}</div>
            </div>
            <div class="stat-value">{{ formatBytes(quota?.user?.storageUsedBytes ?? stats.totalSize) }}</div>
            <div class="quota-caption">/ {{ formatBytes(quota?.user?.storageLimitBytes ?? stats.storageLimit ?? 0) }}</div>
            <div class="stat-progress">
              <div class="progress-bar quota-bar" [style.width.%]="quotaPercent"></div>
            </div>
            <div class="quota-status" [ngClass]="'quota-status-' + quotaStatusTone">{{ quotaStatusMessage }}</div>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div class="loading-state" *ngIf="loading">
        <div class="spinner"></div>
        <p>Chargement de vos statistiques...</p>
      </div>

      <!-- Quick Actions -->
      <div class="actions-section">
        <h2>Actions rapides</h2>
        <div class="actions-grid">
          <a routerLink="/user/files" class="action-card primary">
            <div class="action-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </div>
            <div class="action-content">
              <h3>Uploader un fichier</h3>
              <p>Ajoutez de nouveaux fichiers sécurisés</p>
            </div>
            <div class="action-arrow">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14"></path>
                <path d="M12 5l7 7-7 7"></path>
              </svg>
            </div>
          </a>

          <a routerLink="/user/files" class="action-card secondary">
            <div class="action-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                <polyline points="14,2 14,8 20,8"></polyline>
              </svg>
            </div>
            <div class="action-content">
              <h3>Gérer mes fichiers</h3>
              <p>Consultez et organisez vos fichiers</p>
            </div>
            <div class="action-arrow">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14"></path>
                <path d="M12 5l7 7-7 7"></path>
              </svg>
            </div>
          </a>

          <a routerLink="/user/files" class="action-card success">
            <div class="action-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>
            <div class="action-content">
              <h3>Partage de fichiers</h3>
              <p>Partagez vos fichiers en toute sécurité</p>
            </div>
            <div class="action-arrow">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14"></path>
                <path d="M12 5l7 7-7 7"></path>
              </svg>
            </div>
          </a>

          <a routerLink="/user/share-history" class="action-card info">
            <div class="action-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 3v18h18"></path>
                <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"></path>
              </svg>
            </div>
            <div class="action-content">
              <h3>Historique & Analyses</h3>
              <p>Suivez vos partages et analyses</p>
            </div>
            <div class="action-arrow">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14"></path>
                <path d="M12 5l7 7-7 7"></path>
              </svg>
            </div>
          </a>

          <a routerLink="/user/stats" class="action-card warning">
            <div class="action-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
              </svg>
            </div>
            <div class="action-content">
              <h3>Statistiques</h3>
              <p>Consultez vos statistiques détaillées</p>
            </div>
            <div class="action-arrow">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14"></path>
                <path d="M12 5l7 7-7 7"></path>
              </svg>
            </div>
          </a>

          <a routerLink="/user/complaints" class="action-card danger">
            <div class="action-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
            <div class="action-content">
              <h3>Réclamations</h3>
              <p>Gérez vos réclamations et support</p>
            </div>
            <div class="action-arrow">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14"></path>
                <path d="M12 5l7 7-7 7"></path>
              </svg>
            </div>
          </a>
        </div>
      </div>

      <!-- Analytics Section -->
      <div class="analytics-section" *ngIf="!analyticsLoading">
        <div class="analytics-header">
          <div>
            <h3>Tableau d'analyse</h3>
            <p>Analyse mensuelle et annuelle de votre activité</p>
          </div>

          <div class="analytics-controls">
            <label>
              Année
              <select [value]="selectedAnalyticsYear" (change)="onAnalyticsYearChange($event)">
                <option *ngFor="let year of analyticsYears" [value]="year">{{ year }}</option>
              </select>
            </label>

            <label>
              Mois
              <select [value]="selectedAnalyticsMonth" (change)="onAnalyticsMonthChange($event)">
                <option *ngFor="let month of analyticsMonthOptions" [value]="month.value">{{ month.label }}</option>
              </select>
            </label>
          </div>
        </div>

        <div class="analytics-summary" *ngIf="analyticsData">
          <div class="summary-card emphasis">
            <span>Fichiers</span>
            <strong>{{ analyticsData.summary.totalFiles }}</strong>
          </div>
          <div class="summary-card">
            <span>Partages actifs</span>
            <strong>{{ analyticsData.summary.activeShares }}</strong>
          </div>
          <div class="summary-card">
            <span>Téléchargements</span>
            <strong>{{ analyticsData.summary.totalDownloads }}</strong>
          </div>
          <div class="summary-card">
            <span>Partages totaux</span>
            <strong>{{ analyticsData.summary.totalShares }}</strong>
          </div>
        </div>

        <div class="analytics-snapshot" *ngIf="analyticsData && !analyticsLoading">
          <div class="snapshot-item">
            <span>Uploads ce mois</span>
            <strong>{{ analyticsData.monthSnapshot.uploads }}</strong>
          </div>
          <div class="snapshot-item">
            <span>Partages ce mois</span>
            <strong>{{ analyticsData.monthSnapshot.shares }}</strong>
          </div>
          <div class="snapshot-item">
            <span>Downloads via lien</span>
            <strong>{{ analyticsData.monthSnapshot.sharedDownloads }}</strong>
          </div>
          <div class="snapshot-item">
            <span>Stockage total</span>
            <strong>{{ formatBytes(analyticsData.summary.totalStorage) }}</strong>
          </div>
        </div>

        <div class="analytics-loading" *ngIf="analyticsLoading">Chargement des analyses...</div>
        <div class="analytics-error" *ngIf="analyticsError">{{ analyticsError }}</div>

        <div class="charts-grid" *ngIf="analyticsData && !analyticsLoading">
          <div class="chart-card chart-wide chart-hero">
            <div class="chart-title-row">
              <div>
                <div class="chart-title">Tendance mensuelle ({{ selectedAnalyticsYear }})</div>
                <div class="chart-subtitle">Vue consolidée des uploads, partages et téléchargements</div>
              </div>
              <div class="chart-tag">Usage personnel</div>
            </div>
            <div class="chart-frame chart-frame-wide">
              <canvas
                baseChart
                [type]="'line'"
                [data]="monthlyChartData"
                [options]="lineChartOptions"
              ></canvas>
            </div>
          </div>

          <div class="chart-card">
            <div class="chart-title-row">
              <div>
                <div class="chart-title">Vue annuelle</div>
                <div class="chart-subtitle">Comparaison par exercice</div>
              </div>
            </div>
            <div class="chart-frame">
              <canvas
                baseChart
                [type]="'bar'"
                [data]="yearlyChartData"
                [options]="barChartOptions"
              ></canvas>
            </div>
          </div>

          <div class="chart-card">
            <div class="chart-title-row">
              <div>
                <div class="chart-title">État des fichiers</div>
                <div class="chart-subtitle">Répartition des statuts de sécurité</div>
              </div>
            </div>
            <div class="chart-frame">
              <canvas
                baseChart
                [type]="'doughnut'"
                [data]="statusChartData"
                [options]="doughnutChartOptions"
              ></canvas>
            </div>
          </div>

          <div class="chart-card">
            <div class="chart-title-row">
              <div>
                <div class="chart-title">Types de fichiers</div>
                <div class="chart-subtitle">Répartition par format MIME</div>
              </div>
            </div>
            <div class="chart-frame">
              <canvas
                baseChart
                [type]="'doughnut'"
                [data]="mimeChartData"
                [options]="doughnutChartOptions"
              ></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- Security Notice -->
      <div class="security-notice">
        <div class="notice-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
        </div>
        <div class="notice-content">
          <h3>Sécurité garantie</h3>
          <p>Tous vos fichiers sont chiffrés de bout en bout avec AES-256. Seules les personnes autorisées peuvent y accéder.</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .user-dashboard {
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }

    .dashboard-header {
      margin-bottom: 2rem;
    }

    .welcome-section {
      display: flex;
      align-items: center;
      gap: 1.5rem;
      padding: 2rem;
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border-radius: 1rem;
      border: 1px solid #e2e8f0;
    }

    .welcome-icon {
      width: 4rem;
      height: 4rem;
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
      border-radius: 50%;
      display: grid;
      place-items: center;
      color: white;
      flex-shrink: 0;

      svg {
        width: 2rem;
        height: 2rem;
      }
    }

    .welcome-content h1 {
      color: #1e293b;
      font-size: 2rem;
      font-weight: 700;
      margin: 0 0 0.5rem;
    }

    .welcome-content p {
      color: #64748b;
      font-size: 1.1rem;
      margin: 0 0 0.5rem;
    }

    .last-activity {
      color: #059669;
      font-size: 0.875rem;
      font-weight: 500;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: #ffffff;
      border-radius: 0.75rem;
      padding: 1rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      border: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      transition: all 0.2s ease;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
      }
    }

    .stat-card.primary {
      background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
      border-color: #3b82f6;
    }

    .stat-card.secondary {
      background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
      border-color: #10b981;
    }

    .stat-card.success {
      background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
      border-color: #f59e0b;
    }

    .stat-card.info {
      background: linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%);
      border-color: #8b5cf6;
    }

    .stat-icon {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 50%;
      display: grid;
      place-items: center;
      flex-shrink: 0;

      svg {
        width: 1.25rem;
        height: 1.25rem;
      }
    }

    .stat-card.primary .stat-icon {
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
      color: white;
    }

    .stat-card.secondary .stat-icon {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
    }

    .stat-card.success .stat-icon {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: white;
    }

    .stat-card.info .stat-icon {
      background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
      color: white;
    }

    .quota-card {
      border-color: #0f172a;
      background: linear-gradient(135deg, #0f172a 0%, #111827 100%);
      color: #e5e7eb;
    }

    .quota-card .stat-value,
    .quota-card .stat-label,
    .quota-card .quota-caption {
      color: #f8fafc;
    }

    .quota-card .stat-trend {
      color: #86efac;
    }

    .quota-icon {
      background: linear-gradient(135deg, #14b8a6 0%, #0f766e 100%);
      color: white;
    }

    .quota-topline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.35rem;
    }

    .quota-pill {
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.12);
      color: #cbd5e1;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .quota-caption {
      font-size: 0.75rem;
      margin-top: 0.1rem;
      opacity: 0.9;
    }

    .quota-bar {
      background: linear-gradient(135deg, #22c55e 0%, #14b8a6 100%);
    }

    .stat-content {
      flex: 1;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 0.25rem;
    }

    .stat-label {
      color: #64748b;
      font-size: 0.8rem;
      font-weight: 500;
      margin-bottom: 0.25rem;
    }

    .stat-trend {
      color: #059669;
      font-size: 0.7rem;
      font-weight: 500;
    }

    .stat-progress {
      width: 100%;
      height: 4px;
      background: rgba(0, 0, 0, 0.1);
      border-radius: 2px;
      margin-top: 0.5rem;
      overflow: hidden;
    }

    .progress-bar {
      height: 100%;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      border-radius: 2px;
      transition: width 0.3s ease;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 3rem;
      color: #64748b;
    }

    .spinner {
      width: 2rem;
      height: 2rem;
      border: 3px solid #e5e7eb;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .actions-section {
      margin-bottom: 2rem;
    }

    .actions-section h2 {
      color: #1e293b;
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0 0 1rem;
    }

    .actions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.75rem;
    }

    .action-card {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem;
      background: #ffffff;
      border-radius: 0.75rem;
      border: 1px solid #e5e7eb;
      text-decoration: none;
      color: inherit;
      transition: all 0.2s ease;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
        border-color: #3b82f6;
      }
    }

    .action-card.primary {
      background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
      border-color: #3b82f6;
    }

    .action-card.secondary {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border-color: #cbd5e1;
    }

    .action-card.success {
      background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
      border-color: #f59e0b;
    }

    .action-card.info {
      background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
      border-color: #3b82f6;
    }

    .action-card.warning {
      background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
      border-color: #f59e0b;
    }

    .action-card.danger {
      background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
      border-color: #ef4444;
    }

    .action-card.info {
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border-color: #0ea5e9;
    }

    .action-card.warning {
      background: linear-gradient(135deg, #fefce8 0%, #fef3c7 100%);
      border-color: #eab308;
    }

    .action-card.danger {
      background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
      border-color: #ef4444;
    }

    .action-icon {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 50%;
      display: grid;
      place-items: center;
      flex-shrink: 0;

      svg {
        width: 1.25rem;
        height: 1.25rem;
      }
    }

    .action-card.primary .action-icon {
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
      color: white;
    }

    .action-card.secondary .action-icon {
      background: linear-gradient(135deg, #6b7280 0%, #475569 100%);
      color: white;
    }

    .action-card.success .action-icon {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: white;
    }

    .action-card.info .action-icon {
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
      color: white;
    }

    .action-card.warning .action-icon {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: white;
    }

    .action-card.danger .action-icon {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
    }

    .action-card.info .action-icon {
      background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
      color: white;
    }

    .action-card.warning .action-icon {
      background: linear-gradient(135deg, #eab308 0%, #ca8a04 100%);
      color: white;
    }

    .action-card.danger .action-icon {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
    }

    .action-content h3 {
      color: #1e293b;
      font-size: 1rem;
      font-weight: 600;
      margin: 0 0 0.25rem;
    }

    .action-content p {
      color: #64748b;
      font-size: 0.8rem;
      margin: 0;
    }

    .action-arrow {
      margin-left: auto;
      color: #9ca3af;

      svg {
        width: 1rem;
        height: 1rem;
      }
    }

    .analytics-section {
      margin-bottom: 2rem;
      background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
      border: 1px solid #e2e8f0;
      border-radius: 1.25rem;
      padding: 1.25rem;
      box-shadow: 0 14px 34px -24px rgba(15, 23, 42, 0.35);
    }

    .analytics-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }

    .analytics-header h3 {
      margin: 0 0 0.2rem;
      color: #0f172a;
      font-size: 1.15rem;
      font-weight: 800;
    }

    .analytics-header p {
      margin: 0;
      color: #64748b;
      font-size: 0.85rem;
    }

    .analytics-controls {
      display: flex;
      gap: 0.6rem;
      flex-wrap: wrap;
    }

    .analytics-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 0.65rem;
      margin-bottom: 0.85rem;
    }

    .summary-card {
      border: 1px solid #dbe3ee;
      border-radius: 0.9rem;
      padding: 0.85rem 0.95rem;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      box-shadow: 0 8px 20px -18px rgba(15, 23, 42, 0.3);
    }

    .summary-card.emphasis {
      background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
      border-color: #93c5fd;
    }

    .summary-card span {
      color: #64748b;
      font-size: 0.72rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .summary-card strong {
      color: #0f172a;
      font-size: 1.15rem;
      font-weight: 800;
      line-height: 1.1;
    }

    .analytics-controls label {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: #475569;
    }

    .analytics-controls select {
      min-width: 120px;
      padding: 0.45rem 0.6rem;
      border-radius: 0.6rem;
      border: 1px solid #dbe3ee;
      background: #ffffff;
      font-size: 0.82rem;
      color: #1e293b;
      font-weight: 600;
    }

    .analytics-snapshot {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.65rem;
      margin-bottom: 0.9rem;
    }

    .snapshot-item {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 0.75rem;
      padding: 0.7rem 0.8rem;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .snapshot-item span {
      color: #64748b;
      font-size: 0.73rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .snapshot-item strong {
      color: #0f172a;
      font-size: 1.05rem;
      font-weight: 700;
    }

    .analytics-loading,
    .analytics-error {
      padding: 0.6rem 0.75rem;
      border-radius: 0.6rem;
      font-size: 0.82rem;
      margin-bottom: 0.75rem;
    }

    .analytics-loading {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
    }

    .analytics-error {
      background: #fee2e2;
      color: #b91c1c;
      border: 1px solid #fecaca;
    }

    .charts-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
    }

    .chart-card {
      background: #ffffff !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 0.75rem !important;
      padding: 0.75rem !important;
      min-height: 160px !important;
      max-height: 240px !important;
      display: flex !important;
      flex-direction: column !important;
      box-shadow: 0 10px 28px -22px rgba(15, 23, 42, 0.35) !important;
    }

    .chart-hero {
      background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
      border-color: #dbe3ee;
    }

    .chart-wide {
      grid-column: 1 / -1 !important;
      min-height: 200px !important;
      max-height: 280px !important;
    }

    .chart-title-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.7rem;
      flex-wrap: wrap;
    }

    .chart-title {
      color: #0f172a;
      font-size: 0.9rem;
      font-weight: 800;
      letter-spacing: 0.01em;
      margin-bottom: 0.1rem;
    }

    .chart-subtitle {
      color: #64748b;
      font-size: 0.74rem;
      line-height: 1.35;
    }

    .chart-tag {
      padding: 0.35rem 0.65rem;
      border-radius: 999px;
      background: #eff6ff;
      color: #1d4ed8;
      font-size: 0.7rem;
      font-weight: 800;
      white-space: nowrap;
    }

    .chart-frame {
      position: relative !important;
      flex: 1 !important;
      min-height: 100px !important;
    }

    .chart-frame-wide {
      min-height: 140px !important;
    }

    .chart-frame canvas {
      width: 100% !important;
      height: 100% !important;
    }

    .security-notice {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.5rem;
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border-radius: 1rem;
      border: 1px solid #0ea5e9;
    }

    .notice-icon {
      width: 3rem;
      height: 3rem;
      background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
      border-radius: 50%;
      display: grid;
      place-items: center;
      color: white;
      flex-shrink: 0;

      svg {
        width: 1.5rem;
        height: 1.5rem;
      }
    }

    .notice-content h3 {
      color: #1e293b;
      font-size: 1.1rem;
      font-weight: 600;
      margin: 0 0 0.5rem;
    }

    .notice-content p {
      color: #64748b;
      font-size: 0.875rem;
      margin: 0;
    }

    @media (max-width: 768px) {
      .user-dashboard {
        padding: 1rem;
      }

      .welcome-section {
        flex-direction: column;
        text-align: center;
        gap: 1rem;
      }

      .stats-grid {
        grid-template-columns: 1fr;
        gap: 1rem;
      }

      .actions-grid {
        grid-template-columns: 1fr;
      }

      .action-card {
        flex-direction: column;
        text-align: center;
        gap: 0.75rem;
      }

      .action-arrow {
        margin-left: 0;
        margin-top: 0.5rem;
      }

      .analytics-section {
        padding: 1rem;
      }

      .analytics-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.75rem;
      }

      .analytics-controls {
        width: 100%;
        justify-content: space-between;
      }

      .analytics-controls select {
        min-width: 100px;
        flex: 1;
      }

      .analytics-summary {
        grid-template-columns: repeat(2, 1fr);
        gap: 0.5rem;
      }

      .analytics-snapshot {
        grid-template-columns: 1fr;
        gap: 0.5rem;
      }

      .charts-grid {
        grid-template-columns: 1fr;
        gap: 0.75rem;
      }

      .chart-card {
        min-height: 160px !important;
        max-height: 240px !important;
      }

      .chart-wide {
        min-height: 200px !important;
        max-height: 280px !important;
      }
    }
  `]
})
export class UserDashboardComponent implements OnInit {
  private readonly fileApi = inject(FileApiService);
  private readonly userApi = inject(UserApiService);
  private readonly authStorage = inject(AuthStorageService);
  private readonly analytics = inject(AnalyticsService);

  userName = '';
  loading = true;
  stats: UserStats = {
    totalFiles: 0,
    totalSize: 0,
    storageLimit: 0,
    quotaPlan: 'small',
    quotaScope: 'tenant',
    sharedFiles: 0,
    receivedFiles: 0,
    recentUploads: 0,
    storageUsedPercent: 0,
    lastActivity: ''
  };

  analyticsLoading = false;
  analyticsError = '';
  quotaLoading = false;
  quota: UserQuotaSummary | null = null;
  analyticsData: FileAnalyticsResponse | null = null;
  selectedAnalyticsYear = new Date().getFullYear();
  selectedAnalyticsMonth = new Date().getMonth() + 1;
  analyticsYears = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);
  analyticsMonthOptions = [
    { value: 1, label: 'Janvier' },
    { value: 2, label: 'Fevrier' },
    { value: 3, label: 'Mars' },
    { value: 4, label: 'Avril' },
    { value: 5, label: 'Mai' },
    { value: 6, label: 'Juin' },
    { value: 7, label: 'Juillet' },
    { value: 8, label: 'Aout' },
    { value: 9, label: 'Septembre' },
    { value: 10, label: 'Octobre' },
    { value: 11, label: 'Novembre' },
    { value: 12, label: 'Decembre' }
  ];

  monthlyChartData: ChartConfiguration<'line'>['data'] = {
    labels: [],
    datasets: []
  };

  yearlyChartData: ChartConfiguration<'bar'>['data'] = {
    labels: [],
    datasets: []
  };

  statusChartData: ChartConfiguration<'doughnut'>['data'] = {
    labels: [],
    datasets: []
  };

  mimeChartData: ChartConfiguration<'doughnut'>['data'] = {
    labels: [],
    datasets: []
  };

  lineChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' }
    },
    scales: {
      y: { beginAtZero: true, ticks: { precision: 0 } }
    }
  };

  barChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' }
    },
    scales: {
      y: { beginAtZero: true, ticks: { precision: 0 } }
    }
  };

  doughnutChartOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' }
    }
  };

  ngOnInit(): void {
    const session = this.authStorage.getSession();
    if (session?.firstName && session?.lastName) {
      this.userName = `${session.firstName} ${session.lastName}`;
    } else if (session?.email) {
      this.userName = session.email.split('@')[0];
    } else {
      this.userName = 'Utilisateur';
    }
    this.loadStats();
    this.loadQuota();
    this.loadAnalytics();
  }

  private loadStats(): void {
    this.loading = true;

    this.userApi.getUserStats().subscribe({
      next: (stats) => {
        this.stats = this.buildLegacyStats(stats);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  private loadQuota(): void {
    this.quotaLoading = true;

    this.userApi.getUserQuota().subscribe({
      next: (quota) => {
        this.quota = quota;
        this.quotaLoading = false;
      },
      error: () => {
        this.quotaLoading = false;
      }
    });
  }

  get quotaPercent(): number {
    const percent = this.quota?.user?.storageUsedPercent ?? this.stats.storageUsedPercent ?? 0;
    if (!Number.isFinite(percent)) {
      return 0;
    }

    return Math.min(Math.max(percent, 0), 100);
  }

  get quotaStatusTone(): 'success' | 'warning' | 'danger' {
    if (this.quotaPercent >= 100) {
      return 'danger';
    }

    if (this.quotaPercent >= 90) {
      return 'warning';
    }

    if (this.quotaPercent >= 80) {
      return 'warning';
    }

    return 'success';
  }

  get quotaStatusMessage(): string {
    if (!this.quota) {
      return 'Chargement du quota...';
    }

    if (this.quotaPercent >= 100) {
      return 'Quota atteint, nouvel upload bloqué.';
    }

    if (this.quotaPercent >= 90) {
      return 'Attention, vous approchez fortement de la limite.';
    }

    if (this.quotaPercent >= 80) {
      return 'Alerte quota : utilisez l\'espace avec prudence.';
    }

    return 'Quota confortable.';
  }

  formatBytes(bytes: number): string {
    return this.analytics.formatBytes(bytes);
  }

  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) {
      return 'il y a moins d\'une heure';
    } else if (diffHours < 24) {
      return `il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
    } else if (diffDays < 7) {
      return `il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
    } else {
      return date.toLocaleDateString('fr-FR');
    }
  }

  private buildLegacyStats(stats: ComprehensiveUserStats): UserStats {
    const recentUploads = stats.fileManagement.trends.daily.reduce((total, item) => {
      const itemDate = new Date(item._id);
      const daysAgo = Math.floor((Date.now() - itemDate.getTime()) / (1000 * 60 * 60 * 24));
      return daysAgo < 7 ? total + item.count : total;
    }, 0);

    return {
      totalFiles: stats.fileManagement.uploads,
      totalSize: stats.fileManagement.totalSize,
      storageLimit: 0,
      quotaPlan: 'small',
      quotaScope: 'tenant',
      sharedFiles: stats.sharing.filesShared,
      receivedFiles: stats.sharing.filesReceived,
      recentUploads,
      storageUsedPercent: 0,
      lastActivity: stats.activity.lastLogin ? this.formatRelativeTime(new Date(stats.activity.lastLogin)) : ''
    };
  }

  onAnalyticsYearChange(event: Event): void {
    const next = Number((event.target as HTMLSelectElement).value || this.selectedAnalyticsYear);
    this.selectedAnalyticsYear = next;
    this.loadAnalytics();
  }

  onAnalyticsMonthChange(event: Event): void {
    const next = Number((event.target as HTMLSelectElement).value || this.selectedAnalyticsMonth);
    this.selectedAnalyticsMonth = next;
    this.loadAnalytics();
  }

  private loadAnalytics(): void {
    this.analyticsLoading = true;
    this.analyticsError = '';

    this.fileApi.getAnalytics({
      year: this.selectedAnalyticsYear,
      month: this.selectedAnalyticsMonth,
      scope: 'tenant'
    }).subscribe({
      next: (analytics) => {
        this.analyticsData = analytics;
        this.applyAnalyticsToCharts(analytics);
        this.analyticsLoading = false;
      },
      error: (response) => {
        this.analyticsError = response?.error?.error ?? 'Impossible de charger les analyses';
        this.analyticsLoading = false;
      }
    });
  }

  private applyAnalyticsToCharts(analytics: FileAnalyticsResponse): void {
    this.monthlyChartData = {
      labels: analytics.monthly.labels,
      datasets: [
        {
          label: 'Uploads',
          data: analytics.monthly.uploads,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.18)',
          borderWidth: 2,
          fill: true,
          tension: 0.3
        },
        {
          label: 'Partages',
          data: analytics.monthly.shares,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.16)',
          borderWidth: 2,
          fill: true,
          tension: 0.3
        },
        {
          label: 'Downloads via lien',
          data: analytics.monthly.sharedDownloads,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.14)',
          borderWidth: 2,
          fill: true,
          tension: 0.3
        }
      ]
    };

    this.yearlyChartData = {
      labels: analytics.yearly.labels.map((year) => String(year)),
      datasets: [
        {
          label: 'Uploads',
          data: analytics.yearly.uploads,
          backgroundColor: '#3b82f6',
          borderRadius: 8,
          maxBarThickness: 26
        },
        {
          label: 'Partages',
          data: analytics.yearly.shares,
          backgroundColor: '#22c55e',
          borderRadius: 8,
          maxBarThickness: 26
        },
        {
          label: 'Downloads',
          data: analytics.yearly.sharedDownloads,
          backgroundColor: '#f59e0b',
          borderRadius: 8,
          maxBarThickness: 26
        }
      ]
    };

    this.statusChartData = {
      labels: analytics.statusBreakdown.map((item) => item.label),
      datasets: [{
        data: analytics.statusBreakdown.map((item) => item.count),
        backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'],
        borderWidth: 1,
        borderColor: '#ffffff'
      }]
    };

    this.mimeChartData = {
      labels: analytics.mimeBreakdown.map((item) => item.label),
      datasets: [{
        data: analytics.mimeBreakdown.map((item) => item.count),
        backgroundColor: ['#2563eb', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'],
        borderWidth: 1,
        borderColor: '#ffffff'
      }]
    };
  }
}
