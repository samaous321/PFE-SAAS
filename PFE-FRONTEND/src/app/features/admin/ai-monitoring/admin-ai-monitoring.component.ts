import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AiApiService } from '../../../core/services/ai-api.service';

@Component({
  selector: 'app-admin-ai-monitoring',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-ai-monitoring.component.html',
  styleUrls: ['./admin-ai-monitoring.component.scss']
})
export class AdminAiMonitoringComponent implements OnInit {
  logs: any[] = [];
  statistics: any = null;
  circuit: any = null;
  loading = false;
  errorMessage = '';

  constructor(private ai: AiApiService) {}

  ngOnInit(): void {
    this.loadAll();
  }

  async loadAll() {
    this.loading = true;
    this.errorMessage = '';
    try {
      const [logsResult, statisticsResult, circuitResult] = await Promise.allSettled([
        this.ai.getLogs(50).toPromise(),
        this.ai.getStatistics().toPromise(),
        this.ai.getCircuit().toPromise()
      ]);

      const logsResponse: any = logsResult.status === 'fulfilled' ? logsResult.value : null;
      const statisticsResponse: any = statisticsResult.status === 'fulfilled' ? statisticsResult.value : null;
      const circuitResponse: any = circuitResult.status === 'fulfilled' ? circuitResult.value : null;

      this.logs = Array.isArray(logsResponse) ? logsResponse : logsResponse?.data ?? [];
      this.statistics = statisticsResponse?.statistics ?? statisticsResponse ?? null;
      this.circuit = circuitResponse?.circuit ?? circuitResponse ?? null;

      const failedCalls = [logsResult, statisticsResult, circuitResult].filter((x) => x.status === 'rejected');
      if (failedCalls.length > 0) {
        this.errorMessage = 'Certaines requetes AI ont echoue. Verifie le backend, CORS et le token admin.';
      }
    } catch (error: any) {
      this.errorMessage = error?.message || 'Echec du chargement AI monitoring';
    } finally {
      this.loading = false;
    }
  }

  async resetCircuit() {
    await this.ai.resetCircuit().toPromise();
    await this.loadAll();
  }
}
