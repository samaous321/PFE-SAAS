import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { User } from '../../../core/models/user.model';
import { AuthStorageService } from '../../../core/services/auth-storage.service';
import { UserApiService } from '../../../core/services/user-api.service';

@Component({
  standalone: true,
  selector: 'app-user-list',
  imports: [CommonModule, RouterLink],
  templateUrl: './user-list.component.html',
  styleUrl: './user-list.component.scss'
})
export class UserListComponent implements OnInit {
  private readonly api = inject(UserApiService);
  private readonly authStorage = inject(AuthStorageService);

  users: User[] = [];
  loading = true;
  error = '';

  ngOnInit(): void {
    this.reload();
  }

  get isAdmin(): boolean {
    return this.authStorage.isAnyAdmin();
  }

  reload(): void {
    this.loading = true;
    this.error = '';

    this.api.getUsers().subscribe({
      next: (users) => {
        this.users = users;
        this.loading = false;
      },
      error: (response) => {
        this.error = response?.error?.error ?? response?.error?.message ?? 'Impossible de charger les utilisateurs';
        this.loading = false;
      }
    });
  }

  remove(user: User): void {
    if (!this.isAdmin) {
      this.error = 'Seul un admin peut supprimer un utilisateur';
      return;
    }

    if (!user._id) {
      return;
    }

    this.api.deleteUser(user._id).subscribe({
      next: () => this.reload(),
      error: () => {
        this.error = 'Suppression impossible';
      }
    });
  }
}