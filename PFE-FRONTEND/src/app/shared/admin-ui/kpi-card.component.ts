import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-kpi-card',
  imports: [CommonModule],
  template: `
    <article class="kpi-card" [class.tone-success]="tone==='success'" [class.tone-warning]="tone==='warning'" [class.tone-danger]="tone==='danger'">
      <div class="kpi-top">
        <div class="kpi-icon" [attr.aria-hidden]="true">
          <ng-container [ngSwitch]="icon">
            <svg *ngSwitchCase="'users'" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 00-4-4H9a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <svg *ngSwitchCase="'tenants'" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 21v-6a4 4 0 014-4h10a4 4 0 014 4v6"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
            <svg *ngSwitchCase="'files'" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
            <svg *ngSwitchDefault viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/></svg>
          </ng-container>
        </div>

        <div class="kpi-meta">
          <span class="kpi-label">{{ label }}</span>
          <strong class="kpi-value">{{ displayValue }}</strong>
        </div>
      </div>

      <div class="kpi-footer">
        <small class="kpi-sub">{{ subtitle }}</small>
        <div class="kpi-spark" *ngIf="sparkData">
          <svg viewBox="0 0 100 20" preserveAspectRatio="none">
            <polyline [attr.points]="sparkData" fill="none" stroke-width="2" stroke="currentColor" stroke-linejoin="round" stroke-linecap="round"/>
          </svg>
        </div>
      </div>
    </article>
  `,
  styles: [
    `:host{display:block}
    .kpi-card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:1rem;padding:1rem;box-shadow:var(--card-shadow);display:flex;flex-direction:column;gap:0.75rem;transition:transform 220ms ease, border-color 220ms ease;}
    .kpi-card:hover{transform:translateY(-2px);border-color:rgba(15,118,255,0.16)}
    .kpi-top{display:flex;align-items:center;gap:1rem}
    .kpi-icon{width:3rem;height:3rem;display:flex;align-items:center;justify-content:center;border-radius:1rem;background:linear-gradient(135deg, rgba(15,117,255,0.12), rgba(15,117,255,0.04));color:#0f6dff}
    .kpi-icon svg{width:1.25rem;height:1.25rem}
    .kpi-label{display:block;color:var(--text-secondary);font-weight:700;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em}
    .kpi-value{font-size:1.75rem;color:var(--text-primary);line-height:1}
    .kpi-footer{display:flex;align-items:center;justify-content:space-between;gap:0.75rem}
    .kpi-sub{color:var(--text-tertiary);font-size:0.85rem}
    .kpi-spark svg{width:90px;height:30px}
    .tone-success .kpi-icon{background:linear-gradient(135deg, rgba(16,185,129,0.14), rgba(16,185,129,0.04));color:#059669}
    .tone-warning .kpi-icon{background:linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.03));color:#b45309}
    .tone-danger .kpi-icon{background:linear-gradient(135deg, rgba(239,68,68,0.14), rgba(239,68,68,0.04));color:#dc2626}
    `]
})
export class KpiCardComponent implements OnChanges {
  @Input() icon: 'users' | 'tenants' | 'files' | string = 'circle';
  @Input() label = '';
  @Input() value: string | number = '';
  @Input() subtitle = '';
  @Input() sparkData?: string;
  @Input() tone: 'normal' | 'success' | 'warning' | 'danger' = 'normal';
  @Input() animate = true;

  displayValue: string | number = '';
  private animationFrameId = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value']) {
      this.updateValueDisplay();
    }
  }

  private updateValueDisplay(): void {
    window.cancelAnimationFrame(this.animationFrameId);

    if (!this.animate || typeof this.value !== 'number') {
      this.displayValue = this.value;
      return;
    }

    const startValue = 0;
    const endValue = this.value;
    const duration = 700;
    const startTime = performance.now();

    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
      this.displayValue = Math.round(startValue + (endValue - startValue) * ease).toLocaleString('fr-FR');

      if (progress < 1) {
        this.animationFrameId = window.requestAnimationFrame(step);
      } else {
        this.displayValue = endValue.toLocaleString('fr-FR');
      }
    };

    this.animationFrameId = window.requestAnimationFrame(step);
  }
}
