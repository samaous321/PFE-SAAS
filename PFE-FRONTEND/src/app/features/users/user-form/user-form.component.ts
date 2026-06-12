import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UserApiService } from '../../../core/services/user-api.service';

@Component({
  standalone: true,
  selector: 'app-user-form',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './user-form.component.html',
  styleUrl: './user-form.component.scss'
})
export class UserFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(UserApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  loading = false;
  saving = false;
  error = '';
  success = '';
  userId: string | null = null;

  form = this.fb.nonNullable.group({
    tenantId: ['', [Validators.required]],
    firstName: ['', [Validators.required]],
    lastName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: [''],
    password: ['']
  });

  ngOnInit(): void {
    this.userId = this.route.snapshot.paramMap.get('id');

    if (!this.userId) {
      return;
    }

    this.loading = true;
    this.api.getUserById(this.userId).subscribe({
      next: (user) => {
        this.form.patchValue({
          tenantId: user.tenantId ?? '',
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber ?? '',
          password: ''
        });
        this.loading = false;
      },
      error: (response) => {
        this.error = response?.error?.error ?? 'Utilisateur introuvable';
        this.loading = false;
      }
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = this.form.getRawValue();
    const normalized = {
      ...payload,
      ...(payload.password ? { password: payload.password } : {})
    };

    this.saving = true;
    this.error = '';
    this.success = '';

    const request = this.userId
      ? this.api.updateUser(this.userId, normalized)
      : this.api.createUser(normalized);

    request.subscribe({
      next: () => {
        this.success = this.userId ? 'Utilisateur mis à jour' : 'Utilisateur créé';
        this.saving = false;
        if (!this.userId) {
          this.form.reset();
        }
      },
      error: (response) => {
        this.error = response?.error?.error ?? 'Opération impossible';
        this.saving = false;
      }
    });
  }
}
