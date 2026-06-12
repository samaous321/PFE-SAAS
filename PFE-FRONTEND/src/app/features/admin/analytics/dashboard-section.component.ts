import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard-section',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dashboard-section">
      <div class="section-header" (click)="toggleOpen()">
        <div class="section-title-group">
          <h3 class="section-title">{{ title }}</h3>
          <p *ngIf="description" class="section-description">{{ description }}</p>
        </div>
        <button class="toggle-btn" [class.open]="isOpen" type="button">
          <span class="chevron">{{ isOpen ? '▼' : '▶' }}</span>
        </button>
      </div>
      <div *ngIf="isOpen" class="section-content" [@slideDown]>
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-section {
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      margin-bottom: 24px;
      overflow: hidden;
      animation: fadeIn 0.3s ease-in;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 24px;
      border-bottom: 1px solid #e5e7eb;
      cursor: pointer;
      transition: background-color 0.2s ease;
      user-select: none;
    }

    .section-header:hover {
      background-color: #f9fafb;
    }

    .section-title-group {
      flex: 1;
    }

    .section-title {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: #111827;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .section-description {
      margin: 8px 0 0 0;
      font-size: 0.875rem;
      color: #6b7280;
    }

    .toggle-btn {
      background: none;
      border: none;
      padding: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.3s ease;
    }

    .toggle-btn.open {
      transform: rotate(0deg);
    }

    .chevron {
      font-size: 0.875rem;
      color: #6b7280;
      transition: color 0.2s ease;
    }

    .toggle-btn:hover .chevron {
      color: #111827;
    }

    .section-content {
      padding: 24px;
      animation: slideDown 0.3s ease-out;
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        max-height: 0;
      }
      to {
        opacity: 1;
        max-height: 2000px;
      }
    }
  `]
})
export class DashboardSectionComponent {
  @Input() title!: string;
  @Input() description?: string;
  @Input() isOpen = true;
  @Output() toggleChange = new EventEmitter<boolean>();

  toggleOpen(): void {
    this.isOpen = !this.isOpen;
    this.toggleChange.emit(this.isOpen);
  }
}
