export type ComplaintCategory = 'technical' | 'billing' | 'access' | 'security' | 'other';
export type ComplaintPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ComplaintStatus = 'open' | 'in_progress' | 'pending_user' | 'resolved' | 'closed' | 'rejected';

export interface ComplaintAttachment {
  fileName?: string;
  fileUrl?: string;
  mimeType?: string;
  fileSize?: number;
}

export interface ComplaintMessage {
  authorType: 'user' | 'admin';
  authorId: string;
  message: string;
  isInternalNote?: boolean;
  attachments?: ComplaintAttachment[];
  createdAt: string;
}

export interface ComplaintAuditEntry {
  action: string;
  performedBy: string;
  role: 'user' | 'superadmin' | 'tenant_admin';
  details?: Record<string, any>;
  at: string;
}

export interface ComplaintSla {
  firstResponseDueAt?: string;
  resolutionDueAt?: string;
  firstRespondedAt?: string;
  resolvedAt?: string;
}

export interface ComplaintRequest {
  category?: ComplaintCategory;
  priority?: ComplaintPriority;
  subject: string;
  description: string;
  tags?: string[];
  attachments?: ComplaintAttachment[];
}

export interface ComplaintMessageRequest {
  message: string;
  isInternalNote?: boolean;
  attachments?: ComplaintAttachment[];
}

export interface Complaint {
  _id?: string;
  ticketId: string;
  requester: {
    userId: string;
    tenantId?: string;
    email: string;
    fullName: string;
  };
  category: ComplaintCategory;
  priority: ComplaintPriority;
  subject: string;
  description: string;
  status: ComplaintStatus;
  assignedTo?: {
    _id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  } | null;
  tags?: string[];
  attachments?: ComplaintAttachment[];
  messages?: ComplaintMessage[];
  counters?: {
    adminMessages: number;
    userMessages: number;
  };
  sla?: ComplaintSla;
  cancelReason?: string;
  resolveReason?: string;
  rejectReason?: string;
  closedAt?: string;
  lastActivityAt?: string;
  auditTrail?: ComplaintAuditEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface ComplaintPagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ComplaintListResponse {
  success: boolean;
  data: Complaint[];
  pagination: ComplaintPagination;
}

export interface ComplaintStatsResponse {
  success: boolean;
  data: {
    total: number;
    openOverdue: number;
    byStatus: Array<{ _id: string; count: number }>;
    byPriority: Array<{ _id: string; count: number }>;
  };
}

export interface ComplaintFilters {
  page?: number;
  limit?: number;
  status?: ComplaintStatus | string;
  priority?: ComplaintPriority | string;
  category?: ComplaintCategory | string;
  search?: string;
  sortBy?: string;
  startDate?: string;
  endDate?: string;
  tenantId?: string;
  requesterUserId?: string;
  assignedTo?: string;
}
