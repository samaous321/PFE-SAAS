import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';

import { ShareHistory, ShareHistoryFilters } from '../../../core/models/share-history.model';
import { UserApiService } from '../../../core/services/user-api.service';
import { User } from '../../../core/models/user.model';
import { AuthStorageService } from '../../../core/services/auth-storage.service';
import { ShareHistoryApiService } from '../../../core/services/share-history-api.service';

interface ShareStatsSummary {
  totalShares: number;
  totalDownloads: number;
  totalViews: number;
  activeShares: number;
  revokedShares: number;
}

interface MetricCard {
  label: string;
  value: string;
  hint: string;
  tone: 'blue' | 'green' | 'amber' | 'slate';
}

@Component({
  selector: 'app-tenant-admin-current-shares',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './tenant-admin-current-shares.component.html',
  styleUrls: ['./tenant-admin-current-shares.component.scss']
})
export class TenantAdminCurrentSharesComponent implements OnInit, OnDestroy {
  shares: ShareHistory[] = [];
  selectedShare: ShareHistory | null = null;
  selectedShareDetails: ShareHistory | null = null;
  showDetailsModal = false;
  showRevokeModal = false;
  loading = false;
  detailsLoading = false;
  revokeLoading = false;
  statsLoading = false;

  currentPage = 1;
  pageSize = 12;
  totalItems = 0;
  totalPages = 0;

  readonly shareTypeOptions = [
    { value: '', label: 'Tous les types' },
    { value: 'direct', label: 'Partage direct' },
    { value: 'public', label: 'Partage par lien' }
  ];

  readonly sortOptions = [
    { value: '-createdAt', label: 'Plus récents' },
    { value: 'createdAt', label: 'Plus anciens' },
    { value: 'fileName', label: 'Nom du fichier A-Z' },
    { value: '-fileName', label: 'Nom du fichier Z-A' },
    { value: 'status', label: 'Statut' }
  ];

  readonly mimeTypeOptions = [
    { value: '', label: 'Tous les formats' },
    { value: 'pdf', label: 'PDF' },
    { value: 'image', label: 'Image' },
    { value: 'video', label: 'Vidéo' },
    { value: 'audio', label: 'Audio' },
    { value: 'sheet', label: 'Tableur' },
    { value: 'document', label: 'Document' },
    { value: 'zip', label: 'Archive' }
  ];

  readonly filterForm;

  readonly revokeForm;

  stats: ShareStatsSummary = {
    totalShares: 0,
    totalDownloads: 0,
    totalViews: 0,
    activeShares: 0,
    revokedShares: 0
  };

