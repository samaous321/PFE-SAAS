import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div [class]="'stat-card stat-card-' + variant">
      <div class="stat-icon">{{ icon }}</div>
      <div class="stat-content">
        <p class="stat-label">{{ label }}</p>
        <p class="stat-value">{{ value }}</p>
        <p *ngIf="sublabel" class="stat-sublabel">{{ sublabel }}</p>
      </div>
    </div>
  `,
  styles: [`
    .stat-card {
      background: white;
      border-radius: 10px;
      padding: 16px;
      display: flex;
      gap: 16px;
      border-left: 4px solid #0ea5e9;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      transition: all 0.3s ease;
      animation: slideUp 0.3s ease-out;
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

    .stat-card:hover {
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
      transform: translateY(-2px);
    }

    .stat-card-primary {
      border-left-color: #3b82f6;
    }

    .stat-card-success {
      border-left-color: #10b981;
    }

    .stat-card-warning {
      border-left-color: #f59e0b;
    }

    .stat-card-danger {
      border-left-color: #ef4444;
    }

    .stat-card-info {
      border-left-color: #0ea5e9;
    }

    .stat-icon {
      font-size: 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 48px;
      opacity: 0.8;
    }

    .stat-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .stat-label {
      margin: 0;
      font-size: 0.875rem;
      color: #6b7280;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .stat-value {
      margin: 4px 0 0 0;
      font-size: 1.5rem;
      font-weight: 700;
      color: #111827;
    }

    .stat-sublabel {
      margin: 4px 0 0 0;
      font-size: 0.75rem;
      color: #9ca3af;
    }
  `]
})
export class StatCardComponent {
  @Input() icon = '📊';
  @Input() label = 'Label';
  @Input() value: string | number = '0';
  @Input() sublabel?: string;
  @Input() variant: 'primary' | 'success' | 'warning' | 'danger' | 'info' = 'info';
}
