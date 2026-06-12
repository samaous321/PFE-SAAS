import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TenantApiService } from '../../../core/services/tenant-api.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Tenant } from '../../../core/models/tenant.model';

@Component({
  standalone: true,
  selector: 'app-admin-tenants-management',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="tenants-management">
      <!-- PAGE HEADER -->
      <div class="page-header">
        <div class="page-title">
          <h1>Gestion des Tenants</h1>
          <p>Créer, modifier ou gérer les tenants</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" (click)="openCreateModal()" type="button">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px;">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Nouveau Tenant
          </button>
        </div>
      </div>

      <!-- SEARCH -->
      <div class="card" style="margin-bottom: 1rem;">
        <input
          type="text"
          placeholder="Rechercher un tenant..."
          [(ngModel)]="searchQuery"
          (input)="filterTenants()"
          class="form-control"
          style="width: 100%; max-width: 400px;"
        />
      </div>

      <!-- LOADING -->
      <div *ngIf="loading" class="flex flex-center p-lg">
        <div class="spinner"></div>
      </div>

      <!-- TABLE -->
      <div *ngIf="!loading" class="card">
        <div *ngIf="filteredTenants.length; else noTenants" class="table-container">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Domaine</th>
                <th>Plan</th>
                <th>Statut</th>
                <th>Créé le</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let tenant of filteredTenants">
                <td>
                  <div style="font-weight: 500;">{{ tenant.name }}</div>
                </td>
                <td>{{ tenant.domain || '—' }}</td>
                <td>{{ tenant.subscriptionPlan || 'free' }}</td>
                <td>
                  <span class="badge" [ngClass]="tenant.status === 'active' ? 'badge-success' : tenant.status === 'suspended' ? 'badge-warning' : 'badge-secondary'">
                    {{ tenant.status || 'inactive' }}
                  </span>
                </td>
                <td>{{ formatDate(tenant.createdAt || '') }}</td>
                <td>
                  <div style="display: flex; gap: 0.5rem;">
                    <button class="btn btn-sm btn-secondary" (click)="editTenant(tenant)" type="button">Modifier</button>
                    <button class="btn btn-sm btn-danger" (click)="deleteTenant(tenant)" type="button">Supprimer</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="pagination-row">
            <p class="pagination-info">
              Affichage {{ filteredTenants.length }} / {{ tenants.length }} (total: {{ totalTenants }})
            </p>
            <div class="pagination-actions">
              <button class="btn btn-sm btn-secondary" type="button" (click)="prevPage()" [disabled]="tenantPage <= 1 || loading">
                Precedent
              </button>
              <span class="page-index">Page {{ tenantPage }} / {{ totalTenantPages }}</span>
              <button class="btn btn-sm btn-secondary" type="button" (click)="nextPage()" [disabled]="tenantPage >= totalTenantPages || loading">
                Suivant
              </button>
            </div>
          </div>
        </div>
        <ng-template #noTenants>
          <div style="padding: 2rem; text-align: center; color: #9ca3af;">
            <p>Aucun tenant trouvé</p>
          </div>
        </ng-template>
      </div>

      <!-- CREATE/EDIT MODAL -->
      <div class="modal-backdrop" [class.active]="showModal">
        <div class="modal">
          <div class="modal-header">
            <h2 class="modal-title">{{ modalMode === 'create' ? 'Nouveau Tenant' : 'Modifier Tenant' }}</h2>
            <button class="modal-close" (click)="closeModal()" type="button">✕</button>
          </div>
          <form [formGroup]="tenantForm" (ngSubmit)="submitForm()" class="modal-body">
            <div class="form-group">
              <label>Nom <span class="required">*</span></label>
              <input type="text" formControlName="name" class="form-control" />
            </div>
            <div class="form-group">
              <label>Domaine</label>
              <input type="text" formControlName="domain" class="form-control" placeholder="ex: entreprise.example.com" />
            </div>
            <div class="form-group">
              <label>Plan d'abonnement</label>
              <select formControlName="subscriptionPlan" class="form-control">
                <option value="small">SMALL (10 GB)</option>
                <option value="standard">STANDARD (20 GB)</option>
                <option value="large">LARGE (30 GB)</option>
                <option value="unlimited">UNLIMITED</option>
              </select>
            </div>
            <div class="form-group">
              <label>Statut</label>
              <select formControlName="status" class="form-control">
                <option value="active">Actif</option>
                <option value="suspended">Suspendu</option>
                <option value="inactive">Inactif</option>
              </select>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="closeModal()" type="button">Annuler</button>
            <button
              class="btn btn-primary"
              (click)="submitForm()"
              [disabled]="tenantForm.invalid || isSaving"
              type="button"
            >
              {{ isSaving ? 'Enregistrement...' : 'Enregistrer' }}
            </button>
          </div>
        </div>
      </div>

      <!-- DELETE CONFIRM MODAL -->
      <div class="modal-backdrop" [class.active]="showDeleteConfirm">
        <div class="modal" style="max-width: 400px;">
          <div class="modal-header">
            <h2 class="modal-title">Confirmer la suppression</h2>
            <button class="modal-close" (click)="showDeleteConfirm = false" type="button">✕</button>
          </div>
          <div class="modal-body">
            <p>Êtes-vous sûr de vouloir supprimer ce tenant ?</p>
            <p style="color: #6b7280; font-size: 0.875rem;">{{ tenantToDelete?.name }}</p>
            <p style="color: #ef4444; font-size: 0.875rem; font-weight: 500;">Cette action est définitive.</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showDeleteConfirm = false" type="button">Annuler</button>
            <button
              class="btn btn-danger"
              (click)="confirmDelete()"
              [disabled]="isDeleting"
              type="button"
            >
              {{ isDeleting ? 'Suppression...' : 'Supprimer' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .form-control {
      display: block;
      width: 100%;
      padding: 0.5rem 1rem;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 1rem;
      font-family: inherit;

      &:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px #dbeafe;
      }

      &:disabled {
        background-color: #f3f4f6;
        color: #9ca3af;
        cursor: not-allowed;
      }
    }

    .pagination-row {
      margin-top: 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .pagination-info {
      margin: 0;
      color: #6b7280;
      font-size: 0.9rem;
    }

    .pagination-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .page-index {
      font-size: 0.9rem;
      color: #374151;
      min-width: 110px;
      text-align: center;
    }
  `]
})
export class AdminTenantsManagementComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(TenantApiService);
  private readonly analytics = inject(AnalyticsService);
  private readonly notification = inject(NotificationService);
  private readonly destroy$ = new Subject<void>();

  tenants: Tenant[] = [];
  filteredTenants: Tenant[] = [];
  loading = true;
  showModal = false;
  showDeleteConfirm = false;
  modalMode: 'create' | 'edit' = 'create';
  isSaving = false;
  isDeleting = false;
  searchQuery = '';
  tenantPage = 1;
  readonly tenantPageSize = 10;
  totalTenants = 0;
  totalTenantPages = 1;
  tenantToDelete: Tenant | null = null;
  editingTenantId: string | null = null;

  tenantForm = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    domain: [''],
    subscriptionPlan: ['small'],
    status: ['active']
  });

  ngOnInit(): void {
    this.loadTenants();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadTenants(): void {
    this.loading = true;
    this.api.getAllTenantsPaginated(this.tenantPage, this.tenantPageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.tenants = response.items.filter(t => !t.isDeleted);
          this.totalTenants = response.total;
          this.totalTenantPages = Math.max(response.totalPages || 1, 1);
          this.tenantPage = Math.min(this.tenantPage, this.totalTenantPages);
          this.filterTenants();
          this.loading = false;
        },
        error: () => {
          this.notification.error('Impossible de charger les tenants');
          this.loading = false;
        }
      });
  }

  filterTenants(): void {
    this.filteredTenants = this.tenants.filter(tenant =>
      tenant.name.toLowerCase().includes(this.searchQuery.toLowerCase())
    );
  }

  prevPage(): void {
    if (this.tenantPage <= 1 || this.loading) {
      return;
    }

    this.tenantPage -= 1;
    this.loadTenants();
  }

  nextPage(): void {
    if (this.tenantPage >= this.totalTenantPages || this.loading) {
      return;
    }

    this.tenantPage += 1;
    this.loadTenants();
  }

  openCreateModal(): void {
    this.modalMode = 'create';
    this.editingTenantId = null;
    this.tenantForm.reset({ subscriptionPlan: 'small', status: 'active' });
    this.showModal = true;
  }

  editTenant(tenant: Tenant): void {
    this.modalMode = 'edit';
    this.editingTenantId = tenant._id || null;
    this.tenantForm.patchValue({
      name: tenant.name,
      domain: tenant.domain || '',
      subscriptionPlan: tenant.subscriptionPlan || 'small',
      status: tenant.status || 'active'
    });
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.tenantForm.reset();
  }

  submitForm(): void {
    if (this.tenantForm.invalid) {
      this.notification.warning('Veuillez remplir tous les champs requis');
      return;
    }

    this.isSaving = true;
    const payload = this.tenantForm.getRawValue() as Partial<Tenant>;

    const request =
      this.modalMode === 'create'
        ? this.api.createTenant(payload)
        : this.api.updateTenant(this.editingTenantId!, payload);

    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.notification.success(
          this.modalMode === 'create' ? 'Tenant créé avec succès' : 'Tenant modifié avec succès'
        );
        this.closeModal();
        this.loadTenants();
        this.isSaving = false;
      },
      error: (err) => {
        this.notification.error(err?.error?.message || 'Une erreur est survenue');
        this.isSaving = false;
      }
    });
  }

  deleteTenant(tenant: Tenant): void {
    this.tenantToDelete = tenant;
    this.showDeleteConfirm = true;
  }

  confirmDelete(): void {
    if (!this.tenantToDelete?._id) return;

    this.isDeleting = true;
    this.api.deleteTenant(this.tenantToDelete._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notification.success('Tenant supprimé avec succès');
          this.showDeleteConfirm = false;
          this.loadTenants();
          this.isDeleting = false;
        },
        error: (err) => {
          this.notification.error(err?.error?.message || 'Impossible de supprimer le tenant');
          this.isDeleting = false;
        }
      });
  }

  formatBytes(bytes: number): string {
    return this.analytics.formatBytes(bytes);
  }

  formatDate(date: string): string {
    return this.analytics.formatDate(date);
  }
}
