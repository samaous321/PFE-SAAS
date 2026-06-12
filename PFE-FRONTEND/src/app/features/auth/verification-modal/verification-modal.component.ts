import { CommonModule } from '@angular/common';
import { Component, inject, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { UserApiService } from '../../../core/services/user-api.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { modalAnimation } from '../shared/auth-animations';

@Component({
  standalone: true,
  selector: 'app-verification-modal',
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="verification-modal-overlay" *ngIf="isOpen" (click)="onBackdropClick()">
      <div class="verification-modal" [@modal] (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="modal-header">
          <button class="close-btn" (click)="close()" type="button">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="modal-content">
          <!-- Tenant Banner -->
          <div *ngIf="tenantDomain" class="tenant-banner" [class.new]="isNewTenant">
            <div class="banner-icon">
              <svg *ngIf="isNewTenant" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"></path>
              </svg>
              <svg *ngIf="!isNewTenant" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <div class="banner-text">
              <p class="banner-title">{{ isNewTenant ? 'Nouveau tenant créé' : 'Tenant existant' }}</p>
              <p class="banner-desc">{{ isNewTenant ? 'Vous deviendrez admin du tenant ' : 'Vous avez été ajouté au tenant ' }}<strong>{{ tenantDomain }}</strong></p>
            </div>
          </div>

          <!-- Title -->
          <h2 class="modal-title">Vérifiez votre email</h2>
          <p class="modal-subtitle">Un code de vérification a été envoyé à <strong>{{ email }}</strong></p>

          <!-- Form -->
          <form [formGroup]="form" (ngSubmit)="submit()" class="verification-form">
            <div class="form-group">
              <label class="form-label">Code de vérification</label>
              <input
                type="text"
                formControlName="verificationCode"
                class="code-input"
                placeholder="Entrez le code"
                maxlength="6"
                inputmode="numeric"
              >
              <div class="form-error" *ngIf="form.get('verificationCode')?.invalid && form.get('verificationCode')?.touched">
                Code requis (6 chiffres)
              </div>
            </div>

            <button type="submit" class="btn btn-primary btn-full" [disabled]="loading || form.invalid">
              <span *ngIf="!loading">Vérifier mon compte</span>
              <span *ngIf="loading" class="loading">Vérification en cours...</span>
            </button>
          </form>

          <!-- Resend Code -->
          <div class="resend-wrapper">
            <p class="resend-text">Vous n'avez pas reçu le code?</p>
            <button type="button" class="resend-btn" (click)="resendCode()" [disabled]="loading">
              Renvoyer le code
            </button>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" (click)="close()">Annuler</button>
        </div>

        <!-- Messages -->
        <div class="message-container">
          <p class="success" *ngIf="success">{{ success }}</p>
          <p class="error" *ngIf="error">{{ error }}</p>
        </div>
      </div>
    </div>
  `,
  styleUrl: './verification-modal.component.scss',
  animations: [modalAnimation]
})
export class VerificationModalComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly userApi = inject(UserApiService);
  private readonly notification = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();

  @Input() isOpen = false;
  @Input() email = '';
  @Input() userId = '';
  @Input() tenantDomain: string | null = null;
  @Input() isNewTenant = false;

  @Output() closed = new EventEmitter<void>();
  @Output() verified = new EventEmitter<void>();

  loading = false;
  success = '';
  error = '';

  form = this.fb.nonNullable.group({
    verificationCode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]]
  });

  ngOnInit(): void {
    if (this.isOpen) {
      document.body.style.overflow = 'hidden';
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onBackdropClick(): void {
    this.close();
  }

  close(): void {
    document.body.style.overflow = 'auto';
    this.closed.emit();
    this.isOpen = false;
  }

  submit(): void {
    if (this.form.invalid) {
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    const verificationCode = this.form.get('verificationCode')?.value || '';
    if (!verificationCode) {
      this.error = 'Code requis';
      this.loading = false;
      return;
    }

    this.userApi.verifyUserByEmail(this.email, verificationCode).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.success = '✓ Compte vérifié avec succès!';
        setTimeout(() => {
          this.verified.emit();
          this.router.navigate(['/dashboard']);
        }, 1500);
      },
      error: (err) => {
        this.error = err?.error?.message || 'Erreur lors de la vérification';
        this.loading = false;
      }
    });
  }

  resendCode(): void {
    this.loading = true;

    this.userApi.resendVerificationCode({ email: this.email }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.success = 'Code renvoyé à votre email';
        this.loading = false;
        setTimeout(() => {
          this.success = '';
        }, 3000);
      },
      error: () => {
        this.error = 'Impossible de renvoyer le code';
        this.loading = false;
      }
    });
  }
}
