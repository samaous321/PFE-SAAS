import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AdminApiService } from '../../../core/services/admin-api.service';
import { FileApiService } from '../../../core/services/file-api.service';
import { UserApiService } from '../../../core/services/user-api.service';
import { MalwareAlert, FileOwner } from '../../../core/models/file.model';
import { Tenant } from '../../../core/models/tenant.model';
import { User } from '../../../core/models/user.model';
import { AlertInvestigationModalComponent } from './alert-investigation-modal.component';

@Component({
  standalone: true,
  selector: 'app-admin-alerts-page',
  imports: [CommonModule, FormsModule, AlertInvestigationModalComponent],
  templateUrl: './admin-alerts-page.component.html',
  styleUrls: ['./admin-alerts-page.component.scss']
})
export class AdminAlertsPageComponent implements OnInit, OnDestroy {
  private readonly adminApi = inject(AdminApiService);
  private readonly fileApi = inject(FileApiService);
  private readonly userApi = inject(UserApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy$ = new Subject<void>();

  tenants: Tenant[] = [];
  tenantUsers: User[] = [];
  alerts: MalwareAlert[] = [];

  selectedTenant = '';
  selectedOwner = '';
  startDate = '';
  endDate = '';
  sortBy: 'newest' | 'severity' = 'severity';

  page = 1;
  pageSize = 10;
  totalAlerts = 0;

  loading = false;
  tenantUsersLoading = false;
  actionLoadingId = '';
  errorMessage = '';
  detailsOpen = false;
  selectedAlert: MalwareAlert | null = null;
  focusAlertId = '';

  ngOnInit(): void {
    this.focusAlertId = String(this.route.snapshot.queryParamMap.get('fileId') || '');
    this.loadTenants();
    this.loadTenantUsers();
    this.loadAlerts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTenants(): void {
    this.adminApi.getTenantsList()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (tenants) => {
          this.tenants = tenants || [];
        },
        error: () => {
          this.tenants = [];
        }
      });
  }

