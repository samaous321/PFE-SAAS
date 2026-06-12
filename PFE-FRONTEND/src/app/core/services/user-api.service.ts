import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthResponse, LoginRequest, RegisterRequest } from '../models/auth.models';
import { User } from '../models/user.model';

export interface UserStats {
  totalFiles: number;
  totalSize: number;
  storageLimit?: number;
  quotaPlan?: 'small' | 'standard' | 'large' | 'unlimited';
  quotaScope?: 'user' | 'tenant';
  sharedFiles: number;
  receivedFiles: number;
  recentUploads: number;
  storageUsedPercent: number;
  lastActivity: string | null;
}

export interface ComprehensiveUserStats {
  fileManagement: {
    uploads: number;
    downloads: number;
    totalSize: number;
    trends: {
      daily: Array<{ _id: string; count: number }>;
      weekly: Array<{ _id: string; count: number }>;
      monthly: Array<{ _id: string; count: number }>;
    };
  };
  fileTypes: {
    distribution: Array<{
      type: string;
      count: number;
      totalSize: number;
      avgSize: number;
    }>;
    totalTypes: number;
  };
  security: {
    totalScanned: number;
    clean: number;
    quarantined: number;
    blocked: number;
    suspicious: number;
  };
  analysis: {
    totalScanned: number;
    scanSuccess: number;
    scanFailed: number;
    riskScoreDistribution: any[];
  };
  sharing: {
    filesShared: number;
    filesReceived: number;
    mostSharedFiles: Array<{
      fileId: string;
      filename: string;
      shareCount: number;
      lastShared: string;
    }>;
    mostViewedSharedFiles: Array<{
      fileId: string;
      filename: string;
      viewCount: number;
      lastViewed: string;
    }>;
  };
  storage: {
    totalUsed: number;
    fileCount: number;
    storageByType: Array<{
      type: string;
      totalSize: number;
      fileCount: number;
      avgSize: number;
    }>;
    largestFiles: Array<{
      _id: string;
      originalName: string;
      size: number;
      mimeType: string;
      createdAt: string;
    }>;
  };
  activity: {
    loginCount: number;
    lastLogin: string | null;
    activityTrends: Array<{
      _id: string;
      uploads: number;
      downloads: number;
    }>;
  };
  tenantOverview?: {
    id: string;
    name: string;
    plan: 'small' | 'standard' | 'large' | 'unlimited';
    usersCount: number;
    activeUsersCount: number;
    filesCount: number;
    sharedLinksCount: number;
    storageUsedBytes: number;
    storageLimitBytes: number | null;
    storageUsedPercent: number | null;
    averageFilesPerUser: number;
    averageStoragePerUser: number;
  };
  quota?: {
    plan: 'small' | 'standard' | 'large' | 'unlimited';
    scope: 'user' | 'tenant';
    user: {
      filesCount: number;
      storageUsedBytes: number;
      storageLimitBytes: number | null;
      storageUsedPercent: number | null;
    };
    tenant: {
      storageUsedBytes: number;
      storageLimitBytes: number | null;
      storageUsedPercent: number | null;
    };
  };
}

export interface StatsFilters {
  startDate?: string;
  endDate?: string;
  fileType?: string;
  status?: 'active' | 'expired' | 'blocked';
}

