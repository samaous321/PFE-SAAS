import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-action-card',
  imports: [CommonModule, RouterLink],
  template: `
    <div class="action-card">
      <h3>{{ title }}</h3>
      <p>{{ description }}</p>
      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    .action-card {
      background: rgba(255, 255, 255, 0.78);
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 20px;
      padding: 1.3rem;
      box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
      transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
      backdrop-filter: blur(8px);
      min-height: 190px;
    }

    .action-card:hover {
      transform: translateY(-3px);
      border-color: rgba(106, 140, 255, 0.35);
      box-shadow: 0 18px 34px rgba(15, 23, 42, 0.12);
    }

    .action-card h3 {
      margin: 0 0 0.45rem;
      color: #0f172a;
      font-size: 1.02rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }

    .action-card p {
      margin: 0 0 1rem;
      color: #475569;
      font-size: 0.93rem;
      line-height: 1.55;
    }
  `]
})
export class ActionCardComponent {
  @Input() title = '';
  @Input() description = '';
}
