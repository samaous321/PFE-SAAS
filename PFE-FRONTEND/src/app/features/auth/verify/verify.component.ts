import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { UserApiService } from '../../../core/services/user-api.service';
import { TenantApiService } from '../../../core/services/tenant-api.service';

@Component({
  standalone: true,
  selector: 'app-verify',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './verify.component.html',
  styleUrl: './verify.component.scss'
})
export class VerifyComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly userApi = inject(UserApiService);
  private readonly tenantApi = inject(TenantApiService);
  private readonly destroy$ = new Subject<void>();

  loading = true;
  success = '';
  error = '';
  userId = '';
  tenantDomain: string | null = null;
  tenantExists: boolean | null = null;
  isNewTenant = false;

  form = this.fb.nonNullable.group({
    email: ['', [Validators.email]],
    verificationCode: ['', [Validators.required]]
  });

  ngOnInit(): void {
    const email = this.route.snapshot.queryParamMap.get('email');
    const userId = this.route.snapshot.queryParamMap.get('userId');
    const tenantDomain = this.route.snapshot.queryParamMap.get('tenantDomain');
    const tenantExists = this.route.snapshot.queryParamMap.get('tenantExists');

    if (email) {
      this.form.patchValue({ email });
    }

    if (userId) {
      this.userId = userId;
      this.form.get('email')?.clearValidators();
      this.form.get('email')?.updateValueAndValidity({ emitEvent: false });
    }

    if (tenantDomain) {
      this.tenantDomain = tenantDomain;
      this.tenantExists = tenantExists === 'true';
      this.isNewTenant = !this.tenantExists;
    }

    this.loading = false;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    const { email, verificationCode } = this.form.getRawValue();

    const request = this.userId
      ? this.userApi.verifyUser(this.userId, verificationCode)
      : this.userApi.verifyUserByEmail(email, verificationCode);

    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        if (this.isNewTenant && this.tenantDomain) {
          this.success = `Compte vérifié ! Vous êtes maintenant admin du tenant ${this.tenantDomain}. Redirection vers la connexion...`;
        } else if (this.tenantExists && this.tenantDomain) {
          this.success = `Compte vérifié ! Vous avez été ajouté au tenant ${this.tenantDomain}. Redirection vers la connexion...`;
        } else {
          this.success = 'Compte vérifié avec succès. Redirection vers la connexion...';
        }
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 1500);
      },
      error: (response) => {
        this.error = response?.error?.error ?? response?.error?.message ?? 'Échec de la vérification';
        this.loading = false;
      }
    });
  }

  resendCode(): void {
    const email = this.form.getRawValue().email;

    if (!email) {
      this.error = 'Entre ton email avant de renvoyer le code.';
      return;
    }

    this.loading = true;
    this.error = '';
    this.userApi.sendVerificationCode(email).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.success = 'Un nouveau code vient d\'être envoyé par email.';
        this.loading = false;
      },
      error: (response) => {
        this.error = response?.error?.error ?? 'Impossible de renvoyer le code';
        this.loading = false;
      }
    });
  }
}
