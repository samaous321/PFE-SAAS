import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';

import { ShareHistoryApiService } from '../../../core/services/share-history-api.service';
import { TenantApiService } from '../../../core/services/tenant-api.service';
import { UserApiService } from '../../../core/services/user-api.service';
import { ShareHistory, ShareHistoryFilters } from '../../../core/models/share-history.model';
import { Tenant } from '../../../core/models/tenant.model';
import { User } from '../../../core/models/user.model';

interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  actionLabel: string;
  icon: string;
  tenantName: string;
  userEmail: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  shareType?: string;
  recipientEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: any;
}

@Component({
  selector: 'app-admin-audit-logs',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './admin-audit-logs.component.html',
  styleUrls: ['./admin-audit-logs.component.scss']
})
export class AdminAuditLogsComponent implements OnInit, OnDestroy {
  auditLogs: AuditLog[] = [];
  tenants: Tenant[] = [];
  users: User[] = [];
  selectedLog: AuditLog | null = null;
  loading = false;
  loadingTenants = false;
  loadingUsers = false;

  // Expose Math and Object for template usage
  Math = Math;
  Object = Object;

  // Pagination
  currentPage = 1;
  pageSize = 25;
  totalItems = 0;
  totalPages = 0;

  // Filtres
  filterForm: FormGroup;
  filtersExpanded = true;
  private destroy$ = new Subject<void>();

  // Options
  actions = [
    'created', 'revoked', 'accessed_download', 'accessed_view',
    'settings_updated', 'file_settings_updated', 'file_deleted'
  ];

  constructor(
    private shareHistoryApi: ShareHistoryApiService,
    private tenantApi: TenantApiService,
    private userApi: UserApiService,
    private toastr: ToastrService,
    private fb: FormBuilder
  ) {
    this.filterForm = this.fb.group({
      tenantId: [''],
      userId: [''],
      action: [''],
      startDate: [''],
      endDate: [''],
      fileName: [''],
      recipientEmail: [''],
      ipAddress: [''],
      userAgent: ['']
    });
  }

  ngOnInit(): void {
    this.loadTenants();
    this.loadAuditLogs();

    // Filtrer sur changement
    this.filterForm.valueChanges
      .pipe(
        debounceTime(500),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.currentPage = 1;
        this.loadAuditLogs();
      });

