import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ChartConfig {
  type: 'line' | 'bar' | 'area' | 'pie' | 'donut' | 'gauge' | 'scatter';
  series: any[];
  options?: any;
  title?: string;
  loading?: boolean;
  error?: string;
}

@Component({
  selector: 'app-chart-wrapper',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart-wrapper">
      <div *ngIf="title" class="chart-title">{{ title }}</div>
      
      <div *ngIf="loading" class="chart-loading">
        <div class="spinner"></div>
        <p>Chargement du graphique...</p>
      </div>

      <div *ngIf="error" class="chart-error">
        <p>⚠️ {{ error }}</p>
      </div>

      <div *ngIf="!loading && !error" class="chart-content">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`
    .chart-wrapper {
      background: white;
      border-radius: 10px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
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

    .chart-title {
      font-size: 1rem;
      font-weight: 600;
      color: #111827;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 2px solid #e5e7eb;
    }

    .chart-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 300px;
      gap: 16px;
      color: #6b7280;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e5e7eb;
      border-top-color: #0ea5e9;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .chart-error {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 300px;
      background-color: #fee2e2;
      border-radius: 8px;
      color: #991b1b;
      padding: 20px;
      text-align: center;
    }

    .chart-error p {
      margin: 0;
      font-weight: 500;
    }

    .chart-content {
      min-height: 300px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `]
})
export class ChartWrapperComponent {
  @Input() title?: string;
  @Input() loading = false;
  @Input() error?: string;
  @Input() config?: ChartConfig;
}
