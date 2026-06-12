import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-reusable-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="reusable-chart">
      <ng-content></ng-content>
    </div>
  `,
  styles: [
    `
      .reusable-chart {
        width: 100%;
        min-height: 320px;
      }
    `
  ]
})
export class ReusableChartComponent {}
