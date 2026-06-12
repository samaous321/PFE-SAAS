import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { MalwareAlert, SecureFile } from '../models/file.model';
import { User } from '../models/user.model';
import { Tenant } from '../models/tenant.model';

export interface AdminStats {
  totalUsers: number;
  totalTenants: number;
  totalFiles: number;
  totalStorageUsed: number;
  totalStorageLimit: number;
  activeUsers: number;
  recentUsers: User[];
  recentTenants: Tenant[];
  malwareDetected: number;
  uploadsByDay: { date: string; count: number }[];
  storageByTenant: { tenantId: string; name: string; used: number; limit: number }[];
}

export interface AdminAlert {
  type: string;
  message: string;
  tenantName?: string;
  severity: 'low' | 'medium' | 'high';
}

export interface TenantStatsReport {
  tenantId: string;
  tenantName: string;
  usersCount: number;
  filesCount: number;
  storageUsedBytes: number;
  storageLimitBytes: number | null;
  storageUsagePercent: number | null;
  activityScore: number;
  lastActivity: string | null;
  suspicious: number;
  blocked: number;
  quarantined: number;
}

export interface SecurityStats {
  totals: {
    blocked: number;
    suspicious: number;
    quarantined: number;
  };
  perTenant: Array<{
    tenantId: string;
    tenantName: string;
    suspicious: number;
    blocked: number;
    quarantined: number;
  }>;
}

export interface ActivityStats {
  daily: Array<{
    period: string;
    uploads: number;
    shares: number;
    downloads: number;
  }>;
  weekly: Array<{
    period: string;
    uploads: number;
    shares: number;
    downloads: number;
  }>;
  uploads: number;
  downloads: number;
  shares: number;
}

export interface StorageStats {
  usagePerTenant: TenantStatsReport[];
  topStorageConsumers: TenantStatsReport[];
  tenantsNearQuota: TenantStatsReport[];
}

export interface InsightsStats {
  mostActiveTenants: TenantStatsReport[];
  mostSuspiciousTenants: TenantStatsReport[];
  highestStorageTenants: TenantStatsReport[];
}

export interface AdminStatsReport {
  global: {
    totalTenants: number;
    totalUsers: number;
    totalFiles: number;
    totalStorageUsed: number;
    totalStorageLimit?: number;
    totalUploads: number;
    totalDownloads: number;
    totalShares: number;
  };
  tenants: TenantStatsReport[];
  security: SecurityStats;
  activity: ActivityStats;
  storage: StorageStats;
  insights: InsightsStats;
  alerts: AdminAlert[];
  meta?: {
    activeUsers?: number;
    verifiedUsers?: number;
    adminUsers?: number;
  };
}

export interface AdminAnalytics {
  period: 'week' | 'month' | 'year';
  data: Record<string, unknown>;
}

