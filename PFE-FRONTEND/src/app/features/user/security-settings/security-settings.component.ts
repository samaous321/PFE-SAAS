import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AuthStorageService } from '../../../core/services/auth-storage.service';
import { UserApiService } from '../../../core/services/user-api.service';
import { Subscription } from 'rxjs';

interface UserPreferences {
  theme: 'light' | 'dark';
  notifications: 'enabled' | 'quiet';
}

@Component({
  standalone: true,
  selector: 'app-security-settings',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './security-settings.component.html',
  styleUrls: ['./security-settings.component.scss']
})
export class SecuritySettingsComponent implements OnInit, OnDestroy {
  readonly phonePattern = /^\+216\d{8}$/;

  currentUserId: string | null = null;
  is2FAEnabled = false;
  phoneNumber = '';
  maskedPhoneNumber = '';

  loading = false;
  successMessage = '';
  errorMessage = '';

  showEnablePanel = false;
  showVerifyPanel = false;
  showDisablePanel = false;

  activeSection: 'security' | 'profile' | 'preferences' = 'security';
  resendCooldown = 0;
  private cooldownInterval: number | null = null;

  phoneForm!: FormGroup;
  otpForm!: FormGroup;
  disableForm!: FormGroup;
  profileForm!: FormGroup;
  passwordForm!: FormGroup;
  preferencesForm!: FormGroup;

