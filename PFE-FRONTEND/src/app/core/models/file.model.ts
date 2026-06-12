export interface FileOwner {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface Folder {
  _id: string;
  ownerId: string;
  tenantId: string;
  name: string;
  parentId?: string | null;
  path: string;
  color?: string;
  icon?: string;
  position?: number;
  isRoot?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SecureFileScanMetadata {
  aiClassification?: {
    classification?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'TOP_SECRET' | 'UNKNOWN';
    confidence?: number;
    detected_pii?: string[];
    pii_risk?: 'LOW' | 'MEDIUM' | 'HIGH' | string;
    reasoning?: string;
    error?: string;
  };
  aiAnalysis?: {
    raw?: unknown;
    error?: string;
  };
  aiAnalyzedAt?: string;
  aiStatus?: 'pending' | 'done' | 'failed' | string;
  quarantineStatus?: 'clean' | 'quarantined' | 'unknown' | string;
  whitelistedBy?: string | FileOwner;
  whitelistReason?: string;
  whitelistDate?: string;
  investigationNotes?: string;
}

export interface SecureFile {
  _id: string;
  tenantId: string;
  ownerId: string | FileOwner;
  ownerSpaceId?: string | Folder | null;
  originalName: string;
  description?: string;
  mimeType?: string;
  size?: number;
  downloadCount?: number;
  maxDownloads?: number;
  expirationDate?: string | null;
  status?: 'active' | 'expired' | 'blocked';
  createdAt?: string;
  contentHash?: string;
  sharedWith?: Array<string | FileOwner>;
  isNew?: boolean;
  scanMetadata?: SecureFileScanMetadata;
  quarantineStatus?: 'clean' | 'quarantined' | 'unknown';
  whitelistedBy?: string | FileOwner;
  whitelistReason?: string;
  whitelistDate?: string;
  investigationNotes?: string;
}

export interface MalwareAlert extends SecureFile {
  scanStatus?: string;
  scanViruses?: string[];
  scannedAt?: string;
  scanMetadata?: SecureFileScanMetadata & {
    clamavResult?: {
      status?: string;
      isInfected?: boolean;
      viruses?: string[];
      timestamp?: string;
      reason?: string;
    };
    virustotalResult?: {
      isInfected?: boolean;
      engines_detected?: number;
      engines_total?: number;
      detectionRatio?: number;
      stats?: Record<string, unknown>;
      viruses?: string[];
      timestamp?: string;
      engine?: string;
    };
    quarantineStatus?: string;
    lastScannedAt?: string;
  };
}

export interface ShareLinkResponse {
  linkId: string;
  token: string;
  shareUrl: string;
  accessControl: string;
  expiresAt: string;
  maxUses: number;
}

export interface SharedFileScanResult {
  fileId: string;
  shareToken?: string;
  originalName: string;
  mimeType?: string;
  size?: number;
  fileHash?: string;
  isInfected: boolean;
  warning?: string;
  virustotalUrl?: string;
  clamavResult?: {
    isInfected: boolean;
    viruses: string[];
    engine: string;
    warning?: string;
  };
  virustotalResult?: {
    isInfected: boolean;
    detectionRatio?: string;
    stats?: Record<string, unknown>;
    warning?: string;
  };
  scanDate: string;
}

export interface FileSettingsPayload {
  description?: string;
  expirationDate?: string | null;
  maxDownloads?: number;
  status?: 'active' | 'expired' | 'blocked';
  allowedIPs?: string[];
}

export interface AnalyticsBreakdownItem {
  key: string;
  label: string;
  count: number;
}

export interface TopAgentStats {
  userId: string;
  name: string;
  email: string;
  uploads: number;
  storage: number;
  downloads: number;
}

export interface AgentMonthlySeries {
  userId: string;
  name: string;
  uploads: number[];
}

export interface DeltaMetric {
  absolute: number;
  percent: number | null;
}

export interface SnapshotMetrics {
  uploads: number;
  shares: number;
  sharedDownloads: number;
}

export interface AnalyticsComparison {
  previousMonthSnapshot: SnapshotMetrics;
  monthOverMonth: {
    uploads: DeltaMetric;
    shares: DeltaMetric;
    sharedDownloads: DeltaMetric;
  };
  selectedYear: {
    current: SnapshotMetrics;
    previous: SnapshotMetrics;
    delta: {
      uploads: DeltaMetric;
      shares: DeltaMetric;
      sharedDownloads: DeltaMetric;
    };
  };
}

export interface FileAnalyticsResponse {
  scope: 'tenant' | 'agent' | 'personal';
  period: {
    year: number;
    month: number;
  };
  summary: {
    totalFiles: number;
    totalStorage: number;
    totalDownloads: number;
    totalShares: number;
    activeShares: number;
  };
  monthSnapshot: {
    uploads: number;
    shares: number;
    sharedDownloads: number;
  };
  comparison: AnalyticsComparison;
  monthly: {
    labels: string[];
    uploads: number[];
    shares: number[];
    sharedDownloads: number[];
  };
  yearly: {
    labels: number[];
    uploads: number[];
    shares: number[];
    sharedDownloads: number[];
  };
  statusBreakdown: AnalyticsBreakdownItem[];
  mimeBreakdown: AnalyticsBreakdownItem[];
  topAgents?: TopAgentStats[];
  agentMonthly?: {
    labels: string[];
    series: AgentMonthlySeries[];
  };
}