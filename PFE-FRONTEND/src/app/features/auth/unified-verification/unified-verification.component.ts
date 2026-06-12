import { CommonModule } from '@angular/common';
import { Component, inject, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { UserApiService } from '../../../core/services/user-api.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

type VerificationMode = 'signup' | 'signin' | '2fa';

@Component({
  standalone: true,
  selector: 'app-unified-verification',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './unified-verification.component.html',
  styleUrl: './unified-verification.component.scss'
})
export class UnifiedVerificationComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly userApi = inject(UserApiService);
  private readonly router = inject(Router);
  private readonly notification = inject(NotificationService);
  private readonly destroy$ = new Subject<void>();

  @Input() isOpen = false;
  @Input() mode: VerificationMode = 'signup'; // 'signup' | 'signin' | '2fa'
  @Input() email: string = '';
  @Input() userId: string = '';
  @Input() tenantDomain: string = '';
  @Input() isNewTenant = false;

  @Output() close = new EventEmitter<void>();
  @Output() verified = new EventEmitter<{ success: boolean; message?: string }>();

  loading = false;
  success = '';
  error = '';
  resendLoading = false;

  form = this.fb.nonNullable.group({
    verificationCode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]]
  });

  ngOnInit(): void {
    console.log('[VERIFICATION] Component initialized', { mode: this.mode, email: this.email, userId: this.userId });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Get display title based on mode
   */
  getTitle(): string {
    switch (this.mode) {
      case 'signup':
        return 'Compte créé avec succès !';
      case 'signin':
        return 'Vérifiez votre identité';
      case '2fa':
        return 'Vérification à deux facteurs';
      default:
        return 'Vérification requise';
    }
  }

  /**
   * Get display subtitle based on mode
   */
  getSubtitle(): string {
    switch (this.mode) {
      case 'signup':
        return 'Un email de vérification a été envoyé';
      case 'signin':
        return 'Entrez le code reçu par email';
      case '2fa':
        return 'Entrez votre code à deux facteurs';
      default:
        return 'Veuillez entrer votre code';
    }
  }

  /**
   * Get button text based on mode
   */
  getButtonText(): string {
    switch (this.mode) {
      case 'signup':
      case 'signin':
        return 'Vérifier mon email';
      case '2fa':
        return 'Vérifier le code';
      default:
        return 'Vérifier';
    }
  }

  /**
   * Get success message based on mode
   */
  getSuccessMessage(): string {
    switch (this.mode) {
      case 'signup':
        return 'Email vérifié avec succès ! Redirection...';
      case 'signin':
        return 'Compte vérifié ! Connexion en cours...';
      case '2fa':
        return '2FA validée ! Accès accordé...';
      default:
        return 'Vérification réussie !';
    }
  }

  /**
   * Submit verification code
   */
  submit(): void {
    console.log('[VERIFICATION] submit() called', { mode: this.mode });

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.error = '';

    const code = this.form.get('verificationCode')?.value || '';

    let verifyRequest;

    switch (this.mode) {
      case 'signup':
        // Verify by email (signup flow)
        verifyRequest = this.userApi.verifyUserByEmail(this.email, code);
        break;
      case 'signin':
        // Verify by email (signin flow)
        verifyRequest = this.userApi.verifyUserByEmail(this.email, code);
        break;
      case '2fa':
        // Verify OTP (2FA flow)
        verifyRequest = this.userApi.verifyOtp(this.userId, code);
        break;
      default:
        this.error = 'Mode de vérification inconnu';
        this.loading = false;
        return;
    }

    verifyRequest.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        console.log('[VERIFICATION] Success!');
        this.success = this.getSuccessMessage();
        this.verified.emit({ success: true, message: this.success });

        // Redirect after delay based on mode
        setTimeout(() => {
          if (this.mode === 'signup' || this.mode === 'signin') {
            this.router.navigate(['/login']);
          } else if (this.mode === '2fa') {
            this.router.navigate(['/dashboard']);
          }
          this.onClose();
        }, 1500);
      },
      error: (err) => {
        console.error('[VERIFICATION] Error:', err);
        this.error = err?.error?.error ?? err?.error?.message ?? 'Code de vérification invalide';
        this.loading = false;
      }
    });
  }

  /**
   * Resend verification code
   */
  resendCode(): void {
    console.log('[VERIFICATION] resendCode() called');

    this.resendLoading = true;
    this.error = '';

    this.userApi.resendVerificationCode({ email: this.email }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        console.log('[VERIFICATION] Code resent successfully');
        this.success = 'Code renvoyé à votre email !';
        this.notification.success('Code renvoyé avec succès');
        this.resendLoading = false;

        setTimeout(() => {
          this.success = '';
        }, 3000);
      },
      error: (err) => {
        console.error('[VERIFICATION] Resend error:', err);
        this.error = err?.error?.error ?? 'Impossible de renvoyer le code';
        this.resendLoading = false;
      }
    });
  }

  /**
   * Close popup
   */
  onClose(): void {
    console.log('[VERIFICATION] onClose() called');
    this.form.reset();
    this.error = '';
    this.success = '';
    this.close.emit();
  }

  /**
   * Backdrop click handler
   */
  onBackdropClick(): void {
    console.log('[VERIFICATION] Backdrop clicked');
    // Don't close on backdrop click, only on close button
  }
}