export interface UserQuotaSummary {
  plan: 'small' | 'standard' | 'large' | 'unlimited';
  scope: 'user' | 'tenant';
  tenant: {
    id: string;
    name: string;
    storageUsedBytes: number;
    storageLimitBytes: number | null;
    storageUsedPercent: number | null;
    maxUsers: number | null;
    maxFiles: number | null;
    maxFolders: number | null;
    usersCount: number;
    foldersCount: number;
  };
  user: {
    id: string;
    storageUsedBytes: number;
    storageLimitBytes: number | null;
    storageUsedPercent: number | null;
    maxFiles: number | null;
    maxDailyUploadBytes: number | null;
    filesCount: number;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable({ providedIn: 'root' })
export class UserApiService {
  private readonly baseUrl = `${environment.apiBaseUrl}/users`;

  constructor(private readonly http: HttpClient) {}

  register(payload: RegisterRequest) {
    return this.http.post<User>(`${this.baseUrl}/register`, payload);
  }

  signIn(payload: LoginRequest) {
    return this.http.post<AuthResponse>(`${this.baseUrl}/signin`, payload);
  }

  verifyUser(userId: string, code: string) {
    return this.http.get(`${this.baseUrl}/verify/${userId}/${code}`);
  }

  verifyUserByEmail(email: string, verificationCode: string) {
    return this.http.post(`${this.baseUrl}/verify-code`, { email, verificationCode });
  }

  sendVerificationCode(email: string) {
    return this.http.post(`${this.baseUrl}/send-verification-code`, { email });
  }

  resendVerificationCode(payload: { email?: string; userId?: string }) {
    if (payload.email) {
      return this.http.post(`${this.baseUrl}/send-verification-code`, { email: payload.email });
    } else if (payload.userId) {
      return this.http.post(`${this.baseUrl}/${payload.userId}/resend-verification`, {});
    }
    throw new Error('Either email or userId must be provided');
  }

  getUsers() {
    return this.http.get<User[]>(this.baseUrl);
  }

  getUsersPaginated(page: number = 1, limit: number = 20) {
    return this.http.get<PaginatedResponse<User>>(`${this.baseUrl}?page=${page}&limit=${limit}`);
  }

  getUserById(id: string) {
    return this.http.get<User>(`${this.baseUrl}/${id}`);
  }

  createUser(payload: RegisterRequest) {
    return this.http.post<User>(this.baseUrl, payload);
  }

  updateUser(id: string, payload: Partial<User & { password?: string }>) {
    return this.http.put<User>(`${this.baseUrl}/${id}`, payload);
  }

  deleteUser(id: string) {
    return this.http.delete(`${this.baseUrl}/${id}`);
  }

  // Get users by tenant (Admin)
  getUsersByTenant(tenantId: string) {
    return this.http.get<User[]>(`${this.baseUrl}/tenant/${tenantId}`);
  }

  // Search users
  searchUsers(query: string) {
    return this.http.get<User[]>(`${this.baseUrl}/search?q=${query}`);
  }

  logout() {
    return this.http.post(`${this.baseUrl}/logout`, {});
  }

  getUserStats(filters?: StatsFilters) {
    let params = '';
    if (filters) {
      const queryParams = new URLSearchParams();
      if (filters.startDate) queryParams.append('startDate', filters.startDate);
      if (filters.endDate) queryParams.append('endDate', filters.endDate);
      if (filters.fileType) queryParams.append('fileType', filters.fileType);
      if (filters.status) queryParams.append('status', filters.status);
      params = '?' + queryParams.toString();
    }
    return this.http.get<ComprehensiveUserStats>(`${this.baseUrl}/stats${params}`);
  }

  getUserQuota() {
    return this.http.get<UserQuotaSummary>(`${this.baseUrl}/quota`);
  }

  getUserQuotaById(userId: string) {
    return this.http.get<UserQuotaSummary>(`${this.baseUrl}/${userId}/quota`);
  }

  getQuotaSummary() {
    return this.getUserQuota();
  }

  enableTwoFactor(userId: string, phoneNumber: string) {
    return this.http.post(`${this.baseUrl}/${userId}/2fa/enable`, { phoneNumber });
  }

  disableTwoFactor(userId: string, password: string) {
    return this.http.post(`${this.baseUrl}/${userId}/2fa/disable`, { password });
  }

  verifyOtp(userId: string, otp: string) {
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/verify-otp`, { userId, otp });
  }

  resendOtp(userId: string) {
    return this.http.post(`${this.baseUrl}/auth/resend-otp`, { userId });
  }
}
