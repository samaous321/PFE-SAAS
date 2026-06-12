import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface DashboardTimelineEvent {
  title: string;
  description: string;
  datetime: string;
  tone: 'success' | 'warning' | 'info' | 'danger';
  icon: 'user' | 'tenant' | 'alert';
}

@Component({
  standalone: true,
  selector: 'app-dashboard-timeline',
  imports: [CommonModule],
  template: `
    <div class="timeline-card">
      <div class="timeline-header">
        <div>
          <p class="timeline-eyebrow">Activité récente</p>
          <h3>Journal des événements</h3>
        </div>
      </div>

      <div class="timeline-list">
        <article *ngFor="let event of events" class="timeline-item" [ngClass]="event.tone">
          <span class="timeline-dot" [ngClass]="event.icon"></span>
          <div class="timeline-content">
            <p class="timeline-title">{{ event.title }}</p>
            <p class="timeline-description">{{ event.description }}</p>
          </div>
          <span class="timeline-time">{{ event.datetime }}</span>
        </article>

        <div *ngIf="!events?.length" class="timeline-empty">
          Aucune activité récente disponible.
        </div>
      </div>
    </div>
  `,
  styles: [
    `:host { display: block; }
    .timeline-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 1.25rem; padding: 1.4rem; display: flex; flex-direction: column; gap: 1rem; box-shadow: var(--card-shadow); }
    .timeline-eyebrow { margin: 0 0 0.35rem; color: var(--primary); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
    .timeline-header h3 { margin: 0; font-size: 1.15rem; color: var(--text-primary); }
    .timeline-list { display: grid; gap: 0.9rem; }
    .timeline-item { display: grid; grid-template-columns: auto 1fr auto; gap: 1rem; align-items: flex-start; padding: 1rem; border-radius: 1rem; background: var(--card-surface); border: 1px solid transparent; transition: transform 160ms ease, border-color 160ms ease, background 160ms ease; }
    .timeline-item:hover { transform: translateY(-2px); border-color: rgba(15, 118, 255, 0.12); background: rgba(255, 255, 255, 0.95); }
    .timeline-dot { width: 2rem; height: 2rem; border-radius: 50%; display: grid; place-items: center; color: white; font-weight: 700; }
    .timeline-dot.user { background: #0f6dff; }
    .timeline-dot.tenant { background: #14b8a6; }
    .timeline-dot.alert { background: #f97316; }
    .timeline-content { display: grid; gap: 0.35rem; }
    .timeline-title { margin: 0; font-weight: 700; color: var(--text-primary); }
    .timeline-description { margin: 0; color: var(--text-secondary); font-size: 0.95rem; }
    .timeline-time { color: var(--text-tertiary); font-size: 0.82rem; white-space: nowrap; }
    .success .timeline-dot { background: #10b981; }
    .warning .timeline-dot { background: #f59e0b; }
    .info .timeline-dot { background: #0ea5e9; }
    .danger .timeline-dot { background: #ef4444; }
    .timeline-empty { color: var(--text-tertiary); padding: 1rem 0; text-align: center; }
    `]
})
export class ActivityTimelineComponent {
  @Input() events: DashboardTimelineEvent[] = [];
}
