import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { LoginComponent } from '../login/login.component';
import { RegisterComponent } from '../register/register.component';
import { VerificationModalComponent } from '../verification-modal/verification-modal.component';
import { tabSlideAnimation } from '../shared/auth-animations';

@Component({
  standalone: true,
  selector: 'app-auth-container',
  imports: [CommonModule, LoginComponent, RegisterComponent, VerificationModalComponent],
  template: `
    <div class="auth-container">
      <!-- Navigation Tabs -->
      <div class="auth-tabs">
        <button
          class="tab-button"
          [class.active]="activeTab === 'login'"
          (click)="switchTab('login')"
          type="button"
        >
          <span class="tab-label">Connexion</span>
        </button>
        <button
          class="tab-button"
          [class.active]="activeTab === 'register'"
          (click)="switchTab('register')"
          type="button"
        >
          <span class="tab-label">Créer un compte</span>
        </button>
        <span class="tab-indicator" [style.left.%]="activeTab === 'login' ? 0 : 50"></span>
      </div>

      <!-- Tab Content -->
      <div class="tab-content-wrapper">
        <div class="tab-content" [class.active]="activeTab === 'login'">
          <app-login></app-login>
        </div>
        <div class="tab-content" [class.active]="activeTab === 'register'">
          <app-register (switchToVerify)="onSwitchToVerify($event)"></app-register>
        </div>
      </div>

      <!-- Verification Modal -->
      <app-verification-modal
        #verificationModal
        [isOpen]="showVerificationModal"
        [email]="verificationData?.email"
        [userId]="verificationData?.userId"
        [tenantDomain]="verificationData?.tenantDomain"
        [isNewTenant]="verificationData?.isNewTenant"
        (closed)="closeVerificationModal()"
        (verified)="onVerified()"
      ></app-verification-modal>
    </div>
  `,
  styleUrl: './auth-container.component.scss'
})
export class AuthContainerComponent implements OnInit {
  private readonly router = inject(Router);

  @ViewChild('verificationModal') verificationModal: VerificationModalComponent | undefined;

  activeTab: 'login' | 'register' = 'login';
  showVerificationModal = false;
  verificationData: any = null;

  ngOnInit(): void {
    // Check if redirect from register to verify
    const params = new URLSearchParams(window.location.search);
    const redirectTo = params.get('tab');
    if (redirectTo === 'register') {
      this.activeTab = 'register';
    }
  }

  switchTab(tab: 'login' | 'register'): void {
    this.activeTab = tab;
  }

  onSwitchToVerify(data: any): void {
    this.verificationData = data;
    this.showVerificationModal = true;
  }

  closeVerificationModal(): void {
    this.showVerificationModal = false;
    this.verificationData = null;
  }

  onVerified(): void {
    // User will be redirected by the modal component
  }
}

