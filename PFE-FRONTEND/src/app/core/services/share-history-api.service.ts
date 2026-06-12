import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import {
  ShareHistory,
  ShareHistoryResponse,
  ShareHistoryStats,
  ShareHistoryFilters
} from '../models/share-history.model';

@Injectable({ providedIn: 'root' })
export class ShareHistoryApiService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/shares`;
  // Backend exposes admin share-history endpoints under /api/shares/admin/*
  private readonly adminBaseUrl = `${environment.apiBaseUrl}/api/shares/admin`;
  private readonly tenantBaseUrl = `${environment.apiBaseUrl}/api/shares/tenant`;

  constructor(private readonly http: HttpClient) {}

  /**
   * ==========================================
   * USER ENDPOINTS
   * ==========================================
   */

  /**
   * Récupérer l'historique de ses partages
   */
  getMyShareHistory(filters?: ShareHistoryFilters) {
    let params = new HttpParams();

    if (filters) {
      if (filters.page) params = params.set('page', filters.page.toString());
      if (filters.limit) params = params.set('limit', filters.limit.toString());
      if (filters.status) params = params.set('status', filters.status);
      if (filters.shareType) params = params.set('shareType', filters.shareType);
      if (filters.mimeType) params = params.set('mimeType', filters.mimeType);
      if (filters.accessLevel) params = params.set('accessLevel', filters.accessLevel);
      if (filters.fileName) params = params.set('fileName', filters.fileName);
      if (filters.recipientEmail) params = params.set('recipientEmail', filters.recipientEmail);
      if (filters.startDate) params = params.set('startDate', filters.startDate);
      if (filters.endDate) params = params.set('endDate', filters.endDate);
      if (filters.sortBy) params = params.set('sortBy', filters.sortBy);
    }

    return this.http.get<ShareHistoryResponse>(`${this.baseUrl}/history`, { params });
  }

  /**
   * Récupérer les détails d'un partage
   */
  getShareDetails(shareId: string) {
    return this.http.get<{ success: boolean; data: ShareHistory }>(
      `${this.baseUrl}/history/${shareId}`
    );
  }

  /**
   * Récupérer ses statistiques de partage
   */
  getMyShareStats() {
    return this.http.get<{ success: boolean; data: ShareHistoryStats }>(
      `${this.baseUrl}/stats`
    );
  }

  /**
   * ==========================================
   * ADMIN ENDPOINTS
   * ==========================================
   */

  /**
   * Récupérer l'historique complet (supervision)
   */
  getAdminShareHistory(filters?: ShareHistoryFilters) {
    let params = new HttpParams();

    if (filters) {
      if (filters.page) params = params.set('page', filters.page.toString());
      if (filters.limit) params = params.set('limit', filters.limit.toString());
      if (filters.tenantId) params = params.set('tenantId', filters.tenantId);
      if (filters.userId) params = params.set('userId', filters.userId);
      if (filters.recipientUserId) params = params.set('recipientUserId', filters.recipientUserId);
      if (filters.recipientEmail) params = params.set('recipientEmail', filters.recipientEmail);
      if (filters.status) params = params.set('status', filters.status);
      if (filters.shareType) params = params.set('shareType', filters.shareType);
      if (filters.mimeType) params = params.set('mimeType', filters.mimeType);
      if (filters.action) params = params.set('action', filters.action);
      if (filters.ipAddress) params = params.set('ipAddress', filters.ipAddress);
      if (filters.userAgent) params = params.set('userAgent', filters.userAgent);
      if (filters.startDate) params = params.set('startDate', filters.startDate);
      if (filters.endDate) params = params.set('endDate', filters.endDate);
      if (filters.sortBy) params = params.set('sortBy', filters.sortBy);
    }

    return this.http.get<ShareHistoryResponse>(`${this.adminBaseUrl}/history`, { params });
  }

  /**
   * Récupérer les statistiques d'un tenant
   */
  getTenantShareStats(tenantId: string) {
    return this.http.get<{ success: boolean; data: any }>(
      `${this.adminBaseUrl}/stats/tenant/${tenantId}`
    );
  }

  /**
   * Révoquer un partage
   */
  revokeShare(shareId: string, reason: string) {
    return this.http.post<{ success: boolean; data: ShareHistory }>(
      `${this.adminBaseUrl}/revoke/${shareId}`,
      { reason }
    );
  }

  /**
   * Modifier les paramètres d'un partage
   */
  updateShareSettings(
    shareId: string,
    settings: { accessLevel?: string; expiresAt?: string; maxDownloads?: number }
  ) {
    return this.http.put<{ success: boolean; data: ShareHistory }>(
      `${this.adminBaseUrl}/${shareId}/settings`,
      settings
    );
  }

  /**
   * ==========================================
   * TENANT ADMIN ENDPOINTS
   * ==========================================
   */

  getTenantCurrentShareHistory(filters?: ShareHistoryFilters) {
    let params = new HttpParams();

    if (filters) {
      if (filters.page) params = params.set('page', filters.page.toString());
      if (filters.limit) params = params.set('limit', filters.limit.toString());
      if (filters.status) params = params.set('status', filters.status);
      if (filters.shareType) params = params.set('shareType', filters.shareType);
      if (filters.mimeType) params = params.set('mimeType', filters.mimeType);
      if (filters.fileName) params = params.set('fileName', filters.fileName);
      if (filters.recipientEmail) params = params.set('recipientEmail', filters.recipientEmail);
      if (filters.startDate) params = params.set('startDate', filters.startDate);
      if (filters.endDate) params = params.set('endDate', filters.endDate);
      if (filters.sortBy) params = params.set('sortBy', filters.sortBy);
    }

    return this.http.get<ShareHistoryResponse>(`${this.tenantBaseUrl}/current`, { params });
  }

  getTenantShareDetails(shareId: string) {
    return this.http.get<{ success: boolean; data: ShareHistory }>(
      `${this.tenantBaseUrl}/current/${shareId}`
    );
  }

  getTenantCurrentShareStats() {
    return this.http.get<{ success: boolean; data: any }>(`${this.tenantBaseUrl}/stats`);
  }

  revokeTenantShare(shareId: string, reason: string) {
    return this.http.post<{ success: boolean; data: ShareHistory }>(
      `${this.tenantBaseUrl}/revoke/${shareId}`,
      { reason }
    );
  }

  updateTenantShareSettings(
    shareId: string,
    settings: { accessLevel?: string; expiresAt?: string; maxDownloads?: number }
  ) {
    return this.http.put<{ success: boolean; data: ShareHistory }>(
      `${this.tenantBaseUrl}/${shareId}/settings`,
      settings
    );
  }
}
