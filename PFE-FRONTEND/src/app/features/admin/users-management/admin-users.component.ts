import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { UserApiService } from '../../../core/services/user-api.service';
import { TenantApiService } from '../../../core/services/tenant-api.service';
import { NotificationService } from '../../../core/services/notification.service';
import { User } from '../../../core/models/user.model';
import { Tenant } from '../../../core/models/tenant.model';
import { AuthStorageService } from '../../../core/services/auth-storage.service';

@Component({
  standalone: true,
  selector: 'app-admin-users-management',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="users-management">
      <!-- PAGE HEADER -->
      <div class="page-header">
        <div class="page-title">
          <h1>Gestion des Utilisateurs</h1>
          <p>Créer, modifier ou supprimer des utilisateurs</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" (click)="openCreateModal()" type="button">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px;">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Nouvel Utilisateur
          </button>
        </div>
      </div>

      <!-- SEARCH & FILTER -->
      <div class="card" style="margin-bottom: 1rem;">
        <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
          <input
            type="text"
            placeholder="Rechercher par email ou nom..."
            [(ngModel)]="searchQuery"
            (input)="onSearch()"
            class="form-control"
            style="flex: 1; min-width: 200px;"
          />
          <select [(ngModel)]="filterRole" (change)="filterUsers()" style="padding: 0.5rem 1rem; border-radius: 0.5rem; border: 1px solid #e5e7eb; cursor: pointer;">
            <option value="">Tous les rôles</option>
            <option *ngIf="isSuperAdmin" value="superadmin">Super Admin</option>
            <option value="tenant_admin">Tenant Admin</option>
            <option value="user">Utilisateur</option>
          </select>
        </div>
      </div>

      <!-- LOADING -->
      <div *ngIf="loading" class="flex flex-center p-lg">
        <div class="spinner"></div>
      </div>

      <!-- TABLE -->
      <div *ngIf="!loading" class="card">
        <div *ngIf="filteredUsers.length; else noUsers" class="table-container">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Email</th>
                <th>Tenant</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let user of filteredUsers">
                <td>{{ user.firstName }} {{ user.lastName }}</td>
                <td>{{ user.email }}</td>
                <td>{{ getTenantName(user.tenantId) }}</td>
                <td>
                  <span class="badge" [ngClass]="isAdminRole(user.role || 'user') ? 'badge-primary' : 'badge-secondary'">
                    {{ user.role || 'user' }}
                  </span>
                </td>
                <td>
                  <span class="badge" [ngClass]="user.verified ? 'badge-success' : 'badge-warning'">
                    {{ user.verified ? 'Vérifié' : 'Non vérifié' }}
                  </span>
                </td>
                <td>
                  <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <button class="btn btn-sm btn-info" (click)="viewUser(user)" type="button">Voir</button>
                    <button class="btn btn-sm btn-secondary" (click)="editUser(user)" type="button">Modifier</button>
                    <button class="btn btn-sm btn-danger" (click)="deleteUser(user)" type="button">Supprimer</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="pagination-row">
            <p class="pagination-info">
              Affichage {{ filteredUsers.length }} / {{ users.length }} (total: {{ totalUsers }})
            </p>
            <div class="pagination-actions">
              <button class="btn btn-sm btn-secondary" type="button" (click)="prevPage()" [disabled]="userPage <= 1 || loading">
                Precedent
              </button>
              <span class="page-index">Page {{ userPage }} / {{ totalUserPages }}</span>
              <button class="btn btn-sm btn-secondary" type="button" (click)="nextPage()" [disabled]="userPage >= totalUserPages || loading">
                Suivant
              </button>
            </div>
          </div>
        </div>
        <ng-template #noUsers>
          <div style="padding: 2rem; text-align: center; color: #9ca3af;">
            <p>Aucun utilisateur trouvé</p>
          </div>
        </ng-template>
      </div>

      <!-- CREATE/EDIT MODAL -->
      <div class="modal-backdrop" [class.active]="showModal">
        <div class="modal">
          <div class="modal-header">
            <h2 class="modal-title">
              {{ modalMode === 'create' ? 'Nouvel Utilisateur' : modalMode === 'edit' ? 'Modifier Utilisateur' : 'Détails de l’utilisateur' }}
            </h2>
            <button class="modal-close" (click)="closeModal()" type="button">✕</button>
          </div>
          <form [formGroup]="userForm" (ngSubmit)="submitForm()" class="modal-body">
            <div class="form-group" *ngIf="isSuperAdmin">
              <label>Tenant <span class="optional">(optionnel)</span></label>
              <select formControlName="tenantId" class="form-control" [disabled]="isViewMode">
                <option value="">Global</option>
                <option *ngFor="let tenant of tenants" [value]="tenant._id">{{ tenant.name }} ({{ tenant.domain || 'pas de domaine' }})</option>
              </select>
              <p class="helper-text">Laisser vide pour utiliser le tenant par défaut ou le tenant du superadmin connecté.</p>
            </div>
            <div class="form-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div>
                <label>Prénom <span class="required">*</span></label>
                <input type="text" formControlName="firstName" class="form-control" />
              </div>
              <div>
                <label>Nom <span class="required">*</span></label>
                <input type="text" formControlName="lastName" class="form-control" />
              </div>
            </div>
            <div class="form-group">
              <label>Email <span class="required">*</span></label>
              <input type="email" formControlName="email" class="form-control" />
            </div>
            <div class="form-group">
              <label>Téléphone</label>
              <input type="tel" formControlName="phoneNumber" class="form-control" />
            </div>
            <div class="form-group" *ngIf="modalMode === 'create'">
              <label>Mot de passe <span class="required">*</span></label>
              <input type="password" formControlName="password" class="form-control" [readonly]="isViewMode" />
            </div>
            <div class="form-group">
              <label>Rôle <span class="required">*</span></label>
              <select formControlName="role" class="form-control" [disabled]="isViewMode">
                <option value="user">Utilisateur</option>
                <option value="tenant_admin">Tenant Admin</option>
                <option *ngIf="isSuperAdmin" value="superadmin">Super Admin</option>
              </select>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="closeModal()" type="button">{{ isViewMode ? 'Fermer' : 'Annuler' }}</button>
            <button
              *ngIf="!isViewMode"
              class="btn btn-primary"
              (click)="submitForm()"
              [disabled]="userForm.invalid || isSaving"
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
            <p>Êtes-vous sûr de vouloir supprimer cet utilisateur ?</p>
            <p style="color: #6b7280; font-size: 0.875rem;">{{ userToDelete?.email }}</p>
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

    .optional {
      font-size: 0.9rem;
      color: #6b7280;
      margin-left: 0.25rem;
    }

    .helper-text {
      margin: 0.5rem 0 0;
      font-size: 0.85rem;
      color: #6b7280;
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
export class AdminUsersManagementComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(UserApiService);
  private readonly tenantApi = inject(TenantApiService);
  private readonly notification = inject(NotificationService);
  private readonly authStorage = inject(AuthStorageService);
  private readonly destroy$ = new Subject<void>();

  users: User[] = [];
  tenants: Tenant[] = [];
  filteredUsers: User[] = [];
  loading = true;
  showModal = false;
  showDeleteConfirm = false;
  modalMode: 'create' | 'edit' | 'view' = 'create';
  isSaving = false;
  isDeleting = false;
  searchQuery = '';
  filterRole = '';
  userPage = 1;
  readonly userPageSize = 10;
  totalUsers = 0;
  totalUserPages = 1;
  userToDelete: User | null = null;
  editingUserId: string | null = null;

  userForm = this.fb.nonNullable.group({
    tenantId: [''],
    firstName: ['', [Validators.required]],
    lastName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: [''],
    password: ['', [Validators.required]],
    role: ['user', [Validators.required]]
  });

  ngOnInit(): void {
    if (this.isSuperAdmin) {
      this.loadTenants();
    }

    this.loadUsers();
    const tenantId = this.authStorage.getSession()?.tenantId;
    if (tenantId) {
      this.userForm.patchValue({ tenantId });
    }
    this.userForm.get('role')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.syncTenantValidator());
    this.syncTenantValidator();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadUsers(): void {
    this.loading = true;
    this.api.getUsersPaginated(this.userPage, this.userPageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.users = response.items;
          this.totalUsers = response.total;
          this.totalUserPages = Math.max(response.totalPages || 1, 1);
          this.userPage = Math.min(this.userPage, this.totalUserPages);
          this.filterUsers();
          this.loading = false;
        },
        error: () => {
          this.notification.error('Impossible de charger les utilisateurs');
          this.loading = false;
        }
      });
  }

  private loadTenants(): void {
    this.tenantApi.getAllTenants()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (tenants) => {
          this.tenants = tenants;
        },
        error: () => {
          this.notification.error('Impossible de charger les tenants');
        }
      });
  }

  onSearch(): void {
    this.filterUsers();
  }

  filterUsers(): void {
    this.filteredUsers = this.users.filter(user => {
      const matchesSearch =
        !this.searchQuery ||
        user.email.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        `${user.firstName} ${user.lastName}`.toLowerCase().includes(this.searchQuery.toLowerCase());

      const matchesRole = !this.filterRole || user.role === this.filterRole;

      return matchesSearch && matchesRole;
    });
  }

  prevPage(): void {
    if (this.userPage <= 1 || this.loading) {
      return;
    }

    this.userPage -= 1;
    this.loadUsers();
  }

  nextPage(): void {
    if (this.userPage >= this.totalUserPages || this.loading) {
      return;
    }

    this.userPage += 1;
    this.loadUsers();
  }

  openCreateModal(): void {
    this.modalMode = 'create';
    this.editingUserId = null;
    this.userForm.reset({
      tenantId: this.authStorage.getSession()?.tenantId || '',
      role: 'user',
      password: ''
    });
    this.userForm.get('password')?.setValidators([Validators.required]);
    this.userForm.get('password')?.updateValueAndValidity({ emitEvent: false });
    this.syncTenantValidator();
    this.showModal = true;
  }

  editUser(user: User): void {
    this.modalMode = 'edit';
    this.editingUserId = user._id || null;
    this.userForm.patchValue({
      tenantId: user.tenantId ?? '',
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber || '',
      role: user.role || 'user',
      password: ''
    });
    this.userForm.get('password')?.clearValidators();
    this.userForm.get('password')?.updateValueAndValidity({ emitEvent: false });
    this.syncTenantValidator();
    this.showModal = true;
  }

  viewUser(user: User): void {
    this.modalMode = 'view';
    this.editingUserId = user._id || null;
    this.userForm.patchValue({
      tenantId: user.tenantId ?? '',
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber || '',
      role: user.role || 'user',
      password: ''
    });
    this.userForm.get('password')?.clearValidators();
    this.userForm.get('password')?.updateValueAndValidity({ emitEvent: false });
    this.syncTenantValidator();
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.userForm.reset();
  }

  isAdminRole(role: string): boolean {
    return role === 'superadmin' || role === 'tenant_admin';
  }

  get isSuperAdmin(): boolean {
    return this.authStorage.isSuperAdmin();
  }

  get currentTenantName(): string {
    const tenantId = this.authStorage.getSession()?.tenantId;
    if (!tenantId) {
      return 'Global';
    }
    const tenant = this.tenants.find((item) => item._id === tenantId);
    return tenant?.name || 'Mon tenant';
  }

  submitForm(): void {
    if (this.modalMode === 'view') {
      this.closeModal();
      return;
    }

    this.syncTenantValidator();
    if (this.userForm.invalid) {
      this.notification.warning('Veuillez remplir tous les champs requis');
      return;
    }

    this.isSaving = true;
    const payload = this.userForm.getRawValue();
    const typedPayload: any = {
      ...payload,
      tenantId: payload.tenantId || undefined,
      role: (payload.role as 'superadmin' | 'tenant_admin' | 'user')
    };

    if (this.modalMode === 'edit' && !typedPayload.password) {
      delete typedPayload.password;
    }

    const request =
      this.modalMode === 'create'
        ? this.api.createUser(typedPayload)
        : this.api.updateUser(this.editingUserId!, typedPayload);

    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.notification.success(
          this.modalMode === 'create'
            ? 'Utilisateur créé avec succès'
            : 'Utilisateur modifié avec succès'
        );
        this.closeModal();
        this.loadUsers();
        this.isSaving = false;
      },
      error: (err) => {
        this.notification.error(err?.error?.message || 'Une erreur est survenue');
        this.isSaving = false;
      }
    });
  }

  private syncTenantValidator(): void {
    const tenantControl = this.userForm.get('tenantId');
    if (!tenantControl) return;

    tenantControl.clearValidators();
    tenantControl.updateValueAndValidity({ emitEvent: false });
  }

  getTenantName(id?: string): string {
    if (!id) return 'Global';
    const tenant = this.tenants.find((item) => item._id === id);
    return tenant?.name || id;
  }

  get isViewMode(): boolean {
    return this.modalMode === 'view';
  }

  deleteUser(user: User): void {
    this.userToDelete = user;
    this.showDeleteConfirm = true;
  }

  confirmDelete(): void {
    if (!this.userToDelete?._id) return;

    this.isDeleting = true;
    this.api.deleteUser(this.userToDelete._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notification.success('Utilisateur supprimé avec succès');
          this.showDeleteConfirm = false;
          this.loadUsers();
          this.isDeleting = false;
        },
        error: (err) => {
          this.notification.error(err?.error?.message || 'Impossible de supprimer l\'utilisateur');
          this.isDeleting = false;
        }
      });
  }
}