export interface ActivityLog {
  _id?: string;
  action: string;
  userId: string;
  tenantId: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: string;
  services?: Record<string, 'up' | 'down'>;
}

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly baseUrl = `${environment.apiBaseUrl}/admin`;
  private readonly usersUrl = `${environment.apiBaseUrl}/users`;
  private readonly tenantsUrl = `${environment.apiBaseUrl}/tenant`;
  private readonly tenantFilesUrl = `${environment.apiBaseUrl}/file/admin/all`;

  constructor(private readonly http: HttpClient) {}

  getUsersList() {
    return this.http.get<User[]>(this.usersUrl).pipe(catchError(() => of([] as User[])));
  }

  getTenantsList() {
    return this.http.get<Tenant[]>(this.tenantsUrl).pipe(catchError(() => of([] as Tenant[])));
  }

  getFilesList() {
    return this.http.get<SecureFile[]>(this.tenantFilesUrl).pipe(catchError(() => of([] as SecureFile[])));
  }

  // Get global statistics
  getStats() {
    return this.http.get<AdminStats>(`${this.baseUrl}/dashboard`).pipe(
      catchError(() => this.getStatsLegacy())
    );
  }

  private getStatsLegacy() {
    return forkJoin({
      users: this.getUsersList(),
      tenants: this.getTenantsList(),
      files: this.getFilesList()
    }).pipe(
      map(({ users, tenants, files }) => {
        const safeUsers = Array.isArray(users) ? users : [];
        const safeTenants = Array.isArray(tenants) ? tenants : [];
        const safeFiles = Array.isArray(files) ? files : [];

        const activeUsers = safeUsers.filter((user) => (user?.status ?? 'active') === 'active').length;
        const recentUsers = [...safeUsers]
          .sort((a, b) => this.toTimestamp(b?.createdAt) - this.toTimestamp(a?.createdAt))
          .slice(0, 10);
        const recentTenants = [...safeTenants]
          .sort((a, b) => this.toTimestamp(b?.createdAt) - this.toTimestamp(a?.createdAt))
          .slice(0, 10);

        const totalStorageUsed = safeFiles.reduce((sum, file) => sum + this.toNumber(file?.size), 0);
        const totalStorageLimit = safeTenants.reduce((sum, tenant) => sum + this.toNumber(tenant?.storageLimit), 0);

        // Calculate malware detected from file scan metadata (matching backend logic)
        const malwareDetected = safeFiles.reduce((count, file) => {
          const meta = (file as any)?.scanMetadata;
          const isBlocked = (file?.status ?? '').toLowerCase() === 'blocked';
          const isInfected = !!meta?.clamavResult?.isInfected;
          const quarantine = String(meta?.quarantineStatus || '').toLowerCase();
          const isQuarantined = quarantine === 'quarantined';
          
          if (isInfected || isBlocked || isQuarantined) {
            return count + 1;
          }
          return count;
        }, 0);

        const uploadsByDayMap: Record<string, number> = {};
        for (const file of safeFiles) {
          const createdAt = file?.createdAt ? new Date(file.createdAt) : null;
          if (!createdAt || Number.isNaN(createdAt.getTime())) continue;

          const day = createdAt.toISOString().slice(0, 10);
          uploadsByDayMap[day] = (uploadsByDayMap[day] || 0) + 1;
        }

        const uploadsByDay = Object.entries(uploadsByDayMap)
          .sort(([a], [b]) => b.localeCompare(a))
          .slice(0, 7)
          .map(([date, count]) => ({ date, count }));

        const storageByTenantMap: Record<string, number> = {};
        for (const file of safeFiles) {
          const tenantId = typeof file?.tenantId === 'string' ? file.tenantId : '';
          if (!tenantId) continue;
          storageByTenantMap[tenantId] = (storageByTenantMap[tenantId] || 0) + this.toNumber(file?.size);
        }

        const storageByTenant = Object.entries(storageByTenantMap).map(([tenantId, used]) => {
          const tenant = safeTenants.find((item) => item?._id === tenantId);
          const limit = this.toNumber(tenant?.storageLimit);
          return {
            tenantId,
            name: tenant?.name || 'Tenant',
            used,
            limit
          };
        });

        return {
          totalUsers: safeUsers.length,
          totalTenants: safeTenants.length,
          totalFiles: safeFiles.length,
          totalStorageUsed,
          totalStorageLimit,
          activeUsers,
          recentUsers,
          recentTenants,
          malwareDetected,
          uploadsByDay,
          storageByTenant
        } as AdminStats;
      })
    );
  }

  getAdminStats(filters?: {
    startDate?: string;
    endDate?: string;
    tenantId?: string;
    tenantName?: string;
    fileType?: string;
    status?: string;
  }) {
    const query = new URLSearchParams();

    if (filters?.startDate) query.set('startDate', filters.startDate);
    if (filters?.endDate) query.set('endDate', filters.endDate);
    if (filters?.tenantId) query.set('tenantId', filters.tenantId);
    if (filters?.tenantName) query.set('tenantName', filters.tenantName);
    if (filters?.fileType) query.set('fileType', filters.fileType);
    if (filters?.status) query.set('status', filters.status);

    const queryString = query.toString();
    const url = queryString ? `${this.baseUrl}/stats?${queryString}` : `${this.baseUrl}/stats`;
    return this.http.get<AdminStatsReport>(url);
  }

  // Get analytics data
  getAnalytics(period: 'week' | 'month' | 'year' = 'month') {
    return this.getStats().pipe(
      map((stats) => ({
        period,
        data: {
          uploadsByDay: stats.uploadsByDay,
          malwareDetected: stats.malwareDetected,
          activeUsers: stats.activeUsers,
          totalFiles: stats.totalFiles,
          totalUsers: stats.totalUsers,
          totalTenants: stats.totalTenants,
          totalStorage: stats.totalStorageUsed,
          storageByTenant: stats.storageByTenant
        }
      }))
    );
  }

  // Get activity logs
  getActivityLogs(page: number = 1, limit: number = 20) {
    return this.http.get<{ data: ActivityLog[]; total: number; page: number }>(
      `${this.baseUrl}/logs?page=${page}&limit=${limit}`
    );
  }

  getMalwareAlerts(params?: {
    tenantId?: string;
    ownerId?: string;
    scanStatus?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: 'newest' | 'severity';
    page?: number;
    limit?: number;
  }) {
    const query = new URLSearchParams();

    if (params?.tenantId) query.set('tenantId', params.tenantId);
    if (params?.ownerId) query.set('ownerId', params.ownerId);
    if (params?.scanStatus) query.set('scanStatus', params.scanStatus);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.sortBy) query.set('sortBy', params.sortBy);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));

    const queryString = query.toString();
    const url = queryString
      ? `${this.baseUrl}/alerts?${queryString}`
      : `${this.baseUrl}/alerts`;

    return this.http.get<{ total: number; page: number; limit: number; data: MalwareAlert[] }>(url);
  }

  manageQuarantinedFile(fileId: string, payload: string | { action: string; reason?: string; notes?: string }) {
    const requestBody = typeof payload === 'string'
      ? { action: payload }
      : payload;

    return this.http.patch(`${this.baseUrl}/alerts/${fileId}`, requestBody);
  }

  // Get health status
  getHealth() {
    return this.http.get<HealthStatus>(`${this.baseUrl}/health`);
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }

  private toTimestamp(value: unknown): number {
    if (typeof value !== 'string' || !value.trim()) return 0;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
