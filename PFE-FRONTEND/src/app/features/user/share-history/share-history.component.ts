import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NgChartsModule } from 'ng2-charts';
import { Chart, ChartConfiguration, ChartOptions, registerables } from 'chart.js';
import { ShareHistoryApiService } from '../../../core/services/share-history-api.service';
import { FileApiService } from '../../../core/services/file-api.service';
import { ShareHistory, ShareHistoryStats } from '../../../core/models/share-history.model';
import { SecureFile } from '../../../core/models/file.model';

Chart.register(...registerables);

interface ActivityLog {
  id: string;
  type: 'upload' | 'download' | 'share' | 'delete';
  fileName: string;
  fileSize: number;
  timestamp: string;
  status: 'success' | 'failed';
  details?: string;
}

interface FileTypeStats {
  type: string;
  count: number;
  totalSize: number;
  percentage: number;
}

interface StorageTimeline {
  date: string;
  usage: number;
}

@Component({
  standalone: true,
  selector: 'app-share-history',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgChartsModule],
  templateUrl: './share-history.component.html',
  styleUrls: ['./share-history.component.scss']
})
export class ShareHistoryComponent implements OnInit, OnDestroy {
  private readonly shareApi = inject(ShareHistoryApiService);
  private readonly fileApi = inject(FileApiService);
  private readonly destroy$ = new Subject<void>();

  shareStats: ShareHistoryStats | null = null;

  selectedStatus: string = '';
  selectedShareType: string = '';
  selectedAccessLevel: string = '';
  searchQuery: string = '';

  activityLogs: ActivityLog[] = [];
  filteredActivityLogs: ActivityLog[] = [];
  fileTypeStats: FileTypeStats[] = [];
  storageTimeline: StorageTimeline[] = [];

  activityChartData: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  fileTypeChartData: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };
  statusChartData: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };

  activityChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
  };

  fileTypeChartOptions: ChartOptions<'doughnut'> = { responsive: true, maintainAspectRatio: false };
  statusChartOptions: ChartOptions<'doughnut'> = { responsive: true, maintainAspectRatio: false };

  ngOnInit(): void {
    this.loadShareStats();
    this.loadShareHistory();
    this.loadFileStats();
    this.loadStorageTimeline();
    this.initCharts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadShareStats(): void {
    this.shareApi.getMyShareStats()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.shareStats = response.data;
        },
        error: (err) => {
          console.error('Erreur lors du chargement des statistiques de partage:', err);
        }
      });
  }

  private loadShareHistory(): void {
    this.shareApi.getMyShareHistory({ limit: 50 })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          const shares = response.data;
          this.activityLogs = shares.map(share => ({
            id: share._id || share.shareId,
            type: 'share' as const,
            fileName: share.fileName,
            fileSize: share.fileSize,
            timestamp: share.createdAt,
            status: share.status === 'active' ? 'success' : 'failed',
            details: share.shareType
          }));
          this.activityLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          this.filterActivityLogs();
        },
        error: (err) => {
          console.error('Erreur lors du chargement de l\'historique:', err);
        }
      });
  }

  private loadFileStats(): void {
    this.fileApi.getMyFiles()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (files) => {
          this.generateFileTypeStats(files);
        },
        error: (err) => {
          console.error('Erreur lors du chargement des fichiers:', err);
        }
      });
  }

  private generateFileTypeStats(files: SecureFile[]): void {
    const statsMap = new Map<string, { count: number; totalSize: number }>();

    for (const file of files) {
      const ext = file.originalName?.split('.').pop()?.toUpperCase() || 'Autres';
      const existing = statsMap.get(ext) || { count: 0, totalSize: 0 };
      statsMap.set(ext, {
        count: existing.count + 1,
        totalSize: existing.totalSize + (file.size || 0)
      });
    }

    const total = Array.from(statsMap.values()).reduce((sum, stat) => sum + stat.totalSize, 0);
    const colors = ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#0ea5a8', '#3b82f6'];
    let colorIndex = 0;

    this.fileTypeStats = Array.from(statsMap.entries()).map(([type, stat]) => ({
      type,
      count: stat.count,
      totalSize: stat.totalSize,
      percentage: total > 0 ? (stat.totalSize / total) * 100 : 0
    }));

    this.fileTypeChartData = {
      labels: this.fileTypeStats.map(s => s.type),
      datasets: [{
        data: this.fileTypeStats.map(s => s.count),
        backgroundColor: this.fileTypeStats.map(() => colors[colorIndex++ % colors.length])
      }]
    };
  }

  private loadStorageTimeline(): void {
    this.fileApi.getMyFiles()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (files) => {
          const current = files.reduce((sum, f) => sum + (f.size || 0), 0);
          for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            this.storageTimeline.push({
              date: date.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' }),
              usage: Math.max(0, current - Math.random() * (current * 0.2))
            });
          }
        }
      });
  }

  private initCharts(): void {
    const labels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

    this.activityChartData = {
      labels,
      datasets: [
        {
          label: 'Téléchargements',
          data: [8, 12, 6, 14, 10, 16, 9],
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.3
        },
        {
          label: 'Consultations',
          data: [12, 8, 15, 7, 20, 10, 5],
          borderColor: '#0ea5a8',
          backgroundColor: 'rgba(14, 165, 168, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.3
        }
      ]
    };

    this.statusChartData = {
      labels: ['Actif', 'Expiré', 'Révoqué'],
      datasets: [{
        data: [65, 20, 15],
        backgroundColor: ['#8b5cf6', '#f59e0b', '#ef4444']
      }]
    };
  }

  filterActivityLogs(): void {
    this.filteredActivityLogs = this.activityLogs.filter(log => {
      const statusMatch = !this.selectedStatus || log.status === this.selectedStatus;
      const searchMatch = !this.searchQuery || log.fileName.toLowerCase().includes(this.searchQuery.toLowerCase());
      return statusMatch && searchMatch;
    });
  }

  getActivityIcon(type: string): string {
    const icons: { [key: string]: string } = {
      upload: '⬆️',
      download: '⬇️',
      share: '🔗',
      delete: '🗑️'
    };
    return icons[type] || '📋';
  }

  getActivityLabel(type: string): string {
    const labels: { [key: string]: string } = {
      upload: 'Upload',
      download: 'Téléchargement',
      share: 'Partage',
      delete: 'Suppression'
    };
    return labels[type] || 'Activité';
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  exportToCSV(): void {
    alert('Export CSV - Fonctionnalité en développement');
  }

  exportToPDF(): void {
    alert('Export PDF - Fonctionnalité en développement');
  }
}
