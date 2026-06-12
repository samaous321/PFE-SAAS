import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Complaint, ComplaintFilters } from '../../../core/models/complaint.model';
import { User } from '../../../core/models/user.model';
import { ComplaintApiService } from '../../../core/services/complaint-api.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Tenant, TenantApiService } from '../../../core/services/tenant-api.service';
import { UserApiService } from '../../../core/services/user-api.service';

@Component({
  standalone: true,
  selector: 'app-admin-complaints',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="complaints-page">
      <header class="page-header">
        <div class="header-copy">
          <p class="eyebrow">Super Admin · Réclamations</p>
          <h1>Centre de tickets priorisés</h1>
          <p>Vue claire et premium pour suivre les nouveaux tickets, filtrer par statut, tenant ou utilisateur, puis ouvrir chaque demande dans sa page dédiée.</p>
        </div>
        <div class="header-actions">
          <button type="button" class="ghost" (click)="refreshAll()"><span class="action-icon">↻</span>Actualiser</button>
          <button type="button" class="ghost primary" (click)="exportCsv()"><span class="action-icon">↓</span>Export CSV</button>
        </div>
      </header>

      <section class="stats-grid">
        <article class="stat-card total">
          <span>Total tickets</span>
          <strong>{{ stats.total }}</strong>
          <small>Réclamations visibles selon les filtres actifs</small>
        </article>
        <article class="stat-card warning">
          <span>À traiter</span>
          <strong>{{ stats.openOverdue }}</strong>
          <small>Tickets ouverts hors SLA</small>
        </article>
        <article class="stat-card success">
          <span>Ouvertes</span>
          <strong>{{ byStatus('open') }}</strong>
          <small>Réclamations les plus récentes</small>
        </article>
        <article class="stat-card muted">
          <span>Résolues</span>
          <strong>{{ byStatus('resolved') }}</strong>
          <small>Tickets clôturés avec suivi</small>
        </article>
      </section>

      <section class="panel filters-panel">
        <div class="filters-head">
          <div>
            <p class="section-kicker">Filtres avancés</p>
            <h2>Recherche et tri rapide</h2>
          </div>
          <div class="filters-summary">
            <span>{{ pagination.total }} résultats</span>
            <span *ngIf="filters.tenantId">Tenant ciblé</span>
            <span *ngIf="filters.requesterUserId">Utilisateur ciblé</span>
          </div>
        </div>
        <div class="filters-grid">
          <label>
            Recherche
            <input type="text" [(ngModel)]="filters.search" name="search" placeholder="ticket, sujet, email" (ngModelChange)="onSearchChanged()" />
          </label>
          <label>
            Statut
            <select [(ngModel)]="filters.status" name="status" (change)="applyFilters()">
              <option value="">Tous</option>
              <option value="open">Ouverte</option>
              <option value="in_progress">En cours</option>
              <option value="pending_user">En attente user</option>
              <option value="resolved">Résolue</option>
              <option value="closed">Fermée</option>
              <option value="rejected">Rejetée</option>
            </select>
          </label>
          <label>
            Tenant
            <select [(ngModel)]="filters.tenantId" name="tenantId" (change)="onTenantSelected()">
              <option value="">Tous les tenants</option>
              <option *ngFor="let tenant of tenants" [value]="tenant._id">{{ tenant.name }}</option>
            </select>
          </label>
          <label>
            Utilisateur
            <select [(ngModel)]="filters.requesterUserId" name="requesterUserId" [disabled]="!filters.tenantId" (change)="applyFilters()">
              <option value="">Tous les utilisateurs</option>
              <option *ngFor="let user of tenantUsers" [value]="user._id">{{ user.firstName }} {{ user.lastName }} · {{ user.email }}</option>
            </select>
          </label>
          <label>
            Date début
            <input type="date" [(ngModel)]="filters.startDate" name="startDate" (change)="applyFilters()" />
          </label>
          <label>
            Date fin
            <input type="date" [(ngModel)]="filters.endDate" name="endDate" (change)="applyFilters()" />
          </label>
          <label class="sort-label">
            <span class="sort-row">
              Trier
              <button type="button" class="sort-icon" (click)="toggleSortDirection()" [attr.aria-label]="sortDirection === 'desc' ? 'Trier du plus récent au plus ancien' : 'Trier du plus ancien au plus récent'">{{ sortDirection === 'desc' ? '↓' : '↑' }}</button>
            </span>
            <select [(ngModel)]="filters.sortBy" name="sortBy" (change)="applyFilters()">
              <option value="-createdAt">Plus récentes</option>
              <option value="createdAt">Plus anciennes</option>
              <option value="-lastActivityAt">Dernière activité</option>
              <option value="priority">Priorité</option>
            </select>
          </label>
        </div>
        <div class="filters-actions">
          <button type="button" class="ghost primary" (click)="applyFilters()">Appliquer</button>
          <button type="button" class="ghost" (click)="resetFilters()">Réinitialiser</button>
        </div>
      </section>

      <section class="panel list-panel">
        <div class="panel-head compact">
          <div>
            <h2>Réclamations récentes</h2>
            <p>Liste courte, lisible et triée du plus récent au plus ancien pour faire ressortir immédiatement les nouvelles demandes.</p>
          </div>
          <div class="panel-meta">
            <span>{{ pagination.total }} tickets</span>
            <span>Page {{ pagination.page }} / {{ pagination.pages }}</span>
            <span *ngIf="lastSyncedAt">Synchro {{ formatDate(lastSyncedAt.toISOString()) }}</span>
          </div>
        </div>

        <div *ngIf="loading" class="empty-state">Chargement...</div>

        <div *ngIf="!loading && complaints.length" class="complaint-list">
          <article *ngFor="let complaint of complaints" class="complaint-card">
            <div class="complaint-hero">
              <div>
                <div class="ticket-line">
                  <strong>{{ complaint.ticketId }}</strong>
                  <span class="status" [ngClass]="complaint.status">{{ labelStatus(complaint.status) }}</span>
                  <span *ngIf="isFreshComplaint(complaint)" class="status fresh">Nouveau</span>
                </div>
                <h3>{{ complaint.subject }}</h3>
                <div class="complaint-badges">
                  <span class="mini-badge accent">{{ labelCategory(complaint.category) }}</span>
                  <span class="mini-badge neutral">Assigné: {{ labelAssignedTo(complaint.assignedTo) }}</span>
                </div>
              </div>
              <div class="complaint-dates">
                <span>Créée {{ formatDate(complaint.createdAt) }}</span>
                <span *ngIf="complaint.lastActivityAt">Activité {{ formatDate(complaint.lastActivityAt) }}</span>
                <span *ngIf="complaint.sla?.resolutionDueAt">SLA fin {{ formatDate(complaint.sla?.resolutionDueAt) }}</span>
              </div>
            </div>

            <div class="complaint-meta-grid">
              <div><span>Demandeur</span><strong>{{ complaint.requester.fullName }}</strong></div>
              <div><span>Email</span><strong>{{ complaint.requester.email }}</strong></div>
              <div><span>Tenant</span><strong>{{ getTenantName(complaint.requester.tenantId) }}</strong></div>
              <div><span>Priorité</span><strong>{{ labelPriority(complaint.priority) }}</strong></div>
              <div><span>Catégorie</span><strong>{{ labelCategory(complaint.category) }}</strong></div>
              <div><span>Assigné</span><strong>{{ labelAssignedTo(complaint.assignedTo) }}</strong></div>
              <div><span>Messages</span><strong>{{ complaint.counters?.adminMessages || 0 }} admin · {{ complaint.counters?.userMessages || 0 }} user</strong></div>
              <div><span>Dernière activité</span><strong>{{ complaint.lastActivityAt ? formatDate(complaint.lastActivityAt) : 'Aucune' }}</strong></div>
            </div>

            <div class="complaint-actions">
              <button type="button" class="ghost small primary" (click)="openTicketPage(complaint)">Voir le détail</button>
            </div>
          </article>
        </div>

        <div *ngIf="!loading && !complaints.length" class="empty-state">
          Aucune réclamation trouvée.
        </div>

        <div class="pagination-bar" *ngIf="!loading && pagination.pages > 1">
          <div class="pagination-info">Affichage {{ complaints.length }} sur {{ pagination.total }} résultats</div>
          <div class="pagination-actions">
            <button type="button" class="ghost small" (click)="goToPage(pagination.page - 1)" [disabled]="!pagination.hasPrev || loading">Précédent</button>
            <span class="page-indicator">{{ pagination.page }} / {{ pagination.pages }}</span>
            <button type="button" class="ghost small" (click)="goToPage(pagination.page + 1)" [disabled]="!pagination.hasNext || loading">Suivant</button>
          </div>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .complaints-page {
      padding: 1.5rem;
      display: grid;
      gap: 1rem;
      background:
        radial-gradient(circle at top left, rgba(37, 99, 235, 0.08), transparent 28%),
        radial-gradient(circle at top right, rgba(14, 165, 233, 0.08), transparent 26%),
        linear-gradient(180deg, #f7fbff 0%, #eef4fb 100%);
      min-height: 100%;
    }

    .page-header,
    .panel,
    .stat-card {
      border: 1px solid #dbe7f3;
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(10px);
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.07);
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: flex-start;
      padding: 1.25rem 1.5rem;
      border-radius: 1.5rem;
    }

    .header-copy { max-width: 760px; }
    .eyebrow {
      margin: 0;
      color: #0f766e;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-size: 0.76rem;
    }
    h1, h2, h3, p { margin: 0; }
    .page-header h1 { font-size: 2rem; color: #0f172a; margin-top: 0.35rem; }
    .page-header p { margin-top: 0.3rem; color: #475569; max-width: 760px; }

    .header-actions,
    .filters-actions,
    .pagination-actions,
    .ticket-line,
    .sort-row,
    .panel-meta,
    .complaint-actions { display: flex; gap: 0.65rem; align-items: center; }
    .header-actions { flex-wrap: wrap; justify-content: flex-end; }

    .ghost,
    button { border: none; border-radius: 0.95rem; cursor: pointer; }
    .ghost {
      background: #eef4ff;
      color: #2446c9;
      padding: 0.78rem 1rem;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 0.55rem;
    }
    .ghost.primary { background: linear-gradient(135deg, #0f766e 0%, #2563eb 100%); color: #fff; }
    .ghost.small { padding: 0.6rem 0.85rem; font-size: 0.88rem; }
    .action-icon { font-size: 0.95rem; line-height: 1; }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.9rem;
    }

    .stat-card {
      border-radius: 1.25rem;
      padding: 1rem 1.1rem;
      display: grid;
      gap: 0.35rem;
      position: relative;
      overflow: hidden;
    }
    .stat-card::after {
      content: '';
      position: absolute;
      inset: auto -30px -40px auto;
      width: 120px;
      height: 120px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.2);
    }
    .stat-card span { color: #64748b; font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
    .stat-card strong { font-size: 1.9rem; color: #0f172a; }
    .stat-card small { font-size: 0.84rem; color: #5b6475; }
    .stat-card.total { background: linear-gradient(135deg, #ffffff 0%, #f4f8ff 100%); }
    .stat-card.warning { background: linear-gradient(135deg, #fffdf6 0%, #fff3cf 100%); }
    .stat-card.success { background: linear-gradient(135deg, #f7fffb 0%, #ddfce7 100%); }
    .stat-card.muted { background: linear-gradient(135deg, #ffffff 0%, #eef2f7 100%); }

    .panel { border-radius: 1.5rem; padding: 1.25rem; }
    .filters-head {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: center;
      margin-bottom: 1rem;
    }
    .section-kicker {
      margin: 0;
      color: #0f766e;
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .filters-head h2 { margin-top: 0.2rem; font-size: 1.15rem; color: #0f172a; }
    .filters-summary { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: flex-end; }
    .filters-summary span {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 0.45rem 0.7rem;
      background: #edf4ff;
      color: #2446c9;
      font-size: 0.8rem;
      font-weight: 700;
    }
    .filters-grid { display: grid; grid-template-columns: 1.5fr repeat(6, minmax(0, 1fr)); gap: 0.9rem; }
    .sort-label { align-self: stretch; }
    .sort-row { justify-content: space-between; width: 100%; }
    .sort-icon {
      width: 2rem;
      height: 2rem;
      border-radius: 999px;
      background: #ecf2ff;
      color: #2446c9;
      font-weight: 900;
    }
    label { display: grid; gap: 0.45rem; color: #334155; font-weight: 700; font-size: 0.92rem; }
    input, select, textarea {
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 0.95rem;
      padding: 0.82rem 0.95rem;
      font: inherit;
      background: #fff;
      color: #0f172a;
    }
    .filters-actions { margin-top: 1rem; justify-content: flex-end; }

    .panel-head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
    .panel-head h2 { font-size: 1.15rem; color: #0f172a; }
    .panel-head p { margin-top: 0.25rem; max-width: 760px; color: #5b6475; }
    .panel-meta { flex-wrap: wrap; justify-content: flex-end; color: #64748b; font-size: 0.9rem; }

    .complaint-list { display: grid; gap: 0.9rem; margin-top: 1rem; }
    .complaint-card {
      width: 100%;
      text-align: left;
      padding: 1.15rem 1.15rem 1.05rem;
      background:
        linear-gradient(180deg, #ffffff 0%, #f8fbff 100%),
        radial-gradient(circle at top right, rgba(37, 99, 235, 0.08), transparent 25%);
      border: 1px solid #dbe7f3;
      border-radius: 1.35rem;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
      display: grid;
      gap: 1rem;
      transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
    }
    .complaint-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 16px 34px rgba(15, 23, 42, 0.08);
      border-color: #bfd4ff;
    }
    .complaint-hero {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: flex-start;
    }
    .ticket-line { flex-wrap: wrap; }
    .complaint-card h3 { margin-top: 0.35rem; color: #0f172a; font-size: 1rem; line-height: 1.35; }
    .complaint-dates { display: grid; gap: 0.25rem; text-align: right; font-size: 0.85rem; color: #5b6475; white-space: nowrap; }
    .complaint-badges { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.65rem; }
    .mini-badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 0.35rem 0.65rem;
      font-size: 0.74rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .mini-badge.accent { background: #e8f1ff; color: #2446c9; }
    .mini-badge.neutral { background: #eef2f7; color: #475569; }
    .status.fresh { background: #dcfce7; color: #15803d; }
    .complaint-meta-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.75rem; padding: 0.25rem 0 0.1rem; }
    .complaint-meta-grid span { display: block; font-size: 0.76rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 800; margin-bottom: 0.25rem; }
    .complaint-meta-grid strong { color: #0f172a; font-size: 0.92rem; word-break: break-word; }
    .complaint-actions { justify-content: flex-end; flex-wrap: wrap; padding-top: 0.2rem; }

    .status {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      font-size: 0.74rem;
      font-weight: 800;
      padding: 0.38rem 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .status.open { background: #dbeafe; color: #1d4ed8; }
    .status.in_progress { background: #fef3c7; color: #b45309; }
    .status.pending_user { background: #ede9fe; color: #6d28d9; }
    .status.resolved { background: #dcfce7; color: #15803d; }
    .status.closed { background: #e2e8f0; color: #475569; }
    .status.rejected { background: #fee2e2; color: #b91c1c; }

    .pagination-bar {
      margin-top: 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
    }
    .pagination-info { font-size: 0.9rem; color: #5b6475; }
    .page-indicator { min-width: 110px; text-align: center; color: #334155; font-weight: 700; }
    .empty-state { padding: 1.2rem 0.75rem; color: #64748b; text-align: center; }

    @media (max-width: 1200px) {
      .stats-grid,
      .filters-grid,
      .complaint-meta-grid { grid-template-columns: 1fr 1fr; }
      .page-header,
      .panel-head,
      .complaint-hero,
      .pagination-bar { flex-direction: column; align-items: stretch; }
      .panel-meta,
      .complaint-dates,
      .complaint-actions { justify-content: flex-start; text-align: left; }
      .filters-head { flex-direction: column; align-items: flex-start; }
      .filters-summary { justify-content: flex-start; }
      .filters-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    @media (max-width: 720px) {
      .complaints-page { padding: 1rem; }
      .stats-grid,
      .filters-grid,
      .complaint-meta-grid { grid-template-columns: 1fr; }
      .page-header h1 { font-size: 1.6rem; }
      .panel { padding: 1rem; }
    }
  `]
})
export class AdminComplaintsComponent implements OnInit, OnDestroy {
  private readonly api = inject(ComplaintApiService);
  private readonly tenantApi = inject(TenantApiService);
  private readonly userApi = inject(UserApiService);
  private readonly notification = inject(NotificationService);
  private readonly router = inject(Router);

  loading = false;
  complaints: Complaint[] = [];
  tenants: Tenant[] = [];
  tenantUsers: User[] = [];
  filters: ComplaintFilters = {
    page: 1,
    limit: 10,
    sortBy: '-createdAt'
  };
  sortDirection: 'desc' | 'asc' = 'desc';
  pagination = {
    total: 0,
    page: 1,
    limit: 10,
    pages: 1,
    hasNext: false,
    hasPrev: false
  };
  stats = {
    total: 0,
    openOverdue: 0,
    byStatus: [] as Array<{ _id: string; count: number }>,
    byPriority: [] as Array<{ _id: string; count: number }>
  };
  lastSyncedAt: Date | null = null;
  private refreshTimerId: number | null = null;

  ngOnInit(): void {
    this.loadTenants();
    this.refreshAll();
    this.refreshTimerId = window.setInterval(() => this.loadComplaints(true), 30000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimerId !== null) {
      window.clearInterval(this.refreshTimerId);
    }
  }

  refreshAll(): void {
    this.loadStats();
    this.loadComplaints();
  }

  loadTenants(): void {
    this.tenantApi.getAllTenants().subscribe({
      next: (tenants) => (this.tenants = tenants),
      error: () => this.notification.error('Erreur de chargement des tenants')
    });
  }

  loadTenantUsers(tenantId: string): void {
    if (!tenantId) {
      this.tenantUsers = [];
      return;
    }

    this.userApi.getUsersByTenant(tenantId).subscribe({
      next: (users) => (this.tenantUsers = users),
      error: () => {
        this.tenantUsers = [];
        this.notification.error('Erreur de chargement des utilisateurs du tenant');
      }
    });
  }

  onTenantSelected(): void {
    this.filters.requesterUserId = '';
    this.filters.page = 1;
    this.loadTenantUsers(this.filters.tenantId || '');
    this.applyFilters();
  }

  onSearchChanged(): void {
    this.filters.page = 1;
    this.applyFilters();
  }

  applyFilters(): void {
    this.filters.page = 1;
    this.loadStats();
    this.loadComplaints();
  }

  toggleSortDirection(): void {
    this.sortDirection = this.sortDirection === 'desc' ? 'asc' : 'desc';
    this.filters.sortBy = this.sortDirection === 'desc' ? '-createdAt' : 'createdAt';
    this.applyFilters();
  }

  loadStats(): void {
    this.api.getComplaintStats(this.buildStatsFilters()).subscribe({
      next: (response) => (this.stats = response.data),
      error: () => this.notification.error('Erreur de chargement des statistiques')
    });
  }

  loadComplaints(silent = false): void {
    this.loading = !silent;
    this.api.getAdminComplaints(this.buildListFilters()).subscribe({
      next: (response) => {
        this.complaints = response.data || [];
        this.pagination = response.pagination || {
          total: this.complaints.length,
          page: this.filters.page || 1,
          limit: this.filters.limit || 10,
          pages: 1,
          hasNext: false,
          hasPrev: false
        };
        this.lastSyncedAt = new Date();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.notification.error('Erreur de chargement des réclamations');
      }
    });
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.pagination.pages || this.loading) {
      return;
    }

    this.filters.page = page;
    this.loadComplaints();
  }

  resetFilters(): void {
    this.filters = {
      page: 1,
      limit: 10,
      sortBy: '-createdAt'
    };
    this.sortDirection = 'desc';
    this.tenantUsers = [];
    this.refreshAll();
  }

  openTicketPage(complaint: Complaint): void {
    this.router.navigate(['/admin/complaints', complaint.ticketId]);
  }

  isFreshComplaint(complaint: Complaint): boolean {
    const createdAt = new Date(complaint.createdAt).getTime();
    return Date.now() - createdAt < 24 * 60 * 60 * 1000;
  }

  labelCategory(category: string): string {
    const labels: Record<string, string> = {
      technical: 'Technique',
      billing: 'Facturation',
      access: 'Accès',
      security: 'Sécurité',
      other: 'Autre'
    };
    return labels[category] || category;
  }

  labelAssignedTo(assignedTo?: Complaint['assignedTo']): string {
    if (!assignedTo) return 'Non assigné';
    const name = [assignedTo.firstName, assignedTo.lastName].filter(Boolean).join(' ').trim();
    return name || assignedTo.email || 'Assigné';
  }

  exportCsv(): void {
    this.api.exportComplaintsCsv(this.buildListFilters()).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `complaints-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        window.URL.revokeObjectURL(url);
        this.notification.success('Export CSV généré');
      },
      error: () => this.notification.error('Export impossible')
    });
  }

  byStatus(status: string): number {
    return this.stats.byStatus.find((item) => item._id === status)?.count || 0;
  }

  labelStatus(status: string): string {
    const labels: Record<string, string> = {
      open: 'Ouverte',
      in_progress: 'En cours',
      pending_user: 'En attente user',
      resolved: 'Résolue',
      closed: 'Fermée',
      rejected: 'Rejetée'
    };
    return labels[status] || status;
  }

  labelPriority(priority: string): string {
    const labels: Record<string, string> = {
      low: 'Basse',
      medium: 'Moyenne',
      high: 'Haute',
      urgent: 'Urgente'
    };
    return labels[priority] || priority;
  }

  formatDate(value?: string): string {
    if (!value) return '-';
    return new Date(value).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getTenantName(tenantId?: string): string {
    if (!tenantId) return 'Global';
    return this.tenants.find((tenant) => tenant._id === tenantId)?.name || tenantId;
  }

  private buildListFilters(): ComplaintFilters {
    return {
      ...this.filters,
      tenantId: this.filters.tenantId || undefined,
      requesterUserId: this.filters.requesterUserId || undefined,
      search: this.filters.search?.trim() || undefined,
      status: this.filters.status || undefined,
      startDate: this.filters.startDate || undefined,
      endDate: this.filters.endDate || undefined,
      sortBy: this.filters.sortBy || '-createdAt'
    };
  }

  private buildStatsFilters(): ComplaintFilters {
    return {
      tenantId: this.filters.tenantId || undefined,
      requesterUserId: this.filters.requesterUserId || undefined,
      status: this.filters.status || undefined,
      startDate: this.filters.startDate || undefined,
      endDate: this.filters.endDate || undefined
    };
  }
}
