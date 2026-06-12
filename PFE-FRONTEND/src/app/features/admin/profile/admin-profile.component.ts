import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { UserApiService } from '../../../core/services/user-api.service';
import { AuthStorageService } from '../../../core/services/auth-storage.service';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  standalone: true,
  selector: 'app-admin-profile',
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="profile-page card">
      <div class="page-header">
        <div>
          <h1>Mon profil</h1>
          <p>Modifiez vos informations personnelles et votre mot de passe.</p>
        </div>
      </div>

      <form [formGroup]="profileForm" (ngSubmit)="submit()" class="form-panel">
        <div class="form-row">
          <label>Prénom</label>
          <input type="text" formControlName="firstName" class="form-control" />
        </div>

        <div class="form-row">
          <label>Nom</label>
          <input type="text" formControlName="lastName" class="form-control" />
        </div>

        <div class="form-row">
          <label>Email</label>
          <input type="email" formControlName="email" class="form-control" />
        </div>

        <div class="form-row">
          <label>Téléphone</label>
          <input type="tel" formControlName="phoneNumber" class="form-control" />
        </div>

        <div class="form-row">
          <label>Nouveau mot de passe</label>
          <input type="password" formControlName="password" class="form-control" placeholder="Laissez vide pour conserver l'actuel" />
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" [disabled]="profileForm.invalid || saving">
            {{ saving ? 'Enregistrement...' : 'Enregistrer les modifications' }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .profile-page {
      padding: 1.5rem;
    }

    .page-header {
      margin-bottom: 1.5rem;
    }

    .page-header h1 {
      margin: 0 0 0.5rem;
    }

    .form-panel {
      display: grid;
      gap: 1rem;
      background: #ffffff;
      border-radius: 1rem;
      padding: 1.5rem;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
    }

    .form-row {
      display: grid;
      gap: 0.5rem;
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 1rem;
    }

    .form-control {
      border: 1px solid #e5e7eb;
      border-radius: 0.75rem;
      padding: 0.75rem 1rem;
      font-size: 1rem;
      width: 100%;
    }
  `]
})
export class AdminProfileComponent implements OnInit {
  private readonly api = inject(UserApiService);
  private readonly authStorage = inject(AuthStorageService);
  private readonly notification = inject(NotificationService);

  private readonly fb = inject(FormBuilder);

  profileForm = this.fb.nonNullable.group({
    firstName: ['', [Validators.required]],
    lastName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: [''],
    password: ['']
  });

  saving = false;

  ngOnInit(): void {
    const session = this.authStorage.getSession();
    if (!session?.userId) {
      return;
    }

    this.api.getUserById(session.userId).subscribe({
      next: (user) => {
        this.profileForm.patchValue({
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber || ''
        });
      },
      error: () => {
        this.notification.error('Impossible de charger votre profil');
      }
    });
  }

  submit(): void {
    if (this.profileForm.invalid) {
      this.notification.warning('Veuillez corriger les champs requis');
      return;
    }

    const session = this.authStorage.getSession();
    if (!session?.userId) {
      this.notification.error('Session invalide');
      return;
    }

    const payload: any = this.profileForm.getRawValue();
    if (!payload.password) {
      delete payload.password;
    }

    this.saving = true;
    this.api.updateUser(session.userId, payload).subscribe({
      next: (user) => {
        const updatedSession = { ...session, email: user.email };
        this.authStorage.setSession(updatedSession);
        this.notification.success('Profil mis à jour');
        this.saving = false;
        this.profileForm.patchValue({ password: '' });
      },
      error: (err) => {
        this.notification.error(err?.error?.message || 'Impossible de mettre à jour le profil');
        this.saving = false;
      }
    });
  }
}
