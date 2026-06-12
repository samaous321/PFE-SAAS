export interface SharedByUser {
  userId: string;
  email: string;
  tenantId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SharedWithUser {
  userId?: string;
  email: string;
  recipientEmails?: string[];
  recipientCount?: number;
  tenantId?: string;
  externalUser?: boolean;
}

export interface AccessLog {
  timestamp: string;
  action: 'view' | 'download' | 'preview';
  ipAddress?: string;
  userAgent?: string;
  userLocation?: {
    country?: string;
    city?: string;
    lat?: number;
    lon?: number;
  };
  success: boolean;
  errorMessage?: string;
}

export interface AuditTrailEntry {
  action: string;
  timestamp: string;
  performedBy?: string;
  changes?: Record<string, any>;
}

export interface ShareHistory {
  _id?: string;
  shareId: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType?: string;
  fileHash?: string;
  shareUrl?: string | null;
  
  sharedBy: SharedByUser;
  sharedWith: SharedWithUser;
  
  shareType: 'direct' | 'link' | 'public';
  accessLevel: 'view' | 'download' | 'edit';
  expiresAt?: string;
  hasPassword?: boolean;
  maxDownloads?: number;
  
  downloadCount: number;
  viewCount: number;
  lastAccessedAt?: string;
  firstAccessedAt?: string;
  accessLogs?: AccessLog[];
  
  status: 'active' | 'revoked' | 'expired';
  revokedAt?: string;
  revokeReason?: string;
  revokedBy?: string;
  
  createdAt: string;
  updatedAt: string;
  auditTrail?: AuditTrailEntry[];
}

export interface ShareHistoryResponse {
  success: boolean;
  data: ShareHistory[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ShareHistoryStats {
  totalShares: number;
  totalDownloads: number;
  totalViews: number;
  activeShares: number;
  revokedShares: number;
}

export interface ShareHistoryFilters {
  page?: number;
  limit?: number;
  status?: string;
  shareType?: string;
  mimeType?: string;
  accessLevel?: string;
  fileName?: string;
  recipientEmail?: string;
  action?: string;
  ipAddress?: string;
  userAgent?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  tenantId?: string;
  userId?: string;
  recipientUserId?: string;
}
