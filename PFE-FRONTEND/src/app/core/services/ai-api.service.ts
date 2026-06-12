import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AiApiService {
  private readonly baseUrl = `${environment.apiBaseUrl}/admin/ai`;

  constructor(private http: HttpClient) {}

  getLogs(limit = 50) {
    return this.http.get(`${this.baseUrl}/logs?limit=${limit}`);
  }

  getStatistics() {
    return this.http.get(`${this.baseUrl}/statistics`);
  }

  getCircuit() {
    return this.http.get(`${this.baseUrl}/circuit`);
  }

  resetCircuit() {
    return this.http.post(`${this.baseUrl}/circuit/reset`, {});
  }
}
