import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface KPIMetric {
  label: string;
  value: string | number;
  icon?: string;
  unit?: string;
  trend?: {
    direction: 'up' | 'down' | 'stable';
    percent: number;
  };
  status?: 'success' | 'warning' | 'danger' | 'info';
}

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div [class]="'kpi-card ' + (status || 'info')">
      <div class="kpi-header">
        <span class="kpi-label">{{ label }}</span>
        <span *ngIf="trend" [class]="'trend trend-' + trend.direction">
          {{ trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→' }}
          {{ Math.abs(trend.percent) }}%
        </span>
      </div>
      <div class="kpi-content">
        <div class="kpi-value">
          {{ value }}
          <span *ngIf="unit" class="kpi-unit">{{ unit }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .kpi-card {
      background: linear-gradient(135deg, #ffffff 0%, #f9fafb 100%);
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      transition: all 0.3s ease;
      border-left: 4px solid #0ea5e9;
      cursor: default;
    }

    .kpi-card:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transform: translateY(-2px);
    }

    .kpi-card.success {
      border-left-color: #10b981;
    }

    .kpi-card.warning {
      border-left-color: #f59e0b;
    }

    .kpi-card.danger {
      border-left-color: #ef4444;
    }

    .kpi-card.info {
      border-left-color: #3b82f6;
    }

    .kpi-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      font-size: 0.875rem;
      color: #6b7280;
    }

    .kpi-label {
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .trend {
      font-size: 0.875rem;
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 6px;
      display: inline-block;
    }

    .trend.trend-up {
      background-color: #d1fae5;
      color: #047857;
    }

    .trend.trend-down {
      background-color: #fee2e2;
      color: #991b1b;
    }

    .trend.trend-stable {
      background-color: #fef3c7;
      color: #92400e;
    }

    .kpi-content {
      display: flex;
      align-items: flex-end;
    }

    .kpi-value {
      font-size: 2rem;
      font-weight: 700;
      color: #111827;
      line-height: 1;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .kpi-unit {
      font-size: 0.875rem;
      color: #6b7280;
      font-weight: 500;
    }
  `]
})
export class KPICardComponent {
  @Input() label!: string;
  @Input() value!: string | number;
  @Input() unit?: string;
  @Input() trend?: { direction: 'up' | 'down' | 'stable'; percent: number };
  @Input() status?: 'success' | 'warning' | 'danger' | 'info' = 'info';

  Math = Math;
}
