import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-info-box',
  imports: [CommonModule],
  template: `
    <div class="info-box">
      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    .info-box {
      background: linear-gradient(180deg, rgba(248, 250, 252, 0.95), rgba(255, 255, 255, 0.98));
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 20px;
      padding: 1.35rem;
      box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
    }
  `]
})
export class InfoBoxComponent {
  @Input() title?: string;
}