  tenantUsers: User[] = [];
  loadingTenantUsers = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly shareHistoryApi: ShareHistoryApiService,
    private readonly authStorage: AuthStorageService,
    private readonly userApi: UserApiService,
    private readonly toastr: ToastrService,
    private readonly fb: FormBuilder,
    private readonly router: Router
  ) {
    this.filterForm = this.fb.group({
      fileName: [''],
      recipientUser: [''],
      mimeType: [''],
      shareType: [''],
      startDate: [''],
      endDate: [''],
      sortBy: ['-createdAt']
    });

    this.revokeForm = this.fb.group({
      reason: ['', [Validators.required, Validators.minLength(8)]]
    });
  }

  ngOnInit(): void {
    if (!this.authStorage.isTenantAdmin()) {
      this.toastr.error('Accès réservé au tenant admin');
      this.router.navigate(['/user/dashboard']);
      return;
    }

    this.loadData();
    this.loadTenantUsers();

    this.filterForm.valueChanges
      .pipe(debounceTime(350), takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.loadShares();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get metricCards(): MetricCard[] {
    return [
      {
        label: 'Partages actifs',
        value: String(this.stats.activeShares),
        hint: 'Partages actuellement accessibles',
        tone: 'green'
      },
      {
        label: 'Révoqués',
        value: String(this.stats.revokedShares),
        hint: 'Partages désactivés ou annulés',
        tone: 'amber'
      },
      {
        label: 'Consultations',
        value: String(this.stats.totalViews),
        hint: 'Ouvertures suivies sur le tenant',
        tone: 'blue'
      },
      {
        label: 'Téléchargements',
        value: String(this.stats.totalDownloads),
        hint: 'Téléchargements cumulés',
        tone: 'slate'
      }
    ];
  }

  get hasResults(): boolean {
    return this.shares.length > 0;
  }

  loadData(): void {
    this.loadStats();
    this.loadShares();
  }

  loadStats(): void {
    this.statsLoading = true;

    this.shareHistoryApi
      .getTenantCurrentShareStats()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.stats = this.normalizeStats(response.data);
          this.statsLoading = false;
        },
        error: (error) => {
          console.error('Error loading tenant share stats:', error);
          this.statsLoading = false;
        }
      });
  }

  loadShares(page: number = this.currentPage): void {
    this.loading = true;

    const formValue = this.filterForm.getRawValue();
    const filters: ShareHistoryFilters = {
      page,
      limit: this.pageSize,
      shareType: formValue.shareType || undefined,
      mimeType: formValue.mimeType || undefined,
      fileName: formValue.fileName || undefined,
      recipientEmail: formValue.recipientUser || undefined,
      startDate: formValue.startDate || undefined,
      endDate: formValue.endDate || undefined,
      sortBy: formValue.sortBy || undefined
    };

    this.shareHistoryApi
      .getTenantCurrentShareHistory(filters)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.shares = response.data;
          this.currentPage = response.pagination.page;
          this.totalItems = response.pagination.total;
          this.totalPages = response.pagination.pages;
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading tenant share history:', error);
          this.toastr.error('Impossible de charger les partages du tenant');
          this.loading = false;
        }
      });
  }

  private loadTenantUsers(): void {
    const tenantId = this.authStorage.getSession()?.tenantId;
    if (!tenantId) return;

    this.loadingTenantUsers = true;
    this.userApi.getUsersByTenant(tenantId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (users) => {
        this.tenantUsers = (users || []).filter(u => !!u.email);
        this.loadingTenantUsers = false;
      },
      error: (err) => {
        console.error('Error loading tenant users:', err);
        this.tenantUsers = [];
        this.loadingTenantUsers = false;
      }
    });
  }

  getRecipientList(share: ShareHistory): string[] {
    // Prefer explicit array if backend provides it
    // @ts-ignore -- tolerant access for possible backend shapes
    const listField = (share as any).sharedWithList || (share as any).sharedWiths;
    if (Array.isArray(listField) && listField.length) {
      return listField.map((s: any) => s.email || s);
    }

    const single = share.sharedWith?.email;
    if (!single) return [];

    // If comma/semicolon separated string, split it
    if (typeof single === 'string' && /[,;]/.test(single)) {
      return single.split(/[;,]+/).map(s => s.trim()).filter(Boolean);
    }

    return [single];
  }

  getRecipientPreview(share: ShareHistory, max: number = 2): string {
    const list = this.getRecipientList(share);
    if (!list.length) return 'Aucun destinataire';
    if (list.length <= max) return list.join(', ');
    return `${list.slice(0, max).join(', ')} +${list.length - max}`;
  }

  resetFilters(): void {
    this.filterForm.reset({
      fileName: '',
      mimeType: '',
      shareType: '',
      startDate: '',
      endDate: '',
      sortBy: '-createdAt'
    });
    this.currentPage = 1;
    this.loadData();
  }

  refresh(): void {
    this.loadData();
  }

  onPageChange(page: number): void {
    if (page < 1 || page > this.totalPages) {
      return;
    }

    this.currentPage = page;
    this.loadShares(page);
  }

  viewDetails(share: ShareHistory): void {
    this.selectedShare = share;
    this.selectedShareDetails = share;
    this.showDetailsModal = true;
    this.detailsLoading = true;

    this.shareHistoryApi
      .getTenantShareDetails(share.shareId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.selectedShareDetails = response.data;
          this.detailsLoading = false;
        },
        error: (error) => {
          console.error('Error loading share details:', error);
          this.toastr.error('Impossible de charger les détails du partage');
          this.detailsLoading = false;
        }
      });
  }

  closeDetailsModal(): void {
    this.showDetailsModal = false;
    this.selectedShare = null;
    this.selectedShareDetails = null;
  }

  openRevokeModal(share: ShareHistory): void {
    this.selectedShare = share;
    this.showRevokeModal = true;
    this.revokeForm.reset();
  }

  closeRevokeModal(): void {
    this.showRevokeModal = false;
    this.revokeLoading = false;
  }

  revokeShare(): void {
    if (!this.selectedShare || this.revokeForm.invalid) {
      this.revokeForm.markAllAsTouched();
      this.toastr.error('Veuillez saisir une raison valide');
      return;
    }

    const reason = this.revokeForm.get('reason')?.value || '';
    this.revokeLoading = true;

    this.shareHistoryApi
      .revokeTenantShare(this.selectedShare.shareId, reason)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success('Partage révoqué avec succès');
          this.closeRevokeModal();
          this.closeDetailsModal();
          this.loadData();
        },
        error: (error) => {
          console.error('Error revoking share:', error);
          this.toastr.error('Impossible de révoquer le partage');
          this.revokeLoading = false;
        }
      });
  }

  copyShareLink(share: ShareHistory): void {
    if (!share.shareUrl) {
      this.toastr.warning('Le lien de partage n’est pas disponible pour cet enregistrement');
      return;
    }

    navigator.clipboard.writeText(share.shareUrl).then(() => {
      this.toastr.success('Lien copié dans le presse-papiers');
    }).catch(() => {
      this.toastr.error('Impossible de copier le lien');
    });
  }

  openVirusTotal(share: ShareHistory): void {
    const indicator = share.fileHash || share.shareUrl || share.fileName;
    if (!indicator) {
      this.toastr.warning('Aucun indicateur disponible pour VirusTotal');
      return;
    }

    const encoded = encodeURIComponent(indicator);
    const vtUrl = `https://www.virustotal.com/gui/search/${encoded}`;
    window.open(vtUrl, '_blank', 'noopener');
  }

  exportToCSV(): void {
    if (!this.shares.length) {
      this.toastr.warning('Aucune donnée à exporter');
      return;
    }

    const headers = [
      'Fichier',
      'Type',
      'Statut',
      'Type de partage',
      'Créé par',
      'Destinataire',
      'Téléchargements',
      'Consultations',
      'Créé le'
    ];

    const rows = this.shares.map((share) => [
      share.fileName,
      share.mimeType || '-',
      share.status,
      share.shareType,
      share.sharedBy?.email || '-',
      share.sharedWith?.email || '-',
      share.downloadCount,
      share.viewCount,
      this.formatDate(share.createdAt)
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tenant-shares-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);

    this.toastr.success('Export CSV généré');
  }

  getStatusLabel(status?: string): string {
    switch (status) {
      case 'active':
        return 'Actif';
      case 'revoked':
        return 'Révoqué';
      case 'expired':
        return 'Expiré';
      default:
        return status || 'Inconnu';
    }
  }

  getStatusTone(status?: string): 'success' | 'warning' | 'danger' | 'neutral' {
    switch (status) {
      case 'active':
        return 'success';
      case 'revoked':
        return 'danger';
      case 'expired':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  getShareTypeLabel(type?: string): string {
    switch (type) {
      case 'direct':
        return 'Partage direct';
      case 'link':
      case 'public':
        return 'Partage par lien';
      default:
        return type || 'Inconnu';
    }
  }

  getMimeLabel(mimeType?: string): string {
    if (!mimeType) return 'Non précisé';
    if (mimeType.includes('pdf')) return 'PDF';
    if (mimeType.includes('image')) return 'Image';
    if (mimeType.includes('video')) return 'Vidéo';
    if (mimeType.includes('audio')) return 'Audio';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'Tableur';
    if (mimeType.includes('document') || mimeType.includes('word')) return 'Document';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return 'Archive';
    return mimeType;
  }

  getOwnerLabel(share: ShareHistory): string {
    return share.sharedBy?.email || 'Inconnu';
  }

  getRecipientLabel(share: ShareHistory): string {
    return share.sharedWith?.email || 'Aucun destinataire';
  }

  getDaysSinceCreation(share: ShareHistory): number {
    const createdAt = new Date(share.createdAt).getTime();
    const now = Date.now();
    return Math.max(0, Math.floor((now - createdAt) / (1000 * 60 * 60 * 24)));
  }

  getEngagementRate(share: ShareHistory): number {
    const total = (share.downloadCount || 0) + (share.viewCount || 0);
    if (!total) return 0;
    return Math.round(((share.downloadCount || 0) / total) * 100);
  }

  getTotalInteractions(share: ShareHistory): number {
    return (share.downloadCount || 0) + (share.viewCount || 0);
  }

  getRecipientCount(share: ShareHistory): number {
    const list = this.getRecipientList(share);
    return list.length;
  }

  getAiSecurityScore(share: ShareHistory): number {
    let score = 92;

    if (!share.hasPassword) score -= 10;

    const normalizedType = this.normalizeShareType(share.shareType);
    if (normalizedType === 'public') score -= 12;

    if (share.accessLevel === 'edit') score -= 16;
    if (share.accessLevel === 'download') score -= 8;

    if (!share.expiresAt) {
      score -= 12;
    } else {
      const daysLeft = this.getDaysUntilExpiry(share);
      if (daysLeft <= 1) score -= 8;
      else if (daysLeft <= 3) score -= 4;
    }

    if (!share.maxDownloads || share.maxDownloads > 50) score -= 6;

    const interactions = this.getTotalInteractions(share);
    if (interactions > 300) score -= 12;
    else if (interactions > 120) score -= 8;
    else if (interactions > 40) score -= 4;

    if (share.status !== 'active') score -= 10;

    return Math.max(1, Math.min(99, score));
  }

  getAiScoreLabel(score: number): string {
    if (score >= 85) return 'Faible risque';
    if (score >= 70) return 'Risque modéré';
    if (score >= 50) return 'Risque élevé';
    return 'Risque critique';
  }

  getAiScoreTone(score: number): 'success' | 'warning' | 'danger' {
    if (score >= 85) return 'success';
    if (score >= 70) return 'warning';
    return 'danger';
  }

  getAiInsights(share: ShareHistory): string[] {
    const insights: string[] = [];
    const normalizedType = this.normalizeShareType(share.shareType);

    if (normalizedType === 'public') {
      insights.push('Lien public détecté: exposition potentielle plus large.');
    } else {
      insights.push('Partage direct: diffusion contrôlée à un destinataire ciblé.');
    }

    if (!share.expiresAt) {
      insights.push('Pas de date d’expiration: prévoir une expiration pour réduire le risque.');
    } else {
      insights.push(`Expiration prévue: ${this.getExpiryBadge(share)}.`);
    }

    if (!share.hasPassword) {
      insights.push('Protection par mot de passe absente.');
    } else {
      insights.push('Mot de passe activé sur le partage.');
    }

    const interactions = this.getTotalInteractions(share);
    insights.push(`Activité observée: ${interactions} interaction(s) au total.`);

    return insights;
  }

  getScoreRingStyle(share: ShareHistory): Record<string, string> {
    const score = this.getAiSecurityScore(share);
    return {
      '--score': `${score}`
    };
  }

  private getDaysUntilExpiry(share: ShareHistory): number {
    if (!share.expiresAt) return 999;
    const expiresAt = new Date(share.expiresAt).getTime();
    const diffMs = expiresAt - Date.now();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  getExpiryBadge(share: ShareHistory): string {
    if (!share.expiresAt) {
      return 'Sans expiration';
    }

    const expiresAt = new Date(share.expiresAt).getTime();
    const diffMs = expiresAt - Date.now();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return 'Expiré';
    }

    if (diffDays === 0) {
      return 'Expire aujourd’hui';
    }

    return `${diffDays} jour${diffDays > 1 ? 's' : ''}`;
  }

  normalizeShareType(type?: string): string {
    if (type === 'link') {
      return 'public';
    }

    return type || '';
  }

  formatDate(value?: string | Date | null): string {
    if (!value) {
      return '-';
    }

    return new Date(value).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatFileSize(bytes?: number): string {
    if (!bytes) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / Math.pow(1024, index);
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
  }

  private normalizeStats(raw: any): ShareStatsSummary {
    const total = (value: any): number => {
      if (typeof value === 'number') return value;
      if (Array.isArray(value) && value.length > 0 && typeof value[0]?.total === 'number') {
        return value[0].total;
      }
      return 0;
    };

    return {
      totalShares: total(raw?.totalShares),
      totalDownloads: total(raw?.totalDownloads),
      totalViews: total(raw?.totalViews),
      activeShares: total(raw?.activeShares),
      revokedShares: total(raw?.revokedShares)
    };
  }

  trackByShareId(_index: number, share: ShareHistory): string {
    return share.shareId || share._id || String(_index);
  }
}