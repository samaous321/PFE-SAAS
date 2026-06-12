import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthStorageService } from '../../../core/services/auth-storage.service';
import { UserApiService } from '../../../core/services/user-api.service';
import { RegisterComponent } from '../register/register.component';
import { UnifiedVerificationComponent } from '../unified-verification/unified-verification.component';

@Component({
  standalone: true,
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, RegisterComponent, UnifiedVerificationComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(UserApiService);
  private readonly authStorage = inject(AuthStorageService);
  private readonly router = inject(Router);

  loading = false;
  error = '';
  showPassword = false;
  pending2FA = false;
  pendingUserId = '';
  pendingEmail = '';
  recoveredEmailHint = '';
  activeForm: 'login' | 'register' = 'login';
  
  // Email verification popup properties
  showEmailVerification = false;
  pendingVerificationEmail = '';
  verificationMode: 'signin' | '2fa' = 'signin';

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
    rememberMe: [true]
  });

  otpForm = this.fb.nonNullable.group({
    otp: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]]
  });

  constructor() {
    const rememberedEmail = this.authStorage.getRememberedEmail();

    if (rememberedEmail) {
      this.form.patchValue({
        email: rememberedEmail,
        rememberMe: true
      });
      this.recoveredEmailHint = rememberedEmail;
    }
  }

  switchForm(form: 'login' | 'register'): void {
    this.activeForm = form;
  }

  get emailControl() {
    return this.form.get('email');
  }

  get passwordControl() {
    return this.form.get('password');
  }

  get otpControl() {
    return this.otpForm.get('otp');
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  getInputState(control: { invalid: boolean; touched: boolean; dirty: boolean } | null): 'default' | 'valid' | 'invalid' {
    if (!control) {
      return 'default';
    }

    if (control.invalid && (control.touched || control.dirty)) {
      return 'invalid';
    }

    if (control.dirty && !control.invalid) {
      return 'valid';
    }

    return 'default';
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error = 'Veuillez saisir un email valide et un mot de passe.';
      return;
    }

    this.loading = true;
    this.error = '';

    this.api.signIn(this.form.getRawValue()).subscribe({
      next: (session) => {
        if (session.requires2FA) {
          this.pending2FA = true;
          this.pendingUserId = session.userId;
          this.pendingEmail = session.email;
          this.error = 'La double authentification est activée. Saisissez le code OTP reçu.';
          this.loading = false;
          return;
        }

        this.authStorage.setSession(session, this.form.getRawValue().rememberMe);
        this.navigateByRole(session.role);
      },
      error: (response) => {
        const message = response?.error?.error ?? response?.error?.message ?? 'Connexion refusée';
        this.error = message;

        if (message.toLowerCase().includes('not verified')) {
          // Show email verification popup instead of redirecting
          const email = this.form.get('email')?.value ?? '';
          this.pendingVerificationEmail = email;
          this.verificationMode = 'signin';
          this.showEmailVerification = true;
          this.loading = false;
          return;
        }

        this.loading = false;
      },
      complete: () => {
        this.loading = false;
      }
    });
  }

  submitOtp(): void {
    if (this.otpForm.invalid || !this.pendingUserId) {
      this.otpForm.markAllAsTouched();
      this.error = 'Veuillez saisir le code OTP reçu par SMS.';
      return;
    }

    this.loading = true;
    this.error = '';

    this.api.verifyOtp(this.pendingUserId, this.otpForm.get('otp')?.value ?? '').subscribe({
      next: (session) => {
        this.authStorage.setSession(session, this.form.getRawValue().rememberMe);
        this.navigateByRole(session.role);
      },
      error: (response) => {
        this.error = response?.error?.error ?? response?.error?.message ?? 'Code OTP invalide';
        this.loading = false;
      },
      complete: () => {
        this.loading = false;
      }
    });
  }

  backToLogin(): void {
    this.pending2FA = false;
    this.error = '';
    this.otpForm.reset();
  }

  onSwitchToVerify(data: any): void {
    // Handle successful registration verification
    // User will be redirected by the modal/verification component
    console.log('Registration verified:', data);
  }

  /**
   * Close email verification popup
   */
  closeEmailVerificationPopup(): void {
    console.log('[LOGIN] Closing email verification popup');
    this.showEmailVerification = false;
    this.pendingVerificationEmail = '';
  }

  /**
   * Handle email verification completion
   */
  onEmailVerificationComplete(event: { success: boolean; message?: string }): void {
    console.log('[LOGIN] Email verification completed:', event);
    if (event.success) {
      // Close popup after verification success
      setTimeout(() => {
        this.showEmailVerification = false;
        // User will be redirected to login by the verification component
      }, 1000);
    }
  }

  private navigateByRole(role: 'superadmin' | 'tenant_admin' | 'user'): void {
    const targetUrl =
      role === 'superadmin'
        ? '/admin/dashboard'
        : role === 'tenant_admin'
          ? '/tenant-admin/dashboard'
          : '/user/dashboard';

    void this.router.navigateByUrl(targetUrl);
  }
}
