import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import {
  Complaint,
  ComplaintFilters,
  ComplaintListResponse,
  ComplaintMessageRequest,
  ComplaintRequest,
  ComplaintStatsResponse
} from '../models/complaint.model';

@Injectable({ providedIn: 'root' })
export class ComplaintApiService {
  private readonly userBaseUrl = `${environment.apiBaseUrl}/api/complaints`;
  private readonly adminBaseUrl = `${environment.apiBaseUrl}/api/admin/complaints`;

  constructor(private readonly http: HttpClient) {}

  private buildParams(filters?: ComplaintFilters) {
    let params = new HttpParams();

    if (!filters) return params;
    if (filters.page) params = params.set('page', filters.page.toString());
    if (filters.limit) params = params.set('limit', filters.limit.toString());
    if (filters.status) params = params.set('status', filters.status);
    if (filters.priority) params = params.set('priority', filters.priority);
    if (filters.category) params = params.set('category', filters.category);
    if (filters.search) params = params.set('search', filters.search);
    if (filters.sortBy) params = params.set('sortBy', filters.sortBy);
    if (filters.startDate) params = params.set('startDate', filters.startDate);
    if (filters.endDate) params = params.set('endDate', filters.endDate);
    if (filters.tenantId) params = params.set('tenantId', filters.tenantId);
    if (filters.requesterUserId) params = params.set('requesterUserId', filters.requesterUserId);
    if (filters.assignedTo) params = params.set('assignedTo', filters.assignedTo);

    return params;
  }

  // USER
  createComplaint(payload: ComplaintRequest) {
    return this.http.post<{ success: boolean; data: Complaint }>(this.userBaseUrl, payload);
  }

  getMyComplaints(filters?: ComplaintFilters) {
    return this.http.get<ComplaintListResponse>(`${this.userBaseUrl}/my`, {
      params: this.buildParams(filters)
    });
  }

  getComplaintDetails(ticketId: string) {
    return this.http.get<{ success: boolean; data: Complaint }>(`${this.userBaseUrl}/${ticketId}`);
  }

  addMyComplaintMessage(ticketId: string, payload: ComplaintMessageRequest) {
    return this.http.post<{ success: boolean; data: Complaint }>(
      `${this.userBaseUrl}/${ticketId}/messages`,
      payload
    );
  }

  cancelMyComplaint(ticketId: string, reason?: string) {
    return this.http.put<{ success: boolean; data: Complaint }>(
      `${this.userBaseUrl}/${ticketId}/cancel`,
      { reason }
    );
  }

  // ADMIN
  getAdminComplaints(filters?: ComplaintFilters) {
    return this.http.get<ComplaintListResponse>(this.adminBaseUrl, {
      params: this.buildParams(filters)
    });
  }

  getAdminComplaintDetails(ticketId: string) {
    return this.http.get<{ success: boolean; data: Complaint }>(`${this.adminBaseUrl}/${ticketId}`);
  }

  addAdminComplaintMessage(ticketId: string, payload: ComplaintMessageRequest) {
    return this.http.post<{ success: boolean; data: Complaint }>(
      `${this.adminBaseUrl}/${ticketId}/messages`,
      payload
    );
  }

  assignComplaint(ticketId: string, assigneeId: string) {
    return this.http.put<{ success: boolean; data: Complaint }>(
      `${this.adminBaseUrl}/${ticketId}/assign`,
      { assigneeId }
    );
  }

  updateComplaintStatus(ticketId: string, status: string, reason?: string) {
    return this.http.put<{ success: boolean; data: Complaint }>(
      `${this.adminBaseUrl}/${ticketId}/status`,
      { status, reason }
    );
  }

  getComplaintStats(filters?: ComplaintFilters) {
    return this.http.get<ComplaintStatsResponse>(`${this.adminBaseUrl}/stats`, {
      params: this.buildParams(filters)
    });
  }

  exportComplaintsCsv(filters?: ComplaintFilters) {
    return this.http.get(`${this.adminBaseUrl}/export`, {
      params: this.buildParams(filters),
      responseType: 'blob'
    });
  }
}
