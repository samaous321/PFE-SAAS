import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';

import { ShareHistoryApiService } from '../../../core/services/share-history-api.service';
import { ShareHistory, ShareHistoryFilters } from '../../../core/models/share-history.model';

@Component({
  selector: 'app-admin-share-history',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './admin-share-history.component.html',
  styleUrls: ['./admin-share-history.component.scss']
})
export class AdminShareHistoryComponent implements OnInit, OnDestroy {
  shareHistories: ShareHistory[] = [];
  selectedShare: ShareHistory | null = null;
  showDetailsModal = false;
  showRevokeModal = false;
  loading = false;

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalItems = 0;
  totalPages = 0;

  // Filtres
  filterForm: FormGroup;
  revokeForm: FormGroup;
  private destroy$ = new Subject<void>();

  // Options
  statuses = ['active', 'revoked', 'expired'];
  shareTypes = ['direct', 'link', 'public'];
  accessLevels = ['view', 'download', 'edit'];

  constructor(
    private shareHistoryApi: ShareHistoryApiService,
    private toastr: ToastrService,
    private fb: FormBuilder
  ) {
    this.filterForm = this.fb.group({
      tenantId: [''],
      userId: [''],
      recipientEmail: [''],
      status: [''],
      shareType: [''],
      startDate: [''],
      endDate: ['']
    });

    this.revokeForm = this.fb.group({
      reason: ['', { updateOn: 'blur' }]
    });
  }

  ngOnInit(): void {
    this.loadShareHistory();

    // Filtrer sur changement
    this.filterForm.valueChanges
      .pipe(
        debounceTime(500),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.currentPage = 1;
        this.loadShareHistory();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadShareHistory(page: number = 1): void {
    this.loading = true;
    const filters: ShareHistoryFilters = {
      page,
      limit: this.pageSize,
      ...this.filterForm.value
    };

    // Supprimer les filtres vides
    Object.keys(filters).forEach(key => {
      if (!filters[key as keyof ShareHistoryFilters]) {
        delete filters[key as keyof ShareHistoryFilters];
      }
    });

    this.shareHistoryApi
      .getAdminShareHistory(filters)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.shareHistories = response.data;
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

  resetFilters(): void {
    this.filterForm.reset();
    this.currentPage = 1;
    this.loadShareHistory();
  }

  viewDetails(share: ShareHistory): void {
    this.selectedShare = share;
    this.showDetailsModal = true;
  }

  closeDetailsModal(): void {
    this.showDetailsModal = false;
    this.selectedShare = null;
  }

  openRevokeModal(share: ShareHistory): void {
    this.selectedShare = share;
    this.showRevokeModal = true;
    this.revokeForm.reset();
  }

  closeRevokeModal(): void {
    this.showRevokeModal = false;
  }

  revokeShare(): void {
    if (!this.selectedShare || !this.revokeForm.valid) {
      this.toastr.error('Veuillez entrer une raison');
      return;
    }

    const reason = this.revokeForm.get('reason')?.value;

    this.shareHistoryApi
      .revokeShare(this.selectedShare.shareId, reason)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success('Partage révoqué avec succès');
          this.closeRevokeModal();
          this.closeDetailsModal();
          this.loadShareHistory(this.currentPage);
        },
        error: (error) => {
          this.toastr.error('Erreur lors de la révocation du partage');
          console.error('Error:', error);
        }
      });
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
    this.loadShareHistory(page);
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

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  exportToCSV(): void {
    if (this.shareHistories.length === 0) {
      this.toastr.warning('Aucune données à exporter');
      return;
    }

    const headers = [
      'Fichier',
      'Partagé par',
      'Email destinataire',
      'Type',
      'Accès',
      'Statut',
      'Téléchargements',
      'Consultations',
      'Date'
    ];

    const rows = this.shareHistories.map(share => [
      share.fileName,
      share.sharedBy.email || '-',
      share.sharedWith.email || '-',
      share.shareType,
      share.accessLevel,
      share.status,
      share.downloadCount,
      share.viewCount,
      new Date(share.createdAt).toLocaleDateString('fr-FR')
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `share-history-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);

    this.toastr.success('Export réussi');
  }
}
