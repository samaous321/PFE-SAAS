import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  constructor() {}

  /**
   * Formate des bytes en unité lisible (B, KB, MB, GB)
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Calcule un pourcentage
   */
  calculatePercentage(used: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((used / total) * 100);
  }

  /**
   * Formate une date
   */
  formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  /**
   * Formate un nombre avec séparateurs de milliers
   */
  formatNumber(num: number): string {
    return num.toLocaleString('fr-FR');
  }

  /**
   * Crée une configuration simple de graphique ligne
   */
  createLineChart(
    labels: string[],
    data: number[],
    label: string = 'Data',
    borderColor: string = '#3b82f6'
  ): any {
    return {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label,
            data,
            borderColor,
            backgroundColor: `${borderColor}20`,
            tension: 0.4,
            fill: true,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'top'
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    };
  }

  /**
   * Crée une configuration simple de graphique barre
   */
  createBarChart(
    labels: string[],
    data: number[],
    label: string = 'Data',
    backgroundColor: string = '#3b82f6'
  ): any {
    return {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label,
            data,
            backgroundColor
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    };
  }

  /**
   * Crée une configuration simple de graphique pie
   */
  createPieChart(labels: string[], data: number[], label: string = 'Data'): any {
    const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];
    return {
      type: 'pie',
      data: {
        labels,
        datasets: [
          {
            label,
            data,
            backgroundColor: colors.slice(0, labels.length)
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    };
  }

  /**
   * Crée une configuration simple de graphique doughnut
   */
  createDoughnutChart(labels: string[], data: number[], label: string = 'Data'): any {
    const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];
    return {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            label,
            data,
            backgroundColor: colors.slice(0, labels.length)
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'right'
          }
        }
      }
    };
  }
}
