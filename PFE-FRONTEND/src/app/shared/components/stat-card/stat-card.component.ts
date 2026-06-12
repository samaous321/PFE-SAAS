import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-stat-card',
  imports: [CommonModule, RouterLink],
  template: `
    <div class="stat-card" [ngClass]="colorClass">
      <div class="stat-icon">{{ icon }}</div>
      <div class="stat-info">
        <p class="stat-label">{{ label }}</p>
        <p class="stat-value" *ngIf="loading; else valueBlock">
          <span class="skeleton skeleton-text" aria-hidden="true"></span>
        </p>
        <ng-template #valueBlock>
          <p class="stat-value">{{ value || '-' }}</p>
        </ng-template>
        <p *ngIf="subtext" class="stat-subtext">{{ subtext }}</p>
        <a *ngIf="link" [routerLink]="link" class="stat-link">Gérer →</a>
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`
    .stat-card {
      border-radius: 20px;
      padding: 1.4rem;
      color: white;
      display: flex;
      gap: 1rem;
      box-shadow: 0 14px 30px rgba(15, 23, 42, 0.12);
      transition: transform 180ms ease, box-shadow 180ms ease, filter 180ms ease;
      position: relative;
      overflow: hidden;
      min-height: 148px;
      backdrop-filter: blur(6px);
    }

    .stat-card::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(255,255,255,0.18), transparent 60%);
      pointer-events: none;
    }

    .stat-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 18px 34px rgba(15, 23, 42, 0.16);
    }

    .stat-icon {
      font-size: 2.3rem;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 64px;
      height: 64px;
      border-radius: 18px;
      background: rgba(255,255,255,0.16);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.2);
    }

    .stat-info {
      flex: 1;
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .stat-label {
      margin: 0;
      font-size: 0.78rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.88;
      font-weight: 700;
    }

    .stat-value {
      margin: 0.35rem 0 0;
      font-size: 2rem;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.03em;
    }

    .stat-subtext {
      margin: 0.1rem 0 0;
      font-size: 0.8rem;
      opacity: 0.82;
    }

    .stat-link {
      display: inline-flex;
      align-self: flex-start;
      margin-top: 0.7rem;
      color: white;
      text-decoration: none;
      font-weight: 700;
      font-size: 0.88rem;
      transition: opacity 180ms ease, transform 180ms ease;
    }

    .stat-link:hover {
      opacity: 0.86;
      transform: translateX(2px);
    }

    .blue { background: linear-gradient(135deg, #6a8cff 0%, #4257d8 100%); }
    .red { background: linear-gradient(135deg, #ff7d8c 0%, #dc4c64 100%); }
    .green { background: linear-gradient(135deg, #34d399 0%, #0f9b6f 100%); }
    .purple { background: linear-gradient(135deg, #b66dff 0%, #7c3aed 100%); }

    .skeleton {
      display: block;
      width: 100%;
      min-height: 18px;
      border-radius: 999px;
      background: linear-gradient(90deg, rgba(255,255,255,0.24) 25%, rgba(255,255,255,0.42) 50%, rgba(255,255,255,0.24) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.1s linear infinite;
    }

    .skeleton-text {
      max-width: 9rem;
    }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `]
})
export class StatCardComponent {
  @Input() icon: string | null = null;
  @Input() label = '';
  @Input() value: string | number | null = null;
  @Input() link: string | null = null;
  @Input() colorClass = 'blue';
  @Input() subtext?: string | null = null;
  @Input() loading = false;
}
