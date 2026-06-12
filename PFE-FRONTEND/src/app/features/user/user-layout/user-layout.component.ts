import { Component, HostListener, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthStorageService } from '../../../core/services/auth-storage.service';
import { UserApiService } from '../../../core/services/user-api.service';
import { TopbarComponent } from '../../../shared/components/topbar/topbar.component';

@Component({
  standalone: true,
  selector: 'app-user-layout',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, TopbarComponent],
  templateUrl: './user-layout.component.html',
  styleUrls: ['./user-layout.component.scss']
})
export class UserLayoutComponent {
  private readonly authStorage = inject(AuthStorageService);
  private readonly api = inject(UserApiService);
  private readonly router = inject(Router);

  navGroups = [
    {
      id: 'dashboard',
      title: 'Dashboard',
      items: [
        { label: 'Home', routerLink: '/user/dashboard', icon: '🏠' },
        { label: 'Overview', routerLink: '/user/stats', icon: '📈' }
      ]
    },
    {
      id: 'files',
      title: 'Fichiers',
      items: [
        { label: 'Mes Fichiers', routerLink: '/user/files', icon: '📁' },
        { label: 'Upload', routerLink: '/user/files', icon: '☁️' },
        { label: 'Shared', routerLink: '/user/share-history', icon: '🔗' }
      ]
    },
    {
      id: 'sharing',
      title: 'Partage',
      items: [
        { label: 'Historique', routerLink: '/user/share-history', icon: '🕘' },
        { label: 'Reçus', routerLink: '/user/share-history', icon: '📥' }
      ]
    },
    {
      id: 'security',
      title: 'Sécurité',
      items: [
        { label: '2FA', routerLink: '/user/settings', icon: '🔒' },
        { label: 'Paramètres', routerLink: '/user/settings', icon: '⚙️' },
        { label: 'Activité', routerLink: '/user/stats', icon: '📊' }
      ]
    }
  ];

  activeGroup: string | null = null;
  mobileMenuOpen = false;
  profileMenuOpen = false;

  menuOpen = false;
  isUser = true;
  sidebarOpen = true;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.topbar')) {
      this.profileMenuOpen = false;
      this.mobileMenuOpen = false;
      this.activeGroup = null;
    }
  }

  toggleGroup(groupId: string): void {
    this.activeGroup = this.activeGroup === groupId ? null : groupId;
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    if (!this.mobileMenuOpen) {
      this.activeGroup = null;
    }
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
    this.activeGroup = null;
  }

  toggleProfileMenu(): void {
    this.profileMenuOpen = !this.profileMenuOpen;
  }

  closeProfileMenu(): void {
    this.profileMenuOpen = false;
  }

  goHome(): void {
    this.router.navigate(['/user/files']);
  }

  getInitials(): string {
    const session = this.authStorage.getSession();
    if (session?.firstName && session?.lastName) {
      return (session.firstName[0] + session.lastName[0]).toUpperCase();
    }
    return session?.email?.[0]?.toUpperCase() || 'U';
  }

  getUserFullName(): string {
    const session = this.authStorage.getSession();
    if (session?.firstName && session?.lastName) {
      return `${session.firstName} ${session.lastName}`;
    }
    if (session?.email) {
      return session.email.split('@')[0];
    }
    return 'Utilisateur';
  }

  logout(): void {
    this.api.logout().subscribe({
      next: () => {
        this.authStorage.clear();
        this.router.navigate(['/login']);
      },
      error: () => {
        this.authStorage.clear();
        this.router.navigate(['/login']);
      }
    });
  }

  isTenantAdmin(): boolean {
    return this.authStorage.isTenantAdmin();
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }
}
