import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { ShareHistoryApiService } from '../../../core/services/share-history-api.service';
import { ActivityApiService } from '../../../core/services/activity-api.service';
import { Router } from '@angular/router';
import { ShareHistory, ShareHistoryFilters } from '../../../core/models/share-history.model';

interface ActivityItem {
  id: string;
  timestamp: string;
  action: string;
  actionLabel: string;
  icon: string;
  fileName: string;
  fileSize: number;
  mimeType?: string;
  shareType: 'direct' | 'link' | 'public' | 'other';
  recipientEmail: string;
  resourceId?: string;
  resourceType?: string;
  raw?: any;
  actorEmail?: string;
}

@Component({
  selector: 'app-user-share-history',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './user-share-history.component.html',
  styleUrls: ['./user-share-history.component.scss']
})
export class UserShareHistoryComponent implements OnInit, OnDestroy {
  allShareHistories: ShareHistory[] = [];
  allActivityFeed: ActivityItem[] = [];
  selectedShare: ShareHistory | null = null;
  selectedActivity: ActivityItem | null = null;
  showDetailsModal = false;
  showActivityDetailsModal = false;
  loading = false;
  loadingDetails = false;
  activeTab: 'activity' | 'history' = 'activity';
  
  // Pagination
  currentPage = 1;
  pageSize = 8;
  totalItems = 0;
  totalPages = 0;

  // Activity pagination
  activityCurrentPage = 1;
  activityPageSize = 8;

  // UI state
  showShareFilters = true;
  showActivityFilters = true;

  // Statistiques
  stats = {
    totalShares: 0,
    totalDownloads: 0,
    totalViews: 0,
    activeShares: 0,
    revokedShares: 0
  };

  // Filtres séparés
  shareFilterForm: FormGroup;
  activityFilterForm: FormGroup;
  private destroy$ = new Subject<void>();

  constructor(
    private shareHistoryApi: ShareHistoryApiService,
    private toastr: ToastrService,
    private fb: FormBuilder,
    private activityApi: ActivityApiService,
    private router: Router
  ) {
    this.shareFilterForm = this.fb.group({
      status: [''],
      shareType: [''],
      accessLevel: [''],
      fileName: [''],
      recipientEmail: [''],
      startDate: [''],
      endDate: ['']
    });

    this.activityFilterForm = this.fb.group({
      action: [''],
      shareType: [''],
      resourceType: [''],
      actor: [''],
      fileName: [''],
      recipientEmail: [''],
      mimeType: [''],
      startDate: [''],
      endDate: ['']
    });
  }

  ngOnInit(): void {
    this.loadShareHistory();
    this.loadStatistics();
    this.loadActivitiesFromApi();
  }
  
  // Load central activities and merge with share-derived activities
  private apiActivityItems: ActivityItem[] = [];

  private activityTotalItems = 0;
  private activityTotalPages = 1;

