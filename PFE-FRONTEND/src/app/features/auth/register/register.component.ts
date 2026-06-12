import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { UserApiService } from '../../../core/services/user-api.service';
import { TenantApiService, Plan } from '../../../core/services/tenant-api.service';
import { NotificationService } from '../../../core/services/notification.service';
import { UnifiedVerificationComponent } from '../unified-verification/unified-verification.component';

@Component({
  standalone: true,
  selector: 'app-register',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, UnifiedVerificationComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly userApi = inject(UserApiService);
  private readonly tenantApi = inject(TenantApiService);
  private readonly router = inject(Router);
  private readonly notification = inject(NotificationService);
  private readonly destroy$ = new Subject<void>();

  @Output() switchToVerify = new EventEmitter<{
    email: string;
    userId: string;
    tenantDomain: string;
    isNewTenant: boolean;
  }>();

  loading = false;
  success = '';
  error = '';
  showVerificationPopup = false;
  createdUserId = '';
  createdEmail = '';
  tenantDomain = '';
  isNewTenant = false;
  tenantExists: boolean | null = null;
  tenantCheckLoading = false;
  plans: Plan[] = [];
  selectedPlan: Plan | null = null;

  form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required]],
    lastName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: [''],
    tenantDomain: ['', [Validators.required, Validators.pattern(/^[a-z0-9-]+$/i)]],
    storagePlan: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    passwordConfirm: ['', [Validators.required, Validators.minLength(6)]]
  }, { validators: this.passwordMatchValidator });

  ngOnInit(): void {
    this.loadPlans();
    this.setupTenantDomainValidation();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password');
    const passwordConfirm = control.get('passwordConfirm');

    if (!password || !passwordConfirm) {
      return null;
    }

    return password.value === passwordConfirm.value ? null : { passwordMismatch: true };
  }

  loadPlans(): void {
    console.log('[PLANS] Loading plans...');
    this.tenantApi.getPlans().pipe(takeUntil(this.destroy$)).subscribe({
      next: (plans) => {
        console.log('[PLANS] Plans loaded:', plans);
        this.plans = plans;
        if (plans.length > 0) {
          console.log('[PLANS] Setting default plan to:', plans[0].slug);
          this.form.patchValue({ storagePlan: plans[0].slug });
          this.selectedPlan = plans[0];
        }
      },
      error: (err) => {
        console.error('[PLANS] Error loading plans:', err);
        this.notification.error('Impossible de charger les plans de stockage');
      }
    });
  }

  setupTenantDomainValidation(): void {
    this.form
      .get('tenantDomain')
      ?.valueChanges.pipe(
        debounceTime(500),
        takeUntil(this.destroy$)
      )
      .subscribe((domain) => {
        console.log('[TENANT-VALIDATION] Domain changed:', domain);
        if (domain && this.form.get('tenantDomain')?.valid) {
          console.log('[TENANT-VALIDATION] Calling checkTenantDomain...');
          this.checkTenantDomain(domain);
        } else {
          console.log('[TENANT-VALIDATION] Domain invalid or empty');
        }
      });
  }

  checkTenantDomain(domain: string): void {
    this.tenantCheckLoading = true;
    console.log('[TENANT-CHECK] Starting domain check for:', domain);
    
    this.tenantApi.checkDomainExists(domain).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        console.log('[TENANT-CHECK] Response:', response);
        this.tenantExists = response.exists;
        
        if (response.exists) {
          console.log('[TENANT-CHECK] Domain already exists - setting error');
          this.form.get('tenantDomain')?.setErrors({ tenantExists: true });
        } else {
          console.log('[TENANT-CHECK] Domain available - clearing errors');
          const control = this.form.get('tenantDomain');
          if (control?.errors?.['tenantExists']) {
            control.setErrors(null);
          }
        }
        this.tenantCheckLoading = false;
      },
      error: (err) => {
        console.error('[TENANT-CHECK] Error:', err);
        this.tenantCheckLoading = false;
      }
    });
  }

  onPlanChange(slug: string): void {
    this.selectedPlan = this.plans.find((p) => p.slug === slug) || null;
  }

  onPlanSelectChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.onPlanChange(target.value);
  }

  formatStorageGB(bytes: number | null): string {
    if (!bytes || bytes <= 0) {
      return 'Illimité';
    }
    const gb = bytes / 1024 / 1024 / 1024;
    return gb.toFixed(1);
  }

  submit(): void {
    console.log('🔵 [REGISTER] submit() appelé');
    console.log('📋 [REGISTER] Form valid:', this.form.valid);
    
    // Log chaque champ
    console.log('📋 [REGISTER] Form errors:');
    Object.keys(this.form.controls).forEach(key => {
      const control = this.form.get(key);
      console.log(`  ${key}: valid=${control?.valid}, errors=${JSON.stringify(control?.errors)}`);
    });
    console.log('📋 [REGISTER] Group errors:', this.form.errors);
    
    console.log('📋 [REGISTER] Form value:', this.form.getRawValue());
    
    if (this.form.invalid) {
      console.warn('❌ [REGISTER] Formulaire invalide');
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    const formData = this.form.getRawValue();
    const registerPayload = {
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phoneNumber: formData.phoneNumber,
      password: formData.password,
      tenantDomain: formData.tenantDomain,
      storagePlan: formData.storagePlan
    };

    console.log('🚀 [REGISTER] Envoi du payload:', registerPayload);
    
    this.userApi.register(registerPayload as any).pipe(takeUntil(this.destroy$)).subscribe({
      next: (user) => {
        console.log('✅ [REGISTER] Succès! User créé:', user);
        this.success = `Compte créé avec succès!`;
        this.createdUserId = user._id ?? '';
        this.createdEmail = user.email;
        
        // Show verification popup
        this.showVerificationPopup = true;
        this.loading = false;
        
        // Also emit event for parent component awareness
        setTimeout(() => {
          this.switchToVerify.emit({
            email: user.email,
            userId: this.createdUserId,
            tenantDomain: formData.tenantDomain,
            isNewTenant: !this.tenantExists
          });
        }, 300);
      },
      error: (response) => {
        console.error('❌ [REGISTER] Erreur:', response);
        console.error('📝 [REGISTER] Erreur complète:', JSON.stringify(response, null, 2));
        this.error = response?.error?.error ?? response?.error?.message ?? 'Inscription impossible';
        this.loading = false;
      },
      complete: () => {
        console.log('🔚 [REGISTER] Observable complété');
        this.loading = false;
      }
    });
  }

  /**
   * Handle verification completion
   */
  onVerificationComplete(event: { success: boolean; message?: string }): void {
    console.log('[REGISTER] Verification completed:', event);
    if (event.success) {
      // Close popup and reset form after verification success
      setTimeout(() => {
        this.showVerificationPopup = false;
        this.form.reset();
        this.success = '';
      }, 1000);
    }
  }

  /**
   * Close verification popup
   */
  closeVerificationPopup(): void {
    console.log('[REGISTER] Closing verification popup');
    this.showVerificationPopup = false;
  }
}