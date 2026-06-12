import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthStorageService } from '../../../core/services/auth-storage.service';
import { UserApiService } from '../../../core/services/user-api.service';
import { NotificationCenterComponent } from '../../../shared/components/notification-center/notification-center.component';

@Component({
  standalone: true,
  selector: 'app-admin-layout',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, NotificationCenterComponent],
  templateUrl: './admin-layout.component.html',
  styleUrls: ['./admin-layout.component.scss']
})
export class AdminLayoutComponent implements OnInit, OnDestroy {
  readonly authStorage = inject(AuthStorageService);
  private readonly api = inject(UserApiService);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();

  sidebarOpen = false;
  sidebarCollapsed = false;
  menuOpen = false;
  notificationsOpen = false;
  expandedGroups: { [key: string]: boolean } = {
    global: true,
    security: false,
    analytics: false,
    support: false
  };

  ngOnInit(): void {
    // Auto-close sidebar on mobile when navigating
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getInitials(): string {
    const session = this.authStorage.getSession();
    if (session?.firstName && session?.lastName) {
      return (session.firstName[0] + session.lastName[0]).toUpperCase();
    }
    return session?.email?.[0]?.toUpperCase() || 'A';
  }

  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  toggleMobileSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }

  toggleGroup(group: string): void {
    this.expandedGroups[group] = !this.expandedGroups[group];
  }

  closeMenu(): void {
    this.menuOpen = false;
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
    if (this.menuOpen) {
      this.notificationsOpen = false;
    }
  }

  onNotificationsOpenChange(isOpen: boolean): void {
    this.notificationsOpen = isOpen;
    if (isOpen) {
      this.menuOpen = false;
    }
  }

  logout(): void {
    this.api.logout()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
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
}