  private loadActivitiesFromApi(page: number = 1, limit: number = 100): void {
    this.activityApi.getMyActivities({ page, limit }).subscribe({
      next: (res) => {
        const items = Array.isArray(res.items) ? res.items : [];
        this.apiActivityItems = items.map((a: any) => this.mapApiActivityToItem(a));
        this.activityCurrentPage = res.page || page;
        this.activityTotalItems = res.total || 0;
        this.activityTotalPages = res.pages || Math.max(1, Math.ceil((res.total || 0) / (res.limit || limit)));
        // Merge with derived share activities
        const derived = this.buildActivityFeed(this.allShareHistories || []);
        this.mergeAndSetActivityFeed(derived, this.apiActivityItems);
      },
      error: (err) => {
        console.warn('Failed to load activities from API', err);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private extractAggregateCount(value: unknown): number {
    if (typeof value === 'number') {
      return value;
    }

    if (Array.isArray(value) && value.length > 0) {
      const first = value[0] as { total?: number };
      return typeof first?.total === 'number' ? first.total : 0;
    }

    return 0;
  }

  loadShareHistory(page: number = 1): void {
    this.loading = true;

    const filters: ShareHistoryFilters = {
      page,
      limit: this.pageSize,
      sortBy: '-createdAt'
    };

    this.shareHistoryApi
      .getMyShareHistory(filters)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.allShareHistories = response.data.map((share) => this.normalizeShareHistory(share));
          // Build derived activity feed from share histories and merge with central API activities
          const derived = this.buildActivityFeed(this.allShareHistories);
          this.mergeAndSetActivityFeed(derived, this.apiActivityItems || []);
          this.currentPage = response.pagination.page;
          this.totalItems = response.pagination.total;
          this.totalPages = response.pagination.pages;
          this.loading = false;
        },
        error: (error) => {
          this.toastr.error('Erreur lors du chargement de l\'historique');
          console.error('Error:', error);
          this.loading = false;
        }
      });
  }

  get filteredShareHistories(): ShareHistory[] {
    const value = this.shareFilterForm.getRawValue();
    return this.allShareHistories.filter((share) => {
      const fileMatch = !value.fileName || share.fileName.toLowerCase().includes(String(value.fileName).toLowerCase());
      const recipientMatch = !value.recipientEmail || (share.sharedWith.email || '').toLowerCase().includes(String(value.recipientEmail).toLowerCase());
      const statusMatch = !value.status || share.status === value.status;
      const typeMatch = !value.shareType || share.shareType === value.shareType;
      const accessMatch = !value.accessLevel || share.accessLevel === value.accessLevel;
      const startMatch = !value.startDate || new Date(share.createdAt) >= new Date(value.startDate);
      const endMatch = !value.endDate || new Date(share.createdAt) <= this.endOfDay(value.endDate);

      return fileMatch && recipientMatch && statusMatch && typeMatch && accessMatch && startMatch && endMatch;
    });
  }

  get filteredActivityFeed(): ActivityItem[] {
    const value = this.activityFilterForm.getRawValue();
    return this.allActivityFeed.filter((item) => {
      const fileMatch = !value.fileName || item.fileName.toLowerCase().includes(String(value.fileName).toLowerCase());
      const recipientMatch = !value.recipientEmail || item.recipientEmail.toLowerCase().includes(String(value.recipientEmail).toLowerCase());
      const typeMatch = !value.shareType || item.shareType === value.shareType;
      const resourceMatch = !value.resourceType || (item.resourceType || '').toLowerCase() === String(value.resourceType).toLowerCase();
      const actorMatch = !value.actor || (item.actorEmail || '').toLowerCase().includes(String(value.actor).toLowerCase());
      const mimeMatch = !value.mimeType || (item.mimeType || '').toLowerCase().includes(String(value.mimeType).toLowerCase());
      const actionMatch = !value.action || item.action === value.action;
      const startMatch = !value.startDate || new Date(item.timestamp) >= new Date(value.startDate);
      const endMatch = !value.endDate || new Date(item.timestamp) <= this.endOfDay(value.endDate);

      return fileMatch && recipientMatch && typeMatch && resourceMatch && actorMatch && mimeMatch && actionMatch && startMatch && endMatch;
    });
  }

  get activityPageCount(): number {
    // keep client-side count for merged feed pagination fallback
    return Math.max(1, Math.ceil(this.filteredActivityFeed.length / this.activityPageSize));
  }

  get pagedActivityFeed(): ActivityItem[] {
    const start = (this.activityCurrentPage - 1) * this.activityPageSize;
    return this.filteredActivityFeed.slice(start, start + this.activityPageSize);
  }

  loadStatistics(): void {
    this.shareHistoryApi
      .getMyShareStats()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.data) {
            const statsData = response.data as unknown as Record<string, unknown>;
            this.stats = {
              totalShares: this.extractAggregateCount(statsData['totalShares']),
              totalDownloads: this.extractAggregateCount(statsData['totalDownloads']),
              totalViews: this.extractAggregateCount(statsData['totalViews']),
              activeShares: this.extractAggregateCount(statsData['activeShares']),
              revokedShares: this.extractAggregateCount(statsData['revokedShares'])
            };
          }
        },
        error: (error) => {
          console.error('Error loading statistics:', error);
        }
      });
  }

  private endOfDay(dateString: string): Date {
    const date = new Date(dateString);
    date.setHours(23, 59, 59, 999);
    return date;
  }

  resetShareFilters(): void {
    this.shareFilterForm.reset({
      status: '',
      shareType: '',
      accessLevel: '',
      fileName: '',
      recipientEmail: '',
      startDate: '',
      endDate: ''
    });
  }

  resetActivityFilters(): void {
    this.activityFilterForm.reset({
      action: '',
      shareType: '',
      fileName: '',
      recipientEmail: '',
      mimeType: '',
      startDate: '',
      endDate: ''
    });
    this.activityCurrentPage = 1;
  }

  toggleShareFilters(): void {
    this.showShareFilters = !this.showShareFilters;
  }

  toggleActivityFilters(): void {
    this.showActivityFilters = !this.showActivityFilters;
  }

  applyShareQuickFilter(status: string): void {
    this.shareFilterForm.patchValue({ status });
  }

  setActiveTab(tab: 'activity' | 'history'): void {
    this.activeTab = tab;
    if (tab === 'activity') {
      this.activityCurrentPage = 1;
    }
  }

  viewDetails(share: ShareHistory): void {
    this.loadingDetails = true;
    this.selectedShare = null;
    this.shareHistoryApi
      .getShareDetails(share.shareId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.selectedShare = response.data;
          this.showDetailsModal = true;
          this.loadingDetails = false;
        },
        error: (error) => {
          this.toastr.error('Impossible de charger les détails du partage.');
          console.error('Error loading share details:', error);
          this.loadingDetails = false;
        }
      });
  }

  closeModal(): void {
    this.showDetailsModal = false;
    this.selectedShare = null;
  }

  closeActivityModal(): void {
    this.showActivityDetailsModal = false;
    this.selectedActivity = null;
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'active':
        return 'badge-success';
      case 'revoked':
        return 'badge-danger';
      case 'expired':
        return 'badge-warning';
      default:
        return 'badge-secondary';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'active':
        return 'Actif';
      case 'revoked':
        return 'Révoqué';
      case 'expired':
        return 'Expiré';
      default:
        return 'Inconnu';
    }
  }

  getExpiryLabel(share: ShareHistory): string {
    if (share.status === 'revoked') {
      return 'Révoqué';
    }
    if (share.status === 'expired') {
      return 'Expiré';
    }
    if (share.expiresAt) {
      return `Expire le ${this.formatDate(share.expiresAt)}`;
    }
    return 'Pas d’expiration';
  }

  getDownloadRatio(share: ShareHistory): string {
    if (share.maxDownloads && share.maxDownloads > 0) {
      return `${share.downloadCount} / ${share.maxDownloads}`;
    }
    return `${share.downloadCount} / ∞`;
  }

  getRecipientCount(share: ShareHistory): number {
    const recipientEmails = share.sharedWith.recipientEmails || [];
    if (typeof share.sharedWith.recipientCount === 'number' && share.sharedWith.recipientCount > 0) {
      return share.sharedWith.recipientCount;
    }

    if (recipientEmails.length > 0) {
      return recipientEmails.length;
    }

    return share.sharedWith.email ? 1 : 0;
  }

  hasBeenDownloaded(share: ShareHistory): boolean {
    return share.downloadCount > 0;
  }

  getAccessLevelIcon(level: string): string {
    switch (level) {
      case 'view':
        return '👁️';
      case 'download':
        return '⬇️';
      case 'edit':
        return '✏️';
      default:
        return '📄';
    }
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  onPageChange(page: number): void {
    if (page < 1 || page > this.totalPages) {
      return;
    }
    this.loadShareHistory(page);
  }

  onActivityPageChange(page: number): void {
    if (page < 1) return;
    // if we have server-side pages, prefer server navigation
    if (this.activityTotalPages > 1) {
      const target = Math.min(page, this.activityTotalPages);
      this.loadActivitiesFromApi(target, this.activityPageSize * 3);
      return;
    }
    if (page > this.activityPageCount) return;
    this.activityCurrentPage = page;
  }

  private buildActivityFeed(shares: ShareHistory[]): ActivityItem[] {
    const activities: ActivityItem[] = [];

    shares.forEach((share) => {
      const auditEntries = Array.isArray(share.auditTrail) ? share.auditTrail : [];

      if (auditEntries.length === 0) {
        activities.push(this.buildActivityItem(
          `${share.shareId}-created-fallback`,
          share.createdAt,
          'created',
          share
        ));
        return;
      }

      auditEntries.forEach((entry, index) => {
        const action = entry?.action || 'updated';
        const timestamp = entry?.timestamp || share.createdAt;

        activities.push(this.buildActivityItem(
          `${share.shareId}-${action}-${index}`,
          timestamp,
          action,
          share
        ));
      });
    });

    return activities.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  private buildActivityItem(id: string, timestamp: string, action: string, share: ShareHistory): ActivityItem {
    const resourceType = this.resolveActivityResourceType(action, 'share');
    return {
      id,
      timestamp,
      action,
      actionLabel: this.getActivityHeadline(action, resourceType),
      icon: this.getActivityIcon(action),
      fileName: this.shouldShowFileName(action, 'share') ? share.fileName : '',
      fileSize: share.fileSize,
      mimeType: share.mimeType,
      shareType: share.shareType,
      recipientEmail: this.shouldShowRecipient(action, 'share') ? this.getRecipientPreview(share) : '',
      resourceType
    };
  }

  private mapApiActivityToItem(a: any): ActivityItem {
    const id = a._id || a.id || `${a.type || 'act'}-${Math.random().toString(36).slice(2,8)}`;
    const timestamp = a.createdAt || a.timestamp || a.created_at || new Date().toISOString();
    const action = a.action || a.operation || a.type || 'activity';
    const fileName = a.metadata?.fileName || a.metadata?.filename || '';
    const fileSize = a.metadata?.fileSize || a.metadata?.size || 0;
    const mimeType = a.metadata?.mimeType || a.metadata?.mimetype || undefined;
    const recipientEmail = a.metadata?.recipientEmail || (Array.isArray(a.metadata?.recipientEmails) ? a.metadata.recipientEmails[0] : '') || '';
    const resourceType = this.resolveActivityResourceType(action, a.resourceType || a.metadata?.resourceType || a.type || undefined);
    const resourceId = a.resourceId || a.metadata?.resourceId || a.metadata?.shareId || a.metadata?.fileId || null;
    const actorEmail = a.actor?.email || a.metadata?.actorEmail || a.userEmail || '';

    const shareType = (resourceType === 'share' && (a.metadata?.recipientEmails ? 'direct' : 'link'))
      || (resourceType === 'file' && a.metadata?.isPublic ? 'public' : null) || 'other';

    const shouldShowFile = this.shouldShowFileName(action, resourceType);
    const shouldShowRecipient = this.shouldShowRecipient(action, resourceType);

    return {
      id: String(id),
      timestamp: String(timestamp),
      action: String(action),
      actionLabel: this.getActivityHeadline(String(action), resourceType),
      icon: this.getActivityIcon(String(action)),
      fileName: shouldShowFile ? fileName : '',
      fileSize,
      mimeType,
      shareType: shareType as any,
      recipientEmail: shouldShowRecipient ? (recipientEmail || '') : '',
      resourceId: resourceId || undefined,
      resourceType: resourceType || undefined,
      raw: a,
      actorEmail: actorEmail || undefined
    };
  }

  private resolveActivityResourceType(action: string, fallback?: string): string | undefined {
    const normalized = (action || '').toLowerCase();
    if (fallback && fallback !== 'activity') return fallback;

    if (normalized.includes('login') || normalized.includes('logout')) return 'auth';
    if (normalized.includes('complaint')) return 'complaint';
    if (normalized.includes('file_deleted') || normalized.includes('file_settings_updated')) return 'file';
    if (
      normalized.includes('create_share') ||
      normalized.includes('revoke_share') ||
      normalized.includes('hide_received_share') ||
      normalized.includes('restore_received_share') ||
      normalized.includes('accessed_view') ||
      normalized.includes('accessed_download') ||
      normalized.includes('download_shared') ||
      normalized === 'created' ||
      normalized === 'revoked'
    ) {
      return 'share';
    }

    return fallback;
  }

  private shouldShowFileName(action: string, resourceType?: string): boolean {
    const normalized = (action || '').toLowerCase();
    if (resourceType === 'complaint' || resourceType === 'auth') return false;
    if (normalized.includes('login') || normalized.includes('logout')) return false;
    return true;
  }

  private shouldShowRecipient(action: string, resourceType?: string): boolean {
    const normalized = (action || '').toLowerCase();
    if (resourceType === 'complaint' || resourceType === 'auth') return false;
    if (normalized.includes('login') || normalized.includes('logout')) return false;
    return true;
  }

  onActivityClick(item: ActivityItem): void {
    if (!item) return;
    this.selectedActivity = item;
    this.showActivityDetailsModal = true;
  }

  private mergeAndSetActivityFeed(derived: ActivityItem[], apiItems: ActivityItem[]) {
    const map = new Map<string, ActivityItem>();
    apiItems.forEach((it) => map.set(it.id, it));
    derived.forEach((it) => { if (!map.has(it.id)) map.set(it.id, it); });
    const merged = Array.from(map.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    this.allActivityFeed = merged;
    this.activityCurrentPage = 1;
  }

  private normalizeShareHistory(share: ShareHistory): ShareHistory {
    if (share.status !== 'active' || !share.expiresAt) {
      return share;
    }

    const expiresAt = new Date(share.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() >= Date.now()) {
      return share;
    }

    return {
      ...share,
      status: 'expired'
    };
  }

  getRecipientEmails(share: ShareHistory): string[] {
    const recipientEmails = share.sharedWith.recipientEmails || [];
    if (recipientEmails.length > 0) {
      return recipientEmails;
    }

    if (share.sharedWith.email) {
      return [share.sharedWith.email];
    }

    return [];
  }

  getRecipientPreview(share: ShareHistory, maxVisible: number = 2): string {
    const emails = this.getRecipientEmails(share);
    const recipientCount = this.getRecipientCount(share);

    if (emails.length === 0) {
      return share.shareType === 'public' ? 'Accès public' : '—';
    }

    if (recipientCount <= 1) {
      return emails[0];
    }

    const visibleEmails = emails.slice(0, maxVisible);
    const remaining = Math.max(0, recipientCount - visibleEmails.length);

    return remaining > 0
      ? `${visibleEmails.join(', ')} + ${remaining}`
      : visibleEmails.join(', ');
  }

  getDetailRecipientLabel(share: ShareHistory): string {
    const preview = this.getRecipientPreview(share);
    const recipientCount = this.getRecipientCount(share);

    if (recipientCount <= 1) {
      return preview;
    }

    return `${preview} • ${recipientCount} destinataires`;
  }

  getDetailRecipientList(share: ShareHistory): string[] {
    const emails = this.getRecipientEmails(share);
    if (emails.length > 0) {
      return emails;
    }

    return share.sharedWith.email ? [share.sharedWith.email] : [];
  }

  getActivityTypeBadge(activity: ActivityItem | null): string {
    if (!activity) return '';
    if (activity.resourceType === 'auth') return 'Authentification';
    if (activity.resourceType === 'complaint') return 'Réclamation';
    if (activity.resourceType === 'file') return 'Fichier';
    if (activity.resourceType === 'share') return 'Partage';
    return 'Activité';
  }

  getActivityDetailItems(activity: ActivityItem | null): Array<{ label: string; value: string; tone?: 'muted' | 'accent' }> {
    if (!activity) return [];

    const details: Array<{ label: string; value: string; tone?: 'muted' | 'accent' }> = [];
    const action = activity.action;
    const resourceType = activity.resourceType || this.resolveActivityResourceType(action);

    details.push({ label: 'Action', value: this.getActivityHeadline(action, resourceType), tone: 'accent' });
    details.push({ label: 'Date', value: this.formatDate(activity.timestamp) });

    if (resourceType === 'auth') {
      if (activity.actorEmail) details.push({ label: 'Utilisateur', value: activity.actorEmail });
      details.push({ label: 'Contexte', value: action === 'login' ? 'Connexion au compte' : 'Déconnexion du compte' });
      if (activity.raw?.ip) details.push({ label: 'IP', value: String(activity.raw.ip) });
      if (activity.raw?.userAgent) details.push({ label: 'Agent', value: String(activity.raw.userAgent) });
      return details;
    }

    if (resourceType === 'complaint') {
      if (activity.actorEmail) details.push({ label: 'Auteur', value: activity.actorEmail });
      if (activity.raw?.metadata?.title) details.push({ label: 'Titre', value: String(activity.raw.metadata.title) });
      if (activity.raw?.metadata?.description) details.push({ label: 'Description', value: String(activity.raw.metadata.description) });
      if (activity.raw?.metadata?.status) details.push({ label: 'Statut', value: String(activity.raw.metadata.status) });
      if (action.includes('delete') || action.includes('remove')) details.push({ label: 'Nature', value: 'Réclamation supprimée' });
      return details;
    }

    if (resourceType === 'file') {
      if (activity.fileName) details.push({ label: 'Nom fichier', value: activity.fileName });
      if (activity.mimeType) details.push({ label: 'Type fichier', value: activity.mimeType });
      if (activity.resourceId) details.push({ label: 'Réf fichier', value: activity.resourceId, tone: 'muted' });
      if (activity.actorEmail) details.push({ label: 'Effectué par', value: activity.actorEmail });
      if (activity.raw?.metadata?.deletedAt) details.push({ label: 'Supprimé le', value: this.formatDate(activity.raw.metadata.deletedAt) });
      if (activity.raw?.metadata?.reason) details.push({ label: 'Raison', value: String(activity.raw.metadata.reason) });
      if (action.includes('delete') || action === 'file_deleted') details.push({ label: 'Nature', value: 'Fichier supprimé' });
      return details;
    }

    if (resourceType === 'share') {
      if (activity.fileName) details.push({ label: 'Nom fichier', value: activity.fileName });
      if (activity.mimeType) details.push({ label: 'Type fichier', value: activity.mimeType });
      if (activity.recipientEmail) details.push({ label: 'Destinataire', value: activity.recipientEmail });
      if (activity.shareType) details.push({ label: 'Mode', value: this.getShareTypeLabel(activity.shareType) || 'Partage' });
      if (activity.resourceId) details.push({ label: 'Réf partage', value: activity.resourceId, tone: 'muted' });
      if (activity.actorEmail) details.push({ label: 'Effectué par', value: activity.actorEmail });
      if (activity.raw?.metadata?.downloadCount != null) details.push({ label: 'Téléchargements', value: String(activity.raw.metadata.downloadCount) });
      if (action.includes('delete') || action.includes('revoke') || action === 'revoked') details.push({ label: 'Nature', value: 'Partage supprimé' });
      return details;
    }

    if (activity.fileName) details.push({ label: 'Nom fichier', value: activity.fileName });
    if (activity.mimeType) details.push({ label: 'Type fichier', value: activity.mimeType });
    if (activity.recipientEmail) details.push({ label: 'Destinataire', value: activity.recipientEmail });
    if (activity.actorEmail) details.push({ label: 'Acteur', value: activity.actorEmail });
    if (activity.resourceId) details.push({ label: 'Réf', value: activity.resourceId, tone: 'muted' });
    return details;
  }

  getActivitySummary(activity: ActivityItem | null): string {
    if (!activity) return '';
    const resourceType = activity.resourceType || this.resolveActivityResourceType(activity.action);
    if (resourceType === 'auth') return 'Détails de connexion';
    if (resourceType === 'complaint') return 'Détails de réclamation';
    if (resourceType === 'file' && activity.action.includes('delete')) return 'Fichier supprimé';
    if (resourceType === 'share' && (activity.action.includes('delete') || activity.action.includes('revoke') || activity.action === 'revoked')) return 'Partage supprimé';
    if (resourceType === 'share' && activity.action.includes('download')) return 'Téléchargement du partage';
    if (resourceType === 'share' && activity.action.includes('view')) return 'Consultation du partage';
    return 'Détails de l’activité';
  }

  private getActivityHeadline(action: string, resourceType?: string): string {
    const normalized = (action || '').toLowerCase();

    if (normalized === 'login') return 'Connexion';
    if (normalized === 'logout') return 'Déconnexion';
    if (normalized.includes('complaint')) {
      if (normalized.includes('delete') || normalized.includes('remove')) return 'Réclamation supprimée';
      return 'Réclamation créée';
    }

    if (resourceType === 'share') {
      if (normalized.includes('delete') || normalized.includes('revoke') || normalized === 'revoked') return 'Partage supprimé';
      if (normalized.includes('download')) return 'Téléchargement via partage';
      if (normalized.includes('view') || normalized.includes('accessed_view')) return 'Consultation via partage';
      if (normalized.includes('create') || normalized === 'created') return 'Partage créé';
      if (normalized.includes('hide')) return 'Partage masqué';
      if (normalized.includes('restore')) return 'Partage restauré';
    }

    if (resourceType === 'file') {
      if (normalized.includes('delete') || normalized === 'file_deleted') return 'Fichier supprimé';
      if (normalized.includes('update') || normalized.includes('settings')) return 'Fichier mis à jour';
      if (normalized.includes('download')) return 'Téléchargement du fichier';
      if (normalized.includes('view')) return 'Consultation du fichier';
    }

    if (normalized.includes('download')) return 'Téléchargement';
    if (normalized.includes('view')) return 'Consultation';
    if (normalized.includes('create')) return 'Création';
    if (normalized.includes('update')) return 'Mise à jour';
    if (normalized.includes('delete') || normalized.includes('remove')) return 'Supprimé';

    return this.getActivityLabel(action);
  }

  private getActivityLabel(action: string): string {
    const map: Record<string, string> = {
      created: 'Partage créé',
      revoked: 'Partage révoqué',
      settings_updated: 'Paramètres de partage modifiés',
      accessed_download: 'Téléchargement via partage',
      accessed_view: 'Consultation via partage',
      file_settings_updated: 'Fichier mis à jour',
      file_deleted: 'Fichier supprimé'
    };

    // additional common actions
    map['login'] = 'Connexion';
    map['logout'] = 'Déconnexion';
    map['download'] = 'Téléchargement';
    map['download_shared'] = 'Téléchargement via partage';
    map['create_share'] = 'Partage créé';
    map['revoke_share'] = 'Partage révoqué';
    map['create_complaint'] = 'Réclamation créée';
    map['hide_received_share'] = 'Partage masqué';
    map['restore_received_share'] = 'Partage restauré';

    return map[action] || action;
  }

  private getActivityIcon(action: string): string {
    if (action.includes('download')) return '⬇️';
    if (action.includes('view')) return '👁️';
    if (action.includes('created')) return '📤';
    if (action.includes('revoked')) return '🚫';
    if (action.includes('deleted')) return '🗑️';
    if (action.includes('updated')) return '✏️';
    if (action === 'login') return '🔐';
    if (action === 'logout') return '🚪';
    return '📝';
  }

  getShareTypeLabel(type: 'direct' | 'link' | 'public' | 'other' | undefined): string {
    if (type === 'direct') return 'Direct';
    if (type === 'public') return 'Public';
    // hide 'Autre' label to avoid unprofessional tags
    return '';
  }

  getResourceTypeLabel(type?: string): string {
    if (!type) return '';
    const map: Record<string, string> = {
      share: 'Partage',
      file: 'Fichier',
      complaint: 'Réclamation',
      auth: 'Authentification',
      activity: 'Système'
    };
    return map[type] || '';
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'active': return '✅';
      case 'revoked': return '🚫';
      case 'expired': return '⏳';
      default: return 'ℹ️';
    }
  }

  getFileIcon(fileName?: string, mimeType?: string): string {
    if (mimeType) {
      if (mimeType.includes('pdf')) return '📕';
      if (mimeType.includes('image')) return '🖼️';
      if (mimeType.includes('video')) return '🎥';
      if (mimeType.includes('audio')) return '🎵';
      if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
      if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
      if (mimeType.includes('zip') || mimeType.includes('compressed')) return '🗜️';
    }

    if (fileName) {
      const ext = fileName.split('.').pop()?.toLowerCase();
      switch (ext) {
        case 'pdf': return '📕';
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'gif':
        case 'svg': return '🖼️';
        case 'mp4':
        case 'mov':
        case 'avi': return '🎥';
        case 'mp3':
        case 'wav': return '🎵';
        case 'doc':
        case 'docx': return '📝';
        case 'xls':
        case 'xlsx': return '📊';
        case 'zip':
        case 'rar':
        case '7z': return '🗜️';
        case 'ppt':
        case 'pptx': return '📽️';
      }
    }

    return '📄';
  }

  getFileExtension(fileName?: string): string {
    if (!fileName || !fileName.includes('.')) {
      return 'Fichier';
    }
    return fileName.split('.').pop()?.toUpperCase() || 'Fichier';
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}