    // Quand tenant change, charger les utilisateurs de ce tenant
    this.filterForm.get('tenantId')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(tenantId => {
        if (tenantId) {
          this.loadUsersForTenant(tenantId);
        } else {
          this.users = [];
          this.filterForm.patchValue({ userId: '' });
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTenants(): void {
    this.loadingTenants = true;
    this.tenantApi.getAllTenants().subscribe({
      next: (tenants) => {
        this.tenants = tenants || [];
        this.loadingTenants = false;
      },
      error: (error) => {
        this.toastr.error('Erreur lors du chargement des tenants');
        console.error('Error loading tenants:', error);
        this.loadingTenants = false;
      }
    });
  }

  loadUsersForTenant(tenantId: string): void {
    this.loadingUsers = true;
    this.userApi.getUsersByTenant(tenantId).subscribe({
      next: (users) => {
        this.users = users || [];
        this.loadingUsers = false;
      },
      error: (error) => {
        this.toastr.error('Erreur lors du chargement des utilisateurs');
        console.error('Error loading users:', error);
        this.loadingUsers = false;
      }
    });
  }

  loadAuditLogs(page: number = 1): void {
    this.loading = true;
    const filters: ShareHistoryFilters = {
      page,
      limit: this.pageSize,
      sortBy: '-createdAt',
      ...this.filterForm.value
    };

    // Supprimer les filtres vides
    Object.keys(filters).forEach(key => {
      if (!filters[key as keyof ShareHistoryFilters]) {
        delete filters[key as keyof ShareHistoryFilters];
      }
    });

    this.shareHistoryApi.getAdminShareHistory(filters).subscribe({
      next: (response) => {
        const builtLogs = this.buildAuditLogs(response.data);
        this.auditLogs = this.filterActionLogs(builtLogs);
        this.currentPage = response.pagination.page;
        this.totalItems = response.pagination.total;
        this.totalPages = response.pagination.pages;
        this.loading = false;
      },
      error: (error) => {
        this.toastr.error('Erreur lors du chargement des logs d\'audit');
        console.error('Error loading audit logs:', error);
        this.loading = false;
      }
    });
  }

  private buildAuditLogs(shares: ShareHistory[]): AuditLog[] {
    const logs: AuditLog[] = [];

    shares.forEach((share) => {
      // Logs d'audit trail
      if (share.auditTrail && Array.isArray(share.auditTrail)) {
        share.auditTrail.forEach((entry: any, index: number) => {
          logs.push({
            id: `${share.shareId}-audit-${index}`,
            timestamp: entry.timestamp || share.createdAt,
            action: entry.action || 'unknown',
            actionLabel: this.getActionLabel(entry.action),
            icon: this.getActionIcon(entry.action),
            tenantName: this.getTenantName(share.sharedBy.tenantId),
            userEmail: share.sharedBy.email || 'Unknown',
            fileName: share.fileName,
            fileSize: share.fileSize,
            mimeType: share.mimeType,
            shareType: share.shareType,
            recipientEmail: share.sharedWith.email,
            details: entry.changes || {}
          });
        });
      }

      // Logs d'accès
      if (share.accessLogs && Array.isArray(share.accessLogs)) {
        share.accessLogs.forEach((log: any, index: number) => {
          logs.push({
            id: `${share.shareId}-access-${index}`,
            timestamp: log.timestamp,
            action: `accessed_${log.action}`,
            actionLabel: this.getAccessActionLabel(log.action),
            icon: this.getAccessIcon(log.action),
            tenantName: this.getTenantName(share.sharedBy.tenantId),
            userEmail: 'External User',
            fileName: share.fileName,
            fileSize: share.fileSize,
            mimeType: share.mimeType,
            shareType: share.shareType,
            recipientEmail: share.sharedWith.email,
            ipAddress: log.ipAddress,
            userAgent: log.userAgent,
            details: { success: log.success }
          });
        });
      }
    });

    // Trier par date décroissante
    return logs.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  resetFilters(): void {
    this.filterForm.reset();
    this.users = [];
    this.currentPage = 1;
    this.loadAuditLogs();
  }

  toggleFilters(): void {
    this.filtersExpanded = !this.filtersExpanded;
  }

  private filterActionLogs(logs: AuditLog[]): AuditLog[] {
    const action = this.filterForm.get('action')?.value;
    if (!action) {
      return logs;
    }

    return logs.filter(log => log.action === action);
  }

  onPageChange(page: number): void {
    this.loadAuditLogs(page);
  }

  showDetails(log: AuditLog): void {
    this.selectedLog = log;
  }

  closeDetailsModal(): void {
    this.selectedLog = null;
  }

  private getActionLabel(action: string): string {
    const map: Record<string, string> = {
      created: 'Partage créé',
      revoked: 'Partage révoqué',
      settings_updated: 'Paramètres modifiés',
      file_settings_updated: 'Fichier mis à jour',
      file_deleted: 'Fichier supprimé'
    };
    return map[action] || action;
  }

  private getActionIcon(action: string): string {
    const map: Record<string, string> = {
      created: '📤',
      revoked: '🚫',
      settings_updated: '⚙️',
      file_settings_updated: '✏️',
      file_deleted: '🗑️'
    };
    return map[action] || '📝';
  }

  private getAccessActionLabel(action: string): string {
    const map: Record<string, string> = {
      download: 'Téléchargement',
      view: 'Consultation'
    };
    return map[action] || action;
  }

  private getAccessIcon(action: string): string {
    const map: Record<string, string> = {
      download: '⬇️',
      view: '👁️'
    };
    return map[action] || '🔍';
  }

  private getTenantName(tenantId?: string): string {
    if (!tenantId) return 'Unknown';
    const tenant = this.tenants.find(t => t._id === tenantId);
    return tenant?.name || 'Unknown';
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  getFileIcon(mimeType?: string): string {
    if (!mimeType) return '📄';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('image')) return '🖼️';
    if (mimeType.includes('video')) return '🎥';
    if (mimeType.includes('audio')) return '🎵';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
    return '📄';
  }

  exportToCSV(): void {
    if (this.auditLogs.length === 0) {
      this.toastr.warning('Aucune donnée à exporter');
      return;
    }

    const headers = [
      'Date',
      'Action',
      'Tenant',
      'Utilisateur',
      'Fichier',
      'Destinataire',
      'IP',
      'Navigateur',
      'Taille',
      'Type MIME'
    ];

    const rows = this.auditLogs.map(log => [
      this.formatDate(log.timestamp),
      log.actionLabel,
      log.tenantName,
      log.userEmail,
      log.fileName || '-',
      log.recipientEmail || '-',
      log.ipAddress || '-',
      log.userAgent || '-',
      log.fileSize ? this.formatFileSize(log.fileSize) : '-',
      log.mimeType || '-'
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);

    this.toastr.success('Export réussi');
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}