import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ActivityApiService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/activities`;

  constructor(private readonly http: HttpClient) {}

  /**
   * GET /api/activities/mine
   * Accepts optional pagination and simple filters via query params
   */
  getMyActivities(params?: { page?: number; limit?: number; type?: string; action?: string }) {
    let httpParams = new HttpParams();
    if (params?.page) httpParams = httpParams.set('page', String(params.page));
    if (params?.limit) httpParams = httpParams.set('limit', String(params.limit));
    if (params?.type) httpParams = httpParams.set('type', params.type);
    if (params?.action) httpParams = httpParams.set('action', params.action);

    return this.http.get<{ items: any[]; total: number; page: number; limit: number; pages?: number }>(
      `${this.baseUrl}/mine`,
      { params: httpParams }
    );
  }
}
