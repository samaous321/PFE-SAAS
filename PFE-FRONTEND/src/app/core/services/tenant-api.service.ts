import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface Tenant {
  _id?: string;
  name: string;
  domain?: string;
  description?: string;
  usersCount?: number;
  storageUsed?: number;
  storageLimit?: number;
  filesCount?: number;
  isDeleted?: boolean;
  status?: 'active' | 'suspended' | 'inactive';
  createdAt?: string;
  updatedAt?: string;
  subscriptionPlan?: string;
  quotaOverrides?: {
    tenant?: {
      storageBytes?: number | null;
      maxUsers?: number | null;
      maxFiles?: number | null;
      maxFolders?: number | null;
    };
    user?: {
      storageBytes?: number | null;
      maxFiles?: number | null;
      maxDailyUploadBytes?: number | null;
    };
  };
}

export interface Plan {
  slug: string;
  name: string;
  description?: string;
  storageBytes: number | null;
  maxUsers: number | null;
  maxFiles: number | null;
  maxFolders: number | null;
  userStorageBytes: number | null;
  userMaxFiles: number | null;
  userDailyUploadBytes: number | null;
  isDefault?: boolean;
  sortOrder?: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PlanPayload {
  slug: string;
  name: string;
  description?: string;
  storageBytes: number | null;
  maxUsers: number | null;
  maxFiles: number | null;
  maxFolders: number | null;
  userStorageBytes: number | null;
  userMaxFiles: number | null;
  userDailyUploadBytes: number | null;
  isActive?: boolean;
  sortOrder?: number;
}

export interface PaginatedTenantResponse {
  items: Tenant[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type TenantDetailsSortBy = 'name' | 'storageUsedBytes' | 'storageUsedPercent' | 'filesCount';

export interface TenantDetailsUsagePoint {
  key: string;
  label: string;
  storageUsedBytes: number;
  filesCount: number;
}

export interface TenantDetailsUser {
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  storageUsedBytes: number;
  storageLimitBytes: number | null;
  storageUsedPercent: number | null;
  remainingStorageBytes: number | null;
  filesCount: number;
}

export interface TenantDetailsActivitySummary {
  averageDailyUploadBytes: number;
  averageFileSizeBytes: number;
  recentFilesUploaded: number;
  lastUploadDate: string | null;
}

export interface TenantDetailsResponse {
  quota: TenantQuotaSummary;
  range: '7d' | '30d' | '90d' | '1y';
  rangeLabel: string;
  usageSeries: TenantDetailsUsagePoint[];
  users: TenantDetailsUser[];
  saturationForecast: {
    averageMonthlyGrowthLabel: string;
    averageMonthlyGrowthBytes: number;
    monthsRemaining: number | null;
    estimatedFullDate: string | null;
    trend: string;
    remainingStorageBytes: number | null;
  };
  activitySummary: TenantDetailsActivitySummary;
  generatedAt: string;
  usersTotal: number;
  usersPage: number;
  usersLimit: number;
}

export interface TenantDetailsRequestParams {
  page?: number;
  limit?: number;
  sortBy?: TenantDetailsSortBy;
  sortDirection?: 'asc' | 'desc';
  search?: string;
  range?: '7d' | '30d' | '90d' | '1y';
}

export interface TenantQuotaSummary {
  tenantId: string;
  tenantName: string;
  subscriptionPlan: string;
  storageUsed: number;
  storageLimit: number | null;
  storageUsedPercent: number | null;
  usersCount: number;
  maxUsers: number | null;
  filesCount: number;
  maxFiles: number | null;
  foldersCount: number;
  maxFolders: number | null;
  remainingStorageBytes: number | null;
  userStorageLimit: number | null;
  userMaxFiles: number | null;
  userDailyUploadLimit: number | null;
  quotaStatus?: string;
  generatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class TenantApiService {
  private readonly baseUrl = `${environment.apiBaseUrl}/tenant`;

  constructor(private readonly http: HttpClient) {}

  // Get all tenants (Admin only)
  getAllTenants() {
    return this.http.get<Tenant[]>(this.baseUrl);
  }

  getAllTenantsPaginated(page: number = 1, limit: number = 20) {
    return this.http.get<PaginatedTenantResponse>(`${this.baseUrl}?page=${page}&limit=${limit}`);
  }

  // Check if tenant domain exists (public - no auth required)
  checkDomainExists(domain: string) {
    return this.http.get<{ exists: boolean; domain: string }>(`${this.baseUrl}/check-domain?domain=${encodeURIComponent(domain)}`);
  }

  // Get tenant by ID
  getTenantById(id: string) {
    return this.http.get<Tenant>(`${this.baseUrl}/${id}`);
  }

  // Create tenant (Admin only)
  createTenant(payload: Partial<Tenant>) {
    return this.http.post<Tenant>(this.baseUrl, payload);
  }

  // Update tenant (Admin only)
  updateTenant(id: string, payload: Partial<Tenant>) {
    return this.http.put<Tenant>(`${this.baseUrl}/${id}`, payload);
  }

  updateTenantQuota(id: string, payload: { quotaOverrides: NonNullable<Tenant['quotaOverrides']>; subscriptionPlan?: string }) {
    return this.http.patch<Tenant>(`${this.baseUrl}/${id}/quota`, payload);
  }

  // Soft delete tenant (Admin only)
  deleteTenant(id: string) {
    return this.http.delete(`${this.baseUrl}/${id}`);
  }

  // Get tenant statistics
  getTenantStats(tenantId: string) {
    return this.http.get<any>(`${this.baseUrl}/${tenantId}/stats`);
  }

  getTenantQuota(tenantId: string) {
    return this.http.get<TenantQuotaSummary>(`${this.baseUrl}/${tenantId}/quota`);
  }

  getTenantDetails(tenantId: string, query?: TenantDetailsRequestParams) {
    const params = new URLSearchParams();

    if (query?.page) params.set('page', String(query.page));
    if (query?.limit) params.set('limit', String(query.limit));
    if (query?.sortBy) params.set('sortBy', query.sortBy);
    if (query?.sortDirection) params.set('sortDirection', query.sortDirection);
    if (query?.search) params.set('search', query.search);
    if (query?.range) params.set('range', query.range);

    const suffix = params.toString() ? `?${params.toString()}` : '';
    return this.http.get<TenantDetailsResponse>(`${this.baseUrl}/${tenantId}/details${suffix}`);
  }

  // Plans (public route - no auth required)
  getPlans() {
    return this.http.get<Plan[]>(`${environment.apiBaseUrl}/plan/active`);
  }

  createPlan(payload: PlanPayload) {
    return this.http.post<Plan>(`${environment.apiBaseUrl}/plan`, payload);
  }

  updatePlan(slug: string, payload: PlanPayload) {
    return this.http.put<Plan>(`${environment.apiBaseUrl}/plan/${slug}`, payload);
  }

  deletePlan(slug: string) {
    return this.http.delete<{ message: string }>(`${environment.apiBaseUrl}/plan/${slug}`);
  }
}