  private readonly PREFERENCES_KEY = 'user_preferences';
  private routeSubscription: Subscription | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authStorage: AuthStorageService,
    private readonly userApi: UserApiService,
    private readonly route: ActivatedRoute
  ) {
    this.phoneForm = this.fb.nonNullable.group({
      phoneNumber: ['+216', [Validators.required, Validators.pattern(this.phonePattern)]]
    });

    this.otpForm = this.fb.nonNullable.group({
      otp: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]]
    });

    this.disableForm = this.fb.nonNullable.group({
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    this.profileForm = this.fb.nonNullable.group({
      email: ['', [Validators.required, Validators.email]],
      firstName: ['', [Validators.required]],
      lastName: ['', [Validators.required]],
      phoneNumber: ['', [Validators.pattern(this.phonePattern)]]
    });

    this.passwordForm = this.fb.nonNullable.group({
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required, Validators.minLength(6)]]
    });

    this.preferencesForm = this.fb.nonNullable.group({
      theme: ['light' as const],
      notifications: ['enabled' as const]
    });
  }

  ngOnInit(): void {
    this.currentUserId = this.authStorage.getUserId();
    if (!this.currentUserId) {
      this.errorMessage = 'Session invalide. Veuillez vous reconnecter.';
      return;
    }

    this.routeSubscription = this.route.queryParamMap.subscribe((params) => {
      const requestedSection = params.get('section');
      this.setActiveSection(requestedSection);
    });

    const routeSection = this.route.snapshot.data['section'];
    this.setActiveSection(routeSection);

    this.loadSecurityStatus();
    this.loadPreferences();
  }

  ngOnDestroy(): void {
    this.clearCooldown();
    this.routeSubscription?.unsubscribe();
  }

  get settingsStatusLabel(): string {
    return this.is2FAEnabled ? 'Activé' : 'Désactivé';
  }

  get sectionTitle(): string {
    return this.getSectionMeta(this.activeSection).title;
  }

  get sectionDescription(): string {
    return this.getSectionMeta(this.activeSection).description;
  }

  get sectionTouches(): string[] {
    return this.getSectionMeta(this.activeSection).touches;
  }

  onToggleChange(requestedState: boolean): void {
    this.resetMessages();
    if (requestedState && !this.is2FAEnabled) {
      this.openEnablePanel();
      return;
    }

    if (!requestedState && this.is2FAEnabled) {
      this.openDisablePanel();
      return;
    }
  }

  setActiveSection(section?: string | null): void {
    const normalized = String(section || '').toLowerCase();
    if (normalized === 'profile' || normalized === 'preferences' || normalized === 'security') {
      this.activeSection = normalized;
      return;
    }

    this.activeSection = 'security';
  }

  openEnablePanel(): void {
    this.showEnablePanel = true;
    this.showVerifyPanel = false;
    this.showDisablePanel = false;
    this.phoneForm.reset({ phoneNumber: '+216' });
  }

  openDisablePanel(): void {
    this.showDisablePanel = true;
    this.showEnablePanel = false;
    this.showVerifyPanel = false;
    this.disableForm.reset();
  }

  cancelAction(): void {
    this.showEnablePanel = false;
    this.showVerifyPanel = false;
    this.showDisablePanel = false;
    this.resetForms();
    this.resetMessages();
  }

  sendOtp(): void {
    this.resetMessages();
    const rawPhone = this.phoneNumber || this.phoneForm.get('phoneNumber')?.value || '';
    const phone = this.normalizePhoneNumber(rawPhone);

    if (!phone || !this.phonePattern.test(phone)) {
      this.errorMessage = 'Veuillez fournir un numéro tunisien valide au format +216xxxxxxxx.';
      return;
    }

    this.loading = true;
    this.userApi.enableTwoFactor(this.currentUserId!, phone).subscribe({
      next: () => {
        this.userApi.resendOtp(this.currentUserId!).subscribe({
          next: () => {
            this.loading = false;
            this.showEnablePanel = false;
            this.showVerifyPanel = true;
            this.phoneNumber = phone;
            this.maskedPhoneNumber = this.maskPhoneNumber(phone);
            this.successMessage = 'Le code OTP a été envoyé à votre numéro.';
            this.startCooldown();
          },
          error: (error) => {
            this.loading = false;
            this.errorMessage = this.extractError(error, 'Impossible d\'envoyer le code OTP.');
          }
        });
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = this.extractError(error, 'Impossible de démarrer l\'activation 2FA.');
      }
    });
  }

  verifyOtp(): void {
    this.resetMessages();
    if (this.otpForm.invalid) {
      this.errorMessage = 'Veuillez saisir un code OTP à 6 chiffres.';
      return;
    }

    this.loading = true;
    this.userApi.verifyOtp(this.currentUserId!, this.otpForm.get('otp')?.value ?? '').subscribe({
      next: (response) => {
        this.loading = false;
        this.is2FAEnabled = true;
        this.showVerifyPanel = false;
        this.successMessage = '2FA a été activée avec succès.';
        this.otpForm.reset();
        this.resetForms();

        if (response?.token) {
          const currentSession = this.authStorage.getSession();
          const updatedSession = currentSession
            ? { ...currentSession, token: response.token }
            : {
                userId: this.currentUserId!,
                token: response.token,
                email: '',
                role: 'user'
              };

          this.authStorage.setSession(updatedSession as any);
        }

        this.loadSecurityStatus();
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = this.extractError(error, 'Code OTP invalide ou expiré.');
      }
    });
  }

  resendOtp(): void {
    if (this.resendCooldown > 0) {
      return;
    }

    this.resetMessages();
    this.loading = true;
    this.userApi.resendOtp(this.currentUserId!).subscribe({
      next: () => {
        this.loading = false;
        this.successMessage = 'Un nouveau code OTP a été envoyé.';
        this.startCooldown();
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = this.extractError(error, 'Impossible de renvoyer un nouveau code OTP.');
      }
    });
  }

  disableTwoFactor(): void {
    this.resetMessages();
    if (this.disableForm.invalid) {
      this.errorMessage = 'Veuillez saisir votre mot de passe pour confirmer la désactivation.';
      return;
    }

    this.loading = true;
    this.userApi.disableTwoFactor(this.currentUserId!, this.disableForm.get('password')?.value ?? '').subscribe({
      next: () => {
        this.loading = false;
        this.is2FAEnabled = false;
        this.showDisablePanel = false;
        this.successMessage = '2FA a été désactivée avec succès.';
        this.disableForm.reset();
        this.loadSecurityStatus();
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = this.extractError(error, 'Impossible de désactiver la 2FA.');
      }
    });
  }

  private loadSecurityStatus(): void {
    this.loading = true;
    this.userApi.getUserById(this.currentUserId!).subscribe({
      next: (user) => {
        this.loading = false;
        this.is2FAEnabled = !!user.is2FAEnabled;
        this.phoneNumber = user.phoneNumber || '';
        this.maskedPhoneNumber = this.maskPhoneNumber(this.phoneNumber);

        this.profileForm.patchValue({
          email: user.email,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          phoneNumber: user.phoneNumber || ''
        });
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'Impossible de charger le statut de sécurité.';
      }
    });
  }

  saveProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      this.errorMessage = 'Veuillez corriger les informations du profil.';
      return;
    }

    const value = this.profileForm.getRawValue();
    const normalizedPhone = value.phoneNumber ? this.normalizePhoneNumber(value.phoneNumber) : '';
    if (value.phoneNumber && !this.phonePattern.test(normalizedPhone)) {
      this.errorMessage = 'Veuillez entrer un numéro tunisien valide au format +216xxxxxxxx.';
      return;
    }

    const payload: any = {
      email: value.email,
      firstName: value.firstName,
      lastName: value.lastName
    };

    if (normalizedPhone) {
      payload.phoneNumber = normalizedPhone;
    }

    this.loading = true;
    this.userApi.updateUser(this.currentUserId!, payload).subscribe({
      next: () => {
        this.loading = false;
        this.successMessage = 'Profil mis à jour avec succès.';
        const currentSession = this.authStorage.getSession();
        if (currentSession) {
          this.authStorage.setSession({
            ...currentSession,
            email: payload.email,
            firstName: payload.firstName,
            lastName: payload.lastName,
          } as any);
        }
        this.loadSecurityStatus();
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = this.extractError(error, 'Impossible de mettre à jour le profil.');
      }
    });
  }

  changePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      this.errorMessage = 'Veuillez remplir tous les champs de mot de passe.';
      return;
    }

    const newPassword = this.passwordForm.get('newPassword')?.value;
    const confirmPassword = this.passwordForm.get('confirmPassword')?.value;

    if (newPassword !== confirmPassword) {
      this.errorMessage = 'Les mots de passe ne correspondent pas.';
      return;
    }

    this.loading = true;
    this.userApi.updateUser(this.currentUserId!, { password: newPassword }).subscribe({
      next: () => {
        this.loading = false;
        this.successMessage = 'Mot de passe changé avec succès.';
        this.passwordForm.reset();
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = this.extractError(error, 'Impossible de changer le mot de passe.');
      }
    });
  }

  loadPreferences(): void {
    const raw = localStorage.getItem(this.PREFERENCES_KEY);
    const preferences: UserPreferences = raw
      ? ({ theme: 'light', notifications: 'enabled', ...(JSON.parse(raw) as Partial<UserPreferences>) } as UserPreferences)
      : { theme: 'light', notifications: 'enabled' };

    this.preferencesForm.patchValue(preferences);
    this.applyTheme(preferences.theme);
  }

  savePreferences(): void {
    const value = this.preferencesForm.getRawValue() as UserPreferences;
    localStorage.setItem(this.PREFERENCES_KEY, JSON.stringify(value));
    this.applyTheme(value.theme);
    this.successMessage = 'Préférences enregistrées.';
  }

  private applyTheme(theme: 'light' | 'dark'): void {
    document.body.classList.toggle('dark-theme', theme === 'dark');
    document.body.classList.toggle('light-theme', theme === 'light');
  }

  private maskPhoneNumber(phone: string): string {
    if (!phone || phone.length < 8) {
      return phone;
    }

    return phone.replace(/(\+216)(\d{4})(\d{2})$/, '$1****$3');
  }

  private startCooldown(): void {
    this.clearCooldown();
    this.resendCooldown = 60;
    this.cooldownInterval = window.setInterval(() => {
      if (this.resendCooldown <= 0) {
        this.clearCooldown();
        return;
      }
      this.resendCooldown -= 1;
    }, 1000);
  }

  private clearCooldown(): void {
    if (this.cooldownInterval !== null) {
      window.clearInterval(this.cooldownInterval);
      this.cooldownInterval = null;
      this.resendCooldown = 0;
    }
  }

  private resetForms(): void {
    this.phoneForm.reset();
    this.otpForm.reset();
    this.disableForm.reset();
  }

  private resetMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }

  private normalizePhoneNumber(rawPhone: string): string {
    let phone = rawPhone.trim();
    if (/^\d{8}$/.test(phone)) {
      phone = `+216${phone}`;
    } else if (/^216\d{8}$/.test(phone)) {
      phone = `+${phone}`;
    }
    return phone;
  }

  private extractError(error: any, fallback: string): string {
    return error?.error?.error || error?.message || fallback;
  }

  private getSectionMeta(section: 'security' | 'profile' | 'preferences'): { title: string; description: string; touches: string[] } {
    if (section === 'profile') {
      return {
        title: 'Profil et identité',
        description: 'Modifiez les informations visibles par le compte et les notifications liées à votre identité.',
        touches: ['Nom', 'Prénom', 'Email', 'Téléphone']
      };
    }

    if (section === 'preferences') {
      return {
        title: 'Préférences d’expérience',
        description: 'Préparez les réglages visuels et les préférences globales qui seront enrichis plus tard.',
        touches: ['Thème', 'Notifications', 'Affichage', 'Personnalisation']
      };
    }

    return {
      title: 'Sécurité du compte',
      description: 'Contrôlez les accès, l’authentification à deux facteurs et le mot de passe.',
      touches: ['2FA', 'OTP', 'Mot de passe', 'Vérifications sensibles']
    };
  }
}
