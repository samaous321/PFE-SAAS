import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-skeleton',
  imports: [CommonModule],
  template: `
    <div [ngClass]="['skeleton', variant]" [style.width.px]="width" [style.height.px]="height"></div>
  `,
  styles: [`
    .skeleton {
      display: block;
      border-radius: 999px;
      background: linear-gradient(90deg, #e9eef6 25%, #f8fbff 50%, #e9eef6 75%);
      background-size: 200% 100%;
      animation: shimmer 1.1s linear infinite;
    }

    .text { height: 18px; }
    .list { height: 72px; border-radius: 14px; }
    .block { min-height: 100px; border-radius: 16px; }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `]
})
export class SkeletonComponent {
  @Input() variant: 'text' | 'list' | 'block' = 'text';
  @Input() width?: number;
  @Input() height?: number;
}