  loadTenantUsers(): void {
    if (!this.selectedTenant) {
      this.tenantUsers = [];
      this.tenantUsersLoading = false;
      return;
    }

    this.tenantUsersLoading = true;
    this.userApi.getUsersByTenant(this.selectedTenant)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (users) => {
          this.tenantUsers = users || [];
          this.tenantUsersLoading = false;
        },
        error: () => {
          this.tenantUsers = [];
          this.tenantUsersLoading = false;
        }
      });
  }

  refresh(): void {
    this.page = 1;
    this.loadAlerts();
  }

  onTenantChange(): void {
    this.selectedOwner = '';
    this.page = 1;
    this.loadTenantUsers();
    this.loadAlerts();
  }

  onFilterChange(): void {
    this.page = 1;
    this.loadAlerts();
  }

  onPageChange(nextPage: number): void {
    if (nextPage < 1 || nextPage > this.totalPages) {
      return;
    }

    this.page = nextPage;
    this.loadAlerts();
  }

  clearFilters(): void {
    this.selectedTenant = '';
    this.selectedOwner = '';
    this.startDate = '';
    this.endDate = '';
    this.sortBy = 'severity';
    this.page = 1;
    this.loadTenantUsers();
    this.loadAlerts();
  }

  loadAlerts(): void {
    this.loading = true;
    this.errorMessage = '';

    this.adminApi.getMalwareAlerts({
      tenantId: this.selectedTenant || undefined,
      ownerId: this.selectedOwner || undefined,
      startDate: this.startDate || undefined,
      endDate: this.endDate || undefined,
      sortBy: this.sortBy,
      page: this.page,
      limit: this.pageSize
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.alerts = response?.data || [];
          this.totalAlerts = response?.total || 0;
          this.loading = false;

          if (this.focusAlertId) {
            const focused = this.alerts.find((item) => item._id === this.focusAlertId);
            if (focused) {
              this.openDetails(focused);
              this.focusAlertId = '';
            }
          }

          if (this.selectedAlert && !this.alerts.some((item) => item._id === this.selectedAlert?._id)) {
            this.selectedAlert = this.alerts[0] || null;
          }
        },
        error: (err) => {
          this.errorMessage = err?.error?.error || 'Impossible de charger les alertes.';
          this.alerts = [];
          this.totalAlerts = 0;
          this.selectedAlert = null;
          this.detailsOpen = false;
          this.loading = false;
        }
      });
  }

  openDetails(alert: MalwareAlert): void {
    this.selectedAlert = alert;
    this.detailsOpen = true;
  }

  closeDetails(): void {
    this.detailsOpen = false;
  }

  openVirusTotal(alert: MalwareAlert): void {
    const hash = alert?.contentHash;
    if (!hash) {
      return;
    }

    window.open(`https://www.virustotal.com/gui/file/${hash}`, '_blank', 'noopener');
  }

  downloadAlert(alert: MalwareAlert): void {
    if (!alert?._id || this.isActionRunning(alert)) {
      return;
    }

    this.actionLoadingId = alert._id;
    this.fileApi.download(alert._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          this.saveBlob(blob, alert.originalName || 'file');
          this.actionLoadingId = '';
        },
        error: (err) => {
          this.errorMessage = err?.error?.error || 'Le téléchargement de ce fichier a échoué.';
          this.actionLoadingId = '';
        }
      });
  }

  manageQuarantine(alert: MalwareAlert, action: 'whitelist' | 'block' | 'investigate'): void {
    if (!alert?._id || this.isActionRunning(alert)) {
      return;
    }

    const payload = action === 'investigate'
      ? { action, notes: 'Marqué depuis la page super admin' }
      : {
          action,
          reason: action === 'whitelist' ? 'Approuvé après investigation' : 'Blocage confirmé par le super admin',
          notes: action === 'whitelist' ? 'Fichier autorisé après revue manuelle' : 'Fichier bloqué après revue manuelle'
        };

    this.actionLoadingId = alert._id;
    this.adminApi.manageQuarantinedFile(alert._id, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.actionLoadingId = '';
          this.loadAlerts();
        },
        error: (err) => {
          this.errorMessage = err?.error?.error || 'Impossible de mettre à jour la quarantaine.';
          this.actionLoadingId = '';
        }
      });
  }

  deleteAlert(alert: MalwareAlert): void {
    if (!alert?._id || this.isActionRunning(alert)) {
      return;
    }

    const confirmed = window.confirm(`Supprimer définitivement ${alert.originalName} ?`);
    if (!confirmed) {
      return;
    }

    this.actionLoadingId = alert._id;
    this.fileApi.delete(alert._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.actionLoadingId = '';
          this.detailsOpen = false;
          this.selectedAlert = null;
          this.loadAlerts();
        },
        error: (err) => {
          this.errorMessage = err?.error?.error || 'Impossible de supprimer le fichier.';
          this.actionLoadingId = '';
        }
      });
  }

  isActionRunning(alert: MalwareAlert): boolean {
    return Boolean(this.actionLoadingId && this.actionLoadingId === alert?._id);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalAlerts / this.pageSize));
  }

  get pageStart(): number {
    return this.totalAlerts === 0 ? 0 : (this.page - 1) * this.pageSize + 1;
  }

  get pageEnd(): number {
    return Math.min(this.page * this.pageSize, this.totalAlerts);
  }

  get currentAlertCountLabel(): string {
    return `${this.totalAlerts} alerte(s) filtrée(s)`;
  }

  get filteredTenantUsers(): User[] {
    return this.tenantUsers;
  }

  get topSeverityCount(): number {
    return this.alerts.filter((alert) => this.getSeverityScore(alert) >= 80).length;
  }

  get highSeverityCount(): number {
    return this.alerts.filter((alert) => this.getSeverityScore(alert) >= 60 && this.getSeverityScore(alert) < 80).length;
  }

  get mediumSeverityCount(): number {
    return this.alerts.filter((alert) => this.getSeverityScore(alert) >= 40 && this.getSeverityScore(alert) < 60).length;
  }

  get lowSeverityCount(): number {
    return this.alerts.filter((alert) => this.getSeverityScore(alert) < 40).length;
  }

  getSeverityScore(alert: MalwareAlert): number {
    let score = 0;
    const quarantineStatus = String(alert?.scanMetadata?.quarantineStatus || '').toLowerCase();

    if (alert?.status === 'blocked') score += 45;
    if (quarantineStatus === 'quarantined') score += 25;
    if (alert?.scanMetadata?.clamavResult?.isInfected) score += 20;
    if (alert?.scanMetadata?.virustotalResult?.isInfected) score += 15;

    return Math.min(score, 100);
  }

  getSeverityTone(alert: MalwareAlert): 'critical' | 'high' | 'medium' | 'low' {
    const score = this.getSeverityScore(alert);
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  getAlertBadge(alert: MalwareAlert): string {
    if (String(alert?.scanMetadata?.quarantineStatus || '').toLowerCase() === 'quarantined') {
      return 'Quarantaine';
    }
    if (alert?.status === 'blocked') {
      return 'Bloqué';
    }
    if (alert?.scanMetadata?.clamavResult?.isInfected && alert?.scanMetadata?.virustotalResult?.isInfected) {
      return 'Critique';
    }
    if (alert?.scanMetadata?.clamavResult?.isInfected) {
      return 'ClamAV';
    }
    if (alert?.scanMetadata?.virustotalResult?.isInfected) {
      return 'VirusTotal';
    }
    return 'À vérifier';
  }

  getAlertStatusClass(alert: MalwareAlert): string {
    if (String(alert?.scanMetadata?.quarantineStatus || '').toLowerCase() === 'quarantined' || alert?.status === 'blocked') {
      return 'danger';
    }
    if (alert?.scanMetadata?.clamavResult?.isInfected || alert?.scanMetadata?.virustotalResult?.isInfected) {
      return 'warning';
    }
    return 'success';
  }

  getAlertThreatText(alert: MalwareAlert): string {
    const parts: string[] = [];

    if (alert?.scanMetadata?.clamavResult?.isInfected) parts.push('ClamAV');
    if (alert?.scanMetadata?.virustotalResult?.isInfected) parts.push('VirusTotal');
    if (String(alert?.scanMetadata?.quarantineStatus || '').toLowerCase() === 'quarantined') parts.push('Quarantaine');
    if (alert?.status === 'blocked') parts.push('Bloqué');

    return parts.length ? parts.join(' · ') : 'Alerte de sécurité';
  }

  getOwnerName(alert: MalwareAlert): string {
    const owner = alert.ownerId;

    if (!owner) {
      return 'Utilisateur inconnu';
    }

    if (typeof owner === 'string') {
      return owner;
    }

    return [owner.firstName, owner.lastName].filter(Boolean).join(' ') || owner.email || owner._id || 'Utilisateur inconnu';
  }

  getUserDisplayName(user: User): string {
    return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || user._id || 'Utilisateur inconnu';
  }

  getTenantName(alert: MalwareAlert): string {
    const tenant = this.tenants.find((item) => item._id === alert.tenantId);
    return tenant?.name || alert.tenantId || 'Tenant inconnu';
  }

  getRecipientCount(alert: MalwareAlert): string {
    const recipients = (alert.sharedWith || []) as Array<string | FileOwner>;
    if (!recipients.length) {
      return 'Aucun destinataire';
    }

    return `${recipients.length} destinataire(s)`;
  }

  formatBytes(bytes: number | undefined): string {
    const size = Number(bytes || 0);
    if (size <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
    const value = size / Math.pow(1024, exponent);
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`;
  }

  formatDate(value?: string): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  trackByAlertId(index: number, alert: MalwareAlert): string {
    return alert._id || String(index);
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  }
}
